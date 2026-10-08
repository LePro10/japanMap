"""The modern town (task 5b) - buildings from the Machi kit:

- Petal Motors (Sakura Commons, 22 x 14 m): car dealer with an open glass
  front, ten marked stalls inside (side rows of four, two at the back - the
  places of the show cars in the prototype), reception counter, sales
  tables, downlights, deep fascia with the sign, a corner sign tower, an
  entrance canopy, nobori and price boards (fictional brand);
- Open Bay (18 x 14 m): car workshop, one wide entrance (8 m, roller
  shutter up) over the bay apron, two-post lift, tool wall, tyre stacks,
  drums, compressor, office with the reception window;
- six modern prefab houses (Koedo outskirts, parcels 7.5-10 x 8-12 m, two
  or three storeys) as data: siding per storey, slate gable / galvalume
  mono-pitch / flat roof, box balcony with laundry, AC units, Eco Cute,
  carport, gate post, block wall;
- izakaya of the Tokyo yokochō alleys (5 widths, 3.0-4.8 m, two storeys,
  structure in the Minato atlas): they stand side by side as a row.

Each FBX: SM_<name>_LOD0/1 (structure; Machi + M_Glass for the showroom,
Minato for the izakaya) and SM_<name>_Shop_LOD0/1 (dressing, MachiShop).
Front = -Y (Unity +Z)."""
import math
import random
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings import koedo_kit as KK
from buildings import minato_kit as M
from buildings import machi_kit as MK
from buildings.minato_kit import SIDES, edge_frame, _face
from buildings.machi_kit import gbox, floor, wall, glass, FR
from buildings.tokyo_kit import F

KLASS = 'buildings'
NAME = 'Machi'
ZV = Vector((0, 0, 1))


def _inner(c, f, u0, u1, z0, z1, d, reg):
    q = _face(c, [f(u0, z0, d), f(u1, z0, d), f(u1, z1, d), f(u0, z1, d)], -f.n)
    c.m([q], reg); c.nb([q])
    return q


def _joints(c, f, u0, u1, z0, z1, step=1.2, d=0.0, skip=()):
    """Panel joints of aluminium composite cladding (vertical grooves)."""
    if c.lod:
        return
    n = max(1, round((u1 - u0) / step))
    for i in range(1, n):
        u = u0 + (u1 - u0) * i / n
        if any(a - 0.05 < u < b + 0.05 for a, b in skip):
            continue
        c.box(f, u - 0.012, u + 0.012, z0, z1, d, d + 0.012, 'PANEL_GREY', skip=('in', 'top', 'bot'))


# ── Petal Motors ────────────────────────────────────────────────────────────

DEALER = dict(L=22.0, B=14.0, gy=-6.35, zf=0.03, H=4.6, zr=6.0, zp=6.45, tower=(9.75, 11.0, -7.0, -6.0, 8.6),
              canopy=(-3.2, 3.2, 1.6, 3.1))
# show-car places of the prototype (sakura.json), relative to the centre, front = -Y:
# four along each side wall (pointing in), two at the back (pointing to the front)
SIDE_Y = (-5.2, -2.27, 0.67, 3.6)
BACK_X = (-3.6, 3.6)


def _dealer(lod):
    c = KK.C('Machi', lod); c.glass = False
    d = DEALER
    L, B, gy, zf, H, zr, zp = d['L'], d['B'], d['gy'], d['zf'], d['H'], d['zr'], d['zp']
    X, Y = L / 2, B / 2
    tx0, tx1, ty0, ty1, th = d['tower']
    # slab and showroom floor (tiles), forecourt strip under the overhang
    gbox(c, -X, X, -Y, Y, 0.0, zf, 'CONC_FLAT', skip=('top', 'bot'))
    floor(c, -X, X, gy, Y, zf, 'FLOOR_TILE')
    floor(c, -X, X, -Y, gy, zf, 'CONC_FLAT')
    # stall markings: side rows (open to the aisle), back pair (open to the front)
    zl = zf + 0.003
    for sg in (-1, 1):
        for yc in SIDE_Y:
            y0, y1 = max(yc - 1.465, gy + 0.1), yc + 1.465
            MK.stall(c, *(sorted((sg * 6.0, sg * (X - 0.2)))), y0, y1, zl, open_side='x0' if sg > 0 else 'x1')
    for xb in BACK_X:
        MK.stall(c, xb - 1.3, xb + 1.3, 1.7, Y - 0.2, zl, open_side='y0')
    # glass front: mullions, one wide centre bay with the automatic doors slid open
    fS = F(Vector((0, gy, 0)), (0, -1))
    xs = [-9.75 + 2.0625 * i for i in range(5)] + [1.5 + 2.0625 * i for i in range(5)]
    for a, b in zip(xs, xs[1:]):
        if abs(a + 1.5) < 1e-6:          # centre bay: open doorway, glass transom over the door head
            glass(c, fS, a, b, 2.65, H - 0.05)
            c.box(fS, a, b, 2.5, 2.65, -0.12, 0.08, 'ALU', skip=())
            if lod == 0:
                c.box(fS, -0.3, 0.3, 2.42, 2.5, -0.06, 0.04, 'PANEL_DARK')      # door sensor
            for sg in (-1, 1):           # door leaves pushed behind the fixed panes
                u0, u1 = (a - 1.45, a - 0.02) if sg < 0 else (b + 0.02, b + 1.45)
                glass(c, fS, u0, u1, zf + 0.02, 2.5, d=-0.14)
                if lod == 0:
                    for uu in (u0, u1 - 0.05):
                        c.box(fS, uu, uu + 0.05, zf, 2.5, -0.17, -0.11, 'ALU', skip=())
        else:
            glass(c, fS, a, b, zf + 0.05, H - 0.05)
    for x in xs:
        c.box(fS, x - 0.04, x + 0.04, zf, H, -0.12, 0.08, 'ALU', skip=('top', 'bot'), bevel=True)
    for a, b in zip(xs, xs[1:]):
        if abs(a + 1.5) > 1e-6:
            c.box(fS, a, b, zf, zf + 0.08, -0.1, 0.06, 'ALU', skip=('bot',))
    c.box(fS, xs[0], xs[-1], H - 0.12, H, -0.12, 0.08, 'ALU', skip=())
    # left corner pier (balances the sign tower on the right)
    c.box(fS, -X, -9.75, zf, H, -0.15, 0.0, 'PANEL_WHITE', skip=('top', 'bot'), bevel=True)
    # side walls: glazed front part, then panels; inner faces seen through the glass
    yg = -2.4
    fW = F(Vector((-X, 0, 0)), (-1, 0))     # u = -y
    fE = F(Vector((X, 0, 0)), (1, 0))       # u = y
    for f, sgn, y_front in ((fW, -1, gy), (fE, 1, ty1)):
        ua, ub = sorted((sgn * y_front, sgn * yg))
        uw0, uw1 = sorted((sgn * yg, sgn * Y))
        # panel part
        wall(c, f, uw0, uw1, zf, zr, 'PANEL_WHITE')
        wall(c, f, ua, ub, H, zr, 'PANEL_WHITE')
        _joints(c, f, uw0, uw1, zf, zr)
        _inner(c, f, uw0, uw1, zf, H, -0.15, 'PAINT_WHITE')
        # glazed part
        n = 2
        for i in range(n):
            a, b = ua + (ub - ua) * i / n, ua + (ub - ua) * (i + 1) / n
            glass(c, f, a, b, zf + 0.05, H - 0.05)
        for i in range(n + 1):
            u = ua + (ub - ua) * i / n
            c.box(f, u - 0.04, u + 0.04, zf, H, -0.12, 0.08, 'ALU', skip=('top', 'bot'))
        c.box(f, ua, ub, H - 0.12, H, -0.12, 0.08, 'ALU', skip=())
        c.box(f, ua, ub, zf, zf + 0.08, -0.1, 0.06, 'ALU', skip=('bot',))
    # back wall: service door, office windows, AC units, downpipes
    fN = F(Vector((0, Y, 0)), (0, 1))       # u = -x
    holes = [(-8.0, -6.6, zf, 2.3), (-4.0, -2.2, 1.0, 2.2), (2.0, 3.8, 1.0, 2.2)]
    wall(c, fN, -X, X, zf, zr, 'PANEL_WHITE', holes)
    _joints(c, fN, -X, X, zf, zr, skip=[(h[0], h[1]) for h in holes])
    _inner(c, fN, -X, X, zf, H, -0.15, 'PAINT_WHITE')
    M.alu_door(c, fN, -8.0, -6.6, zf, 2.3, 0.0, dict(canopy=0.8, frame='ALU'))
    M.alu_window(c, fN, -4.0, -2.2, 1.0, 2.2, 0.0, dict(lit=True))
    M.alu_window(c, fN, 2.0, 3.8, 1.0, 2.2, 0.0, dict(frame='ALU'))
    for u in (-6.0, -1.0, 4.5) if lod == 0 else ():
        M.ac_unit(c, F(Vector((0, Y, 0)), (0, 1)), u, 0.0, 0.25)
    for u in (-X + 0.15, X - 0.15):
        M.downpipe(c, fN, u, 0.0, zr, d=0.1)
    # ceiling (inside), soffit of the overhang, downlights
    floor(c, -X, X, gy, Y, H, 'CEILING', up=False)
    floor(c, -X, X, -Y, gy, H, 'CEILING', up=False)
    MK.downlights(c, (-8.0, -4.0, 0.0, 4.0, 8.0), (-4.2, -0.8, 2.6, 5.4), H)
    MK.downlights(c, (-7.5, -2.5, 2.5, 7.5), (-6.7,), H)
    # track lights over the stalls: a rail per row, two spots aimed at each car
    if lod == 0:
        for sg in (-1, 1):
            c.tube([(sg * 8.4, -6.0, H - 0.04), (sg * 8.4, 5.0, H - 0.04)], 0.025, 4, 'PANEL_DARK', caps=True)
            for yc in SIDE_Y:
                for dy in (-0.6, 0.6):
                    MK.spot(c, (sg * 8.4, yc + dy, H - 0.06), (sg * 0.3, 0, -1))
        c.tube([(-5.0, 4.0, H - 0.04), (5.0, 4.0, H - 0.04)], 0.025, 4, 'PANEL_DARK', caps=True)
        for xb in BACK_X:
            for dx in (-0.6, 0.6):
                MK.spot(c, (xb + dx, 4.0, H - 0.06), (0, 0.3, -1))
    # roof: flat behind the parapet, fascia all round, pink stripe at its foot
    floor(c, -X, X, -Y, Y, zr, 'CONC_DARK')
    for e in range(4):
        f = edge_frame(L, B, e)
        Lw = (L, B, L, B)[e]
        z0 = H if e == 0 else zr
        if e == 0:
            wall(c, f, 0.0, Lw, H + 0.3, zp, 'PANEL_WHITE')
            c.box(f, -0.02, Lw + 0.02, H, H + 0.3, 0.0, 0.03, 'PANEL_PINK', skip=('in',))
        else:
            wall(c, f, 0.0, Lw, zr, zp, 'PANEL_WHITE')
        c.box(f, -0.03, Lw + 0.03, zp, zp + 0.06, -0.22, 0.04, 'ALU', skip=('bot',))
        _inner(c, f, 0.0, Lw, zr, zp, -0.2, 'CONC_FLAT')
    for f, sgn in ((fW, -1), (fE, 1)):   # returns of the fascia over the forecourt
        ua, ub = sorted((sgn * -Y, sgn * gy))
        wall(c, f, ua, ub, H, zr, 'PANEL_WHITE')
        c.box(f, ua, ub, H, H + 0.3, 0.0, 0.03, 'PANEL_PINK', skip=('in',))
    if lod == 0:   # roof plant: condensers, a hatch
        for x in (-6.0, -3.5, 5.0):
            gbox(c, x - 0.5, x + 0.5, 3.5, 4.2, zr, zr + 0.9, 'PAINT_WHITE', skip=('bot',), bevel=True)
            gbox(c, x - 0.3, x + 0.3, 3.48, 3.5, zr + 0.2, zr + 0.7, 'IRON', skip=('bot', 'top'))
        gbox(c, 7.0, 8.2, 1.0, 2.2, zr, zr + 0.5, 'PANEL_GREY', skip=('bot',), bevel=True)
    # sign tower at the front-right corner (pylon faces in the dressing)
    gbox(c, tx0, tx1, ty0, ty1, 0.0, th, 'PANEL_DARK', skip=('bot',), bevel=True)
    gbox(c, tx0 - 0.04, tx1 + 0.04, ty0 - 0.04, ty1 + 0.04, th, th + 0.08, 'ALU', skip=('bot',))
    # entrance canopy (hisashi) on two tie rods, pink edge
    cx0, cx1, cdep, cz = d['canopy']
    gbox(c, cx0, cx1, -Y - cdep, -Y, cz, cz + 0.22, 'PANEL_WHITE', skip=(), bevel=True)
    gbox(c, cx0, cx1, -Y - cdep - 0.02, -Y - cdep, cz, cz + 0.22, 'PANEL_PINK', skip=('in',))
    floor(c, cx0 + 0.05, cx1 - 0.05, -Y - cdep + 0.05, -Y, cz - 0.003, 'CEILING', up=False)
    if lod == 0:
        for x in (cx0 + 0.4, cx1 - 0.4):
            c.tube([(x, -Y - cdep + 0.15, cz + 0.22), (x, -Y + 0.02, H + 1.1)], 0.02, 4, 'CHROME')
        MK.downlights(c, (-1.5, 1.5), (-Y - cdep / 2,), cz - 0.004)
    return c


