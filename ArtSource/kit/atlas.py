"""Procedural texture atlases, one per style (1024²).

Layout per atlas:
- *strips* span the full width, so UVs may run past u=1 and the strip repeats
  horizontally (walls, stone, wood). V is never tiled: either stretched over
  the part height (streaks, grime gradients survive that) or metric (namako).
- *cells* are small swatches: one colour with a soft grime gradient in V.
- *rects* are hand-laid graphics (vending display) mapped 1:1 onto one face.

Three maps per atlas, matching Unity URP/Lit: BaseColor (sRGB), MaskMap
(R metallic, G occlusion, B unused, A smoothness; linear) and Emission (sRGB).
Rows are stored bottom-up like Blender images: row 0 = v 0.
"""
import numpy as np

SIZE = 1024
PX_PER_M = 256  # texel density of strips (see STYLE-KIT.md)


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


def flat(col, smooth=0.35, metal=0.0, noise=0.04, dirt=0.18, streaks=0.0):
    def gen(w, h, rng):
        c = srgb(col)
        n = fbm(w, h, 4, 4, rng, 3)
        f = (1 + noise * (n - 0.5) * 2) * grime(w, h, rng, dirt)
        if streaks:
            s = value_noise(w, h, 24, 2, rng)
            f *= 1 - streaks * smoothstep(0.55, 0.9, s) * (1 - vgrad(w, h) * 0.6)
        return _out(c * f[..., None], smooth, metal)
    return gen


def emissive(col, smooth=0.5):
    def gen(w, h, rng):
        e = np.ones((h, w, 3)) * srgb(col)
        return _out(e * 0.9, smooth, 0.0, e)
    return gen


