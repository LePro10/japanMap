"""Atlas `Details` (task 6): the small things that make a Japanese street and
the game's own furniture - curve mirrors, animal barricades, cones and cone
bars, the bowing-man works board, round post box, green phone booth, Super
Cub delivery bike, umbrella stand, smoking stand, crow net, design manhole,
hydrant sign, tanuki, maneki-neko, daruma; race gantry, inflatable
checkpoint arch, pylons, tyre stacks, trophy; garage bench, tyre rack,
paint chips, engine stand; discovery props (plaque, coin binoculars, map
and lookout panels, tide board, life ring, thermos, shrine bell ...).

Graphics with text come from kit/graphics_details.mjs (DT_*)."""
from .atlas import flat, emissive, png, _cells, _rect, stone

C = lambda col, s=0.4, m=0.0, d=0.08: flat(col, s, m, dirt=d)

CELLS = [
    ('MIRROR', C('#d6dde3', 0.95, 1.0, 0.0)), ('MIRROR_BACK', C('#2b2d30', 0.4)), ('ORANGE_PAINT', C('#e8661a', 0.5)),
    ('YELLOW_PAINT', C('#e8b41a', 0.5)), ('WHITE_PAINT', C('#e8e8e4', 0.45)), ('BLACK_PAINT', C('#1a1a1c', 0.45)),
    ('RED_PAINT', C('#c8102e', 0.55)), ('GREEN_PAINT', C('#2e8b3e', 0.5)), ('BLUE_PAINT', C('#1f63b0', 0.5)),
    ('GALV', C('#a5a9ad', 0.45, 0.8)), ('STEEL_DARK', C('#2d2e31', 0.45, 0.6)), ('CHROME', C('#cfd3d6', 0.85, 1.0, 0.0)),
    ('RUBBER', C('#161617', 0.2, 0.0, 0.0)), ('CONC', C('#9c9a94', 0.15, 0.0, 0.2)), ('ASPHALT_PATCH', C('#2a2b2d', 0.3)),
    ('CONE_ORANGE', C('#e8551a', 0.45)), ('CONE_WHITE', C('#e9ebe9', 0.6, 0.0, 0.0)), ('FROG_GREEN', C('#56a83a', 0.5)),
    ('FROG_BELLY', C('#e9e4c7', 0.45)), ('MONKEY_BROWN', C('#9a6a3c', 0.45)), ('MONKEY_FACE', C('#e5b48f', 0.45)),
    ('EYE_BLACK', C('#0f0f10', 0.7, 0.0, 0.0)), ('EYE_WHITE', C('#f2f2ef', 0.6, 0.0, 0.0)), ('BAR_YELLOW', C('#ecc21a', 0.55)),
    ('BAR_BLACK', C('#151515', 0.55)), ('POST_RED', C('#c8102e', 0.6)), ('PHONE_GREEN', C('#2b7a3a', 0.6)),
    ('GLASS_CLEAR', C('#a9c0c9', 0.95, 0.0, 0.0)), ('PHONE_BODY', C('#3a8f4a', 0.55)), ('BIKE_RED', C('#b7251f', 0.65)),
    ('BIKE_GREEN', C('#3e6a4e', 0.6)), ('BIKE_SEAT', C('#1d1d1f', 0.4)), ('LEG_SHIELD', C('#e6e3d8', 0.55)),
    ('DELIVERY_BOX', C('#d84a1e', 0.5)), ('HEADLAMP', emissive('#fff1d6')), ('TAIL', C('#8a1410', 0.8)),
    ('TANUKI_BROWN', C('#7a5a3c', 0.55)), ('TANUKI_DARK', C('#3a2a1e', 0.55)), ('TANUKI_HAT', C('#6b5a3a', 0.5)),
    ('SAKE_FLASK', C('#d7c79a', 0.55)), ('NEKO_WHITE', C('#f0ece2', 0.75)), ('NEKO_RED', C('#c21f26', 0.7)),
    ('NEKO_GOLD', C('#d6a93a', 0.8, 0.9)), ('DARUMA_RED', C('#c01a1f', 0.8)), ('DARUMA_FACE', C('#f1e9d8', 0.7)),
    ('DARUMA_GOLD', C('#d4a53a', 0.8, 0.9)), ('NET_BLUE', C('#2c63a8', 0.3)), ('NET_GREEN', C('#3a7a4a', 0.3)),
    ('BAG_WHITE', C('#e8e8e2', 0.55)), ('BAG_YELLOW', C('#e8d27a', 0.5)), ('PLASTIC_GREY', C('#8c8f8e', 0.4)),
    ('PLASTIC_BLUE', C('#2f6fb5', 0.5)), ('ASH', C('#3a3a3a', 0.2)), ('UMB_CLEAR', C('#dfe6ea', 0.85, 0.0, 0.0)),
    ('UMB_BLACK', C('#18191b', 0.45)), ('UMB_NAVY', C('#22283f', 0.45)), ('WOOD', C('#8a6a48', 0.3)),
    ('WOOD_DARK', C('#4a3626', 0.3)), ('WOOD_PALE', C('#c9b48e', 0.25)), ('DRIFTWOOD', C('#a7a093', 0.15)),
    ('BRONZE', C('#8a6a34', 0.55, 0.9)), ('GOLD', C('#d9b24a', 0.85, 1.0, 0.0)), ('SILVER', C('#c7cacc', 0.8, 1.0, 0.0)),
    ('MARBLE', C('#e3e0d8', 0.6)), ('TRUSS', C('#b9bcbf', 0.5, 0.8)), ('INFLATE_ORANGE', C('#ec6a1c', 0.55)),
    ('INFLATE_NAVY', C('#1f2a44', 0.55)), ('TYRE', C('#161617', 0.15, 0.0, 0.0)), ('TYRE_WALL', C('#232325', 0.2)),
    ('LAMP_RED', emissive('#ff2a1c')), ('LAMP_GREEN', emissive('#3cff6a')), ('LAMP_OFF', C('#3a0d0b', 0.7)),
    ('BENCH_TOP', C('#a07a4e', 0.3)), ('TOOL_RED', C('#b8211e', 0.6, 0.3)), ('TOOL_GREY', C('#5a5d61', 0.5, 0.6)),
    ('PEGBOARD', C('#c7b38f', 0.2)), ('ENGINE', C('#5f6266', 0.45, 0.7)), ('ENGINE_DARK', C('#2e3033', 0.45, 0.6)),
    ('ENGINE_RED', C('#a41f1b', 0.6)), ('STAND_BLUE', C('#2a5a9a', 0.55, 0.3)), ('LED_WHITE', emissive('#eef6ff')),
    ('SIGN_BACK', C('#2b2d30', 0.35)), ('BRASS', C('#b8913a', 0.7, 0.9)), ('THERMOS_RED', C('#b0201e', 0.7, 0.3)),
    ('ROPE_RED_WHITE', C('#d24a4a', 0.2)), ('ROPE', C('#b8a57a', 0.15)), ('BELL_GOLD', C('#caa04a', 0.8, 1.0)),
    ('LIFERING_ORANGE', C('#ec6a1c', 0.5)), ('LIFERING_WHITE', C('#ecece6', 0.5)), ('SEEDLING', C('#6aa83c', 0.25)),
    ('SEED_TRAY', C('#2a2b2d', 0.3)), ('SOIL', C('#3e3127', 0.05)), ('BLEACHER_SEAT', C('#2f6fb5', 0.45)),
    ('STRAW_ROPE', C('#c9b27a', 0.15)), ('GLASS_DARK', C('#14181e', 0.92, 0.0, 0.0)), ('PAPER', C('#ece6d4', 0.2)),
    ('KOINOBORI_RED', C('#c8202a', 0.5)), ('KOINOBORI_BLUE', C('#2a5ab8', 0.5)), ('KOINOBORI_BLACK', C('#151517', 0.5)),
]


