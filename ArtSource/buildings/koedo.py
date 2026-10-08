"""Koedo street (kura town, Kawagoe-like) - houses as data, from the Koedo kit.

Main street: black and white mise-gura (shop kura) with deep plastered or
tiled pent roofs, roof signboards, a corner kura with a shop on both
streets, wooden machiya with lattice, mushiko slats or a railing in front
of shoji, a copper-fronted kanban house and a low sweets shop of the lane.
Each FBX holds the house (SM_<name>_LOD0/1, atlas Koedo) and its shop
dressing (SM_<name>_Shop_LOD0/1, atlas KoedoShop: interior, boards, noren,
flags, lanterns, display, bench ...), so Phase 5 can keep or thin it.
density < 0.6 gives the quiet lane version of a house: shop shut (plaster
fire doors or storm boards), no flags or stands, pots instead.

Coordinates in a spec: u along the wall from its left corner (front: from
x = -W/2), z up, d out of the wall. Edge 0 = front (-Y), 1 = right (+X).
"""
import copy
import math
from mathutils import Vector
from kit import core as K
from buildings import koedo_kit as KK
from buildings.koedo_kit import op, ROWS

KLASS = 'buildings'
NAME = 'Koedo'

BLACK, WHITE, BOARD, COPPER = 'PLASTER_BLACK', 'PLASTER_WHITE', 'WOOD_BOARD', 'COPPER'

