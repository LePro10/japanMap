"""Fences and garden walls. All modules run along +X from x = 0; chain them
end to end. The face to the street is -Y (both sides are finished).

BlockWall_2m: concrete block wall (burokku-bei) 1.2 m, 6 courses, concrete
  footing, cap stone, one row of perforated decorative blocks.
BlockWall_Pillar: 0.2 m pier for ends and corners.
Bamboo_1.8m: kenninji-gaki - wooden post, tight vertical split bamboo,
  horizontal half-bamboo rails tied with black palm rope, round top rail.
Board_1.8m: itabei - dark cedar boards with battens on a stone footing under
  a small tiled gable (old towns: Kiso, Koedo).
"""
import math
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'Fence'
ATLAS = 'Street'


def _block_wall(bm, R, lod):
    L, T, Hw = 2.0, 0.06, 1.2
    foot = K.box(bm, 0, L, -0.1, 0.1, -0.05, 0.1, skip=('-z', '-x', '+x'))
    K.map_faces(bm, foot.values(), R('CONCRETE_CAP'))
    # faces gridded so the decorative blocks (course 5, two blocks) can be opened
    xs = [0, 0.4, 0.8, 1.2, 1.6, 2.0]; zs = [0.1, 0.9, 1.1, Hw]
    holes = {(1, 1), (3, 1)} if lod == 0 else set()
    gf = K.grid_plane(bm, lambda u, z: (u, -T, z), xs, zs, (0, -1, 0))
    gb = K.grid_plane(bm, lambda u, z: (u, T, z), xs, zs, (0, 1, 0))
    K.map_faces(bm, list(gf.values()) + list(gb.values()), R('BLOCK_WALL'), z0=0.1)
    for key in holes:   # through-opening with a cross-and-ring pattern
        for g, sgn in ((gf, -1), (gb, 1)):
            fl, walls = K.recess(bm, g[key], 0.06, T)
            K.map_faces(bm, walls, R('CONCRETE_CAP'))
            bm.faces.remove(fl)
        x0, x1 = xs[key[0]] + 0.06, xs[key[0] + 1] - 0.06
        cx, cz = (x0 + x1) / 2, 1.0
        for a in (math.pi / 4, -math.pi / 4):
            dx, dz = math.cos(a) * 0.17, math.sin(a) * 0.09
            bar, c0, c1 = K.tube_path(bm, [(cx - dx, 0, cz - dz), (cx + dx, 0, cz + dz)], 0.022, 4)
            K.map_faces(bm, bar, R('CONCRETE_CAP')); K.nobevel(bm, bar)
    cap = K.box(bm, 0, L, -0.085, 0.085, Hw, Hw + 0.06, skip=('-x', '+x'))
    K.map_faces(bm, cap.values(), R('CONCRETE_CAP'))


def _pillar(bm, R, lod):
    p = K.box(bm, -0.1, 0.1, -0.1, 0.1, -0.05, 1.28, skip=('-z',))
    K.map_faces(bm, p.values(), R('BLOCK_WALL'), z0=0.1)
    c = K.box(bm, -0.13, 0.13, -0.13, 0.13, 1.28, 1.36)
    K.map_faces(bm, c.values(), R('CONCRETE_CAP'))


