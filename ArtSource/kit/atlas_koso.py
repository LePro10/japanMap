"""Atlases `Koso` + `KosoShop` (task 5c, Tokyo height and the rest).

`Koso` (高層, high-rise): tower facades. Every facade strip is exactly **one
storey** high and runs the full width; the tower generator gives each storey
its own random U offset in whole window modules, so the lit windows never
repeat up the shaft and the window columns still line up. The height costs
no triangles: one quad per storey and side (LOD0 and the far LOD alike).
Strips: blue curtain wall (office), dark bronze curtain wall with fins,
hotel precast with punched windows, tower-mansion wall behind the balcony
bands, brown tile tower (80s/90s), silver ribbon windows (80s office);
plus double-height lobby glass, balcony railing (frosted glass) and a
louvre band for plant floors. Cells: structure, roof, aviation lights, and
the kei truck (white paint, chrome, lamps, bed, cargo).

`KosoShop`: graphics from `kit/graphics_koso.mjs` (KS_*): crown signs,
heliport H / rescue R marking, cinema posters, marquee, name signs, hotel
fascia, shōtengai arch, flags, shop signs, stall fronts, lobby interiors,
kei plate, nets.

Japanese cues: the urethane-green roof membrane, the H / R marking on every
tower over 31 m (fire code), window-cleaning gondola on the roof, red
aviation obstruction lights, frosted balcony glass with a partition board
(非常の際は…), ceiling light rows in offices seen at the blue hour."""
import numpy as np
from .atlas import (_out, srgb, fbm, value_noise, smoothstep, vgrad, flat, emissive, png, grime,
                    rain_streaks, _cells, _strip, _rect, SIZE)

# kind: floor height (m), window modules across the 1024 px, strip px
FLOORS = {
    'CW_BLUE':   dict(fh=4.0, n=24, px=112),
    'CW_DARK':   dict(fh=4.0, n=18, px=112),
    'HOTEL':     dict(fh=3.2, n=8, px=112),
    'RESI':      dict(fh=3.1, n=10, px=112),
    'TILE':      dict(fh=3.4, n=16, px=112),
    'RIBBON':    dict(fh=3.8, n=20, px=112),
}


def module_m(kind):
    """Width of one window module in metres (geometry snaps to it)."""
    f = FLOORS[kind]
    return SIZE / (f['px'] / f['fh']) / f['n']


def _h(i):
    return (np.sin(np.asarray(i, float) * 12.9898 + 4.1) * 43758.5453) % 1.0


def _lit_runs(n, frac, rng, run=0.6):
    """Lit/unlit per module: offices light in runs, not salt and pepper."""
    out, on = [], rng.random() < frac
    for _ in range(n):
        if rng.random() > run:
            on = rng.random() < frac
        out.append(on)
    return np.array(out)


