"""Pictures of task 5c (Tokyo height + the rest): the Tokyo street at eye
level under the towers, the skyline from far away in the haze, from above;
willows on a Koedo canal, persimmons in a Gassho yard, kei trucks on the
Funaura quay; every tower alone (front, back, clay, mood); close-ups.

Linked copies only (shots_5b.place), removed afterwards.

    from buildings import shots_5c as S5c; S5c.shots('/path/to/dir')
"""
import math
import os
import bpy
from mathutils import Vector
from kit import core as K, preview as P
from buildings import shots_5b as S5
from buildings.shots_5b import new, clear, place, ground, row
from buildings import koso as KO

TMP = 'Shots5c'
TOWERS = [f"Tokyo_{s.get('prefix', 'Tower')}_{k}" for k, s in KO.TOWERS.items() if s.get('prefix', 'Tower') == 'Tower']


_WORLD = P._world


def _volume(w, density, colour):
    nt = w.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    v = nt.nodes.new('ShaderNodeVolumePrincipled')
    # haze glows in the horizon colour (Eevee does not light a world volume
    # by the sky): emission = density x haze radiance, so far things fade to it
    v.inputs['Density'].default_value = density
    v.inputs['Color'].default_value = (0, 0, 0, 1)
    v.inputs['Emission Color'].default_value = (*colour, 1)
    v.inputs['Emission Strength'].default_value = density
    nt.links.new(v.outputs[0], out.inputs['Volume'])
    return w


def fog(on, density=0.0007, colour=(0.16, 0.18, 0.26)):
    """Haze for the far skyline: a world volume (Eevee). P.shot rebuilds the
    world for every picture, so the preview's world builder is wrapped while
    the haze is on, and restored afterwards."""
    sc = bpy.context.scene
    try:   # Eevee only computes volumes up to volumetric_end (default 100 m)
        sc.eevee.volumetric_end = 4000.0 if on else 100.0
    except (AttributeError, TypeError):
        pass
    P._world = (lambda mood, sun_dir=(0, 1, 0.1): _volume(_WORLD(mood, sun_dir), density, colour)) if on else _WORLD


def tokyo(tmp):
    """A Tokyo avenue (12 m + pavements): cinema, hotels, market hall and the
    centre buildings along it, the towers rising behind both sides."""
    ground(tmp, [(-140, 200, -6, 6)], 'asphalt', z=-0.005, name='Street')
    ground(tmp, [(-140, 200, -9, -6), (-140, 200, 6, 9)], 'conc', z=0.0, name='Walk')
    ground(tmp, [(-3000, 3000, -3000, -9), (-3000, 3000, 9, 3000)], 'conc', z=-0.03, name='Lots')
    north = ['Tokyo_Cinema_Ginga_24', 'Tokyo_Center_7F_Izakaya', 'Tokyo_Market_A', 'Tokyo_Hotel_Biz_34',
             'Tokyo_Center_9F_Karaoke', 'Tokyo_Cinema_Ginga_34', 'Tokyo_Center_6F_Brown', 'Tokyo_Tower_Mixed_Tile_45',
             'Tokyo_Center_6F_Narrow', 'Tokyo_Hotel_City_45', 'Tokyo_Zakkyo_5F']
    south = ['Tokyo_Center_8F_Glass', 'Tokyo_Hotel_City_45', 'Tokyo_Market_B', 'Tokyo_Tower_Mixed_Glass_58',
             'Tokyo_Center_7F_Concrete', 'Tokyo_Tower_Mixed_Ribbon_62', 'Tokyo_Konbini_3F', 'Tokyo_Center_7F_Izakaya',
             'Tokyo_Tower_Mixed_Tile_70', 'Tokyo_Cinema_Ginga_24']
    row(tmp, north, 9.0, -40.0, -1, gap=0.3)
    row(tmp, south, -9.0, -36.0, 1, gap=0.3)
    # towers on the blocks behind: two loose rows each side, tallest in the middle
    far = [t for t in TOWERS if 'Mixed' not in t]
    spots_n = [(-20, 52), (30, 48), (78, 60), (125, 50), (-60, 95), (5, 110), (55, 120), (105, 105), (150, 125)]
    spots_s = [(-10, -55), (40, -60), (90, -52), (140, -64), (-45, -105), (20, -118), (70, -112), (120, -125)]
    order = ['Tokyo_Tower_Office_Dark_90', 'Tokyo_Tower_Mansion_75', 'Tokyo_Tower_Office_Blue_150', 'Tokyo_Tower_Hotel_80',
             'Tokyo_Tower_Office_Blue_48', 'Tokyo_Tower_Mansion_110', 'Tokyo_Tower_Office_Dark_120', 'Tokyo_Tower_Hotel_105',
             'Tokyo_Tower_Office_Silver_60', 'Tokyo_Tower_Hotel_60', 'Tokyo_Tower_Mansion_90', 'Tokyo_Tower_Office_Silver_85',
             'Tokyo_Tower_Office_Blue_75', 'Tokyo_Tower_Mansion_48', 'Tokyo_Tower_Office_Blue_75', 'Tokyo_Tower_Mansion_90',
             'Tokyo_Tower_Office_Dark_90']
    for (x, y), n in zip(spots_n + spots_s, order):
        place(tmp, n, (x, y), 0.0 if y > 0 else math.pi)
    for xp in range(-36, 160, 20):
        place(tmp, 'StreetLight_Road', (xp, 6.6), 0.0)
        place(tmp, 'StreetLight_Road', (xp + 10, -6.6), math.pi)


