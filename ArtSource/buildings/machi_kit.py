"""Machi kit (the modern town, task 5b): car dealer and workshop at Sakura
Commons, modern prefab houses (Koedo outskirts), the wooden izakaya of the
Tokyo yokochō alleys. Atlases `Machi` (structure) + `MachiShop` (dressing);
the izakaya structure uses `Minato` (boards, corrugated iron).

Machinery from the Minato kit (wall frames `edge_frame`, holes `cut`,
aluminium windows and doors, shutters, AC units, downpipes, lean-to) and the
Koedo kit (`C`, signboards, noren, lanterns, nobori, interiors). New here:
- `wall`: walls in bands no taller than the strip (siding strips are 1.5 m),
  gable triangles clipped band by band (no stretched siding in the gables);
- floors and ceilings mapped in bands (`floor`), showroom glazing in the
  shared transparent `M_Glass` (`glass`, both faces, material slot 1);
- roofs of prefab houses: slate gable (`slate_roof`), mono-pitch galvalume
  (`shed_roof`, katanagare), flat roof with parapet (`flat_roof`);
- Japanese house parts: shutter box over windows (amado shutter), entrance
  door with porch, box balcony with laundry pole, Eco Cute water heater,
  aluminium carport with polycarbonate roof, function gate post, block wall
  with louvre fence, slit driveway;
- workshop parts: two-post lift, tyre stacks, drums, compressor, hose reel;
- showroom parts: stall markings, reception counter, tables and chairs,
  downlights, a corner sign tower.
"""
import math
import random
import bmesh
from mathutils import Vector
from kit import core as K
from buildings import koedo_kit as KK
from buildings import gassho_kit as GK
from buildings import minato_kit as M
from buildings.minato_kit import edge_frame, cut, _face
from buildings.tokyo_kit import F

ZV = Vector((0, 0, 1))
FR = F(Vector((0, 0, 0)), (0, -1))        # global frame: u = x, d = -y


def gbox(c, x0, x1, y0, y1, z0, z1, reg, skip=(), bevel=False, **kw):
    """Axis-aligned box in world coordinates (keys like lbox; out = -Y)."""
    return c.box(FR, x0, x1, z0, z1, -y1, -y0, reg, skip=skip, bevel=bevel, **kw)


def _band_h(c, reg):
    R = c.R(reg)
    return R['h_m'] if R['kind'] == 'strip' else 3.0


def _clip(ua, ub, zc, zd, top, um):
    """Points of the rectangle [ua,ub] x [zc,zd] under the gable line top(u)
    (linear on both sides of um): bottom edge, then the top edge back."""
    pts = []
    for a, b in ((ua, min(ub, um)), (max(ua, um), ub)):
        if b - a < 1e-6:
            continue
        ta, tb = top(a), top(b)
        us = {a, b}
        for lvl in (zc, zd):
            if (ta - lvl) * (tb - lvl) < 0:
                us.add(a + (b - a) * (lvl - ta) / (tb - ta))
        for u in sorted(us):
            t = top(u)
            if t >= zc - 1e-6:
                pts.append((u, min(t, zd)))
    out = []
    for p in sorted(set(pts)):
        if not out or abs(p[0] - out[-1][0]) > 1e-5:
            out.append(p)
    if len(out) < 2:
        return None
    return out


def wall(c, f, u0, u1, z0, z1, reg, holes=(), d=0.0, top=None, band=None):
    """Flat wall on frame f in bands no taller than the strip (siding 1.5 m,
    galvalume 1.5 m): UVs continuous along the wall, V from each band foot.
    top(u) -> z clips the wall (gable): every band is clipped, so a 3 m gable
    is two bands, never one stretched face."""
    band = band or _band_h(c, reg)
    if top:
        z1 = max(top(u) for u in (u0, u1, 0.5 * (u0 + u1)))
    n = max(1, math.ceil((z1 - z0) / band - 1e-6))
    um = 0.5 * (u0 + u1)
    for k in range(n):
        za = z0 + (z1 - z0) * k / n; zb = z0 + (z1 - z0) * (k + 1) / n
        fs = []
        for ua, ub, zc, zd in cut(u0, u1, za, zb, holes):
            if top:
                tp = _clip(ua, ub, zc, zd, top, um)
                if not tp:
                    continue
                pts = [f(tp[0][0], zc, d), f(tp[-1][0], zc, d)] + [f(u, z, d) for u, z in reversed(tp)]
                clean = []
                for p in pts:
                    if not clean or (p - clean[-1]).length > 1e-4:
                        clean.append(p)
                if (clean[0] - clean[-1]).length < 1e-4:
                    clean.pop()
                if len(clean) < 3:
                    continue
                fs.append(_face(c, clean, f.n))
            else:
                fs.append(_face(c, [f(ua, zc, d), f(ub, zc, d), f(ub, zd, d), f(ua, zd, d)], f.n))
        if fs:
            M._map(c, fs, reg, f(0, za, d), f.t, ZV)
    return z1


