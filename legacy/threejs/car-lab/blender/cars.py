"""
Die Flotte. Namen sind erfunden (keine Marken, keine Logos), Proportionen an
echten Vorbildern: Länge, Breite, Höhe, Radstand, Spur und Radgröße liegen
dicht an den Datenblättern — der Rest ist Stil.

Karosserie-Schlüssel (s: 0 = Heck, 1 = Front):
  zb     Unterkante        zbelt  Schulter/Gürtellinie   ztop  Mittellinie oben
  wb     halbe Breite (Anteil an W/2) an der Flanke      wt    Dachbreite (Anteil)
  glass  rear/ws/side = s-Bereiche der Scheiben, bpillar = Säulen
"""
import math

def seams(liv, doors=(), hood=None, trunk=None, fuel=None, dark=0x101010):
    liv.spec['_seams'] = dict(doors=doors, hood=hood, trunk=trunk, fuel=fuel)
    for s0, s1 in doors:
        liv.seam(s0, 2.2, 5.8, dark, lean=-0.02)
        liv.seam(s1, 2.2, 5.8, dark, lean=0.06)
        liv.seam_long(2.25, s0, s1, dark)
    if hood:
        s0, s1, j = hood
        liv.seam(s0, j, 11, dark)
        liv.seam_long(j, s0, s1, dark)
    if trunk:
        s0, s1, j = trunk
        liv.seam(s1, j, 11, dark)
        liv.seam_long(j, s0, s1, dark)
    if fuel:
        s, j = fuel
        liv.circle(s, j, 0.075, dark, ring=0.07)

PLATE = ('rr', 0.33, 0.165, 0.01)

# ------------------------------------------------------------------ Mame K
def liv_mame(liv, spec):
    liv.band(5.6, 11, 0xf6f4ee, 0.0, 1.0)            # weißes Dach (Zweifarb)
    liv.band(5.0, 5.35, 0xd8d4c8, 0.14, 0.78)        # Zierlinie
    seams(liv, doors=[(0.44, 0.74)], hood=(0.80, 0.985, 6.2), fuel=(0.2, 4.0))
    liv.seam(0.13, 1.5, 5.2, 0x101010)

MAME = dict(
    id='mame', name='Mame K', maker='Hoshi', klass='Starter', inspo='Kei hatch (N-One / Alto Works)',
    tagline='660 cc, 64 PS, zero fear. The car you learn the map in.',
    hp=64, kg=840, drive='FWD', top_kmh=140, sound='kei',
    L=3.395, W=1.475, H=1.545, wb_len=2.52, track=1.30, r=0.285, tw=0.165, axle_off=0.0,
    travel=0.2, lock=40, stiff=0.7, roll=0.09, pitch=0.07, grip=0.85, drift=0.4,
    zfloor=0.30, eye_h=0.88, cowl_hip=1.18,
    zb=[(0, 0.28), (0.04, 0.2), (0.96, 0.19), (1, 0.27)],
    zbelt=[(0, 0.84), (0.05, 0.92), (0.6, 0.93), (0.8, 0.88), (0.95, 0.80), (1, 0.66)],
    ztop=[(0, 0.96), (0.02, 1.02), (0.12, 1.50), (0.55, 1.545), (0.63, 1.51), (0.80, 0.99), (0.9, 0.93), (1, 0.78)],
    wb=[(0, 0.90), (0.04, 0.98), (0.95, 0.97), (1, 0.86)],
    wt=[(0, 0.80), (0.12, 0.84), (0.63, 0.84), (0.80, 0.88), (1, 0.80)],
    crown=[(0, 0.02), (0.5, 0.03), (1, 0.03)],
    glass=dict(rear=(0.02, 0.12), ws=(0.63, 0.80), side=(0.13, 0.765), bpillar=(0.415, 0.44)),
    creases={5: 0.8, 8: 0.7, 2: 0.5}, cap_crease=0.6,
    paint=dict(base=0x8fd6c0, metal=0.15, rough=0.35),
    livery=liv_mame,
    wheel=dict(rim_r=0.18, style='five', spokes=5, color=0xd9dcdf, caliper=0x3a3a3a, spoke_w=0.05, concave=0.01),
    plate='3-21', plate_yellow=True,
    parts=[
        dict(kind='head', x=0.52, z=0.74, shape=('ell', 0.22, 0.22), inset=0.8, proj=[(0.0, 0.0, 0.05)]),
        dict(kind='grille', x=0, z=0.70, pair=False, shape=('rr', 0.48, 0.13, 0.05)),
        dict(kind='grille', x=0, z=0.34, pair=False, shape=('rr', 0.70, 0.10, 0.04)),
        dict(kind='amber', x=0.52, z=0.52, shape=('rr', 0.12, 0.05, 0.02)),
        dict(kind='plate_f', x=0, z=0.46, pair=False, shape=PLATE, proud=0.012),
        dict(kind='tail', x=0.60, z=0.90, shape=('rr', 0.14, 0.30, 0.05), inset=0.86),
        dict(kind='plate_r', x=0, z=0.62, pair=False, shape=PLATE, proud=0.012),
        dict(kind='mirror', paint=True),
        dict(kind='exhaust', tips=[(-0.40, 0.26, 0.03)]),
        dict(kind='side', s=0.56, z=0.86, shape=('rr', 0.12, 0.03, 0.012), mat='chrome'),
        dict(kind='wing', s=0.10, span=1.18, chord=0.20, h=0.0, aoa=-4, mount='post', mat='paint', thick=0.10, post_x=0.3),
    ],
    int_color=0x2b2a28, seat_color=0x3a3530, seat_accent=0x8fd6c0, racing_seats=False,
)

