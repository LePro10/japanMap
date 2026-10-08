"""Minato kit (fishing village and harbour: Ine no Funaya, Sanriku / Noto
coast): boat houses over the water (funaya), fishermen's houses clad in
corrugated iron, net sheds, the fish market hall; harbour pieces (quay walls
with bollards and ladders, stepped landing into the water, a pier on piles,
breakwater with tetrapods, a small harbour light); boats; and the clutter of
a working harbour (buoys, nets, crates, styrofoam boxes, drums, crab pots,
drying racks for fish and squid, boots, tyre fenders).

Machinery from the Koedo/Gassho kits (C, F frames, prism_u, lbox, tile roof
`KK.gable_roof`, `GK.map_axes`). New here:
- corrugated sheets as geometry (`corr`): a profile (wave, folded plate,
  shutter rib) sampled at its knots, crests out along the normal, UVs along
  the sheet (rust runs down the ridges, never stretched); walls in courses
  of 1.8 m, each course lapping over the one below (`wall`), roofs in
  courses from the eave up (`tin_roof`), lean-to roofs (`lean_to`);
- walls with openings cut as rectangles (`cut`) - no swept profile, the
  sheets end at the trims of the openings;
- opening modules: aluminium sash (lace curtain, grille, hood), aluminium
  entrance door with canopy, rolling shutter, open bay, board shutters.
Water level of all harbour pieces: WATER_Z below the quay top (z = 0).
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings.tokyo_kit import F, lbox
from buildings import koedo_kit as KK
from buildings import gassho_kit as GK
from buildings.koedo_kit import C, prism_u, orient

WATER_Z = -1.1      # sea level below the quay top
COURSE = 1.8        # corrugated sheet length (sanpachi 1.83 m); strips are 2 m
ZV = Vector((0, 0, 1))
SIDES = {'S': 0, 'E': 1, 'N': 2, 'W': 3}
PROFILES = {'wave': [(0.0, 0.0), (0.5, 1.0), (1.0, 0.0)],                       # namitotan (smooth-shaded: reads as a wave)
            'trap': [(0.0, 0.0), (0.12, 1.0), (0.42, 1.0), (0.54, 0.0), (1.0, 0.0)],   # folded-plate roof (seppan)
            'rib': [(0.0, 0.0), (0.12, 1.0), (0.88, 1.0), (1.0, 0.0)]}               # shutter slats


def flat(reg):
    if reg.endswith('_FLAT'):
        return reg
    return reg + '_FLAT' if reg.startswith('TOTAN') or reg in ('WOOD_TATE', 'WOOD_BOARD') else reg


def edge_frame(L, B, e):
    """Wall frame of side e (0 S, 1 E, 2 N, 3 W) of the box L x B centred
    on the origin: u from the left corner seen from outside."""
    corners = [(-L / 2, -B / 2), (L / 2, -B / 2), (L / 2, B / 2), (-L / 2, B / 2)]
    c0 = Vector((*corners[e], 0)); c1 = Vector((*corners[(e + 1) % 4], 0))
    t = (c1 - c0).normalized()
    f = F(c0, (t.y, -t.x))
    f.u0, f.u1 = 0.0, (L, B, L, B)[e]
    return f


def _face(c, pts, out):
    f = c.bm.faces.new([c.bm.verts.new(p) for p in pts])
    f.normal_update()
    if f.normal.dot(Vector(out)) < 0:
        f.normal_flip()
    return f


def _map(c, faces, reg, origin, au, av):
    if c.R(reg)['kind'] == 'strip':
        GK.map_axes(c, faces, reg, origin, au, av)
    else:
        c.m(faces, reg); c.nb(faces)


# ── corrugated sheets ───────────────────────────────────────────────────────

def _knots(a0, a1, pitch, prof):
    def hat(a):
        t = (a / pitch) % 1.0
        for (ta, ha), (tb, hb) in zip(prof, prof[1:]):
            if ta - 1e-9 <= t <= tb + 1e-9:
                return ha + (hb - ha) * (t - ta) / max(tb - ta, 1e-9)
        return prof[-1][1]
    out = [(a0, hat(a0))]
    for k in range(math.floor(a0 / pitch), math.ceil(a1 / pitch) + 1):
        for t, h in prof[:-1]:
            a = (k + t) * pitch
            if a0 + 0.01 < a < a1 - 0.01:
                out.append((a, h))
    out.append((a1, hat(a1)))
    return sorted(out)


def corr(c, o, ta, tb, n, a0, a1, b0, b1, reg, pitch=0.24, amp=0.03, prof='wave', map_o=None, top=None, extra=()):
    """Corrugated sheet in the plane o + ta*a + tb*b, ridges along tb,
    crests out along n by amp. top(a) -> b1 clips the sheet (gables).
    LOD1: flat at half the amplitude. UVs along the sheet from map_o."""
    if a1 - a0 < 0.02 or b1 - b0 < 0.02:
        return []
    o, ta, tb, n = Vector(o), Vector(ta), Vector(tb), Vector(n)
    if c.lod:
        ks = sorted({(a0, 0.5), (a1, 0.5)} | {(a, 0.5) for a in extra if a0 < a < a1})
    else:
        ks = _knots(a0, a1, pitch, PROFILES[prof])
        ks = sorted(set(ks) | {(a, _knots(a, a + 1e-3, pitch, PROFILES[prof])[0][1]) for a in extra if a0 < a < a1})
    vs = []
    for a, h in ks:
        p = o + ta * a + n * (amp * h)
        vs.append((c.bm.verts.new(p + tb * b0), c.bm.verts.new(p + tb * (top(a) if top else b1))))
    faces = []
    for (p0, p1), (q0, q1) in zip(vs, vs[1:]):
        f = c.bm.faces.new([p0, q0, q1, p1])
        f.normal_update()
        if f.normal.dot(n) < 0:
            f.normal_flip()
        faces.append(f)
    _map(c, faces, reg, map_o if map_o is not None else o + tb * b0, ta, tb)
    return faces


def cut(u0, u1, z0, z1, holes):
    """Rectangles covering [u0,u1] x [z0,z1] minus the holes: columns at the
    hole edges, rows within a column only where a hole crosses it."""
    us = sorted({u0, u1} | {x for h in holes for x in (h[0], h[1]) if u0 < x < u1})
    out = []
    for ua, ub in zip(us, us[1:]):
        if ub - ua < 1e-3:
            continue
        um = (ua + ub) / 2
        z = z0
        for ha, hb in sorted((h[2], h[3]) for h in holes if h[0] < um < h[1] and h[3] > z0 and h[2] < z1):
            if ha > z + 1e-3:
                out.append((ua, ub, z, min(ha, z1)))
            z = max(z, hb)
        if z < z1 - 1e-3:
            out.append((ua, ub, z, z1))
    return out


def wall(c, f, u0, u1, z0, z1, reg, holes=(), d=0.0, top=None, pitch=0.27):
    """Wall on frame f. Corrugated (TOTAN_*): courses of <= 1.8 m, each
    lapping 6 cm over the one below and 12 mm further out. Boards/flat:
    faces in bands of <= 2 m (strip height), UVs continuous along the wall.
    top(u) -> z clips the wall (gable triangles)."""
    if reg.startswith('TOTAN'):
        n = 1 if top else max(1, math.ceil((z1 - z0) / COURSE - 1e-6))
        for k in range(n):
            za = z0 + (z1 - z0) * k / n - (0.06 if k else 0.0)
            zb = z0 + (z1 - z0) * (k + 1) / n
            dk = d + 0.012 * k
            o = f(0, 0, dk)
            for ua, ub, zc, zd in cut(u0, u1, za, zb, holes):
                tp = None
                if top and k == n - 1:
                    tp = top
                corr(c, o, f.t, ZV, f.n, ua, ub, zc, zd, reg, pitch=pitch, map_o=f(0, za, dk), top=tp,
                     extra=[0.5 * (u0 + u1)] if top else ())
        return
    n = 1 if top else max(1, math.ceil((z1 - z0) / 2.0 - 1e-6))
    for k in range(n):
        za = z0 + (z1 - z0) * k / n; zb = z0 + (z1 - z0) * (k + 1) / n
        fs = []
        for ua, ub, zc, zd in cut(u0, u1, za, zb, holes):
            if top and k == n - 1:
                um = 0.5 * (u0 + u1)
                us = [ua] + ([um] if ua < um < ub else []) + [ub]
                pts = [f(u, zc, d) for u in us] + [f(u, min(top(u), 99), d) for u in reversed(us)]
            else:
                pts = [f(ua, zc, d), f(ub, zc, d), f(ub, zd, d), f(ua, zd, d)]
            fs.append(_face(c, pts, f.n))
        _map(c, fs, reg, f(0, za, d), f.t, ZV)


def corner_trims(c, L, B, z0, z1, reg, d=0.045, w=0.1):
    """Bent corner flashing (or corner boards) over the sheet ends at all
    four corners of the box L x B."""
    fr = F(Vector((0, 0, 0)), (0, -1))     # u = x, d = -y
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * L / 2, sy * B / 2
            xa, xb = sorted((x - sx * w, x + sx * d))
            ya, yb = sorted((y - sy * w, y + sy * d))
            b = c.box(fr, xa, xb, z0, z1, -yb, -ya, None, skip=('bot',))
            for k, fc in b.items():
                c.m([fc], reg, rotate=True)


# ── openings ────────────────────────────────────────────────────────────────

def reveal(c, f, u0, u1, z0, z1, d_out, depth, reg, floor=None):
    """Reveal of an opening (faces look into the hole) and its back face."""
    b = lbox(c.bm, f, u0, u1, z0, z1, -depth, d_out, skip=('out', 'in'))
    for x in b.values():
        x.normal_flip()
    c.m([b[k] for k in ('l', 'r', 'top')], reg); c.nb(list(b.values()))
    c.m([b['bot']], floor or reg)
    back = lbox(c.bm, f, u0, u1, z0, z1, -depth - 0.01, -depth, skip=('in', 'l', 'r', 'top', 'bot'))['out']
    c.nb([back])
    return back


def trim(c, f, u0, u1, z0, z1, d, reg, w=0.06, sill=True, head=True):
    """Flat trim round an opening on the wall face (bent flashing on sheet
    walls, boards on board walls)."""
    c.box(f, u0 - w, u0, z0, z1, 0.0, d + 0.012, reg, skip=('in', 'top', 'bot'), rotate=True)
    c.box(f, u1, u1 + w, z0, z1, 0.0, d + 0.012, reg, skip=('in', 'top', 'bot'), rotate=True)
    if head:
        c.box(f, u0 - w, u1 + w, z1, z1 + w, 0.0, d + 0.012, reg, skip=('in', 'bot'))
    if sill:
        c.box(f, u0 - w, u1 + w, z0 - 0.045, z0, -0.02, d + 0.06, 'ALU', skip=('in',))


def alu_window(c, f, u0, u1, z0, z1, d, opt):
    """Aluminium sliding window: two sashes, lace curtain (lit or dusk) on
    the glass, sill; optional fixed grille (men-goshi) and a small hood."""
    fr = opt.get('frame', 'ALU')
    back = reveal(c, f, u0, u1, z0, z1, d, 0.1, fr)
    c.m([back], 'CURTAIN_LIT' if opt.get('lit') else 'CURTAIN')
    trim(c, f, u0, u1, z0, z1, d, opt.get('trim', fr))
    if c.lod == 0:
        um = (u0 + u1) / 2
        for a, b, za, zb, sk in ((u0, u0 + 0.045, z0, z1, ('in', 'l', 'top', 'bot')), (u1 - 0.045, u1, z0, z1, ('in', 'r', 'top', 'bot')),
                                 (u0, u1, z0, z0 + 0.05, ('in', 'l', 'r', 'bot')), (u0, u1, z1 - 0.045, z1, ('in', 'l', 'r', 'top'))):
            c.box(f, a, b, za, zb, -0.1, -0.05, fr, skip=sk)
        c.box(f, um - 0.035, um + 0.035, z0, z1, -0.09, -0.05, fr, skip=('in', 'top', 'bot'))
        if opt.get('grille'):   # men-goshi: fixed aluminium bars on brackets
            k = max(3, round((u1 - u0) / 0.16))
            for i in range(1, k):
                u = u0 + (u1 - u0) * i / k
                c.box(f, u - 0.012, u + 0.012, z0 - 0.02, z1 + 0.02, d + 0.06, d + 0.085, 'ALU', skip=('in', 'top', 'bot'))
            for z in (z0 - 0.02, z1 - 0.02):
                c.box(f, u0 - 0.03, u1 + 0.03, z, z + 0.04, d + 0.02, d + 0.09, 'ALU', skip=('in',))
    if opt.get('hood'):    # kirivoke: small sheet hood over the window
        poly = [(0.0, 0.16), (0.42, 0.04), (0.42, 0.0), (0.0, 0.1)]
        sides, caps = prism_u(c, F(f(0, z1 + 0.12, 0), f.n), poly, u0 - 0.15, u1 + 0.15)
        reg = opt['hood']
        c.m(sides + caps, reg if not reg.startswith('TOTAN') else reg + '_FLAT'); c.nb(sides + caps)
    return dict(kind='window', lit=opt.get('lit'))


def alu_door(c, f, u0, u1, z0, z1, d, opt):
    """Aluminium entrance door (genkan): two sliding leaves with frosted
    glass, a step, a flat canopy on two brackets."""
    fr = opt.get('frame', 'ALU_DARK')
    back = reveal(c, f, u0, u1, z0, z1, d, 0.14, fr, floor='CONC_FLAT')
    c.m([back], 'GLASS_FROST')
    trim(c, f, u0, u1, z0, z1, d, opt.get('trim', fr), sill=False)
    um = (u0 + u1) / 2
    if c.lod == 0:
        for a, b in ((u0, u0 + 0.06), (um - 0.06, um), (um, um + 0.06), (u1 - 0.06, u1)):
            c.box(f, a, b, z0, z1, -0.14, -0.06, fr, skip=('in',))
        for z in (z0, z0 + 0.95, z1 - 0.06):
            c.box(f, u0, u1, z, z + 0.06, -0.13, -0.07, fr, skip=('in',))
    if z0 > 0.1:
        c.box(f, u0 - 0.2, u1 + 0.2, 0.0, z0, 0.0, 0.55, 'CONC_FLAT', skip=('bot', 'in'), bevel=True)
    zc = z1 + opt.get('canopy_up', 0.28)
    dc = opt.get('canopy', 0.85)
    if dc:
        c.box(f, u0 - 0.35, u1 + 0.35, zc, zc + 0.08, 0.0, dc, 'ALU', skip=('in',), bevel=True)
        if c.lod == 0:
            for u in (u0 - 0.2, u1 + 0.2):
                c.tube([f(u, zc + 0.08, dc - 0.1), f(u, zc + 0.75, 0.02)], 0.015, 4, 'ALU')
    return dict(kind='door')


def wood_door(c, f, u0, u1, z0, z1, d, opt):
    """Old wooden glass sliding doors (garasu-do) of the fishermen's houses."""
    back = reveal(c, f, u0, u1, z0, z1, d, 0.12, 'WOOD_FLAT', floor='CONC_FLAT')
    c.m([back], 'CURTAIN_LIT' if opt.get('lit') else 'GLASS')
    trim(c, f, u0, u1, z0, z1, d, 'WOOD', w=0.08, sill=False)
    if c.lod == 0:
        n = max(2, round((u1 - u0) / 0.85))
        for i in range(n):
            a, b = u0 + (u1 - u0) * i / n, u0 + (u1 - u0) * (i + 1) / n
            KK.glass_door(c, f, a, b, z0, z1, -0.07 - 0.03 * (i % 2), glass=False, rails=(0.35, 1.2))
    if z0 > 0.1:
        c.box(f, u0 - 0.15, u1 + 0.15, 0.0, z0, 0.0, 0.5, 'STONE_FLAT', skip=('bot', 'in'), bevel=True)
    return dict(kind='door')


