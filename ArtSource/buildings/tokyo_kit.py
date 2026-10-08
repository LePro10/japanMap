"""Tokyo building kit: wall profile + modules that fill wall cells.

A building is a wall profile swept once round a rectangular footprint
(floor bands, sills, lintels, parapet with coping: K.sweep_loop, mitred
corners). Openings are cells of that sweep (edge, u range, floor, rows) that
a module fills: window, shop front, izakaya, shutter, entrance, steel door.
Everything else (balconies, corridors, stairs, AC units, signs, roof plant)
is placed on wall frames. All parts work in a local frame F: u along the
wall, z up, d out of the wall - so one module works on every side.

LOD1 uses the same rows (openings land in the same place) without bands,
reveals, frames and small parts.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

ATLAS = 'Tokyo'
ZV = Vector((0, 0, 1))
FLAT = {'TILE_BEIGE': 'TILE_FLAT', 'ALC_WHITE': 'ALC_FLAT', 'TILE_BROWN': 'BROWN_FLAT'}
STRIP_H = 2.0          # height of the wall strips (m): faces taller than this are split by rows


def R(name):
    return A.region(ATLAS, name)


def m(bm, faces, name, **kw):
    K.map_faces(bm, [f for f in faces if f is not None], R(name), **kw)


def nb(bm, faces):
    K.nobevel(bm, [f for f in faces if f is not None])


# ── frames ──────────────────────────────────────────────────────────────────

class F:
    """Local frame on a wall: L(u, z, d) = o + t*u + n*d + z. t = (-n.y, n.x)
    like K._face_st, so graphics read the right way round on every side."""

    def __init__(self, o, n, u0=0.0, u1=0.0, z0=0.0, z1=0.0):
        n = Vector((n[0], n[1], 0)).normalized()
        self.o, self.n = Vector(o), n
        self.t = Vector((-n.y, n.x, 0))
        self.u0, self.u1, self.z0, self.z1 = u0, u1, z0, z1

    @classmethod
    def of(cls, face):
        face.normal_update()
        n = face.normal.copy(); n.z = 0; n.normalize()
        f = cls(Vector(), n)
        vs = [v.co for v in face.verts]
        us = [c.dot(f.t) for c in vs]; zs = [c.z for c in vs]
        f.o = n * vs[0].dot(n)
        f.u0, f.u1, f.z0, f.z1 = min(us), max(us), min(zs), max(zs)
        return f

    def __call__(self, u, z, d=0.0):
        p = self.o + self.t * u + self.n * d
        return Vector((p.x, p.y, z))

    @property
    def w(self):
        return self.u1 - self.u0

    @property
    def uc(self):
        return (self.u0 + self.u1) / 2


def orient(faces, centre):
    for f in faces:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - centre) < 0:
            f.normal_flip()


def lbox(bm, f, u0, u1, z0, z1, d0, d1, skip=()):
    """Box in frame f. Keys: out (d1), in (d0), top, bot, l (u0), r (u1)."""
    v = {(a, b, c): bm.verts.new(f(u, z, d)) for a, u in enumerate((u0, u1))
         for b, z in enumerate((z0, z1)) for c, d in enumerate((d0, d1))}
    quads = {'out': [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], 'in': [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)],
             'top': [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)], 'bot': [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],
             'l': [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)], 'r': [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]}
    out = {k: bm.faces.new([v[i] for i in q]) for k, q in quads.items() if k not in skip}
    for vv in v.values():
        if not vv.link_faces:
            bm.verts.remove(vv)
    orient(out.values(), f((u0 + u1) / 2, (z0 + z1) / 2, (d0 + d1) / 2))
    return out


def tube(bm, pts, r, n=4, reg='GALV', caps=False):
    s, c0, c1 = K.tube_path(bm, pts, r, n, cap0=caps, cap1=caps)
    fs = s + [c0, c1]
    m(bm, fs, reg); nb(bm, fs)
    return fs


def mirror_uv(bm, faces, name):
    uv = bm.loops.layers.uv.verify()
    u0, _, u1, _ = R(name)['uv']
    for f in faces:
        for l in f.loops:
            l[uv].uv = (u0 + u1 - l[uv].uv[0], l[uv].uv[1])


# ── wall profile ────────────────────────────────────────────────────────────

def profile(floors, lod, parapet=0.85):
    """floors: [(kind, height)], kind 'shop' | 'res_ground' | 'res'.
    Returns points (d, z), per-segment meta dicts and the roof level."""
    pts, meta = [], []

    def seg(d, z, name, fl, kind='wall'):
        pts.append((d, z)); meta.append(dict(name=name, floor=fl, kind=kind))

    z = 0.0
    for fl, (kind, h) in enumerate(floors):
        if kind == 'shop':
            rows = [(0.15, 'plinth'), (1.0, 'low'), (2.4, 'mid'), (3.0, 'transom'), (h, 'fascia')]
            if lod == 0:
                seg(0.03, 0.0, 'plinth', fl, 'plinth'); seg(0.03, 0.15, 'plinth_top', fl, 'hz')
                rows = rows[1:]
                seg(0.0, 0.15, 'low', fl)
            else:
                seg(0.0, 0.0, 'low', fl); rows = rows[1:]
            for (zt, _), (_, nxt) in zip(rows, rows[1:]):
                seg(0.0, z + zt, nxt, fl)
        else:
            base = 0.45 if kind == 'res_ground' else 0.2
            rows = [(base, 'spandrel'), (1.0, 'win'), (h - 0.4, 'lintel')]
            if lod == 0:
                if kind == 'res_ground':
                    seg(0.03, z, 'plinth', fl, 'plinth'); seg(0.03, z + base, 'plinth_top', fl, 'hz')
                else:
                    seg(0.06, z, 'band', fl, 'band'); seg(0.06, z + base, 'band_top', fl, 'hz')
                seg(0.0, z + base, 'spandrel', fl)
            else:
                seg(0.0, z, 'band', fl, 'band'); seg(0.0, z + base, 'spandrel', fl)
            seg(0.0, z + 1.0, 'win', fl); seg(0.0, z + h - 0.4, 'lintel', fl)
        z += h
    roof = z
    if lod == 0:
        seg(0.0, z, 'parapet', len(floors))
        seg(0.0, z + parapet - 0.1, 'coping_lo', len(floors), 'hz')
        seg(0.035, z + parapet - 0.1, 'coping', len(floors), 'coping')
        seg(0.035, z + parapet, 'coping_top', len(floors), 'coping')
        seg(-0.22, z + parapet, 'parapet_in', len(floors), 'inner')
        pts.append((-0.22, z + 0.12))
    else:
        seg(0.0, z, 'parapet', len(floors))
        seg(0.0, z + parapet, 'coping_top', len(floors), 'coping')
        seg(-0.22, z + parapet, 'parapet_in', len(floors), 'inner')
        pts.append((-0.22, z + 0.12))
    # kind 'hz' / horizontal faces have no height; the first point of a
    # floor is that floor's base
    return pts, meta, roof


class Shell:
    """The swept walls of one building and their cells."""

    def __init__(self, bm, W, D, floors, walls, lod, openings):
        self.bm, self.W, self.D, self.lod = bm, W, D, lod
        self.walls = walls
        self.corners = [(-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, D / 2), (-W / 2, D / 2)]
        self.len = [W, D, W, D]
        pts, self.meta, self.roof = profile(floors, lod)
        self.pts = pts
        self.floor_z = [0.0]
        for _, h in floors:
            self.floor_z.append(self.floor_z[-1] + h)
        splits = {e: set() for e in range(4)}
        for op in openings:
            for u in op['u']:
                if 1e-4 < u < self.len[op['e']] - 1e-4:
                    splits[op['e']].add(round(u, 4))
        self.bnd = {e: [0.0] + sorted(splits[e]) + [self.len[e]] for e in range(4)}
        self.faces = K.sweep_loop(bm, self.corners, pts,
                                  {e: [u / self.len[e] for u in sorted(splits[e])] for e in range(4)})
        self.used = set()
        self.openings = openings

    def frame(self, e):
        """Frame on the wall line of edge e: u from the edge start."""
        c0 = Vector((*self.corners[e], 0)); c1 = Vector((*self.corners[(e + 1) % 4], 0))
        t = (c1 - c0).normalized()
        f = F(c0, (t.y, -t.x))
        f.u0, f.u1 = 0.0, self.len[e]
        return f

    def cell(self, e, u, fl, rows):
        """Merge the cells of an opening into one face."""
        ks = [k for k, mt in enumerate(self.meta) if mt['floor'] == fl and mt['name'] in rows]
        b = self.bnd[e]
        js = [j for j in range(len(b) - 1) if b[j] >= u[0] - 1e-4 and b[j + 1] <= u[1] + 1e-4]
        fs = [self.faces[k][e][j] for k in ks for j in js]
        for k in ks:
            for j in js:
                self.used.add((k, e, j))
        return K.merge(self.bm, fs) if len(fs) > 1 else fs[0]

    def map_walls(self):
        bm = self.bm
        for k, mt in enumerate(self.meta):
            z_lo = self.pts[k][1]; z_hi = self.pts[k + 1][1]
            for e in range(4):
                fs = [f for j, f in enumerate(self.faces[k][e]) if (k, e, j) not in self.used]
                wall = self.walls[e]
                kind = mt['kind']
                if kind == 'wall':
                    # strips are 2 m: start the strip at the lowest row of this floor
                    # that still keeps the face inside it
                    fz = [p[1] for kk, p in enumerate(self.pts[:-1])
                          if self.meta[kk]['floor'] == mt['floor'] and self.meta[kk]['kind'] == 'wall']
                    z0 = min([b for b in fz if z_hi - b <= STRIP_H + 1e-6] or [z_lo])
                    m(bm, fs, wall, z0=z0)
                elif kind == 'plinth':
                    m(bm, fs, 'GRANITE')
                elif kind == 'coping':
                    m(bm, fs, 'ALU')
                elif kind == 'inner':
                    m(bm, fs, FLAT[wall])
                else:   # band faces and the small horizontal ledges
                    m(bm, fs, FLAT[wall])
        # roof surface inside the parapet
        r = self.roof + 0.12
        x, y = self.W / 2 - 0.22, self.D / 2 - 0.22
        top = bm.faces.new([bm.verts.new(p) for p in ((-x, -y, r), (x, -y, r), (x, y, r), (-x, y, r))])
        top.normal_update()
        if top.normal.z < 0:
            top.normal_flip()
        m(bm, [top], 'ROOF_GREEN')
        return top


# ── modules for openings ────────────────────────────────────────────────────

def hole(bm, face, depth, reveal):
    """Push a wall cell in: the inset ring becomes the reveal."""
    floor, walls = K.recess(bm, face, 0.0, depth)
    m(bm, walls, reveal); nb(bm, walls)   # reveals sit in shadow: a bevel there costs and shows nothing
    return floor


def grid_on(bm, floor, us, zs):
    """Replace a face by a grid on the same plane (shop front panels)."""
    f = F.of(floor)
    bm.faces.remove(floor)
    return f, K.grid_plane(bm, lambda u, z: f(u, z), us, zs, f.n)


def window(bm, face, ctx, glass='WIN_DARK', sash='ALU', mull=1, grille=False, mirror=False, ac=None, sill=True):
    """Aluminium sash window: reveal, frame ring, sliding sashes (mullion),
    flashing sill; optional ground-floor grille and AC unit below."""
    lod, reveal = ctx['lod'], ctx['reveal']
    f0 = F.of(face)
    if lod:
        fl = hole(bm, face, 0.06, reveal)
        m(bm, [fl], glass)
        if mirror:
            mirror_uv(bm, [fl], glass)
        return f0
    fl = hole(bm, face, 0.1, reveal)
    gl, ring = K.recess(bm, fl, 0.045, 0.025)
    m(bm, ring, sash); m(bm, [gl], glass); nb(bm, ring + [gl])
    if mirror:
        mirror_uv(bm, [gl], glass)
    f = F.of(gl)
    for k in range(1, mull + 1):
        u = f.u0 + f.w * k / (mull + 1)
        b = lbox(bm, f, u - 0.022, u + 0.022, f.z0, f.z1, 0.0, 0.03, skip=('in',))
        m(bm, b.values(), sash); nb(bm, b.values())
    if sill:
        b = lbox(bm, f0, f0.u0 - 0.03, f0.u1 + 0.03, f0.z0 - 0.045, f0.z0, -0.02, 0.06, skip=('in',))
        m(bm, b.values(), 'ALU'); nb(bm, b.values())
    if grille:   # men-gōshi: aluminium bars in front of low windows
        n = max(3, int(f0.w / 0.13))
        for i in range(1, n):
            u = f0.u0 + f0.w * i / n
            b = lbox(bm, f0, u - 0.012, u + 0.012, f0.z0 + 0.03, f0.z1 - 0.03, 0.03, 0.055, skip=('in', 'top', 'bot'))
            m(bm, b.values(), 'ALU'); nb(bm, b.values())
        for zz in (f0.z0 + 0.03, f0.z1 - 0.06):
            b = lbox(bm, f0, f0.u0 - 0.02, f0.u1 + 0.02, zz, zz + 0.03, 0.0, 0.06, skip=('in', 'l', 'r'))
            m(bm, b.values(), 'ALU'); nb(bm, b.values())
    if ac:
        ac_wall(bm, f0, f0.uc + (ac if isinstance(ac, float) else 0.0), f0.z0 - 0.75, lod, duct_to=f0.z0 + 0.15)
    return f0


def ac_wall(bm, f, u, z, lod, duct_to=None, side=1):
    """Outdoor AC unit on a wall bracket, with the cream pipe cover running to
    the wall hole - on every Japanese facade."""
    unit = lbox(bm, f, u - 0.39, u + 0.39, z, z + 0.55, 0.07, 0.35)
    m(bm, [unit['out']], 'AC_FRONT'); m(bm, [x for k, x in unit.items() if k != 'out'], 'AC_IVORY')
    if lod:
        return
    nb(bm, unit.values())
    for du in (-0.27, 0.27):
        arm = lbox(bm, f, u + du - 0.02, u + du + 0.02, z - 0.04, z, 0.0, 0.38, skip=('in',))
        m(bm, arm.values(), 'GALV'); nb(bm, arm.values())
        tube(bm, [f(u + du, z - 0.42, 0.01), f(u + du, z - 0.03, 0.35)], 0.014, 4)
    if duct_to is not None:
        us = u + side * 0.39
        c = lbox(bm, f, min(us, us + side * 0.16), max(us, us + side * 0.16), z + 0.3, z + 0.39, 0.03, 0.2)
        uv = us + side * 0.08
        v = lbox(bm, f, uv - 0.045, uv + 0.045, z + 0.3, max(duct_to, z + 0.5), 0.0, 0.085)
        m(bm, list(c.values()) + list(v.values()), 'PIPE_COVER'); nb(bm, list(c.values()) + list(v.values()))


def ac_floor(bm, f, u, z, d0, lod):
    """AC unit standing on a balcony or roof, facing +d."""
    unit = lbox(bm, f, u - 0.39, u + 0.39, z + 0.08, z + 0.63, d0, d0 + 0.28)
    m(bm, [unit['out']], 'AC_FRONT'); m(bm, [x for k, x in unit.items() if k != 'out'], 'AC_IVORY')
    nb(bm, unit.values())
    if not lod:
        for du in (-0.3, 0.3):
            b = lbox(bm, f, u + du - 0.05, u + du + 0.05, z, z + 0.08, d0 - 0.02, d0 + 0.3, skip=('bot',))
            m(bm, b.values(), 'CONCRETE'); nb(bm, b.values())


def storefront(bm, face, ctx, panels, kick=0.3, top=0.32):
    """Konbini glass front: aluminium kick plate and transom, glass panels
    showing the lit shop (magazine rack, shelves), automatic door pair."""
    lod = ctx['lod']
    fl = hole(bm, face, 0.12 if lod else 0.18, 'ALU')
    f = F.of(fl)
    n = len(panels)
    us = [f.u0 + f.w * i / n for i in range(n + 1)]
    zs = [f.z0, f.z0 + kick, f.z1 - top, f.z1]
    f, g = grid_on(bm, fl, us, zs)
    names = {'A': 'KONBINI_INT_A', 'B': 'KONBINI_INT_B', 'door': 'AUTO_DOOR', 'door2': 'AUTO_DOOR'}
    for i, p in enumerate(panels):
        m(bm, [g[i, 0], g[i, 2]], 'ALU')
        m(bm, [g[i, 1]], names[p])
        if p == 'door2':
            mirror_uv(bm, [g[i, 1]], 'AUTO_DOOR')
        nb(bm, [g[i, 1]])
    if lod:
        return f
    for u in us:
        b = lbox(bm, f, u - 0.03, u + 0.03, f.z0 + kick, f.z1 - top, 0.0, 0.07, skip=('in',))
        m(bm, b.values(), 'ALU'); nb(bm, b.values())
    for zz in (f.z0 + kick, f.z1 - top):
        b = lbox(bm, f, f.u0, f.u1, zz - 0.03, zz + 0.03, 0.0, 0.06, skip=('in', 'l', 'r'))
        m(bm, b.values(), 'ALU'); nb(bm, b.values())
    di = [i for i, p in enumerate(panels) if p.startswith('door')]
    if di:   # door engine box over the automatic door
        b = lbox(bm, f, us[di[0]] - 0.05, us[di[-1] + 1] + 0.05, f.z1 - top + 0.04, f.z1 - 0.04, 0.0, 0.16, skip=('in',))
        m(bm, b.values(), 'ALU'); nb(bm, b.values())
    return f


def fascia_box(bm, f, u0, u1, z0, z1, depth, sign='KONBINI_FASCIA', ends=(True, True), lights=0):
    """Lit sign band over a shop front; underside with small downlights."""
    b = lbox(bm, f, u0, u1, z0, z1, 0.0, depth, skip=('in',) + (() if ends[0] else ('l',)) + (() if ends[1] else ('r',)))
    m(bm, [b['out']], sign)
    m(bm, [b['top']], 'ALU')
    m(bm, [b[k] for k in ('l', 'r') if k in b], 'KONBINI_BLUE')
    m(bm, [b['bot']], 'ALU')
    for i in range(lights):
        u = u0 + (u1 - u0) * (i + 0.5) / lights
        d = lbox(bm, f, u - 0.08, u + 0.08, z0 - 0.012, z0, depth * 0.45, depth * 0.45 + 0.16, skip=('top',))
        m(bm, d.values(), 'LIT_COOL'); nb(bm, d.values())
    return b


def izakaya(bm, face, ctx, lanterns=True):
    """Deep-set izakaya entrance: wooden slat walls, lit lattice sliding door
    (koshi-do), noren on a pole, two red lanterns, small metal eave."""
    lod = ctx['lod']
    f0 = F.of(face)
    fl = hole(bm, face, 0.45 if not lod else 0.3, 'WOOD_DARK')
    f = F.of(fl)
    dw = min(1.8, f.w - 0.6)
    ua, ub = f.uc - dw / 2, f.uc + dw / 2
    zd = f.z0 + 2.0
    f, g = grid_on(bm, fl, [f.u0, ua, ub, f.u1], [f.z0, zd, f.z1])
    m(bm, [g[1, 0]], 'LIT_WARM'); nb(bm, [g[1, 0]])
    m(bm, [g[0, 0], g[2, 0], g[0, 1], g[1, 1], g[2, 1]], 'WOOD_DARK')   # behind the battens: a cell, no grain to stretch
    out = []
    if not lod:
        # lattice door: stiles, rails and close vertical bars
        for u0_, u1_ in ((ua, ua + 0.05), (ub - 0.05, ub), (f.uc - 0.025, f.uc + 0.025)):
            out.append(lbox(bm, f, u0_, u1_, f.z0, zd, 0.0, 0.06, skip=('in',)))
        for zz in (f.z0, f.z0 + 0.9, zd - 0.06):
            out.append(lbox(bm, f, ua, ub, zz, zz + 0.06, 0.0, 0.05, skip=('in',)))
        n = int(dw / 0.085)
        for i in range(1, n):
            u = ua + dw * i / n
            out.append(lbox(bm, f, u - 0.012, u + 0.012, f.z0 + 0.9, zd - 0.06, 0.0, 0.035, skip=('in', 'top', 'bot')))
        fs = [x for b in out for x in b.values()]
        m(bm, fs, 'WOOD_DARK'); nb(bm, fs)
        # battens on the side walls
        bat = []
        for a, b_ in ((f.u0, ua), (ub, f.u1)):
            k = max(1, int((b_ - a) / 0.1))
            for i in range(k):
                u = a + (b_ - a) * (i + 0.5) / k
                bat.append(lbox(bm, f, u - 0.02, u + 0.02, f.z0, f.z1, 0.0, 0.04, skip=('in', 'top', 'bot')))
        fs = [x for b in bat for x in b.values()]
        m(bm, fs, 'WOOD_DARK', rotate=True); nb(bm, fs)
        # noren: three panels on a pole
        pw = dw / 3
        pan = []
        for i in range(3):
            pa = ua + i * pw + 0.012
            pan.append(lbox(bm, f, pa, pa + pw - 0.024, zd - 0.8, zd - 0.02, 0.12, 0.13))
        K.map_span(bm, [p['out'] for p in pan], R('NOREN'), f.t)
        m(bm, [x for p in pan for k, x in p.items() if k != 'out'], 'NOREN_NAVY')
        nb(bm, [x for p in pan for x in p.values()])
        tube(bm, [f(ua - 0.1, zd - 0.01, 0.125), f(ub + 0.1, zd - 0.01, 0.125)], 0.018, 6, 'WOOD_DARK', caps=True)
        # menu board inside the entrance
        mb = lbox(bm, f, f.u0 + 0.12, f.u0 + 0.58, f.z0 + 0.45, f.z0 + 1.15, 0.2, 0.24)
        m(bm, [mb['out']], 'MENU'); m(bm, [x for k, x in mb.items() if k != 'out'], 'WOOD_DARK')
        for du in (0.16, 0.42):
            lg = lbox(bm, f, f.u0 + du - 0.015, f.u0 + du + 0.015, f.z0, f.z0 + 0.46, 0.2, 0.23, skip=('top', 'bot'))
            m(bm, lg.values(), 'WOOD_DARK'); nb(bm, lg.values())
    # eave over the entrance (bronze sheet on brackets)
    ev = lbox(bm, f0, f0.u0 - 0.15, f0.u1 + 0.15, f0.z1 - 0.02, f0.z1 + 0.1, 0.0, 0.75)
    for v in {v for x in (ev['out'],) for v in x.verts}:
        v.co.z -= 0.15
    m(bm, [ev['top']], 'ALU_BRONZE'); m(bm, [x for k, x in ev.items() if k != 'top'], 'WOOD_DARK')
    if lanterns:
        for u in (f0.u0 + 0.35, f0.u1 - 0.35):
            lantern(bm, f0, u, f0.z1 - 0.95, 0.42, lod)
    return f0


def lantern(bm, f, u, z, d, lod):
    """Red paper lantern (akachōchin) hanging from a hook, 酒 on it."""
    c = f(u, 0, d)
    n = 10 if not lod else 6
    prof = [(0.12, 0.0), (0.17, 0.07), (0.195, 0.25), (0.17, 0.43), (0.12, 0.5)]
    body = K.lathe(bm, n, [(r, z + h) for r, h in prof], cx=c.x, cy=c.y, cap_bottom=False, cap_top=False)
    reg = R('LANTERN')
    seam = math.atan2(-f.n.y, -f.n.x)   # seam to the wall side
    K.map_cyl(bm, body['sides'], reg, cx=c.x, cy=c.y, seam=seam)
    nb(bm, body['sides'])
    for z0, z1 in ((z - 0.04, z), (z + 0.5, z + 0.54)):
        cap = K.lathe(bm, n, [(0.125, z0), (0.125, z1)], cx=c.x, cy=c.y, cap_bottom=z0 < z, cap_top=z0 > z)
        fs = cap['sides'] + [cap['bottom'], cap['top']]
        m(bm, fs, 'BLACK'); nb(bm, fs)
    if not lod:
        tube(bm, [f(u, z + 0.54, d), f(u, z + 0.75, d), f(u, z + 0.75, 0.0)], 0.008, 3, 'BLACK')


def shutter(bm, face, ctx):
    """Closed shop: rolling shutter in guide rails, shutter case above."""
    f0 = F.of(face)
    fl = hole(bm, face, 0.1, 'GALV')
    m(bm, [fl], 'SHUTTER')
    case = lbox(bm, f0, f0.u0 - 0.06, f0.u1 + 0.06, f0.z1, f0.z1 + 0.42, 0.0, 0.3, skip=('in',))
    m(bm, case.values(), 'GALV')
    if not ctx['lod']:
        for u in (f0.u0 + 0.02, f0.u1 - 0.02):
            r = lbox(bm, f0, u - 0.035, u + 0.035, f0.z0, f0.z1, -0.1, 0.02, skip=('in', 'bot'))
            m(bm, r.values(), 'GALV'); nb(bm, r.values())
        hd = lbox(bm, f0, f0.uc - 0.1, f0.uc + 0.1, f0.z0 + 0.06, f0.z0 + 0.1, -0.1, -0.06, skip=('in',))
        m(bm, hd.values(), 'BLACK'); nb(bm, hd.values())
    return f0


def entrance(bm, face, ctx, canopy=True, mailbox=False, plate=None):
    """Building entrance: deep granite reveal, glass door into the lit lobby,
    small concrete canopy with a downlight."""
    f0 = F.of(face)
    fl = hole(bm, face, 0.35 if not ctx['lod'] else 0.2, 'GRANITE')
    if not ctx['lod']:
        gl, ring = K.recess(bm, fl, 0.05, 0.02)
        m(bm, ring, 'ALU'); nb(bm, ring)
        fl = gl
    m(bm, [fl], 'LOBBY')
    if canopy:
        c = lbox(bm, f0, f0.u0 - 0.35, f0.u1 + 0.35, f0.z1 + 0.05, f0.z1 + 0.18, 0.0, 0.95, skip=('in',))
        m(bm, [c['bot']], 'ALC_FLAT'); m(bm, [x for k, x in c.items() if k != 'bot'], 'CONCRETE')
        lt = lbox(bm, f0, f0.uc - 0.08, f0.uc + 0.08, f0.z1 + 0.035, f0.z1 + 0.05, 0.45, 0.61, skip=('top',))
        m(bm, lt.values(), 'LIT_WARM'); nb(bm, lt.values())
    if mailbox:
        u = f0.u1 + 0.25
        b = lbox(bm, f0, u, u + 0.62, 0.95, 1.55, 0.0, 0.3, skip=('in',))
        m(bm, [b['out']], 'MAILBOX'); m(bm, [x for k, x in b.items() if k != 'out'], 'PAINT_GREY')
    if plate:
        u = f0.u0 - 0.25 - 0.9
        b = lbox(bm, f0, u, u + 0.9, 1.5, 1.72, 0.0, 0.025, skip=('in',))
        m(bm, [b['out']], plate); m(bm, [x for k, x in b.items() if k != 'out'], 'ALU'); nb(bm, b.values())
    return f0


def steel_door(bm, face, ctx, meter=True):
    f0 = F.of(face)
    fl = hole(bm, face, 0.06, 'ALU')
    m(bm, [fl], 'DOOR_STEEL')
    if not ctx['lod']:
        f = F.of(fl)
        h = lbox(bm, f, f.u1 - 0.2, f.u1 - 0.08, f.z0 + 0.95, f.z0 + 1.0, 0.0, 0.06, skip=('in',))
        m(bm, h.values(), 'ALU'); nb(bm, h.values())
        if meter:
            b = lbox(bm, f0, f0.u1 + 0.12, f0.u1 + 0.42, f0.z0 + 1.45, f0.z0 + 1.75, 0.0, 0.14, skip=('in',))
            m(bm, [b['out']], 'METER'); m(bm, [x for k, x in b.items() if k != 'out'], 'PAINT_GREY'); nb(bm, b.values())
    return f0


MODULES = {'window': window, 'storefront': storefront, 'izakaya': izakaya, 'shutter': shutter,
           'entrance': entrance, 'steel_door': steel_door}

ROWS = {'window': ('win',), 'tall': ('spandrel', 'win'), 'door': ('spandrel', 'win'),
        'shop': ('low', 'mid', 'transom'), 'shop_low': ('low', 'mid'), 'shop_mid': ('mid',)}


# ── parts on frames ─────────────────────────────────────────────────────────

def balcony(bm, f, u0, u1, zf, lod, ends=(False, False), partition=(False, False), ac=True, pole=True,
            ceiling=None, depth=1.3):
    """Mansion balcony: slab, tiled upstand + frosted panel + rail,
    fire-escape partitions between units, AC unit, laundry pole."""
    sk = tuple(k for k, e in (('l', ends[0]), ('r', ends[1])) if not e)
    s = lbox(bm, f, u0, u1, zf, zf + 0.2, 0.0, depth, skip=('in',) + sk)
    m(bm, [s['top']], 'ROOF_GREEN'); m(bm, [s['bot']], 'ALC_FLAT')
    m(bm, [x for k, x in s.items() if k in ('out', 'l', 'r')], 'TILE_FLAT')
    up = lbox(bm, f, u0, u1, zf + 0.2, zf + 0.7, depth - 0.12, depth, skip=('bot',) + sk)
    m(bm, [up['out']], 'TILE_BEIGE', z0=zf + 0.2)
    m(bm, [x for k, x in up.items() if k != 'out'], 'TILE_FLAT')
    pn = lbox(bm, f, u0 + 0.03, u1 - 0.03, zf + 0.7, zf + 1.12, depth - 0.07, depth - 0.05, skip=('bot', 'top'))
    m(bm, pn.values(), 'FROSTED'); nb(bm, pn.values())
    rail = lbox(bm, f, u0, u1, zf + 1.12, zf + 1.17, depth - 0.1, depth - 0.02, skip=sk)
    m(bm, rail.values(), 'ALU'); nb(bm, rail.values())
    if lod:
        return
    for u in (u0 + 0.03, u1 - 0.03):
        p = lbox(bm, f, u - 0.025, u + 0.025, zf + 0.7, zf + 1.12, depth - 0.09, depth - 0.03, skip=('top', 'bot'))
        m(bm, p.values(), 'ALU'); nb(bm, p.values())
    for side, u in ((0, u0), (1, u1)):
        if partition[side]:
            p = lbox(bm, f, u - 0.015, u + 0.015, zf + 0.2, zf + 2.0, 0.05, depth - 0.14, skip=('bot', 'in'))
            m(bm, [p['l'], p['r']], 'PARTITION'); m(bm, [p['out'], p['top']], 'ALU'); nb(bm, p.values())
    if ac:
        ac_floor(bm, f, u1 - 0.65, zf + 0.2, 0.12, lod)
    if pole and ceiling:
        zp = ceiling - 0.45
        for u in (u0 + 0.5, u1 - 0.5):
            tube(bm, [f(u, ceiling, depth - 0.35), f(u, zp, depth - 0.35)], 0.012, 4, 'ALU')
        tube(bm, [f(u0 + 0.3, zp, depth - 0.35), f(u1 - 0.3, zp, depth - 0.35)], 0.016, 4, 'ALU')


def corridor(bm, f, u0, u1, zf, lod, depth=1.3, end_open=(False, True), lights=3):
    """Open access corridor (kyōyō rōka) along the back: slab, solid
    parapet wall with coping, small ceiling lights."""
    sk = tuple(k for k, e in (('l', end_open[0]), ('r', end_open[1])) if e)
    s = lbox(bm, f, u0, u1, zf, zf + 0.2, 0.0, depth, skip=('in',))
    m(bm, [s['top']], 'CONCRETE'); m(bm, [s['bot']], 'ALC_FLAT')
    m(bm, [x for k, x in s.items() if k in ('out', 'l', 'r')], 'ALC_FLAT')
    pw = lbox(bm, f, u0, u1, zf + 0.2, zf + 1.15, depth - 0.14, depth, skip=('bot',) + sk)
    m(bm, [pw['out'], pw['in']], 'ALC_WHITE', z0=zf + 0.2)
    m(bm, [x for k, x in pw.items() if k in ('l', 'r')], 'ALC_FLAT')
    m(bm, [pw['top']], 'ALU')
    if lod:
        return
    for i in range(lights):
        u = u0 + (u1 - u0) * (i + 0.5) / lights
        lt = lbox(bm, f, u - 0.12, u + 0.12, zf - 0.06, zf, 0.25, 0.4, skip=('top',))
        m(bm, lt.values(), 'LIT_COOL'); nb(bm, lt.values())


def _prism_d(bm, f, pts, d0, d1):
    """Closed (u, z) outline in frame f, extruded along d from d0 to d1;
    faces point outward (side normals from the outline's winding)."""
    a = [bm.verts.new(f(u, z, d0)) for u, z in pts]
    b = [bm.verts.new(f(u, z, d1)) for u, z in pts]
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sides = []
    for i in range(n):
        fc = bm.faces.new([a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]])
        du = pts[(i + 1) % n][0] - pts[i][0]; dz = pts[(i + 1) % n][1] - pts[i][1]
        out = (f.t * dz - ZV * du) * (1 if area > 0 else -1)
        fc.normal_update()
        if fc.normal.dot(out) < 0:
            fc.normal_flip()
        sides.append(fc)
    caps = [bm.faces.new(a), bm.faces.new(b)]
    for c, sg in zip(caps, (-1, 1)):
        c.normal_update()
        if c.normal.dot(f.n * sg) < 0:
            c.normal_flip()
    return sides, caps


