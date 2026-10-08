"""Fishing village and harbour (Ine no Funaya / Sanriku / Noto coast) -
buildings as data, from the Minato kit, plus harbour pieces, boats and
gear sets.

Buildings: boat houses over the water (funaya: boat bay with slipway below,
living floor above, gable to the sea), fishermen's houses (corrugated iron
or boards, tin or tile roof, lean-to net store, LP gas, kerosene tank), a
seafood diner, a tackle-and-ice shop, a net shed and the fish market hall.
Each FBX holds the building (SM_<name>_LOD0/1, atlas Minato) and its
dressing (SM_<name>_Shop_LOD0/1, atlas MinatoShop: interiors, signs, noren,
nets, buoys, crates, boats in the bays ...). density < 0.6 gives the quiet
bay version: shutters down, dark windows, no signs or flags - nets, buoys
and boats stay.
Pieces (atlas Minato): quay walls (concrete / old stone), stepped landing,
pier, breakwater with tetrapods, harbour light, open sea. Boats (atlas
MinatoShop): squid boat, skiff. Gear sets (MinatoShop): market crates,
drying racks, nets and pots - to place anywhere.

Local frame of a spec: ridge along X, length L, width B; sides S (-Y), E
(+X), N (+Y), W (-X); `front` names the side that faces the street (-Y
after turning; for a funaya the sea). Openings: (side, u0, u1, kind, opt),
u along the wall from its left corner seen from outside; opt s='u' puts it
in the upper storey, z0/z1 override the height.
"""
import copy
import math
import random
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings import koedo_kit as KK
from buildings import gassho_kit as GK
from buildings import minato_kit as M
from buildings.minato_kit import SIDES, WATER_Z, edge_frame, flat

KLASS = 'buildings'
NAME = 'Minato'
ANG = {'S': 0.0, 'E': -math.pi / 2, 'N': math.pi, 'W': math.pi / 2}
AMP = 0.03


def _zr(kind, st, G, opt):
    """Default heights of an opening by kind and storey."""
    if 'z0' in opt:
        return opt['z0'], opt['z1']
    small = opt.get('small')
    if kind == 'win':
        if st == 'u':
            return (G + 1.25, G + 1.9) if small else (G + 0.8, G + 1.95)
        return (1.45, 2.0) if small else (1.0, 2.05)
    if kind in ('door', 'gdoor'):
        return 0.45, 2.3
    if kind == 'shutter':
        return 0.0, opt.get('h', 2.6)
    if kind == 'shop':
        return 0.1, opt.get('h', 2.4)
    if kind == 'boards':
        return (G + 0.7, G + 1.9) if st == 'u' else (0.9, 2.0)
    return (G + 1.0, G + 1.5) if st == 'u' else (1.2, 1.8)