# ------------------------------------------------------------------ Hachi 86
def liv_hachi(liv, spec):
    liv.band(0, 3.35, 0x121214, 0.0, 1.0)               # Panda: unten schwarz
    liv.band(3.35, 3.5, 0xc8102e, 0.08, 0.93)           # feine rote Trennlinie
    seams(liv, doors=[(0.43, 0.66)], hood=(0.685, 0.985, 6.3), trunk=(0.0, 0.07, 6.3), fuel=(0.2, 4.1))

HACHI = dict(
    id='hachi', name='Hachi 86', maker='Kaiun', klass='Touge Drift', inspo='AE86 Trueno (panda)',
    tagline='Pop-up lights, 1.6 twin-cam, the mountain-pass legend.',
    hp=130, kg=940, drive='RWD', top_kmh=200, sound='i4_na', popups=True,
    L=4.20, W=1.625, H=1.335, wb_len=2.40, track=1.38, r=0.29, tw=0.205, axle_off=-0.02,
    travel=0.18, lock=38, stiff=0.85, roll=0.07, pitch=0.06, grip=0.9, drift=0.95,
    zfloor=0.27, eye_h=0.80, cowl_hip=1.25,
    zb=[(0, 0.30), (0.04, 0.23), (0.9, 0.20), (0.98, 0.24), (1, 0.30)],
    zbelt=[(0, 0.78), (0.06, 0.82), (0.5, 0.80), (0.7, 0.74), (0.9, 0.66), (1, 0.56)],
    ztop=[(0, 0.86), (0.06, 0.92), (0.30, 1.30), (0.42, 1.335), (0.52, 1.31), (0.68, 0.83), (0.9, 0.72), (1, 0.60)],
    wb=[(0, 0.90), (0.05, 0.98), (0.9, 0.98), (1, 0.90)],
    wt=[(0, 0.80), (0.06, 0.82), (0.30, 0.70), (0.52, 0.70), (0.68, 0.86), (1, 0.82)],
    crown=[(0, 0.02), (0.4, 0.035), (1, 0.02)],
    glass=dict(rear=(0.06, 0.30), ws=(0.52, 0.68), side=(0.31, 0.645), bpillar=(0.43, 0.455)),
    creases={5: 0.95, 8: 0.8, 2: 0.6}, cap_crease=0.7,
    paint=dict(base=0xf2f2ef, metal=0.05, rough=0.28),
    livery=liv_hachi,
    wheel=dict(rim_r=0.19, style='eight', color=0xb08a3a, metal=0.8, caliper=0x2a2a2a, spoke_w=0.028, concave=0.015, nuts=4),
    plate='86-86', cage=True,
    parts=[
        dict(kind='popup', s=0.915, x=0.52, shape=('rr', 0.34, 0.20, 0.02)),
        dict(kind='amber', x=0.50, z=0.50, shape=('rr', 0.30, 0.06, 0.015)),
        dict(kind='grille', x=0, z=0.54, pair=False, shape=('rr', 0.62, 0.045, 0.02)),
        dict(kind='grille', x=0, z=0.32, pair=False, shape=('rr', 0.70, 0.09, 0.03)),
        dict(kind='plate_f', x=0, z=0.41, pair=False, shape=PLATE, proud=0.012),
        dict(kind='tail', x=0.47, z=0.74, shape=('rr', 0.52, 0.13, 0.02), inset=0.92),
        dict(kind='grille', rear=True, x=0, z=0.74, pair=False, shape=('rr', 0.36, 0.12, 0.02)),
        dict(kind='plate_r', x=0, z=0.56, pair=False, shape=PLATE, proud=0.012),
        dict(kind='mirror', paint=False),
        dict(kind='exhaust', tips=[(-0.45, 0.25, 0.035)]),
        dict(kind='towhook', x=0.35, z=0.30),
        dict(kind='wing', s=0.075, span=1.2, chord=0.16, h=0.02, aoa=-6, mount='post', mat='trim', thick=0.10, post_x=0.3),
        dict(kind='side', s=0.55, z=0.76, shape=('rr', 0.12, 0.028, 0.01)),
    ],
    int_color=0x1d1d1f, seat_color=0x161618, seat_accent=0xc8102e,
)

# ------------------------------------------------------------------ Kaze 35
def liv_kaze(liv, spec):
    PINK, GREEN, WHITE, BLK = 0xff2f9a, 0x33d17a, 0xfafafa, 0x0a0a0a
    import numpy as np
    rng = np.random.default_rng(35)
    for i in range(14):
        s0 = 0.08 + rng.random() * 0.62
        j0 = 2.4 + rng.random() * 2.6
        pts = [(s0, j0)]
        for _ in range(3):
            s0 += (rng.random() - 0.3) * 0.08; j0 += (rng.random() - 0.5) * 1.4
            pts.append((min(max(s0, 0.02), 0.8), min(max(j0, 1.8), 5.6)))
        liv.stroke(pts, 0.05 + rng.random() * 0.07, [PINK, GREEN, PINK, WHITE][i % 4], outline=BLK, ow=0.025)
    for i in range(22):
        liv.sakura(0.05 + rng.random() * 0.9, 1.8 + rng.random() * 4.0, 0.05 + rng.random() * 0.07,
                   [0xffb7d5, 0xff6fb5, WHITE][i % 3], rot=rng.random() * 6)
    liv.stripe_top(0.03, 0.05, PINK, 0.0, 1.0)
    liv.band(0, 1.7, 0x151518)
    seams(liv, doors=[(0.40, 0.64)], hood=(0.675, 0.985, 6.4), fuel=(0.23, 4.4))

