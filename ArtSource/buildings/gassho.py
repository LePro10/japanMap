"""Gassho village (Shirakawa-gō / Gokayama-like) - buildings as data, from
the Gassho kit, plus the village pieces.

Farmhouses with a steep thick thatch roof (gasshō-zukuri): a big main
house, a guest house (minshuku), a café with its long side to the road, a
small farmhouse with snow boards, a Gokayama-style washi workshop with a
thatched pent roof on the gable. Small buildings: board storehouse
(itakura) on stones, open firewood shed, the thatched fire hut of a water
cannon, a mountain-god shrine. Each FBX holds the building
(SM_<name>_LOD0/1, atlas Gassho) and its dressing (SM_<name>_Shop_LOD0/1,
atlas GasshoShop: interiors, signs, noren, persimmons, firewood, ladder,
straw ...). density < 0.6 gives the quiet field version: shop shut,
storm boards, dark shoji, no signs or flags - farm things stay.
Village pieces (atlas Gassho): Road_8m (gravel lane, stone channel, slab
bridge), Paddy_8m (paddy edge with bank), Hasa_6m (rice-drying rack).

Local frame of a spec: ridge along X, length L (gable to gable), width B;
sides S (-Y), E (+X), N (+Y), W (-X); `front` names the side that faces
the street (-Y after turning). Openings: (side, u0, u1, module, opt[, rows]),
u along the wall from its left corner seen from outside.
"""
import copy
import math
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings import koedo_kit as KK
from buildings import kiso_kit as KI
from buildings import gassho_kit as GK
from buildings.koedo_kit import op
from buildings.gassho_kit import ROWS, SIDES

KLASS = 'buildings'
NAME = 'Gassho'

TATE, BOARD = 'WOOD_TATE', 'WOOD_BOARD'
ANG = {'S': 0.0, 'E': -math.pi / 2, 'N': math.pi, 'W': math.pi / 2}


def wins(kinds, ww, gap=0.5, lit=(), **opt):
    """One gable floor: windows of width ww side by side, centred."""
    n = len(kinds)
    tot = n * ww + (n - 1) * gap
    return [(k, -tot / 2 + ww / 2 + i * (ww + gap), ww, dict(opt, lit=i in lit)) for i, k in enumerate(kinds)]


