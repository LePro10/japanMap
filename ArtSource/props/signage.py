"""Roadside signage for Sakura Commons (car dealer, workshop, events).

Nobori_*: single nobori flag (0.6 x 1.8 m) the Japanese way: white pole
in a black water-filled plastic base (chūsui-dai) with its filler cap, a
cross bar at the top holding the flag, the flag tied to the pole with
loops (chichi), slightly waving. Red "new car fair", blue "inspection
(shaken) accepted", yellow "open". Back side shows the print mirrored.
EventBoard_4m: 4 x 2 m event board on two steel posts with base plates
and anchor bolts on concrete footings, aluminium frame, steel back with
stiffeners, two LED floodlights on arms lighting the face at night.
Front (-Y).
"""
import math
from mathutils import Vector
from kit import core as K
from buildings.koedo_kit import orient
from props import scatter_kit as S

KLASS = 'props'
NAME = 'Signage'
ATLAS = 'Scatter'


def nobori(c, reg, seed=0):
    lod = c.lod
    # water tank base: rounded block, filler cap, socket
    b = K.lathe(c.bm, 8 if lod == 0 else 4, [(0.3, 0.0), (0.3, 0.14), (0.26, 0.2), (0.06, 0.22)], phase=math.pi / 8,
                cap_bottom=False, cap_top=False)
    c.m(b['sides'], 'PLASTIC_BLACK')
    if lod == 0:
        cp = K.lathe(c.bm, 6, [(0.045, 0.16), (0.045, 0.2)], cx=0.16, cy=-0.1, cap_bottom=False)
        c.m(cp['sides'] + [cp['top']], 'PLASTIC_GREEN'); c.nb(cp['sides'])
        sk = K.lathe(c.bm, 6, [(0.04, 0.2), (0.035, 0.38)], cap_bottom=False)
        c.m(sk['sides'] + [sk['top']], 'PLASTIC_BLACK'); c.nb(sk['sides'])
    S.post(c, 0, 0, 0.2, 3.35, 0.0125, 'PAINT_WHITE', n=6 if lod == 0 else 4, cap='flat')
    # cross bar (yoko-bō) at the top
    c.tube([(0, 0, 3.3), (0.64, 0, 3.3)], 0.008, 4, 'PAINT_WHITE', caps=True)
    # the flag: 6 x 5 grid, waving in y, front and back skins 3 mm apart
    nu, nv = (6, 5) if lod == 0 else (2, 1)
    x0, x1, z0, z1 = 0.03, 0.63, 1.45, 3.27
    def P(i, j, off):
        x = x0 + (x1 - x0) * i / nu
        z = z0 + (z1 - z0) * j / nv
        w = 0.05 * math.sin(math.pi * 1.6 * (x - x0) / (x1 - x0) + seed) * (x - x0) / (x1 - x0)
        return Vector((x, w + off, z))
    for off, out, flip in ((-0.0015, -1, False), (0.0015, 1, True)):
        vs = [[c.bm.verts.new(P(i, j, off)) for j in range(nv + 1)] for i in range(nu + 1)]
        fs = []
        for i in range(nu):
            for j in range(nv):
                f = c.bm.faces.new([vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]])
                f.normal_update()
                if (f.normal.y > 0) != (out > 0):
                    f.normal_flip()
                fs.append(f)
        c.span(fs, reg, (1, 0, 0), flip_u=flip); c.nb(fs)
    if lod == 0:   # loops (chichi) tying the flag edge to the pole
        for z in (1.6, 2.0, 2.4, 2.8, 3.2):
            c.tube([(0.0, -0.016, z), (0.03, -0.004, z), (0.03, 0.004, z), (0.0, 0.016, z)], 0.006, 3, 'PAINT_WHITE')


