"""Clips for the shared figure rig (task 6). Procedural: each clip is a
function phase -> pose (degrees per bone, local X = forward/flex, Z = sideways,
Y = twist; Hips offset in metres: x right-left, y up, z forward), sampled into
an Action. Rotation only on the limbs, so one clip fits every body type.

Loops start and end on the same pose. Exported once as SM_Hito_Anims.fbx
(rig + all actions); anims.json lists frames, loop flag and speed (m/s)
for Unity's import settings.

What the game asks for (PLAN Phase 6, PlaceActors): idle, walk, run, the
slide (Fortnite-style), jump and fall for the player; sit, work and fish
for the actors; phone, umbrella walk, sweeping and the bow (ojigi) give the
crowd its Japanese everyday look."""
import bpy, math, json, os
from mathutils import Euler, Vector
from characters import figure_kit as FK

FPS = 30
S = math.sin
C = math.cos
TAU = 2 * math.pi


def _base():
    """Arms relaxed from the A-pose (12 deg out) to hanging at the sides."""
    return {'LeftUpperArm': [4, 0, -7], 'RightUpperArm': [4, 0, 7], 'LeftLowerArm': [10, 0, 0], 'RightLowerArm': [10, 0, 0],
            'LeftHand': [0, 0, 0], 'RightHand': [0, 0, 0]}


def add(p, bone, x=0.0, y=0.0, z=0.0):
    r = p.setdefault(bone, [0, 0, 0])
    r[0] += x; r[1] += y; r[2] += z


def legs_cycle(p, u, amp=24, knee=42, lift=10, ankle=14):
    """Stride: thighs swing, the knee bends in the swing, foot rolls heel -> toe."""
    for side, ph in (('Left', 0.0), ('Right', 0.5)):
        a = TAU * (u + ph)
        add(p, side + 'UpperLeg', x=amp * S(a))
        swing = max(0.0, C(a))                           # leg travelling forward
        add(p, side + 'LowerLeg', x=-(5 + knee * swing ** 1.5 + lift * max(0.0, -S(a)) * 0.5))
        add(p, side + 'Foot', x=ankle * S(a) * 0.8 - 6 * swing)
        add(p, side + 'Toes', x=max(0.0, -S(a)) * 18 * (1 - swing))


def arms_cycle(p, u, amp=16, elbow=14):
    for side, ph in (('Left', 0.5), ('Right', 0.0)):
        a = TAU * (u + ph)
        add(p, side + 'UpperArm', x=amp * S(a))
        add(p, side + 'LowerArm', x=elbow * (0.6 + 0.4 * S(a)))


def idle(u):
    p = _base()
    b = S(TAU * u)                    # one breath over the clip, one weight shift
    add(p, 'Chest', x=1.2 * b)
    add(p, 'Spine', x=0.6 * b)
    add(p, 'Head', x=-1.0 * b, y=3 * S(TAU * u + 1.0))
    sh = S(TAU * u * 1.0 + 0.4)
    add(p, 'Hips', z=1.5 * sh)
    add(p, 'LeftUpperLeg', z=-1.5 * sh); add(p, 'RightUpperLeg', z=-1.5 * sh)
    add(p, 'Spine', z=-1.2 * sh)
    p['_loc'] = (0.008 * sh, -0.004 * abs(sh), 0.0)
    return p


def walk(u):
    p = _base()
    legs_cycle(p, u)
    arms_cycle(p, u)
    a = TAU * u
    add(p, 'Hips', y=5 * S(a), z=2.5 * C(2 * a))
    add(p, 'Spine', y=-3 * S(a), x=2)
    add(p, 'Chest', y=-4 * S(a))
    add(p, 'Head', y=3 * S(a), x=-1.5)
    p['_loc'] = (0.012 * S(a), -0.025 + 0.022 * abs(C(a)), 0.0)
    return p


