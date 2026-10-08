"""Kiso post town (Nakasendō, Tsumago/Magome/Narai-like) - houses as data,
from the Kiso kit, plus the street pieces.

Main street: two-storey inns (hatago) and shops of dark weathered boards,
upper floor projecting on beam ends (dashi-bari) or a shingled pent roof
over the ground floor, projecting lattice (dejōshi), lattice windows above,
a railing with bamboo blinds, low board-shingle roofs weighted with stones
or tile roofs, fire wing walls (sode-udatsu), a house on a high ishigaki
plinth with stairs. Each FBX holds the house (SM_<name>_LOD0/1, atlas Kiso)
and its shop dressing (SM_<name>_Shop_LOD0/1, atlas KisoShop: interior,
signboards, wall lanterns, noren, chōchin, wares, firewood ...).
density < 0.6 gives the quiet lane version: shop shut, lattice dark, no
wares or flags, pots and firewood stay.
Street pieces (atlas Kiso): Street_8m (earth road, water channel with
stone curbs and slab bridges), Street_Steps_8m (stone steps up a slope),
Trough (water place), Waterwheel.

Coordinates in a spec: u along the wall from its left corner (front: from
x = -W/2), z up, d out of the wall. Edge 0 = front (-Y), 1 = right (+X),
2 = back. Dressing d on the front is measured from the ground-floor wall;
the upper wall stands P further out.
"""
import copy
import math
import bmesh
from mathutils import Vector
from kit import core as K
from buildings import koedo_kit as KK
from buildings import kiso_kit as KI
from buildings.kiso_kit import op, ROWS

KLASS = 'buildings'
NAME = 'Kiso'

TATE, BOARD, EARTH = 'WOOD_TATE', 'WOOD_BOARD', 'PLASTER_EARTH'

