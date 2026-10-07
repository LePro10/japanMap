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


def merge(bm, faces):
    """Dissolve neighbouring faces into one (e.g. a window spanning grid cells)."""
    res = bmesh.ops.dissolve_faces(bm, faces=list(faces))
    return res['region'][0]


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
    return [(l.vert.co.x * sgn, l.vert.co.y) for l in face.loops], True


def map_faces(bm, faces, reg, zrange=None, metric_z0=None, rotate=False, s_offset=0.0):
    """Map faces into an atlas region.
    strip: s (metres) runs along U and repeats; t is stretched over zrange
      (default: the faces' own height) so grime sits at the bottom of the part,
      or metric from metric_z0 (namako must not stretch).
    cell: everything squeezed into the swatch, t again by zrange.
    rect: each face filled exactly (one graphic per face).
    rotate: swap axes (grain along height for wood posts)."""
    uv = _uv(bm)
    u0, v0, u1, v1 = reg['uv']
    faces = [f for f in faces if f is not None]
    if not faces:
        return
    if zrange is None:
        zs = [v.co.z for f in faces for v in f.verts]
        zrange = (min(zs), max(zs))
    zlo, zhi = zrange
    for f in faces:
        f.normal_update()  # new bmesh faces carry a zero normal until updated
        st, horizontal = _face_st(f)
        if rotate:
            st = [(t, s) for s, t in st]
        ss = [p[0] for p in st]; ts = [p[1] for p in st]
        for l, (s, t) in zip(f.loops, st):
            if horizontal or reg['kind'] == 'rect':
                tt = (t - min(ts)) / max(max(ts) - min(ts), 1e-6)
            elif metric_z0 is not None:
                tt = (t - metric_z0) / reg['h_m']
            else:
                tt = (t - zlo) / max(zhi - zlo, 1e-6)
            tt = min(max(tt, 0.0), 1.0)
            if reg['kind'] == 'strip':
                uu = (s + s_offset) / reg['w_m']
            else:
                uu = (s - min(ss)) / max(max(ss) - min(ss), 1e-6)
                if reg['kind'] == 'cell':
                    uu = 0.3 + 0.4 * uu
                uu = u0 + uu * (u1 - u0)
            l[uv].uv = (uu, v0 + tt * (v1 - v0))


# ── objects, bevel, LOD ─────────────────────────────────────────────────────

def mesh_object(name, bm, col, mats, bevel=0.0, bevel_angle=35.0, smooth=True, hidden=False, recalc=True):
    me = bpy.data.meshes.get(name)
    if me:
        me.clear_geometry()
    else:
        me = bpy.data.meshes.new(name)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if recalc:  # open shells (wall modules) keep their built winding instead
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
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
        md.width = bevel; md.segments = 1
        md.limit_method = 'ANGLE'; md.angle_limit = math.radians(bevel_angle)
        md.harden_normals = True; md.use_clamp_overlap = True
    elif smooth:
        # no bevel (LODs): keep hard edges crisp, round parts smooth
        me.set_sharp_from_angle(angle=math.radians(bevel_angle))
    if hidden:  # LOD1+ stays out of view and renders, but is exported
        ob.hide_set(True); ob.hide_render = True
    return ob


def tri_count(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
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
