"""Animals of the map (task 6; ActorSet kinds cat, goat, chicken + what makes
the streets Japanese): street cats in their poses and coats (mike-neko =
calico, kuro, kijitora = tabby, chatora = ginger; the 'loaf' kobako-zuwari,
sitting, walking, curled asleep on a wall), white Saanen goat, hens and a
rooster, the jungle crow with its heavy beak (on bins and wires), a park
pigeon and a Shiba with its curled tail and urajiro cream underside.

Static meshes, one per pose: PlaceActors moves animals as a whole (peck,
sway). Origin on the ground under the body, the animal looks to -Y."""
import math
from mathutils import Vector, Matrix
from kit import core as K
from characters import figure_kit as FK

KLASS = 'characters'
NAME = 'Animals'
ATLAS = 'Figures'
W0 = {'Hips': 1}
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
FWD = Vector((0, -1, 0))


def ctx(lod):
    return FK.FC(lod, FK.BODIES['M'])


def blob(c, p0, p1, w, top, bot, reg, n=None, m=None, prof=None, p=2.0, cap=0.0):
    """Ellipsoid-ish body between p0 and p1: rings along the axis, radius
    profile prof(t) (default: rounded both ends). For a horizontal axis f is
    the top half, k the bottom half; for a vertical axis front/back."""
    n = n or c.n(10, 8, 6)
    m = m or c.n(7, 5, 3)
    p0, p1 = Vector(p0), Vector(p1)
    prof = prof or (lambda t: max(math.sin(math.pi * (0.06 + 0.88 * t)), 0.0) ** 0.6)
    rings = []
    for i in range(m + 1):
        t = i / m
        s = prof(t)
        rings.append(dict(c=p0.lerp(p1, t), d=p1 - p0, a=w * s, f=top * s, k=bot * s, w=W0, reg=reg, cap=cap))
    return c.loft(rings, n, p=p)


def leg(c, top, foot, r0, r1, reg, n=None, paw=None, paw_reg=None):
    n = n or c.n(6, 5, 4)
    top, foot = Vector(top), Vector(foot)
    mid = top.lerp(foot, 0.5) + Vector((0, 0.0, 0))
    c.loft([dict(c=top, a=r0, f=r0, k=r0, w=W0, reg=reg), dict(c=mid, a=(r0 + r1) / 2, f=(r0 + r1) / 2, k=(r0 + r1) / 2, w=W0, reg=reg),
            dict(c=foot, a=r1, f=r1, k=r1, w=W0, reg=paw_reg or reg)], n)
    if paw:
        c.loft([dict(c=foot + Vector((0, 0.005, -0.005)), d=FWD, a=paw, f=paw * 0.7, k=paw * 0.4, w=W0, reg=paw_reg or reg),
                dict(c=foot + Vector((0, -paw * 1.4, -0.008)), d=FWD, a=paw * 0.9, f=paw * 0.5, k=paw * 0.3, w=W0, reg=paw_reg or reg,
                     cap=paw * 0.3)], n, p=2.2)


def cone(c, base, tip, r, reg, n=4):
    base, tip = Vector(base), Vector(tip)
    c.loft([dict(c=base, a=r, f=r, k=r, w=W0, reg=reg), dict(c=tip, a=0.0, w=W0, reg=reg)], n)


def pyramid(c, pts, reg):
    """Closed tetra-like piece from a base triangle and an apex: pts = (a, b, c, apex)."""
    vs = [c.bm.verts.new(Vector(p)) for p in pts]
    c.weigh(vs, W0)
    a, b, cc, ap = vs
    fs = [c.bm.faces.new(q) for q in ([a, b, ap], [b, cc, ap], [cc, a, ap], [a, cc, b])]
    ctr = sum((v.co for v in vs), Vector()) / 4
    from buildings.koedo_kit import orient
    orient(fs, ctr)
    c.paint(fs, reg)
    return fs