def floor(c, x0, x1, y0, y1, z, reg, up=True, along='y'):
    """Horizontal surface in bands across the strip height (floor tiles,
    epoxy, ceilings). U along x (or y), V across the band."""
    R = c.R(reg)
    if R['kind'] != 'strip':
        f = _face(c, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], (0, 0, 1 if up else -1))
        c.m([f], reg); c.nb([f])
        return [f]
    out = []
    if along == 'y':
        n = max(1, math.ceil((y1 - y0) / R['h_m'] - 1e-6))
        for k in range(n):
            ya, yb = y0 + (y1 - y0) * k / n, y0 + (y1 - y0) * (k + 1) / n
            f = _face(c, [(x0, ya, z), (x1, ya, z), (x1, yb, z), (x0, yb, z)], (0, 0, 1 if up else -1))
            GK.map_axes(c, [f], reg, (0, ya, z), (1, 0, 0), (0, 1, 0))
            out.append(f)
    else:
        n = max(1, math.ceil((x1 - x0) / R['h_m'] - 1e-6))
        for k in range(n):
            xa, xb = x0 + (x1 - x0) * k / n, x0 + (x1 - x0) * (k + 1) / n
            f = _face(c, [(xa, y0, z), (xb, y0, z), (xb, y1, z), (xa, y1, z)], (0, 0, 1 if up else -1))
            GK.map_axes(c, [f], reg, (xa, 0, z), (0, 1, 0), (1, 0, 0))
            out.append(f)
    return out


def glass(c, f, u0, u1, z0, z1, d=0.0):
    """Clear pane in the shared M_Glass (slot 1), both faces (seen from
    the street and from inside)."""
    fs = [_face(c, [f(u0, z0, d), f(u1, z0, d), f(u1, z1, d), f(u0, z1, d)], f.n),
          _face(c, [f(u0, z0, d - 0.012), f(u1, z0, d - 0.012), f(u1, z1, d - 0.012), f(u0, z1, d - 0.012)], -f.n)]
    c.m(fs, 'GLASS'); c.nb(fs)
    for x in fs:
        x.material_index = 1
    c.glass = True
    return fs


# ── house parts ─────────────────────────────────────────────────────────────

def shutter_box(c, f, u0, u1, z1, d, reg='ALU_DARK'):
    """Window roller shutter (amado shutter): box over the window, guide
    rails down both sides - on nearly every post-1990 Japanese house."""
    c.box(f, u0 - 0.06, u1 + 0.06, z1 + 0.04, z1 + 0.3, 0.0, d + 0.24, reg, skip=('in',), bevel=True)
    if c.lod == 0:
        for a, b in ((u0 - 0.06, u0), (u1, u1 + 0.06)):
            c.box(f, a, b, z1 - 1.0 if z1 > 2 else 0.0, z1 + 0.04, 0.0, d + 0.08, reg, skip=('in', 'top', 'bot'))


def entry_door(c, f, u0, u1, z0, z1, d, opt):
    """Modern insulated entrance door (genkan door): dark woodgrain leaf
    with a long bar handle, frosted side light, porch with two tiled steps,
    a small cantilever canopy, a porch light."""
    lod = c.lod
    back = M.reveal(c, f, u0, u1, z0, z1, d, 0.12, 'ALU_DARK', floor='TILE_PORCH')
    side = opt.get('side', 0.3)
    c.m([back], opt.get('leaf', 'WOOD_FLAT'))
    M.trim(c, f, u0, u1, z0, z1, d, 'ALU_DARK', sill=False)
    if lod == 0:
        c.box(f, u0, u0 + side, z0, z1, -0.12, -0.1, 'GLASS_FROST', skip=('in',))
        c.box(f, u0 + side, u0 + side + 0.04, z0, z1, -0.12, -0.08, 'ALU_DARK', skip=('in',))
        c.box(f, u1 - 0.18, u1 - 0.15, z0 + 0.6, z0 + 1.6, -0.1, -0.03, 'CHROME', skip=('in',))
    # porch: two tiled steps (the genkan sits ~0.45 m up on the foundation)
    w0, w1 = u0 - 0.45, u1 + 0.45
    for k, (z, dd) in enumerate(((z0 - 0.02, 0.6), (z0 * 0.5, 1.1))):
        c.box(f, w0 - 0.1 * k, w1 + 0.1 * k, 0.0, z, d, d + dd, 'TILE_PORCH', skip=('bot', 'in'), bevel=True)
    zc = z1 + 0.25
    c.box(f, u0 - 0.5, u1 + 0.5, zc, zc + 0.12, 0.0, opt.get('canopy', 1.0), opt.get('canopy_reg', 'PANEL_DARK'), skip=('in',),
          bevel=True)
    if lod == 0:
        c.box(f, u1 + 0.25, u1 + 0.4, z1 - 0.3, z1 - 0.05, d, d + 0.1, 'LIGHT_WARM', skip=('in',))
    return dict(kind='door', f=F(f.o, f.n, u0, u1, z0, z1), lit=True)


def box_balcony(c, f, u0, u1, z, depth, reg, rail_h=1.1):
    """Box balcony: a slab with a solid siding-clad parapet, aluminium
    coping, drain spout, and the laundry pole on two wall arms (monohoshi)."""
    lod = c.lod
    gbx = c.box(f, u0, u1, z - 0.2, z, 0.0, depth, 'PAINT_WHITE', skip=('in',), bevel=True)
    zt = z + rail_h
    for (a, b, d0, d1) in ((u0, u1, depth - 0.12, depth), (u0, u0 + 0.12, 0.0, depth - 0.12), (u1 - 0.12, u1, 0.0, depth - 0.12)):
        bb = c.box(f, a, b, z, zt, d0, d1, None, skip=('bot', 'top'))
        for k, x in bb.items():
            nn = x.normal
            fx = F(x.calc_center_median(), (nn.x, nn.y))
            M._map(c, [x], reg, Vector((0, 0, z)), fx.t, ZV)
        c.box(f, a - 0.02, b + 0.02, zt, zt + 0.05, d0 - 0.02, d1 + 0.02, 'ALU', skip=())
    if lod == 0:
        c.box(f, u0 + 0.3, u0 + 0.38, z - 0.15, z - 0.05, depth, depth + 0.18, 'PAINT_WHITE')
        for u in (u0 + 0.35, u1 - 0.35):
            c.box(f, u - 0.02, u + 0.02, z + 1.7, z + 1.8, 0.0, depth * 0.75, 'ALU')
        c.tube([f(u0 + 0.2, z + 1.78, depth * 0.7), f(u1 - 0.2, z + 1.78, depth * 0.7)], 0.018, 4, 'ALU', caps=True)
    return zt