def kanal(tmp):
    """Koedo: a canal (6 m) between stone banks, willows leaning over the
    water, kura and machiya along the bank road."""
    ground(tmp, [(-40, 60, -1.0, 5.0)], 'water', z=-1.2, name='Water')
    ground(tmp, [(-40, 60, 5.0, 9.0)], 'gravel', z=-0.01, name='Bank')
    ground(tmp, [(-40, 60, -9.0, -1.0)], 'gravel', z=-0.01, name='Bank2')
    ground(tmp, [(-40, 60, 9.0, 40.0), (-40, 60, -40, -9.0)], 'earth', z=-0.02, name='Lots')
    _wall(tmp, -1.0, 1); _wall(tmp, 5.0, -1)
    row(tmp, ['Koedo_Kura_2Bay_Imo', 'Koedo_Machiya_2Bay_Unagi', 'Koedo_Misegura_3Bay_Sake', 'Koedo_Kura_Corner_2Bay_Pottery',
              'Koedo_Machiya_3Bay_Tea'], 9.0, -30.0, -1, gap=0.4)
    for x in (-24.0, -9.0, 7.0, 22.0, 38.0):
        place(tmp, 'Tree_Yanagi', (x, 5.6 if x % 2 else 5.3), math.radians(x * 7))
    for x in (-16.0, 15.0, 30.0):
        place(tmp, 'Tree_Yanagi', (x, -1.6), math.radians(x * 11))


def _wall(tmp, y, side):
    """Canal bank wall (stone grey), from the bank down into the water."""
    me = bpy.data.meshes.new(f'{tmp.name}_wall{y}')
    me.from_pydata([(-40, y, 0.0), (60, y, 0.0), (60, y, -1.4), (-40, y, -1.4)], [], [(0, 1, 2, 3) if side > 0 else (3, 2, 1, 0)])
    me.materials.append(S5._mat('M_PreviewBankStone', (0.18, 0.18, 0.17), 0.8))
    ob = bpy.data.objects.new(me.name, me)
    tmp.objects.link(ob)