def shutter(c, f, u0, u1, z0, z1, d, opt):
    """Rolling shutter: ribbed curtain (raised by `open` metres), guide
    rails, bottom bar and the coil box on the wall above."""
    up = opt.get('open', 0.0)
    depth = opt.get('depth', 0.3)
    back = reveal(c, f, u0, u1, z0, z1, d, depth, 'CONC_FLAT', floor='CONC_FLAT')
    c.m([back], 'INTERIOR')
    zb = min(z0 + up, z1 - 0.1)
    corr(c, f(0, 0, -0.06), ZV, f.t, f.n, zb, z1, u0, u1, 'SHUTTER', pitch=0.11, amp=0.018, prof='rib')
    c.box(f, u0, u1, zb, zb + 0.06, -0.08, -0.02, 'SHUTTER', skip=('in',))
    for a, b in ((u0, u0 + 0.06), (u1 - 0.06, u1)):
        c.box(f, a, b, z0, z1, -0.09, d + 0.01, 'SHUTTER', skip=('in', 'top'))
    c.box(f, u0 - 0.08, u1 + 0.08, z1, z1 + 0.42, 0.0, 0.36, 'SHUTTER', skip=('in',), bevel=True)
    return dict(kind='shop' if up > 1.0 else 'closed', f=F(f.o, f.n, u0, u1, z0, z1), depth=depth)


def open_bay(c, f, u0, u1, z0, z1, d, opt):
    """Open shop / work bay: deep dark room (the dressing puts the interior
    picture in), header beam, concrete floor."""
    depth = opt.get('depth', 1.2)
    back = reveal(c, f, u0, u1, z0, z1, d, depth, opt.get('reveal', 'WOOD_FLAT'), floor='CONC_FLAT')
    c.m([back], 'INTERIOR')
    c.box(f, u0 - 0.05, u1 + 0.05, z1 - 0.2, z1 + 0.05, -0.12, d + 0.04, 'WOOD', skip=('in',))
    if opt.get('doors', True) and c.lod == 0:    # aluminium sliding doors pushed to one side
        dw = min(0.9, (u1 - u0) / 3)
        for k in range(2):
            a = u1 - 0.08 - dw * (k + 1) + 0.05 * k
            c.box(f, a, a + dw, z0, z1 - 0.2, -0.3 - 0.06 * k, -0.27 - 0.06 * k, 'GLASS', skip=('in',))
            c.box(f, a, a + 0.05, z0, z1 - 0.2, -0.31 - 0.06 * k, -0.25 - 0.06 * k, 'ALU', skip=('in',))
    return dict(kind='shop', f=F(f.o, f.n, u0, u1, z0, z1), depth=depth)


def boards(c, f, u0, u1, z0, z1, d, opt):
    """Window closed with old boards (net loft, boat house)."""
    back = reveal(c, f, u0, u1, z0, z1, d, 0.08, 'WOOD_FLAT')
    _map(c, [back], 'WOOD_TATE', f(0, z0, -0.08), f.t, ZV)
    trim(c, f, u0, u1, z0, z1, d, 'WOOD', w=0.07, sill=False)
    if c.lod == 0:
        for z in (z0 + 0.15, z1 - 0.22):
            c.box(f, u0 + 0.04, u1 - 0.04, z, z + 0.07, -0.08, -0.04, 'WOOD', skip=('in',))
    return dict(kind='closed')


def vent(c, f, u0, u1, z0, z1, d, opt):
    back = reveal(c, f, u0, u1, z0, z1, d, 0.06, 'WOOD_FLAT')
    c.m([back], 'INTERIOR')
    if c.lod == 0:
        for i in range(3):
            z = z0 + (z1 - z0) * (i + 0.5) / 3
            c.box(f, u0, u1, z - 0.02, z + 0.03, -0.05, -0.0, 'WOOD', skip=('in', 'l', 'r'))
    return dict(kind='vent')


MODULES = {'win': alu_window, 'door': alu_door, 'gdoor': wood_door, 'shutter': shutter, 'shop': open_bay,
           'boards': boards, 'vent': vent}


# ── roofs ───────────────────────────────────────────────────────────────────