def _dealer_dress(lod):
    c = KK.C('MachiShop', lod)
    d = DEALER
    L, B, gy, zf, H = d['L'], d['B'], d['gy'], d['zf'], d['H']
    X, Y = L / 2, B / 2
    fS = F(Vector((0, -Y, 0)), (0, -1))      # u = x, on the fascia face
    # fascia sign: frame of raised letters panel
    b = c.box(fS, -5.2, 5.2, 4.98, 6.28, 0.0, 0.06, None, skip=('in',))
    c.m([b['out']], 'PETAL_FASCIA'); c.m([x for k, x in b.items() if k != 'out'], 'WHITE')
    tx0, tx1, ty0, ty1, th = d['tower']
    for f, u0, u1 in ((F(Vector((0, ty0, 0)), (0, -1)), tx0 + 0.08, tx1 - 0.08), (F(Vector((tx1, 0, 0)), (1, 0)), ty0 + 0.08, ty1 - 0.08)):
        b = c.box(f, u0, u1, th - 2.6, th - 0.3, 0.0, 0.02, None, skip=('in',))
        c.m([b['out']], 'PYLON'); c.m([x for k, x in b.items() if k != 'out'], 'WHITE')
    # counter with the brand wall behind it
    fN = F(Vector((0, Y - 0.16, 0)), (0, -1))   # inner face of the back wall, u = x
    b = c.box(fN, -2.4, 2.4, 0.9, 3.3, 0.0, 0.03, None, skip=('in',))
    c.m([b['out']], 'DEALER_WALL'); c.m([x for k, x in b.items() if k != 'out'], 'WHITE')
    MK.gbox(c, -1.8, 1.8, 5.35, 5.95, zf, zf + 1.0, 'WHITE', skip=('bot',), bevel=True)
    MK.gbox(c, -1.85, 1.85, 5.3, 6.0, zf + 1.0, zf + 1.05, 'BLACK', bevel=True)
    MK.gbox(c, -1.8, 1.8, 5.34, 5.35, zf + 0.75, zf + 0.85, 'PINK', skip=('in', 'bot', 'top'))
    if lod == 0:
        for x in (-1.0, 0.8):
            MK.gbox(c, x - 0.2, x + 0.2, 5.6, 5.62, zf + 1.05, zf + 1.35, 'SCREEN', skip=('bot',))
            MK.gbox(c, x - 0.03, x + 0.03, 5.62, 5.66, zf + 1.05, zf + 1.2, 'BLACK', skip=('bot',))
    # safety band on the glass (pink, at hip height) and the entrance mat
    fG = F(Vector((0, gy - 0.004, 0)), (0, -1))
    for a, b in ((-9.75, -1.5), (1.5, 9.75)):
        bb = c.box(fG, a, b, 1.05, 1.13, 0.0, 0.003, 'PINK', skip=('in', 'top', 'bot', 'l', 'r'))
    MK.gbox(c, -1.4, 1.4, gy + 0.1, gy + 1.6, zf, zf + 0.012, 'BLACK', skip=('bot',))
    # sales tables, brochure rack, plants
    MK.table_set(c, -3.3, -2.6, 3, seed=1)
    MK.table_set(c, 3.3, -2.6, 3, seed=2)
    MK.table_set(c, 0.0, 0.6, 2, seed=3) if lod == 0 else None
    fr = F(Vector((-5.2, gy + 0.4, 0)), (0, -1))
    MK.gbox(c, -5.6, -4.8, gy + 0.3, gy + 0.6, zf, zf + 1.5, 'WHITE', skip=('bot',), bevel=True)
    if lod == 0:
        for k in range(3):
            z = zf + 0.5 + 0.35 * k
            MK.gbox(c, -5.55, -4.85, gy + 0.22, gy + 0.3, z, z + 0.28, ('PINK', 'PLASTIC_BLUE', 'YELLOW')[k], skip=('bot',))
    KK.pots(c, F(Vector((0, gy + 0.45, zf)), (0, 1)), -9.6, -8.6, 0.0, seed=4)
    KK.pots(c, F(Vector((0, gy + 0.45, zf)), (0, 1)), 8.4, 9.4, 0.0, seed=5)
    # price boards: one by each stall, at the aisle corner
    imgs = ['PRICE0', 'PRICE1', 'PRICE2', 'PRICE3']
    k = 0
    for sg in (-1, 1):
        for yc in SIDE_Y:
            f = F(Vector((sg * 5.7, yc + 0.9, zf)), (-sg, 0))
            MK.price_stand(c, f, 0.0, 0.0, imgs[k % 4]); k += 1
        f = F(Vector((sg * 2.0, 2.0, zf)), (0, -1))
        MK.price_stand(c, f, 0.0, 0.0, imgs[k % 4]); k += 1
    # nobori under the overhang, along the forecourt edge
    fF = F(Vector((0, -Y + 0.25, zf)), (0, -1))
    for i, x in enumerate((-9.2, -6.4, 5.6, 8.4)):
        KK.nobori(c, fF, x, 0.0, f'NOBORI{i % 4}', h=1.9, w=0.5)
    return c