KAZE = dict(
    id='kaze', name='Kaze 35 Drift', maker='Tsuru', klass='Drift Missile', inspo='350Z (Z33) pro-drift build',
    tagline='Widebody, sakura-graffiti wrap, swan-neck GT wing. Built to go sideways.',
    hp=520, kg=1320, drive='RWD', top_kmh=270, sound='v6_turbo',
    L=4.32, W=1.84, H=1.28, wb_len=2.65, track=1.60, r=0.325, tw=0.265, axle_off=-0.03,
    flare_f=0.055, flare_r=0.075, arch_gap=0.035,
    travel=0.12, lock=58, stiff=1.4, roll=0.035, pitch=0.03, grip=0.95, drift=1.0,
    zfloor=0.24, eye_h=0.78, cowl_hip=1.28,
    zb=[(0, 0.30), (0.05, 0.18), (0.9, 0.12), (0.99, 0.14), (1, 0.20)],
    zbelt=[(0, 0.74), (0.06, 0.83), (0.25, 0.85), (0.45, 0.81), (0.65, 0.75), (0.9, 0.67), (0.98, 0.59), (1, 0.48)],
    ztop=[(0, 0.82), (0.05, 0.89), (0.12, 0.92), (0.33, 1.24), (0.45, 1.28), (0.53, 1.25), (0.67, 0.84),
          (0.85, 0.77), (0.96, 0.68), (1, 0.54)],
    wb=[(0, 0.86), (0.05, 0.95), (0.8, 0.97), (0.95, 0.91), (1, 0.79)],
    wt=[(0, 0.66), (0.12, 0.72), (0.33, 0.56), (0.53, 0.58), (0.67, 0.80), (1, 0.66)],
    crown=[(0, 0.04), (0.4, 0.06), (0.8, 0.04), (1, 0.03)],
    glass=dict(rear=(0.12, 0.33), ws=(0.53, 0.67), side=(0.34, 0.62), bpillar=None),
    creases={5: 0.6, 8: 0.5, 2: 0.4},
    paint=dict(base=0x0c0c10, metal=0.3, rough=0.22),
    livery=liv_kaze,
    wheel=dict(rim_r=0.245, style='six', spokes=6, color=0xf4f4f4, metal=0.2, rough=0.3, caliper=0xffd400,
               dish=0.035, lip=0.03, spoke_w=0.05, concave=0.035, stretch=0.1,
               rear=dict(dish=0.05, lip=0.04)),
    tw_rear=0.275, plate='35-35', cage=True, apillar_black=True,
    parts=[
        dict(kind='head', x=0.63, z=0.60, shape=('rr', 0.40, 0.13, 0.06, 0.05, 0.3), proj=[(-0.08, 0.0, 0.034), (0.07, 0.0, 0.034)]),
        dict(kind='grille', x=0, z=0.33, pair=False, shape=('rr', 0.92, 0.20, 0.08)),
        dict(kind='intake', x=0.66, z=0.30, shape=('rr', 0.18, 0.12, 0.04)),
        dict(kind='plate_f', x=0.35, z=0.46, pair=False, shape=PLATE, proud=0.012),
        dict(kind='tail', x=0.58, z=0.73, shape=('poly', [(-0.2, -0.02), (0.15, -0.06), (0.2, 0.0), (0.18, 0.07), (-0.05, 0.05), (-0.2, 0.03)]), inset=0.8),
        dict(kind='plate_r', x=0, z=0.58, pair=False, shape=PLATE, proud=0.012),
        dict(kind='top', s=0.84, x=0.30, pair=True, shape=('rr', 0.26, 0.18, 0.03), mat='grille', proud=0.004),
        dict(kind='splitter', z=0.13, depth=0.26, out=0.08, canards=True),
        dict(kind='wing', s=0.05, span=1.72, chord=0.32, h=0.34, aoa=10, mount='swan', mat='carbon', mat2='trim',
             thick=0.12, plate=(0.26, 0.42), element2=True, post_x=0.27),
        dict(kind='diffuser', z=0.2, fins=7),
        dict(kind='mirror', paint=False),
        dict(kind='exhaust', tips=[(-0.55, 0.22, 0.06)], mat='chrome', out=0.06),
        dict(kind='towhook', x=-0.32, z=0.25, color=0xffd400),
        dict(kind='towhook', x=0.35, z=0.30, rear=True, color=0xff2f9a),
    ],
    int_color=0x111113, seat_color=0x101012, seat_accent=0xff2f9a, cage_color=0xff2f9a,
)

# ------------------------------------------------------------------ Rotor FD
def liv_rotor(liv, spec):
    seams(liv, doors=[(0.39, 0.62)], hood=(0.665, 0.985, 6.5), trunk=(0.0, 0.12, 6.5), fuel=(0.22, 4.4))
    liv.band(0, 1.5, 0x141416)