def stair(bm, f, u0, levels, lod, width=1.1, run=2.4, landing=1.3, dirn=1):
    """Galvanised switch-back stair against a wall (frame f: u along the
    run, d out of the wall). From each level the outer flight runs from u0
    in direction dirn to a half landing, the inner flight returns; the
    arrival landing lies on the other side of u0 (towards the corridor)."""
    fs = []
    ue = u0 + dirn * run
    for zA, zB in zip(levels, levels[1:]):
        zm = (zA + zB) / 2
        for za, zb, d0, ua, ub in ((zA, zm, width, u0, ue), (zm, zB, 0.0, ue, u0)):
            n = 6 if not lod else 1
            pts = [(ua, za - 0.22)]
            for i in range(n):
                z1 = za + (zb - za) * (i + 1) / n
                pts += [(ua + (ub - ua) * i / n, z1), (ua + (ub - ua) * (i + 1) / n, z1)]
            pts += [(ub, zb - 0.22)]
            sides, caps = _prism_d(bm, f, pts, d0 + 0.02, d0 + width - 0.02)
            for fc in sides:
                fc.normal_update()
            m(bm, [x for x in sides if x.normal.z > 0.7], 'CONCRETE')
            m(bm, [x for x in sides if x.normal.z <= 0.7] + caps, 'DOOR_STEEL'); fs += sides + caps
            if d0 > 0:   # outer railing: solid galvanised sheet following the flight
                rv = [(ua, za + 0.05), (ub, zb + 0.05), (ub, zb + 1.1), (ua, za + 1.1)]
                s2, c2 = _prism_d(bm, f, rv, 2 * width, 2 * width + 0.03)
                m(bm, s2 + c2, 'DOOR_STEEL'); fs += s2 + c2
        for lo, hi, zz, far in (tuple(sorted((ue, ue + dirn * landing))) + (zm, True),
                                tuple(sorted((u0, u0 - dirn * landing))) + (zB, False)):
            ld = lbox(bm, f, lo, hi, zz - 0.2, zz, 0.0, 2 * width)
            parts = [ld, lbox(bm, f, lo, hi, zz, zz + 1.1, 2 * width, 2 * width + 0.03, skip=('bot',))]
            if far:
                ee = hi if dirn > 0 else lo - 0.03
                parts.append(lbox(bm, f, ee, ee + 0.03, zz, zz + 1.1, 0.0, 2 * width, skip=('bot',)))
            m(bm, [ld['top']], 'CONCRETE'); m(bm, [x for k, x in ld.items() if k != 'top'], 'DOOR_STEEL')
            for p in parts[1:]:
                m(bm, p.values(), 'DOOR_STEEL')
            fs += [x for p in parts for x in p.values()]
    for uu in (ue + dirn * (landing - 0.04), u0 - dirn * (landing - 0.04)):
        p = lbox(bm, f, uu - 0.05, uu + 0.05, 0.0, levels[-1], 2 * width - 0.05, 2 * width + 0.05, skip=('bot',))
        m(bm, p.values(), 'DOOR_STEEL'); fs += list(p.values())
    nb(bm, fs)


