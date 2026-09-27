"""
Tuning-Teile: je Auto drei Optionen für Felgen, Aero, Motor und Lack.

Option 0 ist immer der Serienzustand (das, was `cars.py` beschreibt). Im
glTF hängen alle Optionen als eigene Knoten mit `extras.tune = {slot, opt}` —
das Web (und später das Spiel) blendet die gewählte ein, der Rest bleibt
unsichtbar. Geometrie für drei Motoren kostet so nur Speicher, keinen
Draw-Call, solange sie ausgeblendet ist.

Motoren sitzen im Motorraum an der echten Stelle: mit Röntgenblick durch den
Lack sieht man, was eingebaut ist.
"""
import math, bmesh
from mathutils import Vector, Matrix
import carkit as K

# ------------------------------------------------------------ Optionen/Auto
# wheels: Überschreibungen auf spec['wheel'];  aero: Liste von Teilen (wie in cars.py)
# engine: Motortyp;  paints: (Name, Grundfarbe, Stil)
T = {
 'mame': dict(
   wheels=[dict(label='Stock 5-spoke'),
           dict(label='Retro steel', style='steel', color=0xf2f0e8, lip=0.01, cap_r=0.06),
           dict(label='Mini 8-spoke', style='eight', color=0x2b2b2e, lip=0.02, lip_color=0xdadada, concave=0.015)],
   aero=[None, [dict(kind='wing', s=0.10, span=1.2, chord=0.24, h=0.03, aoa=-2, mount='post', mat='paint', thick=0.1, post_x=0.3)],
         [dict(kind='wing', s=0.09, span=1.26, chord=0.26, h=0.14, aoa=8, mount='post', mat='carbon', mat2='trim', thick=0.12, plate=(0.12, 0.26), post_x=0.3),
          dict(kind='splitter', z=0.19, depth=0.16, out=0.05)]],
   aero_labels=['Stock roof lip', 'Sport lip', 'Kei-racer wing + splitter'],
   engine='i3', paints=[('Mint two-tone', 0x8fd6c0, 'stock'), ('Sunny yellow', 0xf2c230, 'twotone'), ('Rally stripes', 0xf4f4f0, 'stripes:0xd01818')]),
 'hachi': dict(
   wheels=[dict(label='Stock 8-spoke gold'),
           dict(label='Deep dish white', style='dish', color=0xf2f2f2, metal=0.2, dish=0.03, lip=0.03, concave=0.03),
           dict(label='Bronze mesh', style='mesh', color=0xa07a36, lip=0.02, lip_color=0xe0e0e0)],
   aero=[None, [dict(kind='wing', s=0.075, span=1.24, chord=0.22, h=0.08, aoa=4, mount='post', mat='paint', thick=0.1, post_x=0.3)],
         [dict(kind='wing', s=0.06, span=1.45, chord=0.28, h=0.26, aoa=10, mount='swan', mat='carbon', mat2='trim', thick=0.12, plate=(0.2, 0.34), post_x=0.28),
          dict(kind='splitter', z=0.20, depth=0.2, out=0.06, canards=True)]],
   aero_labels=['Stock lip', 'Touge spoiler', 'Time-attack wing + canards'],
   engine='i4', paints=[('Panda', 0xf2f2ef, 'stock'), ('Black / gold', 0x0e0e10, 'twotone:0xc9a13b'), ('Tofu white', 0xf6f6f2, 'solid')]),
 'kaze': dict(
   wheels=[dict(label='White dish 6-spoke'),
           dict(label='Bronze 6-spoke', color=0x9a7430, metal=0.8, dish=0.02, lip=0.02),
           dict(label='Black mesh', style='mesh', color=0x151517, lip=0.03, lip_color=0xe8e8e8, dish=0.03)],
   aero=[None, [dict(kind='wing', s=0.04, span=1.5, chord=0.24, h=0.10, aoa=6, mount='post', mat='paint', thick=0.12, post_x=0.32)],
         [dict(kind='wing', s=0.03, span=1.40, chord=0.20, h=0.02, aoa=-8, mount='post', mat='carbon', thick=0.1, post_x=0.3)]],
   aero_labels=['Pro GT wing', 'Street wing', 'Ducktail'],
   engine='v6', paints=[('Sakura graffiti', 0x0c0c10, 'stock'), ('Candy pink', 0xe8318f, 'stripes:0x111111'), ('Matte grey', 0x5c5f63, 'solid')]),
 'rotor': dict(
   wheels=[dict(label='Bronze mesh'),
           dict(label='Silver 5-spoke', style='five', color=0xc6c9ce),
           dict(label='Black 10-spoke', style='multi', color=0x18181a, lip=0.02, lip_color=0xd8d8d8)],
   aero=[None, [dict(kind='wing', s=0.04, span=1.52, chord=0.28, h=0.24, aoa=10, mount='swan', mat='carbon', mat2='trim', thick=0.12, plate=(0.2, 0.36), post_x=0.28),
               dict(kind='splitter', z=0.17, depth=0.22, out=0.06, canards=True)],
         [dict(kind='wing', s=0.03, span=1.3, chord=0.18, h=0.02, aoa=-6, mount='post', mat='paint', thick=0.1, post_x=0.3)]],
   aero_labels=['Stock hoop wing', 'Time-attack aero', 'Clean ducktail'],
   engine='rotary', paints=[('Vintage red', 0xc4101e, 'stock'), ('Competition yellow', 0xf2c500, 'solid'), ('Night stripes', 0x121418, 'stripes:0xf2c500')]),
 'raiden': dict(
   wheels=[dict(label='Black 6-spoke'),
           dict(label='Gunmetal 10-spoke', style='multi', color=0x4a4d52, lip=0.015),
           dict(label='Bronze Y-spoke', style='y5', color=0xa07a36, concave=0.04)],
   aero=[None, [dict(kind='wing', s=0.04, span=1.55, chord=0.30, h=0.30, aoa=10, mount='swan', mat='carbon', mat2='trim', thick=0.12, plate=(0.24, 0.4), post_x=0.28)],
         [dict(kind='wing', s=0.035, span=1.38, chord=0.2, h=0.02, aoa=-4, mount='post', mat='paint', thick=0.1, post_x=0.3)]],
   aero_labels=['Stock adjustable wing', 'GT wing', 'Lip only'],
   engine='i6', paints=[('Street racer', 0xb8bdc4, 'stock'), ('Bayside blue', 0x1f4fb8, 'solid'), ('Midnight purple', 0x3a1f52, 'stripes:0xb8bdc4')]),
 'suprema': dict(
   wheels=[dict(label='Stock split 5-spoke'),
           dict(label='Chrome 10-spoke', style='multi', color=0xe0e2e6, metal=1.0, rough=0.08, dish=0.02, lip=0.025),
           dict(label='Black 6-spoke', style='six', color=0x1a1a1c, concave=0.035)],
   aero=[None, [dict(kind='wing', s=0.04, span=1.6, chord=0.3, h=0.30, aoa=10, mount='swan', mat='carbon', mat2='trim', thick=0.12, plate=(0.24, 0.4), post_x=0.28)],
         [dict(kind='wing', s=0.03, span=1.3, chord=0.18, h=0.02, aoa=-6, mount='post', mat='paint', thick=0.1, post_x=0.3)]],
   aero_labels=['Stock hoop wing', 'GT wing', 'Ducktail'],
   engine='i6', paints=[('Street orange', 0xff5a00, 'stock'), ('Renaissance red', 0xb3101c, 'solid'), ('Black / graphics', 0x0c0c0e, 'stripes:0xff5a00')]),
 'kumo': dict(
   wheels=[dict(label='Gold gravel 6-spoke'),
           dict(label='White tarmac 10-spoke', style='multi', color=0xf2f2f2, mud=False, grooves=3),
           dict(label='Gold 18" tarmac', style='six', color=0xd2a93e, mud=False, grooves=3, stretch=0.05)],
   aero=[None, [dict(kind='wing', s=0.05, span=1.3, chord=0.22, h=0.10, aoa=6, mount='post', mat='paint', thick=0.12, post_x=0.3)],
         [dict(kind='wing', s=0.06, span=1.5, chord=0.32, h=0.36, aoa=12, mount='post', mat='carbon', thick=0.13, plate=(0.22, 0.36), element2=True, post_x=0.3)]],
   aero_labels=['WRC wing', 'Street wing', 'Tarmac mega-wing'],
   engine='boxer', paints=[('Rally blue', 0x1b3c9c, 'stock'), ('Pure white', 0xf4f4f4, 'stripes:0x1b3c9c'), ('Gravel camo', 0x6a6f55, 'camo')]),
 'yama': dict(
   wheels=[dict(label='Gunmetal 6-spoke'),
           dict(label='Beadlock black', style='eight', color=0x1b1b1d, lip=0.035, lip_color=0x2c2c30, concave=0.0),
           dict(label='Bronze 5-spoke', style='five', color=0x8c6a32, concave=0.0)],
   aero=[None, [], [dict(kind='roofrack')]],
   aero_labels=['Roof rack + light bar', 'Clean roof', 'Roof rack (no change)'],
   engine='v6', paints=[('Sand gold', 0xb58b4c, 'stock'), ('Heritage blue', 0x3a5e7a, 'twotone:0xf2f2ee'), ('Olive', 0x55603f, 'camo')]),
 'hauler': dict(
   wheels=[dict(label='Steel + hubcap'),
           dict(label='Retro steel white', style='steel', color=0xf4f4f0, cap_r=0.05),
           dict(label='Mini mesh gold', style='mesh', color=0xc9a13b, lip=0.012)],
   aero=[None, [], []],
   aero_labels=['Cab guard', 'Cab guard', 'Cab guard'],
   engine='i3', paints=[('Farm white', 0xeeeeea, 'stock'), ('Kei blue', 0x2f6fb5, 'solid'), ('Retro green', 0x5b8c4a, 'twotone:0xf4f4ee')]),
 'hanami': dict(
   wheels=[dict(label='Medium (yellow)'),
           dict(label='Soft (red)', stripe=0xe8202a),
           dict(label='Wet (blue)', stripe=0x2a7bff, grooves=3)],
   aero=[None, None, None],
   aero_labels=['Standard', 'Low drag (Monza)', 'High downforce (Monaco)'],
   engine='f1v6', paints=[]),
}