# ── coats ───────────────────────────────────────────────────────────────────

def coat(kind):
    """Face colour by position: calico patches, tabby stripes, plain, tuxedo."""
    def calico(i, j, p):
        n = math.sin(p.x * 31 + 1.3) * math.sin(p.y * 23 + 0.4) + math.sin(p.z * 27 + p.y * 9)
        if p.z < 0.1 or (p.y < -0.12 and p.z < 0.2):
            return 'CAT_WHITE'
        return 'CAT_ORANGE' if n > 0.55 else ('CAT_BLACK' if n < -0.75 else 'CAT_WHITE')

    def tabby(i, j, p):
        return 'CAT_TABBY_DARK' if math.sin(p.y * 70 + p.z * 25) > 0.35 and p.z > 0.06 else 'CAT_TABBY'

    def ginger(i, j, p):
        return 'CAT_WHITE' if p.z < 0.07 else ('CAT_ORANGE' if math.sin(p.y * 70 + p.z * 25) < 0.5 else 'CAT_TABBY')

    def tuxedo(i, j, p):
        return 'CAT_WHITE' if (p.z < 0.06 or (p.y < -0.1 and p.z < 0.24 and abs(p.x) < 0.04)) else 'CAT_BLACK'
    return {'calico': calico, 'tabby': tabby, 'ginger': ginger, 'black': lambda i, j, p: 'CAT_BLACK',
            'tuxedo': tuxedo, 'grey': lambda i, j, p: 'CAT_GREY'}[kind]


def paint_fn(c, faces, fn):
    for f in faces:
        c.paint([f], fn(0, 0, f.calc_center_median()))


def flat_reg(fn, p=Vector((0, 0, 0.15))):
    return fn(0, 0, p)


# ── cat ─────────────────────────────────────────────────────────────────────

def cat_head(c, at, fur, eyes='EYE_AMBER', tilt=0.0, closed=False):
    """Round head, muzzle, triangular ears, eyes, pink nose; at = head centre."""
    at = Vector(at)
    R = Matrix.Rotation(math.radians(tilt), 3, 'X')
    rr = lambda v: at + R @ Vector(v)
    bands, caps = blob(c, rr((0, 0.05, 0)), rr((0, -0.055, -0.004)), 0.052, 0.045, 0.042, 'CAT_WHITE', n=c.n(10, 8, 6),
                       m=c.n(6, 4, 3))
    paint_fn(c, [f for b in bands for f in b] + caps, fur)
    # muzzle pads
    if c.lod < 2:
        for s in (1, -1):
            blob(c, rr((s * 0.012, -0.04, -0.018)), rr((s * 0.012, -0.062, -0.02)), 0.014, 0.012, 0.012, 'CAT_WHITE', n=6, m=3)
        c.box(rr((0, -0.064, -0.006)), (0.007, 0.004, 0.005), 'NOSE_PINK', W0)
    # ears: pyramids leaning out
    for s in (1, -1):
        base = [rr((s * 0.018, 0.005, 0.034)), rr((s * 0.046, 0.012, 0.02)), rr((s * 0.03, 0.028, 0.03))]
        apex = rr((s * 0.04, 0.012, 0.075))
        pyramid(c, base + [apex], flat_reg(fur, rr((s * 0.03, 0.01, 0.05))))
        if c.lod == 0:
            inner = [rr((s * 0.022, 0.004, 0.038)), rr((s * 0.042, 0.009, 0.026)), rr((s * 0.03, 0.006, 0.036))]
            pyramid(c, inner + [rr((s * 0.038, 0.006, 0.066))], 'NOSE_PINK')
    if c.lod < 2:
        for s in (1, -1):
            if closed:
                c.box(rr((s * 0.022, -0.046, 0.012)), (0.011, 0.003, 0.002), 'CAT_BLACK', W0)
            else:
                c.box(rr((s * 0.022, -0.045, 0.012)), (0.01, 0.004, 0.008), eyes, W0,
                      rot=Matrix.Rotation(math.radians(s * 20), 3, 'Z'))
                if c.lod == 0:
                    c.box(rr((s * 0.022, -0.049, 0.012)), (0.0025, 0.001, 0.007), 'EYE', W0)