def layout():
    lay = _cells(CELLS, 0, 0, 16, 64)
    lay.update({
        'MANHOLE': _rect(0, 512, 128, 128, png('DT_MANHOLE', 0.35)),
        'MAP_PANEL': _rect(128, 512, 128, 96, png('DT_MAP_PANEL', 0.4)),
        'PAINT_CHIPS': _rect(256, 512, 128, 96, png('DT_PAINT_CHIPS', 0.45)),
        'KOJI': _rect(384, 512, 64, 96, png('DT_KOJI', 0.4)),
        'TIDE': _rect(448, 512, 64, 96, png('DT_TIDE', 0.4)),
        'HYDRANT': _rect(512, 512, 32, 64, png('DT_HYDRANT', 0.5)),
        'LIFERING_SIGN': _rect(544, 512, 32, 48, png('DT_LIFERING', 0.45)),
        'PLAQUE': _rect(576, 512, 64, 48, png('DT_PLAQUE', 0.6)),
        'START_BOARD': _rect(640, 512, 128, 48, png('DT_START_BOARD', 0.4)),
        'LOOKOUT': _rect(768, 512, 128, 48, png('DT_LOOKOUT', 0.4)),
        'CHECKER': _rect(896, 512, 64, 64, png('DT_CHECKER', 0.4)),
        'BANNER_MAIN': _rect(0, 640, 256, 48, png('DT_BANNER_MAIN', 0.35)),
        'BANNER_START': _rect(256, 640, 256, 48, png('DT_BANNER_START', 0.35)),
        'BANNER_CP': _rect(512, 640, 128, 32, png('DT_BANNER_CP', 0.35)),
        'GARAGE_SIGN': _rect(640, 640, 256, 64, png('DT_GARAGE_SIGN', 0.4, emit=0.8)),
        'PHONE_SIGN': _rect(896, 640, 64, 24, png('DT_PHONE', 0.4, emit=0.6)),
        'POST_SIGN': _rect(960, 640, 48, 24, png('DT_POST', 0.5)),
        'SMOKING_SIGN': _rect(896, 672, 64, 32, png('DT_SMOKING', 0.4)),
        'GOMI_SIGN': _rect(960, 672, 64, 32, png('DT_GOMI', 0.4)),
        'BANNER_SPONSOR': _rect(0, 704, 256, 48, png('DT_BANNER_SPONSOR', 0.35)),
        'STONE': dict(kind='strip', rect=(0, 768, 1024, 128), gen=stone('#8a8882', dirt=0.25), ppm=128),
    })
    return {'Details': lay}
