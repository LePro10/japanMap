"""Tokyo centre - the dense stage (Kabukichō-like alley), from the Tokyo kit.

Tall narrow tenant buildings (zakkyo) whose facades are almost covered by
signs: a lightbox per tenant floor, sign towers, projecting boxes, neon,
standing signs on the pavement, video wall, rooftop billboards on lattice
towers. Every building is data (CENTER) plus a seed: facade type per floor,
window colours, sign choice and placement change with the seed, so a street
of them does not repeat.

Each FBX holds the building (SM_<name>_LOD0/1, atlas Tokyo) and its sign
skin (SM_<name>_Signs_LOD0/1, atlas TokyoSigns): Phase 5 can keep, thin out
or swap the skin per street. density < 1 gives quieter side-street versions
of the same buildings (Street_*).
"""
import math
import random
from mathutils import Vector
from kit import core as K
from buildings import tokyo_kit as T
from buildings import tokyo_signs_kit as S
from buildings.tokyo_kit import F, m

KLASS = 'buildings'
NAME = 'Tokyo'
ATLAS = 'Tokyo'
SHOP_H, FLOOR_H = 3.8, 3.2

# name: W, D, floors, front wall, upper style, ground, density, extras, seed
CENTER = {
    'Center_7F_Izakaya': dict(W=6.0, D=12.0, n=7, wall='TILE_BEIGE', style='win', ground='izakaya', density=1.0,
                              bill='BILL_LAGER', towers=2, lanterns=True, seed=1),
    'Center_9F_Karaoke': dict(W=7.5, D=14.0, n=9, wall='ALC_WHITE', style='strip', panel='PANEL_RED', ground='store',
                              density=1.0, bill='BILL_CAMERA', towers=1, bulbs=True, seed=2),
    'Center_6F_Narrow': dict(W=4.5, D=11.0, n=6, wall='ALC_WHITE', style='win', ground='shutter', density=0.9,
                             neon=('ramen', False), towers=1, seed=3),
    'Center_8F_Glass': dict(W=8.0, D=13.0, n=8, wall='PANEL_SILVER', style='glass', panel='GLASS_BLUE', ground='store',
                            density=0.7, screen='VIDEO_A', towers=1, seed=4),
    'Center_6F_Brown': dict(W=5.5, D=11.0, n=6, wall='TILE_BROWN', style='win', ground='izakaya', density=1.0,
                            neon=('bar', True), towers=1, lanterns=True, seed=5),
    'Center_7F_Concrete': dict(W=6.5, D=12.0, n=7, wall='CONCRETE_RAW', style='strip', panel='PANEL_DARK',
                               ground='shutter', density=1.0, bill='BILL_MOBILE', towers=2, bulbs=True, seed=6),
    # quieter side-street versions: same machinery, fewer signs
    'Street_5F_Tile': dict(W=6.0, D=11.0, n=5, wall='TILE_BEIGE', style='win', ground='store', density=0.35,
                           towers=1, seed=11),
    'Street_4F_Teal': dict(W=5.0, D=10.0, n=4, wall='ALC_WHITE', style='strip', panel='PANEL_TEAL',
                           ground='izakaya', density=0.4, neon=('snack', True), towers=0, seed=12),
    'Street_3F_Brown': dict(W=7.0, D=10.0, n=3, wall='TILE_BROWN', style='win', ground='store', density=0.5,
                            towers=0, seed=13),
    'Street_6F_Cream': dict(W=5.5, D=11.0, n=6, wall='PANEL_CREAM', style='strip', panel='PANEL_NAVY',
                            ground='shutter', density=0.3, towers=1, seed=14),
}
GLASS = ['WIN_DARK', 'WIN_BLIND', 'WIN_CURTAIN', 'LIT_WARM', 'LIT_COOL', 'WIN_DARK', 'WIN_BLIND']


def _op(e, u0, u1, fl, kind, rows, **opt):
    return dict(e=e, u=(u0, u1), fl=fl, kind=kind, rows=rows, opt=opt)


