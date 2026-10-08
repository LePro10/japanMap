"""Tokyo street buildings - pilot of the Tokyo kit (task 3).

Three complete buildings from the same kit (buildings/tokyo_kit.py) plus the
signs as their own assets, so Phase 5 can hang them on any facade:
- Konbini_3F: corner building, konbini on the ground floor (glass front
  round the corner, lit fascia, automatic door), English school and a
  kissaten above, AC units, water tank and stair house on the roof.
- Zakkyo_5F: narrow 'pencil' tenant building: izakaya with noren and red
  lanterns, stair door, salon / office / bar floors, vertical tenant sign
  stack, neon sign, rooftop billboard.
- Mansion_4F: small apartment block: balconies with frosted panels and
  fire-escape partitions, AC units, laundry poles; open access corridor and
  galvanised switch-back stair at the back; old TV antenna on the roof.
Signs: Sign_Tate_A / _B, Sign_Neon_Snack, Sign_Kissa (origin = wall mount).

Front looks to -Y, origin at the ground in the middle of the footprint.
Storeys: shop 3.6-4.0 m, flats 2.9-3.0 m (Tokyo small buildings).
Texts and brands are fictional.
"""
from mathutils import Vector
from kit import core as K
from buildings import tokyo_kit as T
from buildings.tokyo_kit import F, m

KLASS = 'buildings'
NAME = 'Tokyo'
ATLAS = 'Tokyo'
FRONT = F((0, 0, 0), (0, -1, 0))     # world frame facing -Y (u = x, d = -y)


def _open(sh, ops, lod):
    """Fill the opening cells with their modules."""
    for op in ops:
        face = sh.cell(op['e'], op['u'], op['fl'], T.ROWS[op['rows']])
        ctx = dict(lod=lod, reveal=T.FLAT[sh.walls[op['e']]])
        T.MODULES[op['kind']](sh.bm, face, ctx, **op.get('opt', {}))


def op(e, u0, u1, fl, kind, rows, **opt):
    return dict(e=e, u=(u0, u1), fl=fl, kind=kind, rows=rows, opt=opt)


# ── Konbini_3F ──────────────────────────────────────────────────────────────

KONBINI = dict(W=10.8, D=12.0, floors=[('shop', 4.0), ('res', 3.0), ('res', 3.0)],
               walls=['TILE_BEIGE', 'ALC_WHITE', 'ALC_WHITE', 'ALC_WHITE'])