def build_dealer(key='PetalMotors', lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Machi')
    smat = K.atlas_material('MachiShop', emission_strength=1.6)
    gl = K.glass_material()
    objs, shop = [], []
    for lod in lods:
        c = _dealer(lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat, gl], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _dealer_dress(lod)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    d = DEALER
    X, Y = d['L'] / 2, d['B'] / 2
    K.collider_box(f'COL_{name}_Body', col, -X, X, d['gy'], Y, 0.0, d['zp'])
    K.collider_box(f'COL_{name}_Roof', col, -X, X, -Y, d['gy'], d['H'], d['zp'])
    tx0, tx1, ty0, ty1, th = d['tower']
    K.collider_box(f'COL_{name}_Tower', col, tx0, tx1, ty0, ty1, 0.0, th)
    i = 0
    for x in (-6.0, 0.0, 6.0):
        for y in (-3.0, 2.8):
            K.light_marker(f'LIGHT_{name}_Hall{i}', col, (x, y, d['H'] - 0.3), color=(1.0, 0.95, 0.88), watts=60, unity_range=8.0)
            i += 1
    for x in (-6.0, 0.0, 6.0):
        K.light_marker(f'LIGHT_{name}_Soffit{i}', col, (x, -Y + 0.3, d['H'] - 0.3), color=(1.0, 0.92, 0.8), watts=25, unity_range=6.0)
        i += 1
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=d['tower'][4])
    return col, objs


# ── Open Bay ────────────────────────────────────────────────────────────────

SHOP = dict(L=18.0, B=14.0, base=1.0, EH=6.0, slope=0.12, gate=(-4.0, 4.0, 4.2), office=-4.6)


def _workshop(lod):
    c = KK.C('Machi', lod); c.glass = False
    s = SHOP
    L, B, EH, base = s['L'], s['B'], s['EH'], s['base']
    X, Y = L / 2, B / 2
    g0, g1, gh = s['gate']
    xo = s['office']
    zf = 0.03
    gbox(c, -X, X, -Y, Y, 0.0, zf, 'CONC_FLAT', skip=('top', 'bot'))
    floor(c, xo, X, -Y, Y, zf, 'EPOXY')
    floor(c, -X, xo, -Y, Y, zf, 'CONC_FLAT')
    # yellow lines: the lift bay and the walkway
    for x0, x1, y0, y1 in ((-2.6, -2.5, -5.5, 4.0), (1.6, 1.7, -5.5, 4.0), (2.4, 8.6, -6.2, -6.1)):
        q = _face(c, [(x0, y0, zf + 0.003), (x1, y0, zf + 0.003), (x1, y1, zf + 0.003), (x0, y1, zf + 0.003)], (0, 0, 1))
        c.m([q], 'LINE_YELLOW'); c.nb([q])
    roof_top, top = MK.slate_roof(c, L, B, EH, slope=s['slope'], eave=0.5, oh=0.4, reg='GALVA', fascia='GALVA_FLAT')
    holes = {'S': [(g0 + X, g1 + X, zf, gh), (0.6, 1.6, zf, 2.25), (2.2, 4.0, 0.9, 2.2), (14.2, 16.0, 1.0, 2.2)],
             'E': [(2.0, 3.0, zf, 2.2), (6.0, 7.8, 1.2, 2.3), (9.5, 11.3, 1.2, 2.3)],
             'N': [(3.0, 4.0, zf, 2.2), (8.0, 9.8, 1.6, 2.4), (12.5, 14.3, 1.6, 2.4)],
             'W': [(3.0, 4.8, 1.0, 2.2), (9.0, 10.8, 1.2, 2.3)]}
    for side, e in SIDES.items():
        f = edge_frame(L, B, e)
        Lw = (L, B, L, B)[e]
        hs = holes[side]
        wall(c, f, 0.0, Lw, zf, base, 'CONC_FLAT', hs, d=-0.02)
        wall(c, f, 0.0, Lw, base, EH, 'GALVA', hs)
        if e in (1, 3):
            wall(c, f, 0.0, Lw, EH, top(B / 2) + 0.02, 'GALVA', top=top)
        for ua, ub, za, zb in M.cut(0.0, Lw, base - 0.04, base, hs):
            c.box(f, ua, ub, base - 0.04, base + 0.02, -0.02, 0.05, 'ALU', skip=('in', 'l', 'r'))
        # inside faces (seen through the gate): block base, galvalume above
        for ua, ub, za, zb in M.cut(0.0, Lw, zf, EH, hs):
            q = _face(c, [f(ua, za, -0.08), f(ub, za, -0.08), f(ub, zb, -0.08), f(ua, zb, -0.08)], -f.n)
            c.m([q], 'PAINT_WHITE' if zb <= base + 0.01 or za < base else 'GALVA_FLAT'); c.nb([q])
        if e in (1, 3):
            tp = MK._clip(0.0, Lw, EH, top(B / 2) + 0.02, top, Lw / 2)
            if tp:
                q = _face(c, [f(tp[0][0], EH, -0.08), f(tp[-1][0], EH, -0.08)] + [f(u, z, -0.08) for u, z in reversed(tp)], -f.n)
                c.m([q], 'GALVA_FLAT'); c.nb([q])
    M.corner_trims(c, L, B, base, EH, 'GALVA_FLAT', d=0.03)
    fS, fE, fN, fW = (edge_frame(L, B, e) for e in range(4))
    MK.gate(c, fS, g0 + X, g1 + X, zf, gh)
    for f, (u0, u1) in ((fS, (g0 + X, g1 + X)),):   # gate reveal (wall thickness)
        for u in (u0, u1):
            q = _face(c, [f(u, zf, 0.0), f(u, zf, -0.08), f(u, gh, -0.08), f(u, gh, 0.0)], f.t * (1 if u == u0 else -1))
            c.m([q], 'GALVA_FLAT'); c.nb([q])
        q = _face(c, [f(u0, gh, 0.0), f(u1, gh, 0.0), f(u1, gh, -0.08), f(u0, gh, -0.08)], (0, 0, -1))
        c.m([q], 'GALVA_FLAT'); c.nb([q])
    M.alu_door(c, fS, 0.6, 1.6, zf, 2.25, 0.0, dict(canopy=0.0, frame='ALU'))
    # office window: deep reveal, the reception picture in the dressing
    back = M.reveal(c, fS, 2.2, 4.0, 0.9, 2.2, 0.0, 0.6, 'ALU', floor='ALU')
    c.m([back], 'INTERIOR')
    glass(c, fS, 2.2, 4.0, 0.9, 2.2, d=-0.05)
    M.trim(c, fS, 2.2, 4.0, 0.9, 2.2, 0.0, 'ALU')
    M.alu_window(c, fS, 14.2, 16.0, 1.0, 2.2, 0.0, dict(grille=True, frame='ALU'))
    M.alu_door(c, fE, 2.0, 3.0, zf, 2.2, 0.0, dict(canopy=0.6, frame='ALU'))
    M.alu_door(c, fN, 3.0, 4.0, zf, 2.2, 0.0, dict(canopy=0.6, frame='ALU'))
    for f, hs in ((fE, [(6.0, 7.8, 1.2, 2.3), (9.5, 11.3, 1.2, 2.3)]), (fN, [(8.0, 9.8, 1.6, 2.4), (12.5, 14.3, 1.6, 2.4)]),
                  (fW, [(3.0, 4.8, 1.0, 2.2), (9.0, 10.8, 1.2, 2.3)])):
        for u0, u1, z0, z1 in hs:
            M.alu_window(c, f, u0, u1, z0, z1, 0.0, dict(frame='ALU', lit=(f is fW and u0 < 5)))
    for f, u in ((fS, 0.15), (fS, L - 0.15), (fN, 0.15), (fN, L - 0.15)):
        M.downpipe(c, f, u, 0.0, EH, d=0.1)
    if lod == 0:
        M.ac_unit(c, fW, 6.5, 0.0, 0.3)
        M.ac_unit(c, fN, 6.0, 0.0, 0.3)
    # office partition inside (W end): wall with a window to the bay
    fo = F(Vector((xo, 0, 0)), (1, 0))      # u = y
    wall(c, fo, -Y + 0.08, -2.0, zf, 3.0, 'PAINT_WHITE', [(-5.0, -3.2, 1.0, 2.1)])
    glass(c, fo, -5.0, -3.2, 1.0, 2.1, d=-0.04)
    c.box(fo, -Y + 0.08, -2.0, 3.0, 3.1, -0.1, 0.0, 'PAINT_WHITE', skip=('in',))
    fo2 = F(Vector((0, -2.0, 0)), (0, 1))   # u = -x
    wall(c, fo2, -xo, X - 0.08, zf, 3.0, 'PAINT_WHITE', [(5.4, 6.3, zf, 2.1)])
    c.box(fo2, 5.4, 6.3, zf, 2.1, -0.04, 0.0, 'WOOD_LIGHT', skip=('in', 'l', 'r', 'top', 'bot'))
    q = _face(c, [(-X + 0.08, -Y + 0.08, 3.0), (xo, -Y + 0.08, 3.0), (xo, -2.0, 3.0), (-X + 0.08, -2.0, 3.0)], (0, 0, -1))
    c.m([q], 'CEILING'); c.nb([q])
    # steel portal frames: columns along the walls, rafters under the roof
    WL = B / 2 + 0.02
    for x in (-X + 0.12, -4.5, 0.0, 4.5, X - 0.12):
        for sg in (-1, 1):
            if sg < 0 and g0 - 0.2 < x < g1 + 0.2:     # no column in the gate
                continue
            gbox(c, x - 0.1, x + 0.1, sg * (Y - 0.08) - 0.1, sg * (Y - 0.08) + 0.1, zf, EH, 'STEEL_GREY', skip=('bot', 'top'), bevel=True)
        if lod == 0:
            for sg in (-1, 1):
                c.tube([(x, sg * (Y - 0.1), EH - 0.15), (x, 0.0, EH + WL * s['slope'] - 0.15)], 0.11, 4, 'STEEL_GREY', caps=True)
    for sg in (-1, 1):   # roof underside
        q = _face(c, [(-X, sg * WL, EH + 0.005), (X, sg * WL, EH + 0.005), (X, 0.0, EH + WL * s['slope'] + 0.005),
                      (-X, 0.0, EH + WL * s['slope'] + 0.005)], (0, 0, -1))
        c.m([q], 'GALVA_FLAT'); c.nb([q])
    # fluorescent tubes hung from the rafters
    tubes = []
    for x in (-2.25, 2.25, 6.75):
        for y in (-3.0, 2.0):
            gbox(c, x - 0.7, x + 0.7, y - 0.07, y + 0.07, EH - 0.62, EH - 0.55, 'LIGHT_COOL', skip=('top',))
            if lod == 0:
                c.tube([(x, y, EH - 0.55), (x, y, EH + (WL - abs(y)) * s['slope'])], 0.006, 3, 'IRON')
            tubes.append((x, y, EH - 0.8))
    return c, dict(ridge=roof_top, tubes=tubes)