def tail(c, pts, r, reg_fn, n=None):
    pts = [Vector(p) for p in pts]
    rings = [dict(c=p, a=r * (1 - 0.35 * i / (len(pts) - 1)), f=r * (1 - 0.35 * i / (len(pts) - 1)),
                  k=r * (1 - 0.35 * i / (len(pts) - 1)), w=W0, reg=None) for i, p in enumerate(pts)]
    rings[-1]['cap'] = r * 0.6
    bands, caps = c.loft(rings, n or c.n(6, 5, 4))
    paint_fn(c, [f for b in bands for f in b] + caps, reg_fn)


def cat(c, pose, coat_kind):
    fur = coat(coat_kind)
    eyes = 'EYE_GREEN' if coat_kind in ('black', 'grey') else 'EYE_AMBER'

    def body(p0, p1, w, top, bot, prof=None):
        b, cp = blob(c, p0, p1, w, top, bot, 'CAT_WHITE', prof=prof)
        paint_fn(c, [f for x in b for f in x] + cp, fur)

    def legf(top, foot, r0, r1):
        n = c.n(6, 5, 4)
        top, foot = Vector(top), Vector(foot)
        rings = [dict(c=top, a=r0, f=r0, k=r0, w=W0), dict(c=top.lerp(foot, 0.6), a=r1 * 1.1, f=r1 * 1.1, k=r1 * 1.1, w=W0),
                 dict(c=foot, a=r1, f=r1, k=r1, w=W0, cap=r1 * 0.6)]
        b, cp = c.loft(rings, n)
        paint_fn(c, [f for x in b for f in x] + cp, fur)

    if pose == 'sit':
        # haunches on the ground, chest up, front legs straight, tail round the paws
        body((0, 0.05, 0.06), (0, -0.03, 0.24), 0.07, 0.065, 0.075, prof=lambda t: (0.95 - 0.35 * t) * min(1, math.sin(math.pi * (0.1 + 0.85 * t)) ** 0.3))
        for s in (1, -1):
            body((s * 0.05, 0.08, 0.05), (s * 0.05, -0.03, 0.05), 0.045, 0.055, 0.05)          # thighs
            legf((s * 0.028, -0.045, 0.17), (s * 0.026, -0.07, 0.012), 0.018, 0.014)
            legf((s * 0.05, 0.02, 0.03), (s * 0.04, -0.045, 0.01), 0.016, 0.014)              # hind paws
        cat_head(c, (0, -0.055, 0.29), fur, eyes)
        tail(c, [(0.03, 0.1, 0.02), (0.07, 0.04, 0.015), (0.06, -0.04, 0.015), (0.01, -0.09, 0.015)], 0.015, fur)
    elif pose == 'loaf':
        # kobako-zuwari: paws tucked, a smooth loaf with the head on top
        body((0, 0.13, 0.08), (0, -0.1, 0.085), 0.09, 0.085, 0.075,
             prof=lambda t: max(math.sin(math.pi * (0.04 + 0.92 * t)), 0) ** 0.35)
        cat_head(c, (0, -0.115, 0.165), fur, eyes, tilt=-4, closed=True)
        tail(c, [(0.07, 0.14, 0.02), (0.1, 0.05, 0.015), (0.09, -0.04, 0.015)], 0.016, fur)
    elif pose == 'walk':
        body((0, 0.15, 0.2), (0, -0.12, 0.21), 0.065, 0.06, 0.07)
        for s, ph in ((1, 1), (-1, -1)):
            legf((s * 0.035, -0.08, 0.2), (s * 0.03, -0.1 + ph * 0.04, 0.012), 0.03, 0.017)
            legf((s * 0.042, 0.11, 0.2), (s * 0.035, 0.13 - ph * 0.04, 0.012), 0.042, 0.017)
        c_neck = blob(c, (0, -0.08, 0.22), (0, -0.17, 0.28), 0.05, 0.05, 0.05, 'CAT_WHITE', m=3)
        paint_fn(c, [f for x in c_neck[0] for f in x] + c_neck[1], fur)
        cat_head(c, (0, -0.19, 0.29), fur, eyes)
        tail(c, [(0, 0.16, 0.22), (0, 0.24, 0.3), (0, 0.25, 0.4), (0, 0.21, 0.46)], 0.016, fur)
    elif pose == 'curl':
        # asleep in a ring (on a wall or a car bonnet)
        n = 8
        pts = [Vector((0.09 * math.cos(a), 0.09 * math.sin(a), 0.055)) for a in (math.radians(200 + 300 * i / n) for i in range(n + 1))]
        rings = [dict(c=p, a=0.055 * (0.85 + 0.15 * math.sin(math.pi * i / n)), f=0.05, k=0.05, w=W0) for i, p in enumerate(pts)]
        rings[0]['cap'] = 0.04; rings[-1]['cap'] = 0.04
        b, cp = c.loft(rings, c.n(8, 6, 5))
        paint_fn(c, [f for x in b for f in x] + cp, fur)
        cat_head(c, pts[0] + Vector((0.01, -0.03, 0.02)), fur, eyes, tilt=10, closed=True)
        tail(c, [pts[-1], pts[-1] + Vector((-0.04, -0.06, -0.02)), pts[0] + Vector((0.05, -0.06, -0.03))], 0.015, fur)