HOUSES = {
    # big main house: gable to the road, four attic floors of windows, board pent roof over the gable ground floor,
    # shoji and veranda along the sunny side, persimmons under the eave, ladder and firewood at the back
    'L_Honke': dict(
        L=20.0, B=11.5, G=3.1, front='E', walls=dict(S=BOARD, E=TATE, N=BOARD, W=TATE),
        roof=dict(ov=1.2, eave=1.45, vt=1.7, seed=3, p_new=0.15, p_old=0.3),
        gables=dict(
            E=[wins(['shoji'] * 4, 1.5, 0.45, lit=(1, 2)), wins(['shoji', 'shoji', 'shoji'], 1.3, 0.5, lit=(1,)),
               wins(['board', 'shoji'], 1.0, 0.6), wins(['vent'], 0.8)],
            W=[wins(['board', 'shoji'], 1.3, 0.9), wins(['shoji'], 1.1), wins(['vent'], 0.7)]),
        ground=[('E', 0.6, 2.4, 'mado', dict(lit=(0, 1)), ROWS['window_g']), ('E', 3.6, 7.6, 'amado', dict()),
                ('E', 8.6, 10.8, 'mado', dict(), ROWS['window_g']),
                ('S', 1.0, 9.2, 'shoji', dict(lit=(1, 2, 5, 6))), ('S', 10.2, 15.6, 'amado', dict()),
                ('S', 16.6, 19.0, 'mado', dict(lit=(0,)), ROWS['window_g']),
                ('N', 1.2, 3.0, 'mado', dict(), ROWS['window_g']), ('N', 5.0, 6.8, 'amado', dict(), ROWS['door']),
                ('N', 9.0, 14.4, 'amado', dict()), ('N', 16.0, 18.0, 'mado', dict(), ROWS['window_g']),
                ('W', 2.0, 4.0, 'mado', dict(), ROWS['window_g']), ('W', 7.0, 9.5, 'amado', dict())],
        engawa=[('S', 0.6, 9.6)],
        pent=[('E', -0.3, 11.8, 2.55, 0.95, 'board', None)],
        dress=[('kaki', 'S', dict(u0=2.0, u1=5.0, z=2.25, d=1.15, n=6)), ('kaki', 'S', dict(u0=6.0, u1=8.6, z=2.25, d=1.15, n=5, seed=2)),
               ('ladder', 'N', dict(u=12.0, d0=1.9, d1=1.25, z1=3.3)),
               ('firewood', 'N', dict(u0=1.0, u1=4.5, d=0.5)), ('firewood', 'W', dict(u0=5.0, u1=10.5, d=0.5, seed=3)),
               ('straw', 'S', dict(u=11.0, d=1.0)), ('straw', 'S', dict(u=12.0, d=1.1, seed=2)),
               ('tub', 'N', dict(u=7.6, d=0.5)), ('buckets', 'E', dict(u=3.0, d=1.5)),
               ('pots', 'E', dict(u0=8.4, u1=10.8, d=0.35, seed=4))]),
    # guest house (minshuku): gable to the road, entrance with noren and a lit hearth room, lit windows above
    'M_Minshuku': dict(
        L=16.0, B=10.0, G=3.0, front='E', walls=dict(S=BOARD, E=TATE, N=BOARD, W=TATE),
        roof=dict(ov=1.1, eave=1.4, vt=1.6, seed=7, p_new=0.25, p_old=0.2),
        gables=dict(
            E=[wins(['shoji'] * 4, 1.3, 0.4, lit=(0, 1, 3)), wins(['shoji', 'shoji'], 1.3, 0.7, lit=(0, 1)),
               wins(['shoji'], 1.2, lit=(0,)), wins(['vent'], 0.6)],
            W=[wins(['shoji', 'board', 'shoji'], 1.2, 0.6, lit=(0,)), wins(['board'], 1.2), wins(['vent'], 0.6)]),
        ground=[('E', 0.5, 3.3, 'shoji', dict(lit=(0, 2))), ('E', 3.7, 6.5, 'shop', dict(img='INT_IRORI', depth=1.4)),
                ('E', 7.0, 9.4, 'mado', dict(lit=(0, 1)), ROWS['window_g']),
                ('S', 0.8, 8.0, 'shoji', dict(lit=True)), ('S', 9.0, 13.0, 'amado', dict()),
                ('S', 13.8, 15.4, 'mado', dict(lit=(0,)), ROWS['window_g']),
                ('N', 1.0, 2.8, 'mado', dict(lit=(1,)), ROWS['window_g']), ('N', 4.5, 6.3, 'amado', dict(), ROWS['door']),
                ('N', 8.0, 14.0, 'amado', dict()),
                ('W', 1.5, 3.3, 'mado', dict(), ROWS['window_g']), ('W', 5.0, 8.4, 'shoji', dict(lit=(0,)))],
        engawa=[('S', 0.4, 8.4)],
        pent=[('E', -0.3, 10.3, 2.55, 1.0, 'board', [0.2, 6.85, 9.8])],
        dress=[('roof_board', 'E', dict(img='KB0', uc=5.1, w=2.6, h=0.55, pent=0)),
               ('noren', 'E', dict(img='NOREN0', u0=3.9, u1=6.3, z=2.55, d=0.05, length=0.95)),
               ('andon', 'E', dict(img='ANDON0', u=3.5, z=1.75)), ('kv', 'E', dict(img='KV0', u=7.2, d=1.5)),
               ('plain_bench', 'E', dict(u=1.8, d=1.3)), ('buckets', 'E', dict(u=9.3, d=1.4)),
               ('pots', 'E', dict(u0=0.4, u1=1.2, d=1.3, seed=2)),
               ('kaki', 'S', dict(u0=1.5, u1=4.5, z=2.2, d=1.15, n=6)),
               ('firewood', 'N', dict(u0=9.0, u1=13.0, d=0.5, seed=5)), ('ladder', 'N', dict(u=3.6, d0=1.9, d1=1.25, z1=3.2)),
               ('tub', 'W', dict(u=4.4, d=0.5))]),
    # café: long side to the road, open front with tables inside, veranda with a red bench and parasol
    'M_Cafe': dict(
        L=14.0, B=9.5, G=2.9, front='S', walls=dict(S=BOARD, E=TATE, N=BOARD, W=TATE),
        roof=dict(ov=1.0, eave=1.4, vt=1.55, seed=11, p_new=0.35, p_old=0.15),
        gables=dict(
            E=[wins(['shoji', 'shoji', 'shoji'], 1.2, 0.5, lit=(1,)), wins(['shoji', 'board'], 1.1, 0.6, lit=(0,)), wins(['vent'], 0.6)],
            W=[wins(['shoji', 'shoji'], 1.2, 0.8, lit=(0,)), wins(['board'], 1.1), wins(['vent'], 0.6)]),
        ground=[('S', 0.6, 3.6, 'koshi', dict(lit=True)), ('S', 4.2, 8.2, 'shop', dict(img='INT_CAFE', depth=1.4)),
                ('S', 8.8, 13.2, 'shoji', dict(lit=(0, 1, 3))),
                ('E', 1.5, 3.3, 'mado', dict(lit=(0,)), ROWS['window_g']), ('E', 5.0, 7.0, 'amado', dict(), ROWS['door']),
                ('N', 1.0, 6.0, 'amado', dict()), ('N', 8.0, 9.8, 'mado', dict(), ROWS['window_g']),
                ('W', 2.0, 7.5, 'shoji', dict(lit=(1,)))],
        engawa=[('S', 8.6, 13.4)],
        dress=[('wall_board', 'S', dict(img='KB1', uc=6.2, w=2.4, h=0.5, z=2.12, d=0.12)),
               ('noren', 'S', dict(img='NOREN1', u0=4.4, u1=8.0, z=2.5, d=0.05, length=0.9)),
               ('andon', 'S', dict(img='ANDON1', u=4.0, z=1.7)), ('menu', 'S', dict(u=3.8, d=1.6)),
               ('nobori', 'S', dict(img='NOBORI0', u=8.6, d=2.1)), ('bench', 'S', dict(u=11.0, d=2.0, w=1.8)),
               ('kv', 'S', dict(img='KV1', u=0.3, d=1.4)), ('pots', 'S', dict(u0=0.6, u1=3.2, d=0.6, seed=6)),
               ('kaki', 'E', dict(u0=3.6, u1=6.0, z=2.25, d=0.35, n=4, seed=4)),
               ('firewood', 'N', dict(u0=7.0, u1=12.0, d=0.5, seed=8))]),
    # small farmhouse: two attic floors, snow boards along the sunny side (half put up), straw, firewood
    'S_Koya': dict(
        L=11.0, B=7.6, G=2.75, front='E', walls=dict(S=BOARD, E=TATE, N=BOARD, W=TATE),
        roof=dict(ov=0.95, eave=1.25, vt=1.45, eave_h=0.8, seed=13, p_new=0.1, p_old=0.45),
        gables=dict(
            E=[wins(['shoji', 'board'], 1.1, 0.6, lit=(0,)), wins(['board'], 1.0), wins(['vent'], 0.5)],
            W=[wins(['board', 'shoji'], 1.0, 0.6), wins(['vent'], 0.6)]),
        ground=[('E', 0.6, 2.4, 'amado', dict(), ROWS['door']), ('E', 3.6, 5.6, 'mado', dict(lit=(0,)), ROWS['window_g']),
                ('S', 0.8, 6.2, 'shoji', dict(lit=(2,))), ('S', 7.0, 10.0, 'amado', dict()),
                ('N', 1.5, 3.3, 'mado', dict(), ROWS['window_g']), ('N', 6.0, 7.6, 'amado', dict(), ROWS['door']),
                ('W', 2.6, 4.6, 'mado', dict(), ROWS['window_g'])],
        engawa=[('S', 0.5, 6.5)],
        yuki=[('S', 0.0, 11.0, 1.3, (True, False, True, True, False, True))],
        dress=[('straw', 'E', dict(u=6.5, d=1.0)), ('straw', 'E', dict(u=7.3, d=1.4, seed=3)),
               ('firewood', 'N', dict(u0=0.5, u1=5.0, d=0.5, seed=11)), ('firewood', 'W', dict(u0=0.5, u1=2.0, d=0.5, seed=12)),
               ('kaki', 'E', dict(u0=3.6, u1=5.6, z=2.05, d=0.3, n=4, seed=5, kind='daikon')),
               ('tub', 'E', dict(u=0.3, d=0.5)), ('kago', 'E', dict(u=2.9, d=0.5)), ('ladder', 'N', dict(u=8.6, d0=1.8, d1=1.1, z1=2.9))]),
    # Gokayama-style washi workshop: thatched pent roof along the gable, hooded windows, washi drying boards
    'M_Washi': dict(
        L=13.0, B=8.8, G=2.85, front='E', walls=dict(S=BOARD, E=BOARD, N=BOARD, W=TATE),
        roof=dict(ov=1.0, eave=1.35, vt=1.5, seed=17, p_new=0.2, p_old=0.3, slope=62.0),
        gables=dict(
            E=[wins(['shoji', 'shoji', 'shoji'], 1.1, 0.45, lit=(0, 2), hood=True), wins(['shoji', 'shoji'], 1.0, 0.6, lit=(1,), hood=True),
               wins(['vent'], 0.6)],
            W=[wins(['shoji', 'board'], 1.1, 0.7), wins(['vent'], 0.6)]),
        ground=[('E', 0.5, 4.3, 'shop', dict(img='INT_SHOP', depth=1.3)), ('E', 4.8, 8.3, 'koshi', dict(lit=True)),
                ('S', 1.0, 7.0, 'shoji', dict(lit=(0, 3))), ('S', 8.0, 12.0, 'amado', dict()),
                ('N', 2.0, 3.8, 'amado', dict(), ROWS['door']), ('N', 6.0, 11.0, 'mado', dict(), ROWS['window_g']),
                ('W', 2.4, 6.4, 'shoji', dict(lit=()))],
        engawa=[('S', 0.6, 7.4)],
        pent=[('E', -0.4, 9.2, 2.45, 1.2, 'thatch', [0.1, 4.55, 8.7])],
        dress=[('wall_board', 'E', dict(img='KB3', uc=2.4, w=2.4, h=0.5, z=2.0, d=0.12)),
               ('noren', 'E', dict(img='NOREN2', u0=0.8, u1=4.0, z=2.4, d=0.05, length=0.85)),
               ('kv', 'E', dict(img='KV2', u=4.55, d=1.7)), ('lamp', 'E', dict(u=8.5, z=1.9)),
               ('washi_boards', 'S', dict(u0=8.2, u1=11.6, d=1.0)),
               ('buckets', 'E', dict(u=6.6, d=1.6)), ('pots', 'E', dict(u0=7.4, u1=8.6, d=1.5, seed=9)),
               ('firewood', 'N', dict(u0=6.0, u1=11.0, d=0.5, seed=14))]),
}
FIELD = {   # quiet field-edge versions: shut, dark, farm things only
    'L_Honke_Field': ('L_Honke', 0.3),
    'S_Koya_Field': ('S_Koya', 0.3),
}
LIVELY = {'noren', 'nobori', 'kv', 'menu', 'bench', 'plain_bench', 'roof_board', 'wall_board', 'andon', 'lamp', 'washi_boards'}

