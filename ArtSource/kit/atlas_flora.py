"""Atlas `Flora` (task 4, vegetation): bark strips, clipped-hedge strips,
cells, and leaf cards with alpha (one cut-out material M_Flora_Atlas for
trunk, foliage and far LOD - the Unity instancing renderer draws one
material per tree).

Leaf cards are painted element by element (leaves, needles, flowers on
their twigs), back to front, each element lit on one half (midrib) so the
card reads as many small leaves, not as a blob. Transparent pixels get the
colour of the nearest leaves (dilation): mip levels average colour with the
transparent texels and would otherwise draw a dark or white fringe.

Bark strips are mapped with K.map_cyl(rotate=True) / tree_kit: U = length
along the trunk in metres (fibres, plates and bamboo nodes run along U),
V = once round."""
import math
import numpy as np
from .atlas import (_out, srgb, fbm, value_noise, smoothstep, vgrad, flat, leaves, _cells, _strip, _rect,
                    _voronoi)


# ── bark ────────────────────────────────────────────────────────────────────

def bark_sugi(col='#6b4632', ppm=64):
    """Japanese cedar: long reddish-brown fibres peeling in strips, grey weathering."""
    def gen(w, h, rng):
        fib = value_noise(w, h, max(4, w // 96), h // 2, rng)          # long along U, fine across V
        fine = value_noise(w, h, max(8, w // 24), h, rng)
        grey = smoothstep(0.55, 0.75, fbm(w, h, w // 64, max(2, h // 16), rng, 3))
        f = 0.62 + 0.45 * fib + 0.18 * (fine - 0.5)
        cracks = smoothstep(0.18, 0.05, np.abs(fib - 0.5)) * 0.35
        rgb = srgb(col) * (f * (1 - cracks))[..., None]
        rgb = rgb * (1 - 0.5 * grey[..., None]) + srgb('#7d756c') * (0.5 * grey * f)[..., None]
        return _out(rgb, 0.12 + 0.1 * fib)
    return gen


def bark_plates(col='#5a524c', fissure='#221c19', plate_m=(0.16, 0.08), ppm=64, flake=None):
    """Pine: plates split by deep fissures, elongated along U. flake = colour of
    the thin orange flakes of red pine (akamatsu)."""
    def gen(w, h, rng):
        W, H = w / ppm, h / ppm
        n = int(W * H / (plate_m[0] * plate_m[1]))
        pts = rng.random((n, 2)) * (W, H)
        d1, d2, idx, _ = _voronoi(w, h, ppm, pts, aspect=plate_m[1] / plate_m[0])
        edge = smoothstep(0.004, 0.022, d2 - d1)
        tone = (0.75 + 0.5 * rng.random(n))[idx]
        n2 = fbm(w, h, w // 32, max(2, h // 8), rng, 3)
        base = srgb(col) * (tone * (0.8 + 0.35 * n2))[..., None]
        if flake:
            fl = smoothstep(0.45, 0.6, value_noise(w, h, w // 6, max(2, h // 3), rng))
            base = base * (1 - fl[..., None]) + srgb(flake) * (0.85 + 0.3 * n2)[..., None] * fl[..., None]
        rgb = srgb(fissure) * (1 - edge[..., None]) + base * edge[..., None]
        return _out(rgb, 0.1 + 0.08 * edge)
    return gen


def bark_smooth(col='#6f675c', ppm=64, lenticels=None, lichen=0.3):
    """Smooth bark (maple: grey with faint streaks; cherry: dark, glossy, with
    horizontal lenticel dashes = short lines across the trunk, along V)."""
    def gen(w, h, rng):
        n = fbm(w, h, w // 48, max(2, h // 8), rng, 4)
        streak = value_noise(w, h, max(4, w // 64), h // 3, rng)
        f = 0.8 + 0.25 * n + 0.12 * (streak - 0.5)
        rgb = srgb(col) * f[..., None]
        sm = 0.22 + 0.1 * n
        if lenticels:
            y, x = np.mgrid[0:h, 0:w].astype(float)
            rows = value_noise(w, h, w // 3, 1, rng)                        # where a band runs
            dash = value_noise(w, h, w // 2, max(2, h // 6), rng)          # broken along V
            band = smoothstep(0.78, 0.84, rows) * smoothstep(0.45, 0.6, dash)
            rgb = rgb * (1 - band[..., None]) + srgb(lenticels) * band[..., None]
            sm = sm + 0.15
        if lichen:
            m = smoothstep(0.7 - 0.2 * lichen, 0.75 - 0.2 * lichen, fbm(w, h, w // 20, max(2, h // 6), rng, 4))
            rgb = rgb * (1 - 0.6 * m[..., None]) + srgb('#9aa08a') * (0.6 * m)[..., None]
        return _out(rgb, sm)
    return gen


def bark_bamboo(col='#61803c', node_m=0.32, ppm=64):
    """Moso bamboo culm: green, node ring every node_m along U with a dark
    line and a pale powdery band just below it, a few older yellow streaks."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        s = (x / ppm) % node_m
        ring = smoothstep(0.012, 0.0, np.abs(s - node_m * 0.5))
        powder = smoothstep(0.0, 0.03, node_m * 0.5 - s) * smoothstep(0.09, 0.03, node_m * 0.5 - s)
        n = fbm(w, h, w // 32, max(2, h // 4), rng, 3)
        streak = smoothstep(0.62, 0.75, value_noise(w, h, max(4, w // 80), h // 4, rng))
        rgb = srgb(col) * (0.85 + 0.25 * n)[..., None]
        rgb = rgb * (1 - 0.45 * streak[..., None]) + srgb('#a59a58') * (0.45 * streak)[..., None]
        rgb = rgb * (1 - 0.35 * powder[..., None]) + srgb('#c9cdb8') * (0.35 * powder)[..., None]
        rgb = rgb * (1 - 0.55 * ring[..., None])
        return _out(rgb, 0.5 + 0.1 * n - 0.3 * powder)
    return gen


# ── leaf cards ──────────────────────────────────────────────────────────────

class _Card:
    """Painter's canvas for one card: rgb, alpha, smoothness. Coordinates in
    pixels, y up (row 0 = bottom, like the atlas)."""

    def __init__(s, w, h):
        s.w, s.h = w, h
        s.rgb = np.zeros((h, w, 3)); s.a = np.zeros((h, w)); s.sm = np.zeros((h, w))

    def stamp(s, cx, cy, ang, L, W, shape, col, tone=1.0, lit=0.22, smooth=0.3, rib=0.0, edge=None):
        """One element: local u along `ang` (-1..1 over length L), v across
        (-1..1 over width W). shape(u, v) -> bool mask or (mask, shade)."""
        R = int(max(L, W) / 2) + 2
        x0, x1 = max(int(cx) - R, 0), min(int(cx) + R + 1, s.w)
        y0, y1 = max(int(cy) - R, 0), min(int(cy) + R + 1, s.h)
        if x0 >= x1 or y0 >= y1:
            return
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
        dx, dy = xx + 0.5 - cx, yy + 0.5 - cy
        ca, sa = math.cos(ang), math.sin(ang)
        u = (dx * ca + dy * sa) / (L / 2)
        v = (-dx * sa + dy * ca) / (W / 2)
        r = shape(u, v)
        m, extra = (r if isinstance(r, tuple) else (r, None))
        if not m.any():
            return
        c = np.asarray(col, float)
        sh = tone * (0.82 + 0.18 * (1 - np.abs(v).clip(0, 1))) + lit * (v > 0)
        if rib:
            sh = sh * (1 - rib * (np.abs(v) < 0.12))
        rgb = c[None, None, :] * sh[..., None]
        if extra is not None:                         # per-pixel colour (flower centre, margin)
            rgb = np.where(extra[0][..., None], extra[1][None, None, :] * sh[..., None], rgb)
        reg = s.rgb[y0:y1, x0:x1]
        reg[m] = rgb[m]
        s.a[y0:y1, x0:x1][m] = 1.0
        s.sm[y0:y1, x0:x1][m] = smooth

    def line(s, p0, p1, width, col, tone=1.0):
        (ax, ay), (bx, by) = p0, p1
        L = math.hypot(bx - ax, by - ay) + width
        s.stamp((ax + bx) / 2, (ay + by) / 2, math.atan2(by - ay, bx - ax), L, max(width, 1.2),
                lambda u, v: (np.abs(u) <= 1) & (np.abs(v) <= 1), col, tone, lit=0.0, smooth=0.15)

    def finish(s, depth=0.22, rng=None):
        """Darker towards the card centre (inside of the crown), dilate colour
        into the transparent texels, smoothness of wet leaves."""
        h, w = s.h, s.w
        y, x = np.mgrid[0:h, 0:w].astype(float)
        r = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2)
        s.rgb *= (1 - depth * (1 - r.clip(0, 1)))[..., None]
        acc = s.rgb * s.a[..., None]; wa = s.a.copy()
        filled = s.rgb.copy(); have = s.a > 0
        for _ in range(12):                                # grow colour outwards
            acc = sum(np.roll(np.roll(acc, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
            wa = sum(np.roll(np.roll(wa, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
            new = (~have) & (wa > 0)
            filled[new] = acc[new] / wa[new, None]
            have |= new
            acc = filled * have[..., None]; wa = have.astype(float)
        if not have.all():
            filled[~have] = (s.rgb[s.a > 0].mean(0) if (s.a > 0).any() else 0.2)
        # the outermost pixel row stays clear: neighbouring cards must not bleed in
        s.a[:1, :] = s.a[-1:, :] = 0; s.a[:, :1] = s.a[:, -1:] = 0
        return dict(rgb=np.clip(filled, 0, 1), smooth=s.sm + 0.25 * (s.sm == 0), metal=0.0, emit=None, alpha=s.a)


# element shapes: (u, v) in -1..1 -> mask (or (mask, (pixel_mask, colour)))
def _ellipse(u, v):
    return u * u + v * v < 1


def _leaf(u, v):            # pointed oval, broadest a little behind the middle
    return np.abs(v) < np.clip(1 - u * u, 0, 1) ** 0.7 * (1 - 0.2 * u)


def _lance(u, v):           # bamboo / sasa: long, broadest in the lower third, fine tip
    t = (u + 1) / 2
    return (t > 0) & (t < 1) & (np.abs(v) < np.sin(math.pi * t.clip(0, 1)) ** 0.55 * (1.15 - 0.6 * t))


def _palm(u, v):            # momiji: 7 deep, pointed lobes, notch at the stalk (-u)
    r = np.sqrt(u * u + v * v); th = np.arctan2(v, -u)
    return r < 0.3 + 0.7 * np.abs(np.cos(3.5 * th)) ** 1.6


def _flower(n, centre_col, notch=True):
    cc = np.asarray(centre_col, float)

    def f(u, v):
        r = np.sqrt(u * u + v * v); th = np.arctan2(v, u)
        petal = np.abs(np.cos(n / 2 * th))
        lim = 0.5 + 0.5 * petal ** 0.45
        if notch:                                   # sakura petals are notched at the tip
            lim = lim - 0.14 * (petal > 0.97)
        return r < lim, (r < 0.32, cc)
    return f


def _twigs(c, rng, root, n, length, col, width=1.6, spread=math.pi * 0.9, start=None, bends=3):
    """A small branching twig system from `root`; returns the twig tips and
    points along the twigs (where leaves sit)."""
    tips, pts = [], []
    base = start if start is not None else rng.uniform(0, 2 * math.pi)
    for i in range(n):
        a = base + (i - (n - 1) / 2) * spread / max(n - 1, 1) + rng.uniform(-0.2, 0.2)
        p = np.array(root, float)
        L = length * rng.uniform(0.7, 1.1)
        for k in range(bends):
            a += rng.uniform(-0.35, 0.35)
            q = p + L / bends * np.array([math.cos(a), math.sin(a)])
            c.line(p, q, width * (1 - 0.25 * k), col)
            pts += [p + (q - p) * t for t in (0.3, 0.7)]
            p = q
        tips.append(p)
    return tips, pts


def _blob_points(rng, w, h, n, rx=0.42, ry=0.42, power=0.6):
    """Element positions filling an irregular round blob (denser inside)."""
    a = rng.uniform(0, 2 * math.pi, n)
    r = rng.random(n) ** power
    lob = 1 + 0.18 * np.sin(3 * a + rng.uniform(0, 6)) + 0.1 * np.sin(5 * a + rng.uniform(0, 6))
    return np.stack([w / 2 + np.cos(a) * r * rx * w * lob, h / 2 + np.sin(a) * r * ry * h * lob], 1)


def card_sugi(dark='#2b4a2f', tip='#6a8a3e', rust=None, shoots=95):
    """Cedar foliage: a dense clump of short ropy shoots (tiny awl-shaped
    scale leaves round a twig) pointing every way, fresh yellow-green tips.
    No common centre: shoots radiating from one point read as a star.
    rust = share of sun-browned shoots (old trees)."""
    def gen(w, h, rng):
        c = _Card(w, h)
        d, t = srgb(dark), srgb(tip)
        pts = _blob_points(rng, w, h, shoots, 0.36, 0.36, 0.55)
        for p0 in pts:
            a = rng.uniform(0, 2 * math.pi)
            p = np.array(p0, float)
            L = rng.uniform(0.09, 0.15) * w
            brown = rust and rng.random() < rust
            steps = 6
            for k in range(steps):
                a += rng.uniform(-0.3, 0.3)
                q = p + L / steps * np.array([math.cos(a), math.sin(a)])
                kk = k / (steps - 1)
                col = (srgb('#7a5a34') * (0.8 + 0.3 * kk)) if brown else d * (1 - kk * 0.8) + t * kk * 0.8
                wd = (6.0 - 2.4 * kk) * w / 160
                c.stamp(q[0], q[1], a, wd * 1.4, wd, _ellipse, col, rng.uniform(0.85, 1.15), lit=0.2, smooth=0.3)
                for sg in (-1, 1):          # side scales: rough, needly edge
                    sq = q + sg * wd * 0.45 * np.array([-math.sin(a), math.cos(a)])
                    c.stamp(sq[0], sq[1], a + sg * 0.8, wd * 0.9, wd * 0.33, _ellipse, col * 0.85, 1.0, lit=0.1)
                p = q
        return c.finish(0.25)
    return gen


def card_matsu(dark='#2c4630', tip='#56763c', tufts=20):
    """Pine: tufts of long paired needles fanning out from the twig tips."""
    def gen(w, h, rng):
        c = _Card(w, h)
        tips, _ = _twigs(c, rng, (w / 2, h / 2), 6, w * 0.28, srgb('#4a3528'), 2.6, spread=2 * math.pi * 0.85, bends=2)
        pts = list(tips) + [p for p in _blob_points(rng, w, h, tufts - len(tips), 0.25, 0.25)]
        d, t = srgb(dark), srgb(tip)
        for p in pts:
            out = math.atan2(p[1] - h / 2, p[0] - w / 2)
            for k in range(40):
                a = out + rng.normal(0, 0.75)
                L = rng.uniform(0.13, 0.21) * w
                q = np.array(p) + L / 2 * np.array([math.cos(a), math.sin(a)])
                col = d * rng.uniform(0.8, 1.15) + (t - d) * rng.random() * 0.8
                c.stamp(q[0], q[1], a, L, 1.5 * w / 160, lambda u, v: (np.abs(v) < 1 - 0.6 * np.clip(u, 0, 1)) & (np.abs(u) < 1),
                        col, 1.0, lit=0.0, smooth=0.35)
            c.stamp(p[0], p[1], 0, 5 * w / 160, 5 * w / 160, _ellipse, srgb('#5a4330'), 1.0, lit=0.1)   # bud sheath
        return c.finish(0.2)
    return gen


def card_leaves(cols, shape=_leaf, n=60, size=(0.11, 0.06), twig='#45342a', rib=0.18, flowers=None, margin=None,
                lit=0.22, power=0.6, twigs=5, radial=True):
    """Broad leaves on twigs (maple, cherry in leaf, wild shrub, sasa).
    cols: list of (colour, weight). flowers = (shape, colours, count, size).
    margin = colour of a pale leaf edge (kumazasa)."""
    def gen(w, h, rng):
        c = _Card(w, h)
        if twigs:
            _twigs(c, rng, (w / 2, h / 2), twigs, w * 0.34, srgb(twig), 1.8, spread=2 * math.pi * 0.85)
        P = np.array(cols_w)
        pts = _blob_points(rng, w, h, n, power=power)
        for p in pts:
            col = srgb(cols[rng.choice(len(cols), p=P)][0])
            L = rng.uniform(0.8, 1.2) * size[0] * w; W = L * size[1] / size[0]
            a = (math.atan2(p[1] - h / 2, p[0] - w / 2) + rng.normal(0, 0.6)) if radial else rng.uniform(0, 2 * math.pi)
            shp = shape
            if margin is not None:
                mc = srgb(margin)
                shp = (lambda u, v, base=shape: (base(u, v), (np.abs(v) > 0.8 * np.clip(1 - u * u, 0, 1) ** 0.6, mc)))
            c.stamp(p[0], p[1], a, L, W, shp, col, rng.uniform(0.75, 1.15), lit=lit, smooth=0.32, rib=rib)
        if flowers:
            fshape, fcols, fn, fsize = flowers
            for p in _blob_points(rng, w, h, fn, 0.4, 0.4, 0.5):
                col = srgb(fcols[rng.integers(len(fcols))])
                s = rng.uniform(0.8, 1.2) * fsize * w
                c.stamp(p[0], p[1], rng.uniform(0, 6.3), s, s, fshape, col, rng.uniform(0.9, 1.1), lit=0.08, smooth=0.25)
        return c.finish(0.22)
    cols_w = [x[1] for x in cols]
    s = sum(cols_w); cols_w = [x / s for x in cols_w]
    return gen


def card_momiji(cols):
    """Japanese maple: many small, deeply cut 7-lobed leaves on fine twigs."""
    return card_leaves(cols, _palm, n=140, size=(0.14, 0.14), twig='#4a3a30', rib=0.0, lit=0.15, power=0.55, twigs=6)


def card_sakura(petal='#f7e1e6', centre='#e597ab', bud='#d0607e', leaf=None, n=64):
    """Somei-yoshino in bloom: umbels of 3-5 notched five-petal flowers
    along dark twigs, pale pink with a deeper centre, a few buds."""
    def gen(w, h, rng):
        c = _Card(w, h)
        tips, along = _twigs(c, rng, (w / 2, h / 2), 6, w * 0.36, srgb('#3a2a2c'), 2.0, spread=2 * math.pi * 0.85)
        anchors = list(along) + list(_blob_points(rng, w, h, max(n - len(along), 8), 0.4, 0.4, 0.55))
        fl = _flower(5, srgb(centre))
        for p in anchors:
            if leaf is not None and rng.random() < 0.25:
                c.stamp(p[0], p[1], rng.uniform(0, 6.3), 0.1 * w, 0.05 * w, _leaf, srgb(leaf), 1.0, lit=0.15)
            for k in range(rng.integers(3, 6)):
                q = np.array(p) + rng.normal(0, 0.035 * w, 2)
                s = rng.uniform(0.075, 0.095) * w
                col = srgb(petal) * rng.uniform(0.9, 1.04)
                c.stamp(q[0], q[1], rng.uniform(0, 6.3), s, s, fl, col, 1.0, lit=0.06, smooth=0.2)
            if rng.random() < 0.3:
                q = np.array(p) + rng.normal(0, 0.04 * w, 2)
                c.stamp(q[0], q[1], 0, 0.03 * w, 0.03 * w, _ellipse, srgb(bud), 1.0, lit=0.1)
        return c.finish(0.15)
    return gen


def card_shidare(petal='#f2c4d0', centre='#d97f98', strands=11):
    """Weeping cherry: thin hanging twigs (top to bottom of the card) studded
    with flowers. The card hangs upright (no random roll)."""
    def gen(w, h, rng):
        c = _Card(w, h)
        fl = _flower(5, srgb(centre))
        for i in range(strands):
            x = (i + rng.uniform(0.2, 0.8)) / strands * w
            p = np.array([x, h - 2.0]); a = -math.pi / 2 + rng.uniform(-0.15, 0.15)
            L = rng.uniform(0.7, 0.98) * h
            for k in range(14):
                a += rng.uniform(-0.08, 0.08)
                q = p + L / 14 * np.array([math.cos(a), math.sin(a)])
                c.line(p, q, 1.3, srgb('#3a2a2c'))
                for j in range(2):
                    f = q + rng.normal(0, 0.03 * w, 2)
                    s = rng.uniform(0.06, 0.08) * w
                    c.stamp(f[0], f[1], rng.uniform(0, 6.3), s, s, fl, srgb(petal) * rng.uniform(0.88, 1.04), 1.0,
                            lit=0.05, smooth=0.2)
                p = q
        return c.finish(0.05)
    return gen


def card_take(cols=('#4e7a32', '#3f6a2a', '#5e8a3a', '#6a9440'), fans=18):
    """Bamboo foliage: fans of 3-7 slender leaves at the tips of thin twigs."""
    def gen(w, h, rng):
        c = _Card(w, h)
        tips, along = _twigs(c, rng, (w / 2, h / 2), 5, w * 0.36, srgb('#7a8a48'), 1.3, spread=2 * math.pi * 0.85)
        for p in list(tips) + list(along[::2]) + list(_blob_points(rng, w, h, fans, 0.3, 0.3)):
            out = math.atan2(p[1] - h / 2, p[0] - w / 2)
            for k in range(rng.integers(3, 7)):
                a = out + rng.normal(0, 0.55)
                L = rng.uniform(0.22, 0.32) * w
                q = np.array(p) + L / 2 * np.array([math.cos(a), math.sin(a)])
                c.stamp(q[0], q[1], a, L, L * 0.17, _lance, srgb(cols[rng.integers(len(cols))]),
                        rng.uniform(0.8, 1.15), lit=0.2, smooth=0.4, rib=0.15)
        return c.finish(0.18)
    return gen


def card_ajisai(leaf='#3f6a2c', flowers=('#5f7fc8', '#7c70c4', '#9a7ac8', '#b6c0ea')):
    """Hydrangea (rainy season): big leaves and 3 domed flower heads of small
    four-petal florets, blue to violet."""
    def gen(w, h, rng):
        c = _Card(w, h)
        for p in _blob_points(rng, w, h, 22, 0.44, 0.44, 0.5):
            a = math.atan2(p[1] - h / 2, p[0] - w / 2) + rng.normal(0, 0.5)
            L = rng.uniform(0.2, 0.27) * w
            c.stamp(p[0], p[1], a, L, L * 0.6, _leaf, srgb(leaf), rng.uniform(0.75, 1.1), lit=0.2, smooth=0.35, rib=0.2)
        fl = _flower(4, srgb('#e8ecf6'), notch=False)
        for k in range(3):
            ctr = np.array([w / 2, h / 2]) + rng.normal(0, 0.15 * w, 2)
            base = rng.integers(len(flowers))
            for j in range(60):
                rr = rng.random() ** 0.5 * 0.2 * w; aa = rng.uniform(0, 6.3)
                q = ctr + rr * np.array([math.cos(aa), math.sin(aa)])
                col = srgb(flowers[(base + (rng.random() < 0.3)) % len(flowers)])
                s = rng.uniform(0.06, 0.08) * w
                c.stamp(q[0], q[1], rng.uniform(0, 6.3), s, s, fl, col, 1.05 - 0.4 * rr / (0.2 * w), lit=0.05, smooth=0.25)
        return c.finish(0.2)
    return gen


def card_kaki(leaf=(('#3d5a26', 3), ('#4a6a2c', 2), ('#5a7a30', 1), ('#a8582a', 0.4)), fruits=2):
    """Persimmon (kaki) in autumn: broad glossy oval leaves (some already
    turning orange) and the flattened orange fruits with their dark four-
    lobed calyx, hanging in the leaves."""
    base = card_leaves(list(leaf), n=48, size=(0.2, 0.12), rib=0.22, lit=0.28, power=0.65, twigs=5)

    def gen(w, h, rng):
        o = base(w, h, rng)
        c = _Card(w, h)
        c.rgb, c.a, c.sm = o['rgb'].copy(), o['alpha'].copy(), np.where(o['alpha'] > 0, 0.35, 0.0)
        for p in _blob_points(rng, w, h, fruits, 0.36, 0.36, 0.5):
            r = rng.uniform(0.12, 0.145) * w
            col = srgb('#e8701a') * rng.uniform(0.9, 1.08)
            c.stamp(p[0], p[1], 0, r, r * 0.86, _ellipse, col, 1.0, lit=0.25, smooth=0.6)
            c.stamp(p[0] - r * 0.18, p[1] + r * 0.16, 0, r * 0.32, r * 0.22, _ellipse, srgb('#ffb060'), 1.0, lit=0.0, smooth=0.7)
            c.stamp(p[0], p[1] + r * 0.4, rng.uniform(0, 6.3), r * 0.42, r * 0.42, _flower(4, srgb('#2e3a1c'), notch=False),
                    srgb('#3a4a22'), 1.0, lit=0.05)
        return c.finish(0.3)
    return gen


def card_yanagi(cols=('#8fb04a', '#a3c05a', '#7aa03e', '#b4c870'), strands=7):
    """Weeping willow (yanagi): long thin twigs hanging from the top of the
    (tall, narrow) card, set with narrow pale leaves the whole way down."""
    def gen(w, h, rng):
        c = _Card(w, h)
        for i in range(strands):
            x = (i + rng.uniform(0.2, 0.8)) / strands * w
            p = np.array([x, h - 2.0]); a = -math.pi / 2 + rng.uniform(-0.08, 0.08)
            L = rng.uniform(0.8, 0.98) * h
            n = 24
            for k in range(n):
                a += rng.uniform(-0.05, 0.05)
                q = p + L / n * np.array([math.cos(a), math.sin(a)])
                c.line(p, q, 0.9, srgb('#5a5a2a'))
                for sg in (-1, 1):
                    lf = q + sg * np.array([rng.uniform(1.0, 2.5), 0])
                    ll = rng.uniform(0.09, 0.13) * w * 1.6
                    c.stamp(lf[0], lf[1] - ll * 0.3, -math.pi / 2 + sg * rng.uniform(0.15, 0.4), ll, ll * 0.16, _lance,
                            srgb(cols[rng.integers(len(cols))]), rng.uniform(0.85, 1.1), lit=0.15, smooth=0.3)
                p = q
        return c.finish(0.25)
    return gen


def dense(card_gen, bg):
    """Opaque foliage tile for the crown cores: the same leaves as the card,
    painted over a dark background of the same plant (no alpha). A flat
    dark core read as a smooth black ball between the cards."""
    def gen(w, h, rng):
        o = card_gen(w, h, rng)
        a = o['alpha'][..., None]
        n = fbm(w, h, 4, 4, rng, 3)
        b = srgb(bg) * (0.7 + 0.5 * n)[..., None]
        rgb = o['rgb'] * a + b * (1 - a)
        return _out(rgb * 0.85, 0.25)
    return gen


# ── layout ──────────────────────────────────────────────────────────────────
# y from the bottom: cards 3 rows x 160 px (0-480), cells (480-544),
# clipped hedges (544-736, 64 px/m = 1.5 m tall), bark strips 6 x 48 px (736-1024)
CARD = 160
CARDS = [
    ('CARD_SUGI',       card_sugi()),
    ('CARD_SUGI_OLD',   card_sugi('#2e452c', '#55703a', rust=0.15)),
    ('CARD_MATSU',      card_matsu()),
    ('CARD_MOMIJI',     card_momiji([('#5f8a32', 3), ('#6f9a3a', 2), ('#4c7a2c', 2)])),
    ('CARD_MOMIJI_RED', card_momiji([('#b52a1a', 3), ('#d0451f', 2), ('#8e1c1a', 2), ('#d9822a', 1)])),
    ('CARD_MOMIJI_GOLD', card_momiji([('#d9822a', 3), ('#e0a030', 2), ('#c45a22', 2), ('#9a8a32', 1)])),
    ('CARD_SAKURA',     card_sakura()),
    ('CARD_SAKURA_LEAF', card_leaves([('#4f7a30', 3), ('#5e8a36', 2), ('#3f6a2a', 2)], n=95, size=(0.17, 0.085))),
    ('CARD_SHIDARE',    card_shidare()),
    ('CARD_TAKE',       card_take()),
    ('CARD_TSUTSUJI',   card_leaves([('#3c5a2a', 3), ('#4a6a30', 2)], n=180, size=(0.075, 0.042), rib=0.0,
                                    flowers=(_flower(5, srgb('#f2b0cc'), notch=False), ('#d9407f', '#e86aa0', '#c8306a'), 42, 0.12))),
    ('CARD_AJISAI',     card_ajisai()),
    ('CARD_SASA',       card_leaves([('#4d7a2e', 3), ('#5a8a34', 2), ('#42702a', 2)], _lance, n=34, size=(0.34, 0.09),
                                    margin='#d6cfaa', rib=0.1, power=0.8, twigs=0, radial=False)),
    ('CARD_YABU',       card_leaves([('#3e5c2c', 3), ('#4a6a32', 2), ('#56743a', 1)], n=170, size=(0.085, 0.045))),
]


DENSE = [   # 80 px tiles, four to a card slot, after the cards
    ('DENSE_SUGI',       dense(card_sugi(shoots=60), '#1c2e1e')),
    ('DENSE_SUGI_OLD',   dense(card_sugi('#2e452c', '#55703a', rust=0.15, shoots=60), '#1f2c1c')),
    ('DENSE_MATSU',      dense(card_matsu(tufts=10), '#1c2c1e')),
    ('DENSE_MOMIJI',     dense(CARDS[3][1], '#2e4a1c')),
    ('DENSE_MOMIJI_RED', dense(CARDS[4][1], '#5a1610')),
    ('DENSE_MOMIJI_GOLD', dense(CARDS[5][1], '#7a4218')),
    ('DENSE_SAKURA',     dense(CARDS[6][1], '#b88896')),
    ('DENSE_LEAF',       dense(CARDS[7][1], '#24401c')),
    ('DENSE_TAKE',       dense(CARDS[9][1], '#30501e')),
    ('DENSE_AJISAI',     dense(CARDS[11][1], '#24401c')),
    ('DENSE_YABU',       dense(CARDS[13][1], '#24401c')),
]


def layout():
    reg = {}
    for i, (name, gen) in enumerate(CARDS):
        reg[name] = _rect((i % 6) * CARD, (i // 6) * CARD, CARD, CARD, gen)
    for i, (name, gen) in enumerate(DENSE):
        slot = len(CARDS) + i // 4
        x, y = (slot % 6) * CARD + (i % 2) * 80, (slot // 6) * CARD + (i % 4 // 2) * 80
        reg[name] = _rect(x, y, 80, 80, gen)
    reg.update(_cells([
        ('FAR_SUGI',      flat('#243a25', 0.25, dirt=0.3)),    # LOD2 bodies: the card's average colour
        ('FAR_MATSU',     flat('#263c28', 0.25, dirt=0.3)),
        ('FAR_MOMIJI',    flat('#46692a', 0.25, dirt=0.3)),
        ('FAR_MOMIJI_RED', flat('#7e2216', 0.25, dirt=0.3)),
        ('FAR_MOMIJI_GOLD', flat('#a8682a', 0.25, dirt=0.3)),
        ('FAR_SAKURA',    flat('#d7b2bf', 0.2, dirt=0.3)),
        ('FAR_LEAF',      flat('#3a5c26', 0.25, dirt=0.3)),
        ('FAR_TAKE',      flat('#3f6229', 0.3, dirt=0.3)),
        ('FAR_TSUTSUJI',  flat('#6a4a42', 0.25, dirt=0.3)),
        ('ROPE',          flat('#c2ad78', 0.15, dirt=0.05)),
        ('PAPER',         flat('#f4f0e4', 0.2, dirt=0.03)),
        ('POLE',          flat('#8a7a5e', 0.25, dirt=0.15)),   # weathered support poles (shichu)
        ('PALM_ROPE',     flat('#3a2c22', 0.15, dirt=0.05)),   # shuro rope binding the supports
        ('BARK_DARK',     flat('#2e2420', 0.15, dirt=0.1)),    # LOD2 trunks
        ('BARK_RED',      flat('#6b4632', 0.15, dirt=0.1)),
        ('CULM',          flat('#5a7838', 0.4, dirt=0.1)),
        ('SOIL',          flat('#33281f', 0.1, dirt=0.0)),
    ], 0, 480, 16, 64, 32))
    # 64 px/m: 1.5 m tall, the tops of clipped shrubs are mapped across their depth (up to 1.4 m)
    reg['CLIP_TSUTSUJI'] = _strip(544, 96, leaves('#3c5a2a', bloom=('#d9407f', 0.5), leaf_m=0.035, ppm=64), ppm=64)
    reg['CLIP_GREEN'] = _strip(640, 96, leaves('#34522a', leaf_m=0.03, ppm=64), ppm=64)
    for i, (name, gen) in enumerate([
            ('BARK_SUGI',    bark_sugi()),
            ('BARK_KURO',    bark_plates()),
            ('BARK_AKA',     bark_plates('#8a5a40', '#3a2a22', (0.12, 0.06), flake='#b07050')),
            ('BARK_MOMIJI',  bark_smooth('#6f675c', lichen=0.4)),
            ('BARK_SAKURA',  bark_smooth('#4a3634', lenticels='#8a7a6e', lichen=0.25)),
            ('BARK_TAKE',    bark_bamboo())]):
        reg[name] = _strip(736 + 48 * i, 48, gen, ppm=64)
    # task 5c: persimmon (kaki) and weeping willow (yanagi) in the free slots,
    # each with its own seed so the approved regions keep their pixels
    new = {
        'CARD_KAKI':    _rect(800, 320, CARD, CARD, card_kaki()),
        'DENSE_KAKI':   _rect(720, 400, 80, 80, dense(card_kaki(fruits=1), '#24381a')),
        'CARD_YANAGI':  _rect(960, 0, 64, 320, card_yanagi()),
        'DENSE_YANAGI': _rect(960, 320, 64, 64, dense(card_yanagi(strands=5), '#3a5420')),
    }
    new.update(_cells([
        ('FAR_KAKI',      flat('#3c5426', 0.25, dirt=0.3)),
        ('FAR_KAKI_BARE', flat('#5e4a3a', 0.2, dirt=0.3)),
        ('FAR_YANAGI',    flat('#78964a', 0.25, dirt=0.3)),
        ('FRUIT_KAKI',    flat('#e2681a', 0.55, dirt=0.05)),
        ('CALYX',         flat('#3a4a22', 0.3, dirt=0.0)),
    ], 17 * 64 % 1024, 480 + 32, 16, 64, 32))
    for k, (name, r) in enumerate(new.items()):
        r['seed'] = 5300 + k
        reg[name] = r
    return reg