def ecocute(c, f, u, d=0.45):
    """Eco Cute heat-pump water heater: tall beige tank + outdoor unit."""
    c.box(f, u - 0.33, u + 0.33, 0.0, 2.1, d - 0.35, d + 0.35, 'TANK_BEIGE', skip=('bot',), bevel=True)
    c.box(f, u + 0.5, u + 1.3, 0.0, 0.7, 0.05, 0.35, 'TANK_BEIGE', skip=('bot',), bevel=True)
    if c.lod == 0:
        c.box(f, u + 0.6, u + 1.0, 0.15, 0.55, 0.35, 0.36, 'IRON', skip=('in', 'l', 'r', 'top', 'bot'))
        c.tube([f(u - 0.2, 1.0, d), f(u - 0.2, 1.0, 0.05)], 0.012, 4, 'PLASTIC_GREY')


def vent_hood(c, f, u, z):
    """Small round vent hood (bath / kitchen fan) with a rain cap."""
    c.box(f, u - 0.08, u + 0.08, z - 0.08, z + 0.08, 0.0, 0.14, 'PAINT_WHITE', bevel=True)


def meter_box(c, f, u, z=1.2):
    c.box(f, u - 0.14, u + 0.14, z, z + 0.42, 0.0, 0.12, 'PLASTIC_GREY', bevel=True)
    if c.lod == 0:
        c.tube([f(u, z, 0.06), f(u, 0.3, 0.06)], 0.02, 4, 'PLASTIC_GREY')


def carport(c, x0, x1, y0, y1, h=2.4, posts='back'):
    """Aluminium carport: posts (both ends of one side, or all four), a
    frame beam, rafters and a bronze polycarbonate roof sloping to the
    gutter beam. Concrete slit driveway under it (slab, gravel strip)."""
    lod = c.lod
    side = 1 if posts == 'right' else -1
    xp = x1 - 0.06 if side > 0 else x0 + 0.06
    xs = [xp] if posts in ('left', 'right') else [x0 + 0.06, x1 - 0.06]
    for x in xs:
        for y in (y0 + 0.3, y1 - 0.3):
            gbox(c, x - 0.05, x + 0.05, y - 0.05, y + 0.05, 0.0, h, 'ALU', skip=('bot',), bevel=True)
    zl = h; zh = h + 0.18
    for x in xs:
        gbox(c, x - 0.06, x + 0.06, y0, y1, zl - 0.12, zl + 0.04, 'ALU', bevel=True)
    if lod == 0:
        n = max(2, round((y1 - y0) / 0.75))
        for i in range(n + 1):
            y = y0 + 0.05 + (y1 - y0 - 0.1) * i / n
            gbox(c, x0, x1, y - 0.025, y + 0.025, zl + 0.04, zl + 0.1, 'ALU')
    roof = [_face(c, [(x0 - 0.1, y0 - 0.1, zh), (x1 + 0.1, y0 - 0.1, zh - 0.1), (x1 + 0.1, y1 + 0.1, zh - 0.1), (x0 - 0.1, y1 + 0.1, zh)], (0, 0, 1)),
            _face(c, [(x0 - 0.1, y0 - 0.1, zh - 0.01), (x1 + 0.1, y0 - 0.1, zh - 0.11), (x1 + 0.1, y1 + 0.1, zh - 0.11),
                      (x0 - 0.1, y1 + 0.1, zh - 0.01)], (0, 0, -1))]
    c.m(roof, 'POLYCARB'); c.nb(roof)
    gbox(c, x0 - 0.15, x1 + 0.15, y0 - 0.15, y0 - 0.05, zh - 0.25, zh + 0.02, 'ALU', bevel=True)
    gbox(c, x0 - 0.15, x1 + 0.15, y1 + 0.05, y1 + 0.15, zh - 0.25, zh + 0.02, 'ALU', bevel=True)


def driveway(c, x0, x1, y0, y1, slit=True):
    """Concrete driveway, 2 cm up, with a gravel / grass slit down the middle."""
    if slit:
        xm = 0.5 * (x0 + x1)
        for a, b in ((x0, xm - 0.15), (xm + 0.15, x1)):
            floor(c, a, b, y0, y1, 0.03, 'CONC_FLAT')
        floor(c, xm - 0.15, xm + 0.15, y0, y1, 0.025, 'LAWN')
    else:
        floor(c, x0, x1, y0, y1, 0.03, 'CONC_FLAT')
    gbox(c, x0, x1, y0, y1, 0.0, 0.03, 'CONC_FLAT', skip=('top', 'bot'))


