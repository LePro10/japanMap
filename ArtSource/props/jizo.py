"""Jizō (O-Jizō-sama), the stone guardian of roads, children and travellers.

Jizo: a weathered stone monk 0.75 m tall (shaved head, robe, the wish
jewel in both hands, a ringed staff carved at his side) on a two-tier
pedestal; red bib (yodarekake) and red knitted cap; in front a tea cup and
two bamboo vases with flowers. Stands at the village edge, by the road.
Jizo_Roku: the six Jizō (roku-jizō) in a row on a stone plinth under a
simple wooden shelter with a tin roof, a plaque, an offering shelf -
typical at the entrance of a village cemetery.
"""
import math
import random
from mathutils import Vector, Matrix
from kit import core as K
from buildings.koedo_kit import orient
from props import scatter_kit as S

KLASS = 'props'
NAME = 'Jizo'
ATLAS = 'Scatter'


def figure(c, seed=0, cap=True, bib='RED_CLOTH'):
    """The figure alone, feet at z = 0, facing -Y (0.75 m)."""
    lod = c.lod
    r = random.Random(seed)
    n = 10 if lod == 0 else 6
    prof = [(0.15, 0.0), (0.16, 0.1), (0.15, 0.28), (0.132, 0.42), (0.112, 0.5), (0.072, 0.54), (0.06, 0.552),
            (0.092, 0.58), (0.112, 0.63), (0.106, 0.68), (0.076, 0.72), (0.0, 0.738)]
    if lod:
        prof = [(0.15, 0.0), (0.15, 0.28), (0.112, 0.5), (0.06, 0.552), (0.112, 0.63), (0.076, 0.72), (0.0, 0.738)]
    body = K.lathe(c.bm, n, prof, phase=math.pi / 2, cap_bottom=False)
    for v in {v for ring in body['rings'] for v in ring}:
        v.co.y *= 0.78 if v.co.z < 0.56 else 0.95          # robe flatter front to back than the head
    K.map_box(c.bm, body['sides'], c.R('STONE_OLD'), z0=0.0); c.nb(body['sides'])
    if lod == 0:
        # hands with the jewel (hōju) at the chest, sleeves as a band
        hj = K.lathe(c.bm, 6, [(0.0, 0.25), (0.032, 0.27), (0.03, 0.31), (0.0, 0.34)], cx=0, cy=-0.14, cap_bottom=False, cap_top=False)
        hd = S.boxc(c, 0, -0.12, 0.15, 0.06, 0.22, 0.27, 'STONE_OLD', skip=(), bevel=False)
        K.map_box(c.bm, hj['sides'], c.R('STONE_OLD'), z0=0.0); c.nb(hj['sides'])
        # ringed staff (shakujō) carved along the right side
        c.tube([(0.16, -0.06, 0.02), (0.15, -0.07, 0.62)], 0.012, 4, 'STONE_OLD_FLAT')
        c.tube([(0.15, -0.07, 0.62), (0.12, -0.07, 0.68), (0.15, -0.07, 0.73), (0.18, -0.07, 0.68), (0.15, -0.07, 0.62)],
               0.01, 4, 'STONE_OLD_FLAT')
    # bib: a cloth fan hanging from the neck over the chest (front half), with a hem
    k = 9 if lod == 0 else 4
    a0, a1 = math.radians(-200), math.radians(20)
    top = [Vector((0.07 * math.cos(a0 + (a1 - a0) * i / k), 0.06 * math.sin(a0 + (a1 - a0) * i / k), 0.55)) for i in range(k + 1)]
    bot = []
    for i in range(k + 1):
        a = a0 + (a1 - a0) * i / k
        front = max(0.0, -math.sin(a))                      # longest at the front
        bot.append(Vector((0.15 * math.cos(a), (0.11 + 0.03 * front) * math.sin(a) - 0.01, 0.5 - 0.1 * front)))
    vt = [c.bm.verts.new(p) for p in top]; vb = [c.bm.verts.new(p) for p in bot]
    fs = [c.bm.faces.new([vt[i], vt[i + 1], vb[i + 1], vb[i]]) for i in range(k)]
    orient(fs, Vector((0, 0, 0.62)))
    vt2 = [c.bm.verts.new(p - Vector((0, 0, 0.01))) for p in top]; vb2 = [c.bm.verts.new(p * 0.97 + Vector((0, 0, 0.0))) for p in bot]
    fi = [c.bm.faces.new([vt2[i], vt2[i + 1], vb2[i + 1], vb2[i]]) for i in range(k)]
    orient(fi, Vector((0, 0, 0.3)))
    c.m(fs + fi, bib, zrange=(0.4, 0.55)); c.nb(fs + fi)
    if cap:   # knitted cap with a rolled brim and a small pompom
        cp = K.lathe(c.bm, n, [(0.116, 0.645), (0.118, 0.665), (0.111, 0.67), (0.104, 0.715), (0.07, 0.752), (0.0, 0.762)],
                     phase=math.pi / 2, cap_bottom=False)
        c.m(cp['sides'], 'RED_KNIT'); c.nb(cp['sides'])
        if lod == 0:
            pp = K.lathe(c.bm, 5, [(0.0, 0.76), (0.025, 0.775), (0.02, 0.8), (0.0, 0.81)], cap_bottom=False, cap_top=False)
            c.m(pp['sides'], 'RED_KNIT'); c.nb(pp['sides'])