def _workshop_dress(lod):
    c = KK.C('MachiShop', lod)
    s = SHOP
    L, B, EH = s['L'], s['B'], s['EH']
    X, Y = L / 2, B / 2
    g0, g1, gh = s['gate']
    zf = 0.03
    fS = edge_frame(L, B, 0)
    KK.board(c, fS, X, 8.8, 1.1, gh + 0.6, 0.12, 'OPENBAY_FASCIA', cap=False)
    # office reception picture behind the window
    fr = F(fS.o, fS.n, 2.2, 4.0, 0.9, 2.2)
    KK.interior(c, dict(f=fr, depth=0.6), 'INT_OFFICE')
    fin = F(Vector((0, 0, 0)), (0, -1))           # u = x, d = -y
    MK.lift(c, fin, -0.45, -0.5, w=3.4)
    # back wall: tool wall, workbench, tool chest, compressor, hose reel
    fN = F(Vector((0, Y - 0.1, 0)), (0, -1))      # inner face of the back wall, u = x
    b = c.box(fN, -2.6, 2.6, 1.1, 3.6, 0.0, 0.02, None, skip=('in',))
    c.m([b['out']], 'TOOLWALL'); c.m([x for k, x in b.items() if k != 'out'], 'WOOD_LIGHT')
    MK.bench_top(c, fN, -2.4, 0.6, 0.02, depth=0.75)
    MK.gbox(c, 1.0, 2.4, Y - 0.75, Y - 0.12, zf, zf + 1.05, 'CHEST_RED', skip=('bot',), bevel=True)
    if lod == 0:
        for k in range(5):
            z = zf + 0.15 + k * 0.18
            MK.gbox(c, 1.1, 2.3, Y - 0.77, Y - 0.75, z, z + 0.14, 'CHEST_RED', skip=('bot', 'top', 'in'))
            MK.gbox(c, 1.5, 1.9, Y - 0.79, Y - 0.77, z + 0.08, z + 0.1, 'CHROME', skip=('in',))
    MK.compressor(c, fN, 6.8, 0.5)
    MK.hose_reel(c, F(Vector((0, -Y + 0.3, 0)), (0, 1)), 4.5, 2.6)     # on the column by the gate, facing in
    # tyre corner (E): stacks, a tyre changer and a balancer
    for i, (x, y, n) in enumerate(((7.9, -2.5, 5), (7.9, -1.7, 4), (7.2, -2.1, 3), (7.9, 2.4, 4))):
        MK.tyre_stack(c, (x, y, zf), n=n, seed=i, rims=i == 3)
    MK.gbox(c, 5.6, 6.4, 0.6, 1.4, zf, zf + 0.95, 'RED', skip=('bot',), bevel=True)
    MK.gbox(c, 5.7, 6.3, 0.7, 1.3, zf + 0.95, zf + 1.05, 'STEEL', skip=('bot',))
    MK.gbox(c, 5.6, 6.3, 3.4, 4.0, zf, zf + 1.1, 'IRON', skip=('bot',), bevel=True)
    # drums, jack, cones
    for i, (x, y, r) in enumerate(((-3.6, Y - 0.55, 'DRUM_BLUE'), (-2.95, Y - 0.6, 'DRUM_RED'), (8.4, Y - 0.6, 'DRUM_YELLOW'))):
        MK.drum(c, (x, y, zf), r)
    MK.gbox(c, -1.0, -0.6, -4.2, -3.3, zf, zf + 0.22, 'RED', skip=('bot',), bevel=True)
    if lod == 0:
        c.tube([(-0.8, -4.2, zf + 0.2), (-0.8, -5.1, zf + 0.9)], 0.02, 4, 'IRON')
    # outside: used tyres for sale, oil drums at the back, a nobori
    fo = F(Vector((0, -Y - 0.6, 0)), (0, -1))
    for i, x in enumerate((5.4, 6.2, 7.0)):
        MK.tyre_stack(c, (x, -Y - 0.6, 0.0), n=4 + i % 2, seed=10 + i, rims=True)
    KK.nobori(c, F(Vector((0, -Y - 0.5, 0)), (0, -1)), -7.2, 0.0, 'NOBORI3', h=1.9, w=0.5)
    KK.nobori(c, F(Vector((0, -Y - 0.5, 0)), (0, -1)), -5.4, 0.0, 'NOBORI2', h=1.9, w=0.5)
    for i, x in enumerate((-6.5, -5.8)):
        MK.drum(c, (x, Y + 0.6, 0.0), ('DRUM_BLUE', 'DRUM_RED')[i])
    return c


def build_workshop(key='OpenBay', lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Machi')
    smat = K.atlas_material('MachiShop', emission_strength=1.6)
    gl = K.glass_material()
    objs, shop = [], []
    for lod in lods:
        c, info = _workshop(lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat, gl], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _workshop_dress(lod)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    s = SHOP
    X, Y, EH = s['L'] / 2, s['B'] / 2, s['EH']
    g0, g1, gh = s['gate']
    # walls as separate boxes: the gate stays open (cars drive in)
    for nm, box in (('Back', (-X, X, Y - 0.2, Y, 0.0, EH)), ('East', (X - 0.2, X, -Y, Y, 0.0, EH)), ('West', (-X, -X + 0.2, -Y, Y, 0.0, EH)),
                    ('FrontW', (-X, g0, -Y, -Y + 0.2, 0.0, EH)), ('FrontE', (g1, X, -Y, -Y + 0.2, 0.0, EH)),
                    ('Lintel', (g0, g1, -Y, -Y + 0.2, gh, EH)), ('Office', (-X, s['office'], -Y, -2.0, 0.0, 3.1)),
                    ('Roof', (-X - 0.4, X + 0.4, -Y - 0.5, Y + 0.5, EH, info['ridge']))):
        K.collider_box(f'COL_{name}_{nm}', col, *box)
    K.collider_box(f'COL_{name}_Lift', col, -2.4, 1.5, 0.3, 0.7, 0.0, 4.1)
    for i, p in enumerate(info['tubes']):
        K.light_marker(f'LIGHT_{name}_Tube{i}', col, p, color=(0.9, 0.96, 1.0), watts=30, unity_range=8.0)
    K.light_marker(f'LIGHT_{name}_Office', col, (-6.5, -5.5, 2.6), color=(1.0, 0.95, 0.88), watts=20, unity_range=5.0)
    K.light_marker(f'LIGHT_{name}_Sign', col, (0.0, -Y - 1.2, 5.6), color=(1.0, 0.95, 0.85), watts=20, unity_range=6.0)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(info['ridge'], 2))
    return col, objs


# ── modern houses ───────────────────────────────────────────────────────────
# Parcel W x D (front -Y), body Lb x Bb centred at (cx, cy); storey heights
# from the foundation top P; siding per storey; roof gable (slate, ridge
# along X) / shed (galvalume, rising to `high`) / flat (parapet). Openings:
# (side, u0, u1, kind, storey, opt) on the body, u from the left corner seen
# from outside. Site: carport / parking, block wall, gate post, fence.