# ── signs ───────────────────────────────────────────────────────────────────

def tate_sign(bm, f, u, z0, lod, reg='TATE_A', h=5.1, w=0.85, out=0.3, thick=0.22):
    """Vertical tenant sign stack (tate-kanban): a lightbox standing out from
    the facade, graphic on both faces, held by three arms and braces."""
    b = lbox(bm, f, u - thick / 2, u + thick / 2, z0, z0 + h, out, out + w, skip=('in',))
    m(bm, [b['l']], reg); m(bm, [b['r']], reg)
    m(bm, [b['out'], b['top'], b['bot']], 'PAINT_GREY')
    nb(bm, [b['l'], b['r']])
    cap = lbox(bm, f, u - thick / 2 - 0.02, u + thick / 2 + 0.02, z0 + h, z0 + h + 0.08, out - 0.02, out + w + 0.03)
    m(bm, cap.values(), 'PAINT_GREY')
    if lod:
        arm = lbox(bm, f, u - 0.03, u + 0.03, z0 + 0.2, z0 + h - 0.2, 0.0, out, skip=('in',))
        m(bm, arm.values(), 'GALV')
        return
    for zz in (z0 + 0.25, z0 + h / 2, z0 + h - 0.25):
        arm = lbox(bm, f, u - 0.03, u + 0.03, zz - 0.03, zz + 0.03, 0.0, out + 0.1, skip=('in',))
        m(bm, arm.values(), 'GALV'); nb(bm, arm.values())
        pl = lbox(bm, f, u - 0.08, u + 0.08, zz - 0.09, zz + 0.09, 0.0, 0.015, skip=('in',))
        m(bm, pl.values(), 'GALV'); nb(bm, pl.values())
        tube(bm, [f(u, zz - 0.45, 0.01), f(u, zz - 0.03, out)], 0.012, 4)
    tube(bm, [f(u + thick / 2 - 0.02, z0 + h + 0.08, out + 0.1), f(u + thick / 2 - 0.02, z0 + h + 0.3, out + 0.1),
              f(u + thick / 2 - 0.02, z0 + h + 0.3, 0.0)], 0.01, 3, 'BLACK')