def flowers(c, x, y, z, seed=0, h=0.22):
    """Bamboo vase with a spray of flowers (chrysanthemums: yellow, white, purple)."""
    r = random.Random(seed)
    v = K.lathe(c.bm, 6, [(0.035, z), (0.035, z + 0.18)], cx=x, cy=y, cap_bottom=False)
    c.m(v['sides'], 'ROPE'); c.m([v['top']], 'WATER'); c.nb(v['sides'] + [v['top']])
    if c.lod:
        return
    for i in range(5):
        a = r.uniform(0, 6.28); rr = r.uniform(0.02, 0.07)
        tip = Vector((x + rr * math.cos(a), y + rr * math.sin(a), z + 0.18 + h * r.uniform(0.7, 1.1)))
        c.tube([(x, y, z + 0.15), tip], 0.004, 3, 'LEAF')
        fl = K.lathe(c.bm, 5, [(0.0, tip.z - 0.02), (0.03, tip.z), (0.0, tip.z + 0.02)], cx=tip.x, cy=tip.y,
                     cap_bottom=False, cap_top=False)
        c.m(fl['sides'], ('FLOWER_YELLOW', 'FLOWER_WHITE', 'FLOWER_PURPLE')[i % 3]); c.nb(fl['sides'])


def cup(c, x, y, z):
    u = K.lathe(c.bm, 8 if c.lod == 0 else 5, [(0.03, z), (0.04, z + 0.06), (0.034, z + 0.06), (0.026, z + 0.012)],
                cx=x, cy=y, cap_bottom=False)
    c.m(u['sides'], 'PAPER'); c.m([u['top']], 'WATER'); c.nb(u['sides'] + [u['top']])


def single(c):
    S.boxc(c, 0, 0, 0.56, 0.5, -0.05, 0.16, 'STONE_OLD')
    p = K.lathe(c.bm, 8, [(0.27, 0.16), (0.27, 0.22), (0.23, 0.28)], phase=math.pi / 8, cap_bottom=False)
    K.map_box(c.bm, p['sides'] + [p['top']], c.R('STONE_OLD'), z0=0.0)
    S.placed(c, lambda c: figure(c, 0), dz=0.28)
    cup(c, 0.0, -0.215, 0.16)
    flowers(c, -0.2, -0.17, 0.16, seed=1)
    flowers(c, 0.2, -0.17, 0.16, seed=2)


