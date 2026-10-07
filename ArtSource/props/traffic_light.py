"""Japanese traffic signals.

Arm: grey pole 5.6 m with an arm over the road (+X, 4 m) and a tie rod;
horizontal LED signal (blue-green | yellow | red, left to right) hung under
the arm end, looking at the oncoming traffic (-Y), round hoods; pedestrian
signal on the pole (standing red / walking blue-green figures) looking across
the road (+X); yellow push-button box.
Ped: 3 m pole with only the pedestrian signal and button.

Lit lenses are separate small meshes LENS_<Car|Ped>_<Colour>: the housing
shows an unlit lens behind each, so Unity switches a light by enabling or
disabling that renderer. The previews show car green and pedestrian red.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'TrafficLight'
ATLAS = 'Street'


def _disc(bm, c, axis, r, n=16):
    """Flat disc facing along axis."""
    axis = Vector(axis).normalized()
    a = axis.cross(Vector((0, 0, 1)))
    if a.length < 1e-6:
        a = Vector((1, 0, 0))
    a.normalize(); b = axis.cross(a).normalized()
    f = bm.faces.new([bm.verts.new(Vector(c) + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * r)
                      for k in range(n)])
    f.normal_update()
    if f.normal.dot(axis) < 0:
        f.normal_flip()
    return f


def _hood(bm, R, c, axis, r, length, n, reg):
    """Short round hood, open at the front, seen from both sides."""
    c = Vector(c); axis = Vector(axis).normalized()
    out, _, _ = K.tube_path(bm, [c, c + axis * length], r + 0.012, n)
    inn, _, _ = K.tube_path(bm, [c, c + axis * length], r, n)
    for f in inn:
        f.normal_flip()
    # front rim
    a = axis.cross(Vector((0, 0, 1))).normalized() if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    b = axis.cross(a).normalized()
    p = c + axis * length
    ro = [bm.verts.new(p + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * (r + 0.012)) for k in range(n)]
    ri = [bm.verts.new(p + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * r) for k in range(n)]
    rim = []
    for k in range(n):
        f = bm.faces.new([ro[k], ro[(k + 1) % n], ri[(k + 1) % n], ri[k]])
        f.normal_update()
        if f.normal.dot(axis) < 0:
            f.normal_flip()
        rim.append(f)
    K.map_faces(bm, out + inn + rim, reg); K.nobevel(bm, out + inn + rim)


def _car_signal(bm, R, cx, cz, lod, lenses):
    W, D, Hh = 1.25, 0.16, 0.42
    hb = K.box(bm, cx - W / 2, cx + W / 2, -D / 2, D / 2, cz - Hh / 2, cz + Hh / 2)
    K.map_faces(bm, hb.values(), R('PAINT_GREY'))
    for i, colour in enumerate(('Green', 'Yellow', 'Red')):
        x = cx + (i - 1) * 0.40
        c = Vector((x, -D / 2 - 0.002, cz))
        K.map_faces(bm, [_disc(bm, c, (0, -1, 0), 0.15, 16 if lod == 0 else 8)], R('LENS_OFF'))
        if lod == 0:
            _hood(bm, R, (x, -D / 2, cz), (0, -1, 0), 0.155, 0.07, 16, R('PAINT_GREY'))
        lenses.append((f'Car_{colour}', c + Vector((0, -0.004, 0)), (0, -1, 0), 0.15, f'LENS_{colour.upper()}'))
    # hangers to the arm
    for dx in (-0.35, 0.35):
        sd, _, _ = K.tube_path(bm, [(cx + dx, 0, cz + Hh / 2), (cx + dx, 0, cz + Hh / 2 + 0.34)], 0.02, 6)
        K.map_faces(bm, sd, R('PAINT_GREY'))


def _ped_signal(bm, R, x0, cz, lod, lenses):
    """Box beside the pole, face looking +X."""
    W, D, Hh = 0.34, 0.18, 0.70
    xb = x0 + D
    hb = K.box(bm, x0, xb, -W / 2, W / 2, cz - Hh / 2, cz + Hh / 2)
    K.map_faces(bm, hb.values(), R('PAINT_GREY'))
    for colour, dz in (('Red', 0.17), ('Green', -0.17)):
        z = cz + dz
        pf = K.grid_plane(bm, lambda u, zz: (xb + 0.002, u, zz), [-0.13, 0.13], [z - 0.13, z + 0.13], (1, 0, 0))
        K.map_faces(bm, pf.values(), R('LENS_OFF'))
        if lod == 0:   # visor over each panel
            v = K.box(bm, xb, xb + 0.09, -0.15, 0.15, z + 0.13, z + 0.145)
            K.map_faces(bm, v.values(), R('PAINT_GREY'))
        lenses.append((f'Ped_{colour}', Vector((xb + 0.006, 0, z)), (1, 0, 0), 0.13, f'PED_{colour.upper()}'))
    br = K.box(bm, 0.0, x0, -0.04, 0.04, cz - 0.05, cz + 0.05)
    K.map_faces(bm, br.values(), R('PAINT_GREY'))


def _button(bm, R, lod):
    b = K.box(bm, -0.06, 0.06, -0.19, -0.1, 1.1, 1.3)
    K.map_faces(bm, b.values(), R('YELLOW'))
    if lod == 0:
        K.map_faces(bm, [_disc(bm, (0, -0.192, 1.17), (0, -1, 0), 0.025, 10)], R('PAINT_WHITE'))
        st = K.box(bm, -0.04, 0.04, -0.194, -0.19, 1.22, 1.28, skip=('+y',))
        K.map_faces(bm, st.values(), R('PAINT_DARK'))
    br = K.box(bm, -0.03, 0.03, -0.1, -0.06, 1.15, 1.25)
    K.map_faces(bm, br.values(), R('PAINT_GREY'))


def _geo(lod, variant, lenses):
    bm = K.new_bm()
    R = lambda n: A.region(ATLAS, n)
    n = 12 if lod == 0 else 8
    top = 5.6 if variant == 'Arm' else 3.0
    col = K.prism(bm, 8, 0.22, 0.2, -0.02, 0.08, cap_bottom=False)
    K.map_faces(bm, col['sides'] + [col['top']], R('CONCRETE_CAP'))
    pole = K.lathe(bm, n, [(0.11, 0.08), (0.11 - 0.035 * top / 5.6, top), (0.0, top + 0.05)], cap_bottom=False)
    K.map_faces(bm, pole['sides'], R('PAINT_GREY'))
    if variant == 'Arm':
        arm, _, c1 = K.tube_path(bm, [(0, 0, 5.25), (2.0, 0, 5.33), (4.1, 0, 5.4)], 0.055, n, cap1=True)
        K.map_faces(bm, arm + [c1], R('PAINT_GREY'))
        tie, _, _ = K.tube_path(bm, [(0, 0, 5.55), (2.2, 0, 5.36)], 0.015, 6)
        K.map_faces(bm, tie, R('PAINT_GREY')); K.nobevel(bm, tie)
        _car_signal(bm, R, 3.55, 4.84, lod, lenses)
    _ped_signal(bm, R, 0.12, 2.7, lod, lenses)
    _button(bm, R, lod)
    return bm


VARIANTS = ('Arm', 'Ped')


def build_variant(variant, lods=(0, 1)):
    name = f'{NAME}_{variant}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs, lenses = [], []
    for lod in lods:
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', _geo(lod, variant, lenses if lod == 0 else []), col, [mat],
                                  bevel=0.006 if lod == 0 else 0.0, hidden=lod > 0))
    for key, c, axis, r, reg in lenses:      # one renderer per lamp, switched by Unity
        bm = K.new_bm()
        R = lambda n: A.region(ATLAS, n)
        if key.startswith('Car'):
            f = _disc(bm, c, axis, r, 16)
        else:
            f = K.grid_plane(bm, lambda u, zz: (c.x, u, zz), [-r, r], [c.z - r, c.z + r], (1, 0, 0))[0, 0]
        K.map_faces(bm, [f], R(reg))
        K.mesh_object(f'LENS_{key}_{variant}', bm, col, [mat], recalc=False)   # lone face: keep its built facing
    K.collider_box(f'COL_{name}', col, -0.12, 0.12, -0.12, 0.12, 0, 5.6 if variant == 'Arm' else 3.0)
    return col, objs


def build():
    return [build_variant(v) for v in VARIANTS]


def preview(results, views):
    from kit import preview as P
    for col, _ in results:     # state for the picture: cars green, pedestrians red
        for o in col.objects:
            if o.name.startswith('LENS_'):
                o.hide_render = not any(k in o.name for k in ('Car_Green', 'Ped_Red'))
    for o in results[1][0].objects:
        o.location.x -= 2.5
    objs = [o[0] for _, o in results]
    show = [c.name for c, _ in results]
    a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(640, 640), show=show)
    b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(640, 640), show=show)
    for o in results[1][0].objects:
        o.location.x += 2.5
    for col, _ in results:
        for o in col.objects:
            if o.name.startswith('LENS_'):
                o.hide_render = False
    return f'{a}, {b}'
