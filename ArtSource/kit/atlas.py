"""Procedural texture atlases, one per style (1024²).

Layout per atlas:
- *strips* span the full width, so UVs may run past u=1 and the strip repeats
  horizontally (walls, stone, wood). Strips are mapped **metric in both
  axes** (texel density = ppm, default 128 px/m) - never stretched. V starts
  at the bottom of the part, so grime sits at the bottom; a strip is as tall
  as the tallest surface that uses it.
- *cells* are 64 px swatches: one colour with a smooth grime gradient and no
  noise (cells cover whole faces, any noise would smear).
- *rects* are graphics mapped 1:1 onto one face (display, stickers, crests).

Three maps per atlas, matching Unity URP/Lit: BaseColor (sRGB), MaskMap
(R metallic, G occlusion, B unused, A smoothness; linear) and Emission (sRGB).
Rows are stored bottom-up like Blender images: row 0 = v 0.
"""
import numpy as np

SIZE = 1024
PPM = 128  # default texel density of strips, px per metre (STYLE-KIT.md)


# ── noise ───────────────────────────────────────────────────────────────────

def value_noise(w, h, cx, cy, rng):
    """Smooth value noise, tileable in x (cx cells across the width)."""
    g = rng.random((cy + 1, cx))
    xs = np.arange(w) / w * cx
    ys = np.arange(h) / h * cy
    x0 = np.floor(xs).astype(int); fx = xs - x0; x1 = (x0 + 1) % cx; x0 %= cx
    y0 = np.floor(ys).astype(int); fy = ys - y0; y1 = np.minimum(y0 + 1, cy)
    fx = fx * fx * (3 - 2 * fx); fy = (fy * fy * (3 - 2 * fy))[:, None]
    top = g[y0][:, x0] * (1 - fx) + g[y0][:, x1] * fx
    bot = g[y1][:, x0] * (1 - fx) + g[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


def fbm(w, h, cx, cy, rng, octaves=4):
    out = np.zeros((h, w)); amp = 1.0; tot = 0.0
    for _ in range(octaves):
        out += amp * value_noise(w, h, cx, cy, rng)
        tot += amp; amp *= 0.5; cx *= 2; cy *= 2
    return out / tot


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def vgrad(w, h):
    """0 at the bottom row, 1 at the top row."""
    return np.repeat(np.linspace(0, 1, h)[:, None], w, axis=1)


def srgb(hexstr):
    hexstr = hexstr.lstrip('#')
    return np.array([int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4)])


# ── generators: (w, h, rng) -> dict(rgb, smooth, metal, emit) ───────────────

def _out(rgb, smooth, metal=0.0, emit=None):
    return dict(rgb=np.clip(rgb, 0, 1), smooth=smooth, metal=metal, emit=emit)


def grime(w, h, rng, amount=0.18, height=0.25):
    """Darkening towards the bottom (splash, dirt) - the kit's main wear cue."""
    n = value_noise(w, h, 16, 2, rng)
    return 1 - amount * (1 - smoothstep(0, height, vgrad(w, h) + 0.1 * n))



def flat(col, smooth=0.35, metal=0.0, dirt=0.18):
    """Cell: one colour, darker towards the bottom. No noise on purpose."""
    def gen(w, h, rng):
        f = 1 - dirt * (1 - smoothstep(0, 0.3, vgrad(w, h)))
        return _out(srgb(col) * f[..., None], smooth, metal)
    return gen


def emissive(col, smooth=0.5):
    def gen(w, h, rng):
        e = np.ones((h, w, 3)) * srgb(col)
        return _out(e * 0.9, smooth, 0.0, e)
    return gen


