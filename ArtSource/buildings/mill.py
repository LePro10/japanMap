"""Mill at Stillwater (Gassho village, task 5b): the mill house with its
waterwheel and flume, and the mill pond.

- Gassho_Mill: small thatched mill house (mizuguruma-goya, Gassho kit,
  steep thatch), the big wheel (4.2 m, breastshot) against the west gable,
  its axle into the house, the wheel turning in a stone-lined pit with the
  tailrace running on behind the house, a wooden flume (kakehi) on trestles
  coming 8 m from behind (+Y, from the pond). Dressing: the millstones
  and rice sacks inside the open door, straw bales, a basket, firewood.
  The wheel axis is at the origin (the prototype's millWheel point); the
  flume runs 10.3 m to +Y, to the pond's edge (pond centre 17 m behind).
- Gassho_MillPond: the pond, 22 x 14 m of water inside a low dry-stone
  wall (ishigaki) with a coping of flat stones and a grass verge, the
  sluice gate (plank gate in stone posts, spindle and hand wheel) at the
  middle of the -Y edge where the flume leaves, a washing platform of
  planks on the +X side, a few rocks. Water at -0.3 m.
Atlas Gassho (+ GasshoShop for the dressing)."""
import math
import random
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings import koedo_kit as KK
from buildings import gassho_kit as GK
from buildings import gassho as GA
from buildings.gassho import wins, TATE, BOARD
from buildings.gassho_kit import ROWS
from buildings.koedo_kit import C
from buildings.tokyo_kit import F

KLASS = 'buildings'
NAME = 'Gassho'
ZV = Vector((0, 0, 1))

HOUSE = dict(
    L=7.6, B=5.4, G=2.45, front='S', walls=dict(S=BOARD, E=TATE, N=BOARD, W=TATE),
    roof=dict(ov=0.8, eave=1.0, vt=1.1, eave_h=0.7, seed=31, p_new=0.1, p_old=0.45, slope=58.0),
    gables=dict(E=[wins(['board'], 0.9), wins(['vent'], 0.5)], W=[wins(['vent'], 0.7)]),
    ground=[('S', 1.0, 3.2, 'shop', dict(depth=1.6, doors=False)), ('S', 4.4, 6.2, 'mado', dict(lit=(0,)), ROWS['window_g']),
            ('N', 2.2, 3.4, 'amado', dict(), ROWS['door']), ('E', 1.6, 3.4, 'mado', dict(), ROWS['window_g']),
            ('W', 0.6, 1.5, 'mado', dict(), ROWS['window_g'])],
    dress=[('straw', 'S', dict(u=6.9, d=0.9)), ('straw', 'S', dict(u=7.3, d=1.4, seed=2)), ('firewood', 'N', dict(u0=4.0, u1=7.0, d=0.5, seed=4)),
           ('kago', 'S', dict(u=3.6, d=0.6)), ('tub', 'E', dict(u=4.3, d=0.5))])
WHEEL = dict(R=2.1, w=0.7, zc=1.4, n=16)
HX = HOUSE['L'] / 2 + 0.95          # house centre: west gable 0.95 m east of the wheel plane
PIT = dict(x=0.7, y0=-2.7, y1=6.0, z=-0.95, water=-0.6)
FLUME = dict(y0=-1.95, y1=-10.3, z=0.25, w=0.5, h=0.3)
POND = dict(L=22.0, B=14.0, water=-0.3, wall=0.4, top=0.15)


