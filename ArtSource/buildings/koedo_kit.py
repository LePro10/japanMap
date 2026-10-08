"""Koedo building kit (kura town, Kawagoe-like): kura, mise-gura, wooden
machiya, copper-fronted kanban houses and the low sweets shops of the lane.

Same machinery as the Tokyo kit: a wall profile swept once round the
footprint (K.sweep_loop), openings are cells of that sweep filled by
modules, everything else sits on wall frames F (u along the wall, z up,
d out of the wall). New here:
- heavy kura roof as a function (stacked ridge, onigawara, tile rows),
  also in a light machiya form (wooden fascia, rafters, small oni);
- hisashi: the pent roof over the shop front, with tile courses and rows,
  on wooden cantilever beams or plastered, optional fire wing walls;
- shop modules: open shop (posts, lintel, glass doors slid aside), closed
  shop (plaster fire doors or storm boards), lattice front (senbon-goshi),
  glass front; upper: kura window with thick doors (kannon-biraki),
  mushiko slats, shoji behind a wooden railing, wooden sash;
- shop dressing (atlas KoedoShop, own mesh): interior, roof signboard,
  hanging boards, noren, nobori, paper lanterns, sugidama, display stands,
  bench with parasol, fire buckets, bamboo blinds, pots.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A
from buildings.tokyo_kit import F, lbox

ZV = Vector((0, 0, 1))
STRIP_H = 2.0
FLAT = {'PLASTER_BLACK': 'PLASTER_BLACK_FLAT', 'PLASTER_WHITE': 'PLASTER_WHITE_FLAT',
        'WOOD_BOARD': 'WOOD_BOARD_FLAT', 'COPPER': 'COPPER_FLAT'}


class C:
    """Build context: one bmesh, its atlas and the LOD."""

    def __init__(self, atlas, lod):
        self.bm, self.atlas, self.lod = K.new_bm(), atlas, lod

    def R(self, name):
        return A.region(self.atlas, name)

    def m(self, faces, name, **kw):
        K.map_faces(self.bm, [f for f in faces if f is not None], self.R(name), **kw)

    def nb(self, faces):
        K.nobevel(self.bm, [f for f in faces if f is not None])

    def box(self, f, u0, u1, z0, z1, d0, d1, reg=None, skip=(), bevel=False, **kw):
        b = lbox(self.bm, f, u0, u1, z0, z1, d0, d1, skip=skip)
        if reg:
            self.m(b.values(), reg, **kw)
        if not bevel:
            self.nb(b.values())
        return b

    def tube(self, pts, r, n=4, reg='IRON', caps=False):
        s, c0, c1 = K.tube_path(self.bm, pts, r, n, cap0=caps, cap1=caps)
        fs = s + [c0, c1]
        self.m(fs, reg); self.nb(fs)
        return fs

    def span(self, faces, name, t, flip_u=False):
        K.map_span(self.bm, faces, self.R(name), t, flip_u=flip_u)


def flat(reg):
    return FLAT.get(reg, reg)


def orient(faces, centre):
    for f in faces:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - centre) < 0:
            f.normal_flip()


def prism_u(c, f, poly, u0, u1):
    """Closed (d, z) outline in frame f extruded along u; faces point outward."""
    bm = c.bm
    a = [bm.verts.new(f(u0, z, d)) for d, z in poly]
    b = [bm.verts.new(f(u1, z, d)) for d, z in poly]
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sides = []
    for i in range(n):
        fc = bm.faces.new([a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]])
        dd = poly[(i + 1) % n][0] - poly[i][0]; dz = poly[(i + 1) % n][1] - poly[i][1]
        out = (f.n * dz - ZV * dd) * (1 if area > 0 else -1)
        fc.normal_update()
        if fc.normal.dot(out) < 0:
            fc.normal_flip()
        sides.append(fc)
    caps = [bm.faces.new(a), bm.faces.new(b)]
    for cp, sg in zip(caps, (-1, 1)):
        cp.normal_update()
        if cp.normal.dot(f.t * sg) < 0:
            cp.normal_flip()
    return sides, caps


def tile_row(bm, start, end, r, n, side):
    """Round cover tile from start (eave, closed by the end tile) to end."""
    start, end = Vector(start), Vector(end)
    s = (end - start).normalized()
    side = Vector(side).normalized()
    up = s.cross(side).normalized()
    if up.z < 0:
        up = -up
    if abs(up.z) < 0.2:
        up = Vector((0, 0, 1))
        side = s.cross(up).normalized()
    rings = [[bm.verts.new(p + side * (r * math.cos(math.pi * i / n)) + up * (r * math.sin(math.pi * i / n)))
              for i in range(n + 1)] for p in (start, end)]
    a, b = rings
    sides = [bm.faces.new([a[i], b[i], b[i + 1], a[i + 1]]) for i in range(n)]
    for f, i in zip(sides, range(n)):
        f.normal_update()
        mid = (a[i].co + a[i + 1].co) / 2
        if f.normal.dot(mid - start) < 0:
            f.normal_flip()
    cap = bm.faces.new(a)
    cap.normal_update()
    if cap.normal.dot(s) > 0:
        cap.normal_flip()
    return sides + [cap]


# ── wall profile ────────────────────────────────────────────────────────────

def profile(kind, G, U, lod, namako=False):
    """Wall profile (d, z) and per-segment meta for one house.
    kura: stone footing 0.45, (namako) ground storey, plaster belt, upper
    storey, three-step plaster cornice 0.40 out. machiya: stone sill,
    ground storey, wooden floor beam, upper storey, wooden wall plate.
    Rows a module can cut: g_low, g_mid, g_top (ground), u_low, u_win, u_top."""
    pts, meta = [], []

    def seg(d, z, name, kd, storey):
        pts.append((d, z)); meta.append(dict(name=name, kind=kd, storey=storey))

    if kind == 'kura':
        F0 = 0.45
        seg(0.08, 0.0, 'foot', 'stone', 'g'); seg(0.08, F0, 'foot_top', 'hz', 'g')
        seg(0.0, F0, 'g_low', 'namako' if namako else 'wall', 'g')
        seg(0.0, 1.4, 'g_mid', 'wall', 'g'); seg(0.0, 2.5, 'g_top', 'wall', 'g')
        if lod == 0:
            seg(0.0, G, 'belt_lo', 'hz', 'g'); seg(0.08, G, 'belt', 'band', 'g')
            seg(0.08, G + 0.2, 'belt_hi', 'hz', 'g')
        else:
            seg(0.0, G, 'belt', 'band', 'g')
        zu = G + 0.2
        seg(0.0, zu, 'u_low', 'wall', 'u'); seg(0.0, zu + 0.5, 'u_win', 'wall', 'u')
        seg(0.0, zu + 1.6, 'u_top', 'wall', 'u')
        zw = G + 0.2 + U
        if lod == 0:   # three plaster steps out to 0.40
            for i, (da, db) in enumerate(((0.0, 0.13), (0.13, 0.26), (0.26, 0.40))):
                seg(da, zw + 0.14 * i, f'cor{i}a', 'hz', 'c')
                seg(db, zw + 0.14 * i, f'cor{i}', 'cornice', 'c')
            z_top = zw + 0.42
        else:
            seg(0.0, zw, 'cor', 'hz', 'c'); seg(0.40, zw, 'cor0', 'cornice', 'c')
            z_top = zw + 0.42
        pts.append((0.40, z_top)); meta.append(dict(name='cor_top', kind='hz', storey='c'))
        pts.append((-0.02, z_top))
        return pts, meta, z_top, 0.40
    # machiya
    seg(0.04, 0.0, 'foot', 'stone', 'g'); seg(0.04, 0.2, 'foot_top', 'hz', 'g')
    seg(0.0, 0.2, 'g_low', 'wall', 'g'); seg(0.0, 0.9, 'g_mid', 'wall', 'g'); seg(0.0, 2.2, 'g_top', 'wall', 'g')
    if lod == 0:
        seg(0.0, G, 'beam_lo', 'hz', 'g'); seg(0.06, G, 'beam', 'beam', 'g'); seg(0.06, G + 0.2, 'beam_hi', 'hz', 'g')
    else:
        seg(0.0, G, 'beam', 'beam', 'g')
    zu = G + 0.2
    win0 = zu + (0.35 if U > 1.6 else 0.15)
    seg(0.0, zu, 'u_low', 'wall', 'u'); seg(0.0, win0, 'u_win', 'wall', 'u')
    seg(0.0, zu + U - 0.3, 'u_top', 'wall', 'u')
    zw = zu + U
    seg(0.06, zw, 'plate', 'beam', 'c')
    z_top = zw + 0.16
    pts.append((0.06, z_top)); meta.append(dict(name='plate_top', kind='hz', storey='c'))
    pts.append((-0.02, z_top))
    return pts, meta, z_top, 0.06


ROWS = {'ground': ('g_low', 'g_mid', 'g_top'), 'ground_hi': ('g_mid', 'g_top'), 'upper': ('u_win',),
        'upper_tall': ('u_low', 'u_win')}


def op(e, u0, u1, rows, kind, **opt):
    return dict(e=e, u=(u0, u1), rows=rows, kind=kind, opt=opt)


class Shell:
    """Swept walls of one house and their cells. walls = {'g': [reg per edge],
    'u': [...]}: ground and upper storey regions per side (copper front,
    board sides ...)."""

    def __init__(self, c, W, D, kind, G, U, openings, walls, namako=False):
        self.c, self.W, self.D, self.walls = c, W, D, walls
        self.corners = [(-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, D / 2), (-W / 2, D / 2)]
        self.len = [W, D, W, D]
        self.pts, self.meta, self.z_top, self.wall_out = profile(kind, G, U, c.lod, namako)
        self.G, self.U, self.kind = G, U, kind
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
                st = mt['storey'] if mt['storey'] in ('g', 'u') else 'u'
                wall = self.walls[st][e]
                kd = mt['kind']
                if kd == 'wall':
                    # 2 m strips: start at the lowest row of this storey that keeps the face inside
                    bases = [p[1] for kk, p in enumerate(self.pts[:-1])
                             if self.meta[kk]['storey'] == mt['storey'] and self.meta[kk]['kind'] in ('wall', 'namako')]
                    z0 = min([b for b in bases if z_hi - b <= STRIP_H + 1e-6] or [z_lo])
                    c.m(fs, wall, z0=z0)
                elif kd == 'namako':
                    c.m(fs, 'NAMAKO', z0=z_lo)
                elif kd == 'stone':
                    c.m(fs, 'STONE', z0=0.0)
                elif kd == 'beam':
                    c.m(fs, 'WOOD', z0=z_lo)
                elif kd == 'cornice':
                    c.m(fs, flat(self.walls['u'][e]))
                else:   # ledges, belt
                    c.m(fs, flat(wall))

    def gables(self, slope, kamon=None):
        """Gable walls above the sweep (x = ±W/2) and a crest disc."""
        c = self.c
        DH = self.D / 2
        for sx, e in ((-1, 3), (1, 1)):
            x = sx * (self.W / 2 - 0.02)
            yw = DH - 0.02
            zu = lambda y: self.z_top + (DH + self.wall_out - abs(y)) * slope
            pts = [(-yw, self.z_top), (-yw, zu(yw)), (0, zu(0)), (yw, zu(yw)), (yw, self.z_top)]
            gf = c.bm.faces.new([c.bm.verts.new((x, y, z)) for y, z in pts])
            gf.normal_update()
            if gf.normal.x * sx < 0:
                gf.normal_flip()
            wall = self.walls['u'][e]
            tall = zu(0) - self.z_top > STRIP_H     # a strip would stretch: plain cell instead
            c.m([gf], flat(wall) if tall or wall not in ('PLASTER_BLACK', 'PLASTER_WHITE') else wall, z0=self.z_top)
            if kamon and c.lod == 0:
                zc, rc = self.z_top + (zu(0) - self.z_top) * 0.42, 0.34
                ring = [Vector((x, rc * math.cos(2 * math.pi * k / 12), zc + rc * math.sin(2 * math.pi * k / 12))) for k in range(12)]
                v0 = [c.bm.verts.new(p) for p in ring]
                v1 = [c.bm.verts.new(p + Vector((sx * 0.05, 0, 0))) for p in ring]
                sides = [c.bm.faces.new([v0[k], v0[(k + 1) % 12], v1[(k + 1) % 12], v1[k]]) for k in range(12)]
                cap = c.bm.faces.new(v1)
                orient(sides + [cap], Vector((x, 0, zc)))
                c.m(sides, flat(wall)); c.m([cap], kamon)


# ── roofs ───────────────────────────────────────────────────────────────────

def gable_roof(c, W, D, z_top, wall_out, eave_out=0.75, oh=0.7, slope=0.58, fascia=0.45, heavy=True,
               fascia_reg='PLASTER_BLACK', ridge_h=0.78, oni=1.0, rafters=False, eave_front=None):
    """Main roof, ridge along X. heavy (kura): thick plastered fascia,
    stacked ridge (noshi) with round cap, big onigawara; light (machiya):
    wooden fascia and visible rafters, lower ridge, small oni.
    eave_front: shorter front eave (copper parapet in front of it).
    Returns the front eave line (y), its height, ridge and gable x."""
    bm, lod = c.bm, c.lod
    DH, lh = D / 2, W / 2
    WL = DH + wall_out
    EB = WL + eave_out
    EF = WL + (eave_out if eave_front is None else eave_front)
    RY = 0.42 if heavy else 0.3
    zr = z_top + fascia + (EB - RY) * slope
    courses = (8 if heavy else 6) if lod == 0 else 1
    layers = (6 if heavy else 3) if lod == 0 else 2
    lh_ = ridge_h / layers

    def half(E):
        zf = zr - (E - RY) * slope
        pts = [(-E, zf - fascia), (-E, zf)]
        for k in range(1, courses):
            y = -E + (E - RY) * k / courses
            z = zf + (y + E) * slope
            pts += [(y, z - 0.035), (y, z)]
        pts.append((-RY, zr))
        for k in range(layers):
            y = -RY + 0.035 * k
            pts += [(y, zr + lh_ * (k + 1)), (y + 0.035, zr + lh_ * (k + 1))]
        return pts, zf - fascia

    front, zbf = half(EF)
    back, zbb = half(EB)
    ztop = front[-1][1]

    def soffit_pts(E, zb, sg):   # from the fascia to the wall line, one side
        if heavy or E - WL < 0.1:
            return [(sg * WL, max(zb, z_top) if not heavy else z_top)]
        return [(sg * (E - fascia * 0.3), zb + 0.02), (sg * WL, zb + (E - WL) * 0.25)]

    under = soffit_pts(EB, zbb, 1) + [(0, z_top + WL * slope)] + list(reversed(soffit_pts(EF, zbf, -1)))
    poly = front + [(-y, z) for y, z in reversed(back)] + under
    n_half = len(front)
    sides, c0, c1 = K.poly_prism_x(bm, poly, -(lh + oh), lh + oh)
    soffit = 'PLASTER_BLACK_FLAT' if fascia_reg == 'PLASTER_BLACK' else (
        'PLASTER_WHITE_FLAT' if fascia_reg == 'PLASTER_WHITE' else 'WOOD_FLAT')
    for i, f in enumerate(sides):
        if i == 0 or i == 2 * n_half - 2:
            c.m([f], fascia_reg, z0=zbf if i == 0 else zbb)
        elif i >= 2 * n_half - 1:
            c.m([f], soffit)
        elif min(i, 2 * n_half - 2 - i) >= 2 * courses:
            c.m([f], 'TILE_DARK')
        else:
            f.normal_update()
            c.m([f], 'TILE_DARK' if abs(f.normal.z) < 0.5 else 'TILE_B')
    c.m([c0, c1], soffit)
    if True:
        tiles = ['TILE_A', 'TILE_B', 'TILE_C']
        xs = lh + oh - 0.3
        nrows = int(2 * xs / (0.32 if lod == 0 else 0.64)) + 1
        tn = 4 if lod == 0 else 2      # LOD1: every other row, triangular - keeps the roof relief
        for side, E, zb in ((-1, EF, zbf), (1, EB, zbb)):
            st = Vector((0, side * (E + 0.04), zb + fascia))
            en = Vector((0, side * (RY - 0.06), zr + 0.06 * slope))
            for k in range(nrows):
                x = -xs + 2 * xs * k / (nrows - 1)
                fs = tile_row(bm, st + Vector((x, 0, 0)), en + Vector((x, 0, 0)), 0.09, tn, (1, 0, 0))
                c.m(fs, tiles[(k * 7 + (side > 0)) % 3]); c.nb(fs)
            if lod:
                continue
            for bx in (-(lh + oh - 0.09), lh + oh - 0.09):
                fs = tile_row(bm, st + Vector((bx, 0, 0.02)), en + Vector((bx, 0, 0.02)), 0.12, 4, (1, 0, 0))
                c.m(fs, 'TILE_DARK'); c.nb(fs)
            if rafters and E - WL >= 0.1:   # taruki under the eave, following the sloping soffit
                n = int(2 * lh / 0.45)
                y1 = E - fascia * 0.3
                za, zb_ = zb + (E - WL) * 0.25, zb + 0.02
                fr = F((0, 0, 0), (0, side, 0))
                for k in range(n + 1):
                    u = (-lh + 2 * lh * k / n) * (-side)
                    b = c.box(fr, u - 0.04, u + 0.04, 0.0, 1.0, WL, y1, None, skip=('top', 'in'))
                    for v in {v for x in b.values() for v in x.verts}:
                        t = (abs(v.co.y) - WL) / (y1 - WL)
                        v.co.z = za + (zb_ - za) * t - 0.09 * (1 - v.co.z)
                    c.m(b.values(), 'WOOD_FLAT')
        fs = tile_row(bm, (-(lh + oh), 0, ztop), (lh + oh, 0, ztop), 0.2 if heavy else 0.14, 6 if lod == 0 else 3, (0, 1, 0))
        c.m(fs, 'TILE_A'); c.nb(fs)
    # onigawara
    oz = zr - 0.05
    s = oni
    half_o = [(-0.72, 0.0), (-0.72, 0.75), (-0.64, 1.05), (-0.54, 1.45), (-0.38, 1.12), (-0.18, 1.28), (0.0, 1.33)]
    if not heavy:
        half_o = [(-0.45, 0.0), (-0.45, 0.45), (-0.36, 0.62), (-0.18, 0.55), (0.0, 0.66)]
    if lod:
        half_o = [(-0.5, 0.0), (-0.5, 0.7), (0.0, 0.85)] if heavy else [(-0.4, 0.0), (-0.4, 0.45), (0.0, 0.6)]
    opoly = [(y * s, oz + z * s) for y, z in half_o] + [(-y * s, oz + z * s) for y, z in reversed(half_o[:-1])]
    for sx in (-1, 1):
        xa, xb = sorted((sx * (lh + oh - 0.04), sx * (lh + oh + 0.16)))
        osides, oc0, oc1 = K.poly_prism_x(bm, opoly, xa, xb)
        c.m(osides + [oc0 if sx > 0 else oc1], 'TILE_DARK')
        c.m([oc1 if sx > 0 else oc0], 'ONI')
    return dict(eave_y=EF, z=zbf, ridge=ztop + (0.2 if heavy else 0.14), x=lh + oh)


def hisashi(c, f, u0, u1, z_e, depth, slope=0.45, fascia=0.22, fascia_reg='WOOD', soffit='WOOD_FLAT',
            beams=None, beam_reg='WOOD', sode=None, sode_reg='PLASTER_BLACK_FLAT', rows=True):
    """Pent roof over the shop front (z_e = underside of the fascia at the
    outer edge). Tile courses + round tile rows, flashing at the wall,
    cantilever beams (dashi-geta) at `beams` (u), front plate; optional
    plastered fire wing walls (sode-kabe) at both ends.
    Returns the height of the roof surface at d (for signs standing on it)."""
    bm, lod = c.bm, c.lod
    zt = z_e + fascia + depth * slope
    zs = z_e + 0.38                       # soffit meets the wall here
    courses = max(2, int(depth / 0.32)) if lod == 0 else 1
    poly = [(depth, z_e), (depth, z_e + fascia)]
    for k in range(1, courses):
        d = depth - depth * k / courses
        z = z_e + fascia + (depth - d) * slope
        poly += [(d, z - 0.03), (d, z)]
    poly += [(0.0, zt), (0.0, zs)]
    sides, caps = prism_u(c, f, poly, u0, u1)
    c.m([sides[0]], fascia_reg, z0=z_e)
    c.m([sides[-1]], soffit)
    c.m([sides[-2]], 'TILE_DARK')
    for s in sides[1:-2]:
        s.normal_update()
        c.m([s], 'TILE_DARK' if abs(s.normal.z) < 0.5 else 'TILE_B')
    c.m(caps, flat(fascia_reg) if fascia_reg in FLAT else 'WOOD_FLAT')
    fl = c.box(f, u0, u1, zt - 0.06, zt + 0.16, 0.0, 0.13, 'TILE_DARK', skip=('in',))   # flashing at the wall
    n = int((u1 - u0) / (0.3 if lod == 0 else 0.6)) if rows else 0   # small back roofs: courses only
    for k in range(n):
        u = u0 + 0.15 + (u1 - u0 - 0.3) * k / max(n - 1, 1)
        fs = tile_row(bm, f(u, z_e + fascia, depth + 0.03), f(u, zt - 0.02, 0.14), 0.075, 4 if lod == 0 else 2, f.t)
        c.m(fs, ('TILE_A', 'TILE_B', 'TILE_C')[(k * 5) % 3]); c.nb(fs)
    if lod == 0 and rows:
        for u in (u0 + 0.05, u1 - 0.05):   # barge tiles at the ends
            fs = tile_row(bm, f(u, z_e + fascia + 0.02, depth + 0.03), f(u, zt, 0.14), 0.09, 4, f.t)
            c.m(fs, 'TILE_DARK'); c.nb(fs)
    for u in beams or []:   # cantilever under the soffit, deeper at the wall
        b = c.box(f, u - 0.07, u + 0.07, 0.0, 1.0, 0.0, depth - 0.04, None, skip=('in', 'top'))
        for v in {v for x in b.values() for v in x.verts}:
            t = (v.co - f(u, 0, 0)).dot(f.n) / depth
            top = zs + (z_e - zs) * t
            v.co.z = top - (0.34 - 0.18 * t) * (1 - v.co.z)
        c.m(b.values(), beam_reg)
    if beams:
        c.box(f, u0 + 0.1, u1 - 0.1, z_e - 0.2, z_e, depth - 0.3, depth - 0.12, beam_reg, skip=())   # front plate (keta)
    for u, sg, w in zip((u0, u1), (-1, 1), sode or (None, None)):   # sode = (left width, right width)
        if not w:
            continue
        ua, ub = sorted((u, u + sg * w))
        top = z_e + fascia + 0.1
        b = c.box(f, ua, ub, 0.0, top, 0.0, depth - 0.15, sode_reg, skip=('in',), bevel=True)
        cap = c.box(f, ua - 0.05, ub + 0.05, top, top + 0.12, -0.0, depth - 0.1, 'TILE_DARK', skip=('in',))
        if lod == 0:
            c.box(f, ua - 0.02, ub + 0.02, 0.0, 0.45, depth - 0.15, depth - 0.11, 'STONE_FLAT', skip=('in', 'top'))
    return lambda d: z_e + fascia + (depth - d) * slope


# ── modules for openings (house mesh) ───────────────────────────────────────

def hole(c, face, depth, reveal):
    floor, walls = K.recess(c.bm, face, 0.0, depth)
    c.m(walls, reveal); c.nb(walls)
    return floor


def grid_on(c, floor, us, zs):
    f = F.of(floor)
    c.bm.faces.remove(floor)
    return f, K.grid_plane(c.bm, lambda u, z: f(u, z), us, zs, f.n)


def glass_door(c, f, u0, u1, z0, z1, d, glass=True, rails=(0.3,)):
    """Wooden sliding door with glass panes (garasu-do): stiles, rails, kick board."""
    fs = []
    for a, b in ((u0, u0 + 0.05), (u1 - 0.05, u1)):
        fs += c.box(f, a, b, z0, z1, d - 0.03, d + 0.03, 'WOOD', skip=('in',), rotate=True).values()
    for zz in (z0, z1 - 0.06) + tuple(z0 + r for r in rails):
        fs += c.box(f, u0 + 0.05, u1 - 0.05, zz, zz + 0.06, d - 0.025, d + 0.025, 'WOOD', skip=('in', 'l', 'r')).values()
    if glass:
        g = c.box(f, u0 + 0.05, u1 - 0.05, z0 + 0.06, z1 - 0.06, d - 0.005, d, 'GLASS', skip=('in', 'l', 'r', 'top', 'bot'))
    return fs


def shop_open(c, face, sh, opt):
    """Open shop front: deep, posts and lintel, threshold, glass doors
    slid aside, stone step in front. The dressing puts the interior in."""
    f0 = F.of(face)
    depth = opt.get('depth', 1.0)
    fl = hole(c, face, depth, 'WOOD_FLAT')
    c.m([fl], 'INTERIOR')
    n = max(1, round(f0.w / 1.9))
    for i in range(n + 1):
        u = f0.u0 + f0.w * i / n
        ua, ub = max(f0.u0, u - 0.08), min(f0.u1, u + 0.08)
        c.box(f0, ua, ub, f0.z0, f0.z1, -0.16, 0.0, 'WOOD', skip=('in', 'bot', 'top'), rotate=True)
    c.box(f0, f0.u0, f0.u1, f0.z1 - 0.26, f0.z1, -0.2, 0.02, 'WOOD', skip=('in', 'top', 'l', 'r'))
    if c.lod == 0:
        c.box(f0, f0.u0, f0.u1, f0.z0, f0.z0 + 0.06, -0.3, 0.0, 'WOOD', skip=('in', 'bot', 'l', 'r'))
        if opt.get('doors', True):   # glass doors slid aside behind the end posts
            dw = min(0.9, f0.w / n / 2.2)
            for u, sg in ((f0.u0 + 0.1, 1), (f0.u1 - 0.1, -1)):
                for k, dd in enumerate((-0.28, -0.36)):
                    ua, ub = sorted((u + sg * 0.06 * k, u + sg * (dw + 0.06 * k)))
                    glass_door(c, f0, ua, ub, f0.z0 + 0.06, f0.z1 - 0.26, dd, rails=(0.3, 1.2))
    if f0.z0 > 0.2:   # stone step up to the raised shop floor
        c.box(f0, f0.u0 + 0.15, f0.u1 - 0.15, 0.0, f0.z0 * 0.5, 0.0, 0.42, 'STONE_FLAT', skip=('in', 'bot'))
    return dict(kind='shop', f=f0, depth=depth)


def shop_closed(c, face, sh, opt):
    """Closed shop: plastered fire doors (kura) or storm boards (machiya)."""
    f0 = F.of(face)
    style = opt.get('style', 'boards')
    reg = opt.get('reg', 'PLASTER_BLACK')
    fl = hole(c, face, 0.14, flat(reg) if style == 'plaster' else 'WOOD_FLAT')
    n = max(2, round(f0.w / 0.95)) if style == 'plaster' else max(1, math.ceil(f0.w / 1.8))
    f = F.of(fl)
    us = [f.u0 + f.w * i / n for i in range(n + 1)]
    zs = [f.z0, f.z1] if style != 'plaster' else [f.z0, f.z0 + (f.z1 - f.z0) * 0.55, f.z1]
    f, g = grid_on(c, fl, us, zs)
    for i, j in sorted(g):
        cell = g[i, j]
        if style == 'plaster':
            if c.lod == 0:
                inner, ring = K.recess(c.bm, cell, 0.07, -0.05)   # stepped plug of the fire door stands proud
                c.m(ring, flat(reg)); c.m([inner], reg, z0=zs[j]); c.nb(ring)
            else:
                c.m([cell], reg, z0=zs[j])
        else:
            c.m([cell], 'WOOD_BOARD', rotate=True)
    if style != 'plaster' and c.lod == 0:
        for zz in (f.z0 + 0.4, f.z1 - 0.5):
            c.box(f, f.u0, f.u1, zz, zz + 0.07, 0.0, 0.04, 'WOOD', skip=('in', 'l', 'r'))
    if f0.z0 > 0.2:
        c.box(f0, f0.u0 + 0.15, f0.u1 - 0.15, 0.0, f0.z0 * 0.5, 0.0, 0.42, 'STONE_FLAT', skip=('in', 'bot'))
    return dict(kind='closed', f=f0, depth=0.14)


def koshi(c, face, sh, opt):
    """Lattice front (senbon-goshi): close vertical bars before shoji paper,
    lit from inside or dark; a door section with its own frame."""
    f0 = F.of(face)
    fl = hole(c, face, 0.2, 'WOOD_FLAT')
    f = F.of(fl)
    n = max(1, round(f.w / 0.9))
    us = [f.u0 + f.w * i / n for i in range(n + 1)]
    f, g = grid_on(c, fl, us, [f.z0, f.z1])
    lit = opt.get('lit', True)
    for i in range(n):
        c.m([g[i, 0]], 'SHOJI' if lit and i % 3 != 1 else 'SHOJI_DARK')
    if c.lod:
        return dict(kind='koshi', f=f0, depth=0.2)
    step = 0.085
    k = int(f0.w / step)
    for i in range(1, k):
        u = f0.u0 + f0.w * i / k
        c.box(f0, u - 0.014, u + 0.014, f0.z0, f0.z1, -0.08, -0.03, 'WOOD_LIGHT', skip=('in', 'top', 'bot'), rotate=True)
    for zz in (f0.z0, f0.z0 + 0.5, f0.z1 - 0.08):
        c.box(f0, f0.u0, f0.u1, zz, zz + 0.08, -0.1, -0.02, 'WOOD_LIGHT', skip=('in', 'l', 'r'))
    for u in (f0.u0, f0.u1):
        c.box(f0, u - 0.07, u + 0.07, f0.z0, f0.z1, -0.12, 0.0, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
    return dict(kind='koshi', f=f0, depth=0.2)


def glass_front(c, face, sh, opt):
    """Shōwa shop front: wooden glass doors across the whole width, standing
    open in the middle; the dressing puts the lit interior behind."""
    f0 = F.of(face)
    depth = opt.get('depth', 0.8)
    fl = hole(c, face, depth, 'WOOD_FLAT')
    c.m([fl], 'INTERIOR')
    if c.lod == 0:
        n = max(2, round(f0.w / 0.9))
        dw = f0.w / n
        for i in range(n):
            if i in (n // 2 - 1, n // 2) and n >= 4:
                continue   # open pair: the doors are slid behind their neighbours
            ua = f0.u0 + i * dw
            glass_door(c, f0, ua, ua + dw, f0.z0 + 0.04, f0.z1 - 0.3, -0.12 - 0.06 * (i % 2), glass=False, rails=(0.35, 1.1))
        c.box(f0, f0.u0, f0.u1, f0.z1 - 0.3, f0.z1, -0.2, 0.02, 'WOOD', skip=('in', 'top', 'l', 'r'))
        c.box(f0, f0.u0, f0.u1, f0.z0, f0.z0 + 0.05, -0.3, 0.0, 'WOOD', skip=('in', 'bot', 'l', 'r'))
    if f0.z0 > 0.2:
        c.box(f0, f0.u0 + 0.15, f0.u1 - 0.15, 0.0, f0.z0 * 0.5, 0.0, 0.42, 'STONE_FLAT', skip=('in', 'bot'))
    return dict(kind='glass', f=f0, depth=depth)


def kannon(c, face, sh, opt):
    """Kura window: proud stepped frame, iron bars, thick plaster doors
    (kannon-biraki) swung open - or shut (`closed`)."""
    bm, lod = c.bm, c.lod
    pl = opt['wall']
    lit = opt.get('lit', False)
    face.normal_update()
    n = face.normal.copy()
    t = Vector((-n.y, n.x, 0))
    z0 = opt.get('z0', 0.0)
    fw = F.of(face)
    cap, sides = K.extrude(bm, face, 0.12)
    c.m(sides, pl, z0=z0)
    vs = [v.co.copy() for v in cap.verts]
    ctr = sum(vs, Vector()) / len(vs)
    wf = max(v.dot(t) for v in vs) - min(v.dot(t) for v in vs)
    zf0, zf1 = min(v.z for v in vs), max(v.z for v in vs)
    inner = 'SHOJI' if lit else 'INTERIOR'
    if opt.get('closed'):
        plug, ring = K.recess(bm, cap, 0.06, 0.03)
        c.m(ring, pl, z0=z0); c.m([plug], pl, z0=z0); c.nb(ring)
        if lod == 0:   # the joint between the two doors and a ring pull
            b = lbox(bm, F.of(plug), ctr.dot(t) - 0.01, ctr.dot(t) + 0.01, zf0 + 0.05, zf1 - 0.05, 0.0, 0.015, skip=('in',))
            c.m(b.values(), 'IRON'); c.nb(b.values())
        return dict(kind='window', f=fw)
    if lod:
        floor, walls = K.recess(bm, cap, 0.08, 0.12)
        c.m(walls, pl, z0=z0); c.m([floor], inner)
        return dict(kind='window', f=fw)
    step, walls = K.recess(bm, cap, 0.07, 0.05)
    c.m(walls, pl, z0=z0)
    step2, walls = K.recess(bm, step, 0.05, 0.05)
    c.m(walls, pl, z0=z0)
    hl, walls = K.recess(bm, step2, 0.04, 0.28)
    c.m(walls + [step2], pl, z0=z0); c.nb(walls + [hl])
    c.m([hl], inner)
    hv = [v.co.copy() for v in hl.verts]
    hw = (max(v.dot(t) for v in hv) - min(v.dot(t) for v in hv)) / 2
    hz0, hz1 = min(v.z for v in hv), max(v.z for v in hv)
    nbars = 3 if wf < 1.0 else 4
    for i in range(nbars):
        p = ctr + t * (-hw + 2 * hw * (i + 1) / (nbars + 1)) - n * 0.16
        bar = K.prism(bm, 4, 0.02, 0.02, hz0, hz1, cx=p.x, cy=p.y, cap_bottom=False, cap_top=False)
        c.m(bar['sides'], 'IRON'); c.nb(bar['sides'])
    th = math.radians(100)
    dw, dt = wf / 2 - 0.02, 0.16
    for sgn in (-1, 1):
        tt = t * -sgn
        hinge = ctr + t * (sgn * wf / 2)
        au = tt * math.cos(th) + n * math.sin(th)
        av = n * math.cos(th) - tt * math.sin(th)
        c0 = [hinge + au * u + av * v for u, v in ((0, 0), (dw, 0), (dw, dt), (0, dt))]
        lo = [bm.verts.new((p.x, p.y, zf0 + 0.02)) for p in c0]
        hi = [bm.verts.new((p.x, p.y, zf1 - 0.02)) for p in c0]
        fs = {'v0': bm.faces.new([lo[0], lo[1], hi[1], hi[0]]), 'u1': bm.faces.new([lo[1], lo[2], hi[2], hi[1]]),
              'v1': bm.faces.new([lo[2], lo[3], hi[3], hi[2]]), 'u0': bm.faces.new([lo[3], lo[0], hi[0], hi[3]]),
              '-z': bm.faces.new(lo[::-1]), '+z': bm.faces.new(hi)}
        cc = hinge + au * dw / 2 + av * dt / 2; cc.z = (zf0 + zf1) / 2
        orient(fs.values(), cc)
        c.m([fs[k] for k in ('u0', 'u1', 'v1', '-z', '+z')], pl, z0=z0)
        inn, walls = K.recess(bm, fs['v0'], 0.06, -0.05)
        c.m([inn] + walls, pl, z0=z0)
    return dict(kind='window', f=fw)


def mushiko(c, face, sh, opt):
    """Mushiko-mado: plastered vertical slats over a dark (or lit) opening."""
    f0 = F.of(face)
    wall = opt['wall']
    fl = hole(c, face, 0.1, flat(wall))
    c.m([fl], 'SHOJI' if opt.get('lit') else 'INTERIOR')
    if c.lod:
        return dict(kind='window', f=f0)
    k = max(3, int(f0.w / 0.13))
    for i in range(1, k):
        u = f0.u0 + f0.w * i / k
        c.box(f0, u - 0.035, u + 0.035, f0.z0, f0.z1, -0.1, 0.0, flat(wall), skip=('in', 'top', 'bot'))
    c.box(f0, f0.u0 - 0.08, f0.u1 + 0.08, f0.z0 - 0.06, f0.z0, 0.0, 0.05, flat(wall), skip=('in',))
    return dict(kind='window', f=f0)


def shoji_rail(c, face, sh, opt):
    """Upper room open to the street: shoji screens (some lit) behind a
    wooden railing (tesuri) standing on the floor beam."""
    f0 = F.of(face)
    fl = hole(c, face, 0.45, 'WOOD_FLAT')
    f = F.of(fl)
    n = max(2, round(f.w / 0.9))
    us = [f.u0 + f.w * i / n for i in range(n + 1)]
    f, g = grid_on(c, fl, us, [f.z0, f.z1])
    lit = opt.get('lit', (1,))
    for i in range(n):
        c.m([g[i, 0]], 'SHOJI' if i in lit else 'SHOJI_DARK')
    if c.lod == 0:
        for u in us[1:-1]:
            c.box(f, u - 0.02, u + 0.02, f.z0, f.z1, 0.0, 0.03, 'WOOD', skip=('in',), rotate=True)
    zr = f0.z0 + 0.75
    c.box(f0, f0.u0, f0.u1, zr, zr + 0.07, -0.12, 0.0, 'WOOD', skip=('in', 'l', 'r'))
    if c.lod == 0:
        c.box(f0, f0.u0, f0.u1, f0.z0 + 0.06, f0.z0 + 0.12, -0.12, -0.02, 'WOOD', skip=('in', 'l', 'r'))
        k = int(f0.w / 0.11)
        for i in range(1, k):
            u = f0.u0 + f0.w * i / k
            c.box(f0, u - 0.013, u + 0.013, f0.z0 + 0.12, zr, -0.09, -0.06, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
    return dict(kind='rail', f=f0)


def sash(c, face, sh, opt):
    """Wooden sash window of the copper-fronted houses: architrave, sill,
    glazing bars."""
    f0 = F.of(face)
    wall = opt['wall']
    fl = hole(c, face, 0.12, flat(wall))
    gl, ring = K.recess(c.bm, fl, 0.05, 0.03)
    c.m(ring, 'WOOD_FLAT'); c.m([gl], 'SHOJI' if opt.get('lit') else 'GLASS'); c.nb(ring + [gl])
    if c.lod:
        return dict(kind='window', f=f0)
    f = F.of(gl)
    for u in (f.uc,):
        c.box(f, u - 0.025, u + 0.025, f.z0, f.z1, 0.0, 0.03, 'WOOD', skip=('in',), rotate=True)
    for z in (f.z0 + f.w * 0 + (f.z1 - f.z0) * 0.5,):
        c.box(f, f.u0, f.u1, z - 0.02, z + 0.02, 0.0, 0.03, 'WOOD', skip=('in', 'l', 'r'))
    c.box(f0, f0.u0 - 0.1, f0.u1 + 0.1, f0.z1, f0.z1 + 0.14, 0.0, 0.1, 'COPPER_FLAT', skip=('in',))   # hood
    c.box(f0, f0.u0 - 0.06, f0.u1 + 0.06, f0.z0 - 0.07, f0.z0, -0.02, 0.08, 'COPPER_FLAT', skip=('in',))
    return dict(kind='window', f=f0)


MODULES = {'shop': shop_open, 'closed': shop_closed, 'koshi': koshi, 'glass': glass_front,
           'kannon': kannon, 'mushiko': mushiko, 'rail': shoji_rail, 'sash': sash}


# ── parts on wall frames (house mesh) ───────────────────────────────────────

def gutter(c, roof, side_x=1):
    """Copper half-round gutter along the front eave and a downpipe with its
    collecting head down the gable corner."""
    if c.lod:
        return
    y, z, x = roof['eave_y'] + 0.05, roof['z'] - 0.02, roof['x']
    c.tube([(-x + 0.05, -y, z), (x - 0.05, -y, z)], 0.065, 4, 'COPPER_PIPE')
    xs = side_x * (x - 0.25)
    c.box(F((0, 0, 0), (0, -1, 0)), xs - 0.09, xs + 0.09, z - 0.32, z - 0.1, y - 0.06, y + 0.06, 'COPPER_PIPE')


def downpipe(c, f, u, z0, z1, d=0.08):
    if c.lod:
        return
    c.tube([f(u, z0, d), f(u, z1, d)], 0.04, 4, 'COPPER_PIPE')
    for z in (z0 + 0.6, (z0 + z1) / 2, z1 - 0.4):
        c.box(f, u - 0.05, u + 0.05, z, z + 0.04, 0.0, d + 0.02, 'IRON')


def ladder(c, f, u, z0, z1, d=0.12):
    """Wooden fire ladder (hashigo) hung on iron hooks along the wall."""
    if c.lod:
        return
    for du in (-0.22, 0.22):
        c.box(f, u + du - 0.03, u + du + 0.03, z0, z1, d, d + 0.06, 'WOOD_LIGHT', rotate=True)
    k = int((z1 - z0) / 0.35)
    for i in range(1, k):
        z = z0 + (z1 - z0) * i / k
        c.tube([f(u - 0.2, z, d + 0.03), f(u + 0.2, z, d + 0.03)], 0.018, 3, 'WOOD_FLAT')
    for z in (z0 + 0.3, z1 - 0.3):
        c.box(f, u - 0.3, u + 0.3, z, z + 0.04, 0.0, d + 0.08, 'IRON')


def copper_front(c, W, D, G, z0, z1):
    """Flat copper parapet of the kanban houses: hides the roof, stepped
    centre, moulded cornice, pilasters at both ends."""
    fr = F((0, -D / 2, 0), (0, -1, 0))
    b = c.box(fr, -W / 2 - 0.08, W / 2 + 0.08, z0, z1, -0.3, 0.06, None, skip=('in',), bevel=True)
    c.m([b['out']], 'COPPER', z0=z0)
    c.m([x for k, x in b.items() if k != 'out'], 'COPPER_FLAT')
    cw = min(2.6, W * 0.45)
    p = c.box(fr, -cw / 2, cw / 2, z1, z1 + 0.5, -0.25, 0.06, 'COPPER_FLAT', skip=('in', 'bot'), bevel=True)
    for zz, dd, uu in ((z1 - 0.12, 0.14, 0.12), (z1, 0.2, 0.18)):
        c.box(fr, -W / 2 - uu, W / 2 + uu, zz, zz + 0.12, -0.3, dd, 'COPPER_FLAT', skip=('in',), bevel=True)
    c.box(fr, -cw / 2 - 0.08, cw / 2 + 0.08, z1 + 0.5, z1 + 0.6, -0.3, 0.14, 'COPPER_FLAT', skip=('in',), bevel=True)
    if c.lod == 0:
        for u in (-W / 2 + 0.12, W / 2 - 0.12):
            c.box(fr, u - 0.14, u + 0.14, G, z1 - 0.12, 0.06, 0.12, 'COPPER_FLAT', skip=('in',))
        for zz in (z0 + 0.25, z1 - 0.45):   # moulded bands
            c.box(fr, -W / 2, W / 2, zz, zz + 0.08, 0.06, 0.1, 'COPPER_FLAT', skip=('in',))


# ── shop dressing (mesh with atlas KoedoShop) ───────────────────────────────

def interior(c, slot, img, inset=0.02):
    """Lit shop interior on the back of a shop opening."""
    f = slot['f']
    d = -slot['depth'] + inset
    v = [c.bm.verts.new(f(u, z, d)) for u, z in ((f.u0, f.z0), (f.u1, f.z0), (f.u1, f.z1), (f.u0, f.z1))]
    q = c.bm.faces.new(v)
    q.normal_update()
    if q.normal.dot(f.n) < 0:
        q.normal_flip()
    c.m([q], img); c.nb([q])


def noren(c, f, u0, u1, z, d, img, n=None, length=0.9):
    """Noren curtain on a pole: n panels, one graphic across all."""
    n = n or max(2, min(5, round((u1 - u0) / 0.5)))
    pw = (u1 - u0) / n
    pan = [c.box(f, u0 + i * pw + 0.012, u0 + (i + 1) * pw - 0.012, z - length, z - 0.03, d - 0.005, d + 0.005,
                 None, skip=() if c.lod == 0 else ('in',)) for i in range(n)]
    c.span([p['out'] for p in pan], img, f.t)
    if 'in' in pan[0]:
        c.span([p['in'] for p in pan], img, f.t)
    c.m([x for p in pan for k, x in p.items() if k not in ('out', 'in')], 'NOREN_NAVY')
    if c.lod == 0:
        c.tube([f(u0 - 0.1, z - 0.01, d), f(u1 + 0.1, z - 0.01, d)], 0.017, 6, 'WOOD_DARK', caps=True)
        for u in (u0 - 0.05, u1 + 0.05):
            c.box(f, u - 0.02, u + 0.02, z - 0.04, z + 0.03, -0.02, d + 0.03, 'IRON')


def nobori(c, f, u, d, img, h=1.8, w=0.45):
    """Nobori flag on its pole in a weighted stand (flag lies on its side in the atlas)."""
    z0, z1 = 0.6, 0.6 + h
    c.tube([f(u, 0.1, d), f(u, z1 + 0.12, d)], 0.016, 4, 'STEEL')
    fl = c.box(f, u + 0.03, u + 0.03 + w, z0, z1, d - 0.004, d + 0.004, None, skip=('in',) if c.lod else ())
    uv = c.bm.loops.layers.uv.verify()
    a0, b0, a1, b1 = c.R(img)['uv']
    for k in ('out', 'in'):
        if k not in fl:
            continue
        for l in fl[k].loops:
            a = (l.vert.co.z - z0) / h
            b = 1 - ((l.vert.co - f(u + 0.03, 0, d)).dot(f.t)) / w
            l[uv].uv = (a0 + a * (a1 - a0), b0 + b * (b1 - b0))
    c.m([x for k, x in fl.items() if k not in ('out', 'in')], 'WHITE')
    if c.lod == 0:
        c.tube([f(u, z1 + 0.02, d), f(u + 0.03 + w, z1 + 0.02, d)], 0.008, 3, 'STEEL')
        st = K.lathe(c.bm, 8, [(0.2, 0.0), (0.18, 0.08), (0.08, 0.14), (0.0, 0.16)], cx=f(u, 0, d).x, cy=f(u, 0, d).y,
                     cap_bottom=False)
        c.m(st['sides'], 'BLACK'); c.nb(st['sides'])


def chochin(c, f, u, z, d, img, r=0.2, h=0.55, hook=True, hang=0.25):
    """White paper lantern (chōchin) with black caps, hanging from a bracket."""
    p = f(u, 0, d)
    n = 10 if c.lod == 0 else 6
    prof = [(r * 0.62, z), (r * 0.9, z + h * 0.15), (r, z + h * 0.5), (r * 0.9, z + h * 0.85), (r * 0.62, z + h)]
    body = K.lathe(c.bm, n, prof, cx=p.x, cy=p.y, cap_bottom=False, cap_top=False)
    K.map_cyl(c.bm, body['sides'], c.R(img), cx=p.x, cy=p.y, seam=math.atan2(-f.n.y, -f.n.x))
    c.nb(body['sides'])
    for z0, z1, cb in ((z - 0.05, z, True), (z + h, z + h + 0.05, False)):
        cap = K.lathe(c.bm, n, [(r * 0.64, z0), (r * 0.64, z1)], cx=p.x, cy=p.y, cap_bottom=cb, cap_top=not cb)
        fs = cap['sides'] + [cap['bottom'], cap['top']]
        c.m(fs, 'BLACK'); c.nb(fs)
    if hook and c.lod == 0:
        c.tube([f(u, z + h + 0.05, d), f(u, z + h + hang, d)], 0.01, 3, 'IRON')


def board(c, f, uc, w, h, z, d, img, cap=True, posts=None):
    """Wooden signboard with frame; small tiled cap roof (kasagi) on top;
    optional posts down to `posts` (z) - a roof signboard standing on the hisashi."""
    b = c.box(f, uc - w / 2, uc + w / 2, z, z + h, d - 0.07, d, None, skip=('in',) if posts is None else (), bevel=True)
    c.m([b['out']], img)
    c.m([x for k, x in b.items() if k != 'out'], 'WOOD_DARK')
    if c.lod == 0:
        for zz in (z - 0.04, z + h):
            c.box(f, uc - w / 2 - 0.04, uc + w / 2 + 0.04, zz, zz + 0.04, d - 0.09, d + 0.02, 'WOOD_DARK')
    if cap:
        c.box(f, uc - w / 2 - 0.12, uc + w / 2 + 0.12, z + h + 0.04, z + h + 0.12, d - 0.2, d + 0.12, 'BLACK', bevel=True)
    if posts is not None:
        for u in (uc - w / 2 + 0.12, uc + w / 2 - 0.12):
            c.box(f, u - 0.05, u + 0.05, posts, z, d - 0.12, d - 0.02, 'WOOD_DARK', skip=('bot',))
            if c.lod == 0:
                c.tube([f(u, z + h * 0.6, d - 0.1), f(u, posts, d - 0.6)], 0.012, 3, 'IRON')
    return b


def tate_board(c, f, u, d, img, h=1.7, w=0.42):
    """Standing vertical board on a wooden foot by the entrance."""
    b = c.box(f, u - w / 2, u + w / 2, 0.25, 0.25 + h, d - 0.04, d + 0.04, None, bevel=True)
    c.m([b['out']], img); c.m([b['in']], img); c.m([b[k] for k in ('l', 'r', 'top', 'bot')], 'WOOD_DARK')
    c.box(f, u - w / 2 - 0.05, u + w / 2 + 0.05, 0.0, 0.25, d - 0.18, d + 0.18, 'WOOD_DARK', skip=('bot',))


def sugidama(c, f, u, z, d, r=0.42, hang=0.35):
    """Cedar ball of a sake brewery, hung under the eave."""
    p = f(u, 0, d)
    n = 8 if c.lod == 0 else 6
    rings = 6 if c.lod == 0 else 4
    prof = [(r * math.sin(math.pi * k / rings), z - r * math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    prof[0] = (0.0, prof[0][1]); prof[-1] = (0.0, prof[-1][1])
    s = K.lathe(c.bm, n, prof, cx=p.x, cy=p.y, phase=0.3)
    c.m(s['sides'], 'CEDAR'); c.nb(s['sides'])
    if c.lod == 0:
        c.tube([f(u, z + r - 0.02, d), f(u, z + r + hang, d)], 0.012, 3, 'STRAW')


def display(c, f, u0, u1, d0, kind, seed=0, h=0.75, zb=0.45):
    """Stepped wooden display stand in the shop mouth: candy jars, boxes,
    sake casks or pots, depending on the shop."""
    import random
    r = random.Random(seed)
    steps = 3 if c.lod == 0 else 1
    dep = 0.9
    for k in range(steps):
        z = zb + h * (k + 1) / steps
        da = d0 - dep * k / steps
        c.box(f, u0, u1, zb if k == 0 else zb + h * k / steps, z, da - dep / steps, da, 'WOOD_LIGHT', skip=('in',) if k else ())
        if c.lod:
            continue
        if kind == 'jars':
            n = int((u1 - u0) / 0.24)
            for i in range(n):
                uu = u0 + 0.14 + (u1 - u0 - 0.28) * i / max(n - 1, 1)
                p = f(uu, 0, da - dep / steps / 2)
                jar = K.lathe(c.bm, 6, [(0.08, z), (0.09, z + 0.2), (0.06, z + 0.24)], cx=p.x, cy=p.y, cap_bottom=False)
                K.map_cyl(c.bm, jar['sides'], c.R('CANDY'), cx=p.x, cy=p.y)
                c.m([jar['top']], 'LACQUER_RED'); c.nb(jar['sides'] + [jar['top']])
        elif kind == 'boxes':
            uu = u0 + 0.05
            while uu < u1 - 0.3:
                w = r.uniform(0.18, 0.32)
                c.box(f, uu, uu + w, z, z + r.uniform(0.06, 0.16), da - 0.25, da - 0.05,
                      r.choice(['BOX_PURPLE', 'BOX_YELLOW', 'BOX_ORANGE', 'WHITE', 'GREEN_TEA']), skip=('bot', 'in'))
                uu += w + 0.04
        elif kind == 'pots':
            n = int((u1 - u0) / 0.3)
            for i in range(n):
                uu = u0 + 0.16 + (u1 - u0 - 0.32) * i / max(n - 1, 1)
                p = f(uu, 0, da - dep / steps / 2)
                rr = r.uniform(0.07, 0.11)
                jar = K.lathe(c.bm, 6, [(rr * 0.7, z), (rr, z + rr * 1.4), (rr * 0.5, z + rr * 2.2)], cx=p.x, cy=p.y,
                              cap_bottom=False)
                c.m(jar['sides'] + [jar['top']], r.choice(['POT_CLAY', 'INDIGO', 'WHITE', 'BLACK'])); c.nb(jar['sides'])


def cask(c, f, u, d, r=0.3, z=0.0):
    """Straw-wrapped sake cask (komodaru) with the brand painted on."""
    p = f(u, 0, d)
    s = K.lathe(c.bm, 8, [(r * 0.92, z), (r, z + 0.25), (r * 0.92, z + 0.5)], cx=p.x, cy=p.y, cap_bottom=False)
    c.m(s['sides'], 'STRAW'); c.m([s['top']], 'WOOD_LIGHT'); c.nb(s['sides'])
    if c.lod == 0:
        for zz in (z + 0.08, z + 0.42):
            b = K.lathe(c.bm, 8, [(r * 0.97 + 0.01, zz), (r * 0.97 + 0.01, zz + 0.03)], cx=p.x, cy=p.y,
                        cap_bottom=False, cap_top=False)
            c.m(b['sides'], 'LACQUER_RED'); c.nb(b['sides'])


def bench(c, f, u, d, parasol=True, w=1.8):
    """Shōgi bench with red felt (mōsen) and a red parasol (nodate-gasa)."""
    c.box(f, u - w / 2, u + w / 2, 0.4, 0.46, d - 0.3, d + 0.3, 'FELT_RED', bevel=True)
    for uu in (u - w / 2 + 0.1, u + w / 2 - 0.1):
        for dd in (d - 0.22, d + 0.22):
            c.box(f, uu - 0.03, uu + 0.03, 0.0, 0.4, dd - 0.03, dd + 0.03, 'WOOD_LIGHT', skip=('bot', 'top'))
    if parasol:
        p = f(u + w / 2 + 0.2, 0, d)
        c.tube([(p.x, p.y, 0.0), (p.x, p.y, 2.4)], 0.025, 4, 'BAMBOO')
        n = 12 if c.lod == 0 else 8
        cone = K.lathe(c.bm, n, [(1.3, 2.05), (0.0, 2.45)], cx=p.x, cy=p.y, cap_bottom=True)
        c.m(cone['sides'], 'PARASOL_RED'); c.m([cone['bottom']], 'PARASOL_RED'); c.nb(cone['sides'])


def buckets(c, f, u, d):
    """Red fire buckets stacked 3-2-1 on a little stand (防火用水)."""
    c.box(f, u - 0.45, u + 0.45, 0.0, 0.45, d - 0.2, d + 0.2, 'WOOD_DARK', skip=('bot',))
    k = 0
    for row, n in enumerate((3, 2, 1)):
        for i in range(n):
            uu = u + (i - (n - 1) / 2) * 0.28
            p = f(uu, 0, d)
            z = 0.45 + row * 0.24
            b = K.lathe(c.bm, 8 if c.lod == 0 else 6, [(0.1, z), (0.13, z + 0.24)], cx=p.x, cy=p.y, cap_bottom=False)
            K.map_cyl(c.bm, b['sides'], c.R('BUCKET'), cx=p.x, cy=p.y, seam=math.atan2(-f.n.y, -f.n.x))
            c.m([b['top']], 'BUCKET_RED'); c.nb(b['sides'] + [b['top']])
            k += 1


def sudare(c, f, u0, u1, z0, z1, d):
    """Bamboo blind hung from the eave, partly rolled up."""
    b = c.box(f, u0, u1, z0, z1, d - 0.006, d + 0.006, None, skip=('in',) if c.lod else ())
    for k in ('out', 'in'):
        if k in b:
            c.span([b[k]], 'SUDARE', f.t)
    c.m([x for k, x in b.items() if k not in ('out', 'in')], 'BAMBOO')
    if c.lod == 0:
        c.tube([f(u0 - 0.03, z0, d + 0.03), f(u1 + 0.03, z0, d + 0.03)], 0.04, 6, 'BAMBOO')   # rolled part


def pots(c, f, u0, u1, d, seed=0):
    """Row of potted plants along the wall (roji gardening): clay and glazed
    pots with a leafy ball."""
    import random
    r = random.Random(seed)
    u = u0
    while u < u1:
        rr = r.uniform(0.13, 0.22)
        p = f(u + rr, 0, d + r.uniform(-0.05, 0.08))
        pot = K.lathe(c.bm, 6, [(rr * 0.7, 0.0), (rr, rr * 1.6)], cx=p.x, cy=p.y, cap_bottom=False)
        c.m(pot['sides'], r.choice(['POT_CLAY', 'INDIGO', 'STONE'])); c.m([pot['top']], 'POT_CLAY')
        c.nb(pot['sides'])
        if c.lod == 0:
            lr = rr * r.uniform(1.1, 1.7)
            z = rr * 1.6
            leaf = K.lathe(c.bm, 6, [(0.0, z), (lr, z + lr * 0.6), (lr * 0.7, z + lr * 1.3), (0.0, z + lr * 1.6)],
                           cx=p.x, cy=p.y, phase=r.random())
            c.m(leaf['sides'], 'LEAF'); c.nb(leaf['sides'])
        u += 2 * rr + r.uniform(0.04, 0.2)


def menu_stand(c, f, u, d):
    b = c.box(f, u - 0.26, u + 0.26, 0.55, 1.25, d - 0.03, d + 0.01, None)
    c.m([b['out']], 'MENU'); c.m([x for k, x in b.items() if k != 'out'], 'WOOD_DARK')
    for uu in (u - 0.22, u + 0.22):
        c.box(f, uu - 0.02, uu + 0.02, 0.0, 1.3, d - 0.1, d - 0.04, 'WOOD_DARK', skip=('bot',))


def lamp(c, f, u, z, d=0.35):
    """Wall lamp: square paper lantern (andon) on a wooden bracket."""
    c.box(f, u - 0.03, u + 0.03, z + 0.4, z + 0.46, 0.0, d, 'WOOD_DARK')
    b = c.box(f, u - 0.13, u + 0.13, z, z + 0.36, d - 0.13, d + 0.13, 'LIT_WARM', skip=('bot',))
    c.box(f, u - 0.16, u + 0.16, z + 0.36, z + 0.41, d - 0.16, d + 0.16, 'WOOD_DARK')
