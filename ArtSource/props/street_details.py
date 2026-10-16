"""Street details (task 6): the small things every Japanese street has and the
map still lacks. Each answers 'what exists like this only in Japan?':

  CurveMirror_Round / _Double   orange pole, convex mirror(s) with hood, at blind corners
  Barricade_Frog / _Monkey      animal-shaped barricade feet holding a yellow-black bar
  Cone / ConeBar_Set            cones with reflective band, cone bars between them
  KojiBoard                     works A-board with the bowing worker (ご迷惑をおかけします)
  PostBox_Round                 the old round red post box (maru-posuto)
  PhoneBooth                    green public phone booth, lit sign
  SuperCub_Delivery             step-through delivery bike with a box on the carrier
  UmbrellaStand                 konbini umbrella stand with vinyl umbrellas
  SmokingStand                  ashtray column + 喫煙所 sign
  GarbageStation                bags under a blue crow net, collection-day sign
  Manhole_Design                cast design manhole (sakura over waves)
  HydrantSign                   red 消火栓 sign on a pole with the hydrant lid
  Tanuki                        Shigaraki tanuki with hat, flask and ledger
  ManekiNeko                    beckoning cat (shop counter), raised paw, gold koban
  Daruma                        red daruma, one eye painted
  Koinobori                     carp streamers on a pole (May, farmhouses)

Atlas `Details`; origin on the ground, front to -Y."""
import math
from mathutils import Vector, Matrix
from props import detail_kit as D
from props import scatter_kit as S
from kit import core as K

KLASS = 'props'
NAME = 'StreetDetails'
Rx = lambda a: Matrix.Rotation(math.radians(a), 3, 'X')
Ry = lambda a: Matrix.Rotation(math.radians(a), 3, 'Y')
Rz = lambda a: Matrix.Rotation(math.radians(a), 3, 'Z')
V = Vector


def footing(c, x=0.0, y=0.0, r=0.16, h=0.08):
    D.cyl(c, x, y, 0.0, h, r, 'CONC', n=D.n_(c, 8, 6))


def mirror(c, centre, yaw, r=0.4, tilt=-8):
    """Convex road mirror: dished glass, orange rim with a hood, black back, bracket."""
    R = Rz(yaw) @ Rx(tilt)
    ctr = V(centre)
    n = D.n_(c, 20, 12, 8)
    bm = c.bm
    rim_f = [bm.verts.new(ctr + R @ V((r * math.cos(2 * math.pi * i / n), -0.02, r * math.sin(2 * math.pi * i / n)))) for i in range(n)]
    rim_b = [bm.verts.new(ctr + R @ V((r * math.cos(2 * math.pi * i / n), 0.06, r * math.sin(2 * math.pi * i / n)))) for i in range(n)]
    mid = bm.verts.new(ctr + R @ V((0, -0.06, 0)))
    back = bm.verts.new(ctr + R @ V((0, 0.1, 0)))
    glass = [bm.faces.new([rim_f[(i + 1) % n], rim_f[i], mid]) for i in range(n)]
    side = [bm.faces.new([rim_f[i], rim_f[(i + 1) % n], rim_b[(i + 1) % n], rim_b[i]]) for i in range(n)]
    backf = [bm.faces.new([rim_b[i], rim_b[(i + 1) % n], back]) for i in range(n)]
    D.orient(glass + side + backf, ctr + R @ V((0, 0.02, 0)))
    c.m(glass, 'MIRROR'); c.m(side, 'ORANGE_PAINT'); c.m(backf, 'MIRROR_BACK'); c.nb(glass + side + backf)
    if c.lod < 2:
        # hood over the top half
        hood = []
        k = n // 2
        a0 = [bm.verts.new(ctr + R @ V(((r + 0.02) * math.cos(math.pi * i / k), -0.02, (r + 0.02) * math.sin(math.pi * i / k)))) for i in range(k + 1)]
        a1 = [bm.verts.new(ctr + R @ V(((r + 0.02) * math.cos(math.pi * i / k), -0.14, (r + 0.02) * math.sin(math.pi * i / k) * 0.9 + 0.02))) for i in range(k + 1)]
        for i in range(k):
            hood.append(bm.faces.new([a0[i], a0[i + 1], a1[i + 1], a1[i]]))
        # make it two-sided: a copy slightly inside, reversed
        b0 = [bm.verts.new(v.co + (ctr - v.co).normalized() * 0.006) for v in a0]
        b1 = [bm.verts.new(v.co + (ctr - v.co).normalized() * 0.006) for v in a1]
        for i in range(k):
            hood.append(bm.faces.new([b0[i + 1], b0[i], b1[i], b1[i + 1]]))
        D.orient(hood[:k], ctr)
        for f in hood[k:]:
            f.normal_update()
            if (f.calc_center_median() - ctr).dot(f.normal) > 0:
                f.normal_flip()
        c.m(hood, 'ORANGE_PAINT'); c.nb(hood)


