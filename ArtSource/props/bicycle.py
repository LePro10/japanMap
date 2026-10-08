"""Bicycles and bicycle parking.

Bicycle_Mamachari_<colour>: the Japanese city bike - step-through U frame,
  26" wheels, front wire basket, full chain case, mudguards, rear carrier,
  swept-back bar, centre stand (deployed). Length along X (front +X),
  standing on its stand. Colours: Silver, Mint, Cream.
BikeRack_6: ground rack with six front-wheel slots in alternating depth
  (handlebars do not clash), lock boxes with yellow number tabs. Slots along
  +X from x = 0, bikes roll in towards +Y.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'Bicycle'
ATLAS = 'Street'
WR = 0.33                       # wheel radius (26")
REAR, FRONT = Vector((-0.53, 0, WR)), Vector((0.54, 0, WR))
BB = Vector((-0.05, 0, 0.29))   # bottom bracket
Y_AX = (0, 1, 0)


def _ring(c, r, n, a0=0.0, a1=2 * math.pi):
    return [Vector((c.x + r * math.cos(a0 + (a1 - a0) * k / n), c.y, c.z + r * math.sin(a0 + (a1 - a0) * k / n)))
            for k in range(n + 1)]


def _tube(bm, R, pts, r, reg, n=6, nob=False, up=(0, 0, 1)):
    sd, c0, c1 = K.tube_path(bm, pts, r, n, twist_up=up)
    K.map_faces(bm, sd, R(reg))
    if nob:
        K.nobevel(bm, sd)
    return sd


def _wheel(bm, R, c, lod):
    n = 20 if lod == 0 else 10
    _tube(bm, R, _ring(c, WR - 0.02, n), 0.021, 'RUBBER', 6 if lod == 0 else 4, True, Y_AX)
    if lod == 0:
        _tube(bm, R, _ring(c, WR - 0.045, n), 0.007, 'ALU', 4, True, Y_AX)
        hub = _tube(bm, R, [c + Vector((0, -0.045, 0)), c + Vector((0, 0.045, 0))], 0.022, 'ALU', 8)
        for k in range(16):   # spokes, alternating hub flanges
            a = 2 * math.pi * k / 16
            rim = c + Vector((math.cos(a), 0, math.sin(a))) * (WR - 0.05)
            hb = c + Vector((math.cos(a + 0.6) * 0.02, 0.035 * (1 if k % 2 else -1), math.sin(a + 0.6) * 0.02))
            _tube(bm, R, [hb, rim], 0.0022, 'ALU', 3, True)
    else:   # far away a wheel reads as a disc
        for s in (-1, 1):
            ring = [bm.verts.new(p + Vector((0, s * 0.004, 0))) for p in _ring(c, WR - 0.04, 8)[:-1]]
            f = bm.faces.new(ring)
            f.normal_update()
            if f.normal.y * s < 0:
                f.normal_flip()
            K.map_faces(bm, [f], R('RUBBER'))


def _bike(bm, R, lod, colour):
    lo = lod > 0
    nt = 6 if not lo else 4
    _wheel(bm, R, REAR, lod)
    _wheel(bm, R, FRONT, lod)
    head_b, head_t = Vector((0.44, 0, 0.74)), Vector((0.40, 0, 0.88))
    seat_t = Vector((-0.19, 0, 0.78))
    # U frame: one big tube from the head down under to the bottom bracket
    _tube(bm, R, [head_t, head_b, Vector((0.36, 0, 0.52)), Vector((0.2, 0, 0.36)), Vector((0.05, 0, 0.3)), BB],
          0.021, colour, nt)
    _tube(bm, R, [BB, seat_t], 0.017, colour, nt)
    if not lo:
        _tube(bm, R, [head_b + Vector((0, 0, 0.06)), Vector((0.15, 0, 0.46)), BB + Vector((0.02, 0, 0.06))],
              0.014, colour, nt)   # second U tube (twin-tube mamachari frame)
    for s in (-1, 1):
        o = Vector((0, s * 0.055, 0))
        _tube(bm, R, [BB + o * 0.6, REAR + o], 0.011, colour, nt)                     # chain stays
        _tube(bm, R, [seat_t + Vector((0.01, 0, -0.04)) + o * 0.3, REAR + o], 0.010, colour, nt)   # seat stays
        _tube(bm, R, [head_b + o * 0.4, Vector((0.5, s * 0.05, 0.52)), FRONT + o], 0.012, colour, nt)  # fork
        # centre stand, deployed: two legs to the ground and a foot bar
        _tube(bm, R, [REAR + Vector((0.03, s * 0.065, -0.01)), Vector((-0.6, s * 0.12, 0.012))], 0.009, 'STEEL', 4)
    _tube(bm, R, [Vector((-0.6, -0.12, 0.012)), Vector((-0.6, 0.12, 0.012))], 0.012, 'STEEL', 4, True, (1, 0, 0))
    # stem + swept-back bar with grips, bell
    stem_t = Vector((0.37, 0, 1.0))
    _tube(bm, R, [head_t, stem_t], 0.014, 'BIKE_SILVER', nt)
    bar = [Vector((0.24, -0.29, 0.99)), Vector((0.31, -0.24, 1.0)), Vector((0.37, -0.12, 1.0)), Vector((0.37, 0.0, 1.0)),
           Vector((0.37, 0.12, 1.0)), Vector((0.31, 0.24, 1.0)), Vector((0.24, 0.29, 0.99))]
    _tube(bm, R, bar, 0.011, 'BIKE_SILVER', nt)
    for s in (-1, 1):
        _tube(bm, R, [Vector((0.27, s * 0.27, 0.995)), Vector((0.2, s * 0.315, 0.985))], 0.017, 'RUBBER', nt)
    if not lo:
        bell = K.lathe(bm, 8, [(0.025, 0.0), (0.02, 0.018), (0.0, 0.026)], cx=0.36, cy=-0.1, cap_bottom=False)
        for v in {v for f in bell['sides'] for v in f.verts}:
            v.co.z += 1.01
        K.map_faces(bm, bell['sides'], R('BIKE_SILVER'))
    # saddle on its post
    _tube(bm, R, [seat_t, seat_t + Vector((-0.02, 0, 0.08))], 0.012, 'BIKE_SILVER', 4)
    sd = K.box(bm, -0.33, -0.07, -0.085, 0.085, 0.86, 0.92)
    for v in {v for f in sd.values() for v in f.verts}:
        if v.co.x > -0.15:   # narrow nose
            v.co.y *= 0.35
        if v.co.z > 0.9:
            v.co.z += 0.01 * (1 if v.co.x < -0.2 else 0)
    K.map_faces(bm, sd.values(), R('SADDLE'))
    # mudguards (wide, in the frame colour) and the chain case
    for c, a0, a1 in ((REAR, math.radians(-10), math.radians(165)), (FRONT, math.radians(15), math.radians(170))):
        arc = _ring(c, WR + 0.03, 10 if not lo else 5, a0, a1)
        _tube(bm, R, arc, 0.028, colour, 4, True, Y_AX)
    case = [(-0.62, 0.30), (-0.62, 0.36), (-0.5, 0.42), (-0.05, 0.42), (0.06, 0.36), (0.06, 0.22), (-0.05, 0.18),
            (-0.5, 0.25)]
    a = [bm.verts.new((x, 0.05, z)) for x, z in case]
    b = [bm.verts.new((x, 0.085, z)) for x, z in case]
    cf = [bm.faces.new([a[i], a[(i + 1) % 8], b[(i + 1) % 8], b[i]]) for i in range(8)]
    ff, bf = bm.faces.new(a), bm.faces.new(b)
    for f in cf + [ff, bf]:
        f.normal_update()
        ctr = Vector((-0.28, 0.0675, 0.3))
        if f.normal.dot(f.calc_center_median() - ctr) < 0:
            f.normal_flip()
    K.map_faces(bm, cf + [ff, bf], R(colour))
    # cranks + pedals
    for s in (-1, 1):
        p = BB + Vector((0.12 * s, s * 0.1, -0.07 * s))
        _tube(bm, R, [BB + Vector((0, s * 0.09, 0)), p], 0.01, 'BIKE_SILVER', 4)
        pd = K.box(bm, p.x - 0.05, p.x + 0.05, p.y + s * 0.01 - 0.0, p.y + s * 0.1, p.z - 0.012, p.z + 0.012)
        K.map_faces(bm, pd.values(), R('RUBBER'))
    # rear carrier
    if not lo:
        for s in (-1, 1):
            _tube(bm, R, [Vector((-0.27, s * 0.07, 0.74)), Vector((-0.78, s * 0.07, 0.74))], 0.006, 'ALU', 4, True)
            _tube(bm, R, [Vector((-0.66, s * 0.07, 0.74)), REAR + Vector((0, s * 0.07, 0))], 0.006, 'ALU', 4, True)
        for x in (-0.36, -0.52, -0.68, -0.78):
            _tube(bm, R, [Vector((x, -0.07, 0.74)), Vector((x, 0.07, 0.74))], 0.006, 'ALU', 4, True, (1, 0, 0))
        rf = K.box(bm, -0.83, -0.81, -0.03, 0.03, 0.56, 0.6)   # rear reflector on the mudguard
        K.map_faces(bm, [rf['-x']], R('REFLECTOR_RED')); K.map_faces(bm, [f for k, f in rf.items() if k != '-x'], R('BLACK'))
        lamp = K.box(bm, 0.5, 0.58, -0.03, 0.03, 0.64, 0.7)   # dynamo lamp on the fork crown
        K.map_faces(bm, [lamp['+x']], R('PORCELAIN')); K.map_faces(bm, [f for k, f in lamp.items() if k != '+x'], R('BLACK'))
    # front basket: wire mesh walls seen from inside and outside
    x0, x1, y0, y1, z0, z1 = 0.46, 0.8, -0.17, 0.17, 0.8, 1.04
    outer = K.box(bm, x0, x1, y0, y1, z0, z1, skip=('+z',))
    K.map_faces(bm, outer.values(), R('BASKET'))
    if not lo:
        inner = K.box(bm, x0 + 0.004, x1 - 0.004, y0 + 0.004, y1 - 0.004, z0 + 0.004, z1, skip=('+z',))
        for f in inner.values():
            f.normal_flip()
        K.map_faces(bm, inner.values(), R('BASKET'))
        for x in (0.62,):   # basket stays down to the fork
            _tube(bm, R, [Vector((x, 0, z0)), FRONT + Vector((0.02, 0, 0.04))], 0.006, 'ALU', 4, True)


def _rack(bm, R, lod):
    """Six slots along +X, 0.5 m apart; bikes roll in towards +Y."""
    L = 3.0
    for y in (0.25, 0.75):
        rail = K.box(bm, 0.0, L, y - 0.02, y + 0.02, 0.0, 0.05, skip=('-z',))
        K.map_faces(bm, rail.values(), R('GALV'))
    for i in range(6):
        x = 0.25 + 0.5 * i
        deep = i % 2   # alternate slot depth so handlebars do not clash
        y_in = 0.25 + 0.18 * deep
        h = 0.36 if deep else 0.30
        for s in (-1, 1):   # wheel guide: a bent rod each side of the tyre
            pts = [Vector((x + s * 0.035, 0.25, 0.05)), Vector((x + s * 0.035, y_in - 0.05, h)),
                   Vector((x + s * 0.035, y_in + 0.25, h + 0.05)), Vector((x + s * 0.035, 0.75, 0.05))]
            if lod == 0:
                sd = _tube(bm, R, pts, 0.011, 'GALV', 6)
            else:
                sd = _tube(bm, R, [pts[0], pts[2], pts[3]], 0.012, 'GALV', 4)
        # lock box at the slot mouth with a yellow number tab
        lb = K.box(bm, x - 0.06, x + 0.06, y_in - 0.12, y_in - 0.02, 0.05, 0.2)
        K.map_faces(bm, lb.values(), R('PAINT_GREY'))
        if lod == 0:
            tab = K.box(bm, x - 0.03, x + 0.03, y_in - 0.126, y_in - 0.12, 0.13, 0.18, skip=('+y',))
            K.map_faces(bm, tab.values(), R('YELLOW'))
    if lod == 0:   # anchor plates at the rail ends
        for xx in (0.02, L - 0.02):
            for y in (0.25, 0.75):
                ap = K.box(bm, xx - 0.04, xx + 0.04, y - 0.05, y + 0.05, 0.0, 0.008, skip=('-z',))
                K.map_faces(bm, ap.values(), R('STEEL'))


COLOURS = {'Silver': 'BIKE_SILVER', 'Mint': 'BIKE_MINT', 'Cream': 'BIKE_CREAM'}


def build_variant(key, lods=(0, 1)):
    name = f'{NAME}_Mamachari_{key}' if key in COLOURS else 'BikeRack_6'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = []
    for lod in lods:
        bm = K.new_bm()
        R = lambda n: A.region(ATLAS, n)
        if key in COLOURS:
            _bike(bm, R, lod, COLOURS[key])
        else:
            _rack(bm, R, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.003 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    if key in COLOURS:
        K.collider_box(f'COL_{name}', col, -0.86, 0.88, -0.3, 0.3, 0.0, 1.05)
    else:
        K.collider_box(f'COL_{name}', col, 0.0, 3.0, 0.2, 0.8, 0.0, 0.4)
    return col, objs


def build():
    return [build_variant(k) for k in list(COLOURS) + ['Rack']]


def preview(results, views):
    """Rack with three bikes parked in it (rolled in towards +Y)."""
    from kit import preview as P
    by = {c.name: (c, o) for c, o in results}
    tmp = K.collection('Bicycle_PreviewRun')
    obs = []
    def put(key, loc, rz=0.0):
        o = by[key][1][0].copy(); o.location = loc; o.rotation_euler = (0, 0, rz)
        tmp.objects.link(o); obs.append(o)
    put('BikeRack_6', (0, 0, 0))
    for i, c in ((0, 'Silver'), (1, 'Mint'), (3, 'Cream'), (4, 'Silver')):
        deep = i % 2
        y_front = 0.25 + 0.18 * deep + 0.1   # front hub sits in the slot
        put(f'{NAME}_Mamachari_{c}', (0.25 + 0.5 * i, y_front - FRONT.x, 0.0), math.pi / 2)
    put(f'{NAME}_Mamachari_Mint', (4.2, -0.4, 0.0), 0.3)
    for o in obs:
        o.hide_set(False); o.hide_render = False
    a = P.render(obs, NAME, [v for v in views if v[2] != 'clay'], size=(800, 480), show=[tmp.name])
    b = P.render(obs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(800, 480), show=[tmp.name])
    for o in obs:
        K.bpy.data.objects.remove(o)
    return f'{a}, {b}'