KANA = {   # neon strokes in a unit box (u, z)
    'su': [[(0.15, 0.85), (0.8, 0.85), (0.55, 0.5), (0.12, 0.08)], [(0.5, 0.42), (0.88, 0.08)]],
    'na': [[(0.08, 0.66), (0.92, 0.66)], [(0.56, 0.95), (0.56, 0.45), (0.45, 0.2), (0.22, 0.04)]],
    'tsu': [[(0.22, 0.52), (0.3, 0.38)], [(0.45, 0.56), (0.52, 0.42)], [(0.8, 0.58), (0.66, 0.28), (0.4, 0.08)]],
    'ku': [[(0.42, 0.95), (0.14, 0.58)], [(0.33, 0.8), (0.86, 0.8), (0.7, 0.4), (0.32, 0.04)]],
}


def neon_sign(bm, f, u0, z0, lod, w=1.7, h=0.66, text=('su', 'na', 'tsu', 'ku')):
    """Neon sign: black backboard on stand-offs, glass tubes (スナック) and a
    border, transformer box with its cable - Showa-era bar street."""
    bd = lbox(bm, f, u0, u0 + w, z0, z0 + h, 0.1, 0.14, skip=())
    m(bm, bd.values(), 'BLACK')
    n = 4 if not lod else 3
    r = 0.014
    dz = 0.165
    bx = [(0.06, 0.06), (w - 0.06, 0.06), (w - 0.06, h - 0.06), (0.06, h - 0.06), (0.06, 0.06)]
    if not lod:
        tube(bm, [f(u0 + a, z0 + b, dz) for a, b in bx], r, n, 'NEON_CYAN')
    cw, ch = (w - 0.3) / len(text), h - 0.24
    for i, k in enumerate(text):
        for stroke in KANA[k]:
            pts = [f(u0 + 0.15 + cw * (i + 0.08 + 0.84 * a), z0 + 0.12 + ch * b, dz) for a, b in stroke]
            tube(bm, pts, r * 1.15, n, 'NEON_PINK')
    if lod:
        return
    for a in (0.15, w - 0.15):
        for b in (0.12, h - 0.12):
            tube(bm, [f(u0 + a, z0 + b, 0.0), f(u0 + a, z0 + b, 0.1)], 0.012, 4)
    tb = lbox(bm, f, u0 + w + 0.06, u0 + w + 0.3, z0 + h - 0.32, z0 + h, 0.0, 0.12, skip=('in',))
    m(bm, tb.values(), 'PAINT_GREY'); nb(bm, tb.values())
    tube(bm, [f(u0 + w + 0.18, z0 + h - 0.32, 0.06), f(u0 + w + 0.18, z0 + 0.2, 0.06), f(u0 + w, z0 + 0.2, 0.12)], 0.008, 3, 'BLACK')