HOUSES = {
    # big black sake mise-gura: plastered pent roof between fire wing walls, roof signboard, cedar ball
    'Misegura_3Bay_Sake': dict(
        kind='kura', W=8.4, D=7.5, G=3.3, U=2.5, wall=BLACK, kamon='KAMON_A',
        ground=[(0.45, 7.95, 'shop', dict(img='INT_SAKE'))],
        upper=[(0.85, 1.95, 'kannon', dict(lit=True)), (6.45, 7.55, 'kannon', dict(closed=True))],
        back=[(3.65, 4.75, 'kannon', dict(closed=True))],
        hisashi=dict(u0=0.35, u1=8.05, z_e=2.95, depth=1.7, fascia=0.3, plaster=True, sode=(0.35, 0.35)),
        roof=dict(heavy=True, ridge_h=1.25, oni=1.45, fascia=0.5),
        ladder=(3, 3.0), gutter=True,
        dress=[('roof_board', 0, dict(img='KB0', uc=4.2, w=3.2, h=0.95)),
               ('noren', 0, dict(img='NOREN0', u0=3.0, u1=5.4, z=3.02, d=0.12, length=1.0)),
               ('sugidama', 0, dict(u=7.25, z=2.2, d=1.25, hang=0.45)),
               ('kv', 0, dict(img='KV2', u=0.8, d=0.9)),
               ('cask', 0, dict(u=6.2, d=0.55)), ('cask', 0, dict(u=6.85, d=0.55)), ('cask', 0, dict(u=6.52, d=0.55, z=0.5)),
               ('chochin', 0, dict(img='CHOCHIN1', u=2.4, z=2.2, d=1.45, hang=0.4)),
               ('buckets', 0, dict(u=1.8, d=0.45)),
               ('lively', 0, dict(kinds=('cask', 'kv', 'chochin')))]),
    # white kura with a sweet-potato shop, tiled pent roof on wooden beams, bench with parasol
    'Kura_2Bay_Imo': dict(
        kind='kura', W=6.2, D=6.5, G=3.2, U=2.4, wall=WHITE, namako=True, kamon='KAMON_B',
        ground=[(0.3, 5.9, 'shop', dict(img='INT_IMO'))],
        upper=[(1.0, 2.0, 'kannon', dict(lit=True)), (4.2, 5.2, 'kannon', dict())],
        back=[(2.6, 3.6, 'kannon', dict(closed=True))],
        hisashi=dict(u0=0.0, u1=6.2, z_e=2.85, depth=1.3, fascia=0.22, plaster=False),
        roof=dict(heavy=True, ridge_h=1.0, oni=1.2, fascia=0.45), gutter=True,
        dress=[('wall_board', 0, dict(img='KB4', uc=3.1, w=1.7, h=0.5, z=4.45)),
               ('noren', 0, dict(img='NOREN2', u0=2.3, u1=3.9, z=2.94, d=0.12, length=0.85)),
               ('display', 0, dict(kind='boxes', u0=0.5, u1=2.1, d0=-0.05)),
               ('display', 0, dict(kind='boxes', u0=4.1, u1=5.7, d0=-0.05, seed=3)),
               ('nobori', 0, dict(img='NOBORI0', u=0.35, d=1.55)), ('nobori', 0, dict(img='NOBORI0', u=5.5, d=1.55)),
               ('bench', 0, dict(u=2.0, d=2.3, w=1.6)),
               ('menu', 0, dict(u=4.4, d=1.6))]),
    # wooden machiya, eel restaurant: lattice front, entrance with noren, mushiko upstairs
    'Machiya_2Bay_Unagi': dict(
        kind='machiya', W=5.6, D=9.0, G=3.0, U=2.0, wall_g=BOARD, wall_u=BLACK,
        ground=[(0.2, 3.4, 'koshi', dict(lit=True)), (3.6, 5.4, 'shop', dict(img='INT_UNAGI', depth=1.4, doors=False))],
        upper=[(0.5, 2.4, 'mushiko', dict(lit=True)), (3.2, 5.1, 'mushiko', dict())],
        back=[(1.8, 3.8, 'mushiko', dict())],
        hisashi=dict(u0=-0.1, u1=5.7, z_e=2.7, depth=1.0, fascia=0.18, plaster=False, slope=0.42),
        roof=dict(heavy=False, ridge_h=0.45, oni=0.85, slope=0.5, eave_out=0.7, oh=0.5, fascia=0.18),
        dress=[('roof_board', 0, dict(img='KB2', uc=2.8, w=2.2, h=0.55)),
               ('noren', 0, dict(img='NOREN1', u0=3.65, u1=5.35, z=2.7, d=0.1, length=0.95)),
               ('chochin', 0, dict(img='CHOCHIN1', u=3.4, z=2.0, d=0.8, hang=0.35)),
               ('kv', 0, dict(img='KV3', u=5.35, d=0.6)),
               ('pots', 0, dict(u0=0.3, u1=3.2, d=0.25, seed=2)),
               ('lamp', 0, dict(u=5.5, z=2.2))]),
    # copper-fronted kanban house: Shōwa glass doors, sash windows, parapet hides the roof
    'Kanban_2Bay_Souvenir': dict(
        kind='machiya', W=6.0, D=8.0, G=3.2, U=2.5, wall_g=BOARD, wall_u=WHITE, front=COPPER,
        ground=[(0.3, 5.7, 'glass', dict(img='INT_SOUVENIR'))],
        upper=[(0.55, 1.55, 'sash', dict(lit=True)), (2.5, 3.5, 'sash', dict()), (4.45, 5.45, 'sash', dict(lit=True))],
        back=[(2.5, 3.5, 'sash', dict())],
        parapet=1.5,
        roof=dict(heavy=False, ridge_h=0.4, oni=0.7, slope=0.5, eave_out=0.6, oh=0.25, fascia=0.18, eave_front=0.0),
        dress=[('wall_board', 0, dict(img='KB3', uc=3.0, w=3.6, h=0.5, z=3.22, cap=False)),
               ('noren', 0, dict(img='NOREN3', u0=2.3, u1=3.7, z=2.85, d=0.08, length=0.6)),
               ('display', 0, dict(kind='boxes', u0=0.35, u1=2.0, d0=1.0, zb=0.0, h=0.8, seed=5)),
               ('display', 0, dict(kind='pots', u0=4.0, u1=5.65, d0=1.0, zb=0.0, h=0.8, seed=6)),
               ('nobori', 0, dict(img='NOBORI3', u=0.1, d=1.5))]),
    # corner kura (pottery): shops on both streets, pent roof wraps the corner, crest on the street gable
    'Kura_Corner_2Bay_Pottery': dict(
        kind='kura', W=6.4, D=8.0, G=3.3, U=2.5, wall=BLACK, namako=True, kamon='KAMON_A',
        ground=[(0.4, 6.0, 'shop', dict(img='INT_CRAFT'))],
        side_ground=[(1.2, 4.6, 'shop', dict(img='INT_SWEETS', depth=0.9))],
        upper=[(0.9, 2.0, 'kannon', dict(closed=True)), (4.4, 5.5, 'kannon', dict(closed=True))],
        side_upper=[(2.4, 3.5, 'kannon', dict(lit=True))],
        back=[(2.6, 3.7, 'kannon', dict(closed=True))],
        hisashi=dict(u0=0.35, u1=7.6, z_e=2.95, depth=1.2, fascia=0.28, plaster=True, sode=(0.35, None)),
        side_hisashi=dict(u0=0.0, u1=5.4, z_e=2.95, depth=1.2, fascia=0.28, plaster=True),
        roof=dict(heavy=True, ridge_h=1.1, oni=1.3, fascia=0.5), gutter=True,   # budget: no ladder, front windows shut
        dress=[('roof_board', 0, dict(img='KB6', uc=3.2, w=2.6, h=0.8)),
               ('noren', 1, dict(img='NOREN5', u0=2.2, u1=3.6, z=3.02, d=0.1, length=0.9)),
               ('display', 0, dict(kind='pots', u0=0.6, u1=2.6, d0=-0.05, seed=8)),
               ('display', 0, dict(kind='pots', u0=3.8, u1=5.8, d0=-0.05, seed=9)),
               ('buckets', 1, dict(u=5.9, d=0.4)),
               ('lamp', 1, dict(u=0.8, z=2.3))]),
    # low sweets shop of the lane (Kashiya Yokochō): candy jars out front, red noren, flags
    'Dagashi_1F': dict(
        kind='machiya', W=4.6, D=6.0, G=2.8, U=1.2, wall_g=BOARD, wall_u=BOARD,
        ground=[(0.15, 4.45, 'shop', dict(img='INT_SWEETS', depth=1.2))],
        upper=[(1.2, 3.4, 'mushiko', dict(lit=True))],
        back=[(1.6, 3.0, 'mushiko', dict())],
        hisashi=dict(u0=-0.1, u1=4.7, z_e=2.5, depth=1.4, fascia=0.15, plaster=False, slope=0.4),
        roof=dict(heavy=False, ridge_h=0.35, oni=0.65, slope=0.5, eave_out=0.6, oh=0.4, fascia=0.16),
        dress=[('display', 0, dict(kind='jars', u0=0.35, u1=4.25, d0=0.95, zb=0.0, h=0.85)),
               ('noren', 0, dict(img='NOREN4', u0=1.5, u1=3.1, z=2.55, d=0.1, length=0.55)),
               ('wall_board', 0, dict(img='KB1', uc=2.3, w=1.9, h=0.48, z=3.05)),
               ('nobori', 0, dict(img='NOBORI1', u=-0.15, d=1.7)), ('nobori', 0, dict(img='NOBORI2', u=4.55, d=1.7)),
               ('chochin', 0, dict(img='CHOCHIN0', u=0.3, z=1.95, d=1.25, hang=0.3)),
               ('chochin', 0, dict(img='CHOCHIN0', u=4.3, z=1.95, d=1.25, hang=0.3)),
               ('kv', 0, dict(img='KV1', u=4.75, d=0.4))]),
    # wide wooden machiya, tea merchant: lattice, open shop, upper room with railing and bamboo blinds
    'Machiya_3Bay_Tea': dict(
        kind='machiya', W=8.0, D=9.0, G=3.1, U=2.3, wall_g=BOARD, wall_u=BOARD,
        ground=[(0.3, 2.9, 'koshi', dict(lit=True)), (3.1, 7.7, 'shop', dict(img='INT_TEA', depth=1.2))],
        upper=[(0.5, 7.5, 'rail', dict(lit=(1, 4, 6)), ROWS['upper_tall'])],
        back=[(2.0, 3.6, 'mushiko', dict()), (4.4, 6.0, 'mushiko', dict())],
        hisashi=dict(u0=-0.1, u1=8.1, z_e=2.8, depth=1.1, fascia=0.18, plaster=False, slope=0.42),
        roof=dict(heavy=False, ridge_h=0.5, oni=0.9, slope=0.5, eave_out=0.85, oh=0.55, fascia=0.2),
        dress=[('roof_board', 0, dict(img='KB7', uc=1.6, w=2.2, h=0.55)),
               ('noren', 0, dict(img='NOREN5', u0=4.4, u1=6.4, z=2.85, d=0.1, length=0.9)),
               ('sudare', 0, dict(u0=0.7, u1=2.5, z0=4.35, z1=5.25, d=0.95)),
               ('sudare', 0, dict(u0=5.5, u1=7.3, z0=4.6, z1=5.25, d=0.95)),
               ('display', 0, dict(kind='boxes', u0=3.4, u1=4.3, d0=-0.05, seed=11)),
               ('display', 0, dict(kind='boxes', u0=6.5, u1=7.5, d0=-0.05, seed=12)),
               ('pots', 0, dict(u0=0.4, u1=2.8, d=0.25, seed=4)),
               ('lamp', 0, dict(u=2.98, z=2.25))]),
}
LANE = {   # quiet lane versions: same houses, shops shut
    'Kura_2Bay_Imo_Lane': ('Kura_2Bay_Imo', 0.3),
    'Machiya_2Bay_Unagi_Lane': ('Machiya_2Bay_Unagi', 0.3),
    'Machiya_3Bay_Tea_Lane': ('Machiya_3Bay_Tea', 0.3),
}
LIVELY = {'noren', 'nobori', 'display', 'cask', 'bench', 'menu', 'kv', 'chochin', 'sugidama'}