# ── birds ───────────────────────────────────────────────────────────────────

def chicken(c, rooster=False):
    body_reg = 'CHICKEN_BROWN' if rooster else 'CHICKEN_WHITE'
    s = 1.15 if rooster else 1.0
    blob(c, Vector((0, 0.12, 0.3)) * s, Vector((0, -0.12, 0.33)) * s, 0.1 * s, 0.1 * s, 0.11 * s, body_reg,
         prof=lambda t: max(math.sin(math.pi * (0.05 + 0.9 * t)), 0) ** 0.55)
    # neck and head
    blob(c, Vector((0, -0.1, 0.36)) * s, Vector((0, -0.14, 0.5)) * s, 0.045 * s, 0.045 * s, 0.045 * s,
         'CHICKEN_DARK' if rooster else body_reg, m=3)
    blob(c, Vector((0, -0.12, 0.5)) * s, Vector((0, -0.19, 0.51)) * s, 0.035 * s, 0.035 * s, 0.03 * s, body_reg, m=4)
    cone(c, Vector((0, -0.18, 0.505)) * s, Vector((0, -0.225, 0.495)) * s, 0.012 * s, 'BEAK_YELLOW')
    # comb (saw-tooth) and wattles
    k = 5 if rooster else 3
    for i in range(k):
        y = (-0.18 + 0.022 * i) * s
        h = (0.05 if rooster else 0.03) * (1 - abs(i - (k - 1) / 2) / k)
        c.box(Vector((0, y, 0.54 * s + h / 2)), (0.006, 0.011, h / 2 + 0.006), 'COMB_RED', W0)
    c.box(Vector((0, -0.19 * s, 0.47 * s)), (0.008, 0.012, 0.022 * (1.6 if rooster else 1)), 'COMB_RED', W0)
    for sx in (1, -1):
        c.box(Vector((sx * 0.028 * s, -0.165 * s, 0.515 * s)), (0.002, 0.005, 0.005), 'EYE', W0)
    # tail feathers: a raised fan (rooster: long dark sickles)
    if rooster:
        for i, a in enumerate((-30, -10, 10, 30)):
            pts = [Vector((math.sin(math.radians(a)) * 0.04, 0.12, 0.38)) * s,
                   Vector((math.sin(math.radians(a)) * 0.09, 0.26, 0.56)) * s,
                   Vector((math.sin(math.radians(a)) * 0.11, 0.36, 0.42)) * s]
            c.loft([dict(c=p, a=0.03 * s * (1 - 0.4 * j / 2), f=0.006, k=0.006, w=W0, reg='TAIL_GREEN') for j, p in enumerate(pts)], 4)
    else:
        for a in (-20, 0, 20):
            c.box(Vector((math.sin(math.radians(a)) * 0.04, 0.15, 0.42)), (0.035, 0.012, 0.07), body_reg, W0,
                  rot=Matrix.Rotation(math.radians(-35), 3, 'X') @ Matrix.Rotation(math.radians(a), 3, 'Y'))
    # wings
    for sx in (1, -1):
        blob(c, Vector((sx * 0.09, -0.06, 0.34)) * s, Vector((sx * 0.1, 0.12, 0.31)) * s, 0.02 * s, 0.06 * s, 0.05 * s,
             'CHICKEN_DARK' if rooster else body_reg, m=3)
    # legs and toes
    for sx in (1, -1):
        c.tube([Vector((sx * 0.04, 0.0, 0.24)) * s, Vector((sx * 0.045, -0.01, 0.02))], 0.01, 4, 'BEAK_YELLOW', W0)
        if c.lod < 2:
            for a in (-30, 0, 30, 180):
                d = Vector((math.sin(math.radians(a)), -math.cos(math.radians(a)), 0)) * (0.06 if a != 180 else 0.035)
                c.tube([Vector((sx * 0.045, -0.01, 0.012)), Vector((sx * 0.045, -0.01, 0.006)) + d], 0.005, 3, 'BEAK_YELLOW', W0)