ROTOR = dict(
    id='rotor', name='Rotor FD', maker='Tsubasa', klass='JDM Legend', inspo='RX-7 FD3S',
    tagline='Twin-rotor, 9000 rpm scream, curves for days. Pop-ups included.',
    hp=280, kg=1280, drive='RWD', top_kmh=260, sound='rotary', popups=True,
    L=4.29, W=1.76, H=1.23, wb_len=2.425, track=1.46, r=0.315, tw=0.245, axle_off=-0.02,
    flare_f=0.03, flare_r=0.04,
    travel=0.15, lock=36, stiff=1.1, roll=0.05, pitch=0.045, grip=1.02, drift=0.85,
    zfloor=0.25, eye_h=0.78, cowl_hip=1.26,
    zb=[(0, 0.30), (0.05, 0.20), (0.9, 0.16), (1, 0.26)],
    zbelt=[(0, 0.72), (0.06, 0.80), (0.25, 0.82), (0.45, 0.78), (0.65, 0.70), (0.85, 0.64), (0.96, 0.57), (1, 0.47)],
    ztop=[(0, 0.80), (0.05, 0.88), (0.12, 0.92), (0.32, 1.20), (0.44, 1.23), (0.52, 1.20), (0.66, 0.78),
          (0.85, 0.70), (0.96, 0.62), (1, 0.52)],
    wb=[(0, 0.84), (0.05, 0.95), (0.15, 1.0), (0.5, 0.965), (0.8, 1.0), (0.95, 0.92), (1, 0.78)],
    wt=[(0, 0.64), (0.12, 0.70), (0.32, 0.56), (0.52, 0.56), (0.66, 0.80), (1, 0.66)],
    crown=[(0, 0.05), (0.4, 0.07), (0.8, 0.05), (1, 0.03)],
    glass=dict(rear=(0.12, 0.32), ws=(0.52, 0.66), side=(0.33, 0.60), bpillar=None),
    creases={5: 0.35, 8: 0.35, 2: 0.3}, cap_crease=0.35,
    paint=dict(base=0xc4101e, metal=0.35, rough=0.28),
    livery=liv_rotor,
    wheel=dict(rim_r=0.23, style='mesh', spokes=10, color=0xa8843c, metal=0.85, caliper=0xd4a017, lip=0.02, dish=0.012, concave=0.02),
    plate='13-8',
    parts=[
        dict(kind='popup', s=0.875, x=0.56, shape=('rr', 0.30, 0.15, 0.03)),
        dict(kind='grille', x=0, z=0.32, pair=False, shape=('ell', 0.64, 0.17)),
        dict(kind='intake', x=0.64, z=0.30, shape=('rr', 0.16, 0.07, 0.03)),
        dict(kind='amber', x=0.66, z=0.44, shape=('rr', 0.14, 0.035, 0.015)),
        dict(kind='plate_f', x=0, z=0.44, pair=False, shape=PLATE, proud=0.012),
        dict(kind='tail', x=0.54, z=0.71, shape=('ell', 0.36, 0.13), inset=0.9, proj=[(-0.08, 0.0, 0.045), (0.07, 0.0, 0.045)]),
        dict(kind='grille', rear=True, x=0, z=0.71, pair=False, shape=('ell', 0.5, 0.11)),
        dict(kind='plate_r', x=0, z=0.55, pair=False, shape=PLATE, proud=0.012),
        dict(kind='wing', s=0.03, span=1.48, chord=0.22, h=0.14, aoa=6, mount='hoop', mat='paint', thick=0.13),
        dict(kind='mirror', paint=True),
        dict(kind='exhaust', tips=[(0.10, 0.25, 0.045), (-0.10, 0.25, 0.045)]),
        dict(kind='towhook', x=-0.30, z=0.26),
        dict(kind='diffuser', z=0.22, fins=4),
    ],
    int_color=0x1a1a1c, seat_color=0x141416, seat_accent=0x2a2a2e, racing_seats=True,
)

# ------------------------------------------------------------------ Raiden GT-R
def liv_raiden(liv, spec):
    BLUE, WHITE = 0x1846d6, 0xf2f2f2
    liv.stripe_top(0.05, 0.16, BLUE, 0.0, 1.0)
    liv.stripe_top(0.225, 0.02, BLUE, 0.0, 1.0)
    for k, (j, w) in enumerate(((2.3, 0.09), (2.9, 0.035))):
        pts = [(s, j + 0.35 * math.sin(s * 28)) for s in [i / 30 for i in range(3, 29)]]
        liv.stroke(pts, w, BLUE if k == 0 else WHITE, outline=0x0a1a50 if k == 0 else None, ow=0.012)
    seams(liv, doors=[(0.42, 0.68)], hood=(0.715, 0.985, 6.5), trunk=(0.0, 0.18, 6.4), fuel=(0.24, 4.3))
    liv.band(0, 1.4, 0x18181a)