HOUSES = {
    # classic Ine boat house: gable to the sea, boat bay with slipway, living floor above, tile roof
    'Funaya_A': dict(
        L=11.0, B=5.8, G=2.9, U=2.4, front='E', sea=7.4, plinth=0.3,
        walls=dict(g='WOOD_TATE', u='WOOD_TATE', gable='WOOD_TATE'),
        roof=dict(kind='tile', slope=0.5, eave=0.5, oh=0.6),
        ops=[('E', 0.5, 2.6, 'win', dict(s='u', lit=True, frame='ALU_DARK')), ('E', 3.2, 5.3, 'win', dict(s='u', frame='ALU_DARK')),
             ('S', 1.0, 2.0, 'win', dict(small=True, frame='ALU_DARK')), ('S', 1.5, 3.3, 'win', dict(s='u', lit=True, frame='ALU_DARK')),
             ('S', 6.5, 8.0, 'win', dict(s='u', frame='ALU_DARK', small=True)),
             ('N', 3.5, 5.3, 'win', dict(s='u', frame='ALU_DARK')), ('N', 8.6, 9.6, 'win', dict(small=True, frame='ALU_DARK')),
             ('W', 0.6, 2.2, 'gdoor', dict()), ('W', 3.4, 5.0, 'win', dict(s='u', lit=True, frame='ALU_DARK', small=True))],
        gable_ops=[('E', 2.4, 3.4, 'vent', dict())],
        balcony=[('E', 0.2, 5.6, 0.75)],
        dress=[('buoys', 'E', dict(u=0.25, z=2.6, seed=1)), ('buoys', 'E', dict(u=5.55, z=2.6, seed=2, n=4)),
               ('net_drape', 'E', dict(u0=0.6, u1=3.0, z=3.92, d=0.75, seed=3)),
               ('skiff', 'E', dict(img='BOAT1')), ('interior_bay', 'E', dict(img='INT_FUNAGURA')),
               ('poles', 'W', dict(u=4.5)), ('boots', 'W', dict(u=2.5, d=0.6)), ('crab_pots', 'S', dict(u=2.6, d=0.6, n=4)),
               ('drum', 'S', dict(u=4.2, d=0.45)), ('tyres', 'E', dict())]),
    # older tin-clad boat house: low loft for nets (board shutters), bare corrugated roof
    'Funaya_B': dict(
        L=10.0, B=5.0, G=2.8, U=1.7, front='E', sea=7.0, plinth=0.3,
        walls=dict(g='WOOD_TATE', u='TOTAN_RUST', gable='TOTAN_RUST'),
        roof=dict(kind='tin', slope=0.42, eave=0.45, oh=0.45, reg='TOTAN_GREY'),
        ops=[('E', 0.6, 2.2, 'boards', dict(s='u', z0=2.8 + 0.35, z1=2.8 + 1.45)), ('E', 2.8, 4.4, 'win', dict(s='u', z0=2.8 + 0.35, z1=2.8 + 1.45)),
             ('S', 2.0, 3.0, 'win', dict(small=True)), ('N', 7.0, 8.0, 'win', dict(small=True)),
             ('W', 1.4, 3.0, 'gdoor', dict())],
        dress=[('buoys', 'E', dict(u=4.8, z=2.5, seed=4)), ('net_pile_in', 'E', dict()), ('skiff', 'E', dict(img='BOAT1')),
               ('interior_bay', 'E', dict(img='INT_FUNAGURA')), ('crab_pots', 'N', dict(u=2.0, d=0.6, n=5, seed=2)),
               ('tyres', 'E', dict())]),
    # fisherman's house clad in corrugated iron: blue sheets above, boards below, red tin roof, lean-to net store
    'Gyoka_Tin': dict(
        L=9.0, B=6.4, G=2.7, U=2.5, front='S', plinth=0.4,
        walls=dict(g=dict(S='WOOD_BOARD', E='WOOD_BOARD', W='WOOD_BOARD', N='TOTAN_RUST'), u='TOTAN_BLUE', gable='TOTAN_BLUE'),
        roof=dict(kind='tin', slope=0.32, eave=0.55, oh=0.45, reg='TOTAN_RED'),
        ops=[('S', 1.0, 2.6, 'door', dict()), ('S', 3.4, 5.2, 'win', dict(grille=True, hood='TOTAN_RED')),
             ('S', 6.4, 7.2, 'win', dict(small=True)),
             ('S', 0.9, 2.7, 'win', dict(s='u', lit=True)), ('S', 5.6, 7.6, 'win', dict(s='u')),
             ('E', 2.4, 3.2, 'win', dict(small=True)), ('E', 2.0, 3.6, 'win', dict(s='u')),
             ('W', 2.2, 3.8, 'win', dict(grille=True)), ('W', 3.0, 3.8, 'win', dict(s='u', small=True, lit=True)),
             ('N', 1.0, 1.9, 'door', dict(canopy=0.6)), ('N', 4.0, 4.8, 'win', dict(small=True)), ('N', 3.0, 4.6, 'win', dict(s='u'))],
        balcony=[('S', 5.2, 8.0, 0.8)],
        lean=[('E', 0.2, 6.2, 2.45, 2.3, 'TOTAN_RUST')],
        lpg=[('W', 5.2)], kerosene=[('N', 6.2)], antenna=(1.5, 0.0), downpipes=[('S', 0.15), ('N', 8.85)],
        dress=[('nets_lean', 'E', dict()), ('buoys', 'E', dict(u=1.0, z=2.2, seed=5, d=2.2)), ('crab_pots', 'E', dict(u=5.2, d=1.4, n=5)),
               ('boots', 'S', dict(u=2.9, d=0.4)), ('pots', 'S', dict(u0=5.4, u1=6.2, d=0.3)), ('drum', 'E', dict(u=3.6, d=1.9))]),
    # older fisherman's house: dark boards, tile roof, wooden glass doors, board lean-to shed
    'Gyoka_Kawara': dict(
        L=10.0, B=7.0, G=2.8, U=2.5, front='S', plinth=0.4,
        walls=dict(g=dict(S='WOOD_TATE', E='WOOD_TATE', W='WOOD_TATE', N='TOTAN_GREY'), u='WOOD_BOARD', gable='WOOD_BOARD'),
        roof=dict(kind='tile', slope=0.5, eave=0.65, oh=0.5),
        ops=[('S', 0.8, 2.6, 'gdoor', dict(lit=True)), ('S', 3.6, 5.4, 'win', dict(grille=True, frame='ALU_DARK', hood='TOTAN_GREY')),
             ('S', 6.8, 8.8, 'win', dict(frame='ALU_DARK', hood='TOTAN_GREY')),
             ('S', 1.0, 2.8, 'win', dict(s='u', frame='ALU_DARK')), ('S', 4.0, 5.8, 'win', dict(s='u', frame='ALU_DARK', lit=True)),
             ('S', 7.0, 8.8, 'win', dict(s='u', frame='ALU_DARK')),
             ('E', 2.6, 4.4, 'win', dict(s='u', frame='ALU_DARK')), ('E', 3.0, 4.0, 'win', dict(small=True, frame='ALU_DARK')),
             ('W', 1.0, 2.0, 'win', dict(small=True, frame='ALU_DARK', lit=True)), ('W', 2.5, 4.3, 'win', dict(s='u', frame='ALU_DARK')),
             ('N', 2.0, 2.9, 'door', dict(canopy=0.6)), ('N', 6.0, 7.0, 'win', dict(small=True)), ('N', 4.0, 5.8, 'win', dict(s='u', frame='ALU_DARK'))],
        lean=[('W', 0.3, 6.7, 2.4, 2.0, 'TOTAN_GREY')],
        lpg=[('E', 5.8)], kerosene=[('N', 8.4)], antenna=(-2.0, 0.0), downpipes=[('S', 9.85), ('N', 0.15)],
        dress=[('himono', 'S', dict(u=5.2, d=1.5)), ('nets_lean', 'W', dict(seed=2)), ('boots', 'S', dict(u=3.0, d=0.45, reg='BOOT_BLACK')),
               ('pots', 'S', dict(u0=9.0, u1=9.8, d=0.3, seed=3)), ('cooler', 'S', dict(u=7.6, d=0.55)),
               ('ika', 'S', dict(u0=6.6, u1=9.6, d=2.0))]),
    # seafood diner at the quay: open front with noren, tin canopy, sign, menu, flags
    'Shokudo': dict(
        L=9.0, B=7.5, G=3.0, U=2.4, front='S', plinth=0.3,
        walls=dict(g='WOOD_BOARD', u='TOTAN_GREY', gable='TOTAN_GREY'),
        roof=dict(kind='tin', slope=0.3, eave=0.5, oh=0.4, reg='TOTAN_BLUE'),
        ops=[('S', 0.6, 4.6, 'shop', dict(img='INT_SHOKUDO', depth=1.5)), ('S', 5.3, 6.7, 'door', dict(canopy=0.0)),
             ('S', 7.3, 8.5, 'win', dict(lit=True)),
             ('S', 0.8, 2.6, 'win', dict(s='u', lit=True)), ('S', 3.4, 5.2, 'win', dict(s='u', lit=True)), ('S', 6.4, 8.2, 'win', dict(s='u')),
             ('E', 1.5, 3.3, 'win', dict(lit=True)), ('E', 4.5, 6.3, 'win', dict(s='u')),
             ('W', 3.0, 3.8, 'win', dict(small=True)), ('W', 2.0, 3.8, 'win', dict(s='u', lit=True)),
             ('N', 1.2, 2.1, 'door', dict(canopy=0.6)), ('N', 5.0, 6.0, 'win', dict(small=True, lit=True)), ('N', 3.0, 4.8, 'win', dict(s='u'))],
        canopy=('S', -0.2, 9.2, 2.85, 1.0, 'TOTAN_BLUE'),
        kerosene=[('N', 7.0)], ac=[('E', 5.6, 0.0)], antenna=(2.0, 0.0), downpipes=[('S', 0.12)],
        dress=[('wall_board', 'S', dict(img='KB1', uc=4.5, w=5.2, h=1.0, z=3.1)),
               ('noren', 'S', dict(img='NOREN0', u0=0.9, u1=2.7, z=2.35, length=0.75)), ('noren', 'S', dict(img='NOREN1', u0=2.8, u1=4.4, z=2.35, length=0.75)),
               ('nobori', 'S', dict(img='NOBORI0', u=-0.1, d=1.4)), ('nobori', 'S', dict(img='NOBORI1', u=4.9, d=1.4)),
               ('kv', 'S', dict(img='KV0', u=7.0, d=1.3)), ('menu', 'S', dict(u=5.0, d=1.6)), ('crates', 'E', dict(u=6.5, d=0.6, n=3, stacks=2)),
               ('styro', 'E', dict(u=4.4, d=0.6, n=4))]),
    # tackle-and-ice shop: false front (corrugated parapet) hiding the roof, shutter half up
    'Shop_Ice': dict(
        L=7.6, B=6.0, G=3.2, U=0.0, front='S', plinth=0.2, parapet=1.4,
        walls=dict(g=dict(S='TOTAN_BLUE', E='TOTAN_GREY', W='TOTAN_GREY', N='TOTAN_RUST'), u='TOTAN_BLUE', gable='TOTAN_GREY'),
        roof=dict(kind='tin', slope=0.25, eave=0.4, oh=0.35, reg='TOTAN_GREY'),
        ops=[('S', 0.5, 4.6, 'shutter', dict(open=2.15, h=2.7, depth=1.4, img='INT_SHOP')), ('S', 5.2, 6.8, 'door', dict(canopy=0.0, frame='ALU')),
             ('E', 2.5, 3.5, 'win', dict(small=True)), ('W', 2.0, 3.6, 'win', dict(grille=True)), ('N', 2.0, 2.9, 'door', dict(canopy=0.5))],
        lpg=[('E', 4.8)], ac=[('W', 4.6, 0.0)], downpipes=[('S', 7.45)],
        dress=[('wall_board', 'S', dict(img='KB2', uc=3.8, w=5.6, h=1.3, z=3.35, d=0.08)), ('kv', 'S', dict(img='KV1', u=4.9, d=1.1)),
               ('cooler', 'S', dict(u=7.1, d=0.6)), ('styro', 'S', dict(u=0.0, d=0.5, n=3)), ('rope', 'S', dict(u=6.0, d=1.6)),
               ('buoys', 'E', dict(u=1.0, z=2.6, seed=7))]),
    # net shed: all corrugated, wide open front, nets, buoys and pots inside and before it
    'Amigoya': dict(
        L=6.4, B=4.6, G=2.7, U=0.0, front='S', plinth=0.15,
        walls=dict(g='TOTAN_RUST', u='TOTAN_RUST', gable='TOTAN_RUST'),
        roof=dict(kind='tin', slope=0.3, eave=0.35, oh=0.3, reg='TOTAN_GREY'),
        ops=[('S', 0.4, 5.0, 'shop', dict(img='INT_FUNAGURA', depth=4.0, doors=False, h=2.45, reveal='TOTAN_RUST_FLAT')),
             ('E', 1.8, 2.8, 'win', dict(small=True))],
        lean=[('W', 0.3, 4.3, 2.35, 1.8, 'TOTAN_RUST')],
        dress=[('net_pile', 'S', dict(u=1.6, d=-1.4, w=1.6, h=0.8)), ('net_pile', 'S', dict(u=3.8, d=-2.6, w=1.4, h=0.7, reg='NET_BLUE', seed=2)),
               ('net_pile', 'S', dict(u=4.6, d=1.0, w=1.2, h=0.5, seed=4)),
               ('buoys', 'S', dict(u=5.4, z=2.3, seed=9)), ('buoys', 'S', dict(u=0.2, z=2.3, seed=10, n=4)),
               ('crab_pots', 'W', dict(u=2.0, d=1.0, n=6, seed=3)), ('drum', 'W', dict(u=3.6, d=0.9)), ('nets_lean', 'W', dict(seed=5))]),
}
QUIET = {   # quiet bay versions: shut, dark, no signs or flags - nets, buoys and boats stay
    'Funaya_A_Quiet': ('Funaya_A', 0.3),
    'Gyoka_Tin_Quiet': ('Gyoka_Tin', 0.3),
}
LIVELY = {'noren', 'nobori', 'kv', 'menu', 'wall_board'}


