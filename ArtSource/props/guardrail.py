"""Japanese roadside barriers (white painted steel).

GuardRail_4m: W-beam (350 mm high, beam centre 0.6 m) on a round post at
x = 0 with a spacer block; one module = 4 m along +X, chain modules end to
end. The beam is cut into 8 pieces along X so Unity can bend it along a
spline. GuardRail_End: flared end beam (sode beam) with the last post.
GuardPipe_2m: sidewalk railing, three pipes on a post every 2 m.
Road side is -Y; the beam sits on the road side of the post.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'Barrier'
ATLAS = 'Street'
BEAM_Y = -0.12          # beam face plane in front of the post
ZC = 0.60               # beam centre height

# W-beam cross-section (y, z) relative to the beam centre, road side first
W = [(0.0, -0.175), (-0.02, -0.16), (-0.075, -0.10), (-0.075, -0.06), (-0.035, -0.02), (-0.035, 0.02),
     (-0.075, 0.06), (-0.075, 0.10), (-0.02, 0.16), (0.0, 0.175)]


def _beam(bm, R, x0, x1, pieces, flare=False, lod=0):
    prof = W if lod == 0 else [W[0], W[3], W[6], W[-1]]
    xs = [x0 + (x1 - x0) * i / pieces for i in range(pieces + 1)]
    rows = []
    for x in xs:
        # flare: bend the beam away from the road towards the end (sode beam)
        t = (x - x0) / (x1 - x0) if flare else 0
        dy = 0.35 * t * t if flare else 0.0
        rows.append([bm.verts.new((x, BEAM_Y + y + dy, ZC + z)) for y, z in prof])
    out = []
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        for k in range(len(prof) - 1):
            out.append(bm.faces.new([a[k], b[k], b[k + 1], a[k + 1]]))
    # outward = towards the road: flip if needed, then add a thin back skin so the
    # beam is not see-through from the field side
    for f in out:
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    back = []
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        bf = bm.faces.new([a[-1], b[-1], b[0], a[0]])
        bf.normal_update()
        if bf.normal.y < 0:
            bf.normal_flip()
        back.append(bf)
    K.map_faces(bm, out + back, R('PAINT_WHITE'))
    return out + back


def _post(bm, R, x, lod, h=0.9, r=0.07):
    p = K.lathe(bm, 12 if lod == 0 else 6, [(r, 0.0), (r, h), (r * 0.8, h + 0.02), (0.0, h + 0.04)], cx=x, cy=0.0,
                cap_bottom=False)
    K.map_faces(bm, p['sides'], R('PAINT_WHITE'))
    if lod == 0:  # spacer block between post and beam + two bolts
        sp = K.box(bm, x - 0.04, x + 0.04, BEAM_Y + 0.005, -r + 0.01, ZC - 0.07, ZC + 0.07, skip=('+y', '-y'))
        K.map_faces(bm, sp.values(), R('PAINT_WHITE'))
        for z in (ZC - 0.04, ZC + 0.04):
            b = K.prism(bm, 6, 0.012, 0.012, 0, 0.012)
            for v in {v for f in b['sides'] + [b['top']] for v in f.verts}:
                X, Y, Z = v.co
                v.co = (x + X, BEAM_Y - 0.035 - Z, z + Y)
            K.map_faces(bm, b['sides'] + [b['top']], R('STEEL')); K.nobevel(bm, b['sides'] + [b['top']])


def _guardpipe(bm, R, lod):
    _post(bm, R, 0.0, lod, h=0.85, r=0.035)
    for z in (0.35, 0.58, 0.80):
        sd, _, _ = K.tube_path(bm, [(x, -0.05, z) for x in (0.0, 0.5, 1.0, 1.5, 2.0)], 0.024, 8 if lod == 0 else 6)
        K.map_faces(bm, sd, R('PAINT_WHITE'), rotate=True)


VARIANTS = ('GuardRail_4m', 'GuardRail_End', 'GuardPipe_2m')


def build_variant(variant, lods=(0, 1)):
    name = f'{NAME}_{variant}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = []
    for lod in lods:
        bm = K.new_bm()
        R = lambda n: A.region(ATLAS, n)
        if variant == 'GuardRail_4m':
            _beam(bm, R, 0.0, 4.0, 8 if lod == 0 else 2, lod=lod)
            _post(bm, R, 0.0, lod)
        elif variant == 'GuardRail_End':
            _beam(bm, R, 0.0, 2.0, 6 if lod == 0 else 3, flare=True, lod=lod)
            _post(bm, R, 0.0, lod)
        else:
            _guardpipe(bm, R, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.004 if lod == 0 else 0.0,
                                  hidden=lod > 0))
    length = {'GuardRail_4m': 4.0, 'GuardRail_End': 2.0, 'GuardPipe_2m': 2.0}[variant]
    K.collider_box(f'COL_{name}', col, 0.0, length, -0.3, 0.1, 0.0, 0.9)
    return col, objs


def build():
    return [build_variant(v) for v in VARIANTS]


def preview(results, views):
    """A run: end - 3 x 4 m - end (mirrored), and a guard pipe run behind it."""
    from kit import preview as P
    by = {c.name: (c, o) for c, o in results}
    obs = []
    rail, end, pipe = by[f'{NAME}_GuardRail_4m'], by[f'{NAME}_GuardRail_End'], by[f'{NAME}_GuardPipe_2m']
    tmp = K.collection('Barrier_PreviewRun')
    for i in range(3):
        o = rail[1][0].copy(); o.location.x = i * 4.0; tmp.objects.link(o); obs.append(o)
    e1 = end[1][0].copy(); e1.location.x = 12.0; tmp.objects.link(e1); obs.append(e1)
    e2 = end[1][0].copy(); e2.scale.x = -1; tmp.objects.link(e2); obs.append(e2)
    for i in range(6):
        o = pipe[1][0].copy(); o.location = (i * 2.0, 2.0, 0.15); tmp.objects.link(o); obs.append(o)
    for o in obs:
        o.hide_set(False); o.hide_render = False
    a = P.render(obs, NAME, [v for v in views if v[2] != 'clay'], size=(960, 480), show=[tmp.name])
    b = P.render(obs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(960, 480), show=[tmp.name])
    for o in obs:
        K.bpy.data.objects.remove(o)
    return f'{a}, {b}'
