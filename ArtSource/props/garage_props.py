"""Garage furniture (task 6; sizes from STATUS 'Garage'; <= 1.5 k each, the
lift more): the player's tuning garage around the car.

  Workbench      2.0 x 0.8 x 0.9: wood top on a steel frame, drawers, vice,
                 pegboard with tools, a strip light
  TireRack       1.8 x 0.5 x 2.0: three levels of tyres standing in the rack
  PaintBoard     1.2 x 0.05 x 0.9 colour chips on an easel
  EngineStand    0.9 x 0.6 x 1.0: inline-four on a rotating stand on castors
  GarageSign     2.5 x 0.6 lit sign OPEN BAY on wall brackets with an LED frame
  ToolCabinet    roller cabinet with drawers (red)
  FloorJack      trolley jack with long handle
  CarLift        two-post lift 3.6 m (POLISH: '3D-Hebebühne in der Garage'): posts,
                 carriages, swing arms with pads, top beam with the hose

Atlas `Details`; origin on the floor, front to -Y."""
import math
from mathutils import Vector, Matrix
from props import detail_kit as D
from props import scatter_kit as S

KLASS = 'props'
NAME = 'GarageProps'
V = Vector
Rx = lambda a: Matrix.Rotation(math.radians(a), 3, 'X')
Ry = lambda a: Matrix.Rotation(math.radians(a), 3, 'Y')
Rz = lambda a: Matrix.Rotation(math.radians(a), 3, 'Z')


def caster(c, x, y):
    D.box(c, (x, y, 0.07), (0.025, 0.02, 0.012), 'STEEL_DARK', bevel=False)
    S.disc(c, (x, y, 0.035), 0.035, (1, 0, 0), D.n_(c, 8, 6), 'RUBBER', 'RUBBER', t=0.025)


def workbench(c):
    W, Dp, H = 2.0, 0.8, 0.9
    D.box(c, (0, 0, H - 0.025), (W / 2, Dp / 2, 0.025), 'BENCH_TOP')
    for x in (-W / 2 + 0.04, W / 2 - 0.04):
        for y in (-Dp / 2 + 0.04, Dp / 2 - 0.04):
            D.box(c, (x, y, (H - 0.05) / 2), (0.025, 0.025, (H - 0.05) / 2), 'TOOL_GREY')
    D.box(c, (0, 0, 0.15), (W / 2 - 0.05, Dp / 2 - 0.05, 0.012), 'TOOL_GREY')       # lower shelf
    # drawer block (right) with four drawers and handles
    D.box(c, (0.6, 0, 0.55), (0.32, Dp / 2 - 0.06, 0.29), 'TOOL_RED')
    for i in range(4):
        z = 0.34 + i * 0.14
        D.box(c, (0.6, -Dp / 2 + 0.05, z), (0.3, 0.006, 0.06), 'TOOL_RED')
        if c.lod == 0:
            D.box(c, (0.6, -Dp / 2 + 0.04, z), (0.1, 0.008, 0.008), 'CHROME', bevel=False)
    # vice on the left corner
    D.box(c, (-0.75, -0.3, H + 0.06), (0.06, 0.1, 0.06), 'STAND_BLUE')
    D.box(c, (-0.75, -0.42, H + 0.08), (0.08, 0.025, 0.05), 'STAND_BLUE')
    D.tube(c, [V((-0.83, -0.46, H + 0.06)), V((-0.67, -0.46, H + 0.06))], 0.008, 'CHROME', n=4)
    # pegboard on the back with tool shapes and a strip light
    D.box(c, (0, Dp / 2 - 0.01, H + 0.55), (W / 2, 0.01, 0.5), 'PEGBOARD')
    for x in (-W / 2 + 0.03, W / 2 - 0.03):
        D.box(c, (x, Dp / 2 - 0.02, H + 0.5), (0.02, 0.02, 0.55), 'TOOL_GREY')
    if c.lod < 2:
        import random
        r = random.Random(5)
        for i in range(12 if c.lod == 0 else 5):
            x = -0.85 + 1.7 * i / 11
            l = r.uniform(0.12, 0.3)
            reg = r.choice(['TOOL_GREY', 'CHROME', 'TOOL_RED', 'BLACK_PAINT'])
            D.box(c, (x, Dp / 2 - 0.03, H + 0.65 + r.uniform(-0.15, 0.15)), (0.012, 0.012, l / 2), reg, bevel=False)
        D.box(c, (0, Dp / 2 - 0.12, H + 1.08), (0.6, 0.04, 0.02), 'TOOL_GREY')
        D.box(c, (0, Dp / 2 - 0.12, H + 1.06), (0.58, 0.03, 0.006), 'LED_WHITE', bevel=False)
        # things on the bench: a toolbox, a can, a rag
        D.box(c, (0.1, -0.05, H + 0.08), (0.2, 0.1, 0.08), 'TOOL_RED')
        D.cyl(c, -0.3, 0.1, H, H + 0.16, 0.05, 'YELLOW_PAINT', n=D.n_(c, 10, 6))
    return dict(lights={'Strip': ((0, 0.25, 1.9), (0.9, 0.95, 1.0), 3.0)})