def block_wall(c, f, u0, u1, h=0.6, louvre=0.0, d=0.0):
    """Concrete block wall with a cap (and an aluminium louvre fence on top
    of it): the property line of a Japanese suburb."""
    c.box(f, u0, u1, 0.0, h, d - 0.12, d, 'BLOCK', skip=('bot',), bevel=True)
    c.box(f, u0 - 0.01, u1 + 0.01, h, h + 0.04, d - 0.13, d + 0.01, 'CONC_DARK', skip=())
    if louvre > 0:
        n = max(1, round((u1 - u0) / 2.0))
        for i in range(n + 1):
            u = u0 + 0.04 + (u1 - u0 - 0.08) * i / n
            c.box(f, u - 0.03, u + 0.03, h, h + louvre, d - 0.09, d - 0.03, 'ALU', skip=('bot',))
        if c.lod == 0:
            k = max(2, int(louvre / 0.12))
            for j in range(k):
                z = h + 0.08 + (louvre - 0.14) * j / (k - 1)
                c.box(f, u0, u1, z, z + 0.08, d - 0.08, d - 0.04, 'ALU', skip=('l', 'r'))
        else:
            c.box(f, u0, u1, h + 0.05, h + louvre, d - 0.08, d - 0.04, 'ALU', skip=('l', 'r'))


def gate_post(c, f, u, d=0.0, h=1.4):
    """Function gate post (kinō monchū): slim panel post carrying the
    nameplate, intercom, mailbox and a gate light (faces in the dressing)."""
    c.box(f, u - 0.12, u + 0.12, 0.0, h, d - 0.1, d + 0.04, 'ALU_DARK', skip=('bot',), bevel=True)
    c.box(f, u - 0.1, u + 0.1, h, h + 0.12, d - 0.06, d + 0.06, 'LIGHT_WARM', skip=('bot',))


# ── roofs ───────────────────────────────────────────────────────────────────

def _slope_faces(c, L, E, ze, zr, X, reg, sg, y_hi=0.0, single=False):
    """Roof surface of one slope from the eave (y = sg*E, ze) up to y_hi (zr),
    bands <= strip height down the slope, U along x."""
    R = c.R(reg)
    o = Vector((0, sg * E, ze))
    tb = (Vector((0, y_hi, zr)) - o)
    sl = tb.length; tb.normalize()
    n = tb.cross(Vector((1, 0, 0)))
    if n.z < 0:
        n = -n
    nb_ = max(1, math.ceil(sl / (R['h_m'] if R['kind'] == 'strip' else 99) - 1e-6))
    fs = []
    for k in range(nb_):
        a, b = sl * k / nb_, sl * (k + 1) / nb_
        p0, p1 = o + tb * a, o + tb * b
        f = _face(c, [Vector((-X, p0.y, p0.z)), Vector((X, p0.y, p0.z)), Vector((X, p1.y, p1.z)), Vector((-X, p1.y, p1.z))], n)
        if R['kind'] == 'strip':
            GK.map_axes(c, [f], reg, Vector((0, p0.y, p0.z)), (1, 0, 0), tb)
        else:
            c.m([f], reg); c.nb([f])
        fs.append(f)
    return fs, n


def slate_roof(c, L, B, z_top, slope=0.45, eave=0.55, oh=0.45, reg='SLATE', fascia='PANEL_DARK', solar=None):
    """Gable roof of a prefab house, ridge along X: thin slab (fascia,
    soffit, verge boards), slate surface in 2 m bands, ridge cap, gutters,
    optional solar panels on the south slope. Returns ridge height and
    top(u) for the gable walls."""
    lod = c.lod
    WL = B / 2 + 0.02
    E = WL + eave
    X = L / 2 + oh
    th = 0.16
    zr = z_top + th + WL * slope
    ze = zr - E * slope
    poly = [(-E, ze - th), (-E, ze), (0.0, zr), (E, ze), (E, ze - th), (WL, z_top), (0.0, z_top + WL * slope), (-WL, z_top)]
    sides, c0, c1 = K.poly_prism_x(c.bm, poly, -X, X)
    for f in sides:
        f.normal_update()
    for f in (sides[1], sides[2]):
        c.bm.faces.remove(f)
    c.m([sides[0], sides[3]], fascia); c.m(sides[4:] + [c0, c1], 'PAINT_WHITE'); c.nb(sides[4:])
    for sg in (-1, 1):
        _slope_faces(c, L, E, ze + 0.005, zr + 0.005, X, reg, sg)
    cap = [(-0.14, zr - 0.02), (-0.14, zr + 0.04), (-0.05, zr + 0.1), (0.05, zr + 0.1), (0.14, zr + 0.04), (0.14, zr - 0.02)]
    s, a, b = K.poly_prism_x(c.bm, cap + [(0.0, zr + 0.03)], -X - 0.02, X + 0.02)
    c.m(s + [a, b], 'GALVA_FLAT'); c.nb(s + [a, b])
    if lod == 0:
        for sg in (-1, 1):
            c.tube([(-X, sg * (E + 0.07), ze - 0.1), (X, sg * (E + 0.07), ze - 0.1)], 0.07, 4, 'PAINT_WHITE')
    if solar and lod == 0:          # panels on the -Y slope on low rails
        x0, x1 = solar
        sl = math.hypot(E, zr - ze)
        o = Vector((0, -E, ze)); tb = (Vector((0, 0, zr)) - o).normalized()
        n = tb.cross(Vector((1, 0, 0)))
        n = n if n.z > 0 else -n
        for r in range(2):
            a, b = 0.5 + r * 1.05, 0.5 + r * 1.05 + 1.0
            if b > sl - 0.3:
                break
            p0, p1 = o + tb * a + n * 0.08, o + tb * b + n * 0.08
            q = _face(c, [Vector((x0, p0.y, p0.z)), Vector((x1, p0.y, p0.z)), Vector((x1, p1.y, p1.z)), Vector((x0, p1.y, p1.z))], n)
            c.m([q], 'SOLAR'); c.nb([q])
            fr = gbox(c, x0 - 0.02, x1 + 0.02, p0.y - 0.02, p0.y + 0.02, p0.z - 0.05, p0.z, 'ALU')
    top = lambda u: z_top + (WL - abs(u - B / 2)) * slope
    return zr + 0.1, top


