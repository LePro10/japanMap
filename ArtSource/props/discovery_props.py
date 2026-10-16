"""Discovery props (task 6; the '20 Entdeckungs-Props' of the asset list):
small objects a player can find, matched to the discoveries in
Data/Gameplay/Discoveries.asset (title in brackets).

  Plaque_Founder      bronze plaque on a granite block       (Founder's Plaque)
  Binoculars_Coin     coin-operated viewer on a post          (Crossing viewer)
  StartBoard_Retired  old timing board with five dead lamps   (Retired start board)
  Bleacher_Small      three-row aluminium stand 4 m           (Spectator stand)
  MapPanel            roofed roadside area map               (Roadside map panel)
  LookoutPanel        angled panorama panel naming the peaks  (Ridge panel)
  Thermos_Red         red thermos with its cup on a flat stone (Red thermos)
  Bell_Small          small bronze bell in a wooden frame     (Temple bell)
  TideBoard           tide table board at the quay           (Tide board)
  LifeRing_Post       life ring and its sign on a post        (Lifering sign)
  Driftwood_Marker    driftwood log with a painted stake      (Driftwood marker)
  RiceTray_Rack       seedling trays on a rack                (Rice tray)
  LanternPlaque       stone lantern plaque, carved            (Lantern plaque)
  NetHouse_Ropes      coils of rope and floats on a hook rack (Net House ropes)

Atlas `Details`; origin on the ground, the readable side to -Y."""
import math, random
from mathutils import Vector, Matrix
from props import detail_kit as D
from props import scatter_kit as S

KLASS = 'props'
NAME = 'DiscoveryProps'
V = Vector
Rx = lambda a: Matrix.Rotation(math.radians(a), 3, 'X')
Ry = lambda a: Matrix.Rotation(math.radians(a), 3, 'Y')
Rz = lambda a: Matrix.Rotation(math.radians(a), 3, 'Z')


def plaque(c):
    D.box(c, (0, 0, 0.35), (0.45, 0.25, 0.35), 'STONE')
    D.gfx_box(c, (0, -0.255, 0.42), (0.3, 0.008, 0.22), 'PLAQUE', 'BRONZE')
    if c.lod == 0:
        for x in (-0.27, 0.27):
            for z in (0.24, 0.6):
                S.bolt(c, (x, -0.263, z), (0, -1, 0), r=0.01, h=0.005, reg='BRONZE')


def binoculars(c):
    D.box(c, (0, 0, 0.03), (0.2, 0.2, 0.03), 'CONC')
    D.cyl(c, 0, 0, 0.06, 1.1, 0.05, 'GREEN_PAINT')
    D.box(c, (0, 0, 1.15), (0.12, 0.1, 0.08), 'GREEN_PAINT')
    D.box(c, (0, -0.02, 1.32), (0.17, 0.13, 0.11), 'GREEN_PAINT', rot=Rx(8))
    for s in (1, -1):
        D.tube(c, [V((s * 0.07, -0.14, 1.35)), V((s * 0.07, -0.22, 1.36))], 0.04, 'BLACK_PAINT', n=D.n_(c, 10, 6))   # eyepieces
        D.tube(c, [V((s * 0.08, 0.12, 1.33)), V((s * 0.08, 0.2, 1.35))], 0.055, 'GREEN_PAINT', n=D.n_(c, 10, 6))     # objectives
        D.tube(c, [V((s * 0.18, 0.0, 1.3)), V((s * 0.3, -0.12, 1.28))], 0.015, 'CHROME', n=6)                       # handles
    if c.lod == 0:
        D.box(c, (0.0, -0.105, 1.15), (0.04, 0.004, 0.02), 'CHROME', bevel=False)   # coin slot
        D.box(c, (0.0, -0.106, 1.21), (0.06, 0.003, 0.012), 'YELLOW_PAINT', bevel=False)