HOUSES = {
    # big inn: upper floor on beam ends, lattice above and below, stone roof, fire wing walls both ends
    'Hatago_3Bay_Kaede': dict(
        W=8.2, D=9.0, G=2.9, U=2.1, P=0.75, side=EARTH,
        ground=[(0.25, 2.95, 'dejoshi', dict()), (3.15, 5.45, 'shop', dict(img='INT_INN', depth=1.6)),
                (5.65, 7.95, 'dejoshi', dict(lit=(1,)))],
        upper=[(0.45, 3.85, 'koshi_u', dict(lit=(0, 2, 3))), (4.35, 7.75, 'koshi_u', dict(lit=(1,)))],
        back=[(3.3, 4.9, 'koshi_u', dict())],
        roof=dict(kind='board', slope=0.3, eave_f=1.15, eave_b=0.85, oh=0.75, rows=(3, 1), seed=1),
        udatsu=(True, True),
        dress=[('noren', 0, dict(img='NOREN0', u0=3.35, u1=5.25, z=2.66, d=0.05, length=0.95)),
               ('hang_board', 0, dict(img='KB0', uc=4.3, w=2.4, h=0.5, z=2.0, d=1.05, rod_top=2.66)),
               ('andon', 0, dict(img='ANDON0', u=5.62, z=1.85)),
               ('chochin', 0, dict(img='CHOCHIN0', u=2.95, z=1.85, d=0.85, hang=0.25)),
               ('plain_bench', 0, dict(u=1.6, d=0.75)),
               ('kv', 0, dict(img='KV3', u=3.0, d=0.45)),
               ('buckets', 0, dict(u=7.3, d=0.75)),
               ('pots', 0, dict(u0=5.9, u1=6.7, d=0.6, seed=3)),
               ('firewood', 2, dict(u0=5.3, u1=7.2, d=0.5))]),
    # inn with tile roof and an open upper room behind a railing, bamboo blinds
    'Hatago_2Bay_Yamabuki': dict(
        W=6.4, D=9.0, G=2.85, U=2.2, P=0.6, side=EARTH,
        ground=[(0.25, 3.35, 'koshi', dict(lit=True)), (3.55, 6.15, 'shop', dict(img='INT_INN', depth=1.4))],
        upper=[(0.3, 6.1, 'rail', dict(lit=(1, 3, 5)), ROWS['upper_tall'])],
        back=[(2.4, 4.0, 'koshi_u', dict())],
        roof=dict(kind='tile', slope=0.45, eave=1.0, oh=0.55, gutter=True),
        dress=[('noren', 0, dict(img='NOREN0', u0=3.75, u1=5.95, z=2.6, d=0.05, length=0.9)),
               ('andon', 0, dict(img='ANDON1', u=3.45, z=1.8)),
               ('chochin', 0, dict(img='CHOCHIN1', u=6.0, z=1.85, d=0.72, hang=0.2)),
               ('sudare', 0, dict(u0=0.6, u1=2.7, z0=4.45, z1=5.3, d=1.0)),
               ('sudare', 0, dict(u0=3.9, u1=5.8, z0=4.75, z1=5.3, d=1.0)),
               ('buckets', 0, dict(u=1.2, d=0.5)),
               ('pots', 0, dict(u0=2.0, u1=3.2, d=0.35, seed=5)),
               ('firewood', 2, dict(u0=0.8, u1=2.4, d=0.5, seed=2))]),
    # soba shop: no projection, shingled pent roof with stones, lift-up shutters and fold-down bench
    'Soba_2Bay_Kodama': dict(
        W=6.6, D=8.0, G=2.8, U=1.6, P=0.0, side=EARTH,
        ground=[(0.25, 4.25, 'agedo', dict(img='INT_SOBA', depth=1.2)), (4.45, 6.35, 'shop', dict(img='INT_SOBA', depth=1.3))],
        upper=[(0.6, 2.9, 'koshi_u', dict(lit=(0, 1))), (3.7, 6.0, 'koshi_u', dict())],
        back=[(2.6, 4.0, 'koshi_u', dict())],
        hisashi=dict(u0=-0.1, u1=6.7, z_e=2.95, depth=1.25, slope=0.3, stones=True),
        roof=dict(kind='board', slope=0.32, eave_f=0.85, eave_b=0.8, oh=0.6, rows=(2, 1), seed=3),
        dress=[('roof_board', 0, dict(img='KB2', uc=2.2, w=2.4, h=0.5)),
               ('noren', 0, dict(img='NOREN1', u0=4.6, u1=6.2, z=2.56, d=0.05, length=0.85)),
               ('kv', 0, dict(img='KV1', u=6.45, d=0.5)),
               ('andon', 0, dict(img='ANDON2', u=4.35, z=1.75)),
               ('nobori', 0, dict(img='NOBORI1', u=-0.25, d=1.5)),
               ('buckets', 0, dict(u=0.6, d=1.55)),
               ('firewood', 2, dict(u0=3.8, u1=5.8, d=0.5, seed=4))]),
    # lacquer and comb shop: tile roof, fire wing walls, open shop with bowls and bentwood boxes
    'Shop_2Bay_Nushiya': dict(
        W=6.0, D=8.5, G=2.85, U=2.0, P=0.55, side=EARTH,
        ground=[(0.25, 3.95, 'shop', dict(img='INT_CRAFT', depth=1.2)), (4.15, 5.75, 'koshi', dict(lit=True))],
        upper=[(0.5, 2.7, 'koshi_u', dict(lit=(0,))), (3.3, 5.5, 'koshi_u', dict(lit=(0, 1)))],
        back=[(2.2, 3.8, 'koshi_u', dict())],
        roof=dict(kind='tile', slope=0.45, eave=1.0, oh=0.5),
        udatsu=(True, True),
        dress=[('hang_board', 0, dict(img='KB3', uc=2.1, w=2.4, h=0.5, z=2.05, d=0.86, rod_top=2.61)),
               ('wares', 0, dict(kind='bowls', u0=0.5, u1=2.0, d0=-0.05, zb=0.36)),
               ('wares', 0, dict(kind='magemono', u0=2.2, u1=3.7, d0=-0.05, zb=0.36, seed=2)),
               ('kv', 0, dict(img='KV0', u=4.05, d=0.45)),
               ('lamp', 0, dict(u=5.85, z=2.0)),
               ('pots', 0, dict(u0=4.3, u1=5.6, d=0.3, seed=6))]),
    # general goods (straw, baskets) on a high stone plinth with stairs, shingled pent roof
    'Minka_2Bay_Ishigaki': dict(
        W=6.2, D=8.0, G=2.7, U=1.5, P=0.0, side=EARTH,
        ground=[(0.3, 3.6, 'shop', dict(img='INT_STRAW', depth=1.2)), (3.8, 5.9, 'closed', dict(style='boards'))],
        upper=[(0.8, 2.6, 'koshi_u', dict(lit=(0,))), (3.4, 5.4, 'koshi_u', dict())],
        back=[(2.4, 3.8, 'koshi_u', dict())],
        hisashi=dict(u0=-0.1, u1=6.3, z_e=2.85, depth=1.0, slope=0.3, stones=True),
        roof=dict(kind='board', slope=0.32, eave_f=0.8, eave_b=0.8, oh=0.6, rows=(2, 1), seed=5),
        plinth=dict(H=1.5, front=1.3, stair_x=-3.35),
        dress=[('waraji', 0, dict(u0=0.5, u1=2.3, z=2.75, d=0.75)),
               ('wares', 0, dict(kind='baskets', u0=2.2, u1=3.4, d0=-0.05, zb=0.36, seed=4)),
               ('kago', 0, dict(u=3.0, d=0.65)), ('kago', 0, dict(u=3.35, d=0.95, r=0.18, h=0.34)),
               ('firewood', 0, dict(u0=4.0, u1=5.8, d=0.55, seed=7)),
               ('roof_board', 0, dict(img='KB5', uc=2.0, w=2.6, h=0.5)),
               ('pots', 0, dict(u0=0.1, u1=1.3, d=1.0, seed=8))]),
    # sake shop: large, cedar ball under the projection, casks before the shutters, gutter
    'Sake_3Bay_Yamagiri': dict(
        W=8.6, D=9.5, G=3.0, U=2.2, P=0.7, side=EARTH,
        ground=[(0.25, 3.15, 'koshi', dict(lit=True)), (3.35, 6.15, 'shop', dict(img='INT_SAKE', depth=1.4)),
                (6.35, 8.35, 'closed', dict(style='boards'))],
        upper=[(0.45, 4.05, 'koshi_u', dict(lit=(0, 1, 3))), (4.6, 8.15, 'koshi_u', dict())],
        back=[(3.5, 5.1, 'koshi_u', dict())],
        roof=dict(kind='board', slope=0.3, eave_f=1.1, eave_b=0.85, oh=0.7, rows=(3, 1), seed=7, gutter=True),
        udatsu=(False, True),
        dress=[('sugidama', 0, dict(u=3.2, z=2.0, d=0.9, hang=0.3)),
               ('hang_board', 0, dict(img='KB4', uc=4.75, w=2.4, h=0.5, z=2.12, d=1.02, rod_top=2.76)),
               ('noren', 0, dict(img='NOREN2', u0=3.55, u1=5.95, z=2.76, d=0.05, length=0.95)),
               ('cask', 0, dict(u=6.7, d=0.45)), ('cask', 0, dict(u=7.35, d=0.45)), ('cask', 0, dict(u=7.02, d=0.45, z=0.5)),
               ('buckets', 0, dict(u=1.6, d=0.55)),
               ('lamp', 0, dict(u=8.45, z=2.2)),
               ('firewood', 2, dict(u0=1.0, u1=3.0, d=0.5, seed=9))]),
    # one-storey tea house (gohei-mochi): deep stone pent roof, lift-up shutters, bench with parasol
    'Chaya_1F_Gohei': dict(
        W=5.2, D=6.0, G=2.6, U=1.1, P=0.0, side=EARTH,
        ground=[(0.2, 5.0, 'agedo', dict(img='INT_GOHEI', depth=1.1))],
        upper=[(1.4, 3.8, 'koshi_u', dict(lit=(0, 1)))],
        back=[(1.8, 3.4, 'koshi_u', dict())],
        hisashi=dict(u0=-0.1, u1=5.3, z_e=2.72, depth=1.5, slope=0.28, stones=True),
        roof=dict(kind='board', slope=0.32, eave_f=0.8, eave_b=0.7, oh=0.5, rows=(2, 1), seed=9),
        dress=[('roof_board', 0, dict(img='KB6', uc=2.6, w=2.2, h=0.5)),
               ('bench', 0, dict(u=1.3, d=2.3, w=1.6)),
               ('nobori', 0, dict(img='NOBORI0', u=5.35, d=1.6)),
               ('menu', 0, dict(u=4.1, d=1.75)),
               ('andon', 0, dict(img='ANDON3', u=5.12, z=1.7)),
               ('pots', 0, dict(u0=0.1, u1=0.9, d=1.7, seed=10))]),
}
LANE = {   # quiet lane versions: shops shut, lattice dark
    'Hatago_3Bay_Kaede_Lane': ('Hatago_3Bay_Kaede', 0.3),
    'Soba_2Bay_Kodama_Lane': ('Soba_2Bay_Kodama', 0.3),
    'Minka_2Bay_Ishigaki_Lane': ('Minka_2Bay_Ishigaki', 0.3),
}
LIVELY = {'noren', 'nobori', 'wares', 'display', 'cask', 'bench', 'plain_bench', 'menu', 'kv', 'chochin', 'sugidama',
          'waraji', 'kago', 'sudare'}