def quiet(spec):
    s = copy.deepcopy(spec)
    ops = []
    for side, u0, u1, k, o in s['ops']:
        o = dict(o, lit=False)
        if k == 'shop':
            k, o = 'shutter', dict(h=o.get('h', 2.4))
        if k == 'shutter':
            o['open'] = 0.0
        ops.append((side, u0, u1, k, o))
    s['ops'] = ops
    s['dress'] = [d for d in s['dress'] if d[0] not in LIVELY]
    return s


def turn(bm, front):
    bmesh.ops.rotate(bm, verts=list(bm.verts), cent=(0, 0, 0), matrix=Matrix.Rotation(ANG[front], 3, 'Z'))


def tp(p, front):
    return Matrix.Rotation(ANG[front], 3, 'Z') @ Vector(p)


def _wreg(spec, st, side):
    w = spec['walls'][st]
    return w[side] if isinstance(w, dict) else w


def _dout(reg):
    return AMP + 0.012 if reg.startswith('TOTAN') else 0.0


def tile_top(B, z_top, slope, eave, wall_out=0.06):
    """Underside of KK.gable_roof over the gable wall (the roof is lowered
    by eave/4 so its soffit meets the wall top at the wall line)."""
    WL = B / 2 + wall_out
    zc = z_top - eave * 0.25 + WL * slope
    return lambda u: z_top + (WL - abs(u - B / 2)) / WL * (zc - z_top)


def _house(spec, lod):
    c = KK.C('Minato', lod)
    L, B, G, U = spec['L'], spec['B'], spec['G'], spec.get('U', 0.0)
    P = spec.get('plinth', 0.4)
    z_top = G + U
    sea = spec.get('sea')
    xs = L / 2 - sea if sea else None       # funaya: land / water line (local x)
    holes = {s: [] for s in SIDES}
    slots = []
    for side, u0, u1, kind, opt in spec['ops']:
        st = opt.get('s', 'g')
        z0, z1 = _zr(kind, st, G, opt)
        f = edge_frame(L, B, SIDES[side])
        reg = _wreg(spec, st, side)
        o = dict(opt)
        o.setdefault('trim', flat(reg) if reg.startswith('TOTAN') else 'WOOD')
        slot = M.MODULES[kind](c, f, u0, u1, z0, z1, _dout(reg), o)
        slot.update(side=side, img=opt.get('img'), lit=opt.get('lit'), kind=slot.get('kind', kind),
                    f=slot.get('f') or M.F(f.o, f.n, u0, u1, z0, z1))
        slots.append(slot)
        holes[side].append((u0, u1, z0, z1))
    r = spec['roof']
    slope, eave, oh = r['slope'], r['eave'], r['oh']
    if r['kind'] == 'tile':
        KK.gable_roof(c, L, B, z_top - eave * 0.25, 0.06, eave_out=eave, oh=oh, slope=slope, fascia=0.28, heavy=False,
                      fascia_reg='WOOD', ridge_h=0.42, oni=0.75, rafters=True)
        top = tile_top(B, z_top, slope, eave)
        ridge = z_top - eave * 0.25 + 0.28 + (B / 2 + 0.06 + eave - 0.3) * slope + 0.5
    else:
        roof = M.tin_roof(c, L, B, z_top, slope=slope, eave=eave, oh=oh, reg=r['reg'])
        top = M.gable_top(B, z_top, slope)
        ridge = roof['zr']
    gable_holes = {s: [] for s in SIDES}
    for side, u0, u1, kind, opt in spec.get('gable_ops', []):
        f = edge_frame(L, B, SIDES[side])
        zc = top(B / 2)
        z0, z1 = opt.get('z0', z_top + 0.25), opt.get('z1', min(zc - 0.25, z_top + 0.85))
        M.MODULES[kind](c, f, u0, u1, z0, z1, _dout(spec['walls']['gable']), dict(opt, trim='WOOD'))
        gable_holes[side].append((u0, u1, z0, z1))
    parapet = spec.get('parapet', 0.0)
    for side, e in SIDES.items():
        f = edge_frame(L, B, e)
        Lw = (L, B, L, B)[e]
        hs = holes[side]
        rg, ru = _wreg(spec, 'g', side), _wreg(spec, 'u', side)
        open_g = sea and side == spec['front']
        if not open_g:
            if sea and side in ('S', 'N'):
                land = (0.0, xs + L / 2) if side == 'S' else (L / 2 - xs, L)
                M.plinth(c, f, land[0], land[1], P, hs)
            else:
                M.plinth(c, f, 0.0, Lw, P, hs)
            M.wall(c, f, 0.0, Lw, P, G, rg, hs)
        if U:
            M.band(c, f, 0.0, Lw, G, 'WOOD' if not ru.startswith('TOTAN') else flat(ru), hs, d=_dout(ru) + 0.03)
            M.wall(c, f, 0.0, Lw, G, z_top, ru, hs)
        if e in (1, 3):
            M.wall(c, f, 0.0, Lw, z_top, top(B / 2) + 0.02, spec['walls']['gable'], gable_holes[side], top=top)
        if parapet and side == 'S':
            M.wall(c, f, -0.15, Lw + 0.15, z_top, z_top + parapet, ru)
            c.box(f, -0.2, Lw + 0.2, z_top + parapet, z_top + parapet + 0.08, -0.1, _dout(ru) + 0.06, flat(ru) if ru.startswith('TOTAN') else 'WOOD', skip=())
    # corner trims per storey (sheet ends / corner boards)
    for (za, zb, st) in ((P, G, 'g'), (G, z_top, 'u')) if U else ((P, G, 'g'),):
        regs = {_wreg(spec, st, s) for s in SIDES}
        tot = [x for x in regs if x.startswith('TOTAN')]
        treg = flat(tot[0]) if tot else 'WOOD'
        if sea and st == 'g':
            continue
        M.corner_trims(c, L, B, za, zb, treg, d=0.06 if tot else 0.03)
    if sea:
        M.corner_trims(c, L, B, G, z_top, flat(spec['walls']['u']) if spec['walls']['u'].startswith('TOTAN') else 'WOOD', d=0.05)
        _bay(c, spec, xs)
    for side, u0, u1, depth in spec.get('balcony', []):
        M.balcony(c, edge_frame(L, B, SIDES[side]), u0, u1, G + 0.12, depth)
    for side, u0, u1, z_hi, depth, reg in spec.get('lean', []):
        M.lean_to(c, edge_frame(L, B, SIDES[side]), u0, u1, z_hi, depth, reg=reg)
    if spec.get('canopy'):
        side, u0, u1, z_hi, depth, reg = spec['canopy']
        M.lean_to(c, edge_frame(L, B, SIDES[side]), u0, u1, z_hi, depth, slope=0.2, reg=reg, posts=False, eave=0.1)
    for side, u in spec.get('lpg', []):
        M.lpg(c, edge_frame(L, B, SIDES[side]), u)
    for side, u in spec.get('kerosene', []):
        M.kerosene(c, edge_frame(L, B, SIDES[side]), u)
    for side, u, z in spec.get('ac', []):
        M.ac_unit(c, edge_frame(L, B, SIDES[side]), u, z, 0.0)
    for side, u in spec.get('downpipes', []):
        M.downpipe(c, edge_frame(L, B, SIDES[side]), u, 0.0, z_top - 0.05, d=_dout(_wreg(spec, 'u' if U else 'g', side)) + 0.07)
    if spec.get('antenna'):
        x, y = spec['antenna']
        M.antenna(c, (x, y, ridge - 0.3))
    return c, slots, dict(z_top=z_top, ridge=ridge, top=top)