# ------------------------------------------------------------------ Lack
def paint_variant(liv, spec, style, base):
    """Alternative Lackierungen. Nahtlinien kommen aus `spec['_seams']`
    (derselbe Aufruf wie die Serienlackierung), damit jede Variante Türen
    und Hauben an derselben Stelle zeigt."""
    import cars as C
    kind, _, arg = style.partition(':')
    acc = int(arg, 16) if arg else 0xffffff
    if kind == 'twotone':
        liv.band(0, 3.3, acc)
    elif kind == 'stripes':
        liv.stripe_top(0.07, 0.12, acc)
        liv.stripe_top(0.22, 0.03, acc)
    elif kind == 'camo':
        import numpy as np
        rng = np.random.default_rng(len(spec['id']))
        cols = [0x3f4630, 0x7b7a5a, 0x2b2a22]
        for i in range(90):
            s = rng.random(); j = 1.5 + rng.random() * 9.5
            R = 0.08 + rng.random() * 0.16
            liv.shape(lambda X, Y, xc=s * spec['L'], yc=liv.ym_of_j(j), R=R: ((X - xc) / R) ** 2 + ((Y - yc) / (R * 0.6)) ** 2 < 1,
                      cols[i % 3], max(s - 0.08, 0), min(s + 0.08, 1), max(j - 1.5, 0), min(j + 1.5, 11))
    liv.band(0, 1.3, 0x151517)
    C.seams(liv, **spec.get('_seams', {}))