RAIDEN = dict(
    id='raiden', name='Raiden GT-R34', maker='Ichiban', klass='JDM Legend', inspo='Skyline GT-R R34 (street racer build)',
    tagline='All-wheel drive, twin-turbo six, blue underglow, zero chill.',
    hp=480, kg=1560, drive='AWD', top_kmh=290, sound='i6_turbo', underglow=0x2a6bff,
    L=4.60, W=1.785, H=1.36, wb_len=2.665, track=1.50, r=0.335, tw=0.255, axle_off=-0.05,
    flare_f=0.02, flare_r=0.03,
    travel=0.15, lock=36, stiff=1.15, roll=0.05, pitch=0.045, grip=1.12, drift=0.55,
    zfloor=0.27, eye_h=0.82, cowl_hip=1.32,
    zb=[(0, 0.32), (0.05, 0.22), (0.9, 0.18), (0.98, 0.20), (1, 0.28)],
    zbelt=[(0, 0.82), (0.05, 0.88), (0.3, 0.90), (0.55, 0.88), (0.7, 0.84), (0.9, 0.80), (0.98, 0.74), (1, 0.62)],
    ztop=[(0, 0.92), (0.04, 0.98), (0.19, 1.00), (0.36, 1.33), (0.46, 1.36), (0.56, 1.33), (0.71, 0.93),
          (0.88, 0.88), (0.97, 0.82), (1, 0.70)],
    wb=[(0, 0.90), (0.04, 0.98), (0.93, 0.98), (1, 0.90)],
    wt=[(0, 0.80), (0.19, 0.82), (0.36, 0.66), (0.56, 0.66), (0.71, 0.86), (1, 0.80)],
    crown=[(0, 0.02), (0.4, 0.04), (1, 0.025)],
    glass=dict(rear=(0.19, 0.36), ws=(0.56, 0.71), side=(0.37, 0.66), bpillar=(0.475, 0.495)),
    creases={5: 0.95, 8: 0.7, 2: 0.6}, cap_crease=0.7,
    paint=dict(base=0xb8bdc4, metal=0.85, rough=0.24),
    livery=liv_raiden,
    wheel=dict(rim_r=0.24, style='six', spokes=6, color=0x1c1c1f, metal=0.5, rough=0.35, caliper=0x1846d6, lip=0.025, dish=0.02, concave=0.03),
    plate='34-34', cage=True,
    parts=[
        dict(kind='head', x=0.58, z=0.70, shape=('poly', [(-0.2, -0.06), (0.18, -0.03), (0.2, 0.05), (-0.17, 0.05)]), inset=0.86,
             proj=[(-0.1, 0.0, 0.035), (0.03, 0.0, 0.035)]),
        dict(kind='grille', x=0, z=0.66, pair=False, shape=('rr', 0.44, 0.09, 0.02)),
        dict(kind='grille', x=0, z=0.38, pair=False, shape=('rr', 1.10, 0.20, 0.04)),
        dict(kind='fog', x=0.68, z=0.36, shape=('rr', 0.14, 0.06, 0.02)),
        dict(kind='plate_f', x=0, z=0.52, pair=False, shape=PLATE, proud=0.012),
        dict(kind='tail', x=0.41, z=0.80, shape=('ell', 0.16, 0.16), inset=0.75),
        dict(kind='tail', x=0.62, z=0.80, shape=('ell', 0.16, 0.16), inset=0.75),
        dict(kind='grille', rear=True, x=0, z=0.80, pair=False, shape=('rr', 0.46, 0.14, 0.02)),
        dict(kind='plate_r', x=0, z=0.62, pair=False, shape=PLATE, proud=0.012),
        dict(kind='wing', s=0.045, span=1.46, chord=0.24, h=0.18, aoa=5, mount='post', mat='paint', thick=0.12,
             element2=True, post_x=0.34),
        dict(kind='splitter', z=0.19, depth=0.2, out=0.04),
        dict(kind='diffuser', z=0.24, fins=5),
        dict(kind='mirror', paint=True),
        dict(kind='exhaust', tips=[(-0.45, 0.26, 0.06)], out=0.05),
        dict(kind='glow', color=0x2a6bff),
        dict(kind='side', s=0.56, z=0.84, shape=('rr', 0.13, 0.03, 0.01)),
    ],
    int_color=0x16181c, seat_color=0x111317, seat_accent=0x1846d6, cage_color=0x1846d6, gauge_accent=0x3a8bff, screen=True,
)

# ------------------------------------------------------------------ Suprema
def liv_suprema(liv, spec):
    seams(liv, doors=[(0.405, 0.655)], hood=(0.705, 0.975, 6.4), trunk=(0.02, 0.15, 6.4), fuel=(0.25, 4.3))
    liv.band(0, 1.6, 0x1a1a1a, 0.0, 1.0)