P_FOUND = 0.45
HOUSES = {
    # 2F, beige tile siding, slate gable, balcony with laundry, carport left
    'House_A': dict(W=8.0, D=9.0, Lb=4.6, Bb=6.5, cx=1.15, cy=0.4, H=[2.9, 2.75],
                    walls=['SIDING_TILE', 'SIDING_TILE'], band='PANEL_DARK',
                    roof=dict(kind='gable', slope=0.5, eave=0.5, oh=0.45),
                    ops=[('S', 0.45, 1.35, 'door', 0, {}), ('S', 2.0, 4.3, 'win', 0, dict(shutter=True, lit=True)),
                         ('S', 0.5, 1.5, 'win', 1, dict(small=True)), ('S', 2.2, 4.4, 'sweep', 1, dict(shutter=True)),
                         ('E', 1.0, 2.6, 'win', 0, dict(shutter=True)), ('E', 4.4, 5.0, 'win', 0, dict(small=True, grille=True)),
                         ('E', 1.2, 2.8, 'win', 1, dict(shutter=True, lit=True)), ('E', 4.6, 5.2, 'win', 1, dict(small=True)),
                         ('N', 1.0, 1.8, 'win', 0, dict(small=True, grille=True)), ('N', 2.9, 3.7, 'kdoor', 0, {}),
                         ('N', 1.4, 3.4, 'win', 1, dict(shutter=True)),
                         ('W', 2.0, 2.6, 'win', 0, dict(small=True)), ('W', 3.6, 5.2, 'win', 0, dict(shutter=True)),
                         ('W', 2.4, 4.0, 'win', 1, dict(shutter=True))],
                    balcony=('S', 2.0, 4.5, 0.95), ac=[('E', 3.5, 0.0), ('S', 1.0, 'b')], ecocute=('N', 0.6), meter=('W', 6.0),
                    downpipes=[('S', 0.12), ('N', 4.48)], vents=[('E', 4.7, 2.4), ('N', 1.4, 2.7)],
                    site=dict(carport=(-3.9, -1.35, -4.4, 1.0, 'left'), gate=(0.2, -4.35), wall=True, fence=('E',)),
                    dress=dict(laundry=True, futon=True, name='NAME0')),
    # 2F, mono-pitch galvalume rising to the back, white lap siding below, wood above; carport right
    'House_B': dict(W=9.0, D=8.0, Lb=6.0, Bb=5.8, cx=-0.7, cy=0.25, H=[2.9, 2.75],
                    walls=['SIDING_LINES', 'SIDING_WOOD'], band='ALU',
                    roof=dict(kind='shed', slope=0.18, eave=0.5, oh=0.35, high='N'),
                    ops=[('S', 4.5, 5.4, 'door', 0, dict(leaf='PANEL_DARK')), ('S', 0.6, 3.6, 'sweep', 0, dict(shutter=True, lit=True)),
                         ('S', 0.6, 0.95, 'slit', 1, {}), ('S', 1.6, 4.2, 'win', 1, dict(wide=True)), ('S', 5.0, 5.35, 'slit', 1, {}),
                         ('E', 1.0, 1.6, 'win', 0, dict(small=True, grille=True)), ('E', 3.2, 4.8, 'win', 0, {}),
                         ('E', 1.5, 3.3, 'win', 1, dict(lit=True)),
                         ('N', 1.0, 2.6, 'win', 0, {}), ('N', 3.6, 4.4, 'kdoor', 0, {}),
                         ('N', 1.2, 2.2, 'win', 1, dict(small=True)), ('N', 3.4, 5.0, 'win', 1, dict(shutter=True)),
                         ('W', 1.4, 3.0, 'win', 0, dict(shutter=True)), ('W', 2.0, 3.8, 'win', 1, {})],
                    ac=[('W', 0.9, 0.0), ('N', 2.9, 0.0), ('E', 4.4, 'u')], ecocute=('W', 3.6), meter=('E', 5.2),
                    downpipes=[('S', 0.12), ('S', 5.88)], vents=[('E', 1.3, 2.4)],
                    site=dict(carport=(2.3, 4.4, -3.9, 1.6, 'right'), gate=(-0.2, -3.85), wall=True, fence=('W',)),
                    dress=dict(laundry=False, name='NAME3', pots=True)),
    # small 2F, white lap siding over a wood-look base, slate gable, no car (garden, bicycles)
    'House_C': dict(W=7.5, D=8.0, Lb=6.2, Bb=5.4, cx=0.0, cy=0.45, H=[2.85, 2.7],
                    walls=['SIDING_WOOD', 'SIDING_LINES'], band='PANEL_DARK',
                    roof=dict(kind='gable', slope=0.55, eave=0.45, oh=0.4),
                    ops=[('S', 0.5, 1.4, 'door', 0, dict(leaf='WOOD_LIGHT')), ('S', 2.3, 5.6, 'sweep', 0, dict(shutter=True, lit=True)),
                         ('S', 0.6, 1.4, 'win', 1, dict(small=True)), ('S', 2.2, 3.8, 'win', 1, dict(shutter=True)),
                         ('S', 4.4, 5.6, 'win', 1, dict(shutter=True, lit=True)),
                         ('E', 1.2, 2.8, 'win', 0, {}), ('E', 3.8, 4.4, 'win', 0, dict(small=True, grille=True)),
                         ('E', 1.6, 3.2, 'win', 1, {}),
                         ('N', 1.0, 2.6, 'win', 0, {}), ('N', 4.0, 4.7, 'win', 0, dict(small=True, grille=True)), ('N', 2.0, 3.6, 'win', 1, {}),
                         ('W', 1.4, 2.8, 'win', 0, dict(shutter=True)), ('W', 2.4, 3.2, 'win', 1, dict(small=True))],
                    ac=[('E', 4.6, 0.0), ('W', 3.8, 0.0)], ecocute=('N', 5.4), meter=('E', 0.5),
                    downpipes=[('S', 0.12), ('N', 6.08)], vents=[('N', 4.35, 2.4)],
                    site=dict(gate=(-2.2, -3.85), wall=True, fence=('W', 'E'), lawn=(-3.5, 3.5, -3.7, -2.4)),
                    dress=dict(laundry=True, laundry_on='ground', name='NAME1', pots=True)),
    # 3F town house: built-in garage with shutter, flat roof, dark galvalume base, white above, balconies
    'House_D': dict(W=10.0, D=12.0, Lb=8.6, Bb=8.8, cx=0.0, cy=0.78, H=[2.8, 2.8, 2.7], P=0.2,
                    walls=['GALVA', 'SIDING_LINES', 'SIDING_LINES'], band='PANEL_DARK',
                    roof=dict(kind='flat', parapet=0.6),
                    ops=[('S', 0.4, 3.4, 'garage', 0, {}), ('S', 5.8, 6.7, 'door', 0, dict(leaf='WOOD_LIGHT', canopy=0.8)),
                         ('S', 7.2, 7.6, 'slit', 0, {}),
                         ('S', 0.6, 3.6, 'sweep', 1, dict(shutter=True, lit=True)), ('S', 5.0, 8.0, 'sweep', 1, dict(shutter=True)),
                         ('S', 0.8, 2.4, 'win', 2, dict(shutter=True)), ('S', 3.4, 4.2, 'win', 2, dict(small=True)),
                         ('S', 5.4, 7.8, 'win', 2, dict(shutter=True, lit=True)),
                         ('E', 1.2, 2.0, 'win', 0, dict(small=True, grille=True)), ('E', 4.0, 5.6, 'win', 0, {}),
                         ('E', 1.5, 3.1, 'win', 1, {}), ('E', 5.5, 7.1, 'win', 1, dict(lit=True)),
                         ('E', 2.0, 3.6, 'win', 2, {}), ('E', 6.0, 7.0, 'win', 2, dict(small=True)),
                         ('N', 1.5, 3.1, 'win', 0, {}), ('N', 5.5, 6.3, 'win', 0, dict(small=True, grille=True)),
                         ('N', 2.0, 4.2, 'win', 1, dict(shutter=True)), ('N', 5.6, 7.2, 'win', 1, {}),
                         ('N', 2.5, 4.1, 'win', 2, {}), ('N', 5.6, 6.4, 'win', 2, dict(small=True)),
                         ('W', 2.5, 4.1, 'win', 1, {}), ('W', 5.6, 7.2, 'win', 1, dict(shutter=True)),
                         ('W', 1.4, 3.0, 'win', 2, dict(lit=True)), ('W', 6.0, 7.6, 'win', 2, {})],
                    balcony=('S', 0.3, 8.3, 1.0), balcony2=('S', 5.0, 8.3, 0.8),
                    ac=[('W', 6.5, 0.0), ('S', 4.4, 'b'), ('N', 4.8, 0.0)], ecocute=('N', 6.9), meter=('E', 3.0),
                    downpipes=[('S', 0.12), ('S', 8.48), ('N', 0.12)], vents=[('E', 1.6, 2.6), ('N', 5.9, 2.5)],
                    site=dict(parking=(-4.3, -0.9, -6.0, -3.0), gate=(4.4, -5.8), wall=True, fence=('E',)),
                    dress=dict(laundry=True, futon=False, name='NAME2', pots=True)),
    # 2F, slate gable with solar panels, tile siding below, white above; four-post carport right
    'House_E': dict(W=8.0, D=9.0, Lb=4.9, Bb=6.6, cx=-1.0, cy=0.35, H=[2.9, 2.75],
                    walls=['SIDING_TILE', 'SIDING_LINES'], band='ALU',
                    roof=dict(kind='gable', slope=0.45, eave=0.55, oh=0.45, solar=(-2.0, 2.0)),
                    ops=[('S', 3.6, 4.5, 'door', 0, dict(leaf='WOOD_FLAT')), ('S', 0.5, 3.0, 'sweep', 0, dict(shutter=True)),
                         ('S', 0.6, 2.2, 'win', 1, dict(shutter=True, lit=True)), ('S', 3.2, 4.2, 'win', 1, dict(small=True)),
                         ('E', 1.0, 1.6, 'win', 0, dict(small=True, grille=True)), ('E', 3.0, 4.6, 'win', 0, dict(shutter=True)),
                         ('E', 1.4, 3.0, 'win', 1, dict(shutter=True)), ('E', 4.6, 5.4, 'win', 1, dict(small=True)),
                         ('N', 1.2, 2.8, 'win', 0, {}), ('N', 3.4, 4.2, 'kdoor', 0, {}), ('N', 1.6, 3.8, 'win', 1, {}),
                         ('W', 1.6, 3.2, 'win', 0, dict(lit=True)), ('W', 4.6, 5.4, 'win', 1, dict(small=True)), ('W', 1.8, 3.4, 'win', 1, {})],
                    balcony=('E', 1.0, 3.6, 0.9), ac=[('W', 4.0, 0.0), ('E', 5.6, 0.0)], ecocute=('N', 0.5), meter=('W', 0.6),
                    downpipes=[('S', 0.12), ('N', 4.78)], vents=[('E', 1.3, 2.5)],
                    site=dict(carport=(1.65, 3.95, -4.4, 1.2, 'both'), gate=(-2.4, -4.35), wall=True, fence=('W',)),
                    dress=dict(laundry=True, futon=True, name='NAME1', pots=True)),
    # 2F, tall mono-pitch facing the street (high side front), white lap siding, wood accent bay; carport left
    'House_F': dict(W=8.5, D=9.0, Lb=5.2, Bb=6.4, cx=0.95, cy=0.1, H=[2.9, 2.8],
                    walls=['SIDING_LINES', 'SIDING_LINES'], band='PANEL_DARK', accent=('S', 3.4, 5.0, 'SIDING_WOOD'),
                    roof=dict(kind='shed', slope=0.2, eave=0.45, oh=0.4, high='S'),
                    ops=[('S', 0.4, 1.3, 'door', 0, dict(leaf='PANEL_DARK', canopy=1.2)), ('S', 1.8, 3.2, 'win', 0, dict(lit=True)),
                         ('S', 3.7, 4.8, 'win', 0, dict(shutter=True)), ('S', 0.6, 0.95, 'slit', 1, {}), ('S', 1.5, 3.1, 'win', 1, dict(wide=True)),
                         ('S', 3.8, 4.7, 'win', 1, dict(lit=True)),
                         ('E', 1.2, 2.8, 'win', 0, {}), ('E', 4.2, 4.8, 'win', 0, dict(small=True, grille=True)), ('E', 2.0, 3.6, 'win', 1, {}),
                         ('N', 1.0, 3.6, 'sweep', 0, dict(shutter=True)), ('N', 1.0, 2.6, 'win', 1, {}), ('N', 3.6, 4.4, 'win', 1, dict(small=True)),
                         ('W', 1.6, 3.2, 'win', 0, dict(shutter=True)), ('W', 3.4, 5.0, 'win', 1, dict(shutter=True))],
                    balcony=('N', 0.8, 3.8, 0.9), ac=[('E', 3.8, 0.0), ('N', 4.6, 'b')], ecocute=('E', 5.6), meter=('W', 5.6),
                    downpipes=[('N', 0.12), ('N', 5.08)], vents=[('E', 4.5, 2.4)],
                    site=dict(carport=(-4.1, -1.85, -4.4, 1.5, 'left'), gate=(0.0, -4.35), wall=True, fence=('E',)),
                    dress=dict(laundry=True, futon=False, name='NAME0', pots=True)),
}


