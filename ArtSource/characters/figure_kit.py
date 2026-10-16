"""Figure kit (task 6): people on ONE shared humanoid rig, built from lofted
profiles (rings of a superellipse along the bones), skinned per ring.

Conventions (STYLE-KIT): metres, feet at z = 0, the figure faces Blender -Y
(Unity +Z), its left side is +X. Bone names are Unity's HumanBodyBones
(Hips, Spine, Chest, Neck, Head, LeftUpperArm ...) so the Humanoid avatar maps
itself. Every body type has the same bone DIRECTIONS and rolls, only lengths
differ - one set of clips (anim_kit) drives all of them.

Bone axes (roll): limbs and spine have local Z pointing forward (-Y), feet and
toes local Z up. So a positive X rotation means 'forward / flex' everywhere:
thigh forward, elbow bent, spine bowed, toes up (checked in anim_kit.test).

Detail lives in the form: hems are steps (a ring pair at one height), collars
and belts are closed bands, hair is a shell with a lip, boots, aprons, vests
and bags are their own pieces. Colours are cells of atlas `Figures`."""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from kit import core as K
from kit import atlas as A

ATLAS = 'Figures'
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
FWD = Vector((0, -1, 0))

BONES = ['Hips', 'Spine', 'Chest', 'Neck', 'Head',
         'LeftShoulder', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand',
         'RightShoulder', 'RightUpperArm', 'RightLowerArm', 'RightHand',
         'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'LeftToes',
         'RightUpperLeg', 'RightLowerLeg', 'RightFoot', 'RightToes']
PARENT = {'Spine': 'Hips', 'Chest': 'Spine', 'Neck': 'Chest', 'Head': 'Neck',
          'LeftShoulder': 'Chest', 'LeftUpperArm': 'LeftShoulder', 'LeftLowerArm': 'LeftUpperArm',
          'LeftHand': 'LeftLowerArm', 'RightShoulder': 'Chest', 'RightUpperArm': 'RightShoulder',
          'RightLowerArm': 'RightUpperArm', 'RightHand': 'RightLowerArm',
          'LeftUpperLeg': 'Hips', 'LeftLowerLeg': 'LeftUpperLeg', 'LeftFoot': 'LeftLowerLeg',
          'LeftToes': 'LeftFoot', 'RightUpperLeg': 'Hips', 'RightLowerLeg': 'RightUpperLeg',
          'RightFoot': 'RightLowerLeg', 'RightToes': 'RightFoot'}

# ── bodies ──────────────────────────────────────────────────────────────────
# heights in metres; torso table: z (fraction of a 1.72 m man) -> half width,
# front depth, back depth. Arms hang 12 deg out (A-pose, deforms better than T).
ARM_TILT = math.radians(12)