def _plan(spec):
    """Decide everything random once (same for LOD0 and LOD1)."""
    r = random.Random(spec['seed'])
    W, D, n = spec['W'], spec['D'], spec['n']
    ops, rows_reg, floors = [], {}, []
    # every front opening shares the column lines 0.25 / 1.1 / 1.4 / W-0.3: each extra
    # line cuts every storey of the sweep (measured: 11 -> 5 columns saves ~650 tris)
    U0 = 0.25
    # ground floor
    g = spec['ground']
    if g == 'izakaya':
        ops += [_op(0, 0.25, 1.1, 0, 'entrance', 'shop_low', canopy=False), _op(0, 1.4, W - 0.3, 0, 'izakaya', 'shop')]
    elif g == 'store':
        k = max(3, round((W - 1.6) / 1.1))
        pan = [r.choice('AB') for _ in range(k)]
        pan[k // 2 - 1:k // 2 + 1] = ['door', 'door2']
        ops += [_op(0, 0.25, 1.1, 0, 'entrance', 'shop_low', canopy=False),
                _op(0, 1.4, W - 0.3, 0, 'storefront', 'shop', panels=pan)]
    else:
        ops += [_op(0, 0.25, 1.1, 0, 'entrance', 'shop_low', canopy=False), _op(0, 1.4, W - 0.3, 0, 'shutter', 'shop_low')]
    # upper floors: style per floor, a few floors break the pattern
    for fl in range(1, n):
        st = spec['style']
        if r.random() < 0.25:
            st = r.choice(['win', 'strip', 'glass'])
        floors.append(st)
        glass = r.choice(GLASS)
        if st == 'win':
            ac = W > 5 and r.random() < 0.5
            ops.append(_op(0, U0, W - 0.3, fl, 'window', 'window', glass=glass, mull=r.choice([1, 2, 3]),
                           mirror=r.random() < 0.5, ac=(-W / 2 + 1.2) if ac else None))
        elif st == 'strip':
            ops.append(_op(0, U0, W - 0.3, fl, 'window', 'window', glass=glass, mull=max(2, int(W / 1.3)), sill=False))
            pc = spec.get('panel', 'PANEL_GREY') if r.random() < 0.8 else r.choice(['PANEL_DARK', 'PANEL_CREAM', 'PANEL_NAVY'])
            rows_reg[(0, fl)] = {'spandrel': pc, 'lintel': pc}
        else:
            ops.append(_op(0, U0, W - 0.3, fl, 'window', 'tall', glass=r.choice(['WIN_BLIND', 'LIT_COOL', 'WIN_DARK']),
                           mull=max(3, int(W / 1.4)), sill=False, sash='ALU'))
            rows_reg[(0, fl)] = {'lintel': spec.get('panel', 'GLASS_BLUE')}
        # side and back: one window per floor, every other floor a frosted one
        # side walls: in a street row the neighbours hide the low floors, so
        # windows only where the side can be seen; back: one window per floor
        if fl >= 3 or fl % 2:
            ops.append(_op(1, D * 0.55, D * 0.55 + 0.9, fl, 'window', 'window',
                           glass='FROSTED' if fl % 2 else r.choice(GLASS), grille=fl % 4 == 1))
        if fl >= 4:
            ops.append(_op(3, D * 0.4, D * 0.4 + 0.9, fl, 'window', 'window', glass=r.choice(GLASS)))
        ops.append(_op(2, W * 0.25, W * 0.75, fl, 'window', 'window', glass=r.choice(GLASS)))
    ops.append(_op(2, W * 0.5 - 0.45, W * 0.5 + 0.45, 0, 'steel_door', 'shop_low'))
    return r, ops, rows_reg, floors


def _floors(n):
    return [('shop', SHOP_H)] + [('res', FLOOR_H)] * (n - 1)


def _building(spec, lod):
    r, ops, rows_reg, floor_styles = _plan(spec)
    W, D, n = spec['W'], spec['D'], spec['n']
    bm = K.new_bm()
    walls = [spec['wall'], 'ALC_WHITE', 'ALC_WHITE', 'ALC_WHITE']
    sh = T.Shell(bm, W, D, _floors(n), walls, lod, ops, rows_reg)
    for o in ops:
        face = sh.cell(o['e'], o['u'], o['fl'], T.ROWS[o['rows']])
        ctx = dict(lod=lod, reveal=T.FLAT.get(walls[o['e']], walls[o['e']]))
        T.MODULES[o['kind']](bm, face, ctx, **o['opt'])
    sh.map_walls()
    Rf = sh.roof
    f1, f3 = sh.frame(1), sh.frame(3)
    T.downpipe(bm, f1, D - 0.3, 0.0, Rf + 0.6, lod)
    if not lod:
        for fl in range(2, n, 3):
            T.ac_wall(bm, f1, D * 0.3, sh.floor_z[fl] + 0.5, lod, duct_to=sh.floor_z[fl] + 1.4)
        T.meter_box(bm, f1, D - 1.2, 1.1, lod)
    if not spec.get('bill'):
        T.water_tank(bm, 0.0, D / 2 - 1.6, Rf + 0.12, min(2.0, W - 1.2), 1.4, 1.3, lod)
        T.penthouse(bm, -W / 2 + 0.3, -W / 2 + 2.3, -D / 2 + 3.0, -D / 2 + 5.4, Rf + 0.12, 2.5, lod)
    else:
        T.penthouse(bm, -W / 2 + 0.3, -W / 2 + 2.3, D / 2 - 2.6, D / 2 - 0.3, Rf + 0.12, 2.5, lod)
    T.ac_floor(bm, F((0, 0, 0), (0, -1, 0)), W / 2 - 1.0, Rf + 0.12, D / 2 - 2.0, lod)
    return bm, sh


def _signs(spec, sh, lod):
    """The sign skin, seeded: which tenant on which floor, towers, extras."""
    r = random.Random(spec['seed'] * 7 + 3)
    W, D, n, dens = spec['W'], spec['D'], spec['n'], spec['density']
    bm = K.new_bm()
    f0, f1 = sh.frame(0), sh.frame(1)
    fz = sh.floor_z
    ys = [f'Y{i:02d}' for i in range(24)]; r.shuffle(ys)
    ts = [f'T{i:02d}' for i in range(16)]; r.shuffle(ts)
    ss = [f'S{i}' for i in range(8)]; r.shuffle(ss)
    towers = spec.get('towers', 1)
    tower_u = []
    if towers >= 1:
        tower_u.append(W - 0.25)
    if towers >= 2:
        tower_u.append(0.25)
    z_t = fz[1] + 0.3
    for i, u in enumerate(tower_u):
        k = max(1, min(2, int((sh.roof - z_t) / 5.25)))
        S.tower(bm, f0, u, z_t + (0.0 if i == 0 else 1.6 * r.random()), [ts.pop() for _ in range(k)], lod, w=1.05,
                bulbs=spec.get('bulbs', False) and i == 0, edge=r.choice(['NEON_WHITE', 'NEON_YELLOW', 'NEON_PINK']))
    # ground fascia lightbox over the shop
    zg = 3.12 if spec['ground'] == 'izakaya' else 3.02     # clear of the izakaya eave
    S.yoko(bm, f0, 1.3, W - 0.2, zg, 0.64 if zg > 3.05 else 0.72, ys.pop(), lod)
    # one lightbox per tenant floor, some floors projecting instead, neon / screen in between
    left = 0.25 + (0.75 if towers >= 2 else 0.0)
    right = W - 0.25 - (0.75 if towers >= 1 else 0.0)
    neon_fl = None
    if spec.get('neon'):
        neon_fl = r.randrange(1, n)
    scr = spec.get('screen')
    scr_fl = set(range(max(1, n - 4), n - 1)) if scr else set()
    for fl in range(1, n):
        zf = fz[fl]
        if fl in scr_fl:
            continue
        if fl == neon_fl:
            word, board = spec['neon']
            S.neon(bm, f0, left + 0.1, zf + 0.2, word, lod, colour=r.choice(['NEON_PINK', 'NEON_CYAN', 'NEON_YELLOW']),
                   border=r.choice(['NEON_CYAN', 'NEON_PINK', None]), ch=0.42, board=board)
            continue
        if r.random() < dens:
            w = right - left
            # boxes cover the spandrel and often the lower part of the window,
            # as in Kabukichō: the bigger, the denser the street
            h = r.choice([0.72, 0.95, 1.25] if dens >= 0.8 else [0.62, 0.72, 0.85])
            if r.random() < 0.3 and w > 3.0:          # two tenants share the floor
                mid = left + w * r.uniform(0.4, 0.6)
                S.yoko(bm, f0, left, mid - 0.05, zf + 0.15, h, ys.pop(), lod)
                S.yoko(bm, f0, mid + 0.05, right, zf + 0.15, h, ys.pop(), lod)
            else:
                S.yoko(bm, f0, left, right, zf + 0.15, h, ys.pop(), lod,
                       frame=r.choice(['FRAME_BLACK', 'FRAME_SILVER', 'FRAME_WHITE']))
        if towers < 2 and r.random() < dens * 0.45 and ys:
            S.yoko_out(bm, f0, 0.3, zf + 1.3, ys.pop(), lod, w=r.choice([1.6, 2.0, 2.4]))
    if scr:
        z0 = fz[min(scr_fl)] + 0.3
        z1 = fz[max(scr_fl) + 1] - 0.3
        S.screen(bm, f0, 0.6, W - 1.2, z0, z1, scr, lod)
    # signs on the side wall where it rises above the neighbours
    if n >= 7:
        for fl in range(4, n):
            if r.random() < dens * 0.6 and ys:
                S.yoko(bm, f1, 1.0, min(D - 1.0, 5.5), fz[fl] + 0.22, 0.72, ys.pop(), lod)
    # pavement: standing signs, lanterns under the eave
    for i in range(1 if dens < 0.6 else 2):
        S.stand(bm, f0, 1.6 + i * (W - 2.6), 0.5, ss.pop(), lod)
    if spec.get('lanterns'):
        S.lantern_string(bm, f0, 1.5, W - 0.3, 2.78, 0.95, lod)
    if spec.get('bill'):
        S.billboard(bm, 0.0, -D / 2 + 0.6, sh.roof + 0.12, min(W - 0.4, 7.0), min(W - 0.4, 7.0) / 2, spec['bill'], lod,
                    lift=1.5, depth=1.4)
    return bm


def build_variant(key, lods=(0, 1)):
    spec = CENTER[key]
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    smat = K.atlas_material('TokyoSigns', emission_strength=1.6)   # preview only: 4 washed the colours out (AgX)
    objs, signs = [], []
    for lod in lods:
        bm, sh = _building(spec, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        signs.append(K.mesh_object(f'SM_{name}_Signs_LOD{lod}', _signs(spec, sh, lod), col, [smat],
                                   bevel=0.0, hidden=lod > 0, recalc=False))
    W, D, n = spec['W'], spec['D'], spec['n']
    top = SHOP_H + FLOOR_H * (n - 1)
    K.collider_box(f'COL_{name}', col, -W / 2, W / 2, -D / 2, D / 2, 0.0, top + 0.85)
    warm = spec['ground'] == 'izakaya'
    K.light_marker(f'LIGHT_{name}_Shop', col, (0.6, -D / 2 - 1.0, 2.6),
                   color=(1.0, 0.6, 0.35) if warm else (0.92, 0.96, 1.0), watts=50, unity_range=7.0)
    K.light_marker(f'LIGHT_{name}_Signs', col, (W / 2 - 0.6, -D / 2 - 1.5, SHOP_H + 3.0),
                   color=(1.0, 0.55, 0.7), watts=60, unity_range=8.0, unity_intensity=0.8)
    col['sign_tris'] = [K.tri_count(o) for o in signs]
    return col, objs


def build():
    out = [build_variant(k) for k in CENTER]
    print('sign skins:', {c.name: list(c['sign_tris']) for c, _ in out})
    return out


# preview: an alley, 6 m wide; row A faces -Y, row B (turned) faces +Y
ALLEY = 6.0
ROW_A = ['Center_7F_Izakaya', 'Center_9F_Karaoke', 'Center_6F_Narrow', 'Street_5F_Tile', 'Street_3F_Brown']
ROW_B = ['Center_6F_Brown', 'Center_8F_Glass', 'Center_7F_Concrete', 'Street_4F_Teal', 'Street_6F_Cream']


def place(results, undo=False):
    """Move the collections into the alley layout (or back)."""
    for row, turn in ((ROW_A, False), (ROW_B, True)):
        x = 0.0
        for key in row:
            spec = CENTER[key]
            W, D = spec['W'], spec['D']
            col = next(c for c, _ in results if c.name == f'{NAME}_{key}')
            cx = x + W / 2
            cy = ALLEY / 2 + D / 2
            for o in col.objects:
                if not undo:
                    l = o.location.copy()
                    if turn:
                        l.x, l.y = -l.x, -l.y
                        o.rotation_euler.z += math.pi
                    o.location = l + Vector((cx, -cy if turn else cy, 0))
                else:
                    l = o.location - Vector((cx, -cy if turn else cy, 0))
                    if turn:
                        l.x, l.y = -l.x, -l.y
                        o.rotation_euler.z -= math.pi
                    o.location = l
            x += W + 0.1


def preview(results, views):
    from kit import preview as P
    place(results)
    try:
        objs = [o for c, _ in results for o in c.objects if o.type == 'MESH' and o.name.endswith('LOD0')]
        show = [c.name for c, _ in results]
        a = P.render(objs, NAME + '_Center', [v for v in views if v[2] != 'clay'], size=(1024, 576), show=show)
        b = P.render(objs, NAME + '_Center_clay', [v for v in views if v[2] == 'clay'], size=(1024, 576), show=show)
    finally:
        place(results, undo=True)
    return f'{a}, {b}'