def _bframe(Lb, Bb, e, cx, cy):
    f = edge_frame(Lb, Bb, e)
    f.o = f.o + Vector((cx, cy, 0))
    return f


def _hz(spec, st):
    P = spec.get('P', P_FOUND)
    return P + sum(spec['H'][:st])


def _house_op(spec, kind, st, opt):
    z = _hz(spec, st)
    if kind in ('door', 'kdoor'):
        return z, z + 2.1 + 0.1 * (kind == 'door')
    if kind == 'garage':
        return 0.03, 2.4
    if kind == 'sweep':
        return z + 0.08, z + 2.05
    if kind == 'slit':
        return z + 0.3, z + 2.05
    if opt.get('small'):
        return z + 1.25, z + 1.85
    return z + 0.85, z + 2.0


def _house_body(c, spec, lod):
    """Body built round the origin (walls, roof); returns slots and heights."""
    Lb, Bb = spec['Lb'], spec['Bb']
    P = spec.get('P', P_FOUND)
    H = spec['H']
    zs = [P + sum(H[:k]) for k in range(len(H) + 1)]
    z_top = zs[-1]
    holes = {s: [] for s in SIDES}
    slots = []
    for side, u0, u1, kind, st, opt in spec['ops']:
        z0, z1 = _house_op(spec, kind, st, opt)
        f = edge_frame(Lb, Bb, SIDES[side])
        if kind == 'door':
            sl = MK.entry_door(c, f, u0, u1, z0, z1, 0.0, opt)
        elif kind == 'kdoor':      # kitchen back door (katte-guchi): aluminium, small canopy, a step
            sl = M.alu_door(c, f, u0, u1, z0, z1, 0.0, dict(canopy=0.6, frame='ALU'))
        elif kind == 'garage':
            sl = M.shutter(c, f, u0, u1, z0, z1, 0.0, dict(open=0.0, depth=0.3))
        else:
            o = dict(frame='ALU_DARK' if spec['walls'][st] != 'SIDING_LINES' else 'ALU', lit=opt.get('lit'), grille=opt.get('grille'))
            sl = M.alu_window(c, f, u0, u1, z0, z1, 0.0, o)
            if opt.get('shutter'):
                MK.shutter_box(c, f, u0, u1, z1, 0.0, reg='ALU_DARK' if spec['walls'][st] != 'SIDING_LINES' else 'PAINT_WHITE')
        sl = dict(sl, f=F(f.o, f.n, u0, u1, z0, z1), side=side, lit=opt.get('lit'))
        slots.append(sl)
        holes[side].append((u0, u1, z0, z1))
    r = spec['roof']
    tops = {}
    if r['kind'] == 'gable':
        ridge, top = MK.slate_roof(c, Lb, Bb, z_top, slope=r['slope'], eave=r['eave'], oh=r['oh'], solar=r.get('solar'))
        tops = {1: top, 3: top}
        hi_wall = {}
    elif r['kind'] == 'shed':
        ridge, z_hw, top_for = MK.shed_roof(c, Lb, Bb, z_top, slope=r['slope'], eave=r['eave'], oh=r['oh'], high=r['high'])
        tops = {1: top_for(1), 3: top_for(3)}
        hi_wall = {2 if r['high'] == 'N' else 0: z_hw}
    else:
        ridge = MK.flat_roof(c, Lb, Bb, z_top, parapet=r['parapet'])
        hi_wall = {e: z_top + r['parapet'] for e in range(4)}
    acc = spec.get('accent')
    for side, e in SIDES.items():
        f = edge_frame(Lb, Bb, e)
        Lw = (Lb, Bb, Lb, Bb)[e]
        hs = holes[side]
        M.plinth(c, f, 0.0, Lw, P, hs, vents=True) if P > 0.25 else wall(c, f, 0.0, Lw, 0.0, P, 'CONC_FLAT', hs, d=-0.02)
        for k, (za, zb) in enumerate(zip(zs, zs[1:])):
            reg = spec['walls'][k]
            if acc and acc[0] == side:
                a0, a1, areg = acc[1], acc[2], acc[3]
                wall(c, f, 0.0, a0, za, zb, reg, hs); wall(c, f, a1, Lw, za, zb, reg, hs)
                wall(c, f, a0, a1, za, zb, areg, hs, d=0.06)
                for u in (a0, a1):
                    c.box(f, u - 0.03, u + 0.03, za, zb, 0.0, 0.07, 'PANEL_DARK', skip=('in', 'top', 'bot'))
            else:
                wall(c, f, 0.0, Lw, za, zb, reg, hs)
            if k:
                M.band(c, f, 0.0, Lw, za, spec['band'], hs, d=0.04, h=0.1)
        if e in tops:
            wall(c, f, 0.0, Lw, z_top, 0.0, spec['walls'][-1], top=tops[e])
        elif e in hi_wall:
            wall(c, f, 0.0, Lw, z_top, hi_wall[e], spec['walls'][-1])
    for k, (za, zb) in enumerate(zip(zs, zs[1:])):
        reg = spec['walls'][k]
        M.corner_trims(c, Lb, Bb, za, zb, reg + '_FLAT' if not reg.endswith('_FLAT') else reg, d=0.03, w=0.08)
    if 'balcony' in spec:
        side, u0, u1, depth = spec['balcony']
        MK.box_balcony(c, edge_frame(Lb, Bb, SIDES[side]), u0, u1, zs[1], depth, spec['walls'][1])
    if 'balcony2' in spec:
        side, u0, u1, depth = spec['balcony2']
        MK.box_balcony(c, edge_frame(Lb, Bb, SIDES[side]), u0, u1, zs[2], depth, spec['walls'][2])
    for side, u, z in spec.get('ac', []):
        f = edge_frame(Lb, Bb, SIDES[side])
        if z == 'b':
            M.ac_unit(c, f, u, zs[1], 0.15)
        elif z == 'u':
            M.ac_unit(c, f, u, zs[1] + 0.3, 0.0)
        else:
            M.ac_unit(c, f, u, 0.0, 0.3)
    if 'ecocute' in spec:
        side, u = spec['ecocute']
        MK.ecocute(c, edge_frame(Lb, Bb, SIDES[side]), u)
    if 'meter' in spec and lod == 0:
        side, u = spec['meter']
        MK.meter_box(c, edge_frame(Lb, Bb, SIDES[side]), u)
    for side, u in spec.get('downpipes', []):
        M.downpipe(c, edge_frame(Lb, Bb, SIDES[side]), u, 0.0, z_top, d=0.1)
    for side, u, z in spec.get('vents', []) if lod == 0 else ():
        MK.vent_hood(c, edge_frame(Lb, Bb, SIDES[side]), u, z)
    return slots, dict(z_top=z_top, ridge=ridge, zs=zs)


