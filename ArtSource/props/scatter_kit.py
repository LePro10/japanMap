"""Small shared parts for the scatter props (task 5a, atlas `Scatter`): round
posts with caps, plates and discs facing a direction, bolts, band clamps,
concrete foot pads - the fixings STYLE-KIT asks to show.

All on the koedo_kit build context C (one bmesh + atlas + LOD)."""
import math
import random
from mathutils import Vector, Matrix
from kit import core as K
from buildings.koedo_kit import C, orient
from buildings.tokyo_kit import F

ATLAS = 'Scatter'
UP = Vector((0, 0, 1))


def ctx(lod):
    return C(ATLAS, lod)


def basis(d):
    d = Vector(d).normalized()
    a = d.cross(UP if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
    return d, a, d.cross(a)


def post(c, x, y, z0, z1, r, reg, n=None, cap='dome', cap_reg=None):
    """Round post from z0 to z1; cap 'dome' (pressed steel cap), 'flat' or None."""
    n = n or (12 if c.lod == 0 else 6)
    prof = [(r, z0), (r, z1)]
    if cap == 'dome':
        prof += [(r + 0.004, z1), (r + 0.004, z1 + 0.012), (r * 0.55, z1 + r * 0.6), (0.0, z1 + r * 0.7)]
    p = K.lathe(c.bm, n, prof, cx=x, cy=y, cap_bottom=False, cap_top=cap == 'flat')
    c.m(p['sides'][:n], reg)
    if len(p['sides']) > n:
        c.m(p['sides'][n:], cap_reg or reg); c.nb(p['sides'][n:])
    if p['top']:
        c.m([p['top']], cap_reg or reg)
    return p


def disc(c, centre, r, d, n, front, back, t=0.012, rim=None):
    """Round plate at centre facing d; front/back regions; returns front face."""
    d, a, b = basis(d)
    centre = Vector(centre)
    fr = [c.bm.verts.new(centre + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * r) for k in range(n)]
    bk = [c.bm.verts.new(v.co - d * t) for v in fr]
    ff = c.bm.faces.new(fr); bf = c.bm.faces.new(bk[::-1])
    for f, s in ((ff, 1), (bf, -1)):
        f.normal_update()
        if f.normal.dot(d) * s < 0:
            f.normal_flip()
    side = [c.bm.faces.new([fr[k], fr[(k + 1) % n], bk[(k + 1) % n], bk[k]]) for k in range(n)]
    orient(side, centre - d * t / 2)
    c.m([ff], front); c.m([bf], back); c.m(side, rim or back); c.nb([ff, bf] + side)
    return ff


def plate(c, centre, w, h, d, front, back, t=0.004, edge=None):
    """Rectangular plate (sign, flag panel) centred at centre, facing d, w wide
    (horizontal) and h tall. Returns (front, back)."""
    d = Vector(d).normalized()
    f = F(Vector(centre) - Vector((0, 0, centre[2])), (d.x, d.y))
    zc = centre[2]
    b = c.box(f, -w / 2, w / 2, zc - h / 2, zc + h / 2, -t, 0.0)
    c.m([b['out']], front); c.m([b['in']], back)
    c.m([b[k] for k in ('top', 'bot', 'l', 'r') if k in b], edge or back)
    return b['out'], b['in']


def bolt(c, p, d, r=0.012, h=0.008, reg='GALV'):
    """Hex bolt head at p pointing along d."""
    if c.lod:
        return
    d, a, b = basis(d)
    p = Vector(p)
    ring = lambda rr, hh: [c.bm.verts.new(p + d * hh + (a * math.cos(2 * math.pi * k / 6) + b * math.sin(2 * math.pi * k / 6)) * rr)
                           for k in range(6)]
    r0, r1 = ring(r, 0.0), ring(r, h)
    fs = [c.bm.faces.new([r0[k], r0[(k + 1) % 6], r1[(k + 1) % 6], r1[k]]) for k in range(6)]
    fs.append(c.bm.faces.new(r1))
    orient(fs, p)
    c.m(fs, reg); c.nb(fs)


def band(c, x, y, z, r, reg='GALV', h=0.04, ear=None):
    """Band clamp round a post (radius r) at height z; ear = direction of the
    bolted lugs (Vector), with two bolts through them."""
    n = 12 if c.lod == 0 else 6
    s = K.lathe(c.bm, n, [(r + 0.005, z - h / 2), (r + 0.005, z + h / 2)], cx=x, cy=y, cap_bottom=False, cap_top=False)
    c.m(s['sides'], reg); c.nb(s['sides'])
    if ear is not None and c.lod == 0:
        e = Vector(ear).normalized()
        f = F(Vector((x, y, 0)), (e.x, e.y))
        c.box(f, -0.012, 0.012, z - h / 2, z + h / 2, r, r + 0.035, reg)
        bolt(c, f(0.014, z, r + 0.02), (e.y, -e.x, 0), r=0.008, h=0.006)


def pad(c, x, y, w, d, h=0.06, reg='CONC_FLAT', bevel=True):
    """Concrete foundation pad (top at z = h above grade, 0.1 m into it)."""
    f = F(Vector((x, y, 0)), (0, -1))
    b = c.box(f, -w / 2, w / 2, -0.1, h, -d / 2, d / 2, reg, skip=('bot',), bevel=bevel)
    return b


def anchor_bolts(c, x, y, z, rad, n=4, phase=math.pi / 4):
    if c.lod:
        return
    for k in range(n):
        a = phase + 2 * math.pi * k / n
        bolt(c, (x + rad * math.cos(a), y + rad * math.sin(a), z), (0, 0, 1), r=0.014, h=0.016)


def build_lods(name, fn, mat, colliders=(), lods=(0, 1), bevel=0.012, markers=None):
    """Collection + SM_<name>_LOD<n> from fn(c) for each LOD; colliders =
    [(suffix, x0, x1, y0, y1, z0, z1)]."""
    col = K.collection(name)
    objs = []
    for lod in lods:
        c = ctx(lod)
        fn(c)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=bevel if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False))
    for sfx, *box in colliders:
        K.collider_box(f'COL_{name}{sfx}', col, *box)
    if markers:
        markers(col)
    return col, objs