def crow(c, perch=False):
    """Hashibuto-garasu: glossy black, heavy arched beak, wedge tail."""
    z = 0.0 if not perch else -0.05
    blob(c, (0, 0.1, 0.17 + z), (0, -0.09, 0.22 + z), 0.065, 0.065, 0.07, 'CROW')
    blob(c, (0, -0.08, 0.23 + z), (0, -0.16, 0.27 + z), 0.045, 0.048, 0.04, 'CROW', m=4)
    # beak: thick at the base, arched (two segments)
    c.loft([dict(c=(0, -0.155, 0.27 + z), d=FWD, a=0.018, f=0.022, k=0.014, w=W0, reg='CROW_BEAK'),
            dict(c=(0, -0.2, 0.268 + z), d=FWD, a=0.012, f=0.014, k=0.008, w=W0, reg='CROW_BEAK'),
            dict(c=(0, -0.24, 0.255 + z), a=0.0, w=W0, reg='CROW_BEAK')], 6)
    for sx in (1, -1):
        c.box(Vector((sx * 0.032, -0.15, 0.285 + z)), (0.002, 0.005, 0.005), 'EYE_AMBER', W0)
        blob(c, (sx * 0.06, -0.05, 0.22 + z), (sx * 0.055, 0.2, 0.16 + z), 0.018, 0.05, 0.035, 'CROW', m=4)    # folded wings
    c.loft([dict(c=(0, 0.14, 0.16 + z), d=Y, a=0.03, f=0.008, k=0.008, w=W0, reg='CROW'),
            dict(c=(0, 0.28, 0.1 + z), d=Y, a=0.045, f=0.006, k=0.006, w=W0, reg='CROW')], 4)
    if not perch:
        for sx in (1, -1):
            c.tube([(sx * 0.025, 0.0, 0.14), (sx * 0.03, -0.01, 0.015)], 0.006, 4, 'CROW_BEAK', W0)
            if c.lod < 2:
                for a in (-25, 0, 25, 180):
                    d = Vector((math.sin(math.radians(a)), -math.cos(math.radians(a)), 0)) * (0.045 if a != 180 else 0.03)
                    c.tube([Vector((sx * 0.03, -0.01, 0.01)), Vector((sx * 0.03, -0.01, 0.005)) + d], 0.0035, 3, 'CROW_BEAK', W0)
    else:   # toes curled round a wire / rail at z = 0
        for sx in (1, -1):
            c.tube([(sx * 0.025, 0.0, 0.1 + z), (sx * 0.028, -0.005, 0.012)], 0.006, 4, 'CROW_BEAK', W0)
            c.tube([(sx * 0.028, -0.03, 0.006), (sx * 0.028, 0.0, 0.016), (sx * 0.028, 0.025, 0.004)], 0.004, 3, 'CROW_BEAK', W0)