def start_board(c):
    for x in (-0.75, 0.75):
        D.cyl(c, x, 0, 0, 2.6, 0.05, 'RED_PAINT' if False else 'STEEL_DARK')
        D.box(c, (x, 0, 0.03), (0.2, 0.2, 0.03), 'CONC')
    D.gfx_box(c, (0, -0.06, 2.15), (0.85, 0.06, 0.33), 'START_BOARD', 'BLACK_PAINT')
    if c.lod < 2:
        # rust-streaked hood, a bird's nest on top (it has stood here for years)
        D.box(c, (0, -0.12, 2.52), (0.9, 0.14, 0.02), 'STEEL_DARK', rot=Rx(-12))
        D.blob(c, (0.5, -0.05, 2.56), (0.12, 0.09, 0.04), 'STRAW_ROPE')


def bleacher(c, L=4.0):
    for i in range(3):
        z = 0.45 + i * 0.4; y = -0.6 + i * 0.6
        D.box(c, (0, y, z), (L / 2, 0.15, 0.025), 'BLEACHER_SEAT')
        D.box(c, (0, y - 0.2, z - 0.2), (L / 2, 0.12, 0.015), 'TRUSS')      # foot board
    for x in (-L / 2 + 0.1, 0, L / 2 - 0.1):
        D.tube(c, [V((x, -0.9, 0.0)), V((x, 0.7, 1.35))], 0.03, 'TRUSS', n=D.n_(c, 6, 4))
        D.tube(c, [V((x, 0.7, 0.0)), V((x, 0.7, 1.35))], 0.03, 'TRUSS', n=D.n_(c, 6, 4))
        D.tube(c, [V((x, -0.6, 0.0)), V((x, -0.6, 0.45))], 0.025, 'TRUSS', n=4)
        D.tube(c, [V((x, 0.0, 0.0)), V((x, 0.0, 0.85))], 0.025, 'TRUSS', n=4)
    D.tube(c, [V((-L / 2, 0.8, 2.0)), V((L / 2, 0.8, 2.0))], 0.025, 'TRUSS')   # back rail
    for x in (-L / 2, L / 2):
        D.tube(c, [V((x, 0.8, 0.0)), V((x, 0.8, 2.0))], 0.025, 'TRUSS')


def map_panel(c):
    for x in (-0.65, 0.65):
        D.box(c, (x, 0, 1.0), (0.05, 0.05, 1.0), 'WOOD_DARK')
    D.gfx_box(c, (0, -0.06, 1.35), (0.6, 0.02, 0.45), 'MAP_PANEL', 'WOOD_DARK')
    D.box(c, (0, -0.06, 1.85), (0.75, 0.25, 0.025), 'WOOD_DARK', rot=Rx(-15))    # little roof
    D.box(c, (0, -0.06, 0.82), (0.66, 0.06, 0.03), 'WOOD_DARK')
    for x in (-0.65, 0.65):
        D.box(c, (x, 0, 0.04), (0.12, 0.12, 0.04), 'CONC')


def lookout(c):
    D.box(c, (0, 0, 0.45), (0.06, 0.06, 0.45), 'WOOD_DARK')
    D.gfx_box(c, (0, -0.1, 1.0), (0.45, 0.2, 0.012), 'LOOKOUT', 'WOOD_DARK', rot=Rx(30), front='+z')
    D.box(c, (0, 0, 0.03), (0.2, 0.2, 0.03), 'CONC')


def thermos(c):
    D.blob(c, (0, 0, 0.03), (0.3, 0.22, 0.06), 'STONE')
    D.lathe(c, [(0.045, 0.06), (0.045, 0.3), (0.035, 0.33), (0.035, 0.36), (0.04, 0.37), (0.04, 0.4), (0.0, 0.405)], 0.0, 0.0,
            'THERMOS_RED', n=D.n_(c, 12, 8), regs=['THERMOS_RED', 'SILVER', 'SILVER', 'THERMOS_RED', 'THERMOS_RED', 'THERMOS_RED'])
    D.lathe(c, [(0.03, 0.06), (0.04, 0.12), (0.0, 0.121)], 0.14, -0.05, 'THERMOS_RED', n=10)   # the cup
    if c.lod == 0:
        D.tube(c, [V((0.045, 0, 0.3)), V((0.07, 0, 0.27)), V((0.07, 0, 0.14)), V((0.045, 0, 0.12))], 0.008, 'BLACK_PAINT', n=4)