def tin_roof(c, L, B, z_top, slope=0.3, eave=0.55, oh=0.4, reg='TOTAN_RED', pitch=0.34, prof='wave', gutter=True,
             fascia='WOOD'):
    """Corrugated gable roof, ridge along X: thin roof slab (fascia, soffit,
    verge), sheets in courses from the eave up (each lapping over the one
    below), ridge cap, verge flashings, gutters. Returns eave height and
    ridge height."""
    lod = c.lod
    WL = B / 2 + 0.06                       # wall line (outer face of the sheets)
    E = WL + eave
    X = L / 2 + oh
    th = 0.12
    zr = z_top + th + WL * slope            # top of the slab at the ridge
    ze = zr - E * slope                     # top of the slab at the eave
    # the underside meets the wall top at the wall line (no slit under the eave), soffit up to the fascia
    poly = [(-E, ze - 0.15), (-E, ze), (0.0, zr), (E, ze), (E, ze - 0.15), (WL, z_top), (0.0, z_top + WL * slope), (-WL, z_top)]
    sides, c0, c1 = K.poly_prism_x(c.bm, poly, -X, X)
    for f in sides:
        f.normal_update()
    for f in (sides[1], sides[2]):          # slab tops are under the sheets: drop them
        c.bm.faces.remove(f)
    c.m([sides[0], sides[3]], fascia); c.m(sides[4:] + [c0, c1], 'WOOD_FLAT'); c.nb(sides[4:])
    sl = math.hypot(E, zr - ze)
    for sg in (-1, 1):
        o = Vector((0, sg * E, ze))
        tb = (Vector((0, 0, zr)) - o).normalized()
        n = tb.cross(Vector((1, 0, 0)))
        if n.z < 0:
            n = -n
        nco = 1 if c.R(reg)['kind'] != 'strip' else max(1, math.ceil((sl - 0.05) / COURSE - 1e-6))
        for k in range(nco):
            b0 = sl * k / nco - (0.08 if k else 0.0) - 0.03 * (k == 0)
            b1 = sl * (k + 1) / nco
            corr(c, o + n * (0.01 * k), Vector((1, 0, 0)), tb, n, -X, X, b0, b1, reg, pitch=pitch, amp=0.035,
                 prof=prof, map_o=o + tb * b0)
    # ridge cap (munazutsumi): bent sheet over the ridge
    cap = [(-0.2, zr - 0.02), (-0.2, zr + 0.06), (-0.06, zr + 0.13), (0.06, zr + 0.13), (0.2, zr + 0.06), (0.2, zr - 0.02)]
    cap_poly = cap + [(0.16, zr + 0.03), (0.0, zr + 0.08), (-0.16, zr + 0.03)]
    s, a, b = K.poly_prism_x(c.bm, cap_poly, -X - 0.03, X + 0.03)
    c.m(s + [a, b], flat(reg)); c.nb(s + [a, b])
    # verge flashings (kerabamizukiri): bent plate down both slopes at both gables
    for sx in (-1, 1):
        x = sx * (X + 0.02)
        for sg in (-1, 1):
            hi, lo = (0.0, zr + 0.1), (sg * (E + 0.03), ze + 0.06)
            out = _face(c, [(x, lo[0], lo[1] - 0.3), (x, 0.0, hi[1] - 0.3), (x, 0.0, hi[1]), (x, lo[0], lo[1])], (sx, 0, 0))
            tp = _face(c, [(x, lo[0], lo[1]), (x, 0.0, hi[1]), (x - sx * 0.1, 0.0, hi[1]), (x - sx * 0.1, lo[0], lo[1])], (0, 0, 1))
            c.m([out, tp], flat(reg)); c.nb([out, tp])
    if gutter and lod == 0:
        for sg in (-1, 1):
            c.tube([(-X, sg * (E + 0.06), ze - 0.08), (X, sg * (E + 0.06), ze - 0.08)], 0.06, 4, 'GALV')
    return dict(ze=ze - 0.15, zr=zr + 0.13, E=E, X=X, slope=slope, z_top=z_top)


def gable_top(B, z_top, slope, wall_out=0.06):
    """Roof underside over a gable wall (tile or tin roof), as top(u) for
    `wall`: u runs 0..B along the gable."""
    return lambda u: z_top + (B / 2 + wall_out - abs(u - B / 2)) * slope


def lean_to(c, f, u0, u1, z_hi, depth, slope=0.25, reg='TOTAN_RUST', posts=True, eave=0.25):
    """Lean-to (geya) against a wall: corrugated mono-pitch roof on purlins,
    front beam on wooden posts; optional corrugated side walls."""
    z_lo = z_hi - (depth + eave) * slope
    o = f(0, z_lo, depth + eave)
    tb = (f(0, z_hi, 0) - o).normalized()
    n = tb.cross(f.t)
    if n.z < 0:
        n = -n
    sl = (f(0, z_hi, 0) - o).length
    nco = max(1, math.ceil((sl - 0.05) / COURSE - 1e-6))
    for k in range(nco):
        b0 = sl * k / nco - (0.08 if k else 0.0)
        corr(c, o + n * (0.01 * k), f.t, tb, n, u0, u1, b0, sl * (k + 1) / nco, reg, pitch=0.27, amp=0.03, map_o=o + tb * b0)
    under = _face(c, [o + f.t * u0 - n * 0.005, o + f.t * u1 - n * 0.005, o + f.t * u1 + tb * sl - n * 0.005,
                      o + f.t * u0 + tb * sl - n * 0.005], -n)
    c.m([under], flat(reg)); c.nb([under])
    zb = lambda dd: z_hi - dd * slope
    c.box(f, u0, u1, zb(depth) - 0.18, zb(depth) - 0.02, depth - 0.06, depth + 0.06, 'WOOD', skip=())
    if c.lod == 0:
        for dd in (depth * 0.4,):
            c.box(f, u0, u1, zb(dd) - 0.1, zb(dd) - 0.02, dd - 0.04, dd + 0.04, 'WOOD', skip=('top',))
        c.box(f, u0 - 0.03, u1 + 0.03, z_lo - 0.05, z_lo + 0.06, depth + eave - 0.02, depth + eave + 0.03, flat(reg), skip=('in',))
    if posts:
        n_p = max(1, round((u1 - u0) / 2.7))
        for i in range(n_p + 1):
            u = u0 + 0.06 + (u1 - u0 - 0.12) * i / n_p
            c.box(f, u - 0.05, u + 0.05, 0.0, zb(depth) - 0.18, depth - 0.05, depth + 0.05, 'WOOD', skip=('bot',),
                  rotate=True, bevel=True)
            if c.lod == 0:
                c.box(f, u - 0.12, u + 0.12, 0.0, 0.1, depth - 0.12, depth + 0.12, 'CONC_FLAT', skip=('bot',))
    return z_lo


# ── parts on walls (house mesh) ─────────────────────────────────────────────

def plinth(c, f, u0, u1, h, holes=(), vents=True):
    """Concrete foundation (kiso) under the walls, set back 2 cm, a sheet
    drip flashing at its top, vent grilles (yukashita kanki-kō)."""
    wall(c, f, u0, u1, 0.0, h, 'CONC_FLAT', holes=holes, d=-0.02)
    for ua, ub, za, zb in cut(u0, u1, h - 0.04, h, holes):
        c.box(f, ua, ub, h - 0.04, h + 0.02, -0.02, 0.06, 'ALU', skip=('in', 'l', 'r'))
    if vents and c.lod == 0:
        for k in range(1, max(2, int((u1 - u0) / 3.6) + 1)):
            u = u0 + (u1 - u0) * k / max(2, int((u1 - u0) / 3.6) + 1)
            if any(hh[0] - 0.4 < u < hh[1] + 0.4 for hh in holes):
                continue
            c.box(f, u - 0.18, u + 0.18, h - 0.22, h - 0.1, -0.02, -0.005, 'IRON', skip=('in', 'l', 'r', 'top', 'bot'))


def band(c, f, u0, u1, z, reg, holes=(), d=0.05, h=0.12):
    """Horizontal flashing / belt between the storeys."""
    for ua, ub, za, zb in cut(u0, u1, z - h / 2, z + h / 2, holes):
        c.box(f, ua, ub, za, zb, -0.01, d, reg, skip=('in', 'l', 'r'))


def balcony(c, f, u0, u1, z, depth=0.9, rail='ALU'):
    """Small balcony: slab on steel brackets, aluminium railing with
    balusters, a laundry pole on hooks."""
    lod = c.lod
    c.box(f, u0, u1, z - 0.12, z, 0.0, depth, 'CONC_FLAT', skip=('in',), bevel=True)
    if lod == 0:
        for u in (u0 + 0.15, u1 - 0.15):
            b = c.box(f, u - 0.03, u + 0.03, z - 0.6, z - 0.12, 0.0, 0.08, 'IRON', skip=('in',))
            c.tube([f(u, z - 0.55, 0.02), f(u, z - 0.13, depth - 0.1)], 0.02, 4, 'IRON')
    zt = z + 1.0
    for u in (u0 + 0.03, u1 - 0.03):
        c.box(f, u - 0.025, u + 0.025, z, zt, depth - 0.06, depth - 0.01, rail, skip=('bot',))
    for a, b in ((u0, u1),):
        c.box(f, a, b, zt - 0.05, zt + 0.02, depth - 0.08, depth + 0.01, rail, skip=('in',))
        c.box(f, a, b, z + 0.08, z + 0.12, depth - 0.06, depth - 0.02, rail, skip=('in', 'l', 'r'))
    for dd in (0.05,):
        for sg, uu in ((-1, u0), (1, u1)):
            c.box(f, uu - 0.025 if sg < 0 else uu - 0.05, uu + 0.05 if sg < 0 else uu + 0.025, zt - 0.05, zt + 0.02, dd, depth, rail,
                  skip=('in',))
    if lod == 0:
        k = max(3, int((u1 - u0) / 0.15))
        for i in range(1, k):
            u = u0 + (u1 - u0) * i / k
            c.box(f, u - 0.01, u + 0.01, z + 0.12, zt - 0.05, depth - 0.05, depth - 0.03, rail, skip=('in', 'top', 'bot'))
        for u in (u0 + 0.3, u1 - 0.3):
            c.tube([f(u, zt + 0.35, 0.0), f(u, zt + 0.45, depth * 0.6)], 0.012, 3, 'IRON')
        c.tube([f(u0 + 0.1, zt + 0.45, depth * 0.6), f(u1 - 0.1, zt + 0.45, depth * 0.6)], 0.018, 4, 'GALV', caps=True)


def lpg(c, f, u, d=0.25):
    """Two propane cylinders (LP gas) chained to the wall on a concrete pad,
    regulator and pipe into the wall."""
    lod = c.lod
    c.box(f, u - 0.6, u + 0.6, 0.0, 0.08, 0.0, 0.55, 'CONC_FLAT', skip=('bot',), bevel=True)
    for du in (-0.3, 0.3):
        p = f(u + du, 0, d)
        s = K.lathe(c.bm, 8 if lod == 0 else 6, [(0.17, 0.08), (0.19, 0.18), (0.19, 1.15), (0.15, 1.25), (0.06, 1.3)],
                    cx=p.x, cy=p.y, cap_bottom=False)
        c.m(s['sides'] + [s['top']], 'GALV'); c.nb(s['sides'])
        if lod == 0:
            r = K.lathe(c.bm, 6, [(0.1, 1.3), (0.1, 1.45)], cx=p.x, cy=p.y, cap_bottom=False)
            c.m(r['sides'] + [r['top']], 'IRON'); c.nb(r['sides'])
    if lod == 0:
        c.tube([f(u - 0.5, 0.9, 0.02), f(u, 0.95, d + 0.2), f(u + 0.5, 0.9, 0.02)], 0.008, 3, 'IRON')
        c.box(f, u - 0.1, u + 0.1, 1.5, 1.7, 0.0, 0.12, 'GALV')
        c.tube([f(u, 1.6, 0.06), f(u, 2.2, 0.06)], 0.015, 4, 'GALV')


