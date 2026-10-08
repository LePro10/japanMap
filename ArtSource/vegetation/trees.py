"""Trees and shrubs of Japan (asset sprint task 4), atlas `Flora`, kit
`vegetation/tree_kit.py`. Each species is a plan (skeleton + foliage
clusters) from a seed; variants share the skeleton and swap cards.

Japanese, not generic (STYLE-KIT): sugi with pruned, bare lower trunk and
clumpy cone; a sacred cedar (shinboku) with shimenawa and shide; a garden
pine (niwaki) with cloud pads on a leaning trunk and wooden supports
(shichū) bound with palm rope; a red pine (akamatsu) with orange upper
bark; momiji with fine layered canopy (green, red, gold); Somei-yoshino
cherry with a wide umbrella crown, and a weeping cherry (shidarezakura);
a mōsō bamboo grove; clipped azalea (karikomi), a clipped round shrub,
hydrangea (ajisai), dwarf bamboo with pale margins (kumazasa), wild shrub.
"""
import math
import random
from mathutils import Vector
from kit import core as K
from vegetation import tree_kit as TK
from vegetation.tree_kit import Plan, curve, taper

KLASS = 'vegetation'
NAME = 'Tree'
TAU = 2 * math.pi
GOLD = 2.39996


def _at(pts, z):
    """Point on a (rising) polyline at height z."""
    for a, b in zip(pts, pts[1:]):
        if a.z <= z <= b.z:
            t = (z - a.z) / max(b.z - a.z, 1e-6)
            return a.lerp(b, t)
    return pts[-1].copy()


# ── cedar ───────────────────────────────────────────────────────────────────

def sugi(seed=1, H=22.0, R0=0.36, Rmax=2.9, base=0.42, card='CARD_SUGI', shinboku=False):
    p = Plan(seed); rnd = p.rnd
    core = 'DENSE_SUGI_OLD' if card == 'CARD_SUGI_OLD' else 'DENSE_SUGI'
    n = 12
    trunk = curve(rnd, (0, 0, -0.1), (0, 0, 1), H, n, wobble=0.015, pull=(0, 0, 1), pull_k=0.4)
    rad = taper(n, R0, 0.04, flare=0.55 if shinboku else 0.22)
    p.branch(trunk, rad, 'BARK_SUGI', 0, sides=10 if shinboku else 8)
    z0 = H * base
    z, a = z0, rnd.uniform(0, TAU)
    step = 1.25 if not shinboku else 1.55
    while z < H - 1.6:
        f = (z - z0) / (H - z0)
        L = Rmax * (1 - f) ** 0.8 + 0.5
        start = _at(trunk, z)
        for j in range(3 if L > 1.4 else 2):
            a += GOLD
            d = (math.cos(a), math.sin(a), -0.25 + 0.55 * f)
            pts = curve(rnd, start, d, L, 3, wobble=0.08, pull=(0, 0, 1), pull_k=0.12)
            p.branch(pts, taper(3, 0.03 + 0.05 * L / Rmax + (0.04 if shinboku else 0), 0.012), 'BARK_SUGI', 1)
            s = 1.0 + 0.75 * L / Rmax
            p.cluster(pts[-1], (s * 1.15, s * 1.15, s * 0.85), card, core, level=1, up=0.15)
            if L > 1.5:
                q = pts[1].lerp(pts[2], 0.5)
                p.cluster(q + Vector((0, 0, 0.15)), (s * 0.9, s * 0.9, s * 0.7), card, core, level=2, up=0.15)
        # inner fill so the cone never shows the trunk between whorls
        p.cluster(start + Vector((0, 0, 0.5)), (L * 1.1, L * 1.1, 1.3), card, core, level=1 if f < 0.6 else 2,
                  up=0.1, core_k=0.8)
        z += step * rnd.uniform(0.85, 1.15)
    top = trunk[-1]
    p.cluster(top + Vector((0, 0, -0.9)), (1.2, 1.2, 2.6), card, core, level=1, up=0.3)
    p.cluster(top + Vector((0, 0, -2.4)), (1.8, 1.8, 2.0), card, core, level=1, up=0.2)
    p.crown = (Vector((0, 0, (z0 + H) / 2)), (H - z0) / 2)
    hc = H - z0
    p.far_trunk = (z0 + 1.0, R0 * (1.4 if shinboku else 1.0), 'BARK_RED')
    p.far = [((0, 0, z0 + hc * 0.25), (Rmax * 2.3, Rmax * 2.3, hc * 0.62), 'FAR_SUGI'),
             ((0, 0, z0 + hc * 0.55), (Rmax * 1.6, Rmax * 1.6, hc * 0.55), 'FAR_SUGI'),
             ((0, 0, z0 + hc * 0.82), (Rmax * 0.85, Rmax * 0.85, hc * 0.42), 'FAR_SUGI')]
    if shinboku:
        p.extras.append(lambda t: _shimenawa(t, trunk, rad))
    return p


def _shimenawa(t, trunk, rad, z=2.3):
    """Rice-straw rope round a sacred tree: thick twisted rope, knot, and
    four zigzag paper streamers (shide) hanging from it."""
    i = next(k for k in range(len(trunk) - 1) if trunk[k + 1].z >= z)
    f = (z - trunk[i].z) / (trunk[i + 1].z - trunk[i].z)
    rr = rad[i] + (rad[i + 1] - rad[i]) * f + 0.06
    c = _at(trunk, z)
    n = 16 if t.lod == 0 else 8
    ring = [c + Vector((math.cos(TAU * i / n) * rr, math.sin(TAU * i / n) * rr, 0.03 * math.sin(3 * TAU * i / n)))
            for i in range(n + 1)]
    fs = TK.tube(t, ring, [0.1] * (n + 1), 6 if t.lod == 0 else 4, TK.R('ROPE'), tip=False)
    K.map_faces(t.bm, fs, TK.R('ROPE'))
    if t.lod == 0:      # knot at the front, hanging ends
        k = c + Vector((0, -rr - 0.05, 0))
        for dx in (-0.12, 0.12):
            fs = TK.tube(t, [k + Vector((dx, 0, 0)), k + Vector((dx * 1.4, -0.05, -0.45))], [0.04, 0.025], 4, TK.R('ROPE'))
            K.map_faces(t.bm, fs, TK.R('ROPE'))
    for i in range(4):  # shide: paper folded into a lightning zigzag, 4 slanted steps down
        ang = -math.pi / 2 + (i - 1.5) * 0.55
        d = Vector((math.cos(ang), math.sin(ang), 0))
        side = Vector((-d.y, d.x, 0))
        top = c + d * (rr + 0.075) + Vector((0, 0, -0.06))
        fs = []
        x, z = 0.0, 0.0
        for j in range(4):
            dx = 0.035 if j % 2 == 0 else -0.035
            a0, a1 = top + side * (x - 0.03) + Vector((0, 0, z)), top + side * (x + 0.03) + Vector((0, 0, z))
            b0, b1 = top + side * (x + dx - 0.03) + Vector((0, 0, z - 0.1)), top + side * (x + dx + 0.03) + Vector((0, 0, z - 0.1))
            vs = [t.bm.verts.new(v) for v in (a0, a1, b1, b0)]
            f = t.bm.faces.new([vs[0], vs[3], vs[2], vs[1]])
            f.normal_update()
            if f.normal.dot(d) < 0:
                f.normal_flip()
            fs.append(f)
            x, z = x + dx, z - 0.1
        K.map_faces(t.bm, fs, TK.R('PAPER'))