def walk_umbrella(u):
    """Walk holding an umbrella up in the right hand (after the rain)."""
    p = walk(u)
    p['RightUpperArm'] = [28, 0, 10]
    p['RightLowerArm'] = [78, 0, 0]
    p['RightHand'] = [-20, 0, 0]
    return p


def run(u):
    p = _base()
    legs_cycle(p, u, amp=40, knee=95, lift=20, ankle=22)
    for side, ph in (('Left', 0.5), ('Right', 0.0)):
        a = TAU * (u + ph)
        add(p, side + 'UpperArm', x=38 * S(a))
        add(p, side + 'UpperArm', z=4 if side == 'Left' else -4)
        add(p, side + 'LowerArm', x=72 + 12 * S(a))
        add(p, side + 'Hand', x=10)
    a = TAU * u
    add(p, 'Hips', x=8, y=8 * S(a))
    add(p, 'LeftUpperLeg', x=8); add(p, 'RightUpperLeg', x=8)     # legs keep their swing about the vertical
    add(p, 'Spine', x=5, y=-5 * S(a))
    add(p, 'Chest', x=3, y=-7 * S(a))
    add(p, 'Head', x=-10, y=4 * S(a))
    p['_loc'] = (0.015 * S(a), -0.06 + 0.06 * abs(C(a)), 0.0)
    return p


def slide(u):
    """Low slide on the hip (Fortnite-style): front leg out, back leg tucked,
    torso leaning back, one hand trailing on the ground, small jitter."""
    p = _base()
    j = S(TAU * u * 3) * 1.2
    add(p, 'Hips', x=-58 + j)
    add(p, 'Spine', x=22); add(p, 'Chest', x=14); add(p, 'Head', x=20 + j)
    # legs hang from the tilted hips: the lean already swings them 58 deg forward
    add(p, 'LeftUpperLeg', x=26, z=6); add(p, 'LeftLowerLeg', x=-8); add(p, 'LeftFoot', x=15)
    add(p, 'RightUpperLeg', x=-22, z=-14); add(p, 'RightLowerLeg', x=-112); add(p, 'RightFoot', x=-15)
    p['LeftUpperArm'] = [30, 0, 26]; p['LeftLowerArm'] = [40, 0, 0]
    p['RightUpperArm'] = [-35, 0, -40]; p['RightLowerArm'] = [12, 0, 0]
    p['_loc'] = (0.0, -0.62, -0.1)
    return p


def jump(u):
    """One shot, 0.8 s: crouch, take-off, tuck at the top, legs reach for the ground."""
    p = _base()
    def env(a, b):
        return max(0.0, min(1.0, (u - a) / (b - a)))
    crouch = env(0.0, 0.15) * (1 - env(0.15, 0.3))
    tuck = env(0.3, 0.55) * (1 - env(0.7, 0.95))
    reach = env(0.75, 1.0)
    for side in ('Left', 'Right'):
        add(p, side + 'UpperLeg', x=40 * crouch + 55 * tuck + 15 * reach)
        add(p, side + 'LowerLeg', x=-75 * crouch - 85 * tuck - 20 * reach)
        add(p, side + 'Foot', x=25 * crouch - 25 * (1 - crouch) * env(0.15, 0.35))
        add(p, side + 'UpperArm', x=-40 * crouch + 70 * env(0.15, 0.35) * (1 - tuck * 0.5), z=(1 if side == 'Left' else -1) * 20 * tuck)
        add(p, side + 'LowerArm', x=30 + 30 * tuck)
    add(p, 'Spine', x=20 * crouch + 10 * tuck)
    add(p, 'Head', x=-12 * crouch)
    p['_loc'] = (0.0, -0.22 * crouch - 0.12 * tuck, 0.0)
    return p