def curve_mirror(c, double=False):
    D.cyl(c, 0, 0, 0.0, 3.2, 0.038, 'ORANGE_PAINT', cap_reg='ORANGE_PAINT')
    footing(c)
    if double:
        D.tube(c, [V((-0.45, 0, 3.0)), V((0.45, 0, 3.0))], 0.03, 'ORANGE_PAINT')
        for s in (1, -1):
            D.tube(c, [V((s * 0.45, 0, 3.0)), V((s * 0.45, -0.05, 2.95))], 0.025, 'GALV')
            mirror(c, (s * 0.47, -0.12, 2.75), s * 28, r=0.33)
    else:
        D.tube(c, [V((0, 0, 3.05)), V((0, -0.12, 3.05))], 0.03, 'GALV')
        mirror(c, (0, -0.18, 2.75), 0, r=0.4)
    if c.lod == 0:
        for z in (2.95, 2.55):
            S.post(c, 0, 0, z, z + 0.04, 0.045, 'GALV', cap=None)    # band clamps
        D.box(c, (0, -0.045, 1.9), (0.15, 0.006, 0.2), 'WHITE_PAINT', bevel=False)   # sign plate (blank)


def frog(c, x, monkey=False):
    """Animal barricade foot (kaeru / osaru): weighted base, body, face, bar socket on top."""
    body, belly = ('MONKEY_BROWN', 'MONKEY_FACE') if monkey else ('FROG_GREEN', 'FROG_BELLY')
    D.box(c, (x, 0, 0.04), (0.2, 0.17, 0.04), 'BLACK_PAINT')
    D.blob(c, (x, 0, 0.32), (0.16, 0.13, 0.27), body)
    D.blob(c, (x, -0.06, 0.28), (0.11, 0.08, 0.18), belly)
    D.blob(c, (x, 0, 0.66), (0.15, 0.13, 0.12), body)
    if monkey:
        D.blob(c, (x, -0.07, 0.65), (0.1, 0.06, 0.08), belly)
        for s in (1, -1):
            D.blob(c, (x + s * 0.16, 0, 0.67), (0.04, 0.03, 0.05), belly)
    if c.lod < 2:
        for s in (1, -1):
            if monkey:
                D.blob(c, (x + s * 0.04, -0.13, 0.68), (0.022, 0.012, 0.025), 'EYE_BLACK', sub=1)
            else:
                D.blob(c, (x + s * 0.07, -0.05, 0.75), (0.045, 0.045, 0.045), 'EYE_WHITE', sub=2)
                D.blob(c, (x + s * 0.075, -0.09, 0.76), (0.02, 0.012, 0.02), 'EYE_BLACK', sub=1)
            # arms/hands holding the belly
            D.blob(c, (x + s * 0.13, -0.06, 0.38), (0.04, 0.05, 0.1), body, rot=Ry(s * 25))
    # bar socket in the head
    D.cyl(c, x, 0, 0.74 if not monkey else 0.76, 0.84, 0.03, 'BLACK_PAINT')


