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


# ── atlas layouts (pixel rects: x, y, w, h; y from the bottom) ──────────────

def _cells(names_gens, x0, y0, cols, size=64):
    out = {}
    for i, (name, gen) in enumerate(names_gens):
        out[name] = dict(kind='cell', rect=(x0 + (i % cols) * size, y0 + (i // cols) * size, size, size), gen=gen)
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