BODIES = {
    'M': dict(h=1.72, sh=0.175, hip=0.092, arm=(0.285, 0.25, 0.18), neck=0.054,
              torso=[(0.86, 0.10, 0.07, 0.08), (0.90, 0.152, 0.092, 0.105), (0.97, 0.16, 0.095, 0.108),
                     (1.05, 0.146, 0.088, 0.09), (1.14, 0.149, 0.094, 0.09), (1.24, 0.159, 0.104, 0.095),
                     (1.33, 0.168, 0.106, 0.1), (1.40, 0.172, 0.098, 0.098), (1.43, 0.168, 0.086, 0.09), (1.455, 0.13, 0.066, 0.076),
                     (1.478, 0.072, 0.054, 0.06)],
              head=dict(w=0.078, f=0.094, b=0.1, chin=1.495, crown=1.745),
              limb=dict(thigh=0.082, knee=0.054, calf=0.058, ankle=0.036, uarm=0.048, elbow=0.036,
                        farm=0.039, wrist=0.026, palm=0.046, foot=0.048)),
    'F': dict(h=1.60, sh=0.155, hip=0.088, arm=(0.27, 0.235, 0.165), neck=0.046,
              torso=[(0.86, 0.10, 0.072, 0.085), (0.90, 0.158, 0.094, 0.112), (0.97, 0.162, 0.094, 0.115),
                     (1.05, 0.132, 0.08, 0.085), (1.14, 0.122, 0.082, 0.08), (1.24, 0.134, 0.104, 0.085),
                     (1.33, 0.148, 0.106, 0.09), (1.40, 0.152, 0.092, 0.09), (1.43, 0.148, 0.08, 0.084), (1.455, 0.112, 0.06, 0.07),
                     (1.478, 0.062, 0.048, 0.054)],
              head=dict(w=0.074, f=0.09, b=0.096, chin=1.50, crown=1.745),
              limb=dict(thigh=0.08, knee=0.05, calf=0.054, ankle=0.032, uarm=0.042, elbow=0.032,
                        farm=0.034, wrist=0.023, palm=0.041, foot=0.043)),
    'OLD_F': dict(h=1.50, sh=0.16, hip=0.09, arm=(0.255, 0.225, 0.16), neck=0.048,
                  torso=[(0.86, 0.105, 0.08, 0.085), (0.90, 0.165, 0.105, 0.115), (0.97, 0.172, 0.112, 0.118),
                         (1.05, 0.165, 0.11, 0.1), (1.14, 0.16, 0.112, 0.1), (1.24, 0.158, 0.11, 0.105),
                         (1.33, 0.158, 0.1, 0.11), (1.40, 0.157, 0.09, 0.105), (1.43, 0.152, 0.08, 0.098), (1.455, 0.118, 0.062, 0.082),
                         (1.478, 0.066, 0.052, 0.062)],
                  head=dict(w=0.076, f=0.09, b=0.096, chin=1.50, crown=1.745),
                  limb=dict(thigh=0.084, knee=0.056, calf=0.055, ankle=0.036, uarm=0.046, elbow=0.036,
                            farm=0.036, wrist=0.025, palm=0.042, foot=0.044)),
    'OLD_M': dict(h=1.64, sh=0.168, hip=0.09, arm=(0.28, 0.245, 0.175), neck=0.052,
                  torso=[(0.86, 0.10, 0.072, 0.08), (0.90, 0.15, 0.1, 0.104), (0.97, 0.156, 0.106, 0.106),
                         (1.05, 0.15, 0.104, 0.092), (1.14, 0.15, 0.104, 0.092), (1.24, 0.154, 0.1, 0.098),
                         (1.33, 0.158, 0.096, 0.104), (1.40, 0.162, 0.09, 0.104), (1.43, 0.158, 0.08, 0.096), (1.455, 0.122, 0.062, 0.08),
                         (1.478, 0.068, 0.052, 0.062)],
                  head=dict(w=0.077, f=0.092, b=0.1, chin=1.495, crown=1.745),
                  limb=dict(thigh=0.078, knee=0.054, calf=0.054, ankle=0.036, uarm=0.044, elbow=0.036,
                            farm=0.037, wrist=0.026, palm=0.045, foot=0.047)),
}


def joints(b):
    """Bone head/tail positions of body b (dict) in metres."""
    k = b['h'] / 1.72
    z = lambda f: f * k
    J = {}
    J['Hips'] = (Vector((0, 0, z(0.95))), Vector((0, 0, z(1.05))))
    J['Spine'] = (Vector((0, 0, z(1.05))), Vector((0, 0, z(1.22))))
    J['Chest'] = (Vector((0, 0, z(1.22))), Vector((0, 0, z(1.44))))
    J['Neck'] = (Vector((0, 0, z(1.44))), Vector((0, -0.005, z(1.545))))
    J['Head'] = (Vector((0, -0.005, z(1.545))), Vector((0, -0.005, z(1.745))))
    ua, la, ha = b['arm']
    for side, s in (('Left', 1), ('Right', -1)):
        sh = Vector((s * b['sh'], 0.0, z(1.415)))
        J[side + 'Shoulder'] = (Vector((s * 0.03, 0.0, z(1.405))), sh)
        d = Vector((s * math.sin(ARM_TILT), 0.0, -math.cos(ARM_TILT)))
        el = sh + d * ua; wr = el + d * la
        J[side + 'UpperArm'] = (sh, el)
        J[side + 'LowerArm'] = (el, wr)
        J[side + 'Hand'] = (wr, wr + d * ha)
        hx = s * b['hip']
        J[side + 'UpperLeg'] = (Vector((hx, 0, z(0.915))), Vector((hx, -0.008, z(0.50))))
        J[side + 'LowerLeg'] = (Vector((hx, -0.008, z(0.50))), Vector((hx, 0.0, z(0.085))))
        J[side + 'Foot'] = (Vector((hx, 0.0, z(0.085))), Vector((hx, -0.12 * k, 0.025)))
        J[side + 'Toes'] = (Vector((hx, -0.12 * k, 0.025)), Vector((hx, -0.19 * k, 0.02)))
    return J


def make_rig(name, col, body):
    """Armature with the shared bone set; Z axis of every bone forward (feet: up)."""
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old)
    if bpy.data.armatures.get(name):
        bpy.data.armatures.remove(bpy.data.armatures[name])
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    col.objects.link(ob)
    vl = bpy.context.view_layer
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in vl.objects:
        if o:
            o.select_set(False)
    vl.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    for b in list(eb):
        eb.remove(b)
    J = joints(body)
    for n in BONES:
        b = eb.new(n)
        b.head, b.tail = J[n]
    for n in BONES:
        b = eb[n]
        if n in PARENT:
            b.parent = eb[PARENT[n]]
        b.use_connect = False
        b.align_roll(Z if ('Foot' in n or 'Toes' in n) else FWD)
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.show_in_front = True
    arm.display_type = 'STICK'
    return ob


