"""Scenes for the scatter props (task 5a): each prop where it stands on the
map, at eye level, mood + neutral, plus close-ups of the fixings.

    from props import scatter_shots as SS; SS.shots('<repo>/Captures/scatter')

Scenes are linked copies (nothing moves, everything is removed again);
all asset collections must exist (build.run of the styles first)."""
import math
import os
from mathutils import Matrix, Vector

WZ = -1.1          # Minato water level (WATER_Z)
TMP = 'ScatterScene'
GROUND = {'asphalt': (0.045, 0.045, 0.048), 'earth': (0.16, 0.12, 0.085), 'grass': (0.075, 0.1, 0.045),
          'gravel': (0.2, 0.19, 0.18)}


def _tmp():
    import bpy
    tmp = bpy.data.collections.get(TMP) or bpy.data.collections.new(TMP)
    if tmp.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(tmp)
    return tmp


def place(cname, pos, rot=0.0):
    import bpy
    src = bpy.data.collections.get(cname)
    if not src:
        raise KeyError(f'scene: missing collection {cname} (build it first)')
    T = Matrix.Translation(Vector((pos[0], pos[1], pos[2] if len(pos) > 2 else 0.0))) @ Matrix.Rotation(rot, 4, 'Z')
    # list(): linking a copy rebuilds all_objects and silently ends the loop
    # (sign skins and LIGHT_ markers went missing in the scene pictures)
    for o in list(src.all_objects):
        if o.name.startswith('COL_') or (o.type == 'MESH' and o.hide_render):
            continue
        n = o.copy()
        n.parent = None
        n.matrix_world = T @ o.matrix_world
        n.hide_render = False
        _tmp().objects.link(n)


def ground(rects, kind='asphalt', z=-0.01):
    import bpy
    from kit import core as K
    name = f'{TMP}Ground_{kind}'
    me = bpy.data.meshes.new(name)
    vs, fs = [], []
    for r in rects:
        x0, x1, y0, y1 = r[:4]
        zz = r[4] if len(r) > 4 else z
        k = len(vs)
        vs += [(x0, y0, zz), (x1, y0, zz), (x1, y1, zz), (x0, y1, zz)]
        fs.append((k, k + 1, k + 2, k + 3))
    me.from_pydata(vs, [], fs)
    m = bpy.data.materials.get(f'M_Preview_{kind}') or bpy.data.materials.new(f'M_Preview_{kind}')
    m.use_nodes = True
    b = K._principled(m.node_tree)
    b.inputs['Base Color'].default_value = (*GROUND[kind], 1)
    b.inputs['Roughness'].default_value = 0.9
    me.materials.append(m)
    _tmp().objects.link(bpy.data.objects.new(name, me))


def clear():
    import bpy
    tmp = bpy.data.collections.get(TMP)
    if not tmp:
        return
    for o in list(tmp.objects):
        bpy.data.objects.remove(o)
    for me in [m for m in bpy.data.meshes if m.name.startswith(TMP) and not m.users]:
        bpy.data.meshes.remove(me)
    if tmp.name in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.unlink(tmp)
    bpy.data.collections.remove(tmp)


def harbour():
    for x in (-20.0, -12.0, -4.0):
        place('Minato_Quay_8m', (x, 0.0))
    place('Minato_Slipway_8m', (4.0, 0.0))
    for y in (-4.0, -12.0, -20.0):                      # the mole runs out to sea, armour on both sides
        place('Minato_Breakwater_8m', (14.0, y), math.pi / 2)
    place('Minato_Lighthouse_White', (14.0, -26.5, 1.0))
    for i, y in enumerate((-2.0, -7.0, -12.0, -17.0, -22.0)):
        place('Tetrapod_Pile', (8.8, y, WZ - 0.7), 0.6 * i)
    for i, (x, y) in enumerate(((-24.5, -1.5), (-21.0, -2.6), (8.5, 1.0), (-7.0, -2.8), (-2.5, -3.2))):
        place('Tetrapod_Pile', (x, y, WZ - 0.7 if y < 0 else 0.0), 1.3 * i)
    place('Tetrapod', (-6.0, 9.5), 0.4); place('Tetrapod_Tilted', (-3.4, 10.2), 1.9); place('Tetrapod', (-1.0, 9.0), 2.8)   # stock on the apron
    for x in range(-24, 32, 8):
        for y in range(-36, -8, 8):
            if not (10 <= x <= 18):
                place('Minato_Sea_8m', (x + 4.0 if x < 0 else x, y - 4.0))
    ground([(-30, 30, 6.0, 60, -0.01)], 'asphalt')


