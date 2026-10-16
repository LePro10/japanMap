"""Shared helpers for the Details props (task 6): one build loop for a set
of assets (LOD0 with 1-segment bevel, LOD1 without, optional LOD2), and a
few shape helpers on the koedo build context (atlas `Details`)."""
import math
from mathutils import Vector, Matrix
from kit import core as K
from buildings.koedo_kit import C, orient
from props import scatter_kit as S

ATLAS = 'Details'
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def ctx(lod):
    return C(ATLAS, lod)


def n_(c, a, b, d=None):
    return (a, b, d or b)[c.lod]


def box(c, centre, half, reg, rot=None, bevel=True, skip=()):
    """Box by centre and half sizes, rotated about its centre (rot: Matrix 3x3)."""
    bm = c.bm
    rot = rot or Matrix.Identity(3)
    ctr = Vector(centre)
    P = [ctr + rot @ Vector((sx * half[0], sy * half[1], sz * half[2])) for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
    v = [bm.verts.new(p) for p in P]
    quads = {'-z': (0, 2, 3, 1), '+z': (4, 5, 7, 6), '-y': (0, 1, 5, 4), '+y': (2, 6, 7, 3), '-x': (0, 4, 6, 2), '+x': (1, 3, 7, 5)}
    fs = {k: bm.faces.new([v[i] for i in q]) for k, q in quads.items() if k not in skip}
    orient(list(fs.values()), ctr)
    c.m(list(fs.values()), reg)
    if not bevel:
        c.nb(list(fs.values()))
    return fs


def gfx_box(c, centre, half, reg_front, reg_rest, rot=None, front='-y', bevel=False):
    """Board whose front face carries a graphic (rect region), the rest plain."""
    fs = box(c, centre, half, reg_rest, rot=rot, bevel=bevel)
    c.m([fs[front]], reg_front)
    if front.startswith('-') and ('+' + front[1:]) in fs:
        pass
    return fs


def cyl(c, x, y, z0, z1, r, reg, n=None, r1=None, cap=True, cap_reg=None):
    n = n or n_(c, 12, 8, 6)
    p = K.lathe(c.bm, n, [(r, z0), (r1 if r1 is not None else r, z1)], cx=x, cy=y, cap_bottom=False, cap_top=cap)
    K.map_cyl(c.bm, p['sides'], c.R(reg), cx=x, cy=y)
    if p['top']:
        c.m([p['top']], cap_reg or reg)
    c.nb(p['sides'])
    return p


def lathe(c, prof, x, y, reg, n=None, regs=None):
    """Revolved profile; regs: region per band (else reg)."""
    n = n or n_(c, 14, 10, 6)
    p = K.lathe(c.bm, n, prof, cx=x, cy=y, cap_bottom=False, cap_top=prof[-1][0] > 0)
    sides = p['sides']
    for k in range(len(prof) - 1):
        band = sides[k * n:(k + 1) * n]
        c.m(band, regs[k] if regs else reg)
    if p['top']:
        c.m([p['top']], regs[-1] if regs else reg)
    c.nb(sides)
    return p


def tube(c, pts, r, reg, n=None, caps=True):
    s, c0, c1 = K.tube_path(c.bm, [Vector(p) for p in pts], r, n or n_(c, 8, 6, 4), cap0=caps, cap1=caps)
    fs = s + [f for f in (c0, c1) if f]
    c.m(fs, reg); c.nb(fs)
    return fs


def blob(c, centre, radii, reg, sub=None, rot=None):
    """Smooth ellipsoid (ico sphere scaled), for heads, bellies, round bodies."""
    import bmesh
    # budget: only big shapes get the 320-triangle sphere, small ones 80, far LODs 20
    sub = sub or ((3 if max(radii) > 0.14 else 2) if c.lod == 0 else (2 if c.lod == 1 else 1))
    r = bmesh.ops.create_icosphere(c.bm, subdivisions=sub, radius=1.0)
    rot = rot or Matrix.Identity(3)
    ctr = Vector(centre)
    for v in r['verts']:
        v.co = ctr + rot @ Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    fs = list({f for v in r['verts'] for f in v.link_faces})
    if c.R(reg)['kind'] == 'strip':
        K.map_box(c.bm, fs, c.R(reg))
    else:
        c.m(fs, reg)
    c.nb(fs)
    return fs


def disc_face(c, centre, r, normal, reg, n=None, t=0.01, back=None):
    return S.disc(c, centre, r, normal, n or n_(c, 16, 10, 8), reg, back or reg, t=t)


def build_set(assets, prefix, klass='props', only=None, lods=2, bevel=0.008, extra_mats=()):
    """assets: {name: fn(c)}. Returns [(col, [LOD meshes])] ready for build.run."""
    mat = K.atlas_material(ATLAS, emission_strength=3.0)
    out = []
    for name, fn in assets.items():
        if only and name not in only:
            continue
        col = K.collection(f'{prefix}_{name}')
        meshes = []
        for lod in range(lods):
            c = ctx(lod)
            res = fn(c)
            ob = K.mesh_object(f'SM_{prefix}_{name}_LOD{lod}', c.bm, col, [mat], bevel=bevel if lod == 0 else 0.0)
            if lod:
                ob.hide_set(True); ob.hide_render = True
            meshes.append(ob)
            if lod == 0 and isinstance(res, dict):
                for k, v in res.get('lights', {}).items():
                    K.light_marker(f'LIGHT_{prefix}_{name}_{k}', col, v[0], color=v[1], unity_range=v[2])
                for k, v in res.get('markers', {}).items():
                    K.marker(f'{k}', col, v)
        out.append((col, meshes))
    return out


def row_preview(results, name, gap=0.4, size=(1500, 420), views=None):
    """Assets side by side along X for one overview picture."""
    from kit import preview as P
    objs = [lods[0] for _, lods in results]
    x = 0.0
    moved = []
    for col, lods in results:
        o = lods[0]
        w = max(o.dimensions.x, 0.2)
        dx = x + w / 2
        for ob in col.objects:
            moved.append((ob, ob.location.copy()))
            ob.location.x += dx
        x += w + gap
    try:
        return P.render(objs, name, views or [('mood', (0.3, -1.6, 0.45), True), ('front', (0.3, -1.6, 0.45), False),
                                              ('back', (-0.3, 1.6, 0.45), False), ('clay', (0.6, -1.4, 0.5), 'clay')],
                        size=size, show=[c.name for c, _ in results])
    finally:
        for ob, loc in moved:
            ob.location = loc