def _konbini(lod):
    s = KONBINI
    bm = K.new_bm()
    ops = [op(0, 1.0, 2.2, 0, 'entrance', 'shop_low', canopy=True, mailbox=True),
           op(0, 3.85, 10.6, 0, 'storefront', 'shop', panels=['A', 'B', 'door', 'door2', 'A', 'B']),
           op(1, 0.25, 3.35, 0, 'storefront', 'shop', panels=['B', 'A', 'B']),
           op(0, 0.9, 2.7, 1, 'window', 'window', glass='WIN_CURTAIN'),
           op(0, 4.0, 10.4, 1, 'window', 'window', glass='SCHOOL', mull=3),
           op(0, 0.9, 2.7, 2, 'window', 'window', glass='WIN_DARK', ac=True),
           op(0, 4.5, 6.3, 2, 'window', 'window', glass='WIN_CURTAIN', mirror=True, ac=True),
           op(0, 8.1, 9.9, 2, 'window', 'window', glass='WIN_BLIND'),
           op(1, 5.0, 6.6, 1, 'window', 'window', glass='WIN_BLIND'),
           op(1, 9.0, 10.6, 1, 'window', 'window', glass='WIN_DARK'),
           op(1, 5.0, 6.6, 2, 'window', 'window', glass='WIN_CURTAIN', ac=True),
           op(1, 9.0, 10.6, 2, 'window', 'window', glass='WIN_DARK', mirror=True),
           op(2, 1.5, 2.4, 0, 'steel_door', 'shop_low'),
           op(2, 5.0, 6.4, 0, 'window', 'shop_mid', glass='FROSTED', grille=True, sill=False),
           op(2, 2.0, 3.6, 1, 'window', 'window', glass='WIN_DARK', ac=True),
           op(2, 6.5, 8.1, 1, 'window', 'window', glass='WIN_BLIND'),
           op(2, 2.0, 3.6, 2, 'window', 'window', glass='WIN_CURTAIN'),
           op(2, 6.5, 8.1, 2, 'window', 'window', glass='WIN_DARK', ac=True),
           op(3, 4.0, 4.9, 1, 'window', 'window', glass='FROSTED', grille=True),
           op(3, 4.0, 4.9, 2, 'window', 'window', glass='LIT_WARM', grille=True)]
    sh = T.Shell(bm, s['W'], s['D'], s['floors'], s['walls'], lod, ops)
    _open(sh, ops, lod)
    sh.map_walls()
    W, D, Rf = s['W'], s['D'], sh.roof
    f0, f1, f2, f3 = (sh.frame(e) for e in range(4))
    # lit fascia round the corner
    T.fascia_box(bm, f0, 3.65, W + 0.32, 3.08, 3.85, 0.32, lights=0 if lod else 4)
    T.fascia_box(bm, f1, 0.0, 3.6, 3.08, 3.85, 0.32, ends=(False, True), lights=0 if lod else 2)
    T.disc_sign(bm, f0, 0.45, 5.6, lod)
    T.nobori(bm, f0, 3.4, 0.55, lod, 'NOBORI_A')
    T.nobori(bm, f1, 3.9, 0.55, lod, 'NOBORI_A')
    T.downpipe(bm, f1, D - 0.3, 0.0, Rf + 0.6, lod)
    T.downpipe(bm, f3, 0.3, 0.0, Rf + 0.6, lod)
    if not lod:
        T.meter_box(bm, f1, 7.5, 1.1, lod); T.meter_box(bm, f1, 7.95, 1.1, lod)
        T.meter_box(bm, f2, 3.0, 1.2, lod)
        T.ac_wall(bm, f1, 8.0, 4.4, lod, duct_to=5.2)
        T.ac_wall(bm, f2, 9.8, 0.6, lod, duct_to=1.5)
    # roof plant
    T.penthouse(bm, -W / 2 + 0.3, -W / 2 + 3.1, D / 2 - 2.6, D / 2 - 0.3, Rf + 0.12, 2.6, lod)
    T.water_tank(bm, 1.6, D / 2 - 1.6, Rf + 0.12, 2.0, 1.5, 1.5, lod)
    for x in (-0.2, 1.0, 2.2):
        T.ac_floor(bm, FRONT, x, Rf + 0.12, -1.0, lod)
    return bm


def _konbini_markers(col, name):
    W, D = KONBINI['W'], KONBINI['D']
    K.light_marker(f'LIGHT_{name}_Shop', col, (2.0, -D / 2 - 1.2, 2.6), color=(0.92, 0.96, 1.0), watts=120,
                   unity_range=9.0, unity_intensity=1.2)
    K.light_marker(f'LIGHT_{name}_Side', col, (W / 2 + 1.2, -D / 2 + 1.8, 2.6), color=(0.92, 0.96, 1.0), watts=60,
                   unity_range=7.0)
    K.light_marker(f'LIGHT_{name}_Door', col, (-5.4 + 1.6, -D / 2 - 0.6, 2.5), color=(1.0, 0.75, 0.45), watts=15,
                   unity_range=4.0)
    K.collider_box(f'COL_{name}', col, -W / 2, W / 2, -D / 2, D / 2, 0.0, 10.85)


# ── Zakkyo_5F ───────────────────────────────────────────────────────────────

ZAKKYO = dict(W=5.4, D=10.0, floors=[('shop', 3.6)] + [('res', 3.0)] * 4,
              walls=['TILE_BROWN', 'ALC_WHITE', 'ALC_WHITE', 'ALC_WHITE'])


