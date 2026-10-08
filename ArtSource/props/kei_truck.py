"""Kei truck (task 5c): the white cab-over mini truck of every Japanese
harbour, farm and village (Suzuki Carry / Daihatsu Hijet type, invented, no
badge). Kei class: 3.39 x 1.47 x 1.77 m, 12-inch wheels, wheelbase 1.9 m,
bed 1.94 x 1.41 m with three drop sides (aori), the headboard guard
(torii guard) behind the cab, rope hooks along the bed, black commercial
kei plate with yellow letters.

Variants (own FBX): empty (a crate and a rope coil), fish crates, fishing
nets with floats, rice straw bundles - loads tied down with rope from hook
to hook over the top, as everyone does. Parked: lamps are lenses, not lit.
Atlases Koso (body, wheels, cargo cells) + KosoShop (plate, nets).
Front to -Y, origin on the ground between the axles.
"""
import math
import random
import bmesh
from mathutils import Vector
from kit import core as K
from kit import organic as O
from buildings.koedo_kit import C
from buildings.tokyo_kit import F

KLASS = 'props'
NAME = 'Prop_KeiTruck'
L, WD = 3.39, 1.475
YF, YR = -1.70, 1.69          # front / rear of the vehicle
AX_F, AX_R = -0.95, 0.955     # axles
RW, TW = 0.282, 0.145         # wheel radius, tyre width
BED = (-0.33, 1.66, 0.62)     # bed y0, y1, floor top z
VARIANTS = ['Empty', 'Crates', 'Nets', 'Straw']


def fr(y=0.0):
    return F(Vector((0, y, 0)), (0, -1))    # u = x, d = -y from y


def gbox(c, x0, x1, y0, y1, z0, z1, reg, skip=()):
    return c.box(F(Vector((0, 0, 0)), (0, -1)), x0, x1, z0, z1, -y1, -y0, reg, skip=skip)


def quad(c, pts, reg, normal):
    f = c.bm.faces.new([c.bm.verts.new(p) for p in pts])
    f.normal_update()
    if f.normal.dot(Vector(normal)) < 0:
        f.normal_flip()
    c.m([f], reg); c.nb([f])
    return f


def wheel(c, x, y, lod, outer):
    """Tyre along X: tread, sidewall annulus, steel rim with hub (12 sides)."""
    n = 12 if lod == 0 else 8
    bm = c.bm
    s = 1 if outer > 0 else -1
    xo, xi = x + s * TW / 2, x - s * TW / 2
    ring = lambda xx, r: [bm.verts.new((xx, y + r * math.cos(2 * math.pi * i / n), RW + r * math.sin(2 * math.pi * i / n)))
                          for i in range(n)]
    ao, ai = ring(xo, RW), ring(xi, RW)
    tread = []
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new([ai[i], ai[j], ao[j], ao[i]]); tread.append(f)
    for f in tread:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - Vector((x, y, RW))) < 0:
            f.normal_flip()
    c.m(tread, 'RUBBER'); c.nb(tread)
    back = bm.faces.new(ai); back.normal_update()
    if back.normal.x * s > 0:
        back.normal_flip()
    c.m([back], 'MUD'); c.nb([back])
    if lod == 0:
        rim = ring(xo - s * 0.02, RW * 0.62)
        ann = []
        for i in range(n):
            j = (i + 1) % n
            ann.append(bm.faces.new([ao[i], ao[j], rim[j], rim[i]]))
        for f in ann:
            f.normal_update()
            if f.normal.x * s < 0:
                f.normal_flip()
        c.m(ann, 'RUBBER'); c.nb(ann)
        disc = bm.faces.new(rim); disc.normal_update()
        if disc.normal.x * s < 0:
            disc.normal_flip()
        c.m([disc], 'RIM'); c.nb([disc])
        c.box(F(Vector((xo - s * 0.02, 0, 0)), (s, 0)), y * s - 0.05, y * s + 0.05, RW - 0.05, RW + 0.05, 0.0, 0.03,
              'CHROME', skip=('in',))
    else:
        cap = bm.faces.new(ao); cap.normal_update()
        if cap.normal.x * s < 0:
            cap.normal_flip()
        c.m([cap], 'RIM'); c.nb([cap])


