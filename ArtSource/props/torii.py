"""Torii, myōjin style (the common vermilion shrine gate).

Pillars (hashira) lean slightly inwards (uchi-korobi) and stand on stone
bases (kamebara) with black sleeves (nemaki); the tie beam (nuki) runs
through them and sticks out, wedges (kusabi) hold it; the central strut
(gakuzuka) carries the name plaque; the lintel is two layers - straight
shimaki below, the upward-curving kasagi above with a black top.
Medium: pillars 4.4 m, 3.6 m apart, total 5.2 m high, 6.0 m wide.
Variants: Vermilion_M, Vermilion_S (0.6 scale, for small shrines and the
Inari tunnel), Stone_M (grey granite, no lacquer). The path goes along Y.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'Torii'
ATLAS = 'Props'


def _beam(bm, x0, x1, prof, sori=0.0, segs=12, zfun=None):
    """Lintel swept along X; prof = closed (y, z) outline; ends rise by sori."""
    half = (x1 - x0) / 2; cx = (x0 + x1) / 2
    rows = []
    for i in range(segs + 1):
        x = x0 + (x1 - x0) * i / segs
        t = abs(x - cx) / half
        dz = sori * t ** 2.4
        rows.append([bm.verts.new((x, y, z + dz)) for y, z in prof])
    n = len(prof)
    sides = []
    for i in range(segs):
        a, b = rows[i], rows[i + 1]
        for k in range(n):
            sides.append(bm.faces.new([a[k], b[k], b[(k + 1) % n], a[(k + 1) % n]]))
    c0 = bm.faces.new(rows[0]); c1 = bm.faces.new(rows[-1])
    area = sum(prof[i][0] * prof[(i + 1) % n][1] - prof[(i + 1) % n][0] * prof[i][1] for i in range(n))
    if area > 0:
        for f in sides:
            f.normal_flip()
    for f, sgn in ((c0, -1), (c1, 1)):
        f.normal_update()
        if f.normal.x * sgn < 0:
            f.normal_flip()
    return sides, c0, c1


def _rect(w, h, z0):
    return [(-w / 2, z0), (w / 2, z0), (w / 2, z0 + h), (-w / 2, z0 + h)]


def _geo(lod, stone):
    bm = K.new_bm()
    R = lambda n: A.region(ATLAS, n)
    red = R('STONE') if stone else R('VERMILION')
    black = R('STONE') if stone else R('LACQUER_BLACK')
    paint = lambda fs, zr=(0, 5.2): (K.map_faces(bm, fs, red, zrange=zr) if not stone else
                                     [K.map_faces(bm, [f], red) for f in fs])
    n = 16 if lod == 0 else 8
    lean = math.radians(1.4)
    X = 1.8
    for sx in (-1, 1):
        base = K.lathe(bm, n, [(0.34, 0.0), (0.34, 0.06), (0.30, 0.14), (0.24, 0.20)], cx=sx * X, cy=0,
                       cap_bottom=False, cap_top=False)
        K.map_faces(bm, base['sides'], R('STONE'))
        sleeve = K.lathe(bm, n, [(0.205, 0.20), (0.205, 0.75), (0.185, 0.78)], cx=0, cy=0,
                         cap_bottom=False, cap_top=False)
        post = K.lathe(bm, n, [(0.185, 0.75), (0.17, 4.36), (0.0, 4.36)], cx=0, cy=0, cap_bottom=False)
        ring = K.lathe(bm, n, [(0.205, 4.18), (0.205, 4.34), (0.17, 4.36)], cx=0, cy=0, cap_bottom=False,
                       cap_top=False) if lod == 0 else None
        parts = [sleeve, post] + ([ring] if ring else [])
        for p in parts:   # lean inwards about the foot, then move to the pillar position
            for v in {v for f in p['sides'] + ([p['top']] if p['top'] else []) for v in f.verts}:
                x, z = v.co.x, v.co.z
                v.co.x = sx * X + x * math.cos(lean) - sx * z * math.sin(lean)
                v.co.z = x * math.sin(lean) * sx + z * math.cos(lean)
        if stone:
            K.map_cyl(bm, post['sides'], R('STONE'), cx=sx * X, rotate=True)
            K.map_cyl(bm, sleeve['sides'], R('STONE'), cx=sx * X, rotate=True)
        else:
            K.map_faces(bm, post['sides'], red, zrange=(0, 5.2))
            K.map_faces(bm, sleeve['sides'], black)
        if ring:
            K.map_faces(bm, ring['sides'], black if not stone else red)
    xt = X - 4.36 * math.sin(lean)            # pillar centre at the top
    # nuki: tie beam through the pillars, sticking out 0.45 m
    sides, c0, c1 = _beam(bm, -xt - 0.55, xt + 0.55, _rect(0.15, 0.30, 3.40), segs=1)
    paint(sides + [c0, c1])
    if lod == 0:
        for sx in (-1, 1):   # wedges outside the pillars
            w = K.box(bm, sx * (xt + 0.2) - 0.05, sx * (xt + 0.2) + 0.05, -0.11, 0.11, 3.36, 3.74)
            paint(list(w.values()))
    # gakuzuka + plaque
    g = K.box(bm, -0.11, 0.11, -0.08, 0.08, 3.70, 4.37, skip=('-z', '+z'))
    paint(list(g.values()))
    pl = K.box(bm, -0.24, 0.24, -0.15, -0.08, 3.62, 4.42)
    K.map_faces(bm, [pl['-y']], R('PLAQUE'))
    K.map_faces(bm, [pl[k] for k in pl if k != '-y'], black)
    # shimaki (straight) + kasagi (curved, black top layer)
    sides, c0, c1 = _beam(bm, -xt - 0.75, xt + 0.75, _rect(0.26, 0.24, 4.36), segs=1)
    paint(sides + [c0, c1])
    segs = 14 if lod == 0 else 6
    kasa_low = [(-0.17, 4.60), (0.17, 4.60), (0.19, 4.74), (-0.19, 4.74)]
    kasa_top = [(-0.19, 4.74), (0.19, 4.74), (0.21, 4.80), (0.17, 4.90), (-0.17, 4.90), (-0.21, 4.80)]
    sides, c0, c1 = _beam(bm, -3.0, 3.0, kasa_low, sori=0.32, segs=segs)
    paint(sides + [c0, c1])
    sides, c0, c1 = _beam(bm, -3.06, 3.06, kasa_top, sori=0.34, segs=segs)
    K.map_faces(bm, sides + [c0, c1], black) if not stone else [K.map_faces(bm, [f], black) for f in sides + [c0, c1]]
    return bm


VARIANTS = {'Vermilion_M': (1.0, False), 'Vermilion_S': (0.6, False), 'Stone_M': (1.0, True)}


def build_variant(key, lods=(0, 1)):
    scale, stone = VARIANTS[key]
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = []
    for lod in lods:
        bm = _geo(lod, stone)
        if scale != 1.0:
            for v in bm.verts:
                v.co *= scale
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.012 * scale if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    for sx in (-1, 1):
        K.collider_box(f'COL_{name}_{"L" if sx < 0 else "R"}', col, (sx * 1.8 - 0.25) * scale,
                       (sx * 1.8 + 0.25) * scale, -0.25 * scale, 0.25 * scale, 0, 4.4 * scale)
    return col, objs


def build():
    return [build_variant(k) for k in VARIANTS]


def preview(results, views):
    from kit import preview as P
    xs = {'Torii_Vermilion_M': 0.0, 'Torii_Vermilion_S': 5.0, 'Torii_Stone_M': -7.0}
    for col, _ in results:
        for o in col.objects:
            o.location.x += xs[col.name]
    objs = [o[0] for _, o in results]
    show = [c.name for c, _ in results]
    a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(800, 480), show=show)
    b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(800, 480), show=show)
    for col, _ in results:
        for o in col.objects:
            o.location.x -= xs[col.name]
    return f'{a}, {b}'