# ── pines ───────────────────────────────────────────────────────────────────

def matsu_niwa(seed=4, H=5.2):
    """Kuromatsu garden pine: S-curved leaning trunk, horizontal limbs with
    flat cloud pads (niwaki pruning), the longest limb on two crossed poles."""
    p = Plan(seed); rnd = p.rnd
    n = 9
    trunk = [Vector((0.95 * math.sin(i / n * math.pi * 1.1) + 0.25 * math.sin(i / n * TAU * 1.3),
                     0.35 * math.sin(i / n * TAU * 0.8), -0.1 + i / n * H)) for i in range(n + 1)]
    p.branch(trunk, taper(n, 0.21, 0.06, flare=0.35), 'BARK_KURO', 0)
    a = rnd.uniform(0, TAU)
    limbs = []
    for i, z in enumerate((1.7, 2.3, 2.8, 3.3, 3.8, 4.3)):
        a += GOLD
        start = _at(trunk, z)
        L = 2.6 - 0.32 * i + rnd.uniform(-0.2, 0.2)
        d = (math.cos(a), math.sin(a), -0.12)
        pts = curve(rnd, start, d, L, 4, wobble=0.14, pull=(0, 0, 1), pull_k=0.06)
        p.branch(pts, taper(4, 0.09 - 0.008 * i, 0.03), 'BARK_KURO', 1)
        limbs.append(pts)
        s = 1.9 - 0.15 * i
        p.cluster(pts[-1] + Vector((0, 0, 0.18)), (s, s * 0.9, 0.62), 'CARD_MATSU', 'DENSE_MATSU', level=1, up=0.7, kind='ico2', card_k=1.45)
        # a side pad on a short twig
        q = pts[2]
        e = (math.cos(a + 0.9), math.sin(a + 0.9), 0.15)
        sp = curve(rnd, q, e, 0.8, 2, wobble=0.1)
        p.branch(sp, taper(2, 0.035, 0.015), 'BARK_KURO', 2)
        p.cluster(sp[-1] + Vector((0, 0, 0.12)), (s * 0.7, s * 0.6, 0.45), 'CARD_MATSU', 'DENSE_MATSU', level=2, up=0.7, kind='ico2', card_k=1.45)
    p.cluster(trunk[-1] + Vector((0, 0, 0.1)), (1.5, 1.4, 0.75), 'CARD_MATSU', 'DENSE_MATSU', level=1, up=0.7, kind='ico2', card_k=1.45)
    p.crown = (Vector((0.5, 0, 3.4)), 2.6)
    p.far_trunk = (3.0, 0.22, 'BARK_DARK')
    p.far = [(tuple(l[-1] + Vector((0, 0, 0.2))), (2.0, 2.0, 0.7), 'FAR_MATSU') for l in limbs[:4]] + \
            [(tuple(trunk[-1] + Vector((0, 0, 0.1))), (1.6, 1.6, 0.8), 'FAR_MATSU')]
    p.extras.append(lambda t: _shichu(t, limbs[0]))
    return p


def _shichu(t, limb):
    """Two weathered poles crossing under a long limb, palm-rope binding."""
    q = limb[2].lerp(limb[3], 0.4)
    d = (limb[3] - limb[1]).normalized()
    side = Vector((-d.y, d.x, 0)).normalized()
    top = q + Vector((0, 0, -0.1))
    n = 6 if t.lod == 0 else 4
    for sg in (-1, 1):
        foot = Vector((top.x, top.y, -0.1)) + side * (0.55 * sg)
        fs = TK.tube(t, [foot, top + side * (0.05 * sg) + Vector((0, 0, 0.12))], [0.045, 0.04], n, TK.R('POLE'), tip=False)
        K.map_faces(t.bm, fs, TK.R('POLE'))
    if t.lod == 0:
        fs = TK.tube(t, [top - d * 0.09, top + d * 0.09], [0.1, 0.1], 6, TK.R('PALM_ROPE'), tip=False)
        K.map_faces(t.bm, fs, TK.R('PALM_ROPE'))


