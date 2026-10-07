"""Aufnahmen der Tuning-Optionen: Felge je Option, Motor je Stufe (Karosserie ausgeblendet)."""
import bpy, os
from mathutils import Vector
import render as R
import sheet

def objs(cid):
    return list(bpy.data.collections[f'car_{cid}'].all_objects)

def show_opt(cid, slot, o):
    for ob in objs(cid):
        if ob.get('tune_slot') == slot:
            vis = ob.get('tune_opt') == o
            ob.hide_render = not vis; ob.hide_viewport = not vis

def reset(cid):
    for ob in objs(cid):
        if 'tune_slot' in ob:
            vis = ob.get('tune_opt') == 0 and ob['tune_slot'] != 'engine'
            ob.hide_render = not vis; ob.hide_viewport = not vis
        elif ob.name.startswith('body'):
            ob.hide_render = False

def wheel_shots(cid, spec, res=(640, 480)):
    R.studio(); R.only(cid)
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    cam = bpy.data.objects['cam']
    piv = [o for o in objs(cid) if o.name.startswith('wheel_FL')][0]
    c = piv.matrix_world.translation
    out = []
    for o in range(3):
        reset(cid); show_opt(cid, 'wheels', o)
        R.look(cam, c + Vector((1.5, -0.9, 0.25)), c, 55)
        p = os.path.join(R.OUT, f'_t_{cid}_wheel{o}.png'); sc.render.filepath = p
        bpy.ops.render.render(write_still=True); out.append(p)
    reset(cid)
    return out

def engine_shots(cid, spec, res=(640, 480)):
    R.studio(); R.only(cid)
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    cam = bpy.data.objects['cam']
    eng = [o for o in objs(cid) if o.name.startswith('engine_o0')][0]
    bb = [eng.matrix_world @ Vector(v) for v in eng.bound_box]
    c = sum(bb, Vector()) / 8
    out = []
    for o in range(3):
        reset(cid); show_opt(cid, 'engine', o)
        for ob in objs(cid):
            if ob.name.startswith('body'):
                ob.hide_render = True
        R.look(cam, c + Vector((1.4, -1.3, 1.0)), c, 50)
        p = os.path.join(R.OUT, f'_t_{cid}_engine{o}.png'); sc.render.filepath = p
        bpy.ops.render.render(write_still=True); out.append(p)
    reset(cid)
    return out
