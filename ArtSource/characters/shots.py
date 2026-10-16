"""Preview pictures of the figures: line-ups (front, back, clay), close-ups of
heads and hands, and every clip of anim_kit as a strip of key poses.

    from characters import shots as S; S.lineup(['Driver', 'Salaryman'], 'Hito_test')"""
import bpy, os
from mathutils import Vector
from kit import preview as P


def _rigs(names):
    return [bpy.data.objects[f'Rig_{n}'] for n in names]


def arrange(names, gap=0.75, y=0.0):
    rigs = _rigs(names)
    x0 = -gap * (len(rigs) - 1) / 2
    for i, r in enumerate(rigs):
        r.location = (x0 + gap * i, y, 0)
    bpy.context.view_layer.update()
    return rigs


def reset(names):
    for r in _rigs(names):
        r.location = (0, 0, 0)
        r.animation_data_clear() if r.animation_data and not r.animation_data.action else None


def lineup(names, name, views=None, size=None, lod=0, gap=0.75, action=None, frame=None):
    """All named figures side by side; views = (label, direction, mood)."""
    rigs = arrange(names, gap)
    objs = [bpy.data.objects[f'SM_Hito_{n}_LOD{lod}'] for n in names]
    hidden = {}
    for n in names:
        for l in range(3):
            o = bpy.data.objects[f'SM_Hito_{n}_LOD{l}']
            hidden[o] = o.hide_render
            o.hide_render = l != lod
            o.hide_set(l != lod)
    if action:
        for r in rigs:
            r.animation_data_create()
            r.animation_data.action = bpy.data.actions[action]
            if r.animation_data.action_slot is None and len(r.animation_data.action.slots):
                r.animation_data.action_slot = r.animation_data.action.slots[0]
        bpy.context.scene.frame_set(frame or 0)
    views = views or [('front', (0.25, -1.7, 0.22), False), ('back', (-0.25, 1.7, 0.22), False),
                      ('clay', (0.6, -1.6, 0.3), 'clay')]
    size = size or (min(1400, 240 * len(names) + 120), 560)
    try:
        p = P.render(objs, name, views, size=size, show=[f'Hito_{n}' for n in names])
    finally:
        for o, h in hidden.items():
            o.hide_render = h
            o.hide_set(h)
        for r in rigs:
            r.location = (0, 0, 0)
            if action and r.animation_data:
                r.animation_data.action = None
        bpy.context.scene.frame_set(0)
    return p


def close(names, name, lod=0, direction=(0.5, -1.6, 0.25), z=1.55, size=(360, 360)):
    """Head close-ups (face, hair, hat)."""
    tiles = []
    out = []
    for n in names:
        o = bpy.data.objects[f'SM_Hito_{n}_LOD{lod}']
        out.append(P.shot([f'Hito_{n}'], (0, 0, z * o.dimensions.z / 1.75 if False else z), direction, 0.75,
                          os.path.join(P.PREV_DIR, f'_close_{n}.png'), mood=False, size=size, lens=50))
    return out


def clip_strip(fig, name, clips=None, u=0.25, direction=(-1.3, -1.0, 0.35), size=(300, 380)):
    """One tile per clip, the figure posed at phase u (side-ish view), side by side."""
    import numpy as np
    from characters import anim_kit as AK
    rig = bpy.data.objects[f'Rig_{fig}']
    o = bpy.data.objects[f'SM_Hito_{fig}_LOD0']
    clips = clips or list(AK.CLIPS)
    tiles = []
    for cl in clips:
        uu = u if not isinstance(u, dict) else u.get(cl, 0.25)
        AK.pose(rig, cl, uu)
        p = P.render([o], '_clip_tmp', [(cl, direction, False)], size=size, show=[f'Hito_{fig}'])
        img = bpy.data.images.load(p, check_existing=False)
        tiles.append(np.array(img.pixels[:], np.float32).reshape(img.size[1], img.size[0], 4))
        bpy.data.images.remove(img)
    AK.rest(rig)
    out = np.concatenate(tiles, axis=1)
    img = bpy.data.images.new('_clips', out.shape[1], out.shape[0], alpha=True)
    img.pixels.foreach_set(out.ravel())
    path = os.path.join(P.PREV_DIR, name + '.png')
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
    return path