def _bay(c, spec, xs):
    """Funaya boat bay: stone foundation walls into the sea under both side
    walls, stone-lined slipway down into the water, inner walls, ceiling,
    header beam and posts at the open sea gable, sea inside the bay."""
    L, B, G, P = spec['L'], spec['B'], spec['G'], spec.get('plinth', 0.3)
    lod = c.lod
    zb = WATER_Z - 0.6
    xb = xs                           # back wall of the bay = shore line (behind it: the workshop on land)
    xe = L / 2
    t = 0.45                          # foundation wall thickness
    for sg in (-1, 1):
        yo, yi = sg * B / 2, sg * (B / 2 - t)
        out = M._face(c, [(xs, yo, zb), (xe, yo, zb), (xe, yo, P), (xs, yo, P)], (0, sg, 0))
        M._map(c, [out], 'QUAY_STONE', (0, 0, zb), (1, 0, 0), (0, 0, 1))
        inn = M._face(c, [(xb, yi, zb), (xe, yi, zb), (xe, yi, P), (xb, yi, P)], (0, -sg, 0))
        M._map(c, [inn], 'QUAY_STONE', (0, 0, zb), (1, 0, 0), (0, 0, 1))
        end = M._face(c, [(xe, min(yo, yi), zb), (xe, max(yo, yi), zb), (xe, max(yo, yi), P), (xe, min(yo, yi), P)], (1, 0, 0))
        M._map(c, [end], 'QUAY_STONE', (0, 0, zb), (0, 1, 0), (0, 0, 1))
        top = M._face(c, [(xb, min(yo, yi), P), (xe, min(yo, yi), P), (xe, max(yo, yi), P), (xb, max(yo, yi), P)], (0, 0, 1))
        c.m([top], 'STONE_FLAT')
        # inner face of the timber wall above the foundation
        iw = M._face(c, [(xb, sg * (B / 2 - 0.03), P), (xe, sg * (B / 2 - 0.03), P), (xe, sg * (B / 2 - 0.03), G - 0.02),
                         (xb, sg * (B / 2 - 0.03), G - 0.02)], (0, -sg, 0))
        c.m([iw], 'WOOD_TATE_FLAT')
        # corner post at the sea gable
        c.box(M.F(Vector((xe, sg * B / 2, 0)), (1, 0)), -0.1, 0.1, P, G, -0.2, 0.0, 'WOOD', skip=('bot',), rotate=True, bevel=True)
    back = M._face(c, [(xb, -(B / 2 - 0.03), P - 0.4), (xb, B / 2 - 0.03, P - 0.4), (xb, B / 2 - 0.03, G - 0.02), (xb, -(B / 2 - 0.03), G - 0.02)],
                   (1, 0, 0))
    c.m([back], 'INTERIOR')
    ceil = M._face(c, [(xb, -B / 2, G - 0.02), (xe, -B / 2, G - 0.02), (xe, B / 2, G - 0.02), (xb, B / 2, G - 0.02)], (0, 0, -1))
    c.m([ceil], 'WOOD_FLAT')
    if lod == 0:   # joists under the living floor
        for k in range(1, int((xe - xb) / 0.9)):
            x = xb + k * 0.9
            c.box(M.F(Vector((x, 0, 0)), (1, 0)), -B / 2, B / 2, G - 0.2, G - 0.02, -0.06, 0.06, 'WOOD', skip=('top',))
    fr = M.F(Vector((xe, 0, 0)), (1, 0))      # u = y
    c.box(fr, -B / 2 - 0.05, B / 2 + 0.05, G - 0.36, G + 0.02, -0.12, 0.04, 'WOOD', skip=('in',), bevel=True)
    # slipway: concrete down into the sea between the foundation walls
    yw = B / 2 - t
    x0, x1 = xb, xe + 0.9
    z0, z1 = P - 0.4, WATER_Z - 0.55
    n = 3
    for k in range(n):
        xa, xc = x0 + (x1 - x0) * k / n, x0 + (x1 - x0) * (k + 1) / n
        za, zc = z0 + (z1 - z0) * k / n, z0 + (z1 - z0) * (k + 1) / n
        f = M._face(c, [(xa, -yw, za), (xc, -yw, zc), (xc, yw, zc), (xa, yw, za)], (0, 0, 1))
        c.m([f], 'ALGAE' if zc < WATER_Z + 0.2 else 'CONC_FLAT')
    if lod == 0:   # timber rails on the slipway
        for y in (-0.5, 0.5):
            c.tube([(x0 + 0.2, y, z0 + 0.06), (x1 - 0.2, y, z1 + 0.06)], 0.05, 4, 'WOOD_FLAT')
    xw = x0 + (x1 - x0) * (z0 - WATER_Z) / (z0 - z1) - 0.3      # where the slipway runs under the water
    wf = M._face(c, [(xw, -yw, WATER_Z), (xe + 0.01, -yw, WATER_Z), (xe + 0.01, yw, WATER_Z), (xw, yw, WATER_Z)], (0, 0, 1))
    c.m([wf], 'WATER')


def _dress(spec, slots, lod, density):
    c = KK.C('MinatoShop', lod)
    L, B, G = spec['L'], spec['B'], spec['G']
    U = spec.get('U', 0.0)
    for s in slots:
        if s['kind'] == 'shop' and s.get('img'):
            KK.interior(c, s, s['img'])
    for kind, side, a in spec['dress']:
        f = edge_frame(L, B, SIDES[side])
        if kind == 'wall_board':
            KK.board(c, f, a['uc'], a['w'], a['h'], a['z'], a.get('d', 0.09), a['img'], cap=True)
        elif kind == 'noren':
            KK.noren(c, f, a['u0'], a['u1'], a['z'], a.get('d', 0.06), a['img'], length=a.get('length', 0.8))
        elif kind == 'nobori':
            KK.nobori(c, f, a['u'], a['d'], a['img'])
        elif kind == 'kv':
            KK.tate_board(c, f, a['u'], a['d'], a['img'])
        elif kind == 'menu':
            KK.menu_stand(c, f, a['u'], a['d'])
        elif kind == 'pots':
            KK.pots(c, f, a['u0'], a['u1'], a['d'], seed=a.get('seed', 0))
        elif kind == 'buoys':
            M.buoy_bunch(c, f, a['u'], a['z'], a.get('d', 0.05), n=a.get('n', 5), seed=a.get('seed', 0))
        elif kind == 'net_drape':
            M.net_drape(c, f, a['u0'], a['u1'], a['z'], a['d'] + 0.02, seed=a.get('seed', 0))
        elif kind == 'net_pile':
            M.net_pile(c, f, a['u'], a['d'], w=a.get('w', 1.4), h=a.get('h', 0.6), seed=a.get('seed', 0), reg=a.get('reg', 'NET_GREEN'))
        elif kind == 'nets_lean':     # under a lean-to: two heaps and a drape on its beam
            lean = next(x for x in spec['lean'] if x[0] == side)
            _, u0, u1, z_hi, depth, _ = lean
            M.net_pile(c, f, u0 + (u1 - u0) * 0.3, depth * 0.5, w=1.5, h=0.7, seed=a.get('seed', 0))
            M.net_pile(c, f, u0 + (u1 - u0) * 0.7, depth * 0.45, w=1.2, h=0.55, seed=a.get('seed', 0) + 1, reg='NET_BLUE')
            M.net_drape(c, f, u0 + 0.4, u0 + (u1 - u0) * 0.45, z_hi - depth * 0.25 - 0.22, depth * 0.95, drop=1.1, seed=a.get('seed', 0) + 2)
        elif kind == 'net_pile_in':   # nets on the loft beam of a boat house bay
            M.net_drape(c, edge_frame(L, B, 2), 0.6, 3.6, G - 0.45, 0.45, drop=0.9, seed=6)
        elif kind == 'crab_pots':
            M.crab_pots(c, f, a['u'], a['d'], n=a.get('n', 4), seed=a.get('seed', 0))
        elif kind == 'drum':
            M.drum(c, f(a['u'], 0, a['d']))
        elif kind == 'boots':
            M.boots(c, f, a['u'], a['d'], reg=a.get('reg', 'BOOT_WHITE'))
        elif kind == 'cooler':
            M.cooler(c, f, a['u'], a['d'])
        elif kind == 'crates':
            M.crates(c, f, a['u'], a['d'], n=a.get('n', 3), stacks=a.get('stacks', 1))
        elif kind == 'styro':
            M.crates(c, f, a['u'], a['d'], n=a.get('n', 3), reg='STYRO', stacks=a.get('stacks', 1), w=0.6, dd=0.4, h=0.28)
        elif kind == 'rope':
            M.rope_coil(c, f(a['u'], 0, a['d']))
        elif kind == 'poles':
            M.oars_poles(c, f, a['u'])
        elif kind == 'himono':
            M.himono_rack(c, f, a['u'], a['d'])
        elif kind == 'ika':
            M.ika_line(c, f, a['u0'], a['u1'], 1.75, a['d'])
        elif kind == 'interior_bay':
            xb = L / 2 - spec['sea']
            fr = M.F(Vector((xb + 0.03, 0, 0)), (1, 0), -B / 2 + 0.05, B / 2 - 0.05, spec.get('plinth', 0.3) - 0.35, G - 0.05)
            KK.interior(c, dict(f=fr, depth=0.0), a['img'], inset=0.0)
        elif kind == 'skiff':       # skiff hauled up the slipway, bow inward
            xs = L / 2 - spec['sea']
            P = spec.get('plinth', 0.3)
            x0, x1 = xs, L / 2 + 0.9
            z0, z1 = P - 0.4, WATER_Z - 0.55
            pitch = math.atan2(z0 - z1, x1 - x0)
            xc = L / 2 - 2.2
            zc = z0 + (z1 - z0) * (xc - x0) / (x1 - x0) + 0.32
            n0 = len(c.bm.verts)
            M.skiff(c)
            c.bm.verts.ensure_lookup_table()
            vs = c.bm.verts[n0:]
            R = Matrix.Rotation(math.pi, 3, 'Z')
            Rp = Matrix.Rotation(pitch, 3, 'Y')
            for v in vs:
                v.co = Rp @ (R @ v.co) + Vector((xc, 0.0, zc))
        elif kind == 'tyres':
            if spec.get('sea'):
                for y in (-spec['B'] / 2 - 0.05, spec['B'] / 2 + 0.05):
                    M.tyre(c, (L / 2 - 1.2, y, -0.35), (0, 1 if y > 0 else -1, 0), r=0.3, w=0.12)
        else:
            raise ValueError(f'unknown dressing {kind}')
    return c


