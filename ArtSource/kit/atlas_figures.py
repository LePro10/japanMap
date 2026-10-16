"""Atlas `Figures` (task 6: people and animals on one shared rig): a palette of
plain colour cells - skin, hair, cloth, rubber, leather - plus a few graphics
(the player's jacket emblem, a yukata print).

Figures carry their detail in the form (collars, hems, pleats, straps, boots);
the cells only give colour and gloss. Rubber boots and aprons shine, wool
and cotton stay matt, leather shoes sit between. One material for every
figure keeps 48 pedestrians at one draw call each (StandInFigure measured
~550 draw calls with six materials)."""
import numpy as np
from .atlas import _out, srgb, smoothstep, flat, emissive, _cells, _rect


def emblem(bg='#1f2a44', ring_col='#e0d8c8'):
    """Player jacket back: a raindrop inside a ring with two speed lines -
    the 'Ameagari' mark (fictional), orange on navy."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        u = (x + 0.5) / w * 2 - 1; v = (y + 0.5) / h * 2 - 1
        bgc = srgb(bg); fg = srgb('#e8661a'); cr = srgb(ring_col)
        r = np.sqrt(u ** 2 + v ** 2)
        ring = smoothstep(0.035, 0.0, np.abs(r - 0.78) - 0.05)
        # raindrop: circle at the bottom, point at the top
        dv = v + 0.12
        drop = (np.sqrt(u ** 2 + dv ** 2) < 0.34) | ((v > -0.12) & (v < 0.55) & (np.abs(u) < 0.34 * (0.55 - v) / 0.67))
        drop = drop.astype(float)
        lines = (((np.abs(v + 0.05) < 0.04) | (np.abs(v + 0.22) < 0.04)) & (u > -0.98) & (u < -0.42)).astype(float)
        rgb = bgc[None, None, :] * np.ones((h, w, 1))
        rgb = rgb * (1 - ring[..., None]) + cr * ring[..., None]
        rgb = rgb * (1 - drop[..., None]) + fg * drop[..., None]
        rgb = rgb * (1 - lines[..., None]) + fg * lines[..., None]
        return _out(rgb, 0.35)
    return gen


def yukata_print(col='#273a6a', flower='#e6e2d6', accent='#c9a4c8'):
    """Asagao (morning glory) print on indigo: white five-lobed flowers with a
    lilac centre and thin leaf strokes. Tiled as a rect over the robe faces."""
    def gen(w, h, rng):
        y, x = np.mgrid[0:h, 0:w].astype(float)
        rgb = srgb(col)[None, None, :] * np.ones((h, w, 1))
        for cx, cy, rr in ((0.27, 0.3, 0.17), (0.75, 0.72, 0.15), (0.78, 0.18, 0.09), (0.2, 0.82, 0.1)):
            px = (x / w - cx); py = (y / h - cy)
            px -= np.round(px); py -= np.round(py)       # tile
            a = np.arctan2(py, px); r = np.sqrt(px ** 2 + py ** 2)
            petal = r < rr * (0.82 + 0.18 * np.cos(5 * a))
            rgb[petal] = srgb(flower)
            rgb[r < rr * 0.32] = srgb(accent)
        leaf = (np.abs(np.sin((x / w * 2 + y / h) * np.pi * 3)) < 0.05) & (np.sin(y / h * np.pi * 4) > 0.6)
        rgb[leaf] = srgb('#3f5f6a')
        return _out(rgb, 0.2)
    return gen


C = lambda col, s=0.3, m=0.0: flat(col, s, m, dirt=0.0)

PALETTE = [
    # skin, face
    ('SKIN_A', C('#e9c1a0', 0.3)), ('SKIN_B', C('#d9a57f', 0.3)), ('SKIN_C', C('#bc845f', 0.3)),
    ('LIP', C('#b4635c', 0.35)), ('EYE', C('#141112', 0.7)), ('MASK', C('#eeefec', 0.2)),
    # hair
    ('HAIR_BLACK', C('#1b1817', 0.45)), ('HAIR_BROWN', C('#3d2b21', 0.45)), ('HAIR_DYED', C('#73502f', 0.45)),
    ('HAIR_GREY', C('#8e8b86', 0.35)), ('HAIR_WHITE', C('#cdcac3', 0.3)),
    # suits, shirts
    ('SUIT_NAVY', C('#232a3d', 0.25)), ('SUIT_CHARCOAL', C('#34363b', 0.25)), ('SUIT_BLACK', C('#18191c', 0.25)),
    ('SHIRT_WHITE', C('#e6e7e3', 0.25)), ('SHIRT_BLUE', C('#b8cadf', 0.25)), ('TIE_RED', C('#7c1f2b', 0.45)),
    ('TIE_BLUE', C('#2b3e6c', 0.45)), ('TRENCH', C('#b7a079', 0.25)), ('TRENCH_DARK', C('#8c7656', 0.25)),
    # casual
    ('KNIT_CREAM', C('#dad1be', 0.15)), ('CARDIGAN_PLUM', C('#6c4258', 0.15)), ('CARDIGAN_GREY', C('#7a7a76', 0.15)),
    ('BLOUSE_FLORAL', C('#c9b6c4', 0.2)), ('DENIM', C('#3d506f', 0.2)), ('DENIM_LIGHT', C('#6b80a1', 0.2)),
    ('JOGGER_GREY', C('#5d6064', 0.15)), ('PANTS_BLACK', C('#1f2023', 0.2)), ('PANTS_BEIGE', C('#a9987b', 0.2)),
    ('HOODIE_OLIVE', C('#5b5f3b', 0.15)), ('HOODIE_GREY', C('#8b8e91', 0.15)), ('TEE_WHITE', C('#e9e9e4', 0.2)),
    ('TEE_BLACK', C('#202124', 0.2)), ('CAP_BLACK', C('#1d1e21', 0.3)), ('CAP_TWEED', C('#5e5648', 0.15)),
    # school
    ('GAKURAN', C('#16171b', 0.3)), ('BUTTON_GOLD', C('#caa34b', 0.7, 0.9)), ('SAILOR_WHITE', C('#e5e6e3', 0.25)),
    ('SAILOR_NAVY', C('#1f2541', 0.25)), ('SCARF_RED', C('#b12b31', 0.35)), ('SKIRT_NAVY', C('#262b42', 0.2)),
    ('SOCK_NAVY', C('#23273b', 0.2)), ('SOCK_WHITE', C('#e6e6e2', 0.2)), ('TIGHTS_BLACK', C('#1b1b1e', 0.35)),
    # work
    ('TOBI_BEIGE', C('#9d9073', 0.15)), ('TOBI_NAVY', C('#2c3651', 0.15)), ('WORK_NAVY', C('#27304a', 0.2)),
    ('VEST_ORANGE', C('#ec6c1c', 0.35)), ('VEST_LIME', C('#c9d424', 0.35)), ('REFLECT', C('#d9dde0', 0.75, 0.3)),
    ('HELMET_WHITE', C('#ecece7', 0.6)), ('HELMET_YELLOW', C('#e8b51a', 0.6)), ('TABI_BLACK', C('#27272b', 0.25)),
    ('TOWEL_WHITE', C('#e3e1d8', 0.1)), ('TENUGUI_BLUE', C('#3a5b8c', 0.15)), ('APRON_ORANGE', C('#dc5a1c', 0.65)),
    ('APRON_NAVY', C('#1d2843', 0.55)), ('RUBBER_WHITE', C('#e2e3df', 0.65)), ('RUBBER_BLACK', C('#1c1c1e', 0.55)),
    ('GLOVE_ORANGE', C('#e5661e', 0.55)), ('GLOVE_COTTON', C('#ddd8cb', 0.1)), ('HAPPI_INDIGO', C('#25355f', 0.2)),
    ('MAEKAKE_NAVY', C('#1c2543', 0.2)), ('MAEKAKE_TEXT', C('#e0dbcc', 0.2)), ('SANDAL_BLACK', C('#202022', 0.4)),
    # player
    ('JACKET_NAVY', C('#1f2a44', 0.35)), ('JACKET_ORANGE', C('#e8661a', 0.4)), ('JACKET_CREAM', C('#e1d9c9', 0.3)),
    ('RIB_BLACK', C('#1a1b1e', 0.15)), ('SNEAKER_WHITE', C('#ebebe8', 0.35)), ('SOLE_CREAM', C('#d6d1c4', 0.3)),
    ('SNEAKER_ORANGE', C('#e8661a', 0.4)), ('ZIP', C('#b9bbbd', 0.7, 0.9)),
    # yukata, elder
    ('YUKATA_INDIGO', C('#273a6a', 0.2)), ('OBI_RED', C('#b8333b', 0.35)), ('OBI_YELLOW', C('#d9a72b', 0.35)),
    ('GETA_WOOD', C('#bf9f6c', 0.25)), ('HANAO_RED', C('#a8232c', 0.4)), ('KANZASHI', C('#d8556e', 0.6)),
    ('SUNHAT_BEIGE', C('#c7b893', 0.15)), ('HAT_BAND', C('#5a4632', 0.25)),
    # bags, shoes
    ('LEATHER_BLACK', C('#151517', 0.65)), ('LEATHER_BROWN', C('#4b2f1f', 0.55)), ('SOLE_DARK', C('#2a2a2c', 0.3)),
    ('BAG_NAVY', C('#252c45', 0.35)), ('BAG_BLACK_NYLON', C('#1d1e21', 0.45)), ('ECO_BAG', C('#cbc1a8', 0.1)),
    ('BACKPACK_RED', C('#8d2a26', 0.35)), ('STRAP_BLACK', C('#1a1a1c', 0.3)), ('METAL_STEEL', C('#a3a6a9', 0.6, 0.9)),
    ('GLASSES', C('#141416', 0.7)), ('BUCKLE', C('#b8b1a0', 0.6, 0.9)),
    # hand props
    ('PLASTIC_WHITE', C('#e7e7e4', 0.55)), ('UMBRELLA_BLACK', C('#18191b', 0.45)), ('UMBRELLA_NAVY', C('#20283f', 0.45)),
    ('UMBRELLA_RED', C('#a52a2e', 0.45)), ('PHONE_BLACK', C('#121214', 0.85)), ('PHONE_SCREEN', emissive('#7fa6d9')),
    ('BROOM_STRAW', C('#a68f58', 0.1)), ('BAMBOO', C('#b69c63', 0.4)), ('ROD_BLACK', C('#1a1a1d', 0.75)),
    ('KONBINI_BAG', C('#efefeb', 0.45)), ('WOOD_HANDLE', C('#7a5636', 0.35)), ('CORK', C('#a07a50', 0.1)),
    # animals
    ('CAT_ORANGE', C('#c98b4b', 0.2)), ('CAT_WHITE', C('#e7e2d7', 0.2)), ('CAT_BLACK', C('#1d1c1d', 0.35)),
    ('CAT_TABBY', C('#8b7b63', 0.2)), ('CAT_TABBY_DARK', C('#4c4236', 0.2)), ('CAT_GREY', C('#7c7d80', 0.2)),
    ('NOSE_PINK', C('#c98d8a', 0.4)), ('EYE_AMBER', C('#c7a531', 0.85)), ('EYE_GREEN', C('#8aa33a', 0.85)),
    ('GOAT_WHITE', C('#dfdbd1', 0.15)), ('HORN', C('#5b5148', 0.35)), ('HOOF', C('#2b2724', 0.35)),
    ('CHICKEN_WHITE', C('#efece3', 0.2)), ('CHICKEN_BROWN', C('#8c4b25', 0.25)), ('CHICKEN_DARK', C('#3b2a1f', 0.3)),
    ('TAIL_GREEN', C('#1f3a34', 0.6)), ('COMB_RED', C('#c3201d', 0.4)), ('BEAK_YELLOW', C('#d9a62b', 0.4)),
    ('CROW', C('#121316', 0.55)), ('CROW_BEAK', C('#0c0c0e', 0.7)), ('SHIBA_RED', C('#c27a3e', 0.2)),
    ('SHIBA_CREAM', C('#eadfca', 0.2)), ('COLLAR_RED', C('#b12a2c', 0.45)), ('PIGEON_GREY', C('#7f8590', 0.3)),
    ('PIGEON_NECK', C('#4f6b62', 0.6)), ('BATON_LIT', emissive('#ff3a2a')),
]


def layout():
    lay = {
        'EMBLEM': _rect(896, 896, 128, 128, emblem()),
        'EMBLEM_CREAM': _rect(640, 896, 128, 128, emblem('#e1d9c9', '#1f2a44')),
        'YUKATA_PRINT': _rect(768, 896, 128, 128, yukata_print()),
    }
    lay.update(_cells(PALETTE, 0, 0, 16, 64))
    return {'Figures': lay}