def _zakkyo(lod):
    s = ZAKKYO
    bm = K.new_bm()
    ops = [op(0, 0.25, 1.15, 0, 'entrance', 'shop_low', canopy=False),
           op(0, 1.45, 5.15, 0, 'izakaya', 'shop'),
           op(0, 0.6, 4.6, 1, 'window', 'window', glass='SALON', mull=2),
           op(0, 0.6, 4.6, 2, 'window', 'window', glass='WIN_BLIND', mull=2),
           op(0, 0.6, 4.6, 3, 'window', 'window', glass='WIN_DARK', mull=2),
           op(0, 0.6, 4.6, 4, 'window', 'window', glass='WIN_CURTAIN', mull=2),
           op(2, 2.0, 2.9, 0, 'steel_door', 'shop_low')]
    for fl in range(1, 5):
        ops.append(op(1, 6.4, 7.3, fl, 'window', 'window', glass='FROSTED' if fl % 2 else 'LIT_WARM', grille=True))
        ops.append(op(2, 1.2, 3.6, fl, 'window', 'window', glass=['WIN_DARK', 'WIN_BLIND', 'WIN_CURTAIN', 'WIN_DARK'][fl - 1]))
    sh = T.Shell(bm, s['W'], s['D'], s['floors'], s['walls'], lod, ops)
    _open(sh, ops, lod)
    sh.map_walls()
    W, D, Rf = s['W'], s['D'], sh.roof
    f0, f1, f2, f3 = (sh.frame(e) for e in range(4))
    T.tate_sign(bm, f0, W - 0.32, 4.4, lod, 'TATE_A')
    T.neon_sign(bm, f0, 0.8, 9.85, lod)
    T.nobori(bm, f0, 4.9, 0.9, lod, 'NOBORI_B')
    T.downpipe(bm, f1, D - 0.3, 0.0, Rf + 0.6, lod)
    if not lod:
        for fl in range(1, 4):
            T.ac_wall(bm, f1, 3.2, 3.6 + 3.0 * (fl - 1) + 0.6, lod, duct_to=3.6 + 3.0 * (fl - 1) + 1.6)
        T.meter_box(bm, f1, 8.2, 1.1, lod)
    T.billboard(bm, 0.0, -D / 2 + 0.5, Rf + 0.12, 4.4, 1.1, lod)
    T.water_tank(bm, 0.9, D / 2 - 1.3, Rf + 0.12, 1.6, 1.2, 1.2, lod)
    T.ac_floor(bm, FRONT, -1.4, Rf + 0.12, 0.5, lod)
    return bm


def _zakkyo_markers(col, name):
    W, D = ZAKKYO['W'], ZAKKYO['D']
    K.light_marker(f'LIGHT_{name}_Lanterns', col, (0.6, -D / 2 - 0.9, 2.4), color=(1.0, 0.45, 0.25), watts=30,
                   unity_range=5.0)
    K.light_marker(f'LIGHT_{name}_Neon', col, (-0.9, -D / 2 - 0.6, 10.2), color=(1.0, 0.3, 0.65), watts=25,
                   unity_range=4.0)
    K.collider_box(f'COL_{name}', col, -W / 2, W / 2, -D / 2, D / 2, 0.0, 16.45)


# ── Mansion_4F ──────────────────────────────────────────────────────────────

MANSION = dict(W=16.2, D=8.4, floors=[('res_ground', 3.0), ('res', 2.9), ('res', 2.9), ('res', 2.9)],
               walls=['TILE_BEIGE', 'ALC_WHITE', 'ALC_WHITE', 'ALC_WHITE'])
BAY = 5.4
GLASS = ['WIN_CURTAIN', 'WIN_DARK', 'WIN_BLIND', 'WIN_DARK', 'WIN_CURTAIN', 'WIN_DARK',
         'WIN_DARK', 'WIN_CURTAIN', 'WIN_DARK', 'WIN_BLIND', 'WIN_DARK', 'WIN_CURTAIN']