STREET_PIECES = ('Street_8m', 'Street_Steps_8m', 'Trough', 'Waterwheel')


def lane(spec):
    """Shut the shops, dark lattice, drop wares and flags, pots out front."""
    s = copy.deepcopy(spec)
    g = []
    for u0, u1, k, o, *rows in s['ground']:
        if k in ('shop', 'agedo'):
            k, o = 'closed', dict(style='boards')
        elif k in ('koshi', 'dejoshi'):
            o = dict(o, lit=False)
        g.append((u0, u1, k, o, *rows))
    s['ground'] = g
    s['upper'] = [(u[0], u[1], u[2], {**u[3], 'lit': (0,) if i == 0 else ()}, *u[4:]) for i, u in enumerate(s['upper'])]
    s['dress'] = [d for d in s['dress'] if d[0] not in LIVELY]
    W = s['W']
    s['dress'].append(('pots', 0, dict(u0=0.3, u1=min(W - 0.3, 2.2), d=0.3 if not s.get('plinth') else 1.0, seed=7)))
    return s


def edge_frame(W, D, e):
    corners = [(-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, D / 2), (-W / 2, D / 2)]
    c0 = Vector((*corners[e], 0)); c1 = Vector((*corners[(e + 1) % 4], 0))
    t = (c1 - c0).normalized()
    f = KI.F(c0, (t.y, -t.x))
    f.u0, f.u1 = 0.0, (W, D, W, D)[e]
    return f