def fall(u):
    """In the air (loop): arms out for balance, legs cycling slowly."""
    p = _base()
    a = TAU * u
    for side, ph in (('Left', 0), ('Right', math.pi)):
        add(p, side + 'UpperLeg', x=25 + 12 * S(a + ph)); add(p, side + 'LowerLeg', x=-40 - 15 * S(a + ph))
        s = 1 if side == 'Left' else -1
        p[side + 'UpperArm'] = [15 + 6 * S(a + ph), 0, s * (55 + 6 * S(a))]
        p[side + 'LowerArm'] = [25, 0, 0]
    add(p, 'Spine', x=-6); add(p, 'Head', x=-8)
    return p


def sit(u):
    """Seated on a bench 0.45 m high: thighs forward, hands on the knees."""
    p = _base()
    b = S(TAU * u)
    for side in ('Left', 'Right'):
        add(p, side + 'UpperLeg', x=86, z=(1 if side == 'Left' else -1) * 4)
        add(p, side + 'LowerLeg', x=-84)
        add(p, side + 'Foot', x=-2)
        s = 1 if side == 'Left' else -1
        p[side + 'UpperArm'] = [30, 0, -s * 4]
        p[side + 'LowerArm'] = [30, 0, 0]
    add(p, 'Spine', x=4 + 1.0 * b); add(p, 'Chest', x=1.0 * b); add(p, 'Head', x=4 - 1.0 * b, y=6 * S(TAU * u + 2))
    p['_loc'] = (0.0, -0.47, 0.06)
    return p


def work(u):
    """Bent over at work (field, harbour, site): squat, the right arm hammers
    or pulls, the left hand braces on the knee."""
    p = _base()
    a = TAU * u
    for side in ('Left', 'Right'):
        add(p, side + 'UpperLeg', x=55, z=(1 if side == 'Left' else -1) * 10)
        add(p, side + 'LowerLeg', x=-80)
        add(p, side + 'Foot', x=18)
    add(p, 'Spine', x=30); add(p, 'Chest', x=18); add(p, 'Head', x=-12)
    p['LeftUpperArm'] = [52, 0, -4]; p['LeftLowerArm'] = [35, 0, 0]
    hit = max(0.0, S(a)) ** 0.6
    p['RightUpperArm'] = [40 + 45 * hit, 0, 8]; p['RightLowerArm'] = [70 - 40 * hit, 0, 0]; p['RightHand'] = [-15 + 30 * hit, 0, 0]
    p['_loc'] = (0.0, -0.24, 0.05)
    return p


def fish(u):
    """Standing at the quay with a rod in both hands, small twitches of the tip."""
    p = _base()
    a = TAU * u
    tw = max(0.0, S(a * 3)) ** 8
    p['LeftUpperArm'] = [30, 0, -18]; p['LeftLowerArm'] = [55, 0, 0]
    p['RightUpperArm'] = [22, 0, 14]; p['RightLowerArm'] = [62 + 8 * tw, 0, 0]
    p['RightHand'] = [-10 - 15 * tw, 0, 0]
    add(p, 'LeftUpperLeg', x=8, z=4); add(p, 'LeftLowerLeg', x=-6)
    add(p, 'RightUpperLeg', x=-4, z=-6)
    add(p, 'Spine', x=4 + S(a) * 1.0); add(p, 'Head', x=8, y=4 * S(a))
    return p


def phone(u):
    """Looking at the phone in the right hand (stands at the crossing)."""
    p = idle(u)
    p['RightUpperArm'] = [22, 0, 12]
    p['RightLowerArm'] = [105, 0, 0]
    p['RightHand'] = [-8, 0, 0]
    add(p, 'Head', x=22)
    add(p, 'Neck', x=8)
    tap = max(0.0, S(TAU * u * 4)) ** 6
    add(p, 'RightHand', x=3 * tap)
    return p