def disc_sign(bm, f, u, zc, lod, reg='KISSA', r=0.32, out=0.2, thick=0.12):
    """Round projecting lightbox (tsukidashi), graphic on both faces, on an arm."""
    n = 20 if not lod else 12
    dc = out + r
    uv = bm.loops.layers.uv.verify()
    u0, v0, u1, v1 = R(reg)['uv']
    ring = [(math.cos(2 * math.pi * k / n), math.sin(2 * math.pi * k / n)) for k in range(n)]
    A_ = [bm.verts.new(f(u - thick / 2, zc + r * s, dc + r * c)) for c, s in ring]
    B_ = [bm.verts.new(f(u + thick / 2, zc + r * s, dc + r * c)) for c, s in ring]
    fa, fb = bm.faces.new(A_), bm.faces.new(B_[::-1])
    centre = f(u, zc, dc)
    orient([fa, fb], centre)
    for face in (fa, fb):
        sg = 1 if face.normal.dot(f.t) > 0 else -1
        for l in face.loops:
            p = l.vert.co - centre
            a = p.dot(f.n) * -sg / r          # read the right way round from each side
            b = (p.z) / r
            l[uv].uv = (u0 + (0.5 + 0.49 * a) * (u1 - u0), v0 + (0.5 + 0.49 * b) * (v1 - v0))
    rim = [bm.faces.new([A_[k], A_[(k + 1) % n], B_[(k + 1) % n], B_[k]]) for k in range(n)]
    orient(rim, centre)
    m(bm, rim, 'PAINT_GREY'); nb(bm, rim + [fa, fb])
    arm = lbox(bm, f, u - 0.03, u + 0.03, zc + r + 0.02, zc + r + 0.08, 0.0, dc + 0.1, skip=('in',))
    m(bm, arm.values(), 'GALV')
    if not lod:
        tube(bm, [f(u, zc - 0.25, 0.01), f(u, zc + r + 0.02, out + 0.1)], 0.012, 4)
        for dd in (dc - 0.15, dc + 0.15):
            tube(bm, [f(u, zc + r + 0.02, dd), f(u, zc + r - 0.02, dd)], 0.008, 3)