def rain_streaks(w, h, rng, amount):
    """Thin, broken vertical runs (a few cm wide, 10-60 cm long) - no smears."""
    cols = value_noise(w, h, w // 3, 1, rng)                       # which columns run
    length = value_noise(w, h, w // 24, max(2, h // 40), rng)      # where runs start/stop
    breakup = value_noise(w, h, w // 6, max(2, h // 12), rng)
    m = smoothstep(0.72, 0.85, cols) * smoothstep(0.45, 0.65, length) * (0.6 + 0.4 * breakup)
    return 1 - amount * m


def stone(col='#808183', moss=0.0, dirt=0.22):
    """Granite: cool grey, visible salt-and-pepper grain, soft blotches,
    short rain runs, optional moss patches (spread evenly over V)."""
    def gen(w, h, rng):
        c = srgb(col)
        blot = fbm(w, h, w // 32, max(2, h // 32), rng, 4)
        f = 0.78 + 0.4 * blot
        speck = rng.random((h, w))
        f = np.where(speck > 0.93, f * 0.62, f)          # dark mica/hornblende grains
        f = np.where(speck < 0.05, f * 1.15, f)          # light feldspar grains
        f *= rain_streaks(w, h, rng, 0.12)
        f *= grime(w, h, rng, dirt, 0.35)
        rgb = c * f[..., None]
        sm = 0.2 + 0.1 * blot
        if moss:
            m = fbm(w, h, w // 24, max(2, h // 24), rng, 4)
            m = smoothstep(0.62 - 0.25 * moss, 0.70 - 0.25 * moss, m)
            mc = srgb('#4d5a2c') * (0.7 + 0.45 * fbm(w, h, w // 8, max(2, h // 8), rng, 2))[..., None]
            rgb = rgb * (1 - m[..., None]) + mc * m[..., None]
            sm = sm * (1 - m) + 0.08 * m
        return _out(rgb, sm)
    return gen


def plaster(col='#e2dccf', dirt=0.25, streak=0.10, smooth=0.25):
    """Lime plaster (shikkui): faint trowel mottling, thin rain runs, grime at the foot."""
    def gen(w, h, rng):
        c = srgb(col)
        n = fbm(w, h, w // 48, max(2, h // 48), rng, 4)
        f = (0.95 + 0.08 * n) * rain_streaks(w, h, rng, streak) * grime(w, h, rng, dirt, 0.2)
        return _out(c * f[..., None], smooth + 0.05 * n)
    return gen

def namako(tile='#2f343b', joint='#ddd9cf', period_px=64, joint_px=6.5):
    """Namako-kabe: square tiles laid diagonally, raised white plaster joints.
    period_px must divide the atlas width so the strip tiles in U."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        a = np.mod(x + y, period_px); b = np.mod(x - y, period_px)
        d = np.minimum(np.minimum(a, period_px - a), np.minimum(b, period_px - b))
        j = smoothstep(joint_px + 1.0, joint_px - 1.0, d)
        bump = np.cos(np.clip(d / joint_px, 0, 1) * np.pi / 2)  # rounded joint profile
        ti = np.floor((x + y) / period_px) * 31 + np.floor((x - y) / period_px) * 17
        tv = (np.sin(ti * 12.9898) * 43758.5453) % 1.0  # per-tile shade
        tilecol = srgb(tile) * (0.85 + 0.25 * tv + 0.1 * fbm(w, h, 32, 8, rng, 3))[..., None]
        jcol = srgb(joint) * (0.8 + 0.2 * bump)[..., None]
        rgb = tilecol * (1 - j[..., None]) + jcol * j[..., None]
        rgb *= grime(w, h, rng, 0.25, 0.3)[..., None]
        return _out(rgb, 0.55 * (1 - j) + 0.25 * j)  # glazed tiles, matt joints
    return gen


def wood(col='#3a281c', smooth=0.3):
    """Grain runs along U; rotate UVs for vertical members."""
    def gen(w, h, rng):
        c = srgb(col)
        g = value_noise(w, h, 6, max(8, h // 3), rng)
        g2 = value_noise(w, h, 24, max(8, h // 2), rng)
        f = 0.8 + 0.25 * g + 0.12 * g2
        knots = smoothstep(0.93, 0.98, value_noise(w, h, 40, 6, rng))
        f *= 1 - 0.3 * knots
        return _out(c * f[..., None], smooth)
    return gen




def vending_display(seed=7, cols=8):
    """Front window of a drink machine: 3 shelves x 8 dummy drinks, price tags
    and buttons under each. Lit from behind, so most of it also emits."""
    pal = ['#c8102e', '#1d4fa1', '#f2f2f2', '#e8a317', '#2a8c4a', '#5b3a29',
           '#d94f8c', '#111111', '#3fa9d6', '#f5e050', '#7a1f2b', '#ffffff']

    def gen(w, h, rng):
        r = np.random.default_rng(seed)
        rgb = np.ones((h, w, 3)) * srgb('#f4f1ea')
        emit = np.ones((h, w, 3)) * srgb('#fff4e0') * 0.3
        y, x = np.mgrid[0:h, 0:w]
        rows = 3
        rh = h / rows; cw = w / cols
        for ri in range(rows):
            base = ri * rh
            # price strip + buttons at the bottom of each shelf
            strip = (y >= base + rh * 0.04) & (y < base + rh * 0.2)
            rgb[strip] = srgb('#2b2b2e'); emit[strip] = 0
            for ci in range(cols):
                cx = (ci + 0.5) * cw
                btn = (np.abs(x - cx) < cw * 0.16) & (np.abs(y - (base + rh * 0.12)) < rh * 0.045)
                lit = r.random() < 0.8
                rgb[btn] = srgb('#46c8ff' if lit else '#ff4a3d'); emit[btn] = rgb[btn] * 0.8
                tag = (np.abs(x - cx) < cw * 0.3) & (y >= base + rh * 0.165) & (y < base + rh * 0.19)
                rgb[tag] = 0.95; emit[tag] = 0.25
                # drink: can (short, square shoulders) or bottle (tall, neck)
                col = srgb(pal[r.integers(len(pal))]); col2 = srgb(pal[r.integers(len(pal))])
                bottle = r.random() < 0.55
                bw = cw * (0.30 if bottle else 0.34)
                top = base + rh * (0.86 if bottle else 0.68)
                body = (np.abs(x - cx) < bw) & (y >= base + rh * 0.24) & (y < top)
                if bottle:
                    shoulder = (y >= top - rh * 0.12) & (np.abs(x - cx) < bw * (1 - (y - (top - rh * 0.12)) / (rh * 0.12) * 0.6))
                    body = body & ((y < top - rh * 0.12) | shoulder)
                    neck = (np.abs(x - cx) < bw * 0.32) & (y >= top - rh * 0.02) & (y < top + rh * 0.06)
                    rgb[neck] = srgb('#e8e8e8'); emit[neck] = 0.1
                rgb[body] = col
                lab = body & (y > base + rh * 0.38) & (y < base + rh * 0.52)
                rgb[lab] = col2
                hl = body & (x > cx - bw * 0.7) & (x < cx - bw * 0.45)  # specular stripe
                rgb[hl] = np.minimum(rgb[hl] + 0.35, 1)
                emit[body] = rgb[body] * 0.12
            # shelf edge
            edge = (y >= base) & (y < base + rh * 0.04)
            rgb[edge] = srgb('#9a9a9a'); emit[edge] = 0.2
        return _out(rgb, 0.6, 0.0, emit)
    return gen


def control_panel():
    """Coin slot, bill slot, change LEDs - the right column of a drink machine."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        rgb = np.ones((h, w, 3)) * srgb('#d8d8d6')
        emit = np.zeros((h, w, 3))
        def rect(cx, cy, hw, hh, col, e=0.0):
            m = (np.abs(x - cx * w) < hw * w) & (np.abs(y - cy * h) < hh * h)
            rgb[m] = srgb(col); emit[m] = srgb(col) * e
        rect(0.5, 0.86, 0.38, 0.07, '#141414')              # LED price display
        rect(0.5, 0.86, 0.30, 0.04, '#ff3b1f', 1.5)
        rect(0.5, 0.68, 0.36, 0.09, '#3a3a3c')              # coin plate
        rect(0.5, 0.68, 0.04, 0.06, '#0a0a0a')              # coin slot
        rect(0.5, 0.48, 0.40, 0.07, '#3a3a3c')              # bill plate
        rect(0.5, 0.48, 0.30, 0.012, '#050505')             # bill slot
        rect(0.5, 0.32, 0.14, 0.04, '#8a8a8a')              # return lever
        rect(0.5, 0.14, 0.30, 0.07, '#141414')              # change cup
        rect(0.5, 0.05, 0.36, 0.015, '#3fd1ff', 1.2)        # IC card reader glow
        return _out(rgb, 0.45, 0.0, emit)
    return gen


def _canvas(w, h, bg):
    y, x = np.mgrid[0:h, 0:w].astype(float)
    return x / w, y / h, np.ones((h, w, 3)) * srgb(bg), np.zeros((h, w, 3))


def side_ad():
    """Side wrap of a drink machine: gradient, big bottle, wave band, 'copy' bars."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#0d3b78')
        rgb[:] = (srgb('#0d3b78') * (1 - v[..., None]) + srgb('#2fa8e0') * v[..., None])
        wave = np.abs(v - (0.32 + 0.05 * np.sin(u * 6.3))) < 0.035
        rgb[wave] = srgb('#ffffff')
        bot = (np.abs(u - 0.5) < 0.16) & (v > 0.38) & (v < 0.78)
        neck = (np.abs(u - 0.5) < 0.06) & (v >= 0.78) & (v < 0.88)
        sh = (v >= 0.72) & (v < 0.78) & (np.abs(u - 0.5) < 0.16 - (v - 0.72) / 0.06 * 0.1)
        rgb[bot & ~((v >= 0.72) & ~sh)] = srgb('#e8f4fb')
        rgb[neck] = srgb('#e8f4fb'); rgb[(np.abs(u - 0.5) < 0.07) & (v >= 0.88) & (v < 0.91)] = srgb('#c8102e')
        lab = (np.abs(u - 0.5) < 0.16) & (v > 0.5) & (v < 0.6)
        rgb[lab] = srgb('#c8102e')
        for i, yy in enumerate((0.16, 0.11, 0.07)):
            bar = (u > 0.12) & (u < 0.88 - 0.2 * i) & (np.abs(v - yy) < 0.012)
            rgb[bar] = srgb('#ffffff')
        rgb *= grime(w, h, rng, 0.15, 0.2)[..., None]
        return _out(rgb, 0.55)
    return gen


def sticker(kind):
    """Small labels: caution, recycling, info notice, rating plate."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#f2f2ee')
        if kind == 'caution':
            rgb[:] = srgb('#f5c400')
            tri = (v > 0.18) & (v < 0.82) & (np.abs(u - 0.5) < (0.82 - v) * 0.6)
            rgb[tri] = srgb('#111111')
            inner = (v > 0.28) & (v < 0.7) & (np.abs(u - 0.5) < (0.7 - v) * 0.45)
            rgb[inner] = srgb('#f5c400')
            rgb[(np.abs(u - 0.5) < 0.03) & (v > 0.36) & (v < 0.58)] = srgb('#111111')
        elif kind == 'recycle':
            rgb[:] = srgb('#1f7a3a')
            r = np.hypot(u - 0.5, v - 0.5)
            rgb[(r > 0.22) & (r < 0.32)] = srgb('#ffffff')
            rgb[(np.abs(u - 0.5) < 0.06) & (v > 0.6) & (v < 0.86)] = srgb('#1f7a3a')
        elif kind == 'notice':
            rgb[:] = srgb('#ffffff')
            rgb[v > 0.8] = srgb('#c8102e')
            for i in range(6):
                rgb[(u > 0.1) & (u < 0.9 - 0.1 * (i % 3)) & (np.abs(v - (0.68 - i * 0.1)) < 0.018)] = srgb('#333333')
        else:  # rating plate: brushed aluminium with engraved lines
            rgb[:] = srgb('#b8bbbf') * (0.92 + 0.08 * value_noise(w, h, 4, h, rng))[..., None]
            for i in range(5):
                rgb[(u > 0.1) & (u < 0.9) & (np.abs(v - (0.8 - i * 0.15)) < 0.012)] = srgb('#4a4c50')
            return _out(rgb, 0.55, 0.9)
        return _out(rgb, 0.45)
    return gen


def kamon():
    """Family crest on a plaster disc: ring with three bars (maru ni mitsu-biki)."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#e2dccf')
        r = np.hypot(u - 0.5, v - 0.5)
        ink = (r > 0.36) & (r < 0.44)
        for yy in (0.36, 0.5, 0.64):
            ink |= (np.abs(v - yy) < 0.045) & (r < 0.36)
        rgb[ink] = srgb('#1a1a1c')
        return _out(rgb, 0.3)
    return gen


def oni():
    """Onigawara face: fired tile grey with a raised crest disc and rim."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#4b525b')
        n = fbm(w, h, 8, 8, rng, 3)
        rgb *= (0.85 + 0.25 * n)[..., None]
        r = np.hypot(u - 0.5, (v - 0.42) * 1.1)
        rgb[(r > 0.17) & (r < 0.22)] = srgb('#6b737d')
        rgb[r < 0.1] = srgb('#6b737d')
        rgb[(u < 0.06) | (u > 0.94) | (v < 0.06)] *= 0.75
        return _out(rgb, 0.4)
    return gen




def kamon_b():
    """Second (fictional) crest: three-leaf ring (mitsu-domoe style) on plaster."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#e2dccf')
        x, y = u - 0.5, v - 0.5
        r = np.hypot(x, y); a = np.arctan2(y, x)
        ink = (r > 0.38) & (r < 0.44)
        for k in range(3):
            ak = a - k * 2 * np.pi / 3 + 4 * r
            ink |= (np.cos(ak) > 0.55) & (r < 0.32) & (r > 0.06)
        rgb[ink] = srgb('#1a1a1c')
        return _out(rgb, 0.3)
    return gen


def shoji(lit=True):
    """Shoji paper screen: thin wooden grid (kumiko) over paper, glowing warm
    when lit from inside."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#efe4c8' if lit else '#b9b09c')
        gx = np.mod(u * 3, 1.0); gy = np.mod(v * 4, 1.0)
        bar = (np.minimum(gx, 1 - gx) < 0.045) | (np.minimum(gy, 1 - gy) < 0.035)
        rgb[bar] = srgb('#4a3424')
        e = None
        if lit:
            e = rgb * 0.9
            e[bar] = 0
        return _out(rgb, 0.2, 0.0, e)
    return gen


def curtain(lit=True):
    """Aluminium window seen from outside: lace curtain behind glass, lit
    warm from inside or dusky; the glazing bar in the middle."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#e6d6b4' if lit else '#4a5056')
        folds = 0.85 + 0.15 * np.sin(u * 40 + 2 * np.sin(v * 5))
        rgb *= folds[..., None]
        if not lit:   # dark glass with a sky reflection band at the top
            rgb = rgb * (1 - 0.4 * smoothstep(0.6, 1.0, v))[..., None] + srgb('#8a9aa8') * (0.4 * smoothstep(0.6, 1.0, v))[..., None]
        bar = np.abs(u - 0.5) < 0.03
        rgb[bar] = srgb('#b4b7b8')
        e = None
        if lit:
            e = rgb * 0.85
            e[bar] = 0
        return _out(rgb, 0.8 if not lit else 0.3, 0.0, e)
    return gen


def png(name, smooth=0.45, emit=0.0, bg='#808080'):
    """Graphic rendered by kit/graphics.mjs (signs need real fonts)."""
    def gen(w, h, rng):
        import bpy, os
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gfx', name + '.png')
        img = bpy.data.images.load(path, check_existing=False)
        try:
            assert tuple(img.size) == (w, h), f'{name}: png {tuple(img.size)} != region {(w, h)}'
            a = np.array(img.pixels[:], np.float32).reshape(h, w, 4)
        finally:
            bpy.data.images.remove(img)
        rgb = a[..., :3] * a[..., 3:4] + srgb(bg) * (1 - a[..., 3:4])
        return _out(rgb, smooth, 0.0, rgb * emit if emit else None)
    return gen


def concrete_pole(col='#a9a8a2'):
    """Spun-concrete pole, used rotated: U runs up the pole, so streaks run along U."""
    def gen(w, h, rng):
        c = srgb(col)
        n = fbm(w, h, w // 64, max(2, h // 32), rng, 4)
        streak = value_noise(w, h, max(4, w // 96), h // 3, rng)          # long along U
        f = (0.88 + 0.18 * n) * (1 - 0.12 * smoothstep(0.55, 0.85, streak))
        pores = rng.random((h, w))
        f = np.where(pores > 0.985, f * 0.7, f)
        return _out(c * f[..., None], 0.3 + 0.05 * n)
    return gen


def galvanized(col='#a3a7ab'):
    """Hot-dip galvanised steel: faint spangle blotches, dull metal."""
    def gen(w, h, rng):
        n = value_noise(w, h, w // 6, max(2, h // 6), rng)
        n2 = fbm(w, h, w // 64, max(2, h // 32), rng, 3)
        f = 0.9 + 0.1 * np.round(n * 3) / 3 + 0.06 * (n2 - 0.5)
        return _out(srgb(col) * f[..., None], 0.45 + 0.1 * n2, 0.9)
    return gen


def _voronoi(w, h, ppm, pts, aspect=1.0, warp=None):
    """Nearest / second-nearest distance (metres) and nearest index for each
    pixel; pts (N, 2) in metres, wrapped in x so the strip tiles. warp =
    (dx, dy) arrays in metres bend the cell borders (round stones)."""
    W = w / ppm
    X = (np.arange(w)[None, :] + 0.5) / ppm + np.zeros((h, 1))
    Y = (np.arange(h)[:, None] + 0.5) / ppm + np.zeros((1, w))
    if warp is not None:
        X = X + warp[0]; Y = Y + warp[1]
    d1 = np.full((h, w), 9.0); d2 = np.full((h, w), 9.0); idx = np.zeros((h, w), int)
    for i, (px, py) in enumerate(pts):
        for off in (-W, 0.0, W):
            d = np.sqrt(((X - px - off) * aspect) ** 2 + (Y - py) ** 2)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            idx = np.where(closer, i, idx)
            d1 = np.where(closer, d, d1)
    return d1, d2, idx, Y


def ishigaki(col='#84817b', stone_m=(0.42, 0.28), ppm=96):
    """Japanese dry rubble wall (nozura / ran-zumi ishigaki): irregular,
    rounded, slightly flat-lying stones, each with its own tone, lit from
    above with a shadow under it; deep dark joints with small wedge stones
    (kai-ishi); moss only in patches, black weathering runs."""
    def gen(w, h, rng):
        W, H = w / ppm, h / ppm
        nx = max(1, round(W / stone_m[0])); sx = W / nx; sz = stone_m[1]
        pts = []
        for j in range(-1, int(H / sz) + 2):
            for i in range(nx):
                if rng.random() < 0.15:   # a missing seed = one bigger stone
                    continue
                pts.append(((i + 0.5 * (j % 2) + 0.35 * (rng.random() - 0.5)) * sx % W,
                            (j + 0.5 + 0.4 * (rng.random() - 0.5)) * sz))
                if rng.random() < 0.3:    # kai-ishi: small wedge stone in a joint
                    pts.append(((i + 0.5 * (j % 2) + 0.5) * sx % W, (j + 1.0) * sz + 0.04 * rng.random()))
        pts = np.array(pts)
        warp = ((value_noise(w, h, int(W / 0.12), max(2, int(H / 0.12)), rng) - 0.5) * 0.09,
                (value_noise(w, h, int(W / 0.12), max(2, int(H / 0.12)), rng) - 0.5) * 0.07)
        d1, d2, idx, Y = _voronoi(w, h, ppm, pts, aspect=0.8, warp=warp)
        edge = d2 - d1                                   # ~2x distance to the joint
        n = len(pts)
        tone = 0.7 + 0.38 * rng.random(n)
        hue = rng.random(n)
        c = srgb(col)[None, :]
        warm, cool = srgb('#857766')[None, :], srgb('#757b81')[None, :]
        base = c + 0.8 * np.where(hue[:, None] < 0.35, warm - c, np.where(hue[:, None] > 0.75, cool - c, 0.0))
        rgb = base[idx] * tone[idx][..., None]
        dome = smoothstep(0.0, 0.15, edge)
        # light from above: upper part of each stone brighter, underside in shadow
        rel = np.clip((Y - pts[idx, 1]) / (sz * 0.6), -1, 1)
        lit = 0.78 + 0.22 * rel * (1 - dome * 0.5) + 0.12 * dome
        grain = fbm(w, h, w // 10, max(2, h // 10), rng, 3)
        speck = rng.random((h, w))
        f = lit * (0.86 + 0.26 * grain)
        f = np.where(speck > 0.95, f * 0.72, f)
        rgb = rgb * f[..., None]
        joint = smoothstep(0.032, 0.008, edge)
        jcol = srgb('#262420') * (0.7 + 0.5 * grain)[..., None]
        rgb = rgb * (1 - joint[..., None]) + jcol * joint[..., None]
        # moss in patches (not a green grid), hugging joints a little
        mz = fbm(w, h, w // 48, max(2, h // 48), rng, 4)
        moss = smoothstep(0.70, 0.73, mz + 0.1 * (1 - vgrad(w, h)) + 0.1 * smoothstep(0.06, 0.0, edge)
                          + 0.12 * (grain - 0.5))
        mc = srgb('#4a5529') * (0.7 + 0.45 * grain)[..., None]
        rgb = rgb * (1 - moss[..., None] * 0.85) + mc * moss[..., None] * 0.85
        # dark weathering runs below the stones
        runs = 1 - 0.3 * smoothstep(0.7, 0.9, value_noise(w, h, w // 4, 2, rng)) * smoothstep(0.4, 0.7, value_noise(w, h, w // 30, max(2, h // 30), rng))
        rgb *= (runs * grime(w, h, rng, 0.25, 0.2))[..., None]
        return _out(rgb, 0.1 + 0.12 * dome * (1 - moss))
    return gen


def rock(col='#7f7e7a', moss=0.0, lichen=0.25):
    """Weathered granite boulder: big soft blotches, grain, pale lichen
    spots, dark weathering in cracks; optional moss cover."""
    def gen(w, h, rng):
        c = srgb(col)
        big = fbm(w, h, w // 96, max(2, h // 96), rng, 4)
        mid = fbm(w, h, w // 24, max(2, h // 24), rng, 3)
        f = 0.7 + 0.45 * big + 0.15 * (mid - 0.5)
        speck = rng.random((h, w))
        f = np.where(speck > 0.94, f * 0.65, f)
        f = np.where(speck < 0.04, f * 1.18, f)
        pits = smoothstep(0.8, 0.9, value_noise(w, h, w // 6, max(2, h // 6), rng))   # small dark pits
        f *= 1 - 0.25 * pits
        rgb = c * f[..., None]
        lc = smoothstep(0.72, 0.78, value_noise(w, h, w // 6, max(2, h // 6), rng)) * lichen
        rgb = rgb * (1 - lc[..., None]) + srgb('#b9b7a2') * lc[..., None]
        rgb *= rain_streaks(w, h, rng, 0.12)[..., None]
        sm = 0.18 + 0.1 * big
        if moss:
            m = smoothstep(0.55 - 0.3 * moss, 0.62 - 0.3 * moss, fbm(w, h, w // 32, max(2, h // 32), rng, 4))
            fine = value_noise(w, h, w // 3, max(2, h // 3), rng)
            mc = srgb('#434f29') * (0.6 + 0.35 * mid + 0.3 * fine)[..., None]
            rgb = rgb * (1 - m[..., None]) + mc * m[..., None]
            sm = sm * (1 - m) + 0.06 * m
        return _out(rgb, sm)
    return gen


def leaves(col='#3c5a2a', bloom=None, leaf_m=0.035, ppm=128):
    """Dense shrub foliage (boxwood, azalea): many small leaves, each lit on
    its upper side, dark gaps between; bloom = (colour, share): that share of
    the leaves, in clusters, are blossoms instead."""
    def gen(w, h, rng):
        W, H = w / ppm, h / ppm
        n = int(W * H / (leaf_m * leaf_m * 0.75))
        pts = rng.random((n, 2)) * (W, H)
        cl = fbm(w, h, w // 40, max(2, h // 40), rng, 3)
        rgb = np.zeros((h, w, 3)) + srgb(col)[None, None, :] * (0.3 + 0.25 * cl)[..., None]
        smooth = np.zeros((h, w))
        r_px = leaf_m * ppm * 0.6
        tone = 0.75 + 0.35 * rng.random(n)
        yy, xx = np.mgrid[-int(r_px) - 1:int(r_px) + 2, -int(r_px) - 1:int(r_px) + 2]
        green = srgb(col)
        for (px, py), t in zip(pts * ppm, tone):
            ix, iy = int(px), int(py)
            d = np.sqrt((xx + ix - px) ** 2 * 0.7 + (yy + iy - py) ** 2) / r_px
            m = d < 1
            ys = (yy + iy)[m]; xs = (xx + ix)[m] % w
            ok = (ys >= 0) & (ys < h)
            ys, xs = ys[ok], xs[ok]
            val = (t * (1.0 - 0.45 * d[m]) + 0.25 * (yy[m] < 0))[ok]   # upper half catches the sky
            k = cl[min(iy, h - 1), ix % w]
            c = green * (0.7 + 0.6 * k)            # clumps: lit and shaded masses
            if bloom and rng.random() < bloom[1] * (0.4 + 1.2 * smoothstep(0.4, 0.6, k)):
                c = srgb(bloom[0]) * 1.1
            rgb[ys, xs] = c * val[:, None]
            smooth[ys, xs] = 0.3
        return _out(rgb, smooth)
    return gen


def soil(col='#3a2d22'):
    def gen(w, h, rng):
        n = fbm(w, h, w // 16, max(2, h // 16), rng, 4)
        speck = rng.random((h, w))
        f = 0.75 + 0.45 * n
        rgb = srgb(col) * f[..., None]
        peb = speck > 0.985
        rgb[peb] = srgb('#8a8278') * (0.8 + 0.3 * n[peb])[..., None]
        return _out(rgb, 0.1 + 0.1 * n)
    return gen


def bamboo(col='#a48d5e', node_m=0.4, ppm=128):
    """Split, aged bamboo: fibres along U, darker node rings every node_m (U)."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        fib = value_noise(w, h, max(4, w // 64), h // 2, rng)
        d = np.abs(((x / ppm) % node_m) - node_m / 2)
        node = smoothstep(0.012, 0.004, np.abs(d - node_m / 2))
        f = (0.85 + 0.25 * fib) * (1 - 0.18 * node)
        return _out(srgb(col) * f[..., None], 0.4 + 0.15 * fib)
    return gen


def facade_tile(col='#b9a78c', tile_m=(0.227, 0.06), joint_m=0.009, joint='#cfc8bb', var=0.16, ppm=96):
    """Japanese facade tiles (nichō-gake 227 x 60 mm, or 45-mosaic): running
    bond, each tile its own kiln shade, light mortar joints, thin rain runs
    and grime at the foot. The tile count is rounded so the strip tiles in U."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        nx = max(1, round(w / ((tile_m[0] + joint_m) * ppm)))
        pw = w / nx; ph = (tile_m[1] + joint_m) * ppm
        row = np.floor(y / ph)
        xs = x + (row % 2) * pw / 2
        col_i = np.floor(xs / pw) % nx
        fx = np.mod(xs, pw); fy = np.mod(y, ph)
        jp = joint_m * ppm
        j = np.maximum(smoothstep(jp * 0.9, jp * 0.4, fx), smoothstep(jp * 0.9, jp * 0.4, fy))
        tid = row * 131 + col_i * 17
        tv = (np.sin(tid * 12.9898) * 43758.5453) % 1.0
        tv2 = (np.sin(tid * 4.1414) * 23421.631) % 1.0
        c = srgb(col)
        tilecol = c * (1 - var + 2 * var * tv)[..., None]
        tilecol = tilecol * (1 + 0.06 * (tv2 - 0.5))[..., None] * np.array([1.0, 0.99, 0.97])
        tilecol *= (0.94 + 0.1 * fbm(w, h, w // 32, max(2, h // 32), rng, 3))[..., None]
        rgb = tilecol * (1 - j[..., None]) + srgb(joint) * j[..., None]
        rgb *= (rain_streaks(w, h, rng, 0.1) * grime(w, h, rng, 0.2, 0.18))[..., None]
        return _out(rgb, 0.45 * (1 - j) + 0.15 * j)
    return gen


def alc(col='#d9d8d2', panel_m=0.6, ppm=96):
    """Painted ALC panels (white-grey apartment and side walls): vertical
    joints every 60 cm, soft trowel noise, black rain runs - the grimy white
    walls of Tokyo back streets."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        n = max(1, round(w / (panel_m * ppm))); pw = w / n
        fx = np.mod(x, pw)
        j = smoothstep(2.2, 0.6, np.minimum(fx, pw - fx))
        nz = fbm(w, h, w // 24, max(2, h // 24), rng, 4)
        f = (0.93 + 0.1 * nz) * (1 - 0.35 * j)
        f *= rain_streaks(w, h, rng, 0.13) * grime(w, h, rng, 0.2, 0.2)
        return _out(srgb(col) * f[..., None], 0.3)
    return gen



def wood_board(col='#3b2a1e', board_m=0.2, ppm=64):
    """Lapped weatherboard (shitami-itabari) of town houses: horizontal
    boards, each its own shade, dark shadow line under each lap, grain
    along U, grime at the foot. Board count rounded so the strip tiles in V."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        bh = board_m * ppm
        row = np.floor(y / bh)
        fy = np.mod(y, bh) / bh
        tv = (np.sin(row * 12.9898 + 3.1) * 43758.5453) % 1.0
        g = value_noise(w, h, 8, max(8, int(h / 2)), rng)
        f = (0.82 + 0.22 * tv) * (0.85 + 0.25 * g)
        f *= 1 - 0.55 * smoothstep(0.16, 0.0, fy)          # shadow under the lap above
        f *= 1 + 0.12 * smoothstep(0.75, 1.0, fy)          # lit lower edge of the board
        f *= rain_streaks(w, h, rng, 0.08) * grime(w, h, rng, 0.22, 0.2)
        return _out(srgb(col) * f[..., None], 0.25)
    return gen


def copper(col='#5f8f7a', plate_m=(0.24, 0.15), ppm=64):
    """Patinated copper facade (dōban, kanban-kenchiku): plates in running
    bond with folded seams, green patina with brown copper showing through
    and dark runs under the seams."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        nx = max(1, round(w / (plate_m[0] * ppm)))
        pw = w / nx; ph = plate_m[1] * ppm
        row = np.floor(y / ph)
        xs = x + (row % 2) * pw / 2
        fx = np.mod(xs, pw); fy = np.mod(y, ph)
        seam = np.maximum(smoothstep(1.6, 0.3, np.minimum(fx, pw - fx)), smoothstep(1.6, 0.3, fy))
        pid = row * 37 + np.floor(xs / pw) % nx * 11
        tv = (np.sin(pid * 12.9898) * 43758.5453) % 1.0
        pat = fbm(w, h, w // 24, max(2, h // 24), rng, 4)
        brown = 0.55 * smoothstep(0.7, 0.8, pat)          # a little bare copper, not rust blotches
        rgb = srgb(col) * (0.9 + 0.14 * tv)[..., None] * (0.92 + 0.12 * fbm(w, h, w // 8, max(2, h // 8), rng, 3))[..., None]
        rgb = rgb * (1 - brown[..., None]) + srgb('#7a5236') * brown[..., None]
        rgb *= (1 - 0.45 * seam)[..., None]
        rgb *= (rain_streaks(w, h, rng, 0.15) * grime(w, h, rng, 0.15, 0.2))[..., None]
        return _out(rgb, 0.3 + 0.15 * brown, 0.25 * brown)
    return gen


def tate_ita(col='#4a3727', board_m=0.24, ppm=64):
    """Vertical board wall (tate-ita-bari) of the Kiso post towns: boards side
    by side along U, grain running up, dark joints, each board its own shade,
    silvery weathering in patches, rain runs and a splashed dark foot.
    Board count rounded so the strip tiles in U."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        nb = max(3, round(w / (board_m * ppm))); bw = w / nb
        i = np.floor(x / bw); fx = np.mod(x, bw) / bw
        tv = (np.sin(i * 12.9898 + 1.7) * 43758.5453) % 1.0
        grain = value_noise(w, h, max(8, w // 3), 3, rng)          # fine across, long up the board
        knots = smoothstep(0.94, 0.985, value_noise(w, h, w // 6, max(2, h // 10), rng))
        f = (0.8 + 0.25 * tv) * (0.84 + 0.26 * grain) * (1 - 0.35 * knots)
        f *= 1 - 0.6 * np.maximum(smoothstep(0.05, 0.0, fx), smoothstep(0.95, 1.0, fx))
        rgb = srgb(col) * f[..., None]
        weather = smoothstep(0.6, 0.85, fbm(w, h, w // 32, max(2, h // 32), rng, 4) + 0.12 * vgrad(w, h))
        rgb = rgb * (1 - 0.28 * weather[..., None]) + srgb('#6e675f') * (f * 0.28 * weather)[..., None]
        rgb *= (rain_streaks(w, h, rng, 0.12) * grime(w, h, rng, 0.3, 0.18))[..., None]
        return _out(rgb, 0.18 + 0.1 * tv)
    return gen


def shingle(col='#5f5a52', row_m=0.1, board_w=0.11, ppm=96):
    """Board shingles (kureita) of the stone-weighted roofs: thin split boards
    in rows along U, each row shading the one below, joints staggered per
    row, silver-grey with brown showing through, moss specks. V runs up the slope."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        rh = row_m * ppm
        row = np.floor(y / rh); fy = np.mod(y, rh) / rh
        nbx = max(1, round(w / (board_w * ppm))); bw = w / nbx
        shift = (np.sin(row * 78.233) * 43758.5453) % 1.0
        xs = x + shift * bw
        cell = np.floor(xs / bw) % nbx; fx = np.mod(xs, bw) / bw
        tv = (np.sin(cell * 12.9898 + row * 4.1414) * 43758.5453) % 1.0
        grain = value_noise(w, h, w // 2, max(2, h // 4), rng)
        f = (0.76 + 0.32 * tv) * (0.85 + 0.22 * grain)
        f *= 1 - 0.55 * smoothstep(0.2, 0.0, fy)
        f *= 1 - 0.5 * np.maximum(smoothstep(0.07, 0.0, fx), smoothstep(0.93, 1.0, fx))
        rgb = srgb(col) * f[..., None]
        brown = smoothstep(0.6, 0.85, fbm(w, h, w // 40, max(2, h // 20), rng, 3))
        rgb = rgb * (1 - 0.5 * brown[..., None]) + srgb('#6a4a32') * (f * 0.5 * brown)[..., None]
        moss = smoothstep(0.72, 0.78, fbm(w, h, w // 24, max(2, h // 12), rng, 4))
        rgb = rgb * (1 - 0.7 * moss[..., None]) + srgb('#4d5a2c') * (0.7 * moss)[..., None]
        return _out(rgb, 0.15)
    return gen


def road_earth(col='#7c7265'):
    """Packed earth and fine gravel of the post-town street: mottled, small
    light and dark grit, no tyre tracks (any direction must work)."""
    def gen(w, h, rng):
        n = fbm(w, h, w // 16, max(2, h // 16), rng, 5)
        speck = rng.random((h, w))
        f = 0.85 + 0.28 * n
        f = np.where(speck > 0.93, f * 1.25, np.where(speck < 0.05, f * 0.7, f))
        return _out(srgb(col) * f[..., None], 0.12 + 0.1 * n)
    return gen


def paving(col='#7d7a74', ppm=64, row_m=(0.3, 0.55), len_m=(0.35, 0.8)):
    """Stone paving of the slopes (ishidatami): rows of irregular slabs, each
    its own tone, worn rounded edges, dark joints with moss. Tiles in U."""
    def gen(w, h, rng):
        W = w / ppm
        X = (np.arange(w) + 0.5) / ppm
        tone = np.ones((h, w)); dj = np.ones((h, w))
        y = 0.0
        while y * ppm < h:
            rh = rng.uniform(*row_m)
            a, b = int(y * ppm), min(h, int((y + rh) * ppm))
            xs = [rng.uniform(0, 0.3)]
            while xs[-1] < W - len_m[0] - 0.1:
                xs.append(xs[-1] + rng.uniform(*len_m))
            xs = np.array(xs)
            k = np.searchsorted(xs, X) % len(xs)
            dx = np.min(np.abs(((X[None, :] - xs[:, None]) + W / 2) % W - W / 2), axis=0)
            tv = 0.78 + 0.34 * rng.random(len(xs))
            Y = (np.arange(a, b) + 0.5) / ppm
            dy = np.minimum(Y - y, y + rh - Y)
            tone[a:b] = tv[k][None, :]
            dj[a:b] = np.minimum(dx[None, :], dy[:, None])
            y += rh
        grain = fbm(w, h, w // 8, max(2, h // 8), rng, 3)
        f = tone * (0.86 + 0.24 * grain) * (0.82 + 0.18 * smoothstep(0.0, 0.05, dj))
        rgb = srgb(col) * f[..., None]
        joint = smoothstep(0.022, 0.006, dj)
        moss = smoothstep(0.55, 0.7, fbm(w, h, w // 32, max(2, h // 32), rng, 3)) * joint
        jcol = srgb('#2a2824') * (1 - moss[..., None]) + srgb('#3e4a24') * moss[..., None]
        rgb = rgb * (1 - joint[..., None]) + jcol * joint[..., None]
        return _out(rgb, 0.15 + 0.1 * (1 - joint))
    return gen


def koshi_tex(lit=True):
    """Lattice in front of shoji as one picture (LOD1 of the Kiso lattices)."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#efe4c8' if lit else '#9c937f')
        dark = (np.mod(u * 22, 1.0) < 0.5) | (v < 0.06) | (v > 0.94)
        rgb[dark] = srgb('#33261c')
        e = None
        if lit:
            e = rgb * 0.8
            e[dark] = 0
        return _out(rgb, 0.25, 0.0, e)
    return gen


def pnoise(w, h, cx, cy, rng):
    """Value noise tileable in both x and y (cx, cy cells): thatch courses
    are mapped band by band, the seams between bands must not show."""
    cx, cy = max(1, int(cx)), max(1, int(cy))
    g = rng.random((cy, cx))
    xs = np.arange(w) / w * cx
    ys = np.arange(h) / h * cy
    x0 = np.floor(xs).astype(int); fx = xs - x0; x1 = (x0 + 1) % cx; x0 %= cx
    y0 = np.floor(ys).astype(int); fy = ys - y0; y1 = (y0 + 1) % cy; y0 %= cy
    fx = fx * fx * (3 - 2 * fx); fy = (fy * fy * (3 - 2 * fy))[:, None]
    top = g[y0][:, x0] * (1 - fx) + g[y0][:, x1] * fx
    bot = g[y1][:, x0] * (1 - fx) + g[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


def kaya(col='#7d6a4f', moss=0.0, ppm=48, course=True):
    """Thatch (kaya, Miscanthus) of the gassho roofs, seen on the slope: a
    fuzzy mass of short stems leaning down the slope (along V), light stem
    ends as speckle, soft bundles, a faint shadow line under each course,
    weathered grey with brown showing through, optional moss patches.
    Tiles in U and V (courses of 2 m)."""
    def gen(w, h, rng):
        stems = pnoise(w, h, w / 2, h / 5, rng)               # short fibres (~10 cm) along V
        fuzz = pnoise(w, h, w / 1.2, h / 1.5, rng)            # fibre-scale noise, isotropic
        clumps = pnoise(w, h, w / 8, h / 12, rng)             # bundles
        blot = 0.6 * pnoise(w, h, w / 48, 2, rng) + 0.4 * pnoise(w, h, w / 20, 4, rng)
        f = (0.8 + 0.16 * stems + 0.14 * fuzz) * (0.9 + 0.14 * clumps) * (0.9 + 0.16 * blot)
        speck = rng.random((h, w))
        f = np.where(speck > 0.94, f * 1.18, np.where(speck < 0.06, f * 0.78, f))
        v = vgrad(w, h)
        if course:   # the course above overlaps the top of this one (soft shadow)
            f *= 1 - 0.08 * smoothstep(0.9, 1.0, v) + 0.03 * smoothstep(0.06, 0.0, v)
        rgb = srgb(col) * f[..., None]
        grey = smoothstep(0.45, 0.75, blot)
        rgb = rgb * (1 - 0.3 * grey[..., None]) + srgb('#7e786c') * (f * 0.3 * grey)[..., None]
        sm = 0.1 + 0.04 * fuzz
        if moss:
            m = smoothstep(0.62 - 0.2 * moss, 0.82 - 0.2 * moss, 0.75 * pnoise(w, h, w / 40, 2, rng) + 0.25 * pnoise(w, h, w / 10, 5, rng))
            m = 0.85 * m * (0.7 + 0.3 * fuzz)
            mc = srgb('#4d5a2c') * (0.75 + 0.35 * fuzz)[..., None]
            rgb = rgb * (1 - m[..., None]) + mc * m[..., None]
            sm = sm * (1 - m) + 0.06 * m
        return _out(rgb, sm)
    return gen


def kaya_edge(col='#6e5c42', ppm=48):
    """Cut face of the thatch (eave and verge): stem ends as a dense light
    speckle, darker layers parallel to the roof (lines of constant V every
    ~15 cm), a dark band where the layers press together. Tiles in U."""
    def gen(w, h, rng):
        speck = value_noise(w, h, w, h, rng)
        lay = value_noise(w, h, w // 6, max(2, int(h / ppm / 0.15)), rng)
        f = (0.72 + 0.4 * speck) * (0.8 + 0.3 * lay)
        v = vgrad(w, h) * h / ppm
        f *= 1 - 0.25 * smoothstep(0.35, 0.0, np.abs(np.mod(v, 0.16) - 0.08) / 0.08)
        rgb = srgb(col) * f[..., None]
        rgb = rgb * (1 - 0.35 * smoothstep(0.8, 0.95, speck)[..., None]) + srgb('#b59a6a') * (0.35 * smoothstep(0.8, 0.95, speck))[..., None]
        return _out(rgb, 0.1)
    return gen


def grass(col='#55602f', ppm=48, dry=0.35):
    """Short grass of banks and verges: mottled green, dry straw patches,
    blades as fine speckle, darker damp foot (V = 0). Tiles in U."""
    def gen(w, h, rng):
        n = fbm(w, h, w // 16, max(2, h // 16), rng, 4)
        speck = rng.random((h, w))
        f = 0.78 + 0.35 * n
        f = np.where(speck > 0.9, f * 1.22, np.where(speck < 0.08, f * 0.7, f))
        rgb = srgb(col) * f[..., None]
        d = smoothstep(0.55, 0.75, fbm(w, h, w // 24, max(2, h // 24), rng, 3)) * dry
        rgb = rgb * (1 - d[..., None]) + srgb('#9a8a5a') * (f * d)[..., None]
        rgb *= grime(w, h, rng, 0.15, 0.15)[..., None]
        return _out(rgb, 0.12)
    return gen


def paddy(ppm=48, row_m=0.3, hill_m=0.18):
    """Harvested rice paddy: wet dark mud with puddles, rows of cut rice
    stubble (hills every 18 cm in rows 30 cm apart, along U). Tiles in U and V."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        nx = max(1, round(w / (hill_m * ppm))); ny = max(1, round(h / (row_m * ppm)))
        px, py = w / nx, h / ny
        dx = np.mod(x, px) - px / 2; dy = np.mod(y, py) - py / 2
        hill = smoothstep(2.6, 1.0, np.sqrt(dx * dx + dy * dy * 1.6))
        n = pnoise(w, h, w / 16, h / 16, rng)
        wet = smoothstep(0.6, 0.74, pnoise(w, h, w / 64, max(2, h / 48), rng) + 0.08 * n)
        mud = srgb('#4a4034') * (0.8 + 0.3 * n)[..., None]
        water = srgb('#20272a') * (0.9 + 0.15 * n)[..., None]
        rgb = mud * (1 - wet[..., None]) + water * wet[..., None]
        rgb = rgb * (1 - 0.8 * hill[..., None]) + srgb('#8f7c50') * (0.8 + 0.3 * n)[..., None] * (0.8 * hill[..., None])
        return _out(rgb, 0.3 + 0.4 * wet * (1 - hill))
    return gen


def straw_bundle():
    """One bundle of rice straw hung on a drying rack (LOD-friendly picture):
    stalks as fine vertical lines, the rope tie near the top, golden-brown
    ears hanging at the bottom with a ragged edge."""
    def gen(w, h, rng):
        u, v, rgb, emit = _canvas(w, h, '#c2a66e')
        stalk = value_noise(w, h, w // 2, 2, rng)
        f = 0.78 + 0.3 * stalk
        rgb = rgb * f[..., None]
        ear = v < 0.32 + 0.08 * value_noise(w, h, w // 3, 2, rng)
        rgb[ear] = (srgb('#8f6e3a') * (0.75 + 0.35 * stalk[..., None]))[ear]
        tie = (v > 0.8) & (v < 0.86)
        rgb[tie] = srgb('#6e5a36')
        edge = (u < 0.06) | (u > 0.94)
        rgb[edge] *= 0.7
        return _out(rgb, 0.18)
    return gen



def totan(col='#4f7f8c', rust=0.5, ppm=48, sheet_m=1.8, painted=True):
    """Corrugated iron sheet (namitotan) of the fishing villages, one sheet
    course of 1.8 m from V 0: faded paint (or bare zinc) with rust breaking
    through - most at the foot, along the lap at the top and in runs below
    the nail rows - salt bloom, a darker lap shadow at the top edge. The
    corrugation itself is geometry (or LOD1 flat), the strip tiles in U."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        v = y / (sheet_m * ppm)                          # 0 at the sheet foot, 1 at its top
        fade = fbm(w, h, w // 40, max(2, h // 24), rng, 4)
        rgb = srgb(col) * (0.82 + 0.3 * fade)[..., None]
        if painted:   # chalky faded paint, lighter in patches
            rgb = rgb * (1 - 0.25 * smoothstep(0.55, 0.8, fade))[..., None] + srgb('#c9c7bf') * (0.25 * smoothstep(0.55, 0.8, fade))[..., None]
        # rust: noise biased to the foot and the top lap, plus runs from the nail rows
        rn = fbm(w, h, w // 20, max(2, h // 10), rng, 5)
        bias = 0.32 * smoothstep(0.25, 0.0, v) + 0.1 * smoothstep(0.85, 1.0, v) * value_noise(w, h, w // 20, 1, rng)
        nails = (np.abs(np.mod(x, 0.36 * ppm) - 0.18 * ppm) < 1.2) & ((np.abs(v - 0.06) < 0.012) | (np.abs(v - 0.93) < 0.012))
        runs = smoothstep(0.7, 0.86, value_noise(w, h, w // 3, 1, rng)) * smoothstep(0.5, 0.75, value_noise(w, h, w // 30, max(2, h // 30), rng))
        r = np.clip(smoothstep(0.86 - 0.3 * rust, 0.95 - 0.3 * rust, rn + 1.4 * bias) + 0.8 * rust * runs * smoothstep(1.0, 0.25, v), 0, 1)
        rc = srgb('#6e3a1e') * (0.7 + 0.5 * fbm(w, h, w // 6, max(2, h // 6), rng, 3))[..., None]
        rgb = rgb * (1 - r[..., None]) + rc * r[..., None]
        rgb[nails] = srgb('#3a2a20')
        salt = smoothstep(0.75, 0.9, fbm(w, h, w // 10, max(2, h // 10), rng, 4)) * 0.25
        rgb = rgb * (1 - salt[..., None]) + srgb('#dcdad2') * salt[..., None]
        rgb *= (1 - 0.35 * smoothstep(0.96, 1.0, v))[..., None]       # lap shadow
        rgb *= grime(w, h, rng, 0.15, 0.15)[..., None]
        return _out(rgb, 0.35 * (1 - r) + 0.1, 0.4 * (1 - r) * (0.3 if painted else 1.0))
    return gen


def quay(col='#8f8e88', ppm=48, water_v=0.3, blocks=False):
    """Harbour wall seen from the water, V 0 at 0.6 m below the water line:
    concrete with formwork lifts (or squared granite blocks laid diagonally,
    kenchi-ishi tani-zumi), a dark wet band with green algae and white
    barnacle speckle at the water line, salt-white runs above."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        v = y / h
        n = fbm(w, h, w // 24, max(2, h // 24), rng, 5)
        f = 0.82 + 0.3 * n
        rgb = srgb(col) * f[..., None]
        if blocks:   # squared stones laid diagonally: each its own tone, lit upper edges, shadowed lower edges, soft dark joints
            P = 0.75 * ppm
            a = np.mod(x + y, P); b = np.mod(x - y, P)
            bid = np.floor((x + y) / P) * 31 + np.floor((x - y) / P) * 17
            tv = (np.sin(bid * 12.9898) * 43758.5453) % 1.0
            rgb *= (0.72 + 0.4 * tv)[..., None] * (0.88 + 0.24 * value_noise(w, h, w // 6, max(2, h // 6), rng))[..., None]
            d = np.minimum(np.minimum(a, P - a), np.minimum(b, P - b))
            top = np.minimum(P - a, P - b)            # distance to the two upper edges of the diamond
            bot = np.minimum(a, b)
            rgb *= (1 + 0.18 * smoothstep(5.0, 1.5, top))[..., None]
            rgb *= (1 - 0.3 * smoothstep(5.0, 1.5, bot))[..., None]
            rgb *= (1 - 0.55 * smoothstep(1.6, 0.3, d))[..., None]
        else:   # formwork lifts every 0.6 m, tie holes
            fy = np.mod(y, 0.6 * ppm)
            rgb *= (1 - 0.25 * smoothstep(1.4, 0.3, np.minimum(fy, 0.6 * ppm - fy)))[..., None]
            ties = (np.abs(np.mod(x, 0.9 * ppm) - 0.45 * ppm) < 1.4) & (np.abs(fy - 0.3 * ppm) < 1.4)
            rgb[ties] *= 0.45
        wet = smoothstep(water_v + 0.18, water_v + 0.06, v + 0.05 * value_noise(w, h, w // 12, 2, rng))
        rgb = rgb * (1 - 0.55 * wet[..., None])
        alg = wet * smoothstep(0.45, 0.65, fbm(w, h, w // 16, max(2, h // 8), rng, 4)) * smoothstep(water_v - 0.25, water_v, v)
        rgb = rgb * (1 - 0.8 * alg[..., None]) + srgb('#2f4a26') * (0.8 * alg)[..., None]
        band = smoothstep(water_v + 0.1, water_v + 0.02, v) * smoothstep(water_v - 0.12, water_v - 0.02, v)
        sp = (rng.random((h, w)) > 0.9) & (band > 0.4)
        rgb[sp] = rgb[sp] * 0.4 + srgb('#a8a49a') * 0.6
        salt = (1 - rain_streaks(w, h, rng, 0.35)) * smoothstep(water_v + 0.2, water_v + 0.4, v)
        rgb = rgb * (1 - salt[..., None]) + srgb('#d6d3ca') * salt[..., None]
        return _out(rgb, 0.2 + 0.5 * wet, 0.0)
    return gen


def apron(col='#8e8c86', ppm=32, slab_m=4.0):
    """Concrete apron of the quay (kishi-heki top): slabs with saw-cut joints,
    hairline cracks, oil and rust stains, salt bloom. Tiles in U."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        n = fbm(w, h, w // 16, max(2, h // 16), rng, 5)
        f = 0.84 + 0.26 * n
        P = slab_m * ppm
        jx = np.mod(x, P)
        f *= 1 - 0.4 * smoothstep(1.2, 0.2, np.minimum(jx, P - jx))
        f *= 1 - 0.4 * smoothstep(1.2, 0.2, np.minimum(y, h - y))
        crack = smoothstep(0.012, 0.0, np.abs(fbm(w, h, w // 10, max(2, h // 10), rng, 3) - 0.5))
        f *= 1 - 0.3 * crack
        stain = smoothstep(0.7, 0.85, fbm(w, h, w // 12, max(2, h // 6), rng, 4))
        rgb = srgb(col) * f[..., None]
        rgb = rgb * (1 - 0.45 * stain[..., None]) + srgb('#3a3632') * (0.45 * stain)[..., None]
        speck = rng.random((h, w))
        rgb[speck > 0.97] *= 1.15
        return _out(rgb, 0.18 + 0.2 * stain)
    return gen


def deck(col='#7a7166', board_m=0.2, ppm=64):
    """Grey weathered deck planks of a pier: boards along U, gaps, bolt
    heads at the joists, salt-silvered grain."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        bh = board_m * ppm
        row = np.floor(y / bh); fy = np.mod(y, bh) / bh
        tv = (np.sin(row * 12.9898 + 7.1) * 43758.5453) % 1.0
        g = value_noise(w, h, w // 2, max(4, int(h / 3)), rng)
        f = (0.8 + 0.25 * tv) * (0.84 + 0.24 * g)
        f *= 1 - 0.75 * np.maximum(smoothstep(0.06, 0.0, fy), smoothstep(0.94, 1.0, fy))
        bolts = (np.abs(np.mod(x, 1.0 * ppm) - 0.5 * ppm) < 1.5) & ((np.abs(fy - 0.25) < 0.06) | (np.abs(fy - 0.75) < 0.06))
        rgb = srgb(col) * f[..., None]
        rgb[bolts] = srgb('#3a2a20')
        return _out(rgb, 0.15 + 0.1 * tv)
    return gen

# ── atlas layouts (pixel rects: x, y, w, h; y from the bottom) ──────────────

def _cells(names_gens, x0, y0, cols, size=64, h=None):
    out = {}
    h = h or size
    for i, (name, gen) in enumerate(names_gens):
        out[name] = dict(kind='cell', rect=(x0 + (i % cols) * size, y0 + (i // cols) * h, size, h), gen=gen)
    return out


def _strip(y, h, gen, ppm=PPM):
    return dict(kind='strip', rect=(0, y, SIZE, h), gen=gen, ppm=ppm)


def _rect(x, y, w, h, gen):
    return dict(kind='rect', rect=(x, y, w, h), gen=gen)


LAYOUTS = {
    'Props': {   # strips at 128 px/m: 1024 px = 8 m wide, 128 px = 1 m tall
        'STONE':      _strip(896, 128, stone()),
        'STONE_MOSS': _strip(768, 128, stone(moss=0.6)),
        'WOOD_DARK':  _strip(704, 64, wood()),
        'CONCRETE':   _strip(640, 64, stone('#9b9993', dirt=0.3)),
        'DISPLAY':    _rect(0, 0, 512, 384, vending_display()),
        'SIDE_AD':    _rect(0, 384, 112, 256, side_ad()),
        'STICKER_CAUTION': _rect(160, 576, 64, 64, sticker('caution')),
        'STICKER_RECYCLE': _rect(224, 576, 64, 64, sticker('recycle')),
        'STICKER_NOTICE':  _rect(288, 576, 64, 64, sticker('notice')),
        'RATING_PLATE':    _rect(352, 576, 64, 64, sticker('plate')),
        'CONTROL':    _rect(512, 256, 128, 256, control_panel()),
        'DISPLAY_SLIM': _rect(512, 0, 384, 256, vending_display(seed=11, cols=6)),
        'PLAQUE':     _rect(112, 384, 64, 128, png('PLAQUE', 0.5)),
        **_cells([
            ('VEND_RED',     flat('#b3141c', 0.55, dirt=0.15)),
            ('VEND_BLUE',    flat('#1c4a9c', 0.55, dirt=0.15)),
            ('VEND_WHITE',   flat('#e6e7e6', 0.55, dirt=0.2)),
            ('PLASTIC_BLACK', flat('#141416', 0.55, dirt=0.05)),
            ('PLASTIC_GREY', flat('#7d7e80', 0.45, dirt=0.1)),
            ('STEEL',        flat('#9a9ca0', 0.6, 1.0, dirt=0.15)),
            ('STEEL_DARK',   flat('#2c2d30', 0.45, 0.8, dirt=0.1)),
            ('RUST',         flat('#6b3a1f', 0.15, 0.3, dirt=0.2)),
            ('INTERIOR',     flat('#0c0c0d', 0.2, dirt=0.0)),
            ('LIGHT_WARM',   emissive('#ffb768')),
            ('LIGHT_PAPER',  emissive('#ffd9a0')),
            ('LIGHT_COOL',   emissive('#dff3ff')),
            ('VERMILION',    flat('#c4381c', 0.4, dirt=0.25)),
            ('SOOT',         flat('#1b1a19', 0.15, dirt=0.0)),
            ('BIN_BLUE',     flat('#2f6fb5', 0.5, dirt=0.18)),
            ('BIN_GREY',     flat('#c9cbc7', 0.45, dirt=0.18)),
            ('LACQUER_BLACK', flat('#141313', 0.55, dirt=0.05)),
            ('FELT_RED',     flat('#b0242a', 0.1, dirt=0.1)),
            ('STONE_FLAT',   flat('#7a7b7d', 0.2, dirt=0.15)),     # big undersides wider than a strip
        ], 640, 256, 6),
    },
    'Street': {  # street furniture; strips at 128 px/m
        'CONCRETE_POLE': _strip(896, 128, concrete_pole()),
        'GALV':          _strip(832, 64, galvanized()),
        'ISHIGAKI':      _strip(640, 192, ishigaki(), ppm=96),     # 10.7 m x 2 m
        'WOOD_BOARD':    _strip(576, 64, wood('#5a4634', smooth=0.2)),
        'BAMBOO':        _strip(512, 64, bamboo()),
        'WOOD_LIGHT':    _strip(448, 64, wood('#8a6440', smooth=0.35)),
        'STOP':       _rect(0, 320, 128, 128, png('STOP')),
        'SPEED40':    _rect(128, 320, 128, 128, png('SPEED40')),
        'NO_PARKING': _rect(256, 320, 128, 128, png('NO_PARKING')),
        'CROSSWALK':  _rect(384, 320, 128, 128, png('CROSSWALK')),
        'CURVE':      _rect(512, 320, 128, 128, png('CURVE')),
        'ONE_WAY':    _rect(640, 320, 256, 128, png('ONE_WAY')),
        'BUS_STOP':   _rect(896, 320, 128, 128, png('BUS_STOP', bg='#8d9096')),
        'PED_RED':    _rect(0, 256, 64, 64, png('PED_RED', 0.7, emit=1.0)),
        'PED_GREEN':  _rect(64, 256, 64, 64, png('PED_GREEN', 0.7, emit=1.0)),
        'POLE_PLATE': _rect(128, 256, 32, 64, png('POLE_PLATE')),
        'TORA':       _rect(0, 128, 128, 128, png('TORA', 0.35)),
        'BANNER':     _rect(128, 128, 64, 128, png('BANNER', 0.2)),
        'TIMETABLE':  _rect(192, 128, 96, 128, png('TIMETABLE', 0.6)),
        'AD_POSTER':  _rect(288, 128, 96, 128, png('AD_POSTER', 0.7, emit=0.55)),
        'STOP_NAME':  _rect(384, 192, 128, 32, png('STOP_NAME', 0.5)),
        'BASKET':     _rect(384, 128, 64, 64, png('BASKET', 0.4, bg='#2a2c2e')),
        **_cells([
            ('PAINT_WHITE',   flat('#e9eae6', 0.45, dirt=0.15)),
            ('PAINT_GREY',    flat('#8d9096', 0.4, 0.3, dirt=0.1)),     # light poles, signal housings
            ('PAINT_DARK',    flat('#3b3e42', 0.4, 0.3, dirt=0.08)),
            ('BLACK',         flat('#121314', 0.35, dirt=0.0)),
            ('SIGN_BACK',     flat('#9ea2a6', 0.5, 0.8, dirt=0.1)),
            ('PORCELAIN',     flat('#e8e6df', 0.8, dirt=0.05)),
            ('TRANSFORMER',   flat('#8e979c', 0.45, 0.4, dirt=0.15)),
            ('CABLE',         flat('#1a1a1b', 0.4, dirt=0.0)),
            ('YELLOW',        flat('#e8b51a', 0.45, dirt=0.15)),
            ('STEEL',         flat('#9a9ca0', 0.6, 1.0, dirt=0.1)),
            ('RUST',          flat('#6b3a1f', 0.15, 0.3, dirt=0.15)),
            ('CONCRETE_CAP',  flat('#b3b1aa', 0.25, dirt=0.2)),
            ('PLASTIC_BLUE',  flat('#2f6fb5', 0.5, dirt=0.15)),
            ('PLASTIC_GREY',  flat('#c4c6c2', 0.45, dirt=0.15)),
            ('PLASTIC_BLACK', flat('#18191a', 0.5, dirt=0.05)),
            ('ROPE_BLACK',    flat('#202020', 0.2, dirt=0.0)),
            ('LENS_RED',      emissive('#ff2a1a')),
            ('LENS_YELLOW',   emissive('#ffb000')),
            ('LENS_GREEN',    emissive('#00d0a0')),
            ('LED_COOL',      emissive('#e8f3ff')),
            ('LAMP_WARM',     emissive('#ffc985')),
            ('INTERIOR',      flat('#0c0c0d', 0.2, dirt=0.0)),
            ('LENS_OFF',      flat('#121516', 0.5, dirt=0.0)),    # unlit signal lens behind the lit one
            ('TILE',          flat('#4d5560', 0.45, dirt=0.12)),
            ('TILE_DARK',     flat('#353b43', 0.4, dirt=0.15)),
            ('WOOD_POST',     flat('#3b2a1e', 0.3, dirt=0.2)),
        ], 192, 0, 13),
        **_cells([   # second block (y 256): street furniture added with task 2b
            ('REFLECTOR',     flat('#f08a1c', 0.85, dirt=0.0)),     # delineator: bright, no emission
            ('REFLECTOR_RED', flat('#c01818', 0.85, dirt=0.0)),
            ('STONE_CUT',     flat('#8a8882', 0.2, dirt=0.25)),
            ('BIKE_SILVER',   flat('#b9bcbf', 0.6, 0.8, dirt=0.05)),
            ('BIKE_MINT',     flat('#8cc4b4', 0.5, dirt=0.05)),
            ('BIKE_CREAM',    flat('#e6dcc4', 0.5, dirt=0.05)),
            ('RUBBER',        flat('#151515', 0.25, dirt=0.0)),
            ('SADDLE',        flat('#2a201b', 0.45, dirt=0.0)),
            ('ALU',           flat('#c3c6c8', 0.55, 0.9, dirt=0.08)),
            ('LED_SHELTER',   emissive('#f3f6ff')),
            ('ROOF_SHEET',    flat('#6d7176', 0.4, 0.6, dirt=0.1)),
            ('PAINT_BROWN',   flat('#4a3b30', 0.4, 0.3, dirt=0.1)),
            ('PAINT_GREEN',   flat('#33584a', 0.4, 0.3, dirt=0.1)),
        ], 160, 256, 13),
    },
    'Nature': {  # rocks, planters, later vegetation (task 4); opaque only
        'ROCK':         _strip(768, 256, rock(), ppm=100),             # 10.2 m x 2.56 m
        'ROCK_MOSS':    _strip(640, 128, rock(moss=0.7), ppm=100),
        'LEAVES':       _strip(512, 128, leaves()),
        'LEAVES_BLOOM': _strip(384, 128, leaves('#3f5c2c', bloom=('#e0577f', 0.35))),
        'SOIL':         _strip(320, 64, soil()),
        'CONCRETE':     _strip(256, 64, stone('#a3a19b', dirt=0.3)),
        **_cells([
            ('TERRACOTTA',  flat('#a2573a', 0.25, dirt=0.25)),
            ('GLAZE_BLUE',  flat('#2b4c74', 0.75, dirt=0.15)),
            ('GLAZE_BROWN', flat('#5b3b25', 0.7, dirt=0.15)),
            ('STYRO',       flat('#e6e6e1', 0.2, dirt=0.3)),
            ('PLASTIC_GREEN', flat('#3e6a3a', 0.45, dirt=0.15)),
            ('FRP_GREY',    flat('#97948e', 0.35, dirt=0.25)),
            ('FRP_BROWN',   flat('#6a5040', 0.35, dirt=0.25)),
            ('SOIL_FLAT',   flat('#33281f', 0.1, dirt=0.0)),
            ('LEAF_FLAT',   flat('#3a5728', 0.3, dirt=0.0)),
            ('STEM',        flat('#4a3a26', 0.2, dirt=0.0)),
            ('PLASTIC_BLACK', flat('#18191a', 0.5, dirt=0.05)),
            ('STEEL',       flat('#9a9ca0', 0.6, 1.0, dirt=0.1)),
            ('ROCK_FLAT',   flat('#77766f', 0.2, dirt=0.15)),
            ('WOOD_CEDAR',  flat('#5d4330', 0.3, dirt=0.2)),
        ], 0, 0, 16),
    },
    'Tokyo': {   # walls 2 m strips at 96 px/m (faces split at floor, sill and lintel lines)
        'TILE_BEIGE': _strip(832, 192, facade_tile(), ppm=96),
        'ALC_WHITE':  _strip(640, 192, alc(), ppm=96),
        'TILE_BROWN': _strip(448, 192, facade_tile('#6e5143', (0.108, 0.06), 0.01, '#9c958a', 0.2), ppm=96),
        'WOOD':       _strip(384, 32, wood('#4a3424', smooth=0.3)),            # battens only (rotated)
        'NOBORI_A':   _rect(0, 416, 128, 32, png('NOBORI_A', 0.2)),
        'NOBORI_B':   _rect(128, 416, 128, 32, png('NOBORI_B', 0.2)),
        **_cells([   # facade panels (aluminium composite, glass, raw concrete): variety for the centre
            ('PANEL_DARK',   flat('#2f3235', 0.5, 0.4, dirt=0.06)),
            ('PANEL_SILVER', flat('#a9adb0', 0.55, 0.8, dirt=0.06)),
            ('PANEL_RED',    flat('#8a2a24', 0.45, 0.2, dirt=0.08)),
            ('PANEL_CREAM',  flat('#d8cdb4', 0.4, dirt=0.12)),
            ('PANEL_NAVY',   flat('#24324a', 0.5, 0.3, dirt=0.06)),
            ('PANEL_TEAL',   flat('#2f5f5a', 0.45, 0.2, dirt=0.08)),
            ('GLASS_BLACK',  flat('#14181c', 0.92, dirt=0.0)),
            ('PANEL_ORANGE', flat('#b8642c', 0.45, 0.2, dirt=0.08)),
            ('TILE_WHITE',   flat('#e4e1d8', 0.5, dirt=0.14)),
            ('CONCRETE_RAW', flat('#8f8d87', 0.25, dirt=0.22)),
            ('GLASS_BLUE',   flat('#2a4a62', 0.92, 0.2, dirt=0.0)),
            ('PANEL_GREY',   flat('#5f6366', 0.45, 0.4, dirt=0.08)),
        ], 256, 416, 12, 64, 32),
        'KONBINI_INT_A':  _rect(0, 256, 192, 128, png('KONBINI_INT_A', 0.8, emit=0.9)),
        'KONBINI_INT_B':  _rect(192, 256, 192, 128, png('KONBINI_INT_B', 0.8, emit=0.9)),
        'KONBINI_FASCIA': _rect(384, 320, 512, 64, png('KONBINI_FASCIA', 0.6, emit=0.85)),
        'ROOF_SIGN':  _rect(384, 256, 256, 64, png('ROOF_SIGN', 0.5, emit=0.75)),
        'SCHOOL':     _rect(640, 256, 256, 48, png('SCHOOL', 0.8, emit=0.6)),
        'SALON':      _rect(512, 192, 128, 48, png('SALON', 0.8, emit=0.6)),
        'KISSA':      _rect(832, 192, 64, 64, png('KISSA', 0.5, emit=0.7)),
        'TATE_A':     _rect(960, 0, 64, 384, png('TATE_A', 0.5, emit=0.85)),
        'TATE_B':     _rect(896, 0, 64, 384, png('TATE_B', 0.5, emit=0.85)),
        'NOREN':      _rect(640, 128, 128, 96, png('NOREN', 0.15)),
        'LANTERN':    _rect(768, 128, 128, 64, png('LANTERN', 0.3, emit=0.8)),
        'MENU':       _rect(832, 0, 64, 96, png('MENU', 0.2)),
        'SHUTTER':    _rect(704, 0, 64, 128, png('SHUTTER', 0.4)),
        'AUTO_DOOR':  _rect(768, 0, 64, 128, png('AUTO_DOOR', 0.8, emit=0.8)),
        'LOBBY':      _rect(640, 0, 64, 128, png('LOBBY', 0.6, emit=0.7)),
        'PARTITION':  _rect(576, 96, 64, 96, png('PARTITION', 0.3)),
        'WIN_CURTAIN': _rect(512, 64, 64, 64, png('WIN_CURTAIN', 0.8, emit=0.8)),
        'WIN_BLIND':  _rect(512, 128, 64, 64, png('WIN_BLIND', 0.8, emit=0.7)),
        'WIN_DARK':   _rect(512, 0, 64, 64, png('WIN_DARK', 0.85)),
        'AC_FRONT':   _rect(576, 0, 64, 48, png('AC_FRONT', 0.4)),
        'MAILBOX':    _rect(768, 192, 64, 64, png('MAILBOX', 0.5)),
        'NAMEPLATE':  _rect(640, 224, 128, 32, png('NAMEPLATE', 0.6)),
        'METER':      _rect(576, 48, 32, 32, png('METER', 0.4)),
        **_cells([
            ('ALU',          flat('#b9bcbd', 0.55, 0.9, dirt=0.05)),
            ('ALU_BRONZE',   flat('#4a4038', 0.5, 0.8, dirt=0.05)),     # dark sash ('sten colour')
            ('GLASS_DARK',   flat('#1c242b', 0.92, dirt=0.0)),
            ('LIT_WARM',     emissive('#ffc985')),
            ('LIT_COOL',     emissive('#e8f3ff')),
            ('FROSTED',      flat('#c9d0d2', 0.7, dirt=0.15)),
            ('CONCRETE',     flat('#a3a19b', 0.25, dirt=0.25)),
            ('ROOF_GREEN',   flat('#5f7266', 0.3, dirt=0.1)),            # urethane roof coating
            ('GALV',         flat('#a3a7ab', 0.45, 0.9, dirt=0.1)),
            ('PAINT_GREY',   flat('#7d8084', 0.4, 0.3, dirt=0.1)),
            ('AC_IVORY',     flat('#e2dfd5', 0.45, dirt=0.18)),
            ('PIPE_COVER',   flat('#d8d2c2', 0.4, dirt=0.15)),
            ('BLACK',        flat('#151617', 0.4, dirt=0.0)),
            ('SIGN_FACE',    emissive('#f6f4ee')),
            ('NEON_PINK',    emissive('#ff3fa4')),
            ('NEON_CYAN',    emissive('#3fe6ff')),
            ('NEON_ORANGE',  emissive('#ff9a2e')),
            ('WOOD_DARK',    flat('#3a281c', 0.3, dirt=0.15)),
            ('KONBINI_BLUE', flat('#2d8fd6', 0.55, dirt=0.05)),
            ('KONBINI_ORANGE', flat('#f39a1e', 0.55, dirt=0.05)),
            ('LANTERN_RED',  emissive('#d8301f')),
            ('TANK_CREAM',   flat('#d9d3bf', 0.4, dirt=0.25)),
            ('INTERIOR',     flat('#0c0c0d', 0.2, dirt=0.0)),
            ('GRANITE',      flat('#3d3b3a', 0.65, dirt=0.05)),          # polished plinth
            ('DOOR_STEEL',   flat('#6b5a48', 0.45, 0.4, dirt=0.1)),
            ('RUST',         flat('#6b3a1f', 0.15, 0.3, dirt=0.15)),
            ('TILE_FLAT',    flat('#b9a78c', 0.4, dirt=0.15)),           # slab edges, soffits
            ('ALC_FLAT',     flat('#d4d3cd', 0.3, dirt=0.15)),
            ('BROWN_FLAT',   flat('#6e5143', 0.4, dirt=0.15)),
            ('NOREN_NAVY',   flat('#1d2a4a', 0.15, dirt=0.0)),
            ('RED_PAINT',    flat('#b3202a', 0.4, dirt=0.1)),
            ('YELLOW',       flat('#e8b51a', 0.45, dirt=0.15)),
        ], 0, 0, 8),
    },
    'TokyoSigns': {   # sign skin of the dense centre: lightboxes, towers, stands, billboards, screens
        **{f'Y{i:02d}': _rect((i % 4) * 256, (i // 4) * 64, 256, 64, png(f'SG_Y{i:02d}', 0.55, emit=0.85)) for i in range(24)},
        **{f'T{i:02d}': _rect(i * 64, 384, 64, 320, png(f'SG_T{i:02d}', 0.55, emit=0.85)) for i in range(16)},
        **{k: _rect(i * 256, 704, 256, 128, png(f'SG_{k}', 0.5, emit=0.75))
           for i, k in enumerate(('BILL_LAGER', 'BILL_MOBILE', 'BILL_CAMERA', 'BILL_SODA'))},
        'VIDEO_A': _rect(0, 832, 256, 128, png('SG_VIDEO_A', 0.8, emit=1.0)),
        'VIDEO_B': _rect(768, 832, 256, 128, png('SG_VIDEO_B', 0.8, emit=1.0)),
        **{f'S{i}': _rect(256 + i * 64, 832, 64, 128, png(f'SG_S{i}', 0.55, emit=0.8)) for i in range(8)},
        **_cells([
            ('FRAME_BLACK',  flat('#18191a', 0.45, 0.3, dirt=0.05)),
            ('FRAME_SILVER', flat('#b9bcbd', 0.55, 0.9, dirt=0.05)),
            ('FRAME_WHITE',  flat('#e8e8e4', 0.45, dirt=0.1)),
            ('GALV',         flat('#a3a7ab', 0.45, 0.9, dirt=0.1)),
            ('RUST',         flat('#6b3a1f', 0.15, 0.3, dirt=0.15)),
            ('NEON_PINK',    emissive('#ff3fa4')),
            ('NEON_CYAN',    emissive('#3fe6ff')),
            ('NEON_YELLOW',  emissive('#ffd23f')),
            ('NEON_GREEN',   emissive('#4dff7a')),
            ('NEON_RED',     emissive('#ff3020')),
            ('NEON_WHITE',   emissive('#f4f6ff')),
            ('BULB_WARM',    emissive('#ffc070')),
            ('LANTERN_RED',  emissive('#d8301f')),
            ('PAINT_RED',    flat('#b3202a', 0.4, dirt=0.1)),
            ('SIGN_BACK',    flat('#3b3e42', 0.4, 0.3, dirt=0.1)),
            ('SCREEN_OFF',   flat('#0c0e10', 0.8, dirt=0.0)),
        ], 0, 960, 16),
    },
    'Koedo': {   # kura town structure: walls 2 m strips (plaster 96 px/m, boards/copper 64 px/m)
        'PLASTER_BLACK': _strip(832, 192, plaster('#1a1a1c', dirt=0.1, streak=0.08, smooth=0.55), ppm=96),
        'PLASTER_WHITE': _strip(640, 192, plaster(), ppm=96),
        'WOOD_BOARD':    _strip(512, 128, wood_board(), ppm=64),
        'COPPER':        _strip(384, 128, copper(), ppm=64),
        'NAMAKO':        _strip(256, 128, namako(period_px=32, joint_px=3.4), ppm=128),
        'STONE':         _strip(208, 48, stone('#7e7f80', dirt=0.3), ppm=96),
        'WOOD':          _strip(176, 32, wood('#3a281c'), ppm=48),        # 0.67 m: beams, posts (rotated)
        'WOOD_LIGHT':    _strip(144, 32, wood('#7a5a3a', smooth=0.35), ppm=48),
        'KAMON_A':       _rect(0, 80, 64, 64, kamon()),
        'KAMON_B':       _rect(64, 80, 64, 64, kamon_b()),
        'ONI':           _rect(128, 80, 64, 64, oni()),
        'SHOJI':         _rect(192, 80, 64, 64, shoji(lit=True)),
        'SHOJI_DARK':    _rect(256, 80, 64, 64, shoji(lit=False)),
        **_cells([
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('INTERIOR',    flat('#0b0a09', 0.2, dirt=0.0)),
            ('LIGHT_WARM',  emissive('#ffb768')),
            ('TILE_A',      flat('#4d5560', 0.45, dirt=0.12)),
            ('TILE_B',      flat('#454c56', 0.4, dirt=0.12)),
            ('TILE_C',      flat('#555d68', 0.5, dirt=0.12)),
            ('TILE_DARK',   flat('#353b43', 0.4, dirt=0.15)),
            ('PLASTER_WHITE_FLAT', flat('#e2dccf', 0.25, dirt=0.08)),
            ('PLASTER_BLACK_FLAT', flat('#1a1a1c', 0.55, dirt=0.04)),
            ('WOOD_FLAT',   flat('#3a281c', 0.3, dirt=0.12)),
            ('WOOD_LIGHT_FLAT', flat('#7a5a3a', 0.35, dirt=0.12)),
            ('COPPER_FLAT', flat('#5f8f7a', 0.35, 0.1, dirt=0.15)),
            ('COPPER_PIPE', flat('#7a5236', 0.45, 0.6, dirt=0.1)),
            ('STONE_FLAT',  flat('#7e7f80', 0.25, dirt=0.2)),
            ('GLASS',       flat('#1c242b', 0.92, dirt=0.0)),
            ('PAPER',       flat('#e8e0cc', 0.2, dirt=0.05)),
            ('BRASS',       flat('#a08440', 0.55, 0.9, dirt=0.05)),
            ('PLASTER_GREY_FLAT', flat('#8d8a84', 0.3, dirt=0.15)),
            ('WOOD_BOARD_FLAT', flat('#3b2a1e', 0.25, dirt=0.15)),
            ('MORTAR',      flat('#9c9890', 0.25, dirt=0.2)),
        ], 384, 0, 10, 64, 32),
    },
    'KoedoShop': {   # shop dressing of the kura town: interiors, signboards, noren, flags, lanterns
        **{f'INT_{k}': _rect((i % 4) * 256, 896 - (i // 4) * 128, 256, 128, png(f'KO_INT_{k}', 0.6, emit=0.85))
           for i, k in enumerate(('SAKE', 'SWEETS', 'SOUVENIR', 'UNAGI', 'IMO', 'CRAFT'))},
        **{f'KB{i}': _rect(512 + (i % 2) * 256, 768 + (i // 2) * 64, 256, 64, png(f'KO_KB{i}', 0.35)) for i in range(2)},
        **{f'KB{i}': _rect((i - 2) * 256, 704, 256, 64, png(f'KO_KB{i}', 0.35)) for i in range(2, 6)},
        **{f'KB{i}': _rect((i - 6) * 256, 384, 256, 64, png(f'KO_KB{i}', 0.35)) for i in range(6, 8)},
        'INT_TEA': _rect(0, 256, 256, 128, png('KO_INT_TEA', 0.6, emit=0.85)),
        **{f'KV{i}': _rect(i * 64, 448, 64, 256, png(f'KO_KV{i}', 0.35)) for i in range(4)},
        **{f'NOREN{i}': _rect(256 + i * 128, 608, 128, 96, png(f'KO_NOREN{i}', 0.15)) for i in range(6)},
        **{f'NOBORI{i}': _rect(256 + i * 128, 576, 128, 32, png(f'KO_NOBORI{i}', 0.2)) for i in range(4)},
        'CHOCHIN0': _rect(256, 512, 128, 64, png('KO_CHOCHIN0', 0.3, emit=0.8)),
        'CHOCHIN1': _rect(384, 512, 128, 64, png('KO_CHOCHIN1', 0.3, emit=0.8)),
        'CANDY':    _rect(512, 512, 64, 64, png('KO_CANDY', 0.8)),
        'SUDARE':   _rect(576, 448, 64, 128, png('KO_SUDARE', 0.2)),
        'MENU':     _rect(640, 480, 64, 96, png('KO_MENU', 0.3)),
        'BUCKET':   _rect(704, 544, 64, 32, png('KO_BUCKET', 0.5)),
        **_cells([
            ('WOOD_DARK',   flat('#3a281c', 0.3, dirt=0.12)),
            ('WOOD_LIGHT',  flat('#9a7650', 0.35, dirt=0.12)),
            ('LACQUER_RED', flat('#8a1f1a', 0.6, dirt=0.05)),
            ('FELT_RED',    flat('#b3202a', 0.1, dirt=0.05)),
            ('PARASOL_RED', flat('#c42a22', 0.3, dirt=0.05)),
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('BRASS',       flat('#a08440', 0.55, 0.9, dirt=0.05)),
            ('CEDAR',       flat('#5a5a2e', 0.15, dirt=0.1)),
            ('STRAW',       flat('#c9b07a', 0.2, dirt=0.15)),
            ('PAPER',       flat('#f4ecd8', 0.2, dirt=0.05)),
            ('LIT_WARM',    emissive('#ffc985')),
            ('NOREN_NAVY',  flat('#1d2a4a', 0.15, dirt=0.0)),
            ('WHITE',       flat('#efe9dc', 0.3, dirt=0.1)),
            ('BOX_PURPLE',  flat('#5a2a6a', 0.4, dirt=0.05)),
            ('BOX_YELLOW',  flat('#e8b51a', 0.4, dirt=0.05)),
            ('BOX_ORANGE',  flat('#d8642c', 0.4, dirt=0.05)),
            ('GLASS_JAR',   flat('#cfe2e6', 0.9, dirt=0.0)),
            ('POT_CLAY',    flat('#8a4a2c', 0.3, dirt=0.2)),
            ('LEAF',        flat('#3c5a2a', 0.3, dirt=0.0)),
            ('BLACK',       flat('#151617', 0.4, dirt=0.0)),
            ('BUCKET_RED',  flat('#b3202a', 0.5, dirt=0.1)),
            ('STONE',       flat('#7e7f80', 0.25, dirt=0.2)),
            ('BAMBOO',      flat('#a48d5e', 0.35, dirt=0.1)),
            ('INDIGO',      flat('#24324a', 0.15, dirt=0.0)),
            ('GREEN_TEA',   flat('#4a6a2a', 0.3, dirt=0.05)),
            ('STEEL',       flat('#9a9ca0', 0.6, 1.0, dirt=0.1)),
            ('TIRE',        flat('#1a1a1b', 0.3, dirt=0.0)),
            ('CHROME',      flat('#c8cacc', 0.8, 1.0, dirt=0.0)),
        ], 0, 0, 16),
    },
    'Kura': {    # plaster strips 2 m tall at 128 px/m; namako at 256 px/m (1 m)
        'PLASTER_WHITE': _strip(768, 256, plaster()),
        'PLASTER_BLACK': _strip(512, 256, plaster('#1a1a1c', dirt=0.1, streak=0.08, smooth=0.55)),
        'NAMAKO':        _strip(256, 256, namako(), ppm=256),
        'WOOD_DARK':     _strip(192, 64, wood()),
        'STONE':         _strip(128, 64, stone('#7e7f80', dirt=0.3)),
        'KAMON':         _rect(0, 64, 64, 64, kamon()),
        'ONI':           _rect(64, 64, 64, 64, oni()),
        **_cells([
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('INTERIOR',    flat('#0b0a09', 0.2, dirt=0.0)),
            ('LIGHT_WARM',  emissive('#ffb768')),
            ('TILE_A',      flat('#4d5560', 0.45, dirt=0.12)),
            ('TILE_B',      flat('#454c56', 0.4, dirt=0.12)),
            ('TILE_C',      flat('#555d68', 0.5, dirt=0.12)),
            ('TILE_DARK',   flat('#353b43', 0.4, dirt=0.15)),
            ('PLASTER_EDGE', flat('#d6d0c4', 0.25, dirt=0.3)),
            ('PLASTER_WHITE_FLAT', flat('#e2dccf', 0.25, dirt=0.08)),
            ('PLASTER_BLACK_FLAT', flat('#1a1a1c', 0.55, dirt=0.04)),
        ], 0, 0, 16),
    },
    'Kiso': {   # post-town structure: walls 2 m strips at 64 px/m, shingles 96 px/m, beams 48 px/m
        'WOOD_TATE':     _strip(896, 128, tate_ita(), ppm=64),
        'WOOD_BOARD':    _strip(768, 128, wood_board('#3e2d20'), ppm=64),
        'PLASTER_EARTH': _strip(640, 128, plaster('#b39a74', dirt=0.3, streak=0.12, smooth=0.2), ppm=64),
        'ISHIGAKI':      _strip(512, 128, ishigaki(stone_m=(0.5, 0.32), ppm=64), ppm=64),
        'ROAD':          _strip(384, 128, road_earth(), ppm=64),
        'PAVING':        _strip(256, 128, paving(), ppm=64),
        'SHINGLE':       _strip(208, 48, shingle(), ppm=96),
        'STONE':         _strip(160, 48, stone('#7e7f80', dirt=0.3), ppm=96),
        'WOOD':          _strip(128, 32, wood('#33261c'), ppm=48),        # 0.67 m: beams, posts (rotated)
        'WOOD_LIGHT':    _strip(96, 32, wood('#4e3a2a', smooth=0.3), ppm=48),
        'ONI':           _rect(0, 32, 64, 64, oni()),
        'KAMON_A':       _rect(64, 32, 64, 64, kamon()),
        'SHOJI':         _rect(128, 32, 64, 64, shoji(lit=True)),
        'SHOJI_DARK':    _rect(192, 32, 64, 64, shoji(lit=False)),
        'KOSHI_LIT':     _rect(256, 32, 64, 64, koshi_tex(True)),
        'KOSHI_DARK':    _rect(320, 32, 64, 64, koshi_tex(False)),
        **_cells([
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('INTERIOR',    flat('#0b0a09', 0.2, dirt=0.0)),
            ('LIGHT_WARM',  emissive('#ffb768')),
            ('TILE_A',      flat('#4d5560', 0.45, dirt=0.12)),
            ('TILE_B',      flat('#454c56', 0.4, dirt=0.12)),
            ('TILE_C',      flat('#555d68', 0.5, dirt=0.12)),
            ('TILE_DARK',   flat('#353b43', 0.4, dirt=0.15)),
            ('PLASTER_WHITE_FLAT', flat('#e2dccf', 0.25, dirt=0.1)),
            ('PLASTER_EARTH_FLAT', flat('#b39a74', 0.2, dirt=0.15)),
            ('WOOD_FLAT',   flat('#33261c', 0.3, dirt=0.12)),
            ('WOOD_LIGHT_FLAT', flat('#4e3a2a', 0.3, dirt=0.12)),
            ('WOOD_BOARD_FLAT', flat('#3e2d20', 0.25, dirt=0.15)),
            ('WOOD_TATE_FLAT', flat('#45342a', 0.2, dirt=0.15)),
            ('WOOD_GREY_FLAT', flat('#5d5650', 0.2, dirt=0.1)),
            ('SHINGLE_EDGE', flat('#3d3832', 0.15, dirt=0.05)),
            ('STONE_FLAT',  flat('#7e7f80', 0.25, dirt=0.2)),
            ('STONE_A',     flat('#6a6965', 0.2, dirt=0.25)),
            ('STONE_B',     flat('#5e5850', 0.2, dirt=0.25)),
            ('STONE_C',     flat('#525a46', 0.15, dirt=0.25)),   # mossy
            ('GLASS',       flat('#1c242b', 0.92, dirt=0.0)),
        ], 384, 32, 10, 64, 32),
        **_cells([
            ('BAMBOO',      flat('#a48d5e', 0.4, dirt=0.1)),
            ('BAMBOO_DARK', flat('#6e6040', 0.35, dirt=0.1)),
            ('WATER',       flat('#1a2528', 0.95, dirt=0.0)),
            ('MOSS',        flat('#4d5a2c', 0.1, dirt=0.1)),
            ('PAPER',       flat('#e8e0cc', 0.2, dirt=0.05)),
            ('END_GRAIN',   flat('#7a5c40', 0.2, dirt=0.15)),
            ('CHANNEL',     flat('#4a4842', 0.5, dirt=0.3)),
            ('EARTH',       flat('#5a4a3a', 0.1, dirt=0.2)),
        ], 0, 0, 16, 64, 32),
    },
    'KisoShop': {   # shop dressing of the post town: interiors, boards, noren, wall lanterns, wares
        **{f'INT_{k}': _rect((i % 4) * 256, 896 - (i // 4) * 128, 256, 128, png(f'KI_INT_{k}', 0.6, emit=0.85))
           for i, k in enumerate(('INN', 'SOBA', 'CRAFT', 'SAKE', 'STRAW', 'GOHEI'))},
        **{f'KB{i}': _rect(512 + (i % 2) * 256, 832 - (i // 2) * 64, 256, 64, png(f'KI_KB{i}', 0.35)) for i in range(4)},
        **{f'KB{i}': _rect((i - 4) * 256, 704, 256, 64, png(f'KI_KB{i}', 0.35)) for i in range(4, 6)},
        'KB6': _rect(0, 384, 256, 64, png('KI_KB6', 0.35)),
        **{f'ANDON{i}': _rect(512 + i * 64, 704, 64, 64, png(f'KI_ANDON{i}', 0.3, emit=0.85)) for i in range(4)},
        'CHOCHIN0': _rect(768, 704, 128, 64, png('KI_CHOCHIN0', 0.3, emit=0.8)),
        'CHOCHIN1': _rect(896, 704, 128, 64, png('KI_CHOCHIN1', 0.3, emit=0.8)),
        **{f'KV{i}': _rect(i * 64, 448, 64, 256, png(f'KI_KV{i}', 0.35)) for i in range(4)},
        **{f'NOREN{i}': _rect(256 + i * 128, 608, 128, 96, png(f'KI_NOREN{i}', 0.15)) for i in range(5)},
        'WARAJI':  _rect(256, 480, 64, 128, png('KI_WARAJI', 0.15)),
        'LOGS':    _rect(320, 544, 128, 64, png('KI_LOGS', 0.15)),
        'KAGO':    _rect(448, 544, 64, 64, png('KI_KAGO', 0.2)),
        'MENU':    _rect(512, 512, 64, 96, png('KI_MENU', 0.3)),
        'BUCKET':  _rect(576, 576, 64, 32, png('KI_BUCKET', 0.5)),
        'SUDARE':  _rect(640, 480, 64, 128, png('KI_SUDARE', 0.2)),
        'NOBORI0': _rect(704, 576, 128, 32, png('KI_NOBORI0', 0.2)),
        'NOBORI1': _rect(704, 544, 128, 32, png('KI_NOBORI1', 0.2)),
        **_cells([
            ('WOOD_DARK',   flat('#33261c', 0.3, dirt=0.12)),
            ('WOOD_LIGHT',  flat('#8a6a48', 0.35, dirt=0.12)),
            ('LACQUER_RED', flat('#8a1f1a', 0.7, dirt=0.03)),
            ('LACQUER_BLACK', flat('#1a1412', 0.75, dirt=0.03)),
            ('FELT_RED',    flat('#b3202a', 0.1, dirt=0.05)),
            ('PARASOL_RED', flat('#c42a22', 0.3, dirt=0.05)),
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('BRASS',       flat('#a08440', 0.55, 0.9, dirt=0.05)),
            ('CEDAR',       flat('#5a5a2e', 0.15, dirt=0.1)),
            ('STRAW',       flat('#c9b07a', 0.2, dirt=0.15)),
            ('PAPER',       flat('#f4ecd8', 0.2, dirt=0.05)),
            ('LIT_WARM',    emissive('#ffc985')),
            ('NOREN_NAVY',  flat('#1d2a4a', 0.15, dirt=0.0)),
            ('WHITE',       flat('#efe9dc', 0.3, dirt=0.1)),
            ('HINOKI',      flat('#c9a77a', 0.35, dirt=0.08)),
            ('BARK',        flat('#4a3a2c', 0.1, dirt=0.15)),
            ('END_GRAIN',   flat('#a8845a', 0.2, dirt=0.1)),
            ('POT_CLAY',    flat('#8a4a2c', 0.3, dirt=0.2)),
            ('LEAF',        flat('#3c5a2a', 0.3, dirt=0.0)),
            ('BLACK',       flat('#151617', 0.4, dirt=0.0)),
            ('BUCKET_RED',  flat('#b3202a', 0.5, dirt=0.1)),
            ('STONE',       flat('#7e7f80', 0.25, dirt=0.2)),
            ('BAMBOO',      flat('#a48d5e', 0.35, dirt=0.1)),
            ('INDIGO',      flat('#24324a', 0.15, dirt=0.0)),
            ('GREEN_TEA',   flat('#4a6a2a', 0.3, dirt=0.05)),
            ('STEEL',       flat('#9a9ca0', 0.6, 1.0, dirt=0.1)),
            ('BOX_YELLOW',  flat('#e8b51a', 0.4, dirt=0.05)),
            ('BOX_PURPLE',  flat('#5a2a6a', 0.4, dirt=0.05)),
            ('BOX_ORANGE',  flat('#d8642c', 0.4, dirt=0.05)),
            ('STRAW_DARK',  flat('#9a8452', 0.2, dirt=0.15)),
        ], 0, 0, 16, 64, 32),
    },
    'Gassho': {   # gassho farmhouses: thatch 2 m courses at 48 px/m, walls 1.5 m strips at 64 px/m, ground 48 px/m
        'KAYA':          _strip(928, 96, kaya('#8a7658'), ppm=48),
        'KAYA_OLD':      _strip(832, 96, kaya('#6c6455', moss=0.8), ppm=48),
        'KAYA_NEW':      _strip(736, 96, kaya('#ad9160'), ppm=48),
        'WOOD_TATE':     _strip(640, 96, tate_ita('#4a3a2c'), ppm=64),
        'WOOD_BOARD':    _strip(544, 96, wood_board('#433226'), ppm=64),
        'ROAD':          _strip(480, 64, road_earth('#867c6c'), ppm=48),
        'GRASS':         _strip(416, 64, grass(), ppm=48),
        'ISHIGAKI':      _strip(352, 64, ishigaki(stone_m=(0.45, 0.3), ppm=48), ppm=48),
        'PADDY':         _strip(288, 64, paddy(), ppm=48),
        'KAYA_UNDER':    _strip(240, 48, kaya('#3e3326', course=False), ppm=48),
        'KAYA_EDGE':     _strip(192, 48, kaya_edge(), ppm=48),
        'STONE':         _strip(160, 32, stone('#7e7f80', dirt=0.3), ppm=64),
        'WOOD':          _strip(128, 32, wood('#33261c'), ppm=48),
        'WOOD_LIGHT':    _strip(96, 32, wood('#5a4430', smooth=0.3), ppm=48),
        'SHOJI':         _rect(0, 0, 64, 64, shoji(lit=True)),
        'SHOJI_DARK':    _rect(64, 0, 64, 64, shoji(lit=False)),
        'KOSHI_LIT':     _rect(128, 0, 64, 64, koshi_tex(True)),
        'KOSHI_DARK':    _rect(192, 0, 64, 64, koshi_tex(False)),
        'HASA_STRAW':    _rect(0, 64, 64, 32, straw_bundle()),
        **_cells([
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('INTERIOR',    flat('#0b0a09', 0.2, dirt=0.0)),
            ('LIGHT_WARM',  emissive('#ffb768')),
            ('WOOD_FLAT',   flat('#33261c', 0.3, dirt=0.12)),
            ('WOOD_LIGHT_FLAT', flat('#5a4430', 0.3, dirt=0.12)),
            ('WOOD_BOARD_FLAT', flat('#433226', 0.25, dirt=0.15)),
            ('WOOD_TATE_FLAT', flat('#4a3a2c', 0.2, dirt=0.15)),
            ('WOOD_GREY_FLAT', flat('#5d5650', 0.2, dirt=0.1)),
            ('STONE_FLAT',  flat('#7e7f80', 0.25, dirt=0.2)),
            ('STONE_A',     flat('#6a6965', 0.2, dirt=0.25)),
            ('STONE_B',     flat('#5e5850', 0.2, dirt=0.25)),
            ('STONE_C',     flat('#525a46', 0.15, dirt=0.25)),
            ('KAYA_FLAT',   flat('#6e5e46', 0.12, dirt=0.1)),
            ('KAYA_RIDGE',  flat('#57503f', 0.12, dirt=0.05)),
            ('ROPE',        flat('#8a7650', 0.15, dirt=0.05)),
            ('BAMBOO',      flat('#a48d5e', 0.4, dirt=0.1)),
            ('BAMBOO_DARK', flat('#6e6040', 0.35, dirt=0.1)),
            ('WATER',       flat('#1a2528', 0.95, dirt=0.0)),
            ('MOSS',        flat('#4d5a2c', 0.1, dirt=0.1)),
            ('END_GRAIN',   flat('#7a5c40', 0.2, dirt=0.15)),
            ('CHANNEL',     flat('#4a4842', 0.5, dirt=0.3)),
            ('EARTH',       flat('#5a4a3a', 0.1, dirt=0.2)),
            ('GRAVEL',      flat('#77746c', 0.15, dirt=0.15)),
            ('STRAW',       flat('#c2a66e', 0.2, dirt=0.15)),
            ('STRAW_DARK',  flat('#8e7a4c', 0.2, dirt=0.15)),
            ('PLASTER_EARTH_FLAT', flat('#b39a74', 0.2, dirt=0.15)),
            ('PLASTER_WHITE_FLAT', flat('#e2dccf', 0.25, dirt=0.1)),
            ('TILE_DARK',   flat('#353b43', 0.4, dirt=0.15)),
            ('GLASS',       flat('#1c242b', 0.92, dirt=0.0)),
            ('RED',         flat('#a8231c', 0.45, dirt=0.1)),
            ('LEAF',        flat('#3c5a2a', 0.3, dirt=0.0)),
            ('BARK',        flat('#4a3a2c', 0.1, dirt=0.15)),
            ('PAPER',       flat('#e8e0cc', 0.2, dirt=0.05)),
            ('SNOWBOARD',   flat('#5a4c3e', 0.2, dirt=0.15)),
        ], 256, 0, 12, 64, 32),
    },
    'GasshoShop': {   # dressing of the gassho village: interiors, boards, noren, persimmons, firewood, fire hut sign
        **{f'INT_{k}': _rect(i * 256, 896, 256, 128, png(f'GA_INT_{k}', 0.6, emit=0.85))
           for i, k in enumerate(('IRORI', 'CAFE', 'SHOP'))},
        'KB0': _rect(768, 960, 256, 64, png('GA_KB0', 0.35)),
        'KB1': _rect(768, 896, 256, 64, png('GA_KB1', 0.35)),
        'KB2': _rect(0, 832, 256, 64, png('GA_KB2', 0.35)),
        'KB3': _rect(256, 832, 256, 64, png('GA_KB3', 0.35)),
        **{f'KV{i}': _rect(i * 64, 576, 64, 256, png(f'GA_KV{i}', 0.35)) for i in range(3)},
        **{f'NOREN{i}': _rect(192 + i * 128, 736, 128, 96, png(f'GA_NOREN{i}', 0.15)) for i in range(3)},
        'ANDON0':  _rect(576, 768, 64, 64, png('GA_ANDON0', 0.3, emit=0.85)),
        'ANDON1':  _rect(640, 768, 64, 64, png('GA_ANDON1', 0.3, emit=0.85)),
        'MENU':    _rect(704, 736, 64, 96, png('GA_MENU', 0.3)),
        'HOSUI':   _rect(768, 768, 128, 64, png('GA_HOSUI', 0.4)),
        'HOKORA':  _rect(896, 704, 64, 128, png('GA_HOKORA', 0.4)),
        'LOGS':    _rect(512, 832, 128, 64, png('KI_LOGS', 0.15)),
        'KAGO':    _rect(640, 832, 64, 64, png('KI_KAGO', 0.2)),
        'BUCKET':  _rect(704, 832, 64, 32, png('KI_BUCKET', 0.5)),
        'WARAJI':  _rect(192, 576, 64, 128, png('KI_WARAJI', 0.15)),
        'NOBORI0': _rect(256, 672, 128, 32, png('GA_NOBORI0', 0.2)),
        **_cells([
            ('WOOD_DARK',   flat('#33261c', 0.3, dirt=0.12)),
            ('WOOD_LIGHT',  flat('#8a6a48', 0.35, dirt=0.12)),
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('BLACK',       flat('#151617', 0.4, dirt=0.0)),
            ('WHITE',       flat('#efe9dc', 0.3, dirt=0.1)),
            ('STRAW',       flat('#c9b07a', 0.2, dirt=0.15)),
            ('STRAW_DARK',  flat('#9a8452', 0.2, dirt=0.15)),
            ('BARK',        flat('#4a3a2c', 0.1, dirt=0.15)),
            ('END_GRAIN',   flat('#a8845a', 0.2, dirt=0.1)),
            ('STONE',       flat('#7e7f80', 0.25, dirt=0.2)),
            ('POT_CLAY',    flat('#8a4a2c', 0.3, dirt=0.2)),
            ('INDIGO',      flat('#24324a', 0.15, dirt=0.0)),
            ('LEAF',        flat('#3c5a2a', 0.3, dirt=0.0)),
            ('LIT_WARM',    emissive('#ffc985')),
            ('NOREN_NAVY',  flat('#1d2a4a', 0.15, dirt=0.0)),
            ('BUCKET_RED',  flat('#b3202a', 0.5, dirt=0.1)),
            ('FELT_RED',    flat('#b3202a', 0.1, dirt=0.05)),
            ('PARASOL_RED', flat('#c42a22', 0.3, dirt=0.05)),
            ('BAMBOO',      flat('#a48d5e', 0.35, dirt=0.1)),
            ('STEEL',       flat('#9a9ca0', 0.6, 1.0, dirt=0.1)),
            ('PAPER',       flat('#f4ecd8', 0.2, dirt=0.05)),
            ('KAKI',        flat('#d8661e', 0.45, dirt=0.0)),
            ('KAKI_DRY',    flat('#9a3e16', 0.35, dirt=0.0)),
            ('DAIKON',      flat('#e8e2cc', 0.3, dirt=0.05)),
            ('GREEN',       flat('#5a7a2a', 0.3, dirt=0.0)),
            ('ROPE',        flat('#8a7650', 0.15, dirt=0.05)),
            ('RED',         flat('#b8261c', 0.5, dirt=0.05)),
            ('HOSE_RED',    flat('#c43a22', 0.55, 0.3, dirt=0.05)),
            ('BRASS',       flat('#a08440', 0.55, 0.9, dirt=0.05)),
            ('WOOD_GREY',   flat('#6a625a', 0.2, dirt=0.1)),
            ('ONION',       flat('#b07a40', 0.35, dirt=0.0)),
            ('LACQUER_RED', flat('#8a1f1a', 0.7, dirt=0.03)),
        ], 0, 0, 16, 64, 32),
    },
    'Minato': {   # fishing village + harbour: corrugated sheets 1.8 m courses (2 m strips 48 px/m), boards, quay walls, apron
        'TOTAN_RUST':    _strip(928, 96, totan('#7a6a5a', rust=0.9, painted=False), ppm=48),
        'TOTAN_BLUE':    _strip(832, 96, totan('#4f7f8c', rust=0.45), ppm=48),
        'TOTAN_RED':     _strip(736, 96, totan('#8a3a2c', rust=0.4), ppm=48),
        'TOTAN_GREY':    _strip(640, 96, totan('#9a9d9e', rust=0.3, painted=False), ppm=48),
        'WOOD_TATE':     _strip(544, 96, tate_ita('#3e3026'), ppm=48),
        'WOOD_BOARD':    _strip(448, 96, wood_board('#463428', board_m=0.21, ppm=48), ppm=48),
        'QUAY':          _strip(352, 96, quay(), ppm=48),
        'QUAY_STONE':    _strip(256, 96, quay('#86837c', blocks=True), ppm=48),
        'APRON':         _strip(192, 64, apron(), ppm=32),
        'DECK':          _strip(160, 32, deck(), ppm=64),
        'WOOD':          _strip(128, 32, wood('#33261c'), ppm=48),
        'STONE':         _strip(96, 32, stone('#7e7f80', dirt=0.3), ppm=64),
        'SHOJI':         _rect(0, 0, 64, 64, shoji(lit=True)),
        'SHOJI_DARK':    _rect(64, 0, 64, 64, shoji(lit=False)),
        'ONI':           _rect(128, 0, 64, 64, oni()),
        'CURTAIN_LIT':   _rect(192, 0, 64, 64, curtain(True)),
        'CURTAIN':       _rect(0, 64, 64, 32, curtain(False)),
        **_cells([
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('INTERIOR',    flat('#0b0a09', 0.2, dirt=0.0)),
            ('LIGHT_WARM',  emissive('#ffb768')),
            ('TILE_A',      flat('#4d5560', 0.45, dirt=0.12)),
            ('TILE_B',      flat('#454c56', 0.4, dirt=0.12)),
            ('TILE_C',      flat('#555d68', 0.5, dirt=0.12)),
            ('TILE_DARK',   flat('#353b43', 0.4, dirt=0.15)),
            ('WOOD_FLAT',   flat('#33261c', 0.3, dirt=0.12)),
            ('WOOD_TATE_FLAT', flat('#3e3026', 0.2, dirt=0.15)),
            ('WOOD_BOARD_FLAT', flat('#463428', 0.25, dirt=0.15)),
            ('WOOD_GREY_FLAT', flat('#6a645c', 0.2, dirt=0.1)),
            ('STONE_FLAT',  flat('#7e7f80', 0.25, dirt=0.2)),
            ('GLASS',       flat('#1c242b', 0.92, dirt=0.0)),
            ('ALU',         flat('#b4b7b8', 0.55, 0.9, dirt=0.08)),
            ('ALU_DARK',    flat('#4a4038', 0.5, 0.6, dirt=0.05)),
            ('SHUTTER',     flat('#a4a6a4', 0.45, 0.6, dirt=0.3)),
            ('CONC_FLAT',   flat('#8f8e88', 0.2, dirt=0.25)),
            ('WATER',       flat('#1b2f33', 0.96, dirt=0.0)),
            ('RUST',        flat('#6e3a1e', 0.2, 0.2, dirt=0.1)),
            ('TOTAN_RUST_FLAT', flat('#6e4a34', 0.2, 0.2, dirt=0.15)),
            ('TOTAN_BLUE_FLAT', flat('#4f7f8c', 0.35, 0.2, dirt=0.15)),
            ('TOTAN_RED_FLAT',  flat('#7e3628', 0.35, 0.2, dirt=0.15)),
            ('TOTAN_GREY_FLAT', flat('#959898', 0.4, 0.5, dirt=0.15)),
            ('PAINT_WHITE', flat('#e6e5df', 0.4, dirt=0.12)),
            ('PAINT_RED',   flat('#b8261c', 0.45, dirt=0.1)),
            ('STEEL_GREEN', flat('#6f8f7a', 0.4, 0.3, dirt=0.15)),
            ('RUBBER',      flat('#1a1a1b', 0.25, dirt=0.05)),
            ('YELLOW',      flat('#e8b51a', 0.4, dirt=0.15)),
            ('TETRA',       flat('#a3a19a', 0.15, dirt=0.3)),
            ('PLASTER_WHITE_FLAT', flat('#dcd8cc', 0.25, dirt=0.15)),
            ('GALV',        flat('#a3a7ab', 0.45, 0.8, dirt=0.1)),
            ('ROPE',        flat('#c2b48a', 0.15, dirt=0.05)),
            ('ALGAE',       flat('#2f4a26', 0.6, dirt=0.1)),
            ('LIGHT_COOL',  emissive('#dff3ff')),
            ('GLASS_FROST', flat('#b8c0c2', 0.6, dirt=0.05)),
            ('GRAVEL',      flat('#77746c', 0.15, dirt=0.15)),
        ], 256, 0, 12, 64, 32),
    },
    'MinatoShop': {   # dressing of the fishing village: interiors, signs, nets, crates, buoys, boats
        **{f'INT_{k}': _rect((i % 4) * 256, 896, 256, 128, png(f'MI_INT_{k}', 0.6, emit=0.85))
           for i, k in enumerate(('MARKET', 'SHOKUDO', 'FUNAGURA', 'SHOP'))},
        **{f'KB{i}': _rect((i % 4) * 256, 832, 256, 64, png(f'MI_KB{i}', 0.35)) for i in range(4)},
        **{f'KV{i}': _rect(i * 64, 576, 64, 256, png(f'MI_KV{i}', 0.35)) for i in range(2)},
        **{f'NOREN{i}': _rect(128 + i * 128, 736, 128, 96, png(f'MI_NOREN{i}', 0.15)) for i in range(2)},
        **{f'NOBORI{i}': _rect(128 + i * 128, 704, 128, 32, png(f'MI_NOBORI{i}', 0.2)) for i in range(2)},
        'MENU':      _rect(384, 736, 64, 96, png('MI_MENU', 0.3)),
        'FISHBOX':   _rect(448, 800, 64, 32, png('MI_FISHBOX', 0.45)),
        'STYRO':     _rect(448, 768, 64, 32, png('MI_STYRO', 0.2)),
        'HIMONO':    _rect(512, 768, 128, 64, png('MI_HIMONO', 0.3)),
        'IKA':       _rect(640, 768, 64, 64, png('MI_IKA', 0.4)),
        'NET_GREEN': _rect(704, 768, 128, 64, png('MI_NET_GREEN', 0.2)),
        'NET_BLUE':  _rect(832, 768, 128, 64, png('MI_NET_BLUE', 0.2)),
        'BOAT0':     _rect(384, 640, 256, 32, png('MI_BOAT0', 0.6)),
        'BOAT1':     _rect(384, 608, 256, 32, png('MI_BOAT1', 0.6)),
        **_cells([
            ('WOOD_DARK',   flat('#33261c', 0.3, dirt=0.12)),
            ('WOOD_LIGHT',  flat('#8a6a48', 0.35, dirt=0.12)),
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('BLACK',       flat('#151617', 0.4, dirt=0.0)),
            ('WHITE',       flat('#efe9dc', 0.3, dirt=0.1)),
            ('STEEL',       flat('#9a9ca0', 0.6, 1.0, dirt=0.1)),
            ('GALV',        flat('#a3a7ab', 0.45, 0.8, dirt=0.1)),
            ('BAMBOO',      flat('#a48d5e', 0.35, dirt=0.1)),
            ('LIT_WARM',    emissive('#ffc985')),
            ('LIT_COOL',    emissive('#e8f6ff')),
            ('NOREN_NAVY',  flat('#1d2a4a', 0.15, dirt=0.0)),
            ('INDIGO',      flat('#24324a', 0.15, dirt=0.0)),
            ('FELT_RED',    flat('#b3202a', 0.1, dirt=0.05)),
            ('PARASOL_RED', flat('#c42a22', 0.3, dirt=0.05)),
            ('LEAF',        flat('#3c5a2a', 0.3, dirt=0.0)),
            ('POT_CLAY',    flat('#8a4a2c', 0.3, dirt=0.2)),
            ('STONE',       flat('#7e7f80', 0.25, dirt=0.2)),
            ('BUOY_ORANGE', flat('#e8661a', 0.55, dirt=0.15)),
            ('BUOY_RED',    flat('#c42a1e', 0.55, dirt=0.15)),
            ('BUOY_YELLOW', flat('#e8b81a', 0.55, dirt=0.15)),
            ('BUOY_WHITE',  flat('#e8e6dc', 0.5, dirt=0.2)),
            ('CRATE_BLUE',  flat('#1f63b0', 0.45, dirt=0.15)),
            ('CRATE_YELLOW', flat('#e8b51a', 0.45, dirt=0.15)),
            ('CRATE_RED',   flat('#b8302a', 0.45, dirt=0.15)),
            ('STYRO_WHITE', flat('#eff0ec', 0.2, dirt=0.15)),
            ('DRUM_BLUE',   flat('#1f4fa0', 0.45, dirt=0.15)),
            ('BOOT_WHITE',  flat('#e8e6de', 0.5, dirt=0.25)),
            ('BOOT_BLACK',  flat('#1c1c1e', 0.5, dirt=0.1)),
            ('ROPE',        flat('#c2b48a', 0.15, dirt=0.05)),
            ('ROPE_BLUE',   flat('#2a5aa0', 0.25, dirt=0.05)),
            ('ROPE_GREEN',  flat('#3a7a4a', 0.25, dirt=0.05)),
            ('NET_DARK',    flat('#1f3a2a', 0.2, dirt=0.05)),
            ('HULL_WHITE',  flat('#eceae2', 0.55, dirt=0.18)),
            ('HULL_BLUE',   flat('#1f4f90', 0.55, dirt=0.05)),
            ('HULL_RED',    flat('#8a2a22', 0.35, dirt=0.05)),
            ('DECK_GREY',   flat('#8a8c88', 0.3, dirt=0.2)),
            ('FISH_SILVER', flat('#8a96a0', 0.7, 0.3, dirt=0.0)),
            ('SQUID',       flat('#ead8be', 0.4, dirt=0.05)),
            ('LAMP_GLASS',  flat('#e8eef0', 0.9, dirt=0.0)),
            ('RUBBER',      flat('#1a1a1b', 0.25, dirt=0.05)),
            ('RUST',        flat('#6e3a1e', 0.2, 0.2, dirt=0.1)),
            ('PLASTIC_GREEN', flat('#3a8a4a', 0.45, dirt=0.1)),
            ('GLASS',       flat('#1c242b', 0.92, dirt=0.0)),
            ('BRASS',       flat('#a08440', 0.55, 0.9, dirt=0.05)),
            ('PAPER',       flat('#f4ecd8', 0.2, dirt=0.05)),
            ('CHALK_GREEN', flat('#22302a', 0.2, dirt=0.0)),
            ('ANTENNA',     flat('#dcdcd6', 0.5, 0.3, dirt=0.05)),
            ('WOOD_GREY',   flat('#6a625a', 0.2, dirt=0.1)),
        ], 0, 0, 16, 64, 32),
    },
}


def build_maps(name, seed=1):
    """Return (base, mask, emit) as float32 RGBA arrays (SIZE, SIZE, 4)."""
    base = np.zeros((SIZE, SIZE, 4), np.float32); base[..., 3] = 1
    mask = np.zeros((SIZE, SIZE, 4), np.float32); mask[..., 1] = 1  # AO = 1
    emit = np.zeros((SIZE, SIZE, 4), np.float32); emit[..., 3] = 1
    base[..., :3] = 0.5
    for i, (rname, reg) in enumerate(sorted(LAYOUTS[name].items())):
        x, y, w, h = reg['rect']
        assert x + w <= SIZE and y + h <= SIZE, rname
        rng = np.random.default_rng(seed * 1000 + i)
        o = reg['gen'](w, h, rng)
        base[y:y + h, x:x + w, :3] = o['rgb']
        mask[y:y + h, x:x + w, 0] = o['metal']
        mask[y:y + h, x:x + w, 3] = o['smooth']
        if o['emit'] is not None:
            emit[y:y + h, x:x + w, :3] = np.clip(o['emit'], 0, 1)
    _check_overlap(name)
    return base, mask, emit


def _check_overlap(name):
    regs = list(LAYOUTS[name].items())
    for i, (a, ra) in enumerate(regs):
        ax, ay, aw, ah = ra['rect']
        for b, rb in regs[i + 1:]:
            bx, by, bw, bh = rb['rect']
            if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah:
                raise ValueError(f'atlas {name}: regions {a} and {b} overlap')


def uv_rect(name, region, margin_px=2):
    """Region rect in UV space (u0, v0, u1, v1), shrunk by a margin against bleeding."""
    x, y, w, h = LAYOUTS[name][region]['rect']
    m = margin_px
    return ((x + m) / SIZE, (y + m) / SIZE, (x + w - m) / SIZE, (y + h - m) / SIZE)


def region(name, rname):
    reg = LAYOUTS[name][rname]
    x, y, w, h = reg['rect']
    ppm = reg.get('ppm', PPM)
    return dict(atlas=name, name=rname, kind=reg['kind'], uv=uv_rect(name, rname),
                w_m=w / ppm, h_m=h / ppm)