def _bamboo(bm, R, lod):
    L, Hf = 1.8, 1.8
    post = K.lathe(bm, 8, [(0.05, 0.0), (0.045, Hf + 0.08), (0.0, Hf + 0.1)], cap_bottom=False)
    K.map_faces(bm, post['sides'], R('WOOD_POST'))
    # tight vertical slats: a fluted slab, one flute per 6 cm slat
    n_sl = 30 if lod == 0 else 6
    for sgn in (-1, 1):
        xs = []
        for i in range(n_sl):
            x0 = 0.05 + (L - 0.05) * i / n_sl
            xs.append(x0)
            if lod == 0:
                xs.append(x0 + (L - 0.05) / n_sl / 2)
        xs.append(L)
        verts_lo, verts_hi = [], []
        for j, x in enumerate(xs):
            y = sgn * (0.03 if (lod == 0 and j % 2 == 1) else 0.018)
            verts_lo.append(bm.verts.new((x, y, 0.05))); verts_hi.append(bm.verts.new((x, y, Hf)))
        fs = []
        for j in range(len(xs) - 1):
            f = bm.faces.new([verts_lo[j], verts_lo[j + 1], verts_hi[j + 1], verts_hi[j]])
            f.normal_update()
            if f.normal.y * sgn < 0:
                f.normal_flip()
            fs.append(f)
        for j, f in enumerate(fs):   # nodes staggered per slat, like real split bamboo
            K.map_faces(bm, [f], R('BAMBOO'), rotate=True, s_offset=((j // 2) * 0.137 + (sgn > 0) * 0.07) % 0.4)
    # horizontal half-bamboo rails both sides, tied with black rope
    for z in (0.25, 0.65, 1.05, 1.45):
        for sgn in (-1, 1):
            sd, c0, c1 = K.tube_path(bm, [(0.05, sgn * 0.045, z), (L, sgn * 0.045, z)], 0.022, 6 if lod == 0 else 4,
                                     reg=R('BAMBOO'))
            K.nobevel(bm, sd)
            if lod == 0:
                for x in (0.35, 0.95, 1.55):
                    kn = K.box(bm, x - 0.02, x + 0.02, sgn * 0.075 - 0.012, sgn * 0.075 + 0.012, z - 0.03, z + 0.03)
                    K.map_faces(bm, kn.values(), R('ROPE_BLACK')); K.nobevel(bm, kn.values())
    top, c0, c1 = K.tube_path(bm, [(0.05, 0, Hf + 0.03), (L, 0, Hf + 0.03)], 0.045, 8 if lod == 0 else 5,
                              reg=R('BAMBOO'))
    K.nobevel(bm, top)


def _board(bm, R, lod):
    L, Hb = 1.8, 1.9
    base = K.box(bm, 0, L, -0.1, 0.1, -0.05, 0.25, skip=('-z', '-x', '+x'))
    K.map_faces(bm, base.values(), R('CONCRETE_CAP'))
    post = K.box(bm, -0.06, 0.06, -0.06, 0.06, 0.25, Hb, skip=('-z',))
    K.map_faces(bm, post.values(), R('WOOD_BOARD'), rotate=True)
    for sgn in (-1, 1):
        bx = [0.06 + 0.1725 * i for i in range(10)] + [L]   # one face per board, grain per board
        g = K.grid_plane(bm, lambda u, z, s=sgn: (u, s * 0.02, z), bx, [0.25, Hb], (0, sgn, 0))
        K.map_faces(bm, g.values(), R('WOOD_BOARD'), rotate=True)
    for z in (0.3, Hb - 0.08):   # rails
        r_ = K.box(bm, 0.06, L, -0.035, 0.035, z, z + 0.07, skip=('-x', '+x'))
        K.map_faces(bm, r_.values(), R('WOOD_BOARD'))
    if lod == 0:
        for x in [0.06 + 0.3 * i for i in range(1, 6)]:   # battens on the street side
            b = K.box(bm, x - 0.02, x + 0.02, -0.035, -0.02, 0.37, Hb - 0.08, skip=('+y',))
            K.map_faces(bm, b.values(), R('WOOD_BOARD'), rotate=True)
    # small gable roof with tile rows down both slopes
    z0, zr, w = Hb, Hb + 0.2, 0.32
    roof = [(-w, z0 - 0.01), (-w, z0 + 0.04), (0, zr + 0.05), (w, z0 + 0.04), (w, z0 - 0.01), (0, zr - 0.04)]
    sides, c0, c1 = K.poly_prism_x(bm, roof, 0.0, L)
    K.map_faces(bm, sides, R('TILE')); K.map_faces(bm, [c0, c1], R('TILE_DARK'))
    if lod == 0:
        from mathutils import Vector
        for sgn in (-1, 1):
            for i in range(9):
                x = 0.1 + i * 0.2
                st = Vector((x, sgn * (w + 0.02), z0 + 0.06)); en = Vector((x, sgn * 0.05, zr + 0.04))
                s_ = (en - st).normalized(); side = Vector((1, 0, 0)); up = s_.cross(side)
                if up.z < 0:
                    up = -up
                ring = lambda p: [bm.verts.new(p + side * (0.035 * math.cos(math.pi * k / 4)) + up * (0.035 * math.sin(math.pi * k / 4)))
                                  for k in range(5)]
                a, b = ring(st), ring(en)
                fs = [bm.faces.new([a[k], b[k], b[k + 1], a[k + 1]]) for k in range(4)]
                cap = bm.faces.new(a)
                for f in fs:   # outward = away from the row's axis
                    f.normal_update()
                    c = f.calc_center_median(); axis_pt = st + s_ * (c - st).dot(s_)
                    if f.normal.dot(c - axis_pt) < 0:
                        f.normal_flip()
                cap.normal_update()
                if cap.normal.dot(s_) > 0:
                    cap.normal_flip()
                K.map_faces(bm, fs + [cap], R('TILE_DARK')); K.nobevel(bm, fs + [cap])
        ridge, _, _ = K.tube_path(bm, [(0, 0, zr + 0.06), (L, 0, zr + 0.06)], 0.05, 6)
        K.map_faces(bm, ridge, R('TILE_DARK')); K.nobevel(bm, ridge)


BUILDERS = {'BlockWall_2m': (_block_wall, 2.0, 1.26), 'BlockWall_Pillar': (_pillar, 0.0, 1.36),
            'Bamboo_1.8m': (_bamboo, 1.8, 1.9), 'Board_1.8m': (_board, 1.8, 2.15)}


def build_variant(variant, lods=(0, 1)):
    fn, L, Hh = BUILDERS[variant]
    name = f'{NAME}_{variant}'.replace('.', '_')
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = []
    for lod in lods:
        bm = K.new_bm()
        fn(bm, lambda n: A.region(ATLAS, n), lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.008 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    K.collider_box(f'COL_{name}', col, min(0, L) - 0.1 * (L == 0), max(L, 0.1), -0.12, 0.12, 0, Hh)
    return col, objs


def build():
    return [build_variant(v) for v in BUILDERS]


def preview(results, views):
    """Runs: block wall 3 modules with pillars, bamboo 3, board 3 - side by side."""
    from kit import preview as P
    by = {c.name: (c, o) for c, o in results}
    tmp = K.collection('Fence_PreviewRun')
    obs = []
    def put(key, x, y=0.0):
        o = by[key][1][0].copy(); o.location = (x, y, 0); tmp.objects.link(o); obs.append(o)
    for i in range(3):
        put('Fence_BlockWall_2m', -7.0 + i * 2.0)
    put('Fence_BlockWall_Pillar', -7.1); put('Fence_BlockWall_Pillar', -0.9)
    for i in range(3):
        put('Fence_Bamboo_1_8m', 0.5 + i * 1.8)
    for i in range(3):
        put('Fence_Board_1_8m', 6.5 + i * 1.8)
    for o in obs:
        o.hide_set(False); o.hide_render = False
    a = P.render(obs, NAME, [v for v in views if v[2] != 'clay'], size=(960, 480), show=[tmp.name])
    b = P.render(obs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(960, 480), show=[tmp.name])
    for o in obs:
        K.bpy.data.objects.remove(o)
    return f'{a}, {b}'