LEVELS = [   # cab cross-sections: z, front y, back y, half width, front / back corner chamfer
    (0.56, YF, -0.37, 0.7375, 0.10, 0.03),
    (0.98, YF + 0.02, -0.37, 0.7375, 0.12, 0.03),
    (1.70, YF + 0.25, -0.37, 0.70, 0.16, 0.05),     # tumblehome: the sides lean in over the belt line
    (1.765, YF + 0.33, -0.42, 0.68, 0.14, 0.07),
]


def _ring(z, yf, yb, hw, cf, cb):
    return [Vector(p) for p in ((-hw + cf, yf, z), (hw - cf, yf, z), (hw, yf + cf, z), (hw, yb - cb, z),
                                (hw - cb, yb, z), (-hw + cb, yb, z), (-hw, yb - cb, z), (-hw, yf + cf, z))]


def cab(c, cs, lod):
    """Cab-over cab lofted through four cross-sections (rounded front corners,
    sides leaning in above the belt line), glass laid on its faces,
    grille, lamps, bumper, mirrors, wipers, plate."""
    bm = c.bm
    hw = WD / 2
    R = [_ring(*lv) for lv in LEVELS]
    V = [[bm.verts.new(p) for p in r] for r in R]
    ctr = Vector((0, (YF - 0.37) / 2, 1.15))
    body = []
    for i in range(len(V) - 1):
        for k in range(8):
            j = (k + 1) % 8
            body.append(bm.faces.new([V[i][k], V[i][j], V[i + 1][j], V[i + 1][k]]))
    body.append(bm.faces.new(V[-1])); body.append(bm.faces.new(list(reversed(V[0]))))
    for f in body:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - ctr) < 0:
            f.normal_flip()
    c.m(body, 'TRUCK_WHITE')

    def fp(band, k, s, t, off=0.006):
        A, B = R[band][k], R[band][(k + 1) % 8]
        D, Cc = R[band + 1][k], R[band + 1][(k + 1) % 8]
        p = (A.lerp(B, s)).lerp(D.lerp(Cc, s), t)
        n = (B - A).cross(D - A).normalized()
        if n.dot(p - ctr) < 0:
            n = -n
        return p + n * off, n

    def glass(band, k, s0, s1, t0, t1, reg='GLASS_CAB', off=0.006):
        pts = [fp(band, k, s, t, off) for s, t in ((s0, t0), (s1, t0), (s1, t1), (s0, t1))]
        return quad(c, [p for p, _ in pts], reg, pts[0][1])

    glass(1, 0, 0.03, 0.97, 0.05, 0.95)                    # windshield
    for k in (1, 7):
        glass(1, k, 0.1, 0.9, 0.08, 0.92)                  # corner glass (wraparound)
    sd = (-0.49 - (YF + 0.14)) / (-0.40 - (YF + 0.14))     # door window back edge, as a share of the side
    glass(1, 2, 0.02, sd * 0.97, 0.12, 0.93)
    glass(1, 6, 1 - sd * 0.97, 0.98, 0.12, 0.93)
    glass(1, 4, 0.22, 0.78, 0.35, 0.85)                    # small rear window
    if lod == 0:
        for k, s in ((2, sd), (6, 1 - sd)):                # door gaps and handles
            for band in (0, 1):
                glass(band, k, s - 0.008, s + 0.008, 0.0, 1.0, 'BLACK', 0.004)
        for xx in (-0.35, 0.25):                           # wipers parked at the windshield foot
            p, _ = fp(1, 0, 0.5 + xx / 1.4, 0.08, 0.02)
            gbox(c, xx, xx + 0.42, p.y - 0.01, p.y + 0.01, p.z, p.z + 0.02, 'BLACK')
        for x, s in ((-hw, -1), (hw, 1)):
            gbox(c, x - 0.02 if s > 0 else x, x if s > 0 else x + 0.02, -0.70, -0.58, 0.86, 0.89, 'BLACK')
            mx = x + s * 0.13
            c.tube([(x, YF + 0.22, 1.08), (mx, YF + 0.12, 1.18)], 0.012, 4, 'BLACK')
            gbox(c, mx - 0.05, mx + 0.05, YF + 0.07, YF + 0.16, 1.12, 1.30, 'BLACK')
        for x in (-0.66, 0.63):                            # roof drip rails
            gbox(c, x, x + 0.03, YF + 0.4, -0.45, 1.765, 1.78, 'TRUCK_WHITE')
        for x in (-hw - 0.02, hw - 0.06):                  # steps under the doors
            gbox(c, x, x + 0.08, -0.62, -0.40, 0.36, 0.40, 'BLACK')
    # lower front apron + wheel arch: the front wheel sits under the seat
    gbox(c, -hw + 0.06, hw - 0.06, YF, YF + 0.36, 0.30, 0.56, 'TRUCK_WHITE', skip=('top',))
    for s in (-1, 1):
        x0, x1 = (hw - 0.06, hw) if s > 0 else (-hw, -hw + 0.06)
        gbox(c, x0, x1, YF + 0.06, YF + 0.36, 0.30, 0.56, 'TRUCK_WHITE', skip=('top',))
    gbox(c, -hw, hw, -0.62, -0.37, 0.32, 0.56, 'TRUCK_WHITE', skip=('top',))
    for x in (-hw + 0.02, hw - 0.02):            # dark wheel wells
        gbox(c, x - 0.16 if x > 0 else x, x if x > 0 else x + 0.16, YF + 0.36, -0.62, 0.42, 0.56, 'MUD', skip=('top',))
    gbox(c, -hw + 0.16, hw - 0.16, YF + 0.36, -0.62, 0.30, 0.56, 'MUD', skip=('top',))
    # front face: grille slats, lamps, indicators, bumper, plate
    ff = fr(YF)
    c.box(ff, -0.42, 0.42, 0.70, 0.90, 0.0, 0.015, 'BLACK', skip=('in',))
    if lod == 0:
        for z in (0.75, 0.80, 0.85):
            c.box(ff, -0.40, 0.40, z, z + 0.012, 0.015, 0.025, 'CHROME', skip=('in',))
    for s in (-1, 1):
        c.box(ff, s * 0.47 - 0.12, s * 0.47 + 0.12, 0.72, 0.90, 0.0, 0.03, 'CHROME', skip=('in',))
        c.box(ff, s * 0.66 - 0.05, s * 0.66 + 0.05, 0.74, 0.88, 0.0, 0.025, 'YELLOW', skip=('in',))
    c.box(ff, -hw - 0.01, hw + 0.01, 0.30, 0.50, 0.0, 0.07, 'BLACK', skip=('in',))
    pl = cs.box(ff, -0.165, 0.165, 0.33, 0.495, 0.07, 0.075, None, skip=('in', 'top', 'bot', 'l', 'r'))
    cs.m([pl['out']], 'PLATE_KEI')