def roku(c):
    lod = c.lod
    W, D = 3.2, 0.9
    S.boxc(c, 0, 0, W, D, -0.05, 0.3, 'STONE_OLD')                 # plinth
    for i in range(6):
        x = -W / 2 + 0.3 + i * (W - 0.6) / 5
        S.placed(c, lambda c, i=i: figure(c, i, cap=i % 3 != 1, bib='RED_CLOTH'), dx=x, dy=0.1, dz=0.3, scale=0.85,
                 rz=random.Random(i).uniform(-0.08, 0.08))
        if lod == 0:
            cup(c, x, -0.28, 0.3)
    # wooden shelter: four posts on stone footings, beams, tin roof sloping back
    zf, zb = 2.15, 1.85
    for x in (-W / 2 - 0.05, W / 2 + 0.05):
        for y, zt in ((-D / 2 - 0.25, zf), (D / 2 + 0.05, zb)):
            S.boxc(c, x, y, 0.2, 0.2, -0.05, 0.12, 'STONE_OLD_FLAT')
            b = S.boxc(c, x, y, 0.1, 0.1, 0.12, zt, 'WOOD_GREY', bevel=False)
    fr = S.F(Vector((0, 0, 0)), (0, -1))
    c.box(fr, -W / 2 - 0.12, W / 2 + 0.12, zf - 0.18, zf, D / 2 + 0.2, D / 2 + 0.3, 'WOOD_GREY')            # front beam
    c.box(fr, -W / 2 - 0.12, W / 2 + 0.12, zb - 0.15, zb, -D / 2 - 0.1, -D / 2 + 0.0, 'WOOD_GREY')         # back beam
    for x in (-W / 2 - 0.05, W / 2 + 0.05):   # side beams along the slope
        y0, y1 = -D / 2 - 0.3, D / 2 + 0.1
        q = [c.bm.verts.new(p) for p in ((x - 0.05, y0, zf - 0.1), (x + 0.05, y0, zf - 0.1), (x + 0.05, y1, zb - 0.07),
                                         (x - 0.05, y1, zb - 0.07), (x - 0.05, y0, zf), (x + 0.05, y0, zf), (x + 0.05, y1, zb), (x - 0.05, y1, zb))]
        fs = [c.bm.faces.new([q[i] for i in idx]) for idx in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 3, 7, 4), (1, 5, 6, 2), (0, 4, 5, 1), (3, 2, 6, 7))]
        orient(fs, Vector((x, (y0 + y1) / 2, (zf + zb) / 2 - 0.04)))
        c.m(fs, 'WOOD_GREY')
    # roof: corrugated sheet as a slab with a fascia, overhanging 0.4 front, 0.25 back, 0.3 sides
    xa, xb = -W / 2 - 0.4, W / 2 + 0.4
    ya, yb = -D / 2 - 0.7, D / 2 + 0.35
    slope = (zf - zb) / (D + 0.35)
    z = lambda y: zf + 0.02 - (y - (-D / 2 - 0.3)) * slope
    top = [c.bm.verts.new(p) for p in ((xa, ya, z(ya)), (xb, ya, z(ya)), (xb, yb, z(yb)), (xa, yb, z(yb)))]
    bot = [c.bm.verts.new(v.co - Vector((0, 0, 0.05))) for v in top]
    fs = [c.bm.faces.new(top[::-1]), c.bm.faces.new(bot)] + [c.bm.faces.new([top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]]) for i in range(4)]
    orient(fs, Vector((0, 0, z(0) - 0.025)))
    c.m(fs, 'ROOF_SHEET')
    if lod == 0:   # ribs of the corrugated sheet
        x = xa + 0.1
        while x < xb:
            rib = [c.bm.verts.new(p) for p in ((x - 0.02, ya, z(ya)), (x + 0.02, ya, z(ya)), (x + 0.02, yb, z(yb)), (x - 0.02, yb, z(yb)))]
            for v in rib:
                v.co.z += 0.015
            f = c.bm.faces.new(rib)
            orient([f], Vector((x, (ya + yb) / 2, z(0) - 2.0)))
            c.m([f], 'ROOF_SHEET'); c.nb([f])
            x += 0.2
    # plaque under the front beam, offering shelf with flowers
    S.plate(c, (0, -D / 2 - 0.33, zf - 0.33), 0.6, 0.3, (0, -1, 0), 'NOTICE', 'WOOD_DARK', t=0.025, edge='WOOD_DARK')
    S.boxc(c, 0, -D / 2 - 0.12, W - 0.2, 0.18, 0.3, 0.34, 'WOOD_GREY', skip=())
    for x in (-1.2, -0.4, 0.4, 1.2):
        flowers(c, x, -D / 2 - 0.12, 0.34, seed=int(x * 10) + 7, h=0.2)


VARIANTS = {
    'Jizo': (single, [('', -0.28, 0.28, -0.25, 0.25, 0.0, 1.05)]),
    'Jizo_Roku': (roku, [('', -W2, W2, -0.8, 0.8, 0.0, 2.2) for W2 in (1.85,)]),
}


def build():
    mat = K.atlas_material(ATLAS)
    return [S.build_lods(k, fn, mat, cb, bevel=0.008) for k, (fn, cb) in VARIANTS.items()]


def preview(results, views):
    return S.lineup(results, NAME, views, gap=0.8, size=(900, 480))
