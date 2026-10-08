"""Japanese roadside barriers (white painted steel).

GuardRail_4m: W-beam (Gr-C: 350 mm high, beam centre 0.6 m), sheet with real
thickness and rolled lips, on a round post (dome cap) at x = 0 via a bracket;
the splice overlap at the post shows its bolts; an amber delineator on the
post. One module = 4 m along +X, chain modules end to end. The beam is cut
into 8 pieces along X so Unity can bend it along a spline.
GuardRail_End: flared end (sode beam) that curls back into a round end.
GuardPipe_2m: sidewalk guard pipe, three pipes in saddle clamps on a post.
GuardPipe_End: the pipes bend away from the road (end of a run).
Railing_2m: pedestrian fence (oudan-boushi-saku): rails, vertical bars,
square post on a base plate.
Road side is -Y; the beam sits on the road side of the post.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'Barrier'
ATLAS = 'Street'
BEAM_Y = -0.12          # beam reference plane in front of the post
ZC = 0.60               # beam centre height
SHEET = 0.0045          # steel sheet incl. paint

# W-beam front surface (y, z) about the beam centre, lip to lip; -y = road side
W = [(0.010, -0.175), (-0.006, -0.170), (-0.022, -0.155), (-0.072, -0.108), (-0.083, -0.085), (-0.072, -0.062),
     (-0.034, -0.024), (-0.028, 0.0), (-0.034, 0.024), (-0.072, 0.062), (-0.083, 0.085), (-0.072, 0.108),
     (-0.022, 0.155), (-0.006, 0.170), (0.010, 0.175)]
W_LOD1 = [W[0], W[4], W[7], W[10], W[14]]
UP = Vector((0, 0, 1))


def _sweep(bm, path, prof, back=True):
    """Sheet profile swept along a horizontal path (Vector points at the
    beam centre). The profile's y runs to the left of the path, so -y faces
    the road on a +X path. back=True adds the rear skin (offset by SHEET)
    and the lip edges; else a flat skin closes the back (LOD1)."""
    tang = []
    for i in range(len(path)):
        t = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        t.z = 0
        tang.append(t.normalized())
    def ring(dy):
        return [[bm.verts.new(p + Vector((-t.y, t.x, 0)) * (y + dy) + UP * z) for y, z in prof]
                for p, t in zip(path, tang)]
    fr = ring(0.0)
    faces = []
    def quads(rows, flip):
        out = []
        for i in range(len(rows) - 1):
            a, b = rows[i], rows[i + 1]
            for k in range(len(prof) - 1):
                q = [a[k], b[k], b[k + 1], a[k + 1]]
                out.append(bm.faces.new(q[::-1] if flip else q))
        return out
    front = quads(fr, False)
    # orientation from the web (middle face of the first piece): it must face the road side
    mid = front[len(prof) // 2]
    mid.normal_update()
    left = Vector((-tang[0].y, tang[0].x, 0))
    flip = mid.normal.dot(left) > 0
    if flip:
        for f in front:
            f.normal_flip()
    faces += front
    if back:
        bk = ring(SHEET)
        rear = quads(bk, not flip)
        lips = []
        for k in (0, len(prof) - 1):
            for i in range(len(path) - 1):
                f = bm.faces.new([fr[i][k], fr[i + 1][k], bk[i + 1][k], bk[i][k]])
                f.normal_update()
                if f.normal.z * (1 if k else -1) < 0:
                    f.normal_flip()
                lips.append(f)
        faces += rear + lips
    else:
        skin = []
        for i in range(len(path) - 1):
            f = bm.faces.new([fr[i][-1], fr[i + 1][-1], fr[i + 1][0], fr[i][0]])
            f.normal_update()
            if f.normal.dot(left) < 0:
                f.normal_flip()
            skin.append(f)
        faces += skin
    return faces


def _bolt(bm, R, p, d, r=0.014, h=0.009):
    """Button-head bolt at p, head pointing along d (unit Vector)."""
    d = Vector(d).normalized()
    a = d.cross(UP if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized(); b = d.cross(a)
    ring = lambda rr, hh: [bm.verts.new(p + d * hh + (a * math.cos(2 * math.pi * k / 6) + b * math.sin(2 * math.pi * k / 6)) * rr)
                           for k in range(6)]
    r0, r1 = ring(r, 0.0), ring(r * 0.7, h)
    tip = bm.verts.new(p + d * (h * 1.3))
    fs = [bm.faces.new([r0[k], r0[(k + 1) % 6], r1[(k + 1) % 6], r1[k]]) for k in range(6)]
    fs += [bm.faces.new([r1[k], r1[(k + 1) % 6], tip]) for k in range(6)]
    for f in fs:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - p) < 0:
            f.normal_flip()
    K.map_faces(bm, fs, R('STEEL')); K.nobevel(bm, fs)


def _disc(bm, R, c, r, d, n, front_reg, back_reg, t=0.012):
    """Round plate centred at c facing d (delineator lens, sign)."""
    d = Vector(d).normalized()
    a = d.cross(UP if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized(); b = d.cross(a)
    fr = [bm.verts.new(c + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * r) for k in range(n)]
    bk = [bm.verts.new(v.co - d * t) for v in fr]
    ff = bm.faces.new(fr); bf = bm.faces.new(bk[::-1])
    for f, s in ((ff, 1), (bf, -1)):
        f.normal_update()
        if f.normal.dot(d) * s < 0:
            f.normal_flip()
    rim = [bm.faces.new([fr[k], fr[(k + 1) % n], bk[(k + 1) % n], bk[k]]) for k in range(n)]
    for f in rim:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - c) < 0:
            f.normal_flip()
    K.map_faces(bm, [ff], R(front_reg)); K.map_faces(bm, [bf] + rim, R(back_reg))
    return ff


def _beam(bm, R, x0, x1, pieces, lod):
    path = [Vector((x0 + (x1 - x0) * i / pieces, BEAM_Y, ZC)) for i in range(pieces + 1)]
    fs = _sweep(bm, path, W if lod == 0 else W_LOD1, back=lod == 0)
    K.map_faces(bm, fs, R('PAINT_WHITE'))
    if lod == 0:
        # splice: the next beam's end laps over this one at the post - an outer
        # sheet 0.2 m long with its own edge and the splice bolts
        lap = _sweep(bm, [Vector((x0, BEAM_Y - SHEET, ZC)), Vector((x0 + 0.2, BEAM_Y - SHEET, ZC))], W)
        K.map_faces(bm, lap, R('PAINT_WHITE'))
        for x in (x0 + 0.05, x0 + 0.15):
            for z in (-0.085, 0.085):
                _bolt(bm, R, Vector((x, BEAM_Y - 0.083 - 2 * SHEET, ZC + z)), (0, -1, 0))
    return fs


def _post(bm, R, x, lod, h=0.9, r=0.07, beam=True, delineator=False):
    p = K.lathe(bm, 12 if lod == 0 else 6,
                [(r, -0.05), (r, h), (r + 0.006, h), (r + 0.006, h + 0.025), (r * 0.6, h + 0.05), (0.0, h + 0.056)],
                cx=x, cy=0.0, cap_bottom=False)
    K.map_faces(bm, p['sides'], R('PAINT_WHITE'))
    if lod == 0 and beam:
        # bracket: bent plate from the post to the back of the beam web, one bolt through
        yb = BEAM_Y - 0.028 + SHEET
        for z in (ZC - 0.07, ZC + 0.058):
            pl = K.box(bm, x - 0.05, x + 0.05, yb, -r + 0.01, z, z + 0.012)
            K.map_faces(bm, pl.values(), R('PAINT_WHITE'))
        web = K.box(bm, x - 0.05, x + 0.05, yb, yb + 0.012, ZC - 0.07, ZC + 0.07, skip=('-y',))
        K.map_faces(bm, web.values(), R('PAINT_WHITE'))
        _bolt(bm, R, Vector((x + 0.0, BEAM_Y - 0.028 - SHEET, ZC)), (0, -1, 0), r=0.018)
        _bolt(bm, R, Vector((x, r - 0.002, ZC)), (0, 1, 0), r=0.016)   # nut behind the post
    if lod == 0 and delineator:
        st, _, _ = K.tube_path(bm, [(x, 0, h + 0.05), (x, 0, h + 0.2)], 0.012, 6)
        K.map_faces(bm, st, R('PAINT_GREY'))
        _disc(bm, R, Vector((x, -0.02, h + 0.24)), 0.05, (0, -1, 0), 12, 'REFLECTOR', 'PAINT_GREY', t=0.025)
        _disc(bm, R, Vector((x, 0.006, h + 0.24)), 0.05, (0, 1, 0), 12, 'REFLECTOR', 'PAINT_GREY', t=0.001)


def _end_path(x0, n_flare, n_curl, R_=0.12):
    """Flare away from the road (+y) over 1.6 m, then curl back in a half circle."""
    pts = [Vector((x0 + 1.6 * i / n_flare, BEAM_Y + 0.35 * (i / n_flare) ** 2, ZC)) for i in range(n_flare + 1)]
    t = (pts[-1] - pts[-2]).normalized()
    left = Vector((-t.y, t.x, 0))
    c = pts[-1] + left * R_
    a0 = math.atan2(pts[-1].y - c.y, pts[-1].x - c.x)
    for k in range(1, n_curl + 1):
        a = a0 + math.pi * k / n_curl
        pts.append(Vector((c.x + R_ * math.cos(a), c.y + R_ * math.sin(a), ZC)))
    return pts


def _pipe_post(bm, R, x, lod, h=0.85, r=0.045):
    p = K.lathe(bm, 10 if lod == 0 else 6,
                [(r, -0.05), (r, h), (r + 0.004, h), (r + 0.004, h + 0.02), (r * 0.5, h + 0.04), (0.0, h + 0.045)],
                cx=x, cy=0.0, cap_bottom=False)
    K.map_faces(bm, p['sides'], R('PAINT_WHITE'))


PIPE_Z = (0.33, 0.55, 0.77)
PIPE_Y = -0.074
PIPE_R = 0.0243


def _guardpipe(bm, R, lod, end=False):
    _pipe_post(bm, R, 0.0, lod)
    for z in PIPE_Z:
        if end:   # straight 0.55 m, then a 90-degree bend away from the road
            pts = [Vector((0.0, PIPE_Y, z)), Vector((0.55, PIPE_Y, z))]
            c = Vector((0.55, PIPE_Y + 0.25, z))
            for k in range(1, 7 if lod == 0 else 3):
                a = -math.pi / 2 + (math.pi / 2) * k / (6 if lod == 0 else 2)
                pts.append(Vector((c.x + 0.25 * math.cos(a), c.y + 0.25 * math.sin(a), z)))
            pts.append(pts[-1] + Vector((0, 0.08, 0)))
            sd, _, c1 = K.tube_path(bm, pts, PIPE_R, 8 if lod == 0 else 6, cap1=True)
            K.map_faces(bm, sd + [c1], R('PAINT_WHITE'), rotate=True)
        else:
            sd, _, _ = K.tube_path(bm, [(x, PIPE_Y, z) for x in (0.0, 0.5, 1.0, 1.5, 2.0)], PIPE_R,
                                   8 if lod == 0 else 6)
            K.map_faces(bm, sd, R('PAINT_WHITE'), rotate=True)
        if lod == 0:   # saddle clamp: strap round the pipe, plate to the post, two nuts
            st, _, _ = K.tube_path(bm, [(-0.022, PIPE_Y, z), (0.022, PIPE_Y, z)], PIPE_R + 0.005, 8)
            K.map_faces(bm, st, R('PAINT_WHITE'), rotate=True)
            pl = K.box(bm, -0.03, 0.03, PIPE_Y + 0.01, -0.043, z - 0.035, z + 0.035)
            K.map_faces(bm, pl.values(), R('PAINT_WHITE'))
            for zz in (z - 0.024, z + 0.024):   # U-bolt nuts behind the post
                nut = K.box(bm, -0.009, 0.009, 0.045, 0.057, zz - 0.008, zz + 0.008, skip=('-y',))
                K.map_faces(bm, nut.values(), R('STEEL')); K.nobevel(bm, nut.values())


def _railing(bm, R, lod):
    L, Ht = 2.0, 0.85
    post = K.box(bm, -0.03, 0.03, -0.03, 0.03, 0.012, Ht, skip=('-z',))
    K.map_faces(bm, post.values(), R('PAINT_WHITE'))
    cap = K.box(bm, -0.034, 0.034, -0.034, 0.034, Ht, Ht + 0.012)
    K.map_faces(bm, cap.values(), R('PAINT_WHITE'))
    base = K.box(bm, -0.07, 0.07, -0.07, 0.07, 0.0, 0.012, skip=('-z',))
    K.map_faces(bm, base.values(), R('PAINT_WHITE'))
    if lod == 0:
        for sx in (-1, 1):
            for sy in (-1, 1):
                _bolt(bm, R, Vector((sx * 0.05, sy * 0.05, 0.012)), (0, 0, 1), r=0.009, h=0.008)
    # top rail (flattened oval) and bottom rail, then the bars
    top = K.box(bm, 0.03, L - 0.03, -0.022, 0.022, Ht - 0.05, Ht - 0.012)
    bot = K.box(bm, 0.03, L - 0.03, -0.016, 0.016, 0.16, 0.19)
    K.map_faces(bm, list(top.values()) + list(bot.values()), R('PAINT_WHITE'))
    if lod == 0:
        n = 15
        for i in range(n):
            x = 0.03 + (L - 0.06) * (i + 0.5) / n
            sd, _, _ = K.tube_path(bm, [(x, 0, 0.19), (x, 0, Ht - 0.05)], 0.009, 4)
            K.map_faces(bm, sd, R('PAINT_WHITE'), rotate=True); K.nobevel(bm, sd)
        # small reflector on the post face (towards the road)
        rf = K.box(bm, -0.022, 0.022, -0.034, -0.03, Ht - 0.16, Ht - 0.06, skip=('+y',))
        K.map_faces(bm, [rf['-y']], R('REFLECTOR')); K.map_faces(bm, [f for k, f in rf.items() if k != '-y'], R('PAINT_WHITE'))
    else:
        mid = K.box(bm, 0.03, L - 0.03, -0.006, 0.006, 0.19, Ht - 0.05)
        K.map_faces(bm, mid.values(), R('PAINT_WHITE'))


VARIANTS = ('GuardRail_4m', 'GuardRail_End', 'GuardPipe_2m', 'GuardPipe_End', 'Railing_2m')
LENGTH = {'GuardRail_4m': 4.0, 'GuardRail_End': 1.75, 'GuardPipe_2m': 2.0, 'GuardPipe_End': 0.85, 'Railing_2m': 2.0}


def build_variant(variant, lods=(0, 1)):
    name = f'{NAME}_{variant}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = []
    for lod in lods:
        bm = K.new_bm()
        R = lambda n: A.region(ATLAS, n)
        if variant == 'GuardRail_4m':
            _beam(bm, R, 0.0, 4.0, 8 if lod == 0 else 2, lod)
            _post(bm, R, 0.0, lod, delineator=True)
        elif variant == 'GuardRail_End':
            fs = _sweep(bm, _end_path(0.0, 6 if lod == 0 else 3, 6 if lod == 0 else 3), W if lod == 0 else W_LOD1,
                        back=lod == 0)
            K.map_faces(bm, fs, R('PAINT_WHITE'))
            _post(bm, R, 0.0, lod)
        elif variant == 'GuardPipe_2m':
            _guardpipe(bm, R, lod)
        elif variant == 'GuardPipe_End':
            _guardpipe(bm, R, lod, end=True)
        else:
            _railing(bm, R, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.004 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    y0, y1 = {'GuardRail_4m': (-0.3, 0.1), 'GuardRail_End': (-0.3, 0.6), 'GuardPipe_End': (-0.12, 0.4)}.get(variant,
                                                                                                         (-0.12, 0.08))
    K.collider_box(f'COL_{name}', col, 0.0, LENGTH[variant], y0, y1, 0.0, 0.9)
    return col, objs


def build():
    return [build_variant(v) for v in VARIANTS]


def preview(results, views):
    """A run: end - 3 x 4 m - end (mirrored); behind it guard pipe and railing runs."""
    from kit import preview as P
    by = {c.name: (c, o) for c, o in results}
    obs = []
    tmp = K.collection('Barrier_PreviewRun')
    def put(key, x, y=0.0, z=0.0, sx=1):
        o = by[f'{NAME}_{key}'][1][0].copy(); o.location = (x, y, z); o.scale.x = sx
        tmp.objects.link(o); obs.append(o)
    for i in range(3):
        put('GuardRail_4m', i * 4.0)
    put('GuardRail_End', 12.0)
    put('GuardRail_End', 0.0, sx=-1)
    for i in range(3):
        put('GuardPipe_2m', i * 2.0, 2.0, 0.15)
    put('GuardPipe_End', 6.0, 2.0, 0.15)
    for i in range(3):
        put('Railing_2m', 7.5 + i * 2.0, 2.0, 0.15)
    for o in obs:
        o.hide_set(False); o.hide_render = False
    a = P.render(obs, NAME, [v for v in views if v[2] != 'clay'], size=(960, 480), show=[tmp.name])
    b = P.render(obs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(960, 480), show=[tmp.name])
    for o in obs:
        K.bpy.data.objects.remove(o)
    return f'{a}, {b}'
