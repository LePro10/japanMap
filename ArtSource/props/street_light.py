"""Street lights.

Road: tapered galvanised pole 8 m on a concrete collar, thicker foot with an
access hatch, curved arm (1.6 m outreach) and a slim LED luminaire facing
the road (-Y). 'Road2': twin arms for a median.
Shotengai: 4.5 m dark-painted pole of a shopping street - moulded foot,
two lantern heads on a cross bracket, banner arms with a cloth banner
(fictional street 'Sakura-dōri').
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'StreetLight'
ATLAS = 'Street'


def _luminaire(bm, R, end, d, lod):
    """Slim LED head at the arm end, pointing along d (horizontal)."""
    d = Vector(d).normalized(); side = Vector((-d.y, d.x, 0))
    L, W, T = 0.72, 0.30, 0.09
    c = Vector(end) + d * (L / 2 - 0.05)
    corners = [c + d * u * L / 2 + side * v * W / 2 for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    lo = [bm.verts.new((p.x, p.y, end[2] - T / 2)) for p in corners]
    # top tapers towards the tip: a low wedge reads as a modern LED head
    hi = [bm.verts.new((p.x, p.y, end[2] + T / 2 - (0.04 if i in (1, 2) else 0))) for i, p in enumerate(corners)]
    faces = [bm.faces.new([lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]]) for i in range(4)]
    top = bm.faces.new(hi); bot = bm.faces.new(lo[::-1])
    for f in faces + [top, bot]:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - c) < 0:
            f.normal_flip()
    K.map_faces(bm, faces + [top], R('PAINT_GREY'))
    if lod == 0:
        led, walls = K.recess(bm, bot, 0.035, 0.01)
        K.map_faces(bm, walls, R('PAINT_DARK')); K.map_faces(bm, [led], R('LED_COOL'))
    else:
        K.map_faces(bm, [bot], R('LED_COOL'))
    return c + Vector((0, 0, -0.25))


def _road(bm, R, lod, twin):
    n = 12 if lod == 0 else 8
    galv = R('GALV')
    collar = K.prism(bm, 8, 0.28, 0.26, 0.0, 0.12, cap_bottom=False)
    K.map_faces(bm, collar['sides'] + [collar['top']], R('CONCRETE_CAP'))
    foot = K.lathe(bm, n, [(0.13, 0.12), (0.13, 1.1), (0.095, 1.2)], cap_bottom=False, cap_top=False)
    K.map_cyl(bm, foot['sides'], galv, rotate=True)
    if lod == 0:  # access hatch on the back
        f = max(foot['sides'], key=lambda f: f.calc_center_median().y if 0.3 < f.calc_center_median().z < 1.0 else -9)
        fl, walls = K.recess(bm, f, 0.02, -0.006)
        K.map_faces(bm, [fl] + walls, galv, rotate=True)
        for a in range(4):   # anchor bolts
            ang = math.pi / 4 + a * math.pi / 2
            b = K.prism(bm, 6, 0.022, 0.022, 0.12, 0.17, cx=0.2 * math.cos(ang), cy=0.2 * math.sin(ang), cap_bottom=False)
            K.map_faces(bm, b['sides'] + [b['top']], R('STEEL')); K.nobevel(bm, b['sides'] + [b['top']])
    shaft = K.lathe(bm, n, [(0.095, 1.2), (0.06, 7.8), (0.0, 7.86)], cap_bottom=False)
    K.map_cyl(bm, shaft['sides'], galv, rotate=True)
    lights = []
    for d in ((0, -1), (0, 1)) if twin else ((0, -1),):
        dx, dy = d
        pts = [(0, 0, 7.2), (dx * 0.25, dy * 0.25, 7.75), (dx * 0.8, dy * 0.8, 8.0), (dx * 1.6, dy * 1.6, 8.08)]
        sd, _, _ = K.tube_path(bm, pts, 0.045, 8 if lod == 0 else 6, reg=galv)
        lights.append(_luminaire(bm, R, pts[-1], (dx, dy, 0), lod))
    return lights


def _shotengai(bm, R, lod):
    n = 12 if lod == 0 else 8
    paint = R('PAINT_DARK')
    base = K.lathe(bm, n, [(0.20, 0.0), (0.20, 0.10), (0.16, 0.14), (0.15, 0.40), (0.12, 0.46), (0.10, 0.50),
                           (0.07, 0.62)], cap_bottom=False, cap_top=False)
    K.map_faces(bm, base['sides'], paint)
    shaft = K.lathe(bm, n, [(0.07, 0.62), (0.055, 4.2), (0.08, 4.25), (0.08, 4.32), (0.0, 4.36)], cap_bottom=False)
    K.map_faces(bm, shaft['sides'], paint)
    # cross bracket + two lantern heads
    sd, _, _ = K.tube_path(bm, [(-0.55, 0, 4.15), (0, 0, 4.28), (0.55, 0, 4.15)], 0.025, 6)
    K.map_faces(bm, sd, paint)
    lights = []
    for x in (-0.55, 0.55):
        hang, _, _ = K.tube_path(bm, [(x, 0, 4.15), (x, 0, 4.02)], 0.012, 6)
        K.map_faces(bm, hang, paint)
        roof = K.lathe(bm, 6, [(0.17, 3.98), (0.17, 4.0), (0.05, 4.06), (0.0, 4.08)], cx=x, cy=0)
        K.map_faces(bm, roof['sides'] + [roof['bottom']], paint)
        glass = K.prism(bm, 6, 0.10, 0.13, 3.68, 3.98, cx=x, cy=0, cap_top=False)
        K.map_faces(bm, glass['sides'], R('LAMP_WARM'))
        K.map_faces(bm, [glass['bottom']], paint)
        if lod == 0:   # frame posts at the hex corners
            for k in range(6):
                a = 2 * math.pi * k / 6
                p0 = Vector((x + 0.105 * math.cos(a), 0.105 * math.sin(a), 3.68))
                p1 = Vector((x + 0.135 * math.cos(a), 0.135 * math.sin(a), 3.98))
                fp, _, _ = K.tube_path(bm, [p0, p1], 0.008, 4)
                K.map_faces(bm, fp, paint); K.nobevel(bm, fp)
        lights.append(Vector((x, 0, 3.83)))
    # banner arms + cloth
    for z in (2.35, 3.45):
        sd, _, c1 = K.tube_path(bm, [(0, -0.05, z), (0, -0.62, z)], 0.015, 6, cap1=True)
        K.map_faces(bm, sd + [c1], paint)
    ban = K.box(bm, -0.012, 0.012, -0.58, -0.12, 2.40, 3.42)
    K.map_faces(bm, [ban['+x'], ban['-x']], R('BANNER'))
    K.map_faces(bm, [ban[k] for k in ('-y', '+y', '+z', '-z')], R('BANNER'))
    return lights


VARIANTS = ('Road', 'Road2', 'Shotengai')


def build_variant(variant, lods=(0, 1)):
    name = f'{NAME}_{variant}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    lights = []
    objs = []
    for lod in lods:
        bm = K.new_bm()
        R = lambda n: A.region(ATLAS, n)
        pts = _shotengai(bm, R, lod) if variant == 'Shotengai' else _road(bm, R, lod, variant == 'Road2')
        lights = lights or pts
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.006 if lod == 0 else 0.0,
                                  hidden=lod > 0))
    K.collider_box(f'COL_{name}', col, -0.2, 0.2, -0.2, 0.2, 0, 4.4 if variant == 'Shotengai' else 7.9)
    for i, p in enumerate(lights):
        warm = variant == 'Shotengai'
        K.light_marker(f'LIGHT_{name}_{i}', col, tuple(p), color=(1.0, 0.75, 0.45) if warm else (0.9, 0.95, 1.0),
                       watts=30 if warm else 120, unity_range=8.0 if warm else 18.0)
    return col, objs


def build():
    return [build_variant(v) for v in VARIANTS]


def preview(results, views):
    from kit import preview as P
    xs = {f'{NAME}_Road': -3.0, f'{NAME}_Road2': 0.0, f'{NAME}_Shotengai': 3.0}
    for col, _ in results:
        for o in col.objects:
            o.location.x += xs[col.name]
    objs = [o[0] for _, o in results]
    show = [c.name for c, _ in results]
    a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(640, 640), show=show)
    b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(640, 640), show=show)
    for col, _ in results:
        for o in col.objects:
            o.location.x -= xs[col.name]
    return f'{a}, {b}'
