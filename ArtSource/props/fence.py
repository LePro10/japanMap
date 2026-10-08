"""Fences and garden walls. All modules run along +X from x = 0; chain them
end to end. The face to the street is -Y (both sides are finished).

Ishigaki_2m: free-standing dry rubble wall (ishigaki / nozura-zumi), 1.1 m,
  both faces battered, uneven face, a row of rough cap stones on top.
Ishigaki_Retain_4m: 2 m retaining wall along hillside roads and shrine
  terraces: one battered face (earth behind), cap stones, weep pipes.
Bamboo_1.8m: kenninji-gaki - cedar log post, tight vertical split bamboo,
  half-bamboo rails tied with black palm rope (ibo-musubi), bundled top
  (tamabuchi) with rope bands, bottom rail.
Board_1.8m: itabei - dark cedar boards with battens and iron nails on an
  ishigaki footing under a small tiled gable (old towns: Kiso, Koedo).
"""
import math, random
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'Fence'
ATLAS = 'Street'


def _battered(bm, x0, x1, z0, z1, y0, y1, sgn, nx, nz, jitter, rng):
    """Wall face from (y0 at z0) to (y1 at z1) - a batter when y0 != y1 -
    facing sgn*Y. Inner vertices are pushed in/out a few cm so the stones
    catch the light; the module edges stay straight so modules chain."""
    rows = []
    for j in range(nz + 1):
        t = j / nz
        row = []
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            y = y0 + (y1 - y0) * t
            if 0 < i < nx and 0 < j < nz:
                y += sgn * jitter * (rng.random() - 0.3)
                x += (x1 - x0) / nx * 0.25 * (rng.random() - 0.5)
            row.append(bm.verts.new((x, y, z0 + (z1 - z0) * t)))
        rows.append(row)
    faces = []
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new([rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]])
            f.normal_update()
            if f.normal.y * sgn < 0:
                f.normal_flip()
            faces.append(f)
    return faces, rows


def _cap_stones(bm, R, L, z, y0, y1, rng, h=(0.12, 0.2)):
    """Row of rough cap stones (tenba-ishi): slightly rotated, tops pinched."""
    x = 0.0
    out = []
    while x < L - 0.05:
        ln = min(0.32 + 0.3 * rng.random(), L - x)
        if L - x - ln < 0.2:
            ln = L - x
        hh = h[0] + (h[1] - h[0]) * rng.random()
        b = K.box(bm, x + 0.01, x + ln - 0.01, y0 - 0.03, y1 + 0.03, z - 0.04, z + hh, skip=('-z',))
        top = b['+z']
        c = top.calc_center_median()
        for v in top.verts:   # pinch the top: rounded, hand-split look
            v.co.x += (c.x - v.co.x) * (0.18 + 0.1 * rng.random())
            v.co.y += (c.y - v.co.y) * (0.22 + 0.1 * rng.random())
            v.co.z += 0.03 * (rng.random() - 0.5)
        a = math.radians(4 * (rng.random() - 0.5))
        for v in {v for f in b.values() for v in f.verts}:
            dx, dy = v.co.x - c.x, v.co.y - c.y
            v.co.x, v.co.y = c.x + dx * math.cos(a) - dy * math.sin(a), c.y + dx * math.sin(a) + dy * math.cos(a)
        K.map_faces(bm, b.values(), R('ISHIGAKI'), s_offset=rng.random() * 8, metric_z0=z - 0.6)
        out += list(b.values())
        x += ln
    return out


def _ishigaki(bm, R, lod, L=2.0, H=1.1, tb=0.36, tt=0.24, seed=3, caps=True):
    """Free-standing wall: half-thickness tb at the foot, tt at the top.
    caps=False: flat top (footing under a board fence)."""
    rng = random.Random(seed)
    nx, nz = (max(2, round(L / 0.4)), max(1, round(H / 0.25))) if lod == 0 else (1, 1)
    fr, _ = _battered(bm, 0, L, -0.05, H, -tb, -tt, -1, nx, nz, 0.05 if lod == 0 else 0, rng)
    bk, _ = _battered(bm, 0, L, -0.05, H, tb, tt, 1, nx, nz, 0.05 if lod == 0 else 0, rng)
    K.map_faces(bm, fr + bk, R('ISHIGAKI'), z0=-0.05)
    for x, sgn in ((0, -1), (L, 1)):   # end faces (only seen at the end of a run)
        e = bm.faces.new([bm.verts.new(p) for p in ((x, -tb, -0.05), (x, tb, -0.05), (x, tt, H), (x, -tt, H))])
        e.normal_update()
        if e.normal.x * sgn < 0:
            e.normal_flip()
        K.map_faces(bm, [e], R('ISHIGAKI'), z0=-0.05)
    if lod == 0 and caps:
        _cap_stones(bm, R, L, H, -tt, tt, rng, h=(0.1, 0.15))
    elif caps:
        t = K.box(bm, 0, L, -tt - 0.03, tt + 0.03, H, H + 0.14, skip=('-z',))
        K.map_faces(bm, t.values(), R('ISHIGAKI'), metric_z0=H - 0.6)
    else:
        t = bm.faces.new([bm.verts.new(p) for p in ((0, -tt, H), (L, -tt, H), (L, tt, H), (0, tt, H))])
        K.map_faces(bm, [t], R('ISHIGAKI'))