def bed(c, lod):
    """Steel bed: floor, three drop sides with pressed ribs and hinges, the
    headboard guard (torii guard) with mesh, rope hooks, chassis, lamps."""
    y0, y1, zf = BED
    hw = 0.705
    gbox(c, -hw, hw, y0, y1, zf - 0.06, zf, 'BED_STEEL')
    zg = zf + 0.29
    for x0, x1 in ((-hw, -hw + 0.03), (hw - 0.03, hw)):            # drop sides
        gbox(c, x0, x1, y0, y1, zf, zg, 'TRUCK_WHITE')
    gbox(c, -hw, hw, y1 - 0.03, y1, zf, zg, 'TRUCK_WHITE')        # tailgate
    if lod == 0:
        for z in (zf + 0.09, zf + 0.19):                           # pressed ribs
            for x0, x1 in ((-hw - 0.012, -hw), (hw, hw + 0.012)):
                gbox(c, x0, x1, y0 + 0.05, y1 - 0.05, z, z + 0.03, 'TRUCK_WHITE')
            gbox(c, -hw + 0.05, hw - 0.05, y1, y1 + 0.012, z, z + 0.03, 'TRUCK_WHITE')
        for y in (y0 + 0.4, y0 + 1.0, y0 + 1.6):                   # rope hooks under the sides
            for x in (-hw - 0.03, hw):
                gbox(c, x, x + 0.03, y - 0.03, y + 0.03, zf - 0.08, zf - 0.02, 'STEEL_GREY')
        for x in (-hw + 0.1, hw - 0.18):                           # tailgate latches
            gbox(c, x, x + 0.08, y1, y1 + 0.02, zg - 0.08, zg - 0.03, 'CHROME')
    # headboard guard: posts, top rail, a mesh panel, the lip over the cab roof
    gy = y0 + 0.02
    for x in (-hw + 0.02, hw - 0.06):
        gbox(c, x, x + 0.04, gy, gy + 0.04, zf, 1.86, 'BED_STEEL')
    gbox(c, -hw + 0.02, hw - 0.02, gy, gy + 0.04, 1.82, 1.86, 'BED_STEEL')
    gbox(c, -hw + 0.02, hw - 0.02, gy - 0.12, gy + 0.04, 1.84, 1.86, 'BED_STEEL')
    quad(c, [(-hw + 0.06, gy + 0.02, zg), (hw - 0.06, gy + 0.02, zg), (hw - 0.06, gy + 0.02, 1.82), (-hw + 0.06, gy + 0.02, 1.82)],
         'BED_STEEL', (0, 1, 0))
    if lod == 0:
        for k in range(1, 6):
            x = -hw + 0.06 + (2 * hw - 0.12) * k / 6
            gbox(c, x - 0.012, x + 0.012, gy + 0.02, gy + 0.05, zg, 1.82, 'BED_STEEL')
    # chassis rails, rear bumper, lamps, mud flaps
    for x in (-0.42, 0.34):
        gbox(c, x, x + 0.08, y0, y1 - 0.02, 0.40, zf - 0.06, 'BLACK', skip=('bot',) if lod else ())
    gbox(c, -0.62, 0.62, y1 - 0.05, y1 + 0.03, 0.36, 0.44, 'BLACK')
    for s in (-1, 1):
        lp = gbox(c, s * 0.58 - 0.08, s * 0.58 + 0.08, y1 - 0.06, y1 + 0.02, 0.44, 0.56, 'PAINT_RED')
        if lod == 0:
            gbox(c, s * 0.58 - 0.07, s * 0.58 + 0.07, y1 + 0.02, y1 + 0.03, 0.47, 0.50, 'YELLOW')
        quad(c, [(s * 0.6 - 0.12, AX_R + 0.34, 0.12), (s * 0.6 + 0.12, AX_R + 0.34, 0.12),
                 (s * 0.6 + 0.12, AX_R + 0.34, 0.50), (s * 0.6 - 0.12, AX_R + 0.34, 0.50)], 'RUBBER', (0, 1, 0))
        quad(c, [(s * 0.6 - 0.12, AX_R + 0.335, 0.12), (s * 0.6 + 0.12, AX_R + 0.335, 0.12),
                 (s * 0.6 + 0.12, AX_R + 0.335, 0.50), (s * 0.6 - 0.12, AX_R + 0.335, 0.50)], 'RUBBER', (0, -1, 0))
    if lod == 0:   # spare wheel under the bed, rear axle, exhaust
        gbox(c, -0.25, 0.25, 0.2, 0.7, 0.38, 0.52, 'RUBBER')
        c.tube([(-0.55, AX_R, RW), (0.55, AX_R, RW)], 0.04, 6, 'BLACK')
        c.tube([(0.30, -0.2, 0.30), (0.30, 1.3, 0.30), (0.40, 1.62, 0.30)], 0.025, 6, 'STEEL_GREY')