def matsu_aka(seed=6, H=14.0):
    """Akamatsu: tall leaning trunk, grey plated bark below, orange above,
    an irregular crown of pads at the top."""
    p = Plan(seed); rnd = p.rnd
    n = 10
    trunk = curve(rnd, (0, 0, -0.1), (0.18, 0.05, 1), H, n, wobble=0.05, pull=(0, 0, 1), pull_k=0.05)
    rad = taper(n, 0.27, 0.06, flare=0.25)
    k = 4
    p.branch(trunk[:k + 1], rad[:k + 1], 'BARK_KURO', 0)
    p.branch(trunk[k:], rad[k:], 'BARK_AKA', 0)
    a = rnd.uniform(0, TAU)
    pads = []
    for i, z in enumerate((H * 0.55, H * 0.61, H * 0.67, H * 0.73, H * 0.78, H * 0.83, H * 0.88, H * 0.93)):
        a += GOLD
        start = _at(trunk, z)
        L = 3.6 - 0.32 * i
        pts = curve(rnd, start, (math.cos(a), math.sin(a), 0.45), L, 4, wobble=0.15, pull=(0, 0, 1), pull_k=0.05)
        p.branch(pts, taper(4, 0.1 - 0.01 * i, 0.03), 'BARK_AKA', 1)
        s = 2.7 - 0.15 * i
        p.cluster(pts[-1] + Vector((0, 0, 0.2)), (s, s, 1.1), 'CARD_MATSU', 'DENSE_MATSU', level=1, up=0.55, kind='ico2', card_k=1.45)
        p.cluster(pts[2] + Vector((0, 0, 0.35)), (s * 0.8, s * 0.8, 0.9), 'CARD_MATSU', 'DENSE_MATSU', level=2, up=0.55, kind='ico2', card_k=1.45)
        pads.append(pts[-1])
        q = pts[2]
        sp = curve(rnd, q, (math.cos(a - 1.0), math.sin(a - 1.0), 0.3), 1.1, 2, wobble=0.1)
        p.branch(sp, taper(2, 0.04, 0.015), 'BARK_AKA', 2)
        p.cluster(sp[-1] + Vector((0, 0, 0.15)), (s * 0.65, s * 0.65, 0.65), 'CARD_MATSU', 'DENSE_MATSU', level=2, up=0.55, kind='ico2', card_k=1.45)
    p.cluster(trunk[-1] + Vector((0, 0, 0.2)), (2.0, 2.0, 1.1), 'CARD_MATSU', 'DENSE_MATSU', level=1, up=0.55, kind='ico2', card_k=1.45)
    c = sum(pads, Vector()) / len(pads)
    p.crown = (c, 3.5)
    p.far_trunk = (H * 0.75, 0.27, 'BARK_RED')
    p.far = [(tuple(x + Vector((0, 0, 0.2))), (2.8, 2.8, 1.1), 'FAR_MATSU') for x in pads[::2]] + \
            [(tuple(trunk[-1]), (2.4, 2.4, 1.2), 'FAR_MATSU')]
    return p


# ── broadleaf ───────────────────────────────────────────────────────────────

def _grow(p, start, d, L, r, level, maxl, bark, card, core, spread, flat, csize, tips):
    rnd = p.rnd
    nseg = 3 if level < 2 else 2
    pull = (0, 0, 1) if level < maxl else (0, 0, -1)
    pts = curve(rnd, start, d, L, nseg, wobble=0.13, pull=pull, pull_k=0.08)
    p.branch(pts, taper(nseg, r, r * 0.55), bark, level)
    if level == maxl:
        tips.append(pts[-1])
        s = csize * rnd.uniform(0.85, 1.15)
        p.cluster(pts[-1] + Vector((0, 0, 0.1)), (s, s, s * flat), card, core, level=1, up=0.35)
        mid = pts[1]
        p.cluster(mid + Vector((0, 0, 0.2)), (s * 0.75, s * 0.75, s * flat * 0.8), card, core, level=2, up=0.35)
        return
    dd = Vector(d)
    hor = Vector((dd.x, dd.y, 0))
    hor = hor.normalized() if hor.length > 1e-3 else Vector((1, 0, 0))
    kids = 2 if level > 0 else 3
    for k in range(kids):
        az = math.atan2(hor.y, hor.x) + (k - (kids - 1) / 2) * spread[level] + rnd.uniform(-0.3, 0.3)
        el = max(dd.z - 0.25 * (level + 1), -0.1) + rnd.uniform(-0.1, 0.1)
        nd = Vector((math.cos(az), math.sin(az), el)).normalized()
        _grow(p, pts[-1], nd, L * 0.72, r * 0.6, level + 1, maxl, bark, card, core, spread, flat, csize, tips)


def fill_crown(p, centre, rx, rz, n, size, flat, card, core, bark, up=0.35, zlow=-0.3, fill_level=2):
    """Clusters spread through a dome-shaped crown envelope (upper part of
    an ellipsoid), each fed by a twig from the nearest branch point: a full,
    round crown instead of a few puffs at the tips."""
    rnd = p.rnd
    skel = [q for b in p.branches if b['level'] <= 2 for q in b['pts'][1:]]
    centre = Vector(centre)
    for i in range(n):
        while True:
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(zlow, 1)))
            if 0.2 < d.length <= 1:
                break
        d = d.normalized() * rnd.uniform(0.6, 1.0) ** 0.5
        q = centre + Vector((d.x * rx, d.y * rx, d.z * rz))
        s = min(skel, key=lambda a: (a - q).length)
        if (q - s).length > 0.3:
            mid = s.lerp(q, 0.5) + Vector((0, 0, 0.15))
            p.branch([s, mid, q], [0.03, 0.02, 0.01], bark, 3)
        k = size * rnd.uniform(0.8, 1.2)
        p.cluster(q, (k, k, k * flat), card, core, level=1 if i % 3 else fill_level, up=up)


def momiji(seed=8, card='CARD_MOMIJI', core='DENSE_MOMIJI', far='FAR_MOMIJI'):
    """Japanese maple: short trunk forking into 3 stems, fine twigs, a wide,
    layered, see-through canopy (flat clusters)."""
    p = Plan(seed); rnd = p.rnd
    trunk = curve(rnd, (0, 0, -0.1), (0.08, 0.04, 1), 1.5, 3, wobble=0.05)
    p.branch(trunk, taper(3, 0.17, 0.13, flare=0.3), 'BARK_MOMIJI', 0)
    tips = []
    a0 = rnd.uniform(0, TAU)
    for k in range(3):
        az = a0 + k * TAU / 3 + rnd.uniform(-0.3, 0.3)
        d = Vector((math.cos(az) * 0.5, math.sin(az) * 0.5, 0.9)).normalized()
        _grow(p, trunk[-1], d, 2.3, 0.1, 1, 2, 'BARK_MOMIJI', card, core, {1: 0.9, 2: 0.8}, 0.5, 1.7, tips)
    c = sum(tips, Vector()) / len(tips)
    c = Vector((c.x, c.y, 3.6))
    fill_crown(p, c, 3.4, 2.4, 30, 1.7, 0.5, card, core, 'BARK_MOMIJI', zlow=-0.45)
    p.crown = (c - Vector((0, 0, 0.6)), 3.2)
    p.far_trunk = (2.2, 0.17, 'BARK_DARK')
    ext = max((Vector((x.x, x.y, 0)) - Vector((c.x, c.y, 0))).length for x in tips) + 0.8
    p.far = [((c.x, c.y, c.z - 0.3), (ext * 2, ext * 2, 2.4), far),
             ((c.x, c.y, c.z + 0.6), (ext * 1.3, ext * 1.3, 1.6), far)]
    return p