def pigeon(c):
    blob(c, (0, 0.08, 0.12), (0, -0.07, 0.15), 0.05, 0.05, 0.055, 'PIGEON_GREY')
    blob(c, (0, -0.05, 0.16), (0, -0.09, 0.22), 0.032, 0.032, 0.03, 'PIGEON_NECK', m=3)
    blob(c, (0, -0.07, 0.22), (0, -0.12, 0.225), 0.026, 0.026, 0.022, 'PIGEON_GREY', m=3)
    cone(c, (0, -0.115, 0.222), (0, -0.14, 0.215), 0.006, 'CROW_BEAK')
    c.box(Vector((0, -0.117, 0.229)), (0.006, 0.006, 0.004), 'MASK', W0)          # the white cere
    for sx in (1, -1):
        c.box(Vector((sx * 0.022, -0.1, 0.228)), (0.0015, 0.004, 0.004), 'COMB_RED', W0)
        blob(c, (sx * 0.045, -0.04, 0.15), (sx * 0.04, 0.13, 0.11), 0.012, 0.035, 0.025, 'PIGEON_GREY', m=3)
        c.tube([(sx * 0.018, 0.0, 0.08), (sx * 0.02, -0.005, 0.008)], 0.004, 4, 'COMB_RED', W0)
    c.loft([dict(c=(0, 0.1, 0.11), d=Y, a=0.025, f=0.006, k=0.006, w=W0, reg='PIGEON_GREY'),
            dict(c=(0, 0.18, 0.08), d=Y, a=0.03, f=0.005, k=0.005, w=W0, reg='CROW')], 4)


# ── goat, dog ───────────────────────────────────────────────────────────────