def kerosene(c, f, u, d=0.35):
    """Kerosene tank on four legs (tōyu tank) with the feed pipe to the
    water heater - every rural house has one."""
    c.box(f, u - 0.45, u + 0.45, 0.6, 1.25, d - 0.25, d + 0.25, 'TOTAN_RED_FLAT', skip=(), bevel=True)
    if c.lod == 0:
        for du in (-0.4, 0.4):
            for dd in (-0.2, 0.2):
                c.box(f, u + du - 0.025, u + du + 0.025, 0.0, 0.6, d + dd - 0.025, d + dd + 0.025, 'IRON', skip=('bot',))
        c.tube([f(u + 0.3, 0.6, d), f(u + 0.3, 0.35, d), f(u + 1.1, 0.35, 0.1)], 0.012, 4, 'GALV')
    c.box(f, u + 0.9, u + 1.5, 0.0, 0.85, 0.0, 0.3, 'PAINT_WHITE', skip=('bot',), bevel=True)   # boiler


def ac_unit(c, f, u, z, d=0.0):
    """Outdoor unit of an air conditioner on the wall or ground, fan grille,
    pipes in a duct up the wall."""
    b = c.box(f, u - 0.4, u + 0.4, z, z + 0.6, d, d + 0.3, 'PAINT_WHITE', skip=('in',), bevel=True)
    if c.lod == 0:
        p = f(u - 0.1, z + 0.3, d + 0.305)
        fr = F(f(u - 0.1, 0, d + 0.3), f.n)
        g = c.box(fr, -0.2, 0.2, z + 0.1, z + 0.5, 0.0, 0.01, 'IRON', skip=('in', 'l', 'r', 'top', 'bot'))
        c.box(f, u + 0.35, u + 0.43, z + 0.3, 2.6 if z < 1 else z + 1.2, 0.0, 0.08, 'PAINT_WHITE', skip=('in',))


def antenna(c, p, h=2.2):
    """Yagi TV antenna on a mast with a guy wire stay."""
    if c.lod:
        return
    p = Vector(p)
    c.tube([p, p + Vector((0, 0, h))], 0.02, 4, 'GALV', caps=True)
    top = p + Vector((0, 0, h - 0.2))
    c.tube([top + Vector((-0.6, 0, 0)), top + Vector((0.6, 0, 0))], 0.01, 3, 'GALV', caps=True)
    for i in range(6):
        x = -0.5 + i * 0.2
        w = 0.35 - 0.03 * i
        c.tube([top + Vector((x, -w, 0)), top + Vector((x, w, 0))], 0.006, 3, 'GALV')


def downpipe(c, f, u, z0, z1, d=0.09):
    if c.lod:
        return
    c.tube([f(u, z0 + 0.1, d), f(u, z1, d)], 0.04, 4, 'GALV')
    for z in (z0 + 0.8, (z0 + z1) / 2, z1 - 0.4):
        c.box(f, u - 0.05, u + 0.05, z, z + 0.04, 0.0, d + 0.02, 'IRON')


# ── harbour pieces (atlas Minato) ───────────────────────────────────────────

def bollard(c, p, stone=False):
    """Mooring post: cast-iron bitt with a cap, on a concrete pad - or an
    old granite post (quiet bay)."""
    lod = c.lod
    p = Vector(p)
    if stone:
        s = K.lathe(c.bm, 6 if lod == 0 else 4, [(0.2, 0.0), (0.18, 0.55), (0.12, 0.65)], cx=p.x, cy=p.y, phase=0.3,
                    cap_bottom=False)
        c.m(s['sides'] + [s['top']], 'STONE_FLAT'); c.nb(s['sides'])
        return
    c.box(F(p, (0, -1)), -0.35, 0.35, 0.0, 0.05, -0.35, 0.35, 'CONC_FLAT', skip=('bot',), bevel=True)
    s = K.lathe(c.bm, 10 if lod == 0 else 6, [(0.2, 0.05), (0.16, 0.12), (0.14, 0.38), (0.24, 0.44), (0.24, 0.5), (0.15, 0.55)],
                cx=p.x, cy=p.y, cap_bottom=False)
    c.m(s['sides'] + [s['top']], 'IRON'); c.nb(s['sides'])


def tyre(c, p, n_dir, r=0.36, w=0.16):
    """Old car tyre hung as a fender (on the quay wall, boats, piers): a
    ring of tube segments, chain to the top."""
    lod = c.lod
    p = Vector(p); nd = Vector(n_dir).normalized()
    t = nd.cross(ZV).normalized()
    pts = [p + t * (r * math.cos(2 * math.pi * k / 8)) + ZV * (r * math.sin(2 * math.pi * k / 8)) for k in range(9)]
    sides, _, _ = K.tube_path(c.bm, pts, w / 2 + 0.04, 6 if lod == 0 else 4)
    c.m(sides, 'RUBBER'); c.nb(sides)


def quay(c, L=8.0, stone=False, apron=6.0, ladder=True, seed=1):
    """Quay wall along X, edge at y = 0, water to -Y: apron (y 0..apron)
    at z = 0, coping, wall face down past the water line (concrete lifts or
    squared stone), a strip of sea, bollard, fenders and a ladder."""
    lod = c.lod
    r = random.Random(seed)
    xa, xb = -L / 2, L / 2
    zb = WATER_Z - 0.6
    y = 0.4
    while y < apron - 1e-3:
        ye = min(apron, y + 2.0)
        f = _face(c, [(xa, y, 0.0), (xb, y, 0.0), (xb, ye, 0.0), (xa, ye, 0.0)], (0, 0, 1))
        c.m([f], 'APRON')
        y = ye
    # coping: chamfered concrete (or granite) edge, 0.4 m wide, 5 cm proud of the wall
    fr = F(Vector((0, 0, 0)), (0, -1))     # u = x, d = -y
    cap = 'STONE_FLAT' if stone else 'CONC_FLAT'
    b = c.box(fr, xa, xb, -0.12, 0.0, -0.4, 0.05, None, skip=('bot', 'in', 'l', 'r'), bevel=True)
    c.m([b['top']], 'APRON' if not stone else 'STONE_FLAT'); c.m([b['out']], cap)
    wfront = _face(c, [(xa, -0.0, zb), (xb, -0.0, zb), (xb, -0.0, -0.12), (xa, -0.0, -0.12)], (0, -1, 0))
    _map(c, [wfront], 'QUAY_STONE' if stone else 'QUAY', (0, 0, zb), (1, 0, 0), (0, 0, 1))
    under = _face(c, [(xa, -0.05, -0.12), (xb, -0.05, -0.12), (xb, 0.0, -0.12), (xa, 0.0, -0.12)], (0, 0, -1))
    c.m([under], cap); c.nb([under])
    # sea
    y = 0.0
    while y > -8.0 + 1e-3:
        ye = y - 4.0
        wf = _face(c, [(xa, ye, WATER_Z), (xb, ye, WATER_Z), (xb, y, WATER_Z), (xa, y, WATER_Z)], (0, 0, 1))
        c.m([wf], 'WATER'); c.nb([wf])
        y = ye
    if stone:
        bollard(c, (-1.0, 0.45, 0.0), stone=True)
    else:
        bollard(c, (-1.2, 0.55, 0.0))
    if lod == 0 and not stone:   # rubber fenders (V-type) bolted to the face
        for x in (-3.0, 1.2):
            b = c.box(fr, x - 0.2, x + 0.2, WATER_Z + 0.1, -0.2, 0.0, 0.22, 'RUBBER', skip=('in',))
    if lod == 0 and stone:
        tyre(c, (2.4, -0.1, -0.55), (0, -1, 0))
    if ladder and not stone:
        x = 2.6
        for sg in (-1, 1):
            c.tube([(x + sg * 0.22, -0.02, zb + 0.4), (x + sg * 0.22, -0.02, 0.0), (x + sg * 0.22, 0.35, 0.0), (x + sg * 0.22, 0.35, -0.05)],
                   0.022, 4, 'GALV')
        if lod == 0:
            z = zb + 0.6
            while z < -0.1:
                c.tube([(x - 0.22, -0.02, z), (x + 0.22, -0.02, z)], 0.016, 4, 'GALV')
                z += 0.3


def quay_steps(c, L=8.0, n=5, rise=0.32, tread=0.45, apron=6.0):
    """Stepped landing into the water (kaidan-gogan): steps along X from the
    quay down below the water line, algae on the wet ones, a pipe handrail,
    side cheeks closing the ends."""
    lod = c.lod
    xa, xb = -L / 2, L / 2
    zb = WATER_Z - 0.6
    y = 0.4
    while y < apron - 1e-3:
        ye = min(apron, y + 2.0)
        f = _face(c, [(xa, y, 0.0), (xb, y, 0.0), (xb, ye, 0.0), (xa, ye, 0.0)], (0, 0, 1)); c.m([f], 'APRON')
        y = ye
    f = _face(c, [(xa, 0.0, 0.0), (xb, 0.0, 0.0), (xb, 0.4, 0.0), (xa, 0.4, 0.0)], (0, 0, 1)); c.m([f], 'APRON')
    prof = [(0.0, 0.0)]
    for k in range(n):
        y0 = -k * tread
        z1 = -(k + 1) * rise
        prof += [(y0, z1), (y0 - tread, z1)]
    yl = -n * tread
    prof.append((yl, zb))
    for k in range(n):
        y0 = -k * tread
        za, zbb = -k * rise, -(k + 1) * rise
        riser = _face(c, [(xa, y0, zbb), (xb, y0, zbb), (xb, y0, za), (xa, y0, za)], (0, -1, 0))
        tr = _face(c, [(xa, y0 - tread, zbb), (xb, y0 - tread, zbb), (xb, y0, zbb), (xa, y0, zbb)], (0, 0, 1))
        wet = zbb < WATER_Z + 0.35
        c.m([riser], 'ALGAE' if wet else 'CONC_FLAT'); c.m([tr], 'ALGAE' if wet else 'CONC_FLAT')
    toe = _face(c, [(xa, yl, zb), (xb, yl, zb), (xb, yl, -n * rise), (xa, yl, -n * rise)], (0, -1, 0))
    c.m([toe], 'ALGAE')
    for x, sx in ((xa, -1), (xb, 1)):    # cheeks
        pts = [(x, y_, z_) for y_, z_ in prof] + [(x, 0.0, zb)]
        cf = _face(c, pts, (sx, 0, 0))
        _map(c, [cf], 'QUAY', (0, 0, zb), (0, 1, 0), (0, 0, 1))
    y = yl
    while y > -8.0 + 1e-3:
        ye = max(-8.0, y - 4.0)
        wf = _face(c, [(xa, ye, WATER_Z), (xb, ye, WATER_Z), (xb, y, WATER_Z), (xa, y, WATER_Z)], (0, 0, 1))
        c.m([wf], 'WATER'); c.nb([wf])
        y = ye
    x = xb - 0.6
    pts = [(x, 0.6, 0.0), (x, 0.6, 0.9)] + [(x, -k * tread - 0.2, -k * rise + 0.9) for k in range(n - 1)] + \
          [(x, -(n - 1) * tread - 0.2, -(n - 1) * rise)]
    c.tube(pts, 0.025, 6 if lod == 0 else 4, 'GALV')
    if lod == 0:
        for k in range(0, n - 1, 2):
            p = (x, -k * tread - 0.2, -k * rise)
            c.tube([(p[0], p[1], p[2] - rise), (p[0], p[1], p[2] + 0.9)], 0.02, 4, 'GALV')


