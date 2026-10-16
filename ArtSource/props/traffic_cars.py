"""Traffic cars (task 6): the light NPC cars of the town, replacing the box
stand-ins of TrafficSystem. Japanese street mix, invented, no badges:

  Kei_Tall    tall kei wagon (N-Box type) 3.40 x 1.48 x 1.79, sliding rear door
  Kei_Hatch   small kei hatch (Alto type) 3.40 x 1.48 x 1.50
  Kei_Van     cab-over kei van (Every/Hijet type) 3.40 x 1.48 x 1.89, roof rack
  Compact     hatchback (Fit/Yaris type) 4.00 x 1.70 x 1.53
  Sedan       family sedan (Prius/Corolla type) 4.60 x 1.76 x 1.45
  Minivan     big box minivan (Serena/Alphard type) 4.70 x 1.80 x 1.86
  Taxi_JPN    the tall Tokyo taxi (JPN Taxi type) in deep indigo, andon, green plate
  Taxi_Sedan  classic sedan taxi (Crown Comfort type), orange/yellow, andon
  Truck_2t    cab-over 2-tonne box truck (Elf/Dutro type), aluminium box, twin rear wheels
  Bus_Mini    small community bus (Poncho type) cream/green, destination sign

Built from a side profile: the lower body is one loft along Y (rounded
box cross-section), the greenhouse a second loft with tumblehome whose side
faces are glass or paint per segment (pillars). Wheels stand 2 cm proud of
the body side in front of a dark arch, so no cut-outs are needed.

Two materials: M_Traffic_Atlas (trim, lamps, glass, plates) + M_TrafficPaint
(body colour, tinted per car in Unity; taxis, the bus and the truck box are
painted from the atlas instead). Lamps glow. Wheel centres are WHEEL_* empties.
Front to -Y (Unity +Z), origin on the ground in the middle of the wheelbase."""
import math
from mathutils import Vector, Matrix
from kit import core as K
from buildings.koedo_kit import C, orient

KLASS = 'traffic'
NAME = 'Traffic'
ATLAS = 'Traffic'
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
PAINT = 'PAINT'


def paint_mat():
    import bpy
    m = bpy.data.materials.get('M_TrafficPaint') or bpy.data.materials.new('M_TrafficPaint')
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.82, 0.82, 0.8, 1)
    b.inputs['Roughness'].default_value = 0.28
    b.inputs['Metallic'].default_value = 0.0
    m.use_backface_culling = True
    return m


class TC(C):
    """Build context with the paint slot: faces painted PAINT go to material 1."""

    def m(self, faces, name, **kw):
        faces = [f for f in faces if f is not None]
        if name == PAINT and self.paint_slot:
            for f in faces:
                f.material_index = 1
        elif name == PAINT:
            name = self.body_reg
        super().m(faces, name, **kw)


def ring_pts(cy, zb, zt, a, n, p=5.0, a_bot=None):
    """Rounded-box cross-section in the XZ plane at y = cy, bottom-up, counter-clockwise seen from +Y."""
    zc, h = (zb + zt) / 2, (zt - zb) / 2
    e = 2.0 / p
    out = []
    for j in range(n):
        th = 2 * math.pi * j / n - math.pi / 2
        cs, sn = math.cos(th), math.sin(th)
        aa = a if sn >= 0 or a_bot is None else a_bot
        out.append(Vector((math.copysign(abs(cs) ** e, cs) * aa, cy, zc + math.copysign(abs(sn) ** e, sn) * h)))
    return out


def loft_y(c, stations, n, reg_fn, cap_front=True, cap_rear=True, p=5.0):
    """Loft along +Y through stations (y, zb, zt, a[, a_bot]); reg_fn(i, j, centre) -> region."""
    bm = c.bm
    rings = [[bm.verts.new(v) for v in ring_pts(s[0], s[1], s[2], s[3], n, p, s[4] if len(s) > 4 else None)] for s in stations]
    faces = []
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(n):
            jj = (j + 1) % n
            f = bm.faces.new([a[j], a[jj], b[jj], b[j]])
            faces.append((i, j, f))
    caps = []
    if cap_front:
        caps.append(('front', bm.faces.new(list(reversed(rings[0])))))
    if cap_rear:
        caps.append(('rear', bm.faces.new(rings[-1])))
    allf = [f for _, _, f in faces] + [f for _, f in caps]
    ctr = Vector((0, sum(s[0] for s in stations) / len(stations), sum((s[1] + s[2]) / 2 for s in stations) / len(stations)))
    for f in allf:
        f.normal_update()
    # outward: the side faces away from the axis, caps along -Y / +Y
    for i, j, f in faces:
        m = f.calc_center_median()
        if f.normal.dot(Vector((m.x, 0, m.z - (stations[i][1] + stations[i][2]) / 2))) < 0:
            f.normal_flip()
    for kind, f in caps:
        if (f.normal.y > 0) != (kind == 'rear'):
            f.normal_flip()
    for i, j, f in faces:
        c.m([f], reg_fn(i, j, f.calc_center_median()))
    for kind, f in caps:
        c.m([f], reg_fn(-1 if kind == 'front' else 99, 0, f.calc_center_median()))
    return faces, caps


