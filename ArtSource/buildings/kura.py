"""Kura (dozō / kurazukuri storehouse, Koedo-Kawagoe) - a complete building.

Two storeys, footprint BAY·n × 4.5 m (default 2 bays = 6.0 × 4.5 m), gabled
roof with the ridge along X, front (long side) looking to -Y. Origin at the
ground in the middle of the footprint. Heights: walls 5.42 m, ridge 7.9 m,
ridge tile 8.1 m (references: Kawagoe kurazukuri, rural dozō 2 × 3 ken).

What makes the silhouette a kura (and not a box):
- heavy roof: ~1 m eave overhang, 0.38 m thick plastered fascia, visible tile
  courses, round cover-tile rows with end tiles, tall stacked ridge (noshi)
  with a round cap and big onigawara at both ends, 0.55 m gable overhang
  with barge tile rows;
- stepped plaster cornice under the eaves (three steps, 0.40 m out);
- storey belt, drip ledge, stone footing, namako-kabe band (1 m);
- deep windows: proud frame with two steps, iron bars, thick doors open;
- crest disc on each gable.

The walls are one profile swept around the footprint (mitred corners), so
every band runs round the building without seams. Bays are columns of that
sweep: more bays = longer kura, same parts.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'buildings'
NAME = 'Kura'
ATLAS = 'Kura'
BAY, DH = 3.0, 2.25             # bay width, half depth
SLOPE = 0.58                    # roof pitch 30°
Z_TOP = 5.42                    # top of the cornice = underside of the eaves
EAVE = DH + 0.40 + 0.75         # eave line from the centre (y): 1.15 m out from the wall
OH = 0.70                       # gable overhang
FASCIA = 0.45
Z_FAS = Z_TOP + FASCIA
RIDGE_Y = 0.42                  # half width of the ridge stack foot

# wall profile (d = offset out of the footprint line, z)
WP = [(0.08, 0.0), (0.08, 0.50), (0.0, 0.50), (0.0, 1.50),               # footing, namako
      (0.04, 1.50), (0.04, 1.56), (-0.02, 1.56),                          # drip ledge
      (-0.02, 1.85), (-0.02, 2.55), (-0.02, 2.80),                        # ground storey (7 = window row)
      (0.07, 2.80), (0.07, 3.00), (-0.02, 3.00),                          # storey belt
      (-0.02, 3.55), (-0.02, 4.55), (-0.02, 5.00),                        # upper storey (13 = window row)
      (0.12, 5.00), (0.12, 5.14), (0.26, 5.14), (0.26, 5.28),             # cornice steps
      (0.40, 5.28), (0.40, Z_TOP), (-0.02, Z_TOP)]
WP_LOD1 = [(0.08, 0.0), (0.08, 0.50), (0.0, 0.50), (0.0, 1.50), (-0.02, 1.50),
           (-0.02, 1.85), (-0.02, 2.55), (-0.02, 3.55), (-0.02, 4.55), (-0.02, 5.0),
           (0.40, 5.0), (0.40, Z_TOP), (-0.02, Z_TOP)]
GROUPS = {0: [('STONE', (0, 1), 0.0), ('NAMAKO', (2,), 0.5), ('P', (3, 4, 5), 1.5),
              ('P', (6, 7, 8), 1.56), ('P', (9, 10, 11), 2.8), ('P', (12, 13, 14), 3.0),
              ('P', tuple(range(15, 22)), 5.0)],
          1: [('STONE', (0, 1), 0.0), ('NAMAKO', (2,), 0.5), ('P', (3, 4, 5), 1.5), ('P', (6,), 2.55),
              ('P', (7, 8), 3.55), ('P', (9, 10, 11), 5.0)]}
ROW = {0: (7, 13), 1: (5, 7)}   # segment index of the ground / upper window rows


def _z_under(y):
    """Underside of the roof slab (rises from the cornice to the apex)."""
    return Z_TOP + (DH + 0.40 - abs(y)) * SLOPE


def _orient(faces, centre):
    """Flip faces so they point away from centre (closed small parts)."""
    for f in faces:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - centre) < 0:
            f.normal_flip()


def _obox(bm, o, au, av, du, dv, z0, z1):
    """Box spanned by a hinge point o, two horizontal axes and a z range."""
    c = [o + au * u + av * v for u, v in ((0, 0), (du, 0), (du, dv), (0, dv))]
    lo = [bm.verts.new((p.x, p.y, z0)) for p in c]
    hi = [bm.verts.new((p.x, p.y, z1)) for p in c]
    f = {'v0': bm.faces.new([lo[0], lo[1], hi[1], hi[0]]), 'u1': bm.faces.new([lo[1], lo[2], hi[2], hi[1]]),
         'v1': bm.faces.new([lo[2], lo[3], hi[3], hi[2]]), 'u0': bm.faces.new([lo[3], lo[0], hi[0], hi[3]]),
         '-z': bm.faces.new(lo[::-1]), '+z': bm.faces.new(hi)}
    ctr = o + au * du / 2 + av * dv / 2; ctr.z = (z0 + z1) / 2
    _orient(f.values(), ctr)
    return f


def _tile_row(bm, start, end, r, n, side=None):
    """Round cover tile lying from start to end (3D); the start end is closed
    by the end-tile disc. Returns (sides, cap)."""
    start, end = Vector(start), Vector(end)
    s = (end - start).normalized()
    side = side or Vector((1, 0, 0))
    up = s.cross(side).normalized()
    if up.z < 0:
        up = -up
    if abs(up.z) < 0.2:  # ridge cap: s along x, round side up
        up = Vector((0, 0, 1))
        side = s.cross(up).normalized()
    rings = [[bm.verts.new(p + side * (r * math.cos(math.pi * i / n)) + up * (r * math.sin(math.pi * i / n)))
              for i in range(n + 1)] for p in (start, end)]
    a, b = rings
    sides = [bm.faces.new([a[i], b[i], b[i + 1], a[i + 1]]) for i in range(n)]
    for f, i in zip(sides, range(n)):
        f.normal_update()
        mid = (a[i].co + a[i + 1].co) / 2
        if f.normal.dot(mid - start) < 0:
            f.normal_flip()
    cap = bm.faces.new(a)
    cap.normal_update()
    if cap.normal.dot(s) > 0:
        cap.normal_flip()
    return sides, cap


def _window(bm, face, R, pl, z0, lod, lit, small):
    """Deep kura window cut into a wall cell facing out."""
    face.normal_update()
    n = face.normal.copy()
    t = Vector((-n.y, n.x, 0))
    cap, sides = K.extrude(bm, face, 0.12)                       # proud frame
    K.map_faces(bm, sides, pl, z0=z0)
    vs = [v.co.copy() for v in cap.verts]
    c = sum(vs, Vector()) / len(vs)
    wf = max(v.dot(t) for v in vs) - min(v.dot(t) for v in vs)
    zf0, zf1 = min(v.z for v in vs), max(v.z for v in vs)
    if lod:
        floor, walls = K.recess(bm, cap, 0.08, 0.12)
        K.map_faces(bm, walls, pl, z0=z0)
        K.map_faces(bm, [floor], R('LIGHT_WARM' if lit else 'INTERIOR'))
        return
    step, walls = K.recess(bm, cap, 0.07, 0.05)
    K.map_faces(bm, walls, pl, z0=z0)
    step2, walls = K.recess(bm, step, 0.05, 0.05)
    K.map_faces(bm, walls, pl, z0=z0)
    hole, walls = K.recess(bm, step2, 0.04, 0.28)
    K.map_faces(bm, walls + [step2], pl, z0=z0)
    K.nobevel(bm, walls + [hole])   # deep reveal: in shadow, a bevel there costs and shows nothing
    K.map_faces(bm, [hole], R('LIGHT_WARM' if lit else 'INTERIOR'))
    # iron bars just behind the inner step
    hv = [v.co.copy() for v in hole.verts]
    hw = (max(v.dot(t) for v in hv) - min(v.dot(t) for v in hv)) / 2
    hz0, hz1 = min(v.z for v in hv), max(v.z for v in hv)
    nb = 3 if small else 4
    for i in range(nb):
        p = c + t * (-hw + 2 * hw * (i + 1) / (nb + 1)) - n * 0.16
        bar = K.prism(bm, 6, 0.018, 0.018, hz0, hz1, cx=p.x, cy=p.y, cap_bottom=False, cap_top=False)
        K.map_faces(bm, bar['sides'], R('IRON')); K.nobevel(bm, bar['sides'])
    # thick doors (kannon-biraki), swung open by 100°
    th = math.radians(100)
    dw, dt = wf / 2 - 0.02, 0.16
    for sgn in (-1, 1):
        tt = t * -sgn                                  # towards the window centre when closed
        hinge = c + t * (sgn * wf / 2)
        au = tt * math.cos(th) + n * math.sin(th)      # door width, swung out
        av = n * math.cos(th) - tt * math.sin(th)      # door thickness
        d = _obox(bm, hinge, au, av, dw, dt, zf0 + 0.02, zf1 - 0.02)
        K.map_faces(bm, [d[k] for k in ('u0', 'u1', 'v1', '-z', '+z')], pl, z0=z0)
        inner, walls = K.recess(bm, d['v0'], 0.06, -0.05)   # stepped plug that fits the frame
        K.map_faces(bm, [inner] + walls, pl, z0=z0)


def _geo(lod, n_bays, plaster, lit):
    bm = K.new_bm()
    R = lambda name: A.region(ATLAS, name)
    pl = R(plaster)
    pl_flat = R(plaster + '_FLAT')   # big single faces (soffit, barge ends): no noise to stretch
    lh = n_bays * BAY / 2
    corners = [(-lh, -DH), (lh, -DH), (lh, DH), (-lh, DH)]
    wp = WP if lod == 0 else WP_LOD1
    # front: ground + upper window per bay; back: one upper window in the middle
    front, back = [], []
    for i in range(n_bays):
        cx = -lh + BAY * (i + 0.5)
        for hw in (0.55, 0.42):
            front += [(cx - hw + lh) / (2 * lh), (cx + hw + lh) / (2 * lh)]
    back = [0.5 - 0.45 / (2 * lh), 0.5 + 0.45 / (2 * lh)]
    faces = K.sweep_loop(bm, corners, wp, {0: front, 2: back})
    win = set()
    g_row, u_row = ROW[lod]
    for i in range(n_bays):
        win |= {(u_row, 0, 1 + 4 * i), (u_row, 0, 2 + 4 * i), (u_row, 0, 3 + 4 * i), (g_row, 0, 2 + 4 * i)}
    win.add((u_row, 2, 1))
    for reg, segs, z0 in GROUPS[lod]:
        r = pl if reg == 'P' else R(reg)
        for k in segs:
            for e in range(4):
                fs = [f for j, f in enumerate(faces[k][e]) if (k, e, j) not in win]
                K.map_faces(bm, fs, r, z0=z0)
    # windows
    for i in range(n_bays):
        up = K.merge(bm, [faces[u_row][0][1 + 4 * i + j] for j in range(3)])
        _window(bm, up, R, pl, 3.0, lod, lit and i == 1, small=False)
        _window(bm, faces[g_row][0][2 + 4 * i], R, pl, 1.56, lod, False, small=True)
    _window(bm, faces[u_row][2][1], R, pl, 3.0, lod, False, small=True)

    # gable walls + crest discs
    for sx in (-1, 1):
        x = sx * (lh - 0.02)
        yw = DH - 0.02
        pts = [(-yw, Z_TOP), (-yw, _z_under(yw)), (0, _z_under(0)), (yw, _z_under(yw)), (yw, Z_TOP)]
        gf = bm.faces.new([bm.verts.new((x, y, z)) for y, z in pts])
        gf.normal_update()
        if gf.normal.x * sx < 0:
            gf.normal_flip()
        K.map_faces(bm, [gf], pl, z0=Z_TOP)
        if lod == 0:
            zc, rc = Z_TOP + (_z_under(0) - Z_TOP) * 0.42, 0.32
            ring0 = [Vector((x, rc * math.cos(2 * math.pi * k / 12), zc + rc * math.sin(2 * math.pi * k / 12))) for k in range(12)]
            v0 = [bm.verts.new(p) for p in ring0]
            v1 = [bm.verts.new(p + Vector((sx * 0.05, 0, 0))) for p in ring0]
            sides = [bm.faces.new([v0[k], v0[(k + 1) % 12], v1[(k + 1) % 12], v1[k]]) for k in range(12)]
            cap = bm.faces.new(v1)
            _orient(sides + [cap], Vector((x, 0, zc)))
            K.map_faces(bm, sides, pl_flat); K.map_faces(bm, [cap], R('KAMON'))

    # roof slab: tile courses, stacked ridge, plastered fascia and soffit
    zr = Z_FAS + (EAVE - RIDGE_Y) * SLOPE                 # ridge base
    courses = 8 if lod == 0 else 1
    half = [(-EAVE, Z_TOP), (-EAVE, Z_FAS)]
    for k in range(1, courses):
        y = -EAVE + (EAVE - RIDGE_Y) * k / courses
        z = Z_FAS + (y + EAVE) * SLOPE
        half += [(y, z - 0.035), (y, z)]
    half.append((-RIDGE_Y, zr))
    layers = 6 if lod == 0 else 2
    lh_ = 0.78 / layers
    for k in range(layers):
        y = -RIDGE_Y + 0.035 * k
        half += [(y, zr + lh_ * (k + 1)), (y + 0.035, zr + lh_ * (k + 1))]
    ztop = half[-1][1]
    under = [(DH + 0.40, Z_TOP), (0, _z_under(0)), (-(DH + 0.40), Z_TOP)]
    poly = half + [(-y, z) for y, z in reversed(half)] + under
    n_half = len(half)
    sides, c0, c1 = K.poly_prism_x(bm, poly, -(lh + OH), lh + OH)
    for i, f in enumerate(sides):
        if i == 0 or i == 2 * n_half - 2:                   # fascias
            K.map_faces(bm, [f], pl, z0=Z_TOP)
        elif i >= 2 * n_half - 1:                           # soffit + underside
            K.map_faces(bm, [f], pl_flat)
        elif min(i, 2 * n_half - 2 - i) >= 2 * courses:    # ridge stack
            K.map_faces(bm, [f], R('TILE_DARK'))
        else:                                               # courses: flat tiles, risers darker
            f.normal_update()
            K.map_faces(bm, [f], R('TILE_DARK' if abs(f.normal.z) < 0.5 else 'TILE_B'))
    K.map_faces(bm, [c0, c1], pl_flat)
    if lod == 0:
        tiles = ['TILE_A', 'TILE_B', 'TILE_C']
        xs = (lh + OH - 0.3)
        nrows = int(2 * xs / 0.32) + 1
        for side in (-1, 1):
            st = Vector((0, side * (EAVE + 0.04), Z_FAS))
            en = Vector((0, side * (RIDGE_Y - 0.06), zr + 0.06 * SLOPE))   # open end buried in the ridge
            for k in range(nrows):
                x = -xs + 2 * xs * k / (nrows - 1)
                sd, cp = _tile_row(bm, st + Vector((x, 0, 0)), en + Vector((x, 0, 0)), 0.09, 5)
                K.map_faces(bm, sd + [cp], R(tiles[(k * 7 + (side > 0)) % 3])); K.nobevel(bm, sd + [cp])
            for bx in (-(lh + OH - 0.09), lh + OH - 0.09):  # barge tiles along the gable edge
                sd, cp = _tile_row(bm, st + Vector((bx, 0, 0.02)), en + Vector((bx, 0, 0.02)), 0.12, 5)
                K.map_faces(bm, sd + [cp], R('TILE_DARK')); K.nobevel(bm, sd + [cp])
        sd, cp = _tile_row(bm, (-(lh + OH), 0, ztop), (lh + OH, 0, ztop), 0.22, 8)   # ridge cap
        K.map_faces(bm, sd + [cp], R('TILE_A')); K.nobevel(bm, sd + [cp])
    # onigawara at both ridge ends
    oz = zr - 0.05
    half_o = [(-0.72, 0.0), (-0.72, 0.75), (-0.64, 1.05), (-0.54, 1.45), (-0.38, 1.12), (-0.18, 1.28), (0.0, 1.33)]
    if lod:
        half_o = [(-0.5, 0.0), (-0.5, 0.7), (0.0, 0.85)]
    opoly = [(y, oz + z) for y, z in half_o] + [(-y, oz + z) for y, z in reversed(half_o[:-1])]
    for sx in (-1, 1):
        xa, xb = sorted((sx * (lh + OH - 0.04), sx * (lh + OH + 0.16)))
        osides, oc0, oc1 = K.poly_prism_x(bm, opoly, xa, xb)
        K.map_faces(bm, osides + [oc0 if sx > 0 else oc1], R('TILE_DARK'))
        K.map_faces(bm, [oc1 if sx > 0 else oc0], R('ONI'))
    return bm


VARIANTS = {'Black': ('PLASTER_BLACK', True), 'White': ('PLASTER_WHITE', False)}


def build_variant(key, n_bays=2, lods=(0, 1)):
    plaster, lit = VARIANTS[key]
    name = f'{NAME}_{n_bays}Bay_{key}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', _geo(lod, n_bays, plaster, lit), col, [mat],
                          bevel=0.02 if lod == 0 else 0.0, hidden=lod > 0, recalc=False,
                          dissolve=True) for lod in lods]
    lh = n_bays * BAY / 2
    K.collider_box(f'COL_{name}_Walls', col, -lh - 0.1, lh + 0.1, -DH - 0.1, DH + 0.1, 0, Z_TOP)
    K.collider_box(f'COL_{name}_Roof', col, -lh - OH, lh + OH, -EAVE, EAVE, Z_TOP, 8.6)
    if lit:
        K.light_marker(f'LIGHT_{name}', col, (-lh + BAY * 1.5, -DH - 0.9, 4.0), color=(1.0, 0.7, 0.4),
                       watts=40, unity_range=6.0)
    return col, objs


def build():
    return [build_variant(k) for k in VARIANTS]


def preview(results, views):
    """Black and white kura side by side; same view directions as every asset."""
    from kit import preview as P
    for i, (col, _) in enumerate(results):
        for o in col.objects:
            o.location.x = (i - 0.5) * 9.5
    objs = [o[0] for _, o in results]
    show = [c.name for c, _ in results]
    a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(960, 640), show=show)
    b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(960, 640), show=show)
    for col, _ in results:
        for o in col.objects:
            o.location.x = 0.0
    return f'{a}, {b}'