SUPREMA = dict(
    id='suprema', name='Suprema RZ', maker='Kaiun', klass='JDM Legend', inspo='Supra MK4 (A80)',
    tagline='Twin-turbo straight six, hoop wing, 1000-hp reputation.',
    hp=330, kg=1510, drive='RWD', top_kmh=285, sound='i6_turbo',
    L=4.52, W=1.81, H=1.27, wb_len=2.55, track=1.54, r=0.33, tw=0.255, axle_off=-0.04, flare_r=0.03, flare_f=0.012,
    travel=0.16, lock=34, stiff=1.0, roll=0.055, pitch=0.05, grip=1.0, drift=0.7,
    zfloor=0.27,
    zb=[(0, 0.36), (0.04, 0.25), (0.12, 0.19), (0.88, 0.17), (0.97, 0.21), (1, 0.30)],
    zbelt=[(0, 0.72), (0.05, 0.83), (0.2, 0.86), (0.45, 0.84), (0.7, 0.78), (0.9, 0.72), (0.98, 0.64), (1, 0.52)],
    ztop=[(0, 0.82), (0.04, 0.93), (0.17, 0.98), (0.36, 1.25), (0.47, 1.27), (0.55, 1.24), (0.70, 0.89),
          (0.85, 0.81), (0.96, 0.72), (1, 0.58)],
    wb=[(0, 0.84), (0.05, 0.96), (0.2, 1.0), (0.8, 0.99), (0.94, 0.93), (1, 0.80)],
    wt=[(0, 0.70), (0.17, 0.76), (0.36, 0.60), (0.55, 0.60), (0.70, 0.80), (1, 0.70)],
    crown=[(0, 0.04), (0.3, 0.06), (0.6, 0.06), (0.75, 0.05), (1, 0.03)],
    glass=dict(rear=(0.17, 0.36), ws=(0.55, 0.70), side=(0.37, 0.635), bpillar=None),
    paint=dict(base=0xff5a00, metal=0.55, rough=0.3),
    livery=liv_suprema,
    wheel=dict(rim_r=0.235, style='split', spokes=5, color=0xc9ccd1, caliper=0xd01818, concave=0.03),
    plate='80-80',
    parts=[
        dict(kind='head', x=0.64, z=0.60, shape=('rr', 0.36, 0.13, 0.06, 0.03, 0.2), proj=[(-0.07, 0.0, 0.035), (0.06, 0.0, 0.035)]),
        dict(kind='grille', x=0, z=0.34, pair=False, shape=('rr', 0.86, 0.15, 0.06)),
        dict(kind='grille', x=0, z=0.52, pair=False, shape=('rr', 0.42, 0.05, 0.02)),
        dict(kind='fog', x=0.66, z=0.34, shape=('rr', 0.16, 0.07, 0.03)),
        dict(kind='amber', x=0.78, z=0.50, shape=('rr', 0.09, 0.04, 0.015)),
        dict(kind='plate_f', x=0, z=0.44, pair=False, shape=PLATE, proud=0.012),
        dict(kind='tail', x=0.56, z=0.76, shape=('rr', 0.36, 0.17, 0.08), inset=0.9, proj=[(-0.08, 0.0, 0.055), (0.08, 0.0, 0.055)]),
        dict(kind='plate_r', x=0, z=0.62, pair=False, shape=PLATE, proud=0.012),
        dict(kind='grille', rear=True, x=0, z=0.32, pair=False, shape=('rr', 1.2, 0.08, 0.03)),
        dict(kind='wing', s=0.035, span=1.52, chord=0.26, h=0.20, aoa=4, mount='hoop', mat='paint', mat2='trim', thick=0.13),
        dict(kind='mirror'),
        dict(kind='exhaust', tips=[(0.42, 0.30, 0.048), (0.53, 0.30, 0.048)]),
        dict(kind='side', s=0.47, z=0.80, shape=('rr', 0.13, 0.03, 0.012)),
        dict(kind='diffuser', z=0.24, fins=6),
    ],
    int_color=0x1b1b1d, seat_accent=0x1f1f22, racing_seats=False,
)

# ------------------------------------------------------------------ Kumo STi
def liv_kumo(liv, spec):
    WHITE, YEL = 0xf4f4f4, 0xffd21f
    for k, (j0, w) in enumerate(((3.2, 0.12), (3.75, 0.035))):
        pts = [(s, j0 + 1.6 * (s - 0.2) ** 2) for s in [0.08 + i * 0.03 for i in range(28)]]
        liv.stroke(pts, w, WHITE if k == 0 else YEL)
    liv.circle(0.535, 4.0, 0.22, WHITE)
    liv.circle(0.535, 4.0, 0.22, 0x0e1e5a, ring=0.20)
    ymid = liv.ym_of_j(5.3)
    for i in range(5):
        c = (0.26 + i * 0.025) * spec['L']
        liv.shape(lambda X, Y, c=c: (abs(X - c) + abs(Y - ymid) < 0.035), YEL, 0.2, 0.4, 4.5, 6)
    liv.stripe_top(0.0, 0.05, WHITE, 0.72, 1.0)
    liv.grime(0, 3.2, 0x6b5a45, 0.45, seed=4)
    seams(liv, doors=[(0.40, 0.535), (0.535, 0.685)], hood=(0.715, 0.985, 6.4), trunk=(0.0, 0.17, 6.4), fuel=(0.24, 4.3))