def _bays(W, step=1.8, inset=0.1):
    n = max(1, round((W - 2 * inset) / step))
    return [-W / 2 + inset + (W - 2 * inset) * i / n for i in range(n + 1)]


def _back_ground(spec):
    """Back of every house: a board door and a lattice window."""
    W = spec['W']
    return [(0.8, 1.7, 'closed', dict(style='boards'), ROWS['door']),
            (W - 2.4, W - 1.0, 'koshi_u', dict(), ROWS['window_g'])]


def _posts(items, L):
    """Posts at both corners and in every gap between openings."""
    us = [0.07, L - 0.07]
    spans = sorted((it[0], it[1]) for it in items)
    for (a0, a1), (b0, b1) in zip(spans, spans[1:]):
        if b0 - a1 >= 0.1:
            us.append((a1 + b0) / 2)
    return us


def _hz(h):
    th = 0.06
    return lambda d: h['z_e'] + th + (h['depth'] - d) * h.get('slope', 0.3)


def _house(spec, lod):
    c = KK.C('Kiso', lod)
    W, D, G, U, P = spec['W'], spec['D'], spec['G'], spec['U'], spec.get('P', 0.0)
    side = spec.get('side', EARTH)
    walls_g = [spec.get('front_g', TATE), side, BOARD, side]
    walls_u = [spec.get('front_u', TATE), side, BOARD, side]
    back_ground = spec.get('back_ground', _back_ground(spec))

    def ops(lst, e, rows):
        return [op(e, it[0], it[1], it[4] if len(it) > 4 else rows, it[2], **it[3]) for it in lst]
    ops_g = ops(spec['ground'], 0, ROWS['ground']) + ops(back_ground, 2, ROWS['ground'])
    ops_u = ops(spec.get('upper', []), 0, ROWS['upper']) + ops(spec.get('back', []), 2, ROWS['upper'])
    sw_g = KI.Sweep(c, (-W / 2, -D / 2, W / 2, D / 2), KI.profile_ground(G, lod), ops_g, walls_g)
    pts, meta, z_top = KI.profile_upper(G, U, lod)
    sw_u = KI.Sweep(c, (-W / 2, -D / 2 - P, W / 2, D / 2), (pts, meta), ops_u, walls_u)
    slots = []
    for sw, oo in ((sw_g, ops_g), (sw_u, ops_u)):
        for o in oo:
            face = sw.cell(o['e'], o['u'], o['rows'])
            opt = dict(o['opt'])
            opt.setdefault('wall', sw.walls[o['e']])
            slot = KI.MODULES[o['kind']](c, face, sw, opt)
            slot.update(e=o['e'], img=o['opt'].get('img'), lit=o['opt'].get('lit'), storey='g' if sw is sw_g else 'u')
            slots.append(slot)
    sw_g.map_walls(); sw_u.map_walls()
    zu, zw = G + 0.28, G + 0.28 + U
    # exposed timber: posts on the front between openings, framed plaster sides
    KI.frame_timber(c, sw_g, 0, _posts(spec['ground'], W), 0.36, G - 0.22)
    KI.frame_timber(c, sw_u, 0, _posts(spec.get('upper', []), W), zu, zw)
    for e in (1, 3):   # side walls: every 2.7 m (mostly hidden by the neighbours)
        n = max(1, round(D / 2.7))
        KI.frame_timber(c, sw_g, e, [0.07 + (D - 0.14) * i / n for i in range(n + 1)], 0.36, G - 0.22, nuki=(1.45,))
        n = max(1, round((D + P) / 2.7))
        KI.frame_timber(c, sw_u, e, [0.07 + (D + P - 0.14) * i / n for i in range(n + 1)], zu, zw, nuki=(zu + 0.9,))
    bays = _bays(W)
    if P > 0:
        KI.projection(c, W, D, P, G, bays)
    yf, yb = -D / 2 - P - 0.06, D / 2 + 0.06
    r = spec['roof']
    if r['kind'] == 'board':
        roof = KI.board_roof(c, W, yf, yb, z_top, slope=r['slope'], eave_f=r['eave_f'], eave_b=r['eave_b'], oh=r['oh'],
                             rows=r['rows'], seed=r.get('seed', 0), brackets=[x for x in bays if abs(x) < W / 2 - 0.3],
                             gutter=r.get('gutter', False))
    else:
        roof = KI.tile_roof(c, W, yf, yb, z_top, 0.06, slope=r['slope'], eave=r['eave'], oh=r['oh'],
                            gutter=r.get('gutter', False))
    KI.gable(c, W, yf, yb, z_top, r['slope'], side)
    fu = sw_u.frame(0)
    for (on, u, sg) in zip(spec.get('udatsu', (False, False)), (0.0, W), (1, -1)):
        if on:
            KI.sode_udatsu(c, fu, u, sg, G, z_top - 0.42, 0.45)
    h = spec.get('hisashi')
    if h:
        f0 = sw_g.frame(0)
        KI.board_hisashi(c, f0, h['u0'], h['u1'], h['z_e'], h['depth'], slope=h.get('slope', 0.3),
                         stones=h.get('stones', True), brackets=[x + W / 2 for x in bays], seed=r.get('seed', 0))
    fb = sw_g.frame(2)
    for u0, u1, k, o, *_ in back_ground:   # small pent roof over the back door, downpipe beside it
        if k == 'closed':
            KI.board_hisashi(c, fb, u0 - 0.35, u1 + 0.35, 2.3, 0.7, slope=0.3, stones=False, brackets=[u0 - 0.2, u1 + 0.2])
            KI.downpipe(c, fb, max(0.15, u0 - 0.6), 0.0, z_top - 0.2)
    if r.get('gutter'):
        KI.downpipe(c, edge_frame(W, D, 1), 0.15, 0.0, z_top - 0.1)
    pl = spec.get('plinth')
    if pl:
        bmesh.ops.translate(c.bm, verts=list(c.bm.verts), vec=(0, 0, pl['H']))
        KI.plinth(c, W, D, pl['H'], front=pl.get('front', 1.3), stair_x=pl.get('stair_x'))
    return c, slots, roof, z_top