def gassho(tmp):
    """A Gassho farm yard in late autumn: persimmons in the yard (one bare
    with fruit, one in leaf), the farm house, shed, paddies, drying racks."""
    ground(tmp, [(-60, 60, -60, 60)], 'grass', z=-0.03, name='Field')
    ground(tmp, [(-14, 14, -10, 6)], 'earth', z=-0.01, name='Yard')
    place(tmp, 'Gassho_L_Honke', (0, 14.0))
    place(tmp, 'Gassho_Naya', (-17, 4.0), math.pi / 2)
    place(tmp, 'Gassho_Itakura', (16, 6.0), -math.pi / 2)
    place(tmp, 'Tree_Kaki_Bare', (-7.5, -3.0), 0.4)
    place(tmp, 'Tree_Kaki', (9.0, -5.5), 1.3)
    place(tmp, 'Tree_Kaki_Bare', (22.0, -14.0), 2.2)
    place(tmp, 'Gassho_Hasa_6m', (-6.0, -16.0))
    for x in (-24, -8, 8, 24):
        place(tmp, 'Gassho_Paddy_8m', (x, -26.0))
    place(tmp, 'Prop_KeiTruck_Straw', (3.0, -6.5), 0.5)


def minato(tmp):
    """Funaura quay: fish houses and the market hall on the quay, boats,
    kei trucks parked on the apron (crates, nets, one empty)."""
    for x in range(-24, 32, 8):
        place(tmp, 'Minato_Quay_8m', (x, 0.0))
    ground(tmp, [(-60, 60, 0.0, 40)], 'conc', z=-0.02, name='Apron')
    place(tmp, 'Minato_Ichiba', (0.0, 16.0))
    place(tmp, 'Minato_Gyoka_Tin', (-20.0, 16.0))
    place(tmp, 'Minato_Gyoka_Kawara', (22.0, 16.0))
    place(tmp, 'Minato_Boat_Ika', (-8.0, -4.5), math.pi / 2)
    place(tmp, 'Minato_Boat_Skiff', (10.0, -2.8), math.pi / 2)
    place(tmp, 'Prop_KeiTruck_Crates', (-4.0, 6.0), math.radians(80))
    place(tmp, 'Prop_KeiTruck_Nets', (4.5, 7.0), math.radians(-100))
    place(tmp, 'Prop_KeiTruck_Empty', (12.0, 9.5), math.radians(20))
    place(tmp, 'Minato_Gear_Nets', (-14.0, 5.0))


