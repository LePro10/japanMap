"""Atlas `Traffic` (task 6: the NPC cars of the town): trim, glass, lamps,
tyres and the Japanese number plates as cells; body paint is NOT here - it is
the second material M_TrafficPaint, tinted per car in Unity (one mesh, any
colour; the town's mix is mostly pearl white, silver, black, with kei mint
and beige).

Plates (cells, no text: they read as plates by colour): white with green
edge = private car, yellow = private kei, green = taxi/commercial, black =
commercial kei. Lamps glow (blue hour, cars drive with lights on)."""
from .atlas import flat, emissive, _cells

C = lambda col, s=0.4, m=0.0: flat(col, s, m, dirt=0.0)

CELLS = [
    ('PAINT', C('#e8e8e6', 0.6)),             # unused colour: the paint slot only needs UVs
    ('GLASS', C('#14181e', 0.92)), ('GLASS_TINT', C('#0b0c0f', 0.92)),
    ('TRIM_BLACK', C('#151617', 0.35)), ('TRIM_GREY', C('#3a3c3f', 0.4)), ('CHROME', C('#c9ccd0', 0.85, 1.0)),
    ('TYRE', C('#171718', 0.15)), ('RIM_SILVER', C('#a9adb2', 0.6, 0.9)), ('RIM_DARK', C('#3c3e42', 0.5, 0.8)),
    ('HUB', C('#5d6064', 0.4, 0.8)), ('ARCH', C('#0e0e0f', 0.1)), ('UNDER', C('#1c1c1d', 0.1)),
    ('HEAD_LIT', emissive('#fff3dc')), ('TAIL_LIT', emissive('#ff2a1c')), ('TAIL_RED', C('#7a0e0c', 0.8)),
    ('AMBER', C('#e88a1a', 0.8)), ('REVERSE', C('#d9dcdf', 0.8)),
    ('PLATE_WHITE', C('#ecece6', 0.5)), ('PLATE_YELLOW', C('#e8c21a', 0.5)), ('PLATE_GREEN', C('#1f6a3a', 0.5)),
    ('PLATE_BLACK', C('#151515', 0.5)), ('PLATE_TEXT_GREEN', C('#1f5a32', 0.4)), ('PLATE_TEXT_DARK', C('#1a1a1a', 0.4)),
    ('PLATE_TEXT_WHITE', C('#e6e6e0', 0.4)), ('PLATE_TEXT_YELLOW', C('#e0b81a', 0.4)),
    ('ANDON_LIT', emissive('#ffe7a8')), ('ANDON_BODY', C('#d9d4c4', 0.5)), ('TAXI_INDIGO', C('#1b2236', 0.65)),
    ('TAXI_ORANGE', C('#e07a1c', 0.65)), ('TAXI_YELLOW', C('#e3b91d', 0.65)), ('TAXI_GREEN', C('#2d6a46', 0.65)),
    ('TAXI_STRIPE', C('#c9a14a', 0.6, 0.7)), ('ALU_BOX', C('#c3c6c8', 0.5, 0.7)), ('ALU_RIB', C('#9fa3a6', 0.5, 0.7)),
    ('TRUCK_CAB', C('#e3e4e1', 0.6)), ('MUDFLAP', C('#121212', 0.2)), ('INTERIOR', C('#202124', 0.2)),
    ('RACK', C('#2a2b2d', 0.4, 0.6)), ('WIPER', C('#0f0f10', 0.3)), ('BUS_GREEN', C('#3e7a4e', 0.55)),
    ('BUS_CREAM', C('#e6dfc9', 0.55)), ('SIGN_LIT', emissive('#ffb347')), ('DECAL_WHITE', C('#ecebe6', 0.5)),
]


def layout():
    return {'Traffic': _cells(CELLS, 0, 0, 16, 64)}