# ----------------------------------------------------------------- Motoren
def engine_mats(cid):
    M = K.material
    return [M(f'{cid}_eng_block', color=0x8a8d91, metal=0.8, rough=0.45),
            M(f'{cid}_eng_black', color=0x151517, metal=0.3, rough=0.6),
            M(f'{cid}_eng_polish', color=0xd6d8dc, metal=1.0, rough=0.12),
            M(f'{cid}_eng_red', color=0xb8141c, metal=0.2, rough=0.55),
            M(f'{cid}_eng_blue', color=0x1f5bd8, metal=0.9, rough=0.25),
            M(f'{cid}_eng_turbo', color=0x6e5a4a, metal=1.0, rough=0.3),
            M(f'{cid}_eng_carbon', color=0x1c1c20, metal=0.4, rough=0.2, coat=1.0),
            M(f'{cid}_eng_gold', color=0xc9a13b, metal=1.0, rough=0.2)]
BLOCK, BLACK, POLISH, RED, BLUE, TURBO, CARBON, GOLD = range(8)

def _turbo(bm, c, r, mat=TURBO):
    c = Vector(c)
    bm_ = bm
    # Verdichterschnecke als flacher Zylinder + Einlass, Turbinengehäuse dahinter
    K.bm_cyl(bm_, c + Vector((-0.05, 0, 0)), c + Vector((0.03, 0, 0)), r, segs=20, mat=mat)
    K.bm_cyl(bm_, c + Vector((0.03, 0, 0)), c + Vector((0.09, 0, 0)), r * 0.62, r * 0.55, segs=16, mat=POLISH)
    K.bm_cyl(bm_, c + Vector((-0.05, 0, 0)), c + Vector((-0.11, 0, 0)), r * 0.85, segs=16, mat=TURBO)