def pier(c, L=8.0, W=2.4, zd=-0.2, seed=3):
    """Small pier on piles out into the water (along -Y): plank deck in
    0.5 m bands, edge beams, cross beams on concrete piles, cleats, tyres,
    a ladder at the head."""
    lod = c.lod
    r = random.Random(seed)
    xa, xb = -W / 2, W / 2
    y = 0.0
    while y > -L + 1e-3:
        ye = y - 0.5
        f = _face(c, [(xa, ye, zd), (xb, ye, zd), (xb, y, zd), (xa, y, zd)], (0, 0, 1))
        c.m([f], 'DECK')
        y = ye
    fr = F(Vector((0, 0, 0)), (-1, 0))     # u = -y ... t = (0, -1): u runs out along the pier
    for x, sx in ((xa, -1), (xb, 1)):
        f2 = F(Vector((x, 0, 0)), (sx, 0))
        ua, ub = sorted((f2.t.dot(Vector((0, 0, 0))), f2.t.dot(Vector((0, -L, 0)))))
        c.box(f2, ua, ub, zd - 0.3, zd, -0.12, 0.02, 'WOOD', skip=('in', 'top'))
    ys = [-0.3 - (L - 0.6) * i / max(1, round(L / 2.0)) for i in range(round(L / 2.0) + 1)]
    for yy in ys:
        f3 = F(Vector((0, yy, 0)), (0, -1))
        c.box(f3, xa - 0.05, xb + 0.05, zd - 0.55, zd - 0.3, -0.12, 0.12, 'WOOD', skip=('top',))
        for x in (xa + 0.2, xb - 0.2):
            s = K.lathe(c.bm, 8 if lod == 0 else 5, [(0.16, WATER_Z - 0.7), (0.16, zd - 0.55)], cx=x, cy=yy, cap_bottom=False)
            c.m(s['sides'], 'CONC_FLAT', zrange=(WATER_Z - 0.7, zd)); c.nb(s['sides'])
            if lod == 0:
                a = K.lathe(c.bm, 8, [(0.17, WATER_Z - 0.05), (0.17, WATER_Z + 0.35)], cx=x, cy=yy, cap_bottom=False, cap_top=False)
                c.m(a['sides'], 'ALGAE'); c.nb(a['sides'])
    if lod == 0:
        for yy in (-2.0, -L + 0.4):
            for x in (xa + 0.12, xb - 0.12):
                c.box(F(Vector((x, yy, 0)), (0, -1)), -0.15, 0.15, zd, zd + 0.12, -0.04, 0.04, 'IRON', skip=('bot',))
        for yy in (-3.0, -6.0):
            tyre(c, (xb + 0.08, yy, zd - 0.45), (1, 0, 0))
        # ladder at the head
        for sg in (-0.22, 0.22):
            c.tube([(sg, -L - 0.03, WATER_Z - 0.4), (sg, -L - 0.03, zd + 0.7)], 0.02, 4, 'GALV')
        z = WATER_Z - 0.2
        while z < zd:
            c.tube([(-0.22, -L - 0.03, z), (0.22, -L - 0.03, z)], 0.015, 4, 'GALV')
            z += 0.3


def tetrapod(c, p, size, rot, seed=0):
    """Tetrapod: four tapered legs from a centre along the tetrahedron axes."""
    lod = c.lod
    dirs = [Vector((1, 1, 1)), Vector((1, -1, -1)), Vector((-1, 1, -1)), Vector((-1, -1, 1))]
    M = rot
    for d in dirs:
        d = (M @ d).normalized()
        a = d.orthogonal().normalized(); b = d.cross(a)
        n = 5 if lod == 0 else 4
        rings = []
        for t, rr in ((0.0, 0.33), (0.62, 0.2)):
            cc = Vector(p) + d * (t * size)
            rings.append([c.bm.verts.new(cc + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * rr * size)
                          for k in range(n)])
        fs = []
        for k in range(n):
            fs.append(c.bm.faces.new([rings[0][k], rings[0][(k + 1) % n], rings[1][(k + 1) % n], rings[1][k]]))
        cap = c.bm.faces.new(rings[1])
        fs.append(cap)
        orient(fs, Vector(p) + d * (0.3 * size))
        c.m(fs, 'TETRA'); c.nb(fs)


def breakwater(c, L=8.0, seed=4):
    """Breakwater (bōhatei) along X: caisson crown 4 m wide at +1.0, a
    parapet on the sea side, harbour face down to the water, armour of
    tetrapods piled on the sea side (+Y)."""
    lod = c.lod
    r = random.Random(seed)
    xa, xb = -L / 2, L / 2
    zt = 1.0
    zb = WATER_Z - 0.6
    for ya, yb in ((-2.0, 0.0), (0.0, 1.4)):
        f = _face(c, [(xa, ya, zt), (xb, ya, zt), (xb, yb, zt), (xa, yb, zt)], (0, 0, 1)); c.m([f], 'APRON')
    hf = _face(c, [(xa, -2.0, zb), (xb, -2.0, zb), (xb, -2.0, 0.0), (xa, -2.0, 0.0)], (0, -1, 0))
    _map(c, [hf], 'QUAY', (0, 0, zb), (1, 0, 0), (0, 0, 1))
    hf2 = _face(c, [(xa, -2.0, 0.0), (xb, -2.0, 0.0), (xb, -2.0, zt), (xa, -2.0, zt)], (0, -1, 0))
    c.m([hf2], 'CONC_FLAT')
    fr = F(Vector((0, 0, 0)), (0, -1))
    b = c.box(fr, xa, xb, zt, zt + 1.3, -2.0, -1.4, None, skip=('bot', 'l', 'r'), bevel=True)
    c.m([b['out'], b['in'], b['top']], 'CONC_FLAT')
    sf = _face(c, [(xa, 2.0, zb), (xb, 2.0, zb), (xb, 2.0, zt), (xa, 2.0, zt)], (0, 1, 0))
    c.m([sf], 'CONC_FLAT')
    sc = _face(c, [(xa, 1.4, zt), (xb, 1.4, zt), (xb, 2.0, zt), (xa, 2.0, zt)], (0, 0, 1)); c.m([sc], 'CONC_FLAT')
    y = -2.0
    while y > -6.0 + 1e-3:
        wf = _face(c, [(xa, y - 4.0, WATER_Z), (xb, y - 4.0, WATER_Z), (xb, y, WATER_Z), (xa, y, WATER_Z)], (0, 0, 1))
        c.m([wf], 'WATER'); c.nb([wf])
        y -= 4.0
    wf = _face(c, [(xa, 2.0, WATER_Z), (xb, 2.0, WATER_Z), (xb, 10.0, WATER_Z), (xa, 10.0, WATER_Z)], (0, 0, 1))
    c.m([wf], 'WATER'); c.nb([wf])
    # armour: two rows of tetrapods leaning against the parapet, the lower ones in the water
    rows = ((2.6, zt + 0.5, 2.0), (4.2, zt - 0.4, 2.0), (5.8, WATER_Z + 0.2, 2.2)) if lod == 0 else ((3.0, zt, 2.6), (5.2, WATER_Z + 0.5, 2.6))
    for yy, zz, step in rows:
        x = xa + r.uniform(0.2, 0.8)
        while x < xb - 0.3:
            rot = Matrix.Rotation(r.uniform(0, 6.28), 3, 'Z') @ Matrix.Rotation(r.uniform(-0.6, 0.6), 3, 'X')
            tetrapod(c, (x, yy + r.uniform(-0.3, 0.3), zz + r.uniform(-0.2, 0.2)), 1.6, rot)
            x += step + r.uniform(-0.2, 0.3)
    # bollard and a painted line on the harbour side
    if lod == 0:
        bollard(c, (0.0, -1.5, zt))