def lane(spec):
    """Shut the shop, drop the street clutter, put pots out."""
    s = copy.deepcopy(spec)
    style = 'plaster' if s['kind'] == 'kura' else 'boards'
    g = []
    for u0, u1, k, o in s['ground']:
        if k in ('shop', 'glass'):
            k, o = 'closed', dict(style=style, reg=s.get('wall', BLACK))
        elif k == 'koshi':
            o = dict(lit=False)
        g.append((u0, u1, k, o))
    s['ground'] = g
    s['upper'] = [(u[0], u[1], u[2], {**u[3], 'lit': False if u[2] != 'rail' else (2,)}) + tuple(u[4:]) for u in s['upper']]
    s['dress'] = [d for d in s['dress'] if d[0] not in LIVELY]
    W = s['W']
    s['dress'].append(('pots', 0, dict(u0=0.3, u1=min(W - 0.3, 2.6), d=0.25, seed=7)))
    if W > 6:
        s['dress'].append(('pots', 0, dict(u0=W - 2.0, u1=W - 0.3, d=0.25, seed=9)))
    return s


def edge_frame(W, D, e):
    corners = [(-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, D / 2), (-W / 2, D / 2)]
    c0 = Vector((*corners[e], 0)); c1 = Vector((*corners[(e + 1) % 4], 0))
    t = (c1 - c0).normalized()
    f = KK.F(c0, (t.y, -t.x))
    f.u0, f.u1 = 0.0, (W, D, W, D)[e]
    return f


