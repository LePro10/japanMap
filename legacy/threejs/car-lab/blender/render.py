"""Studio und Aufnahmen. Die HDRI (studio_small_09, Poly Haven CC0) liefert die
Spiegelungen im Lack; die Hohlkehle schluckt den Hintergrund."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
import carkit as K

OUT = os.path.join(K.LAB, 'renders')

def studio():
    sc = bpy.context.scene
    old = K.COLL
    K.set_collection('studio')
    if not bpy.data.objects.get('cyc'):
        bm = bmesh.new()
        prof = [(-20, 0)] + [(8 + 4 * math.sin(math.radians(a)), 4 - 4 * math.cos(math.radians(a))) for a in range(0, 91, 10)] + [(12, 12)]
        rows = []
        for x in (-25, 25):
            rows.append([bm.verts.new((x, y, z)) for y, z in prof])
        for i in range(len(prof) - 1):
            bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            if f.normal.z < -0.1 or f.normal.y > 0.1:
                f.normal_flip()
        m = K.material('studio_floor', color=0x1c1d20, rough=0.32, spec=0.5)
        cyc = K.mesh_obj('cyc', bm, [m])
        cyc.rotation_euler = (0, 0, math.radians(-150))
        l = bpy.data.lights.new('key', 'AREA'); l.energy = 900; l.size = 7; l.color = (1, 0.97, 0.94)
        lo = bpy.data.objects.new('key', l); K.link(lo); lo.location = (0, 0, 6)
        r = bpy.data.lights.new('rim', 'AREA'); r.energy = 500; r.size = 4; r.color = (0.8, 0.88, 1)
        ro = bpy.data.objects.new('rim', r); K.link(ro); ro.location = (-5, 5, 2.5)
        ro.rotation_euler = (math.radians(70), 0, math.radians(-135))
        cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); K.link(co)
        sc.camera = co
    w = sc.world
    if w and w.use_nodes:
        for n in w.node_tree.nodes:
            if n.type == 'BACKGROUND':
                n.inputs[1].default_value = 0.7
    e = sc.eevee
    for attr, val in (('taa_render_samples', 64), ('use_raytracing', True), ('use_shadows', True), ('use_gtao', True)):
        try: setattr(e, attr, val)
        except Exception: pass
    try: e.ray_tracing_options.resolution_scale = '1'
    except Exception: pass
    sc.render.film_transparent = False
    try: sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    K.COLL = old

def only(cid):
    for c in bpy.context.scene.collection.children:
        if c.name.startswith('car_'):
            c.hide_render = c.name != f'car_{cid}'
            c.hide_viewport = c.name != f'car_{cid}'

def look(cam, pos, target, lens):
    cam.location = pos
    d = Vector(target) - Vector(pos)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens

def shots(cid, spec, which=('hero', 'rear', 'side', 'cockpit'), res=(1600, 900), prefix=''):
    sc = bpy.context.scene
    studio()
    only(cid)
    import tuneshots
    tuneshots.reset(cid)
    cam = bpy.data.objects['cam']
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    f = spec['L'] / 4.5
    H = spec.get('H', 1.3)
    out = []
    for w in which:
        cam.data.clip_start = 0.02
        if w == 'hero':
            look(cam, (4.6 * f, -5.6 * f, 1.25 + 0.2 * H), (0, -0.15 * f, 0.45 * H), 50)
        elif w == 'rear':
            look(cam, (-4.9 * f, 5.4 * f, 1.5 + 0.2 * H), (0, 0.2 * f, 0.45 * H), 50)
        elif w == 'side':
            look(cam, (8.2 * f, -0.1, 0.72 * H), (0, -0.1, 0.45 * H), 60)
        elif w == 'front':
            look(cam, (0.8, -7.5 * f, 0.9 * H), (0, 0, 0.45 * H), 60)
        elif w == 'top':
            look(cam, (2.5 * f, -2.5 * f, 7.0 * f), (0, 0, 0.3), 45)
        elif w == 'cockpit':
            eye = bpy.data.objects.get('eye')
            ex = [o for o in bpy.data.collections[f'car_{cid}'].all_objects if o.name.startswith('eye')][0]
            p = ex.matrix_world.translation
            look(cam, p, p + Vector((0.05, -2.0, -0.35)), 17)
        path = os.path.join(OUT, f'{prefix}{cid}_{w}.png')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        out.append(path)
    return out
