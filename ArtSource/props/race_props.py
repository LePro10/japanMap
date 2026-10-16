"""Race furniture (task 6; asset list 'Rennen': pillars 6-8 m, checkpoint
arch, banner, trophy 0.4 m; <= 2 k each):

  Gantry_StartFinish   two truss towers, a truss beam with the START·FINISH
                       banner both ways, five start lamps (lit red), ballast
  Arch_Checkpoint      inflatable arch (as at Japanese events): orange/navy
                       tube, CHECKPOINT banner, blower, sandbags, guy ropes
  Pylon_6 / Pylon_8    race pylon: tapered column, checker band, flag, foot
  TyreStack            three tyres high, strapped, as a barrier corner
  BannerFence_4m       crowd fence panel with a sponsor/game banner
  Trophy               gold cup 0.4 m on a marble block
  Podium               1-2-3 with gold/silver/bronze fronts
  Flag_Checker         flag on a short pole (start marshal)

Clear span of the gantry and the arch: 12 m (two lanes + verge).
Atlas `Details`; origin on the ground, the race runs along -Y (front)."""
import math
from mathutils import Vector, Matrix
from props import detail_kit as D
from props import scatter_kit as S

KLASS = 'props'
NAME = 'RaceProps'
V = Vector
Ry = lambda a: Matrix.Rotation(math.radians(a), 3, 'Y')
Rx = lambda a: Matrix.Rotation(math.radians(a), 3, 'X')


def truss(c, a, b, w=0.3, reg='TRUSS'):
    """Square box truss from a to b: four chords + zig-zag braces on each side."""
    a, b = V(a), V(b)
    d = (b - a).normalized()
    up = V((0, 0, 1)) if abs(d.z) < 0.9 else V((1, 0, 0))
    u = d.cross(up).normalized(); v = d.cross(u).normalized()
    h = w / 2
    corners = [u * h + v * h, -u * h + v * h, -u * h - v * h, u * h - v * h]
    for k in corners:
        D.tube(c, [a + k, b + k], 0.025, reg, n=D.n_(c, 6, 4, 4))
    if c.lod == 2:
        return
    L = (b - a).length
    steps = max(2, int(L / (w * 1.2)))
    for i in range(steps):
        p0 = a + d * (L * i / steps); p1 = a + d * (L * (i + 1) / steps)
        for k in range(4):
            c0, c1 = corners[k], corners[(k + 1) % 4]
            q0, q1 = (p0 + c0, p1 + c1) if i % 2 == 0 else (p0 + c1, p1 + c0)
            D.tube(c, [q0, q1], 0.012, reg, n=4, caps=False)


def gantry(c, span=12.0, H=5.6):
    x = span / 2 + 0.25
    for s in (1, -1):
        truss(c, (s * x, 0, 0.12), (s * x, 0, H + 0.5), 0.5)
        D.box(c, (s * x, 0, 0.06), (0.45, 0.45, 0.06), 'STEEL_DARK')                  # base plate
        D.box(c, (s * x, 0.0, 0.2), (0.6, 0.5, 0.2), 'CONC')                         # ballast block
        # sponsor banner wrapped on the tower
        D.gfx_box(c, (s * x, -0.27, 2.6), (0.24, 0.01, 1.2), 'BANNER_MAIN', 'BLACK_PAINT', rot=Matrix.Rotation(math.radians(90), 3, 'Y'))
    truss(c, (-x, 0, H), (x, 0, H), 0.5)
    for y, front in ((-0.27, '-y'), (0.27, '+y')):
        D.gfx_box(c, (0, y, H - 0.05), (span / 2 - 0.5, 0.01, 0.42), 'BANNER_START', 'BLACK_PAINT', front=front)
    # start lamps: five red, under the beam, facing the grid (-Y)
    D.box(c, (0, -0.1, H - 0.72), (1.1, 0.1, 0.16), 'BLACK_PAINT')
    for i in range(5):
        S.disc(c, (-0.8 + 0.4 * i, -0.205, H - 0.72), 0.1, (0, -1, 0), D.n_(c, 12, 8), 'LAMP_RED', 'BLACK_PAINT', t=0.01)
    return dict(lights={'Start': ((0, -0.4, H - 0.72), (1.0, 0.15, 0.1), 8.0)})