def _mansion(lod):
    s = MANSION
    bm = K.new_bm()
    W, D = s['W'], s['D']
    ops = []
    has = lambda fl, i: not (fl == 0 and i == 1)     # ground middle bay = entrance
    for fl in range(4):
        for i in range(3):
            u = BAY * i
            if has(fl, i):
                ops.append(op(0, u + 0.6, u + 3.8, fl, 'window', 'door', glass=GLASS[fl * 3 + i],
                              mirror=(fl + i) % 2 == 1, sill=False))
                ops.append(op(0, u + 4.25, u + 5.0, fl, 'window', 'window', glass='FROSTED', mull=0))
            else:
                ops.append(op(0, u + 1.9, u + 3.5, fl, 'entrance', 'door', canopy=False, mailbox=True,
                              plate='NAMEPLATE'))
            # back: unit doors and kitchen windows off the access corridor
            ub = W - BAY * (i + 1)   # back edge runs from +x to -x
            ops.append(op(2, ub + 3.7, ub + 4.6, fl, 'steel_door', 'door'))
            ops.append(op(2, ub + 1.6, ub + 2.9, fl, 'window', 'window',
                          glass='LIT_WARM' if (fl + i) % 3 == 0 else 'FROSTED', grille=True))
    for fl in range(4):
        ops.append(op(1, 2.0, 3.0, fl, 'window', 'window', glass='FROSTED', grille=True))
        ops.append(op(3, 5.2, 6.2, fl, 'window', 'window', glass='WIN_DARK' if fl % 2 else 'LIT_WARM', grille=True))
    sh = T.Shell(bm, W, D, s['floors'], s['walls'], lod, ops)
    _open(sh, ops, lod)
    sh.map_walls()
    Rf = sh.roof
    fz = sh.floor_z
    f0, f1, f2, f3 = (sh.frame(e) for e in range(4))
    for fl in range(4):
        zf = fz[fl] + (0.25 if fl == 0 else 0.0)
        for i in range(3):
            if not has(fl, i):
                continue
            left_open = i == 0 or not has(fl, i - 1)
            right_open = i == 2 or not has(fl, i + 1)
            T.balcony(bm, f0, BAY * i, BAY * (i + 1), zf, lod, ends=(left_open, right_open),
                      partition=(False, not right_open), ac=(fl + i) % 2 == 0, ceiling=fz[fl + 1] if fl < 3 else Rf,
                      pole=(fl + i) % 3 != 1)
    # eave slab over the top balconies
    ev = T.lbox(bm, f0, 0.0, W, Rf, Rf + 0.25, 0.0, 1.3, skip=('in',))
    m(bm, [ev['top']], 'ROOF_GREEN'); m(bm, [ev['bot']], 'ALC_FLAT')
    m(bm, [ev[k] for k in ('out', 'l', 'r')], 'TILE_FLAT')
    # entrance steps (raised ground floor)
    for k, (d1, z1) in enumerate(((0.9, 0.15), (0.6, 0.3), (0.3, 0.45))):
        st = T.lbox(bm, f0, BAY + 1.6, BAY + 3.8, 0.0 if k == 0 else 0.15 * k, z1, 0.0, d1, skip=('bot', 'in'))
        m(bm, st.values(), 'GRANITE')
    # access corridors and stair at the back
    for fl in (1, 2, 3):
        T.corridor(bm, f2, 0.0, W, fz[fl], lod, end_open=(False, True))
    fs = F((-W / 2, D / 2 + 1.3, 0), (-1, 0, 0))     # on the left wall: u runs to the front (-y)
    T.stair(bm, fs, 1.3, [0.0, fz[1], fz[2], fz[3]], lod, dirn=1)
    T.downpipe(bm, f1, D - 0.3, 0.0, Rf + 0.6, lod)
    T.downpipe(bm, f3, D - 0.3, 0.0, Rf + 0.6, lod)
    T.antenna(bm, W / 2 - 3.0, 0.8, Rf + 0.12, lod)
    if not lod:
        T.meter_box(bm, f1, 6.8, 1.2, lod)
    return bm


