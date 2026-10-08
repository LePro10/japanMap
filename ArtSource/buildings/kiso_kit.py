"""Kiso building kit (post towns on the Nakasendō, Tsumago/Magome/Narai-like):
two-storey inns (hatago) and shops of dark weathered boards, the upper floor
projecting on beam ends (dashi-bari), fine lattice below (dejōshi) and above,
low board-shingle roofs weighted with stones on battens (ishi-oki yane) or
tile, deep eaves on brackets (udegi + dashi-geta) with rafters, fire wing
walls at the upper floor (sode-udatsu), houses on a high ishigaki plinth on
the slope; plus the street: earth road with a stone-edged water channel,
stepped stone slope, water trough and a small waterwheel.

Machinery from the Koedo kit (koedo_kit.C, prism_u, tile_row, openings as
cells of a swept wall profile, parts on wall frames F: u along the wall,
z up, d out of the wall). New here: a house is two sweeps - ground storey
and upper storey, the upper one shifted forward by the projection P - and
the shingle roof with battens and stones.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings.tokyo_kit import F, lbox
from buildings import koedo_kit as KK
from buildings.koedo_kit import C, prism_u, orient, hole, grid_on, tile_row, op

ZV = Vector((0, 0, 1))
STRIP_H = 2.0
FLAT = {'WOOD_TATE': 'WOOD_TATE_FLAT', 'WOOD_BOARD': 'WOOD_BOARD_FLAT', 'PLASTER_EARTH': 'PLASTER_EARTH_FLAT',
        'PLASTER_WHITE': 'PLASTER_WHITE_FLAT'}
STONES = ('STONE_A', 'STONE_A', 'STONE_B', 'STONE_C')


def flat(reg):
    return FLAT.get(reg, reg)


# ── wall profiles: ground storey and (projecting) upper storey ─────────────

def profile_ground(G, lod):
    """Stone footing (dodai-ishi), wooden sill, wall rows g_low/g_mid/g_top,
    lintel beam (kamoi) at the top. Ends at z = G."""
    pts, meta = [], []

    def seg(d, z, name, kd):
        pts.append((d, z)); meta.append(dict(name=name, kind=kd, storey='g'))
    seg(0.06, 0.0, 'foot', 'stone'); seg(0.06, 0.22, 'foot_top', 'hz')
    seg(0.03, 0.22, 'sill', 'beam'); seg(0.03, 0.36, 'sill_top', 'hz')
    seg(0.0, 0.36, 'g_low', 'wall'); seg(0.0, 1.0, 'g_mid', 'wall'); seg(0.0, 2.2, 'g_top', 'wall')
    if lod == 0:
        seg(0.0, G - 0.22, 'lintel_lo', 'hz')
    seg(0.04, G - 0.22, 'lintel', 'beam')
    pts.append((0.04, G)); meta.append(dict(name='lintel_top', kind='hz', storey='g'))
    pts.append((-0.02, G))
    return pts, meta


def profile_upper(G, U, lod):
    """Floor fascia (hana-kakushi) over the beam ends, wall rows u_low/u_win/
    u_top, wall plate (keta). Returns (pts, meta, z_top)."""
    pts, meta = [], []

    def seg(d, z, name, kd):
        pts.append((d, z)); meta.append(dict(name=name, kind=kd, storey='u'))
    zu = G + 0.28
    seg(0.05, G, 'floor', 'beam')
    if lod == 0:
        seg(0.05, zu, 'floor_top', 'hz')
    zw = zu + U
    seg(0.0, zu, 'u_low', 'wall'); seg(0.0, zu + 0.5, 'u_win', 'wall'); seg(0.0, zw - 0.28, 'u_top', 'wall')
    if lod == 0:
        seg(0.0, zw, 'plate_lo', 'hz')
    seg(0.06, zw, 'plate', 'beam')
    pts.append((0.06, zw + 0.2)); meta.append(dict(name='plate_top', kind='hz', storey='u'))
    pts.append((-0.02, zw + 0.2))
    return pts, meta, zw + 0.2


ROWS = {'ground': ('g_low', 'g_mid', 'g_top'), 'door': ('g_low', 'g_mid'), 'window_g': ('g_mid',),
        'upper': ('u_win',), 'upper_tall': ('u_low', 'u_win')}


class Sweep:
    """One wall profile swept round a rectangle (x0, y0, x1, y1), cells for
    openings. walls[e] = wall region per edge (0 front -Y, 1 right, 2 back, 3 left)."""

    def __init__(self, c, rect, prof, openings, walls):
        x0, y0, x1, y1 = rect
        self.c, self.walls = c, walls
        self.corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        self.len = [x1 - x0, y1 - y0, x1 - x0, y1 - y0]
        self.pts, self.meta = prof
        splits = {e: set() for e in range(4)}
        for o in openings:
            for u in o['u']:
                if 1e-4 < u < self.len[o['e']] - 1e-4:
                    splits[o['e']].add(round(u, 4))
        self.bnd = {e: [0.0] + sorted(splits[e]) + [self.len[e]] for e in range(4)}
        self.faces = K.sweep_loop(c.bm, self.corners, self.pts,
                                  {e: [u / self.len[e] for u in sorted(splits[e])] for e in range(4)})
        self.used = set()

    def frame(self, e):
        c0 = Vector((*self.corners[e], 0)); c1 = Vector((*self.corners[(e + 1) % 4], 0))
        t = (c1 - c0).normalized()
        f = F(c0, (t.y, -t.x))
        f.u0, f.u1 = 0.0, self.len[e]
        return f

    def row_z(self, name):
        k = next(i for i, mt in enumerate(self.meta) if mt['name'] == name)
        return self.pts[k][1], self.pts[k + 1][1]

    def cell(self, e, u, rows):
        ks = [k for k, mt in enumerate(self.meta) if mt['name'] in rows]
        b = self.bnd[e]
        js = [j for j in range(len(b) - 1) if b[j] >= u[0] - 1e-4 and b[j + 1] <= u[1] + 1e-4]
        fs = [self.faces[k][e][j] for k in ks for j in js]
        self.used |= {(k, e, j) for k in ks for j in js}
        return K.merge(self.c.bm, fs) if len(fs) > 1 else fs[0]

    def map_walls(self):
        c = self.c
        for k, mt in enumerate(self.meta):
            z_lo, z_hi = self.pts[k][1], self.pts[k + 1][1]
            for e in range(4):
                fs = [f for j, f in enumerate(self.faces[k][e]) if (k, e, j) not in self.used]
                if not fs:
                    continue
                kd = mt['kind']
                if kd == 'wall':
                    bases = [p[1] for kk, p in enumerate(self.pts[:-1]) if self.meta[kk]['kind'] == 'wall']
                    z0 = min([b for b in bases if z_hi - b <= STRIP_H + 1e-6] or [z_lo])
                    c.m(fs, self.walls[e], z0=z0)
                elif kd == 'stone':
                    c.m(fs, 'STONE', z0=0.0)
                elif kd == 'beam':
                    c.m(fs, 'WOOD', z0=z_lo)
                else:
                    c.m(fs, 'STONE_FLAT' if mt['name'] == 'foot_top' else 'WOOD_FLAT')


# ── small shared parts ──────────────────────────────────────────────────────

def slope_box(c, x0, x1, ya, yb, top, h, reg, ends=(False, True)):
    """Member along Y hanging under a sloping surface: its top follows top(y),
    h deep (rafters, brackets). ends = (cap at ya, cap at yb); the top and
    the hidden end stay open."""
    bm = c.bm
    v = {}
    for i, x in enumerate((x0, x1)):
        for j, y in enumerate((ya, yb)):
            v[i, j, 1] = bm.verts.new((x, y, top(y)))
            v[i, j, 0] = bm.verts.new((x, y, top(y) - h))
    quads = [[v[0, 0, 0], v[1, 0, 0], v[1, 1, 0], v[0, 1, 0]],
             [v[0, 0, 0], v[0, 1, 0], v[0, 1, 1], v[0, 0, 1]],
             [v[1, 0, 0], v[1, 0, 1], v[1, 1, 1], v[1, 1, 0]]]
    if ends[0]:
        quads.append([v[0, 0, 0], v[0, 0, 1], v[1, 0, 1], v[1, 0, 0]])
    if ends[1]:
        quads.append([v[0, 1, 0], v[1, 1, 0], v[1, 1, 1], v[0, 1, 1]])
    fs = [bm.faces.new(q) for q in quads]
    ym = (ya + yb) / 2
    orient(fs, Vector(((x0 + x1) / 2, ym, top(ym) - h / 2)))
    c.m(fs, reg); c.nb(fs)
    return fs


def stone(c, p, zb, r, rad, h, n=None):
    """One river stone weighing down the roof: low capped frustum, squashed
    a little, own grey (some mossy)."""
    n = n or (5 if c.lod == 0 else 4)
    st = K.lathe(c.bm, n, [(rad, zb), (rad * 0.62, zb + h)], phase=r.random() * 6.28, cx=p.x, cy=p.y,
                 cap_bottom=False, cap_top=True)
    for ring in st['rings']:
        k = r.uniform(0.68, 0.92)
        for v in ring:
            v.co.y = p.y + (v.co.y - p.y) * k
    fs = st['sides'] + [st['top']]
    c.m(fs, r.choice(STONES)); c.nb(fs)


def stone_row(c, f, u0, u1, d, zfn, r, lod_step=1.0, n=None):
    """Stones along a batten (u from u0 to u1, at d in frame f), base on zfn(d)."""
    u = u0 + r.uniform(0.0, 0.2)
    while u < u1:
        rad = r.uniform(0.15, 0.24)
        dd = d + r.uniform(-0.06, 0.06)
        stone(c, f(u + rad, 0, dd), zfn(dd) - 0.04, r, rad, r.uniform(0.12, 0.2), n)
        u += 2 * rad + r.uniform(0.02, 0.22) + (0.0 if c.lod == 0 else lod_step)


def downpipe(c, f, u, z0, z1, d=0.1):
    """Bamboo downpipe with straw bindings."""
    if c.lod:
        return
    c.tube([f(u, z0, d), f(u, z1, d)], 0.045, 6, 'BAMBOO')
    for z in (z0 + 0.5, (z0 + z1) / 2, z1 - 0.3):
        c.box(f, u - 0.06, u + 0.06, z, z + 0.05, 0.0, d + 0.05, 'BAMBOO_DARK')


# ── roofs ───────────────────────────────────────────────────────────────────

def gable(c, W, yf, yb, z_top, slope, reg, timber=True):
    """Gable walls above the upper sweep (ridge along X, centred between
    yf and yb, the outer wall lines), with king post and purlin ends."""
    bm, lod = c.bm, c.lod
    yc, hw = (yf + yb) / 2, (yb - yf) / 2
    zu = lambda y: z_top + (hw - abs(y - yc)) * slope
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.01)
        ya, yb_ = yf + 0.06, yb - 0.06
        pts = [(ya, z_top), (ya, zu(ya)), (yc, zu(yc)), (yb_, zu(yb_)), (yb_, z_top)]
        gf = bm.faces.new([bm.verts.new((x, y, z)) for y, z in pts])
        gf.normal_update()
        if gf.normal.x * sx < 0:
            gf.normal_flip()
        c.m([gf], flat(reg) if zu(yc) - z_top > STRIP_H else reg, z0=z_top)
        if not timber or lod:
            continue
        fr = F(Vector((0, 0, 0)), (sx, 0))   # u = sx * y, d = sx * x
        c.box(fr, sx * yc - 0.07, sx * yc + 0.07, z_top, zu(yc), W / 2 - 0.01, W / 2 + 0.02, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
        zb = z_top + (zu(yc) - z_top) * 0.45
        ua, ub = sorted((sx * ya, sx * yb_))
        c.box(fr, ua, ub, zb, zb + 0.12, W / 2 - 0.01, W / 2 + 0.015, 'WOOD', skip=('in',))


def purlin_ends(c, W, x_out, ys, ztop):
    """Purlin ends (moya-hana) running out through the gables under the roof."""
    if c.lod:
        return
    for sx in (-1, 1):
        fr = F(Vector((0, 0, 0)), (sx, 0))
        for y in ys:
            z = ztop(y)
            b = c.box(fr, sx * y - 0.07, sx * y + 0.07, z - 0.17, z, W / 2 - 0.02, x_out, 'WOOD', skip=('in', 'top'))
            c.m([b['out']], 'END_GRAIN')


def board_roof(c, W, yf, yb, z_top, slope=0.3, eave_f=1.1, eave_b=0.9, oh=0.7, rows=(3, 1), seed=0,
               brackets=(), gutter=False):
    """Low board-shingle roof (itabuki), ridge along X: shingle courses,
    thin eave edge, soffit boards, rafters, barge boards, ridge cover, battens
    with rows of stones (rows = (front, back)). brackets: x of the eave
    brackets (udegi) carrying a front purlin (dashi-geta).
    yf/yb: outer wall lines (front < 0 < back). Returns roof info."""
    bm, lod = c.bm, c.lod
    r = random.Random(seed)
    yc, hw = (yf + yb) / 2, (yb - yf) / 2
    th = 0.09
    zr = z_top + th + hw * slope
    Ef, Eb = yf - eave_f, yb + eave_b
    zs = lambda y: zr - abs(y - yc) * slope
    under = lambda y: zs(y) - th
    lh = W / 2 + oh

    def half(E):
        n = max(1, int(abs(yc - E) / 0.42)) if lod == 0 else 1
        pts = [(E, zs(E) - th), (E, zs(E))]
        for k in range(1, n):
            y = E + (yc - E) * k / n
            pts += [(y, zs(y) - 0.018), (y, zs(y))]
        return pts
    front, back = half(Ef), half(Eb)
    poly = front + [(yc, zr)] + list(reversed(back)) + [(yb, under(yb)), (yc, under(yc)), (yf, under(yf))]
    sides, c0, c1 = K.poly_prism_x(bm, poly, -lh, lh)
    for f in sides:
        f.normal_update()
        if f.normal.z > 0.7:
            c.m([f], 'SHINGLE' if lod == 0 else 'WOOD_GREY_FLAT')
        elif f.normal.z < -0.7:
            ys = [v.co.y for v in f.verts]
            inner = min(ys) >= yf - 1e-3 and max(ys) <= yb + 1e-3
            c.m([f], 'WOOD_FLAT' if inner else 'WOOD_BOARD')
        else:
            c.m([f], 'SHINGLE_EDGE')
    c.nb(sides)
    c.m([c0, c1], 'SHINGLE_EDGE')
    # barge boards (hafu-ita) along both gable edges
    top = [(Ef, zs(Ef) + 0.03), (yc, zr + 0.03), (Eb, zs(Eb) + 0.03)]
    bot = [(Eb, zs(Eb) - 0.2), (yc, zr - 0.2), (Ef, zs(Ef) - 0.2)]
    for sx in (-1, 1):
        a, b = sorted((sx * lh, sx * (lh + 0.045)))
        s2, e0, e1 = K.poly_prism_x(bm, top + bot, a, b)
        c.m(s2 + [e0, e1], 'WOOD_FLAT')
    # ridge cover boards and a ridge log
    rp = [(yc - 0.32, zs(yc - 0.32) - 0.02), (yc - 0.32, zs(yc - 0.32) + 0.04), (yc, zr + 0.13),
          (yc + 0.32, zs(yc + 0.32) + 0.04), (yc + 0.32, zs(yc + 0.32) - 0.02)]
    s3, r0, r1 = K.poly_prism_x(bm, rp, -lh - 0.05, lh + 0.05)
    c.m(s3 + [r0, r1], 'WOOD_GREY_FLAT')
    if lod == 0:
        c.tube([(-lh - 0.1, yc, zr + 0.17), (lh + 0.1, yc, zr + 0.17)], 0.07, 6, 'WOOD_FLAT', caps=True)
    # battens and stones
    fr = F(Vector((0, 0, 0)), (0, -1))   # u = x, d = -y
    for side, E, nrow in ((-1, Ef, rows[0]), (1, Eb, rows[1])):
        n = nrow if lod == 0 else (nrow + 1) // 2
        for k in range(n):
            y = E + (yc - E) * (0.14 + 0.72 * (k + 0.5) / max(n, 1))
            z = zs(y)
            d0, d1 = sorted((-y - 0.035, -y + 0.035))
            c.box(fr, -lh + 0.2, lh - 0.2, z - 0.03, z + 0.05, d0, d1, 'WOOD_GREY_FLAT', skip=('bot',))
            ys_ = y - side * 0.22
            stone_row(c, fr, -lh + 0.3, lh - 0.5, -ys_, lambda d: zs(-d), r, n=4 if side > 0 else None)   # back: simpler stones
    # rafters, brackets, front purlin
    if lod == 0:
        nr = int(2 * (lh - 0.1) / 0.5)
        for side, E, wl in ((-1, Ef, yf), (1, Eb, yb)):
            for k in range(nr + 1):
                x = -lh + 0.1 + 2 * (lh - 0.1) * k / nr
                ya, yb2 = sorted((wl, E - side * 0.06))
                slope_box(c, x - 0.04, x + 0.04, ya, yb2, under, 0.08, 'WOOD_FLAT', ends=(side < 0, side > 0))
        if brackets:
            y_out = Ef + 0.35
            ztop = under(y_out) - 0.08
            for x in brackets:
                slope_box(c, x - 0.065, x + 0.065, y_out - 0.08, yf, lambda y: under(y) - 0.08, 0.2, 'WOOD', ends=(True, False))
            c.box(fr, -lh + 0.15, lh - 0.15, ztop - 0.17, ztop, -y_out - 0.08, -y_out + 0.08, 'WOOD', skip=())
    purlin_ends(c, W, lh - 0.06, (yc, yc - hw * 0.5, yc + hw * 0.5), under)
    if gutter and lod == 0:   # bamboo gutter on iron hooks along the front eave
        zg = zs(Ef) - th - 0.07
        c.tube([(-lh + 0.1, Ef + 0.05, zg), (lh - 0.1, Ef + 0.05, zg)], 0.06, 6, 'BAMBOO', caps=True)
        for x in [-lh + 0.4 + i * 1.8 for i in range(int((2 * lh - 0.8) / 1.8) + 1)]:
            c.box(fr, x - 0.015, x + 0.015, zg - 0.07, zs(Ef) - th, -Ef - 0.12, -Ef + 0.02, 'IRON')
    return dict(eave_y=-Ef, z=zs(Ef) - th, ridge=zr + 0.24, x=lh, yc=yc, under=under)


def tile_roof(c, W, yf, yb, z_top, wall_out, slope=0.45, eave=1.0, oh=0.6, gutter=False):
    """Light machiya tile roof of the Koedo kit, centred between yf and yb."""
    before = set(c.bm.verts)
    D_ = (yb - yf) - 2 * wall_out
    roof = KK.gable_roof(c, W, D_, z_top, wall_out, eave_out=eave, oh=oh, slope=slope, fascia=0.2, heavy=False,
                         ridge_h=0.45, oni=0.8, rafters=True, fascia_reg='WOOD')
    yc = (yf + yb) / 2
    bmesh.ops.translate(c.bm, verts=[v for v in c.bm.verts if v not in before], vec=(0, yc, 0))
    hw = (yb - yf) / 2
    under = lambda y: z_top + (hw - abs(y - yc)) * slope
    purlin_ends(c, W, roof['x'] - 0.08, (yc - hw * 0.5, yc + hw * 0.5), lambda y: under(y) - 0.05)
    if gutter and c.lod == 0:
        zg = roof['z'] - 0.06
        y = -(roof['eave_y'] - yc) - 0.05
        c.tube([(-roof['x'] + 0.1, y, zg), (roof['x'] - 0.1, y, zg)], 0.06, 6, 'BAMBOO', caps=True)
    roof.update(eave_y=roof['eave_y'] - yc, yc=yc, under=under)
    return roof


def sode_udatsu(c, f, u, sg, z0, z1, depth):
    """Fire wing wall (sode-udatsu) at one end of the projecting upper floor:
    white plaster between dark posts, little tiled roof on top."""
    lod = c.lod
    ua, ub = sorted((u, u + sg * 0.18))
    b = c.box(f, ua, ub, z0, z1, 0.0, depth, None, skip=('in',), bevel=True)
    c.m([b['l'], b['r']], 'PLASTER_WHITE_FLAT'); c.m([b['out'], b['top'], b['bot']], 'WOOD_FLAT')
    if lod == 0:   # front post and sill beam of the wing wall
        c.box(f, ua - 0.03, ub + 0.03, z0, z1, depth - 0.1, depth + 0.02, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
        c.box(f, ua - 0.03, ub + 0.03, z0, z0 + 0.14, 0.0, depth - 0.1, 'WOOD', skip=('in', 'top'))
        c.box(f, ua - 0.03, ub + 0.03, z1 - 0.12, z1, 0.0, depth - 0.1, 'WOOD', skip=('in', 'top'))
    c.box(f, ua - 0.1, ub + 0.1, z1, z1 + 0.07, 0.0, depth + 0.16, 'TILE_DARK', skip=('in',))
    fs = tile_row(c.bm, f((ua + ub) / 2, z1 + 0.07, depth + 0.16), f((ua + ub) / 2, z1 + 0.07, 0.0), 0.085,
                  4 if lod == 0 else 2, f.t)
    c.m(fs, 'TILE_A'); c.nb(fs)


def board_hisashi(c, f, u0, u1, z_e, depth, slope=0.3, stones=True, brackets=None, seed=0):
    """Shingled pent roof over a ground floor: courses, eave edge, soffit
    boards, flashing at the wall, brackets (udegi) with a front purlin, and a
    batten with stones. Returns the roof surface height at d."""
    lod = c.lod
    th = 0.06
    zt = z_e + th + depth * slope
    n = max(2, int(depth / 0.32)) if lod == 0 else 1
    poly = [(depth, z_e), (depth, z_e + th)]
    for k in range(1, n):
        d = depth - depth * k / n
        z = z_e + th + (depth - d) * slope
        poly += [(d, z - 0.015), (d, z)]
    poly += [(0.0, zt), (0.0, zt - th)]
    sides, caps = prism_u(c, f, poly, u0, u1)
    for s in sides:
        s.normal_update()
        c.m([s], ('SHINGLE' if lod == 0 else 'WOOD_GREY_FLAT') if s.normal.z > 0.7 else
             'WOOD_BOARD' if s.normal.z < -0.7 else 'SHINGLE_EDGE')
    c.m(caps, 'SHINGLE_EDGE')
    c.box(f, u0, u1, zt - 0.05, zt + 0.1, 0.0, 0.1, 'WOOD_GREY_FLAT', skip=('in',))
    surf = lambda d: z_e + th + (depth - d) * slope
    for u in brackets or []:
        b = c.box(f, u - 0.06, u + 0.06, 0.0, 1.0, 0.0, depth - 0.1, None, skip=('in', 'top'))
        for v in {v for x in b.values() for v in x.verts}:
            t = (v.co - f(u, 0, 0)).dot(f.n)
            v.co.z = surf(t) - th - 0.17 * (1 - v.co.z)
        c.m(b.values(), 'WOOD')
        c.m([b['out']], 'END_GRAIN')
    if brackets:
        zk = surf(depth - 0.12) - th
        c.box(f, u0 + 0.05, u1 - 0.05, zk - 0.14, zk, depth - 0.3, depth - 0.14, 'WOOD', skip=('in',))
    if stones:
        r = random.Random(seed)
        db = depth * 0.55
        c.box(f, u0 + 0.12, u1 - 0.12, surf(db) - 0.03, surf(db) + 0.045, db - 0.03, db + 0.03, 'WOOD_GREY_FLAT', skip=('bot',))
        stone_row(c, f, u0 + 0.2, u1 - 0.45, db - 0.15, surf, r, lod_step=0.8)
    return surf


# ── openings (house mesh) ───────────────────────────────────────────────────

def _shoji(c, fl, lit, pitch=0.9):
    f = F.of(fl)
    n = max(1, round(f.w / pitch))
    us = [f.u0 + f.w * i / n for i in range(n + 1)]
    f, g = grid_on(c, fl, us, [f.z0, f.z1])
    if lit is True:
        lit = range(n)
    for i in range(n):
        c.m([g[i, 0]], 'SHOJI' if i in (lit or ()) else 'SHOJI_DARK')
    return f, us


def dejoshi(c, face, sh, opt):
    """Projecting lattice (dejōshi): close square bars standing proud on a
    board base, top rail, end posts and side bars; shoji behind."""
    f0 = F.of(face)
    fl = hole(c, face, 0.06, 'WOOD_FLAT')
    lit = opt.get('lit', True)
    _shoji(c, fl, (0, 2, 3) if lit is True else lit)
    P = opt.get('proud', 0.32)
    zb, zt = f0.z0 + 0.42, f0.z1 - 0.1
    base = c.box(f0, f0.u0, f0.u1, f0.z0, zb, 0.0, P, None, skip=('in', 'bot'), bevel=True)
    c.m([base['out']], 'WOOD_TATE', z0=f0.z0); c.m([base[k] for k in ('top', 'l', 'r')], 'WOOD_FLAT')
    c.box(f0, f0.u0, f0.u1, zt, f0.z1, 0.0, P, 'WOOD', skip=('in',), bevel=True)
    for u in (f0.u0, f0.u1 - 0.07):
        c.box(f0, u, u + 0.07, zb, zt, 0.0, P, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
    if c.lod:
        q = c.box(f0, f0.u0 + 0.07, f0.u1 - 0.07, zb, zt, P - 0.03, P - 0.02, None, skip=('in', 'top', 'bot', 'l', 'r'))
        c.m([q['out']], 'KOSHI_LIT' if lit else 'KOSHI_DARK')
        return dict(kind='koshi', f=f0, depth=P)
    k = int((f0.w - 0.14) / opt.get('step', 0.085))
    for i in range(1, k):
        u = f0.u0 + 0.07 + (f0.w - 0.14) * i / k
        c.box(f0, u - 0.015, u + 0.015, zb, zt, P - 0.05, P - 0.015, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
    for u, sg in ((f0.u0 + 0.035, -1), (f0.u1 - 0.035, 1)):
        for j in range(1, 4):
            d = P * j / 4
            p = f0(u, 0, d)
            c.box(F(p, f0.t * sg), -0.015, 0.015, zb, zt, -0.015, 0.015, 'WOOD', skip=('top', 'bot'), rotate=True)
    return dict(kind='koshi', f=f0, depth=P)


def koshi_u(c, face, sh, opt):
    """Upper-floor lattice window: fine bars flush in the opening, shoji
    behind (`lit` = indices of lit panels), sill and head."""
    f0 = F.of(face)
    fl = hole(c, face, 0.12, 'WOOD_FLAT')
    _shoji(c, fl, opt.get('lit', ()))
    c.box(f0, f0.u0 - 0.06, f0.u1 + 0.06, f0.z0 - 0.07, f0.z0, 0.0, 0.07, 'WOOD', skip=('in',))
    if c.lod:
        return dict(kind='window', f=f0)
    k = int(f0.w / 0.09)
    for i in range(1, k):
        u = f0.u0 + f0.w * i / k
        c.box(f0, u - 0.013, u + 0.013, f0.z0, f0.z1, -0.06, -0.03, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
    for zz in (f0.z0, f0.z1 - 0.05):
        c.box(f0, f0.u0, f0.u1, zz, zz + 0.05, -0.07, -0.02, 'WOOD', skip=('in', 'l', 'r'))
    return dict(kind='window', f=f0)


def agedo(c, face, sh, opt):
    """Open shop with lift-up shutters (age-do) hooked up under the eave and
    a fold-down bench (battari shōgi) along the front."""
    slot = KK.shop_open(c, face, sh, dict(opt, doors=False))
    f0 = slot['f']
    n = max(1, round(f0.w / 1.9))
    bw = f0.w / n
    zh = f0.z1 + 0.02
    L = opt.get('flap', 0.85)
    for i in range(n):
        ua, ub = f0.u0 + i * bw + 0.12, f0.u0 + (i + 1) * bw - 0.12
        b = c.box(f0, ua, ub, 0.0, 1.0, 0.03, L, None, skip=('in',))
        for v in {v for x in b.values() for v in x.verts}:
            t = (v.co - f0(ua, 0, 0)).dot(f0.n)
            v.co.z = zh + t * 0.14 + 0.05 * v.co.z
        c.m([b['bot']], 'WOOD_BOARD'); c.m([b[k] for k in ('top', 'out', 'l', 'r')], 'WOOD_FLAT')
        if c.lod == 0:
            for uu in (ua + 0.1, ub - 0.1):   # hook rods up to the wall
                c.tube([f0(uu, zh + (L - 0.08) * 0.14 + 0.05, L - 0.08), f0(uu, zh + 0.5, 0.02)], 0.01, 3, 'IRON')
    if c.lod == 0 and opt.get('battari', True):
        for i in range(n):
            ua, ub = f0.u0 + i * bw + 0.2, f0.u0 + (i + 1) * bw - 0.2
            c.box(f0, ua, ub, 0.44, 0.5, 0.05, 0.62, 'WOOD_LIGHT', skip=(), bevel=True)
            for uu in (ua + 0.1, ub - 0.1):
                c.box(f0, uu - 0.025, uu + 0.025, 0.0, 0.44, 0.52, 0.57, 'WOOD', skip=('top', 'bot'), rotate=True)
    return slot


MODULES = {'shop': KK.shop_open, 'closed': KK.shop_closed, 'koshi': KK.koshi, 'rail': KK.shoji_rail,
           'dejoshi': dejoshi, 'koshi_u': koshi_u, 'agedo': agedo}


# ── projecting upper floor ──────────────────────────────────────────────────

def projection(c, W, D, P, G, us):
    """Soffit under the projecting floor and the cantilevered beam ends
    (dashi-bari) with iron straps and wooden pegs."""
    bm = c.bm
    y0, y1 = -D / 2 - P - 0.05, -D / 2
    vs = [bm.verts.new(p) for p in ((-W / 2 - 0.05, y0, G), (W / 2 + 0.05, y0, G), (W / 2 + 0.05, y1, G),
                                    (-W / 2 - 0.05, y1, G))]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.z > 0:
        f.normal_flip()
    c.m([f], 'WOOD_BOARD'); c.nb([f])
    fr = F(Vector((0, -D / 2, 0)), (0, -1))
    for x in us:
        b = c.box(fr, x - 0.08, x + 0.08, G - 0.24, G, -0.02, P + 0.22, 'WOOD', skip=('in', 'top'))
        c.m([b['out']], 'END_GRAIN')
        if c.lod == 0:
            c.box(fr, x - 0.095, x + 0.095, G - 0.19, G - 0.13, P - 0.03, P + 0.03, 'IRON', skip=('in', 'top'))
            c.box(fr, x - 0.022, x + 0.022, G - 0.13, G - 0.085, P + 0.22, P + 0.24, 'WOOD_LIGHT_FLAT', skip=('in',))


def frame_timber(c, sw, e, us, z0, z1, nuki=()):
    """Exposed timber frame on a wall (posts proud of the wall, nuki beams)."""
    if c.lod:
        return
    f = sw.frame(e)
    for z in nuki:
        c.box(f, 0.0, sw.len[e], z, z + 0.12, 0.0, 0.02, 'WOOD', skip=('in',))
    for u in us:
        c.box(f, u - 0.065, u + 0.065, z0, z1, 0.0, 0.03, 'WOOD', skip=('in', 'bot'), rotate=True)


# ── plinth on the slope ─────────────────────────────────────────────────────

def plinth(c, W, D, H, front=1.3, side=0.25, back=0.25, stair_x=None, stair_w=1.0, batter=0.1):
    """High ishigaki plinth: battered dry-stone front, coping stones, a
    paved terrace before the house, stone stairs along the front (rising
    towards +x from stair_x). The house stands on top (z = H)."""
    bm, lod = c.bm, c.lod
    x0, x1 = -W / 2 - side, W / 2 + side
    yf, yb = -D / 2 - front, D / 2 + back
    bt = batter * H
    # walls: front (battered), sides, back as one loop of quads
    lo = [(x0, yf), (x1, yf), (x1, yb), (x0, yb)]
    hi = [(x0, yf + bt), (x1, yf + bt), (x1, yb), (x0, yb)]
    vl = [bm.verts.new((x, y, 0.0)) for x, y in lo]
    vh = [bm.verts.new((x, y, H)) for x, y in hi]
    walls = [bm.faces.new([vl[i], vl[(i + 1) % 4], vh[(i + 1) % 4], vh[i]]) for i in range(4)]
    orient(walls, Vector((0, (yf + yb) / 2, H / 2)))
    c.m(walls, 'ISHIGAKI', z0=0.0)
    # terrace (front strip) and side strips on top
    ter = [bm.faces.new([bm.verts.new(p) for p in ((x0, yf + bt, H), (x1, yf + bt, H), (x1, -D / 2, H), (x0, -D / 2, H))])]
    for xa, xb in ((x0, -W / 2), (W / 2, x1)):
        ter.append(bm.faces.new([bm.verts.new(p) for p in ((xa, -D / 2, H), (xb, -D / 2, H), (xb, yb, H), (xa, yb, H))]))
    for f in ter:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    c.m(ter[:1], 'PAVING'); c.m(ter[1:], 'EARTH')
    fr = F(Vector((0, yf + bt, 0)), (0, -1))   # u = x, d out of the front
    if lod == 0:   # coping stones along the front edge
        x = x0
        r = random.Random(3)
        while x < x1 - 0.1:
            w = min(r.uniform(0.5, 0.8), x1 - x)
            c.box(fr, x + 0.01, x + w - 0.01, H - 0.02, H + 0.12, -0.32, 0.04, 'STONE', skip=('in', 'bot'))
            x += w
    if stair_x is not None:   # stairs along the front, climbing towards +x
        n = max(2, math.ceil(H / 0.18))
        rise, run = H / n, 0.32
        frs = F(Vector((0, yf, 0)), (0, -1))
        for k in range(n):
            xa = stair_x + k * run
            c.box(frs, xa, xa + run + 0.02, 0.0, rise * (k + 1), -0.02, stair_w, 'STONE_FLAT',
                  skip=('in', 'bot', 'r') if k < n - 1 else ('in', 'bot'))
        # cheek wall on the street side of the stairs
        xe = stair_x + n * run
        b = c.box(frs, stair_x - 0.3, xe, 0.0, 1.0, stair_w, stair_w + 0.3, None, skip=('in', 'bot'))
        for v in {v for x in b.values() for v in x.verts}:
            t = (v.co.x - (stair_x - 0.3)) / (xe - stair_x + 0.3)
            v.co.z = v.co.z * (0.5 + t * (H - 0.3))
        c.m([b['out'], b['l'], b['r']], 'ISHIGAKI', z0=0.0); c.m([b['top']], 'STONE_FLAT')
    return dict(H=H, front=front + (stair_w + 0.3 if stair_x is not None else 0.0))


# ── street, water (props of the post town) ──────────────────────────────────

def street(c, L=8.0, width=6.4, ch_w=0.45, ch_d=0.38, bridges=(), seed=1):
    """Flat street segment along X: packed earth road, a stone-edged water
    channel along the +Y side (in front of the houses) with slab bridges at
    `bridges` (x), a paved strip along the -Y side. Skirts down to -0.4."""
    bm, lod = c.bm, c.lod
    r = random.Random(seed)
    W2 = width / 2
    y_ch1 = W2 - 0.18                 # house-side curb
    y_ch0 = y_ch1 - ch_w              # road-side curb inner face
    y_rd = y_ch0 - 0.22               # road ends at the road-side curb
    y_pv = -W2 + 0.7                  # paved strip on the other side

    def quad(pts, reg, up=True):
        f = bm.faces.new([bm.verts.new(p) for p in pts])
        f.normal_update()
        if (f.normal.z > 0) != up:
            f.normal_flip()
        c.m([f], reg)
        return f
    xa, xb = -L / 2, L / 2
    yb = y_pv
    while yb < y_rd - 1e-3:           # road in bands of <= 2 m (strip height)
        ye = min(y_rd, yb + 1.9)
        quad([(xa, yb, 0.0), (xb, yb, 0.0), (xb, ye, 0.0), (xa, ye, 0.0)], 'ROAD')
        yb = ye
    quad([(xa, -W2, 0.0), (xb, -W2, 0.0), (xb, y_pv, 0.0), (xa, y_pv, 0.0)], 'PAVING')
    # curbs: granite blocks with joints, road side and house side
    fr = F(Vector((0, 0, 0)), (0, -1))   # u = x, d = -y
    for y0, y1, ztop in ((y_rd, y_ch0, 0.05), (y_ch1, W2, 0.03)):
        x = xa
        while x < xb - 1e-3:
            w = min(r.uniform(0.55, 0.75), xb - x)
            if w < 0.2:
                break
            c.box(fr, x + 0.006, x + w - 0.006, -ch_d, ztop, -y1, -y0, 'STONE', skip=('bot',), metric_z0=-ch_d)
            x += w
    quad([(xa, y_ch0, -ch_d), (xb, y_ch0, -ch_d), (xb, y_ch1, -ch_d), (xa, y_ch1, -ch_d)], 'CHANNEL')
    quad([(xa, y_ch0, -ch_d + 0.13), (xb, y_ch0, -ch_d + 0.13), (xb, y_ch1, -ch_d + 0.13), (xa, y_ch1, -ch_d + 0.13)], 'WATER')
    for x in bridges:   # stone slab across the channel
        c.box(fr, x - 0.45, x + 0.45, 0.0, 0.1, -(y_ch1 + 0.12), -(y_ch0 - 0.12), 'STONE_FLAT', skip=('bot',), bevel=True)
    # skirts so a segment end never shows a gap above the terrain
    for y, sg in ((-W2, -1),):
        quad([(xa, y, 0.0), (xb, y, 0.0), (xb, y, -0.4), (xa, y, -0.4)], 'EARTH')
    return dict(y_channel=(y_ch0, y_ch1))


def street_steps(c, L=8.0, width=5.4, rise=1.44, n=8, seed=2):
    """Stepped stone slope (ishidatami-zaka) along X: paved treads, stone
    risers with joints, a stone gutter along +Y, ishigaki skirts at the sides."""
    bm, lod = c.bm, c.lod
    r = random.Random(seed)
    W2 = width / 2
    run = L / n
    fr = F(Vector((0, 0, 0)), (0, -1))
    for k in range(n):
        x0, x1, z = -L / 2 + k * run, -L / 2 + (k + 1) * run, rise * k / n
        f = bm.faces.new([bm.verts.new(p) for p in ((x0, -W2, z), (x1, -W2, z), (x1, W2 - 0.4, z), (x0, W2 - 0.4, z))])
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
        c.m([f], 'PAVING')
        g = bm.faces.new([bm.verts.new(p) for p in ((x0, W2 - 0.4, z - 0.12), (x1, W2 - 0.4, z - 0.12), (x1, W2 - 0.1, z - 0.12),
                                                      (x0, W2 - 0.1, z - 0.12))])
        g.normal_update()
        if g.normal.z < 0:
            g.normal_flip()
        c.m([g], 'CHANNEL')
        if k:   # riser: a row of stones in front of this tread
            y = -W2
            while y < W2 - 0.1:
                w = min(r.uniform(0.5, 0.8), W2 - 0.1 - y)
                c.box(F(Vector((x0, 0, 0)), (-1, 0)), -(y + w) + 0.005, -y - 0.005, z - rise / n - 0.02, z + 0.02, -0.04, 0.03,
                      'STONE', skip=('in', 'bot'))
                y += w
        for y0, y1 in ((W2 - 0.4, W2 - 0.33), (W2 - 0.17, W2 - 0.1)):   # gutter edges
            c.box(fr, x0, x1, z - 0.12, z + 0.02, -y1, -y0, 'STONE_FLAT', skip=('bot',))
        for y, sg in ((-W2, -1), (W2 - 0.1, 1)):   # side skirts
            s = bm.faces.new([bm.verts.new(p) for p in ((x0, y, -0.4), (x1, y, -0.4), (x1, y, z), (x0, y, z))])
            s.normal_update()
            if s.normal.y * sg < 0:
                s.normal_flip()
            c.m([s], 'ISHIGAKI', z0=-0.4)


def trough(c):
    """Water place (mizuba): hollowed log trough on stone blocks, fed by a
    bamboo spout from a cedar post, ladle on the rim, stone apron."""
    bm, lod = c.bm, c.lod
    fr = F(Vector((0, 0, 0)), (0, -1))
    c.box(fr, -1.25, 1.1, 0.0, 0.03, -0.75, 0.75, 'PAVING', skip=('bot',))
    for x in (-0.5, 0.5):
        c.box(fr, x - 0.18, x + 0.18, 0.03, 0.38, -0.25, 0.25, 'STONE', skip=('bot',), bevel=True)
    b = c.box(fr, -0.85, 0.85, 0.36, 0.78, -0.27, 0.27, 'WOOD', skip=('bot',), bevel=True)
    inner, walls = K.recess(bm, b['top'], 0.06, 0.09)
    c.m(walls, 'WOOD_FLAT'); c.m([inner], 'WATER'); c.nb(walls + [inner])
    c.box(fr, -1.05, -0.9, 0.03, 1.35, -0.08, 0.08, 'WOOD', skip=('bot',), rotate=True, bevel=True)
    c.tube([(-0.98, 0.0, 1.2), (-0.55, 0.0, 1.05)], 0.035, 6 if lod == 0 else 4, 'BAMBOO', caps=True)
    if lod == 0:
        c.tube([(-0.98, 0.09, 0.03), (-0.98, 0.09, 1.2)], 0.03, 6, 'BAMBOO')
        c.box(fr, -0.565, -0.535, 0.7, 1.04, -0.012, 0.012, 'WATER')   # the running water
        c.tube([(0.2, -0.28, 0.79), (0.6, 0.1, 0.79)], 0.012, 4, 'WOOD_LIGHT_FLAT')   # ladle
        cup = K.lathe(bm, 8, [(0.05, 0.76), (0.06, 0.84)], cx=0.62, cy=0.12, cap_bottom=True, cap_top=False)
        c.m(cup['sides'] + [cup['bottom']], 'WOOD_LIGHT_FLAT'); c.nb(cup['sides'])


def waterwheel(c, R=1.25, width=0.45, n=12):
    """Small waterwheel (mizu-guruma) fed from above by a wooden flume on
    posts, turning in a stone basin. One mesh (the wheel does not spin)."""
    bm, lod = c.bm, c.lod
    zc = R + 0.25
    segs = 16 if lod == 0 else 10
    for y in (-width / 2, width / 2):   # rims
        pts = [(R * math.cos(2 * math.pi * k / segs), y, zc + R * math.sin(2 * math.pi * k / segs)) for k in range(segs + 1)]
        c.tube(pts, 0.05, 4, 'WOOD_FLAT')
        for k in range(n // 2 if lod == 0 else 4):   # spokes
            a = 2 * math.pi * k / (n // 2 if lod == 0 else 4)
            c.tube([(0.1 * math.cos(a), y, zc + 0.1 * math.sin(a)), (R * math.cos(a), y, zc + R * math.sin(a))], 0.035, 4, 'WOOD_FLAT')
    for k in range(n):   # paddles between the rims
        a = 2 * math.pi * (k + 0.5) / n
        bx = K.box(bm, R - 0.3, R + 0.06, -width / 2, width / 2, -0.02, 0.02)
        fs = [f for f in (bx.values() if isinstance(bx, dict) else bx) if f is not None]
        vs = list({v for f in fs for v in f.verts})
        bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(-a, 3, 'Y'))
        bmesh.ops.translate(bm, verts=vs, vec=(0, 0, zc))
        c.m(fs, 'WOOD'); c.nb(fs)
    c.tube([(0, -width / 2 - 0.45, zc), (0, width / 2 + 0.45, zc)], 0.08, 8 if lod == 0 else 6, 'WOOD_FLAT', caps=True)
    fr = F(Vector((0, 0, 0)), (0, -1))
    for y in (-width / 2 - 0.32, width / 2 + 0.32):   # posts carrying the axle
        c.box(fr, -0.1, 0.1, 0.0, zc + 0.12, -y - 0.08, -y + 0.08, 'WOOD', skip=('bot',), rotate=True, bevel=True)
        c.box(fr, -0.3, 0.3, 0.0, 0.25, -y - 0.15, -y + 0.15, 'STONE', skip=('bot',))
    # stone basin round the lower part of the wheel
    for x0, x1, y0, y1 in ((-R - 0.4, R + 0.4, -width / 2 - 0.25, -width / 2 - 0.12), (-R - 0.4, R + 0.4, width / 2 + 0.12, width / 2 + 0.25),
                           (-R - 0.4, -R - 0.27, -width / 2 - 0.12, width / 2 + 0.12), (R + 0.27, R + 0.4, -width / 2 - 0.12, width / 2 + 0.12)):
        c.box(fr, x0, x1, 0.0, 0.32, -y1, -y0, 'STONE', skip=('bot',))
    w = bm.faces.new([bm.verts.new(p) for p in ((-R - 0.27, -width / 2 - 0.12, 0.2), (R + 0.27, -width / 2 - 0.12, 0.2),
                                                  (R + 0.27, width / 2 + 0.12, 0.2), (-R - 0.27, width / 2 + 0.12, 0.2))])
    w.normal_update()
    if w.normal.z < 0:
        w.normal_flip()
    c.m([w], 'WATER')
    # flume (kakehi) from behind, pouring onto the top of the wheel
    zf = zc + R + 0.2
    poly = [(-0.16, zf), (0.16, zf), (0.16, zf + 0.2), (0.12, zf + 0.2), (0.12, zf + 0.05), (-0.12, zf + 0.05), (-0.12, zf + 0.2), (-0.16, zf + 0.2)]
    sides, f0, f1 = K.poly_prism_x(bm, poly, -0.2, 3.2)
    c.m(sides + [f0, f1], 'WOOD_FLAT')
    wf = bm.faces.new([bm.verts.new(p) for p in ((-0.2, -0.12, zf + 0.13), (3.2, -0.12, zf + 0.13), (3.2, 0.12, zf + 0.13), (-0.2, 0.12, zf + 0.13))])
    wf.normal_update()
    if wf.normal.z < 0:
        wf.normal_flip()
    c.m([wf], 'WATER')
    for x in (1.4, 2.9):
        for y in (-0.2, 0.2):
            c.box(fr, x - 0.06, x + 0.06, 0.0, zf, -y - 0.06, -y + 0.06, 'WOOD', skip=('bot',), rotate=True)
        c.box(fr, x - 0.07, x + 0.07, zf - 0.12, zf, -0.28, 0.28, 'WOOD')


# ── shop dressing (mesh with atlas KisoShop) ────────────────────────────────

def kake_andon(c, f, u, z, img, d=0.42):
    """Square wall lantern with the inn's name on a bracket arm."""
    c.box(f, u - 0.03, u + 0.03, z + 0.6, z + 0.66, 0.0, d + 0.04, 'WOOD_DARK')
    c.box(f, u - 0.08, u + 0.08, z + 0.3, z + 0.7, 0.0, 0.04, 'WOOD_DARK')
    b = c.box(f, u - 0.19, u + 0.19, z, z + 0.48, d - 0.16, d + 0.16, None, skip=('top',))
    for k in ('out', 'in', 'l', 'r'):
        c.m([b[k]], img)
    c.m([b['bot']], 'WOOD_DARK')
    c.box(f, u - 0.25, u + 0.25, z + 0.48, z + 0.54, d - 0.22, d + 0.22, 'BLACK', bevel=True)
    if c.lod == 0:
        c.tube([f(u, z + 0.54, d), f(u, z + 0.62, d)], 0.012, 3, 'IRON')