def shed_roof(c, L, B, z_lo, slope=0.12, eave=0.45, oh=0.4, reg='GALVA', high='N', fascia='PANEL_DARK', trim='GALVA_FLAT', hi_over=0.25):
    """Mono-pitch roof (katanagare) of galvalume, rising towards `high`
    (N = +Y, S = -Y): thin slab (fascia, soffit), ribbed surface in bands
    down the slope, flashing at the high edge, gutter at the low one.
    The underside meets the low wall at z_lo. Returns (top of the roof,
    wall height at the high side, top_for(e) -> top(u) for side walls)."""
    lod = c.lod
    WL = B / 2 + 0.02
    sg = 1 if high == 'N' else -1
    X = L / 2 + oh
    th = 0.18
    s_ = lambda y: sg * y + WL
    zu = lambda y: z_lo + s_(y) * slope            # underside
    zt = lambda y: zu(y) + th                       # top surface
    y_lo, y_hi = -sg * (WL + eave), sg * (WL + hi_over)
    poly = [(y_lo, zu(y_lo)), (y_hi, zu(y_hi)), (y_hi, zt(y_hi)), (y_lo, zt(y_lo))]
    if sg < 0:
        poly = list(reversed(poly))
    sides, c0, c1 = K.poly_prism_x(c.bm, poly, -X, X)
    for f in sides:
        f.normal_update()
    top_face = max(sides, key=lambda f: f.normal.z)
    rest = [f for f in sides if f is not top_face]
    c.bm.faces.remove(top_face)
    c.m(rest + [c0, c1], fascia); c.nb(rest)
    o = Vector((0, y_lo, zt(y_lo) + 0.004))
    tb = Vector((0, y_hi, zt(y_hi) + 0.004)) - o
    sl = tb.length; tb.normalize()
    n = tb.cross(Vector((1, 0, 0)))
    n = n if n.z > 0 else -n
    R = c.R(reg)
    nb_ = max(1, math.ceil(sl / R['h_m'] - 1e-6))
    for k in range(nb_):
        a, b = sl * k / nb_, sl * (k + 1) / nb_
        p0, p1 = o + tb * a, o + tb * b
        q = _face(c, [Vector((-X, p0.y, p0.z)), Vector((X, p0.y, p0.z)), Vector((X, p1.y, p1.z)), Vector((-X, p1.y, p1.z))], n)
        GK.map_axes(c, [q], reg, Vector((0, p0.y, p0.z)), (1, 0, 0), tb)
    ya, yb = sorted((y_hi, y_hi + sg * 0.05))
    if hi_over > 0.05:
        gbox(c, -X - 0.03, X + 0.03, ya, yb, zu(y_hi) - 0.12, zt(y_hi) + 0.06, trim, bevel=True)
    if lod == 0:
        c.tube([(-X, y_lo - sg * 0.08, zt(y_lo) - 0.14), (X, y_lo - sg * 0.08, zt(y_lo) - 0.14)], 0.07, 4, trim)

    def top_for(e):
        if e == 1:
            return lambda u: zu(u - B / 2)
        return lambda u: zu(B / 2 - u)
    return zt(y_hi) + 0.06, zu(sg * WL), top_for


def flat_roof(c, L, B, z_top, parapet=0.6, reg='GALVA', coping='ALU', x0=None, y0=None):
    """Flat roof behind a parapet: walls carry on up by `parapet` (caller),
    roof surface (sheet waterproofing), aluminium coping all round."""
    floor(c, -L / 2, L / 2, -B / 2, B / 2, z_top, 'CONC_DARK')
    zt = z_top + parapet
    for e in range(4):
        f = edge_frame(L, B, e)
        Lw = (L, B, L, B)[e]
        c.box(f, -0.03, Lw + 0.03, zt, zt + 0.06, -0.2, 0.04, coping, skip=('bot',))
        q = _face(c, [f(0, z_top, -0.18), f(Lw, z_top, -0.18), f(Lw, zt, -0.18), f(0, zt, -0.18)], -f.n)
        c.m([q], 'CONC_FLAT'); c.nb([q])
    return zt + 0.06


# ── showroom parts ──────────────────────────────────────────────────────────

def stall(c, x0, x1, y0, y1, z, open_side='x0', w=0.1):
    """Parking stall marked on the showroom floor: three white lines (the
    side towards the wall or the aisle stays open)."""
    lines = []
    if open_side != 'y0':
        lines.append((x0, x1, y0, y0 + w))
    if open_side != 'y1':
        lines.append((x0, x1, y1 - w, y1))
    if open_side != 'x0':
        lines.append((x0, x0 + w, y0, y1))
    if open_side != 'x1':
        lines.append((x1 - w, x1, y0, y1))
    for a, b, cc, d in lines:
        f = _face(c, [(a, cc, z), (b, cc, z), (b, d, z), (a, d, z)], (0, 0, 1))
        c.m([f], 'LINE_WHITE'); c.nb([f])


