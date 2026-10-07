"""Kasuga-dōrō stone lantern (shrine / temple approach), ~1.95 m.

Parts bottom to top (reference: Kasuga Taisha lanterns, 1.8-2.2 m):
kiso (hex base) - sao (round post with a ring) - chūdai (hex platform) -
hibukuro (hex fire box, lit paper window front and back) - kasa (hex roof,
corners curling up) - hōju (jewel finial on a lotus collar).
Upward faces get the moss strip: rain and moss collect where water rests.
"""
import bmesh, math
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'StoneLantern'
ATLAS = 'Props'
H = 1.96


def _geo(lod):
    bm = K.new_bm()
    stone, moss, light = (A.region(ATLAS, n) for n in ('STONE', 'STONE_MOSS', 'LIGHT_PAPER'))
    seg = 12 if lod == 0 else 8
    up = []  # upward faces -> moss

    def part(p):
        K.map_faces(bm, p['sides'], stone)   # metric, grime at the foot of each part
        if p['bottom'] is not None:
            K.map_faces(bm, [p['bottom']], stone)
        if p['top'] is not None:
            up.append(p['top'])
        return p

    # kiso: slab + tapering pedestal (phase 0 = a flat side faces -Y, the front)
    part(K.prism(bm, 6, 0.40, 0.40, 0.0, 0.08, cap_bottom=False))
    part(K.lathe(bm, 6, [(0.35, 0.08), (0.33, 0.16), (0.24, 0.22), (0.17, 0.26)], cap_bottom=False))
    # sao: round post with a ring (fushi) at mid height
    part(K.lathe(bm, seg, [(0.11, 0.26), (0.11, 0.60), (0.13, 0.61), (0.13, 0.65),
                           (0.11, 0.66), (0.10, 1.00)], cap_bottom=False, cap_top=False))
    # chūdai: flaring hex platform
    part(K.lathe(bm, 6, [(0.15, 0.98), (0.30, 1.10), (0.34, 1.11), (0.34, 1.16)]))
    # hibukuro: fire box; front/back windows recessed with lit paper, relief panels on the sides
    fb = K.prism(bm, 6, 0.21, 0.21, 1.16, 1.48, cap_bottom=False, cap_top=False)
    K.map_faces(bm, fb['sides'], stone)
    for f in list(fb['sides']):
        if abs(f.calc_center_median().x) < 0.05:     # faces looking at ±Y
            floor, walls = K.recess(bm, f, 0.035, 0.05)
            K.map_faces(bm, walls, stone)
            K.map_faces(bm, [floor], light)
        elif lod == 0:
            floor, walls = K.recess(bm, f, 0.04, 0.012)
            K.map_faces(bm, [floor] + walls, stone)
    # kasa: hex roof, 4 verts per side so the corners can curl up (warabite)
    n = 24

    def lift(i, ring):
        if ring > 1:
            return 0.0
        k = (i % 4) / 4.0
        return 0.07 * (1 - min(k, 1 - k) * 2) ** 2
    roof = K.lathe(bm, n, [(0.47, 1.48), (0.50, 1.54), (0.34, 1.61), (0.17, 1.70), (0.10, 1.73)], lift=lift)
    for ring in roof['rings']:   # pull in-between verts onto the straight hex sides
        for s in range(6):
            a, b = ring[s * 4].co.copy(), ring[((s + 1) * 4) % n].co.copy()
            for j in (1, 2, 3):
                v = ring[s * 4 + j]; z = v.co.z
                v.co = a.lerp(b, j / 4); v.co.z = z
    K.map_faces(bm, roof['sides'], stone)
    K.map_faces(bm, [roof['bottom']], stone)
    up += [f for f in roof['sides'] if f.normal.z > 0.3] + [roof['top']]
    # hōju: lotus collar + jewel
    part(K.lathe(bm, 6, [(0.11, 1.73), (0.12, 1.77), (0.07, 1.79)], cap_bottom=False))
    gem = K.lathe(bm, seg, [(0.07, 1.79), (0.085, 1.83), (0.075, 1.88), (0.035, 1.93), (0.0, H)], cap_bottom=False)
    K.map_faces(bm, gem['sides'], stone)
    for f in up:   # each face from its own foot, so nothing is clamped
        K.map_faces(bm, [f], moss)
    return bm


def _roof(bm, sides, prof, curl, phase=0.0):
    """Polygonal stone roof with corners curling up (4 verts per side)."""
    n = sides * 4

    def lift(i, ring):
        if ring > 1:
            return 0.0
        k = (i % 4) / 4.0
        return curl * (1 - min(k, 1 - k) * 2) ** 2
    roof = K.lathe(bm, n, prof, phase=phase, lift=lift)
    for ring in roof['rings']:
        if len(ring) < n:
            continue
        for s_ in range(sides):
            a, b = ring[s_ * 4].co.copy(), ring[((s_ + 1) * 4) % n].co.copy()
            for j in (1, 2, 3):
                v = ring[s_ * 4 + j]; z = v.co.z
                v.co = a.lerp(b, j / 4); v.co.z = z
    return roof