# ── loads ───────────────────────────────────────────────────────────────────

def ropes(c, pts_z, lod, seed):
    """Rope from hook to hook over the load (zigzag across), the kei way."""
    if lod:
        return
    y0, y1, zf = BED
    ys = [y0 + 0.4, y0 + 1.0, y0 + 1.6]
    for i in range(len(ys) - 1):
        ya, yb = ys[i], ys[i + 1]
        z = pts_z
        c.tube([(-0.72, ya, zf - 0.05), (-0.5, ya + 0.1, z), (0.5, yb - 0.1, z), (0.72, yb, zf - 0.05)], 0.008, 4, 'ROPE')
        c.tube([(0.72, ya, zf - 0.05), (0.5, ya + 0.1, z), (-0.5, yb - 0.1, z), (-0.72, yb, zf - 0.05)], 0.008, 4, 'ROPE')


def crate(c, x, y, z, reg, rot=False, lod=0):
    """Fish crate (orikon): 0.62 x 0.42 x 0.24, open top showing the inside."""
    w, d, h = (0.42, 0.62, 0.24) if rot else (0.62, 0.42, 0.24)
    b = gbox(c, x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + h, reg, skip=('bot',))
    if lod == 0:
        gbox(c, x - w / 2 - 0.01, x + w / 2 + 0.01, y - d / 2 - 0.01, y + d / 2 + 0.01, z + h - 0.035, z + h, reg, skip=('top',))
        gbox(c, x - w / 2 + 0.03, x + w / 2 - 0.03, y - d / 2 + 0.03, y + d / 2 - 0.03, z + h - 0.02, z + h + 0.001, 'BLACK',
             skip=('bot', 'out', 'in', 'l', 'r'))