def sakura(seed=12, card='CARD_SAKURA', core='DENSE_SAKURA', far='FAR_SAKURA'):
    """Somei-yoshino: thick short trunk, 4 limbs spreading wide and low, an
    umbrella crown 11 m across."""
    p = Plan(seed); rnd = p.rnd
    trunk = curve(rnd, (0, 0, -0.1), (0.05, 0.0, 1), 2.1, 3, wobble=0.06)
    p.branch(trunk, taper(3, 0.32, 0.26, flare=0.35), 'BARK_SAKURA', 0, sides=10)
    tips = []
    a0 = rnd.uniform(0, TAU)
    for k in range(4):
        az = a0 + k * TAU / 4 + rnd.uniform(-0.35, 0.35)
        d = Vector((math.cos(az) * 0.7, math.sin(az) * 0.7, 0.75)).normalized()
        _grow(p, trunk[-1] - Vector((0, 0, 0.15)), d, 3.3, 0.17, 1, 2, 'BARK_SAKURA', card, core,
              {1: 0.85, 2: 0.9}, 0.7, 2.2, tips)
    c = sum(tips, Vector()) / len(tips)
    c = Vector((c.x, c.y, 4.9))
    fill_crown(p, c, 5.0, 2.9, 40, 2.2, 0.65, card, core, 'BARK_SAKURA', zlow=-0.5)
    p.crown = (c - Vector((0, 0, 0.8)), 4.5)
    p.far_trunk = (2.6, 0.3, 'BARK_DARK')
    ext = max((Vector((x.x, x.y, 0)) - Vector((c.x, c.y, 0))).length for x in tips) + 1.0
    p.far = [((c.x, c.y, c.z - 0.2), (ext * 2, ext * 2, 3.0), far),
             ((c.x, c.y, c.z + 1.0), (ext * 1.3, ext * 1.3, 2.2), far)]
    return p


def shidare(seed=14):
    """Weeping cherry: limbs rise steeply, arch over and let curtains of
    flowering strands hang almost to the ground."""
    p = Plan(seed); rnd = p.rnd
    trunk = curve(rnd, (0, 0, -0.1), (0.03, 0.02, 1), 3.4, 4, wobble=0.05)
    p.branch(trunk, taper(4, 0.34, 0.26, flare=0.35), 'BARK_SAKURA', 0, sides=10)
    a0 = rnd.uniform(0, TAU)
    anchors = []
    for k in range(6):
        az = a0 + k * TAU / 6 + rnd.uniform(-0.3, 0.3)
        out = Vector((math.cos(az), math.sin(az), 0))
        pts = [trunk[-1] - Vector((0, 0, 0.3 * (k % 2)))]
        d = (out * 0.3 + Vector((0, 0, 1.0))).normalized()
        L = 7.5 + rnd.uniform(-0.6, 0.6)
        for i in range(6):     # rise, then arch outwards and down
            d = (d + out * 0.3 - Vector((0, 0, 0.42 if i > 2 else 0.0))).normalized()
            pts.append(pts[-1] + d * L / 6)
        p.branch(pts, taper(6, 0.15, 0.04), 'BARK_SAKURA', 1)
        for i in (2, 3, 4, 5, 6):
            q = pts[i]
            for j in range(3 if i > 2 else 2):
                jit = Vector((rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45), 0))
                top = q + jit
                length = max(1.2, top.z - rnd.uniform(0.7, 3.6))
                p.curtains.append(dict(top=top, length=length, width=rnd.uniform(0.75, 1.05), card='CARD_SHIDARE',
                                       seed=rnd.randrange(1 << 20)))
            anchors.append(q)
        for i in (2, 3, 4):
            p.cluster(pts[i] + Vector((0, 0, 0.35)), (1.7, 1.7, 1.1), 'CARD_SAKURA', 'DENSE_SAKURA', level=1 if i < 4 else 2, up=0.3)
    c = sum(anchors, Vector()) / len(anchors)
    p.crown = (Vector((c.x, c.y, c.z * 0.6)), 4.0)
    p.far_trunk = (3.6, 0.32, 'BARK_DARK')
    ext = max((Vector((x.x, x.y, 0)) - Vector((c.x, c.y, 0))).length for x in anchors) + 0.5
    p.far = [((c.x, c.y, c.z * 0.55), (ext * 2, ext * 2, c.z * 1.0), 'FAR_SAKURA'),
             ((c.x, c.y, c.z + 0.6), (ext * 1.2, ext * 1.2, 2.0), 'FAR_SAKURA')]
    return p


# ── bamboo ──────────────────────────────────────────────────────────────────