def turntable(c, x, y, z, r=2.4):
    """Low round display stage under the hero car, chrome rim."""
    s = K.lathe(c.bm, 16 if c.lod == 0 else 8, [(r, z), (r, z + 0.1)], cx=x, cy=y, cap_bottom=False)
    c.m(s['sides'], 'CHROME'); c.m([s['top']], 'PANEL_WHITE'); c.nb(s['sides'])


def downlights(c, xs, ys, z):
    for x in xs:
        for y in ys:
            f = _face(c, [(x - 0.12, y - 0.12, z - 0.005), (x + 0.12, y - 0.12, z - 0.005), (x + 0.12, y + 0.12, z - 0.005),
                          (x - 0.12, y + 0.12, z - 0.005)], (0, 0, -1))
            c.m([f], 'DOWNLIGHT'); c.nb([f])


def gate(c, f, u0, u1, z0, z1, d=0.0, coil='SHUTTER'):
    """Wide roller-shutter entrance with the curtain fully up: guide rails
    down both jambs, coil box over the opening, the bottom bar showing under
    it, jamb trims - the opening itself stays open into the building."""
    for a, b in ((u0 - 0.12, u0), (u1, u1 + 0.12)):
        c.box(f, a, b, z0, z1, -0.05, d + 0.1, coil, skip=('in', 'bot'), bevel=True)
    c.box(f, u0 - 0.2, u1 + 0.2, z1, z1 + 0.48, -0.02, d + 0.42, coil, skip=('in',), bevel=True)
    c.box(f, u0, u1, z1 - 0.08, z1, d + 0.02, d + 0.12, 'IRON', skip=('in',))
    if c.lod == 0:   # motor box at one end
        c.box(f, u1 + 0.2, u1 + 0.45, z1 + 0.05, z1 + 0.4, 0.0, d + 0.3, 'IRON', skip=('in',))


def spot(c, p, aim):
    """Track spot: a short can on the rail, lit lens facing `aim`."""
    p = Vector(p); a = Vector(aim).normalized()
    s = K.tube_path(c.bm, [p, p + a * 0.22], 0.06, 6, cap0=True, cap1=True)
    c.m(s[0] + [s[1]], 'PANEL_DARK'); c.m([s[2]], 'DOWNLIGHT'); c.nb(s[0])


# ── dressing parts (MachiShop) ──────────────────────────────────────────────

def table_set(c, x, y, n=3, r=0.45, seed=0):
    """Round sales table (shōdan table) with chairs round it."""
    lod = c.lod
    t = K.lathe(c.bm, 12 if lod == 0 else 6, [(r, 0.7), (r, 0.74)], cx=x, cy=y, cap_bottom=True)
    c.m(t['sides'] + [t['top'], t['bottom']], 'TABLE_WHITE'); c.nb(t['sides'])
    c.tube([(x, y, 0.0), (x, y, 0.7)], 0.04, 4, 'CHROME')
    rr = random.Random(seed)
    for i in range(n):
        a = 2 * math.pi * i / n + rr.uniform(-0.2, 0.2)
        px, py = x + math.cos(a) * (r + 0.35), y + math.sin(a) * (r + 0.35)
        fr = F(Vector((px, py, 0)), (math.cos(a), math.sin(a)))
        c.box(fr, -0.22, 0.22, 0.42, 0.48, -0.22, 0.2, 'LEATHER', bevel=True)
        c.box(fr, -0.22, 0.22, 0.48, 0.92, 0.16, 0.22, 'LEATHER', bevel=True)
        if lod == 0:
            c.tube([(px, py, 0.0), (px, py, 0.42)], 0.025, 4, 'CHROME')


def price_stand(c, f, u, d, img, h=1.05):
    """Price board on a chrome stand beside each car."""
    c.tube([f(u, 0.0, d), f(u, h - 0.25, d)], 0.015, 4, 'CHROME')
    if c.lod == 0:
        s = K.lathe(c.bm, 8, [(0.18, 0.0), (0.18, 0.02)], cx=f(u, 0, d).x, cy=f(u, 0, d).y, cap_bottom=False)
        c.m(s['sides'] + [s['top']], 'CHROME'); c.nb(s['sides'])
    b = c.box(f, u - 0.25, u + 0.25, h - 0.3, h, d - 0.01, d + 0.01, None)
    c.m([b['out'], b['in']], img); c.m([x for k, x in b.items() if k not in ('out', 'in')], 'WHITE')


def tyre_stack(c, p, n=4, r=0.32, w=0.21, rims=False, seed=0):
    """Stack of tyres (lathe rings with the hole), slightly off-centre."""
    rr = random.Random(seed)
    for k in range(n):
        px, py = p[0] + rr.uniform(-0.03, 0.03), p[1] + rr.uniform(-0.03, 0.03)
        z = p[2] + k * w
        s = K.lathe(c.bm, 10 if c.lod == 0 else 6, [(r * 0.62, z), (r, z + w * 0.2), (r, z + w * 0.8), (r * 0.62, z + w)],
                    cx=px, cy=py, cap_bottom=False, cap_top=False)
        c.m(s['sides'], 'TIRE'); c.nb(s['sides'])
        if rims and c.lod == 0:
            h = K.lathe(c.bm, 8, [(r * 0.62, z + 0.02), (r * 0.62, z + w - 0.02)], cx=px, cy=py, cap_bottom=True)
            c.m(h['sides'] + [h['top'], h['bottom']], 'RIM'); c.nb(h['sides'])