def _ishigaki_retain(bm, R, lod, L=4.0, H=1.9, seed=5):
    """Retaining wall: battered face from y=-0.35 (foot) to 0 (top), earth behind."""
    rng = random.Random(seed)
    nx, nz = (round(L / 0.4), 6) if lod == 0 else (2, 1)
    fr, rows = _battered(bm, 0, L, -0.05, H, -0.35, 0.0, -1, nx, nz, 0.045 if lod == 0 else 0, rng)
    K.map_faces(bm, fr, R('ISHIGAKI'), z0=-0.05)
    for x, sgn in ((0, -1), (L, 1)):
        e = bm.faces.new([bm.verts.new(p) for p in ((x, -0.35, -0.05), (x, 0.5, -0.05), (x, 0.5, H), (x, 0.0, H))])
        e.normal_update()
        if e.normal.x * sgn < 0:
            e.normal_flip()
        K.map_faces(bm, [e], R('ISHIGAKI'), z0=-0.05)
    if lod == 0:
        _cap_stones(bm, R, L, H, -0.02, 0.45, rng, h=(0.1, 0.16))
        yf = -0.35 * (1 - (0.6 + 0.05) / (H + 0.05))       # face depth at the pipe height
        for x in (1.0, 3.0):   # weep pipes (mizunuki): grey PVC, dark opening
            sd, _, c1 = K.tube_path(bm, [(x, yf + 0.04, 0.6), (x, yf - 0.07, 0.6)], 0.04, 8, cap1=True)
            K.map_faces(bm, sd, R('PLASTIC_GREY')); K.map_faces(bm, [c1], R('INTERIOR'))
            K.nobevel(bm, sd + [c1])
    else:
        t = K.box(bm, 0, L, -0.05, 0.45, H, H + 0.12, skip=('-z',))
        K.map_faces(bm, t.values(), R('ISHIGAKI'), metric_z0=H - 0.6)


def _rope_band(bm, R, x, c, r, w=0.022, n=6):
    """Black palm-rope band round a bundle centred at c=(y, z)."""
    sd, _, _ = K.tube_path(bm, [(x - w / 2, c[0], c[1]), (x + w / 2, c[0], c[1])], r, n, twist_up=(0, 0, 1))
    K.map_faces(bm, sd, R('ROPE_BLACK')); K.nobevel(bm, sd)
    return sd