SMALL = {   # small buildings: builder in the kit, footprint (x0, x1, y0, y1, height) for the collider
    'Itakura': ((-2.0, 2.0, -1.8, 1.8, 4.6),),
    'Naya': ((-3.0, 3.0, -2.2, 2.2, 5.0),),
    'Hosuiju': ((-1.1, 1.3, -1.0, 1.0, 3.1),),
    'Hokora': ((-0.9, 0.9, -1.3, 0.9, 2.1),),
}
PIECES = {
    'Road_8m': (lambda c: GK.road(c), (-4, 4, -2.3, 3.8, -0.5, 0.1)),
    'Paddy_8m': (lambda c: GK.paddy_edge(c), (-4, 4, 0.0, 6.0, -0.5, 0.0)),
    'Hasa_6m': (lambda c: GK.hasa(c), (-3.9, 3.9, -0.2, 0.2, 0.0, 3.2)),
}


def field(spec):
    """Shut the shop, storm boards, dark shoji, no signs or flags."""
    s = copy.deepcopy(spec)
    g = []
    for side, u0, u1, k, o, *rows in s['ground']:
        if k in ('shop', 'agedo'):
            k, o = 'amado', dict()
        elif k in ('koshi', 'shoji', 'mado'):
            o = dict(o, lit=False if k == 'koshi' else ())
        g.append((side, u0, u1, k, o, *rows))
    s['ground'] = g
    s['gables'] = {k: [[(w[0], w[1], w[2], dict(w[3], lit=False)) for w in row] for row in v] for k, v in s['gables'].items()}
    s['dress'] = [d for d in s['dress'] if d[0] not in LIVELY]
    return s


