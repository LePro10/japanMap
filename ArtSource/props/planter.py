"""Planters and potted plants (Nature atlas). Front is -Y.

Concrete: precast street planter 1.2 x 0.5 m with a clipped boxwood hedge.
Round: FRP bowl planter with a flowering azalea mound.
PotGroup: the potted garden in front of an old Tokyo house (roji): terracotta
  and glazed pots, a styrofoam box with herbs, a green plastic trough, a
  small tree in a tall pot - placed against a wall, 1.5 m long.
"""
import math
from kit import core as K, atlas as A, organic as O

KLASS = 'props'
NAME = 'Planter'
ATLAS = 'Nature'


def R(n):
    return A.region(ATLAS, n)


def _pot(bm, x, y, r_bot, r_top, h, reg, lod, rim=0.015):
    """Round pot with a rolled rim and soil a little below the rim."""
    n = 16 if lod == 0 else 8
    prof = [(r_bot, 0.0), (r_top, h), (r_top + rim, h), (r_top + rim, h + 0.02), (r_top - 0.01, h + 0.02),
            (r_top - 0.012, h - 0.03), (0.0, h - 0.03)]
    p = K.lathe(bm, n, prof, cx=x, cy=y, cap_bottom=False)
    K.map_faces(bm, p['sides'][:-n], R(reg))
    K.map_faces(bm, p['sides'][-n:], R('SOIL_FLAT'))
    return h - 0.03


def _plant(bm, c, size, seed, lod, reg='LEAVES', lumps=3):
    big = max(size) > 0.5         # small plants: 80-tri lumps are plenty (prop budget)
    fs = O.shrub(bm, c, size, seed, subdiv=(3 if big else 2) if lod == 0 else 2, lumps=lumps if lod == 0 else 1,
                 floor=c[2])
    K.map_box(bm, fs, R(reg)); K.nobevel(bm, fs)
    return fs


def _concrete(bm, lod):
    L, D, H = 1.2, 0.5, 0.45
    b = K.box(bm, -L / 2, L / 2, -D / 2, D / 2, 0.0, H, skip=('-z',))
    K.map_faces(bm, [b[k] for k in b if k != '+z'], R('CONCRETE'), z0=0.0)
    fl, walls = K.recess(bm, b['+z'], 0.05, 0.06)
    K.map_faces(bm, walls, R('CONCRETE'))
    K.map_faces(bm, [fl], R('SOIL'))
    if lod == 0:   # chamfered foot line: a darker plinth band
        pl = K.box(bm, -L / 2 - 0.01, L / 2 + 0.01, -D / 2 - 0.01, D / 2 + 0.01, 0.0, 0.05, skip=('-z', '+z'))
        K.map_faces(bm, pl.values(), R('CONCRETE'), z0=0.0)
    # clipped hedge: low noise, planed top
    fs = O.lump(bm, (0, 0, H + 0.17), (L - 0.04, D - 0.02, 0.5), 7, 3 if lod == 0 else 2, amp=0.08, freq=2.5,
                detail=0.05, floor=H - 0.06, flat_top=0.55)
    K.map_box(bm, fs, R('LEAVES')); K.nobevel(bm, fs)


def _round(bm, lod):
    n = 20 if lod == 0 else 10
    prof = [(0.28, 0.0), (0.4, 0.4), (0.44, 0.42), (0.44, 0.47), (0.39, 0.47), (0.37, 0.4), (0.0, 0.4)]
    p = K.lathe(bm, n, prof, cap_bottom=False)
    K.map_faces(bm, p['sides'][:-n], R('FRP_GREY'))
    K.map_faces(bm, p['sides'][-n:], R('SOIL_FLAT'))
    _plant(bm, (0, 0, 0.38), (0.92, 0.92, 0.6), 19, lod, 'LEAVES_BLOOM', lumps=4)


def _pot_group(bm, lod):
    # tall pot with a small tree (against the wall, back left)
    z = _pot(bm, -0.55, 0.08, 0.11, 0.15, 0.42, 'GLAZE_BROWN', lod)
    st, _, _ = K.tube_path(bm, [(-0.55, 0.08, z), (-0.53, 0.07, z + 0.35), (-0.56, 0.08, z + 0.6)], 0.018, 6)
    K.map_faces(bm, st, R('STEM'))
    _plant(bm, (-0.55, 0.08, z + 0.42), (0.5, 0.45, 0.45), 3, lod, lumps=3)
    # glazed blue pot with a flowering shrub
    z = _pot(bm, -0.18, 0.0, 0.14, 0.2, 0.3, 'GLAZE_BLUE', lod)
    _plant(bm, (-0.18, 0.0, z), (0.46, 0.46, 0.4), 5, lod, 'LEAVES_BLOOM')
    # styrofoam box with herbs (a classic: vegetables grown in fish boxes)
    b = K.box(bm, 0.12, 0.6, -0.12, 0.16, 0.0, 0.2, skip=('-z',))
    K.map_faces(bm, [b[k] for k in b if k != '+z'], R('STYRO'))
    fl, walls = K.recess(bm, b['+z'], 0.02, 0.03)
    K.map_faces(bm, walls, R('STYRO')); K.map_faces(bm, [fl], R('SOIL'))
    for i, x in enumerate((0.22, 0.36, 0.5)):
        _plant(bm, (x, 0.02, 0.17), (0.16, 0.2, 0.18), 11 + i, lod, lumps=2)
    # small terracotta pots in front
    for i, (x, y, r) in enumerate(((-0.35, -0.24, 0.11), (0.0, -0.26, 0.09), (0.32, -0.3, 0.12))):
        z = _pot(bm, x, y, r * 0.75, r, r * 1.6, 'TERRACOTTA', lod)
        _plant(bm, (x, y, z), (r * 2.2, r * 2.2, r * 2.0), 23 + i, lod, lumps=2)
    # green plastic trough at the right end
    t = K.box(bm, 0.68, 0.75 + 0.0, -0.2, 0.2, 0.0, 0.16, skip=('-z',))
    K.map_faces(bm, [t[k] for k in t if k != '+z'], R('PLASTIC_GREEN'))
    fl, walls = K.recess(bm, t['+z'], 0.01, 0.02)
    K.map_faces(bm, walls, R('PLASTIC_GREEN')); K.map_faces(bm, [fl], R('SOIL'))
    _plant(bm, (0.715, 0.0, 0.14), (0.14, 0.42, 0.22), 31, lod, lumps=3)


VARIANTS = {'Concrete': (_concrete, (0.6, 0.25, 0.9)), 'Round': (_round, (0.44, 0.44, 0.95)),
            'PotGroup': (_pot_group, (0.8, 0.35, 1.1))}


def build_variant(key, lods=(0, 1)):
    fn, (w, d, h) = VARIANTS[key]
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = []
    for lod in lods:
        bm = K.new_bm()
        fn(bm, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.006 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    K.collider_box(f'COL_{name}', col, -w, w, -d, d, 0.0, min(h, 0.5))
    return col, objs


def build():
    return [build_variant(k) for k in VARIANTS]


def preview(results, views):
    from kit import preview as P
    xs = {'Planter_Concrete': -2.0, 'Planter_Round': -0.3, 'Planter_PotGroup': 1.4}
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