def bar(c, x0, x1, z, reg_a='BAR_YELLOW', reg_b='BAR_BLACK'):
    """Cone bar: alternating yellow/black sections."""
    k = 6 if c.lod == 0 else 3
    for i in range(k):
        xa = x0 + (x1 - x0) * i / k; xb = x0 + (x1 - x0) * (i + 1) / k
        D.tube(c, [V((xa, 0, z)), V((xb, 0, z))], 0.022, reg_a if i % 2 == 0 else reg_b, n=D.n_(c, 8, 6), caps=i in (0, k - 1))


def cone(c, x=0.0, y=0.0):
    D.box(c, (x, y, 0.02), (0.19, 0.19, 0.02), 'RUBBER')
    D.lathe(c, [(0.13, 0.04), (0.11, 0.25), (0.085, 0.35), (0.06, 0.48), (0.035, 0.68), (0.02, 0.7)], x, y, 'CONE_ORANGE',
            regs=['CONE_ORANGE', 'CONE_WHITE', 'CONE_WHITE', 'CONE_ORANGE', 'CONE_ORANGE'] if c.lod < 2 else None)


def koji_board(c):
    """Folding steel A-frame with the works board, sandbag on the foot bar."""
    rot = Rx(-10)
    D.gfx_box(c, (0, -0.07, 0.95), (0.3, 0.012, 0.45), 'KOJI', 'WHITE_PAINT', rot=rot)
    for s in (1, -1):
        D.tube(c, [V((s * 0.32, -0.16, 0.0)), V((s * 0.32, -0.0, 1.45))], 0.016, 'GALV')
        D.tube(c, [V((s * 0.32, 0.25, 0.0)), V((s * 0.32, 0.0, 1.45))], 0.016, 'GALV')
    D.tube(c, [V((-0.32, 0.0, 1.45)), V((0.32, 0.0, 1.45))], 0.016, 'GALV')
    D.tube(c, [V((-0.32, 0.25, 0.05)), V((0.32, 0.25, 0.05))], 0.014, 'GALV')
    if c.lod < 2:
        D.blob(c, (0.0, 0.25, 0.08), (0.2, 0.1, 0.06), 'BAG_YELLOW')
        D.box(c, (0.0, -0.02, 1.52), (0.05, 0.03, 0.05), 'LAMP_RED')


def post_box(c):
    """Round post box (No. 1 type): pillar with a domed cap, slot, plate."""
    D.lathe(c, [(0.24, 0.0), (0.24, 0.12), (0.21, 0.14), (0.21, 1.05), (0.235, 1.07), (0.235, 1.12), (0.18, 1.22), (0.08, 1.3), (0.0, 1.32)],
            0, 0, 'POST_RED', regs=['CONC', 'CONC', 'POST_RED', 'POST_RED', 'POST_RED', 'POST_RED', 'POST_RED', 'POST_RED'])
    D.box(c, (0, -0.205, 0.95), (0.09, 0.03, 0.018), 'BLACK_PAINT', bevel=False)            # slot
    D.box(c, (0, -0.2, 1.0), (0.11, 0.03, 0.012), 'POST_RED')                                # slot hood
    D.gfx_box(c, (0, -0.209, 0.78), (0.09, 0.004, 0.045), 'POST_SIGN', 'POST_RED')
    if c.lod == 0:
        D.box(c, (0, -0.212, 0.55), (0.06, 0.004, 0.05), 'WHITE_PAINT', bevel=False)       # collection times
        D.box(c, (0, 0.21, 0.5), (0.05, 0.01, 0.12), 'POST_RED')                             # back door with lock
        D.cyl(c, 0, 0.225, 0.55, 0.57, 0.012, 'CHROME')


