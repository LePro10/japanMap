"""Kasuga-dōrō stone lantern (shrine / temple approach), ~1.95 m.

Parts bottom to top (reference: Kasuga Taisha lanterns, 1.8-2.2 m):
kiso (hex base) - sao (round post with a ring) - chūdai (hex platform) -
hibukuro (hex fire box, lit paper window front and back) - kasa (hex roof,
corners curling up) - hōju (jewel finial on a lotus collar).
Upward faces get the moss strip: rain and moss collect where water rests.
"""
import bmesh
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'StoneLantern'
ATLAS = 'Props'
H = 1.96


def _geo(lod):
    bm = bmesh.new()
    stone, moss, light = (A.region(ATLAS, n) for n in ('STONE', 'STONE_MOSS', 'LIGHT_PAPER'))
    seg = 12 if lod == 0 else 8
    up = []  # upward faces -> moss

    def part(p, zr=(0, H)):
        K.map_faces(bm, p['sides'], stone, zrange=zr)
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
    K.map_faces(bm, fb['sides'], stone, zrange=(0, H))
    for f in list(fb['sides']):
        if abs(f.calc_center_median().x) < 0.05:     # faces looking at ±Y
            floor, walls = K.recess(bm, f, 0.035, 0.05)
            K.map_faces(bm, walls, stone)
            K.map_faces(bm, [floor], light)
        elif lod == 0:
            floor, walls = K.recess(bm, f, 0.04, 0.012)
            K.map_faces(bm, [floor] + walls, stone, zrange=(0, H))
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
    K.map_faces(bm, roof['sides'], stone, zrange=(1.4, H))
    K.map_faces(bm, [roof['bottom']], stone)
    up += [f for f in roof['sides'] if f.normal.z > 0.3] + [roof['top']]
    # hōju: lotus collar + jewel
    part(K.lathe(bm, 6, [(0.11, 1.73), (0.12, 1.77), (0.07, 1.79)], cap_bottom=False))
    gem = K.lathe(bm, seg, [(0.07, 1.79), (0.085, 1.83), (0.075, 1.88), (0.035, 1.93), (0.0, H)], cap_bottom=False)
    K.map_faces(bm, gem['sides'], moss, zrange=(1.79, H))
    K.map_faces(bm, up, moss)
    return bm


def build(lods=(0, 1)):
    col = K.collection(NAME)
    mat = K.atlas_material(ATLAS)
    objs = [K.mesh_object(f'SM_{NAME}_LOD{lod}', _geo(lod), col, [mat], bevel=0.012 if lod == 0 else 0.0,
                          hidden=lod > 0) for lod in lods]
    K.collider_box(f'COL_{NAME}', col, -0.4, 0.4, -0.4, 0.4, 0.0, H)
    K.light_marker(f'LIGHT_{NAME}', col, (0, 0, 1.32), color=(1.0, 0.72, 0.42), watts=6, unity_range=4.0)
    return col, objs
