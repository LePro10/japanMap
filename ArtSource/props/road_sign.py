"""Japanese road signs on a galvanised post (Ø 60.5 mm).

Each plate is cut to the outline of its graphic (kit/graphics.mjs) and the
front is UV-mapped through the same pixel coordinates, so the printed shape
and the plate edge match exactly. Back and rim: grey aluminium. Two clamp
bands hold each plate. The face looks to -Y (towards the traffic).
Sizes: stop triangle 0.8 m side, round signs Ø 0.6 m, warning diamond
0.45 m side, square 0.6 m, one-way 0.6 × 0.3 m.
"""
import math
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'RoadSign'
ATLAS = 'Street'
PR = 0.0303


def _circle(cx, cy, r, n=24):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy - r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def _rounded(w, h, r, n=3):
    pts = []
    for cx, cy, a0 in ((w - r, r, -90), (w - r, h - r, 0), (r, h - r, 90), (r, r, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# outline in graphic pixels (SVG coordinates, y down), graphic size, metres per pixel
SIGNS = {
    'STOP':       ([(6, 14), (122, 14), (64, 118)], (128, 128), 0.80 / 116),
    'SPEED40':    (_circle(64, 64, 62), (128, 128), 0.30 / 62),
    'NO_PARKING': (_circle(64, 64, 62), (128, 128), 0.30 / 62),
    'CROSSWALK':  (_rounded(128, 128, 8), (128, 128), 0.60 / 128),
    'CURVE':      ([(64, 2), (126, 64), (64, 126), (2, 64)], (128, 128), 0.64 / 124),
    'ONE_WAY':    (_rounded(256, 128, 8), (256, 128), 0.60 / 256),
}


def plate(bm, R, key, x, zc, y=-0.05, t=0.02):
    """Sign plate centred at (x, zc); returns (top z, bottom z)."""
    pts, (W, Hh), s = SIGNS[key]
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    if key == 'STOP':
        cx, cy = 64, 50   # centre of the bounding box, not of the triangle's mass
    xy = [((px - cx) * s + x, zc - (py - cy) * s) for px, py in pts]
    front = [bm.verts.new((u, y - t, z)) for u, z in xy]
    back = [bm.verts.new((u, y, z)) for u, z in xy]
    ff = bm.faces.new(front); bf = bm.faces.new(back[::-1])
    for f, want in ((ff, -1), (bf, 1)):
        f.normal_update()
        if f.normal.y * want < 0:
            f.normal_flip()
    n = len(pts)
    rim = [bm.faces.new([front[i], front[(i + 1) % n], back[(i + 1) % n], back[i]]) for i in range(n)]
    for f in rim:
        f.normal_update()
        c = f.calc_center_median()
        if (c.x - x) * f.normal.x + (c.z - zc) * f.normal.z < 0:
            f.normal_flip()
    uv = bm.loops.layers.uv.verify()
    u0, v0, u1, v1 = A.region(ATLAS, key)['uv']
    for l in ff.loops:
        i = front.index(l.vert)
        px, py = pts[i]
        l[uv].uv = (u0 + px / W * (u1 - u0), v0 + (1 - py / Hh) * (v1 - v0))
    K.map_faces(bm, [bf] + rim, R('SIGN_BACK'))
    zs = [z for _, z in xy]
    return max(zs), min(zs)


def _post(bm, R, top, lod):
    p = K.lathe(bm, 12 if lod == 0 else 6, [(PR, 0.0), (PR, top), (PR * 0.6, top + 0.015), (0, top + 0.02)],
                cap_bottom=False)
    K.map_cyl(bm, p['sides'], R('GALV'), rotate=True, seam=math.pi / 2) if lod == 0 else K.map_faces(bm, p['sides'], R('STEEL'))
    if lod == 0:
        col = K.prism(bm, 8, 0.09, 0.08, -0.02, 0.05, cap_bottom=False)
        K.map_faces(bm, col['sides'] + [col['top']], R('CONCRETE_CAP'))


def _clamps(bm, R, z_top, z_bot, lod):
    if lod:
        return
    for z in (z_bot + 0.08, z_top - 0.08):
        band = K.lathe(bm, 10, [(PR + 0.006, z - 0.02), (PR + 0.006, z + 0.02)], cap_bottom=False, cap_top=False)
        K.map_faces(bm, band['sides'], R('STEEL')); K.nobevel(bm, band['sides'])
        br = K.box(bm, -0.03, 0.03, -0.05, -PR, z - 0.02, z + 0.02, skip=('-y',))
        K.map_faces(bm, br.values(), R('STEEL'))


LAYOUT = {   # variant: [(sign, centre height)], post top
    'Stop':          ([('STOP', 2.45)], 2.9),
    'Speed40':       ([('SPEED40', 2.4)], 2.75),
    'NoParking':     ([('NO_PARKING', 2.4)], 2.75),
    'Crosswalk':     ([('CROSSWALK', 2.5)], 2.85),
    'Curve':         ([('CURVE', 2.4)], 2.8),
    'OneWay_Speed40': ([('SPEED40', 2.55), ('ONE_WAY', 2.0)], 2.9),
}


def build_variant(variant, lods=(0, 1)):
    name = f'{NAME}_{variant}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    signs, top = LAYOUT[variant]
    objs = []
    for lod in lods:
        bm = K.new_bm()
        R = lambda n: A.region(ATLAS, n)
        _post(bm, R, top, lod)
        for key, zc in signs:
            zt, zb = plate(bm, R, key, 0.0, zc)
            _clamps(bm, R, zt, zb, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.003 if lod == 0 else 0.0,
                                  hidden=lod > 0))
    K.collider_box(f'COL_{name}', col, -PR, PR, -PR, PR, 0, top)
    return col, objs


def build():
    return [build_variant(v) for v in LAYOUT]


def preview(results, views):
    from kit import preview as P
    for i, (col, _) in enumerate(results):
        for o in col.objects:
            o.location.x += i * 1.2
    objs = [o[0] for _, o in results]
    show = [c.name for c, _ in results]
    a = P.render(objs, NAME, [('front', (0.25, -1.0, 0.15), False), ('mood', (-0.6, -1.2, 0.25), True),
                              ('back', (-0.4, 1.0, 0.2), False)], size=(640, 480), show=show)
    b = P.render(objs, NAME + '_clay', [('clay', (0.25, -1.0, 0.15), 'clay')], size=(640, 480), show=show)
    for i, (col, _) in enumerate(results):
        for o in col.objects:
            o.location.x -= i * 1.2
    return f'{a}, {b}'