def goat(c):
    """Saanen (the common white goat on Japanese farms): beard, swept horns."""
    hair = 'GOAT_WHITE'
    blob(c, (0, 0.42, 0.6), (0, -0.36, 0.63), 0.2, 0.19, 0.23, hair, prof=lambda t: max(math.sin(math.pi * (0.06 + 0.88 * t)), 0) ** 0.35)
    blob(c, (0, -0.3, 0.68), (0, -0.42, 0.9), 0.09, 0.09, 0.1, hair, m=4)                          # neck
    blob(c, (0, -0.37, 0.95), (0, -0.62, 0.86), 0.07, 0.075, 0.06, hair, m=5)                     # head, long muzzle
    c.box(Vector((0, -0.6, 0.86)), (0.02, 0.008, 0.012), 'NOSE_PINK', W0)
    cone(c, (0, -0.53, 0.8), (0, -0.55, 0.68), 0.025, hair)                                        # beard
    for sx in (1, -1):
        c.box(Vector((sx * 0.05, -0.47, 0.95)), (0.004, 0.012, 0.008), 'EYE', W0)
        c.loft([dict(c=(sx * 0.07, -0.38, 0.96), d=(sx, 0.4, -0.3), a=0.018, f=0.04, k=0.04, w=W0, reg=hair),
                dict(c=(sx * 0.16, -0.32, 0.9), a=0.0, w=W0, reg=hair)], 5)                         # ears
        c.loft([dict(c=(sx * 0.035, -0.4, 1.0), a=0.018, f=0.018, k=0.018, w=W0, reg='HORN'),
                dict(c=(sx * 0.05, -0.33, 1.08), a=0.012, f=0.012, k=0.012, w=W0, reg='HORN'),
                dict(c=(sx * 0.06, -0.24, 1.1), a=0.0, w=W0, reg='HORN')], 5)                       # horns
        for y in (-0.25, 0.3):
            c.loft([dict(c=(sx * 0.1, y, 0.55), a=0.065, f=0.07, k=0.07, w=W0, reg=hair),
                    dict(c=(sx * 0.09, y, 0.3), a=0.035, f=0.035, k=0.035, w=W0, reg=hair),
                    dict(c=(sx * 0.085, y - 0.01, 0.07), a=0.022, f=0.022, k=0.022, w=W0, reg=hair),
                    dict(c=(sx * 0.085, y - 0.015, 0.0), a=0.026, f=0.026, k=0.026, w=W0, reg='HOOF')], c.n(6, 5, 4))
    cone(c, (0, 0.4, 0.72), (0, 0.46, 0.8), 0.03, hair)                                            # tail up
    if c.lod == 0:
        for sx in (1, -1):    # udder teats would be too much; a pair of tassels (wattles) under the chin
            c.tube([(sx * 0.02, -0.46, 0.78), (sx * 0.022, -0.46, 0.73)], 0.008, 4, hair, W0)


def shiba(c, pose='sit'):
    red, cream = 'SHIBA_RED', 'SHIBA_CREAM'
    fur = lambda i, j, p: cream if (p.z < 0.12 or (p.y < -0.1 and p.z < 0.32 and abs(p.x) < 0.05)) else red

    def body(p0, p1, w, top, bot, prof=None, fn=fur):
        b, cp = blob(c, p0, p1, w, top, bot, red, prof=prof)
        paint_fn(c, [f for x in b for f in x] + cp, fn)
    if pose == 'sit':
        body((0, 0.1, 0.1), (0, -0.05, 0.38), 0.1, 0.1, 0.11, prof=lambda t: (1 - 0.35 * t) * min(1, math.sin(math.pi * (0.1 + 0.85 * t)) ** 0.3))
        for s in (1, -1):
            body((s * 0.07, 0.1, 0.06), (s * 0.07, -0.02, 0.07), 0.05, 0.06, 0.05)
            body((s * 0.045, -0.07, 0.28), (s * 0.045, -0.1, 0.02), 0.026, 0.026, 0.026, fn=lambda i, j, p: cream)
        head_at = Vector((0, -0.1, 0.46))
        tail_pts = [(0, 0.16, 0.12), (0.03, 0.22, 0.2), (0.0, 0.2, 0.28), (-0.04, 0.14, 0.24)]
    else:
        body((0, 0.25, 0.32), (0, -0.2, 0.34), 0.1, 0.1, 0.1)
        for s in (1, -1):
            for y in (-0.13, 0.2):
                body((s * 0.06, y, 0.3), (s * 0.055, y, 0.01), 0.028, 0.028, 0.028,
                     prof=lambda t: 1.0 - 0.3 * t, fn=lambda i, j, p: cream if p.z < 0.15 else red)
        body((0, -0.18, 0.36), (0, -0.25, 0.45), 0.065, 0.065, 0.065)
        head_at = Vector((0, -0.28, 0.5))
        tail_pts = [(0, 0.26, 0.38), (0.03, 0.32, 0.46), (0.0, 0.3, 0.54), (-0.04, 0.24, 0.5)]
    # head: fox-like wedge muzzle, erect triangular ears
    b, cp = blob(c, head_at + Vector((0, 0.06, 0)), head_at + Vector((0, -0.07, -0.01)), 0.07, 0.065, 0.06, red, m=c.n(6, 4, 3))
    paint_fn(c, [f for x in b for f in x] + cp, lambda i, j, p: cream if (p.z < head_at.z - 0.01 or p.y < head_at.y - 0.06) else red)
    b, cp = blob(c, head_at + Vector((0, -0.05, -0.02)), head_at + Vector((0, -0.14, -0.035)), 0.035, 0.03, 0.028, cream, m=3)
    c.box(head_at + Vector((0, -0.142, -0.022)), (0.012, 0.008, 0.009), 'CAT_BLACK', W0)
    for s in (1, -1):
        pyramid(c, [head_at + Vector((s * 0.02, 0.0, 0.05)), head_at + Vector((s * 0.06, 0.01, 0.035)),
                    head_at + Vector((s * 0.04, 0.03, 0.045)), head_at + Vector((s * 0.05, 0.005, 0.11))], red)
        c.box(head_at + Vector((s * 0.03, -0.06, 0.012)), (0.009, 0.004, 0.006), 'EYE', W0)
    # red collar
    c.loft([dict(c=head_at + Vector((0, 0.06, -0.06)), d=Vector((0, -0.4, 1)), a=0.06, f=0.058, k=0.058, w=W0, reg='COLLAR_RED'),
            dict(c=head_at + Vector((0, 0.065, -0.045)), d=Vector((0, -0.4, 1)), a=0.06, f=0.058, k=0.058, w=W0, reg='COLLAR_RED')],
           c.n(10, 8, 6), cap0=False, cap1=False)
    # the curled tail (maki-o), cream underneath
    tail(c, tail_pts, 0.03, lambda i, j, p: red)