def lineup(results, name, views, gap=1.0, size=(900, 480)):
    """Preview: all variants side by side along X (moved back afterwards)."""
    from kit import preview as P
    xs, x = {}, 0.0
    for col, objs in results:
        vs = [v.co for v in objs[0].data.vertices]
        w0, w1 = min(v.x for v in vs), max(v.x for v in vs)
        xs[col.name] = x - w0
        x += (w1 - w0) + gap
    off = x / 2
    for col, _ in results:
        for o in col.objects:
            o.location.x += xs[col.name] - off
    objs = [o[0] for _, o in results]
    show = [c.name for c, _ in results]
    try:
        a = P.render(objs, name, [v for v in views if v[2] != 'clay'], size=size, show=show)
        b = P.render(objs, name + '_clay', [v for v in views if v[2] == 'clay'], size=size, show=show)
    finally:
        for col, _ in results:
            for o in col.objects:
                o.location.x -= xs[col.name] - off
    return f'{a}, {b}'


def placed(c, fn, dx=0.0, dy=0.0, rz=0.0, scale=1.0, dz=0.0):
    """Run fn(c) and move what it added: scale, turn about Z, shift."""
    before = set(c.bm.verts)
    fn(c)
    m = Matrix.Translation((dx, dy, dz)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Scale(scale, 4)
    for v in c.bm.verts:
        if v not in before:
            v.co = m @ v.co


def boxc(c, x, y, w, d, z0, z1, reg, skip=('bot',), bevel=True, front=None):
    """Axis box centred at (x, y), w along X, d along Y; front = region of the -Y face."""
    f = F(Vector((x, y, 0)), (0, -1))
    b = c.box(f, -w / 2, w / 2, z0, z1, -d / 2, d / 2, reg, skip=skip, bevel=bevel)
    if front:
        c.m([b['out']], front)
    return b