def tire_rack(c):
    W, Dp, H = 1.8, 0.5, 2.0
    for x in (-W / 2, W / 2):
        for y in (-Dp / 2, Dp / 2):
            D.box(c, (x, y, H / 2), (0.025, 0.025, H / 2), 'STAND_BLUE')
    for z in (0.05, 0.7, 1.35):
        for y in (-Dp / 2 + 0.12, Dp / 2 - 0.12):
            D.box(c, (0, y, z), (W / 2, 0.02, 0.02), 'TOOL_ORANGE' if False else 'ORANGE_PAINT')
        n = 5 if c.lod < 2 else 3
        for i in range(n):
            x = -W / 2 + 0.2 + (W - 0.4) * i / (n - 1)
            # tyre standing on its tread, axis along Y
            r, w = 0.3, 0.2
            S.disc(c, (x, -w / 2, z + 0.02 + r), r, (0, -1, 0), D.n_(c, 14, 10, 6), 'TYRE_WALL', 'TYRE', t=w)
            if c.lod == 0:
                S.disc(c, (x, -w / 2 - 0.001, z + 0.02 + r), r * 0.55, (0, -1, 0), 10, 'RUBBER', 'RUBBER', t=0.002)
    D.box(c, (0, -Dp / 2, H + 0.02), (W / 2 + 0.03, 0.04, 0.03), 'STAND_BLUE')


def paint_board(c):
    D.gfx_box(c, (0, 0, 1.15), (0.6, 0.025, 0.45), 'PAINT_CHIPS', 'WHITE_PAINT', rot=Rx(-8))
    for s in (1, -1):
        D.tube(c, [V((s * 0.35, -0.2, 0.0)), V((s * 0.3, 0.02, 1.6))], 0.02, 'WOOD')
    D.tube(c, [V((0, 0.45, 0.0)), V((0, 0.05, 1.55))], 0.02, 'WOOD')
    D.box(c, (0, -0.06, 0.7), (0.62, 0.04, 0.015), 'WOOD')         # ledge