def bell(c):
    """Small bronze bell (like a village temple's) hanging in a frame with a striker log."""
    for x in (-0.6, 0.6):
        D.box(c, (x, 0, 0.9), (0.06, 0.06, 0.9), 'WOOD_DARK')
        D.box(c, (x, 0, 0.05), (0.15, 0.15, 0.05), 'STONE')
    D.box(c, (0, 0, 1.85), (0.75, 0.07, 0.06), 'WOOD_DARK')
    D.box(c, (0, 0, 2.05), (0.85, 0.35, 0.03), 'WOOD_DARK', rot=Rx(0))     # roof board
    D.lathe(c, [(0.0, 1.2), (0.2, 1.2), (0.2, 1.24), (0.18, 1.5), (0.14, 1.66), (0.06, 1.72), (0.03, 1.8), (0.0, 1.8)], 0, 0,
            'BELL_GOLD', n=D.n_(c, 16, 10))
    if c.lod < 2:
        D.tube(c, [V((0, 0, 1.8)), V((0, 0, 1.79))], 0.03, 'BRONZE', n=6)
        # striker log on two ropes
        D.tube(c, [V((-0.15, -0.45, 1.42)), V((0.15, -0.45, 1.42))], 0.05, 'WOOD', n=8)
        for x in (-0.12, 0.12):
            D.tube(c, [V((x, -0.45, 1.44)), V((x, -0.07, 1.84))], 0.006, 'ROPE', n=3)
        D.tube(c, [V((0, -0.45, 1.4)), V((0.05, -0.55, 0.9))], 0.012, 'ROPE_RED_WHITE', n=4)
        if c.lod == 0:   # the bands on the bell
            for z in (1.3, 1.45):
                D.lathe(c, [(0.205, z), (0.2, z + 0.02)], 0, 0, 'BRONZE', n=16)


def tide_board(c):
    D.cyl(c, 0, 0, 0, 1.9, 0.04, 'GALV')
    D.gfx_box(c, (0, -0.045, 1.5), (0.25, 0.008, 0.37), 'TIDE', 'WHITE_PAINT')
    D.box(c, (0, 0, 0.04), (0.15, 0.15, 0.04), 'CONC')


