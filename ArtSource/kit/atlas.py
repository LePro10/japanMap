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


def block_wall(col='#a19f98', bw=0.40, bh=0.20, ppm=128):
    """Concrete block wall (burokku-bei): 390 x 190 blocks, 10 mm joints, running bond."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        X, Y = x / ppm, y / ppm
        row = np.floor(Y / bh)
        xs = X + (row % 2) * bw / 2
        col_i = np.floor(xs / bw) % (w / ppm / bw)
        jx = np.abs(xs - np.round(xs / bw) * bw); jy = np.abs(Y - np.round(Y / bh) * bh)
        joint = smoothstep(0.009, 0.004, np.minimum(jx, jy))
        tv = (np.sin((row * 31 + col_i * 17) * 12.9898) * 43758.5453) % 1.0
        n = fbm(w, h, w // 32, max(2, h // 32), rng, 4)
        f = (0.85 + 0.12 * tv + 0.12 * n) * (1 - 0.35 * joint)
        f *= rain_streaks(w, h, rng, 0.15) * grime(w, h, rng, 0.3, 0.25)
        return _out(srgb(col) * f[..., None], 0.2)
    return gen


def bamboo(col='#b59b62', node_m=0.4, ppm=128):
    """Split, aged bamboo: fibres along U, darker node rings every node_m (U)."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        fib = value_noise(w, h, max(4, w // 64), h // 2, rng)
        d = np.abs(((x / ppm) % node_m) - node_m / 2)
        node = smoothstep(0.02, 0.006, np.abs(d - node_m / 2))
        f = (0.85 + 0.25 * fib) * (1 - 0.35 * node)
        return _out(srgb(col) * f[..., None], 0.4 + 0.15 * fib)
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
        ], 640, 256, 6),
    },
    'Street': {  # street furniture; strips at 128 px/m
        'CONCRETE_POLE': _strip(896, 128, concrete_pole()),
        'GALV':          _strip(832, 64, galvanized()),
        'BLOCK_WALL':    _strip(640, 192, block_wall()),
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