def mountain_road():
    ground([(-30, 40, -3.4, 3.4, -0.01)], 'asphalt')
    ground([(-30, 40, -12, -3.4, -0.6), (-30, 12.6, 4.2, 30, 2.04)], 'grass')   # no flat plateau above the slope: seen from the road it read as an overhang
    for i, x in enumerate((-16.8, -8.4, 0.0, 8.4)):
        place('Wall_Concrete_8m' if i < 2 else 'Wall_Kenchi_8m', (x, 3.83 if i < 2 else 4.4))
    place('Wall_Norimen_8m', (16.8, 4.2)); place('Wall_Norimen_8m', (25.2, 4.2))
    for x in range(-24, 36, 4):
        place('Barrier_GuardRail_4m', (x, -3.75), math.pi)
    for x in (-18.0, -10.0, -2.0, 6.0, 14.0, 22.0, 30.0):
        place('Delineator_White', (x, -4.2))
    for x in (-14.0, 2.0, 18.0, 34.0):
        place('SnowPole', (x, -4.5), math.pi)
    for x in (10.0, 12.0, 14.0):
        place('PostCone', (x, 0.0))
    place('Delineator_Orange', (-22.0, 3.0))


def field():
    ground([(-40, 40, -2.2, 2.2, -0.01)], 'gravel')
    ground([(-40, 40, 2.2, 40, -0.03), (-40, 40, -40, -2.2, -0.03)], 'earth')
    for i, (x, k) in enumerate(((-10.0, 'Greenhouse_Closed'), (-1.0, 'Greenhouse_Open'), (8.0, 'Greenhouse_Closed'),
                                (17.0, 'Greenhouse_Open'))):
        place(k, (x, 11.0))
    place('UtilityPole_Plain', (-5.5, 2.8)); place('Delineator_White', (-6.0, -2.5)); place('Delineator_White', (6.0, -2.5))


def village_edge():
    ground([(-30, 30, -2.6, 2.6, -0.01)], 'asphalt')
    ground([(-30, 30, 2.6, 30, -0.02), (-30, 30, -30, -2.6, -0.02)], 'grass')
    place('Jizo', (-6.0, 3.4), 0.0)
    place('Jizo_Roku', (2.0, 4.0))
    place('Cemetery_Row_8m', (2.0, 8.6)); place('Cemetery_Row_8m', (10.4, 8.6))
    place('Grave_Old', (-3.6, 8.0), 0.2); place('Grave_Family', (-6.8, 8.9))
    for x, y in ((-10, 15), (-2, 17), (6, 16), (14, 15), (-14, 9)):
        place('Tree_Sugi', (x, y), x * 0.3)
    place('Fence_Bamboo_1_8m', (-10.0, 3.0))


def kiso_gate():
    for y in (-12.0, -4.0, 4.0, 12.0, 20.0):
        place('Kiso_Street_8m', (0.0, y), math.pi / 2)
    ground([(-40, 40, -30, 40, -0.06)], 'earth')
    place('Kiso_Kido', (0.0, 2.0))
    place('Kiso_Hatago_3Bay_Kaede', (-9.3, 12.0), math.pi / 2)
    place('Kiso_Soba_2Bay_Kodama', (9.3, 10.5), -math.pi / 2)
    place('Kiso_Minka_2Bay_Ishigaki_Lane', (-9.3, 24.0), math.pi / 2)
    place('Jizo', (-5.2, -2.0), 0.3)
    place('StoneLantern', (5.0, -1.0))
    for x, y in ((-12, -6), (12, -8), (-16, 4), (15, 2)):
        place('Tree_Sugi_Young', (x, y), x)


SCENES = {   # name: (builder, target, direction (target -> camera), distance, lens)
    'harbour': (harbour, (8.0, -14.0, 0.0), (-0.77, 0.63, 0.06), 28.0, 24),
    'mountain_road': (mountain_road, (8.0, 0.0, 1.2), (-1.0, -0.12, 0.04), 20.0, 24),
    'field': (field, (2.0, 10.0, 1.5), (0.25, -1.0, 0.06), 20.0, 24),
    'village_edge': (village_edge, (-1.0, 6.5, 0.8), (-0.45, -1.0, 0.1), 9.5, 26),
    'kiso_gate': (kiso_gate, (0.0, 4.0, 2.4), (0.15, -1.0, 0.0), 16.0, 26),
}