def lifering(c):
    D.box(c, (0, 0, 0.75), (0.05, 0.05, 0.75), 'WHITE_PAINT')
    D.box(c, (0, 0, 0.04), (0.14, 0.14, 0.04), 'CONC')
    D.gfx_box(c, (0, -0.06, 1.38), (0.12, 0.008, 0.18), 'LIFERING_SIGN', 'WHITE_PAINT')
    n = D.n_(c, 16, 10)
    pts = [V((0.3 * math.cos(2 * math.pi * i / n), -0.08, 0.85 + 0.3 * math.sin(2 * math.pi * i / n))) for i in range(n + 1)]
    for i in range(n):
        D.tube(c, [pts[i], pts[i + 1]], 0.06, 'LIFERING_ORANGE' if (i // (n // 4)) % 2 == 0 else 'LIFERING_WHITE', n=D.n_(c, 8, 6), caps=False)
    D.box(c, (0, -0.05, 1.18), (0.03, 0.04, 0.02), 'GALV')     # the hook it hangs on


def driftwood(c):
    D.blob(c, (0, 0, 0.12), (0.9, 0.14, 0.12), 'DRIFTWOOD', rot=Rz(12))
    D.blob(c, (0.75, 0.15, 0.15), (0.25, 0.07, 0.07), 'DRIFTWOOD', rot=Rz(50) @ Ry(-20))
    D.cyl(c, -0.5, 0.05, 0, 1.0, 0.025, 'WOOD_PALE')
    D.box(c, (-0.5, 0.05, 0.88), (0.04, 0.04, 0.1), 'RED_PAINT')        # painted marker tip
    if c.lod == 0:
        D.tube(c, [V((-0.5, 0.05, 0.6)), V((-0.2, -0.1, 0.22))], 0.008, 'ROPE', n=3)


def rice_trays(c):
    """Seedling trays (naebako) on a two-level rack, green shoots in each."""
    for x in (-0.65, 0.65):
        for y in (-0.3, 0.3):
            D.box(c, (x, y, 0.4), (0.02, 0.02, 0.4), 'GALV')
    for z in (0.3, 0.75):
        D.box(c, (0, 0, z), (0.68, 0.32, 0.012), 'GALV')
        for i, x in enumerate((-0.32, 0.32)):
            D.box(c, (x, 0, z + 0.04), (0.3, 0.29, 0.03), 'SEED_TRAY')
            D.box(c, (x, 0, z + 0.07), (0.29, 0.28, 0.006), 'SOIL', bevel=False)
            fs = D.box(c, (x, 0, z + 0.11), (0.28, 0.27, 0.04), 'SEEDLING', bevel=False)


def lantern_plaque(c):
    """A carved stone tablet for the lantern street: dark granite on a base."""
    D.box(c, (0, 0, 0.1), (0.4, 0.2, 0.1), 'STONE')
    D.box(c, (0, 0, 0.6), (0.3, 0.08, 0.4), 'STONE')
    D.box(c, (0, -0.081, 0.62), (0.22, 0.004, 0.3), 'MIRROR_BACK', bevel=False)
    if c.lod == 0:
        for z in (0.82, 0.7, 0.58, 0.46):
            D.box(c, (0.0, -0.086, z), (0.15, 0.002, 0.012), 'GOLD', bevel=False)


def net_ropes(c):
    """Rope coils and floats hanging on a hook rack of the net house."""
    D.box(c, (0, 0.05, 1.6), (0.9, 0.04, 0.05), 'WOOD_DARK')
    for x in (-0.9, 0.9):
        D.box(c, (x, 0.05, 0.85), (0.05, 0.05, 0.85), 'WOOD_DARK')
    for i, x in enumerate((-0.5, 0.0, 0.5)):
        D.tube(c, [V((x, 0.0, 1.6)), V((x, -0.06, 1.6)), V((x, -0.06, 1.52))], 0.008, 'GALV', n=4)
        # a coil: torus-like ring of tubes, flattened
        n = D.n_(c, 10, 6)
        R = 0.18
        pts = [V((x + R * math.cos(2 * math.pi * k / n), -0.08, 1.33 + R * 1.15 * math.sin(2 * math.pi * k / n))) for k in range(n + 1)]
        D.tube(c, pts, 0.045, 'ROPE' if i != 1 else 'STRAW_ROPE', n=D.n_(c, 6, 4), caps=False)
    if c.lod < 2:
        r = random.Random(4)
        for k in range(6):
            D.blob(c, (-0.7 + 0.28 * k, -0.08, 0.7 + r.uniform(-0.1, 0.1)), (0.07, 0.07, 0.07), 'LIFERING_ORANGE' if k % 2 else 'PLASTIC_GREY')
        D.tube(c, [V((-0.85, -0.08, 0.95)), V((0.85, -0.08, 0.95))], 0.01, 'ROPE', n=4)


ASSETS = {
    'Plaque_Founder': plaque,
    'Binoculars_Coin': binoculars,
    'StartBoard_Retired': start_board,
    'Bleacher_Small': bleacher,
    'MapPanel': map_panel,
    'LookoutPanel': lookout,
    'Thermos_Red': thermos,
    'Bell_Small': bell,
    'TideBoard': tide_board,
    'LifeRing_Post': lifering,
    'Driftwood_Marker': driftwood,
    'RiceTray_Rack': rice_trays,
    'LanternPlaque': lantern_plaque,
    'NetHouse_Ropes': net_ropes,
}


def build(only=None):
    return D.build_set(ASSETS, 'Discovery', only=only, lods=3)


def preview(results, views):
    return D.row_preview(results, 'DiscoveryProps', gap=0.5, size=(1800, 420))