def drum(c, p, reg='DRUM_BLUE', r=0.29, h=0.88):
    s = K.lathe(c.bm, 10 if c.lod == 0 else 6, [(r, p[2]), (r, p[2] + h)], cx=p[0], cy=p[1], cap_bottom=False)
    c.m(s['sides'] + [s['top']], reg); c.nb(s['sides'])
    if c.lod == 0:
        for z in (0.3, 0.6):
            b = K.lathe(c.bm, 10, [(r + 0.012, p[2] + h * z), (r + 0.012, p[2] + h * z + 0.03)], cx=p[0], cy=p[1],
                        cap_bottom=False, cap_top=False)
            c.m(b['sides'], reg); c.nb(b['sides'])


def lift(c, f, uc, d, w=3.3, h=3.9, up=1.2):
    """Two-post car lift: blue columns on base plates, carriages with
    swing arms (raised to `up`), the overhead beam, the hydraulic unit."""
    lod = c.lod
    for sg in (-1, 1):
        u = uc + sg * w / 2
        c.box(f, u - 0.2, u + 0.2, 0.0, 0.02, d - 0.35, d + 0.35, 'STEEL', skip=('bot',))
        c.box(f, u - 0.17, u + 0.17, 0.0, h, d - 0.15, d + 0.15, 'LIFT_BLUE', skip=('bot',), bevel=True)
        c.box(f, u - sg * 0.32 - 0.12, u - sg * 0.32 + 0.12, up - 0.2, up + 0.25, d - 0.14, d + 0.14, 'IRON', bevel=True)
        for dd in (-1, 1):   # swing arms to the car's pick-up points
            a0 = f(u - sg * 0.35, up, d)
            a1 = f(u - sg * 1.2, up, d + dd * 1.1)
            c.tube([a0, a1], 0.06, 4, 'IRON')
            if lod == 0:
                q = K.lathe(c.bm, 6, [(0.08, up), (0.08, up + 0.1)], cx=a1.x, cy=a1.y)
                c.m(q['sides'] + [q['top'], q['bottom']], 'YELLOW'); c.nb(q['sides'])
    c.box(f, uc - w / 2 - 0.15, uc + w / 2 + 0.15, h, h + 0.22, d - 0.1, d + 0.1, 'LIFT_BLUE', bevel=True)
    c.box(f, uc + w / 2 + 0.2, uc + w / 2 + 0.6, 0.6, 1.2, d - 0.2, d + 0.2, 'IRON', bevel=True)
    if lod == 0:
        c.tube([f(uc + w / 2 + 0.4, 1.2, d), f(uc + w / 2, 1.6, d)], 0.015, 3, 'BLACK')


def compressor(c, f, u, d):
    """Air compressor: horizontal red tank on feet, motor and belt guard on top."""
    p = f(u, 0, d)
    t = K.tube_path(c.bm, [f(u - 0.6, 0.45, d), f(u + 0.6, 0.45, d)], 0.28, 8 if c.lod == 0 else 6, cap0=True, cap1=True)
    fs = t[0] + [t[1], t[2]]
    c.m(fs, 'CHEST_RED'); c.nb(fs)
    c.box(f, u - 0.4, u + 0.2, 0.7, 1.05, d - 0.2, d + 0.2, 'IRON', bevel=True)
    for uu in (u - 0.45, u + 0.45):
        c.box(f, uu - 0.05, uu + 0.05, 0.0, 0.2, d - 0.2, d + 0.2, 'IRON', skip=('bot',))


def hose_reel(c, f, u, z, d=0.12):
    """Air hose reel on the wall, yellow hose hanging in a loop."""
    p = f(u, z, d)
    s = K.tube_path(c.bm, [f(u, z, 0.0), f(u, z, 0.18)], 0.22, 10 if c.lod == 0 else 6, cap0=True, cap1=True)
    c.m(s[0] + [s[1], s[2]], 'RED'); c.nb(s[0])
    if c.lod == 0:
        pts = [f(u, z - 0.2, 0.1), f(u + 0.1, z - 1.0, 0.15), f(u - 0.2, z - 1.5, 0.2), f(u - 0.5, z - 1.0, 0.2), f(u - 0.4, z - 0.3, 0.15)]
        c.tube(pts, 0.015, 4, 'HOSE_YELLOW')


def bench_top(c, f, u0, u1, d, h=0.9, depth=0.7):
    """Workbench: steel frame, wooden top, vice, a shelf below."""
    c.box(f, u0, u1, h - 0.05, h, d, d + depth, 'WOOD_LIGHT', bevel=True)
    for u in (u0 + 0.05, u1 - 0.05):
        for dd in (d + 0.05, d + depth - 0.05):
            c.box(f, u - 0.03, u + 0.03, 0.0, h - 0.05, dd - 0.03, dd + 0.03, 'IRON', skip=('bot', 'top'))
    c.box(f, u0 + 0.05, u1 - 0.05, 0.25, 0.28, d + 0.05, d + depth - 0.05, 'IRON')
    if c.lod == 0:
        c.box(f, u1 - 0.4, u1 - 0.15, h, h + 0.18, d + depth - 0.2, d + depth + 0.05, 'LIFT_BLUE', bevel=True)