def cabin(c, stations, n_side=3):
    """Greenhouse: stations (y, zb, zt, wb, wt, side, top); side/top = region of
    the segment to the next station ('GLASS' or PAINT). Cross-section: a
    trapezoid with chamfered roof corners."""
    bm = c.bm
    r = 0.06

    def sec(s):
        y, zb, zt, wb, wt = s[:5]
        rr = min(r, (zt - zb) * 0.4)
        return [Vector((-wb, y, zb)), Vector((wb, y, zb)), Vector((wt, y, zt - rr)), Vector((wt - rr, y, zt)),
                Vector((-(wt - rr), y, zt)), Vector((-wt, y, zt - rr))]
    rings = [[bm.verts.new(v) for v in sec(s)] for s in stations]
    # edges: 1->2 right side, 2->3 right chamfer, 3->4 roof, 4->5 left chamfer, 5->0 left side
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        side, top = stations[i][5], stations[i][6]
        for e0, e1, reg in ((1, 2, side), (2, 3, top if top == 'GLASS' else PAINT), (3, 4, top), (4, 5, top if top == 'GLASS' else PAINT),
                            (5, 0, side)):
            f = bm.faces.new([a[e0], a[e1], b[e1], b[e0]])
            f.normal_update()
            m = f.calc_center_median()
            if f.normal.dot(Vector((m.x, 0, m.z - stations[i][1]))) < 0:
                f.normal_flip()
            c.m([f], reg)
    # front/rear caps (windscreen base and tail, usually tiny or vertical glass)
    for idx, s in ((0, -1), (-1, 1)):
        ring = rings[idx]
        f = bm.faces.new(ring)
        f.normal_update()
        if f.normal.y * s < 0:
            f.normal_flip()
        c.m([f], stations[idx][7] if len(stations[idx]) > 7 else PAINT)
    return rings


def wheel(c, x, y, rw, tw, outer, rim='RIM_SILVER', n=None):
    n = n or (14 if c.lod == 0 else (10 if c.lod == 1 else 6))
    bm = c.bm
    s = 1 if outer > 0 else -1
    xo, xi = x + s * tw / 2, x - s * tw / 2

    def ring(xx, r):
        return [bm.verts.new((xx, y + r * math.cos(2 * math.pi * i / n), rw + r * math.sin(2 * math.pi * i / n))) for i in range(n)]
    ao, ai = ring(xo, rw), ring(xi, rw)
    tread = [bm.faces.new([ao[i], ao[(i + 1) % n], ai[(i + 1) % n], ai[i]]) for i in range(n)]
    orient(tread, Vector((x, y, rw)))
    c.m(tread, 'TYRE'); c.nb(tread)
    rr = rw * 0.62
    ro = ring(xo + s * 0.004, rw * 0.92)
    side = [bm.faces.new([ao[i], ao[(i + 1) % n], ro[(i + 1) % n], ro[i]]) for i in range(n)]
    for f in side:
        f.normal_update()
        if f.normal.x * s < 0:
            f.normal_flip()
    c.m(side, 'TYRE'); c.nb(side)
    rim_r = ring(xo + s * 0.0, rr)
    lip = [bm.faces.new([ro[i], ro[(i + 1) % n], rim_r[(i + 1) % n], rim_r[i]]) for i in range(n)]
    for f in lip:
        f.normal_update()
        if f.normal.x * s < 0:
            f.normal_flip()
    c.m(lip, 'TYRE'); c.nb(lip)
    # dished rim with spokes as a star (LOD0) or a flat disc
    hub = bm.verts.new((xo - s * 0.025, y, rw))
    disc = []
    for i in range(n):
        f = bm.faces.new([rim_r[i], rim_r[(i + 1) % n], hub])
        f.normal_update()
        if f.normal.x * s < 0:
            f.normal_flip()
        disc.append(f)
    c.m(disc, rim); c.nb(disc)
    if c.lod == 0:
        for k in range(5):
            a = 2 * math.pi * k / 5
            d = Vector((0, math.cos(a), math.sin(a)))
            p0 = Vector((xo + s * 0.004, y, rw)) + d * rr * 0.25
            p1 = Vector((xo + s * 0.004, y, rw)) + d * rr * 0.95
            K.tube_path(bm, [p0, p1], 0.018, 4)
        # (spokes get mapped below with everything new and unmapped)


def arch(c, x, y, rw, side_sign, z_min=None, r_extra=0.05):
    """Dark half-disc on the body side behind a wheel (the wheel-arch opening)."""
    n = 8 if c.lod < 2 else 5
    bm = c.bm
    R = rw + r_extra
    zc = rw
    pts = [Vector((x, y + R * math.cos(math.pi * i / n), zc + R * math.sin(math.pi * i / n))) for i in range(n + 1)]
    vs = [bm.verts.new(p) for p in pts]
    ctr = bm.verts.new((x, y, zc - 0.02))
    fs = [bm.faces.new([ctr, vs[i], vs[i + 1]]) for i in range(n)]
    for f in fs:
        f.normal_update()
        if f.normal.x * side_sign < 0:
            f.normal_flip()
    c.m(fs, 'ARCH'); c.nb(fs)