def inflatable_arch(c, span=12.0):
    """Air-filled tube arch: segments alternate orange and navy; base on sandbags."""
    R = span / 2 + 0.5
    r = 0.55
    k = D.n_(c, 12, 8, 6)
    pts = [V((-R * math.cos(math.pi * i / k), 0, 0.45 + (R * 0.78) * math.sin(math.pi * i / k))) for i in range(k + 1)]
    for i in range(k):
        D.tube(c, [pts[i], pts[i + 1]], r, 'INFLATE_ORANGE' if i % 2 == 0 else 'INFLATE_NAVY', n=D.n_(c, 10, 8, 6), caps=i in (0, k - 1))
    top = pts[k // 2]
    for y, front in ((-r - 0.02, '-y'), (r + 0.02, '+y')):
        D.gfx_box(c, (0, y, top.z), (2.4, 0.02, 0.6), 'BANNER_CP', 'INFLATE_ORANGE', front=front)
    for s in (1, -1):
        D.box(c, (s * R, 0, 0.2), (0.7, 0.7, 0.2), 'INFLATE_NAVY')                    # base block
        if c.lod < 2:
            for dx, dy in ((0.0, 0.6), (0.0, -0.6)):
                D.blob(c, (s * R + dx, dy, 0.08), (0.22, 0.15, 0.09), 'BAG_YELLOW')
            D.lathe(c, [(0.18, 0.0), (0.18, 0.35), (0.12, 0.38), (0.0, 0.4)], s * (R + 0.9), 0.0, 'STEEL_DARK', n=8)   # blower
            D.tube(c, [V((s * (R + 0.9), 0, 0.2)), V((s * (R + 0.4), 0, 0.25))], 0.08, 'INFLATE_NAVY', n=6)
            for dy in (-1, 1):   # guy ropes from the shoulders to stakes
                D.tube(c, [pts[2 if s < 0 else k - 2], V((s * (R + 1.5), dy * 2.5, 0.0))], 0.008, 'ROPE', n=3)


def pylon(c, H=7.0):
    """Race pylon: square tapered column, checker band near the top, flag."""
    D.box(c, (0, 0, 0.05), (0.45, 0.45, 0.05), 'STEEL_DARK')
    D.lathe(c, [(0.32, 0.1), (0.3, 0.4), (0.2, H - 0.9), (0.2, H - 0.3), (0.24, H - 0.28), (0.24, H - 0.22), (0.0, H - 0.2)],
            0, 0, 'WHITE_PAINT', n=4, regs=['ORANGE_PAINT', 'WHITE_PAINT', 'BLACK_PAINT', 'ORANGE_PAINT', 'ORANGE_PAINT', 'ORANGE_PAINT'])
    # rotate-free checker plates on all four faces at the top band
    for a in range(4):
        d = V((math.cos(math.pi / 4 + a * math.pi / 2), math.sin(math.pi / 4 + a * math.pi / 2), 0))
        p = d * 0.152 + V((0, 0, H - 0.6))
        rot = Matrix.Rotation(math.atan2(d.y, d.x) + math.pi / 2, 3, 'Z')
        D.gfx_box(c, p, (0.13, 0.005, 0.28), 'CHECKER', 'BLACK_PAINT', rot=rot, front='-y' if False else '+y')
    D.cyl(c, 0, 0, H - 0.2, H + 1.3, 0.02, 'GALV')
    fl = D.box(c, (0.38, 0, H + 0.95), (0.36, 0.006, 0.25), 'ORANGE_PAINT', bevel=False)
    c.m([fl['-y'], fl['+y']], 'BANNER_CP')
    if c.lod < 2:
        for x, y in ((0.35, 0.35), (-0.35, 0.35), (0.35, -0.35), (-0.35, -0.35)):
            S.bolt(c, (x, y, 0.1), (0, 0, 1), r=0.025, h=0.02, reg='GALV')


def tyre(c, x, y, z, r=0.32, w=0.2):
    n = D.n_(c, 14, 10, 6)
    D.lathe(c, [(r * 0.55, z), (r, z + 0.02), (r, z + w - 0.02), (r * 0.55, z + w)], x, y, 'TYRE', n=n,
            regs=['TYRE_WALL', 'TYRE', 'TYRE_WALL'])
    if c.lod < 2:   # the hole: dark inside wall
        D.lathe(c, [(r * 0.55, z + w), (r * 0.55, z)], x, y, 'RUBBER', n=n)


def tyre_stack(c):
    for i, (x, y) in enumerate(((0, 0), (0.64, 0), (-0.64, 0))):
        for k in range(3):
            tyre(c, x, y, 0.2 * k)
    if c.lod < 2:
        D.box(c, (0, -0.33, 0.33), (1.0, 0.012, 0.05), 'BLUE_PAINT', bevel=False)     # conveyor belt strap
        D.box(c, (0, 0.33, 0.33), (1.0, 0.012, 0.05), 'BLUE_PAINT', bevel=False)


def banner_fence(c, L=4.0, gfx='BANNER_MAIN'):
    H = 1.2
    for x in (-L / 2, 0, L / 2):
        D.cyl(c, x, 0, 0, H + 0.1, 0.025, 'GALV')
        D.box(c, (x, 0, 0.03), (0.3, 0.12, 0.03), 'CONC')
    D.tube(c, [V((-L / 2, 0, H)), V((L / 2, 0, H))], 0.022, 'GALV')
    D.tube(c, [V((-L / 2, 0, 0.12)), V((L / 2, 0, 0.12))], 0.02, 'GALV')
    if c.lod < 2:
        k = 20 if c.lod == 0 else 8
        for i in range(k):
            x = -L / 2 + L * (i + 0.5) / k
            D.tube(c, [V((x, 0, 0.12)), V((x, 0, H))], 0.006, 'GALV', n=4, caps=False)
    for half, g in ((-1, gfx), (1, 'BANNER_SPONSOR')):
        D.gfx_box(c, (half * L / 4, -0.03, 0.65), (L / 4 - 0.04, 0.004, 0.4), g, 'WHITE_PAINT')
        D.gfx_box(c, (half * L / 4, 0.03, 0.65), (L / 4 - 0.04, 0.004, 0.4), g, 'WHITE_PAINT', front='+y')


def trophy(c):
    D.box(c, (0, 0, 0.05), (0.08, 0.08, 0.05), 'MARBLE')
    D.box(c, (0, -0.081, 0.05), (0.05, 0.002, 0.02), 'GOLD', bevel=False)
    D.lathe(c, [(0.035, 0.1), (0.03, 0.12), (0.012, 0.14), (0.01, 0.2), (0.03, 0.215), (0.07, 0.25), (0.085, 0.31), (0.09, 0.37),
                (0.082, 0.37), (0.0, 0.33)], 0, 0, 'GOLD', n=D.n_(c, 16, 10, 6))
    if c.lod < 2:
        for s in (1, -1):
            D.tube(c, [V((s * 0.085, 0, 0.35)), V((s * 0.13, 0, 0.34)), V((s * 0.13, 0, 0.27)), V((s * 0.075, 0, 0.26))], 0.008, 'GOLD', n=6)
        D.lathe(c, [(0.03, 0.37), (0.02, 0.385), (0.025, 0.39), (0.0, 0.405)], 0, 0, 'GOLD', n=8)   # lid knob


def podium(c):
    for x, h, reg in ((0, 0.6, 'GOLD'), (-0.85, 0.42, 'SILVER'), (0.85, 0.3, 'BRONZE')):
        D.box(c, (x, 0, h / 2), (0.4, 0.4, h / 2), 'WHITE_PAINT')
        D.box(c, (x, -0.401, h - 0.12), (0.18, 0.004, 0.08), reg, bevel=False)
    D.box(c, (0, 0.38, 0.65), (1.3, 0.02, 0.6), 'INFLATE_NAVY')
    D.gfx_box(c, (0, 0.355, 1.0), (1.2, 0.004, 0.22), 'BANNER_MAIN', 'INFLATE_NAVY')


def flag_checker(c):
    D.cyl(c, 0, 0, 0, 1.5, 0.015, 'WOOD')
    fl = D.box(c, (0.32, 0, 1.3), (0.3, 0.004, 0.2), 'BLACK_PAINT', bevel=False)
    c.m([fl['-y'], fl['+y']], 'CHECKER')


ASSETS = {
    'Gantry_StartFinish': gantry,
    'Arch_Checkpoint': inflatable_arch,
    'Pylon_6': lambda c: pylon(c, 6.0),
    'Pylon_8': lambda c: pylon(c, 8.0),
    'TyreStack': tyre_stack,
    'BannerFence_4m': banner_fence,
    'Trophy': trophy,
    'Podium': podium,
    'Flag_Checker': flag_checker,
}


def build(only=None):
    return D.build_set(ASSETS, 'Race', only=only, lods=3)


def preview(results, views):
    return D.row_preview(results, 'RaceProps', gap=1.0, size=(1800, 420))