def _firebox(bm, sides, r, z0, z1, lod, phase=0.0, stone=None, light=None):
    fb = K.prism(bm, sides, r, r, z0, z1, phase=phase, cap_bottom=False, cap_top=False)
    K.map_faces(bm, fb['sides'], stone)
    for f in list(fb['sides']):
        c = f.calc_center_median()
        if abs(c.x) < 0.05:     # faces looking at ±Y: lit windows
            floor, walls = K.recess(bm, f, 0.03, 0.04)
            K.map_faces(bm, walls, stone); K.map_faces(bm, [floor], light)
        elif lod == 0:
            floor, walls = K.recess(bm, f, 0.03, 0.01)
            K.map_faces(bm, [floor] + walls, stone)


def _yukimi(lod):
    """Yukimi-dōrō: snow-viewing lantern - wide roof on three curved legs."""
    bm = K.new_bm()
    stone, moss, light = (A.region(ATLAS, n) for n in ('STONE', 'STONE_MOSS', 'LIGHT_PAPER'))
    up = []
    for k in range(3):
        a = math.radians(-90 + 60 + k * 120)
        d = (math.cos(a), math.sin(a))
        pts = [(d[0] * r, d[1] * r, z) for r, z in ((0.16, 0.42), (0.25, 0.33), (0.33, 0.17), (0.37, 0.02))]
        sd, _, c1 = K.tube_path(bm, pts, 0.05, 6 if lod == 0 else 4, reg=stone, cap1=True)
        K.map_faces(bm, [c1], stone)
    plat = K.lathe(bm, 6, [(0.22, 0.40), (0.28, 0.44), (0.28, 0.48)], cap_bottom=True)
    K.map_faces(bm, plat['sides'] + [plat['bottom']], stone); up.append(plat['top'])
    _firebox(bm, 6, 0.18, 0.48, 0.72, lod, stone=stone, light=light)
    roof = _roof(bm, 6, [(0.60, 0.72), (0.64, 0.77), (0.42, 0.84), (0.2, 0.93), (0.1, 0.96)], 0.07)
    K.map_faces(bm, roof['sides'], stone); K.map_faces(bm, [roof['bottom']], A.region(ATLAS, 'STONE_FLAT'))
    up += [f for f in roof['sides'] if f.normal.z > 0.3] + [roof['top']]
    gem = K.lathe(bm, 8 if lod == 0 else 6, [(0.07, 0.96), (0.08, 1.0), (0.06, 1.05), (0.0, 1.1)], cap_bottom=False)
    K.map_faces(bm, gem['sides'], stone)
    for f in up:
        K.map_faces(bm, [f], moss)
    return bm


def _oki(lod):
    """Oki-dōrō: small lantern set on the ground (garden paths, approaches)."""
    bm = K.new_bm()
    stone, moss, light = (A.region(ATLAS, n) for n in ('STONE', 'STONE_MOSS', 'LIGHT_PAPER'))
    q = math.pi / 4
    base = K.prism(bm, 4, 0.25, 0.24, 0.0, 0.07, phase=q, cap_bottom=False)
    K.map_faces(bm, base['sides'], stone)
    _firebox(bm, 4, 0.15, 0.07, 0.30, lod, phase=q, stone=stone, light=light)
    roof = _roof(bm, 4, [(0.29, 0.30), (0.31, 0.34), (0.18, 0.40), (0.07, 0.44)], 0.04, phase=q)
    K.map_faces(bm, roof['sides'] + [roof['bottom']], stone)
    up = [f for f in roof['sides'] if f.normal.z > 0.3] + [roof['top'], base['top']]
    gem = K.lathe(bm, 8 if lod == 0 else 6, [(0.05, 0.44), (0.055, 0.47), (0.0, 0.53)], cap_bottom=False)
    K.map_faces(bm, gem['sides'], stone)
    for f in up:
        K.map_faces(bm, [f], moss)
    return bm


def _variant(name, geo, size, light_z, lods=(0, 1)):
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', geo(lod), col, [mat], bevel=0.01 if lod == 0 else 0.0,
                          hidden=lod > 0) for lod in lods]
    w, h = size
    K.collider_box(f'COL_{name}', col, -w, w, -w, w, 0.0, h)
    K.light_marker(f'LIGHT_{name}', col, (0, 0, light_z), color=(1.0, 0.72, 0.42), watts=4, unity_range=3.0)
    return col, objs


def build(lods=(0, 1)):
    return [_variant(NAME, _geo, (0.4, H), 1.32, lods),                 # Kasuga (approved pilot)
            _variant(NAME + '_Yukimi', _yukimi, (0.62, 1.1), 0.6, lods),
            _variant(NAME + '_Oki', _oki, (0.25, 0.53), 0.18, lods)]


def preview(results, views):
    from kit import preview as P
    xs = {NAME: 0.0, NAME + '_Yukimi': 1.6, NAME + '_Oki': -1.2}
    for col, _ in results:
        for o in col.objects:
            o.location.x += xs[col.name]
    objs = [o[0] for _, o in results]
    show = [c.name for c, _ in results]
    a = P.render(objs, NAME, [v for v in views if v[2] != 'clay'], size=(640, 480), show=show)
    b = P.render(objs, NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(640, 480), show=show)
    for col, _ in results:
        for o in col.objects:
            o.location.x -= xs[col.name]
    return f'{a}, {b}'
