"""Tetrapod (wave-dissipating block, shōha-block) - the concrete armour that
lines half of Japan's coast and every breakwater.

Four tapered legs from a rounded centre along the tetrahedron axes; each leg
ends in a flat, chamfered foot. Size of the common 2-3 t block: legs 1.15 m
from the centre, total height 1.7 m, footprint about 2.1 m (matches the map
placeholder 2.0 x 1.7 x 2.2 m). Placed 372x on the map, so the budget stays
small (LOD0 ~0.6k): smooth legs, the edges at the feet catch light.

Variants: Tetrapod (on three legs, one up), Tetrapod_Tilted (lying on two
legs, for the slope of a pile), Tetrapod_Pile (five interlocked, 4.6 x 4 m,
a ready piece of breakwater armour). Box-mapped onto the TETRA strip: the
damp dark band sits at the foot of every block and of the pile.
"""
import math
from mathutils import Vector, Matrix
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'Tetrapod'
ATLAS = 'Scatter'
LEG = 1.15


def _dirs(rot):
    base = [Vector((0, 0, 1)), Vector((0.9428, 0, -0.3333)),
            Vector((-0.4714, 0.8165, -0.3333)), Vector((-0.4714, -0.8165, -0.3333))]
    return [(rot @ d).normalized() for d in base]


def tetrapod(bm, p, rot, lod, L=LEG):
    """One block at centre p (Vector), legs along rot @ tetrahedron axes."""
    n = 8 if lod == 0 else 5
    faces = []
    # leg profile (radius, distance along the leg): fat root, straight taper, chamfered foot
    prof = [(0.4 * L, 0.0), (0.37 * L, 0.3 * L), (0.25 * L, 0.88 * L), (0.235 * L, 0.96 * L), (0.19 * L, L)]
    if lod:
        prof = [(0.4 * L, 0.0), (0.24 * L, 0.94 * L), (0.19 * L, L)]
    for d in _dirs(rot):
        st = K.lathe(bm, n, prof, cap_bottom=False, cap_top=True)
        m = Matrix.Translation(p) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        for v in {v for r in st['rings'] for v in r}:
            v.co = m @ v.co
        faces += st['sides'] + [st['top']]
    # rounded core where the legs meet (fills the crotches, no gap from below)
    core = bmesh_ico(bm, p, 0.42 * L, 2 if lod == 0 else 1)
    return faces + core


def bmesh_ico(bm, c, r, sub):
    import bmesh
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in res['verts']:
        v.co += c
    return list({f for v in res['verts'] for f in v.link_faces})


def _ground(rot, L=LEG):
    """Lowest point of a block (its lowest foot rim) relative to its centre."""
    return min((d * L).z - 0.19 * L * math.sqrt(max(0.0, 1 - d.z ** 2)) for d in _dirs(rot))


# (rotation about X/Y/Z in degrees, centre x, y) - the pile is placed by hand
# so legs interlock and no block floats; z comes from _ground (+ lift on others)
PILE = [((0, 0, 0), -1.45, -0.5, 0.0), ((0, 0, 60), 1.4, -0.6, 0.0), ((0, 0, 25), 0.0, 1.35, 0.0),
        ((32, 0, 15), -0.05, -0.15, 0.6), ((-25, 20, 70), 1.75, 1.2, 0.2)]
VARIANTS = {
    'Tetrapod': [((0, 0, 0), 0.0, 0.0, 0.0)],
    'Tetrapod_Tilted': [((0, 54.7, 0), 0.0, 0.0, 0.0)],
    'Tetrapod_Pile': PILE,
}


def _rot(e):
    return (Matrix.Rotation(math.radians(e[2]), 3, 'Z') @ Matrix.Rotation(math.radians(e[1]), 3, 'Y')
            @ Matrix.Rotation(math.radians(e[0]), 3, 'X'))


def build_variant(key, lods=(0, 1)):
    col = K.collection(key)
    mat = K.atlas_material(ATLAS)
    R = A.region(ATLAS, 'TETRA')
    objs = []
    blocks = VARIANTS[key]
    for lod in lods:
        bm = K.new_bm()
        for e, x, y, lift in blocks:   # mapped block by block: tops map along y, a pile is too deep for the strip
            rot = _rot(e)
            K.map_box(bm, tetrapod(bm, Vector((x, y, -_ground(rot) + lift)), rot, lod), R, z0=0.0)
        objs.append(K.mesh_object(f'SM_{key}_LOD{lod}', bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    # collider: one box per block (a convex hull of the legs would be closer, a box is enough to stop a car)
    for i, (e, x, y, lift) in enumerate(blocks):
        z0 = lift
        K.collider_box(f'COL_{key}_{i}', col, x - 0.9, x + 0.9, y - 0.9, y + 0.9, z0, z0 + 1.5)
    return col, objs


def build():
    return [build_variant(k) for k in VARIANTS]


def preview(results, views):
    from kit import preview as P
    xs = {'Tetrapod': -4.0, 'Tetrapod_Tilted': -1.0, 'Tetrapod_Pile': 3.5}
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