def grip_world(rig, side):
    """World matrix of the grip in the posed hand: 75 mm from the wrist, 12 mm to the palm."""
    from mathutils import Matrix
    pb = rig.pose.bones[side + 'Hand']
    m = rig.matrix_world @ pb.matrix          # bone space: Y along the hand, Z forward
    p = m @ Vector((0, 0.075, 0.012))
    return m, p


def hold(rig, prop, side, axis, col):
    """Linked copy of a hand prop placed in the posed hand (hang: down the hand;
    up: upright in the world, like the game keeps an umbrella upright)."""
    from mathutils import Matrix
    src = bpy.data.objects[f'SM_Hito_Prop_{prop}_LOD0']
    ob = src.copy()
    col.objects.link(ob)
    ob.hide_render = False; ob.hide_set(False)
    m, p = grip_world(rig, side)
    if axis == 'hang':
        r = m.to_3x3().normalized() @ Matrix.Rotation(1.5708, 3, 'X')   # prop -Z along the hand (bone +Y)
        ob.matrix_world = Matrix.Translation(p) @ r.to_4x4()
    else:
        yaw = rig.matrix_world.to_euler().z
        ob.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(yaw, 4, 'Z')
    return ob


def scene(name='Hito_Scene', cast=None, target=(0, 0, 1.0), direction=(0.35, -1.0, 0.12), dist=7.5, mood=True,
          size=(1280, 640)):
    """A street moment: figures posed in their clips, holding their props."""
    from characters import anim_kit as AK, people as PP
    from characters import hand_props as HP
    from kit import core as K
    cast = cast or [
        ('Salaryman', 'WalkUmbrella', 0.1, (-2.2, 0.6, 0), -10, [('Umbrella_Black_Open', 'Right')]),
        ('OfficeLady', 'WalkUmbrella', 0.6, (-1.2, -0.4, 0), 15, [('Umbrella_Vinyl_Open', 'Right')]),
        ('Schoolgirl', 'Phone', 0.3, (-0.2, 1.0, 0), 160, [('Phone', 'Right')]),
        ('Driver', 'Idle', 0.2, (0.6, -0.8, 0), -20, []),
        ('Obaachan', 'Walk', 0.35, (1.6, 0.4, 0), 100, [('EcoBag', 'Left')]),
        ('Shopkeeper', 'Bow', 0.33, (2.5, 1.5, 0), 200, []),
        ('Worker', 'Work', 0.25, (3.4, -0.3, 0), 60, [('Hammer', 'Right')]),
        ('Casual', 'Walk', 0.7, (-3.2, -0.9, 0), 80, [('Umbrella_Navy_Closed', 'Right'), ('KonbiniBag', 'Left')]),
        ('Ojiichan', 'Walk', 0.15, (0.2, 2.2, 0), -90, [('Cane', 'Left')]),
        ('Yukata', 'Idle', 0.6, (-0.9, 2.4, 0), 190, [('Kinchaku', 'Left')]),
    ]
    tmp = K.collection('Hito_SceneProps')
    cols = ['Hito_SceneProps']
    for fig, clip, u, pos, yaw, props in cast:
        rig = bpy.data.objects[f'Rig_{fig}']
        rig.location = pos
        rig.rotation_euler = (0, 0, __import__('math').radians(yaw))
        for l in range(3):
            o = bpy.data.objects[f'SM_Hito_{fig}_LOD{l}']
            o.hide_render = l != 0; o.hide_set(l != 0)
        bpy.context.view_layer.update()
        AK.pose(rig, clip, u)
        for prop, side in props:
            hold(rig, prop, side, HP.PROPS[prop][2], tmp)
        cols.append(f'Hito_{fig}')
    bpy.context.view_layer.update()
    try:
        out = P.shot(cols, target, direction, dist, os.path.join(P.PREV_DIR, name + '.png'), mood=mood, size=size, lens=35)
    finally:
        for fig, *_ in cast:
            rig = bpy.data.objects[f'Rig_{fig}']
            AK.rest(rig)
            rig.location = (0, 0, 0); rig.rotation_euler = (0, 0, 0)
        for o in list(tmp.objects):
            bpy.data.objects.remove(o)
    return out