def build_variant(key, spec, density=1.0, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Minato')
    smat = K.atlas_material('MinatoShop', emission_strength=1.6)
    front = spec['front']
    objs, shop = [], []
    for lod in lods:
        c, slots, info = _house(spec, lod)
        turn(c.bm, front)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _dress(spec, slots, lod, density)
        turn(cs.bm, front)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    L, B = spec['L'], spec['B']
    sea = spec.get('sea')
    x0 = -L / 2 - 0.1
    for nm, box in (('Walls', (x0, L / 2 + 0.1, -B / 2 - 0.1, B / 2 + 0.1, WATER_Z if sea else 0.0, info['z_top'])),
                    ('Roof', (-L / 2 - spec['roof']['oh'], L / 2 + spec['roof']['oh'], -B / 2 - spec['roof']['eave'],
                              B / 2 + spec['roof']['eave'], info['z_top'], info['ridge']))):
        x0_, x1_, y0, y1, z0, z1 = box
        ps = [tp((x, y, 0), front) for x in (x0_, x1_) for y in (y0, y1)]
        K.collider_box(f'COL_{name}_{nm}', col, min(p.x for p in ps), max(p.x for p in ps), min(p.y for p in ps),
                       max(p.y for p in ps), z0, z1)
    i = 0
    for s in slots:
        if not (s['kind'] == 'shop' or s.get('lit')):
            continue
        f = s['f']
        warm = s['kind'] == 'shop'
        p = tp(f(f.uc, (f.z0 + f.z1) / 2, 0.6 if warm else 0.4), front)
        K.light_marker(f'LIGHT_{name}_{"Shop" if warm else "Win"}{i}', col, tuple(p), color=(1.0, 0.68, 0.4),
                       watts=40 if warm else 12, unity_range=6.0 if warm else 3.5)
        i += 1
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(info['ridge'], 2))
    return col, objs


# ── market hall ─────────────────────────────────────────────────────────────

HALL = dict(L=24.0, B=12.0, H=5.0, bays=4, slope=0.15)


def _hall(lod, density=1.0):
    """Fish market hall (oroshi-uriba): steel portal frames every 6 m,
    folded-plate roof, open to the quay (S) with two bays shuttered,
    corrugated back and gable walls on a concrete base, an office with
    windows at the W end, fluorescent tubes under the roof."""
    c = KK.C('Minato', lod)
    L, B, H, n, slope = HALL['L'], HALL['B'], HALL['H'], HALL['bays'], HALL['slope']
    fr = M.F(Vector((0, 0, 0)), (0, -1))
    # floor slab
    for k in range(3):
        y0, y1 = -B / 2 - 0.8 + (B + 0.8) * k / 3, -B / 2 - 0.8 + (B + 0.8) * (k + 1) / 3
        f = M._face(c, [(-L / 2, y0, 0.15), (L / 2, y0, 0.15), (L / 2, y1, 0.15), (-L / 2, y1, 0.15)], (0, 0, 1))
        c.m([f], 'CONC_FLAT')
    c.box(fr, -L / 2, L / 2, 0.0, 0.15, -B / 2, B / 2 + 0.8, 'CONC_FLAT', skip=('top', 'bot', 'in'))
    # back (N) wall and gables: concrete base 1.0 m, corrugated above
    holes = {'N': [(15.2, 18.4, 0.15, 3.6)], 'E': [(4.0, 8.0, 0.15, 3.4)], 'W': [(1.2, 2.6, 1.2, 2.3), (3.4, 4.8, 1.2, 2.3), (7.0, 8.0, 0.15, 2.25)]}
    reg = 'TOTAN_GREY'
    top = M.gable_top(B, H, slope)
    for side in ('N', 'E', 'W'):
        e = SIDES[side]
        f = edge_frame(L, B, e)
        Lw = (L, B, L, B)[e]
        M.wall(c, f, 0.0, Lw, 0.15, 1.0, 'CONC_FLAT', holes[side], d=-0.03)
        M.wall(c, f, 0.0, Lw, 1.0, H, reg, holes[side], pitch=0.36)
        if e in (1, 3):
            M.wall(c, f, 0.0, Lw, H, top(B / 2) + 0.02, reg, top=top, pitch=0.36)
        # inner faces, seen through the open front
        q = M._face(c, [f(0, 0.15, -0.05), f(Lw, 0.15, -0.05), f(Lw, H, -0.05), f(0, H, -0.05)], -f.n)
        c.m([q], flat(reg))
    fN = edge_frame(L, B, 2)
    M.shutter(c, fN, 15.2, 18.4, 0.15, 3.6, AMP + 0.012, dict(open=0.0))
    fE = edge_frame(L, B, 1)
    M.shutter(c, fE, 4.0, 8.0, 0.15, 3.4, AMP + 0.012, dict(open=0.0))
    fW = edge_frame(L, B, 3)
    for u0, u1 in ((1.2, 2.6), (3.4, 4.8)):
        M.alu_window(c, fW, u0, u1, 1.2, 2.3, AMP + 0.012, dict(lit=True, trim='TOTAN_GREY_FLAT'))
    M.alu_door(c, fW, 7.0, 8.0, 0.15, 2.25, AMP + 0.012, dict(canopy=0.7, trim='TOTAN_GREY_FLAT'))
    M.corner_trims(c, L, B, 1.0, H, 'TOTAN_GREY_FLAT', d=0.06)
    # roof: folded plates, slab edges, ridge cap
    roof = M.tin_roof(c, L, B, H, slope=slope, eave=0.6, oh=0.5, reg='TOTAN_GREY_FLAT', pitch=0.5, prof='trap', fascia='TOTAN_BLUE_FLAT')
    # S side: fascia band with the sign, columns, shutters in bays 1 and 4
    fS = edge_frame(L, B, 0)
    c.box(fS, -0.5, L + 0.5, H - 0.9, H + 0.05, 0.0, 0.25, 'TOTAN_BLUE_FLAT', skip=(), bevel=True)
    bay = L / n
    for i in range(n + 1):
        u = i * bay
        ua, ub = max(-0.1, u - 0.15), min(L + 0.1, u + 0.15)
        for y in (-B / 2, B / 2):
            pf = M.F(Vector((-L / 2 + u, y, 0)), (0, -1))
            c.box(pf, -0.15, 0.15, 0.15, H - 0.05, -0.15, 0.15, 'STEEL_GREEN', skip=('bot',), bevel=True)
        if lod == 0:   # rafter of the portal frame
            for sg in (-1, 1):
                p0 = Vector((-L / 2 + u, sg * B / 2, H - 0.05)); p1 = Vector((-L / 2 + u, 0.0, H + B / 2 * slope - 0.05))
                c.tube([p0, p1], 0.14, 4, 'STEEL_GREEN', caps=True)
    for i in (0, n - 1):
        M.shutter(c, fS, i * bay + 0.15, (i + 1) * bay - 0.15, 0.15, H - 0.9, 0.25,
                  dict(open=0.0 if density < 0.6 or i == n - 1 else 0.0, depth=0.3))
    open_bays = [(i * bay + 0.15, (i + 1) * bay - 0.15) for i in range(1, n - 1)]
    if density < 0.6:
        for u0, u1 in open_bays:
            M.shutter(c, fS, u0, u1, 0.15, H - 0.9, 0.25, dict(open=0.0, depth=0.3))
        open_bays = []
    # office at the W end inside: a box with windows to the hall
    of = M.F(Vector((-L / 2 + 5.0, 0, 0)), (1, 0))
    b = c.box(of, -B / 2 + 0.2, 1.0, 0.15, 2.6, -5.0, 0.0, None, skip=('bot', 'in'))
    c.m([b['out'], b['l'], b['r']], 'PAINT_WHITE'); c.m([b['top']], 'CONC_FLAT')
    M.alu_window(c, of, -4.5, -2.5, 1.0, 2.0, 0.0, dict(lit=True, trim='ALU'))
    # roof underside (seen from inside)
    for sg in (-1, 1):
        q = M._face(c, [(-L / 2, sg * B / 2, H + 0.01), (L / 2, sg * B / 2, H + 0.01), (L / 2, 0, H + B / 2 * slope + 0.01),
                        (-L / 2, 0, H + B / 2 * slope + 0.01)], (0, 0, -1))
        c.m([q], 'TOTAN_GREY_FLAT')
    tubes = []
    for i in range(n):
        for y in (-2.5, 2.5):
            x = -L / 2 + (i + 0.5) * bay
            c.box(M.F(Vector((x, y, 0)), (0, -1)), -0.6, 0.6, H - 0.35, H - 0.28, -0.08, 0.08, 'LIGHT_COOL', skip=('top',))
            if lod == 0:
                c.tube([(x, y, H - 0.28), (x, y, H + (B / 2 - abs(y)) * slope)], 0.006, 3, 'IRON')
            tubes.append((x, y, H - 0.5))
    return c, open_bays, tubes, roof