def slipway(c, L=8.0, apron=6.0, slope=1 / 8):
    """Boat slipway (fune-age-ba): concrete ramp 1:8 from the quay down into
    the sea across the whole module, algae below the tide line, two timber
    skids (bangi) the boats slide on, cheeks closing the ends; on the apron
    a winch on a concrete base with its drum, motor box and cable running
    down the ramp to a hook, bollards on both sides."""
    lod = c.lod
    xa, xb = -L / 2, L / 2
    zb = WATER_Z - 0.6
    yl = zb / slope                       # where the ramp meets the sea bed (negative)
    z = lambda y: y * slope
    y = 0.0
    while y < apron - 1e-3:
        ye = min(apron, y + 2.0)
        f = _face(c, [(xa, y, 0.0), (xb, y, 0.0), (xb, ye, 0.0), (xa, ye, 0.0)], (0, 0, 1)); c.m([f], 'APRON')
        y = ye
    y = 0.0
    while y > yl + 1e-3:                  # ramp in 1.6 m bands (strip height), wet ones with algae
        ye = max(yl, y - 1.6)
        f = _face(c, [(xa, ye, z(ye)), (xb, ye, z(ye)), (xb, y, z(y)), (xa, y, z(y))], (0, 0, 1))
        c.m([f], 'ALGAE' if z(ye) < WATER_Z + 0.3 else 'APRON')
        y = ye
    for x, sx in ((xa, -1), (xb, 1)):
        cf = _face(c, [(x, 0.0, 0.0), (x, yl, zb), (x, 0.0, zb)], (sx, 0, 0))
        _map(c, [cf], 'QUAY', (0, 0, zb), (0, 1, 0), (0, 0, 1))
    y = yl + 0.0
    yw = WATER_Z / slope
    while y > -16.0 + 1e-3:   # sea in front, from where the ramp dives under
        ye = max(-16.0, y - 4.0)
        wf = _face(c, [(xa, ye, WATER_Z), (xb, ye, WATER_Z), (xb, y, WATER_Z), (xa, y, WATER_Z)], (0, 0, 1))
        c.m([wf], 'WATER'); c.nb([wf])
        y = ye
    wf = _face(c, [(xa, yl, WATER_Z), (xb, yl, WATER_Z), (xb, yw, WATER_Z), (xa, yw, WATER_Z)], (0, 0, 1))
    c.m([wf], 'WATER'); c.nb([wf])
    # timber skids along the ramp, on short sleepers
    fr = F(Vector((0, 0, 0)), (1, 0))      # u = y, d = x
    for x in (-1.1, 1.1):
        pts = [(x, -0.4, z(-0.4) + 0.12), (x, yw - 1.0, z(yw - 1.0) + 0.12)]
        a, b = Vector(pts[0]), Vector(pts[1])
        d = (b - a).normalized(); side = Vector((1, 0, 0)); up = side.cross(d).normalized()
        vs = [c.bm.verts.new(p + side * sx * 0.08 + up * h) for p in (a, b) for sx in (-1, 1) for h in (-0.12, 0.0)]
        quads = [(0, 4, 6, 2), (1, 3, 7, 5), (2, 6, 7, 3), (0, 1, 5, 4), (0, 2, 3, 1), (4, 5, 7, 6)]
        fs = [c.bm.faces.new([vs[i] for i in q]) for q in quads]
        orient(fs, (a + b) / 2 - up * 0.06)
        c.m(fs, 'WOOD_FLAT')
    # winch on a concrete base, drum, motor box, cable down the ramp
    yw0 = 3.2
    b = c.box(F(Vector((0, yw0, 0)), (0, -1)), -0.9, 0.9, 0.0, 0.35, -0.5, 0.5, 'CONC_FLAT', skip=('bot',), bevel=True)
    for x in (-0.55, 0.55):
        c.box(F(Vector((x, yw0, 0)), (0, -1)), -0.06, 0.06, 0.35, 0.95, -0.3, 0.3, 'STEEL_GREEN')
    c.tube([(-0.5, yw0, 0.75), (0.5, yw0, 0.75)], 0.2, 10 if lod == 0 else 6, 'STEEL_GREEN', caps=True)
    if lod == 0:
        c.tube([(-0.45, yw0, 0.75), (0.45, yw0, 0.75)], 0.215, 10, 'RUST', caps=False)      # wound cable
    mb = c.box(F(Vector((0.95, yw0, 0)), (0, -1)), -0.25, 0.25, 0.35, 0.9, -0.3, 0.3, 'STEEL_GREEN', skip=('bot',), bevel=True)
    if lod == 0:
        c.box(F(Vector((0.95, yw0, 0)), (0, -1)), -0.27, 0.27, 0.9, 0.95, -0.32, 0.32, 'STEEL_GREEN')
        c.tube([(0, yw0 - 0.2, 0.6), (0, 0.2, 0.08), (0, -6.0, z(-6.0) + 0.05)], 0.012, 4, 'IRON')
        c.tube([(0, -6.0, z(-6.0) + 0.05), (0, -6.15, z(-6.15) + 0.12), (0, -6.25, z(-6.25) + 0.05)], 0.02, 4, 'IRON')
    for x in (-3.4, 3.4):
        bollard(c, (x, 0.6, 0.0))


def lighthouse(c, red=True):
    """Small harbour light on a breakwater head (bōhatei tōdai): concrete
    base with door, tapering tower, gallery with railing, lantern, cap."""
    lod = c.lod
    n = 12 if lod == 0 else 8
    reg = 'PAINT_RED' if red else 'PAINT_WHITE'
    s = K.lathe(c.bm, 8, [(1.3, 0.0), (1.3, 0.9), (1.2, 1.0)], cap_bottom=False, phase=math.pi / 8)
    c.m(s['sides'], 'CONC_FLAT'); c.m([s['top']], 'CONC_FLAT')
    t = K.lathe(c.bm, n, [(0.8, 1.0), (0.62, 7.0), (0.9, 7.05), (0.9, 7.2)], cap_bottom=False)
    c.m(t['sides'][:n], reg, zrange=(1.0, 7.0)); c.m(t['sides'][n:], 'PAINT_WHITE'); c.m([t['top']], 'PAINT_WHITE'); c.nb(t['sides'][n:])
    fr = F(Vector((0, -0.74, 0)), (0, -1))
    d = c.box(fr, -0.35, 0.35, 1.05, 2.9, -0.1, 0.06, 'IRON', skip=('in', 'bot'))
    if lod == 0:
        for k in range(10):
            a = 2 * math.pi * k / 10
            c.tube([(0.86 * math.cos(a), 0.86 * math.sin(a), 7.2), (0.86 * math.cos(a), 0.86 * math.sin(a), 7.95)], 0.018, 3, 'PAINT_WHITE')
        ring = [(0.86 * math.cos(2 * math.pi * k / 12), 0.86 * math.sin(2 * math.pi * k / 12), 7.95) for k in range(13)]
        c.tube(ring, 0.022, 4, 'PAINT_WHITE')
    g = K.lathe(c.bm, 8, [(0.38, 7.2), (0.38, 7.3), (0.34, 7.3), (0.34, 8.1), (0.4, 8.1), (0.4, 8.2)], cap_bottom=False, cap_top=False)
    c.m(g['sides'][:16], 'PAINT_WHITE'); c.m(g['sides'][16:24], 'GLASS'); c.m(g['sides'][24:], reg); c.nb(g['sides'])
    cp = K.lathe(c.bm, 8, [(0.4, 8.2), (0.3, 8.42), (0.08, 8.55), (0.0, 8.6)])
    c.m(cp['sides'], reg); c.nb(cp['sides'])
    if lod == 0:
        c.tube([(0, 0, 8.6), (0, 0, 9.3)], 0.012, 3, 'IRON', caps=True)


# ── boats (atlas MinatoShop) ────────────────────────────────────────────────

def _hull(c, st, deck_off=0.55, stripe=True):
    """Hull lofted from stations (x, half-beam, keel z, sheer z), bow last.
    Bands: antifouling red to 0.15 above the water line, white topsides, a
    blue sheer stripe; bulwark inside, deck, transom."""
    bm = c.bm

    def sec(x, hb, kz, sz):
        pts = [(0.0, kz), (0.55 * hb, kz * 0.5), (0.97 * hb, -0.05), (hb, 0.15)]
        if stripe:
            pts.append((hb, sz - 0.28))
        pts.append((hb, sz))
        return pts
    regs = ['HULL_RED', 'HULL_RED', 'HULL_RED'] + (['HULL_WHITE', 'HULL_BLUE'] if stripe else ['HULL_WHITE'])
    secs = [sec(*s) for s in st]
    for sg in (-1, 1):
        rings = [[bm.verts.new((s[0], sg * y, z)) for y, z in p] for s, p in zip(st, secs)]
        for i in range(len(st) - 1):
            for k in range(len(secs[0]) - 1):
                f = bm.faces.new([rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]])
                f.normal_update()
                mid = f.calc_center_median()
                if f.normal.dot(Vector((0, sg, 0.0 if k > 1 else -0.6))) < 0:
                    f.normal_flip()
                c.m([f], regs[k]); c.nb([f])
        # bulwark inside + deck edge
        inner = [[bm.verts.new((s[0], sg * max(s[1] - 0.07, 0.02), s[3] - deck_off)), bm.verts.new((s[0], sg * max(s[1] - 0.07, 0.02), s[3]))]
                 for s in st]
        for i in range(len(st) - 1):
            f = bm.faces.new([inner[i][0], inner[i + 1][0], inner[i + 1][1], inner[i][1]])
            f.normal_update()
            if f.normal.y * sg > 0:
                f.normal_flip()
            c.m([f], 'HULL_WHITE'); c.nb([f])
            g = bm.faces.new([rings[i][-1], rings[i + 1][-1], inner[i + 1][1], inner[i][1]])
            g.normal_update()
            if g.normal.z < 0:
                g.normal_flip()
            c.m([g], 'WOOD_LIGHT'); c.nb([g])
    # deck
    for i in range(len(st) - 1):
        a, b = st[i], st[i + 1]
        ya, yb = max(a[1] - 0.07, 0.02), max(b[1] - 0.07, 0.02)
        f = _face(c, [(a[0], -ya, a[3] - deck_off), (b[0], -yb, b[3] - deck_off), (b[0], yb, b[3] - deck_off), (a[0], ya, a[3] - deck_off)], (0, 0, 1))
        c.m([f], 'DECK_GREY'); c.nb([f])
    # transom
    s0, p0 = st[0], secs[0]
    pts = [(s0[0], -y, z) for y, z in p0] + [(s0[0], y, z) for y, z in reversed(p0)]
    tr = _face(c, pts, (-1, 0, 0))
    c.m([tr], 'HULL_WHITE'); c.nb([tr])
    return secs