def _house_site(c, spec, lod):
    W, D = spec['W'], spec['D']
    X, Y = W / 2, D / 2
    st = spec['site']
    if 'carport' in st:
        x0, x1, y0, y1, posts = st['carport']
        MK.driveway(c, x0, x1, -Y, y1)
        MK.carport(c, x0, x1, y0, y1, posts=posts)
    if 'parking' in st:
        x0, x1, y0, y1 = st['parking']
        MK.driveway(c, x0, x1, -Y, spec['cy'] - spec['Bb'] / 2, slit=False)
    gx, gy = st['gate']
    # path from the gate to the door: stepping tiles
    door = next(o for o in spec['ops'] if o[3] == 'door')
    fd = _bframe(spec['Lb'], spec['Bb'], SIDES[door[0]], spec['cx'], spec['cy'])
    pd = fd(0.5 * (door[1] + door[2]), 0.0, 1.0)
    n = 4 if lod == 0 else 1
    for k in range(n):
        t = (k + 0.5) / n
        x, y = gx + (pd.x - gx) * t, gy + 0.3 + (pd.y - gy - 0.3) * t
        gbox(c, x - 0.45, x + 0.45, y - 0.3, y + 0.3, 0.0, 0.04, 'TILE_PORCH', skip=('bot',))
    if 'lawn' in st:
        x0, x1, y0, y1 = st['lawn']
        floor(c, x0, x1, y0, y1, 0.02, 'LAWN')
    if st.get('wall'):     # front block wall with the gaps for the drive and the gate
        gaps = [(gx - 0.6, gx + 0.6)]
        if 'carport' in st:
            gaps.append((st['carport'][0], st['carport'][1]))
        if 'parking' in st:
            gaps.append((st['parking'][0], st['parking'][1]))
        fF = F(Vector((0, -Y + 0.06, 0)), (0, -1))
        xs = sorted({-X, X} | {g for gp in gaps for g in gp})
        for a, b in zip(xs, xs[1:]):
            m = 0.5 * (a + b)
            if any(g0 - 1e-3 <= m <= g1 + 1e-3 for g0, g1 in gaps):
                continue
            MK.block_wall(c, fF, a, b, h=0.6, louvre=0.0)
        MK.gate_post(c, fF, gx - 0.75, 0.0)
    for side in st.get('fence', ()):   # louvre fence on a block base along the side, front to back
        sg = -1 if side == 'W' else 1
        f = F(Vector((sg * (X - 0.08), 0, 0)), (sg, 0))
        ua, ub = sorted((sg * -Y + sg * 0.15, sg * Y))
        MK.block_wall(c, f, ua, ub, h=0.4, louvre=0.8 if lod == 0 else 0.8)


def _house(spec, lod):
    c = KK.C('Machi', lod); c.glass = False
    slots, info = _house_body(c, spec, lod)
    bmesh.ops.translate(c.bm, verts=list(c.bm.verts), vec=(spec['cx'], spec['cy'], 0.0))
    _house_site(c, spec, lod)
    return c, slots, info


def _house_dress(spec, slots, info, lod):
    c = KK.C('MachiShop', lod)
    Lb, Bb, cx, cy = spec['Lb'], spec['Bb'], spec['cx'], spec['cy']
    dr = spec['dress']
    zs = info['zs']
    if 'balcony' in spec and dr.get('laundry') and dr.get('laundry_on') != 'ground':
        side, u0, u1, depth = spec['balcony']
        f = _bframe(Lb, Bb, SIDES[side], cx, cy)
        MK.laundry(c, f, u0 + 0.35, u1 - 0.35, zs[1] + 1.76, depth * 0.7, seed=len(spec['ops']))
        if dr.get('futon'):
            MK.futon(c, f, u0 + 0.3, u0 + 1.3, zs[1] + 1.15, depth - 0.12, depth)
    if dr.get('laundry_on') == 'ground':   # stand with laundry poles in the garden
        f = _bframe(Lb, Bb, 0, cx, cy)
        for u in (2.6, 5.4):
            c.tube([f(u, 0.0, 1.0), f(u, 1.8, 1.0)], 0.02, 4, 'STEEL')
        c.tube([f(2.5, 1.75, 1.0), f(5.5, 1.75, 1.0)], 0.018, 4, 'STEEL')
        MK.laundry(c, f, 2.7, 5.3, 1.75, 1.0, seed=3)
    # gate post faces: nameplate, intercom, mailbox
    gx, gy = spec['site']['gate']
    W, D = spec['W'], spec['D']
    fF = F(Vector((0, -D / 2 + 0.02, 0)), (0, -1))
    u = gx - 0.75
    for z0, z1, img, w in ((1.08, 1.2, dr['name'], 0.2), (0.82, 0.98, 'INTERCOM', 0.08), (0.35, 0.6, 'MAILBOX', 0.2)):
        b = c.box(fF, u - w / 2, u + w / 2, z0, z1, 0.0, 0.01, None, skip=('in',))
        c.m([b['out']], img); c.m([x for k, x in b.items() if k != 'out'], 'BLACK')
    if dr.get('pots'):
        door = next(o for o in spec['ops'] if o[3] == 'door')
        f = _bframe(Lb, Bb, SIDES[door[0]], cx, cy)
        KK.pots(c, f, door[2] + 0.5, door[2] + 1.3, 0.35, seed=len(spec['ops']) + 1)
    if lod == 0 and 'carport' not in spec['site'] and 'parking' not in spec['site']:
        pass
    return c