def _dress(spec, slots, lod, density):
    c = KK.C('KisoShop', lod)
    W, D, G, P = spec['W'], spec['D'], spec['G'], spec.get('P', 0.0)
    H = spec.get('plinth', {}).get('H', 0.0)
    for s in slots:
        if s['kind'] == 'shop' and s.get('img'):
            KK.interior(c, s, s['img'])
    for kind, e, a in spec['dress']:
        before = set(c.bm.verts)
        f = edge_frame(W, D, e)
        if kind == 'roof_board':
            h = spec['hisashi']
            d = h['depth'] * 0.5
            base = _hz(h)(d)
            KK.board(c, f, a['uc'], a['w'], a['h'], base + 0.2, d + 0.04, a['img'], posts=base - 0.05)
        elif kind == 'hang_board':
            KI.hang_board(c, f, a['uc'], a['w'], a['h'], a['z'], a['d'], a['img'], a['rod_top'])
        elif kind == 'wall_board':
            KK.board(c, f, a['uc'], a['w'], a['h'], a['z'], a.get('d', 0.09) + (P if a['z'] > G else 0), a['img'])
        elif kind == 'andon':
            KI.kake_andon(c, f, a['u'], a['z'], a['img'])
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
        elif kind == 'cask':
            KK.cask(c, f, a['u'], a['d'], z=a.get('z', 0.0))
        elif kind == 'bench':
            KK.bench(c, f, a['u'], a['d'], w=a.get('w', 1.8))
        elif kind == 'plain_bench':
            KI.plain_bench(c, f, a['u'], a['d'])
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
        elif kind == 'firewood':
            KI.firewood(c, f, a['u0'], a['u1'], a['d'], seed=a.get('seed', 0))
        elif kind == 'waraji':
            KI.waraji(c, f, a['u0'], a['u1'], a['z'], a['d'])
        elif kind == 'wares':
            KI.wares(c, f, a['u0'], a['u1'], a['d0'], a['kind'], seed=a.get('seed', 0), zb=a.get('zb', 0.0))
        elif kind == 'kago':
            KI.kago(c, f, a['u'], a['d'], r=a.get('r', 0.22), h=a.get('h', 0.4))
        else:
            raise ValueError(f'unknown dressing {kind}')
        if H and not a.get('street'):
            bmesh.ops.translate(c.bm, verts=[v for v in c.bm.verts if v not in before], vec=(0, 0, H))
    return c