def nobori(bm, f, u, d, lod, reg='NOBORI_A', h=1.8, w=0.45):
    """Nobori flag on its pole in a water-weighted stand (shop fronts):
    the flag hangs from a top bar, the graphic lies on its side in the atlas."""
    z0, z1 = 0.65, 0.65 + h
    tube(bm, [f(u, 0.1, d), f(u, z1 + 0.15, d)], 0.016, 6 if not lod else 4, 'ALU')
    fl = lbox(bm, f, u + 0.03, u + 0.03 + w, z0, z1, d - 0.004, d + 0.004, skip=('in',) if lod else ())
    uv = bm.loops.layers.uv.verify()
    u0, v0, u1, v1 = R(reg)['uv']
    for k in ('out', 'in'):
        if k not in fl:
            continue
        for l in fl[k].loops:
            a = (l.vert.co.z - z0) / h
            b = 1 - ((l.vert.co - f(u + 0.03, 0, d)).dot(f.t)) / w
            l[uv].uv = (u0 + a * (u1 - u0), v0 + b * (v1 - v0))
    m(bm, [x for k, x in fl.items() if k not in ('out', 'in')], 'RED_PAINT')
    nb(bm, fl.values())
    if lod:
        return
    tube(bm, [f(u, z1 + 0.02, d), f(u + 0.03 + w, z1 + 0.02, d)], 0.008, 3, 'ALU')
    st = K.lathe(bm, 8, [(0.2, 0.0), (0.18, 0.08), (0.08, 0.14), (0.0, 0.16)], cx=f(u, 0, d).x, cy=f(u, 0, d).y,
                 cap_bottom=False)
    m(bm, st['sides'], 'BLACK'); nb(bm, st['sides'])


