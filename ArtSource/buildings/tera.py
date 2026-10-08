"""Temples and shrines (Nara/Kyoto mountain temples like Kiyomizu-dera and
Murō-ji, rural village shrines) - buildings as data, from the Tera kit,
plus precinct pieces (walls, paths, steps) and detail sets.

Each FBX holds the building (SM_<name>_LOD0/1, atlas Tera) and its dressing
(SM_<name>_Shop_LOD0/1, atlas TeraShop: interiors, plaques, lanterns,
shimenawa, offering box, bells, ema ...). Local frame: front to -Y, origin
at the ground centre of the platform. Temple and shrine names are invented
(Seiran-ji, Amemiya-jinja).

Buildings: main hall (Hondo, vermilion, tile roof) and the quiet mountain
hall (Hondo_Yama, bare wood, bark roof); two-storey gate (Sanmon), small
gate (Yakuimon); bell tower (Shoro); shrine prayer hall (Haiden, copper
roof, step canopy) and main sanctuary (Honden, shinmei style with chigi and
katsuogi); purification pavilion (Temizuya); amulet office (Juyosho);
three-storey pagoda (Pagoda_3).
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings import tera_kit as T
from buildings import koedo_kit as KK
from buildings.tera_kit import C, F, SIDES, ZV

KLASS = 'buildings'
NAME = 'Tera'


class FZ(F):
    """Frame lifted by zo (dressing standing on a platform or veranda)."""

    def __init__(self, f, zo):
        super().__init__(f.o, f.n, f.u0, f.u1, f.z0, f.z1)
        self.zo = zo

    def __call__(self, u, z, d=0.0):
        v = super().__call__(u, z, d)
        v.z += self.zo
        return v


HALLS = {
    # main hall of the large precinct: 5 x 4 bays, veranda with railing, steps, irimoya tile roof, 2-step brackets
    'Hondo': dict(
        bx=[2.4, 2.7, 3.3, 2.7, 2.4], by=[2.4, 2.7, 2.7, 2.4], H=3.9, plat=0.5, floor=0.95, r=0.21, en=1.4, plat_m=2.0,
        col='NURI', beam='NURI', kumi='NURI', steps=2, reach=0.42, door_h=2.6, stairs=('S', 2),
        walls=dict(S=['shitomi', ('lattice', dict(lit=True)), ('board', dict(open=True)), ('lattice', dict(lit=True)), 'shitomi'],
                   E=['renji', 'board', 'board', 'renji'], W=['renji', 'board', 'board', 'renji'],
                   N=['plaster', 'plaster', 'board', 'plaster', 'plaster']),
        roof=dict(kind='irimoya', ov=2.7, s0=0.32, s1=1.05, lift=0.75, dg=3.4, og=0.55),
        roof_mat=dict(kind='tile', pitch=0.48, amp=0.08),
        dress=[('interior', dict(img='INT_HONDO')), ('gaku', dict(img='GAKU0', w=1.7, h=0.85)), ('big_lantern', dict()),
               ('saisen', dict(w=1.8)), ('lanterns', dict(bays=(1, 3))), ('jokoro', dict(d=6.5)),
               ('nobori', dict(us=(3.2, 10.3), d=4.2, imgs=('NOBORI1',))), ('broom', dict(u=-1.0, d=3.0))]),
    # quiet mountain hall (Murō-ji): 3 x 3 bays, bare weathered wood, bark roof, 1-step brackets, stone terrace
    'Hondo_Yama': dict(
        bx=[2.4, 3.0, 2.4], by=[2.4, 2.7, 2.4], H=3.4, plat=0.7, floor=0.7, r=0.19, en=1.0, plat_m=1.0, plat_reg='ISHIGAKI',
        col='WOOD_OLD', beam='WOOD_OLD', kumi='WOOD_OLD', end='END_GRAIN', steps=1, reach=0.45, door_h=2.3, stairs=('S', 1),
        walls=dict(S=['board', ('board', dict(open=True)), 'board'], E=['renji', 'board', 'renji'], W=['renji', 'board', 'renji'],
                   N=['plaster', 'board', 'plaster']),
        roof=dict(kind='irimoya', ov=2.1, s0=0.4, s1=0.95, lift=0.4, dg=2.4, og=0.45, tk=0.42),
        roof_mat=dict(kind='bark', raft_reg='WOOD_OLD'),
        dress=[('interior', dict(img='INT_HONDO')), ('gaku', dict(img='GAKU0', w=1.2, h=0.6)), ('saisen', dict(w=1.2)),
               ('jokoro', dict(d=4.2, s=0.75)), ('broom', dict(u=-0.6, d=2.0))]),
    # bell tower: 1 bay on a high stone terrace, open, irimoya tile roof, the bell and striker in the dressing
    'Shoro': dict(
        bx=[3.6], by=[3.6], H=3.4, plat=1.1, floor=0.0, r=0.2, en=0.0, plat_m=0.9, plat_reg='ISHIGAKI', plat_steps=('S', 1.4),
        col='NURI', beam='NURI', kumi='NURI', steps=1, reach=0.4, door_h=2.8,
        walls=dict(S=['open'], E=['open'], N=['open'], W=['open']),
        roof=dict(kind='irimoya', ov=1.7, s0=0.38, s1=1.05, lift=0.5, dg=1.5, og=0.4),
        roof_mat=dict(kind='tile', pitch=0.4, amp=0.07),
        extra='bell_beam', dress=[('bonsho', dict())]),
    # small gate: two main posts and two back posts, gable tile roof, doors folded open
    'Yakuimon': dict(
        bx=[3.2], by=[1.9], H=3.0, plat=0.18, floor=0.0, r=0.17, en=0.0, plat_m=0.5, col='WOOD', beam='WOOD', kumi='WOOD',
        end='END_GRAIN', steps=0, door_h=2.7, platform=True,
        walls=dict(S=[('board', dict(open=True, gate=True))], E=['open'], N=['open'], W=['open']),
        roof=dict(kind='gable', ov=1.0, s0=0.42, s1=0.7, lift=0.15, tk=0.3),
        roof_mat=dict(kind='tile', pitch=0.36, amp=0.06, raft_reg='WOOD'),
        dress=[('broom', dict(u=-0.4, d=0.4, ground=True))]),
    # shrine prayer hall: 3 x 2 bays, raised floor, veranda, step canopy (kohai), copper irimoya roof, bare wood
    'Haiden': dict(
        bx=[2.4, 3.0, 2.4], by=[2.4, 2.4], H=3.2, plat=0.45, floor=0.75, r=0.17, en=1.0, plat_m=1.0,
        col='WOOD', beam='WOOD', kumi='WOOD', end='END_GRAIN', steps=1, reach=0.4, door_h=2.3, stairs=('S', 1),
        walls=dict(S=[('shitomi', dict(open=True)), ('lattice', dict(lit=True)), ('shitomi', dict(open=True))],
                   E=['board', 'lattice'], W=['lattice', 'board'], N=['plaster', 'board', 'plaster']),
        roof=dict(kind='irimoya', ov=1.9, s0=0.42, s1=1.0, lift=0.35, dg=2.0, og=0.45, tk=0.3),
        roof_mat=dict(kind='copper', raft_reg='WOOD', raft_sp=0.75), kohai=dict(bay=1, depth=2.6), arm_all=False,
        dress=[('interior', dict(img='INT_HAIDEN', bay=1)), ('shimenawa', dict(bay=1)), ('suzu', dict()), ('saisen', dict(w=1.5, d_back=0.15)),
               ('gaku_v', dict(img='GAKU1')), ('lanterns', dict(bays=(0, 2), img='CHOCHIN1')), ('komainu', dict(d=5.2, du=2.4))]),
    # shrine sanctuary (shinmei-zukuri): 1 bay, high floor, veranda all round, gable bark roof with chigi + katsuogi
    'Honden': dict(
        bx=[2.4], by=[1.8], H=2.2, plat=0.6, floor=1.3, r=0.15, en=0.7, plat_m=0.6, col='WOOD', beam='WOOD', kumi='WOOD',
        end='END_GRAIN', steps=0, door_h=1.9, stairs=('S', 0),
        walls=dict(S=['board'], E=[('plaster', dict(reg='BOARD'))], N=[('plaster', dict(reg='BOARD'))], W=[('plaster', dict(reg='BOARD'))]),
        roof=dict(kind='gable', ov=1.0, s0=0.78, s1=0.92, lift=0.0, tk=0.42),
        roof_mat=dict(kind='bark', raft_reg='WOOD', corner=False), extra='shinmei',
        dress=[('shimenawa', dict(bay=0, small=True))]),
    # purification pavilion: four posts, gable copper roof, stone basin with water (ladles in the dressing)
    'Temizuya': dict(
        bx=[2.6], by=[1.6], H=2.4, plat=0.15, floor=0.0, r=0.11, en=0.0, plat_m=0.5, col='WOOD', beam='WOOD', kumi='WOOD',
        end='END_GRAIN', steps=0, door_h=2.2,
        walls=dict(S=['open'], E=['open'], N=['open'], W=['open']),
        roof=dict(kind='gable', ov=0.75, s0=0.5, s1=0.85, lift=0.2, tk=0.24),
        roof_mat=dict(kind='copper', raft_reg='WOOD'), extra='basin',
        dress=[('ladles', dict())]),
    # amulet office (juyosho / shamusho): counter windows, plaster, tile gable roof
    'Juyosho': dict(
        bx=[1.8, 1.8, 1.8, 1.8], by=[1.8, 1.8], H=2.7, plat=0.3, floor=0.4, r=0.12, en=0.0, plat_m=0.6, col='WOOD', beam='WOOD',
        kumi='WOOD', end='END_GRAIN', steps=0, door_h=2.2,
        walls=dict(S=[('counter', dict()), ('counter', dict()), ('counter', dict()), ('board', dict())], E=['renji', 'plaster'],
                   W=['plaster', 'renji'], N=['plaster', 'board', 'plaster', 'renji']),
        roof=dict(kind='irimoya', ov=1.1, s0=0.4, s1=0.9, lift=0.25, dg=1.2, og=0.3, tk=0.3),
        roof_mat=dict(kind='tile', pitch=0.36, amp=0.06, raft_reg='WOOD'),
        dress=[('counter_int', dict()), ('sign', dict(img='KB0', u=3.6, w=2.4, h=0.6)), ('price', dict(u=6.2)),
               ('ema_rack', dict(u=-3.2, d=1.6)), ('omikuji', dict(u=9.2, d=1.6)), ('nobori', dict(us=(-0.6, 7.8), d=2.0, imgs=('NOBORI0', 'NOBORI2')))]),
}


def counter(c, f, u0, u1, z0, z1, opt):
    """Amulet counter window: board below, sliding glass panes above a
    counter shelf, the dark room behind (interior picture in the dressing)."""
    zc = z0 + 0.85
    T.panel(c, f, u0, u1, z0, zc, 'BOARD', -0.04)
    T.panel(c, f, u0, u1, zc, z1, 'INTERIOR', -0.5)
    c.box(f, u0, u1, zc - 0.05, zc, -0.5, 0.35, 'WOOD_FLAT', skip=('in',))
    if c.lod == 0:
        n = 3
        for i in range(n + 1):
            u = u0 + (u1 - u0) * i / n
            c.box(f, u - 0.03, u + 0.03, zc, z1, -0.08, -0.03, 'WOOD', skip=('in',), rotate=True)
        c.box(f, u0, u1, z1 - 0.06, z1, -0.08, -0.03, 'WOOD', skip=('in',))
    return dict(kind='counter', f=F(f.o, f.n, u0, u1, zc, z1), lit=True)


T.WALLS['counter'] = counter


def _bell_beam(c, s, info):
    """Cross beam of the bell tower the bell hangs from."""
    L, zc = info['L'], info['zc']
    f = F(Vector((0, 0, 0)), (0, -1))
    T.beam(c, f, -L / 2 - 0.1, L / 2 + 0.1, zc - 0.62, zc - 0.3, -0.13, 0.13, s.get('beam', 'NURI'), 'GOFUN', skip=())


def _basin(c, s, info):
    """Stone water basin (chōzubachi) on a low plinth, water inside, a
    bronze spout at the back."""
    f = F(Vector((0, 0, 0)), (0, -1))
    P = info['P']
    c.box(f, -1.0, 1.0, P, P + 0.15, -0.48, 0.48, 'STONE_DARK', skip=('bot',), bevel=True)
    b = c.box(f, -0.9, 0.9, P + 0.15, P + 0.62, -0.38, 0.38, 'STONE', skip=('bot', 'top'), bevel=True)
    rim = 0.1
    for a0, a1, d0, d1 in ((-0.9, 0.9, 0.38 - rim, 0.38), (-0.9, 0.9, -0.38, -0.38 + rim), (-0.9, -0.9 + rim, -0.38 + rim, 0.38 - rim),
                           (0.9 - rim, 0.9, -0.38 + rim, 0.38 - rim)):
        c.box(f, a0, a1, P + 0.62, P + 0.64, d0, d1, 'STONE_FLAT', skip=('bot',))
    w = T._face(c, [f(-0.8, P + 0.56, -0.28), f(0.8, P + 0.56, -0.28), f(0.8, P + 0.56, 0.28), f(-0.8, P + 0.56, 0.28)], ZV)
    c.m([w], 'WATER'); c.nb([w])
    inner = [T._face(c, [f(-0.8, P + 0.56, d), f(0.8, P + 0.56, d), f(0.8, P + 0.64, d), f(-0.8, P + 0.64, d)], (0, 1 if d < 0 else -1, 0)) for d in (-0.28, 0.28)]
    inner += [T._face(c, [f(u, P + 0.56, -0.28), f(u, P + 0.56, 0.28), f(u, P + 0.64, 0.28), f(u, P + 0.64, -0.28)], (1 if u < 0 else -1, 0, 0)) for u in (-0.8, 0.8)]
    c.m(inner, 'STONE_FLAT'); c.nb(inner)
    # spout: a bronze pipe from a little stone at the back
    c.box(f, -0.15, 0.15, P, P + 1.15, -0.62, -0.38, 'STONE_FLAT', skip=('bot',), bevel=True)
    c.tube([f(0, P + 1.0, -0.5), f(0, P + 1.0, -0.2), f(0, P + 0.9, -0.05)], 0.035, 6, 'BRONZE')


def _shinmei(c, s, info, R):
    """Shinmei details: chigi (crossed boards at the gables, rising over the
    ridge), katsuogi (logs across the ridge), free-standing ridge posts
    (munamochi-bashira) outside the gables."""
    lod = c.lod
    zr = R.z('S', 0.0, R.D)
    for sx in (-1, 1):
        x = sx * (R.Xg - 0.05)
        for side, sy in (('S', -1), ('N', 1)):
            # board along the verge line, continued past the ridge
            pts = []
            for d in (R.D * 0.55, R.D + 1.1):
                y = sy * (R.Ey - d) if d <= R.D else -sy * (d - R.D)
                z = R.ze + R.g(min(d, R.D)) + (d - R.D) * R.s1 if d > R.D else R.z(side, R.Xg, d)
                pts.append(Vector((x, y, z + 0.05)))
            T._sweep_rect(c, pts, 0.09, 0.3, 'WOOD_FLAT', ends=True, up=ZV)
        # ridge post outside the gable
        T.column(c, sx * (info['L'] / 2 + 0.55), 0.0, 0.0, zr - 0.1, 0.15, 'WOOD', base=True)
    # ridge beam + katsuogi
    ridge = K.tube_path(c.bm, [(-R.Xg - 0.1, 0, zr + 0.12), (R.Xg + 0.1, 0, zr + 0.12)], 0.17, 8 if lod == 0 else 5, cap0=True, cap1=True)
    c.m(ridge[0], 'HIWADA_FLAT'); c.m([ridge[1], ridge[2]], 'END_GRAIN'); c.nb(ridge[0] + [ridge[1], ridge[2]])
    n = 5
    for k in range(n):
        x = -R.Xg * 0.75 + 1.5 * R.Xg * k / (n - 1)
        lg = K.tube_path(c.bm, [(x, -0.55, zr + 0.36), (x, 0.55, zr + 0.36)], 0.13, 8 if lod == 0 else 5, cap0=True, cap1=True)
        c.m(lg[0], 'WOOD'); c.m([lg[1], lg[2]], 'GOLD'); c.nb(lg[0] + [lg[1], lg[2]])


def kohai(c, s, info, R, bay=1, depth=2.6, kind='copper'):
    """Step canopy (kōhai): a pent roof continuing the front slope over the
    steps, on two posts with tie beams back to the hall."""
    L, B = info['L'], info['B']
    us = T.side_cols(s, 0)
    xa, xb = -L / 2 + us[bay], -L / 2 + us[bay + 1]
    w = (xb - xa) / 2 + 0.45
    xc = (xa + xb) / 2
    # high edge tucked under the main soffit, half way out
    d_main = R.ov * 0.55
    y_top = -(R.Ey - d_main)
    z_top = R.zu('S', xc, d_main) - 0.06
    Rk = T.Roof('shed', w, depth, 0.0, s0=0.36, s1=0.5, lift=0.25, lam=0.6, top=depth, ov=0.75, tk=0.24, su=0.18)
    Rk.ze = z_top - Rk.g(depth)
    before = set(c.bm.verts)
    reg = {'tile': 'KAWARA', 'copper': 'DOBAN', 'bark': 'HIWADA'}[kind]
    rows = T.roof_surface(c, Rk, reg, 0.4, 0.0)
    T.eave(c, Rk, rows, kind='edge', fascia_reg='COPPER_FLAT' if kind == 'copper' else 'WOOD_FLAT', soffit='BOARD_FLAT')
    T.rafters(c, Rk, spacing=0.4, reg='WOOD_FLAT')
    T.gable_wall(c, Rk, gegyo=False)
    new = [v for v in c.bm.verts if v not in before]
    bmesh.ops.translate(c.bm, verts=new, vec=(xc, y_top, 0))
    # posts at the eave line (inside the overhang) and tie beams to the hall
    yp = y_top - depth + Rk.ov
    zp = Rk.zu('S', 0.0, Rk.ov) - 0.05
    for x in (xc - w + 0.45, xc + w - 0.45):
        T.column(c, x, yp, info['P'], zp, 0.14, s.get('col', 'WOOD'))
        T.beam(c, F(Vector((x, 0, 0)), (1, 0)), yp - 0.2, -B / 2, zp - 0.42, zp - 0.18, -0.07, 0.07, s.get('beam', 'WOOD'), 'END_GRAIN', skip=())
    T.beam(c, F(Vector((0, yp, 0)), (0, -1)), xc - w + 0.25, xc + w - 0.25, zp - 0.25, zp, -0.1, 0.1, s.get('beam', 'WOOD'), 'END_GRAIN', skip=())
    return yp


def _hall(key, spec, lod):
    c = C('Tera', lod)
    R, slots, info = T.hall(c, spec)
    rm = dict(spec.get('roof_mat', {}))
    info['ridge'] = T.roof(c, R, **rm)
    ex = spec.get('extra')
    if ex == 'bell_beam':
        _bell_beam(c, spec, info)
    elif ex == 'basin':
        _basin(c, spec, info)
    elif ex == 'shinmei':
        _shinmei(c, spec, info, R)
        info['ridge'] += 0.9
    if spec.get('kohai'):
        info['kohai_y'] = kohai(c, spec, info, R, kind=rm.get('kind', 'copper'), **spec['kohai'])
    return c, slots, info, R


# ── dressing ────────────────────────────────────────────────────────────────

def _dress(key, spec, slots, info, R, lod):
    c = C('TeraShop', lod)
    L, B, P, z0, en = info['L'], info['B'], info['P'], info['z0'], info['en']
    f0 = T.frame(L, B, 0)
    us = T.side_cols(spec, 0)
    m = spec.get('plat_m', 1.0)
    fp = FZ(f0, P)          # on the platform
    for kind, o in spec.get('dress', []):
        if kind == 'interior':
            for sl in slots:
                if sl['side'] == 'S' and sl['kind'] in ('open', 'lattice', 'counter') and (sl['kind'] == 'open' or o.get('bay') is not None):
                    if o.get('bay') is not None and abs(sl['u0'] - us[o['bay']]) > 0.01:
                        continue
                    f = sl['f']
                    d = -0.38
                    q = [f(f.u0, f.z0, d), f(f.u1, f.z0, d), f(f.u1, f.z1, d), f(f.u0, f.z1, d)]
                    fc = T._face(c, q, f.n); c.m([fc], o['img']); c.nb([fc])
        elif kind == 'counter_int':
            for sl in slots:
                if sl['kind'] == 'counter':
                    f = sl['f']
                    q = [f(f.u0, f.z0, -0.48), f(f.u1, f.z0, -0.48), f(f.u1, f.z1, -0.48), f(f.u0, f.z1, -0.48)]
                    fc = T._face(c, q, f.n); c.m([fc], 'INT_JUYO'); c.nb([fc])
        elif kind == 'gaku':   # in the bracket zone above the big lantern
            T.gaku(c, f0, L / 2, info['zk'] + (0.05 if spec.get('steps', 1) > 1 else -0.25), 0.36, o['img'], o['w'], o['h'])
        elif kind == 'gaku_v':
            T.gaku(c, f0, L / 2, info['zd'] + 0.28, 0.3, o['img'], 0.5, 1.0)
        elif kind == 'big_lantern':
            T.big_lantern(c, f0, L / 2, info['zc'] + 0.1, en - 0.5, r=0.5, h=1.35)
        elif kind == 'saisen':
            fv = FZ(f0, z0)
            T.saisen(c, fv, L / 2, en - o.get('d_back', 0.25), w=o.get('w', 1.6))
        elif kind == 'lanterns':
            for b in o['bays']:
                u = (us[b] + us[b + 1]) / 2
                KK.chochin(c, f0, u, info['zd'] - 0.55, en - 0.35, o.get('img', 'CHOCHIN1'), r=0.2, h=0.5, hook=True, hang=0.25)
        elif kind == 'jokoro':
            T.jokoro(c, f0(L / 2, 0, en + m + o['d']), o.get('s', 1.0))
        elif kind == 'nobori':
            for i, u in enumerate(o['us']):
                KK.nobori(c, f0, u, o['d'] + en + m, o['imgs'][i % len(o['imgs'])], h=2.4, w=0.5)
        elif kind == 'broom':
            p = f0(o['u'], 0, o['d']) if o.get('ground') else fp(o['u'], 0, o['d'])
            T.broom(c, p)
        elif kind == 'bonsho':
            T.bonsho(c, (0, 0), info['zc'] - 0.62, h=1.5, r=0.5)
        elif kind == 'shimenawa':
            b = o['bay']
            ua, ub = us[b] + 0.05, us[b + 1] - 0.05
            z = info['zd'] - 0.05
            dd = spec.get('r', 0.2) + 0.12
            T.shimenawa(c, f0(ua, z, dd), f0(ub, z, dd), sag=0.18 if not o.get('small') else 0.1, r=0.14 if not o.get('small') else 0.08,
                        tassels=3 if not o.get('small') else 2, n_shide=4 if not o.get('small') else 2)
        elif kind == 'suzu':
            T.suzu(c, f0(L / 2, info['zd'] - 0.15, spec.get('r', 0.2) + 0.35), length=info['zd'] - 0.15 - 0.5 - z0 - 0.35)
        elif kind == 'komainu':
            for sg in (-1, 1):
                p = f0(L / 2 + sg * o['du'], 0, en + m + o['d'] - m)
                T.komainu(c, (p.x, p.y), face=(sg * 0.45, -0.9), mirror=sg > 0)
        elif kind == 'ladles':
            fb = F(Vector((0, 0, 0)), (0, -1))
            zt = P + 0.7
            for d in (-0.15, 0.15):
                c.tube([fb(-0.75, zt, d), fb(0.75, zt, d)], 0.015, 4, 'BAMBOO')
            for i in range(5):
                u = -0.6 + 0.3 * i
                cup = K.lathe(c.bm, 8 if lod == 0 else 5, [(0.0, zt + 0.02), (0.05, zt + 0.02), (0.05, zt + 0.1)], cx=fb(u, 0, -0.2).x,
                              cy=fb(u, 0, -0.2).y, cap_bottom=False, cap_top=True)
                c.m(cup['sides'] + [cup['top']], 'WOOD_PALE'); c.nb(cup['sides'] + [cup['top']])
                c.tube([fb(u, zt + 0.05, -0.15), fb(u + 0.05, zt + 0.03, 0.3)], 0.008, 3, 'BAMBOO')
        elif kind == 'sign':
            KK.board(c, f0, o['u'], o['w'], o['h'], info['zd'] + 0.12, 0.25, o['img'], cap=False)
        elif kind == 'price':
            fv = FZ(f0, z0)
            b = c.box(fv, o['u'] - 0.25, o['u'] + 0.25, 0.9, 1.65, 0.02, 0.06, None, skip=('in',))
            c.m([b['out']], 'PRICE'); c.m([b[k] for k in ('l', 'r', 'top', 'bot')], 'WOOD_DARK')
        elif kind == 'ema_rack':
            T.ema_rack(c, f0, o['u'] - 0.9, o['u'] + 0.9, o['d'], seed=3)
        elif kind == 'omikuji':
            T.omikuji_rack(c, f0, o['u'] - 0.8, o['u'] + 0.8, o['d'], seed=4)
        else:
            raise ValueError(f'unknown dressing {kind}')
    return c


def build_hall(key, spec, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Tera')
    smat = K.atlas_material('TeraShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, slots, info, R = _hall(key, spec, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        if spec.get('dress'):
            cs = _dress(key, spec, slots, info, R, lod)
            shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    L, B, en = info['L'], info['B'], info['en']
    m = spec.get('plat_m', 1.0)
    if info['P'] > 0.05:
        K.collider_box(f'COL_{name}_Base', col, -L / 2 - en - m, L / 2 + en + m, -B / 2 - en - m, B / 2 + en + m, 0.0, info['P'])
    if any(k == 'open' for w in spec['walls'].values() for k in w) or spec.get('walls', {}).get('S', [''])[0] == 'open':
        for x in info['xs']:
            for y in (info['ys'][0], info['ys'][-1]):
                K.collider_box(f'COL_{name}_Post_{len([o for o in col.objects if "Post" in o.name])}', col, x - 0.25, x + 0.25, y - 0.25, y + 0.25,
                               info['P'], info['zu'])
    else:
        K.collider_box(f'COL_{name}_Hall', col, -L / 2 - en, L / 2 + en, -B / 2 - en, B / 2 + en, info['P'], info['zu'])
    K.collider_box(f'COL_{name}_Roof', col, -R.Ex, R.Ex, -R.Ey, R.Ey, info['zu'], info['ridge'])
    i = 0
    for sl in slots:
        if sl['kind'] in ('open', 'counter') or sl.get('lit'):
            f = sl['f']
            p = f(f.uc, (f.z0 + f.z1) / 2, 0.6)
            K.light_marker(f'LIGHT_{name}_{i}', col, tuple(p), color=(1.0, 0.68, 0.4), watts=30, unity_range=5.0)
            i += 1
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(info['ridge'], 2))
    return col, objs


# ── two-storey gate (rōmon) ─────────────────────────────────────────────────

SANMON = dict(
    lower=dict(bx=[3.0, 3.6, 3.0], by=[2.3, 2.3], H=4.2, plat=0.35, floor=0.0, r=0.24, en=0.0, plat_m=1.2, col='NURI', beam='NURI',
               kumi='NURI', steps=2, reach=0.4, door_h=3.5, roof=None,
               walls=dict(S=[('lattice', dict()), 'open', ('lattice', dict())], N=['plaster', 'open', 'plaster'],
                          E=['plaster', 'plaster'], W=['plaster', 'plaster'])),
    upper=dict(bx=[3.0, 3.6, 3.0], by=[2.3, 2.3], H=2.7, plat=0.0, floor=0.35, r=0.21, en=0.9, plat_m=0.0, platform=False, col='NURI',
               beam='NURI', kumi='NURI', steps=2, reach=0.45, door_h=2.1, col_base=False, arm_all=False,
               walls=dict(S=['renji', 'board', 'renji'], N=['renji', 'board', 'renji'], E=['plaster', 'plaster'], W=['plaster', 'plaster']),
               roof=dict(kind='irimoya', ov=2.4, s0=0.34, s1=1.08, lift=0.7, dg=2.5, og=0.5),
               roof_mat=dict(kind='tile', pitch=0.45, amp=0.08)),
)


def _sanmon(lod):
    c = C('Tera', lod)
    lo, up = SANMON['lower'], SANMON['upper']
    _, slots, info = T.hall(c, lo)
    zb = info['zu'] - 0.15
    before = set(c.bm.verts)
    R, slots_u, info_u = T.hall(c, up)
    ridge = T.roof(c, R, **up['roof_mat'])
    new = [v for v in c.bm.verts if v not in before]
    bmesh.ops.translate(c.bm, verts=new, vec=(0, 0, zb))
    info.update(ridge=ridge + zb, zb=zb, upper=info_u, R=R)
    return c, slots, info, R


def build_sanmon(key='Sanmon', lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Tera')
    smat = K.atlas_material('TeraShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, slots, info, R = _sanmon(lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = C('TeraShop', lod)
        L = info['L']
        f0 = T.frame(L, info['B'], 0)
        zb, iu = info['zb'], info['upper']
        T.gaku(cs, f0, L / 2, zb + iu['zd'] + 0.28, 0.32, 'GAKU0', 1.5, 0.75)
        T.big_lantern(cs, f0, L / 2, info['zd'] + 0.2, 0.9, img='CHOCHIN0', r=0.75, h=2.0)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    L, B = info['L'], info['B']
    for x in info['xs']:
        for y in info['ys']:
            if abs(x) < 1.0 and abs(y) < 0.1:
                continue
            K.collider_box(f'COL_{name}_Post_{len(col.objects)}', col, x - 0.3, x + 0.3, y - 0.3, y + 0.3, 0.0, info['zb'])
    K.collider_box(f'COL_{name}_Side_W', col, -L / 2 - 0.3, -L / 2 + 3.0, -B / 2 - 0.3, B / 2 + 0.3, 0.0, info['zb'])
    K.collider_box(f'COL_{name}_Side_E', col, L / 2 - 3.0, L / 2 + 0.3, -B / 2 - 0.3, B / 2 + 0.3, 0.0, info['zb'])
    K.collider_box(f'COL_{name}_Upper', col, -R.Ex, R.Ex, -R.Ey, R.Ey, info['zb'], info['ridge'])
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(info['ridge'], 2))
    return col, objs


# ── three-storey pagoda ─────────────────────────────────────────────────────

PAGODA = dict(bays=[1.75, 2.1, 1.75], shrink=0.8, H=[3.0, 2.3, 2.2], ov=[2.4, 2.1, 1.95], plat=0.75)


def _sorin(c, z, h=6.0):
    """Finial (sōrin): dew basin, upturned bowl, nine rings on the mast, the
    water-flame (suien) panels, the jewel on top. Bronze."""
    lod = c.lod
    n = 8 if lod == 0 else 6
    b = K.lathe(c.bm, 4, [(0.75, z - 0.1), (0.75, z + 0.35), (0.6, z + 0.45), (0.0, z + 0.45)], phase=math.pi / 4, cap_bottom=False)
    c.m(b['sides'], 'BRONZE'); c.nb(b['sides'])
    bowl = K.lathe(c.bm, n, [(0.2, z + 0.45), (0.5, z + 0.6), (0.52, z + 0.8), (0.0, z + 0.85)], cap_bottom=False)
    c.m(bowl['sides'], 'BRONZE'); c.nb(bowl['sides'])
    c.tube([(0, 0, z + 0.8), (0, 0, z + h)], 0.07, 6 if lod == 0 else 4, 'BRONZE')
    for k in range(9 if lod == 0 else 5):
        zk = z + 1.0 + (3.2 * k / 8 if lod == 0 else 3.2 * k / 4)
        r = 0.42 - 0.012 * k
        ring = K.lathe(c.bm, n, [(r, zk), (r, zk + 0.12), (0.08, zk + 0.14)], cap_bottom=True)
        c.m(ring['sides'] + [ring['bottom']], 'BRONZE'); c.nb(ring['sides'] + [ring['bottom']])
    zf = z + 4.4
    for a in (0.0, math.pi / 2):   # suien: two crossed flame panels
        t = Vector((math.cos(a), math.sin(a), 0))
        q = [t * -0.35 + ZV * zf, t * 0.35 + ZV * zf, t * 0.25 + ZV * (zf + 0.9), ZV * (zf + 1.1), t * -0.25 + ZV * (zf + 0.9)]
        n_ = t.cross(ZV)
        fs = [T._face(c, q, n_), T._face(c, [p + n_ * 0.01 for p in q], -n_)]
        c.m(fs, 'GOLD'); c.nb(fs)
    j = K.lathe(c.bm, n, [(0.0, z + h - 0.3), (0.15, z + h - 0.2), (0.12, z + h), (0.0, z + h + 0.15)], cap_bottom=False)
    c.m(j['sides'], 'GOLD'); c.nb(j['sides'])


def _pagoda(lod):
    c = C('Tera', lod)
    pg = PAGODA
    zbase = 0.0
    ridge = 0.0
    slots = []
    for i in range(3):
        sc = pg['shrink'] ** i
        bays = [b * sc for b in pg['bays']]
        last = i == 2
        nxt = sum(pg['bays']) * pg['shrink'] ** (i + 1) / 2 if not last else 0.0
        ov = pg['ov'][i]
        half = sum(bays) / 2
        top = (half + ov) - nxt + 0.25 if not last else None
        s = dict(bx=bays, by=bays, H=pg['H'][i], plat=pg['plat'] if i == 0 else 0.0, floor=0.0 if i == 0 else 0.3,
                 r=0.18 * (0.9 ** i), en=0.0 if i == 0 else 0.55, plat_m=1.2, platform=i == 0, plat_steps=('S', 1.4) if i == 0 else None,
                 col='NURI', beam='NURI', kumi='NURI', steps=2, reach=0.4, door_h=2.3 if i == 0 else 1.7, rail=i > 0,
                 col_base=i == 0, between=False, arm_all=False, struts=False,
                 walls=dict(S=['renji', ('board', dict(open=True)), 'renji'], E=['plaster', ('board', dict(plain=True)), 'plaster'],
                            N=['plaster', ('board', dict(plain=True)), 'plaster'], W=['plaster', ('board', dict(plain=True)), 'plaster']) if i == 0 else
                 {k: ['plaster', ('board', dict(plain=True)), 'plaster'] for k in 'SENW'},
                 roof=dict(kind='hip', ov=ov, s0=0.3, s1=0.75 if not last else 1.2, lift=0.55, top=top, tk=0.32))
        before = set(c.bm.verts)
        R, sl, info = T.hall(c, s)
        T.roof(c, R, kind='tile', pitch=0.55, amp=0.08, raft_sp=0.8, bell=i == 0, raft=i == 0)
        if last:
            ztop = R.z('S', 0.0, R.D)
            _sorin(c, ztop - 0.15)
            ridge = zbase + ztop + 6.0
        new = [v for v in c.bm.verts if v not in before]
        bmesh.ops.translate(c.bm, verts=new, vec=(0, 0, zbase))
        if i == 0:
            slots = sl
            info0 = info
        if not last:
            zbase += R.z('S', 0.0, top) - 0.32
    info0['ridge'] = ridge
    return c, slots, info0


def build_pagoda(key='Pagoda_3', lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Tera')
    objs = []
    for lod in lods:
        c, slots, info = _pagoda(lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
    h = sum(PAGODA['bays']) / 2
    K.collider_box(f'COL_{name}_Base', col, -h - 1.2, h + 1.2, -h - 1.2, h + 1.2, 0.0, PAGODA['plat'])
    K.collider_box(f'COL_{name}_Tower', col, -h - 0.4, h + 0.4, -h - 0.4, h + 0.4, PAGODA['plat'], info['ridge'] - 6.0)
    col['dims'] = dict(ridge=round(info['ridge'], 2))
    return col, objs



# ── precinct pieces (atlas Tera) and detail sets (atlas TeraShop) ───────────

def _quads(c, x0, x1, y0, y1, z, reg, band=None, up=True):
    """Ground strip in bands along y no deeper than the strip (ground textures)."""
    band = band or (c.R(reg)['h_m'] - 0.02)
    n = max(1, math.ceil((y1 - y0) / band - 1e-6))
    fs = []
    for k in range(n):
        ya, yb = y0 + (y1 - y0) * k / n, y0 + (y1 - y0) * (k + 1) / n
        fs.append(T._face(c, [(x0, ya, z), (x1, ya, z), (x1, yb, z), (x0, yb, z)], (0, 0, 1 if up else -1)))
    c.m(fs, reg)
    return fs


def _wall(c, kind='plaster', L=4.0):
    """Precinct wall (tsuiji-bei) along X: rubble-stone base, earthen or
    plastered body with a slight batter, a timber band, and a small tiled
    gable cap with its ridge (continuous: piece ends are open)."""
    lod = c.lod
    x0, x1 = -L / 2, L / 2
    fr = F(Vector((0, 0, 0)), (0, -1))
    c.box(fr, x0, x1, 0.0, 0.55, -0.42, 0.42, 'ISHIGAKI', skip=('bot', 'l', 'r'))
    reg = 'SUJI' if kind == 'suji' else 'PLASTER'
    for sg in (-1, 1):   # battered faces: 0.34 at the foot, 0.28 at the top
        f = T._face(c, [(x0, sg * 0.34, 0.55), (x1, sg * 0.34, 0.55), (x1, sg * 0.28, 2.45), (x0, sg * 0.28, 2.45)], (0, sg, 0.1))
        GK_map(c, f, reg, (0, sg * 0.34, 0.55))
    T.beam(c, fr, x0, x1, 2.38, 2.52, -0.33, 0.33, 'WOOD', 'END_GRAIN', skip=('l', 'r', 'bot'))
    R = T.Roof('gable', L / 2, 0.68, 0.0, s0=0.55, s1=0.62, lift=0.0, ov=0.36, tk=0.14, su=0.2)
    R.ze = 2.52 + 0.14 - 0.2 * 0.36 + 0.02
    rows = T.roof_surface(c, R, 'KAWARA', 0.3, 0.05)
    T.eave(c, R, rows, 0.3, 0.05, kind='tile', fascia_reg='FASCIA', soffit='WOOD_FLAT')
    zr = R.z('S', 0.0, R.D)
    poly = [(-0.16, zr - 0.08), (-0.14, zr + 0.12), (0.14, zr + 0.12), (0.16, zr - 0.08)]
    sides, a, b = K.poly_prism_x(c.bm, poly, x0, x1)
    c.m(sides, 'TILE_DARK'); c.bm.faces.remove(a); c.bm.faces.remove(b); c.nb(sides)
    fs = KK.tile_row(c.bm, (x0, 0, zr + 0.12), (x1, 0, zr + 0.12), 0.09, 4 if lod == 0 else 2, (0, 1, 0))
    c.bm.faces.remove(fs[-1])
    c.m(fs[:-1], 'TILE_A'); c.nb(fs[:-1])


def GK_map(c, f, reg, origin):
    from buildings import gassho_kit as GK
    GK.map_axes(c, [f], reg, origin, (1, 0, 0), (Vector((0, -0.06, 1.9)) if origin[1] < 0 else Vector((0, 0.06, 1.9))).normalized())


def _sando(c, L=8.0):
    """Paved approach (sandō): stone slab band in the middle, granite kerbs,
    raked gravel either side."""
    x0, x1 = -L / 2, L / 2
    _quads(c, x0, x1, -1.0, 1.0, 0.06, 'ISHIDATAMI')
    fr = F(Vector((0, 0, 0)), (0, -1))
    for sg in (-1, 1):
        y0, y1 = sorted((sg * 1.0, sg * 1.18))
        c.box(fr, x0, x1, -0.05, 0.08, -y1, -y0, 'STONE_FLAT', skip=('bot', 'l', 'r'), bevel=True)
        ya, yb = sorted((sg * 1.18, sg * 2.6))
        _quads(c, x0, x1, ya, yb, 0.03, 'GRAVEL')


def _gravel_path(c, L=8.0, seed=5):
    """Mountain path: gravel bed with stepping stones (tobi-ishi), mossy
    forest floor at the sides."""
    rnd = random.Random(seed)
    x0, x1 = -L / 2, L / 2
    _quads(c, x0, x1, -1.1, 1.1, 0.03, 'GRAVEL')
    for sg in (-1, 1):
        ya, yb = sorted((sg * 1.1, sg * 2.6))
        _quads(c, x0, x1, ya, yb, 0.02, 'FOREST')
    x = x0 + 0.4
    while x < x1 - 0.3:
        r = rnd.uniform(0.28, 0.4)
        y = rnd.uniform(-0.25, 0.25)
        s = K.lathe(c.bm, 8 if c.lod == 0 else 6, [(r, 0.0), (r * 0.97, 0.08), (r * 0.8, 0.11), (0.0, 0.11)], cx=x, cy=y,
                    phase=rnd.uniform(0, 1), cap_bottom=False)
        for v in {v for fc in s['sides'] for v in fc.verts}:
            v.co.x = x + (v.co.x - x) * 1.25
        c.m(s['sides'], 'STONE_FLAT')
        x += rnd.uniform(0.75, 0.95)


def _steps(c, L=8.0, rise=2.4, W=3.2):
    """Stone stairway (ishi-dan) rising along +X, rubble-stone side walls;
    flat landing strips at both ends (the stone lanterns stand there)."""
    n = 16
    tr = (L - 1.0) / n
    h = rise / n
    fr = F(Vector((0, 0, 0)), (0, -1))
    x = -L / 2 + 0.5
    _quads(c, -L / 2, x, -W / 2, W / 2, 0.03, 'ISHIDATAMI')
    for k in range(n):
        b = c.box(fr, x + tr * k, x + tr * (k + 1) + 0.05, h * k - 0.2, h * (k + 1), -W / 2, W / 2, None, skip=('bot', 'r', 'out', 'in'),
                  bevel=True)
        c.m([b['top']], 'STONE_FLAT'); c.m([b['l']], 'STONE')
    _quads(c, x + tr * n, L / 2, -W / 2, W / 2, rise, 'ISHIDATAMI')
    for sg in (-1, 1):   # side walls in steps of two treads
        for k in range(0, n, 2):
            xa = x + tr * k - (0.5 if k == 0 else 0.0)
            xb = x + tr * (k + 2) + (0.5 if k == n - 2 else 0.0)
            zt = h * (k + 2) + 0.45
            y0, y1 = sorted((sg * W / 2, sg * (W / 2 + 0.55)))
            b = c.box(fr, xa, xb, max(0.0, h * k - 0.6), zt, -y1, -y0, None, skip=('bot',), bevel=True)
            c.m([b['top']], 'STONE_FLAT'); c.m([b[kk] for kk in ('out', 'in', 'l', 'r') if kk in b], 'ISHIGAKI')


PIECES = {   # builder, collider (x0, x1, y0, y1, z0, z1)
    'Wall_Tsuiji_4m': (lambda c: _wall(c, 'plaster'), (-2, 2, -0.45, 0.45, 0.0, 3.0)),
    'Wall_Suji_4m': (lambda c: _wall(c, 'suji'), (-2, 2, -0.45, 0.45, 0.0, 3.0)),
    'Sando_8m': (lambda c: _sando(c), None),
    'Path_Gravel_8m': (lambda c: _gravel_path(c), None),
    'Steps_Stone_8m': (lambda c: _steps(c), (-4, 4, -1.6, 1.6, 0.0, 2.4)),
}


def _set_komainu(c):
    for sg in (-1, 1):
        T.komainu(c, (sg * 1.9, 0.0), face=(-sg * 0.45, -0.9), mirror=sg > 0)


SETS = {   # dressing assets (atlas TeraShop)
    'Komainu_Pair': (_set_komainu, (-2.4, 2.4, -0.6, 0.6, 0.0, 1.9)),
    'Jokoro': (lambda c: T.jokoro(c, (0, 0)), (-0.7, 0.7, -0.7, 0.7, 0.0, 1.8)),
    'Ema_Rack': (lambda c: T.ema_rack(c, F(Vector((0, 0, 0)), (0, -1)), -1.0, 1.0, 0.0, seed=7), (-1.1, 1.1, -0.45, 0.45, 0.0, 2.1)),
    'Omikuji_Rack': (lambda c: T.omikuji_rack(c, F(Vector((0, 0, 0)), (0, -1)), -0.9, 0.9, 0.0, seed=8), (-1.0, 1.0, -0.1, 0.1, 0.0, 1.9)),
    'Nobori_Row_8m': (lambda c: T.nobori_row(c, F(Vector((0, 0, 0)), (0, -1)), -3.5, 3.5, 0.0, imgs=('NOBORI0', 'NOBORI2'), step=1.4), None),
    'Chochin_Rack': (lambda c: T.chochin_rack(c, F(Vector((0, 0, 0)), (0, -1)), -1.6, 1.6, 0.0), (-1.7, 1.7, -0.3, 0.3, 0.0, 2.9)),
    'Tatefuda': (lambda c: T.tatefuda(c, F(Vector((0, 0, 0)), (0, -1)), 0.0, 0.0), (-0.8, 0.8, -0.3, 0.3, 0.0, 2.0)),
}


def build_piece(key, table, atlas, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(atlas, emission_strength=1.6 if atlas == 'TeraShop' else 4.0)
    fn, cb = table[key]
    objs = []
    for lod in lods:
        c = C(atlas, lod)
        fn(c)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.012 if lod == 0 and atlas == 'Tera' else 0.0,
                                  hidden=lod > 0, recalc=False))
    if cb:
        K.collider_box(f'COL_{name}', col, *cb)
    if key == 'Chochin_Rack':
        K.light_marker(f'LIGHT_{name}', col, (0, -0.4, 2.0), color=(1.0, 0.75, 0.5), watts=20, unity_range=4.0)
    return col, objs


def build():
    out = [build_hall(k, s) for k, s in HALLS.items()]
    out.append(build_sanmon())
    out.append(build_pagoda())
    out += [build_piece(k, PIECES, 'Tera') for k in PIECES]
    out += [build_piece(k, SETS, 'TeraShop') for k in SETS]
    print('dressing:', {c.name: list(c['shop_tris']) for c, _ in out if 'shop_tris' in c})
    return out



# ── scenes ──────────────────────────────────────────────────────────────────
# Linked copies (minato._place): an asset may stand several times, nothing is
# moved, everything is removed afterwards. Trees are preview placeholders
# (cedar = trunk + cones) until task 4 (vegetation) - they are not exported.
R90 = math.pi / 2
KEIDAI = [('Sanmon', (0, -30), 0.0), ('Hondo', (0, 18), 0.0), ('Pagoda_3', (-17, 2), 0.0), ('Shoro', (17, -6), 0.0),
          ('Temizuya', (8, -18), -R90), ('Juyosho', (-11, -15), R90), ('Chochin_Rack', (6.5, 6.5), 0.0),
          ('Ema_Rack', (-11, -6), R90), ('Omikuji_Rack', (-7.5, -6.5), 0.4)] + \
         [('Sando_8m', (0, y), R90) for y in (-21, -13, -5, 3)] + \
         [('Nobori_Row_8m', (sg * 3.3, y), R90 if sg < 0 else -R90) for sg in (-1, 1) for y in (-20, -11)] + \
         [('Wall_Suji_4m', (x, -31.0), 0.0) for x in (-23, -19, -15, -11, 11, 15, 19, 23)]
KEIDAI_PROPS = [('StoneLantern', (sg * 3.4, y), 0.0) for sg in (-1, 1) for y in (-24, -15.5, -6.5, 1.5)] + \
               [('Bench_Teahouse', (-6.5, -20), R90), ('Bicycle_Mamachari_Cream', (-14.5, -22), 0.3)]
KEIDAI_LAND = [(-40, 40, -60, 50)]
KEIDAI_TREES = [(x, y, 1.0) for x, y in ((-28, -20), (-27, 10), (-30, 25), (27, 12), (29, -18), (24, 30), (-12, 34), (12, 36), (0, 42),
                                          (-35, -5), (34, 0))]

FX = 200.0
UP = 2.4      # the shrine terrace lies one stair flight up
YAMA = [('Steps_Stone_8m', (FX, -14, 0.0), R90), ('Haiden', (FX, 3, UP), 0.0), ('Honden', (FX, 15.5, UP), 0.0),
        ('Temizuya', (FX + 8, -3, UP), -R90), ('Komainu_Pair', (FX, -7.5, UP), 0.0), ('Tatefuda', (FX - 4.6, -24, 0.0), 0.5),
        ('Hondo_Yama', (FX - 19, 8, UP), 0.0), ('Yakuimon', (FX - 19, -4.5, UP), 0.0), ('Nobori_Row_8m', (FX + 3.3, -24, 0.0), -R90)] + \
       [('Path_Gravel_8m', (FX, y, 0.0), R90) for y in (-34, -26)] + [('Path_Gravel_8m', (FX - 9, -6, UP), 0.0)]
YAMA_PROPS = [('Torii_Stone_M', (FX, -30), 0.0), ('Torii_Vermilion_M', (FX, -9.2, UP), 0.0),
              ('StoneLantern', (FX - 2.6, -19.5), 0.0), ('StoneLantern', (FX + 2.6, -19.5), 0.0),
              ('StoneLantern', (FX - 3.2, -6.5, UP), 0.0), ('StoneLantern', (FX + 3.2, -6.5, UP), 0.0),
              ('Rock_M_Moss', (FX + 6, -22), 0.6), ('Rock_L', (FX - 7, -16), 1.2), ('Fence_Bamboo_1_8m', (FX + 5.5, 9), R90)]
YAMA_TREES = [(FX + x, y, z) for x, y, z in ((-5, -35, 0), (5, -33, 0), (-6, -27, 0), (6, -26, 0), (-4.5, -21, 0), (5, -18, 0),
                                             (-9, -12, UP), (9, -11, UP), (-8, 4, UP), (8, 6, UP), (-6, 22, UP), (5, 24, UP), (0, 28, UP),
                                             (12, 12, UP), (13, -6, UP), (-28, 0, UP), (-27, 18, UP), (-12, 20, UP), (-30, -14, UP),
                                             (-14, -14, UP), (16, 20, UP), (-20, 26, UP), (20, -16, 0), (-16, -24, 0), (14, -30, 0))]


def _mat(name, rgb, rough=0.8):
    import bpy
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = K._principled(m.node_tree)
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def _land(tmp, rects, name, rgb=(0.2, 0.19, 0.17)):
    """Preview ground: rects (x0, x1, y0, y1[, z]) - a raised rect gets side walls."""
    import bpy
    me = bpy.data.meshes.new(name)
    vs, fs = [], []
    for r in rects:
        x0, x1, y0, y1 = r[:4]
        z = r[4] if len(r) > 4 else 0.0
        k = len(vs)
        vs += [(x0, y0, z - 0.01), (x1, y0, z - 0.01), (x1, y1, z - 0.01), (x0, y1, z - 0.01)]
        fs.append((k, k + 1, k + 2, k + 3))
        if z > 0.1:
            k = len(vs)
            vs += [(x0, y0, -0.01), (x1, y0, -0.01)]
            fs.append((k, k + 1, k - 3, k - 4))
    me.from_pydata(vs, [], fs)
    me.materials.append(_mat('M_PreviewEarth', rgb))
    g = bpy.data.objects.new(name, me)
    tmp.objects.link(g)


def _trees(tmp, pts, seed=3):
    """Placeholder cedars (sugi) for the preview only: trunk + three cones."""
    import bpy
    rnd = random.Random(seed)
    trunk_m, crown_m = _mat('M_PreviewBark', (0.09, 0.06, 0.045)), _mat('M_PreviewCedar', (0.05, 0.085, 0.05))
    for i, (x, y, z) in enumerate(pts):
        bm = bmesh.new()
        h = rnd.uniform(16, 24)
        K.lathe(bm, 6, [(0.35, z), (0.25, z + h)], cx=x, cy=y)
        for k in range(3):
            zb = z + h * (0.38 + 0.2 * k)
            K.lathe(bm, 7, [(2.6 - 0.6 * k, zb), (0.0, zb + h * 0.32)], cx=x, cy=y)
        me = bpy.data.meshes.new(f'PreviewCedar{i}')
        bm.to_mesh(me); bm.free()
        me.materials.append(trunk_m); me.materials.append(crown_m)
        for p in me.polygons:
            p.material_index = 0 if p.center.z < z + h * 0.38 else 1
        o = bpy.data.objects.new(f'PreviewCedar{i}', me)
        tmp.objects.link(o)


def _scene(items, props, land, name, trees=()):
    import bpy
    from buildings import minato as MI
    tmp = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if tmp.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(tmp)
    for n, pos, rot in items:
        MI._place(tmp, f'{NAME}_{n}', pos, rot)
    for n, pos, rot in props:
        MI._place(tmp, n, pos, rot)
    _land(tmp, land, name + 'Ground')
    _trees(tmp, trees)
    return tmp


def _clear(name):
    import bpy
    tmp = bpy.data.collections.get(name)
    if not tmp:
        return
    for o in list(tmp.objects):
        bpy.data.objects.remove(o)
    for me in [m for m in bpy.data.meshes if (m.name.startswith(name + 'Ground') or m.name.startswith('PreviewCedar')) and not m.users]:
        bpy.data.meshes.remove(me)
    if tmp.name in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.unlink(tmp)
    bpy.data.collections.remove(tmp)


BUILDINGS = list(HALLS) + ['Sanmon', 'Pagoda_3']


def shots(out_dir, which=('keidai', 'yama', 'houses', 'pieces', 'close')):
    """Busy temple precinct and quiet mountain shrine at eye level (mood +
    neutral), from above, clay; every building front/back/clay; pieces;
    close-ups (eave and brackets, shrine front, bell, chigi, basin ...)."""
    import bpy, os
    from kit import preview as P
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n)
    P.stage(True)
    ground = bpy.data.objects['PreviewGround']
    ground.location.z = -3.0
    try:
        if 'keidai' in which:
            _scene(KEIDAI, KEIDAI_PROPS, KEIDAI_LAND, 'TeraKeidai', KEIDAI_TREES)
            cc = ['TeraKeidai']
            P.shot(cc, (0, 2, 4.5), (0.1, -1, -0.06), 23, o('keidai_eye.png'), mood=True, lens=26)
            P.shot(cc, (0, 2, 4.5), (0.1, -1, -0.06), 23, o('keidai_eye_neutral.png'), lens=26)
            P.shot(cc, (0, -30, 5.0), (0.25, -1, 0.0), 19, o('keidai_gate.png'), mood=True, lens=26)
            P.shot(cc, (-6, 4, 5.0), (1, -0.55, 0.12), 24, o('keidai_side.png'), mood=True, lens=26)
            P.shot(cc, (0, -2, 0.0), (0.6, -0.9, 0.85), 75, o('keidai_high.png'), mood=True, lens=30)
            P.shot(cc, (0, -2, 0.0), (0.6, -0.9, 0.85), 75, o('keidai_high_neutral.png'), lens=30)
            P.shot(cc, (0, 2, 4.5), (0.1, -1, -0.06), 23, o('keidai_clay.png'), mood='clay', lens=26)
            _clear('TeraKeidai')
        if 'yama' in which:
            land = [(FX - 45, FX + 30, -50, -10.6), (FX - 45, FX + 30, -10.0, 45, UP)]
            _scene(YAMA, YAMA_PROPS, land, 'TeraYama', YAMA_TREES)
            yc = ['TeraYama']
            P.shot(yc, (FX, -12, 3.2), (0.0, -1, -0.02), 15, o('yama_steps.png'), mood=True, lens=26)
            P.shot(yc, (FX, -12, 3.2), (0.0, -1, -0.02), 15, o('yama_steps_neutral.png'), lens=26)
            P.shot(yc, (FX, 2, UP + 3.0), (0.35, -1, 0.06), 13, o('yama_haiden.png'), mood=True, lens=26)
            P.shot(yc, (FX - 8, 0, UP), (0.5, -0.8, 0.9), 60, o('yama_high.png'), lens=30)
            P.shot(yc, (FX - 19, 4, UP + 3.5), (0.4, -1, 0.12), 20, o('yama_hondo.png'), mood=True, lens=28)
            P.shot(yc, (FX, -12, 3.2), (0.0, -1, -0.02), 15, o('yama_clay.png'), mood='clay', lens=26)
            _clear('TeraYama')
    finally:
        _clear('TeraKeidai'); _clear('TeraYama')
        ground.location.z = 0.0
    if 'houses' in which:
        try:
            for k in BUILDINGS:
                _scene([(k, (0, 0), 0.0)], [], [], 'TeraOne')
                col = bpy.data.collections[f'{NAME}_{k}']
                ridge = col['dims']['ridge']
                dist = max(10.0, ridge * 2.2)
                tz = ridge * 0.42
                P.shot(['TeraOne'], (0, 0, tz), (0.55, -1, 0.25), dist, o(f'h_{k}.png'), size=(640, 480), lens=35)
                P.shot(['TeraOne'], (0, 0, tz), (0.55, -1, 0.25), dist, o(f'k_{k}.png'), mood='clay', size=(640, 480), lens=35)
                P.shot(['TeraOne'], (0, 0, tz), (-0.6, 1, 0.3), dist, o(f'b_{k}.png'), size=(640, 480), lens=35)
                _clear('TeraOne')
        finally:
            _clear('TeraOne')
    if 'pieces' in which:
        try:
            for k, tgt, dirn, dist in (('Wall_Tsuiji_4m', (0, 0, 1.3), (0.5, -1, 0.3), 7), ('Wall_Suji_4m', (0, 0, 1.3), (0.5, -1, 0.3), 7),
                                       ('Sando_8m', (0, 0, 0), (0.4, -1, 0.6), 9), ('Path_Gravel_8m', (0, 0, 0), (0.4, -1, 0.6), 9),
                                       ('Steps_Stone_8m', (0, 0, 1.2), (-1, -0.5, 0.45), 10), ('Komainu_Pair', (0, 0, 1.0), (0.3, -1, 0.25), 6),
                                       ('Jokoro', (0, 0, 1.0), (0.4, -1, 0.3), 3.5), ('Ema_Rack', (0, 0, 1.1), (0.4, -1, 0.2), 3.8),
                                       ('Omikuji_Rack', (0, 0, 1.1), (0.4, -1, 0.2), 3.6), ('Nobori_Row_8m', (0, 0, 1.6), (0.4, -1, 0.2), 9),
                                       ('Chochin_Rack', (0, 0, 1.6), (0.4, -1, 0.2), 5), ('Tatefuda', (0, 0, 1.2), (0.4, -1, 0.2), 3.5)):
                _scene([(k, (0, 0), 0.0)], [], [], 'TeraOne')
                P.shot(['TeraOne'], tgt, dirn, dist, o(f'p_{k}.png'), size=(640, 480), lens=35)
                if k in ('Wall_Suji_4m', 'Steps_Stone_8m', 'Komainu_Pair'):
                    P.shot(['TeraOne'], tgt, dirn, dist, o(f'pk_{k}.png'), mood='clay', size=(640, 480), lens=35)
                _clear('TeraOne')
        finally:
            _clear('TeraOne')
    if 'close' in which:
        try:
            for k, tgt, dirn, dist, name, mood in (
                    ('Hondo', (4.0, -6.5, 6.4), (0.5, -1, -0.35), 7.0, 'c_eave', True),
                    ('Hondo', (0.0, -7.0, 2.6), (0.25, -1, 0.05), 8.0, 'c_hondo_front', True),
                    ('Hondo', (-8.4, -7.0, 8.0), (-0.8, -1, 0.1), 7.0, 'c_corner', False),
                    ('Haiden', (0.0, -4.5, 2.6), (0.3, -1, 0.05), 6.0, 'c_haiden_front', True),
                    ('Shoro', (0.0, 0.0, 3.0), (0.5, -1, 0.0), 6.0, 'c_bell', False),
                    ('Honden', (0.0, 0.0, 6.0), (0.7, -1, 0.35), 6.0, 'c_chigi', False),
                    ('Temizuya', (0.0, 0.0, 1.0), (0.4, -1, 0.7), 3.6, 'c_basin', False),
                    ('Pagoda_3', (3.5, -3.5, 5.0), (0.5, -1, -0.5), 6.0, 'c_pagoda_eave', False),
                    ('Sanmon', (0.0, -2.0, 3.0), (0.2, -1, 0.0), 8.0, 'c_sanmon', True),
                    ('Juyosho', (0.0, -2.0, 1.5), (0.3, -1, 0.1), 6.0, 'c_juyosho', True)):
                _scene([(k, (0, 0), 0.0)], [], [], 'TeraOne')
                P.shot(['TeraOne'], tgt, dirn, dist, o(name + '.png'), mood=mood, size=(640, 480), lens=35)
                _clear('TeraOne')
        finally:
            _clear('TeraOne')