def _hz(h):
    """Height of the pent roof surface at distance d from the wall."""
    return lambda d: h['z_e'] + h.get('fascia', 0.22) + (h['depth'] - d) * h.get('slope', 0.45)


BACK_DOOR = ('g_low', 'g_mid')


def _back_ground(spec):
    """Back of every house (seen from the next street): a door (plaster fire
    door on a kura, boards on a machiya) and on a machiya a slatted window."""
    W = spec['W']
    if spec['kind'] == 'kura':
        u = W * 0.5 - 0.55
        return [(u, u + 1.1, 'closed', dict(style='plaster', reg=spec.get('wall', BLACK)), BACK_DOOR)]
    return [(0.7, 1.6, 'closed', dict(style='boards'), BACK_DOOR),
            (W - 2.2, W - 0.9, 'mushiko', dict(), ('g_mid',))]


def _house(spec, lod):
    c = KK.C('Koedo', lod)
    kind, W, D, G, U = spec['kind'], spec['W'], spec['D'], spec['G'], spec['U']
    wall = spec.get('wall')
    wg = spec.get('wall_g', wall); wu = spec.get('wall_u', wall)
    fr = spec.get('front')
    walls = {'g': [fr or wg, wg, wg, wg], 'u': [fr or wu, wu, wu, wu]}
    ops = []
    back_ground = spec.get('back_ground', _back_ground(spec))
    for e, key, rows in ((2, 'back_ground', ROWS['ground']), (0, 'ground', ROWS['ground']), (1, 'side_ground', ROWS['ground']),
                         (0, 'upper', ROWS['upper']), (1, 'side_upper', ROWS['upper']), (2, 'back', ROWS['upper'])):
        for item in (back_ground if key == 'back_ground' else spec.get(key, [])):
            u0, u1, k, o = item[:4]
            ops.append(op(e, u0, u1, item[4] if len(item) > 4 else rows, k, **o))
    sh = KK.Shell(c, W, D, kind, G, U, ops, walls, namako=spec.get('namako', False))
    slots = []
    for o in ops:
        face = sh.cell(o['e'], o['u'], o['rows'])
        st = 'u' if o['rows'][0].startswith('u') else 'g'
        opt = dict(o['opt'])
        opt.setdefault('wall', walls[st][o['e']])
        opt.setdefault('z0', G + 0.2 if st == 'u' else (0.45 if kind == 'kura' else 0.2))
        slot = KK.MODULES[o['kind']](c, face, sh, opt)
        slot.update(e=o['e'], img=o['opt'].get('img'))
        slots.append(slot)
    sh.map_walls()
    r = dict(heavy=True, ridge_h=0.78, oni=1.0, slope=0.58, eave_out=0.75, oh=0.7, fascia=0.45)
    r.update(spec.get('roof', {}))
    slope = r['slope']
    sh.gables(slope, spec.get('kamon'))
    roof = KK.gable_roof(c, W, D, sh.z_top, sh.wall_out, eave_out=r['eave_out'], oh=r['oh'], slope=slope,
                         fascia=r['fascia'], heavy=r['heavy'], ridge_h=r['ridge_h'], oni=r['oni'],
                         fascia_reg=walls['u'][1] if r['heavy'] else 'WOOD', rafters=not r['heavy'],
                         eave_front=r.get('eave_front'))
    for key, e in (('hisashi', 0), ('side_hisashi', 1)):
        h = spec.get(key)
        if not h:
            continue
        f = edge_frame(W, D, e)
        pl = h.get('plaster')
        wreg = walls['g'][e]
        beams = None if pl else [h['u0'] + 0.25 + (h['u1'] - h['u0'] - 0.5) * i / max(1, round((h['u1'] - h['u0']) / 1.9))
                                 for i in range(round((h['u1'] - h['u0']) / 1.9) + 1)]
        KK.hisashi(c, f, h['u0'], h['u1'], h['z_e'], h['depth'], slope=h.get('slope', 0.45), fascia=h.get('fascia', 0.22),
                   fascia_reg=wreg if pl else 'WOOD', soffit=KK.flat(wreg) if pl else 'WOOD_FLAT', beams=beams,
                   sode=h.get('sode'), sode_reg=KK.flat(wreg))
    fb = edge_frame(W, D, 2)
    for u0, u1, k, o, *_ in back_ground:   # small pent roof over the back door, downpipe beside it
        if k == 'closed':
            zt = 2.5 if kind == 'kura' else 2.2
            KK.hisashi(c, fb, u0 - 0.35, u1 + 0.35, zt + 0.12, 0.7, slope=0.4, fascia=0.12, fascia_reg='WOOD',
                       beams=[u0 - 0.2, u1 + 0.2], rows=False)
            KK.downpipe(c, fb, max(0.15, u0 - 0.6), 0.0, sh.z_top - 0.2)
    if spec.get('parapet'):
        KK.copper_front(c, W, D, G, sh.z_top - 0.4, sh.z_top + spec['parapet'])
    if spec.get('gutter'):
        KK.gutter(c, roof)
        KK.downpipe(c, edge_frame(W, D, 1), 0.25, 0.0, sh.z_top - 0.3)
    if spec.get('ladder'):
        e, u = spec['ladder']
        KK.ladder(c, edge_frame(W, D, e), u, 0.8, sh.z_top - 0.4)
    return c, sh, slots, roof