# ── roof plant ──────────────────────────────────────────────────────────────

def water_tank(bm, x, y, z, sx, sy, h, lod):
    """FRP panel water tank on a steel frame with a ladder and manhole."""
    f = F((0, 0, 0), (0, -1, 0))
    fz = z + 0.6
    t = lbox(bm, f, x - sx / 2, x + sx / 2, fz, fz + h, -y - sy / 2, -y + sy / 2)
    m(bm, t.values(), 'TANK_CREAM')
    if lod:
        b = lbox(bm, f, x - sx / 2, x + sx / 2, z, fz, -y - sy / 2, -y + sy / 2, skip=('top', 'bot'))
        m(bm, b.values(), 'GALV')
        return
    # panel ribs (1 m FRP panels)
    rib = []
    nx = max(1, round(sx))
    for i in range(1, nx):
        u = x - sx / 2 + sx * i / nx
        for d in (-y - sy / 2 - 0.03, -y + sy / 2):
            rib.append(lbox(bm, f, u - 0.03, u + 0.03, fz, fz + h, d, d + 0.03, skip=('top', 'bot')))
    for zz in (fz + h / 2,):
        rib.append(lbox(bm, f, x - sx / 2 - 0.03, x + sx / 2 + 0.03, zz - 0.03, zz + 0.03,
                        -y - sy / 2 - 0.03, -y + sy / 2 + 0.03, skip=()))
    fs = [x_ for b in rib for x_ in b.values()]
    m(bm, fs, 'TANK_CREAM'); nb(bm, fs)
    # frame: legs and beams
    fr = []
    for px in (x - sx / 2 + 0.05, x + sx / 2 - 0.05):
        for py in (-y - sy / 2 + 0.05, -y + sy / 2 - 0.05):
            fr.append(lbox(bm, f, px - 0.05, px + 0.05, z, fz, py - 0.05, py + 0.05, skip=('top',)))
    for py in (-y - sy / 2 + 0.05, -y + sy / 2 - 0.05):
        fr.append(lbox(bm, f, x - sx / 2, x + sx / 2, fz - 0.12, fz, py - 0.05, py + 0.05))
    fs = [x_ for b in fr for x_ in b.values()]
    m(bm, fs, 'GALV'); nb(bm, fs)
    mh = K.lathe(bm, 8, [(0.3, fz + h), (0.3, fz + h + 0.08)], cx=x + sx / 4, cy=y)
    m(bm, mh['sides'] + [mh['top']], 'TANK_CREAM'); nb(bm, mh['sides'] + [mh['top']])
    # ladder on the front
    lx = x - sx / 2 + 0.35
    ly = -y - sy / 2 - 0.15
    for du in (-0.2, 0.2):
        tube(bm, [f(lx + du, z, ly), f(lx + du, fz + h + 0.6, ly)], 0.018, 4)
    k = int((fz + h + 0.5 - z) / 0.3)
    for i in range(1, k):
        tube(bm, [f(lx - 0.2, z + i * 0.3, ly), f(lx + 0.2, z + i * 0.3, ly)], 0.011, 3)