def take(seed=16, culms=10, R=1.9):
    """Mōsō bamboo grove patch (~4 m): tall culms leaning out a little and
    bowing at the top, leaves only in the upper half."""
    p = Plan(seed); rnd = p.rnd
    tops = []
    for i in range(culms):
        a = rnd.uniform(0, TAU); r = R * math.sqrt(rnd.random())
        base = Vector((math.cos(a) * r, math.sin(a) * r, -0.1))
        H = rnd.uniform(10.5, 14.5)
        out = Vector((math.cos(a), math.sin(a), 0)) if r > 0.2 else Vector((1, 0, 0))
        lean = rnd.uniform(0.03, 0.08)
        n = 10
        pts = [base + Vector((0, 0, H * i / n)) + out * (lean * H * i / n + 0.9 * (i / n) ** 3) for i in range(n + 1)]
        rad = [0.05 + 0.04 * (1 - i / n) ** 0.6 for i in range(n + 1)]
        rad = [x * rnd.uniform(0.85, 1.1) for x in rad]
        p.branch(pts, rad, 'BARK_TAKE', 0, sides=6)
        z = H * rnd.uniform(0.48, 0.55)
        side = rnd.uniform(0, TAU)
        while z < H - 0.6:
            q = _at(pts, z)
            side += math.pi + rnd.uniform(-0.6, 0.6)
            d = Vector((math.cos(side), math.sin(side), 0))
            tw = curve(rnd, q, (d.x, d.y, 0.35), 0.7, 2, wobble=0.1)
            p.branch(tw, [0.012, 0.009, 0.006], 'BARK_TAKE', 2, sides=3)
            s = rnd.uniform(1.1, 1.5)
            p.cluster(tw[-1] - Vector((0, 0, 0.15)), (s, s, s * 0.7), 'CARD_TAKE', None, level=1, up=0.2, card_k=1.1)
            z += rnd.uniform(0.9, 1.3)
        p.cluster(pts[-1] - Vector((0, 0, 0.4)), (1.6, 1.6, 1.5), 'CARD_TAKE', 'DENSE_TAKE', level=1, up=0.2, core_k=0.4)
        tops.append(pts[-1])
    c = sum(tops, Vector()) / len(tops)
    p.crown = (Vector((0, 0, c.z * 0.75)), c.z * 0.4)
    p.far_trunk = (c.z * 0.55, 0.9, 'CULM')
    p.far = [((0, 0, c.z * 0.72), (R * 2.6, R * 2.6, c.z * 0.5), 'FAR_TAKE')]
    return p


# ── shrubs ──────────────────────────────────────────────────────────────────

def _mound(t, c, size, strip, card, seed, flat_top=0.45, k=0.55):
    """Clipped shrub (karikomi): a planed mound with leaf texture plus a few
    hugging cards that break the edge."""
    from kit import organic as O
    sub = 3 if t.lod == 0 else 2
    fs = O.lump(t.bm, c, size, seed, subdiv=sub, amp=0.08, freq=1.2, detail=0.03, floor=0.0, flat_top=flat_top)
    K.map_box(t.bm, fs, TK.R(strip), z0=0.0)
    g = t.group(c, Vector(size) / 2, 0.5)
    t.tag(fs, g)
    if t.lod == 0:
        rr = random.Random(seed)
        ztop = c[2] + (flat_top if flat_top is not None else 1.0) * size[2] / 2
        t.tag(TK.cards(t, Vector(c) + Vector((0, 0, size[2] * 0.06)), Vector(size) * 0.5, TK.R(card), 'ico', rr, k=k, up=0.5,
                       tilt=0.15, depth=(0.9, 1.0), zmax=ztop), g)


def bush_plan(kind, seed=20):
    p = Plan(seed); rnd = p.rnd
    p.far_trunk = (0, 0, None)
    if kind == 'tsutsuji':
        p.extras.append(lambda t: _mound(t, (0, 0, 0.42), (1.7, 1.4, 0.9), 'CLIP_TSUTSUJI', 'CARD_TSUTSUJI', seed))
        p.far = [((0, 0, 0.4), (1.7, 1.4, 0.85), 'FAR_TSUTSUJI')]
        p.crown = (Vector((0, 0, 0.3)), 1.0)
    elif kind == 'tsutsuji_row':
        for i, x in enumerate((-1.45, -0.5, 0.5, 1.45)):
            p.extras.append(lambda t, x=x, i=i: _mound(t, (x, 0, 0.38), (1.35, 1.05, 0.8), 'CLIP_TSUTSUJI', 'CARD_TSUTSUJI',
                                                       seed + i, flat_top=0.4))
        p.far = [((x, 0, 0.36), (2.2, 1.05, 0.75), 'FAR_TSUTSUJI') for x in (-1.0, 1.0)]
        p.crown = (Vector((0, 0, 0.2)), 2.0)
    elif kind == 'tama':
        p.extras.append(lambda t: _mound(t, (0, 0, 0.55), (1.25, 1.2, 1.1), 'CLIP_GREEN', 'CARD_YABU', seed, flat_top=None,
                                         k=0.45))
        p.far = [((0, 0, 0.55), (1.25, 1.2, 1.1), 'FAR_LEAF')]
        p.crown = (Vector((0, 0, 0.4)), 0.8)
    elif kind == 'ajisai':
        for i in range(6):
            a = i * TAU / 5 + rnd.uniform(-0.3, 0.3); r = 0.0 if i == 5 else 0.45
            p.cluster((math.cos(a) * r, math.sin(a) * r, 0.55 + (0.3 if i == 5 else 0)), (0.85, 0.85, 0.75), 'CARD_AJISAI',
                      'DENSE_AJISAI', level=1, up=0.4)
        p.far = [((0, 0, 0.6), (1.6, 1.6, 1.2), 'FAR_LEAF')]
        p.crown = (Vector((0, 0, 0.4)), 1.0)
    elif kind == 'yabu':
        for i in range(7):
            a = i * TAU / 6 + rnd.uniform(-0.3, 0.3); r = 0.0 if i == 6 else 0.6
            h = 1.0 if i == 6 else rnd.uniform(0.55, 0.8)
            p.cluster((math.cos(a) * r, math.sin(a) * r, h), (1.0, 1.0, 0.9), 'CARD_YABU', 'DENSE_YABU', level=1, up=0.35)
            p.branch([Vector((0, 0, -0.05)), Vector((math.cos(a) * r * 0.8, math.sin(a) * r * 0.8, h * 0.8))], [0.03, 0.015],
                     'BARK_MOMIJI', 2, sides=3)
        p.far = [((0, 0, 0.75), (2.0, 2.0, 1.5), 'FAR_LEAF')]
        p.crown = (Vector((0, 0, 0.5)), 1.2)
    elif kind == 'sasa':
        for i in range(9):
            a = rnd.uniform(0, TAU); r = 1.1 * math.sqrt(rnd.random())
            k = rnd.uniform(0.8, 1.1)
            p.cluster((math.cos(a) * r, math.sin(a) * r, rnd.uniform(0.3, 0.45)), (k, k, 0.5), 'CARD_SASA', 'DENSE_LEAF',
                      level=1, up=0.8, core_k=0.55)
        p.far = [((0, 0, 0.3), (2.4, 2.4, 0.6), 'FAR_LEAF')]
        p.crown = (Vector((0, 0, -0.5)), 1.5)
    return p