def engine_stand(c):
    # stand: T base on castors, upright, rotating head plate with arms
    for y in (-0.28, 0.28):
        D.box(c, (0, y, 0.09), (0.45, 0.03, 0.03), 'STAND_BLUE')
        for x in (-0.42, 0.42):
            caster(c, x, y)
    D.box(c, (-0.4, 0, 0.09), (0.03, 0.3, 0.03), 'STAND_BLUE')
    D.box(c, (-0.4, 0, 0.45), (0.04, 0.04, 0.35), 'STAND_BLUE')
    D.box(c, (-0.32, 0, 0.78), (0.06, 0.04, 0.04), 'STAND_BLUE')
    S.disc(c, (-0.25, 0, 0.78), 0.1, (1, 0, 0), 10, 'STAND_BLUE', 'STAND_BLUE', t=0.02)
    # inline-four: block, head with red cam cover, oil pan, intake, exhaust manifold, pulley
    D.box(c, (0.12, 0, 0.72), (0.3, 0.16, 0.18), 'ENGINE')
    D.box(c, (0.12, 0, 0.94), (0.3, 0.14, 0.05), 'ENGINE')
    D.box(c, (0.12, 0, 1.02), (0.28, 0.12, 0.035), 'ENGINE_RED')
    D.box(c, (0.12, 0, 0.5), (0.27, 0.13, 0.05), 'ENGINE_DARK')
    if c.lod < 2:
        for i in range(4):
            x = -0.08 + 0.13 * i
            D.tube(c, [V((x, -0.14, 0.92)), V((x, -0.22, 0.85)), V((0.06, -0.24, 0.65))], 0.022, 'TOOL_GREY', n=6)     # exhaust runners
            D.tube(c, [V((x, 0.14, 0.94)), V((x, 0.24, 0.9))], 0.025, 'ENGINE_DARK', n=6)                            # intake runners
        D.box(c, (0.12, 0.28, 0.9), (0.28, 0.06, 0.06), 'ENGINE_DARK')
        S.disc(c, (0.44, 0, 0.62), 0.08, (1, 0, 0), 12, 'ENGINE_DARK', 'ENGINE_DARK', t=0.03)
        if c.lod == 0:
            for i in range(4):
                D.cyl(c, -0.08 + 0.13 * i, 0.0, 1.05, 1.08, 0.015, 'BLACK_PAINT', n=6)    # plug leads


def garage_sign(c):
    D.gfx_box(c, (0, -0.07, 0.3), (1.25, 0.03, 0.3), 'GARAGE_SIGN', 'SIGN_BACK')
    if c.lod < 2:
        for z in (0.0, 0.6):    # LED frame top and bottom
            D.box(c, (0, -0.1, z), (1.27, 0.012, 0.012), 'LED_WHITE', bevel=False)
        for s in (1, -1):        # wall brackets with bolts
            D.box(c, (s * 0.9, -0.02, 0.3), (0.03, 0.04, 0.25), 'STEEL_DARK')
            for z in (0.12, 0.48):
                S.bolt(c, (s * 0.9, -0.065, z), (0, -1, 0), r=0.012, reg='GALV')
    return dict(lights={'Sign': ((0, -0.5, 0.3), (1.0, 0.8, 0.6), 3.0)})


def tool_cabinet(c):
    W, Dp, H = 0.8, 0.45, 1.0
    D.box(c, (0, 0, 0.12 + (H - 0.12) / 2), (W / 2, Dp / 2, (H - 0.12) / 2), 'TOOL_RED')
    for x in (-W / 2 + 0.06, W / 2 - 0.06):
        for y in (-Dp / 2 + 0.06, Dp / 2 - 0.06):
            caster(c, x, y)
    for i in range(6):
        z = 0.2 + i * 0.13
        D.box(c, (0, -Dp / 2 - 0.004, z), (W / 2 - 0.03, 0.006, 0.055), 'TOOL_RED')
        if c.lod == 0:
            D.box(c, (0, -Dp / 2 - 0.012, z + 0.03), (W / 2 - 0.08, 0.006, 0.008), 'CHROME', bevel=False)
    D.box(c, (0, 0, H + 0.01), (W / 2 + 0.01, Dp / 2 + 0.01, 0.012), 'RUBBER')
    D.tube(c, [V((W / 2 + 0.02, -0.15, 0.9)), V((W / 2 + 0.07, -0.15, 0.9)), V((W / 2 + 0.07, 0.15, 0.9)), V((W / 2 + 0.02, 0.15, 0.9))],
           0.012, 'CHROME', n=6)