def penthouse(bm, x0, x1, y0, y1, z, h, lod, door_side=-1):
    """Stair house on the roof (tōya): ALC box, steel door, coping, lightning rod."""
    f = F((0, 0, 0), (0, -1, 0))
    b = lbox(bm, f, x0, x1, z, z + h, -y1, -y0, skip=('bot',))
    m(bm, [b[k] for k in ('out', 'in', 'l', 'r')], 'ALC_FLAT')
    m(bm, [b['top']], 'ROOF_GREEN')
    if lod:
        return
    c = lbox(bm, f, x0 - 0.03, x1 + 0.03, z + h, z + h + 0.1, -y1 - 0.03, -y0 + 0.03)
    m(bm, c.values(), 'ALU'); nb(bm, c.values())
    xd = (x0 + x1) / 2
    d = lbox(bm, f, xd - 0.45, xd + 0.45, z + 0.05, z + 2.05, -y0, -y0 + 0.04, skip=('in',))
    m(bm, [d['out']], 'DOOR_STEEL'); m(bm, [k for kk, k in d.items() if kk != 'out'], 'ALU'); nb(bm, d.values())
    tube(bm, [((x0 + x1) / 2 + 0.4, (y0 + y1) / 2, z + h + 0.1), ((x0 + x1) / 2 + 0.4, (y0 + y1) / 2, z + h + 2.2)],
         0.02, 4, 'ALU')
    s = K.lathe(bm, 6, [(0.0, z + h + 2.15), (0.05, z + h + 2.22), (0.0, z + h + 2.3)], cx=(x0 + x1) / 2 + 0.4,
                cy=(y0 + y1) / 2)
    m(bm, s['sides'], 'ALU'); nb(bm, s['sides'])


def billboard(bm, x, y, z, w, h, lod, reg='ROOF_SIGN', lift=1.2):
    """Rooftop sign facing -Y: lit face, galvanised frame behind with braces."""
    f = F((0, 0, 0), (0, -1, 0))
    zb = z + lift
    face = lbox(bm, f, x - w / 2, x + w / 2, zb, zb + h, -y - 0.08, -y + 0.08)
    m(bm, [face['out']], reg); m(bm, [k for kk, k in face.items() if kk != 'out'], 'GALV'); nb(bm, [face['out']])
    for px in (x - w / 2 + 0.3, x, x + w / 2 - 0.3):
        p = lbox(bm, f, px - 0.05, px + 0.05, z, zb + h - 0.1, -y - 0.18, -y - 0.08, skip=('top',))
        m(bm, p.values(), 'GALV'); nb(bm, p.values())
        if not lod:
            tube(bm, [(px, y + 1.2, z), (px, y + 0.13, zb + h * 0.6)], 0.025, 4)
    if not lod:
        for px in (x - w / 2 + 0.6, x + w / 2 - 0.6):   # floodlights on arms over the face
            tube(bm, [(px, y - 0.08, zb + h), (px, y - 0.5, zb + h + 0.15)], 0.012, 3)
            lt = lbox(bm, f, px - 0.1, px + 0.1, zb + h + 0.08, zb + h + 0.2, -y + 0.42, -y + 0.6)
            m(bm, [lt['bot']], 'LIT_COOL'); m(bm, [k for kk, k in lt.items() if kk != 'bot'], 'PAINT_GREY'); nb(bm, lt.values())


def antenna(bm, x, y, z, lod):
    """Old-style roof TV antenna: mast and two yagi booms (Showa rooftops)."""
    if lod:
        return
    tube(bm, [(x, y, z), (x, y, z + 2.6)], 0.022, 4, 'ALU')
    for zz, l in ((z + 2.5, 1.3), (z + 1.9, 0.9)):
        tube(bm, [(x - l / 2, y, zz), (x + l / 2, y, zz)], 0.012, 3, 'ALU')
        for i in range(6):
            xx = x - l / 2 + l * (i + 0.5) / 6
            el = 0.42 - 0.04 * i
            tube(bm, [(xx, y - el / 2, zz), (xx, y + el / 2, zz)], 0.006, 3, 'ALU')
    for dx, dy in ((1.2, 0.0), (-0.6, 1.0), (-0.6, -1.0)):   # guy wires
        tube(bm, [(x, y, z + 2.0), (x + dx, y + dy, z)], 0.004, 3, 'BLACK')


def downpipe(bm, f, u, z0, z1, lod, reg='PAINT_GREY'):
    """Rain downpipe with brackets, from the roof drain to the ground."""
    tube(bm, [f(u, z0, 0.08), f(u, z1 - 0.2, 0.08), f(u, z1 + 0.05, 0.25)], 0.05, 6 if not lod else 4, reg)
    if not lod:
        for zz in [z0 + 1.0 + 2.0 * i for i in range(int((z1 - z0 - 1.0) / 2.0) + 1)]:
            b = lbox(bm, f, u - 0.02, u + 0.02, zz, zz + 0.05, 0.0, 0.08, skip=('in',))
            m(bm, b.values(), reg); nb(bm, b.values())


def meter_box(bm, f, u, z, lod):
    b = lbox(bm, f, u - 0.17, u + 0.17, z, z + 0.42, 0.0, 0.16, skip=('in',))
    m(bm, [b['out']], 'METER'); m(bm, [x for k, x in b.items() if k != 'out'], 'PAINT_GREY'); nb(bm, b.values())