def load(c, cs, kind, lod):
    y0, y1, zf = BED
    r = random.Random(hash(kind) % 1000)
    if kind == 'Empty':
        crate(c, 0.3, y1 - 0.4, zf, 'CRATE_BLUE', lod=lod)
        if lod == 0:
            for k in range(3):    # rope coil
                c.tube([(-0.35 + 0.18 * math.cos(a), y0 + 0.45 + 0.18 * math.sin(a), zf + 0.02 + k * 0.016)
                        for a in [2 * math.pi * i / 10 for i in range(11)]], 0.012, 4, 'ROPE')
        return
    if kind == 'Crates':
        cols = ['CRATE_BLUE', 'CRATE_YELLOW', 'CRATE_BLUE', 'CRATE_GREEN']
        for i, y in enumerate((y0 + 0.28, y0 + 0.72, y0 + 1.16, y0 + 1.60)):
            for x in (-0.33, 0.33):
                n = 3 if y < y0 + 1.5 else r.randint(1, 3)
                for k in range(n):
                    crate(c, x + r.uniform(-0.02, 0.02), y, zf + k * 0.245, cols[(i + k + (x > 0)) % 4], lod=lod)
        ropes(c, zf + 0.76, lod, 1)
        return
    if kind == 'Nets':
        # heaped nets: noise lumps wrapped in the net graphic, orange floats tied in
        bm = cs.bm
        for i, (y, h) in enumerate(((y0 + 0.55, 0.55), (y0 + 1.35, 0.45))):
            fs = O.lump(bm, (0.0, y, zf + h * 0.42), (1.32, 0.95, h), 7 + i, subdiv=3 if lod == 0 else 2, amp=0.22,
                        freq=1.8, floor=zf + 0.01)
            # the net graphic per face (a rect through map_box would stretch: Minato lesson)
            cs.m(fs, 'NET_GREEN' if i == 0 else 'NET_BLUE'); cs.nb(fs)
        for k in range(10 if lod == 0 else 4):
            x, y = r.uniform(-0.5, 0.5), r.uniform(y0 + 0.2, y1 - 0.2)
            fs = O.lump(c.bm, (x, y, zf + 0.42 + r.uniform(-0.05, 0.08)), (0.16, 0.16, 0.12), 30 + k, subdiv=2, amp=0.05)
            c.m(fs, 'FLOAT_ORANGE'); c.nb(fs)
        ropes(c, zf + 0.62, lod, 2)
        return
    if kind == 'Straw':
        # rice straw sheaves (稲わら束): ~1 m long, flared ends, tied in the
        # middle, lying lengthwise in rows of four, stacked in a ridge
        n = 8 if lod == 0 else 6
        prof = [(0.0, 0.0), (0.15, 0.02), (0.165, 0.12), (0.12, 0.42), (0.11, 0.5), (0.12, 0.58), (0.165, 0.88),
                (0.15, 0.98), (0.0, 1.0)]
        for layer, (zz, xs) in enumerate(((zf + 0.15, (-0.51, -0.17, 0.17, 0.51)), (zf + 0.42, (-0.34, 0.0, 0.34)),
                                         (zf + 0.68, (-0.17, 0.17)))):
            for row, yy in enumerate((y0 + 0.05, y0 + 0.97)):
                for i, x in enumerate(xs):
                    xj, yj = x + r.uniform(-0.02, 0.02), yy + r.uniform(-0.04, 0.04)
                    d = K.lathe(c.bm, n, prof)
                    fs = d['sides']
                    for v in {v for f in fs for v in f.verts}:
                        v.co = Vector((xj + v.co.x, yj + v.co.z, zz - v.co.y))   # lathe z -> y, a rotation
                    c.m(fs, 'STRAW' if (i + row + layer) % 3 else 'STRAW_DARK'); c.nb(fs)
                    if lod == 0:
                        b = K.lathe(c.bm, n, [(0.117, 0.46), (0.117, 0.54)], cap_bottom=False, cap_top=False)
                        for v in {v for f in b['sides'] for v in f.verts}:
                            v.co = Vector((xj + v.co.x, yj + v.co.z, zz - v.co.y))
                        c.m(b['sides'], 'ROPE'); c.nb(b['sides'])
        ropes(c, zf + 0.72, lod, 3)