def _dress(spec, slots, lod, density):
    c = KK.C('KoedoShop', lod)
    W, D = spec['W'], spec['D']
    for s in slots:
        if s['kind'] in ('shop', 'glass') and s.get('img'):
            KK.interior(c, s, s['img'])
    for kind, e, a in spec['dress']:
        f = edge_frame(W, D, e)
        a = dict(a)
        if kind == 'roof_board':
            h = spec['hisashi']
            d = h['depth'] * 0.45
            base = _hz(h)(d)
            KK.board(c, f, a['uc'], a['w'], a['h'], base + 0.18, d + 0.04, a['img'], posts=base - 0.05)
        elif kind == 'wall_board':
            KK.board(c, f, a['uc'], a['w'], a['h'], a['z'], 0.09, a['img'], cap=a.get('cap', True))
        elif kind == 'noren':
            KK.noren(c, f, a['u0'], a['u1'], a['z'], a['d'], a['img'], length=a.get('length', 0.9))
        elif kind == 'nobori':
            KK.nobori(c, f, a['u'], a['d'], a['img'])
        elif kind == 'chochin':
            KK.chochin(c, f, a['u'], a['z'], a['d'], a['img'], hang=a.get('hang', 0.25))
        elif kind == 'kv':
            KK.tate_board(c, f, a['u'], a['d'], a['img'])
        elif kind == 'sugidama':
            KK.sugidama(c, f, a['u'], a['z'], a['d'], hang=a.get('hang', 0.35))
        elif kind == 'display':
            KK.display(c, f, a['u0'], a['u1'], a['d0'], a['kind'], seed=a.get('seed', 0), h=a.get('h', 0.75),
                       zb=a.get('zb', 0.45 if spec['kind'] == 'kura' else 0.2))
        elif kind == 'cask':
            KK.cask(c, f, a['u'], a['d'], z=a.get('z', 0.0))
        elif kind == 'bench':
            KK.bench(c, f, a['u'], a['d'], w=a.get('w', 1.8))
        elif kind == 'buckets':
            KK.buckets(c, f, a['u'], a['d'])
        elif kind == 'sudare':
            KK.sudare(c, f, a['u0'], a['u1'], a['z0'], a['z1'], a['d'])
        elif kind == 'pots':
            KK.pots(c, f, a['u0'], a['u1'], a['d'], seed=a.get('seed', 0))
        elif kind == 'menu':
            KK.menu_stand(c, f, a['u'], a['d'])
        elif kind == 'lamp':
            KK.lamp(c, f, a['u'], a['z'])
    return c