def build_engine(kind, stage, mats, bay):
    """kind: i3/i4/i6/v6/boxer/rotary/f1v6.  stage 0 = Serie, 1 = Street, 2 = Race.
    bay: (x, y, z, max_len) — Mitte unten des Motorraums, Motorlänge längs Y."""
    bm = bmesh.new()
    x0, y0, z0, Lmax = bay
    ncyl = {'i3': 3, 'i4': 4, 'i6': 6, 'v6': 3, 'boxer': 2, 'rotary': 2, 'f1v6': 3}[kind]
    pitch = 0.095
    L = min(ncyl * pitch + 0.16, Lmax)
    yA, yB = y0 - L / 2, y0 + L / 2
    cover = [BLACK, RED, CARBON][stage]
    if kind in ('i3', 'i4', 'i6'):
        K.bm_box(bm, (x0, y0, z0 + 0.17), (0.30, L, 0.34), mat=BLOCK)
        K.bm_box(bm, (x0, y0, z0 + 0.39), (0.24, L - 0.04, 0.10), mat=BLOCK)
        K.bm_box(bm, (x0, y0, z0 + 0.47), (0.21, L - 0.08, 0.07), mat=cover)
        for i in range(ncyl):  # Zündspulen
            yy = yA + 0.08 + i * (L - 0.16) / max(ncyl - 1, 1)
            K.bm_cyl(bm, (x0, yy, z0 + 0.5), (x0, yy, z0 + 0.54), 0.018, segs=8, mat=BLACK if stage < 2 else GOLD)
        # Ansaugseite (+X)
        for i in range(ncyl):
            yy = yA + 0.08 + i * (L - 0.16) / max(ncyl - 1, 1)
            if stage < 2:
                K.bm_cyl(bm, (x0 + 0.12, yy, z0 + 0.36), (x0 + 0.24, yy, z0 + 0.30), 0.022, segs=10, mat=BLOCK)
            else:  # Einzeldrossel + Ansaugtrichter
                K.bm_cyl(bm, (x0 + 0.12, yy, z0 + 0.38), (x0 + 0.22, yy, z0 + 0.42), 0.025, segs=12, mat=BLACK)
                K.bm_cyl(bm, (x0 + 0.22, yy, z0 + 0.42), (x0 + 0.30, yy, z0 + 0.46), 0.026, 0.038, segs=14, cap=False, mat=POLISH)
        if stage < 2:
            K.bm_box(bm, (x0 + 0.25, y0, z0 + 0.30), (0.08, L - 0.06, 0.10), mat=BLOCK if stage == 0 else BLUE)
        # Auslassseite (−X): Krümmer
        for i in range(ncyl):
            yy = yA + 0.08 + i * (L - 0.16) / max(ncyl - 1, 1)
            K.bm_cyl(bm, (x0 - 0.13, yy, z0 + 0.34), (x0 - 0.22, yy, z0 + 0.20), 0.02, segs=8, mat=TURBO if stage else BLOCK)
        if stage >= 1:
            _turbo(bm, (x0 - 0.22, y0, z0 + 0.20), 0.06 + 0.02 * stage)
    elif kind in ('v6', 'f1v6'):
        K.bm_box(bm, (x0, y0, z0 + 0.14), (0.34, L, 0.28), mat=BLOCK)
        for sd in (-1, 1):
            R = Matrix.Rotation(math.radians(sd * 30), 3, 'Y')
            c = Vector((x0 + sd * 0.14, y0, z0 + 0.34))
            K.bm_box(bm, c, (0.14, L - 0.02, 0.18), mat=BLOCK, rot=R)
            K.bm_box(bm, c + R @ Vector((0, 0, 0.11)), (0.12, L - 0.06, 0.05), mat=cover, rot=R)
            if stage >= 1:
                _turbo(bm, (x0 + sd * 0.30, y0 + L * 0.35, z0 + 0.18), 0.055 + 0.015 * stage)
        K.bm_box(bm, (x0, y0, z0 + 0.46), (0.18, L - 0.1, 0.10), mat=[BLOCK, BLUE, CARBON][stage])
    elif kind == 'boxer':
        K.bm_box(bm, (x0, y0, z0 + 0.20), (0.32, L, 0.26), mat=BLOCK)
        for sd in (-1, 1):
            K.bm_box(bm, (x0 + sd * 0.26, y0, z0 + 0.20), (0.16, L - 0.04, 0.22), mat=BLOCK)
            K.bm_box(bm, (x0 + sd * 0.35, y0, z0 + 0.20), (0.04, L - 0.08, 0.18), mat=cover)
        # oben liegender Ladeluftkühler — das Erkennungszeichen
        K.bm_box(bm, (x0, y0 - 0.02, z0 + 0.40), (0.44, 0.30, 0.07), mat=[BLOCK, POLISH, POLISH][stage])
        K.bm_box(bm, (x0, y0 - 0.02, z0 + 0.44), (0.40, 0.26, 0.012), mat=BLACK)
        _turbo(bm, (x0 - 0.18, y0 + L * 0.4, z0 + 0.25), 0.06 + 0.015 * stage)
    elif kind == 'rotary':
        for i in range(2):
            yy = y0 - 0.06 + i * 0.12
            K.bm_cyl(bm, (x0, yy - 0.05, z0 + 0.22), (x0, yy + 0.05, z0 + 0.22), 0.20, segs=24, mat=BLOCK)
        K.bm_box(bm, (x0 + 0.15, y0, z0 + 0.36), (0.18, 0.30, 0.12), mat=[BLOCK, BLUE, CARBON][stage])
        if stage == 0:
            for sd in (-1, 1):
                _turbo(bm, (x0 - 0.2, y0 + sd * 0.1, z0 + 0.24), 0.055)
        else:
            _turbo(bm, (x0 - 0.22, y0, z0 + 0.26), 0.085 + 0.015 * stage)
    # Luftfilter / Ladeluftrohr — die sichtbarste Änderung je Stufe
    if stage == 0:
        K.bm_box(bm, (x0 + 0.25, yA - 0.05, z0 + 0.38), (0.22, 0.18, 0.12), mat=BLACK)
    elif stage == 1:
        K.bm_cyl(bm, (x0 + 0.2, yA - 0.02, z0 + 0.36), (x0 + 0.28, yA - 0.14, z0 + 0.38), 0.035, segs=12, mat=BLUE)
        K.bm_cyl(bm, (x0 + 0.28, yA - 0.14, z0 + 0.38), (x0 + 0.30, yA - 0.26, z0 + 0.38), 0.05, 0.06, segs=14, mat=RED)
    else:
        K.bm_cyl(bm, (x0 - 0.22, y0, z0 + 0.34), (x0 - 0.22, yA - 0.08, z0 + 0.30), 0.03, segs=12, mat=POLISH)
        K.bm_cyl(bm, (x0 - 0.22, yA - 0.08, z0 + 0.30), (x0 + 0.1, yA - 0.1, z0 + 0.12), 0.03, segs=12, mat=POLISH)
        K.bm_box(bm, (x0, yA - 0.16, z0 + 0.12), (0.6, 0.05, 0.22), mat=POLISH)   # Ladeluftkühler vorn
        K.bm_cyl(bm, (x0 - 0.25, yA - 0.02, z0 + 0.36), (x0 + 0.25, yA - 0.02, z0 + 0.36), 0.012, segs=8, mat=BLUE)  # Domstrebe
    return bm

# -------------------------------------------------------------- Einbau
def engine_bay(spec):
    L = spec['L']
    _, _, yf, yr = K.wheel_s(spec)
    y_ws = L / 2 - spec['glass']['ws'][1] * L
    if spec['id'] == 'hauler':
        return (0.0, yr - 0.45, 0.30, 0.45)
    if spec['id'] == 'mame':
        return (0.0, (yf + y_ws) / 2 - 0.05, 0.28, 0.40)
    y0 = (yf + y_ws) / 2 + 0.05
    zb = K.pchip(spec['zb'])((L / 2 - y0) / L)
    return (0.0, y0, zb + 0.08, min(abs(y_ws - yf) + 0.5, 0.75))

def engine_obj(name, bm, em):
    """Motor-Mesh mit feiner Fase: ohne sie ist jede Kante eine scharfe
    Schattenlinie, und der Block liest sich als Spielzeugklotz."""
    ob = K.mesh_obj(name, bm, em, smooth=False)
    b = ob.modifiers.new('bev', 'BEVEL'); b.width = 0.008; b.segments = 2; b.limit_method = 'ANGLE'
    K.apply_mods(ob)
    return ob