def build_variant(key, spec, density=1.0, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Kiso')
    smat = K.atlas_material('KisoShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, slots, roof, z_top = _house(spec, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _dress(spec, slots, lod, density)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0,
                                  recalc=False))
    W, D, P = spec['W'], spec['D'], spec.get('P', 0.0)
    H = spec.get('plinth', {}).get('H', 0.0)
    K.collider_box(f'COL_{name}_Walls', col, -W / 2 - 0.1, W / 2 + 0.1, -D / 2 - P - 0.1, D / 2 + 0.1, 0.0, z_top + H)
    K.collider_box(f'COL_{name}_Roof', col, -roof['x'], roof['x'], -roof['eave_y'], D / 2 + 1.0, z_top + H, roof['ridge'] + H)
    i = 0
    for s in slots:
        lit = s.get('lit')
        if s['e'] != 0 or s['storey'] != 'g' or not (s['kind'] == 'shop' or (s['kind'] == 'koshi' and lit)):
            continue
        if density < 0.6 and s['kind'] != 'koshi':
            continue
        f = s['f']
        p = f(f.uc, min(f.z1 - 0.4, 2.4), 0.6)
        K.light_marker(f'LIGHT_{name}_Shop{i}', col, (p.x, p.y, p.z + H), color=(1.0, 0.68, 0.4), watts=45, unity_range=6.0)
        i += 1
    fr = edge_frame(W, D, 0)
    for kind, e, a in spec['dress']:
        if kind == 'andon':
            p = fr(a['u'], a['z'] + 0.24, 0.42)
            K.light_marker(f'LIGHT_{name}_Andon{i}', col, (p.x, p.y, p.z + H), color=(1.0, 0.75, 0.45), watts=12, unity_range=3.5)
            i += 1
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    return col, objs


PIECES = {   # street pieces: builder, collider box (x0, x1, y0, y1, z0, z1)
    'Street_8m': (lambda c: KI.street(c, bridges=(-2.2, 2.6)), (-4, 4, -3.2, 3.2, -0.4, 0.05)),
    'Street_Steps_8m': (lambda c: KI.street_steps(c), (-4, 4, -2.7, 2.7, -0.4, 1.44)),
    'Trough': (KI.trough, (-1.1, 0.9, -0.3, 0.3, 0.0, 0.8)),
    'Waterwheel': (KI.waterwheel, (-1.7, 3.3, -0.8, 0.8, 0.0, 3.2)),
}