def _mansion_markers(col, name):
    W, D = MANSION['W'], MANSION['D']
    K.light_marker(f'LIGHT_{name}_Entrance', col, (-W / 2 + BAY * 1.5, -D / 2 - 0.6, 2.6), color=(1.0, 0.75, 0.45),
                   watts=20, unity_range=5.0)
    for fl, z in enumerate((3.0, 5.9, 8.8)):
        K.light_marker(f'LIGHT_{name}_Corridor{fl + 2}', col, (0.0, D / 2 + 0.6, z + 2.3), color=(0.92, 0.96, 1.0),
                       watts=15, unity_range=6.0, unity_intensity=0.6)
    K.collider_box(f'COL_{name}', col, -W / 2, W / 2, -D / 2, D / 2, 0.0, 12.55)
    K.collider_box(f'COL_{name}_Balconies', col, -W / 2, W / 2, -D / 2 - 1.3, -D / 2, 0.0, 11.95)
    K.collider_box(f'COL_{name}_Back', col, -W / 2 - 2.3, W / 2, D / 2, D / 2 + 1.3, 0.0, 9.9)
    K.collider_box(f'COL_{name}_Stair', col, -W / 2 - 2.3, -W / 2, D / 2 - 4.9, D / 2 + 1.3, 0.0, 9.9)


# ── signs (origin = mount point on the wall, wall plane y = 0) ──────────────

def _sign(kind, lod):
    bm = K.new_bm()
    if kind == 'Tate_A':
        T.tate_sign(bm, FRONT, 0.0, 0.0, lod, 'TATE_A')
    elif kind == 'Tate_B':
        T.tate_sign(bm, FRONT, 0.0, 0.0, lod, 'TATE_B')
    elif kind == 'Neon_Snack':
        T.neon_sign(bm, FRONT, -0.85, 0.0, lod)
    else:
        T.disc_sign(bm, FRONT, 0.0, 0.6, lod)
    return bm


BUILDINGS = {'Konbini_3F': (_konbini, _konbini_markers),
             'Zakkyo_5F': (_zakkyo, _zakkyo_markers),
             'Mansion_4F': (_mansion, _mansion_markers)}
SIGNS = ['Tate_A', 'Tate_B', 'Neon_Snack', 'Kissa']


def build_building(key, lods=(0, 1)):
    geo, markers = BUILDINGS[key]
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', geo(lod), col, [mat], bevel=0.02 if lod == 0 else 0.0,
                          hidden=lod > 0, recalc=False, dissolve=True) for lod in lods]
    markers(col, name)
    return col, objs


def build_sign(kind, lods=(0, 1)):
    name = f'{NAME}_Sign_{kind}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', _sign(kind, lod), col, [mat], bevel=0.006 if lod == 0 else 0.0,
                          hidden=lod > 0, recalc=False) for lod in lods]
    return col, objs


def build():
    return [build_building(k) for k in BUILDINGS] + [build_sign(k) for k in SIGNS]


# street row for the preview: mansion | zakkyo | konbini on the corner,
# fronts on one line (the mansion's balconies on it), signs in front
ROW = {'Tokyo_Mansion_4F': (-8.5, 4.2 + 1.3), 'Tokyo_Zakkyo_5F': (2.7, 5.0), 'Tokyo_Konbini_3F': (10.8, 6.0)}


def preview(results, views):
    from kit import preview as P
    moved = []
    for col, _ in results:
        if col.name in ROW:
            x, y = ROW[col.name]
            for o in col.objects:
                o.location.x += x; o.location.y += y
            moved.append((col, x, y))
    objs = [o[0] for c, o in results if c.name in ROW]
    show = [c.name for c, _ in results if c.name in ROW]
    a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(1024, 560), show=show)
    b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(1024, 560), show=show)
    for col, x, y in moved:
        for o in col.objects:
            o.location.x -= x; o.location.y -= y
    signs = [o[0] for c, o in results if c.name not in ROW]
    d = P.details(signs, NAME + '_Signs', direction=(-1.0, -1.4, 0.3), mood=True, size=(300, 420))
    return f'{a}, {b}, {d}'