def edge_frame(L, B, e):
    corners = [(-L / 2, -B / 2), (L / 2, -B / 2), (L / 2, B / 2), (-L / 2, B / 2)]
    c0 = Vector((*corners[e], 0)); c1 = Vector((*corners[(e + 1) % 4], 0))
    t = (c1 - c0).normalized()
    f = KI.F(c0, (t.y, -t.x))
    f.u0, f.u1 = 0.0, (L, B, L, B)[e]
    return f


def _posts(items, Lw):
    us = [0.08, Lw - 0.08]
    spans = sorted((it[0], it[1]) for it in items)
    for (a0, a1), (b0, b1) in zip(spans, spans[1:]):
        if b0 - a1 >= 0.2:
            us.append((a1 + b0) / 2)
    return us


def turn(bm, front):
    bmesh.ops.rotate(bm, verts=list(bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(ANG[front], 3, 'Z'))


def tp(p, front):
    return Matrix.Rotation(ANG[front], 3, 'Z') @ Vector(p)


def _house(spec, lod):
    c = KK.C('Gassho', lod)
    L, B, G = spec['L'], spec['B'], spec['G']
    walls = [spec['walls'][s] for s in 'SENW']
    ops = [op(SIDES[it[0]], it[1], it[2], it[5] if len(it) > 5 else ROWS['ground'], it[3], **it[4]) for it in spec['ground']]
    sw = GK.Sweep(c, (-L / 2, -B / 2, L / 2, B / 2), GK.profile_ground(G, lod), ops, walls)
    slots = []
    for o in ops:
        face = sw.cell(o['e'], o['u'], o['rows'])
        opt = dict(o['opt'])
        opt.setdefault('wall', sw.walls[o['e']])
        slot = GK.MODULES[o['kind']](c, face, sw, opt)
        slot.update(e=o['e'], img=o['opt'].get('img'), lit=o['opt'].get('lit'))
        slots.append(slot)
    sw.map_walls()
    for s, e in SIDES.items():
        items = [(it[1], it[2]) for it in spec['ground'] if it[0] == s]
        GK.frame_posts(c, sw, e, _posts(items, (L, B, L, B)[e]), 0.4, G - 0.28)
    r = spec['roof']
    n_sp = max(1, round(L / 7.0))
    splits = [-L / 2 + L * i / n_sp for i in range(1, n_sp)] if lod == 0 else []
    tones = GK.tone_patches(r.get('seed', 0), n_sp, p_new=r.get('p_new', 0.18), p_old=r.get('p_old', 0.3))
    kw = {k: r[k] for k in ('ov', 'eave', 'vt', 'eave_h', 'slope') if k in r}
    roof = GK.thatch_roof(c, L, B, G, seed=r.get('seed', 0), tones=tones, splits=splits, **kw)
    T = roof['T']
    for s, sx in (('E', 1), ('W', -1)):
        GK.gable(c, L, B, T, sx, spec['gables'].get(s, []), reg=spec['walls'][s])
    for s, u0, u1 in spec.get('engawa', []):
        GK.engawa(c, sw.frame(SIDES[s]), u0, u1, seed=int(u0 * 10))
    for s, u0, u1, z_e, depth, kind, posts in spec.get('pent', []):
        GK.pent(c, sw.frame(SIDES[s]), u0, u1, z_e, depth, kind=kind, posts=posts)
    for s, u0, u1, d, boards in spec.get('yuki', []):
        GK.yukigakoi(c, sw.frame(SIDES[s]), u0, u1, d, h=min(2.3, G - 0.55), boards=boards)
    GK.drip_stones(c, L, B, T, roof['Xs'] - L / 2)
    return c, slots, roof


def _dress(spec, slots, lod):
    c = KK.C('GasshoShop', lod)
    L, B = spec['L'], spec['B']
    for s in slots:
        if s['kind'] == 'shop' and s.get('img'):
            KK.interior(c, s, s['img'])
    for kind, side, a in spec['dress']:
        f = edge_frame(L, B, SIDES[side])
        if kind == 'roof_board':
            p = spec['pent'][a.get('pent', 0)]
            z_e, depth = p[3], p[4]
            d = depth * 0.5
            base = z_e + 0.05 + (depth - d) * 0.45
            KK.board(c, f, a['uc'], a['w'], a['h'], base + 0.2, d + 0.04, a['img'], posts=base - 0.05)
        elif kind == 'wall_board':
            KK.board(c, f, a['uc'], a['w'], a['h'], a['z'], a.get('d', 0.09), a['img'])
        elif kind == 'andon':
            KI.kake_andon(c, f, a['u'], a['z'], a['img'])
        elif kind == 'noren':
            KK.noren(c, f, a['u0'], a['u1'], a['z'], a['d'], a['img'], length=a.get('length', 0.9))
        elif kind == 'nobori':
            KK.nobori(c, f, a['u'], a['d'], a['img'])
        elif kind == 'kv':
            KK.tate_board(c, f, a['u'], a['d'], a['img'])
        elif kind == 'bench':
            KK.bench(c, f, a['u'], a['d'], w=a.get('w', 1.8))
        elif kind == 'plain_bench':
            KI.plain_bench(c, f, a['u'], a['d'])
        elif kind == 'buckets':
            KK.buckets(c, f, a['u'], a['d'])
        elif kind == 'pots':
            KK.pots(c, f, a['u0'], a['u1'], a['d'], seed=a.get('seed', 0))
        elif kind == 'menu':
            KK.menu_stand(c, f, a['u'], a['d'])
        elif kind == 'lamp':
            KK.lamp(c, f, a['u'], a['z'])
        elif kind == 'firewood':
            KI.firewood(c, f, a['u0'], a['u1'], a['d'], seed=a.get('seed', 0))
        elif kind == 'kago':
            KI.kago(c, f, a['u'], a['d'])
        elif kind == 'kaki':
            GK.kaki(c, f, a['u0'], a['u1'], a['z'], a['d'], n=a.get('n', 5), seed=a.get('seed', 0), kind=a.get('kind', 'kaki'))
        elif kind == 'ladder':
            GK.ladder(c, f, a['u'], 0.0, a['z1'], a['d0'], a['d1'])
        elif kind == 'straw':
            GK.straw_stack(c, f, a['u'], a['d'], seed=a.get('seed', 0))
        elif kind == 'tub':
            GK.tub(c, f, a['u'], a['d'])
        elif kind == 'washi_boards':
            GK.washi_boards(c, f, a['u0'], a['u1'], a['d'])
        else:
            raise ValueError(f'unknown dressing {kind}')
    return c


def build_variant(key, spec, density=1.0, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Gassho')
    smat = K.atlas_material('GasshoShop', emission_strength=1.6)
    front = spec['front']
    objs, shop = [], []
    for lod in lods:
        c, slots, roof = _house(spec, lod)
        turn(c.bm, front)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _dress(spec, slots, lod)
        turn(cs.bm, front)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    L, B = spec['L'], spec['B']
    T = roof['T']
    for nm, (x0, x1, y0, y1, z0, z1) in (('Walls', (-L / 2 - 0.1, L / 2 + 0.1, -B / 2 - 0.1, B / 2 + 0.1, 0.0, T.zw)),
                                         ('Roof', (-roof['Xs'], roof['Xs'], -T.E, T.E, T.zw - 0.5, T.Zt))):
        ps = [tp((x, y, 0), front) for x in (x0, x1) for y in (y0, y1)]
        K.collider_box(f'COL_{name}_{nm}', col, min(p.x for p in ps), max(p.x for p in ps), min(p.y for p in ps),
                       max(p.y for p in ps), z0, z1)
    i = 0
    for s in slots:
        lit = s.get('lit')
        if not (s['kind'] == 'shop' or (s['kind'] in ('koshi', 'shoji') and lit)):
            continue
        if density < 0.6 and s['kind'] == 'shop':
            continue
        f = s['f']
        p = tp(f(f.uc, min(f.z1 - 0.4, 2.2), 0.6), front)
        K.light_marker(f'LIGHT_{name}_Shop{i}', col, tuple(p), color=(1.0, 0.68, 0.4), watts=40, unity_range=6.0)
        i += 1
    for kind, side, a in spec['dress']:
        if kind == 'andon':
            fr = edge_frame(L, B, SIDES[side])
            p = tp(fr(a['u'], a['z'] + 0.24, 0.42), front)
            K.light_marker(f'LIGHT_{name}_Andon{i}', col, tuple(p), color=(1.0, 0.75, 0.45), watts=12, unity_range=3.5)
            i += 1
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(T=round(T.Zt, 2))
    return col, objs


# ── small buildings ─────────────────────────────────────────────────────────

def _itakura(c, d):
    """Board storehouse on stones: raised floor, heavy door with lock, steps."""
    GK.small_house(c, 3.6, 2.7, 2.45, dict(ov=0.55, eave=0.7, vt=0.8, eave_h=0.5, sk=0.22, step=0.04, ridge='plain',
                                           rafters=False, poles=True, slope=56.0), raised=0.6, seed=21)
    f = KI.F(Vector((-1.8, -1.35, 0)), (0, -1))
    GK.door_board(c, f, 1.25, 2.35, 0.8, 2.15)
    for k, (z, dd) in enumerate(((0.2, 0.75), (0.4, 0.5), (0.6, 0.25))):
        c.box(f, 1.15, 2.45, 0.0, z, dd - 0.25, dd, 'STONE_FLAT', skip=('bot', 'in'))
    if d:
        KI.kago(d, f, 0.5, 0.4)
        GK.tub(d, f, 3.1, 0.4)


def _naya(c, d):
    """Open shed for firewood and tools: three board walls (both faces),
    posts at the open front, mini thatch roof; stacked wood inside."""
    L, B, G = 5.2, 3.4, 2.4
    fr = KI.F(Vector((0, 0, 0)), (0, -1))    # u = x, d = -y
    for x0, x1, y0, y1 in ((-L / 2, L / 2, B / 2 - 0.06, B / 2), (-L / 2, -L / 2 + 0.06, -B / 2, B / 2),
                           (L / 2 - 0.06, L / 2, -B / 2, B / 2)):
        for za, zb in ((0.0, G / 2), (G / 2, G)):   # two bands: the board strip is 1.5 m
            b = c.box(fr, x0, x1, za, zb, -y1, -y0, None, skip=('bot', 'top'))
            for k, f in b.items():
                c.m([f], 'WOOD_TATE', z0=za)
    for x in (-L / 2 + 0.06, 0.0, L / 2 - 0.06):
        c.box(fr, x - 0.08, x + 0.08, 0.0, G, B / 2 - 0.16, B / 2, 'WOOD', skip=('bot',), rotate=True, bevel=True)
    c.box(fr, -L / 2 - 0.05, L / 2 + 0.05, G - 0.18, G + 0.2, -B / 2 - 0.05, B / 2 + 0.05, 'WOOD', skip=('bot', 'top'))
    g = GK._face(c.bm, [c.bm.verts.new(p) for p in ((-L / 2, -B / 2, 0.01), (L / 2, -B / 2, 0.01), (L / 2, B / 2, 0.01),
                                                    (-L / 2, B / 2, 0.01))], (0, 0, 1))
    c.m([g], 'EARTH')
    out = GK.thatch_roof(c, L, B, G + 0.05, seed=23, ov=0.6, eave=0.8, vt=0.9, eave_h=0.55, sk=0.24, step=0.04,
                         ridge='plain', rafters=False, slope=56.0)
    T = out['T']
    for sx in (-1, 1):
        x = sx * L / 2
        f = GK._face(c.bm, [c.bm.verts.new(p) for p in ((x, -T.hw, G), (x, T.hw, G), (x, 0.0, T.Zu))], (sx, 0, 0))
        c.m([f], 'WOOD_TATE_FLAT')
    if d:
        fin = KI.F(Vector((-L / 2, B / 2 - 0.06, 0)), (0, -1))       # back wall seen from the open front
        KI.firewood(d, fin, 0.3, 2.4, 0.5, h=1.5, seed=31)
        KI.firewood(d, fin, 2.8, 4.9, 0.5, h=1.3, seed=32)
        GK.ladder(d, KI.F(Vector((-L / 2, -B / 2, 0)), (0, -1)), 4.6, 0.0, 2.3, 0.9, 0.12)
        KI.kago(d, KI.F(Vector((-L / 2, -B / 2, 0)), (0, -1)), 1.0, -0.6)


def _hosuiju(c, d):
    GK.hydrant_hut(c)
    if d:
        f = KI.F(Vector((0, -0.65, 0)), (0, -1))
        b = d.box(f, -0.36, 0.36, 0.95, 1.31, 0.035, 0.05, None, skip=('in',))
        d.m([b['out']], 'HOSUI'); d.m([b[k] for k in ('l', 'r', 'top', 'bot')], 'WHITE')


def _hokora(c, d):
    GK.shrine(c)
    if d:
        f = KI.F(Vector((0, -0.45, 0)), (0, -1))
        b = d.box(f, -0.13, 0.13, 0.85, 1.27, 0.0, 0.03, None, skip=('in',))
        d.m([b['out']], 'HOKORA'); d.m([b[k] for k in ('l', 'r', 'top', 'bot')], 'WOOD_DARK')
        for u in (-0.55, 0.55):   # offerings on the stone base: vases with sakaki
            p = f(u, 0, 0.1)
            s = K.lathe(d.bm, 6, [(0.05, 0.55), (0.06, 0.7), (0.035, 0.74)], cx=p.x, cy=p.y, cap_bottom=False)
            d.m(s['sides'] + [s['top']], 'WHITE'); d.nb(s['sides'])
            if d.lod == 0:
                lf = K.lathe(d.bm, 5, [(0.0, 0.72), (0.09, 0.82), (0.0, 0.95)], cx=p.x, cy=p.y)
                d.m(lf['sides'], 'LEAF'); d.nb(lf['sides'])


SMALL_FN = {'Itakura': _itakura, 'Naya': _naya, 'Hosuiju': _hosuiju, 'Hokora': _hokora}


def build_small(key, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Gassho')
    smat = K.atlas_material('GasshoShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c = KK.C('Gassho', lod)
        d = KK.C('GasshoShop', lod)
        SMALL_FN[key](c, d)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.015 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        if d.bm.faces:
            shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', d.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
        else:
            d.bm.free()
    (x0, x1, y0, y1, h), = SMALL[key]
    K.collider_box(f'COL_{name}', col, x0, x1, y0, y1, 0.0, h)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    return col, objs


def build_piece(key, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Gassho')
    fn, cb = PIECES[key]
    objs = []
    for lod in lods:
        c = KK.C('Gassho', lod)
        fn(c)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.012 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    K.collider_box(f'COL_{name}', col, *cb)
    return col, objs


def build():
    out = [build_variant(k, s) for k, s in HOUSES.items()]
    out += [build_variant(k, field(HOUSES[src]), dens) for k, (src, dens) in FIELD.items()]
    out += [build_small(k) for k in SMALL]
    out += [build_piece(k) for k in PIECES]
    print('dressing:', {c.name: list(c['shop_tris']) for c, _ in out if 'shop_tris' in c})
    return out


# ── scenes ──────────────────────────────────────────────────────────────────
ROAD_Y = 0.0
# village core: (name, (x, y), rotation) - houses north of the road face it (front -Y), south ones turned
CORE = [('M_Minshuku', (-14.0, 13.6), 0.0), ('Hosuiju', (-4.0, 5.2), 0.0), ('M_Cafe', (7.5, 9.6), 0.0),
        ('L_Honke', (27.0, 17.0), 0.0), ('Hokora', (17.5, 4.9), 0.0),
        ('M_Washi', (-6.0, -12.6), math.pi), ('Itakura', (6.0, -5.6), math.pi), ('S_Koya', (16.0, -11.8), math.pi)]
CORE_PIECES = [('Road_8m', (x, 0.0)) for x in (-20.0, -12.0, -4.0, 4.0, 12.0, 20.0, 28.0)]
# field edge: houses among paddies with drying racks
FX = 120.0
FIELD_SCENE = [('L_Honke_Field', (FX - 6.0, 16.5), 0.0), ('S_Koya_Field', (FX + 16.0, 11.0), 0.0), ('Naya', (FX + 6.0, 6.2), 0.0)]
FIELD_PIECES = [('Road_8m', (FX + x, 0.0), 0.0) for x in (-12.0, -4.0, 4.0, 12.0, 20.0)] + \
               [('Paddy_8m', (FX + x, -2.3), math.pi) for x in (-12.0, -4.0, 4.0, 12.0, 20.0)] + \
               [('Paddy_8m', (FX + x, -8.3), math.pi) for x in (-12.0, -4.0, 4.0, 12.0, 20.0)] + \
               [('Hasa_6m', (FX + 2.0, -5.5), 0.0), ('Hasa_6m', (FX + 12.0, -7.0), 0.0), ('Hasa_6m', (FX - 8.0, -6.0), 0.0)]
SCENE_PIECES = [(n, p, 0.0) for n, p in CORE_PIECES] + FIELD_PIECES

PROPS_CORE = [('StoneLantern', (-9.0, 3.6), 0.0), ('Fence_Ishigaki_2m', (-1.0, 3.9), 0.0), ('Bicycle_Mamachari_Cream', (2.2, 3.0), 2.9),
              ('Torii_Vermilion_S', (17.5, 3.1), 0.0)]
PROPS_FIELD = [('Fence_Bamboo_1_8m', (FX + 1.5, 4.2), 0.0), ('Rock_M_Moss', (FX - 9.0, 4.4), 0.0)]
assert not {p[0] for p in PROPS_CORE} & {p[0] for p in PROPS_FIELD}


def _move(cols_place, undo=False):
    for name, (x, y), rot in cols_place:
        col = __import__('bpy').data.collections[f'{NAME}_{name}']
        c, s = math.cos(rot), math.sin(rot)
        for o in col.objects:
            l = o.location.copy()
            if not undo:
                o.location = Vector((x + c * l.x - s * l.y, y + s * l.x + c * l.y, l.z)); o.rotation_euler.z += rot
            else:
                dx, dy = l.x - x, l.y - y
                o.location = Vector((c * dx + s * dy, -s * dx + c * dy, l.z)); o.rotation_euler.z -= rot


def _props(props, undo=False):
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


def _pieces(undo=False):
    """Village pieces into a temporary collection (linked copies), plus a
    ground plate with holes where the channel and paddies dip below 0."""
    import bpy
    tmp = bpy.data.collections.get('GasshoScene') or bpy.data.collections.new('GasshoScene')
    if undo:
        for o in list(tmp.objects):
            bpy.data.objects.remove(o)
        for me in [m for m in bpy.data.meshes if m.name.startswith('GasshoGround') and not m.users]:
            bpy.data.meshes.remove(me)
        if tmp.name in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.unlink(tmp)
        return tmp
    if tmp.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(tmp)
    for name, (x, y), rot in SCENE_PIECES:
        o = bpy.data.objects[f'SM_{NAME}_{name}_LOD0'].copy()
        o.hide_render = False
        tmp.objects.link(o)
        o.location = (x, y, 0.0); o.rotation_euler.z = rot
    # grass-coloured ground at 0 around both scenes, holes over the road strips and paddies
    holes = [(-24.0, 32.0, -2.3, 3.7), (FX - 16.0, FX + 24.0, -14.3, 3.7)]
    me = bpy.data.meshes.new('GasshoGround')
    vs, fs = [], []
    s = 200.0
    xs = sorted({-s, s} | {h[0] for h in holes} | {h[1] for h in holes})
    ys = sorted({-s, s} | {h[2] for h in holes} | {h[3] for h in holes})
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if any(h[0] < cx < h[1] and h[2] < cy < h[3] for h in holes):
                continue
            k = len(vs)
            vs += [(xs[i], ys[j], -0.01), (xs[i + 1], ys[j], -0.01), (xs[i + 1], ys[j + 1], -0.01), (xs[i], ys[j + 1], -0.01)]
            fs.append((k, k + 1, k + 2, k + 3))
    me.from_pydata(vs, [], fs)
    m = bpy.data.materials.get('M_PreviewGrass') or bpy.data.materials.new('M_PreviewGrass')
    m.use_nodes = True
    b = K._principled(m.node_tree)
    b.inputs['Base Color'].default_value = (0.05, 0.065, 0.03, 1)
    b.inputs['Roughness'].default_value = 0.9
    me.materials.append(m)
    g = bpy.data.objects.new('GasshoGround', me)
    tmp.objects.link(g)
    return tmp


def preview(results, views):
    """Default build preview: the village core from above (+ clay)."""
    from kit import preview as P
    _move(CORE)
    try:
        keys = [n for n, _, _ in CORE]
        objs = [o for c, _ in results if c.name[len(NAME) + 1:] in keys for o in c.objects
                if o.type == 'MESH' and o.name.endswith('LOD0')]
        show = [f'{NAME}_{k}' for k in keys]
        a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(1024, 576), show=show)
        b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(1024, 576), show=show)
    finally:
        _move(CORE, undo=True)
    return f'{a}, {b}'


ALL = list(HOUSES) + list(FIELD) + list(SMALL)


def _spec(k):
    return HOUSES[k] if k in HOUSES else field(HOUSES[FIELD[k][0]])


def shots(out_dir):
    """Village core at eye level (mood + neutral), from above, clay; field
    edge; every building front/back/clay; pieces; close-ups."""
    import bpy, os
    from kit import preview as P
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n)
    P.stage(True)
    ground = bpy.data.objects['PreviewGround']
    _move(CORE); _move([(n, p, r) for n, p, r in FIELD_SCENE])
    _props(PROPS_CORE); _props(PROPS_FIELD)
    _pieces()
    ground.location.z = -0.6
    try:
        cc = [f'{NAME}_{n}' for n, _, _ in CORE] + [p[0] for p in PROPS_CORE] + ['GasshoScene']
        fc = [f'{NAME}_{n}' for n, _, _ in FIELD_SCENE] + [p[0] for p in PROPS_FIELD] + ['GasshoScene']
        P.shot(cc, (6, 1.5, 3.6), (-1, -0.1, -0.02), 24, o('core_eye.png'), mood=True, lens=22)
        P.shot(cc, (4, 1.5, 3.6), (1, -0.08, -0.02), 22, o('core_eye2.png'), lens=22)
        P.shot(cc, (5, 2, 2.0), (0.6, -0.75, 0.9), 55, o('core_high.png'), mood=True, lens=30)
        P.shot(cc, (5, 2, 2.0), (0.6, -0.75, 0.9), 55, o('core_high_neutral.png'), lens=30)
        P.shot(cc, (4, 1.5, 3.6), (1, -0.08, -0.02), 22, o('core_clay.png'), mood='clay', lens=22)
        P.shot(fc, (FX + 4, 2, 4.0), (0.35, -1, 0.12), 30, o('field_eye.png'), mood=True, lens=26)
        P.shot(fc, (FX + 4, 2, 4.0), (0.35, -1, 0.12), 30, o('field_neutral.png'), lens=26)
        P.shot(fc, (FX + 4, 2, 4.0), (0.35, -1, 0.12), 30, o('field_clay.png'), mood='clay', lens=26)
    finally:
        ground.location.z = 0.0
        _pieces(undo=True)
        _props(PROPS_CORE, True); _props(PROPS_FIELD, True)
        _move(CORE, undo=True); _move([(n, p, r) for n, p, r in FIELD_SCENE], undo=True)
    for k in ALL:
        if k in SMALL:
            h = SMALL[k][0][4]
            dist = 2.6 * h + 2.0
            for pre, dirn, mood in (('h', (0.6, -1, 0.3), False), ('k', (0.6, -1, 0.3), 'clay'), ('b', (-0.6, 1, 0.3), False)):
                P.shot([f'{NAME}_{k}'], (0, 0, h * 0.45), dirn, dist, o(f'{pre}_{k}.png'), mood=mood, size=(640, 480), lens=35)
            continue
        s = _spec(k)
        dep = s['L'] if s['front'] in 'EW' else s['B']
        wid = s['B'] if s['front'] in 'EW' else s['L']
        dist = 22 + wid * 1.2
        tz = 6.5
        P.shot([f'{NAME}_{k}'], (0, 0, tz), (0.55, -1, 0.22), dist, o(f'h_{k}.png'), size=(640, 480), lens=35)
        P.shot([f'{NAME}_{k}'], (0, 0, tz), (0.55, -1, 0.22), dist, o(f'k_{k}.png'), mood='clay', size=(640, 480), lens=35)
        if k in HOUSES:
            P.shot([f'{NAME}_{k}'], (0, 0, tz), (-0.6, 1, 0.25), dist, o(f'b_{k}.png'), size=(640, 480), lens=35)
    for k in PIECES:
        P.shot([f'{NAME}_{k}'], (0, 1.0 if 'Paddy' in k else 0, 0.6), (0.6, -1, 0.6), 8.5, o(f'p_{k}.png'), size=(640, 480), lens=35)
    for k, tgt, dirn, dist, name, mood in (
            ('M_Minshuku', (0.0, -8.6, 2.0), (0.45, -1, 0.12), 8.0, 'c_entrance', True),
            ('M_Minshuku', (-2.5, -8.0, 6.0), (0.5, -1, 0.15), 8.0, 'c_gable', False),
            ('L_Honke', (6.6, -10.6, 2.7), (0.8, -1, -0.12), 6.5, 'c_eave', False),
            ('L_Honke', (-6.2, 2.0, 1.5), (-1, -0.3, 0.15), 6.5, 'c_engawa', False),
            ('L_Honke', (0.0, -6.0, 14.6), (1, -0.35, 0.45), 9.0, 'c_ridge', False),
            ('M_Cafe', (1.0, -5.2, 1.6), (0.45, -1, 0.18), 7.0, 'c_cafe', True),
            ('S_Koya', (-4.6, -1.5, 1.6), (-1, -0.45, 0.2), 6.5, 'c_yuki', False),
            ('M_Washi', (0.0, -7.6, 2.3), (0.5, -1, 0.15), 8.0, 'c_washi', False)):
        P.shot([f'{NAME}_{k}'], tgt, dirn, dist, o(name + '.png'), mood=mood, size=(640, 480), lens=35)