# ── build context ───────────────────────────────────────────────────────────

class FC:
    """One bmesh with deform weights, atlas cells and the LOD (0 near, 2 far)."""

    def __init__(self, lod, body):
        self.bm = K.new_bm()
        self.lod, self.body = lod, body
        self.k = body['h'] / 1.72
        self.J = joints(body)
        self.dl = self.bm.verts.layers.deform.verify()
        self.uv = self.bm.loops.layers.uv.verify()

    def z(self, f):
        return f * self.k

    def n(self, n0, n1, n2):
        return (n0, n1, n2)[self.lod]

    # colours
    def paint(self, faces, reg):
        r = A.region(ATLAS, reg)
        u0, v0, u1, v1 = r['uv']
        for f in faces:
            m = len(f.loops)
            for i, l in enumerate(f.loops):   # a small spread inside the cell, clear of its border
                a = 2 * math.pi * i / m
                l[self.uv].uv = (u0 + (0.5 + 0.12 * math.cos(a)) * (u1 - u0), v0 + (0.5 + 0.12 * math.sin(a)) * (v1 - v0))

    def paint_planar(self, faces, reg, origin, ux, vy, w, h):
        """Graphic (emblem, print): planar projection, origin = lower-left corner."""
        r = A.region(ATLAS, reg)
        u0, v0, u1, v1 = r['uv']
        for f in faces:
            for l in f.loops:
                p = l.vert.co - origin
                s = min(max(p.dot(ux) / w, 0.0), 1.0); t = min(max(p.dot(vy) / h, 0.0), 1.0)
                l[self.uv].uv = (u0 + s * (u1 - u0), v0 + t * (v1 - v0))

    def weigh(self, verts, w):
        tot = sum(w.values())
        for v in verts:
            d = v[self.dl]
            for b, x in w.items():
                d[BONES.index(b)] = x / tot

    # shapes
    def ring(self, c, d, a, f, k, n, p=2.0, zfloor=None, twist=0.0):
        """n verts round centre c, perpendicular to d. a = half width (towards
        world X), f/k = front/back depth (vertical lofts) or top/bottom (horizontal)."""
        d = Vector(d).normalized()
        ref = X if abs(d.dot(X)) < 0.9 else Z
        av = (ref - d * ref.dot(d)).normalized()
        bv = d.cross(av)
        if abs(d.z) > 0.5:
            bp, bn = (f, k) if bv.dot(FWD) > 0 else (k, f)
        else:
            bp, bn = (f, k) if bv.z > 0 else (k, f)
        e = 2.0 / p
        out = []
        for j in range(n):
            th = 2 * math.pi * j / n + twist
            cs, sn = math.cos(th), math.sin(th)
            x = math.copysign(abs(cs) ** e, cs) * a
            y = math.copysign(abs(sn) ** e, sn) * (bp if sn > 0 else bn)
            co = Vector(c) + av * x + bv * y
            if zfloor is not None and co.z < zfloor:
                co.z = zfloor
            out.append(self.bm.verts.new(co))
        return out

    def loft(self, rings, n, cap0=True, cap1=True, p=2.0, inside=False):
        """rings: dicts c, d (optional: from neighbours), a, f, k, w (weights),
        reg (band to the next ring: name or fn(i, j, centre)), lod (max LOD),
        p, cap (cap dome offset). Returns faces per band."""
        rings = [r for r in rings if r.get('lod', 2) >= self.lod]
        cs = [Vector(r['c']) for r in rings]
        vs = []
        for i, r in enumerate(rings):
            d = r.get('d')
            if d is None:
                d = (cs[min(i + 1, len(cs) - 1)] - cs[max(i - 1, 0)])
                if d.length < 1e-6:
                    d = cs[-1] - cs[0]
            r['_d'] = Vector(d).normalized()
            if r['a'] <= 0:
                v = [self.bm.verts.new(cs[i])]
            else:
                v = self.ring(cs[i], r['_d'], r['a'], r.get('f', r['a']), r.get('k', r.get('f', r['a'])), n,
                              r.get('p', p), r.get('zfloor'), r.get('twist', 0.0))
            self.weigh(v, r['w'])
            vs.append(v)
        bands = []
        bm = self.bm
        for i in range(len(rings) - 1):
            a, b = vs[i], vs[i + 1]
            fs = []
            for j in range(n):
                jj = (j + 1) % n
                if len(a) == 1:
                    q = [a[0], b[jj], b[j]]
                elif len(b) == 1:
                    q = [a[j], a[jj], b[0]]
                else:
                    q = [a[j], a[jj], b[jj], b[j]]
                if inside:
                    q = q[::-1]
                fs.append(bm.faces.new(q))
            reg = rings[i].get('reg')
            if callable(reg):
                for j, fc in enumerate(fs):
                    self.paint([fc], reg(i, j, fc.calc_center_median()))
            elif reg:
                self.paint(fs, reg)
            bands.append(fs)
        caps = []
        for end, cap in ((0, cap0), (-1, cap1)):
            if not cap or len(vs[end]) == 1:
                continue
            r = rings[end]; v = vs[end]
            ctr = bm.verts.new(cs[end] + r['_d'] * r.get('cap', 0.0) * (1 if end else -1))
            self.weigh([ctr], r['w'])
            for j in range(n):
                jj = (j + 1) % n
                q = [ctr, v[j], v[jj]] if end else [ctr, v[jj], v[j]]
                if inside:
                    q = q[::-1]
                caps.append(bm.faces.new(q))
            near = rings[-2 if end else 0].get('reg')
            self.paint(caps[-n:], r.get('cap_reg') or (near if isinstance(near, str) else 'SKIN_A'))
        return bands, caps

    def box(self, c, h, reg, w, rot=None, skip=()):
        """Box centred at c with half sizes h (x, y, z), rotated by rot (Matrix 3x3)."""
        rot = rot or Matrix.Identity(3)
        c = Vector(c)
        P = [c + rot @ Vector((sx * h[0], sy * h[1], sz * h[2])) for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        v = [self.bm.verts.new(p) for p in P]
        self.weigh(v, w)
        quads = {'-z': (0, 2, 3, 1), '+z': (4, 5, 7, 6), '-y': (0, 1, 5, 4), '+y': (2, 6, 7, 3),
                 '-x': (0, 4, 6, 2), '+x': (1, 3, 7, 5)}
        fs = {k: self.bm.faces.new([v[i] for i in q]) for k, q in quads.items() if k not in skip}
        self.paint(fs.values(), reg)
        return fs

    def tube(self, pts, r, n, reg, w, caps=True):
        rings = [dict(c=p, a=r, f=r, k=r, w=(w(i) if callable(w) else w), reg=reg) for i, p in enumerate(pts)]
        return self.loft(rings, n, caps, caps)

    def lathe(self, profile, n, cx, cy, reg, w, closed=False, sx=1.0, sy=1.0, z_axis=None, regs=None):
        """Closed or open (r, z) profile revolved about a vertical axis; band i
        coloured regs[i] if given. Outward faces for a profile running
        outside-up (counter-clockwise in (r, z))."""
        bm = self.bm
        rings = []
        for r, z in profile:
            ring = [bm.verts.new((cx + sx * r * math.cos(2 * math.pi * j / n), cy + sy * r * math.sin(2 * math.pi * j / n), z))
                    for j in range(n)]
            self.weigh(ring, w)
            rings.append(ring)
        m = len(rings) if closed else len(rings) - 1
        out = []
        for i in range(m):
            a, b = rings[i], rings[(i + 1) % len(rings)]
            fs = [bm.faces.new([a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]]) for j in range(n)]
            self.paint(fs, regs[i] if regs else reg)
            out += fs
        return out