def shots(out_dir, which=None):
    import bpy
    from kit import preview as P
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n)
    P.stage(True)
    pg = bpy.data.objects['PreviewGround']
    pg.location.z = -3.0
    out = []
    try:
        for name, (fn, tgt, d, dist, lens) in SCENES.items():
            if which and name not in which:
                continue
            clear()
            fn()
            for mood, sfx in ((True, ''), (False, '_neutral'), ('clay', '_clay')):
                out.append(P.shot([TMP], tgt, d, dist, o(f'{name}{sfx}.png'), mood=mood, size=(1024, 576), lens=lens))
            clear()
    finally:
        clear()
        pg.location.z = 0.0
    return out


# close-ups of fixings: (collection, target, direction, distance, label)
CLOSE = [
    ('Delineator_White', (0, 0, 0.9), (0.6, -1.0, 0.25), 0.7, 'delineator_top'),
    ('SnowPole', (0, -0.4, 4.1), (0.9, -0.6, 0.15), 1.6, 'snowpole_plate'),
    ('PostCone', (0, 0, 0.3), (0.6, -1.0, 0.6), 1.3, 'postcone_foot'),
    ('Tetrapod', (0, 0, 0.6), (0.7, -1.0, 0.4), 3.2, 'tetrapod'),
    ('Wall_Concrete_8m', (3.1, -0.4, 0.9), (0.5, -1.0, 0.1), 2.2, 'wall_weep_joint'),
    ('Wall_Kenchi_8m', (-1.0, -0.6, 1.0), (0.4, -1.0, 0.15), 3.0, 'wall_kenchi'),
    ('Wall_Norimen_8m', (1.0, 0.4, 1.8), (0.4, -1.0, 0.4), 4.0, 'norimen_anchor_ditch'),
    ('Greenhouse_Closed', (-3.0, -7.2, 1.0), (-0.6, -1.0, 0.15), 3.2, 'greenhouse_crank_door'),
    ('Greenhouse_Open', (3.4, -2.0, 1.2), (1.0, -0.5, 0.15), 4.0, 'greenhouse_open_vent'),
    ('Jizo', (0, 0, 0.75), (0.4, -1.0, 0.15), 1.6, 'jizo'),
    ('Jizo_Roku', (0, 0, 1.0), (0.3, -1.0, 0.2), 3.6, 'jizo_roku'),
    ('Grave_Family', (0, 0.2, 0.7), (0.35, -1.0, 0.35), 2.6, 'grave_family'),
    ('Grave_Family', (0, 0.6, 1.0), (-0.6, 1.0, 0.35), 2.4, 'grave_sotoba_back'),
    ('Grave_Old', (0, 0, 0.4), (0.3, -1.0, 0.3), 2.6, 'grave_old'),
    ('Nobori_Red', (0.2, 0, 0.6), (0.5, -1.0, 0.3), 1.6, 'nobori_base'),
    ('EventBoard_4m', (1.55, 0.0, 0.5), (0.6, -1.0, 0.3), 2.0, 'eventboard_foot'),
    ('EventBoard_4m', (0.0, 0.3, 2.0), (0.4, 1.0, 0.2), 5.5, 'eventboard_back'),
    ('Kiso_Kido', (-3.75, 0.0, 3.6), (0.5, -1.0, 0.15), 4.5, 'kido_roof_lantern'),
    ('Minato_Slipway_8m', (0.0, 2.0, 0.5), (0.8, -1.0, 0.5), 5.0, 'slipway_winch'),
    ('Minato_Lighthouse_White', (0, 0, 7.5), (0.6, -1.0, 0.2), 4.0, 'lighthouse_white_top'),
]


def closeups(out_dir, size=(512, 384)):
    import bpy
    from kit import preview as P
    os.makedirs(out_dir, exist_ok=True)
    P.stage(False)
    out = []
    try:
        for cname, tgt, d, dist, label in CLOSE:
            clear()
            place(cname, (0, 0, 0))
            out.append(P.shot([TMP], tgt, d, dist, os.path.join(out_dir, f'c_{label}.png'), mood=False, size=size, lens=35))
    finally:
        clear()
    return out