def laundry(c, f, u0, u1, z, d, seed=0):
    """Laundry on the balcony pole: shirts, towels, a futon over the rail."""
    rr = random.Random(seed)
    u = u0
    regs = ['TOWEL_WHITE', 'TOWEL_BLUE', 'SHIRT_GREY', 'TOWEL_PINK', 'SHIRT_NAVY', 'SHIRT_YELLOW', 'TOWEL_WHITE']
    while u < u1 - 0.3:
        w = rr.uniform(0.3, 0.55)
        h = rr.uniform(0.45, 0.75)
        reg = rr.choice(regs)
        c.box(f, u, u + w, z - h, z - 0.02, d - 0.01, d + 0.01, reg, skip=('top',) if c.lod else ())
        if c.lod == 0:
            c.box(f, u + w / 2 - 0.01, u + w / 2 + 0.01, z - 0.04, z + 0.03, d - 0.01, d + 0.01, 'CHROME')
        u += w + rr.uniform(0.06, 0.2)


def futon(c, f, u0, u1, z, d0, d1, reg='FUTON'):
    """Futon airing over the balcony parapet (both sides draped)."""
    c.box(f, u0, u1, z - 0.7, z + 0.03, d1 - 0.02, d1 + 0.04, reg, bevel=False)
    c.box(f, u0, u1, z, z + 0.06, d0, d1 + 0.04, reg)
    c.box(f, u0, u1, z - 0.6, z + 0.03, d0 - 0.04, d0 + 0.02, reg)
    if c.lod == 0:
        for u in (u0 + 0.15, u1 - 0.15):
            c.box(f, u - 0.03, u + 0.03, z - 0.05, z + 0.1, d1 + 0.02, d1 + 0.08, 'PINK')


def crate_stack(c, f, u, d, n=3, seed=0):
    """Beer crates (yellow / red) stacked by the door, bottle caps on top."""
    rr = random.Random(seed)
    for k in range(n):
        uu = u + rr.uniform(-0.03, 0.03)
        b = c.box(f, uu - 0.2, uu + 0.2, 0.3 * k, 0.3 * k + 0.29, d - 0.17, d + 0.17, None, skip=('bot',) if k else ())
        c.m([b['out'], b['in'], b['l'], b['r']], 'CRATE'); c.m([b['top']] + ([b['bot']] if 'bot' in b else []), 'CRATE_YELLOW')


def stool(c, f, u, d, reg='STOOL_RED'):
    p = f(u, 0, d)
    s = K.lathe(c.bm, 8 if c.lod == 0 else 6, [(0.14, 0.0), (0.12, 0.42), (0.16, 0.44), (0.0, 0.46)], cx=p.x, cy=p.y, cap_bottom=False)
    c.m(s['sides'], reg); c.nb(s['sides'])


def lantern_string(c, f, u0, u1, z, d, n=5, img='CH0'):
    """Row of small red lanterns (chōchin) on a wire under the awning."""
    c.tube([f(u0, z + 0.05, d), f(u1, z + 0.05, d)], 0.006, 3, 'CABLE')
    for i in range(n):
        u = u0 + (u1 - u0) * (i + 0.5) / n
        KK.chochin(c, f, u, z - 0.42, d, img, r=0.14, h=0.38, hang=0.05)


def blade_sign(c, f, u, z0, z1, img, w=0.55, d0=0.1):
    """Vertical sign sticking out of the wall (both faces lit), on brackets."""
    fr = F(f(u, 0, 0), f.t)          # frame along the wall normal: u runs out of the wall
    b = c.box(fr, d0, d0 + w, z0, z1, -0.06, 0.06, None)
    c.m([b['out'], b['in']], img)
    c.m([x for k, x in b.items() if k not in ('out', 'in')], 'BLACK')
    if c.lod == 0:
        for z in (z0 + 0.1, z1 - 0.1):
            c.box(fr, 0.0, d0, z - 0.02, z + 0.02, -0.02, 0.02, 'IRON')


def cables(c, f, u0, u1, z, d, n=4, seed=0, sag=0.25):
    """The yokochō cable mess: several sagging cables across the front,
    bundled with ties, a drop to the meter, one loose loop."""
    rr = random.Random(seed)
    for i in range(n if c.lod == 0 else 2):
        zz = z + 0.08 * i + rr.uniform(-0.03, 0.03)
        dd = d + 0.05 * (i % 2)
        pts = K.catenary(f(u0 - 0.05, zz, dd), f(u1 + 0.05, zz, dd), sag * rr.uniform(0.5, 1.2), segs=6)
        c.tube(pts, 0.012 + 0.006 * (i % 2), 3, 'CABLE' if i % 3 else 'CABLE_GREY')
    if c.lod == 0:
        um = rr.uniform(u0 + 0.4, u1 - 0.4)
        c.tube([f(um, z - 0.05, d), f(um + 0.1, z - 1.2, d - 0.05), f(um + 0.1, z - 1.5, 0.05)], 0.01, 3, 'CABLE')
        c.box(f, um, um + 0.3, z - 2.0, z - 1.5, 0.0, 0.14, 'BOX_GREY', bevel=True)


def duct(c, f, u, z0, z1, d=0.2, r=0.14):
    """Kitchen exhaust duct (stainless) up the back wall, rain cap on top."""
    c.tube([f(u, z0, 0.0), f(u, z0, d), f(u, z1, d)], r, 6 if c.lod == 0 else 4, 'STEEL')
    s = K.lathe(c.bm, 8 if c.lod == 0 else 4, [(r * 1.8, z1 + 0.05), (0.0, z1 + 0.3)], cx=f(u, 0, d).x, cy=f(u, 0, d).y,
                cap_bottom=True)
    c.m(s['sides'] + [s['bottom']], 'STEEL'); c.nb(s['sides'])