def _bamboo(bm, R, lod):
    L, Hf = 1.8, 1.8
    # cedar log post with a chamfered top
    post = K.lathe(bm, 8 if lod == 0 else 6, [(0.065, -0.05), (0.062, Hf + 0.1), (0.05, Hf + 0.13), (0.0, Hf + 0.13)],
                   cap_bottom=False)
    if lod == 0:
        K.map_cyl(bm, post['sides'][:8], R('WOOD_BOARD'), rotate=True)
        K.map_faces(bm, post['sides'][8:], R('WOOD_POST'))
    else:
        K.map_faces(bm, post['sides'], R('WOOD_POST'))
    # tight vertical slats: a fluted slab, one flute per 6 cm slat
    n_sl = 30 if lod == 0 else 6
    z_lo = 0.06
    for sgn in (-1, 1):
        xs = []
        for i in range(n_sl):
            x0 = 0.065 + (L - 0.065) * i / n_sl
            xs.append(x0)
            if lod == 0:
                xs.append(x0 + (L - 0.065) / n_sl / 2)
        xs.append(L)
        verts_lo, verts_hi = [], []
        for j, x in enumerate(xs):
            y = sgn * (0.03 if (lod == 0 and j % 2 == 1) else 0.018)
            verts_lo.append(bm.verts.new((x, y, z_lo))); verts_hi.append(bm.verts.new((x, y, Hf)))
        fs = []
        for j in range(len(xs) - 1):
            f = bm.faces.new([verts_lo[j], verts_lo[j + 1], verts_hi[j + 1], verts_hi[j]])
            f.normal_update()
            if f.normal.y * sgn < 0:
                f.normal_flip()
            fs.append(f)
        for j, f in enumerate(fs):   # nodes staggered per slat, like real split bamboo
            K.map_faces(bm, [f], R('BAMBOO'), rotate=True, s_offset=((j // 2) * 0.137 + (sgn > 0) * 0.07) % 0.4)
    # horizontal half-bamboo rails (osae-dake) both sides, tied with ibo-musubi knots
    for z in (0.12, 0.5, 0.9, 1.3):
        for sgn in (-1, 1):
            sd, c0, c1 = K.tube_path(bm, [(0.065, sgn * 0.048, z), (L, sgn * 0.048, z)], 0.024,
                                     6 if lod == 0 else 4, reg=R('BAMBOO'))
            K.nobevel(bm, sd)
            if lod == 0:
                for x in (0.36, 0.96, 1.56):
                    _rope_band(bm, R, x, (sgn * 0.048, z), 0.03)
                    k = K.box(bm, x - 0.016, x + 0.016, sgn * 0.08 - 0.012, sgn * 0.08 + 0.012, z - 0.012, z + 0.02)
                    tl = K.box(bm, x - 0.006, x + 0.006, sgn * 0.08 - 0.006, sgn * 0.08 + 0.006, z - 0.07, z - 0.012,
                               skip=('+z',))
                    K.map_faces(bm, list(k.values()) + list(tl.values()), R('ROPE_BLACK'))
                    K.nobevel(bm, list(k.values()) + list(tl.values()))
    # tamabuchi: round top bamboo between two half-bamboo covers, rope bands round the bundle
    top, _, _ = K.tube_path(bm, [(0.065, 0, Hf + 0.035), (L, 0, Hf + 0.035)], 0.04, 8 if lod == 0 else 5,
                            reg=R('BAMBOO'))
    K.nobevel(bm, top)
    if lod == 0:
        for sgn in (-1, 1):
            sd, _, _ = K.tube_path(bm, [(0.065, sgn * 0.045, Hf - 0.01), (L, sgn * 0.045, Hf - 0.01)], 0.032, 6,
                                   reg=R('BAMBOO'))
            K.nobevel(bm, sd)
        for x in (0.25, 0.7, 1.15, 1.6):
            _rope_band(bm, R, x, (0, Hf + 0.015), 0.074, w=0.03, n=8)


def _board(bm, R, lod):
    L, Hb = 1.8, 1.9
    z_s = 0.45                                      # top of the stone footing
    _ishigaki(bm, R, lod, L, z_s, tb=0.2, tt=0.15, seed=7, caps=False)
    sill = K.box(bm, 0, L, -0.07, 0.07, z_s, z_s + 0.1, skip=('-x', '+x'))   # dodai
    K.map_faces(bm, sill.values(), R('WOOD_BOARD'))
    post = K.box(bm, -0.06, 0.06, -0.06, 0.06, z_s, Hb + 0.04, skip=('-z',))
    K.map_faces(bm, post.values(), R('WOOD_BOARD'), rotate=True)
    zb = z_s + 0.1
    for sgn in (-1, 1):
        bx = [0.06 + 0.1725 * i for i in range(10)] + [L]   # one face per board, grain per board
        g = K.grid_plane(bm, lambda u, z, s=sgn: (u, s * 0.02, z), bx, [zb, Hb], (0, sgn, 0))
        K.map_faces(bm, g.values(), R('WOOD_BOARD'), rotate=True)
    rails = (zb + 0.06, Hb - 0.12)
    for z in rails:
        r_ = K.box(bm, 0.06, L, -0.035, 0.035, z, z + 0.07, skip=('-x', '+x'))
        K.map_faces(bm, r_.values(), R('WOOD_BOARD'))
    kasagi = K.box(bm, 0, L, -0.08, 0.08, Hb - 0.02, Hb + 0.04, skip=('-x', '+x'))
    K.map_faces(bm, kasagi.values(), R('WOOD_BOARD'))
    if lod == 0:
        for x in [0.06 + 0.3 * i for i in range(1, 6)]:   # battens with iron nail heads on the street side
            b = K.box(bm, x - 0.022, x + 0.022, -0.038, -0.02, zb, Hb - 0.02, skip=('+y',))
            K.map_faces(bm, b.values(), R('WOOD_BOARD'), rotate=True)
            for z in rails:
                nl = K.box(bm, x - 0.008, x + 0.008, -0.044, -0.038, z + 0.027, z + 0.043, skip=('+y',))
                K.map_faces(bm, nl.values(), R('BLACK')); K.nobevel(bm, nl.values())
    # small gable roof with tile rows down both slopes, eave boards under the edges
    z0, zr, w = Hb + 0.04, Hb + 0.24, 0.32
    roof = [(-w, z0 - 0.01), (-w, z0 + 0.04), (0, zr + 0.05), (w, z0 + 0.04), (w, z0 - 0.01), (0, zr - 0.04)]
    sides, c0, c1 = K.poly_prism_x(bm, roof, 0.0, L)
    K.map_faces(bm, sides, R('TILE')); K.map_faces(bm, [c0, c1], R('TILE_DARK'))
    if lod == 0:
        for sgn in (-1, 1):
            eb = K.box(bm, 0, L, sgn * (w - 0.02) - 0.012, sgn * (w - 0.02) + 0.012, z0 - 0.07, z0 - 0.01,
                       skip=('-x', '+x'))
            K.map_faces(bm, eb.values(), R('WOOD_BOARD'))
            for i in range(9):
                x = 0.1 + i * 0.2
                st = Vector((x, sgn * (w + 0.02), z0 + 0.06)); en = Vector((x, sgn * 0.05, zr + 0.04))
                s_ = (en - st).normalized(); side = Vector((1, 0, 0)); up = s_.cross(side)
                if up.z < 0:
                    up = -up
                ring = lambda p: [bm.verts.new(p + side * (0.035 * math.cos(math.pi * k / 4)) + up * (0.035 * math.sin(math.pi * k / 4)))
                                  for k in range(5)]
                a, b = ring(st), ring(en)
                fs = [bm.faces.new([a[k], b[k], b[k + 1], a[k + 1]]) for k in range(4)]
                cap = bm.faces.new(a)
                for f in fs:   # outward = away from the row's axis
                    f.normal_update()
                    c = f.calc_center_median(); axis_pt = st + s_ * (c - st).dot(s_)
                    if f.normal.dot(c - axis_pt) < 0:
                        f.normal_flip()
                cap.normal_update()
                if cap.normal.dot(s_) > 0:
                    cap.normal_flip()
                K.map_faces(bm, fs + [cap], R('TILE_DARK')); K.nobevel(bm, fs + [cap])
        ridge, _, _ = K.tube_path(bm, [(0, 0, zr + 0.06), (L, 0, zr + 0.06)], 0.05, 6)
        K.map_faces(bm, ridge, R('TILE_DARK')); K.nobevel(bm, ridge)


BUILDERS = {'Ishigaki_2m': (_ishigaki, 2.0, 1.3, 0.4), 'Ishigaki_Retain_4m': (_ishigaki_retain, 4.0, 2.05, 0.4),
            'Bamboo_1.8m': (_bamboo, 1.8, 1.95, 0.12), 'Board_1.8m': (_board, 1.8, 2.25, 0.25)}


def build_variant(variant, lods=(0, 1)):
    fn, L, Hh, D = BUILDERS[variant]
    name = f'{NAME}_{variant}'.replace('.', '_')
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = []
    for lod in lods:
        bm = K.new_bm()
        fn(bm, lambda n: A.region(ATLAS, n), lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', bm, col, [mat], bevel=0.008 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    y1 = 0.45 if variant == 'Ishigaki_Retain_4m' else D
    K.collider_box(f'COL_{name}', col, 0.0, L, -D, y1, 0, Hh)
    return col, objs


def build():
    return [build_variant(v) for v in BUILDERS]


def preview(results, views):
    """Runs side by side: ishigaki 2 x 2 m, retaining wall 4 m, bamboo 3, board 3."""
    from kit import preview as P
    by = {c.name: (c, o) for c, o in results}
    tmp = K.collection('Fence_PreviewRun')
    obs = []
    def put(key, x, y=0.0):
        o = by[key][1][0].copy(); o.location = (x, y, 0); tmp.objects.link(o); obs.append(o)
    put('Fence_Ishigaki_Retain_4m', -9.0, 1.0)
    for i in range(2):
        put('Fence_Ishigaki_2m', -4.6 + i * 2.0)
    for i in range(3):
        put('Fence_Bamboo_1_8m', 0.0 + i * 1.8)
    for i in range(3):
        put('Fence_Board_1_8m', 5.8 + i * 1.8)
    for o in obs:
        o.hide_set(False); o.hide_render = False
    a = P.render(obs, NAME, [v for v in views if v[2] != 'clay'], size=(960, 480), show=[tmp.name])
    b = P.render(obs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(960, 480), show=[tmp.name])
    for o in obs:
        K.bpy.data.objects.remove(o)
    return f'{a}, {b}'