def build_variant(key, spec, density=1.0, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Koedo')
    smat = K.atlas_material('KoedoShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, sh, slots, roof = _house(spec, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _dress(spec, slots, lod, density)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0,
                                  recalc=False))
    W, D = spec['W'], spec['D']
    K.collider_box(f'COL_{name}_Walls', col, -W / 2 - 0.1, W / 2 + 0.1, -D / 2 - 0.1, D / 2 + 0.1, 0.0, sh.z_top)
    K.collider_box(f'COL_{name}_Roof', col, -roof['x'], roof['x'], -roof['eave_y'], roof['eave_y'], sh.z_top, roof['ridge'] + 0.3)
    f0 = edge_frame(W, D, 0)
    for i, s in enumerate(x for x in slots if x['e'] == 0 and x['kind'] in ('shop', 'glass', 'koshi')):
        if density < 0.6 and s['kind'] != 'koshi':
            continue
        f = s['f']
        p = f(f.uc, min(f.z1 - 0.4, 2.6), 0.6)
        K.light_marker(f'LIGHT_{name}_Shop{i}', col, tuple(p), color=(1.0, 0.68, 0.4), watts=45, unity_range=6.0)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    return col, objs


def build():
    out = [build_variant(k, s) for k, s in HOUSES.items()]
    out += [build_variant(k, lane(HOUSES[src]), dens) for k, (src, dens) in LANE.items()]
    print('shop dressing:', {c.name: list(c['shop_tris']) for c, _ in out})
    return out


