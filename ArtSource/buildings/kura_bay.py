"""Kura (kurazukuri storehouse, Koedo/Kawagoe) - ground-floor facade bay.

Module grid: 4.0 m wide (x -2..2), 3.9 m high; the outer wall face is y = 0,
the wall body runs to y = +0.30. Front looks to -Y. Modules snap side by side
(namako pattern and roof tile rows repeat every 4 m / 0.25 m); the next
storey stacks at z = 3.9.

Cross-section, bottom to top: stone footing - namako-kabe band (diagonal
tiles, raised white joints, 1.0 m) - drip ledge - lime-plaster wall - stepped
plaster cornice - plastered eave soffit - pent roof with round tile rows and
end tiles - plaster above the roof. Window bay: proud stepped frame, iron
bars, thick plaster shutters folded open against the wall.
"""
import bmesh, math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'buildings'
NAME = 'Kura_Bay'
ATLAS = 'Kura'
W, HT, T = 4.0, 3.9, 0.30
EAVE_Y, EAVE_Z, ROOF_TOP = -0.92, 3.36, (0.02, 3.76)

PROFILE = [(-0.06, 0.0), (-0.06, 0.40), (0.0, 0.40),           # 0-1 footing
           (0.0, 1.40),                                         # 2 namako
           (-0.04, 1.40), (-0.04, 1.46), (0.02, 1.46),          # 3-5 drip ledge
           (0.02, 1.60), (0.02, 3.00), (0.02, 3.05),            # 6-8 plaster (7 = window row)
           (-0.06, 3.05), (-0.06, 3.17), (-0.14, 3.17), (-0.14, 3.30),  # 9-12 cornice steps
           (EAVE_Y, 3.24), (EAVE_Y, EAVE_Z),                    # 13 soffit, 14 fascia
           ROOF_TOP, (0.02, HT)]                                # 15 roof, 16 wall above
SEG = dict(footing=(0, 1), namako=(2,), ledge=(3, 4, 5), plaster=(6, 7, 8),
           cornice=(9, 10, 11, 12, 13, 14), roof=(15,), upper=(16,))
XS_WIN = [-2.0, -0.65, 0.65, 2.0]


def _tile_row(bm, x, r, n, start, end):
    """Round cover tile (marugawara) lying on the roof from start to end (y, z);
    the down-slope end is closed by the end-tile disc."""
    s = Vector((0, end[0] - start[0], end[1] - start[1])).normalized()
    nrm = Vector((0, -s.z, s.y))  # roof normal, pointing up/out
    rings = []
    for (y, z) in (start, end):
        base = Vector((x, y, z))
        rings.append([bm.verts.new(base + Vector((r * math.cos(math.pi * i / n), 0, 0)) + nrm * (r * math.sin(math.pi * i / n)))
                      for i in range(n + 1)])
    a, b = rings
    sides = [bm.faces.new([a[i], b[i], b[i + 1], a[i + 1]]) for i in range(n)]
    cap = bm.faces.new(a)
    return sides, cap