def sweep(u):
    """Shopkeeper sweeping the pavement with a take-boki (bamboo broom)."""
    p = _base()
    a = TAU * u
    add(p, 'Spine', x=18, y=10 * S(a)); add(p, 'Chest', x=8, y=8 * S(a)); add(p, 'Head', x=8, y=-6 * S(a))
    p['LeftUpperArm'] = [48 + 10 * S(a), 0, -14]; p['LeftLowerArm'] = [42, 0, 0]
    p['RightUpperArm'] = [28 + 10 * S(a), 0, 18]; p['RightLowerArm'] = [30, 0, 0]
    add(p, 'LeftUpperLeg', x=10); add(p, 'LeftLowerLeg', x=-14)
    add(p, 'RightUpperLeg', x=-6); add(p, 'RightLowerLeg', x=-6)
    p['_loc'] = (0.0, -0.03, 0.0)
    return p


def bow(u):
    """Ojigi: a polite 30-degree bow, held, and back up (loops with a pause)."""
    p = _base()
    t = u * 3.0
    k = 0.0
    if t < 0.6:
        k = 0.5 - 0.5 * C(math.pi * t / 0.6)
    elif t < 1.4:
        k = 1.0
    elif t < 2.0:
        k = 0.5 + 0.5 * C(math.pi * (t - 1.4) / 0.6)
    add(p, 'Hips', x=22 * k); add(p, 'Spine', x=6 * k); add(p, 'Head', x=4 * k)
    # the legs hang from the hips: undo the hip pitch so they stay upright
    add(p, 'LeftUpperLeg', x=22 * k); add(p, 'RightUpperLeg', x=22 * k)
    p['LeftUpperArm'] = [8 + 14 * k, 0, -8]; p['RightUpperArm'] = [8 + 14 * k, 0, 8]
    p['_loc'] = (0.0, -0.01 * k, -0.05 * k)
    return p


def wave(u):
    """Traffic guard waving cars on with the light baton (right arm sweeps out
    and in, front of the body), the left hand stops the other lane."""
    p = idle(u)
    a = TAU * u
    p['RightUpperArm'] = [35 + 25 * S(a), 0, -55 + 20 * C(a)]
    p['RightLowerArm'] = [25 + 10 * S(a), 0, 0]
    p['LeftUpperArm'] = [70, 0, 10]
    p['LeftLowerArm'] = [15, 0, 0]
    p['LeftHand'] = [-60, 0, 0]
    add(p, 'Head', y=-10 * S(a))
    return p


# name: (function, seconds, loop, forward speed m/s for root motion matching)
CLIPS = {
    'Idle': (idle, 4.0, True, 0.0),
    'Walk': (walk, 1.06, True, 1.35),
    'WalkUmbrella': (walk_umbrella, 1.1, True, 1.25),
    'Run': (run, 0.66, True, 4.2),
    'Slide': (slide, 1.0, True, 0.0),
    'Jump': (jump, 0.8, False, 0.0),
    'Fall': (fall, 1.2, True, 0.0),
    'Sit': (sit, 4.0, True, 0.0),
    'Work': (work, 1.6, True, 0.0),
    'Fish': (fish, 3.0, True, 0.0),
    'Phone': (phone, 4.0, True, 0.0),
    'Sweep': (sweep, 1.8, True, 0.0),
    'Bow': (bow, 3.0, True, 0.0),
    'Wave': (wave, 1.4, True, 0.0),
}


def make_action(rig, name, fn, seconds, loop, step=2):
    """Sample fn into an action on rig (rotation_quaternion per bone, Hips location)."""
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    frames = max(2, round(seconds * FPS))
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    keys = list(range(0, frames + 1, step))
    if keys[-1] != frames:
        keys.append(frames)
    for fr in keys:
        u = (fr / frames) % 1.0 if loop else fr / frames
        if loop and fr == frames:
            u = 0.0
        pose = fn(u)
        loc = pose.pop('_loc', (0.0, 0.0, 0.0))
        for pb in rig.pose.bones:
            e = pose.get(pb.name, (0, 0, 0))
            pb.rotation_quaternion = Euler([math.radians(v) for v in e], 'XYZ').to_quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=fr)
        hips = rig.pose.bones['Hips']
        hips.location = loc
        hips.keyframe_insert('location', frame=fr)
    for fc in _fcurves(act):
        for k in fc.keyframe_points:
            k.interpolation = 'BEZIER'
        if loop:
            fc.modifiers.new('CYCLES')
    act.frame_range = (0, frames)
    return act, frames


