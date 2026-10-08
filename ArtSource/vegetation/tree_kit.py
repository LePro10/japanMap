"""Vegetation kit (task 4): trees and shrubs from a plan (skeleton +
foliage clusters), one cut-out material M_Flora_Atlas per tree (the Unity
instancing renderer, D18, draws one material per tree and LOD).

- Branches are tapered tubes with parallel-transport frames (no twisting),
  bark strip mapped along the length (U, metres) and once round (V).
- A foliage cluster is a dark opaque core lump plus a shell of leaf cards
  (alpha) on the faces of an icosahedron (LOD0, 20 cards) or an octahedron
  (LOD1, 8 bigger cards). Cards stick half out of the core, so the outline
  is ragged and the inside never shows sky.
- Normals of cards and cores are custom: a blend of "away from the cluster
  centre" and "away from the crown centre" plus a little up. A flat card
  with its face normal would light like a sheet of paper; this way the crown
  shades like one soft volume (standard foliage trick).
- LOD2 (<= 100 triangles, D18 instead of billboards): trunk prism + a few
  lumps in the card's average colour (FAR_ cells), same custom normals.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix, noise
from kit import core as K, atlas as A, organic as O

ATLAS = 'Flora'
Z = Vector((0, 0, 1))


def R(name):
    return A.region(ATLAS, name)


class Plan:
    """What a tree is made of, independent of LOD."""

    def __init__(s, seed):
        s.rnd = random.Random(seed)
        s.branches = []     # dict(pts, radii, bark, level, sides)
        s.clusters = []     # dict(c, size, card, core, level, up, roll, seed, kind)
        s.far = []          # LOD2 lumps: (centre, size, far cell)
        s.far_trunk = None  # (height, radius, bark cell)
        s.extras = []       # fn(t) for LOD0/1 (rope, supports)
        s.curtains = []     # weeping strands: dict(top, length, width, card, seed)
        s.crown = (Vector((0, 0, 5)), 4.0)

    def branch(s, pts, radii, bark, level, sides=None):
        s.branches.append(dict(pts=[Vector(p) for p in pts], radii=list(radii), bark=bark, level=level, sides=sides))

    def cluster(s, c, size, card, core='CORE_LEAF', level=0, up=0.25, roll=None, kind='ico', core_k=0.72, card_k=1.0):
        s.clusters.append(dict(c=Vector(c), size=Vector(size), card=card, core=core, level=level, up=up, roll=roll,
                               seed=s.rnd.randrange(1 << 20), kind=kind, core_k=core_k, card_k=card_k))


def curve(rnd, p0, d0, L, n, wobble=0.15, pull=(0, 0, 0), pull_k=0.0):
    """Points of a bending limb: direction drifts randomly and towards `pull`
    (up for tips that turn to the light, down for weight)."""
    p = Vector(p0); d = Vector(d0).normalized(); pull = Vector(pull)
    pts = [p.copy()]
    for i in range(n):
        d = (d + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * wobble + pull * pull_k).normalized()
        p = p + d * (L / n)
        pts.append(p.copy())
    return pts


def taper(n, r0, r1, flare=0.0):
    """Radii along n+1 points; flare widens the foot (root buttress)."""
    return [r1 + (r0 - r1) * (1 - i / n) ** 0.9 + r0 * flare * math.exp(-i * 3.0 / max(n, 1)) for i in range(n + 1)]


# ── building one LOD ────────────────────────────────────────────────────────

class T:
    def __init__(s, lod, crown):
        s.lod = lod
        s.bm = K.new_bm()
        s.cl = s.bm.faces.layers.int.new('cluster')   # custom-normal group per face (0 = keep)
        s.uv = s.bm.loops.layers.uv.verify()
        s.groups = [None]
        s.crown = crown

    def group(s, c, half, up):
        s.groups.append((Vector(c), Vector(half), up))
        return len(s.groups) - 1

    def tag(s, faces, g):
        for f in faces:
            f[s.cl] = g


def tube(t, pts, radii, n, reg, tip=True):
    """Tapered tube along pts with bark strip `reg` (U along, V round)."""
    P = pts
    m = len(P)
    tans = [(P[min(i + 1, m - 1)] - P[max(i - 1, 0)]).normalized() for i in range(m)]
    ref = Vector((1, 0, 0)) if abs(tans[0].z) > 0.9 else Z
    a = tans[0].cross(ref).normalized()
    rings = []
    for i in range(m):
        a = (a - tans[i] * a.dot(tans[i])).normalized()        # parallel transport: no twist
        b = tans[i].cross(a)
        rings.append([t.bm.verts.new(P[i] + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * radii[i])
                      for k in range(n)])
    dist = [0.0]
    for i in range(1, m):
        dist.append(dist[-1] + (P[i] - P[i - 1]).length)
    u0, v0, u1, v1 = reg['uv']
    # the strip goes round `reps` times on thick trunks (once round squeezed the
    # bark 2-6x across: pine plates read as paving); reps divides n, so every
    # face stays inside the strip
    circ = 2 * math.pi * sum(radii) / m
    reps = max([d for d in range(1, n + 1) if n % d == 0 and d <= max(1, round(circ / reg['h_m']))])
    per = n // reps
    faces = []
    for i in range(m - 1):
        A_, B_ = rings[i], rings[i + 1]
        for k in range(n):
            f = t.bm.faces.new([A_[k], A_[(k + 1) % n], B_[(k + 1) % n], B_[k]])
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - (P[i] + P[i + 1]) / 2) < 0:
                f.normal_flip()
            for l in f.loops:
                j = 0 if l.vert in A_ else 1
                kk = (A_ if j == 0 else B_).index(l.vert)
                kv = (k % per) + (0 if kk == k else 1)        # this face's own two columns
                l[t.uv].uv = (dist[i + j] / reg['w_m'], v0 + kv / per * (v1 - v0))
            faces.append(f)
    if tip:
        apex = t.bm.verts.new(P[-1] + tans[-1] * radii[-1] * 2.5)
        for k in range(n):
            f = t.bm.faces.new([rings[-1][k], rings[-1][(k + 1) % n], apex])
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - P[-1]) < 0:
                f.normal_flip()
            for l in f.loops:
                if l.vert is apex:
                    kv = (k % per) + 0.5
                else:
                    kv = (k % per) + (0 if rings[-1].index(l.vert) == k else 1)
                l[t.uv].uv = ((dist[-1] + (0 if l.vert is not apex else radii[-1] * 2.5)) / reg['w_m'], v0 + kv / per * (v1 - v0))
            faces.append(f)
    return faces


_UNIT = {}


def _unit(kind):
    """Face centres + corner lists of a unit icosahedron / octahedron."""
    if kind not in _UNIT:
        if kind == 'oct':
            v = [Vector(p) for p in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
            fs = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
            _UNIT[kind] = [[v[i] for i in f] for f in fs]
        else:
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=1 if kind == 'ico' else 2, radius=1.0)
            _UNIT[kind] = [[v.co.copy() for v in f.verts] for f in bm.faces]
            bm.free()
    return _UNIT[kind]


def cards(t, c, half, reg, kind, rnd, roll=None, k=1.0, up=0.25, tilt=0.8, depth=(0.62, 1.02), zmax=None):
    """Leaf cards on the faces of a unit shell scaled to `half`. roll='hang':
    cards stay upright (weeping strands); otherwise random roll."""
    u0, v0, u1, v1 = reg['uv']
    out = []
    edge = {'ico': 1.05, 'ico2': 0.55, 'oct': 1.41}[kind]
    for corners in _unit(kind):
        fc = sum(corners, Vector()) / 3
        # a card somewhere in the outer shell (not all on one sphere: the
        # tangent cards seen edge-on drew the sphere's rim as a line)
        d = (fc.normalized() + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.25).normalized()
        r = rnd.uniform(*depth)
        p = Vector((c.x + d.x * half.x * r, c.y + d.y * half.y * r, c.z + d.z * half.z * r))
        n = Vector((d.x / max(half.x, 1e-3), d.y / max(half.y, 1e-3), d.z / max(half.z, 1e-3))).normalized()
        tv = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * tilt
        n = (n + tv + Z * up).normalized()
        if zmax is not None and p.z > zmax:        # clipped shrub: nothing sticks out of the planed top
            p.z = zmax
            n = (Z + tv * 0.3).normalized()
        s = edge * k * (half.x + half.y + half.z) / 3 * rnd.uniform(0.85, 1.15)
        if roll == 'hang':
            a = Z.cross(n).normalized() if abs(n.z) < 0.95 else Vector((1, 0, 0))
            b = Z.copy()
            sx, sy = s * 0.9, s * 1.4
        else:
            ref = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
            a = n.cross(ref).normalized()
            ang = rnd.uniform(0, 2 * math.pi)
            a = (Matrix.Rotation(ang, 3, n) @ a).normalized()
            b = n.cross(a)
            sx = sy = s
        vs = [t.bm.verts.new(p + a * (x * sx / 2) + b * (y * sy / 2)) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        f = t.bm.faces.new(vs)
        flip = rnd.random() < 0.5
        for l, (uu, vv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            if flip:
                uu = 1 - uu
            l[t.uv].uv = (u0 + uu * (u1 - u0), v0 + vv * (v1 - v0))
        out.append(f)
    return out


def oct_core(t, c, half, reg):
    """8-triangle core for LOD1 (an icosahedron costs 20)."""
    fs = []
    for corners in _unit('oct'):
        vs = [t.bm.verts.new(Vector((c[0] + p.x * half[0], c[1] + p.y * half[1], c[2] + p.z * half[2]))) for p in corners]
        fs.append(t.bm.faces.new(vs))
    K.map_faces(t.bm, fs, reg, zrange=(c[2] - half[2], c[2] + half[2]))
    return fs


def curtain(t, cu, reg, lod):
    """Hanging strands of a weeping cherry: a column of upright cards (two
    crossed in LOD0, one in LOD1), each the full card (no stretching), the
    column narrowing and swaying a little towards the bottom."""
    rnd = random.Random(cu['seed'])
    u0, v0, u1, v1 = reg['uv']
    top, L, w = Vector(cu['top']), cu['length'], cu['width']
    n = max(1, round(L / (w * cu.get('aspect', 1.3))))     # card height / width (willow strands: 5)
    h = L / n
    a0 = rnd.uniform(0, math.pi)
    out = []
    for i in range(n):
        zt = top.z - i * h
        sway = Vector((math.cos(a0), math.sin(a0), 0)) * (0.08 * i)
        ww = w * (1 - 0.12 * i)
        for k in ((0, 1) if lod == 0 else (0,)):
            a = a0 + k * math.pi / 2
            d = Vector((math.cos(a), math.sin(a), 0)) * ww / 2
            c = Vector((top.x, top.y, zt)) + sway
            vs = [t.bm.verts.new(p) for p in (c - d - Z * h, c + d - Z * h, c + d, c - d)]
            f = t.bm.faces.new(vs)
            for l, (uu, vv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                l[t.uv].uv = (u0 + uu * (u1 - u0), v0 + vv * (v1 - v0))
            out.append(f)
    return out


def lump(t, c, size, reg, seed, subdiv=1, amp=0.18):
    """Core / far lump: a dense foliage tile (rect) per face, or a cell."""
    fs = O.lump(t.bm, c, size, seed, subdiv=subdiv, amp=amp, freq=1.6, detail=0.05)
    K.map_faces(t.bm, fs, reg, zrange=(c[2] - size[2] / 2, c[2] + size[2] / 2))
    return fs


def build_lod(plan, lod, max_level):
    """LOD0: all branches up to max_level[0], icosahedron shells, cores.
    LOD1: thick branches only, octahedron shells, small cores.
    LOD2: far body (trunk prism + lumps)."""
    t = T(lod, plan.crown)
    if lod == 2:
        h, r, cell = plan.far_trunk
        if h > 0:
            fs = tube(t, [Vector((0, 0, -0.05)), Vector((0, 0, h))], [r, r * 0.6], 4, R(cell), tip=False)
            K.map_faces(t.bm, fs, R(cell))
        for c, size, cell in plan.far:
            g = t.group(c, Vector(size) / 2, 0.35)
            t.tag(lump(t, c, size, R(cell), 7, subdiv=1, amp=0.12), g)
        return t
    rnd = random.Random(11 + lod)
    for b in plan.branches:
        if b['level'] > max_level[lod]:
            continue
        if b['sides']:
            sides = b['sides'] if lod == 0 else max(3, b['sides'] // 2 + 1)
        else:
            sides = [8, 6, 4, 3][b['level']] if lod == 0 else [5, 4, 3, 3][b['level']]
        pts, radii = b['pts'], b['radii']
        if lod == 1 and len(pts) > 4:              # fewer rings far away
            keep = sorted(set(list(range(0, len(pts), 2)) + [len(pts) - 1]))
            pts = [pts[i] for i in keep]; radii = [radii[i] for i in keep]
        tube(t, pts, radii, sides, R(b['bark']), tip=b['level'] > 0)
    for cl in plan.clusters:
        if lod == 1 and cl['level'] >= 2:         # level 2: small fill clusters, LOD0 only
            continue
        half = cl['size'] / 2
        g = t.group(cl['c'], half, cl['up'])
        rr = random.Random(cl['seed'] + lod)
        kind = cl['kind'] if lod == 0 else ('ico' if cl['kind'] == 'ico2' else 'oct')
        k = cl['card_k'] * (1.0 if lod == 0 else 1.1)
        t.tag(cards(t, cl['c'], half, R(cl['card']), kind, rr, cl['roll'], k, cl['up']), g)
        if cl['core']:
            ck = cl['core_k']
            if lod == 0:
                t.tag(lump(t, cl['c'], cl['size'] * ck, R(cl['core']), cl['seed'], subdiv=1), g)
            else:
                t.tag(oct_core(t, cl['c'], cl['size'] * ck / 2, R(cl['core'])), g)
    for cu in plan.curtains:
        g = t.group(cu['top'] - Z * cu['length'] / 2, Vector((cu['width'], cu['width'], cu['length'] / 2)), 0.1)
        t.tag(curtain(t, cu, R(cu['card']), lod), g)
    for fn in plan.extras:
        fn(t)
    return t


def finish(t, name, col, mat, hidden):
    """Mesh object + custom normals for the foliage groups (smooth bark)."""
    ob = K.mesh_object(name, t.bm, col, [mat], bevel=0.0, smooth=True, hidden=hidden, recalc=False)
    me = ob.data
    me.set_sharp_from_angle(angle=math.pi)          # bark and lumps: all smooth
    attr = me.attributes.get('cluster')
    vals = [0] * len(me.polygons)
    attr.data.foreach_get('value', vals)
    cc, cr = t.crown
    ns = [(0.0, 0.0, 0.0)] * len(me.loops)
    for p in me.polygons:
        gi = vals[p.index]
        if not gi:
            continue
        c, half, up = t.groups[gi]
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            d = co - c
            a = Vector((d.x / half.x, d.y / half.y, d.z / half.z))
            b = (co - cc) / cr
            n = a.normalized() * 0.55 + (b.normalized() if b.length > 1e-4 else Z) * 0.45 + Z * up * 0.6
            ns[li] = tuple(n.normalized())
    me.normals_split_custom_set(ns)
    me.attributes.remove(attr)
    if 'nobevel' in me.attributes:
        me.attributes.remove(me.attributes['nobevel'])
    return ob


def build(name, plan, max_level=(3, 1), collider=None):
    col = K.collection(name)
    mat = K.cutout_material(ATLAS)
    objs = []
    for lod in (0, 1, 2):
        t = build_lod(plan, lod, max_level)
        objs.append(finish(t, f'SM_{name}_LOD{lod}', col, mat, hidden=lod > 0))
    for o in objs:
        o['cutout'] = 1.0          # clay preview keeps the leaf alpha
    if collider:
        K.collider_box(f'COL_{name}', col, *collider)
    return col, objs
