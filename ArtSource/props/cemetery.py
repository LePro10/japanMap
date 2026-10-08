"""Japanese graves (haka) for village cemeteries on the hillside.

Grave_Family: family plot 1.8 x 2.0 m: granite kerb (gaisaku) with gate
posts and an entrance step, gravel; the stepped Japanese-style monument
(washiki boseki): base (shiba-dai), middle (chū-dai), upper (jō-dai) and
the tall pillar (sao-ishi) engraved "... family grave"; in front the water
basin (mizubachi), incense box (kōro) and two flower vases with
chrysanthemums; behind it the stainless sotoba rack with wooden memorial
boards (sotoba) cut to the five-ring outline; an epitaph slab (boshi).
Grave_Old: old weathered stones on rough ground, mossy, leaning: pillar
stones, a boat-shaped relief stone (funagata) and a five-ring stupa (gorintō).
Cemetery_Row_8m: four family plots side by side on a concrete path, each
with its own monument, stone and sotoba (chain along X).
"""
import math
import random
from mathutils import Vector
from kit import core as K
from buildings.koedo_kit import orient
from props import scatter_kit as S
from props.jizo import flowers

KLASS = 'props'
NAME = 'Cemetery'
ATLAS = 'Scatter'


def sotoba(c, x, y, h, reg, lean=0.0, w=0.09, t=0.012):
    """One wooden board with the gorintō outline at the top, facing -Y."""
    hw = w / 2
    right = [(hw, 0.0), (hw, h - 0.32), (hw * 0.55, h - 0.3), (hw, h - 0.27), (hw, h - 0.2), (hw * 0.55, h - 0.18),
             (hw, h - 0.15), (hw, h - 0.08), (0.0, h)] if c.lod == 0 else [(hw, 0.0), (hw, h - 0.08), (0.0, h)]
    outline = right + [(-a, b) for a, b in reversed(right[:-1])]
    P = lambda a, b, d: Vector((x + a, y + d + b * lean, b))
    fr = [c.bm.verts.new(P(a, b, -t / 2)) for a, b in outline]
    bk = [c.bm.verts.new(P(a, b, t / 2)) for a, b in outline]
    ff = c.bm.faces.new(fr); bf = c.bm.faces.new(bk[::-1])
    ff.normal_update(); bf.normal_update()
    if ff.normal.y > 0:
        ff.normal_flip()
    if bf.normal.y < 0:
        bf.normal_flip()
    n = len(outline)
    sides = [c.bm.faces.new([fr[i], fr[(i + 1) % n], bk[(i + 1) % n], bk[i]]) for i in range(n)]
    orient(sides, P(0, h / 2, 0))
    c.m([ff], reg); c.m([bf], 'WOOD_GREY'); c.m(sides, 'WOOD_GREY'); c.nb([ff, bf] + sides)