def phone_booth(c):
    """Green public phone box: glass on three sides, roof with the lit sign."""
    W, Dp, H = 0.8, 0.8, 2.1
    D.box(c, (0, 0, 0.05), (W / 2, Dp / 2, 0.05), 'CONC')
    for x in (-W / 2 + 0.03, W / 2 - 0.03):
        for y in (-Dp / 2 + 0.03, Dp / 2 - 0.03):
            D.box(c, (x, y, H / 2 + 0.05), (0.03, 0.03, H / 2), 'PHONE_BODY')
    D.box(c, (0, 0, H + 0.1), (W / 2 + 0.04, Dp / 2 + 0.04, 0.06), 'PHONE_BODY')
    D.box(c, (0, 0, H + 0.2), (W / 2 - 0.02, Dp / 2 - 0.02, 0.05), 'WHITE_PAINT')
    for y, rot in ((-Dp / 2 - 0.045, 0), (Dp / 2 + 0.045, 180)):
        D.gfx_box(c, (0, y * 0.98, H + 0.1), (0.3, 0.004, 0.055), 'PHONE_SIGN', 'PHONE_BODY', front='-y' if y < 0 else '+y')
    # glass walls (left, right, back) and the door (front) with a frame
    for x in (-W / 2 + 0.03, W / 2 - 0.03):
        D.box(c, (x, 0, 1.15), (0.006, Dp / 2 - 0.06, 0.95), 'GLASS_CLEAR', bevel=False)
    D.box(c, (0, Dp / 2 - 0.03, 1.15), (W / 2 - 0.06, 0.006, 0.95), 'GLASS_CLEAR', bevel=False)
    D.box(c, (0, -Dp / 2 + 0.03, 1.15), (W / 2 - 0.06, 0.006, 0.95), 'GLASS_CLEAR', bevel=False)
    D.box(c, (0, -Dp / 2 + 0.03, 0.3), (W / 2 - 0.06, 0.012, 0.15), 'PHONE_BODY')
    D.box(c, (W / 2 - 0.12, -Dp / 2 + 0.01, 1.05), (0.012, 0.02, 0.08), 'CHROME')
    # the phone on its shelf (inside, visible through the glass)
    D.box(c, (0, 0.25, 0.95), (0.25, 0.12, 0.02), 'WOOD')
    D.box(c, (0, 0.3, 1.15), (0.12, 0.08, 0.18), 'PHONE_GREEN')
    if c.lod == 0:
        D.box(c, (0, 0.21, 1.25), (0.09, 0.03, 0.025), 'BLACK_PAINT')
        D.box(c, (0, 0.22, 1.08), (0.06, 0.012, 0.05), 'GLASS_DARK')
    return dict(lights={'Sign': ((0, 0, H + 0.15), (0.9, 1.0, 0.9), 3.0)})