def build_house(key, spec, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Machi')
    smat = K.atlas_material('MachiShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, slots, info = _house(spec, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _house_dress(spec, slots, info, lod)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    Lb, Bb, cx, cy = spec['Lb'], spec['Bb'], spec['cx'], spec['cy']
    K.collider_box(f'COL_{name}_Body', col, cx - Lb / 2, cx + Lb / 2, cy - Bb / 2, cy + Bb / 2, 0.0, info['ridge'])
    if 'carport' in spec['site']:
        x0, x1, y0, y1, _ = spec['site']['carport']
        for x in (x0 + 0.06, x1 - 0.06):
            K.collider_box(f'COL_{name}_Post{len(col.objects)}', col, x - 0.06, x + 0.06, y0 + 0.24, y0 + 0.36, 0.0, 2.4)
    i = 0
    for s in slots:
        if s.get('lit'):
            f = s['f']
            p = Vector((cx, cy, 0)) + f(f.uc, (f.z0 + f.z1) / 2, 0.4)
            K.light_marker(f'LIGHT_{name}_Win{i}', col, tuple(p), color=(1.0, 0.8, 0.6), watts=10, unity_range=3.5)
            i += 1
    gx, gy = spec['site']['gate']
    K.light_marker(f'LIGHT_{name}_Gate', col, (gx - 0.75, -spec['D'] / 2 - 0.2, 1.5), color=(1.0, 0.8, 0.55), watts=6, unity_range=3.0)
    # the place gives a parcel W x D: eaves, units on the walls and the gate post must stay inside it
    vs = [v.co for ob in (objs[0], shop[0]) for v in ob.data.vertices]
    over = max(max(-v.x - spec['W'] / 2 for v in vs), max(v.x - spec['W'] / 2 for v in vs),
               max(-v.y - spec['D'] / 2 for v in vs), max(v.y - spec['D'] / 2 for v in vs))
    if over > 0.1:
        K.STRETCH.append(('PARCEL ' + key, round(over, 2), (0, 0, 0)))
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(info['ridge'], 2))
    return col, objs


# ── izakaya of the yokochō alleys ───────────────────────────────────────────
# Narrow two-storey wooden bars side by side (Omoide Yokochō / Nonbei Yokochō):
# open front or wooden glass doors, tin awning, red lanterns, noren, a lit
# signboard, a blade sign upstairs, tin-clad upper floor with an AC unit,
# false front hiding a tin roof sloping back, the cable mess across the
# fronts (cables run 5 cm past both sides, so a row reads as one tangle).
# Structure: atlas Minato (boards, corrugated iron); dressing: MachiShop.

IZAKAYA = {
    'Izakaya_A': dict(L=3.0, ground='WOOD_TATE', upper='TOTAN_RUST', front='open', opening=(0.35, 2.65), int='INT_IZA_A',
                      kb='KB0', kv='KV0', ch='CH0', noren='NOREN0', awning='TOTAN_RED', win=(0.8, 2.2), lit=True, seed=1),
    'Izakaya_B': dict(L=3.6, ground='WOOD_BOARD', upper='WOOD_BOARD', front='doors', opening=(0.5, 2.9), int='INT_IZA_B',
                      kb='KB1', kv='KV1', ch='CH1', noren='NOREN1', awning='TOTAN_GREY', win=(0.9, 2.7), lit=False, seed=2),
    'Izakaya_C': dict(L=4.2, ground='WOOD_TATE', upper='TOTAN_BLUE', front='open', opening=(0.4, 3.0), int='INT_IZA_C',
                      kb='KB2', kv='KV2', ch='CH0', noren='NOREN2', awning='TOTAN_RUST', win=(1.0, 3.2), lit=True, seed=3, side_door=(3.25, 3.95)),
    'Izakaya_D': dict(L=4.8, ground='WOOD_BOARD', upper='TOTAN_GREY', front='doors', opening=(0.6, 3.4), int='INT_IZA_D',
                      kb='KB3', kv='KV3', ch='CH2', noren='NOREN3', awning='TOTAN_BLUE', win=(0.7, 2.3), win2=(2.9, 4.1), lit=True,
                      seed=4, kb2='KB4', string=True),
    'Izakaya_E': dict(L=3.3, ground='WOOD_TATE', upper='TOTAN_RED', front='bar', opening=(0.3, 3.0), int='INT_IZA_C',
                      kb='KB5', kv=None, ch='CH3', noren='NOREN4', awning='TOTAN_GREY', win=(0.8, 2.4), lit=False, seed=5),
}
IZ = dict(B=6.0, G=2.6, U=2.35, par=1.0, P=0.15)


def _dout(reg):
    return 0.042 if reg.startswith('TOTAN') else 0.0


def _izakaya(spec, lod):
    c = KK.C('Minato', lod); c.glass = False
    L, B, G, U, par, P = spec['L'], IZ['B'], IZ['G'], IZ['U'], IZ['par'], IZ['P']
    zt = G + U
    o0, o1 = spec['opening']
    holes = {'S': [(o0, o1, P, 2.3 if spec['front'] != 'bar' else 2.2)], 'E': [], 'N': [(0.6, 1.4, P, 2.0), (2.0, 2.8, 1.0, 1.7)], 'W': []}
    w0, w1 = spec['win']
    holes['S'].append((w0, w1, G + 0.75, G + 1.85))
    if spec.get('win2'):
        holes['S'].append((spec['win2'][0], spec['win2'][1], G + 0.75, G + 1.85))
    if spec.get('side_door'):
        holes['S'].append((spec['side_door'][0], spec['side_door'][1], P, 2.2))
    fS, fE, fN, fW = (edge_frame(L, B, e) for e in range(4))
    slots = []
    # ground floor front
    if spec['front'] in ('open', 'bar'):
        sl = M.open_bay(c, fS, o0, o1, P, holes['S'][0][3], _dout(spec['ground']),
                        dict(depth=1.6 if spec['front'] == 'open' else 1.0, doors=spec['front'] == 'open', reveal='WOOD_FLAT'))
        if spec['front'] == 'bar':      # standing-bar ledge across the opening (tachinomi)
            c.box(fS, o0, o1, 1.0, 1.06, -0.1, 0.32, 'WOOD', skip=(), bevel=True)
            c.box(fS, o0, o1, P, 1.0, -0.12, -0.08, 'WOOD_TATE_FLAT', skip=('in',))
    else:
        sl = M.wood_door(c, fS, o0, o1, P, 2.3, 0.0, dict(lit=True))
        sl['f'] = F(fS.o, fS.n, o0, o1, P, 2.3)
    slots.append(dict(sl, f=sl.get('f') or F(fS.o, fS.n, o0, o1, P, 2.3), side='S', img=spec['int']))
    if spec.get('side_door'):
        a, b = spec['side_door']
        M.wood_door(c, fS, a, b, P, 2.2, 0.0, dict(lit=False))
    for (a, b) in [spec['win']] + ([spec['win2']] if spec.get('win2') else []):
        M.alu_window(c, fS, a, b, G + 0.75, G + 1.85, _dout(spec['upper']),
                     dict(lit=spec['lit'], grille=a < 1.0, trim=M.flat(spec['upper']) if spec['upper'].startswith('TOTAN') else 'WOOD',
                          frame='ALU_DARK'))
    # back: door, small window
    M.wood_door(c, fN, 0.6, 1.4, P, 2.0, 0.0, dict(lit=False))
    M.alu_window(c, fN, 2.0, 2.8, 1.0, 1.7, 0.0, dict(grille=True, lit=True, frame='ALU'))
    # walls: boards / tin below, tin or boards above; party walls of tin
    z_front = zt + 0.45
    slope = 0.08
    WL = B / 2 + 0.02
    z_lo = z_front - 2 * WL * slope
    ridge, z_hw, top_for = MK.shed_roof(c, L, B, z_lo, slope=slope, eave=0.3, oh=0.03, reg='TOTAN_GREY', high='S', fascia='WOOD_FLAT',
                                        trim='TOTAN_GREY_FLAT', hi_over=-0.04)
    for side, e in SIDES.items():
        f = edge_frame(L, B, e)
        Lw = (L, B, L, B)[e]
        hs = holes[side]
        M.plinth(c, f, 0.0, Lw, P, hs, vents=False)
        greg = spec['ground'] if side == 'S' else 'TOTAN_GREY'
        ureg = spec['upper'] if side == 'S' else 'TOTAN_RUST'
        M.wall(c, f, 0.0, Lw, P, G, greg, hs)
        M.band(c, f, 0.0, Lw, G, 'WOOD' if not ureg.startswith('TOTAN') else M.flat(ureg), hs, d=_dout(ureg) + 0.03)
        M.wall(c, f, 0.0, Lw, G, zt, ureg, hs)
        if e == 0:      # false front above the roof edge, with a cap
            M.wall(c, f, 0.0, Lw, zt, zt + par, ureg)
            c.box(f, -0.02, Lw + 0.02, zt + par, zt + par + 0.06, -0.1, 0.08, 'WOOD', skip=())
        elif e == 2:
            M.wall(c, f, 0.0, Lw, zt, z_lo, 'TOTAN_RUST') if z_lo > zt + 0.05 else None
        else:
            MK.wall(c, f, 0.0, Lw, zt, 0.0, 'TOTAN_RUST', top=top_for(e))
    M.corner_trims(c, L, B, P, zt, 'WOOD', d=0.06, w=0.07)
    # tin awning over the front, on brackets
    M.lean_to(c, fS, -0.02, L + 0.02, 2.75, 0.85, slope=0.25, reg=spec['awning'], posts=False, eave=0.1)
    if lod == 0:
        for u in (0.1, L - 0.1):
            c.tube([fS(u, 2.45, 0.02), fS(u, 2.62, 0.8)], 0.015, 3, 'IRON')
    M.ac_unit(c, fS, L - 0.55, G + 0.35, 0.05) if L > 3.2 else M.ac_unit(c, fN, 2.4, G + 0.4, 0.0)
    M.downpipe(c, fN, 0.12, 0.0, z_lo, d=0.1)
    return c, slots, dict(ridge=zt + par + 0.06, zt=zt)


def _izakaya_dress(spec, slots, lod):
    c = KK.C('MachiShop', lod)
    L, B, G, U, P = spec['L'], IZ['B'], IZ['G'], IZ['U'], IZ['P']
    zt = G + U
    fS, fE, fN, fW = (edge_frame(L, B, e) for e in range(4))
    rr = random.Random(spec['seed'])
    for s in slots:
        if s.get('img') and spec['front'] in ('open', 'bar'):
            KK.interior(c, s, s['img'])
    if spec['front'] == 'doors':     # the picture behind the glass doors
        o0, o1 = spec['opening']
        KK.interior(c, dict(f=F(fS.o, fS.n, o0, o1, P, 2.3), depth=0.6), spec['int'])
    o0, o1 = spec['opening']
    # signboard on the false front / over the awning, a second one on wide fronts
    KK.board(c, fS, L / 2, min(L - 0.3, 2.6), 0.62, zt + 0.15, 0.12, spec['kb'], cap=False)
    if spec.get('kb2'):
        KK.board(c, fS, L / 2, 2.4, 0.56, 2.86, 0.95, spec['kb2'], cap=False)
    KK.noren(c, fS, o0 + 0.1, min(o1 - 0.1, o0 + 2.0), 2.28, 0.04, spec['noren'], length=0.7)
    # red lanterns: one or two big ones by the door, a string on wide fronts
    KK.chochin(c, fS, o0 - 0.05 if o0 > 0.3 else 0.2, 1.75, 0.55, spec['ch'], r=0.24, h=0.62, hang=0.35)
    if L >= 3.6:
        KK.chochin(c, fS, L - 0.35, 1.75, 0.55, spec['ch'], r=0.24, h=0.62, hang=0.35)
    if spec.get('string'):
        MK.lantern_string(c, fS, 0.2, L - 0.2, 2.62, 0.82, n=6, img='CH3')
    if spec.get('kv'):
        MK.blade_sign(c, fS, L - 0.08, G + 0.3, G + 2.1, spec['kv'], w=0.45)
    # cable tangle across the upper front, a meter box
    MK.cables(c, fS, 0.0, L, zt - 0.25, 0.25, n=4, seed=spec['seed'])
    # street side: crates, stools, menu, poster, a plant
    MK.crate_stack(c, fS, 0.25 if o0 > 0.3 else L - 0.3, 0.35, n=2 + spec['seed'] % 3, seed=spec['seed'])
    if spec['front'] == 'bar':
        for u in (0.9, 1.7, 2.5):
            MK.crate_stack(c, fS, u, 0.6, n=1, seed=int(u * 10))
    else:
        MK.stool(c, fS, o1 - 0.3, 0.55)
    KK.menu_stand(c, fS, min(L - 0.4, o1 + 0.2), 0.75) if L >= 3.6 else None
    if lod == 0:
        b = c.box(fW, 0.4, 0.95, 1.0, 1.8, 0.04, 0.05, None, skip=('in',))
        c.m([b['out']], 'POSTER'); c.m([x for k, x in b.items() if k != 'out'], 'WHITE')
        KK.pots(c, fS, L - 0.5, L - 0.1, 0.25, seed=spec['seed'])
    # back: kitchen exhaust duct up to the roof, crates, a gas meter
    MK.duct(c, fN, 2.4 if L > 3.2 else 1.8, 1.9, zt + 0.7, d=0.22)
    MK.crate_stack(c, fN, L - 0.4, 0.3, n=3, seed=spec['seed'] + 7)
    c.box(fN, 1.6, 1.85, 1.2, 1.5, 0.0, 0.14, 'BOX_GREY', bevel=True)
    return c


def build_izakaya(key, spec, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Minato')
    smat = K.atlas_material('MachiShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, slots, info = _izakaya(spec, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _izakaya_dress(spec, slots, lod)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    L, B = spec['L'], IZ['B']
    K.collider_box(f'COL_{name}', col, -L / 2, L / 2, -B / 2, B / 2, 0.0, info['ridge'])
    fS = edge_frame(L, B, 0)
    o0, o1 = spec['opening']
    K.light_marker(f'LIGHT_{name}_Shop', col, tuple(fS((o0 + o1) / 2, 1.8, 0.6)), color=(1.0, 0.68, 0.4), watts=30, unity_range=5.0)
    K.light_marker(f'LIGHT_{name}_Lantern', col, tuple(fS(o0, 1.9, 0.8)), color=(1.0, 0.35, 0.2), watts=15, unity_range=3.5)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(info['ridge'], 2))
    return col, objs


def build():
    out = [build_dealer(), build_workshop()]
    out += [build_house(k, v) for k, v in HOUSES.items()]
    out += [build_izakaya(k, v) for k, v in IZAKAYA.items()]
    print('dressing:', {c.name: list(c['shop_tris']) for c, _ in out if 'shop_tris' in c})
    return out