# ── table ───────────────────────────────────────────────────────────────────

def _trunk_col(r):
    return (-r, r, -r, r, 0.0, 3.0)


TREES = {
    'Sugi':            (lambda: sugi(1), (3, 0), _trunk_col(0.36)),
    'Sugi_Young':      (lambda: sugi(2, H=14.0, R0=0.22, Rmax=2.0, base=0.3), (3, 0), _trunk_col(0.22)),
    'Sugi_Shinboku':   (lambda: sugi(3, H=27.0, R0=0.75, Rmax=4.0, base=0.42, card='CARD_SUGI_OLD', shinboku=True), (3, 0),
                        _trunk_col(0.9)),
    'Matsu_Niwa':      (lambda: matsu_niwa(), (2, 1), _trunk_col(0.22)),
    'Matsu_Aka':       (lambda: matsu_aka(), (2, 1), _trunk_col(0.27)),
    'Momiji_Green':    (lambda: momiji(8), (3, 1), _trunk_col(0.17)),
    'Momiji_Red':      (lambda: momiji(8, 'CARD_MOMIJI_RED', 'DENSE_MOMIJI_RED', 'FAR_MOMIJI_RED'), (3, 1), _trunk_col(0.17)),
    'Momiji_Gold':     (lambda: momiji(9, 'CARD_MOMIJI_GOLD', 'DENSE_MOMIJI_GOLD', 'FAR_MOMIJI_GOLD'), (3, 1), _trunk_col(0.17)),
    'Sakura_Bloom':    (lambda: sakura(12), (3, 1), _trunk_col(0.32)),
    'Sakura_Leaf':     (lambda: sakura(12, 'CARD_SAKURA_LEAF', 'DENSE_LEAF', 'FAR_LEAF'), (3, 1), _trunk_col(0.32)),
    'Sakura_Shidare':  (lambda: shidare(), (3, 1), _trunk_col(0.34)),
    'Take_Grove':      (lambda: take(), (2, 0), (-1.9, 1.9, -1.9, 1.9, 0.0, 3.0)),
}
BUSHES = {
    'Tsutsuji':        (lambda: bush_plan('tsutsuji'), (3, 1), None),
    'Tsutsuji_Row_4m': (lambda: bush_plan('tsutsuji_row', 21), (3, 1), None),
    'Tama':            (lambda: bush_plan('tama', 22), (3, 1), None),
    'Ajisai':          (lambda: bush_plan('ajisai', 23), (3, 1), None),
    'Sasa':            (lambda: bush_plan('sasa', 24), (3, 1), None),
    'Yabu':            (lambda: bush_plan('yabu', 25), (3, 0), None),
}


def build(only=None):
    out = []
    for prefix, table in (('Tree', TREES), ('Bush', BUSHES)):
        for k, (fn, ml, colb) in table.items():
            if only and k not in only:
                continue
            out.append(TK.build(f'{prefix}_{k}', fn(), ml, colb))
    return out


# ── scenes ──────────────────────────────────────────────────────────────────
# Linked copies (minato._place) in a temporary collection, removed afterwards.

def lineup(names, name='VegLine', y=0.0, x0=0.0):
    """Assets side by side along X; names = [(collection, width)]."""
    import bpy
    from buildings import minato as MI
    tmp = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if tmp.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(tmp)
    x = x0
    for n, w in names:
        x += w / 2
        MI._place(tmp, n, (x, y), 0.0)
        x += w / 2
    return tmp, x


def clear(name='VegLine'):
    import bpy
    tmp = bpy.data.collections.get(name)
    if not tmp:
        return
    for o in list(tmp.objects):
        bpy.data.objects.remove(o)
    if tmp.name in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.unlink(tmp)
    bpy.data.collections.remove(tmp)


def _scene(name, items, land=()):
    """items: (collection, (x, y[, z]), rot); land: preview ground rects."""
    import bpy
    from buildings import minato as MI, tera as TE
    tmp = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if tmp.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(tmp)
    for n, pos, rot in items:
        MI._place(tmp, n, pos, rot)
    if land:
        TE._land(tmp, land, name + 'Ground')
    return tmp


def _clear_scene(name):
    import bpy
    clear(name)
    for me in [m for m in bpy.data.meshes if m.name.startswith(name + 'Ground') and not m.users]:
        bpy.data.meshes.remove(me)


def _forest(rnd, pts, kinds):
    return [(kinds[rnd.randrange(len(kinds))], p, rnd.uniform(0, TAU)) for p in pts]


def _yama():
    """Tera's quiet mountain shrine, now with real cedars (same positions and
    cameras as tera.shots: before/after comparable) and forest floor plants."""
    from buildings import tera as TE
    rnd = random.Random(5)
    FX, UP = TE.FX, TE.UP
    items = [(f'Tera_{n}', pos, rot) for n, pos, rot in TE.YAMA] + list(TE.YAMA_PROPS)
    trees = _forest(rnd, [(x, y, z) for x, y, z in TE.YAMA_TREES], ['Tree_Sugi', 'Tree_Sugi', 'Tree_Sugi_Young'])
    trees = [x for x in trees if (Vector(x[1][:2]) - Vector((FX + 12, 12))).length > 4]   # its place
    trees.append(('Tree_Sugi_Shinboku', (FX + 12, 12, UP), 0.4))
    floor = [('Bush_Sasa', (FX + x, y, z), rnd.uniform(0, TAU)) for x, y, z in
             ((-4.5, -28, 0), (5, -24, 0), (-6.5, -17, 0), (7, -12, 0), (-10, -4, UP), (11, 0, UP), (-7, 18, UP), (8, 20, UP),
              (-13, -20, 0), (12, -28, 0))]
    floor += [('Bush_Yabu', (FX + x, y, z), rnd.uniform(0, TAU)) for x, y, z in ((-8, -31, 0), (8.5, -20, 0), (-12, 12, UP), (13, 4, UP))]
    floor += [('Bush_Ajisai', (FX + x, y, UP), rnd.uniform(0, TAU)) for x, y in ((-4.2, -8.5), (4.2, -8.5))]
    return items + trees + floor