def super_cub(c):
    """Step-through delivery bike (Cub type): leg shield, front basket, box on the rear carrier."""
    L = 0.9
    for y in (-0.62, 0.6):           # 17-inch wheels, thin spokes as a disc
        S.disc(c, (0, y, 0.3), 0.3, (1, 0, 0), D.n_(c, 18, 12, 8), 'RUBBER', 'RUBBER', t=0.07)
        if c.lod < 2:
            for s in (1, -1):
                S.disc(c, (s * 0.038, y, 0.3), 0.2, (s, 0, 0), D.n_(c, 12, 8), 'SILVER', 'SILVER', t=0.004)
    # frame: backbone from the head tube down and back
    D.tube(c, [V((0, -0.52, 0.85)), V((0, -0.38, 0.45)), V((0, 0.1, 0.4)), V((0, 0.4, 0.55))], 0.05, 'BIKE_RED')
    D.tube(c, [V((0, -0.62, 0.3)), V((0, -0.52, 0.85))], 0.022, 'SILVER')        # front fork
    D.blob(c, (0, -0.4, 0.62), (0.2, 0.08, 0.28), 'LEG_SHIELD', rot=Rx(-18))      # leg shield
    D.blob(c, (0, 0.28, 0.52), (0.14, 0.32, 0.14), 'BIKE_RED')                    # rear body
    D.box(c, (0, 0.22, 0.73), (0.12, 0.22, 0.04), 'BIKE_SEAT')
    D.blob(c, (0, -0.06, 0.32), (0.11, 0.14, 0.11), 'ENGINE')
    D.tube(c, [V((0.08, -0.05, 0.25)), V((0.1, 0.35, 0.26)), V((0.1, 0.7, 0.33))], 0.025, 'CHROME')   # exhaust
    # handlebar, headlamp
    D.tube(c, [V((-0.32, -0.5, 1.0)), V((0, -0.54, 0.98)), V((0.32, -0.5, 1.0))], 0.012, 'SILVER')
    D.blob(c, (0, -0.58, 0.95), (0.12, 0.08, 0.08), 'BIKE_RED')
    D.blob(c, (0, -0.65, 0.95), (0.06, 0.02, 0.06), 'HEADLAMP', sub=1)
    for s in (1, -1):
        D.box(c, (s * 0.33, -0.5, 1.0), (0.04, 0.015, 0.015), 'RUBBER')
    # carrier and the delivery box (soba / news / post) + front basket
    D.box(c, (0, 0.6, 0.78), (0.17, 0.2, 0.012), 'STEEL_DARK')
    D.box(c, (0, 0.6, 1.02), (0.22, 0.22, 0.22), 'DELIVERY_BOX')
    D.box(c, (0, 0.6, 1.25), (0.225, 0.225, 0.012), 'BLACK_PAINT')
    if c.lod < 2:
        D.box(c, (0, -0.78, 0.82), (0.17, 0.12, 0.1), 'STEEL_DARK', bevel=False)
        D.box(c, (0, 0.83, 0.62), (0.07, 0.012, 0.03), 'TAIL')
        D.tube(c, [V((0.12, 0.0, 0.3)), V((0.2, 0.15, 0.04))], 0.012, 'STEEL_DARK')       # side stand
        for y in (-0.62, 0.6):   # mudguards
            k = 6
            pts = [V((0, y + 0.36 * math.cos(math.radians(30 + 120 * i / k)), 0.3 + 0.36 * math.sin(math.radians(30 + 120 * i / k)))) for i in range(k + 1)]
            D.tube(c, pts, 0.05, 'BIKE_RED' if y > 0 else 'LEG_SHIELD', n=4, caps=False)


def umbrella_stand(c):
    """Konbini umbrella stand: steel frame with a row of rings, drip tray, vinyl umbrellas."""
    W = 0.9
    D.box(c, (0, 0, 0.03), (W / 2, 0.15, 0.03), 'GALV')
    for x in (-W / 2, W / 2):
        D.tube(c, [V((x, 0, 0.05)), V((x, 0, 0.75))], 0.015, 'GALV')
    D.tube(c, [V((-W / 2, 0, 0.75)), V((W / 2, 0, 0.75))], 0.015, 'GALV')
    D.tube(c, [V((-W / 2, 0, 0.4)), V((W / 2, 0, 0.4))], 0.012, 'GALV')
    k = 6
    for i in range(k):
        x = -W / 2 + 0.08 + (W - 0.16) * i / (k - 1)
        if c.lod == 0:
            S.disc(c, (x, 0, 0.75), 0.04, (0, 0, 1), 8, 'GALV', 'GALV', t=0.01)
        if i in (0, 1, 3, 4):   # furled umbrellas in the rings
            reg = 'UMB_CLEAR' if i != 3 else 'UMB_NAVY'
            D.lathe(c, [(0.003, 0.06), (0.025, 0.25), (0.035, 0.55), (0.02, 0.78), (0.006, 0.86)], x, 0.0, reg, n=D.n_(c, 8, 6))
            D.tube(c, [V((x, 0, 0.86)), V((x, 0, 0.92)), V((x, -0.03, 0.95)), V((x, -0.05, 0.92))], 0.01, 'WHITE_PAINT' if i != 3 else 'WOOD_DARK', n=4)