ANIMALS = {
    'Cat_Sit_Calico': lambda c: cat(c, 'sit', 'calico'),
    'Cat_Loaf_Black': lambda c: cat(c, 'loaf', 'black'),
    'Cat_Walk_Tabby': lambda c: cat(c, 'walk', 'tabby'),
    'Cat_Curl_Ginger': lambda c: cat(c, 'curl', 'ginger'),
    'Cat_Sit_Tuxedo': lambda c: cat(c, 'sit', 'tuxedo'),
    'Cat_Loaf_Calico': lambda c: cat(c, 'loaf', 'calico'),
    'Chicken_Hen': lambda c: chicken(c),
    'Chicken_Rooster': lambda c: chicken(c, True),
    'Goat': goat,
    'Crow': lambda c: crow(c),
    'Crow_Perch': lambda c: crow(c, True),
    'Pigeon': pigeon,
    'Shiba_Sit': lambda c: shiba(c, 'sit'),
    'Shiba_Stand': lambda c: shiba(c, 'stand'),
}


def build(only=None):
    mat = K.atlas_material(ATLAS, emission_strength=1.0)
    out = []
    for name, fn in ANIMALS.items():
        if only and name not in only:
            continue
        col = K.collection(f'Animal_{name}')
        lods = []
        for lod in (0, 1, 2):
            c = ctx(lod)
            fn(c)
            ob = FK.rigid_object(f'SM_Animal_{name}_LOD{lod}', c, col, mat)
            if lod:
                ob.hide_set(True); ob.hide_render = True
            lods.append(ob)
        out.append((col, lods))
    return out


def preview(results, views):
    from kit import preview as P
    objs = [lods[0] for _, lods in results]
    x = 0.0
    for o in objs:
        w = max(o.dimensions.x, 0.15)
        o.location = (x + w / 2, 0, 0)
        x += w + 0.12
    try:
        return P.render(objs, 'Animals', [('front', (0.35, -1.6, 0.35), False), ('back', (-0.35, 1.6, 0.4), False),
                                          ('clay', (0.8, -1.4, 0.45), 'clay')], size=(1300, 420), show=[c.name for c, _ in results])
    finally:
        for o in objs:
            o.location = (0, 0, 0)