# preview: main street 9 m wide; row A faces -Y (north side), row B turned
STREET = 9.0
ROW_A = ['Misegura_3Bay_Sake', 'Machiya_2Bay_Unagi', 'Kura_2Bay_Imo', 'Kura_Corner_2Bay_Pottery']
ROW_B = ['Machiya_3Bay_Tea', 'Kanban_2Bay_Souvenir', 'Dagashi_1F']
LANE_W = 4.0
LANE_A = ['Kura_2Bay_Imo_Lane', 'Machiya_2Bay_Unagi_Lane']
LANE_B = ['Machiya_3Bay_Tea_Lane']


def _spec(key):
    return HOUSES[key] if key in HOUSES else lane(HOUSES[LANE[key][0]])


def place(results, rows, width, x0=0.0, y0=0.0, undo=False):
    """Move the collections into a street layout (or back)."""
    for row, turn in rows:
        x = x0
        for key in row:
            spec = _spec(key)
            W, D = spec['W'], spec['D']
            col = next(c for c, _ in results if c.name == f'{NAME}_{key}')
            cx, cy = x + W / 2, y0 + width / 2 + D / 2
            off = Vector((cx, -cy if turn else cy, 0))
            for o in col.objects:
                if not undo:
                    l = o.location.copy()
                    if turn:
                        l.x, l.y = -l.x, -l.y
                        o.rotation_euler.z += math.pi
                    o.location = l + off
                else:
                    l = o.location - off
                    if turn:
                        l.x, l.y = -l.x, -l.y
                        o.rotation_euler.z -= math.pi
                    o.location = l
            x += W + 0.1


MAIN = [(ROW_A, False), (ROW_B, True)]


def preview(results, views):
    from kit import preview as P
    place(results, MAIN, STREET)
    try:
        keys = ROW_A + ROW_B
        objs = [o for c, _ in results if c.name[len(NAME) + 1:] in keys for o in c.objects
                if o.type == 'MESH' and o.name.endswith('LOD0')]
        show = [f'{NAME}_{k}' for k in keys]
        a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(1024, 576), show=show)
        b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(1024, 576), show=show)
    finally:
        place(results, MAIN, STREET, undo=True)
    return f'{a}, {b}'


# ── street shots (eye level, lane, close-ups): koedo.shots(out_dir) ─────────
LX = 60.0   # the lane scene stands beside the main street
PROPS_MAIN = [('Bicycle_Mamachari_Silver', (9.4, 3.1), 0.08), ('Bicycle_Mamachari_Cream', (10.5, 3.0), -0.06),
              ('Planter_PotGroup', (27.7, 3.8), 0.0), ('StoneLantern', (-1.2, 5.0), 0.0)]
PROPS_LANE = [('Bicycle_Mamachari_Mint', (LX + 5.0, -1.3), 3.1),
              ('Planter_Concrete', (LX + 7.2, 1.4), 0.0), ('Planter_Round', (LX + 2.0, -1.5), 0.0)]
# a prop moved by both scenes was left displaced once: one scene per prop
assert not {p[0] for p in PROPS_MAIN} & {p[0] for p in PROPS_LANE}


def _props(props, undo=False):
    """Move task-2 props (built by their own modules) into the scene and back."""
    import bpy
    for name, (x, y), rot in props:
        col = bpy.data.collections.get(name)
        if not col:
            continue
        c, s = math.cos(rot), math.sin(rot)
        for o in col.all_objects:
            if o.parent:
                continue
            l = o.location.copy()
            if not undo:
                o.location = Vector((x + c * l.x - s * l.y, y + s * l.x + c * l.y, l.z)); o.rotation_euler.z += rot
            else:
                dx, dy = l.x - x, l.y - y
                o.location = Vector((c * dx + s * dy, -s * dx + c * dy, l.z)); o.rotation_euler.z -= rot