def floor_jack(c):
    D.box(c, (0, 0, 0.1), (0.14, 0.35, 0.05), 'TOOL_RED')
    for x in (-0.12, 0.12):
        S.disc(c, (x, -0.3, 0.05), 0.05, (1, 0, 0), 10, 'BLACK_PAINT', 'BLACK_PAINT', t=0.03)
        S.disc(c, (x, 0.3, 0.035), 0.035, (1, 0, 0), 8, 'BLACK_PAINT', 'BLACK_PAINT', t=0.03)
    D.box(c, (0, -0.25, 0.2), (0.06, 0.15, 0.04), 'TOOL_RED', rot=Rx(20))
    D.cyl(c, 0, -0.38, 0.22, 0.26, 0.06, 'RUBBER', n=10)
    D.tube(c, [V((0, 0.3, 0.15)), V((0, 1.1, 0.9))], 0.016, 'CHROME', n=6)
    D.tube(c, [V((-0.1, 1.1, 0.9)), V((0.1, 1.1, 0.9))], 0.02, 'RUBBER', n=6)


def car_lift(c):
    """Two-post lift: posts 3.6 m with carriages at mid height, four swing arms, top beam."""
    span = 3.1
    for s in (1, -1):
        x = s * span / 2
        D.box(c, (x, 0, 0.01), (0.3, 0.3, 0.01), 'STEEL_DARK')
        D.box(c, (x, 0, 1.8), (0.15, 0.18, 1.8), 'STAND_BLUE')
        D.box(c, (x - s * 0.17, 0, 1.8), (0.02, 0.1, 1.78), 'STEEL_DARK')               # carriage track
        D.box(c, (x - s * 0.22, 0, 1.05), (0.06, 0.16, 0.25), 'YELLOW_PAINT')           # carriage
        for d in (-1, 1):   # swing arms towards the car, pads at their ends
            a = math.radians(55 * d)
            p0 = V((x - s * 0.25, d * 0.08, 0.92))
            p1 = p0 + V((-s * math.cos(a) * 0.9 * abs(d), math.sin(a) * 0.9, 0.0))
            D.tube(c, [p0, p1], 0.05, 'YELLOW_PAINT', n=D.n_(c, 6, 4))
            D.cyl(c, p1.x, p1.y, 0.92, 1.0, 0.07, 'RUBBER', n=D.n_(c, 10, 6))
        if c.lod < 2:
            for z in (0.3, 0.6, 2.8):
                S.bolt(c, (x, -0.185, z), (0, -1, 0), r=0.02, reg='GALV')
            D.box(c, (x + s * 0.18, -0.12, 1.3), (0.04, 0.06, 0.12), 'BLACK_PAINT')       # control box
            D.box(c, (x + s * 0.18, -0.18, 1.33), (0.015, 0.004, 0.015), 'LAMP_GREEN', bevel=False)
    D.box(c, (0, 0, 3.75), (span / 2 + 0.15, 0.1, 0.1), 'STAND_BLUE')
    if c.lod < 2:
        D.tube(c, [V((-span / 2, 0.12, 3.6)), V((0, 0.12, 3.68)), V((span / 2, 0.12, 3.6))], 0.015, 'BLACK_PAINT', n=4)


ASSETS = {
    'Workbench': workbench,
    'TireRack': tire_rack,
    'PaintBoard': paint_board,
    'EngineStand': engine_stand,
    'GarageSign': garage_sign,
    'ToolCabinet': tool_cabinet,
    'FloorJack': floor_jack,
    'CarLift': car_lift,
}


def build(only=None):
    return D.build_set(ASSETS, 'Garage', only=only, lods=3)


def preview(results, views):
    return D.row_preview(results, 'GarageProps', gap=0.6, size=(1800, 420))
