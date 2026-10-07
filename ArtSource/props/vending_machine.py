"""Japanese drink vending machine (jidōhanbaiki), 1.83 × 1.0 × 0.75 m.

Cabinet + front door. Door, top to bottom: lit display window behind glass
(3 shelves of dummy drinks, price tags, buttons) - brand panel with a stripe
and the control column (LED, coin/bill slots, card reader) - product outlet
flap and coin return. Colour variants only swap the cabinet swatch.
"""
import bmesh
from kit import core as K, atlas as A
from kit import preview as P

KLASS = 'props'
NAME = 'VendingMachine'
ATLAS = 'Props'
VARIANTS = {'Red': 'VEND_RED', 'Blue': 'VEND_BLUE', 'White': 'VEND_WHITE'}
W, D, H = 1.0, 0.75, 1.83
YF = -D / 2          # door front plane


def _geo(lod, variant):
    bm = bmesh.new()
    R = lambda n: A.region(ATLAS, n)
    body, black, grey, white = R(VARIANTS[variant]), R('PLASTIC_BLACK'), R('PLASTIC_GREY'), R('VEND_WHITE')
    zr = (0, H)
    # plinth and cabinet (front covered by the door)
    f = K.box(bm, -0.48, 0.48, YF + 0.05, D / 2 - 0.02, 0, 0.07, skip=('-z',))
    K.map_faces(bm, f.values(), black)
    f = K.box(bm, -W / 2, W / 2, YF + 0.07, D / 2, 0.07, H, skip=('-z', '-y'))
    K.map_faces(bm, f.values(), body, zrange=zr)
    if lod == 0:   # side panels: shallow inset reads as a sheet-metal seam
        for k in ('-x', '+x'):
            fl, walls = K.recess(bm, f[k], 0.05, 0.006)
            K.map_faces(bm, [fl] + walls, body, zrange=zr)
    # door: shell + gridded front
    f = K.box(bm, -0.49, 0.49, YF, YF + 0.07, 0.08, H - 0.02, skip=('-y', '+y'))
    K.map_faces(bm, f.values(), body, zrange=zr)
    xs = [-0.49, -0.44, 0.17, 0.21, 0.44, 0.49]
    zs = [0.08, 0.13, 0.35, 0.42, 0.98, 1.03, 1.74, H - 0.02]
    g = K.grid_front(bm, xs, zs, YF)
    K.map_faces(bm, g.values(), body, zrange=zr)
    # display window: one recess over three cells, display graphic on its floor, glass in front
    win = K.merge(bm, [g[i, 5] for i in (1, 2, 3)])
    floor, walls = K.recess(bm, win, 0.0, 0.08)
    K.map_faces(bm, [floor], R('DISPLAY'))
    K.map_faces(bm, walls, white)
    gl = K.grid_front(bm, [-0.44, 0.44], [1.03, 1.74], YF + 0.012)
    for face in gl.values():
        face.material_index = 1
        K.map_faces(bm, [face], white)
    # control column sticks out a little
    cap, sides = K.extrude(bm, g[3, 3], 0.025)
    K.map_faces(bm, [cap], R('CONTROL'))
    K.map_faces(bm, sides, grey)
    # brand panel: white stripe band
    if lod == 0:
        s = K.box(bm, -0.44, 0.17, YF - 0.006, YF, 0.60, 0.68, skip=('+y',))
        K.map_faces(bm, s.values(), white)
    # product outlet: dark slot with a grey push flap
    floor, walls = K.recess(bm, g[1, 1], 0.0, 0.035)
    K.map_faces(bm, [floor], grey); K.map_faces(bm, walls, black)
    if lod == 0:   # coin return cup
        floor, walls = K.recess(bm, g[3, 1], 0.06, 0.04)
        K.map_faces(bm, [floor] + walls, R('INTERIOR'))
    # top: rain lip over the door
    lip = K.box(bm, -0.5, 0.5, YF - 0.03, YF + 0.07, H - 0.02, H, skip=('-z',) if lod else ())
    K.map_faces(bm, lip.values(), body, zrange=zr)
    return bm


def build_variant(variant, lods=(0, 1)):
    name = f'{NAME}_{variant}'
    col = K.collection(name)
    mats = [K.atlas_material(ATLAS), K.glass_material()]
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', _geo(lod, variant), col, mats, bevel=0.008 if lod == 0 else 0.0,
                          hidden=lod > 0) for lod in lods]
    K.collider_box(f'COL_{name}', col, -W / 2, W / 2, YF, D / 2, 0, H)
    K.light_marker(f'LIGHT_{name}', col, (0, YF - 0.15, 1.4), color=(0.92, 0.96, 1.0), watts=40,
                   unity_range=4.0)
    return col, objs


def build():
    return [build_variant(v) for v in VARIANTS]


def preview(results, views):
    """Mood: the three variants in a row (moved after export); neutral: the red one."""
    for i, (col, _) in enumerate(results):
        for o in col.objects:
            o.location.x = (i - 1) * 1.15
    lod0 = [objs[0] for _, objs in results]
    a = P.render(lod0, NAME + '_variants', views[:1], size=(960, 640), show=[c.name for c, _ in results])
    for i, (col, _) in enumerate(results):
        for o in col.objects:
            o.location.x = 0.0
    b = P.render(lod0[:1], NAME, views[1:], show=[results[0][0].name])
    return f'{a}, {b}'
