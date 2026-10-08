"""Bus stops. Front (road side) is -Y.

Pole: the classic Japanese stop post - round blue sign (バス停) on a pipe in
  a round concrete foot, stop-name plate, timetable box with a rain hood.
Shelter: steel shelter, 3.6 m: three posts at the back, cantilevered roof
  with an LED strip, glass back wall, backlit poster panel on one side,
  glass wing on the other, slatted bench, stop name on the fascia.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'BusStop'
ATLAS = 'Street'
UP = Vector((0, 0, 1))


def _round_sign(bm, R, c, r, n, key, art_r=63 / 128, t=0.012):
    """Round plate facing -Y at c, the graphic on both faces (UV planar)."""
    uv = bm.loops.layers.uv.verify()
    u0, v0, u1, v1 = A.region(ATLAS, key)['uv']
    ang = [2 * math.pi * k / n for k in range(n)]
    fr = [bm.verts.new((c.x + r * math.cos(a), c.y, c.z + r * math.sin(a))) for a in ang]
    bk = [bm.verts.new((c.x + r * math.cos(a), c.y + t, c.z + r * math.sin(a))) for a in ang]
    ff = bm.faces.new(fr[::-1]); bf = bm.faces.new(bk)
    for f, want in ((ff, -1), (bf, 1)):
        f.normal_update()
        if f.normal.y * want < 0:
            f.normal_flip()
        for l in f.loops:
            dx = (l.vert.co.x - c.x) / r * want * -1    # the back face reads mirrored otherwise
            dz = (l.vert.co.z - c.z) / r
            l[uv].uv = (u0 + (0.5 + dx * art_r) * (u1 - u0), v0 + (0.5 + dz * art_r) * (v1 - v0))
    rim = [bm.faces.new([fr[k], fr[(k + 1) % n], bk[(k + 1) % n], bk[k]]) for k in range(n)]
    for f in rim:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - c) < 0:
            f.normal_flip()
    K.map_faces(bm, rim, R('SIGN_BACK'))


def _panel(bm, R, x0, x1, y, z0, z1, front, back='SIGN_BACK', t=0.01):
    b = K.box(bm, x0, x1, y, y + t, z0, z1)
    K.map_faces(bm, [b['-y']], R(front))
    K.map_faces(bm, [b[k] for k in b if k != '-y'], R(back))
    return b


def _pole(bm, R, lod):
    n = 16 if lod == 0 else 8
    foot = K.lathe(bm, n, [(0.27, 0.0), (0.27, 0.1), (0.21, 0.15), (0.05, 0.17)], cap_bottom=False, cap_top=False)
    K.map_faces(bm, foot['sides'], R('CONCRETE_CAP'))
    p = K.lathe(bm, 8, [(0.03, 0.15), (0.03, 2.3), (0.0, 2.32)], cap_bottom=False)
    K.map_cyl(bm, p['sides'][:8], R('GALV'), rotate=True)
    K.map_faces(bm, p['sides'][8:], R('STEEL'))
    _round_sign(bm, R, Vector((0, -0.045, 2.05)), 0.24, 24 if lod == 0 else 12, 'BUS_STOP')
    _panel(bm, R, -0.25, 0.25, -0.045, 1.74, 1.865, 'STOP_NAME')
    # timetable box: frame, recessed board, small rain hood
    box = K.box(bm, -0.23, 0.23, -0.1, -0.03, 0.98, 1.58)
    K.map_faces(bm, [box[k] for k in box if k != '-y'], R('PAINT_GREY'))
    fl, walls = K.recess(bm, box['-y'], 0.025, 0.015) if lod == 0 else (box['-y'], [])
    K.map_faces(bm, [fl], R('TIMETABLE')); K.map_faces(bm, walls, R('PAINT_GREY'))
    hood = K.box(bm, -0.25, 0.25, -0.14, -0.03, 1.58, 1.6)
    for v in hood['-y'].verts:
        v.co.z -= 0.035
    K.map_faces(bm, hood.values(), R('PAINT_GREY'))
    if lod == 0:
        for z in (1.1, 1.45, 1.8, 2.05):   # clamps round the pole
            cl, _, _ = K.tube_path(bm, [(0, 0, z - 0.02), (0, 0, z + 0.02)], 0.036, 8)
            K.map_faces(bm, cl, R('STEEL'))


def _shelter(bm, R, lod):
    L, Y_BACK = 3.6, 0.6
    xs = (-1.7, 0.0, 1.7)
    for x in xs:   # posts with base plates
        p = K.box(bm, x - 0.05, x + 0.05, Y_BACK - 0.05, Y_BACK + 0.05, 0.012, 2.42, skip=('-z',))
        K.map_faces(bm, p.values(), R('PAINT_GREY'))
        bp = K.box(bm, x - 0.11, x + 0.11, Y_BACK - 0.11, Y_BACK + 0.11, 0.0, 0.012, skip=('-z',))
        K.map_faces(bm, bp.values(), R('PAINT_GREY'))
        # cantilever arm under the roof, tapering to the front
        arm = K.box(bm, x - 0.04, x + 0.04, -0.75, Y_BACK + 0.05, 2.22, 2.42)
        for v in arm['-y'].verts:
            if v.co.z < 2.3:
                v.co.z = 2.34
        K.map_faces(bm, arm.values(), R('PAINT_GREY'))
    # roof: sheet on top, fascia all round, light grey soffit with an LED strip
    def zr(y):      # falls 0.1 m to the back (drainage)
        return 2.52 - 0.1 * (y + 0.85) / (Y_BACK + 0.15 + 0.85)
    roof = K.box(bm, -L / 2 - 0.05, L / 2 + 0.05, -0.85, Y_BACK + 0.15, 2.42, 2.5)
    for v in {v for f in roof.values() for v in f.verts}:
        if v.co.z > 2.45:
            v.co.z = zr(v.co.y)
    K.map_faces(bm, [roof['+z']], R('ROOF_SHEET'))
    K.map_faces(bm, [roof[k] for k in roof if k not in ('+z', '-y')], R('PAINT_GREY'))
    K.map_faces(bm, [roof['-y']], R('PAINT_GREY'))
    _panel(bm, R, -0.24, 0.24, -0.86, 2.425, 2.505, 'STOP_NAME', 'PAINT_GREY', t=0.004)
    led = K.box(bm, -L / 2 + 0.2, L / 2 - 0.2, -0.4, -0.34, 2.405, 2.42, skip=('+z',))
    K.map_faces(bm, led.values(), R('LED_SHELTER'))
    # back wall: kick panel + glass between posts (both faces: seen from both sides)
    glass = []
    for x0, x1 in ((-1.65, -0.05), (0.05, 1.65)):
        kick = K.box(bm, x0, x1, Y_BACK - 0.02, Y_BACK + 0.02, 0.05, 0.3)
        K.map_faces(bm, kick.values(), R('PAINT_GREY'))
        top = K.box(bm, x0, x1, Y_BACK - 0.025, Y_BACK + 0.025, 2.08, 2.14)
        K.map_faces(bm, top.values(), R('PAINT_GREY'))
        for s, yy in ((-1, Y_BACK - 0.003), (1, Y_BACK + 0.003)):
            g = bm.faces.new([bm.verts.new(c) for c in ((x0, yy, 0.3), (x1, yy, 0.3), (x1, yy, 2.08), (x0, yy, 2.08))])
            g.normal_update()
            if g.normal.y * s < 0:
                g.normal_flip()
            glass.append(g)
        if lod == 0:   # mid rail
            mr = K.box(bm, x0, x1, Y_BACK - 0.02, Y_BACK + 0.02, 1.0, 1.05)
            K.map_faces(bm, mr.values(), R('PAINT_GREY'))
    # side panels: backlit poster (+x end), glass wing (-x end)
    ad = K.box(bm, L / 2 - 0.08, L / 2 + 0.02, -0.4, Y_BACK - 0.05, 0.25, 2.1)
    K.map_faces(bm, [f for k, f in ad.items() if k not in ('-x', '+x')], R('PAINT_DARK'))
    for k in ('-x', '+x'):
        f = ad[k]
        if lod == 0:
            fl, walls = K.recess(bm, f, 0.04, 0.012)
            K.map_faces(bm, walls, R('PAINT_DARK'))
        K.map_faces(bm, [f], R('AD_POSTER'))
    for s, xx in ((-1, -L / 2 + 0.03 - 0.003), (1, -L / 2 + 0.03 + 0.003)):
        g = bm.faces.new([bm.verts.new(c) for c in ((xx, -0.1, 0.3), (xx, Y_BACK - 0.05, 0.3),
                                                   (xx, Y_BACK - 0.05, 2.08), (xx, -0.1, 2.08))])
        g.normal_update()
        if g.normal.x * s < 0:
            g.normal_flip()
        glass.append(g)
    wf = K.box(bm, -L / 2 + 0.01, -L / 2 + 0.05, -0.14, -0.1, 0.05, 2.14)
    K.map_faces(bm, wf.values(), R('PAINT_GREY'))
    for g in glass:
        g.material_index = 1
    K.map_faces(bm, glass, R('PAINT_GREY'))
    # bench: slats on two brackets from the wall
    for i in range(3 if lod == 0 else 1):
        y0 = 0.22 + i * 0.1
        s = K.box(bm, -1.4, 1.4, y0, y0 + (0.08 if lod == 0 else 0.28), 0.43, 0.46)
        K.map_faces(bm, s.values(), R('WOOD_LIGHT'), s_offset=i * 1.3)
    for x in (-1.0, 1.0):
        br = K.box(bm, x - 0.025, x + 0.025, 0.2, Y_BACK - 0.02, 0.36, 0.43)
        K.map_faces(bm, br.values(), R('ALU'))
        lg = K.box(bm, x - 0.02, x + 0.02, 0.24, 0.28, 0.0, 0.36, skip=('-z',))
        K.map_faces(bm, lg.values(), R('ALU'))


VARIANTS = {'Pole': _pole, 'Shelter': _shelter}


def build_variant(key, lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mats = [K.atlas_material(ATLAS)] + ([K.glass_material()] if key == 'Shelter' else [])
    objs = []
    for lod in lods:
        bm = K.new_bm()
        VARIANTS[key](bm, lambda n: A.region(ATLAS, n), lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, mats, bevel=0.006 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    if key == 'Pole':
        K.collider_box(f'COL_{name}', col, -0.27, 0.27, -0.27, 0.27, 0.0, 2.3)
    else:
        K.collider_box(f'COL_{name}_Back', col, -1.8, 1.8, 0.5, 0.7, 0.0, 2.2)
        K.collider_box(f'COL_{name}_Ad', col, 1.7, 1.82, -0.4, 0.55, 0.0, 2.1)
        K.collider_box(f'COL_{name}_Roof', col, -1.85, 1.85, -0.85, 0.75, 2.4, 2.55)
        K.light_marker(f'LIGHT_{name}_Strip', col, (0.0, -0.37, 2.38), color=(0.92, 0.95, 1.0), watts=25,
                       unity_range=6.0, unity_intensity=1.0)
    return col, objs


def build():
    return [build_variant(k) for k in VARIANTS]


def preview(results, views):
    from kit import preview as P
    xs = {'BusStop_Pole': -2.6, 'BusStop_Shelter': 0.6}
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