def smoking_stand(c):
    D.lathe(c, [(0.15, 0.0), (0.15, 0.04), (0.11, 0.06), (0.11, 0.9), (0.16, 0.92), (0.16, 0.96), (0.0, 0.97)], 0, 0, 'GALV',
            regs=['STEEL_DARK', 'STEEL_DARK', 'GALV', 'GALV', 'GALV', 'ASH'])
    D.cyl(c, 0.45, 0, 0, 2.0, 0.025, 'GALV')
    D.gfx_box(c, (0.45, -0.03, 1.8), (0.3, 0.006, 0.15), 'SMOKING_SIGN', 'GALV')
    footing(c, 0.45, 0, 0.1, 0.05)


def garbage_station(c):
    """Collection point: bags in a heap under a weighted blue crow net, sign on a post."""
    import random
    r = random.Random(3)
    for i in range(9 if c.lod < 2 else 3):
        x, y = r.uniform(-0.85, 0.85), r.uniform(-0.3, 0.2)
        D.blob(c, (x, y, 0.2), (0.2, 0.18, 0.21), r.choice(['BAG_WHITE', 'BAG_YELLOW', 'BAG_WHITE']), rot=Rz(r.uniform(0, 90)))
    # the net: a draped shell over the heap (slightly above it), edges weighted down
    # the net lies over the back of the heap; front bags stick out under its edge
    D.blob(c, (-0.1, 0.12, 0.16), (0.6, 0.32, 0.32), 'NET_BLUE', sub=D.n_(c, 2, 2, 1))
    if c.lod < 2:
        for x in (-0.5, 0.0, 0.4):
            D.tube(c, [V((x - 0.12, -0.18, 0.03)), V((x + 0.12, -0.18, 0.03))], 0.03, 'NET_BLUE', n=5)
    D.cyl(c, -0.85, 0.2, 0, 1.4, 0.025, 'GALV')
    D.gfx_box(c, (-0.85, 0.17, 1.25), (0.25, 0.006, 0.125), 'GOMI_SIGN', 'GALV')


def manhole(c):
    S.disc(c, (0, 0, 0.012), 0.3, (0, 0, 1), D.n_(c, 24, 16, 10), 'MANHOLE', 'ASPHALT_PATCH', t=0.012)
    if c.lod < 2:
        S.disc(c, (0, 0, 0.006), 0.36, (0, 0, 1), D.n_(c, 24, 16), 'ASPHALT_PATCH', 'ASPHALT_PATCH', t=0.006)


def hydrant_sign(c):
    D.cyl(c, 0, 0, 0, 2.4, 0.03, 'RED_PAINT')
    D.gfx_box(c, (0, -0.035, 2.05), (0.15, 0.006, 0.3), 'HYDRANT', 'RED_PAINT')
    footing(c, 0, 0, 0.1, 0.04)
    S.disc(c, (0.0, -0.6, 0.012), 0.22, (0, 0, 1), D.n_(c, 16, 10), 'YELLOW_PAINT', 'STEEL_DARK', t=0.012)   # hydrant lid in the road


def tanuki(c):
    """Shigaraki tanuki: big belly, straw hat, sake flask in the right hand, ledger in the left."""
    D.box(c, (0, 0, 0.04), (0.22, 0.22, 0.04), 'CONC')
    D.blob(c, (0, 0, 0.32), (0.22, 0.2, 0.26), 'TANUKI_BROWN')
    D.blob(c, (0, -0.1, 0.3), (0.17, 0.12, 0.2), 'SAKE_FLASK')                  # belly
    D.blob(c, (0, -0.02, 0.66), (0.15, 0.14, 0.13), 'TANUKI_BROWN')
    D.blob(c, (0, -0.14, 0.62), (0.06, 0.06, 0.045), 'SAKE_FLASK')              # snout
    D.blob(c, (0, -0.19, 0.63), (0.025, 0.02, 0.02), 'TANUKI_DARK', sub=1)
    for s in (1, -1):
        D.blob(c, (s * 0.055, -0.115, 0.69), (0.05, 0.03, 0.04), 'TANUKI_DARK', sub=2)          # the dark eye mask
        D.blob(c, (s * 0.058, -0.14, 0.695), (0.012, 0.006, 0.012), 'EYE_WHITE', sub=1)
        D.blob(c, (s * 0.1, 0.0, 0.77), (0.035, 0.025, 0.03), 'TANUKI_DARK', sub=1)
        D.blob(c, (s * 0.12, 0.08, 0.06), (0.07, 0.1, 0.05), 'TANUKI_BROWN', sub=1)   # feet
    # straw hat (sugegasa) on the head
    D.lathe(c, [(0.2, 0.74), (0.11, 0.8), (0.0, 0.84)], 0, 0.03, 'TANUKI_HAT', n=D.n_(c, 12, 8))
    D.blob(c, (0.2, -0.08, 0.32), (0.07, 0.07, 0.09), 'SAKE_FLASK')             # flask (tokkuri)
    D.box(c, (-0.2, -0.06, 0.3), (0.03, 0.06, 0.09), 'WOOD_PALE', rot=Ry(10))   # ledger
    D.tube(c, [V((0.18, -0.08, 0.42)), V((0.2, -0.08, 0.45))], 0.02, 'TANUKI_DARK')