def tower_floor(kind, glass, frame, wall, lit_col, frac, sill, head, win_w=None, fin=0.0, mull=0.06,
                tile=False, curtains=False, panel_lines=False):
    """One storey of a tower facade. Metres from the slab (0) to the next
    slab (fh). glass: unlit glass colour (sky reflection added at the top),
    wall: spandrel / wall colour, win_w: punched window width inside the
    module (None = curtain wall: glass across the whole module), fin: depth
    look of a vertical fin at every module edge (m wide)."""
    spec = FLOORS[kind]

    def gen(w, h, rng):
        n = spec['n']; fh = spec['fh']; ppm = h / fh
        y, x = np.mgrid[0:h, 0:w].astype(float)
        X = (x + 0.5) / ppm; Y = (y + 0.5) / ppm
        mw = w / ppm / n
        mi = np.floor(X / mw).astype(int) % n
        fx = np.mod(X, mw)                      # metres into the module
        ww = win_w or mw
        wx0 = (mw - ww) / 2
        inwin = (fx > wx0) & (fx < wx0 + ww) & (Y > sill) & (Y < head)
        lit = _lit_runs(n, frac, rng)[mi]
        tone = _h(mi * 7 + 3)[...]
        # wall / spandrel
        rgb = np.ones((h, w, 3)) * srgb(wall)
        nz = fbm(w, h, w // 32, max(2, h // 24), rng, 3)
        rgb *= (0.93 + 0.1 * nz)[..., None]
        if tile:   # 45-mosaic / small tiles: fine grid of joints
            jt = (np.mod(X, 0.095) < 0.012) | (np.mod(Y, 0.095) < 0.012)
            rgb = np.where(jt[..., None], rgb * 0.82, rgb * (0.9 + 0.18 * _h(np.floor(X / 0.095) * 31 + np.floor(Y / 0.095) * 7))[..., None])
        if panel_lines:   # precast panel joints at module edges and mid-storey
            pj = (np.minimum(fx, mw - fx) < 0.02) | (np.abs(Y - fh * 0.5) < 0.015)
            rgb = np.where(pj[..., None], rgb * 0.7, rgb)
        rgb *= (rain_streaks(w, h, rng, 0.05))[..., None]
        # glass, unlit: sky reflection gradient, a tone per module, a diagonal glint
        gy = np.clip((Y - sill) / max(head - sill, 0.1), 0, 1)
        g = srgb(glass) * (0.8 + 0.35 * tone)[..., None]
        g = g * (1 - 0.45 * gy)[..., None] + srgb('#9fb6c6') * (0.45 * gy * (0.6 + 0.4 * tone))[..., None]
        glint = smoothstep(0.25, 0.0, np.abs(np.mod(X * 0.8 + Y * 0.6, 7.0) - 3.5)) * 0.12
        g = g + glint[..., None]
        # glass, lit: bright ceiling with light rows, darker floor zone, desk silhouettes
        L = srgb(lit_col)
        ceil = smoothstep(head - 0.55, head - 0.05, Y)
        rows = (np.mod(X + _h(mi) * 0.6, 1.8) < 1.2) & (Y > head - 0.25)
        room = 0.55 + 0.35 * ceil + 0.25 * rows
        desk = (Y > sill + 0.05) & (Y < sill + 0.45 + 0.25 * _h(np.floor(X / 0.7) * 3)) & (_h(np.floor(X / 0.7) * 5 + mi) < 0.6)
        room = np.where(desk, room * 0.45, room)
        if curtains:   # hotel / homes: curtains half or fully drawn, glowing
            cl = _h(mi * 13 + 1)
            fold = 0.85 + 0.15 * np.sin(X * 38 + 2 * np.sin(Y * 3))
            closed = (np.abs(fx - mw / 2) > ww * (0.12 + 0.3 * cl)) | (cl > 0.7)
            room = np.where(closed, 0.8 * fold, room)
            ccol = np.stack([srgb(c) for c in ('#f2dcb4', '#f4ecdc', '#dde4e8', '#ecd2b8')])[(cl * 4).astype(int) % 4]
            Lc = np.where(closed[..., None], ccol * srgb(lit_col) / np.max(srgb(lit_col)), L)
        else:
            Lc = np.broadcast_to(L, (h, w, 3))
        litrgb = Lc * room[..., None]
        win = np.where(lit[..., None], litrgb, g)
        rgb = np.where(inwin[..., None], win, rgb)
        emit = np.where((inwin & lit)[..., None], litrgb * 0.95, 0.0)
        # mullions and transoms (frame) in the glazing
        fr = srgb(frame)
        edge = np.minimum(fx, mw - fx) < mull / 2
        if win_w:
            edge = inwin & ((np.abs(fx - wx0) < mull) | (np.abs(fx - wx0 - ww) < mull) | (np.abs(fx - mw / 2) < mull / 2)
                            | (np.abs(Y - sill) < mull) | (np.abs(Y - head) < mull))
        else:
            edge = edge | (np.abs(Y - sill) < mull / 2) | (np.abs(Y - head) < mull / 2)
        rgb = np.where(edge[..., None], fr * (0.9 + 0.2 * (Y / fh))[..., None], rgb)
        emit = np.where(edge[..., None], 0.0, emit)
        if fin > 0:   # vertical fin: lit face, dark flank
            d = np.minimum(fx, mw - fx)
            fz = d < fin / 2
            rgb = np.where(fz[..., None], srgb(frame) * np.where(fx < mw / 2, 1.2, 0.6)[..., None], rgb)
            emit = np.where(fz[..., None], 0.0, emit)
        smooth = np.where(inwin, 0.9, 0.35)
        return dict(rgb=np.clip(rgb, 0, 1), smooth=smooth, metal=np.where(edge, 0.8, 0.0), emit=emit, alpha=None)
    return gen


def lobby_glass():
    """Double-height ground floor (6 m): glass in 1.85 m bays with a transom
    at 3 m, warm lobby behind (always lit), dark granite kick plate, a dark
    head band. Doors marked by push bars in every fourth bay."""
    def gen(w, h, rng):
        ppm = h / 6.0; n = 26
        y, x = np.mgrid[0:h, 0:w].astype(float)
        X = (x + 0.5) / ppm; Y = (y + 0.5) / ppm
        mw = w / ppm / n; mi = np.floor(X / mw).astype(int); fx = np.mod(X, mw)
        inside = srgb('#e9d2a6') * (0.65 + 0.35 * smoothstep(2.0, 5.4, Y))[..., None]
        inside = inside * (0.85 + 0.25 * _h(mi * 5))[..., None]
        plant = (np.abs(fx - mw / 2) < 0.35) & (Y < 1.6) & (_h(mi * 3) < 0.25)
        inside = np.where(plant[..., None], srgb('#2f4a26'), inside)
        rgb = inside.copy(); emit = inside * 0.85
        frame = (np.minimum(fx, mw - fx) < 0.05) | (np.abs(Y - 3.0) < 0.05)
        bar = (mi % 4 == 1) & (np.abs(Y - 1.05) < 0.03) & (np.abs(fx - mw / 2) < 0.5)
        kick = Y < 0.3; band = Y > 5.6
        for m_, col in ((frame | bar, '#8e979c'), (kick, '#2a2b2e'), (band, '#24272b')):
            rgb = np.where(m_[..., None], srgb(col), rgb)
            emit = np.where(m_[..., None], 0.0, emit)
        return dict(rgb=rgb, smooth=np.where(frame | kick | band, 0.6, 0.9), metal=np.where(frame, 0.8, 0.0), emit=emit, alpha=None)
    return gen


def rail():
    """Tower-mansion balcony railing (1.15 m): frosted glass panels 2.04 m in
    alu posts, top rail, a partition board (white, 非常の際は…) every 3rd post."""
    def gen(w, h, rng):
        ppm = h / 1.15; n = 12
        y, x = np.mgrid[0:h, 0:w].astype(float)
        X = (x + 0.5) / ppm; Y = (y + 0.5) / ppm
        mw = w / ppm / n; mi = np.floor(X / mw).astype(int); fx = np.mod(X, mw)
        rgb = srgb('#aab6bd') * (0.88 + 0.12 * smoothstep(0.1, 1.0, Y))[..., None]
        rgb = rgb * (0.95 + 0.08 * _h(mi * 9))[..., None]
        post = np.minimum(fx, mw - fx) < 0.03
        top = Y > 1.02; slab = Y < 0.1
        rgb = np.where((post | top)[..., None], srgb('#b9bec2'), rgb)
        rgb = np.where(slab[..., None], srgb('#d9d6ce'), rgb)
        return dict(rgb=rgb, smooth=np.where(post | top, 0.6, 0.8), metal=np.where(post | top, 0.8, 0.0), emit=None, alpha=None)
    return gen


def louvre(col='#7d8286'):
    """Plant floor louvre band (4 m): horizontal blades every 0.4 m, a lit
    upper edge and dark gap under each blade; frames every 3 m."""
    def gen(w, h, rng):
        ppm = h / 4.0
        y, x = np.mgrid[0:h, 0:w].astype(float)
        X = (x + 0.5) / ppm; Y = (y + 0.5) / ppm
        fy = np.mod(Y, 0.4) / 0.4
        f = np.where(fy > 0.7, 1.15, np.where(fy < 0.25, 0.45, 0.9))
        fr = (np.mod(X, 3.0) < 0.1) | (Y < 0.12)
        f = np.where(fr, 1.0, f)
        rgb = srgb(col) * f[..., None] * grime(w, h, rng, 0.1, 0.2)[..., None]
        return _out(rgb, 0.45, 0.5)
    return gen


def layout():
    y = 0
    L = {}
    defs = {
        'CW_BLUE': tower_floor('CW_BLUE', '#2c4a5e', '#8a959c', '#1b2630', '#b9c9dc', 0.38, 0.85, 3.05),
        'CW_DARK': tower_floor('CW_DARK', '#1d2023', '#3d4246', '#131415', '#fff0d8', 0.35, 0.9, 3.2, fin=0.18),
        'HOTEL':   tower_floor('HOTEL', '#26323a', '#3a3c3e', '#cbbfa8', '#ffd9a6', 0.45, 0.75, 2.45, win_w=1.8,
                               curtains=True, panel_lines=True),
        'RESI':    tower_floor('RESI', '#2a343c', '#9da4a8', '#d8d6d0', '#ffd49a', 0.5, 0.08, 2.3, win_w=2.2,
                               curtains=True),
        'TILE':    tower_floor('TILE', '#28323a', '#5a5048', '#6e5143', '#ffe2b8', 0.35, 0.9, 2.55, win_w=1.4,
                               tile=True),
        'RIBBON':  tower_floor('RIBBON', '#33464f', '#9ea4a8', '#b8bcc0', '#c4d0dc', 0.38, 1.0, 2.75,
                               panel_lines=False),
    }
    for k, gen in defs.items():
        f = FLOORS[k]
        L[k] = _strip(y, f['px'], gen, ppm=f['px'] / f['fh']); y += f['px']
    L['LOBBY'] = _strip(y, 128, lobby_glass(), ppm=128 / 6.0); y += 128
    L['RAIL'] = _strip(y, 48, rail(), ppm=48 / 1.15); y += 48
    L['LOUVRE'] = _strip(y, 48, louvre(), ppm=48 / 4.0); y += 48
    assert y == 896
    L.update(_cells([
        ('ALU',          flat('#b4b9bd', 0.6, 0.85, dirt=0.05)),
        ('ALU_DARK',     flat('#3d4246', 0.55, 0.7, dirt=0.05)),
        ('STEEL_GREY',   flat('#6c7175', 0.45, 0.6, dirt=0.1)),
        ('CONCRETE',     flat('#9b9993', 0.2, dirt=0.2)),
        ('GRANITE',      flat('#8d8984', 0.55, dirt=0.08)),
        ('GRANITE_DARK', flat('#2e2d2c', 0.65, dirt=0.05)),
        ('SLAB_WHITE',   flat('#dedbd3', 0.3, dirt=0.15)),
        ('ROOF_GREEN',   flat('#4f7660', 0.35, dirt=0.15)),
        ('ROOF_GREY',    flat('#7a7d7a', 0.25, dirt=0.15)),
        ('MECH_GREY',    flat('#a7aaa8', 0.4, 0.3, dirt=0.15)),
        ('PAINT_WHITE',  flat('#e9e8e2', 0.4, dirt=0.1)),
        ('LIGHT_RED',    emissive('#ff2a1a')),
        ('LIGHT_WHITE',  emissive('#f4f8ff')),
        ('GLASS_DARK',   flat('#1c242b', 0.92, dirt=0.0)),
        ('LIT_WARM',     emissive('#ffc985')),
        ('LIT_COOL',     emissive('#eef6ff')),
        ('BLACK',        flat('#151617', 0.4, dirt=0.0)),
        ('YELLOW',       flat('#e8c020', 0.45, dirt=0.1)),
        ('TANK_CREAM',   flat('#e2ddcf', 0.45, dirt=0.15)),
        ('POLYCARB',     flat('#d4d8cc', 0.75, dirt=0.05)),
        ('CANOPY',       flat('#34383d', 0.5, 0.5, dirt=0.05)),
        ('PAINT_RED',    flat('#b8202a', 0.45, dirt=0.1)),
        ('PAINT_GREEN',  flat('#2f6a3a', 0.4, dirt=0.1)),
        ('TILE_FLOOR',   flat('#8a8580', 0.45, dirt=0.1)),
        ('WOOD',         flat('#6a4a32', 0.35, dirt=0.12)),
        ('BRASS',        flat('#a08440', 0.55, 0.9, dirt=0.05)),
        ('CHROME',       flat('#c8cacc', 0.8, 1.0, dirt=0.0)),
        ('RUBBER',       flat('#1a1a1b', 0.3, dirt=0.0)),
        ('RIM',          flat('#a2a6aa', 0.55, 0.9, dirt=0.05)),
        ('TRUCK_WHITE',  flat('#eeeeea', 0.6, dirt=0.12)),
        ('HEADLAMP',     emissive('#fff4e0')),
        ('TAIL_RED',     emissive('#e8241a')),
        ('AMBER',        emissive('#ff9a1a')),
        ('BED_STEEL',    flat('#7d8287', 0.4, 0.6, dirt=0.25)),
        ('TARP_BLUE',    flat('#2a62c4', 0.35, dirt=0.15)),
        ('STRAW',        flat('#c9b07a', 0.2, dirt=0.15)),
        ('STRAW_DARK',   flat('#9a8458', 0.2, dirt=0.15)),
        ('CRATE_YELLOW', flat('#e8b51a', 0.45, dirt=0.15)),
        ('CRATE_BLUE',   flat('#2f6fb5', 0.45, dirt=0.15)),
        ('CRATE_GREEN',  flat('#3c7a4a', 0.45, dirt=0.15)),
        ('ROPE',         flat('#d8d0b0', 0.15, dirt=0.05)),
        ('MUD',          flat('#2a2622', 0.2, dirt=0.0)),
        ('GLASS_CAB',    flat('#22303a', 0.95, dirt=0.0)),
        ('DASH',         flat('#2a2b2d', 0.3, dirt=0.0)),
        ('SEAT_GREY',    flat('#55585c', 0.2, dirt=0.0)),
        ('BULB_WARM',    emissive('#ffd27a')),
        ('NEON_RED',     emissive('#ff3a3a')),
        ('FRAME_BLACK',  flat('#1a1b1d', 0.5, 0.3, dirt=0.0)),
        ('SIGN_BACK',    flat('#2a2c2f', 0.4, 0.4, dirt=0.05)),
        ('LANTERN_RED',  emissive('#d8301f')),
        ('PAPER',        flat('#f4ecd8', 0.2, dirt=0.05)),
        ('CARDBOARD',    flat('#a8845a', 0.15, dirt=0.15)),
        ('PLANT',        flat('#3c5a2a', 0.3, dirt=0.0)),
        ('STONE',        flat('#7e7f80', 0.25, dirt=0.2)),
        ('ASPHALT',      flat('#3a3b3d', 0.2, dirt=0.05)),
        ('LINE_WHITE',   flat('#f2f2ee', 0.5, dirt=0.0)),
        ('FLOAT_ORANGE', flat('#e8661a', 0.5, dirt=0.1)),
        ('PAINT_GREY',   flat('#8d9194', 0.4, 0.2, dirt=0.15)),
    ], 0, 896, 16, 64, 32))
    shop = {
        'CROWN0': _rect(0, 960, 512, 64, png('KS_CROWN0', 0.5, emit=0.9)),
        'CROWN1': _rect(512, 960, 512, 64, png('KS_CROWN1', 0.5, emit=0.9)),
        'CROWN2': _rect(0, 896, 512, 64, png('KS_CROWN2', 0.5, emit=0.9)),
        'CROWN3': _rect(512, 896, 512, 64, png('KS_CROWN3', 0.5, emit=0.9)),
        'MARQUEE': _rect(0, 768, 512, 128, png('KS_MARQUEE', 0.4, emit=0.85)),
        'ARCH': _rect(512, 768, 512, 128, png('KS_ARCH', 0.4, emit=0.8)),
        **{f'POSTER{i}': _rect(i * 128, 576, 128, 192, png(f'KS_POSTER{i}', 0.6, emit=0.8)) for i in range(6)},
        'CINEMA_TATE': _rect(768, 512, 64, 256, png('KS_CINEMA_TATE', 0.4, emit=0.85)),
        'HOTEL_TATE': _rect(832, 512, 64, 256, png('KS_HOTEL_TATE', 0.4, emit=0.8)),
        'BIZ_TATE': _rect(896, 512, 64, 256, png('KS_BIZ_TATE', 0.4, emit=0.8)),
        **{f'FLAG{i}': _rect(i * 64, 448, 64, 128, png(f'KS_FLAG{i}', 0.15)) for i in range(4)},
        'PAD_H': _rect(256, 448, 128, 128, png('KS_PAD_H', 0.3)),
        'PAD_R': _rect(384, 448, 128, 128, png('KS_PAD_R', 0.3)),
        'NET_GREEN': _rect(512, 448, 128, 64, png('KS_NET_GREEN', 0.2)),
        'NET_BLUE': _rect(640, 448, 128, 64, png('KS_NET_BLUE', 0.2)),
        'MIKAN': _rect(768, 448, 128, 64, png('KS_MIKAN', 0.3)),
        'PLATE_KEI': _rect(896, 448, 64, 32, png('KS_PLATE_KEI', 0.5)),
        'TEISO': _rect(960, 448, 64, 64, png('KS_TEISO', 0.5)),
        'CINEMA_FASCIA': _rect(0, 384, 512, 64, png('KS_CINEMA_FASCIA', 0.5, emit=0.85)),
        'HOTEL_FASCIA': _rect(512, 384, 512, 64, png('KS_HOTEL_FASCIA', 0.5, emit=0.8)),
        'BIZ_FASCIA': _rect(0, 320, 512, 64, png('KS_BIZ_FASCIA', 0.5, emit=0.8)),
        **{f'SHOP{i}': _rect(*xy, 256, 64, png(f'KS_SHOP{i}', 0.4, emit=0.75))
           for i, xy in enumerate([(512, 320), (768, 320), (0, 256), (256, 256), (512, 256), (768, 256)])},
        **{f'STALL_{k}': _rect(i * 256, 128, 256, 128, png(f'KS_STALL_{k}', 0.5, emit=0.6))
           for i, k in enumerate(('VEG', 'FISH', 'SWEETS', 'GOODS'))},
        'LOBBY_WARM': _rect(0, 0, 256, 128, png('KS_LOBBY_WARM', 0.6, emit=0.85)),
        'LOBBY_COOL': _rect(256, 0, 256, 128, png('KS_LOBBY_COOL', 0.6, emit=0.85)),
        **_cells([
            ('FRAME_BLACK', flat('#1a1b1d', 0.5, 0.3, dirt=0.0)),
            ('FRAME_SILVER', flat('#b9bec2', 0.6, 0.85, dirt=0.0)),
            ('SIGN_BACK', flat('#2a2c2f', 0.4, 0.4, dirt=0.05)),
            ('BULB_WARM', emissive('#ffd27a')),
            ('NEON_RED', emissive('#ff3a3a')),
            ('LIT_WARM', emissive('#ffc985')),
            ('LANTERN_RED', emissive('#d8301f')),
            ('PAPER', flat('#f4ecd8', 0.2, dirt=0.05)),
            ('RED', flat('#b8202a', 0.45, dirt=0.1)),
            ('NAVY', flat('#1d2a52', 0.4, dirt=0.05)),
            ('GOLD', flat('#b8a070', 0.55, 0.8, dirt=0.05)),
            ('WHITE', flat('#efede6', 0.35, dirt=0.05)),
            ('STEEL', flat('#8a8e92', 0.5, 0.7, dirt=0.1)),
            ('WOOD', flat('#7a5636', 0.35, dirt=0.1)),
            ('CARDBOARD', flat('#a8845a', 0.15, dirt=0.15)),
            ('PLANT', flat('#3c5a2a', 0.3, dirt=0.0)),
            ('CRATE_BLUE', flat('#2f6fb5', 0.45, dirt=0.15)),
            ('CRATE_YELLOW', flat('#e8b51a', 0.45, dirt=0.15)),
            ('TARP_BLUE', flat('#2a62c4', 0.35, dirt=0.15)),
            ('STRAW', flat('#c9b07a', 0.2, dirt=0.15)),
            ('BLACK', flat('#151617', 0.4, dirt=0.0)),
            ('RUBBER', flat('#1a1a1b', 0.3, dirt=0.0)),
            ('YELLOW', flat('#e8c020', 0.45, dirt=0.1)),
            ('GREEN', flat('#2f6a3a', 0.4, dirt=0.1)),
        ], 512, 0, 8, 64, 32),
    }
    return {'Koso': L, 'KosoShop': shop}
