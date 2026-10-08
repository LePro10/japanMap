"""Preview renders for ArtSource/previews/: the same stage for every asset, so
pictures stay comparable. Two lightings:
- mood: blue hour after rain (cold sky, low warm sun, wet ground, lamps on)
- neutral: grey studio, high sun - to judge form and colour.
LIGHT_ empties in an asset become point lights here (and lights in Unity)."""
import bpy, math, os
import numpy as np
from mathutils import Vector
from . import core

STAGE = 'PreviewStage'
PREV_DIR = os.path.join(core.ART, 'previews')


def _world(mood, sun_dir=(0, 1, 0.1)):
    """Mood sky: deep blue zenith, cool blue-grey horizon all round, and the
    warm glow only towards the sun (an all-round peach horizon tinted every
    wall warm - stone read as wood)."""
    w = bpy.data.worlds.get('W_Preview') or bpy.data.worlds.new('W_Preview')
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(bg.outputs[0], out.inputs[0])
    if not mood:
        bg.inputs['Color'].default_value = (0.42, 0.43, 0.45, 1)
        bg.inputs['Strength'].default_value = 1.0
        return w
    L = nt.links.new
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Generated'], sep.inputs[0])
    ma = nt.nodes.new('ShaderNodeMath'); ma.operation = 'MULTIPLY_ADD'
    ma.inputs[1].default_value = 0.5; ma.inputs[2].default_value = 0.5  # z -1..1 -> 0..1
    L(sep.outputs['Z'], ma.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); L(ma.outputs[0], ramp.inputs[0])
    cr = ramp.color_ramp
    cr.elements[0].position = 0.0; cr.elements[0].color = (0.02, 0.025, 0.035, 1)
    cr.elements[1].position = 1.0; cr.elements[1].color = (0.02, 0.04, 0.13, 1)
    e = cr.elements.new(0.5); e.color = (0.16, 0.18, 0.26, 1)       # cool horizon
    e = cr.elements.new(0.6); e.color = (0.06, 0.1, 0.24, 1)
    # warm glow: towards the sun, near the horizon
    dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    L(tc.outputs['Generated'], dot.inputs[0]); dot.inputs[1].default_value = sun_dir
    toward = nt.nodes.new('ShaderNodeMapRange'); L(dot.outputs['Value'], toward.inputs['Value'])
    toward.inputs['From Min'].default_value = 0.3; toward.inputs['From Max'].default_value = 1.0
    absz = nt.nodes.new('ShaderNodeMath'); absz.operation = 'ABSOLUTE'; L(sep.outputs['Z'], absz.inputs[0])
    band = nt.nodes.new('ShaderNodeMapRange'); L(absz.outputs[0], band.inputs['Value'])
    band.inputs['From Min'].default_value = 0.0; band.inputs['From Max'].default_value = 0.25
    band.inputs['To Min'].default_value = 1.0; band.inputs['To Max'].default_value = 0.0
    glow = nt.nodes.new('ShaderNodeMath'); glow.operation = 'MULTIPLY'
    L(toward.outputs['Result'], glow.inputs[0]); L(band.outputs['Result'], glow.inputs[1])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'ADD'
    L(glow.outputs[0], mix.inputs['Factor'])
    L(ramp.outputs[0], mix.inputs[6]); mix.inputs[7].default_value = (0.55, 0.28, 0.14, 1)
    L(mix.outputs[2], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    return w


def _ground_mat(mood):
    m = bpy.data.materials.get('M_PreviewGround') or bpy.data.materials.new('M_PreviewGround')
    m.use_nodes = True
    b = core._principled(m.node_tree)
    b.inputs['Base Color'].default_value = (0.035, 0.037, 0.04, 1) if mood else (0.25, 0.25, 0.25, 1)
    b.inputs['Roughness'].default_value = 0.12 if mood else 0.85
    return m


def stage(mood=True):
    sc = core.scene()
    col = bpy.data.collections.get(STAGE)
    if not col:
        col = bpy.data.collections.new(STAGE)
        sc.collection.children.link(col)
    def get(name, make):
        ob = bpy.data.objects.get(name)
        if not ob:
            ob = make(); ob.name = name; col.objects.link(ob)
        return ob
    def mk_ground():
        me = bpy.data.meshes.new('PreviewGround')
        s = 200
        me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
        return bpy.data.objects.new('PreviewGround', me)
    g = get('PreviewGround', mk_ground)
    g.data.materials.clear(); g.data.materials.append(_ground_mat(mood))
    sun = get('PreviewSun', lambda: bpy.data.objects.new('PreviewSun', bpy.data.lights.new('PreviewSun', 'SUN')))
    if mood:
        sun.data.color = (1.0, 0.62, 0.38); sun.data.energy = 2.2
        sun.rotation_euler = (math.radians(82), 0, math.radians(-150))
    else:
        sun.data.color = (1, 1, 1); sun.data.energy = 3.5
        sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
    sun.data.angle = math.radians(2)
    cam = get('PreviewCam', lambda: bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam')))
    cam.data.lens = 50
    sc.camera = cam
    bpy.context.view_layer.update()
    sun_dir = tuple(sun.matrix_world.to_quaternion() @ Vector((0, 0, 1)))   # towards the sun
    sc.world = _world(mood, sun_dir)
    r = sc.render
    try:
        r.engine = 'BLENDER_EEVEE'
    except TypeError:
        pass
    try:
        sc.eevee.taa_render_samples = 48
    except AttributeError:
        pass
    try:
        sc.view_settings.view_transform = 'AgX'
    except TypeError:
        pass
    r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'
    return cam


def _clay():
    m = bpy.data.materials.get('M_Clay') or bpy.data.materials.new('M_Clay')
    m.use_nodes = True
    b = core._principled(m.node_tree)
    b.inputs['Base Color'].default_value = (0.22, 0.22, 0.22, 1)
    b.inputs['Roughness'].default_value = 0.7
    return m


def _lights(objs, on):
    """Point lights for LIGHT_ empties (mood only)."""
    col = bpy.data.collections[STAGE]
    for o in list(col.objects):
        if o.name.startswith('PL_'):
            bpy.data.objects.remove(o, do_unlink=True)
    if not on:
        return
    for e in objs:
        if e.type == 'EMPTY' and e.name.startswith('LIGHT_'):
            ld = bpy.data.lights.new('PL_' + e.name, 'POINT')
            ld.color = tuple(e.get('color', (1.0, 0.7, 0.4)))
            ld.energy = float(e.get('watts', 20.0))
            ld.shadow_soft_size = float(e.get('radius', 0.05))
            lo = bpy.data.objects.new('PL_' + e.name, ld)
            lo.matrix_world = e.matrix_world.copy()
            col.objects.link(lo)


def _bounds(objs):
    bpy.context.view_layer.update()  # matrix_world is stale right after moving objects
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _frame(cam, objs, direction, aspect, margin=1.08):
    """Distance so every corner of the bounding box fits the frame (a bounding
    sphere left tall thin things like poles tiny)."""
    lo, hi = _bounds(objs)
    c = (lo + hi) / 2
    d = Vector(direction).normalized()
    right = d.cross(Vector((0, 0, 1))).normalized()
    if right.length < 1e-6:
        right = Vector((1, 0, 0))
    up = right.cross(d).normalized()
    half = math.atan(36 / 2 / cam.data.lens)       # sensor fits the longer side
    th = math.tan(half) * (1 if aspect >= 1 else aspect)
    tv = math.tan(half) * (1 / aspect if aspect >= 1 else 1)
    D = 0.0
    for x in (lo.x, hi.x):
        for y in (lo.y, hi.y):
            for z in (lo.z, hi.z):
                p = Vector((x, y, z)) - c
                D = max(D, p.dot(d) + abs(p.dot(right)) * margin / th, p.dot(d) + abs(p.dot(up)) * margin / tv)
    cam.location = c + d * D
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = D * 6


def render(objs, name, views, size=(640, 640), show=None):
    """Render each (label, direction, mood) view, put them side by side and
    save ArtSource/previews/<name>.png. show: collections visible in the shot."""
    sc = core.scene()
    bpy.context.view_layer.update()  # callers may just have moved objects (stale matrix_world)
    show = set(show or [])
    for c in sc.collection.children:
        c.hide_render = c.name not in show and c.name != STAGE
    r = sc.render
    r.resolution_x, r.resolution_y = size
    tiles = []
    tmp = bpy.app.tempdir or '/tmp'
    vl = bpy.context.view_layer
    for i, (label, direction, mood) in enumerate(views):
        clay = mood == 'clay'   # grey material only: the silhouette must read without texture
        mood = mood is True
        cam = stage(mood)
        vl.material_override = _clay() if clay else None
        _lights([o for c in show for o in bpy.data.collections[c].all_objects], mood)
        _frame(cam, [o for o in objs if not o.hide_render], direction, size[0] / size[1])
        p = os.path.join(tmp, f'_prev_{i}.png')
        r.filepath = p
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(p, check_existing=False)
        a = np.array(img.pixels[:], np.float32).reshape(img.size[1], img.size[0], 4)
        bpy.data.images.remove(img)
        tiles.append(a)
    vl.material_override = None
    out = np.concatenate(tiles, axis=1)
    h, w = out.shape[:2]
    img = bpy.data.images.new('_preview', w, h, alpha=True)
    img.pixels.foreach_set(out.ravel())
    os.makedirs(PREV_DIR, exist_ok=True)
    path = os.path.join(PREV_DIR, name + '.png')
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
    return path


def details(objs, name, direction=(1.0, -1.7, 0.6), mood=False, size=(480, 400), out_dir=None):
    """Close-up of each object on its own, side by side (one frame per object):
    group shots of long runs are too small to judge profiles and fixings."""
    tiles = []
    for o in objs:
        others = {x: x.hide_render for x in bpy.data.objects if x is not o}
        for x in others:
            x.hide_render = True
        was = o.hide_render; o.hide_render = False
        try:
            show = [c.name for c in o.users_collection]
            p = render([o], '_detail_tmp', [('d', direction, mood)], size=size, show=show)
        finally:
            for x, h in others.items():
                x.hide_render = h
            o.hide_render = was
        img = bpy.data.images.load(p, check_existing=False)
        tiles.append(np.array(img.pixels[:], np.float32).reshape(img.size[1], img.size[0], 4))
        bpy.data.images.remove(img)
        os.remove(p)
    out = np.concatenate(tiles, axis=1)
    img = bpy.data.images.new('_details', out.shape[1], out.shape[0], alpha=True)
    img.pixels.foreach_set(out.ravel())
    path = os.path.join(out_dir or PREV_DIR, name + '.png')
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
    return path