def shots(out_dir):
    """Street at eye level (mood + neutral), from above, the lane, a clay
    street, every house front/back/clay and close-ups -> out_dir/*.png."""
    import bpy, os
    from kit import preview as P
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n)
    res = [(bpy.data.collections[f'{NAME}_{k}'], None) for k in list(HOUSES) + list(LANE)]
    lane_rows = [(LANE_A, False), (LANE_B, True)]
    place(res, MAIN, STREET); place(res, lane_rows, LANE_W, x0=LX)
    _props(PROPS_MAIN); _props(PROPS_LANE)
    try:
        cols = [f'{NAME}_{k}' for k in ROW_A + ROW_B] + [p[0] for p in PROPS_MAIN]
        lcols = [f'{NAME}_{k}' for k in LANE_A + LANE_B] + [p[0] for p in PROPS_LANE]
        P.shot(cols, (14, 0, 3.0), (-1, -0.08, 0.03), 17, o('street_eye.png'), mood=True, lens=24)
        P.shot(cols, (12, 0, 3.0), (1, 0.1, 0.03), 14, o('street_eye2.png'), lens=24)
        P.shot(cols, (13, 0, 3.0), (-0.35, -1, 1.15), 34, o('street_high.png'), mood=True, lens=30)
        P.shot(cols, (13, 0, 3.0), (-0.35, -1, 1.15), 34, o('street_clay.png'), mood='clay', lens=30)
        P.shot(lcols, (LX + 6, 0, 2.4), (-1, 0.12, 0.06), 10, o('lane_eye.png'), mood=True, lens=24)
    finally:
        _props(PROPS_MAIN, True); _props(PROPS_LANE, True)
        place(res, lane_rows, LANE_W, x0=LX, undo=True); place(res, MAIN, STREET, undo=True)
    for k in list(HOUSES) + list(LANE):
        s = _spec(k); col = [f'{NAME}_{k}']; dist = 9 + s['W'] * 0.9
        P.shot(col, (0, -s['D'] / 2, 3.6), (0.45, -1, 0.12), dist, o(f'h_{k}.png'), size=(640, 480), lens=35)
        P.shot(col, (0, -s['D'] / 2, 3.6), (0.45, -1, 0.12), dist, o(f'k_{k}.png'), mood='clay', size=(640, 480), lens=35)
        if k in HOUSES:
            P.shot(col, (0, s['D'] / 2, 3.6), (-0.5, 1, 0.2), dist, o(f'b_{k}.png'), size=(640, 480), lens=35)
    for k, tgt, dirn, dist, name, mood in (
            ('Misegura_3Bay_Sake', (1.0, -4.5, 2.6), (0.6, -1, 0.15), 6.5, 'c_sake', True),
            ('Misegura_3Bay_Sake', (-2.5, -4.0, 4.6), (0.5, -1, 0.35), 5.5, 'c_sake_up', False),
            ('Kura_Corner_2Bay_Pottery', (3.2, -2.0, 3.0), (1, -0.6, 0.25), 10, 'c_corner', True),
            ('Machiya_3Bay_Tea', (-1.5, -4.5, 3.6), (0.4, -1, 0.2), 6.5, 'c_tea', False),
            ('Dagashi_1F', (0, -3.6, 1.6), (0.5, -1, 0.25), 5.5, 'c_dagashi', True),
            ('Kanban_2Bay_Souvenir', (0, -4.0, 5.5), (0.3, -1, 0.1), 9, 'c_kanban', False),
            ('Machiya_2Bay_Unagi', (1.5, -4.6, 2.4), (0.7, -1, 0.15), 5.5, 'c_unagi', True),
            ('Kura_2Bay_Imo', (0, 3.5, 4.0), (0.5, 1, 0.25), 11, 'c_imo_back', False)):
        P.shot([f'{NAME}_{k}'], tgt, dirn, dist, o(name + '.png'), mood=mood, size=(640, 480), lens=35)