def build_variant(kind, lods=(0, 1)):
    name = f'{NAME}_{kind}'
    col = K.collection(name)
    mat = K.atlas_material('Koso')
    smat = K.atlas_material('KosoShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, cs = C('Koso', lod), C('KosoShop', lod)
        cab(c, cs, lod)
        bed(c, lod)
        for x in (-WD / 2 + 0.07, WD / 2 - 0.07):
            for y in (AX_F, AX_R):
                wheel(c, x, y, lod, x)
        load(c, cs, kind, lod)
        fb = F(Vector((0, BED[1] + 0.035, 0)), (0, 1))
        q = cs.box(fb, -0.165, 0.165, 0.36, 0.525, 0.0, 0.005, None, skip=('in', 'top', 'bot', 'l', 'r'))
        cs.m([q['out']], 'PLATE_KEI')
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.012 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    K.collider_box(f'COL_{name}_Cab', col, -WD / 2, WD / 2, YF, -0.37, 0.25, 1.77)
    K.collider_box(f'COL_{name}_Bed', col, -WD / 2 + 0.02, WD / 2 - 0.02, -0.37, YR, 0.25, BED[2] + 0.29)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    return col, objs


def build():
    out = [build_variant(k) for k in VARIANTS]
    print('kei shop:', {c.name: list(c['shop_tris']) for c, _ in out})
    return out