SCENES = {'tokyo': tokyo, 'kanal': kanal, 'gassho': gassho, 'minato': minato}
VIEWS = [   # scene, name, target, direction (target -> camera), distance, mood, lens
    ('tokyo', 'Bau5c_Tokyo_street', (60, 1.0, 33.0), (-1.0, -0.03, -0.33), 100, True, 20),
    ('tokyo', 'Bau5c_Tokyo_street_neutral', (60, 1.0, 33.0), (-1.0, -0.03, -0.33), 100, False, 20),
    ('tokyo', 'Bau5c_Tokyo_street_clay', (60, 1.0, 33.0), (-1.0, -0.03, -0.33), 100, 'clay', 20),
    ('tokyo', 'Bau5c_Tokyo_cross', (10, 0.0, 30), (0.15, -1.0, -0.25), 110, True, 24),
    ('tokyo', 'Bau5c_Tokyo_top', (50, 0, 0), (-0.35, -1.0, 1.15), 330, True, 35),
    ('tokyo', 'Bau5c_Tokyo_top_neutral', (50, 0, 0), (-0.35, -1.0, 1.15), 330, False, 35),
    ('tokyo', 'Bau5c_Tokyo_far', (60, 20, 60), (-0.75, -1.0, 0.0), 1400, 'fog', 85),
    ('kanal', 'Bau5c_Koedo_kanal', (20, 2.0, 0.0), (-1.0, 0.0, 0.25), 30, True, 28),
    ('kanal', 'Bau5c_Koedo_kanal_neutral', (20, 2.0, 0.0), (-1.0, 0.0, 0.25), 30, False, 28),
    ('kanal', 'Bau5c_Koedo_kanal_bank', (0, 3.0, 2.0), (-0.3, -1.0, 0.5), 26, False, 28),
    ('kanal', 'Bau5c_Koedo_kanal_bank_mood', (0, 3.0, 2.0), (-0.3, -1.0, 0.5), 26, True, 28),
    ('gassho', 'Bau5c_Gassho_kaki', (0, -2, 3.5), (0.35, -1.0, 0.12), 26, False, 30),
    ('gassho', 'Bau5c_Gassho_kaki_mood', (0, -2, 3.5), (0.35, -1.0, 0.12), 26, True, 30),
    ('minato', 'Bau5c_Funaura_kei', (4, 6, 1.0), (0.3, -1.0, 0.35), 17, False, 30),
    ('minato', 'Bau5c_Funaura_kei_mood', (4, 6, 1.0), (0.3, -1.0, 0.35), 17, True, 30),
]
CLOSE = [   # collection, name, target, direction, distance, mood
    ('Tokyo_Tower_Office_Blue_150', 'c_tower_lobby', (0, -21, 3.5), (0.6, -1, 0.1), 16, True),
    ('Tokyo_Tower_Office_Blue_150', 'c_tower_crown', (0, 0, 150), (0.7, -1, 0.7), 48, True),
    ('Tokyo_Tower_Mansion_110', 'c_mansion_band', (14, -14, 40), (0.8, -1, 0.15), 22, True),
    ('Tokyo_Tower_Mansion_110', 'c_mansion_roof', (0, 0, 112), (0.6, -1, 0.9), 40, False),
    ('Tokyo_Tower_Hotel_105', 'c_hotel_drive', (0, -11, 3.5), (0.5, -1, 0.05), 15, True),
    ('Tokyo_Tower_Mixed_Tile_70', 'c_mixed_signs', (0, -11, 10), (0.6, -1, 0.1), 22, True),
    ('Tokyo_Tower_Office_Dark_120', 'c_fins', (16, -13, 60), (1, -1, 0.05), 25, False),
    ('Tokyo_Cinema_Ginga_34', 'c_cinema', (0, -8, 8), (0.3, -1, 0.0), 18, True),
    ('Tokyo_Hotel_Biz_34', 'c_biz_drive', (0, -7, 4), (0.6, -1, 0.05), 12, True),
    ('Tokyo_Market_A', 'c_market_gate', (0, -6, 4.5), (0.2, -1, 0.05), 11, True),
    ('Tokyo_Market_A', 'c_market_aisle', (0, -2.5, 2.2), (0.02, -1, 0.02), 4.5, True),
    ('Prop_KeiTruck_Straw', 'c_kei_front', (0, -1, 0.9), (-0.8, -1, 0.3), 4.2, False),
    ('Prop_KeiTruck_Nets', 'c_kei_back', (0, 0.5, 1.0), (0.7, 1, 0.5), 4.2, False),
    ('Tree_Kaki_Bare', 'c_kaki_fruit', (0, 0, 4.2), (0.5, -1, 0.1), 5.0, False),
    ('Tree_Yanagi', 'c_yanagi', (0, 0, 3.0), (0.5, -1, 0.05), 10.0, False),
]


def lods(out_dir, names=('Tokyo_Tower_Office_Blue_150', 'Tokyo_Tower_Mansion_110', 'Tokyo_Tower_Mixed_Tile_70')):
    """LOD0 / LOD1 / LOD2 of a few towers side by side (mood and clay)."""
    tmp = new(TMP)
    x = 0.0
    for n in names:
        col = bpy.data.collections[n]
        w = max(v.co.x for o in col.all_objects if o.type == 'MESH' for v in o.data.vertices) * 2 + 8
        for lod in range(3):
            for o in col.all_objects:
                if o.type != 'MESH' or o.name.startswith('COL_') or not o.name.endswith(f'_LOD{lod}'):
                    continue
                c = o.copy(); c.hide_render = False; c.hide_set(False)
                c.location = (x, 0, 0)
                tmp.objects.link(c)
            x += w
    ground(tmp, [(-60, x + 60, -60, 60)], 'conc', z=-0.02)
    tgt = (x / 2 - 20, 0, 80)
    P.shot([TMP], tgt, (0.0, -1, 0.15), x * 1.3, os.path.join(out_dir, 'Bau5c_LODs.png'), mood=True, size=(1024, 480), lens=35)
    P.shot([TMP], tgt, (0.0, -1, 0.15), x * 1.3, os.path.join(out_dir, 'Bau5c_LODs_clay.png'), mood='clay', size=(1024, 480), lens=35)
    clear(TMP)