def family(c, seed=0, face='GRAVE_A', stone='GRANITE', n_sotoba=3):
    lod = c.lod
    r = random.Random(seed)
    W, D = 1.8, 2.0
    z0 = 0.18                                     # plot floor (gravel) level
    # kerb: front with an entrance gap, sides, back; gate posts
    k = 0.15
    S.boxc(c, -0.6, -D / 2 + k / 2, 0.6, k, -0.05, 0.3, 'GRANITE_LIGHT')
    S.boxc(c, 0.6, -D / 2 + k / 2, 0.6, k, -0.05, 0.3, 'GRANITE_LIGHT')
    for sx in (-1, 1):
        S.boxc(c, sx * (W / 2 - k / 2), 0.0, k, D - 2 * k, -0.05, 0.3, 'GRANITE_LIGHT')
        S.boxc(c, sx * 0.32, -D / 2 + 0.1, 0.2, 0.2, -0.05, 0.6, 'GRANITE_LIGHT')         # gate posts (monchū)
    S.boxc(c, 0, D / 2 - k / 2, W, k, -0.05, 0.45, 'GRANITE_LIGHT')
    S.boxc(c, 0, -D / 2 - 0.15, 0.6, 0.3, -0.05, 0.1, 'GRANITE_LIGHT')                   # step
    S.boxc(c, 0, 0.0, W - 2 * k, D - 2 * k, -0.05, z0, 'GRAVEL', bevel=False)
    S.boxc(c, 0, -D / 2 + 0.08, 0.44, 0.16, -0.05, z0 + 0.02, 'GRANITE_LIGHT')           # threshold slab
    # monument at the back
    yb = 0.35
    S.boxc(c, 0, yb, 1.0, 0.9, z0, z0 + 0.12, 'GRANITE_LIGHT')
    S.boxc(c, 0, yb + 0.05, 0.72, 0.62, z0 + 0.12, z0 + 0.34, stone)
    S.boxc(c, 0, yb + 0.07, 0.52, 0.44, z0 + 0.34, z0 + 0.54, stone)
    S.boxc(c, 0, yb + 0.08, 0.3, 0.3, z0 + 0.54, z0 + 1.2, stone, front=face)
    if lod == 0:   # pyramidal top of the pillar
        a = z0 + 1.2
        top = [c.bm.verts.new((x, yb + 0.08 + y, a)) for x, y in ((-0.15, -0.15), (0.15, -0.15), (0.15, 0.15), (-0.15, 0.15))]
        tip = [c.bm.verts.new((x, yb + 0.08 + y, a + 0.035)) for x, y in ((-0.11, -0.11), (0.11, -0.11), (0.11, 0.11), (-0.11, 0.11))]
        fs = [c.bm.faces.new([top[i], top[(i + 1) % 4], tip[(i + 1) % 4], tip[i]]) for i in range(4)] + [c.bm.faces.new(tip)]
        orient(fs, Vector((0, yb + 0.08, a - 0.1)))
        c.m(fs, stone)
    # water basin with water, incense box with lid, flower vases on the middle tier
    S.boxc(c, 0, yb - 0.6, 0.42, 0.26, z0, z0 + 0.2, stone)
    if lod == 0:
        q = [c.bm.verts.new(p) for p in ((-0.12, yb - 0.66, z0 + 0.19), (0.12, yb - 0.66, z0 + 0.19), (0.12, yb - 0.54, z0 + 0.19),
                                          (-0.12, yb - 0.54, z0 + 0.19))]
        f = c.bm.faces.new(q); orient([f], Vector((0, yb - 0.6, 0)))
        c.m([f], 'WATER'); c.nb([f])
    S.boxc(c, 0, yb - 0.32, 0.34, 0.22, z0 + 0.12, z0 + 0.26, stone)
    S.boxc(c, 0, yb - 0.32, 0.38, 0.26, z0 + 0.26, z0 + 0.29, stone)
    if lod == 0:
        S.boxc(c, 0, yb - 0.32, 0.18, 0.1, z0 + 0.29, z0 + 0.3, 'ASH', skip=('bot',), bevel=False)
    for sx in (-1, 1):
        S.boxc(c, sx * 0.43, yb - 0.08, 0.12, 0.12, z0 + 0.12, z0 + 0.42, stone)
        flowers(c, sx * 0.43, yb - 0.08, z0 + 0.42 - 0.18, seed=seed * 3 + sx, h=0.25)
    # epitaph slab on the left, slanted back a little
    S.placed(c, lambda c: S.boxc(c, 0, 0, 0.6, 0.1, 0.0, 0.5, stone, front='GRANITE'), dx=-0.62, dy=-0.05, dz=z0, rz=math.radians(90))
    # sotoba rack behind the monument: stainless posts and rails, boards leaning on it
    yr = D / 2 - 0.28
    if n_sotoba:
        for x in (-0.42, 0.42):
            c.tube([(x, yr, z0), (x, yr, z0 + 1.05)], 0.015, 4, 'STAINLESS')
        for z in (z0 + 0.6, z0 + 1.0):
            c.tube([(-0.46, yr, z), (0.46, yr, z)], 0.012, 4, 'STAINLESS')
        regs = ['SOTOBA_A', 'SOTOBA_C', 'SOTOBA_B', 'SOTOBA_A']
        for i in range(n_sotoba):
            x = -0.3 + 0.6 * i / max(1, n_sotoba - 1)
            sotoba(c, x + r.uniform(-0.03, 0.03), yr - 0.04, r.uniform(1.25, 1.55), regs[(i + seed) % 4], lean=0.05)


def gorinto(c, x, y, s=1.0, tilt=0.0):
    """Five-ring stupa: cube (earth), sphere (water), roof (fire), half-moon (wind), jewel (void)."""
    lod = c.lod

    def f(c):
        S.boxc(c, 0, 0, 0.32, 0.32, 0.0, 0.26, 'STONE_OLD')
        n = 8 if lod == 0 else 5
        sp = K.lathe(c.bm, n, [(0.12, 0.26), (0.17, 0.33), (0.17, 0.4), (0.12, 0.46)], cap_bottom=False, cap_top=False)
        K.map_box(c.bm, sp['sides'], c.R('STONE_OLD'), z0=0.0)
        roof = K.lathe(c.bm, 4, [(0.29, 0.46), (0.32, 0.5), (0.27, 0.53), (0.08, 0.64)], phase=math.pi / 4, cap_bottom=True, cap_top=False)
        K.map_box(c.bm, roof['sides'] + [roof['bottom']], c.R('STONE_OLD'), z0=0.0)
        top = K.lathe(c.bm, n, [(0.06, 0.64), (0.11, 0.68), (0.1, 0.72), (0.06, 0.74), (0.09, 0.78), (0.0, 0.88)], cap_bottom=False, cap_top=False)
        K.map_box(c.bm, top['sides'], c.R('STONE_OLD'), z0=0.0)
        c.nb(sp['sides'] + roof['sides'] + top['sides'])
    S.placed(c, f, dx=x, dy=y, scale=s, rz=tilt)