def stone(col='#7b7972', moss=0.0, dirt=0.25):
    """Granite: soft blotches, salt-and-pepper speckles, rain streaks, optional moss on top."""
    def gen(w, h, rng):
        c = srgb(col)
        blot = fbm(w, h, 8, max(2, h // 64), rng, 5)
        speck = rng.random((h, w))
        f = 0.72 + 0.5 * blot
        lich = smoothstep(0.6, 0.75, fbm(w, h, 20, max(4, h // 24), rng, 3))   # dark lichen spots
        f *= 1 - 0.18 * lich
        f = np.where(speck > 0.985, f * 0.55, f)
        f = np.where(speck < 0.01, f * 1.18, f)
        s = value_noise(w, h, 40, 2, rng)
        f *= 1 - 0.2 * smoothstep(0.5, 0.9, s)
        f *= grime(w, h, rng, dirt, 0.3)
        rgb = c * f[..., None]
        sm = 0.18 + 0.1 * blot
        if moss:
            m = fbm(w, h, 12, max(2, h // 48), rng, 4) + (vgrad(w, h) - 0.5) * 0.6
            m = smoothstep(0.62 - moss * 0.3, 0.72 - moss * 0.3, m)
            mc = srgb('#4d5a2c') * (0.75 + 0.4 * fbm(w, h, 30, 6, rng, 2))[..., None]
            rgb = rgb * (1 - m[..., None]) + mc * m[..., None]
            sm = sm * (1 - m) + 0.08 * m
        return _out(rgb, sm)
    return gen


def plaster(col='#e2dccf', dirt=0.22, streak=0.12, smooth=0.25):
    """Lime plaster (shikkui): near-flat, vertical rain streaks fading upwards."""
    def gen(w, h, rng):
        c = srgb(col)
        n = fbm(w, h, 16, max(2, h // 64), rng, 4)
        s = value_noise(w, h, 90, 3, rng) * value_noise(w, h, 30, 2, rng)
        st = smoothstep(0.25, 0.6, s) * (1 - 0.7 * vgrad(w, h))
        f = (0.95 + 0.08 * n) * (1 - streak * st) * grime(w, h, rng, dirt, 0.22)
        return _out(c * f[..., None], smooth - 0.1 * st)
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


def rooftile(col='#4d5560'):
    """Fired kawara: blue-grey, faint glaze sheen, lighter on the upper edge."""
    def gen(w, h, rng):
        c = srgb(col)
        n = fbm(w, h, 32, max(2, h // 32), rng, 4)
        f = (0.85 + 0.25 * n) * (0.9 + 0.15 * vgrad(w, h))
        return _out(c * f[..., None], 0.35 + 0.2 * n)
    return gen


def vending_display(seed=7):
    """Front window of a drink machine: 3 shelves x 8 dummy drinks, price tags
    and buttons under each. Lit from behind, so most of it also emits."""
    pal = ['#c8102e', '#1d4fa1', '#f2f2f2', '#e8a317', '#2a8c4a', '#5b3a29',
           '#d94f8c', '#111111', '#3fa9d6', '#f5e050', '#7a1f2b', '#ffffff']

    def gen(w, h, rng):
        r = np.random.default_rng(seed)
        rgb = np.ones((h, w, 3)) * srgb('#f4f1ea')
        emit = np.ones((h, w, 3)) * srgb('#fff4e0') * 0.3
        y, x = np.mgrid[0:h, 0:w]
        rows, cols = 3, 8
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


# ── atlas layouts (pixel rects: x, y, w, h; y from the bottom) ──────────────
# Strips: full width. Metric size of a strip = px / PX_PER_M.
# Cells: 64 px swatches in the lower band.

def _cells(names_gens, x0, y0, cols, size=64):
    out = {}
    for i, (name, gen) in enumerate(names_gens):
        out[name] = dict(kind='cell', rect=(x0 + (i % cols) * size, y0 + (i // cols) * size, size, size), gen=gen)
    return out


def _strip(y, h, gen):
    return dict(kind='strip', rect=(0, y, SIZE, h), gen=gen)


LAYOUTS = {
    'Props': {
        'STONE':      _strip(896, 128, stone()),
        'STONE_MOSS': _strip(768, 128, stone(moss=0.6)),
        'WOOD_DARK':  _strip(640, 128, wood()),
        'CONCRETE':   _strip(512, 128, stone('#9b9993', dirt=0.3)),
        'DISPLAY':    dict(kind='rect', rect=(0, 0, 512, 384), gen=vending_display()),
        'CONTROL':    dict(kind='rect', rect=(512, 256, 128, 256), gen=control_panel()),
        **_cells([
            ('VEND_RED',     flat('#b3141c', 0.55, dirt=0.2, streaks=0.15)),
            ('VEND_BLUE',    flat('#1c4a9c', 0.55, dirt=0.2, streaks=0.15)),
            ('VEND_WHITE',   flat('#e6e7e6', 0.55, dirt=0.25, streaks=0.2)),
            ('PLASTIC_BLACK', flat('#141416', 0.55, dirt=0.05)),
            ('PLASTIC_GREY', flat('#7d7e80', 0.45, dirt=0.1)),
            ('STEEL',        flat('#9a9ca0', 0.6, 1.0, dirt=0.15)),
            ('STEEL_DARK',   flat('#2c2d30', 0.45, 0.8, dirt=0.1)),
            ('RUST',         flat('#6b3a1f', 0.15, 0.3, noise=0.15, dirt=0.2)),
            ('INTERIOR',     flat('#0c0c0d', 0.2, dirt=0.0)),
            ('LIGHT_WARM',   emissive('#ffb768')),
            ('LIGHT_PAPER',  emissive('#ffd9a0')),
            ('LIGHT_COOL',   emissive('#dff3ff')),
            ('VERMILION',    flat('#c4381c', 0.4, dirt=0.25, streaks=0.2)),
            ('SOOT',         flat('#1b1a19', 0.15, noise=0.12, dirt=0.0)),
        ], 640, 256, 6),
    },
    'Kura': {
        'PLASTER_WHITE': _strip(768, 256, plaster()),
        'PLASTER_BLACK': _strip(640, 128, plaster('#1a1a1c', dirt=0.1, streak=0.12, smooth=0.55)),
        'NAMAKO':        _strip(384, 256, namako()),
        'WOOD_DARK':     _strip(256, 128, wood()),
        'ROOFTILE':      _strip(128, 128, rooftile()),
        'STONE':         _strip(64, 64, stone('#7e7c76', dirt=0.3)),
        **_cells([
            ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
            ('INTERIOR',    flat('#0b0a09', 0.2, dirt=0.0)),
            ('LIGHT_WARM',  emissive('#ffb768')),
            ('TILE_DARK',   flat('#353b43', 0.4, dirt=0.15)),
            ('PLASTER_EDGE', flat('#d6d0c4', 0.25, dirt=0.3)),
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
        rng = np.random.default_rng(seed * 1000 + i)
        o = reg['gen'](w, h, rng)
        base[y:y + h, x:x + w, :3] = o['rgb']
        mask[y:y + h, x:x + w, 0] = o['metal']
        mask[y:y + h, x:x + w, 3] = o['smooth']
        if o['emit'] is not None:
            emit[y:y + h, x:x + w, :3] = np.clip(o['emit'], 0, 1)
    return base, mask, emit


def uv_rect(name, region, margin_px=2):
    """Region rect in UV space (u0, v0, u1, v1), shrunk by a margin against bleeding."""
    x, y, w, h = LAYOUTS[name][region]['rect']
    m = margin_px
    return ((x + m) / SIZE, (y + m) / SIZE, (x + w - m) / SIZE, (y + h - m) / SIZE)


def region(name, rname):
    reg = LAYOUTS[name][rname]
    x, y, w, h = reg['rect']
    return dict(atlas=name, name=rname, kind=reg['kind'], uv=uv_rect(name, rname),
                w_m=w / PX_PER_M, h_m=h / PX_PER_M)