def _niwa():
    """Temple garden: tsuiji wall behind, garden pine on its supports, red and
    green maples, clipped azalea along the gravel path, round shrubs,
    hydrangea at the wall, snow-viewing lantern on a flat rock."""
    R90 = math.pi / 2
    items = [('Tera_Wall_Tsuiji_4m', (x, 7.0), 0.0) for x in (-10, -6, -2, 2, 6, 10)]
    items += [('Tera_Path_Gravel_8m', (x, -1.5), 0.0) for x in (-8, 0, 8)]
    items += [('Tree_Matsu_Niwa', (-3.5, 2.5), 0.4), ('Tree_Momiji_Red', (5.5, 3.2), 0.0), ('Tree_Momiji_Green', (11, 2.0), 1.0),
              ('Tree_Momiji_Gold', (-11, 3.0), 2.0), ('Tree_Sugi', (-15, 13), 0.0), ('Tree_Sugi_Young', (14, 12), 1.0),
              ('Tree_Matsu_Aka', (3, 13), 0.5)]
    items += [('Bush_Tsutsuji_Row_4m', (x, 0.7), 0.0) for x in (-9, -1)] + [('Bush_Tsutsuji', (7.5, 0.8), 0.3)]
    items += [('Bush_Tama', (x, 4.4), 0.0) for x in (-8.2, 1.2, 8.6)]
    items += [('Bush_Ajisai', (x, 5.6), 0.0) for x in (-6, -0.5, 3.5)]
    items += [('Rock_Flat', (0.6, 2.6), 0.4), ('StoneLantern_Yukimi', (0.6, 2.6), 0.0), ('Rock_M_Moss', (-6.2, 2.2), 1.0),
              ('Bush_Sasa', (12.5, 5.0), 0.0)]
    items += [('Bush_Tsutsuji_Row_4m', (x, -3.8), math.pi) for x in (-9, -1, 7)]
    return items


def _sakura():
    """Cherry avenue on the temple approach, a weeping cherry at the gate."""
    items = [('Tera_Sando_8m', (0, y), math.pi / 2) for y in (-12, -4, 4, 12)]
    items += [('Tree_Sakura_Bloom', (sg * 8.0, y), y * 0.3 + sg) for sg in (-1, 1) for y in (-16, -5, 6)]
    items += [('StoneLantern', (sg * 3.4, y), 0.0) for sg in (-1, 1) for y in (-9, 2, 13)]
    items += [('Tree_Sakura_Shidare', (-9.5, 21), 0.0), ('Tera_Sanmon', (0, 22), 0.0), ('Bench_Teahouse', (3.6, -6), -math.pi / 2),
              ('Tree_Sugi', (12, 26), 0.0), ('Tree_Sugi', (-15, 30), 1.0), ('Tree_Sakura_Leaf', (10, 18), 0.0)]
    return items


def _take():
    """Bamboo grove path (Sagano): gravel path, low bamboo fences, groves on
    both sides."""
    rnd = random.Random(8)
    items = [('Tera_Path_Gravel_8m', (0, y), math.pi / 2) for y in (-12, -4, 4, 12, 20)]
    items += [('Fence_Bamboo_1_8m', (sg * 2.2, y), math.pi / 2) for sg in (-1, 1) for y in (-14, -10, -6, -2, 2, 6, 10, 14, 18)]
    for sg in (-1, 1):
        for y in range(-16, 26, 4):
            items.append(('Tree_Take_Grove', (sg * rnd.uniform(5.0, 6.0), y + rnd.uniform(-1, 1)), rnd.uniform(0, TAU)))
            items.append(('Tree_Take_Grove', (sg * rnd.uniform(9.0, 10.5), y + 2 + rnd.uniform(-1, 1)), rnd.uniform(0, TAU)))
    items += [('Bush_Sasa', (sg * 3.3, y), 0.0) for sg in (-1, 1) for y in (-13, -5, 3, 11)]
    return items


TREE_ROW = [('Tree_Sugi', 9), ('Tree_Sugi_Young', 7.5), ('Tree_Sugi_Shinboku', 11), ('Tree_Matsu_Niwa', 6.5), ('Tree_Matsu_Aka', 8),
            ('Tree_Take_Grove', 8.5)]
TREE_ROW2 = [('Tree_Momiji_Green', 8.5), ('Tree_Momiji_Red', 8.5), ('Tree_Momiji_Gold', 8.5), ('Tree_Sakura_Bloom', 12),
             ('Tree_Sakura_Leaf', 12), ('Tree_Sakura_Shidare', 13)]
BUSH_ROW = [('Bush_Tsutsuji', 2.3), ('Bush_Tsutsuji_Row_4m', 4.8), ('Bush_Tama', 1.8), ('Bush_Ajisai', 2.5), ('Bush_Sasa', 3.3),
            ('Bush_Yabu', 2.8)]


def _lods(name, row, y=0.0):
    """LOD0 | LOD1 | LOD2 of each asset next to each other (linked copies)."""
    import bpy
    from mathutils import Matrix
    tmp = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if tmp.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(tmp)
    x = 0.0
    for n, w in row:
        for lod in range(3):
            src = bpy.data.objects[f'SM_{n}_LOD{lod}']
            o = src.copy(); o.hide_render = False; o.hide_set(False)
            o.matrix_world = Matrix.Translation(Vector((x + w / 2, y, 0)))
            tmp.objects.link(o)
            x += w
        x += w * 0.4
    return tmp, x


