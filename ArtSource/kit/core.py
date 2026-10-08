"""Blender side of the style kit: atlases as materials, mesh building blocks,
atlas UV mapping, bevels, LODs, export.

Conventions (STYLE-KIT.md): metres, origin at ground centre, the asset's
front looks to Blender -Y (Unity +Z after FBX export), one mesh per LOD.
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector
from . import atlas as A

ART = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # ArtSource/
TEX_DIR = os.path.join(ART, 'exports', 'textures')
SCENE = 'ArtKit'


# ── scene ───────────────────────────────────────────────────────────────────

def scene():
    sc = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    if bpy.context.window:
        bpy.context.window.scene = sc
    sc.unit_settings.system = 'METRIC'
    return sc


def collection(name):
    """Fresh, empty collection for one asset (old content removed)."""
    sc = scene()
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
    if col.name not in sc.collection.children:
        sc.collection.children.link(col)
    return col


# ── atlases → images → materials ────────────────────────────────────────────

def _image(name, arr, colorspace):
    img = bpy.data.images.get(name)
    if img and tuple(img.size) != (A.SIZE, A.SIZE):
        bpy.data.images.remove(img); img = None
    if not img:
        img = bpy.data.images.new(name, A.SIZE, A.SIZE, alpha=True)
    img.colorspace_settings.name = colorspace
    img.alpha_mode = 'CHANNEL_PACKED'
    img.pixels.foreach_set(arr.ravel())
    os.makedirs(TEX_DIR, exist_ok=True)
    img.filepath_raw = os.path.join(TEX_DIR, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


_built = set()


def atlas_images(name, rebuild=False):
    if name in _built and not rebuild and bpy.data.images.get(f'T_{name}_BaseColor'):
        return [bpy.data.images[f'T_{name}_{k}'] for k in ('BaseColor', 'MaskMap', 'Emission')]
    base, mask, emit = A.build_maps(name)
    imgs = [_image(f'T_{name}_BaseColor', base, 'sRGB'),
            _image(f'T_{name}_MaskMap', mask, 'Non-Color'),
            _image(f'T_{name}_Emission', emit, 'sRGB')]
    _built.add(name)
    return imgs


def _principled(nt):
    return next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')


def atlas_material(name, emission_strength=4.0):
    """M_<Style>_Atlas: the one opaque material of a style."""
    base, mask, emit = atlas_images(name)
    mname = f'M_{name}_Atlas'
    mat = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'):
            nt.nodes.remove(n)
    bsdf = _principled(nt)
    L = nt.links

    def tex(img, x, y):
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img
        n.extension = 'REPEAT'; n.location = (x, y)
        return n
    tb, tm, te = tex(base, -700, 300), tex(mask, -700, 0), tex(emit, -700, -300)
    L.new(tb.outputs['Color'], bsdf.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-400, 50)
    L.new(tm.outputs['Color'], sep.inputs['Color'])
    L.new(sep.outputs[0], bsdf.inputs['Metallic'])
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.location = (-400, -100)
    inv.inputs[0].default_value = 1.0
    L.new(tm.outputs['Alpha'], inv.inputs[1])
    L.new(inv.outputs[0], bsdf.inputs['Roughness'])
    L.new(te.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = emission_strength
    mat.use_backface_culling = True  # like Unity: a flipped face shows up as a hole in the preview
    return mat


def cutout_material(name):
    """M_<Atlas>_Atlas with alpha clipping (leaf cards, Flora): the opaque
    atlas material plus BaseColor.a > 0.5 as a hard cut, both faces drawn
    (cards are single quads). Unity: URP/Lit, Alpha Clipping 0.5, Render Face Both."""
    mat = atlas_material(name, emission_strength=0.0)
    nt = mat.node_tree
    tb = next(n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name.endswith('_BaseColor'))
    clip = nt.nodes.new('ShaderNodeMath'); clip.operation = 'GREATER_THAN'; clip.location = (-400, 300)
    clip.inputs[1].default_value = 0.5
    nt.links.new(tb.outputs['Alpha'], clip.inputs[0])
    nt.links.new(clip.outputs[0], _principled(nt).inputs['Alpha'])
    try:
        mat.surface_render_method = 'DITHERED'
    except (AttributeError, TypeError):
        pass
    mat.use_backface_culling = False
    return mat


def glass_material():
    """M_Glass: the one shared transparent material (all props and buildings)."""
    mat = bpy.data.materials.get('M_Glass') or bpy.data.materials.new('M_Glass')
    mat.use_nodes = True
    b = _principled(mat.node_tree)
    b.inputs['Base Color'].default_value = (0.02, 0.025, 0.03, 1)
    b.inputs['Roughness'].default_value = 0.04
    b.inputs['Alpha'].default_value = 0.22
    try:
        mat.surface_render_method = 'BLENDED'
        mat.use_backface_culling = True
    except (AttributeError, TypeError):
        pass
    return mat


# ── mesh building blocks (bmesh; all return the faces they made) ────────────

def new_bm():
    """BMesh with every custom layer the kit uses created up front: adding a
    layer later invalidates the Python references to faces already built."""
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    bm.faces.layers.int.new('nobevel')
    bm.edges.layers.float.new('bevel_weight_edge')
    return bm


def box(bm, x0, x1, y0, y1, z0, z1, skip=()):
    v = [bm.verts.new(c) for c in [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
    idx = {'-z': (0, 3, 2, 1), '+z': (4, 5, 6, 7), '-y': (0, 1, 5, 4),
           '+y': (2, 3, 7, 6), '-x': (3, 0, 4, 7), '+x': (1, 2, 6, 5)}
    faces = {k: bm.faces.new([v[i] for i in ids]) for k, ids in idx.items() if k not in skip}
    for vv in v:
        if not vv.link_faces:
            bm.verts.remove(vv)
    return faces


def grid_front(bm, xs, zs, y):
    """A wall plane at y facing -Y, split at xs × zs. Returns {(col, row): face}.
    Cells are later merged / recessed, so neighbours share verts (no T-junctions)."""
    v = {(i, j): bm.verts.new((x, y, z)) for i, x in enumerate(xs) for j, z in enumerate(zs)}
    return {(i, j): bm.faces.new([v[i, j], v[i + 1, j], v[i + 1, j + 1], v[i, j + 1]])
            for i in range(len(xs) - 1) for j in range(len(zs) - 1)}


def grid_plane(bm, pos, us, zs, normal):
    """General grid: pos(u, z) -> (x, y, z) on a plane; faces flipped to point
    along normal. Returns {(col, row): face}."""
    v = {(i, j): bm.verts.new(pos(u, z)) for i, u in enumerate(us) for j, z in enumerate(zs)}
    out = {}
    for i in range(len(us) - 1):
        for j in range(len(zs) - 1):
            f = bm.faces.new([v[i, j], v[i + 1, j], v[i + 1, j + 1], v[i, j + 1]])
            f.normal_update()
            if f.normal.dot(Vector(normal)) < 0:
                f.normal_flip()
            out[i, j] = f
    return out


def slats(bm, axis_pos, along, zs, depth, thick=0.012):
    """Louvre slats in a vent recess: one thin bar per z, along = (a0, a1) on the
    wall, axis_pos(a, z, d) -> (x, y, z) where d runs out of the wall."""
    faces = []
    for z in zs:
        vs = [bm.verts.new(axis_pos(a, z + dz, d)) for a in along for dz, d in
              ((0, 0), (thick, 0), (thick, depth), (0, depth))]
        A, B = vs[:4], vs[4:]
        for k in range(4):
            f = bm.faces.new([A[k], B[k], B[(k + 1) % 4], A[(k + 1) % 4]])
            faces.append(f)
    return faces


def merge(bm, faces):
    """Dissolve neighbouring faces into one (e.g. a window spanning grid cells)."""
    res = bmesh.ops.dissolve_faces(bm, faces=list(faces))
    return res['region'][0]


def sweep_loop(bm, corners, profile, splits=None):
    """Sweep a wall profile (d, z) around a closed footprint (corners CCW seen
    from above; d = outward offset from the footprint line) with mitred
    corners. splits[e] = list of 0..1 positions along edge e (window columns).
    Returns faces[seg][edge][col]; faces point outward."""
    n = len(corners)
    C = [Vector((c[0], c[1], 0)) for c in corners]
    nrm = []
    for e in range(n):
        d = C[(e + 1) % n] - C[e]
        nrm.append(Vector((d.y, -d.x, 0)).normalized())
    corner_v = {}
    for c in range(n):
        n1, n2 = nrm[c - 1], nrm[c]
        m = (n1 + n2) / (1 + n1.dot(n2))   # mitre: offset d along both edge normals
        corner_v[c] = [bm.verts.new(C[c] + m * d + Vector((0, 0, z))) for d, z in profile]
    faces = [[[] for _ in range(n)] for _ in range(len(profile) - 1)]
    for e in range(n):
        A, B = C[e], C[(e + 1) % n]
        ts = sorted((splits or {}).get(e, []))
        cols = [corner_v[e]]
        for t in ts:
            P = A.lerp(B, t)
            cols.append([bm.verts.new(P + nrm[e] * d + Vector((0, 0, z))) for d, z in profile])
        cols.append(corner_v[(e + 1) % n])
        for j in range(len(cols) - 1):
            a, b = cols[j], cols[j + 1]
            for k in range(len(profile) - 1):
                faces[k][e].append(bm.faces.new([a[k], b[k], b[k + 1], a[k + 1]]))
    return faces


def tube_path(bm, pts, r, n=6, cap0=False, cap1=False, twist_up=(0, 0, 1), reg=None):
    """Tube along a polyline (cables, pipes, bolts, braces). Rings are
    oriented by the averaged tangent so bends stay round. Returns
    (sides, cap0, cap1); faces point outward. With a strip `reg` the sides
    are unwrapped along the tube: U = length in metres, V = once round."""
    P = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        up = Vector(twist_up)
        if abs(t.dot(up)) > 0.95:
            up = Vector((1, 0, 0))
        a = t.cross(up).normalized(); b = t.cross(a).normalized()
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * r)
                      for k in range(n)])
    sides = []
    uvl = _uv(bm)
    dist = [0.0]
    for i in range(1, len(P)):
        dist.append(dist[-1] + (P[i] - P[i - 1]).length)
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(n):
            f = bm.faces.new([A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]])
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - (P[i] + P[i + 1]) / 2) < 0:
                f.normal_flip()
            if reg is not None and reg['kind'] == 'strip':
                u0, v0, u1, v1 = reg['uv']
                for l in f.loops:
                    j = 0 if l.vert in A else 1
                    kk = (A if j == 0 else B).index(l.vert)
                    kk = n if (kk == 0 and k == n - 1) else kk      # last face closes the ring at V = 1
                    l[uvl].uv = (dist[i + j] / reg['w_m'], v0 + kk / n * (v1 - v0))
            sides.append(f)
    c0 = c1 = None
    if cap0:
        c0 = bm.faces.new(rings[0]); c0.normal_update()
        if c0.normal.dot(P[0] - P[1]) < 0:
            c0.normal_flip()
    if cap1:
        c1 = bm.faces.new(rings[-1]); c1.normal_update()
        if c1.normal.dot(P[-1] - P[-2]) < 0:
            c1.normal_flip()
    return sides, c0, c1


def catenary(p0, p1, sag, segs=12):
    """Points of a hanging cable from p0 to p1 with the given mid-span sag."""
    p0, p1 = Vector(p0), Vector(p1)
    out = []
    for i in range(segs + 1):
        t = i / segs
        p = p0.lerp(p1, t)
        p.z -= sag * 4 * t * (1 - t)   # parabola: close to a catenary for small sag
        out.append(p)
    return out


def poly_prism_x(bm, poly, x0, x1):
    """Closed (y, z) outline extruded along X from x0 to x1, both ends capped.
    Returns (sides[i] for edge i -> i+1, cap at x0, cap at x1)."""
    a = [bm.verts.new((x0, y, z)) for y, z in poly]
    b = [bm.verts.new((x1, y, z)) for y, z in poly]
    n = len(poly)
    sides = [bm.faces.new([a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]]) for i in range(n)]
    c0, c1 = bm.faces.new(a), bm.faces.new(b)
    for f, sign in ((c0, -1), (c1, 1)):
        f.normal_update()
        if f.normal.x * sign < 0:
            f.normal_flip()
    # side normal = x × edge = (0, -dz, dy): inward for a counter-clockwise (y, z) outline
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    if area > 0:
        for f in sides:
            f.normal_flip()
    return sides, c0, c1


def extrude_profile(bm, profile, xs, back_y=None):
    """Sweep a (y, z) cross-section along X, split at xs (modular walls).
    Profile runs bottom/front to top; faces point away from the wall body.
    Returns (faces[seg][col], caps): caps close both ends down to back_y
    (wall thickness), for pieces that end a building row."""
    v = [[bm.verts.new((x, y, z)) for (y, z) in profile] for x in xs]
    faces = [[bm.faces.new([v[i][k], v[i + 1][k], v[i + 1][k + 1], v[i][k + 1]])
              for i in range(len(xs) - 1)] for k in range(len(profile) - 1)]
    caps = []
    if back_y is not None:
        (y_top, z_top), (y_bot, z_bot) = profile[-1], profile[0]
        for i, sign in ((0, -1), (len(xs) - 1, 1)):
            x = xs[i]
            ring = v[i] + [bm.verts.new((x, back_y, z_top)), bm.verts.new((x, back_y, z_bot))]
            f = bm.faces.new(ring)
            f.normal_update()
            if f.normal.x * sign < 0:
                f.normal_flip()
            caps.append(f)
    return faces, caps


def lathe(bm, n, profile, phase=0.0, cx=0.0, cy=0.0, cap_bottom=True, cap_top=True, lift=None):
    """Revolve a (radius, z) profile, bottom to top, with n sides.
    radius is the circumradius; r=0 makes a pole. lift(i, ring) -> dz lets
    corners rise (curled roof eaves). Returns dict(sides=[...], bottom, top)."""
    rings = []
    for k, (r, z) in enumerate(profile):
        if r == 0:
            rings.append([bm.verts.new((cx, cy, z))])
            continue
        ring = []
        for i in range(n):
            a = phase + 2 * math.pi * i / n
            dz = lift(i, k) if lift else 0.0
            ring.append(bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z + dz)))
        rings.append(ring)
    sides = []
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            if len(a) == 1:
                sides.append(bm.faces.new([a[0], b[i], b[j]]))
            elif len(b) == 1:
                sides.append(bm.faces.new([a[i], a[j], b[0]]))
            else:
                sides.append(bm.faces.new([a[i], a[j], b[j], b[i]]))
    out = dict(sides=sides, bottom=None, top=None, rings=rings)
    if cap_bottom and len(rings[0]) > 1:
        out['bottom'] = bm.faces.new(list(reversed(rings[0])))
    if cap_top and len(rings[-1]) > 1:
        out['top'] = bm.faces.new(rings[-1])
    return out


def prism(bm, n, r0, r1, z0, z1, **kw):
    return lathe(bm, n, [(r0, z0), (r1, z1)], **kw)


def recess(bm, face, inset, depth):
    """Inset a face and push it in: returns (floor face, wall faces)."""
    res = bmesh.ops.inset_individual(bm, faces=[face], thickness=inset, depth=0.0)
    walls = [f for f in res['faces']]
    face.normal_update()
    nrm = face.normal.copy()
    bmesh.ops.translate(bm, verts=list(face.verts), vec=-nrm * depth)
    return face, walls


def extrude(bm, face, dist):
    """Extrude a face along its normal: returns (cap face, side faces)."""
    res = bmesh.ops.extrude_discrete_faces(bm, faces=[face])
    cap = res['faces'][0]
    cap.normal_update()
    bmesh.ops.translate(bm, verts=list(cap.verts), vec=cap.normal * dist)
    sides = [f for e in cap.edges for f in e.link_faces if f is not cap]
    return cap, sides


# ── atlas UV mapping ────────────────────────────────────────────────────────

def _uv(bm):
    return bm.loops.layers.uv.verify()


def _face_st(face):
    """Per-loop (s, t) in metres: s horizontal along the face, t up the face
    (vertical faces) or along +y (horizontal faces)."""
    n = face.normal
    if abs(n.z) < 0.7:
        tang = Vector((-n.y, n.x, 0)).normalized()
        return [(l.vert.co.dot(tang), l.vert.co.z) for l in face.loops], False
    sgn = 1 if n.z > 0 else -1
    xs = [l.vert.co.x for l in face.loops]; ys = [l.vert.co.y for l in face.loops]
    if max(ys) - min(ys) > max(xs) - min(xs):   # long side along y (ledges on gable walls): u follows it
        return [(l.vert.co.y * sgn, l.vert.co.x) for l in face.loops], True
    return [(l.vert.co.x * sgn, l.vert.co.y) for l in face.loops], True


STRETCH = []  # (region, metres over) - strips used on surfaces taller than the strip


def map_faces(bm, faces, reg, z0=None, zrange=None, rotate=False, s_offset=0.0, metric_z0=None):
    """Map faces into an atlas region (texel density stays constant).
    strip: metric in both axes. s runs along U and repeats; t starts at z0
      (default: bottom of these faces) so grime sits at the bottom of the
      part. Horizontal faces start t at their own edge. A surface taller than
      the strip is clamped and reported in STRETCH.
    cell: one swatch; t over zrange (default: these faces' height) only picks
      the grime gradient, which is smooth, so nothing visibly stretches.
    rect: each face filled exactly (one graphic per face).
    rotate: swap axes (grain along the height of wooden posts)."""
    uv = _uv(bm)
    u0, v0, u1, v1 = reg['uv']
    faces = [f for f in faces if f is not None]
    if not faces:
        return
    z0 = metric_z0 if metric_z0 is not None else z0
    zs = [v.co.z for f in faces for v in f.verts]
    if z0 is None:
        z0 = min(zs)
    zlo, zhi = zrange or (min(zs), max(zs))
    over, worst = 0.0, None
    for f in faces:
        f.normal_update()  # new bmesh faces carry a zero normal until updated
        st, horizontal = _face_st(f)
        if rotate:
            st = [(t, s) for s, t in st]
            horizontal = True  # t is now horizontal: start at the face edge
        ss = [p[0] for p in st]; ts = [p[1] for p in st]
        for l, (s, t) in zip(f.loops, st):
            if reg['kind'] == 'strip':
                uu = (s + s_offset) / reg['w_m']
                tt = (t - (min(ts) if horizontal else z0)) / reg['h_m']
                if (tt - 1.0) * reg['h_m'] > over:
                    over, worst = (tt - 1.0) * reg['h_m'], f
            else:
                uu = (s - min(ss)) / max(max(ss) - min(ss), 1e-6)
                if reg['kind'] == 'rect':
                    tt = (t - min(ts)) / max(max(ts) - min(ts), 1e-6)
                else:
                    # stay clear of the cell borders in both axes: mip levels blend
                    # neighbouring cells (an emissive neighbour glowed along the edge)
                    uu = 0.3 + 0.4 * uu
                    tt = 0.12 + 0.76 * ((t - zlo) / max(zhi - zlo, 1e-6)) if not horizontal else 0.85
                uu = u0 + uu * (u1 - u0)
            tt = min(max(tt, 0.0), 1.0)
            l[uv].uv = (uu, v0 + tt * (v1 - v0))
    if over > 0.02:
        c = worst.calc_center_median()
        STRETCH.append((reg['name'], round(over, 2), tuple(round(x, 1) for x in c)))


def map_cyl(bm, faces, reg, cx=0.0, cy=0.0, z0=None, rotate=False, z_len=None, seam=math.pi / 2):
    """Cylindrical unwrap for round parts (poles, pipes): the circumference
    runs once across the region. The seam sits at angle `seam` (default +Y,
    the back); build the part with a vertex there (lathe phase 0, n % 4 == 0)
    so no face straddles it - such a face would reach outside the region.
    strip, rotate=True: U = height in metres (repeats), V = once round.
    rect: U = once round, V = height over z_len (tiger-stripe cover)."""
    uv = _uv(bm)
    u0, v0, u1, v1 = reg['uv']
    faces = [f for f in faces if f is not None]
    zs = [v.co.z for f in faces for v in f.verts]
    z0 = min(zs) if z0 is None else z0
    z_len = z_len or (max(zs) - z0) or 1.0
    tau = 2 * math.pi
    for f in faces:
        c = f.calc_center_median()
        ac = (math.atan2(c.y - cy, c.x - cx) - seam) % tau
        for l in f.loops:
            a = (math.atan2(l.vert.co.y - cy, l.vert.co.x - cx) - seam) % tau
            a += tau * round((ac - a) / tau)          # unwrap next to the face centre
            r = min(max(a / tau, 0.0), 1.0)
            if reg['kind'] == 'strip':
                if not rotate:
                    raise ValueError('map_cyl: a strip needs rotate=True (height along U)')
                uu, vv = (l.vert.co.z - z0) / reg['w_m'], v0 + r * (v1 - v0)
            else:
                uu = u0 + r * (u1 - u0)
                vv = v0 + min(max((l.vert.co.z - z0) / z_len, 0), 1) * (v1 - v0)
            l[uv].uv = (uu, vv)


def map_box(bm, faces, reg, z0=None):
    """Box projection for organic shapes (rocks, shrubs): each face is
    projected along its dominant axis, so neighbours facing the same way
    share one continuous mapping (per-face tangents would seam everywhere).
    Strips only. Sides: U = horizontal position, V = z - z0. Tops: U = x,
    V = y from the lowest y of all top faces."""
    uv = _uv(bm)
    u0, v0, u1, v1 = reg['uv']
    faces = [f for f in faces if f is not None]
    if not faces:
        return
    z0 = min(v.co.z for f in faces for v in f.verts) if z0 is None else z0
    for f in faces:
        f.normal_update()
    tops = [f for f in faces if abs(f.normal.z) >= max(abs(f.normal.x), abs(f.normal.y))]
    y0 = min((v.co.y for f in tops for v in f.verts), default=0.0)
    over, worst = 0.0, None
    for f in faces:
        n = f.normal
        for l in f.loops:
            c = l.vert.co
            if f in tops:
                s, t = c.x * (1 if n.z > 0 else -1), c.y - y0
            elif abs(n.x) > abs(n.y):
                s, t = c.y * (1 if n.x > 0 else -1), c.z - z0
            else:
                s, t = -c.x * (1 if n.y > 0 else -1), c.z - z0
            tt = t / reg['h_m']
            if (tt - 1.0) * reg['h_m'] > over:
                over, worst = (tt - 1.0) * reg['h_m'], f
            l[uv].uv = (s / reg['w_m'], v0 + min(max(tt, 0.0), 1.0) * (v1 - v0))
    if over > 0.02:
        c = worst.calc_center_median()
        STRETCH.append((reg['name'], round(over, 2), tuple(round(x, 1) for x in c)))


def map_span(bm, faces, reg, t, up=(0.0, 0.0, 1.0), flip_u=False):
    """Map several faces into one rect by planar projection (U along t, V
    along up) over their joint extent: one graphic across parts split by
    geometry (noren panels, a sign face cut by its frame)."""
    uv = _uv(bm)
    u0, v0, u1, v1 = reg['uv']
    faces = [f for f in faces if f is not None]
    t, up = Vector(t), Vector(up)
    ss = [l.vert.co.dot(t) for f in faces for l in f.loops]
    vs = [l.vert.co.dot(up) for f in faces for l in f.loops]
    s0, s1, w0, w1 = min(ss), max(ss), min(vs), max(vs)
    for f in faces:
        for l in f.loops:
            a = (l.vert.co.dot(t) - s0) / max(s1 - s0, 1e-6)
            if flip_u:
                a = 1 - a
            b = (l.vert.co.dot(up) - w0) / max(w1 - w0, 1e-6)
            l[uv].uv = (u0 + a * (u1 - u0), v0 + b * (v1 - v0))


def nobevel(bm, faces):
    """Exclude faces from the bevel (tile rows, bars: many small edges, no gain)."""
    lay = bm.faces.layers.int.get('nobevel') or bm.faces.layers.int.new('nobevel')
    for f in faces:
        if f is not None:
            f[lay] = 1


def _bevel_weights(bm, angle):
    lay = bm.faces.layers.int.get('nobevel')
    w = bm.edges.layers.float.get('bevel_weight_edge') or bm.edges.layers.float.new('bevel_weight_edge')
    for e in bm.edges:
        lf = e.link_faces
        ok = len(lf) == 2 and not (lay and (lf[0][lay] or lf[1][lay]))
        e[w] = 1.0 if ok and e.calc_face_angle(0.0) > angle else 0.0


# ── objects, bevel, LOD ─────────────────────────────────────────────────────

def mesh_object(name, bm, col, mats, bevel=0.0, bevel_angle=35.0, smooth=True, hidden=False, recalc=True,
                bevel_segments=1, dissolve=False):
    me = bpy.data.meshes.get(name)
    if me:
        me.clear_geometry()
    else:
        me = bpy.data.meshes.new(name)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if recalc:  # open shells (wall modules) keep their built winding instead
        # a lone face (glass pane, signal lens) has no inside/outside: recalc may
        # flip it and the back-face culling hides it - keep the built facing
        lone = {}
        for f in bm.faces:
            f.normal_update()
            if all(len(e.link_faces) == 1 for e in f.edges):
                lone[f] = f.normal.copy()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f, n in lone.items():
            f.normal_update()
            if f.normal.dot(n) < 0:
                f.normal_flip()
    if dissolve:
        # grid splits (window columns) cut every profile edge into pieces, and the
        # bevel pays per piece: merge flat neighbours back (same UVs/material only)
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), use_dissolve_boundaries=False,
                                 verts=list(bm.verts), edges=list(bm.edges), delimit={'UV', 'MATERIAL'})
    # concave n-gons (gables, onigawara) are split here, so Unity never has to guess.
    # BEAUTY (ear clip + edge flips): plain ear clipping left long slivers in the
    # U-shaped wall n-gons round a window, and the bevel turned them into holes
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4],
                          quad_method='BEAUTY', ngon_method='BEAUTY')
    if bevel > 0:
        _bevel_weights(bm, math.radians(bevel_angle))
    me.materials.clear()  # before to_mesh: clearing afterwards resets every face to slot 0
    for m in mats:
        me.materials.append(m)
    bm.to_mesh(me); bm.free()
    used = {p.material_index for p in me.polygons}
    unused = [m.name for i, m in enumerate(mats) if i not in used]
    if unused:  # a silently dropped slot once turned the vending glass into opaque plastic
        raise ValueError(f'{name}: material slots never used: {unused}')
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if bevel > 0:
        md = ob.modifiers.new('Bevel', 'BEVEL')
        md.width = bevel; md.segments = bevel_segments
        md.limit_method = 'WEIGHT'; md.edge_weight = 'bevel_weight_edge'
        md.harden_normals = True; md.use_clamp_overlap = True
    if smooth:
        # hard edges stay crisp (also where the bevel skips), round parts smooth
        me.set_sharp_from_angle(angle=math.radians(bevel_angle))
    if hidden:  # LOD1+ stays out of view and renders, but is exported
        ob.hide_set(True); ob.hide_render = True
    return ob


def tri_count(ob):
    """Triangles after modifiers. Hidden objects are not evaluated by the
    depsgraph (the bevel silently drops out), so unhide while counting."""
    cols = [c for c in ob.users_collection if c.hide_viewport]
    hid = ob.hide_get(); hv = ob.hide_viewport
    for c in cols:
        c.hide_viewport = False
    ob.hide_set(False); ob.hide_viewport = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    for c in cols:
        c.hide_viewport = True
    ob.hide_set(hid); ob.hide_viewport = hv
    return n


def collider_box(name, col, x0, x1, y0, y1, z0, z1):
    """COL_<name>: simple convex shape; Unity turns it into a collider."""
    bm = bmesh.new()
    box(bm, x0, x1, y0, y1, z0, z1)
    me = bpy.data.meshes.get(name) or bpy.data.meshes.new(name)
    me.clear_geometry(); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.display_type = 'WIRE'; ob.hide_render = True
    return ob


def marker(name, col, loc, **props):
    """Plain empty marking a point for Unity (cable attach, seat, spawn ...)."""
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'; ob.empty_display_size = 0.15
    ob.location = loc
    for k, v in props.items():
        ob[k] = v
    col.objects.link(ob)
    return ob


def light_marker(name, col, loc, color=(1.0, 0.72, 0.42), watts=10.0, unity_range=5.0, unity_intensity=1.0):
    """LIGHT_<name> empty: where the asset wants a real light. Exported with
    the FBX (custom properties ride along) so Unity can put a light there."""
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'SPHERE'; ob.empty_display_size = 0.1
    ob.location = loc
    ob['color'] = color; ob['watts'] = watts
    ob['unity_range'] = unity_range; ob['unity_intensity'] = unity_intensity
    col.objects.link(ob)
    return ob


def part_costs(module, names, fn):
    """Triangles per part: wraps the named builder functions of `module`
    (each takes the build context c with c.bm first), runs fn() and returns
    {name: triangles before bevel}. Nested calls count to the outermost.
    Measure first, then cut (STYLE-KIT: Budget messen statt raten)."""
    from collections import defaultdict
    cost, depth = defaultdict(int), [0]
    tris = lambda bm: sum(len(f.verts) - 2 for f in bm.faces)
    orig = {n: getattr(module, n) for n in names}

    def wrap(n):
        f = orig[n]

        def g(c, *a, **k):
            depth[0] += 1
            t0 = tris(c.bm)
            try:
                return f(c, *a, **k)
            finally:
                depth[0] -= 1
                if depth[0] == 0:
                    cost[n] += tris(c.bm) - t0
        return g
    tables = [v for v in vars(module).values() if isinstance(v, dict) and any(x in orig.values() for x in v.values())]
    saved = [(t, dict(t)) for t in tables]
    try:
        for n in names:
            setattr(module, n, wrap(n))
        for t, _ in saved:
            for k, v in list(t.items()):
                for n in names:
                    if v is orig[n]:
                        t[k] = getattr(module, n)
        fn()
    finally:
        for n in names:
            setattr(module, n, orig[n])
        for t, old in saved:
            t.clear(); t.update(old)
    return dict(sorted(cost.items(), key=lambda x: -x[1]))


# ── export ──────────────────────────────────────────────────────────────────

def export_fbx(col, klass, filename):
    """FBX with LOD0/LOD1 meshes (Unity builds the LOD Group from the
    _LOD<n> suffix) and COL_ meshes. Front: Blender -Y -> Unity +Z."""
    out_dir = os.path.join(ART, 'exports', klass)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, filename + '.fbx')
    view = bpy.context.view_layer
    for o in view.objects:
        o.select_set(False)
    objs = list(col.all_objects)
    hidden = [o for o in objs if o.hide_get()]
    for o in objs:
        o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=True, object_types={'MESH', 'EMPTY'},
        apply_scale_options='FBX_SCALE_ALL', axis_forward='-Z', axis_up='Y',
        bake_space_transform=True, use_mesh_modifiers=True, mesh_smooth_type='OFF',
        use_tspace=False, path_mode='STRIP', embed_textures=False, add_leaf_bones=False,
        bake_anim=False)
    for o in hidden:
        o.hide_set(True)
    return path, os.path.getsize(path)