def old(c, seed=4):
    lod = c.lod
    r = random.Random(seed)
    S.boxc(c, 0, 0, 2.6, 1.4, -0.05, 0.12, 'STONE_OLD_FLAT', bevel=False)                    # rough stone platform
    gorinto(c, -0.85, 0.15, 1.1, 0.2)
    for i, (x, h) in enumerate(((-0.25, 0.55), (0.25, 0.42), (0.95, 0.5))):
        def pillar(c, h=h):
            S.boxc(c, 0, 0, 0.2, 0.2, 0.0, h, 'STONE_OLD')
            if lod == 0:
                p = [c.bm.verts.new(v) for v in ((-0.1, -0.1, h), (0.1, -0.1, h), (0.1, 0.1, h), (-0.1, 0.1, h))]
                t = c.bm.verts.new((0, 0, h + 0.06))
                fs = [c.bm.faces.new([p[k], p[(k + 1) % 4], t]) for k in range(4)]
                orient(fs, Vector((0, 0, h - 0.1)))
                c.m(fs, 'STONE_OLD_FLAT')
        S.placed(c, pillar, dx=x, dy=r.uniform(-0.1, 0.2), dz=0.12, rz=r.uniform(-0.3, 0.3))
        # leaning: shear the last added pillar a little (no transforms on the mesh object)
    # boat-shaped relief stone (funagata): flat slab with a pointed round top
    def funagata(c):
        n = 10 if lod == 0 else 5
        pts = [(0.17, 0.0), (0.17, 0.35)] + [(0.17 * math.cos(a), 0.35 + 0.17 * math.sin(a) * 1.4) for a in
                                             [math.pi * i / n for i in range(1, n)]] + [(-0.17, 0.35), (-0.17, 0.0)]
        fr = [c.bm.verts.new((x, -0.04, z)) for x, z in pts]; bk = [c.bm.verts.new((x, 0.04, z)) for x, z in pts]
        ff = c.bm.faces.new(fr); bf = c.bm.faces.new(bk[::-1])
        side = [c.bm.faces.new([fr[i], fr[(i + 1) % len(pts)], bk[(i + 1) % len(pts)], bk[i]]) for i in range(len(pts))]
        fs = [ff, bf] + side
        orient(fs, Vector((0, 0, 0.25)))
        K.map_box(c.bm, fs, c.R('STONE_OLD'), z0=0.0)
        # carved figure in relief: a small Jizo-like bump
        if lod == 0:
            bmp = K.lathe(c.bm, 6, [(0.0, 0.08), (0.07, 0.12), (0.06, 0.3), (0.05, 0.36), (0.0, 0.42)], cy=-0.04, cap_bottom=False, cap_top=False)
            for v in {v for ring in bmp['rings'] for v in ring}:
                v.co.y = -0.04 - abs(v.co.y + 0.04) * 0.5
            K.map_box(c.bm, bmp['sides'], c.R('STONE_OLD'), z0=0.0); c.nb(bmp['sides'])
    S.placed(c, funagata, dx=0.55, dy=-0.25, dz=0.12, rz=0.15)
    # a cup and a few flowers left by someone
    from props.jizo import cup
    cup(c, -0.25, -0.35, 0.12)
    flowers(c, 0.1, -0.4, 0.12, seed=9, h=0.18)


def row(c):
    specs = [(0, 'GRAVE_A', 'GRANITE', 3), (1, 'GRAVE_B', 'GRANITE_LIGHT', 2), (2, 'GRAVE_A', 'GRANITE', 4), (3, 'GRAVE_C', 'STONE_OLD', 1)]
    for i, (seed, face, stone, ns) in enumerate(specs):
        S.placed(c, lambda c, a=(seed, face, stone, ns): family(c, *a), dx=-3.0 + 2.0 * i, dy=0.3)
    # concrete path in front (slabs)
    for i in range(4):
        S.boxc(c, -3.0 + 2.0 * i, -1.25, 1.96, 0.9, -0.05, 0.04, 'CONC_FLAT', bevel=True)


VARIANTS = {
    'Grave_Family': (lambda c: family(c), [('', -0.9, 0.9, -1.0, 1.0, 0.0, 1.4)]),
    'Grave_Old': (old, [('', -1.3, 1.3, -0.7, 0.7, 0.0, 1.0)]),
    'Cemetery_Row_8m': (row, [('', -4.0, 4.0, -0.7, 1.3, 0.0, 1.4)]),
}


def build():
    mat = K.atlas_material(ATLAS)
    return [S.build_lods(k, fn, mat, cb, bevel=0.008) for k, (fn, cb) in VARIANTS.items()]


def preview(results, views):
    return S.lineup(results, NAME, views, gap=0.8, size=(1100, 480))