def shots(out_dir, which=('yama', 'niwa', 'sakura', 'take', 'rows', 'lods', 'close')):
    """Scenes at eye level (mood + neutral), from above, clay; every asset in
    a row front / back / clay; LOD0-2 side by side; close-ups."""
    import bpy, os
    from kit import preview as P
    from buildings import tera as TE
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n)
    P.stage(True)
    ground = bpy.data.objects['PreviewGround']
    FX, UP = TE.FX, TE.UP
    try:
        if 'yama' in which:
            ground.location.z = -3.0
            land = [(FX - 45, FX + 30, -50, -10.6), (FX - 45, FX + 30, -10.0, 45, UP)]
            _scene('VegYama', _yama(), land)
            c = ['VegYama']
            P.shot(c, (FX, -12, 3.2), (0.0, -1, -0.02), 15, o('yama_steps.png'), mood=True, lens=26)
            P.shot(c, (FX, -12, 3.2), (0.0, -1, -0.02), 15, o('yama_steps_neutral.png'), lens=26)
            P.shot(c, (FX, -12, 6.0), (0.0, -1, 0.2), 30, o('yama_wide.png'), mood=True, lens=26)
            P.shot(c, (FX + 12, 12, UP + 6.0), (0.9, -0.6, 0.1), 18, o('yama_shinboku.png'), mood=True, lens=26)
            P.shot(c, (FX - 8, 0, UP), (0.5, -0.8, 0.9), 70, o('yama_high.png'), lens=30)
            P.shot(c, (FX, -12, 3.2), (0.0, -1, -0.02), 15, o('yama_clay.png'), mood='clay', lens=26)
            _clear_scene('VegYama')
            ground.location.z = 0.0
        if 'niwa' in which:
            _scene('VegNiwa', _niwa())
            c = ['VegNiwa']
            P.shot(c, (0, 2.5, 2.4), (0.15, -1, 0.02), 14, o('niwa_eye.png'), mood=True, lens=28)
            P.shot(c, (0, 2.5, 2.4), (0.15, -1, 0.02), 14, o('niwa_eye_neutral.png'), lens=28)
            P.shot(c, (0, 3, 0.0), (0.4, -1, 1.0), 34, o('niwa_high.png'), lens=30)
            P.shot(c, (0, 2.5, 2.4), (0.15, -1, 0.02), 14, o('niwa_clay.png'), mood='clay', lens=28)
            _clear_scene('VegNiwa')
        if 'sakura' in which:
            _scene('VegSakura', _sakura())
            c = ['VegSakura']
            P.shot(c, (0, 4, 3.0), (0.1, -1, 0.02), 22, o('sakura_eye.png'), mood=True, lens=26)
            P.shot(c, (0, 4, 3.0), (0.1, -1, 0.02), 22, o('sakura_eye_neutral.png'), lens=26)
            P.shot(c, (-9.5, 21, 3.5), (-0.55, -1, 0.05), 13, o('sakura_shidare.png'), mood=True, lens=28)
            P.shot(c, (0, 4, 0.0), (0.5, -1, 1.1), 50, o('sakura_high.png'), lens=30)
            P.shot(c, (0, 4, 3.0), (0.1, -1, 0.02), 22, o('sakura_clay.png'), mood='clay', lens=26)
            _clear_scene('VegSakura')
        if 'take' in which:
            _scene('VegTake', _take())
            c = ['VegTake']
            P.shot(c, (0, 6, 3.5), (0.05, -1, -0.12), 14, o('take_eye.png'), mood=True, lens=24)
            P.shot(c, (0, 6, 3.5), (0.05, -1, -0.12), 14, o('take_eye_neutral.png'), lens=24)
            P.shot(c, (0, 6, 3.5), (0.05, -1, -0.12), 14, o('take_clay.png'), mood='clay', lens=24)
            _clear_scene('VegTake')
        if 'rows' in which:
            for k, row, tz, dist in (('trees', TREE_ROW, 9.0, 60), ('trees2', TREE_ROW2, 3.8, 66), ('bushes', BUSH_ROW, 0.6, 14)):
                _, X = lineup(row, 'VegRow')
                for v, d, m in (('front', (0.05, -1, 0.12), False), ('back', (-0.05, 1, 0.12), False),
                                ('clay', (0.05, -1, 0.12), 'clay'), ('mood', (0.05, -1, 0.12), True)):
                    P.shot(['VegRow'], (X / 2, 0, tz), d, dist, o(f'row_{k}_{v}.png'), mood=m, size=(1024, 440), lens=35)
                clear('VegRow')
        if 'lods' in which:
            for k, row, tz, dist in (('a', [('Tree_Sugi', 9), ('Tree_Matsu_Aka', 8)], 9.0, 64),
                                     ('b', [('Tree_Momiji_Red', 8.5), ('Tree_Sakura_Bloom', 12)], 3.8, 70)):
                _, X = _lods('VegLod', row)
                P.shot(['VegLod'], (X / 2, 0, tz), (0.05, -1, 0.12), dist, o(f'lod_{k}.png'), size=(1024, 400), lens=35)
                clear('VegLod')
        if 'close' in which:
            for n, tgt, d, dist, nm, m in (
                    ('Tree_Sugi_Shinboku', (0, -0.8, 2.2), (0.2, -1, 0.05), 3.4, 'c_shimenawa', True),
                    ('Tree_Matsu_Niwa', (0.8, -0.5, 1.8), (0.6, -1, 0.2), 5.0, 'c_shichu', False),
                    ('Tree_Sugi', (0, 0, 14), (0.3, -1, 0.1), 8.0, 'c_sugi_crown', False),
                    ('Tree_Matsu_Aka', (0, 0, 11), (0.3, -1, 0.0), 8.0, 'c_akamatsu', True),
                    ('Tree_Momiji_Red', (0, 0, 3.6), (0.4, -1, -0.2), 6.0, 'c_momiji', True),
                    ('Tree_Sakura_Bloom', (0, 0, 4.0), (0.3, -1, -0.25), 7.0, 'c_sakura', True),
                    ('Tree_Take_Grove', (0, 0, 2.0), (0.3, -1, 0.1), 4.0, 'c_take', False),
                    ('Bush_Tsutsuji', (0, 0, 0.5), (0.4, -1, 0.5), 3.0, 'c_tsutsuji', False),
                    ('Bush_Ajisai', (0, 0, 0.6), (0.4, -1, 0.3), 3.2, 'c_ajisai', True),
                    ('Bush_Sasa', (0, 0, 0.4), (0.4, -1, 0.5), 3.6, 'c_sasa', False)):
                lineup([(n, 1)], 'VegOne', x0=-0.5)
                P.shot(['VegOne'], tgt, d, dist, o(nm + '.png'), mood=m, size=(640, 480), lens=35)
                clear('VegOne')
    finally:
        for n in ('VegYama', 'VegNiwa', 'VegSakura', 'VegTake'):
            _clear_scene(n)
        for n in ('VegRow', 'VegLod', 'VegOne', 'VegLine'):
            clear(n)
        ground.location.z = 0.0