def _hall_dress(lod, open_bays, density=1.0):
    c = KK.C('MinatoShop', lod)
    L, B, H = HALL['L'], HALL['B'], HALL['H']
    fS = edge_frame(L, B, 0)
    KK.board(c, fS, L / 2, 5.0, 1.25, H - 0.95 + 0.05, 0.33, 'KB0', cap=False)
    fin = M.F(Vector((0, -B / 2 + 1.0, 0)), (0, -1))      # inside, u = x
    for k, (u0, u1) in enumerate(open_bays):
        fr = M.F(Vector((-L / 2, -B / 2, 0)), (0, -1), u0, u1, 0.15, H - 0.9)
        for j in range(3):
            u = -L / 2 + u0 + 0.9 + j * 1.6
            M.crates(c, M.F(Vector((0, -B / 2, 0)), (0, -1)), u, -2.2 - (j % 2) * 1.4, n=3 + j % 2, stacks=2, seed=k * 3 + j)
            M.crates(c, M.F(Vector((0, -B / 2, 0)), (0, -1)), u + 0.4, -4.5, n=4, reg='STYRO', stacks=2, w=0.6, dd=0.4, h=0.28, seed=j)
        M.drum(c, (-L / 2 + u1 - 0.8, -B / 2 + 3.0, 0.15), reg='DRUM_BLUE')
    # quayside of the hall: crates, cooler boxes, a hose reel
    f0 = M.F(Vector((0, -B / 2, 0)), (0, -1))
    if density >= 0.6:
        M.crates(c, f0, -3.0, 1.2, n=3, stacks=3, seed=11)
        M.crates(c, f0, 2.5, 1.0, n=2, reg='STYRO', stacks=2, w=0.6, dd=0.4, h=0.28, seed=12)
        M.cooler(c, f0, 5.0, 1.0)
    M.rope_coil(c, (8.0, -B / 2 - 1.6, 0.15))
    return c


def build_hall(key='Ichiba', density=1.0, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Minato')
    smat = K.atlas_material('MinatoShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, open_bays, tubes, roof = _hall(lod, density)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _hall_dress(lod, open_bays, density)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    L, B, H = HALL['L'], HALL['B'], HALL['H']
    K.collider_box(f'COL_{name}', col, -L / 2 - 0.2, L / 2 + 0.2, -B / 2 - 0.2, B / 2 + 0.2, 0.0, roof['zr'])
    for i, p in enumerate(tubes if density >= 0.6 else tubes[:2]):
        K.light_marker(f'LIGHT_{name}_Tube{i}', col, p, color=(0.87, 0.95, 1.0), watts=30, unity_range=8.0)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(roof['zr'], 2))
    return col, objs


# ── pieces, boats, gear ─────────────────────────────────────────────────────

def _sea(c, L=8.0):
    for y0 in (-4.0, 0.0):
        f = M._face(c, [(-L / 2, y0, WATER_Z), (L / 2, y0, WATER_Z), (L / 2, y0 + 4.0, WATER_Z), (-L / 2, y0 + 4.0, WATER_Z)], (0, 0, 1))
        c.m([f], 'WATER'); c.nb([f])


PIECES = {   # builder, collider (x0, x1, y0, y1, z0, z1), atlas
    'Quay_8m': (lambda c: M.quay(c), (-4, 4, -0.05, 6.0, WATER_Z - 0.6, 0.0)),
    'Quay_Stone_8m': (lambda c: M.quay(c, stone=True, ladder=False), (-4, 4, -0.05, 6.0, WATER_Z - 0.6, 0.0)),
    'Quay_Steps_8m': (lambda c: M.quay_steps(c), (-4, 4, -2.3, 6.0, WATER_Z - 0.6, 0.0)),
    'Pier_8m': (lambda c: M.pier(c), (-1.2, 1.2, -8.0, 0.0, WATER_Z - 0.6, -0.2)),
    'Breakwater_8m': (lambda c: M.breakwater(c), (-4, 4, -2.0, 7.0, WATER_Z - 0.6, 2.3)),
    'Lighthouse_Red': (lambda c: M.lighthouse(c, red=True), (-1.3, 1.3, -1.3, 1.3, 0.0, 8.6)),
    'Lighthouse_White': (lambda c: M.lighthouse(c, red=False), (-1.3, 1.3, -1.3, 1.3, 0.0, 8.6)),
    'Slipway_8m': (lambda c: M.slipway(c), (-4, 4, -13.6, 6.0, WATER_Z - 0.6, 0.0)),
    'Sea_8m': (lambda c: _sea(c), None),
}
BOATS = {
    'Boat_Ika': (lambda c: M.boat_ika(c, 'BOAT0'), (-5.8, 6.0, -1.7, 1.7, -0.7, 2.0)),
    'Boat_Skiff': (lambda c: M.skiff(c), (-3.4, 3.0, -0.9, 0.9, -0.3, 1.0)),
}


def _gear_market(c):
    f = M.F(Vector((0, 0, 0)), (0, -1))
    M.crates(c, f, -1.2, 0.0, n=4, stacks=3, seed=1)
    M.crates(c, f, 1.0, 0.3, n=3, reg='STYRO', stacks=2, w=0.6, dd=0.4, h=0.28, seed=2)
    M.drum(c, (2.4, -0.4, 0.0)); M.drum(c, (2.5, 0.3, 0.0), reg='CRATE_YELLOW')
    M.cooler(c, f, -0.2, -1.0)
    M.rope_coil(c, (-2.6, -0.8, 0.0))
    M.boots(c, f, 0.6, -1.1, reg='BOOT_BLACK')


def _gear_drying(c):
    f = M.F(Vector((0, 0, 0)), (0, -1))
    M.himono_rack(c, f, -1.2, 0.0)
    M.himono_rack(c, f, 1.0, 0.1, w=1.6, seed=1)
    M.ika_line(c, f, -2.2, 2.2, 1.8, 1.3, n=9)


def _gear_nets(c):
    f = M.F(Vector((0, 0, 0)), (0, -1))
    M.net_pile(c, f, -1.0, 0.0, w=1.8, h=0.8)
    M.net_pile(c, f, 1.0, 0.4, w=1.4, h=0.6, reg='NET_BLUE', seed=3)
    M.crab_pots(c, f, 2.4, -0.6, n=5)
    for i in range(6):
        M.buoy(c, (-2.2 + 0.32 * i, -1.0 + 0.1 * (i % 2), 0.16), 0.16, ('BUOY_ORANGE', 'BUOY_RED', 'BUOY_ORANGE', 'BUOY_WHITE')[i % 4])


GEAR = {
    'Gear_Market': (_gear_market, (-2.9, 2.8, -1.4, 0.8, 0.0, 1.0)),
    'Gear_Drying': (_gear_drying, (-2.2, 2.2, -0.6, 1.4, 0.0, 1.9)),
    'Gear_Nets': (_gear_nets, (-2.4, 2.9, -1.2, 1.2, 0.0, 0.9)),
}


def build_piece(key, table, atlas, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(atlas, emission_strength=1.6 if atlas == 'MinatoShop' else 4.0)
    fn, cb = table[key]
    objs = []
    for lod in lods:
        c = KK.C(atlas, lod)
        fn(c)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.012 if lod == 0 and atlas == 'Minato' else 0.0,
                                  hidden=lod > 0, recalc=False))
    if cb:
        K.collider_box(f'COL_{name}', col, *cb)
    if key.startswith('Lighthouse'):
        # Japanese harbour lights: red tower shows red, white tower shows green
        rgb = (1.0, 0.2, 0.15) if key.endswith('Red') else (0.2, 1.0, 0.45)
        K.light_marker(f'LIGHT_{name}', col, (0, 0, 7.7), color=rgb, watts=60, unity_range=12.0)
    return col, objs