def _geo(lod, window, plaster):
    bm = bmesh.new()
    R = lambda n: A.region(ATLAS, n)
    pl = R(plaster)
    xs = XS_WIN if window else [-2.0, 2.0]
    faces, _ = K.extrude_profile(bm, PROFILE, xs)
    seg = lambda name: [f for k in SEG[name] for f in faces[k]]
    K.map_faces(bm, seg('footing'), R('STONE'), zrange=(0, 0.4))
    K.map_faces(bm, seg('namako'), R('NAMAKO'), metric_z0=0.40)
    K.map_faces(bm, seg('ledge') + seg('cornice') + seg('upper'), pl, zrange=(1.4, HT))
    K.map_faces(bm, seg('plaster'), pl, zrange=(1.4, 3.3))
    K.map_faces(bm, seg('roof'), R('ROOFTILE'))

    if window:
        cell = faces[7][1]
        cap, sides = K.extrude(bm, cell, 0.08)                     # proud frame
        K.map_faces(bm, sides, pl, zrange=(1.4, 3.3))
        step, walls = K.recess(bm, cap, 0.12, 0.05)                # stepped jamb
        K.map_faces(bm, [step] + walls, pl, zrange=(1.4, 3.3))
        if lod == 0:
            hole, walls = K.recess(bm, step, 0.06, 0.24)           # opening
            K.map_faces(bm, walls, pl, zrange=(1.4, 3.3))
        else:
            hole = step
        K.map_faces(bm, [hole], R('LIGHT_WARM' if window == 'lit' else 'INTERIOR'))
        if lod == 0:                                               # iron bars
            lo, hi = 1.60 + 0.12 + 0.06, 3.00 - 0.12 - 0.06
            for bx in (-0.3, -0.1, 0.1, 0.3):
                bar = K.prism(bm, 6, 0.016, 0.016, lo, hi, cx=bx, cy=0.05, cap_bottom=False, cap_top=False)
                K.map_faces(bm, bar['sides'], R('IRON'))
        for sx in (-1, 1):                                         # shutters folded open
            x0, x1 = sorted((sx * 0.70, sx * 1.28))
            sh = K.box(bm, x0, x1, -0.14, 0.02, 1.62, 2.98, skip=('+y',))
            K.map_faces(bm, sh.values(), pl, zrange=(1.4, 3.3))
            if lod == 0:
                fl, walls = K.recess(bm, sh['-y'], 0.07, 0.025)
                K.map_faces(bm, [fl] + walls, pl, zrange=(1.4, 3.3))

    if lod == 0:                                                   # tile rows + end tiles
        start = (EAVE_Y - 0.02, EAVE_Z)
        for k in range(16):
            sides, cap = _tile_row(bm, -W / 2 + 0.125 + k * 0.25, 0.055, 5, start, ROOF_TOP)
            K.map_faces(bm, sides, R('ROOFTILE'))
            K.map_faces(bm, [cap], R('TILE_DARK'))
        # ridge flashing where the pent roof meets the wall
        fl = K.box(bm, -W / 2, W / 2, -0.10, 0.02, 3.70, 3.80, skip=('+y', '-x', '+x'))
        K.map_faces(bm, fl.values(), R('TILE_DARK'))
    return bm


def _caps_for_preview(col, name):
    """End pieces so a preview row does not show open sections (not exported)."""
    bm = bmesh.new()
    _, caps = K.extrude_profile(bm, PROFILE, [-1.5 * W, 1.5 * W], back_y=T)
    for f in list(bm.faces):
        if f not in caps:
            bm.faces.remove(f)
    K.map_faces(bm, caps, A.region(ATLAS, 'PLASTER_EDGE'))
    return K.mesh_object(name, bm, col, [K.atlas_material(ATLAS)], recalc=False)


VARIANTS = {'Window_Black': ('lit', 'PLASTER_BLACK'), 'Plain_Black': (False, 'PLASTER_BLACK'),
            'Window_White': (True, 'PLASTER_WHITE'), 'Plain_White': (False, 'PLASTER_WHITE')}


def build_variant(key, lods=(0, 1)):
    window, plaster = VARIANTS[key]
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', _geo(lod, window, plaster), col, [mat],
                          bevel=0.015 if lod == 0 else 0.0, hidden=lod > 0, recalc=False) for lod in lods]
    K.collider_box(f'COL_{name}', col, -W / 2, W / 2, -0.06, T, 0, HT)
    if window == 'lit':
        K.light_marker(f'LIGHT_{name}', col, (0, -0.6, 2.3), color=(1.0, 0.7, 0.4), watts=30, unity_range=5.0)
    return col, objs


def build():
    return [build_variant(k) for k in VARIANTS]


def preview(results, views):
    """A row of three bays (black plain | black lit window | white window), ends capped."""
    from kit import preview as P
    by = {c.name: (c, o) for c, o in results}
    row = [by[f'{NAME}_Plain_Black'], by[f'{NAME}_Window_Black'], by[f'{NAME}_Window_White']]
    for i, (col, _) in enumerate(row):
        for o in col.objects:
            o.location.x = (i - 1) * W
    pc = K.collection('Kura_PreviewCaps')
    _caps_for_preview(pc, 'KuraCaps')
    objs = [o[0] for _, o in row]
    path = P.render(objs, NAME, [('mood', (-0.8, -1.7, 0.35), True), ('front', (0.9, -1.6, 0.45), False)],
                    size=(960, 640), show=[c.name for c, _ in row] + [pc.name])
    for col, _ in results:
        for o in col.objects:
            o.location.x = 0.0
    return path
