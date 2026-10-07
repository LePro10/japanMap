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
    bm = K.new_bm()
    R = lambda n: A.region(ATLAS, n)
    body, black, grey, white = R(VARIANTS[variant]), R('PLASTIC_BLACK'), R('PLASTIC_GREY'), R('VEND_WHITE')
    steel, dark = R('STEEL'), R('INTERIOR')
    zr = (0, H)
    YB = D / 2           # back plane
    # plinth with levelling feet
    f = K.box(bm, -0.47, 0.47, YF + 0.05, YB - 0.03, 0.03, 0.07, skip=('-z',))
    K.map_faces(bm, f.values(), black)
    if lod == 0:
        for fx in (-0.42, 0.42):
            for fy in (YF + 0.1, YB - 0.08):
                ft = K.prism(bm, 6, 0.03, 0.025, 0.0, 0.03, cx=fx, cy=fy, cap_bottom=False, cap_top=False)
                K.map_faces(bm, ft['sides'], steel)
    # cabinet: top + gridded sides and back (panels, vents)
    f = K.box(bm, -W / 2, W / 2, YF + 0.07, YB, 0.07, H, skip=('-z', '-y', '-x', '+x', '+y'))
    K.map_faces(bm, f.values(), body, zrange=zr)
    zs_side = [0.07, 0.12, 0.42, 0.50, 1.70, H]
    for sx in (-1, 1):
        ys = [YF + 0.07, YF + 0.13, YB - 0.06, YB]
        g = K.grid_plane(bm, lambda u, z, sx=sx: (sx * W / 2, u, z), ys, zs_side, (sx, 0, 0))
        K.map_faces(bm, g.values(), body, zrange=zr)
        if lod == 0:
            fl, walls = K.recess(bm, g[1, 3], 0.0, 0.008)          # advert panel
            K.map_faces(bm, [fl], R('SIDE_AD') if sx > 0 else body, zrange=zr)
            K.map_faces(bm, walls, body, zrange=zr)
            fl, walls = K.recess(bm, g[1, 1], 0.0, 0.03)           # side vent
            K.map_faces(bm, [fl] + walls, dark)
            sl = K.slats(bm, lambda a, z, d, sx=sx: (sx * (W / 2 - 0.03 + d), a, z),
                         (YF + 0.15, YB - 0.08), [0.15 + i * 0.05 for i in range(5)], 0.028)
            K.map_faces(bm, sl, R('STEEL_DARK')); K.nobevel(bm, sl)
    xs_b = [-W / 2, -0.44, 0.44, W / 2]
    gb = K.grid_plane(bm, lambda u, z: (u, YB, z), xs_b, [0.07, 0.12, 0.40, 0.48, 1.62, H], (0, 1, 0))
    K.map_faces(bm, gb.values(), body, zrange=zr)
    if lod == 0:
        fl, walls = K.recess(bm, gb[1, 3], 0.0, 0.006)              # back panel
        K.map_faces(bm, [fl] + walls, body, zrange=zr)
        fl, walls = K.recess(bm, gb[1, 1], 0.0, 0.03)               # compressor vent
        K.map_faces(bm, [fl] + walls, dark)
        sl = K.slats(bm, lambda a, z, d: (a, YB - 0.03 + d, z), (-0.42, 0.42),
                     [0.14 + i * 0.04 for i in range(6)], 0.028)
        K.map_faces(bm, sl, R('STEEL_DARK')); K.nobevel(bm, sl)
        # rating plate, caution sticker, cable outlet + cable to the ground
        for (x0, x1, z0, z1, reg) in ((0.14, 0.34, 1.32, 1.44, 'RATING_PLATE'),
                                      (-0.30, -0.16, 1.40, 1.54, 'STICKER_CAUTION')):
            st = K.box(bm, x0, x1, YB, YB + 0.003, z0, z1, skip=('-y',))
            K.map_faces(bm, [st['+y']], R(reg)); K.map_faces(bm, [st[k] for k in st if k != '+y'], white)
        ob = K.box(bm, 0.28, 0.40, YB, YB + 0.05, 0.52, 0.62, skip=('-y',))
        K.map_faces(bm, ob.values(), black)
        cab = K.lathe(bm, 6, [(0.012, 0.0), (0.012, 0.56)], cx=0.34, cy=YB + 0.035, cap_bottom=False)
        K.map_faces(bm, cab['sides'], black); K.nobevel(bm, cab['sides'])
        for hx in (-0.3, 0.3):                                     # lifting eyes on the roof
            ey = K.box(bm, hx - 0.03, hx + 0.03, 0.0, 0.06, H, H + 0.025)
            K.map_faces(bm, ey.values(), steel)
    # door: shell + gridded front
    f = K.box(bm, -0.49, 0.49, YF, YF + 0.07, 0.08, H - 0.02, skip=('-y', '+y'))
    K.map_faces(bm, f.values(), body, zrange=zr)
    xs = [-0.49, -0.44, 0.17, 0.21, 0.44, 0.49]
    zs = [0.08, 0.13, 0.35, 0.42, 0.98, 1.03, 1.74, H - 0.02]
    g = K.grid_front(bm, xs, zs, YF)
    K.map_faces(bm, g.values(), body, zrange=zr)
    K.map_faces(bm, [g[i, 0] for i in range(5)], steel)            # kick plate
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
    if lod == 0:
        s_ = K.box(bm, -0.44, 0.17, YF - 0.006, YF, 0.60, 0.68, skip=('+y',))   # brand stripe
        K.map_faces(bm, s_.values(), white)
        st = K.box(bm, -0.40, -0.28, YF - 0.002, YF, 0.46, 0.56, skip=('+y',))  # notice sticker
        K.map_faces(bm, [st['-y']], R('STICKER_NOTICE'))
        K.map_faces(bm, [st[k] for k in st if k != '-y'], white)
        lk = K.lathe(bm, 8, [(0.018, 0.0), (0.018, 0.015)], cx=0.0, cy=0.0, cap_bottom=False)
        for v in {v for f_ in lk['sides'] + [lk['top']] for v in f_.verts}:   # lock: turn to face -Y
            x, y, z = v.co.x, v.co.y, v.co.z
            v.co = (0.465 + x, YF - z, 1.20 + y)
        K.map_faces(bm, lk['sides'] + [lk['top']], steel)
        hg = K.box(bm, -0.505, -0.49, YF + 0.01, YF + 0.05, 0.15, H - 0.08, skip=('+x',))  # hinge strip
        K.map_faces(bm, hg.values(), steel)
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
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', _geo(lod, variant), col, mats, bevel=0.012 if lod == 0 else 0.0,
                          bevel_segments=1, hidden=lod > 0) for lod in lods]
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
    a += ', ' + P.render(lod0, NAME + '_variants_clay', [('clay', views[0][1], 'clay')], size=(960, 640),
                         show=[c.name for c, _ in results])
    for i, (col, _) in enumerate(results):
        for o in col.objects:
            o.location.x = 0.0
    b = P.render(lod0[:1], NAME, [v for v in views[1:] if v[2] != 'clay'], show=[results[0][0].name])
    b += ', ' + P.render(lod0[:1], NAME + '_clay', [v for v in views if v[2] == 'clay'], show=[results[0][0].name])
    return f'{a}, {b}'