def _single(cname, out, dirs):
    tmp = new(TMP)
    place(tmp, cname, (0, 0))
    ground(tmp, [(-80, 80, -80, 80)], 'conc', z=-0.02)
    col = bpy.data.collections[cname]
    vs = [o.matrix_world @ v.co for o in col.all_objects if o.type == 'MESH' and not o.hide_render for v in o.data.vertices]
    lo = Vector([min(v[i] for v in vs) for i in range(3)]); hi = Vector([max(v[i] for v in vs) for i in range(3)])
    ctr = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.y - lo.y, (hi.z - lo.z) * 0.62)
    dist = size * 1.9 + 4.0
    tgt = (ctr.x, ctr.y, ctr.z)
    for label, d, mood in dirs:
        P.shot([TMP], tgt, d, dist, os.path.join(out, f'{label}_{cname}.png'), mood=mood, size=(400, 640), lens=35)
    clear(TMP)


def shots(out_dir, which=('scenes', 'single', 'lods', 'close'), only=None):
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n + '.png')
    S5.GROUND.setdefault('water', (0.02, 0.035, 0.05))
    P.stage(True)
    g = bpy.data.objects['PreviewGround']
    g.location.z = -1.6         # canal water below 0
    try:
        if 'scenes' in which:
            for sc, fn in SCENES.items():
                if only and sc not in only:
                    continue
                tmp = new(TMP)
                fn(tmp)
                for s, name, tgt, d, dist, mood, lens in VIEWS:
                    if s != sc:
                        continue
                    if mood == 'fog':
                        P.stage(True)
                        g.scale = (12, 12, 1)
                        fog(True)
                        try:
                            P.shot([TMP], tgt, d, dist, o(name), mood=True, size=(1024, 576), lens=lens)
                        finally:
                            fog(False); g.scale = (1, 1, 1)
                    else:
                        P.shot([TMP], tgt, d, dist, o(name), mood=mood, size=(1024, 576), lens=lens)
                clear(TMP)
        if 'single' in which:
            for cname in [c for c in bpy.data.collections.keys()
                          if c.startswith(('Tokyo_Tower_', 'Tokyo_Hotel_', 'Tokyo_Cinema_', 'Tokyo_Market_', 'Prop_KeiTruck_'))
                          or c in ('Tree_Kaki', 'Tree_Kaki_Bare', 'Tree_Yanagi')]:
                if only and cname not in only:
                    continue
                _single(cname, out_dir, [('h', (0.55, -1, 0.25), False), ('b', (-0.6, 1, 0.3), False),
                                         ('k', (0.55, -1, 0.25), 'clay'), ('m', (-0.5, -1, 0.12), True)])
        if 'lods' in which:
            lods(out_dir)
        if 'close' in which:
            for cname, name, tgt, d, dist, mood in CLOSE:
                if only and name not in only:
                    continue
                tmp = new(TMP)
                place(tmp, cname, (0, 0))
                ground(tmp, [(-60, 60, -60, 60)], 'conc', z=-0.02)
                P.shot([TMP], tgt, d, dist, o(name), mood=mood, size=(512, 400), lens=35)
                clear(TMP)
    finally:
        clear(TMP)
        g.location.z = 0.0
