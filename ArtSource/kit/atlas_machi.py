"""Atlases `Machi` + `MachiShop` (task 5b, the modern town): car dealer and
workshop at Sakura Commons, modern prefab houses (Koedo outskirts), and the
dressing of the wooden izakaya of the Tokyo yokochō alleys (their structure
uses the Minato atlas: boards and corrugated iron fit as they are).

Why a new atlas: no existing one has ceramic siding, galvalume, slate roofs,
showroom tiles, an epoxy workshop floor or brick (Minato and Tokyo are full).

Japanese surface cues: ceramic siding (yōgyō-kei sidingu) in 455 mm panels -
tile-embossed, grooved lap lines, wood grain - with sealant joints every
3.03 m; kaku-nami galvalume (square ribs); colorbest slate roofs; red brick
of the Meiji/Taishō brewery chimneys; polished 600 mm showroom tiles;
green-grey epoxy with oil stains in the workshop."""
import numpy as np
from .atlas import (_out, srgb, fbm, value_noise, smoothstep, vgrad, flat, emissive, png, grime,
                    rain_streaks, curtain, _cells, _strip, _rect)


def _tone(i):
    return (np.sin(i * 12.9898 + 1.7) * 43758.5453) % 1.0


def siding(col, kind, ppm=64, panel=0.455, seal=3.03):
    """Ceramic siding. kind: 'tile' (embossed brick-tiles 227 x 76 mm),
    'lines' (deep lap grooves every 151 mm), 'wood' (vertical boards with
    grain). Panel joints every 455 mm (horizontal shiplap), sealant joints
    every 3.03 m; rain runs and grime at the foot."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        X = (x + 0.5) / ppm; Y = (y + 0.5) / ppm
        nseal = max(1, round(w / ppm / seal)); sw = w / ppm / nseal
        f = 0.95 + 0.07 * fbm(w, h, w // 40, max(2, h // 40), rng, 3)
        fy_p = np.mod(Y, panel)
        if kind == 'tile':
            th, tw = panel / 6, 0.227
            row = np.floor(Y / th)
            xs = X + (row % 2) * tw / 2
            ci = np.floor(xs / tw)
            fx, fy = np.mod(xs, tw), np.mod(Y, th)
            j = np.maximum(smoothstep(0.009, 0.004, fx), smoothstep(0.009, 0.004, fy))
            tv = _tone(row * 31 + ci * 7)
            f = f * (0.86 + 0.2 * tv) * (1 - 0.32 * j) * (1 + 0.06 * smoothstep(th - 0.012, th - 0.002, fy))
        elif kind == 'lines':
            fy = np.mod(Y, panel / 3)
            f = f * (1 - 0.42 * smoothstep(0.012, 0.0, fy)) * (1 + 0.05 * smoothstep(0.02, 0.05, fy))
        else:   # wood: vertical boards 150 mm, grain, a groove between
            bw = 0.152
            ci = np.floor(X / bw); fx = np.mod(X, bw)
            grain = value_noise(w, h, max(8, int(w / 2)), max(2, h // 64), rng)
            f = f * (0.8 + 0.26 * _tone(ci * 13)) * (0.88 + 0.2 * grain) * (1 - 0.45 * smoothstep(0.008, 0.0, fx))
        f = f * (1 - 0.35 * smoothstep(0.006, 0.0, fy_p))            # panel joint (shadow line)
        fs = np.mod(X, sw)
        seal_j = smoothstep(0.012, 0.004, np.minimum(fs, sw - fs))
        rgb = srgb(col) * f[..., None]
        rgb = rgb * (1 - 0.4 * seal_j[..., None]) + srgb('#8d8a84') * (0.4 * seal_j)[..., None]
        rgb *= (rain_streaks(w, h, rng, 0.07) * grime(w, h, rng, 0.14, 0.15))[..., None]
        return _out(rgb, 0.3)
    return gen


def galva(col='#7c858b', ppm=64, pitch=0.2):
    """Kaku-nami galvalume (square ribs every 200 mm): lit rib faces, shadowed
    flanks, a faint factory sheen, chalky grime at the foot."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        n = max(1, round(w / ppm / pitch)); p = w / n
        fx = np.mod(x, p) / p
        rib = (fx > 0.08) & (fx < 0.32)
        f = np.where(rib, 1.12, 0.92) * (1 - 0.35 * smoothstep(0.06, 0.0, np.abs(fx - 0.06))) * (1 - 0.25 * smoothstep(0.05, 0.0, np.abs(fx - 0.34)))
        f = f * (0.95 + 0.08 * fbm(w, h, w // 30, max(2, h // 30), rng, 3))
        rgb = srgb(col) * f[..., None] * grime(w, h, rng, 0.1, 0.12)[..., None]
        return _out(rgb, 0.45, 0.55)
    return gen


def slate(col='#3e4146', ppm=64, course=0.182, width=0.91):
    """Colorbest slate roof: courses of 182 mm, slates 910 mm staggered by
    half, a dark shadow under each butt edge, faded patches, moss specks."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        Y = y / ppm; X = x / ppm
        row = np.floor(Y / course); fy = np.mod(Y, course) / course
        nx = max(1, round(w / ppm / (width / 3))); sw = w / ppm / nx * 3
        xs = X + (row % 3) * sw / 3
        ci = np.floor(xs / sw); fx = np.mod(xs, sw)
        tv = _tone(row * 17 + ci * 5)
        f = (0.88 + 0.16 * tv) * (1 - 0.45 * smoothstep(0.12, 0.0, 1 - fy)) * (1 - 0.3 * smoothstep(0.008, 0.0, fx))
        f *= 0.92 + 0.12 * fbm(w, h, w // 32, max(2, h // 32), rng, 4)
        rgb = srgb(col) * f[..., None]
        fade = smoothstep(0.62, 0.85, fbm(w, h, w // 20, max(2, h // 20), rng, 3)) * 0.2
        rgb = rgb * (1 - fade[..., None]) + srgb('#8a8c8e') * fade[..., None]
        return _out(rgb, 0.35)
    return gen


def brick(col='#8a3e2a', ppm=96, b=(0.21, 0.06), j=0.01):
    """Red brick in English bond (headers and stretchers alternate rows -
    Meiji chimneys and brewery walls): kiln tones, sunken grey mortar,
    soot speckle and white salt bloom in places."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        X = x / ppm; Y = y / ppm
        ph = b[1] + j
        row = np.floor(Y / ph)
        bw = np.where(row % 2 == 0, b[0] + j, (b[0] - j) / 2 + j)
        n_full = max(1, round(w / ppm / (b[0] + j)))
        scale = (w / ppm) / (n_full * (b[0] + j))
        Xs = X / scale
        ci = np.floor(Xs / bw); fx = np.mod(Xs, bw); fy = np.mod(Y, ph)
        jm = np.maximum(smoothstep(j * 0.9, j * 0.3, fx), smoothstep(j * 0.9, j * 0.3, fy))
        tv = _tone(row * 57 + ci * 11)
        bc = srgb(col) * (0.78 + 0.34 * tv)[..., None] * np.where(tv[..., None] > 0.9, np.array([0.7, 0.6, 0.55]), 1.0)
        bc *= (0.9 + 0.15 * fbm(w, h, w // 16, max(2, h // 16), rng, 3))[..., None]
        rgb = bc * (1 - jm[..., None]) + srgb('#9a958a') * 0.8 * jm[..., None]
        salt = smoothstep(0.72, 0.9, fbm(w, h, w // 12, max(2, h // 12), rng, 4)) * 0.3
        rgb = rgb * (1 - salt[..., None]) + srgb('#d8d2c4') * salt[..., None]
        rgb *= grime(w, h, rng, 0.12, 0.2)[..., None]
        return _out(rgb, 0.2)
    return gen


def floor_tile(col='#c9c8c2', ppm=64, t=0.6):
    """Polished porcelain tiles 600 mm (dealer showroom): faint marble
    veining, thin dark joints, high gloss."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        n = max(1, round(w / ppm / t)); p = w / n
        fx, fy = np.mod(x, p), np.mod(y, p)
        jm = np.maximum(smoothstep(1.4, 0.4, fx), smoothstep(1.4, 0.4, fy))
        tv = _tone(np.floor(x / p) * 7 + np.floor(y / p) * 29)
        vein = smoothstep(0.015, 0.0, np.abs(fbm(w, h, w // 16, max(2, h // 16), rng, 3) - 0.5))
        f = (0.96 + 0.05 * tv) * (1 - 0.06 * vein) * (1 - 0.4 * jm)
        return _out(srgb(col) * f[..., None], 0.85 - 0.5 * jm)
    return gen


def epoxy(col='#6d7a72', ppm=64):
    """Workshop floor: green-grey epoxy paint, worn grey patches in the
    wheel tracks, dark oil stains, tyre marks; semi-gloss."""
    def gen(w, h, rng):
        n = fbm(w, h, w // 24, max(2, h // 24), rng, 5)
        rgb = srgb(col) * (0.9 + 0.15 * n)[..., None]
        worn = smoothstep(0.62, 0.8, fbm(w, h, w // 10, max(2, h // 10), rng, 3)) * 0.3
        rgb = rgb * (1 - worn[..., None]) + srgb('#8f8d86') * worn[..., None]
        oil = smoothstep(0.7, 0.8, fbm(w, h, w // 12, max(2, h // 12), rng, 2))
        rgb *= (1 - 0.4 * oil)[..., None]
        marks = smoothstep(0.82, 0.9, value_noise(w, h, w // 4, max(2, h // 40), rng)) * 0.25
        rgb *= (1 - marks)[..., None]
        return _out(rgb, 0.55 - 0.3 * worn + 0.2 * oil)
    return gen


def layout():
    return {
        'Machi': {   # strips: siding 1.5 m and galvalume at 64 px/m, slate/floor 2 m, epoxy 1.5 m, brick 1 m at 96 px/m
            'SIDING_TILE':  _strip(928, 96, siding('#c9b9a0', 'tile'), ppm=64),
            'SIDING_LINES': _strip(832, 96, siding('#e4e2dc', 'lines'), ppm=64),
            'SIDING_WOOD':  _strip(736, 96, siding('#6a4a32', 'wood'), ppm=64),
            'GALVA':        _strip(640, 96, galva(), ppm=64),
            'SLATE':        _strip(512, 128, slate(), ppm=64),
            'FLOOR_TILE':   _strip(384, 128, floor_tile(), ppm=64),
            'EPOXY':        _strip(288, 96, epoxy(), ppm=64),
            'BRICK':        _strip(192, 96, brick(), ppm=96),
            'CURTAIN_LIT':  _rect(896, 128, 64, 64, curtain(True)),
            'CURTAIN':      _rect(960, 128, 64, 32, curtain(False)),
            'BLIND':        _rect(960, 160, 64, 32, flat('#d8d6cc', 0.5, dirt=0.05)),
            **_cells([
                ('ALU',          flat('#b4b7b8', 0.55, 0.9, dirt=0.06)),
                ('ALU_DARK',     flat('#4a4038', 0.5, 0.6, dirt=0.05)),
                ('ALU_BLACK',    flat('#26282a', 0.5, 0.6, dirt=0.04)),
                ('GLASS',        flat('#1c242b', 0.92, dirt=0.0)),
                ('GLASS_FROST',  flat('#b8c0c2', 0.6, dirt=0.05)),
                ('GLASS_SHOW',   flat('#3a5566', 0.95, 0.1, dirt=0.0)),
                ('INTERIOR',     flat('#0b0a09', 0.2, dirt=0.0)),
                ('CONC_FLAT',    flat('#9a9892', 0.2, dirt=0.22)),
                ('CONC_DARK',    flat('#6a6862', 0.25, dirt=0.15)),
                ('PAINT_WHITE',  flat('#e6e5df', 0.4, dirt=0.12)),
                ('PANEL_WHITE',  flat('#efefec', 0.6, 0.2, dirt=0.06)),
                ('PANEL_PINK',   flat('#d4335f', 0.55, 0.2, dirt=0.05)),
                ('PANEL_DARK',   flat('#2a2a30', 0.55, 0.3, dirt=0.05)),
                ('PANEL_GREY',   flat('#8a8d90', 0.5, 0.4, dirt=0.08)),
                ('IRON',         flat('#26272a', 0.4, 0.7, dirt=0.1)),
                ('GALV',         flat('#a3a7ab', 0.45, 0.8, dirt=0.1)),
                ('STEEL_BLUE',   flat('#2d5fa8', 0.45, 0.3, dirt=0.12)),
                ('STEEL_GREY',   flat('#5f6468', 0.4, 0.5, dirt=0.12)),
                ('YELLOW',       flat('#e8b51a', 0.45, dirt=0.15)),
                ('BLACK',        flat('#151617', 0.4, dirt=0.0)),
                ('RUBBER',       flat('#1a1a1b', 0.25, dirt=0.05)),
                ('WOOD',         flat('#3a281c', 0.3, dirt=0.12)),
                ('WOOD_FLAT',    flat('#3a281c', 0.3, dirt=0.12)),
                ('WOOD_LIGHT',   flat('#a07a52', 0.35, dirt=0.1)),
                ('LIGHT_WARM',   emissive('#ffb768')),
                ('LIGHT_COOL',   emissive('#dff3ff')),
                ('DOWNLIGHT',    emissive('#fff4e0')),
                ('SHUTTER',      flat('#a4a6a4', 0.45, 0.6, dirt=0.3)),
                ('SIDING_TILE_FLAT',  flat('#c9b9a0', 0.3, dirt=0.12)),
                ('SIDING_LINES_FLAT', flat('#e4e2dc', 0.3, dirt=0.12)),
                ('SIDING_WOOD_FLAT',  flat('#6a4a32', 0.3, dirt=0.12)),
                ('GALVA_FLAT',   flat('#7c858b', 0.45, 0.55, dirt=0.08)),
                ('SLATE_FLAT',   flat('#3e4146', 0.35, dirt=0.08)),
                ('BRICK_FLAT',   flat('#7e3a28', 0.2, dirt=0.15)),
                ('FLOOR_FLAT',   flat('#c9c8c2', 0.8, dirt=0.0)),
                ('EPOXY_FLAT',   flat('#6d7a72', 0.5, dirt=0.05)),
                ('CEILING',      flat('#e8e7e2', 0.2, dirt=0.0)),
                ('LINE_WHITE',   flat('#f2f2ee', 0.5, dirt=0.0)),
                ('LINE_YELLOW',  flat('#f0c020', 0.5, dirt=0.0)),
                ('LAWN',         flat('#4f6a32', 0.1, dirt=0.15)),
                ('GRAVEL',       flat('#8a877f', 0.15, dirt=0.15)),
                ('POLYCARB',     flat('#8a7a5a', 0.85, dirt=0.05)),
                ('TILE_PORCH',   flat('#4a4a48', 0.45, dirt=0.1)),
                ('TANK_BEIGE',   flat('#e2ddcf', 0.45, dirt=0.15)),
                ('SOLAR',        flat('#1a2a4a', 0.9, 0.3, dirt=0.0)),
                ('CHROME',       flat('#c8cacc', 0.8, 1.0, dirt=0.0)),
                ('LEATHER',      flat('#1e1e20', 0.45, dirt=0.0)),
                ('LEAF',         flat('#3c5a2a', 0.3, dirt=0.0)),
                ('POT',          flat('#8a4a2c', 0.3, dirt=0.2)),
                ('STONE_FLAT',   flat('#7e7f80', 0.25, dirt=0.2)),
                ('PLASTIC_GREY', flat('#b9bab4', 0.4, dirt=0.15)),
                ('BLOCK',        flat('#a9a69c', 0.15, dirt=0.25)),
                ('RED',          flat('#b8202a', 0.45, dirt=0.1)),
                ('TILE_DARK',    flat('#353b43', 0.4, dirt=0.15)),
                ('PLASTER_WHITE_FLAT', flat('#e2dccf', 0.25, dirt=0.1)),
                ('SOOT',         flat('#1c1a18', 0.15, dirt=0.0)),
            ], 0, 0, 16, 64, 32),
        },
        'MachiShop': {   # dressing: izakaya interiors + signs, dealer and workshop graphics, house plates
            **{f'INT_IZA_{k}': _rect(i * 256, 896, 256, 128, png(f'MA_INT_IZA_{k}', 0.6, emit=0.85)) for i, k in enumerate('ABCD')},
            'DEALER_WALL':   _rect(0, 768, 256, 128, png('MA_DEALER_WALL', 0.5, emit=0.5)),
            'TOOLWALL':      _rect(256, 768, 256, 128, png('MA_TOOLWALL', 0.4)),
            'INT_OFFICE':    _rect(512, 768, 256, 128, png('MA_INT_OFFICE', 0.6, emit=0.8)),
            'PETAL_FASCIA':  _rect(0, 704, 512, 64, png('MA_PETAL_FASCIA', 0.6, emit=0.85)),
            'OPENBAY_FASCIA': _rect(512, 704, 512, 64, png('MA_OPENBAY_FASCIA', 0.6, emit=0.8)),
            **{f'KB{i}': _rect(i * 256, 640, 256, 64, png(f'MA_KB{i}', 0.4, emit=0.75)) for i in range(4)},
            **{f'CH{i}': _rect(i * 128, 576, 128, 64, png(f'MA_CH{i}', 0.3, emit=0.85)) for i in range(4)},
            'KB4':           _rect(512, 576, 256, 64, png('MA_KB4', 0.4, emit=0.75)),
            'KB5':           _rect(768, 576, 256, 64, png('MA_KB5', 0.4, emit=0.75)),
            **{f'NOREN{i}': _rect(i * 128, 480, 128, 96, png(f'MA_NOREN{i}', 0.15)) for i in range(6)},
            'MENU':          _rect(768, 480, 64, 96, png('MA_MENU', 0.3)),
            'POSTER':        _rect(832, 480, 64, 96, png('MA_POSTER', 0.4)),
            'CRATE':         _rect(896, 480, 64, 32, png('MA_CRATE', 0.4)),
            'MAILBOX':       _rect(896, 512, 64, 64, png('MA_MAILBOX', 0.5)),
            'INTERCOM':      _rect(960, 480, 32, 64, png('MA_INTERCOM', 0.5)),
            **{f'NOBORI{i}': _rect(i * 128, 448, 128, 32, png(f'MA_NOBORI{i}', 0.2)) for i in range(4)},
            **{f'PRICE{i}': _rect(512 + i * 64, 448, 64, 32, png(f'MA_PRICE{i}', 0.5)) for i in range(4)},
            **{f'NAME{i}': _rect(768 + i * 64, 448, 64, 32, png(f'MA_NAME{i}', 0.5)) for i in range(4)},
            **{f'KV{i}': _rect(i * 64, 192, 64, 256, png(f'MA_KV{i}', 0.4, emit=0.75)) for i in range(4)},
            'PYLON':         _rect(256, 192, 128, 256, png('MA_PYLON', 0.6, emit=0.85)),
            **_cells([
                ('WOOD_DARK',   flat('#3a281c', 0.3, dirt=0.12)),
                ('WOOD_LIGHT',  flat('#9a7650', 0.35, dirt=0.12)),
                ('IRON',        flat('#26272a', 0.4, 0.7, dirt=0.1)),
                ('STEEL',       flat('#9a9ca0', 0.6, 1.0, dirt=0.1)),
                ('WHITE',       flat('#efe9dc', 0.3, dirt=0.1)),
                ('BLACK',       flat('#151617', 0.4, dirt=0.0)),
                ('NOREN_NAVY',  flat('#1d2a4a', 0.15, dirt=0.0)),
                ('LIT_WARM',    emissive('#ffc985')),
                ('LIT_COOL',    emissive('#eef6ff')),
                ('LANTERN_RED', emissive('#d8301f')),
                ('PAPER',       flat('#f4ecd8', 0.2, dirt=0.05)),
                ('CEDAR',       flat('#5a5a2e', 0.15, dirt=0.1)),
                ('RED',         flat('#b8202a', 0.45, dirt=0.1)),
                ('PINK',        flat('#d4335f', 0.5, dirt=0.05)),
                ('CHROME',      flat('#c8cacc', 0.8, 1.0, dirt=0.0)),
                ('TIRE',        flat('#1a1a1b', 0.3, dirt=0.0)),
                ('RIM',         flat('#9a9ea2', 0.6, 0.9, dirt=0.05)),
                ('DRUM_BLUE',   flat('#1f4fa0', 0.45, dirt=0.15)),
                ('DRUM_RED',    flat('#a8261c', 0.45, dirt=0.15)),
                ('DRUM_YELLOW', flat('#d8a81a', 0.45, dirt=0.15)),
                ('CHEST_RED',   flat('#b8202a', 0.55, 0.2, dirt=0.05)),
                ('LIFT_BLUE',   flat('#2d5fa8', 0.45, 0.3, dirt=0.12)),
                ('YELLOW',      flat('#e8b51a', 0.45, dirt=0.15)),
                ('GREEN',       flat('#2f6a3a', 0.4, dirt=0.1)),
                ('CRATE_YELLOW', flat('#e8b51a', 0.45, dirt=0.15)),
                ('CRATE_RED',   flat('#b8302a', 0.45, dirt=0.15)),
                ('STOOL_RED',   flat('#c42a22', 0.5, dirt=0.05)),
                ('PLASTIC_BLUE', flat('#2f6fb5', 0.5, dirt=0.15)),
                ('LEAF',        flat('#3c5a2a', 0.3, dirt=0.0)),
                ('POT_CLAY',    flat('#8a4a2c', 0.3, dirt=0.2)),
                ('STONE',       flat('#7e7f80', 0.25, dirt=0.2)),
                ('BAMBOO',      flat('#a48d5e', 0.35, dirt=0.1)),
                ('GALV',        flat('#a3a7ab', 0.45, 0.8, dirt=0.1)),
                ('CONC',        flat('#9a9892', 0.2, dirt=0.2)),
                ('TOWEL_WHITE', flat('#eeece4', 0.15, dirt=0.05)),
                ('TOWEL_BLUE',  flat('#5a8ac8', 0.15, dirt=0.05)),
                ('TOWEL_PINK',  flat('#e8a0b0', 0.15, dirt=0.05)),
                ('SHIRT_GREY',  flat('#8a8e94', 0.15, dirt=0.05)),
                ('SHIRT_NAVY',  flat('#2a3a5a', 0.15, dirt=0.05)),
                ('SHIRT_YELLOW', flat('#e8d07a', 0.15, dirt=0.05)),
                ('FUTON',       flat('#d8dfe8', 0.15, dirt=0.05)),
                ('LEATHER',     flat('#1e1e20', 0.45, dirt=0.0)),
                ('TABLE_WHITE', flat('#f2f1ec', 0.6, dirt=0.0)),
                ('GLASS',       flat('#1c242b', 0.92, dirt=0.0)),
                ('SCREEN',      emissive('#5aa0d8')),
                ('BRASS',       flat('#a08440', 0.55, 0.9, dirt=0.05)),
                ('CABLE',       flat('#1a1b1c', 0.35, dirt=0.0)),
                ('CABLE_GREY',  flat('#6a6c6e', 0.35, dirt=0.0)),
                ('HOSE_YELLOW', flat('#e0b020', 0.5, dirt=0.05)),
                ('CARDBOARD',   flat('#a8845a', 0.15, dirt=0.15)),
                ('OIL',         flat('#14120e', 0.7, dirt=0.0)),
                ('ORANGE',      flat('#e8661a', 0.5, dirt=0.1)),
                ('BOX_GREY',    flat('#b9bab4', 0.4, dirt=0.15)),
                ('STRAW',       flat('#c9b07a', 0.2, dirt=0.15)),
                ('ROPE',        flat('#c2b48a', 0.15, dirt=0.05)),
                ('WOOD_TUB',    flat('#b08a5a', 0.3, dirt=0.15)),
                ('INDIGO',      flat('#24324a', 0.15, dirt=0.0)),
            ], 0, 0, 16, 64, 32),
        },
    }