def wheel(c, R, w, zc, n):
    """Waterwheel turning about the X axis: two rims, spokes, paddles
    between the rims, hub and axle, bearing post on the outer side."""
    lod = c.lod
    segs = 20 if lod == 0 else 12
    for x in (-w / 2, w / 2):
        pts = [(x, R * math.cos(2 * math.pi * k / segs), zc + R * math.sin(2 * math.pi * k / segs)) for k in range(segs + 1)]
        c.tube(pts, 0.06, 4, 'WOOD_FLAT')
        if lod == 0:
            pts = [(x, (R - 0.35) * math.cos(2 * math.pi * k / segs), zc + (R - 0.35) * math.sin(2 * math.pi * k / segs)) for k in range(segs + 1)]
            c.tube(pts, 0.04, 4, 'WOOD_FLAT')
        ns = 8 if lod == 0 else 4
        for k in range(ns):
            a = 2 * math.pi * k / ns
            c.tube([(x, 0.15 * math.cos(a), zc + 0.15 * math.sin(a)), (x, R * math.cos(a), zc + R * math.sin(a))], 0.045, 4, 'WOOD_FLAT')
    for k in range(n):        # paddles (boards between the rims, radial)
        a = 2 * math.pi * (k + 0.5) / n
        bx = K.box(c.bm, -w / 2, w / 2, R - 0.42, R + 0.05, -0.025, 0.025)
        fs = [f for f in (bx.values() if isinstance(bx, dict) else bx) if f is not None]
        vs = list({v for f in fs for v in f.verts})
        # box was built along y = radius: rotate about X to angle a, lift to the hub
        bmesh.ops.rotate(c.bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'X'))
        bmesh.ops.translate(c.bm, verts=vs, vec=(0, 0, zc))
        c.m(fs, 'WOOD'); c.nb(fs)
    c.tube([(-w / 2 - 0.55, 0.0, zc), (HX - HOUSE['L'] / 2 + 0.2, 0.0, zc)], 0.11, 8 if lod == 0 else 6, 'WOOD_FLAT', caps=True)
    hub = K.tube_path(c.bm, [(-w / 2 - 0.05, 0, zc), (w / 2 + 0.05, 0, zc)], 0.24, 8 if lod == 0 else 6, cap0=True, cap1=True)
    c.m(hub[0] + [hub[1], hub[2]], 'WOOD'); c.nb(hub[0])
    fr = F(Vector((0, 0, 0)), (0, -1))
    xb = -w / 2 - 0.42                  # bearing post on the outer bank
    c.box(fr, xb - 0.12, xb + 0.12, PIT['z'], zc + 0.15, -0.12, 0.12, 'WOOD', skip=('bot',), rotate=True, bevel=True)
    c.box(fr, xb - 0.2, xb + 0.2, zc - 0.15, zc - 0.05, -0.2, 0.2, 'WOOD_FLAT')
    if lod == 0:
        for z in (zc - 0.05, zc + 0.25):
            c.tube([(xb - 0.05, -0.2, z), (xb - 0.05, 0.2, z)], 0.02, 4, 'IRON')


def pit(c):
    """Stone-lined wheel pit and tailrace: ishigaki walls both sides, flat
    coping stones, water in the channel, the bed below it."""
    x, y0, y1, zb, zw = PIT['x'], PIT['y0'], PIT['y1'], PIT['z'], PIT['water']
    for sg in (-1, 1):
        f = GK._face(c.bm, [c.bm.verts.new(p) for p in ((sg * x, y0, zb), (sg * x, y1, zb), (sg * x, y1, 0.05), (sg * x, y0, 0.05))],
                     (-sg, 0, 0))
        GK.map_axes(c, [f], 'ISHIGAKI', (sg * x, 0, zb), (0, 1, 0), ZV)
        cp = c.box(F(Vector((sg * (x + 0.2), 0, 0)), (1, 0)), y0, y1, 0.0, 0.1, -0.2, 0.2, 'STONE_B', skip=('bot',))
    f = GK._face(c.bm, [c.bm.verts.new(p) for p in ((-x, y0, zb), (x, y0, zb), (x, y0, 0.05), (-x, y0, 0.05))], (0, 1, 0))
    GK.map_axes(c, [f], 'ISHIGAKI', (-x, y0, zb), (1, 0, 0), ZV)
    w = GK._face(c.bm, [c.bm.verts.new(p) for p in ((-x, y0, zw), (x, y0, zw), (x, y1, zw), (-x, y1, zw))], (0, 0, 1))
    c.m([w], 'WATER'); c.nb([w])