def maneki_neko(c):
    D.blob(c, (0, 0, 0.12), (0.12, 0.1, 0.13), 'NEKO_WHITE')
    D.blob(c, (0, -0.01, 0.3), (0.1, 0.09, 0.085), 'NEKO_WHITE')
    for s in (1, -1):
        D.lathe(c, [(0.03, 0.36), (0.0, 0.41)], s * 0.055, 0.0, 'NEKO_WHITE', n=4)
        D.blob(c, (s * 0.035, -0.085, 0.31), (0.014, 0.006, 0.01), 'EYE_BLACK', sub=1)
    D.blob(c, (0.11, -0.02, 0.42), (0.035, 0.035, 0.075), 'NEKO_WHITE', rot=Ry(-15))   # raised left paw (beckoning)
    D.blob(c, (0.12, -0.03, 0.49), (0.04, 0.035, 0.035), 'NEKO_WHITE')
    D.blob(c, (-0.07, -0.08, 0.13), (0.035, 0.03, 0.03), 'NEKO_WHITE', sub=1)
    S.disc(c, (-0.03, -0.1, 0.15), 0.05, (0, -1, 0.1), 10, 'NEKO_GOLD', 'NEKO_GOLD', t=0.012)   # koban
    D.lathe(c, [(0.085, 0.215), (0.09, 0.23), (0.0, 0.231)], 0, -0.005, 'NEKO_RED', n=D.n_(c, 12, 8))   # collar
    D.blob(c, (0, -0.085, 0.205), (0.02, 0.02, 0.02), 'NEKO_GOLD', sub=1)              # bell


def daruma(c):
    D.blob(c, (0, 0, 0.15), (0.13, 0.12, 0.15), 'DARUMA_RED')
    D.blob(c, (0, -0.07, 0.19), (0.085, 0.06, 0.07), 'DARUMA_FACE')
    for s in (1, -1):
        D.blob(c, (s * 0.032, -0.128, 0.205), (0.017, 0.004, 0.017), 'EYE_WHITE', sub=1)
        D.box(c, (s * 0.035, -0.126, 0.235), (0.022, 0.004, 0.006), 'EYE_BLACK', rot=Ry(s * 15), bevel=False)   # brows
        D.box(c, (s * 0.025, -0.128, 0.16), (0.02, 0.004, 0.005), 'EYE_BLACK', rot=Ry(-s * 20), bevel=False)    # moustache
    D.blob(c, (0.032, -0.132, 0.205), (0.008, 0.003, 0.008), 'EYE_BLACK', sub=1)        # one eye painted (wish made)
    if c.lod == 0:
        D.box(c, (0, -0.12, 0.08), (0.04, 0.01, 0.012), 'DARUMA_GOLD', rot=Rx(-30))