def build():
    out = [build_variant(k, s) for k, s in HOUSES.items()]
    out += [build_variant(k, quiet(HOUSES[src]), dens) for k, (src, dens) in QUIET.items()]
    out.append(build_hall())
    out += [build_piece(k, PIECES, 'Minato') for k in PIECES]
    out += [build_piece(k, BOATS, 'MinatoShop') for k in BOATS]
    out += [build_piece(k, GEAR, 'MinatoShop') for k in GEAR]
    print('dressing:', {c.name: list(c['shop_tris']) for c, _ in out if 'shop_tris' in c})
    return out


# ── scenes ──────────────────────────────────────────────────────────────────
# All scene objects are linked copies (same meshes) in a temporary collection,
# so one asset can stand several times; everything is removed afterwards.
WZ = WATER_Z
# harbour core: quay along X at y = 0, sea to -Y, the market hall on the apron, shops across the quay road
CORE = [('Ichiba', (-14.0, 7.2), 0.0), ('Amigoya', (2.2, 10.9), 0.0), ('Shokudo', (10.0, 12.35), 0.0),
        ('Shop_Ice', (19.0, 11.6), 0.0), ('Gyoka_Tin', (28.5, 11.8), 0.0),
        ('Boat_Ika', (12.0, -1.8, WZ), 0.0), ('Boat_Ika', (-12.0, -1.85, WZ), math.pi), ('Boat_Skiff', (25.5, -3.4, WZ), 2.8),
        ('Gear_Market', (-0.5, 2.6), 0.0), ('Gear_Nets', (5.0, 3.6), 0.3), ('Gear_Drying', (33.5, 7.0), 0.0)] + \
       [('Quay_8m', (x, 0.0), 0.0) for x in (-24, -16, -8, 0, 8, 16, 32)] + [('Quay_Steps_8m', (24.0, 0.0), 0.0)] + \
       [('Pier_8m', (-4.0, 0.0), 0.0)] + \
       [('Sea_8m', (x, y), 0.0) for x in range(-24, 40, 8) for y in (-12.0, -20.0, -36.0, -44.0)] + \
       [('Breakwater_8m', (x, -30.0), math.pi) for x in (-8.0, 0.0, 8.0, 16.0)] + [('Lighthouse_Red', (21.5, -30.0, 1.0), 0.0)]
CORE_PROPS = [('VendingMachine_Red', (7.0, 8.0), 0.0), ('VendingMachine_Blue', (14.9, 8.0), 0.0), ('Bicycle_Mamachari_Silver', (16.0, 7.6), 0.2),
              ('StreetLight_Road', (0.0, 6.3), math.pi), ('StreetLight_Road', (20.0, 6.3), math.pi), ('UtilityPole_Plain', (24.0, 8.2), 0.0)]
CORE_LAND = [(-30.0, 40.0, 6.0, 60.0)]
# quiet bay: a row of boat houses at the water, a lane behind, fishermen's houses up the slope
FX = 160.0
BAY = [('Funaya_A', (FX - 13.5, -1.9), 0.0), ('Funaya_B', (FX - 7.0, -2.0), 0.0), ('Funaya_A_Quiet', (FX - 0.6, -1.9), 0.0),
       ('Funaya_B', (FX + 6.0, -2.0), 0.0), ('Gyoka_Kawara', (FX - 9.0, 14.5), 0.0), ('Gyoka_Tin_Quiet', (FX + 4.0, 14.2), 0.0),
       ('Boat_Skiff', (FX - 18.5, -5.0, WZ), 1.9), ('Boat_Skiff', (FX + 11.0, -6.5, WZ), -1.2), ('Gear_Drying', (FX - 2.0, 8.0), 0.0)] + \
      [('Quay_Stone_8m', (FX + x, 0.0), 0.0) for x in (-24, -16, -8, 0, 8, 16)] + \
      [('Sea_8m', (FX + x, y), 0.0) for x in range(-24, 24, 8) for y in (-12.0, -20.0, -28.0)] + \
      [('Breakwater_8m', (FX + x, -38.0), math.pi) for x in (-16.0, -8.0)] + [('Lighthouse_Red', (FX - 4.5, -38.0, 1.0), 0.0)]
BAY_PROPS = [('Bicycle_Mamachari_Mint', (FX + 1.5, 7.2), 1.4), ('UtilityPole_Plain', (FX - 4.0, 7.0), 0.0),
             ('VendingMachine_White', (FX + 8.2, 10.6), 0.0)]
BAY_LAND = [(FX - 30.0, FX + 22.0, 6.0, 60.0)]


def _place(tmp, cname, pos, rot):
    """Linked copies of the visible objects of a collection (LOD0, dressing,
    LIGHT_ markers) moved to pos / turned by rot about Z."""
    import bpy
    src = bpy.data.collections.get(cname)
    if not src:
        print('scene: missing', cname)
        return []
    T = Matrix.Translation(Vector((pos[0], pos[1], pos[2] if len(pos) > 2 else 0.0))) @ Matrix.Rotation(rot, 4, 'Z')
    out = []
    # list(): linking a copy rebuilds all_objects and silently ends the loop
    # (sign skins and LIGHT_ markers went missing in the scene pictures)
    for o in list(src.all_objects):
        if o.name.startswith('COL_') or (o.type == 'MESH' and o.hide_render):
            continue
        n = o.copy()
        n.parent = None
        n.matrix_world = T @ o.matrix_world
        n.hide_render = False
        tmp.objects.link(n)
        out.append(n)
    return out


def _ground(tmp, rects, name):
    import bpy
    me = bpy.data.meshes.new(name)
    vs, fs = [], []
    for x0, x1, y0, y1 in rects:
        k = len(vs)
        vs += [(x0, y0, -0.01), (x1, y0, -0.01), (x1, y1, -0.01), (x0, y1, -0.01)]
        fs.append((k, k + 1, k + 2, k + 3))
    me.from_pydata(vs, [], fs)
    m = bpy.data.materials.get('M_PreviewAsphalt') or bpy.data.materials.new('M_PreviewAsphalt')
    m.use_nodes = True
    b = K._principled(m.node_tree)
    b.inputs['Base Color'].default_value = (0.045, 0.045, 0.048, 1)
    b.inputs['Roughness'].default_value = 0.85
    me.materials.append(m)
    g = bpy.data.objects.new(name, me)
    tmp.objects.link(g)


def _scene(items, props, land, name):
    import bpy
    tmp = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if tmp.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(tmp)
    for n, pos, rot in items:
        _place(tmp, f'{NAME}_{n}', pos, rot)
    for n, pos, rot in props:
        _place(tmp, n, pos, rot)
    _ground(tmp, land, name + 'Ground')
    return tmp


def _clear(name):
    import bpy
    tmp = bpy.data.collections.get(name)
    if not tmp:
        return
    for o in list(tmp.objects):
        bpy.data.objects.remove(o)
    for me in [m for m in bpy.data.meshes if m.name.startswith(name + 'Ground') and not m.users]:
        bpy.data.meshes.remove(me)
    if tmp.name in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.unlink(tmp)
    bpy.data.collections.remove(tmp)


