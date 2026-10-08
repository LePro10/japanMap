"""Rocks and garden stones (Nature atlas). Each sits slightly buried.

Rock_S / _M / _L: weathered granite boulders split along a few planes.
Rock_M_Moss: the M boulder with moss on everything facing up (shrines, forest).
Rock_Flat: stepping stone (tobi-ishi), flat top, mostly buried.
Rock_Standing: upright garden stone (tate-ishi), mossy top.
"""
from kit import core as K, atlas as A, organic as O

KLASS = 'props'
NAME = 'Rock'
ATLAS = 'Nature'

# size (x, y, z), seed, subdiv LOD0, planar cuts, moss, flat_top, buried share of the height
VARIANTS = {
    'S':        ((0.55, 0.45, 0.38), 11, 3, 5, False, None, 0.15),
    'M':        ((1.2, 0.9, 0.75), 23, 3, 6, False, None, 0.15),
    'L':        ((2.3, 1.8, 1.5), 37, 4, 7, False, None, 0.12),
    'M_Moss':   ((1.2, 0.95, 0.7), 41, 3, 6, True, None, 0.15),
    'Flat':     ((0.75, 0.55, 0.3), 53, 3, 3, False, 0.2, 0.55),
    'Standing': ((0.6, 0.5, 1.4), 67, 3, 6, True, None, 0.1),
}
# icosphere subdivisions: Blender counts the plain icosahedron as 1 (20 faces),
# so 3 = 320 and 4 = 1280 triangles


def _geo(bm, key, lod):
    size, seed, sub, cuts, moss, flat, buried = VARIANTS[key]
    sub = sub if lod == 0 else 2
    zc = size[2] / 2 - size[2] * buried
    faces = O.lump(bm, (0, 0, zc), size, seed, sub, amp=0.24, freq=1.2, detail=0.1, cuts=cuts,
                   flat_top=flat)
    R = lambda n: A.region(ATLAS, n)
    up = [f for f in faces if f.normal.z > 0.55] if moss else []
    rest = [f for f in faces if f not in set(up)]
    z0 = min(v.co.z for f in faces for v in f.verts)
    K.map_box(bm, rest, R('ROCK'), z0=z0)
    if up:
        K.map_box(bm, up, R('ROCK_MOSS'))   # own z0: the moss strip is shorter than the tall stone
    return size, zc


def build_variant(key, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = []
    for lod in lods:
        bm = K.new_bm()
        size, zc = _geo(bm, key, lod)
        # faceted: rocks read better with hard breaks than with smooth blobs
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.0, bevel_angle=28,
                                  hidden=lod > 0, recalc=True))
    sx, sy, sz = size
    K.collider_box(f'COL_{name}', col, -sx * 0.42, sx * 0.42, -sy * 0.42, sy * 0.42, 0.0, max(0.05, zc + sz * 0.45))
    return col, objs


def build():
    return [build_variant(k) for k in VARIANTS]


def preview(results, views):
    from kit import preview as P
    pos = {'Rock_S': (-2.4, -0.6), 'Rock_M': (-1.0, 0.3), 'Rock_L': (1.4, 1.0), 'Rock_M_Moss': (3.6, 0.2),
           'Rock_Flat': (-0.2, -1.2), 'Rock_Standing': (5.2, 0.8)}
    for col, _ in results:
        for o in col.objects:
            o.location.x += pos[col.name][0]; o.location.y += pos[col.name][1]
    objs = [o[0] for _, o in results]
    show = [c.name for c, _ in results]
    a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(800, 480), show=show)
    b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(800, 480), show=show)
    for col, _ in results:
        for o in col.objects:
            o.location.x -= pos[col.name][0]; o.location.y -= pos[col.name][1]
    return f'{a}, {b}'