def hang_board(c, f, uc, w, h, z, d, img, rod_top):
    """Signboard hung on iron rods under the projection or eave."""
    KK.board(c, f, uc, w, h, z, d, img, cap=True)
    if c.lod == 0:
        for u in (uc - w / 2 + 0.15, uc + w / 2 - 0.15):
            c.tube([f(u, z + h + 0.12, d - 0.05), f(u, rod_top, d - 0.05)], 0.012, 3, 'IRON')


def firewood(c, f, u0, u1, d, h=1.25, depth=0.45, seed=0):
    """Stacked firewood (maki) against a wall: log ends out front, bark on
    top, end stakes and a little board roof weighted with two stones."""
    r = random.Random(seed)
    b = c.box(f, u0, u1, 0.0, h, d - depth, d, None, skip=('bot', 'in'))
    c.m([b['out']], 'LOGS'); c.m([b['l'], b['r'], b['top']], 'BARK')
    if c.lod:
        return
    h2 = h * r.uniform(0.45, 0.7)   # a lower second stack in front
    b2 = c.box(f, u0 + 0.15, u0 + (u1 - u0) * 0.55, 0.0, h2, d, d + 0.3, None, skip=('bot', 'in'))
    c.m([b2['out']], 'LOGS'); c.m([b2['l'], b2['r'], b2['top']], 'BARK')
    for u in (u0 - 0.04, u1 + 0.04):
        c.box(f, u - 0.03, u + 0.03, 0.0, h + 0.15, d - 0.05, d + 0.01, 'WOOD_DARK', skip=('bot',))
    c.box(f, u0 - 0.12, u1 + 0.12, h + 0.15, h + 0.19, d - depth - 0.05, d + 0.15, 'WOOD_DARK')
    for u in (u0 + 0.3, u1 - 0.35):
        p = f(u, 0, d - depth / 2)
        st = K.lathe(c.bm, 5, [(0.12, h + 0.19), (0.07, h + 0.3)], cx=p.x, cy=p.y, phase=r.random(), cap_bottom=False)
        c.m(st['sides'] + [st['top']], 'STONE'); c.nb(st['sides'])