KUMO = dict(
    id='kumo', name='Kumo STi 22', maker='Rokusei', klass='Rally', inspo='Impreza GC8 / 22B WRC',
    tagline='Boxer rumble, gold wheels, gravel spray. Flat-out on any surface.',
    hp=300, kg=1270, drive='AWD', top_kmh=245, sound='boxer',
    L=4.35, W=1.77, H=1.40, wb_len=2.52, track=1.50, r=0.32, tw=0.235, axle_off=-0.04,
    flare_f=0.045, flare_r=0.05, arch_gap=0.06,
    travel=0.26, lock=40, stiff=0.9, roll=0.07, pitch=0.06, grip=1.0, drift=0.8, dirt=1.0,
    zfloor=0.32, eye_h=0.82, cowl_hip=1.26,
    zb=[(0, 0.38), (0.05, 0.28), (0.9, 0.25), (1, 0.32)],
    zbelt=[(0, 0.86), (0.05, 0.92), (0.3, 0.92), (0.6, 0.90), (0.75, 0.86), (0.92, 0.80), (1, 0.66)],
    ztop=[(0, 0.94), (0.04, 1.01), (0.18, 1.03), (0.34, 1.37), (0.44, 1.40), (0.56, 1.37), (0.71, 0.97), (0.9, 0.90), (1, 0.74)],
    wb=[(0, 0.90), (0.04, 0.98), (0.94, 0.98), (1, 0.88)],
    wt=[(0, 0.80), (0.18, 0.82), (0.34, 0.68), (0.56, 0.68), (0.71, 0.86), (1, 0.80)],
    crown=[(0, 0.025), (0.4, 0.045), (1, 0.03)],
    glass=dict(rear=(0.18, 0.34), ws=(0.56, 0.71), side=(0.35, 0.67), bpillar=(0.525, 0.545)),
    creases={5: 0.7, 8: 0.6, 2: 0.5},
    paint=dict(base=0x1b3c9c, metal=0.5, rough=0.3),
    livery=liv_kumo,
    wheel=dict(rim_r=0.215, style='six', spokes=6, color=0xd2a93e, metal=0.85, caliper=0xd01818, spoke_w=0.04, concave=0.02, grooves=0, mud=True),
    plate='22-22', cage=True,
    parts=[
        dict(kind='head', x=0.58, z=0.70, shape=('rr', 0.34, 0.13, 0.04, 0.02, 0.1), proj=[(-0.05, 0.0, 0.04)]),
        dict(kind='grille', x=0, z=0.68, pair=False, shape=('poly', [(-0.2, -0.05), (0.2, -0.05), (0.24, 0.0), (0.2, 0.05), (-0.2, 0.05), (-0.24, 0.0)])),
        dict(kind='grille', x=0, z=0.40, pair=False, shape=('rr', 0.90, 0.16, 0.05)),
        dict(kind='fog', x=0.62, z=0.40, shape=('ell', 0.15, 0.15), inset=0.8),
        dict(kind='scoop', s=0.82, w=0.46, l=0.30, h=0.06),
        dict(kind='lamps', at=[(0.18, None, 0.62, 0.085), (-0.18, None, 0.62, 0.085), (0.42, None, 0.58, 0.085), (-0.42, None, 0.58, 0.085)]),
        dict(kind='tail', x=0.58, z=0.84, shape=('rr', 0.36, 0.14, 0.03), inset=0.88),
        dict(kind='plate_r', x=0, z=0.66, pair=False, shape=PLATE, proud=0.012),
        dict(kind='wing', s=0.06, span=1.38, chord=0.28, h=0.30, aoa=10, mount='post', mat='paint', thick=0.13,
             plate=(0.18, 0.32), element2=True, post_x=0.30),
        dict(kind='top', s=0.47, x=0.0, shape=('rr', 0.20, 0.14, 0.03), mat='grille', proud=0.02),
        dict(kind='mirror', paint=True),
        dict(kind='exhaust', tips=[(-0.50, 0.30, 0.055)], out=0.05),
        dict(kind='arches', w=0.06, t=0.05, mat='paint'),
        dict(kind='mudflap', color=0xd01818),
    ],
    int_color=0x1a1a1c, seat_color=0x131316, seat_accent=0x1b3c9c, cage_color=0xd0d0d0,
)

# ------------------------------------------------------------------ Yama Cruiser
def liv_yama(liv, spec):
    liv.band(0, 2.2, 0x1c1c1e)
    liv.grime(0, 4.2, 0x7a6243, 0.55, seed=7)
    seams(liv, doors=[(0.40, 0.55), (0.55, 0.73)], hood=(0.755, 0.985, 6.5), fuel=(0.18, 4.6))
    liv.seam(0.01, 2.5, 9.5, 0x101010)

YAMA = dict(
    id='yama', name='Yama Cruiser 250', maker='Kaiun', klass='Offroad', inspo='Land Cruiser 250',
    tagline='Body-on-frame, locking diffs, mud tyres. The mountain is the road.',
    hp=280, kg=2250, drive='AWD', top_kmh=175, sound='v6_diesel', dirt=1.0,
    L=4.92, W=1.98, H=1.93, wb_len=2.85, track=1.67, r=0.40, tw=0.275, axle_off=-0.08, arch_gap=0.08,
    travel=0.32, lock=34, stiff=0.6, roll=0.11, pitch=0.09, grip=0.85, drift=0.35,
    zfloor=0.55, eye_h=0.90, cowl_hip=1.30, driver_x=0.40,
    zb=[(0, 0.54), (0.04, 0.42), (0.12, 0.38), (0.88, 0.38), (0.96, 0.44), (1, 0.52)],
    zbelt=[(0, 1.10), (0.03, 1.16), (0.95, 1.17), (1, 1.10)],
    ztop=[(0, 1.22), (0.01, 1.28), (0.035, 1.86), (0.62, 1.93), (0.66, 1.90), (0.755, 1.28), (0.95, 1.23), (1, 1.14)],
    wb=[(0, 0.95), (0.02, 0.99), (0.98, 0.99), (1, 0.95)],
    wt=[(0, 0.86), (0.035, 0.90), (0.66, 0.90), (0.755, 0.93), (1, 0.90)],
    crown=[(0, 0.02), (1, 0.02)],
    glass=dict(rear=(0.012, 0.035), ws=(0.66, 0.755), side=(0.045, 0.72), bpillar=[(0.40, 0.425), (0.16, 0.19)]),
    creases={5: 1.0, 8: 1.0, 2: 0.8}, cap_crease=0.9,
    paint=dict(base=0xb58b4c, metal=0.45, rough=0.35),
    livery=liv_yama,
    wheel=dict(rim_r=0.23, style='six', spokes=6, color=0x3b3d42, metal=0.6, rough=0.4, caliper=0x2a2a2a, spoke_w=0.06,
               grooves=0, mud=True, segs=72),
    plate='250', rear_seats=True, racing_seats=False,
    parts=[
        dict(kind='head', x=0.72, z=1.02, shape=('rr', 0.30, 0.12, 0.02), inset=0.8, proj=[(-0.06, 0.0, 0.03), (0.05, 0.0, 0.03)]),
        dict(kind='grille', x=0, z=0.96, pair=False, shape=('rr', 1.10, 0.30, 0.03)),
        dict(kind='grille', x=0, z=0.62, pair=False, shape=('rr', 1.30, 0.20, 0.03)),
        dict(kind='fog', x=0.72, z=0.64, shape=('rr', 0.14, 0.07, 0.02)),
        dict(kind='skid'),
        dict(kind='tail', x=0.86, z=1.12, shape=('rr', 0.12, 0.42, 0.03), inset=0.86),
        dict(kind='plate_r', x=0, z=0.78, pair=False, shape=PLATE, proud=0.012),
        dict(kind='plate_f', x=0, z=0.78, pair=False, shape=PLATE, proud=0.012),
        dict(kind='arches', w=0.11, t=0.09, out=0.01),
        dict(kind='mirror', paint=False, reach=0.12),
        dict(kind='towhook', x=0.55, z=0.55),
        dict(kind='towhook', x=-0.55, z=0.55),
        dict(kind='roofrack'),
        dict(kind='box', c=(0.93, 0.08, 0.40), size=(0.14, 2.0, 0.06), mat='trim', mirror=True, name='sliders'),
    ],
    int_color=0x2a2723, seat_color=0x3b2f25, seat_accent=0x2b241e,
)

