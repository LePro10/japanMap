"""Benches. Sitting side is -Y (the front); length along X, centred.

Park: two dark cast side frames, five seat slats and three back slats
  (Street atlas), seat 0.42 m, 1.8 m long.
Teahouse: engidai - low wooden platform with a red felt cloth (mōsen) and a
  big red parasol (nodate-gasa) on a pole stand, as at temple tea stalls.
Stone: granite slab on two blocks (shrines, gardens).
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'Bench'


def _park(bm, lod):
    R = lambda n: A.region('Street', n)
    frame = [(-0.30, 0.0), (-0.22, 0.0), (-0.19, 0.36), (0.16, 0.36), (0.20, 0.0), (0.28, 0.0), (0.24, 0.40),
             (0.33, 0.86), (0.26, 0.87), (0.17, 0.44), (-0.25, 0.44), (-0.26, 0.40)]
    for x in (-0.78, 0.78):
        sides, c0, c1 = K.poly_prism_x(bm, frame, x - 0.025, x + 0.025)
        K.map_faces(bm, sides + [c0, c1], R('PAINT_DARK'))
        if lod == 0:   # armrest
            sd, _, c = K.tube_path(bm, [(x, -0.30, 0.6), (x, -0.1, 0.64), (x, 0.24, 0.62)], 0.022, 6, cap0=False)
            K.map_faces(bm, sd, R('PAINT_DARK'))
            sd, _, _ = K.tube_path(bm, [(x, -0.27, 0.40), (x, -0.30, 0.6)], 0.018, 6)
            K.map_faces(bm, sd, R('PAINT_DARK'))
    for i in range(5 if lod == 0 else 1):   # seat slats
        y0 = -0.27 + i * 0.09
        b = K.box(bm, -0.9, 0.9, y0, y0 + (0.075 if lod == 0 else 0.44), 0.44, 0.475)
        K.map_faces(bm, b.values(), R('WOOD_LIGHT'), s_offset=i * 1.37)
    back = math.radians(14)
    for i in range(3 if lod == 0 else 1):   # back slats, tilted
        z0 = 0.52 + i * 0.12
        h = 0.09 if lod == 0 else 0.33
        b = K.box(bm, -0.9, 0.9, 0.0, 0.03, 0.0, h)
        for v in {v for f in b.values() for v in f.verts}:
            y, z = v.co.y, v.co.z
            v.co.y = 0.20 + (z0 - 0.5) * math.tan(back) + y * math.cos(back) + z * math.sin(back)
            v.co.z = z0 - y * math.sin(back) + z * math.cos(back)
        K.map_faces(bm, b.values(), R('WOOD_LIGHT'), s_offset=i * 2.11)


def _teahouse(bm, lod):
    R = lambda n: A.region('Props', n)
    L, Dp, Hs = 1.8, 0.6, 0.42
    for i in range(4):   # four planks, each with its own grain
        y0 = -Dp / 2 + i * Dp / 4
        top = K.box(bm, -L / 2, L / 2, y0 + 0.003, y0 + Dp / 4 - 0.003, Hs - 0.04, Hs)
        K.map_faces(bm, top.values(), R('WOOD_DARK'), s_offset=i * 1.7)
    for x in (-L / 2 + 0.08, L / 2 - 0.08):
        for y in (-Dp / 2 + 0.06, Dp / 2 - 0.06):
            leg = K.box(bm, x - 0.035, x + 0.035, y - 0.035, y + 0.035, 0.0, Hs - 0.04, skip=('-z', '+z'))
            K.map_faces(bm, leg.values(), A.region('Props', 'WOOD_DARK'), rotate=True)
        st = K.box(bm, x - 0.02, x + 0.02, -Dp / 2 + 0.06, Dp / 2 - 0.06, 0.1, 0.15, skip=('-y', '+y'))
        K.map_faces(bm, st.values(), A.region('Props', 'WOOD_DARK'))
    # red felt: lies on top and hangs down 0.12 m at the front
    cl = K.box(bm, -L / 2 + 0.1, L / 2 - 0.1, -Dp / 2 - 0.006, Dp / 2 - 0.05, Hs, Hs + 0.008, skip=('-z',))
    drop = K.box(bm, -L / 2 + 0.1, L / 2 - 0.1, -Dp / 2 - 0.014, -Dp / 2 - 0.006, Hs - 0.12, Hs + 0.008,
                 skip=('+z', '+y'))
    K.map_faces(bm, list(cl.values()) + list(drop.values()), R('FELT_RED'))
    # parasol on a pole stand behind the bench
    px, py = 0.0, Dp / 2 + 0.25
    stand = K.lathe(bm, 8, [(0.22, 0.0), (0.22, 0.12), (0.05, 0.16), (0.03, 0.18)], cx=px, cy=py, cap_bottom=False,
                    cap_top=False)
    K.map_faces(bm, stand['sides'], R('STONE'))
    pole, _, _ = K.tube_path(bm, [(px, py, 0.16), (px, py, 2.45)], 0.025, 8, reg=A.region('Props', 'WOOD_DARK'))
    n = 24 if lod == 0 else 12
    canopy = K.lathe(bm, n, [(1.25, 2.12), (0.9, 2.30), (0.45, 2.44), (0.06, 2.52), (0.0, 2.54)], cx=px, cy=py,
                     cap_bottom=False)
    under = K.lathe(bm, n, [(1.24, 2.11), (0.9, 2.28), (0.45, 2.42), (0.03, 2.50)], cx=px, cy=py,
                    cap_bottom=False, cap_top=False)
    for f in under['sides']:
        f.normal_flip()
    K.map_faces(bm, canopy['sides'] + under['sides'], R('FELT_RED'))
    if lod == 0:   # ribs under the canopy
        for k in range(12):
            a = 2 * math.pi * k / 12
            d = Vector((math.cos(a), math.sin(a), 0))
            p0 = Vector((px, py, 1.75)); p1 = Vector((px, py, 2.1)) + d * 1.0
            sd, _, _ = K.tube_path(bm, [p0, p1], 0.008, 4)
            K.map_faces(bm, sd, A.region('Props', 'WOOD_DARK')); K.nobevel(bm, sd)
        tip = K.lathe(bm, 6, [(0.03, 2.53), (0.0, 2.62)], cx=px, cy=py, cap_bottom=False)
        K.map_faces(bm, tip['sides'], R('LACQUER_BLACK'))


def _stone(bm, lod):
    R = lambda n: A.region('Props', n)
    slab = K.box(bm, -0.8, 0.8, -0.2, 0.2, 0.36, 0.46)
    for f in slab.values():
        K.map_faces(bm, [f], R('STONE'))
    for x in (-0.55, 0.55):
        b = K.box(bm, x - 0.13, x + 0.13, -0.16, 0.16, 0.0, 0.36, skip=('-z', '+z'))
        K.map_faces(bm, b.values(), R('STONE'), z0=0.0)
    K.map_faces(bm, [slab['+z']], R('STONE_MOSS'))


VARIANTS = {'Park': (_park, 'Street', (0.9, 0.35, 0.9)), 'Teahouse': (_teahouse, 'Props', (0.9, 0.3, 0.46)),
            'Stone': (_stone, 'Props', (0.8, 0.2, 0.46))}


def build_variant(key, lods=(0, 1)):
    fn, atlas, (w, d, h) = VARIANTS[key]
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(atlas)
    objs = []
    for lod in lods:
        bm = K.new_bm()
        fn(bm, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.008 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    K.collider_box(f'COL_{name}', col, -w, w, -d, d, 0, h)
    return col, objs


def build():
    return [build_variant(k) for k in VARIANTS]


def preview(results, views):
    from kit import preview as P
    xs = {'Bench_Park': -2.2, 'Bench_Teahouse': 0.3, 'Bench_Stone': 2.6}
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