def waraji(c, f, u0, u1, z, d, n=4):
    """Straw sandals tied in bunches, hanging from a bamboo pole."""
    c.tube([f(u0 - 0.1, z, d), f(u1 + 0.1, z, d)], 0.02, 4, 'BAMBOO')
    for i in range(n):
        uc = u0 + (u1 - u0) * (i + 0.5) / n
        b = c.box(f, uc - 0.14, uc + 0.14, z - 0.62, z - 0.02, d - 0.025, d + 0.025, None, skip=('top',))
        c.m([b['out'], b['in']], 'WARAJI'); c.m([b['l'], b['r'], b['bot']], 'STRAW')


def wares(c, f, u0, u1, d0, kind, seed=0, zb=0.0, h=0.8):
    """Stepped wooden stand with wares: lacquer bowls, bentwood boxes
    (magemono), baskets."""
    r = random.Random(seed)
    steps = 3 if c.lod == 0 else 1
    dep = 0.8
    for k in range(steps):
        z = zb + h * (k + 1) / steps
        da = d0 - dep * k / steps
        c.box(f, u0, u1, zb if k == 0 else zb + h * k / steps, z, da - dep / steps, da, 'WOOD_LIGHT', skip=('in',) if k else ())
        if c.lod:
            continue
        u = u0 + 0.08
        while u < u1 - 0.15:
            p = f(u + 0.08, 0, da - dep / steps / 2)
            if kind == 'bowls':
                reg = r.choice(('LACQUER_RED', 'LACQUER_RED', 'LACQUER_BLACK'))
                for j in range(r.randint(1, 3)):
                    zz = z + j * 0.045
                    bw = K.lathe(c.bm, 6, [(0.04, zz), (0.075, zz + 0.05)], cx=p.x, cy=p.y, cap_bottom=False, cap_top=True)
                    c.m(bw['sides'] + [bw['top']], reg); c.nb(bw['sides'])
                u += 0.18
            elif kind == 'magemono':
                rr = r.uniform(0.07, 0.11)
                bx = K.lathe(c.bm, 8, [(rr, z), (rr, z + r.uniform(0.06, 0.12))], cx=p.x, cy=p.y, cap_bottom=False, cap_top=True)
                c.m(bx['sides'] + [bx['top']], 'HINOKI'); c.nb(bx['sides'])
                u += 2 * rr + 0.05
            else:   # baskets
                rr = r.uniform(0.09, 0.13)
                bk = K.lathe(c.bm, 8, [(rr * 0.75, z), (rr, z + rr * 1.3)], cx=p.x, cy=p.y, cap_bottom=False, cap_top=True)
                K.map_cyl(c.bm, bk['sides'], c.R('KAGO'), cx=p.x, cy=p.y)
                c.m([bk['top']], 'STRAW_DARK'); c.nb(bk['sides'] + [bk['top']])
                u += 2 * rr + 0.06


def kago(c, f, u, d, r=0.22, h=0.4, z=0.0):
    """Big carrying basket standing on the ground."""
    p = f(u, 0, d)
    bk = K.lathe(c.bm, 8, [(r * 0.75, z), (r, z + h)], cx=p.x, cy=p.y, cap_bottom=False, cap_top=True)
    K.map_cyl(c.bm, bk['sides'], c.R('KAGO'), cx=p.x, cy=p.y)
    c.m([bk['top']], 'STRAW_DARK'); c.nb(bk['sides'] + [bk['top']])


def plain_bench(c, f, u, d, w=1.6):
    """Plain wooden bench (no felt) in front of an inn."""
    c.box(f, u - w / 2, u + w / 2, 0.42, 0.48, d - 0.18, d + 0.18, 'WOOD_LIGHT', bevel=True)
    for uu in (u - w / 2 + 0.12, u + w / 2 - 0.12):
        c.box(f, uu - 0.03, uu + 0.03, 0.0, 0.42, d - 0.14, d + 0.14, 'WOOD_DARK', skip=('bot', 'top'))
