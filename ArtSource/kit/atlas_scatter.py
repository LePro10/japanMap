"""Atlas `Scatter` (task 5a, props strewn over the map): tetrapods, roadside
delineators and snow poles, concrete retaining walls (cast in formwork, kenchi
block, lattice frame on a cut slope), plastic greenhouses, Jizo, graves and
sotoba, single nobori flags, the event board.

Japanese surface cues live here: the formwork wall shows its 0.9 x 1.8 m panel
seams and the grid of plugged form-tie holes (P-con), white efflorescence at
the joints and black algae runs from the top; the kenchi wall its diagonal
blocks (tani-zumi); polished black granite for graves, weathered mossy stone
for Jizo and old graves."""
import numpy as np
from .atlas import (_out, srgb, fbm, value_noise, smoothstep, vgrad, flat, emissive, png, stone, grime,
                    rain_streaks, _cells, _strip, _rect)


def formwork(col='#a3a19b', ppm=96, panel=(0.9, 1.8), tie=(0.45, 0.6), tie_z0=0.3):
    """Cast-in-place concrete (genba-uchi): faint plywood panel seams, a grid
    of plugged form-tie holes (P-con: dark disc, light mortar ring), white
    efflorescence along the seams near the foot, black algae runs from the top."""
    def gen(w, h, rng):
        W = w / ppm
        X = (np.arange(w)[None, :] + 0.5) / ppm + np.zeros((h, 1))
        Y = (np.arange(h)[:, None] + 0.5) / ppm + np.zeros((1, w))
        n = fbm(w, h, w // 48, max(2, h // 48), rng, 4)
        px = np.floor(X / panel[0]); pz = np.floor(Y / panel[1])
        ptone = 0.94 + 0.08 * ((np.sin(px * 12.9898 + pz * 78.233) * 43758.5453) % 1.0)
        f = (0.86 + 0.18 * n) * ptone
        sx = np.minimum(X % panel[0], panel[0] - X % panel[0]); sz = np.minimum(Y % panel[1], panel[1] - Y % panel[1])
        seam = np.maximum(smoothstep(0.012, 0.0, sx), smoothstep(0.012, 0.0, sz))
        f *= 1 - 0.18 * seam
        # P-con: plugged tie holes, 30 mm, ring of lighter mortar
        tx = np.abs(((X + tie[0] / 2) % tie[0]) - tie[0] / 2)
        tz = np.abs(((Y - tie_z0 + tie[1] / 2) % tie[1]) - tie[1] / 2)
        r = np.sqrt(tx ** 2 + tz ** 2)
        f = np.where(r < 0.016, f * 0.62, np.where(r < 0.028, f * 1.08, f))
        pores = rng.random((h, w))
        f = np.where(pores > 0.992, f * 0.75, f)
        rgb = srgb(col) * f[..., None]
        # efflorescence: white lime bleeding out of seams, lower half
        eff = seam * smoothstep(0.6, 0.0, Y / (h / ppm)) * smoothstep(0.45, 0.7, value_noise(w, h, w // 20, 3, rng))
        eff = np.maximum(eff, smoothstep(0.6, 0.85, value_noise(w, h, w // 8, 3, rng)) * smoothstep(0.25, 0.0, Y) * 0.5)
        rgb = rgb * (1 - 0.6 * eff[..., None]) + srgb('#e4e2da') * (0.6 * eff)[..., None]
        # black algae runs hanging from the top edge (kuro-kabi), broken
        top = 1 - vgrad(w, h)
        runs = smoothstep(0.62, 0.8, value_noise(w, h, w // 5, 1, rng)) * smoothstep(0.55, 0.0, top + 0.25 * value_noise(w, h, w // 12, 4, rng))
        rgb *= (1 - 0.45 * runs)[..., None]
        rgb *= (rain_streaks(w, h, rng, 0.1) * grime(w, h, rng, 0.22, 0.2))[..., None]
        return _out(rgb, 0.18 + 0.06 * n)
    return gen


def kenchi(col='#9a978f', ppm=96, period_px=64):
    """Kenchi-block retaining wall laid diagonally (tani-zumi): square block
    faces on the point, each its own tone, slightly domed (lit top, shadowed
    lower edge), sunken mortar joints. period_px divides the atlas width."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        p = float(period_px)
        a = (x + y) / p; b = (x - y) / p          # rotated grid: blocks on the point
        ia, ib = np.floor(a), np.floor(b)
        fa, fb = a - ia, b - ib
        edge = np.minimum(np.minimum(fa, 1 - fa), np.minimum(fb, 1 - fb))   # 0 at the joint
        key = (ia * 7.31 + (ib % (2 * w / p)) * 3.17)
        tone = 0.82 + 0.26 * ((np.sin(key * 12.9898) * 43758.5453) % 1.0)
        n = fbm(w, h, w // 16, max(2, h // 16), rng, 4)
        lit = 0.9 + 0.16 * (fa - fb) * smoothstep(0.0, 0.15, edge)    # upper half of the block brighter
        f = tone * lit * (0.88 + 0.2 * n)
        pores = rng.random((h, w))
        f = np.where(pores > 0.985, f * 0.72, f)
        joint = smoothstep(0.045, 0.02, edge)
        rgb = srgb(col) * f[..., None]
        rgb = rgb * (1 - joint[..., None]) + srgb('#5a5852') * ((0.8 + 0.3 * n) * joint)[..., None]
        moss = smoothstep(0.76, 0.8, fbm(w, h, w // 40, max(2, h // 40), rng, 4) + 0.08 * joint)
        rgb = rgb * (1 - 0.7 * moss[..., None]) + srgb('#4a5529') * (0.7 * moss)[..., None]
        rgb *= (rain_streaks(w, h, rng, 0.14) * grime(w, h, rng, 0.25, 0.2))[..., None]
        return _out(rgb, 0.12 + 0.05 * n)
    return gen


def tetra_concrete(col='#a8a59d'):
    """Precast armour concrete: coarse, pitted, blotchy, with a darker damp band
    at the foot (sea spray, algae) and salt-white patches."""
    def gen(w, h, rng):
        n = fbm(w, h, w // 24, max(2, h // 24), rng, 5)
        f = 0.8 + 0.3 * n
        pores = rng.random((h, w))
        f = np.where(pores > 0.988, f * 0.8, f)       # fine pits, not spots
        f = np.where(pores < 0.01, f * 1.08, f)
        g = vgrad(w, h)
        damp = smoothstep(0.32, 0.05, g + 0.12 * value_noise(w, h, w // 16, 2, rng))
        rgb = srgb(col) * f[..., None]
        rgb = rgb * (1 - 0.5 * damp[..., None]) + srgb('#3c4436') * (0.35 * damp)[..., None]
        salt = smoothstep(0.7, 0.82, fbm(w, h, w // 32, max(2, h // 16), rng, 3)) * (1 - damp)
        rgb = rgb * (1 - 0.3 * salt[..., None]) + srgb('#dcdad2') * (0.3 * salt)[..., None]
        rgb *= rain_streaks(w, h, rng, 0.12)[..., None]
        return _out(rgb, 0.12 + 0.08 * n)
    return gen


def film(col='#dfe3dc', ppm=32):
    """Greenhouse film (nō-bi): milky, glossy, long soft folds along the hoop
    (V), sheen bands, soil splash and green algae at the foot."""
    def gen(w, h, rng):
        fold = value_noise(w, h, w // 6, max(2, h // 40), rng)
        sheen = value_noise(w, h, w // 20, 2, rng)
        f = 0.9 + 0.1 * fold + 0.06 * sheen
        rgb = srgb(col) * f[..., None]
        g = vgrad(w, h)
        foot = smoothstep(0.18, 0.0, g + 0.05 * value_noise(w, h, w // 4, 2, rng))
        rgb = rgb * (1 - 0.35 * foot[..., None]) + srgb('#6f7a4c') * (0.25 * foot)[..., None]
        dust = smoothstep(0.6, 0.9, fbm(w, h, w // 16, max(2, h // 16), rng, 3))
        rgb *= (1 - 0.08 * dust)[..., None]
        return _out(rgb, 0.62 + 0.1 * sheen)
    return gen


def granite_polished(col='#3f4144'):
    """Polished grave granite (black/grey mikage): fine salt-and-pepper, glossy."""
    def gen(w, h, rng):
        speck = rng.random((h, w))
        n = fbm(w, h, w // 32, max(2, h // 16), rng, 3)
        f = 0.9 + 0.15 * n
        f = np.where(speck > 0.86, f * 1.5, f)
        f = np.where(speck < 0.08, f * 0.6, f)
        rgb = srgb(col) * f[..., None] * grime(w, h, rng, 0.15, 0.15)[..., None]
        return _out(rgb, 0.72 + 0.05 * n)
    return gen


def grass_mat(col='#58662f'):
    """Planted slope cell (seed mat grown in): tufts, darker bare soil spots."""
    def gen(w, h, rng):
        n = fbm(w, h, w // 8, max(2, h // 8), rng, 4)
        tuft = value_noise(w, h, w // 2, max(2, h // 2), rng)
        f = 0.7 + 0.35 * n + 0.15 * (tuft - 0.5)
        rgb = srgb(col) * f[..., None]
        bare = smoothstep(0.72, 0.8, fbm(w, h, w // 24, max(2, h // 12), rng, 3))
        rgb = rgb * (1 - bare[..., None]) + srgb('#5a4a3a') * (bare * f)[..., None]
        dry = smoothstep(0.6, 0.8, value_noise(w, h, w // 32, 3, rng))
        rgb = rgb * (1 - 0.35 * dry[..., None]) + srgb('#8a7f52') * (0.35 * dry * f)[..., None]
        return _out(rgb * grime(w, h, rng, 0.2, 0.15)[..., None], 0.08)
    return gen


def layout():
    return {
        'WALL_CONC':   _strip(816, 208, formwork(), ppm=96),           # 10.7 m x 2.17 m
        'KENCHI':      _strip(608, 208, kenchi(), ppm=96),
        'TETRA':       _strip(480, 128, tetra_concrete(), ppm=48),     # 21 m x 2.67 m (piles)
        'FILM':        _strip(352, 128, film(), ppm=32),               # 32 m x 4 m
        'GRANITE':     _strip(288, 64, granite_polished(), ppm=96),    # 0.67 m
        'STONE_OLD':   _strip(224, 64, stone('#7a7870', moss=0.55, dirt=0.3), ppm=64),   # 1 m
        'GRASS':       _strip(160, 64, grass_mat(), ppm=32),           # 2 m: planted cells of a slope frame
        'SOTOBA_A':    _rect(0, 0, 32, 128, png('SC_SOTOBA_A', 0.2)),
        'SOTOBA_B':    _rect(32, 0, 32, 128, png('SC_SOTOBA_B', 0.2)),
        'SOTOBA_C':    _rect(64, 0, 32, 128, png('SC_SOTOBA_C', 0.2)),
        'NOBORI_A':    _rect(96, 0, 32, 128, png('SC_NOBORI_A', 0.25)),
        'NOBORI_B':    _rect(128, 0, 32, 128, png('SC_NOBORI_B', 0.25)),
        'NOBORI_C':    _rect(160, 0, 32, 128, png('SC_NOBORI_C', 0.25)),
        'YABANE':      _rect(192, 0, 32, 128, png('SC_YABANE', 0.45)),
        'GRAVE_A':     _rect(224, 0, 32, 96, png('SC_GRAVE_A', 0.72)),
        'GRAVE_B':     _rect(256, 0, 32, 96, png('SC_GRAVE_B', 0.72)),
        'GRAVE_C':     _rect(288, 0, 32, 96, png('SC_GRAVE_C', 0.3)),
        'EVENT':       _rect(320, 0, 256, 128, png('SC_EVENT', 0.4)),
        'NOTICE':      _rect(224, 96, 96, 64, png('SC_NOTICE', 0.35)),
        **_cells([
            ('PAINT_WHITE',   flat('#e6e7e3', 0.45, dirt=0.15)),
            ('REFLECTOR',     flat('#f08a1c', 0.85, dirt=0.0)),
            ('REFLECTOR_WHITE', flat('#eef2f4', 0.85, dirt=0.0)),
            ('GALV',          flat('#a3a7ab', 0.45, 0.8, dirt=0.1)),
            ('STEEL_DARK',    flat('#2c2d30', 0.45, 0.6, dirt=0.05)),
            ('PVC_GREY',      flat('#9da09c', 0.45, dirt=0.15)),
            ('CONC_FLAT',     flat('#9f9d96', 0.18, dirt=0.25)),
            ('CONC_DARK',     flat('#5e5d58', 0.3, dirt=0.1)),
            ('RED_CLOTH',     flat('#b8202a', 0.15, dirt=0.15)),
            ('RED_KNIT',      flat('#9e1a22', 0.08, dirt=0.1)),
            ('GRANITE_FLAT',  flat('#3c3e41', 0.7, dirt=0.1)),
            ('GRANITE_LIGHT', flat('#93938f', 0.35, dirt=0.25)),
            ('STONE_OLD_FLAT', flat('#74726a', 0.15, dirt=0.25)),
            ('MOSS',          flat('#4d5a2c', 0.1, dirt=0.1)),
            ('WOOD_FLAT',     flat('#5d4330', 0.3, dirt=0.2)),
            ('WOOD_GREY',     flat('#8b8378', 0.2, dirt=0.25)),
            ('WOOD_NEW',      flat('#cbb995', 0.25, dirt=0.1)),
            ('WOOD_DARK',     flat('#33261c', 0.3, dirt=0.12)),
            ('STAINLESS',     flat('#c6c8c9', 0.6, 0.9, dirt=0.05)),
            ('FLOWER_YELLOW', flat('#e3b51c', 0.2, dirt=0.0)),
            ('FLOWER_PURPLE', flat('#7a3f8c', 0.2, dirt=0.0)),
            ('FLOWER_WHITE',  flat('#e9e6dc', 0.2, dirt=0.0)),
            ('LEAF',          flat('#3a5728', 0.3, dirt=0.05)),
            ('CROP',          flat('#5a8436', 0.35, dirt=0.1)),
            ('SOIL',          flat('#3e3127', 0.1, dirt=0.0)),
            ('MULCH',         flat('#1c1c1e', 0.55, dirt=0.0)),
            ('FILM_FLAT',     flat('#d9ddd6', 0.65, dirt=0.15)),
            ('FILM_ROLL',     flat('#b9bdb5', 0.5, dirt=0.1)),
            ('BAND_BLACK',    flat('#1e2022', 0.4, dirt=0.0)),
            ('PLASTIC_GREEN', flat('#2f5a3a', 0.45, dirt=0.1)),
            ('PLASTIC_BLACK', flat('#18191a', 0.5, dirt=0.05)),
            ('PLASTIC_BLUE',  flat('#2f6fb5', 0.5, dirt=0.15)),
            ('CONE_ORANGE',   flat('#e8661a', 0.5, dirt=0.1)),
            ('ROPE',          flat('#b7a47a', 0.15, dirt=0.1)),
            ('ASH',           flat('#5a544c', 0.05, dirt=0.0)),
            ('WATER',         flat('#1b2f33', 0.95, dirt=0.0)),
            ('ROOF_SHEET',    flat('#5f6469', 0.4, 0.6, dirt=0.15)),
            ('PAPER',         flat('#ebe5d4', 0.2, dirt=0.05)),
            ('BLACK',         flat('#121314', 0.35, dirt=0.0)),
            ('YELLOW',        flat('#e8b51a', 0.45, dirt=0.15)),
            ('LED',           emissive('#f3f6ff')),
            ('RUST',          flat('#6b3a1f', 0.15, 0.3, dirt=0.15)),
            ('GRAVEL',        flat('#a29f97', 0.15, dirt=0.15)),
            ('NET',           flat('#d6d8d2', 0.2, dirt=0.1)),
        ], 576, 0, 14, 32),
    }