# ------------------------------------------------------------------ Mini Hauler
def liv_hauler(liv, spec):
    seams(liv, doors=[(0.62, 0.90)])
    liv.band(0, 1.8, 0x2b2b2d, 0.58, 1.0)

HAULER = dict(
    id='hauler', name='Mini Hauler', maker='Hoshi', klass='Utility', inspo='Kei truck (Hijet / Carry)',
    tagline='Cab-over, tiny turning circle, the village delivery hero. Surprisingly driftable.',
    hp=53, kg=780, drive='RWD', top_kmh=120, sound='kei', dirt=0.9,
    L=3.395, W=1.475, H=1.78, wb_len=1.90, track=1.30, r=0.28, tw=0.155, axle_off=-0.30, arch_gap=0.05,
    travel=0.24, lock=45, stiff=0.6, roll=0.12, pitch=0.1, grip=0.8, drift=0.9,
    zfloor=0.66, eye_h=0.86, cowl_hip=0.82,
    zb=[(0, 0.44), (0.02, 0.40), (0.98, 0.40), (1, 0.44)],
    zbelt=[(0, 0.64), (0.555, 0.64), (0.59, 1.04), (0.96, 1.04), (1, 1.00)],
    ztop=[(0, 0.68), (0.555, 0.68), (0.59, 1.74), (0.93, 1.78), (0.985, 1.08), (1, 1.02)],
    wb=[(0, 0.97), (0.02, 0.99), (0.98, 0.99), (1, 0.95)],
    wt=[(0, 0.90), (0.555, 0.90), (0.59, 0.90), (0.93, 0.90), (0.985, 0.94), (1, 0.92)],
    crown=[(0, 0.004), (0.55, 0.004), (0.6, 0.02), (1, 0.02)],
    glass=dict(rear=(0.568, 0.578), ws=(0.93, 0.985), side=(0.60, 0.925), bpillar=None),
    ledge=[(0, 0.0), (0.58, 0.0), (0.60, 0.02), (1, 0.02)],
    creases={5: 1.0, 8: 1.0, 2: 0.8}, cap_crease=0.9, nsec=60,
    paint=dict(base=0xeeeeea, metal=0.05, rough=0.35),
    livery=liv_hauler,
    wheel=dict(rim_r=0.155, style='disc', color=0xdedede, metal=0.4, caliper=0x333333, hub_r=0.05, nuts=4),
    plate='50-50', plate_yellow=True, racing_seats=False, small_wheel=True, reach=0.46, wheel_h=0.62,
    parts=[
        dict(kind='head', x=0.52, z=0.82, shape=('rr', 0.22, 0.15, 0.03), inset=0.82, proj=[(0.0, 0.0, 0.045)]),
        dict(kind='grille', x=0, z=0.86, pair=False, shape=('rr', 0.56, 0.10, 0.02)),
        dict(kind='amber', x=0.56, z=0.62, shape=('rr', 0.12, 0.05, 0.015)),
        dict(kind='plate_f', x=0, z=0.56, pair=False, shape=PLATE, proud=0.012),
        dict(kind='box', c=(0, -1.72, 0.52), size=(1.45, 0.08, 0.16), mat='trim', bevel=0.02, name='bumper'),
        dict(kind='mirror', paint=False, reach=0.12),
        dict(kind='bed'),
    ],
    int_color=0x6e6a62, seat_color=0x555048, seat_accent=0x3e3a34,
)

# ------------------------------------------------------------------ Hanami F1
HANAMI = dict(
    id='hanami', name='Hanami SF-26', maker='Sakura Works', klass='Formula', inspo='2020s F1 car, cherry-blossom livery',
    tagline='1.6 V6 hybrid, 1000 hp, halo, DRS. Grip that builds with speed.',
    hp=1000, kg=800, drive='RWD', top_kmh=345, sound='f1', drs=True, builder='formula',
    L=5.40, W=1.90, H=0.95, wb_len=3.40, track=1.62, track_rear=1.56, r=0.36, tw=0.305, tw_rear=0.405, axle_off=-0.02,
    travel=0.06, lock=22, stiff=3.0, roll=0.012, pitch=0.012, grip=1.6, drift=0.25,
    wheel=dict(rim_r=0.235, style='disc', color=0x4a4e55, metal=0.7, rough=0.3, lip=0.012, lip_color=0xff4fa3, stripe=0xffd21f, grooves=0,
               caliper=0x222222, hub_r=0.09, nuts=1, segs=72),
    plate='26',
)

FLEET = [MAME, HACHI, KAZE, ROTOR, RAIDEN, SUPREMA, KUMO, YAMA, HAULER, HANAMI]
BY_ID = {c['id']: c for c in FLEET}
