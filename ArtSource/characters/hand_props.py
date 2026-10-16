"""Things people carry (task 6), separate from the figures so one figure can
walk with an umbrella, stand with a phone or sit with nothing: Unity hangs
them on LeftHand/RightHand.

Origin = the grip (centre of the closed hand). 'hang' props point down (-Z)
from the grip like a bag in a hanging hand; 'up' props rise from it (an open
umbrella in the WalkUmbrella clip, the phone in Phone, the rod in Fish).
exports/characters/hand_props.json lists hand and axis per prop.

The vinyl umbrella (biniru-gasa) is the after-the-rain prop of Japan: clear
canopy (M_Glass), white handle and ribs."""
import json, math, os
from mathutils import Vector, Matrix
from kit import core as K
from characters import figure_kit as FK

KLASS = 'characters'
NAME = 'HandProps'
ATLAS = 'Figures'
W0 = {'Hips': 1}
Z = Vector((0, 0, 1))


def ctx(lod=0):
    return FK.FC(lod, FK.BODIES['M'])


def _glass(faces):
    for f in faces:
        f.material_index = 1


def umbrella_open(c, canopy, rib='PLASTIC_WHITE', handle='PLASTIC_WHITE', glass=False):
    n = c.n(16, 8, 8)
    R, top = 0.5, 0.86
    # shaft + J handle below the grip
    c.tube([Vector((0, 0, -0.08)), Vector((0, 0, top + 0.05))], 0.0055, 4, 'METAL_STEEL', W0)
    c.tube([Vector((0, 0, 0.06)), Vector((0, 0, -0.1))], 0.016, c.n(6, 4, 4), handle, W0)
    if c.lod == 0:
        c.tube([Vector((0, 0, -0.1)), Vector((0, 0.0, -0.14)), Vector((0, 0.035, -0.16)), Vector((0, 0.06, -0.13))], 0.013, 6, handle, W0)
    # canopy: 8 panels, each sagging between the ribs (scallop at the rim)
    rings = []
    for t, rr, z in ((0.0, 0.03, top + 0.02), (0.35, 0.2, top - 0.03), (0.7, 0.38, top - 0.12), (1.0, R, top - 0.22)):
        rings.append((rr, z))
    bm = c.bm
    rows = []
    for rr, z in rings:
        row = []
        for j in range(n):
            a = 2 * math.pi * j / n
            sag = 0.0 if j % (n // 8) == 0 else 0.02 * (rr / R)
            row.append(bm.verts.new((rr * math.cos(a) * (1 - 0.04 * (j % 2 if n > 8 else 0)), rr * math.sin(a), z - sag)))
        c.weigh(row, W0)
        rows.append(row)
    tip = bm.verts.new((0, 0, top + 0.04)); c.weigh([tip], W0)
    outer, inner = [], []
    for j in range(n):
        jj = (j + 1) % n
        outer.append(bm.faces.new([tip, rows[0][j], rows[0][jj]]))
        for i in range(len(rows) - 1):
            outer.append(bm.faces.new([rows[i][j], rows[i + 1][j], rows[i + 1][jj], rows[i][jj]]))
    for f in outer:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    # underside (seen when walking past someone), same verts, flipped
    dup = {}
    for f in outer:
        for v in f.verts:
            if v not in dup:
                dup[v] = bm.verts.new(v.co - Vector((0, 0, 0.003)))
                c.weigh([dup[v]], W0)
    for f in list(outer):
        inner.append(bm.faces.new([dup[v] for v in reversed(f.verts)]))
    c.paint(outer + inner, canopy)
    if glass:
        _glass(outer + inner)
    if c.lod < 2:
        # ribs under the canopy, stretchers to the runner, tips
        for j in range(0, n, n // 8):
            a = 2 * math.pi * j / n
            pts = [Vector((rr * math.cos(a), rr * math.sin(a), z - 0.008)) for rr, z in rings[1:]]
            c.tube([Vector((0, 0, top))] + pts, 0.0035, 3, rib, W0, caps=False)
            if c.lod == 0:
                c.tube([Vector((0, 0, top - 0.3)), pts[1] - Vector((0, 0, 0.004))], 0.003, 3, rib, W0, caps=False)
                c.box(pts[-1] + Vector((0, 0, -0.01)), (0.006, 0.006, 0.012), rib, W0)
        c.tube([Vector((0, 0, top - 0.33)), Vector((0, 0, top - 0.27))], 0.012, 6, rib, W0)


def umbrella_closed(c, canopy, handle='PLASTIC_WHITE', glass=False, strap='PLASTIC_WHITE'):
    """Furled, hanging from the hand by its J handle (tip down)."""
    n = c.n(8, 6, 4)
    c.tube([Vector((0, 0.0, 0.02)), Vector((0, 0.0, -0.11))], 0.014, 6, handle, W0)
    if c.lod == 0:
        c.tube([Vector((0, 0, 0.02)), Vector((0, 0, 0.05)), Vector((0, -0.035, 0.065)), Vector((0, -0.06, 0.04))], 0.012, 6, handle, W0)
    rings = [dict(c=(0, 0, -0.11), a=0.008, f=0.008, k=0.008, w=W0, reg=canopy),
             dict(c=(0, 0, -0.16), a=0.03, f=0.026, k=0.03, w=W0, reg=canopy),
             dict(c=(0, 0, -0.35), a=0.04, f=0.034, k=0.04, w=W0, reg=canopy),
             dict(c=(0, 0, -0.7), a=0.016, f=0.014, k=0.016, w=W0, reg=canopy),
             dict(c=(0, 0, -0.76), a=0.005, f=0.005, k=0.005, w=W0, reg='METAL_STEEL'),
             dict(c=(0, 0, -0.82), a=0.0, w=W0, reg='METAL_STEEL')]
    bands, caps = c.loft(rings, n, p=2.0)
    if glass:
        _glass([f for b in bands[:3] for f in b])
    if c.lod == 0:   # the closing strap with its snap
        c.loft([dict(c=(0, 0, -0.3), a=0.044, f=0.038, k=0.044, w=W0, reg=strap),
                dict(c=(0, 0, -0.33), a=0.044, f=0.038, k=0.044, w=W0, reg=strap)], n, cap0=False, cap1=False)


def briefcase(c, reg='LEATHER_BLACK'):
    c.tube([Vector((0, 0.04, -0.03)), Vector((0, 0.035, 0.005)), Vector((0, -0.035, 0.005)), Vector((0, -0.04, -0.03))],
           0.007, 4, reg, W0)
    c.box(Vector((0, 0, -0.17)), (0.042, 0.19, 0.14), reg, W0)
    if c.lod == 0:
        for yy in (0.08, -0.08):
            c.box(Vector((0, yy, -0.034)), (0.044, 0.012, 0.008), 'BUCKLE', W0)
        c.box(Vector((0, 0, -0.17)), (0.044, 0.192, 0.004), 'SOLE_DARK', W0)     # seam band


def phone(c):
    c.box(Vector((0, 0, 0.03)), (0.036, 0.004, 0.074), 'PHONE_BLACK', W0)
    fs = c.box(Vector((0, -0.0045, 0.03)), (0.032, 0.0005, 0.068), 'PHONE_SCREEN', W0, skip=('+y',))
    if c.lod == 0:
        c.box(Vector((0.02, 0.0045, 0.085)), (0.01, 0.0015, 0.012), 'METAL_STEEL', W0)   # camera bump


def broom(c):
    """Take-boki: bamboo handle, a fan of twigs bound with wire (tip down)."""
    c.tube([Vector((0, 0, 0.35)), Vector((0, 0, -0.95))], 0.013, c.n(6, 4, 4), 'BAMBOO', W0)
    if c.lod == 0:
        for z in (0.2, -0.2, -0.6):
            c.tube([Vector((0, 0, z)), Vector((0, 0, z - 0.012))], 0.0145, 6, 'BAMBOO', W0)   # nodes
    rings = [dict(c=(0, 0, -0.9), a=0.03, f=0.02, k=0.02, w=W0, reg='BROOM_STRAW'),
             dict(c=(0, 0, -1.05), a=0.09, f=0.03, k=0.03, w=W0, reg='BROOM_STRAW'),
             dict(c=(0, 0.02, -1.3), a=0.2, f=0.04, k=0.05, w=W0, reg='BROOM_STRAW'),
             dict(c=(0, 0.03, -1.36), a=0.21, f=0.03, k=0.04, w=W0, reg='BROOM_STRAW')]
    c.loft(rings, c.n(10, 6, 4), p=2.6)
    c.tube([Vector((0, 0, -0.97)), Vector((0, 0, -0.995))], 0.06, 6, 'METAL_STEEL', W0)


def rod(c):
    """Fishing rod: cork grip, reel, rod 2.4 m forward-up, line to a float."""
    c.tube([Vector((0, 0, -0.25)), Vector((0, 0, 0.15))], 0.016, 6, 'CORK', W0)
    pts = [Vector((0, 0, 0.15)), Vector((0, -0.4, 0.9)), Vector((0, -0.85, 1.65)), Vector((0, -1.15, 2.1))]
    rings = [dict(c=p, a=r, f=r, k=r, w=W0, reg='ROD_BLACK') for p, r in zip(pts, (0.011, 0.008, 0.005, 0.0025))]
    c.loft(rings, c.n(6, 4, 4))
    c.loft([dict(c=(0, 0.035, -0.05), d=(1, 0, 0), a=0.035, f=0.035, k=0.035, w=W0, reg='METAL_STEEL'),
            dict(c=(0.03, 0.035, -0.05), d=(1, 0, 0), a=0.035, f=0.035, k=0.035, w=W0, reg='METAL_STEEL')], c.n(10, 6, 4))
    c.tube([Vector((0, 0.012, -0.05)), Vector((0, 0.03, -0.05))], 0.006, 4, 'METAL_STEEL', W0)
    if c.lod == 0:   # line hanging from the tip, float on the water level ~1.6 m below
        c.tube([pts[-1], pts[-1] + Vector((0, -0.05, -1.6))], 0.0012, 3, 'PLASTIC_WHITE', W0, caps=False)
        c.loft([dict(c=pts[-1] + Vector((0, -0.05, -1.62)), a=0.0, w=W0, reg='UMBRELLA_RED'),
                dict(c=pts[-1] + Vector((0, -0.05, -1.58)), a=0.012, f=0.012, k=0.012, w=W0, reg='UMBRELLA_RED'),
                dict(c=pts[-1] + Vector((0, -0.05, -1.55)), a=0.0, w=W0, reg='PLASTIC_WHITE')], 6)


def bag(c, kind):
    """Shopping bags hanging from a hand: eco bag with a daikon, white konbini bag, kinchaku."""
    top = Vector((0, 0, -0.07))
    if kind == 'EcoBag':
        c.loft([dict(c=top - Z * 0.3, d=Z, a=0.06, f=0.14, k=0.14, w=W0, reg='ECO_BAG'),
                dict(c=top, d=Z, a=0.07, f=0.16, k=0.16, w=W0, reg='ECO_BAG')], c.n(8, 6, 4), cap0=True, cap1=False, p=3.5)
        c.loft([dict(c=top - Z * 0.002, d=Z, a=0.066, f=0.156, k=0.156, w=W0, reg='CHICKEN_DARK'),
                dict(c=top - Z * 0.03, d=Z, a=0.0, w=W0, reg='CHICKEN_DARK')], c.n(8, 6, 4), cap0=False, cap1=False, p=3.5)
        for yy in (0.06, -0.06):
            c.tube([top + Vector((0, yy * 1.4, 0)), Vector((0, yy * 0.3, 0)), top + Vector((0, yy * 0.6, 0))], 0.006, 3, 'ECO_BAG', W0,
                   caps=False)
        if c.lod == 0:   # daikon and its leaves sticking out
            c.loft([dict(c=top + Vector((0, 0.06, -0.12)), a=0.0, w=W0, reg='PLASTIC_WHITE'),
                    dict(c=top + Vector((0, 0.07, -0.04)), a=0.03, f=0.03, k=0.03, w=W0, reg='PLASTIC_WHITE'),
                    dict(c=top + Vector((0, 0.09, 0.1)), a=0.032, f=0.032, k=0.032, w=W0, reg='PLASTIC_WHITE')], 6)
            for a in (-25, 0, 25):
                c.box(top + Vector((0, 0.1, 0.18)), (0.012, 0.02, 0.07), 'HOODIE_OLIVE', W0,
                      rot=Matrix.Rotation(math.radians(a), 3, 'X') @ Matrix.Rotation(math.radians(a), 3, 'Y'))
    elif kind == 'KonbiniBag':
        c.loft([dict(c=top - Z * 0.28, d=Z, a=0.05, f=0.11, k=0.11, w=W0, reg='KONBINI_BAG'),
                dict(c=top - Z * 0.12, d=Z, a=0.08, f=0.13, k=0.13, w=W0, reg='KONBINI_BAG'),
                dict(c=top - Z * 0.02, d=Z, a=0.03, f=0.09, k=0.09, w=W0, reg='KONBINI_BAG')], c.n(8, 6, 4), p=2.4)
        for yy in (0.05, -0.05):
            c.tube([top + Vector((0, yy, -0.02)), Vector((0, yy * 0.3, 0)), top + Vector((0, yy * 0.2, 0.0))], 0.008, 3, 'KONBINI_BAG', W0)
    elif kind == 'Kinchaku':
        rr = [dict(c=top - Z * 0.14, a=0.0, w=W0, reg='OBI_YELLOW'), dict(c=top - Z * 0.12, a=0.05, f=0.05, k=0.05, w=W0, reg='OBI_YELLOW'),
              dict(c=top - Z * 0.04, a=0.055, f=0.055, k=0.055, w=W0, reg='OBI_YELLOW'),
              dict(c=top, a=0.025, f=0.025, k=0.025, w=W0, reg='OBI_YELLOW'),
              dict(c=top + Z * 0.02, a=0.035, f=0.035, k=0.035, w=W0, reg='OBI_YELLOW')]
        c.loft(rr, c.n(8, 6, 4))
        c.tube([top + Z * 0.01, Vector((0, 0.01, 0)), top + Vector((0, -0.01, 0.01))], 0.004, 3, 'OBI_RED', W0, caps=False)


def cane(c):
    c.tube([Vector((0.0, 0.0, 0.0)), Vector((0, 0, -0.84))], 0.011, c.n(6, 4, 4), 'WOOD_HANDLE', W0)
    c.tube([Vector((0, 0, 0.0)), Vector((0, -0.03, 0.035)), Vector((0, -0.08, 0.035)), Vector((0, -0.11, 0.01))], 0.013, 6,
           'WOOD_HANDLE', W0)
    c.tube([Vector((0, 0, -0.84)), Vector((0, 0, -0.875))], 0.014, 6, 'RUBBER_BLACK', W0)


def hammer(c):
    c.tube([Vector((0, 0, -0.06)), Vector((0, 0, 0.2))], 0.014, 6, 'WOOD_HANDLE', W0)
    c.box(Vector((0, -0.01, 0.22)), (0.018, 0.06, 0.02), 'METAL_STEEL', W0)


def baton(c):
    """Red LED light baton of the traffic guard (yūdōtō): grip, glowing tube."""
    c.tube([Vector((0, 0, 0.05)), Vector((0, 0, -0.1))], 0.018, 6, 'ROD_BLACK', W0)
    c.loft([dict(c=(0, 0, -0.1), a=0.02, f=0.02, k=0.02, w=W0, reg='BATON_LIT'),
            dict(c=(0, 0, -0.52), a=0.017, f=0.017, k=0.017, w=W0, reg='BATON_LIT', cap=0.012)], c.n(8, 6, 4))


PROPS = {
    'Baton': (baton, 'Right', 'hang'),
    'Umbrella_Vinyl_Open': (lambda c: umbrella_open(c, 'PLASTIC_WHITE', glass=True), 'Right', 'up'),
    'Umbrella_Vinyl_Closed': (lambda c: umbrella_closed(c, 'PLASTIC_WHITE', glass=True), 'Right', 'hang'),
    'Umbrella_Black_Open': (lambda c: umbrella_open(c, 'UMBRELLA_BLACK', rib='METAL_STEEL', handle='WOOD_HANDLE'), 'Right', 'up'),
    'Umbrella_Navy_Closed': (lambda c: umbrella_closed(c, 'UMBRELLA_NAVY', handle='WOOD_HANDLE', strap='UMBRELLA_NAVY'), 'Right', 'hang'),
    'Umbrella_Red_Open': (lambda c: umbrella_open(c, 'UMBRELLA_RED', rib='METAL_STEEL', handle='WOOD_HANDLE'), 'Right', 'up'),
    'Briefcase': (briefcase, 'Right', 'hang'),
    'Phone': (phone, 'Right', 'up'),
    'Broom': (broom, 'Left', 'hang'),
    'FishingRod': (rod, 'Right', 'up'),
    'EcoBag': (lambda c: bag(c, 'EcoBag'), 'Left', 'hang'),
    'KonbiniBag': (lambda c: bag(c, 'KonbiniBag'), 'Left', 'hang'),
    'Kinchaku': (lambda c: bag(c, 'Kinchaku'), 'Left', 'hang'),
    'Cane': (cane, 'Left', 'hang'),
    'Hammer': (hammer, 'Right', 'up'),
}


def build(only=None):
    mat = K.atlas_material(ATLAS, emission_strength=1.0)
    glass = K.glass_material()
    out = []
    info = {}
    for name, (fn, hand, axis) in PROPS.items():
        if only and name not in only:
            continue
        col = K.collection(f'Hito_Prop_{name}')
        lods = []
        for lod in (0, 1):
            c = ctx(lod)
            fn(c)
            mats = [mat, glass] if any(f.material_index == 1 for f in c.bm.faces) else mat
            ob = FK.rigid_object(f'SM_Hito_Prop_{name}_LOD{lod}', c, col, mats)
            if lod:
                ob.hide_set(True); ob.hide_render = True
            lods.append(ob)
        info[name] = dict(hand=hand + 'Hand', axis=axis)
        out.append((col, lods))
    path = os.path.join(K.ART, 'exports', 'characters', 'hand_props.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = {}
    if os.path.exists(path):
        with open(path) as f:
            old = json.load(f)
    old.update(info)
    with open(path, 'w') as f:
        json.dump(dict(sorted(old.items())), f, indent=1)
    return out


def preview(results, views):
    """All props in a row (grip at z = 1.0 so the hanging ones clear the floor)."""
    from kit import preview as P
    objs = [lods[0] for _, lods in results]
    x = 0.0
    for o in objs:
        w = max(o.dimensions.x, 0.12)
        o.location = (x + w / 2, 0, 1.45 if 'Broom' in o.name else 1.0)
        x += w + 0.15
    try:
        return P.render(objs, 'Hito_HandProps', views[:2] + views[-2:-1], size=(1200, 420),
                        show=[c.name for c, _ in results])
    finally:
        for o in objs:
            o.location = (0, 0, 0)