ALL = list(HOUSES) + list(QUIET)


def _spec(k):
    return HOUSES[k] if k in HOUSES else quiet(HOUSES[QUIET[k][0]])


def shots(out_dir, which=('core', 'bay', 'houses', 'pieces', 'close')):
    """Harbour core and quiet bay at eye level (mood + neutral), from above,
    clay; every building front/back/clay; pieces, boats, gear; close-ups."""
    import bpy, os
    from kit import preview as P
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n)
    P.stage(True)
    ground = bpy.data.objects['PreviewGround']
    ground.location.z = -3.0
    try:
        if 'core' in which:
            _scene(CORE, CORE_PROPS, CORE_LAND, 'MinatoCore')
            cc = ['MinatoCore']
            P.shot(cc, (6, 2, 1.6), (-0.35, -1, 0.05), 26, o('core_eye.png'), mood=True, lens=24)
            P.shot(cc, (6, 2, 1.6), (-0.35, -1, 0.05), 26, o('core_eye_neutral.png'), lens=24)
            P.shot(cc, (14, 5.5, 1.6), (1, -0.15, 0.03), 20, o('core_street.png'), mood=True, lens=24)
            P.shot(cc, (4, -10, 0.0), (0.8, -0.55, 0.75), 72, o('core_high.png'), mood=True, lens=30)
            P.shot(cc, (4, -10, 0.0), (0.8, -0.55, 0.75), 72, o('core_high_neutral.png'), lens=30)
            P.shot(cc, (6, 2, 1.6), (-0.35, -1, 0.05), 26, o('core_clay.png'), mood='clay', lens=24)
            _clear('MinatoCore')
        if 'bay' in which:
            _scene(BAY, BAY_PROPS, BAY_LAND, 'MinatoBay')
            bc = ['MinatoBay']
            P.shot(bc, (FX - 3, 0, 2.5), (0.25, -1, 0.06), 26, o('bay_sea.png'), mood=True, lens=26)
            P.shot(bc, (FX - 3, 0, 2.5), (0.25, -1, 0.06), 26, o('bay_sea_neutral.png'), lens=26)
            P.shot(bc, (FX - 3, 7.5, 1.6), (1, 0.12, 0.03), 18, o('bay_lane.png'), mood=True, lens=24)
            P.shot(bc, (FX - 3, 2, 0.0), (-0.4, -0.8, 0.8), 52, o('bay_high.png'), lens=30)
            P.shot(bc, (FX - 3, 0, 2.5), (0.25, -1, 0.06), 26, o('bay_clay.png'), mood='clay', lens=26)
            _clear('MinatoBay')
    finally:
        _clear('MinatoCore'); _clear('MinatoBay')
        ground.location.z = 0.0
    if 'houses' in which:
        ground.location.z = -3.0
        try:
            for k in ALL + ['Ichiba']:
                tmp = _scene([(k, (0, 0), 0.0)] + ([('Sea_8m', (x, y), 0.0) for x in (-8, 0, 8) for y in (-4, -12)] if 'Funaya' in k else []),
                             [], [(-20, 20, (0.0 if 'Funaya' in k else -20.0), 20)], 'MinatoOne')
                big = k == 'Ichiba'
                dist = 34 if big else 21
                tz = 3.0
                P.shot(['MinatoOne'], (0, 0, tz), (0.55, -1, 0.25), dist, o(f'h_{k}.png'), size=(640, 480), lens=35)
                P.shot(['MinatoOne'], (0, 0, tz), (0.55, -1, 0.25), dist, o(f'k_{k}.png'), mood='clay', size=(640, 480), lens=35)
                P.shot(['MinatoOne'], (0, 0, tz), (-0.6, 1, 0.3), dist, o(f'b_{k}.png'), size=(640, 480), lens=35)
                _clear('MinatoOne')
        finally:
            _clear('MinatoOne')
            ground.location.z = 0.0
    if 'pieces' in which:
        ground.location.z = -3.0
        try:
            for k, tgt, dirn, dist in (('Quay_8m', (0, 0, -0.5), (0.5, -1, 0.45), 11), ('Quay_Stone_8m', (0, 0, -0.5), (0.5, -1, 0.45), 11),
                                       ('Quay_Steps_8m', (0, -1, -0.5), (0.6, -1, 0.5), 11), ('Pier_8m', (0, -4, -0.5), (1, -0.4, 0.35), 11),
                                       ('Breakwater_8m', (0, 2, 0.0), (0.5, 1, 0.45), 14), ('Lighthouse_Red', (0, 0, 4.5), (0.6, -1, 0.2), 14),
                                       ('Boat_Ika', (0, 0, 1.6), (0.7, -1, 0.35), 15), ('Boat_Skiff', (0, 0, 0.3), (0.7, -1, 0.5), 7.5),
                                       ('Gear_Market', (0, 0, 0.4), (0.4, -1, 0.5), 7), ('Gear_Drying', (0, 0, 0.8), (0.4, -1, 0.45), 7),
                                       ('Gear_Nets', (0, 0, 0.4), (0.4, -1, 0.5), 7)):
                z = WZ if k.startswith('Boat') else 0.0
                items = [(k, (0, 0, z), 0.0)]
                if k.startswith('Boat') or k == 'Lighthouse_Red':
                    items += [('Sea_8m', (x, y), 0.0) for x in (-8, 0, 8) for y in (-4, 4)]
                land = [] if (k.startswith('Boat') or k == 'Lighthouse_Red') else [(-20, 20, 6.0, 20)]
                if k.startswith('Gear'):
                    land = [(-20, 20, -20, 20)]
                _scene(items, [], land, 'MinatoOne')
                P.shot(['MinatoOne'], tgt, dirn, dist, o(f'p_{k}.png'), size=(640, 480), lens=35)
                if k in ('Boat_Ika', 'Breakwater_8m', 'Quay_8m'):
                    P.shot(['MinatoOne'], tgt, dirn, dist, o(f'pk_{k}.png'), mood='clay', size=(640, 480), lens=35)
                _clear('MinatoOne')
        finally:
            _clear('MinatoOne')
            ground.location.z = 0.0
    if 'close' in which:
        ground.location.z = -3.0
        sea = [('Sea_8m', (x, y), 0.0) for x in (-8, 0, 8) for y in (-4, -12)]
        try:
            for k, extra, tgt, dirn, dist, name, mood in (
                    ('Funaya_A', sea, (0, -5.2, 1.0), (0.45, -1, 0.12), 7.5, 'c_bay', True),
                    ('Funaya_A', sea, (0, -5.8, 4.3), (0.6, -1, 0.15), 6.0, 'c_balcony', False),
                    ('Gyoka_Tin', [], (-4.6, -1.6, 1.3), (-1, -0.55, 0.15), 5.0, 'c_tin_side', False),
                    ('Gyoka_Tin', [], (5.6, 0.0, 1.1), (1, -0.7, 0.25), 6.0, 'c_lean_to', False),
                    ('Gyoka_Tin', [], (4.5, -3.8, 5.6), (1, -1, 0.15), 4.5, 'c_eave', False),
                    ('Shokudo', [], (0.0, -4.4, 2.0), (0.4, -1, 0.1), 7.0, 'c_shokudo', True),
                    ('Ichiba', [], (0.0, -6.5, 2.0), (0.3, -1, 0.12), 11.0, 'c_market', True),
                    ('Quay_8m', sea[3:], (0.5, 0.0, -0.5), (0.35, -1, 0.35), 4.5, 'c_quay', False),
                    ('Boat_Ika', sea, (2.0, 0.0, 2.3), (0.6, -1, 0.35), 7.0, 'c_ika', False),
                    ('Gear_Drying', [], (0.0, 0.0, 1.0), (0.3, -1, 0.7), 4.0, 'c_himono', False)):
                z = WZ if k.startswith('Boat') else 0.0
                _scene([(k, (0, 0, z), 0.0)] + extra, [], [(-20, 20, 0.0 if k.startswith(('Funaya', 'Quay')) else -20.0, 20)] if not k.startswith('Boat') else [],
                       'MinatoOne')
                tg = (tgt[0], tgt[1], tgt[2] + z) if k.startswith('Boat') else tgt
                P.shot(['MinatoOne'], tg, dirn, dist, o(name + '.png'), mood=mood, size=(640, 480), lens=35)
                _clear('MinatoOne')
        finally:
            _clear('MinatoOne')
            ground.location.z = 0.0