def build_piece(key, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Kiso')
    fn, cb = PIECES[key]
    objs = []
    for lod in lods:
        c = KK.C('Kiso', lod)
        fn(c)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.012 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    K.collider_box(f'COL_{name}', col, *cb)
    return col, objs


def build():
    out = [build_variant(k, s) for k, s in HOUSES.items()]
    out += [build_variant(k, lane(HOUSES[src]), dens) for k, (src, dens) in LANE.items()]
    out += [build_piece(k) for k in STREET_PIECES]
    print('shop dressing:', {c.name: list(c['shop_tris']) for c, _ in out if 'shop_tris' in c})
    return out


# ── preview: street scene ───────────────────────────────────────────────────
STREET = 6.4
ROW_A = ['Hatago_3Bay_Kaede', 'Soba_2Bay_Kodama', 'Shop_2Bay_Nushiya', 'Minka_2Bay_Ishigaki']
ROW_B = ['Hatago_2Bay_Yamabuki', 'Sake_3Bay_Yamagiri', 'Chaya_1F_Gohei']
LANE_W = 3.6
LANE_A = ['Hatago_3Bay_Kaede_Lane', 'Soba_2Bay_Kodama_Lane']
LANE_B = ['Minka_2Bay_Ishigaki_Lane']
LX = 70.0   # the lane scene stands beside the main street
# street pieces in the scenes: name, (x, y, z), rotation
SCENE_PIECES = [('Street_8m', (4.0, 0.0, 0.0), 0.0), ('Street_8m', (12.0, 0.0, 0.0), 0.0), ('Street_8m', (20.0, 0.0, 0.0), 0.0),
                ('Street_Steps_8m', (28.0, -0.5, 0.0), 0.0), ('Trough', (9.2, -2.75, 0.0), 0.0),
                ('Waterwheel', (-3.2, -4.6, 0.0), 0.0),
                ('Street_8m', (LX + 4.0, 0.0, 0.0), 0.0), ('Street_8m', (LX + 12.0, 0.0, 0.0), 0.0)]   # lane paving


def _spec(key):
    return HOUSES[key] if key in HOUSES else lane(HOUSES[LANE[key][0]])


def _setback(spec):
    pl = spec.get('plinth')
    return (pl['front'] + 1.3) if pl else spec.get('P', 0.0)


def place(results, rows, width, x0=0.0, y0=0.0, undo=False):
    """Move house collections into a street layout (or back)."""
    for row, turn in rows:
        x = x0
        for key in row:
            spec = _spec(key)
            W, D = spec['W'], spec['D']
            col = next(c for c, _ in results if c.name == f'{NAME}_{key}')
            cx, cy = x + W / 2, y0 + width / 2 + D / 2 + _setback(spec)
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


def _pieces(undo=False):
    """Street pieces into the scene: the collection's objects are linked into
    temporary copies so one piece can lie several times; returns the copies."""
    import bpy
    tmp = bpy.data.collections.get('KisoScene') or bpy.data.collections.new('KisoScene')
    if undo:
        for o in list(tmp.objects):
            bpy.data.objects.remove(o)
        for me in [m for m in bpy.data.meshes if m.name.startswith('KisoGroundFiller') and not m.users]:
            bpy.data.meshes.remove(me)
        if tmp.name in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.unlink(tmp)
        return tmp
    if tmp.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(tmp)
    for name, (x, y, z), rot in SCENE_PIECES:
        src = bpy.data.objects[f'SM_{NAME}_{name}_LOD0']
        o = src.copy()
        o.hide_render = False
        tmp.objects.link(o)
        o.location = (x, y, z); o.rotation_euler.z = rot
    # ground round the street at z = 0 (the stage ground goes down so the channel shows)
    me = bpy.data.meshes.new('KisoGroundFiller')
    s, (gx0, gx1, gy0, gy1) = 200, (0.0, 32.0, -STREET / 2, STREET / 2)
    v = [(-s, -s), (s, -s), (s, s), (-s, s), (gx0, gy0), (gx1, gy0), (gx1, gy1), (gx0, gy1)]
    me.from_pydata([(x, y, -0.01) for x, y in v], [], [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    me.materials.append(bpy.data.materials['M_PreviewGround'])
    g = bpy.data.objects.new('KisoGroundFiller', me)
    tmp.objects.link(g)
    return tmp


def preview(results, views):
    """Default build preview: the main street from three sides (+ clay)."""
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


PROPS_MAIN = [('Bicycle_Mamachari_Cream', (15.6, -2.4), 3.0), ('Planter_PotGroup', (21.0, 2.6), 0.0),
              ('StoneLantern', (-1.0, 4.6), 0.0)]
PROPS_LANE = [('Bicycle_Mamachari_Silver', (LX + 4.0, -1.0), 3.1), ('Fence_Bamboo_1_8m', (LX + 15.5, 2.2), 0.0)]
assert not {p[0] for p in PROPS_MAIN} & {p[0] for p in PROPS_LANE}


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


def shots(out_dir):
    """Street at eye level (mood + neutral), from above, the lane, a clay
    street, every house front/back/clay, the street pieces and close-ups."""
    import bpy, os
    from kit import preview as P
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n)
    res = [(bpy.data.collections[f'{NAME}_{k}'], None) for k in list(HOUSES) + list(LANE)]
    lane_rows = [(LANE_A, False), (LANE_B, True)]
    P.stage(True)
    ground = bpy.data.objects['PreviewGround']
    place(res, MAIN, STREET); place(res, lane_rows, LANE_W, x0=LX)
    _props(PROPS_MAIN); _props(PROPS_LANE)
    _pieces()
    ground.location.z = -0.45
    try:
        cols = [f'{NAME}_{k}' for k in ROW_A + ROW_B] + [p[0] for p in PROPS_MAIN] + ['KisoScene']
        lcols = [f'{NAME}_{k}' for k in LANE_A + LANE_B] + [p[0] for p in PROPS_LANE] + ['KisoScene']
        P.shot(cols, (13, 0, 3.2), (-1, -0.06, 0.04), 16, o('street_eye.png'), mood=True, lens=24)
        P.shot(cols, (10, 0, 3.0), (1, 0.08, 0.03), 13, o('street_eye2.png'), lens=24)
        P.shot(cols, (13, 0, 1.5), (0.85, -0.55, 1.0), 30, o('street_high.png'), mood=True, lens=30)
        P.shot(cols, (10, 0, 3.0), (1, 0.08, 0.03), 13, o('street_clay.png'), mood='clay', lens=24)
        P.shot(cols, (25, 0, 2.6), (1, -0.25, 0.25), 12, o('street_steps.png'), lens=28)
        P.shot(lcols, (LX + 5, 0, 2.0), (1, -0.05, 0.08), 7.5, o('lane_eye.png'), mood=True, lens=22)
    finally:
        ground.location.z = 0.0
        _pieces(undo=True)
        _props(PROPS_MAIN, True); _props(PROPS_LANE, True)
        place(res, lane_rows, LANE_W, x0=LX, undo=True); place(res, MAIN, STREET, undo=True)
    for k in list(HOUSES) + list(LANE):
        s = _spec(k); col = [f'{NAME}_{k}']; dist = 9 + s['W'] * 0.9
        tz = 3.4 + s.get('plinth', {}).get('H', 0.0) * 0.6
        P.shot(col, (0, -s['D'] / 2, tz), (0.45, -1, 0.12), dist, o(f'h_{k}.png'), size=(640, 480), lens=35)
        P.shot(col, (0, -s['D'] / 2, tz), (0.45, -1, 0.12), dist, o(f'k_{k}.png'), mood='clay', size=(640, 480), lens=35)
        if k in HOUSES:
            P.shot(col, (0, s['D'] / 2, tz), (-0.5, 1, 0.2), dist, o(f'b_{k}.png'), size=(640, 480), lens=35)
    for k in STREET_PIECES:
        P.shot([f'{NAME}_{k}'], (0, 0, 0.6), (0.6, -1, 0.6), 7 if 'Street' in k else 4.5, o(f'p_{k}.png'), size=(640, 480), lens=35)
    for k, tgt, dirn, dist, name, mood in (
            ('Hatago_3Bay_Kaede', (1.0, -5.0, 2.6), (0.55, -1, 0.1), 6.5, 'c_hatago', True),
            ('Hatago_3Bay_Kaede', (-2.0, -5.3, 4.9), (0.5, -1, 0.3), 5.5, 'c_hatago_up', False),
            ('Hatago_3Bay_Kaede', (-3.5, -5.6, 2.7), (0.2, -1, -0.35), 4.0, 'c_dashibari', False),
            ('Soba_2Bay_Kodama', (-1.0, -4.5, 2.8), (0.4, -1, 0.35), 6.0, 'c_soba', True),
            ('Sake_3Bay_Yamagiri', (0.5, -5.2, 2.4), (0.5, -1, 0.15), 6.5, 'c_sake', True),
            ('Shop_2Bay_Nushiya', (-1.0, -4.8, 2.2), (0.5, -1, 0.2), 5.5, 'c_nushiya', False),
            ('Minka_2Bay_Ishigaki', (-1.5, -6.0, 2.0), (0.6, -1, 0.3), 8.0, 'c_ishigaki', True),
            ('Hatago_2Bay_Yamabuki', (0.0, -4.8, 4.6), (0.4, -1, 0.15), 6.5, 'c_yamabuki', False),
            ('Chaya_1F_Gohei', (0.0, -4.0, 2.4), (0.5, -1, 0.5), 6.0, 'c_chaya', True),
            ('Hatago_3Bay_Kaede', (0.0, -2.0, 6.6), (0.3, -1, 0.9), 7.0, 'c_roof', False)):
        P.shot([f'{NAME}_{k}'], tgt, dirn, dist, o(name + '.png'), mood=mood, size=(640, 480), lens=35)
