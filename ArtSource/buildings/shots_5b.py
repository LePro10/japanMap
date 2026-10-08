"""Pictures of task 5b (missing buildings for Phase 5): one scene per place
(Sakura Commons, Koedo, the yokochō alley, the mill at Stillwater), every
building on its own (front, back, clay), close-ups.

All scene objects are linked copies (minato._place) in temporary
collections, removed afterwards. Show cars are simple stand-ins (scene only,
never exported): the game puts the real fleet on the stalls.

    from buildings import shots_5b as S5; S5.shots('/path/to/dir')
"""
import math
import os
import bmesh
import bpy
from mathutils import Vector, Matrix
from kit import core as K, preview as P
from buildings import minato as MI
from buildings import machi as MA

GROUND = {'asphalt': (0.045, 0.045, 0.048), 'grass': (0.07, 0.1, 0.045), 'gravel': (0.16, 0.15, 0.13), 'earth': (0.12, 0.1, 0.08),
          'conc': (0.2, 0.2, 0.19)}


def _mat(name, rgb, rough=0.8, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = K._principled(m.node_tree)
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def ground(tmp, rects, kind, z=-0.01, name='G'):
    me = bpy.data.meshes.new(f'{tmp.name}_{name}')
    vs, fs = [], []
    for x0, x1, y0, y1 in rects:
        k = len(vs)
        vs += [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
        fs.append((k, k + 1, k + 2, k + 3))
    me.from_pydata(vs, [], fs)
    me.materials.append(_mat(f'M_Preview_{kind}', GROUND[kind], 0.9 if kind != 'asphalt' else 0.3))
    ob = bpy.data.objects.new(me.name, me)
    tmp.objects.link(ob)


CAR_COLS = [(0.6, 0.02, 0.03), (0.85, 0.85, 0.86), (0.02, 0.02, 0.025), (0.05, 0.15, 0.45), (0.5, 0.52, 0.55),
            (0.9, 0.55, 0.05), (0.08, 0.3, 0.12), (0.75, 0.75, 0.7), (0.3, 0.02, 0.02), (0.02, 0.25, 0.5)]


def car(tmp, pos, rot, i=0, kind='sedan'):
    """Stand-in car for the pictures (not exported): body, glasshouse, wheels."""
    bm = bmesh.new()
    L, W = (4.4, 1.78) if kind == 'sedan' else (3.4, 1.48)
    body = [(-L / 2, 0.3), (L / 2, 0.3), (L / 2, 0.72), (L / 2 - 0.9, 0.9), (-L / 2 + 0.2, 0.95), (-L / 2, 0.8)]
    cab = [(-L / 2 + 0.6, 0.92), (L / 2 - 1.3, 0.9), (L / 2 - 2.0, 1.38), (-L / 2 + 0.95, 1.4)] if kind == 'sedan' else \
          [(-L / 2 + 0.15, 0.94), (L / 2 - 0.8, 0.9), (L / 2 - 1.3, 1.55), (-L / 2 + 0.2, 1.58)]
    for poly, w, mi in ((body, W / 2, 0), (cab, W / 2 - 0.12, 1)):
        a = [bm.verts.new((x, -w, z)) for x, z in poly]
        b = [bm.verts.new((x, w, z)) for x, z in poly]
        n = len(poly)
        for k in range(n):
            f = bm.faces.new([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]]); f.material_index = mi
        for cap in (a, list(reversed(b))):
            f = bm.faces.new(cap); f.material_index = mi
    for sx in (-1, 1):
        for sy in (-1, 1):
            r = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.32, radius2=0.32, depth=0.22,
                                      matrix=Matrix.Translation((sx * (L / 2 - 0.75), sy * (W / 2 - 0.08), 0.32)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
            for v in r['verts']:
                for f in v.link_faces:
                    f.material_index = 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(f'{tmp.name}_car{len(tmp.objects)}')
    bm.to_mesh(me); bm.free()
    me.materials.append(_mat(f'M_PreviewCar{i % len(CAR_COLS)}', CAR_COLS[i % len(CAR_COLS)], 0.25, 0.4))
    me.materials.append(_mat('M_PreviewCarGlass', (0.02, 0.03, 0.04), 0.05))
    me.materials.append(_mat('M_PreviewTyre', (0.02, 0.02, 0.02), 0.7))
    ob = bpy.data.objects.new(me.name, me)
    ob.location = (pos[0], pos[1], pos[2] if len(pos) > 2 else 0.0)
    ob.rotation_euler = (0, 0, rot)
    tmp.objects.link(ob)


def new(name):
    clear(name)
    tmp = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(tmp)
    return tmp


def clear(name):
    tmp = bpy.data.collections.get(name)
    if not tmp:
        return
    for o in list(tmp.objects):
        me = o.data if o.type == 'MESH' and o.data and o.data.name.startswith(name) else None
        bpy.data.objects.remove(o)
        if me and not me.users:
            bpy.data.meshes.remove(me)
    if tmp.name in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.unlink(tmp)
    bpy.data.collections.remove(tmp)


def place(tmp, cname, pos, rot=0.0):
    return MI._place(tmp, cname, pos, rot)


def front_y(cname):
    """Min y of the LOD0 meshes (the street front) of a collection."""
    col = bpy.data.collections[cname]
    ys = [v.co.y for o in col.all_objects if o.type == 'MESH' and not o.hide_render for v in o.data.vertices]
    return min(ys)


def row(tmp, names, y_front, x0, facing=-1, gap=0.0, widths=None):
    """Houses side by side along +X with their fronts on y_front; facing -1:
    fronts look to -Y (north side of a street), +1: turned to look to +Y."""
    x = x0
    for n in names:
        col = bpy.data.collections[n]
        xs = [v.co.x for o in col.all_objects if o.type == 'MESH' and not o.hide_render for v in o.data.vertices]
        w = (widths or {}).get(n, max(xs) - min(xs))
        fy = front_y(n)
        if facing < 0:
            place(tmp, n, (x + w / 2, y_front - fy), 0.0)
        else:
            place(tmp, n, (x + w / 2, y_front + fy), math.pi)
        x += w + gap
    return x


# ── scenes ──────────────────────────────────────────────────────────────────

def sakura(tmp):
    """Sakura Commons: Petal Motors and Open Bay 58 m apart (prototype),
    the court in front, bay apron, event board, lanterns, benches, lamps,
    nobori, cherry trees; stand-in cars on the ten stalls, one on the lift."""
    dx, wx = -28.0, 30.0
    place(tmp, 'Machi_PetalMotors', (dx, 0.0))
    place(tmp, 'Machi_OpenBay', (wx, 0.0))
    ground(tmp, [(-70, 70, -70, 30)], 'grass', z=-0.03, name='Grass')
    ground(tmp, [(-39, 39, -20, -4), (-39, -17, -7, 7.5), (21, 39, -7, 7.5)], 'asphalt', z=-0.005, name='Court')
    ground(tmp, [(wx - 4.4, wx + 4.4, -11, -7)], 'conc', z=0.0, name='Apron')
    for i, y in enumerate(MA.SIDE_Y):
        car(tmp, (dx - 8.4, y, 0.03), 0.0, i)
        car(tmp, (dx + 8.4, y, 0.03), math.pi, i + 4)
    car(tmp, (dx - 3.6, 3.9, 0.03), -math.pi / 2, 8)
    car(tmp, (dx + 3.6, 3.9, 0.03), -math.pi / 2, 9, kind='kei')
    car(tmp, (wx - 0.45, 0.5, 1.25), math.pi / 2, 3)
    car(tmp, (wx + 1.5, -9.5, 0.0), math.pi / 2 + 0.1, 5, kind='kei')
    for i, (x, y) in enumerate(((-12.0, -16.0), (-3.0, -12.0), (6.0, -17.0))):
        car(tmp, (x, y, 0.0), 0.3 * i, i + 2)
    place(tmp, 'EventBoard_4m', (14.0, -15.0))
    for p in ((-8, -24), (24, -24), (-3, -42), (19, -42)):
        place(tmp, 'StoneLantern', p)
    place(tmp, 'Bench_Park', (-1.5, -38.5), 0.4)
    place(tmp, 'Bench_Park', (17.5, -38.5), -0.4)
    for p in ((-15.6, -14.0), (19.6, -14.0)):
        place(tmp, 'StreetLight_Road', p, math.pi)
    for i, x in enumerate((-36.0, -22.0, 2.0, 36.0)):
        place(tmp, ('Nobori_Red', 'Nobori_Blue', 'Nobori_Yellow', 'Nobori_Red')[i], (x, -21.0))
    for i, (x, y) in enumerate(((-50, -28), (-46, -40), (44, -30), (50, -42), (-55, 8), (55, 6), (0, 16), (-12, 18), (12, 18))):
        place(tmp, 'Tree_Sakura_Bloom', (x, y), 0.7 * i)


def koedo(tmp):
    """Koedo: the main street (9 m) with the brewery on the north side
    between kura and machiya, the Toki-no-Kane tower over the lane opposite,
    further east the outskirts with the six modern houses."""
    ground(tmp, [(-60, 120, -4.5, 4.5)], 'asphalt', z=-0.005, name='Street')
    ground(tmp, [(-60, 120, -60, -4.5), (-60, 120, 4.5, 60)], 'gravel', z=-0.02, name='Lots')
    # north side: kura houses, the brewery, more kura
    x = row(tmp, ['Koedo_Kura_2Bay_Imo', 'Koedo_Machiya_2Bay_Unagi', 'Koedo_Misegura_3Bay_Sake'], 4.5, -55.0, -1)
    x = row(tmp, ['Koedo_Brewery'], 4.5, x + 0.5, -1)
    x = row(tmp, ['Koedo_Kura_Corner_2Bay_Pottery', 'Koedo_Machiya_3Bay_Tea'], 4.5, x + 0.5, -1)
    # south side: machiya, the bell tower over the lane (passage N-S), more houses
    x = row(tmp, ['Koedo_Kanban_2Bay_Souvenir', 'Koedo_Dagashi_1F', 'Koedo_Machiya_2Bay_Unagi_Lane'], -4.5, -50.0, 1)
    place(tmp, 'Koedo_TokiNoKane', (x + 4.5, -10.5))
    ground(tmp, [(x + 2.6, x + 6.4, -30, -4.5)], 'earth', z=-0.012, name='Lane')
    x = row(tmp, ['Koedo_Kura_2Bay_Imo_Lane', 'Koedo_Machiya_3Bay_Tea_Lane'], -4.5, x + 9.0, 1)
    # outskirts: modern houses on both sides, poles and lights
    xs = 40.0
    row(tmp, ['Machi_House_A', 'Machi_House_C', 'Machi_House_F'], 4.5, xs, -1, gap=0.6)
    row(tmp, ['Machi_House_B', 'Machi_House_D', 'Machi_House_E'], -4.5, xs + 2.0, 1, gap=0.6)
    for xp in range(-50, 120, 24):
        place(tmp, 'UtilityPole_Plain', (xp, -5.2))
    for xp in (-30, 6, 50, 86):
        place(tmp, 'StreetLight_Road', (xp, 5.1), 0.0)
    for p in ((-40, 4.9), (-18, 4.9)):
        place(tmp, 'Bicycle_Mamachari_Mint', p, 1.5)
    place(tmp, 'VendingMachine_Red', (37.0, -5.6), math.pi)


def yokocho(tmp):
    """Yokochō: two rows of izakaya facing each other across a 3 m alley,
    the tall buildings of the centre behind them."""
    order_a = ['A', 'B', 'C', 'D', 'E', 'A', 'B', 'C']
    order_b = ['C', 'E', 'D', 'A', 'B', 'C', 'E', 'A']
    widths = {f'Machi_Izakaya_{k}': MA.IZAKAYA[f'Izakaya_{k}']['L'] for k in 'ABCDE'}
    xa = row(tmp, [f'Machi_Izakaya_{k}' for k in order_a], 1.5, 0.0, -1, widths=widths)
    xb = row(tmp, [f'Machi_Izakaya_{k}' for k in order_b], -1.5, 0.0, 1, widths=widths)
    ground(tmp, [(-10, 40, -1.5, 1.5)], 'asphalt', z=-0.005, name='Alley')
    ground(tmp, [(-30, 60, -40, 40)], 'conc', z=-0.02, name='Block')
    row(tmp, ['Tokyo_Center_9F_Karaoke', 'Tokyo_Center_7F_Concrete', 'Tokyo_Center_8F_Glass'], 24.0, 2.0, 1, gap=1.0)
    place(tmp, 'VendingMachineSlim_Red', (-1.2, 1.0), math.pi / 2)
    place(tmp, 'Bicycle_Mamachari_Silver', (-1.4, -0.6), 0.2)
    return xa


def mill(tmp):
    """Stillwater: the mill pond (prototype pond 22 x 14), the mill with its
    wheel 17 m in front of the pond centre (prototype millWheel), farm
    houses, paddies and drying racks, cedars."""
    place(tmp, 'Gassho_MillPond', (0.0, 0.0))
    place(tmp, 'Gassho_Mill', (-1.0, -17.0))
    # grass with holes over the pond (water at -0.3) and the wheel pit (to -0.95)
    ground(tmp, [(-60, -11.5, -60, 40), (11.5, 60, -60, 40), (-11.5, 11.5, 7.5, 40), (-11.5, 11.5, -60, -23.2),
                 (-11.5, -1.95, -23.2, -7.5), (-0.05, 11.5, -23.2, -7.5)], 'grass', z=-0.03, name='Grass')
    ground(tmp, [(-60, -1.95, -27.5, -23.5), (-0.05, 60, -27.5, -23.5)], 'earth', z=-0.02, name='Lane')
    place(tmp, 'Gassho_S_Koya', (-21.0, -13.0), 0.0)
    place(tmp, 'Gassho_M_Minshuku', (34.0, -16.0), math.pi / 2)
    place(tmp, 'Gassho_Itakura', (-12.5, -11.0), 0.0)
    for x in (-24.0, -16.0, -8.0, 8.0, 16.0, 24.0):
        place(tmp, 'Gassho_Paddy_8m', (x, -36.0), math.pi)
    place(tmp, 'Gassho_Hasa_6m', (12.0, -30.0), 0.0)
    place(tmp, 'Jizo', (6.0, -22.8), 0.0)
    for i, (x, y) in enumerate(((-16, 12), (-12, 16), (14, 13), (18, 16), (-22, -4), (24, 2), (0, 18), (6, 20))):
        place(tmp, 'Tree_Sugi' if i % 3 else 'Tree_Momiji_Red', (x, y), i * 0.9)


SCENES = {'sakura': sakura, 'koedo': koedo, 'yokocho': yokocho, 'mill': mill}

# (scene, file, target, direction (target -> camera), distance, mood, lens)
VIEWS = [
    ('sakura', 'sakura_eye', (-28.0, -4.0, 2.5), (0.5, -1, 0.07), 22, True, 28),
    ('sakura', 'sakura_eye_neutral', (-28.0, -4.0, 2.5), (0.5, -1, 0.07), 22, False, 28),
    ('sakura', 'sakura_bay', (30.0, -5.0, 2.2), (-0.3, -1, 0.08), 19, True, 24),
    ('sakura', 'sakura_high', (0.0, -8.0, 0.0), (0.25, -1, 0.85), 78, False, 30),
    ('sakura', 'sakura_high_mood', (0.0, -8.0, 0.0), (0.25, -1, 0.85), 78, True, 30),
    ('sakura', 'sakura_clay', (-28.0, -4.0, 2.5), (0.5, -1, 0.07), 22, 'clay', 28),
    ('koedo', 'koedo_eye', (-17.0, 5.0, 5.0), (-1, -0.2, 0.12), 28, True, 24),
    ('koedo', 'koedo_eye_neutral', (-17.0, 5.0, 5.0), (-1, -0.2, 0.12), 28, False, 24),
    ('koedo', 'koedo_tower', (-28.0, -9.0, 7.5), (0.45, -1, 0.06), 17, True, 28),
    ('koedo', 'koedo_houses', (58.0, 0.0, 3.0), (1, 0.25, 0.12), 24, False, 26),
    ('koedo', 'koedo_houses_mood', (58.0, 0.0, 3.0), (1, 0.25, 0.12), 24, True, 26),
    ('koedo', 'koedo_high', (20.0, 0.0, 0.0), (0.15, -1, 1.1), 95, False, 30),
    ('koedo', 'koedo_clay', (-17.0, 5.0, 5.0), (-1, -0.2, 0.12), 28, 'clay', 24),
    ('yokocho', 'yokocho_eye', (16.0, 0.0, 1.7), (-1, 0.0, 0.03), 13, True, 22),
    ('yokocho', 'yokocho_eye_neutral', (16.0, 0.0, 1.7), (-1, 0.0, 0.03), 13, False, 22),
    ('yokocho', 'yokocho_end', (6.0, 0.0, 2.5), (-1, -0.35, 0.15), 14, True, 26),
    ('yokocho', 'yokocho_high', (14.0, 0.0, 0.0), (0.2, -0.6, 1.0), 32, False, 30),
    ('yokocho', 'yokocho_clay', (16.0, 0.0, 1.7), (-1, 0.0, 0.03), 13, 'clay', 22),
    ('mill', 'mill_eye', (-1.0, -15.0, 1.8), (-0.7, -1, 0.12), 16, True, 26),
    ('mill', 'mill_eye_neutral', (-1.0, -15.0, 1.8), (-0.7, -1, 0.12), 16, False, 26),
    ('mill', 'mill_pond', (0.0, -2.0, 1.0), (0.5, 1, 0.3), 28, True, 28),
    ('mill', 'mill_high', (0.0, -8.0, 0.0), (0.2, -0.8, 1.0), 60, False, 30),
    ('mill', 'mill_clay', (-1.0, -15.0, 1.8), (-0.7, -1, 0.12), 16, 'clay', 26),
]

SINGLE = ['Machi_PetalMotors', 'Machi_OpenBay'] + [f'Machi_House_{k}' for k in 'ABCDEF'] + [f'Machi_Izakaya_{k}' for k in 'ABCDE'] + \
         ['Koedo_TokiNoKane', 'Koedo_Brewery', 'Gassho_Mill', 'Gassho_MillPond']

CLOSE = [   # (collection, file, target, direction, distance, mood)
    ('Machi_PetalMotors', 'c_dealer_front', (0.0, -7.0, 2.6), (0.3, -1, 0.05), 9.0, True),
    ('Machi_PetalMotors', 'c_dealer_inside', (-6.0, 1.0, 1.5), (0.4, -1, 0.2), 8.0, False),
    ('Machi_PetalMotors', 'c_dealer_tower', (10.4, -6.5, 6.0), (1, -1, 0.1), 6.0, False),
    ('Machi_OpenBay', 'c_bay_inside', (0.0, 1.0, 2.0), (0.2, -1, 0.1), 9.5, True),
    ('Machi_OpenBay', 'c_bay_toolwall', (0.0, 6.0, 1.8), (0.15, -1, 0.05), 5.5, False),
    ('Machi_House_A', 'c_house_entry', (0.4, -2.5, 1.6), (0.35, -1, 0.15), 5.0, False),
    ('Machi_House_A', 'c_house_balcony', (2.5, -2.6, 4.6), (0.4, -1, 0.1), 5.0, False),
    ('Machi_House_E', 'c_house_carport', (2.8, -2.0, 1.8), (0.7, -1, 0.3), 6.0, False),
    ('Machi_House_B', 'c_house_back', (-0.5, 2.0, 1.4), (-0.5, 1, 0.15), 6.5, False),
    ('Machi_House_D', 'c_house_3f', (0.0, -3.5, 3.5), (0.3, -1, 0.15), 9.0, False),
    ('Machi_Izakaya_D', 'c_izakaya_front', (0.0, -3.0, 2.4), (0.3, -1, 0.05), 6.0, True),
    ('Machi_Izakaya_A', 'c_izakaya_cables', (0.0, -3.0, 4.4), (0.4, -1, 0.0), 3.5, False),
    ('Machi_Izakaya_C', 'c_izakaya_back', (0.0, 3.0, 2.6), (-0.4, 1, 0.1), 6.0, False),
    ('Koedo_TokiNoKane', 'c_tower_belfry', (0.0, 0.0, 12.0), (0.5, -1, 0.0), 6.5, False),
    ('Koedo_TokiNoKane', 'c_tower_base', (0.0, -2.0, 2.0), (0.4, -1, 0.15), 7.0, True),
    ('Koedo_Brewery', 'c_brew_shop', (-12.6, -11.0, 2.4), (0.3, -1, 0.1), 8.0, True),
    ('Koedo_Brewery', 'c_brew_chimney', (8.0, 2.0, 6.0), (-0.6, 1, 0.1), 14.0, False),
    ('Gassho_Mill', 'c_mill_wheel', (-0.3, 0.5, 1.4), (-1, 0.5, 0.15), 7.0, False),
    ('Gassho_Mill', 'c_mill_flume', (0.0, 6.0, 0.6), (-0.7, -0.3, 0.35), 6.0, False),
    ('Gassho_MillPond', 'c_pond_sluice', (0.0, -7.2, 0.4), (0.4, -1, 0.4), 5.0, False),
]


def shots(out_dir, which=('scenes', 'single', 'close'), only=None):
    os.makedirs(out_dir, exist_ok=True)
    o = lambda n: os.path.join(out_dir, n + '.png')
    P.stage(True)
    g = bpy.data.objects['PreviewGround']
    g.location.z = -1.2        # mill pit / pond below 0
    try:
        if 'scenes' in which:
            for sc, fn in SCENES.items():
                if only and sc not in only:
                    continue
                tmp = new('Shots5b')
                fn(tmp)
                for s, name, tgt, d, dist, mood, lens in VIEWS:
                    if s == sc:
                        P.shot(['Shots5b'], tgt, d, dist, o(name), mood=mood, size=(1024, 576), lens=lens)
                clear('Shots5b')
        if 'single' in which:
            for cname in SINGLE:
                tmp = new('Shots5b')
                place(tmp, cname, (0, 0))
                if not cname.startswith('Gassho'):      # the pit and the pond lie below 0
                    ground(tmp, [(-40, 40, -40, 40)], 'conc', z=-0.02)
                col = bpy.data.collections[cname]
                vs = [o_.matrix_world @ v.co for o_ in col.all_objects if o_.type == 'MESH' and not o_.hide_render for v in o_.data.vertices]
                lo = Vector([min(v[i] for v in vs) for i in range(3)]); hi = Vector([max(v[i] for v in vs) for i in range(3)])
                ctr = (lo + hi) / 2
                size = max(hi.x - lo.x, hi.y - lo.y, (hi.z - lo.z) * 1.4)
                dist = size * 1.55 + 2.0
                tgt = (ctr.x, ctr.y, ctr.z * 0.8)
                P.shot(['Shots5b'], tgt, (0.55, -1, 0.3), dist, o(f'h_{cname}'), size=(640, 480), lens=35)
                P.shot(['Shots5b'], tgt, (0.55, -1, 0.3), dist, o(f'k_{cname}'), mood='clay', size=(640, 480), lens=35)
                P.shot(['Shots5b'], tgt, (-0.6, 1, 0.3), dist, o(f'b_{cname}'), size=(640, 480), lens=35)
                P.shot(['Shots5b'], tgt, (-0.5, -1, 0.15), dist, o(f'm_{cname}'), mood=True, size=(640, 480), lens=35)
                clear('Shots5b')
        if 'close' in which:
            for cname, name, tgt, d, dist, mood in CLOSE:
                tmp = new('Shots5b')
                place(tmp, cname, (0, 0))
                if not cname.startswith('Gassho'):
                    ground(tmp, [(-40, 40, -40, 40)], 'conc', z=-0.02)
                if cname == 'Machi_OpenBay':
                    car(tmp, (-0.45, 0.5, 1.25), math.pi / 2, 3)
                P.shot(['Shots5b'], tgt, d, dist, o(name), mood=mood, size=(640, 480), lens=35)
                clear('Shots5b')
    finally:
        clear('Shots5b')
        g.location.z = 0.0