def boat_ika(c, name='BOAT0'):
    """Small squid-jigging boat (ika-tsuri-sen, ~12 m): FRP hull with a blue
    sheer stripe, wheelhouse with mast, radar and whip antennas, two rows
    of big bare lamps (shūgyotō) on wires between bow and stern masts,
    jigging machines along the gunwale, tyre fenders, steadying sail.
    Origin at the water line, bow to +X."""
    lod = c.lod
    st = [(-5.6, 1.35, -0.45, 1.25), (-4.0, 1.52, -0.62, 1.2), (-1.5, 1.62, -0.72, 1.22), (1.5, 1.56, -0.7, 1.32),
          (3.8, 1.2, -0.55, 1.58), (5.2, 0.6, -0.25, 1.85), (6.0, 0.06, 0.6, 2.0)]
    if lod:
        st = [st[0], st[2], st[4], st[5], st[6]]
    _hull(c, st)
    fr = F(Vector((0, 0, 0)), (0, -1))      # u = x, d = -y
    dz = 0.7
    # wheelhouse
    x0, x1 = -3.4, -0.7
    b = c.box(fr, x0, x1, dz, dz + 1.9, -1.0, 1.0, None, skip=('bot',), bevel=True)
    c.m([b[k] for k in ('out', 'in', 'l', 'r')], 'HULL_WHITE'); c.m([b['top']], 'DECK_GREY')
    for k in ('out', 'in'):           # side windows
        dd = 1.0 if k == 'in' else -1.0
        sg = 1 if k == 'in' else -1
        w = c.box(fr, x0 + 0.3, x1 - 0.3, dz + 1.1, dz + 1.65, -1.0 - 0.01, 1.0 + 0.01, None, skip=('bot', 'top', 'l', 'r', 'in' if k == 'out' else 'out'))
        c.m(list(w.values()), 'GLASS'); c.nb(list(w.values()))
    wf = F(Vector((x1, 0, 0)), (1, 0))      # front windows (u = y)
    for ua, ub in ((-0.9, -0.33), (-0.28, 0.28), (0.33, 0.9)):
        g = c.box(wf, ua, ub, dz + 1.1, dz + 1.7, 0.0, 0.01, 'GLASS', skip=('in', 'l', 'r', 'top', 'bot'))
    c.box(fr, x0 - 0.1, x1 + 0.25, dz + 1.9, dz + 2.0, -1.1, 1.1, 'HULL_WHITE', skip=(), bevel=True)   # roof with visor
    if lod == 0:
        for sg in (-1, 1):   # roof railing
            c.tube([(x0, sg * 1.05, dz + 2.0), (x0, sg * 1.05, dz + 2.45), (x1 + 0.1, sg * 1.05, dz + 2.45), (x1 + 0.1, sg * 1.05, dz + 2.0)],
                   0.018, 4, 'STEEL')
    # masts: on the wheelhouse (radar, antennas), bow and stern (lamp wires)
    mx = -2.2
    c.tube([(mx, 0, dz + 2.0), (mx, 0, dz + 4.4)], 0.06, 6 if lod == 0 else 4, 'WHITE', caps=True)
    rd = c.box(fr, mx - 0.9, mx + 0.9, dz + 3.9, dz + 4.05, -0.08, 0.08, 'WHITE', skip=())   # radar open array
    if lod == 0:
        c.box(fr, mx - 0.2, mx + 0.2, dz + 3.6, dz + 3.9, -0.15, 0.15, 'WHITE')
        for dx, h in ((-0.4, 3.2), (0.35, 2.6), (0.6, 2.2)):
            c.tube([(mx + dx, 0.3, dz + 2.0), (mx + dx, 0.3, dz + 2.0 + h)], 0.012, 3, 'ANTENNA', caps=True)
        s = K.lathe(c.bm, 6, [(0.12, dz + 2.0), (0.14, dz + 2.15), (0.0, dz + 2.3)], cx=x1 - 0.2, cy=-0.6)
        c.m(s['sides'], 'STEEL'); c.nb(s['sides'])
    fx, ax = 4.6, -5.0
    zw = 4.0
    c.tube([(fx, 0, 1.0), (fx, 0, zw + 0.6)], 0.06, 6 if lod == 0 else 4, 'WHITE', caps=True)
    c.tube([(ax, 0, 0.7), (ax, 0, zw + 0.4)], 0.06, 6 if lod == 0 else 4, 'WHITE', caps=True)
    for x, z in ((fx, zw + 0.1), (ax, zw)):
        c.tube([(x, -0.7, z), (x, 0.7, z)], 0.04, 4, 'WHITE', caps=True)
    for sg in (-1, 1):
        c.tube([(ax, sg * 0.6, zw), ((ax + fx) / 2, sg * 0.6, zw - 0.15), (fx, sg * 0.6, zw + 0.1)], 0.008, 3, 'BLACK')
        n_l = 11 if lod == 0 else 6
        for i in range(n_l):
            x = ax + 0.5 + (fx - ax - 1.0) * i / (n_l - 1)
            if x0 - 0.2 < x < x1 + 0.2:
                continue
            t = (x - ax) / (fx - ax)
            z = zw - 0.15 * (1 - (2 * t - 1) ** 2) + 0.1 * t
            p = Vector((x, sg * 0.6, z))
            if lod == 0:
                s = K.lathe(c.bm, 6, [(0.035, -0.02), (0.035, -0.12), (0.1, -0.2), (0.13, -0.32), (0.09, -0.45), (0.0, -0.5)],
                            cx=p.x, cy=p.y, cap_top=True)
                for v in [v for ring in s['rings'] for v in ring]:
                    v.co.z += z
                c.m(s['sides'][:6], 'IRON'); c.m(s['sides'][6:] + [s['top']], 'LAMP_GLASS'); c.nb(s['sides'])
            else:
                c.box(F(p, (0, -1)), -0.1, 0.1, z - 0.45, z - 0.1, -0.1, 0.1, 'LAMP_GLASS', skip=('top',))
    # steadying sail on the stern mast
    sail = _face(c, [(ax - 0.05, 0, 1.4), (ax - 0.05, 0, zw - 0.1), (ax - 1.5, 0, 1.6)], (0, -1, 0))
    sail2 = _face(c, [(ax - 0.05, 0.01, 1.4), (ax - 0.05, 0.01, zw - 0.1), (ax - 1.5, 0.01, 1.6)], (0, 1, 0))
    c.m([sail, sail2], 'WHITE'); c.nb([sail, sail2])
    if lod == 0:
        # jigging machines on the gunwale
        for sg in (-1, 1):
            for x in (-4.4, 0.4, 1.8, 3.1):
                y = sg * 1.45
                z = 1.25
                bf = F(Vector((x, y, 0)), (0, sg))
                c.box(bf, -0.18, 0.18, z, z + 0.32, -0.25, 0.0, 'WHITE')
                p = bf(0, z + 0.42, 0.05)
                c.tube([bf(-0.15, z + 0.42, 0.05), bf(0.15, z + 0.42, 0.05)], 0.11, 6, 'STEEL', caps=True)
                c.tube([bf(0, z + 0.3, -0.1), bf(0, z + 0.85, 0.75)], 0.012, 3, 'STEEL', caps=True)
        for x in (-3.0, 0.0, 2.6):
            for sg in (-1, 1):
                tyre(c, (x, sg * 1.66, 0.7), (0, sg, 0), r=0.3, w=0.14)
        # life ring on the wheelhouse, buoys and crates on deck
        lr = [Vector((x1 + 0.01, -0.5 + 0.28 * math.cos(2 * math.pi * k / 8), dz + 1.0 + 0.28 * math.sin(2 * math.pi * k / 8)))
              for k in range(9)]
        sides, _, _ = K.tube_path(c.bm, lr, 0.06, 4)
        c.m(sides, 'BUOY_ORANGE'); c.nb(sides)
    # name on the bow, both sides
    for sg in (-1, 1):
        xs = (2.4, 3.8, 4.4)
        hb = lambda x: 1.56 + (1.2 - 1.56) * (x - 1.5) / 2.3 if x <= 3.8 else 1.2 + (0.6 - 1.2) * (x - 3.8) / 1.4
        sz = lambda x: 1.32 + (1.58 - 1.32) * (x - 1.5) / 2.3 if x <= 3.8 else 1.58 + (1.85 - 1.58) * (x - 3.8) / 1.4
        pts = []
        for x in xs:
            pts.append(Vector((x, sg * (hb(x) + 0.012), sz(x) - 0.62)))
        top = [p + Vector((0, 0, 0.26)) for p in pts]
        vs_b = [c.bm.verts.new(p) for p in pts]; vs_t = [c.bm.verts.new(p) for p in top]
        fs = []
        for i in range(2):
            f = c.bm.faces.new([vs_b[i], vs_b[i + 1], vs_t[i + 1], vs_t[i]])
            f.normal_update()
            if f.normal.y * sg < 0:
                f.normal_flip()
            fs.append(f)
        # the picture runs bow-ward on starboard, stern-ward on port: map by hand
        uv = c.bm.loops.layers.uv.verify()
        u0, v0, u1, v1 = c.R(name)['uv']
        L = xs[-1] - xs[0]
        for f in fs:
            for l in f.loops:
                t = (l.vert.co.x - xs[0]) / L
                t = t if sg < 0 else 1 - t
                l[uv].uv = (u0 + (u1 - u0) * t, v0 + (v1 - v0) * (1.0 if l.vert in vs_t else 0.0))
        c.nb(fs)


def skiff(c, place=None, name=None):
    """Small open boat with an outboard (tenma-sen, ~6 m): FRP hull, three
    thwarts, outboard motor tilted up, a buoy and a rope. Origin at the
    water line, bow to +X."""
    lod = c.lod
    st = [(-2.9, 0.78, -0.2, 0.62), (-1.2, 0.86, -0.3, 0.62), (0.8, 0.82, -0.3, 0.68), (2.2, 0.5, -0.18, 0.82),
          (3.0, 0.04, 0.2, 0.95)]
    if lod:
        st = [st[0], st[2], st[3], st[4]]
    _hull(c, st, deck_off=0.45, stripe=False)
    fr = F(Vector((0, 0, 0)), (0, -1))
    for x in (-1.9, -0.2, 1.3):
        c.box(fr, x - 0.14, x + 0.14, 0.38, 0.43, -0.74, 0.74, 'WOOD_LIGHT', skip=('bot',))
    # outboard motor tilted up over the transom
    m = c.box(fr, -3.35, -2.95, 0.55, 1.0, -0.17, 0.17, 'BLACK', skip=(), bevel=True)
    if lod == 0:
        c.tube([(-3.15, 0, 0.6), (-3.55, 0, 0.35)], 0.05, 4, 'BLACK', caps=True)
        c.tube([(-2.95, 0, 0.8), (-2.5, 0, 0.7)], 0.02, 3, 'BLACK', caps=True)
        for x in (-1.2, 1.0):
            tyre(c, (x, 0.88, 0.35), (0, 1, 0), r=0.22, w=0.1)


# ── dressing (mesh with atlas MinatoShop) ───────────────────────────────────

def buoy(c, p, r=0.16, reg='BUOY_ORANGE', n=6):
    p = Vector(p)
    s = K.lathe(c.bm, n if c.lod == 0 else 4, [(0.0, p.z - r), (r * 0.75, p.z - r * 0.6), (r, p.z), (r * 0.75, p.z + r * 0.6), (0.0, p.z + r)],
                cx=p.x, cy=p.y, phase=0.3)
    c.m(s['sides'], reg); c.nb(s['sides'])
    return s