def event_board(c):
    lod = c.lod
    W, Hb, zb = 4.0, 2.0, 1.0
    xs = (-1.55, 1.55)
    fr = S.F(Vector((0, 0, 0)), (0, -1))
    for x in xs:
        S.pad(c, x, 0.05, 0.5, 0.5, h=0.1)
        S.boxc(c, x, 0.05, 0.3, 0.3, 0.1, 0.12, 'STEEL_DARK', bevel=False)
        S.anchor_bolts(c, x, 0.05, 0.12, 0.11)
        S.boxc(c, x, 0.05, 0.15, 0.15, 0.12, zb + Hb + 0.05, 'STEEL_DARK', skip=('bot',))
        if lod == 0:   # gusset plates at the foot
            for sx in (-1, 1):
                u0, u1 = sorted((sx * 0.075, sx * 0.16))
                c.box(S.F(Vector((x, 0.05, 0)), (0, -1)), u0, u1, 0.12, 0.3, -0.005, 0.005, 'STEEL_DARK')
    # board: face, aluminium frame, steel back with stiffeners
    y0 = -0.03
    S.plate(c, (0, y0, zb + Hb / 2), W, Hb, (0, -1, 0), 'EVENT', 'STEEL_DARK', t=0.02, edge='GALV')
    for z0, z1 in ((zb - 0.04, zb), (zb + Hb, zb + Hb + 0.04)):
        c.box(fr, -W / 2 - 0.04, W / 2 + 0.04, z0, z1, -y0 - 0.005, -y0 + 0.05, 'GALV')
    for sx in (-1, 1):
        c.box(fr, sx * W / 2 - (0.0 if sx > 0 else 0.04), sx * W / 2 + (0.04 if sx > 0 else 0.0), zb, zb + Hb,
              -y0 - 0.005, -y0 + 0.05, 'GALV')
    for z in (zb + 0.3, zb + Hb - 0.3):
        c.box(fr, -W / 2 + 0.05, W / 2 - 0.05, z - 0.04, z + 0.04, -y0 - 0.1, -y0 - 0.02, 'STEEL_DARK')
    if lod == 0:
        for xa, xb in ((-1.5, -0.5), (0.5, 1.5)):   # diagonals on the back
            c.tube([(xa, y0 + 0.06, zb + 0.34), (xb, y0 + 0.06, zb + Hb - 0.34)], 0.025, 4, 'STEEL_DARK')
    # floodlights: arms from the post tops forward over the face, heads tilted at the board
    for x in xs:
        c.tube([(x, 0.05, zb + Hb + 0.02), (x, 0.05, zb + Hb + 0.25), (x, -0.65, zb + Hb + 0.25)], 0.022, 6 if lod == 0 else 4, 'STEEL_DARK')
        h = c.box(S.F(Vector((x, -0.75, 0)), (0, -1)), -0.17, 0.17, zb + Hb + 0.16, zb + Hb + 0.3, -0.1, 0.1, 'STEEL_DARK', skip=())
        c.m([h['bot']], 'LED')
        if lod == 0:
            for k in range(5):   # cooling fins on top
                u = -0.14 + k * 0.07
                c.box(S.F(Vector((x, -0.75, 0)), (0, -1)), u - 0.008, u + 0.008, zb + Hb + 0.3, zb + Hb + 0.34, -0.09, 0.09, 'STEEL_DARK')


def _lights(col):
    for x in (-1.55, 1.55):
        K.light_marker(f'LIGHT_{col.name}_{"L" if x < 0 else "R"}', col, (x, -0.75, 3.1), color=(0.95, 0.97, 1.0),
                       watts=40, unity_range=5.0)


VARIANTS = {
    'Nobori_Red': (lambda c: nobori(c, 'NOBORI_A', 0.0), [('', -0.3, 0.3, -0.3, 0.3, 0.0, 0.3)], None),
    'Nobori_Blue': (lambda c: nobori(c, 'NOBORI_B', 1.3), [('', -0.3, 0.3, -0.3, 0.3, 0.0, 0.3)], None),
    'Nobori_Yellow': (lambda c: nobori(c, 'NOBORI_C', 2.4), [('', -0.3, 0.3, -0.3, 0.3, 0.0, 0.3)], None),
    'EventBoard_4m': (event_board, [('_L', -1.8, -1.3, -0.2, 0.3, 0.0, 3.1), ('_R', 1.3, 1.8, -0.2, 0.3, 0.0, 3.1)], _lights),
}


def build():
    mat = K.atlas_material(ATLAS)
    return [S.build_lods(k, fn, mat, cb, markers=mk) for k, (fn, cb, mk) in VARIANTS.items()]


def preview(results, views):
    return S.lineup(results, NAME, views, gap=0.8, size=(1000, 480))
