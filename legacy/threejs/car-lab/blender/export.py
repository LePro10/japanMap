"""GLB-Export je Auto. Alle Tuning-Optionen gehen mit (sichtbar geschaltet),
das Web blendet nach extras.tune_* ein und aus."""
import bpy, os, json
import carkit as K

OUT = os.path.join(K.LAB, 'models')

def export(cid):
    col = bpy.data.collections[f'car_{cid}']
    for c in bpy.context.scene.collection.children:
        if c.name.startswith('car_'):
            c.hide_viewport = c.name != col.name
            c.hide_render = c.name != col.name
    for o in [o for o in col.all_objects if o is not None]:
        o.hide_viewport = False; o.hide_render = False; o.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [o for o in col.all_objects if o is not None]:
        o.select_set(True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{cid}.glb')
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_apply=True,
              export_yup=True, export_image_format='WEBP')
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw['export_image_format'] = 'AUTO'
        bpy.ops.export_scene.gltf(**kw)
    root = bpy.data.objects[f'car_{cid}']
    return path, os.path.getsize(path), json.loads(root['carlab'])