def gbox(c, cx, cy, cz, hx, hy, hz, reg, rot=None, bevel=False):
    """Box by centre/half sizes (world), optional rotation about its centre."""
    bm = c.bm
    rot = rot or Matrix.Identity(3)
    ctr = Vector((cx, cy, cz))
    P = [ctr + rot @ Vector((sx * hx, sy * hy, sz * hz)) for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
    v = [bm.verts.new(p) for p in P]
    quads = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    fs = [bm.faces.new([v[i] for i in q]) for q in quads]
    orient(fs, ctr)
    c.m(fs, reg)
    if not bevel:
        c.nb(fs)
    return fs


# ── car types as data ───────────────────────────────────────────────────────
# lower: (y, zb, zt, a) front -> rear; cab: (y, zb, zt, wb, wt, side, top)

def spec(kind):
    G, P = 'GLASS', PAINT
    if kind in ('Kei_Tall', 'Kei_Hatch', 'Kei_Van'):
        L, W, wb, rw = 3.395, 1.475, 2.52 if kind != 'Kei_Van' else 2.43, 0.285
        a = W / 2
        yf, yr = -1.70, 1.695
        if kind == 'Kei_Van':     # cab-over: almost no bonnet, flat steep front
            yf, yr = -1.72, 1.675
            lower = [(yf, 0.3, 0.72, a - 0.05), (yf + 0.06, 0.24, 0.86, a - 0.01), (yf + 0.3, 0.22, 0.98, a), (yr - 0.12, 0.22, 0.98, a),
                     (yr, 0.3, 0.95, a - 0.03)]
            H = 1.89
            cab = [(yf + 0.1, 0.98, 1.0, a - 0.03, a - 0.03, P, G), (yf + 0.36, 0.98, H - 0.03, a - 0.03, a - 0.08, G, P),
                   (yf + 0.5, 0.98, H, a - 0.03, a - 0.08, P, P), (yf + 0.6, 0.98, H, a - 0.03, a - 0.08, G, P),
                   (0.2, 0.98, H, a - 0.03, a - 0.08, P, P), (0.32, 0.98, H, a - 0.03, a - 0.08, G, P),
                   (yr - 0.12, 0.98, H, a - 0.03, a - 0.08, P, P), (yr - 0.04, 0.98, H - 0.04, a - 0.03, a - 0.08, P, P, G)]
            return dict(L=L, W=W, H=H, wb=wb, rw=rw, tw=0.155, lower=lower, cab=cab, plate='kei', hood_z=0.98, belt=0.98, yf=yf, yr=yr,
                        rack=True, lamp_z=0.82, tail_z=0.62)
        if kind == 'Kei_Tall':
            H = 1.79
            lower = [(yf, 0.32, 0.74, a - 0.06), (yf + 0.08, 0.24, 0.86, a - 0.01), (yf + 0.42, 0.22, 0.98, a), (yr - 0.1, 0.22, 1.0, a),
                     (yr, 0.32, 0.95, a - 0.04)]
            cab = [(yf + 0.44, 0.98, 1.0, a - 0.03, a - 0.04, P, G), (yf + 0.98, 0.98, H - 0.02, a - 0.03, a - 0.1, G, P),
                   (-0.22, 0.98, H, a - 0.03, a - 0.1, P, P), (-0.12, 0.98, H, a - 0.03, a - 0.1, G, P),
                   (1.05, 0.98, H, a - 0.03, a - 0.1, P, P), (1.42, 0.98, H, a - 0.03, a - 0.1, G, P),
                   (yr - 0.14, 0.99, H - 0.02, a - 0.03, a - 0.1, P, P), (yr - 0.06, 1.0, H - 0.08, a - 0.03, a - 0.1, P, P, G)]
        else:
            H = 1.5
            lower = [(yf, 0.33, 0.68, a - 0.07), (yf + 0.1, 0.25, 0.78, a - 0.01), (yf + 0.6, 0.22, 0.86, a), (yr - 0.12, 0.23, 0.88, a),
                     (yr, 0.33, 0.84, a - 0.05)]
            cab = [(yf + 0.62, 0.86, 0.88, a - 0.04, a - 0.06, P, G), (yf + 1.32, 0.86, H - 0.02, a - 0.04, a - 0.14, G, P),
                   (-0.02, 0.86, H, a - 0.04, a - 0.14, P, P), (0.08, 0.86, H, a - 0.04, a - 0.14, G, P),
                   (0.95, 0.86, H - 0.01, a - 0.04, a - 0.14, P, P), (1.3, 0.86, H - 0.04, a - 0.04, a - 0.15, P, G),
                   (yr - 0.08, 0.88, 1.1, a - 0.05, a - 0.1, P, P)]
        return dict(L=L, W=W, H=H, wb=wb, rw=rw, tw=0.155, lower=lower, cab=cab, plate='kei', hood_z=lower[2][2], belt=lower[2][2],
                    yf=yf, yr=yr, lamp_z=lower[1][2] - 0.06, tail_z=lower[-2][2] - 0.12, slide=kind == 'Kei_Tall')
    if kind in ('Compact', 'Sedan', 'Taxi_Sedan'):
        if kind == 'Compact':
            L, W, H, wb, rw = 4.0, 1.695, 1.53, 2.53, 0.31
            yf, yr = -1.98, 2.02
            a = W / 2
            lower = [(yf, 0.34, 0.7, a - 0.08), (yf + 0.12, 0.26, 0.8, a - 0.01), (yf + 0.85, 0.24, 0.92, a), (yr - 0.15, 0.25, 0.95, a),
                     (yr, 0.36, 0.9, a - 0.06)]
            cab = [(yf + 0.85, 0.92, 0.94, a - 0.05, a - 0.08, P, G), (yf + 1.75, 0.92, H - 0.02, a - 0.05, a - 0.2, G, P),
                   (0.05, 0.92, H, a - 0.05, a - 0.2, P, P), (0.15, 0.92, H, a - 0.05, a - 0.2, G, P),
                   (1.25, 0.92, H - 0.02, a - 0.05, a - 0.2, P, P), (1.6, 0.92, H - 0.06, a - 0.05, a - 0.21, P, G),
                   (yr - 0.1, 0.95, 1.18, a - 0.06, a - 0.12, P, P)]
        else:
            L, W, H, wb, rw = 4.6, 1.76, 1.45, 2.7, 0.315
            if kind == 'Taxi_Sedan':
                L, W, H, wb = 4.7, 1.695, 1.52, 2.68
            yf, yr = -L / 2 - 0.02, L / 2 - 0.02
            a = W / 2
            boxy = kind == 'Taxi_Sedan'
            lower = [(yf, 0.34, 0.68, a - 0.08), (yf + 0.12, 0.26, 0.78, a - 0.01), (yf + 1.05, 0.25, 0.86, a), (yr - 0.95, 0.25, 0.9, a),
                     (yr - 0.12, 0.27, 0.9, a - 0.01), (yr, 0.36, 0.86, a - 0.06)]
            cab = [(yf + 1.05, 0.86, 0.88, a - 0.06, a - 0.1, P, G), (yf + (1.6 if boxy else 1.85), 0.86, H - 0.02, a - 0.06, a - 0.2, G, P),
                   (0.0, 0.86, H, a - 0.06, a - 0.2, P, P), (0.1, 0.86, H, a - 0.06, a - 0.2, G, P),
                   (yr - (1.3 if boxy else 1.55), 0.88, H - 0.02, a - 0.06, a - 0.2, P, G), (yr - 0.95, 0.9, 0.92, a - 0.06, a - 0.12, P, P)]
        return dict(L=L, W=W, H=H, wb=wb, rw=rw, tw=0.175, lower=lower, cab=cab, plate='white' if kind != 'Taxi_Sedan' else 'green',
                    hood_z=lower[2][2], belt=lower[2][2], yf=yf, yr=yr, lamp_z=lower[1][2] - 0.07, tail_z=lower[-2][2] - 0.1)
    if kind in ('Minivan', 'Taxi_JPN'):
        if kind == 'Minivan':
            L, W, H, wb, rw = 4.69, 1.695, 1.865, 2.86, 0.32
            nose = 0.75
        else:
            L, W, H, wb, rw = 4.4, 1.695, 1.75, 2.75, 0.31
            nose = 0.7
        yf, yr = -L / 2 + 0.04, L / 2 + 0.04
        a = W / 2
        lower = [(yf, 0.34, 0.74, a - 0.07), (yf + 0.12, 0.26, 0.86, a - 0.01), (yf + nose, 0.24, 1.0, a), (yr - 0.12, 0.25, 1.02, a),
                 (yr, 0.36, 0.98, a - 0.04)]
        cab = [(yf + nose, 1.0, 1.02, a - 0.04, a - 0.06, P, G), (yf + nose + 0.75, 1.0, H - 0.02, a - 0.04, a - 0.14, G, P),
               (-0.55, 1.0, H, a - 0.04, a - 0.14, P, P), (-0.45, 1.0, H, a - 0.04, a - 0.14, G, P),
               (0.75, 1.0, H, a - 0.04, a - 0.14, P, P), (0.85, 1.0, H, a - 0.04, a - 0.14, G, P),
               (yr - 0.25, 1.0, H - 0.02, a - 0.04, a - 0.14, P, P), (yr - 0.08, 1.02, H - 0.1, a - 0.04, a - 0.14, P, P, G)]
        return dict(L=L, W=W, H=H, wb=wb, rw=rw, tw=0.18, lower=lower, cab=cab, plate='white' if kind == 'Minivan' else 'green',
                    hood_z=1.0, belt=1.0, yf=yf, yr=yr, lamp_z=0.82, tail_z=0.9, slide=True)
    raise KeyError(kind)


def plate(c, y, z, s, kind):
    """Japanese plate 330 x 165 mm: colour + a 'number' bar and a small upper line."""
    col, txt = {'white': ('PLATE_WHITE', 'PLATE_TEXT_GREEN'), 'kei': ('PLATE_YELLOW', 'PLATE_TEXT_DARK'),
                'green': ('PLATE_GREEN', 'PLATE_TEXT_WHITE'), 'black': ('PLATE_BLACK', 'PLATE_TEXT_YELLOW')}[kind]
    gbox(c, 0, y, z, 0.165, 0.008, 0.083, col)
    if c.lod == 0:
        gbox(c, 0.02, y + s * 0.009, z - 0.02, 0.11, 0.002, 0.03, txt)
        gbox(c, -0.03, y + s * 0.009, z + 0.045, 0.07, 0.002, 0.012, txt)


def car(c, kind, sp, paint_reg=None):
    L, W, H, rw, tw, wb = sp['L'], sp['W'], sp['H'], sp['rw'], sp['tw'], sp['wb']
    yf, yr = sp['yf'], sp['yr']
    n = (16, 12, 8)[c.lod]
    lower = sp['lower']
    if c.lod == 2:
        lower = [lower[0], lower[2], lower[-2], lower[-1]]

    def low_reg(i, j, m):
        if i in (-1, 99):        # nose and tail caps are body colour; grille and lamps sit on them
            return PAINT
        if m.z < 0.3:
            return 'UNDER'
        return PAINT
    loft_y(c, lower, n, low_reg)
    cabin(c, sp['cab'] if c.lod < 2 else [s for k, s in enumerate(sp['cab']) if k in (0, 1, len(sp['cab']) - 2, len(sp['cab']) - 1)])
    a = W / 2
    # wheels + arches
    for y in (-wb / 2, wb / 2):
        for s in (1, -1):
            arch(c, s * (a + 0.003), y, rw, s)
            wheel(c, s * (a + 0.02 - tw / 2), y, rw, tw, s)
    lz, tz = sp['lamp_z'], sp['tail_z']
    yl0 = lower[1][0]
    # headlamps (lit), grille, bumper, plate
    for s in (1, -1):
        gbox(c, s * (a - 0.2), yf + 0.07, lz, 0.17, 0.05, 0.05, 'HEAD_LIT', rot=Matrix.Rotation(math.radians(-s * 8), 3, 'Z'))
        if c.lod < 2:
            gbox(c, s * (a - 0.06), yf + 0.13, lz - 0.01, 0.035, 0.04, 0.03, 'AMBER')
        gbox(c, s * (a - 0.16), yr - 0.04, tz, 0.13, 0.05, 0.07, 'TAIL_LIT')
        if c.lod < 2:
            gbox(c, s * (a - 0.16), yr - 0.035, tz - 0.1, 0.1, 0.045, 0.02, 'REVERSE')
    gbox(c, 0, yf + 0.03, lz - 0.03, a - 0.4, 0.04, 0.075, 'TRIM_BLACK')        # grille
    if c.lod == 0:
        gbox(c, 0, yf + 0.005, lz - 0.03, a - 0.44, 0.012, 0.01, 'CHROME')
    gbox(c, 0, yf + 0.01, 0.38, a - 0.12, 0.05, 0.06, 'TRIM_GREY')             # lower bumper lip
    gbox(c, 0, yr - 0.005, 0.4, a - 0.12, 0.05, 0.06, 'TRIM_GREY')
    plate(c, yf - 0.035, 0.46, -1, sp['plate'])
    plate(c, yr + 0.04, tz - 0.05 if tz > 0.7 else 0.55, 1, sp['plate'])
    if c.lod < 2:
        cab = sp['cab']
        ya = cab[0][0]
        belt = sp['belt']
        # mirrors on the doors, wipers at the base of the screen
        for s in (1, -1):
            gbox(c, s * (a + 0.08), ya + 0.25, belt + 0.1, 0.06, 0.04, 0.05, PAINT)
            gbox(c, s * (a + 0.02), ya + 0.27, belt + 0.07, 0.03, 0.012, 0.012, 'TRIM_BLACK')
        if c.lod == 0:
            for s in (1, -1):
                gbox(c, s * 0.25, ya + 0.04, belt + 0.03, 0.26, 0.012, 0.008, 'WIPER', rot=Matrix.Rotation(math.radians(s * 6), 3, 'Y'))
            # door seams and handles (front door, rear door / slider)
            for s in (1, -1):
                xs = s * (a + 0.001)
                yb = cab[2][0] + 0.05
                for yy in (ya + 0.05, yb):
                    gbox(c, xs, yy, (0.3 + belt) / 2 + 0.05, 0.004, 0.006, (belt - 0.3) / 2, 'TRIM_BLACK')
                gbox(c, xs + s * 0.004, yb - 0.25, belt - 0.07, 0.008, 0.06, 0.012, 'TRIM_GREY')
                if sp.get('slide'):    # sliding door rail under the rear side window
                    gbox(c, xs + s * 0.002, cab[-3][0] - 0.2, belt + 0.08, 0.006, 0.3, 0.01, 'TRIM_BLACK')
                gbox(c, xs + s * 0.004, cab[-3][0] - 0.25, belt - 0.07, 0.008, 0.06, 0.012, 'TRIM_GREY')
            # shark-fin antenna, rear wiper
            gbox(c, 0, cab[-2][0] - 0.2, H + 0.03, 0.025, 0.08, 0.03, 'TRIM_BLACK')
    if sp.get('rack') and c.lod < 2:
        for x in (-a + 0.12, a - 0.12):
            gbox(c, x, (yf + yr) / 2 + 0.2, H + 0.05, 0.02, 1.0, 0.02, 'RACK')
        for y in (-0.6, 0.0, 0.6, 1.2):
            gbox(c, 0, y, H + 0.07, a - 0.12, 0.02, 0.015, 'RACK')


def taxi_extras(c, sp, kind):
    """Andon roof sign, the red 'vacant' (空車) lamp behind the windscreen, a gold stripe."""
    cab = sp['cab']
    y_roof = cab[2][0] - 0.1
    gbox(c, 0, y_roof, sp['H'] + 0.012, 0.11, 0.06, 0.012, 'TRIM_BLACK')
    gbox(c, 0, y_roof, sp['H'] + 0.09, 0.2 if kind == 'Taxi_Sedan' else 0.14, 0.05, 0.07, 'ANDON_LIT')
    if c.lod < 2:
        gbox(c, 0.0, y_roof, sp['H'] + 0.165, 0.18 if kind == 'Taxi_Sedan' else 0.12, 0.045, 0.008, 'ANDON_BODY')
        gbox(c, -sp['W'] / 2 + 0.3, cab[0][0] + 0.25, sp['belt'] + 0.06, 0.07, 0.01, 0.03, 'TAIL_LIT')   # 空車 lamp (right side of the screen)
        if c.lod == 0:
            for s in (1, -1):
                gbox(c, s * (sp['W'] / 2 + 0.002), 0.0, sp['belt'] - 0.06, 0.003, sp['L'] / 2 - 0.5, 0.012, 'TAXI_STRIPE')


def truck(c):
    """2-tonne cab-over with an aluminium box (the delivery truck of every town)."""
    W, rw, tw = 1.86, 0.36, 0.2
    a = W / 2
    yf, yr = -3.05, 3.1
    ax_f, ax_r = -2.0, 1.4
    n = (16, 12, 8)[c.lod]
    lower = [(yf, 0.55, 1.0, a - 0.06), (yf + 0.08, 0.45, 1.25, a - 0.01), (yf + 1.4, 0.45, 1.25, a - 0.01), (yf + 1.5, 0.6, 1.2, a - 0.05)]
    loft_y(c, lower, n, lambda i, j, m: 'TRIM_BLACK' if i == -1 else ('UNDER' if m.z < 0.5 else PAINT))
    G, P = 'GLASS', PAINT
    cab = [(yf + 0.1, 1.25, 1.27, a - 0.03, a - 0.03, P, G), (yf + 0.28, 1.25, 2.2, a - 0.03, a - 0.08, G, P),
           (yf + 0.85, 1.25, 2.22, a - 0.03, a - 0.08, P, P), (yf + 1.45, 1.25, 2.2, a - 0.04, a - 0.1, P, P)]
    cabin(c, cab)
    # chassis rails, box on its sub-frame with ribs and rear doors
    gbox(c, 0, 0.0, 0.62, 0.42, 3.0, 0.1, 'UNDER')
    bx0, bx1 = yf + 1.6, yr
    gbox(c, 0, (bx0 + bx1) / 2, 0.82, a + 0.04, (bx1 - bx0) / 2, 0.1, 'TRIM_GREY')
    gbox(c, 0, (bx0 + bx1) / 2, 1.83, a + 0.05, (bx1 - bx0) / 2, 0.91, 'ALU_BOX', bevel=True)
    if c.lod < 2:
        k = 9 if c.lod == 0 else 5
        for i in range(k):
            y = bx0 + 0.1 + (bx1 - bx0 - 0.2) * i / (k - 1)
            for s in (1, -1):
                gbox(c, s * (a + 0.06), y, 1.83, 0.01, 0.03, 0.88, 'ALU_RIB')
        for s in (1, -1):
            gbox(c, s * 0.46, yr + 0.012, 1.8, 0.44, 0.01, 0.84, 'ALU_RIB')
            if c.lod == 0:
                for z in (1.2, 1.8, 2.4):
                    gbox(c, s * 0.85, yr + 0.025, z, 0.04, 0.012, 0.05, 'CHROME')
                gbox(c, s * 0.08, yr + 0.03, 1.6, 0.012, 0.012, 0.6, 'CHROME')
    # wheels: single front, twin rear; arches on the cab only, mud flaps at the rear
    for s in (1, -1):
        arch(c, s * (a + 0.003), ax_f, rw, s, r_extra=0.06)
        wheel(c, s * (a + 0.02 - tw / 2), ax_f, rw, tw, s)
        wheel(c, s * (a - 0.02 - tw / 2), ax_r, rw, tw, s, rim='RIM_DARK')
        wheel(c, s * (a - 0.02 - tw * 1.55), ax_r, rw, tw, s, rim='RIM_DARK')
        gbox(c, s * (a - 0.15), ax_r + 0.55, 0.3, 0.17, 0.01, 0.2, 'MUDFLAP')
        gbox(c, s * (a - 0.15), ax_r, 0.82, 0.24, 0.55, 0.03, 'TRIM_BLACK')      # fender over the twins
        # lamps, mirrors on stalks
        gbox(c, s * (a - 0.18), yf - 0.02, 0.62, 0.14, 0.04, 0.06, 'HEAD_LIT')
        gbox(c, s * (a - 0.15), yr + 0.03, 0.6, 0.12, 0.03, 0.05, 'TAIL_LIT')
        if c.lod < 2:
            K.tube_path(c.bm, [Vector((s * (a - 0.02), yf + 0.3, 1.9)), Vector((s * (a + 0.2), yf + 0.25, 1.95)),
                               Vector((s * (a + 0.22), yf + 0.2, 1.75))], 0.012, 4)
            gbox(c, s * (a + 0.24), yf + 0.2, 1.62, 0.04, 0.03, 0.15, 'TRIM_BLACK')
    gbox(c, 0, yf - 0.01, 0.95, a - 0.3, 0.02, 0.12, 'TRIM_BLACK')                  # grille slot
    gbox(c, 0, yf + 0.02, 0.5, a, 0.06, 0.08, 'TRIM_GREY')                          # bumper
    gbox(c, 0, yf + 0.5, 0.75, 0.25, 0.3, 0.12, 'UNDER')
    gbox(c, -a + 0.35, 0.0, 0.52, 0.25, 0.3, 0.12, 'CHROME')                        # fuel tank
    plate(c, yf - 0.04, 0.55, -1, 'green')
    plate(c, yr + 0.05, 0.62, 1, 'green')


def bus(c):
    """Community bus (Poncho type, 7 m): low floor, big glass, destination sign."""
    W, H, rw, tw = 2.08, 3.05, 0.4, 0.24
    a = W / 2
    yf, yr = -3.5, 3.5
    ax_f, ax_r = -2.2, 2.0
    n = (16, 12, 8)[c.lod]
    lower = [(yf, 0.3, 1.1, a - 0.05), (yf + 0.06, 0.25, 1.15, a), (yr - 0.06, 0.25, 1.15, a), (yr, 0.3, 1.1, a - 0.05)]
    loft_y(c, lower, n, lambda i, j, m: 'TRIM_BLACK' if i == -1 else ('UNDER' if m.z < 0.3 else ('BUS_GREEN' if m.z < 0.7 else 'BUS_CREAM')))
    G = 'GLASS'
    cab = [(yf + 0.03, 1.15, 1.17, a - 0.01, a - 0.01, 'BUS_CREAM', G), (yf + 0.15, 1.15, H - 0.05, a - 0.01, a - 0.08, G, 'BUS_CREAM'),
           (yf + 0.4, 1.15, H, a - 0.01, a - 0.08, 'BUS_CREAM', 'BUS_CREAM')]
    y = yf + 0.4
    while y < yr - 1.2:
        cab.append((y + 0.1, 1.15, H, a - 0.01, a - 0.08, G, 'BUS_CREAM'))
        cab.append((y + 1.1, 1.15, H, a - 0.01, a - 0.08, 'BUS_CREAM', 'BUS_CREAM'))
        y += 1.2
    cab.append((yr - 0.06, 1.15, H - 0.05, a - 0.01, a - 0.08, 'BUS_CREAM', 'BUS_CREAM', G))
    if c.lod == 2:
        cab = [cab[0], cab[1], cab[2], cab[-1]]
    cabin(c, cab)
    gbox(c, 0, yf - 0.02, H - 0.25, a - 0.25, 0.03, 0.12, 'SIGN_LIT')               # destination sign
    gbox(c, -a - 0.005, -1.2, 1.4, 0.01, 0.55, 1.05, 'GLASS')                      # door (left, kerb side in Japan)
    for s in (1, -1):
        for y in (ax_f, ax_r):
            arch(c, s * (a + 0.003), y, rw, s, r_extra=0.07)
            wheel(c, s * (a + 0.02 - tw / 2), y, rw, tw, s)
        gbox(c, s * (a - 0.25), yf - 0.01, 0.62, 0.17, 0.03, 0.08, 'HEAD_LIT')
        gbox(c, s * (a - 0.2), yr + 0.01, 0.7, 0.12, 0.03, 0.12, 'TAIL_LIT')
        if c.lod < 2:
            K.tube_path(c.bm, [Vector((s * (a - 0.1), yf + 0.05, 2.6)), Vector((s * (a + 0.15), yf - 0.25, 2.5)),
                               Vector((s * (a + 0.15), yf - 0.3, 2.2))], 0.015, 4)
            gbox(c, s * (a + 0.15), yf - 0.3, 2.05, 0.05, 0.03, 0.15, 'TRIM_BLACK')
    plate(c, yf - 0.03, 0.5, -1, 'green')
    plate(c, yr + 0.03, 0.55, 1, 'green')


CARS = ['Kei_Tall', 'Kei_Hatch', 'Kei_Van', 'Compact', 'Sedan', 'Minivan', 'Taxi_JPN', 'Taxi_Sedan', 'Truck_2t', 'Bus_Mini']
FIXED = {'Taxi_JPN': 'TAXI_INDIGO', 'Taxi_Sedan': 'TAXI_ORANGE', 'Bus_Mini': 'BUS_CREAM'}   # painted from the atlas
# body colours the town draws from (sRGB, rough share): Unity tints M_TrafficPaint with these
COLOURS = {'pearl_white': ('#e9e8e3', 0.3), 'silver': ('#a9acb0', 0.18), 'black': ('#17181a', 0.16), 'grey': ('#5d6166', 0.08),
           'navy': ('#22314f', 0.06), 'red': ('#9b1f22', 0.05), 'beige': ('#c9b996', 0.05), 'kei_mint': ('#9fcfc0', 0.04),
           'kei_pink': ('#e3b6b8', 0.02), 'brown': ('#5b4434', 0.03), 'blue': ('#3d6ea5', 0.03)}


def build_one(name, lod):
    c = TC(ATLAS, lod)
    c.paint_slot = name not in FIXED and name != 'Bus_Mini'
    c.body_reg = FIXED.get(name, 'TRUCK_CAB')
    if name == 'Truck_2t':
        truck(c)
    elif name == 'Bus_Mini':
        bus(c)
    else:
        sp = spec(name)
        car(c, name, sp)
        if name.startswith('Taxi'):
            taxi_extras(c, sp, name)
    # unmapped faces (spokes, tubes): trim colour
    uv = c.bm.loops.layers.uv.verify()
    for f in c.bm.faces:
        if all(l[uv].uv.length == 0 for l in f.loops):
            c.m([f], 'RIM_SILVER' if f.calc_center_median().z < 0.9 else 'TRIM_BLACK')
    return c


def build(only=None):
    import bpy, json, os
    mat = K.atlas_material(ATLAS, emission_strength=2.0)
    pm = paint_mat()
    out = []
    info = {}
    for name in CARS:
        if only and name not in only:
            continue
        col = K.collection(f'Traffic_{name}')
        lods = []
        for lod in range(3):
            c = build_one(name, lod)
            has_paint = any(f.material_index == 1 for f in c.bm.faces)
            ob = K.mesh_object(f'SM_Traffic_{name}_LOD{lod}', c.bm, col, [mat, pm] if has_paint else [mat],
                               bevel=0.012 if lod == 0 else 0.0, smooth=True, recalc=False)
            if lod:
                ob.hide_set(True); ob.hide_render = True
            lods.append(ob)
        vs = [v.co for v in lods[0].data.vertices]
        size = [round(max(v[i] for v in vs) - min(v[i] for v in vs), 2) for i in range(3)]
        K.collider_box(f'COL_Traffic_{name}', col, -size[0] / 2, size[0] / 2, min(v.y for v in vs), max(v.y for v in vs), 0.2,
                       max(v.z for v in vs))
        info[name] = dict(size=size, paint=name not in FIXED and name != 'Bus_Mini')
        out.append((col, lods))
    path = os.path.join(K.ART, 'exports', 'traffic', 'traffic.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = {}
    if os.path.exists(path):
        with open(path) as f:
            old = json.load(f)
    old.update(info)
    old['_colours'] = COLOURS
    with open(path, 'w') as f:
        json.dump(old, f, indent=1)
    return out


def preview(results, views):
    """All cars in two rows, each in a different town colour."""
    import bpy
    from kit import preview as P
    cols = list(COLOURS.values())
    objs, mats = [], []
    x = 0.0
    for i, (col, lods) in enumerate(results):
        o = lods[0]
        o.location = (x + o.dimensions.x / 2, 0, 0)
        x += o.dimensions.x + 0.6
        if len(o.data.materials) > 1:
            m = o.data.materials[1].copy()
            h = cols[i % len(cols)][0].lstrip('#')
            rgb = [((int(h[k:k + 2], 16) / 255) ** 2.2) for k in (0, 2, 4)]
            next(nn for nn in m.node_tree.nodes if nn.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*rgb, 1)
            o.material_slots[1].link = 'OBJECT'; o.material_slots[1].material = m
            mats.append(m)
        objs.append(o)
    try:
        return P.render(objs, 'Traffic', [('front', (0.35, -1.6, 0.5), True), ('front n', (0.35, -1.6, 0.5), False),
                                          ('back', (-0.35, 1.6, 0.5), False), ('clay', (0.6, -1.4, 0.6), 'clay')],
                        size=(1600, 380), show=[c.name for c, _ in results])
    finally:
        for o in objs:
            o.location = (0, 0, 0)
            if len(o.material_slots) > 1:
                o.material_slots[1].link = 'DATA'
        for m in mats:
            bpy.data.materials.remove(m)