def flume(c):
    """Wooden flume (kakehi) on trestles from the pond to the wheel: a U
    trough of planks, water inside, posts with cross beams every 2 m."""
    y0, y1, z, w, h = FLUME['y0'], FLUME['y1'], FLUME['z'], FLUME['w'], FLUME['h']
    f = F(Vector((0, 0, 0)), (1, 0))        # u = y, d = x
    poly = [(-w / 2, z), (w / 2, z), (w / 2, z + h), (w / 2 - 0.05, z + h), (w / 2 - 0.05, z + 0.06), (-w / 2 + 0.05, z + 0.06),
            (-w / 2 + 0.05, z + h), (-w / 2, z + h)]
    sides, caps = KK.prism_u(c, f, poly, y1, y0)
    c.m(sides + caps, 'WOOD_FLAT'); c.nb(sides + caps)
    q = GK._face(c.bm, [c.bm.verts.new(p) for p in ((-w / 2 + 0.05, y1, z + 0.2), (w / 2 - 0.05, y1, z + 0.2), (w / 2 - 0.05, y0, z + 0.2),
                                                    (-w / 2 + 0.05, y0, z + 0.2))], (0, 0, 1))
    c.m([q], 'WATER'); c.nb([q])
    if c.lod == 0:   # water spilling over the lip onto the paddles
        s = GK._face(c.bm, [c.bm.verts.new(p) for p in ((-0.2, y0, z + 0.2), (0.2, y0, z + 0.2), (0.2, y0 + 0.35, z - 0.45), (-0.2, y0 + 0.35, z - 0.45))],
                     (0, -1, 0.3))
        c.m([s], 'WATER'); c.nb([s])
    fr = F(Vector((0, 0, 0)), (0, -1))
    yy = y1 + 0.6
    while yy < y0 - 0.8:
        for x in (-w / 2 - 0.06, w / 2 + 0.06):
            c.box(fr, x - 0.05, x + 0.05, 0.0, z, -yy - 0.05, -yy + 0.05, 'WOOD', skip=('bot', 'top'), rotate=True)
        c.box(fr, -w / 2 - 0.15, w / 2 + 0.15, z - 0.1, z, -yy - 0.06, -yy + 0.06, 'WOOD')
        if c.lod == 0:
            c.box(fr, -w / 2 - 0.2, w / 2 + 0.2, 0.0, 0.08, -yy - 0.15, -yy + 0.15, 'STONE_FLAT', skip=('bot',))
        yy += 2.0