def buoy_bunch(c, f, u, z, d, n=5, seed=0):
    """Buoys in a net bag hung from a nail: orange, red, white."""
    r = random.Random(seed)
    c.tube([f(u, z, d), f(u, z - 0.3, d + 0.05)], 0.008, 3, 'ROPE')
    for i in range(n if c.lod == 0 else 2):
        a = r.uniform(0, 6.28)
        p = f(u + 0.14 * math.cos(a), z - 0.45 - 0.22 * (i // 3), d + 0.12 + 0.1 * math.sin(a))
        buoy(c, p, r.uniform(0.13, 0.18), r.choice(('BUOY_ORANGE', 'BUOY_ORANGE', 'BUOY_RED', 'BUOY_WHITE', 'BUOY_YELLOW')))


def net_pile(c, f, u, d, w=1.4, h=0.6, seed=0, reg='NET_GREEN'):
    """A heap of fishing net on the ground or a pallet: a lumpy dome, the
    net picture on top, floats (orange) along one edge."""
    r = random.Random(seed)
    n = 8 if c.lod == 0 else 5
    p = f(u, 0, d)
    prof = [(w * 0.5, 0.0), (w * 0.48, h * 0.35), (w * 0.36, h * 0.8), (w * 0.12, h), (0.0, h * 1.02)]
    s = K.lathe(c.bm, n, prof, cx=p.x, cy=p.y, phase=r.random(), cap_bottom=False)
    for ring in s['rings']:
        for v in ring:
            k = 1 + r.uniform(-0.12, 0.12)
            v.co.x = p.x + (v.co.x - p.x) * k * 1.25; v.co.y = p.y + (v.co.y - p.y) * k * 0.8
            v.co.z *= 1 + r.uniform(-0.1, 0.1)
    c.m(s['sides'], reg)
    c.nb(s['sides'])
    if c.lod == 0:
        for i in range(5):
            a = r.uniform(0, 6.28)
            q = Vector((p.x + 0.6 * w * math.cos(a), p.y + 0.42 * w * math.sin(a), 0.06))
            buoy(c, q, 0.06, 'BUOY_ORANGE', n=4)


def net_drape(c, f, u0, u1, z, d, drop=0.9, reg='NET_GREEN', seed=0):
    """Net hung over a rail or a pole to dry: a sagging curtain, both faces."""
    r = random.Random(seed)
    m = 6 if c.lod == 0 else 2
    us = [u0 + (u1 - u0) * i / m for i in range(m + 1)]
    top = [f(u, z + r.uniform(-0.03, 0.03), d) for u in us]
    bot = [f(u, z - drop * r.uniform(0.75, 1.0), d + r.uniform(-0.12, 0.12)) for u in us]
    for sgn in (1, -1):
        for i in range(m):
            q = [top[i], top[i + 1], bot[i + 1], bot[i]]
            fc = c.bm.faces.new([c.bm.verts.new(p + f.n * (0.004 * sgn)) for p in q])
            fc.normal_update()
            if fc.normal.dot(f.n) * sgn < 0:
                fc.normal_flip()
            c.m([fc], reg); c.nb([fc])


def crates(c, f, u, d, n=3, reg='FISHBOX', stacks=1, seed=0, w=0.62, dd=0.42, h=0.24):
    """Stacked plastic fish crates (blue) or styrofoam boxes (white)."""
    r = random.Random(seed)
    side = 'CRATE_BLUE' if reg == 'FISHBOX' else 'STYRO_WHITE'
    for s in range(stacks):
        k = n - (s % 2)
        uu = u + s * (w + 0.06)
        for i in range(max(1, k)):
            du = r.uniform(-0.03, 0.03)
            b = c.box(f, uu + du - w / 2, uu + du + w / 2, i * h, (i + 1) * h, d - dd / 2, d + dd / 2, None, skip=('bot',) if i == 0 else ('bot',))
            c.m([b['out'], b['in']], reg); c.m([b['l'], b['r']], side); c.m([b['top']], side)


def drum(c, p, reg='DRUM_BLUE', r=0.29, h=0.88):
    p = Vector(p)
    s = K.lathe(c.bm, 8 if c.lod == 0 else 6, [(r, p.z), (r, p.z + h)], cx=p.x, cy=p.y, cap_bottom=False)
    c.m(s['sides'] + [s['top']], reg); c.nb(s['sides'])
    if c.lod == 0:
        for z in (0.3, 0.6):
            b = K.lathe(c.bm, 8, [(r + 0.012, p.z + h * z), (r + 0.012, p.z + h * z + 0.03)], cx=p.x, cy=p.y, cap_bottom=False, cap_top=False)
            c.m(b['sides'], reg); c.nb(b['sides'])


def crab_pots(c, f, u, d, n=4, seed=0):
    """Stacked crab pots (kani-kago): flat cones of net on two hoops."""
    r = random.Random(seed)
    for i in range(n):
        p = f(u + r.uniform(-0.05, 0.05), 0, d + r.uniform(-0.05, 0.05))
        z = i * 0.2
        s = K.lathe(c.bm, 8 if c.lod == 0 else 5, [(0.5, z), (0.45, z + 0.18), (0.15, z + 0.26)], cx=p.x, cy=p.y, cap_bottom=False)
        c.m(s['sides'], 'NET_BLUE' if i % 2 else 'NET_GREEN')
        c.m([s['top']], 'NET_DARK'); c.nb(s['sides'] + [s['top']])


def himono_rack(c, f, u, d, w=1.8, dd=0.9, seed=0):
    """Drying rack for fish (himono-ami): a net tray of fish on legs, a
    net cover on a frame - in front of the houses in the sun."""
    z = 0.85
    b = c.box(f, u - w / 2 + 0.03, u + w / 2 - 0.03, z, z + 0.005, d - dd / 2 + 0.03, d + dd / 2 - 0.03, None, skip=('out', 'in', 'l', 'r', 'bot'))
    c.m([b['top']], 'HIMONO')
    b2 = c.box(f, u - w / 2, u + w / 2, z - 0.06, z, d - dd / 2, d + dd / 2, 'WOOD_LIGHT', skip=('top',))
    for du in (-w / 2 + 0.05, w / 2 - 0.05):
        for ddd in (-dd / 2 + 0.05, dd / 2 - 0.05):
            c.box(f, u + du - 0.025, u + du + 0.025, 0.0, z - 0.06, d + ddd - 0.025, d + ddd + 0.025, 'WOOD_LIGHT', skip=('bot', 'top'))
    if c.lod == 0:     # frame for the net cover, rolled back (the fish dry in the sun)
        zt = z + 0.32
        for du in (-w / 2, w / 2):
            c.tube([f(u + du, z, d - dd / 2), f(u + du, zt, d), f(u + du, z, d + dd / 2)], 0.012, 3, 'WOOD_LIGHT')
        c.tube([f(u - w / 2, zt, d), f(u + w / 2, zt, d)], 0.012, 3, 'WOOD_LIGHT')
        c.tube([f(u - w / 2, zt + 0.03, d), f(u + w / 2, zt + 0.03, d)], 0.05, 5, 'NET_DARK')


def ika_line(c, f, u0, u1, z, d, n=8, seed=0):
    """Squid hung to dry on a line between two poles (ika-boshi): split
    squid shapes on clothes pegs, both faces."""
    r = random.Random(seed)
    for u in (u0, u1):
        c.tube([f(u, 0, d), f(u, z + 0.15, d)], 0.03, 4, 'BAMBOO', caps=True)
    c.tube([f(u0, z, d), f((u0 + u1) / 2, z - 0.06, d), f(u1, z, d)], 0.006, 3, 'ROPE')
    outline = [(0.0, 1.0), (0.22, 0.78), (0.2, 0.38), (0.1, 0.38), (0.06, 0.0), (-0.06, 0.0), (-0.1, 0.38), (-0.2, 0.38), (-0.22, 0.78)]
    uv = c.bm.loops.layers.uv.verify()
    U0, V0, U1, V1 = c.R('IKA')['uv']
    m = n if c.lod == 0 else max(2, n // 2)
    for i in range(m):
        t = (i + 0.5) / m
        u = u0 + (u1 - u0) * t
        zz = z - 0.06 * (1 - (2 * t - 1) ** 2) - 0.02
        L = r.uniform(0.38, 0.48)
        for sg in (1, -1):
            pts = [f(u + x * L * 0.9, zz - L + y * L * 0.98, d + 0.003 * sg) for x, y in reversed(outline)]
            fc = c.bm.faces.new([c.bm.verts.new(p) for p in pts])
            fc.normal_update()
            if fc.normal.dot(f.n) * sg < 0:
                fc.normal_flip()
            for l in fc.loops:
                q = l.vert.co - f(u, zz - L, d)
                x = q.dot(f.t) / (L * 0.9); y = q.z / (L * 0.98)
                l[uv].uv = (U0 + (U1 - U0) * (0.5 + x * 0.68), V0 + (V1 - V0) * (0.03 + 0.94 * y))
            c.nb([fc])


def boots(c, f, u, d, reg='BOOT_WHITE'):
    """A pair of fishermen's rubber boots standing by the door."""
    for du in (-0.08, 0.08):
        p = f(u + du, 0, d)
        s = K.lathe(c.bm, 6 if c.lod == 0 else 4, [(0.06, 0.0), (0.065, 0.3), (0.075, 0.42)], cx=p.x, cy=p.y, cap_bottom=False, cap_top=False)
        c.m(s['sides'], reg); c.nb(s['sides'])
        foot = c.box(f, u + du - 0.05, u + du + 0.05, 0.0, 0.1, d, d + 0.2, reg, skip=('bot',))


def cooler(c, f, u, d, reg='WHITE', lid='CRATE_BLUE'):
    """Hard cooler box with a coloured lid and a handle."""
    b = c.box(f, u - 0.35, u + 0.35, 0.0, 0.36, d - 0.22, d + 0.22, reg, skip=('bot',), bevel=True)
    c.box(f, u - 0.37, u + 0.37, 0.36, 0.42, d - 0.24, d + 0.24, lid, skip=('bot',), bevel=True)
    if c.lod == 0:
        c.tube([f(u - 0.2, 0.42, d), f(u - 0.2, 0.5, d), f(u + 0.2, 0.5, d), f(u + 0.2, 0.42, d)], 0.012, 3, 'BLACK')


def rope_coil(c, p, r=0.35, turns=3, reg='ROPE_BLUE'):
    """Coil of mooring rope flaked on the ground."""
    p = Vector(p)
    pts = []
    n = 10 if c.lod == 0 else 6
    for t in range(turns * n + 1):
        a = 2 * math.pi * t / n
        rr = r * (1 - 0.08 * t / n)
        pts.append(p + Vector((rr * math.cos(a), rr * math.sin(a), 0.03 + 0.03 * t / n)))
    sides, _, _ = K.tube_path(c.bm, pts, 0.025, 4 if c.lod == 0 else 3)
    c.m(sides, reg); c.nb(sides)


def mooring(c, p0, p1, sag=0.4, reg='ROPE_BLUE'):
    """Mooring line from a bollard to a boat: a loop round the post, a
    hanging line."""
    p0, p1 = Vector(p0), Vector(p1)
    loop = [p0 + Vector((0.2 * math.cos(2 * math.pi * k / 6), 0.2 * math.sin(2 * math.pi * k / 6), 0.0)) for k in range(7)]
    s1, _, _ = K.tube_path(c.bm, loop, 0.022, 4)
    pts = K.catenary(p0, p1, sag, 8 if c.lod == 0 else 3)
    s2, _, _ = K.tube_path(c.bm, pts, 0.02, 4 if c.lod == 0 else 3)
    c.m(s1 + s2, reg); c.nb(s1 + s2)


def oars_poles(c, f, u, n=3, seed=0):
    """Bamboo poles and boat hooks leaning on a wall."""
    r = random.Random(seed)
    for i in range(n):
        uu = u + i * 0.15
        c.tube([f(uu, 0.0, 0.5 + r.uniform(-0.1, 0.1)), f(uu + r.uniform(-0.2, 0.2), r.uniform(2.6, 3.4), 0.08)], 0.022, 4, 'BAMBOO', caps=True)