def koinobori(c):
    """Carp streamers: pole 8 m, arrow wheel and the fukinagashi on top, three carps."""
    D.cyl(c, 0, 0, 0, 8.0, 0.05, 'WHITE_PAINT', r1=0.03)
    footing(c, 0, 0, 0.18, 0.1)
    D.lathe(c, [(0.08, 8.0), (0.0, 8.15)], 0, 0, 'GOLD', n=8)
    if c.lod < 2:
        for k in range(6):
            a = math.pi * k / 3
            D.tube(c, [V((0, 0, 7.85)), V((0.18 * math.cos(a), 0.18 * math.sin(a), 7.85))], 0.01, 'GOLD', n=4)
    for z, L, reg in ((7.6, 2.2, 'ROPE_RED_WHITE'), (6.7, 3.6, 'KOINOBORI_BLACK'), (5.6, 3.0, 'KOINOBORI_RED'), (4.6, 2.5, 'KOINOBORI_BLUE')):
        # carp: a cone opening at the pole (mouth) and tapering, sagging in the wind
        k = 5 if c.lod < 2 else 3
        rings = []
        for i in range(k + 1):
            t = i / k
            r = (0.26 + 0.14 * math.sin(math.pi * min(t * 1.4, 1))) * (1 - 0.75 * t) * (L / 2.2)
            p = V((0.06 + L * t, 0, z - 0.25 * t ** 1.5 + 0.06 * math.sin(t * 6)))
            rings.append((p, r))
        bm = c.bm
        n = D.n_(c, 10, 6, 5)
        vs = [[bm.verts.new(p + V((0, r * math.cos(2 * math.pi * j / n), r * math.sin(2 * math.pi * j / n)))) for j in range(n)] for p, r in rings]
        fs = []
        for i in range(k):
            for j in range(n):
                fs.append(bm.faces.new([vs[i][j], vs[i][(j + 1) % n], vs[i + 1][(j + 1) % n], vs[i + 1][j]]))
        D.orient(fs, V((L / 2, 0, z)))
        # inside too (open mouth)
        ins = [bm.faces.new([bm.verts.new(v.co) for v in f.verts][::-1]) for f in fs[:n]]
        c.m(fs + ins, reg); c.nb(fs + ins)
        if c.lod < 2 and reg != 'ROPE_RED_WHITE':
            for s in (1, -1):
                D.blob(c, (0.3 * L / 2.2, s * 0.2 * L / 2.2, z + 0.05), (0.05, 0.02, 0.05), 'EYE_WHITE', sub=1)
        D.tube(c, [V((0, 0, z)), V((0.06, 0, z))], 0.012, 'GALV', n=4)


ASSETS = {
    'CurveMirror_Round': lambda c: curve_mirror(c),
    'CurveMirror_Double': lambda c: curve_mirror(c, True),
    'Barricade_Frog': lambda c: (frog(c, -0.9), frog(c, 0.9), bar(c, -0.9, 0.9, 0.8)),
    'Barricade_Monkey': lambda c: (frog(c, -0.9, True), frog(c, 0.9, True), bar(c, -0.9, 0.9, 0.82)),
    'Cone': lambda c: cone(c),
    'ConeBar_Set': lambda c: ([cone(c, x) for x in (-1.6, 0, 1.6)], bar(c, -1.6, 0, 0.66), bar(c, 0, 1.6, 0.66)),
    'KojiBoard': koji_board,
    'PostBox_Round': post_box,
    'PhoneBooth': phone_booth,
    'SuperCub_Delivery': super_cub,
    'UmbrellaStand': umbrella_stand,
    'SmokingStand': smoking_stand,
    'GarbageStation': garbage_station,
    'Manhole_Design': manhole,
    'HydrantSign': hydrant_sign,
    'Tanuki': tanuki,
    'ManekiNeko': maneki_neko,
    'Daruma': daruma,
    'Koinobori': koinobori,
}


def build(only=None):
    return D.build_set(ASSETS, 'Street', only=only, lods=3)


def preview(results, views):
    return D.row_preview(results, 'StreetDetails', gap=0.5, size=(1800, 420))