def _fcurves(act):
    """Blender 5: f-curves live in the action's layers/strips/channelbags."""
    out = []
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out.extend(bag.fcurves)
    except AttributeError:
        out = list(act.fcurves)
    return out


def build_all(rig):
    info = {}
    for name, (fn, sec, loop, speed) in CLIPS.items():
        act, frames = make_action(rig, name, fn, sec, loop)
        info[name] = dict(frames=frames, fps=FPS, loop=loop, speed=speed)
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    return info


def pose(rig, name, u):
    """Show one clip at phase u (for pictures)."""
    fn = CLIPS[name][0]
    p = fn(u)
    loc = p.pop('_loc', (0.0, 0.0, 0.0))
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        e = p.get(pb.name, (0, 0, 0))
        pb.rotation_quaternion = Euler([math.radians(v) for v in e], 'XYZ').to_quaternion()
        pb.location = (0, 0, 0)
    rig.pose.bones['Hips'].location = loc
    bpy.context.view_layer.update()


def rest(rig):
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    bpy.context.view_layer.update()


def test(rig):
    """Sign check: +X on a thigh moves the knee forward (-Y), +X on the spine
    leans forward, +Z on the left upper arm lifts it outwards (+X)."""
    out = {}
    for bone, rot, axis, sign in (('LeftUpperLeg', (30, 0, 0), 1, -1), ('Spine', (30, 0, 0), 1, -1),
                                  ('LeftUpperArm', (0, 0, 30), 0, 1), ('LeftLowerArm', (40, 0, 0), 1, -1),
                                  ('LeftFoot', (30, 0, 0), 2, 1), ('Hips', (20, 0, 0), 1, -1)):
        rest(rig)
        pb = rig.pose.bones[bone]
        t0 = (rig.matrix_world @ pb.tail).copy()
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Euler([math.radians(v) for v in rot], 'XYZ').to_quaternion()
        bpy.context.view_layer.update()
        t1 = rig.matrix_world @ pb.tail
        out[bone] = (round((t1 - t0)[axis], 3), 'ok' if (t1 - t0)[axis] * sign > 0 else 'WRONG')
    rest(rig)
    return out


def export(col_name='Hito_Anims', body='M'):
    """Rig with all clips -> exports/characters/SM_Hito_Anims.fbx + anims.json."""
    from kit import core as K
    col = K.collection(col_name)
    rig = FK.make_rig('Rig_Anims', col, FK.BODIES[body])
    info = build_all(rig)
    out_dir = os.path.join(K.ART, 'exports', 'characters')
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, 'SM_Hito_Anims.fbx')
    vl = bpy.context.view_layer
    for o in vl.objects:
        if o:
            o.select_set(False)
    rig.select_set(True)
    vl.objects.active = rig
    clash = bpy.data.objects.get('Rig')
    if clash:
        clash.name = '_rig_tmp'
    rig.name = 'Rig'
    try:
        bpy.ops.export_scene.fbx(
            filepath=path, use_selection=True, object_types={'ARMATURE'}, use_armature_deform_only=True,
            apply_scale_options='FBX_SCALE_ALL', axis_forward='-Z', axis_up='Y', bake_space_transform=False,
            add_leaf_bones=False, bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
            bake_anim_use_all_actions=True, bake_anim_force_startend_keying=True, bake_anim_step=1.0,
            bake_anim_simplify_factor=0.0)
    finally:
        rig.name = 'Rig_Anims'
        if clash:
            clash.name = 'Rig'
    with open(os.path.join(out_dir, 'anims.json'), 'w') as f:
        json.dump(info, f, indent=1)
    return path, os.path.getsize(path), info