def _mill(lod):
    hc, slots, roof = GA._house(HOUSE, lod)
    c = C('Gassho', lod)
    from buildings.koedo_landmarks import _merge
    _merge(c.bm, hc.bm, (HX, 0.0, 0.0))
    wheel(c, WHEEL['R'], WHEEL['w'], WHEEL['zc'], WHEEL['n'] if lod == 0 else 10)
    before = set(c.bm.verts)
    pit(c)
    flume(c)
    # built with the flume to -Y; the pond lies behind the wheel (+Y, as in the prototype: millWheel 17 m
    # from the pond centre on the side the dealer's court is on) - turn pit and flume half round
    new = [v for v in c.bm.verts if v not in before]
    bmesh.ops.rotate(c.bm, verts=new, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Z'))
    return c, slots, roof


def _mill_dress(slots, lod):
    cs = GA._dress(HOUSE, slots, lod)
    bmesh.ops.translate(cs.bm, verts=list(cs.bm.verts), vec=(HX, 0.0, 0.0))
    c = C('GasshoShop', lod); c.bm = cs.bm
    # millstones and rice sacks in the open door (S wall, u 1.0..3.2 -> x HX-3.8+1.0..)
    x0 = HX - HOUSE['L'] / 2
    y = -HOUSE['B'] / 2 + 1.0
    for k, (r, z0, z1) in enumerate(((0.55, 0.0, 0.45), (0.5, 0.45, 0.62), (0.47, 0.62, 0.84))):
        s = K.lathe(c.bm, 12 if lod == 0 else 8, [(r, z0), (r, z1)], cx=x0 + 2.1, cy=y, cap_bottom=False)
        c.m(s['sides'] + [s['top']], 'STONE' if k else 'WOOD_DARK'); c.nb(s['sides'])
    rr = random.Random(5)
    for i in range(4 if lod == 0 else 2):      # straw rice bales (tawara)
        p = (x0 + 0.6 + 0.55 * i, -HOUSE['B'] / 2 - 0.5 - 0.1 * (i % 2), 0.22)
        t = K.tube_path(c.bm, [Vector(p) + Vector((0, -0.38, 0)), Vector(p) + Vector((0, 0.38, 0))], 0.22, 8 if lod == 0 else 6, cap0=True, cap1=True)
        c.m(t[0], 'STRAW'); c.m([t[1], t[2]], 'STRAW_DARK'); c.nb(t[0])
    return c


def build_mill(key='Mill', lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Gassho')
    smat = K.atlas_material('GasshoShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, slots, roof = _mill(lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _mill_dress(slots, lod)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    L, B = HOUSE['L'], HOUSE['B']
    T = roof['T']
    K.collider_box(f'COL_{name}_House', col, HX - L / 2 - 0.1, HX + L / 2 + 0.1, -B / 2 - 0.1, B / 2 + 0.1, 0.0, T.Zt)
    R, w, zc = WHEEL['R'], WHEEL['w'], WHEEL['zc']
    K.collider_box(f'COL_{name}_Wheel', col, -w / 2 - 0.6, w / 2 + 0.1, -R, R, PIT['z'], zc + R)
    K.collider_box(f'COL_{name}_Flume', col, -0.35, 0.35, -FLUME['y0'], -FLUME['y1'], 0.0, FLUME['z'] + FLUME['h'])
    s0 = slots[0]['f']
    K.light_marker(f'LIGHT_{name}_Door', col, (HX - L / 2 + 2.1, -B / 2 - 0.6, 2.0), color=(1.0, 0.68, 0.4), watts=20, unity_range=4.5)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(T.Zt, 2), wheel=(0.0, 0.0))
    return col, objs


def _pond(c):
    L, B, zw, top = POND['L'], POND['B'], POND['water'], POND['top']
    lod = c.lod
    X, Y = L / 2, B / 2
    zb = zw - 0.6
    # water surface in four strips (keeps faces small for the fog / reflections)
    for k in range(4):
        ya, yb = -Y + B * k / 4, -Y + B * (k + 1) / 4
        w = GK._face(c.bm, [c.bm.verts.new(p) for p in ((-X, ya, zw), (X, ya, zw), (X, yb, zw), (-X, yb, zw))], (0, 0, 1))
        c.m([w], 'WATER'); c.nb([w])
    sl = (2.2, 0.9)   # sluice notch in the +Y wall: centre x 0, width
    for e in range(4):
        f = GA.edge_frame(L, B, e)
        Lw = (L, B, L, B)[e]
        holes = [(Lw / 2 - sl[1] / 2, Lw / 2 + sl[1] / 2, zw - 0.05, top + 0.01)] if e == 2 else []
        from buildings.minato_kit import cut
        for ua, ub, za, zb_ in cut(0.0, Lw, zb, top, holes):
            q = GK._face(c.bm, [c.bm.verts.new(f(u, z, 0.0)) for u, z in ((ua, za), (ub, za), (ub, zb_), (ua, zb_))], -f.n)
            GK.map_axes(c, [q], 'ISHIGAKI', f(0, zb, 0.0), f.t, ZV)
        # coping: single flat stones of mixed size and tone (a straight slab read as a swimming pool)
        rr = random.Random(e * 17 + 3)
        hs = [(h[0] - 0.08, h[1] + 0.08) for h in holes]
        u = -0.45
        while u < Lw + 0.45 - 0.05:
            w = min(rr.uniform(0.45, 0.95), Lw + 0.45 - u)
            if not any(a < u + w / 2 < b for a, b in hs) and w > 0.08:
                zt = top + rr.uniform(0.04, 0.12)
                d0, d1 = rr.uniform(-0.12, -0.02), rr.uniform(0.3, 0.5)
                c.box(f, u + 0.02, u + w - 0.02, top - 0.08, zt, d0, d1, rr.choice(('STONE_A', 'STONE_B', 'STONE_C', 'STONE_FLAT')),
                      skip=('bot',) if lod == 0 else ('bot', 'in'), bevel=lod == 0)
            u += w
        for ua, ub, za, zb_ in cut(-0.45, Lw + 0.45, 0.0, 0.05, [(h[0] - 0.05, h[1] + 0.05, 0.0, 0.1) for h in holes]):
            g = GK._face(c.bm, [c.bm.verts.new(p) for p in (f(ua, 0.03, 0.35), f(ub, 0.03, 0.35), f(ub, 0.03, 0.9), f(ua, 0.03, 0.9))], ZV)
            GK.map_axes(c, [g], 'GRASS', f(0, 0.03, 0.35), f.t, f.n)
    # sluice: two stone posts, plank gate (half raised), a beam with the spindle and hand wheel
    fN = GA.edge_frame(L, B, 2)
    uc = L / 2
    for u in (uc - sl[1] / 2 - 0.15, uc + sl[1] / 2 + 0.15):
        c.box(fN, u - 0.15, u + 0.15, zb + 0.4, top + 0.9, -0.15, 0.25, 'STONE_FLAT', skip=('bot',), bevel=True)
    c.box(fN, uc - sl[1] / 2 - 0.3, uc + sl[1] / 2 + 0.3, top + 0.9, top + 1.05, -0.12, 0.22, 'WOOD', skip=(), bevel=True)
    c.box(fN, uc - sl[1] / 2, uc + sl[1] / 2, zw + 0.15, top + 0.45, 0.02, 0.08, 'WOOD_TATE_FLAT', skip=())
    if lod == 0:
        for z in (zw + 0.3, top + 0.1, top + 0.35):
            c.box(fN, uc - sl[1] / 2, uc + sl[1] / 2, z, z + 0.05, 0.08, 0.1, 'WOOD', skip=('in',))
        c.tube([fN(uc, top + 0.45, 0.05), fN(uc, top + 1.35, 0.05)], 0.025, 6, 'IRON')
        pts = [fN(uc + 0.3 * math.cos(2 * math.pi * k / 10), top + 1.3, 0.05 + 0.3 * math.sin(2 * math.pi * k / 10)) for k in range(11)]
        c.tube(pts, 0.02, 4, 'IRON')
        c.tube([fN(uc - 0.3, top + 1.3, 0.05), fN(uc + 0.3, top + 1.3, 0.05)], 0.015, 4, 'IRON')
    # outlet channel stub through the bank (the mill's flume continues it)
    q = GK._face(c.bm, [c.bm.verts.new(p) for p in ((-0.4, Y, zw + 0.0), (0.4, Y, zw + 0.0), (0.4, Y + 0.75, zw + 0.0), (-0.4, Y + 0.75, zw + 0.0))], ZV)
    c.m([q], 'WATER'); c.nb([q])
    for sg in (-1, 1):
        q = GK._face(c.bm, [c.bm.verts.new(p) for p in ((sg * 0.45, Y, zb), (sg * 0.45, Y + 0.75, zb), (sg * 0.45, Y + 0.75, top),
                                                        (sg * 0.45, Y, top))], (-sg, 0, 0))
        c.m([q], 'STONE_FLAT'); c.nb([q])
    # washing platform (araiba) on the -X side: planks on posts, two steps down
    fW = GA.edge_frame(L, B, 3)
    u0, u1 = B / 2 - 1.2, B / 2 + 1.2
    c.box(fW, u0, u1, top - 0.02, top + 0.06, -1.6, 0.0, 'WOOD_GREY_FLAT', skip=(), bevel=True)
    if lod == 0:
        for u in (u0 + 0.1, u1 - 0.1):
            for d in (-1.5, -0.8):
                c.box(fW, u - 0.05, u + 0.05, zb + 0.3, top - 0.02, d - 0.05, d + 0.05, 'WOOD', skip=('bot', 'top'), rotate=True)
        for k in range(1, int((u1 - u0) / 0.24)):
            u = u0 + k * 0.24
            c.box(fW, u - 0.006, u + 0.006, top + 0.06, top + 0.065, -1.6, 0.0, 'WOOD_FLAT', skip=('bot',))
    c.box(fW, u0 + 0.4, u1 - 0.4, zw - 0.02, zw + 0.12, -2.0, -1.6, 'STONE_FLAT', skip=('bot',), bevel=True)
    # reeds in the corners and along the shallow -Y edge, water-lily pads (hasu) in two patches
    rr = random.Random(21)
    clumps = [(-X + 0.9, -Y + 0.9), (-X + 1.6, -Y + 0.7), (X - 0.9, -Y + 0.8), (X - 0.8, Y - 1.0), (-X + 0.8, Y - 1.4), (4.0, -Y + 0.6),
              (-6.5, -Y + 0.7), (8.5, Y - 0.7)]
    for (x, y) in clumps[:None if lod == 0 else 4]:
        for k in range(5 if lod == 0 else 2):
            px, py = x + rr.uniform(-0.4, 0.4), y + rr.uniform(-0.3, 0.3)
            h = rr.uniform(0.9, 1.5)
            r = K.lathe(c.bm, 4, [(0.09, zw - 0.05), (0.0, zw + h)], cx=px, cy=py, phase=rr.random(), cap_bottom=False)
            c.m(r['sides'], rr.choice(('LEAF', 'MOSS'))); c.nb(r['sides'])
    if lod == 0:
        for (cx, cy, n) in ((-5.0, 2.5, 9), (5.5, -2.0, 7)):
            for k in range(n):
                px, py = cx + rr.uniform(-1.4, 1.4), cy + rr.uniform(-1.0, 1.0)
                r = rr.uniform(0.18, 0.32)
                pad = K.lathe(c.bm, 7, [(r, zw + 0.01), (r, zw + 0.015)], cx=px, cy=py, phase=rr.random(), cap_bottom=False, cap_top=True)
                c.m([pad['top']] + pad['sides'], 'LEAF'); c.nb(pad['sides'] + [pad['top']])
    # rocks on the verge
    rr = random.Random(9)
    for (x, y, s) in ((-X - 0.9, -Y + 1.5, 0.5), (X + 0.8, 2.0, 0.6), (-4.0, -Y - 0.8, 0.45), (6.0, -Y - 0.75, 0.35), (3.5, Y + 0.8, 0.4)):
        rk = K.lathe(c.bm, 6, [(s, 0.0), (s * 0.9, s * 0.35), (s * 0.5, s * 0.6), (0.0, s * 0.65)], cx=x, cy=y, phase=rr.random(), cap_bottom=False)
        c.m(rk['sides'], 'STONE'); c.nb(rk['sides'])
    # the sluice was built on the +Y edge; the mill stands on the -Y side of the pond: turn it all half round
    bmesh.ops.rotate(c.bm, verts=list(c.bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Z'))


def build_pond(key='MillPond', lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Gassho')
    objs = []
    for lod in lods:
        c = C('Gassho', lod)
        _pond(c)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.012 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    L, B = POND['L'], POND['B']
    for nm, box in (('S', (-L / 2 - 0.45, L / 2 + 0.45, -B / 2 - 0.45, -B / 2, 0.0, POND['top'] + 0.1)),
                    ('N', (-L / 2 - 0.45, L / 2 + 0.45, B / 2, B / 2 + 0.45, 0.0, POND['top'] + 0.1)),
                    ('W', (-L / 2 - 0.45, -L / 2, -B / 2, B / 2, 0.0, POND['top'] + 0.1)),
                    ('E', (L / 2, L / 2 + 0.45, -B / 2, B / 2, 0.0, POND['top'] + 0.1))):
        K.collider_box(f'COL_{name}_{nm}', col, *box)
    col['dims'] = dict(water=POND['water'])
    return col, objs


def build():
    return [build_mill(), build_pond()]