def skinned_object(name, c, col, rig, mat):
    """Mesh from the context, triangles only, vertex groups = bones, armature modifier."""
    bm = c.bm
    bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
    me = bpy.data.meshes.get(name)
    if me:
        me.clear_geometry()
    else:
        me = bpy.data.meshes.new(name)
    me.materials.clear()
    me.materials.append(mat)
    bm.to_mesh(me); bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(55))
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    for b in BONES:
        ob.vertex_groups.new(name=b)
    if rig:
        ob.parent = rig
        md = ob.modifiers.new('Armature', 'ARMATURE')
        md.object = rig
    return ob


def rigid_object(name, c, col, mat):
    """Hand props (umbrella, phone): plain mesh, origin = grip."""
    bm = c.bm
    bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
    me = bpy.data.meshes.get(name) or bpy.data.meshes.new(name)
    me.clear_geometry()
    me.materials.clear()
    for m in (mat if isinstance(mat, (list, tuple)) else [mat]):
        me.materials.append(m)
    bm.to_mesh(me); bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(40))
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


def lerp_w(a, b, t):
    """Blend two weight dicts."""
    out = {}
    for k, v in a.items():
        out[k] = out.get(k, 0) + v * (1 - t)
    for k, v in b.items():
        out[k] = out.get(k, 0) + v * t
    return {k: v for k, v in out.items() if v > 1e-3}
