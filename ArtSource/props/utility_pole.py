"""Japanese concrete utility pole (denchū), 12 m above ground.

Top to bottom: high-voltage crossarm (galvanised, braced) with three pin
insulators - pole transformer with bushings and cut-out switches (variant) -
low-voltage spool rack - telecom hanger with a riser cable down the pole -
small street lamp (bōhan-tō) - number plate - step bolts from 2.4 m - yellow
and black tiger-stripe cover (tora-maki) up to 1.8 m. Variant 'Guy': end pole
with a guy wire and its yellow guard.

Lines run along X; the street side is -Y. CABLE_<kind>_<i> empties mark where
wires attach (power_line.py uses the same points for the spans).
References: 14 m spun-concrete pole (2 m buried), Ø 190 mm top / ~330 mm at
ground; crossarm 1.8 m at ~11.4 m; transformer Ø 0.5 m.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A

KLASS = 'props'
NAME = 'UtilityPole'
ATLAS = 'Street'
H = 12.0
R0, R1 = 0.165, 0.095

HV = [(0.0, -0.90, 11.68), (0.0, -0.30, 11.68), (0.0, 0.60, 11.68)]
LV = [(0.0, -0.36, 8.70), (0.0, -0.36, 8.45), (0.0, -0.36, 8.20)]
TEL = [(0.0, -0.40, 5.95)]


def r_at(z):
    return R0 - (R0 - R1) * z / H


def _insulator(bm, R, x, y, z, lod):
    prof = [(0.03, z), (0.035, z + 0.04), (0.075, z + 0.06), (0.05, z + 0.09), (0.08, z + 0.12),
            (0.05, z + 0.15), (0.065, z + 0.18), (0.03, z + 0.21), (0.0, z + 0.24)]
    if lod:
        prof = [(0.05, z), (0.07, z + 0.1), (0.04, z + 0.2), (0.0, z + 0.24)]
    p = K.lathe(bm, 10 if lod == 0 else 6, prof, cx=x, cy=y, cap_bottom=False)
    K.map_faces(bm, p['sides'], R('PORCELAIN')); K.nobevel(bm, p['sides'])


def _geo(lod, variant):
    bm = K.new_bm()
    R = lambda n: A.region(ATLAS, n)
    n = 12 if lod == 0 else 8
    # shaft + tiger-stripe cover (two square-ish bands so the 45° stripes stay 45°)
    shaft = K.lathe(bm, n, [(R0, 0.0), (r_at(1.8), 1.8), (R1, H), (0.0, H + 0.03)], cap_bottom=False)
    K.map_cyl(bm, shaft['sides'], R('CONCRETE_POLE'), rotate=True)
    for z0 in (0.0, 0.9):
        band = K.lathe(bm, n, [(r_at(z0) + 0.007, z0), (r_at(z0 + 0.9) + 0.007, z0 + 0.9)],
                       cap_bottom=False, cap_top=False)
        K.map_cyl(bm, band['sides'], R('TORA'), z0=z0, z_len=0.9)
    galv, steel = R('GALV'), R('STEEL')
    # high-voltage crossarm with braces and pin insulators
    arm = K.box(bm, -0.04, 0.04, -1.05, 0.85, 11.36, 11.44)
    K.map_faces(bm, arm.values(), galv)
    for y in (-0.65, 0.5):
        sd, _, _ = K.tube_path(bm, [(0, 0, 10.95), (0, y, 11.36)], 0.012, 4)
        K.map_faces(bm, sd, galv); K.nobevel(bm, sd)
    for x, y, z in HV:
        _insulator(bm, R, x, y, 11.44, lod)
    if variant == 'Transformer':
        # tank hung on a band, lid, cooling ribs, two bushings, cut-outs on a small arm
        ty = -0.52
        tank = K.lathe(bm, 12 if lod == 0 else 8, [(0.24, 8.75), (0.26, 8.80), (0.26, 9.55), (0.28, 9.58),
                                                   (0.28, 9.64), (0.18, 9.70), (0.0, 9.72)], cx=0, cy=ty)
        K.map_faces(bm, tank['sides'] + [tank['bottom']], R('TRANSFORMER'))
        band = K.box(bm, -0.05, 0.05, -r_at(9.3) - 0.02, ty - 0.2, 9.25, 9.4)
        K.map_faces(bm, band.values(), galv)
        if lod == 0:
            for a in (0.6, 2.2, 3.8, 5.4):   # cooling ribs
                c, s_ = math.cos(a), math.sin(a)
                rib = K.box(bm, -0.012, 0.012, 0.25, 0.31, 8.85, 9.45)
                for f in rib.values():
                    for v in f.verts:
                        if not v.tag:
                            x, y = v.co.x, v.co.y
                            v.co.x, v.co.y = x * c - y * s_, ty + x * s_ + y * c
                            v.tag = True
                K.map_faces(bm, rib.values(), R('TRANSFORMER'))
            for v in bm.verts:
                v.tag = False
            for bx in (-0.1, 0.1):
                b = K.lathe(bm, 8, [(0.03, 9.70), (0.045, 9.74), (0.03, 9.78), (0.04, 9.82), (0.0, 9.88)],
                            cx=bx, cy=ty, cap_bottom=False)
                K.map_faces(bm, b['sides'], R('PORCELAIN')); K.nobevel(bm, b['sides'])
            sa = K.box(bm, -0.03, 0.03, -0.75, 0.0, 10.55, 10.61)
            K.map_faces(bm, sa.values(), galv)
            for k, y in enumerate((-0.3, -0.62)):
                co = K.box(bm, -0.04, 0.04, y - 0.03, y + 0.03, 10.61, 10.86)
                K.map_faces(bm, co.values(), R('PORCELAIN'))
                # drop wires: HV insulator -> cut-out -> bushing
                hx, hy, hz = HV[k]
                pts = [(hx, hy, hz), (hx, (hy + y) / 2, hz - 0.25), (0, y, 10.86)]
                sd, _, _ = K.tube_path(bm, pts, 0.007, 4)
                K.map_faces(bm, sd, R('CABLE')); K.nobevel(bm, sd)
                sd, _, _ = K.tube_path(bm, [(0, y, 10.61), (0, (y + ty) / 2, 10.1), ((-0.1, 0.1)[k], ty, 9.88)], 0.007, 4)
                K.map_faces(bm, sd, R('CABLE')); K.nobevel(bm, sd)
    # low-voltage rack: vertical strap with three spools
    rack = K.box(bm, -0.025, 0.025, -0.30, -r_at(8.4) + 0.02, 8.05, 8.85)
    K.map_faces(bm, rack.values(), galv, rotate=True)   # vertical strap: length along U
    for x, y, z in LV:
        sp = K.lathe(bm, 8 if lod == 0 else 6, [(0.03, z - 0.04), (0.045, z - 0.03), (0.035, z), (0.045, z + 0.03),
                                                 (0.03, z + 0.04)], cx=0, cy=-0.33)
        K.map_faces(bm, sp['sides'], R('PORCELAIN')); K.nobevel(bm, sp['sides'])
    # telecom hanger + riser cable down the back of the pole, guard pipe at the foot
    hg = K.box(bm, -0.02, 0.02, -0.42, -r_at(6.0) + 0.02, 5.93, 6.0)
    K.map_faces(bm, hg.values(), galv)
    if lod == 0:
        ry = r_at(3.0) + 0.05
        pts = [(0, -0.40, 5.95), (0.15, -0.2, 5.8), (0.2, 0.05, 5.6), (0.0, r_at(5.2) + 0.05, 5.2),
               (0.0, r_at(2.0) + 0.05, 2.0), (0.0, R0 + 0.05, 0.0)]
        sd, _, _ = K.tube_path(bm, pts, 0.018, 6)
        K.map_faces(bm, sd, R('CABLE')); K.nobevel(bm, sd)
        gp, _, c1 = K.tube_path(bm, [(0, R0 + 0.05, 0.0), (0, r_at(2.0) + 0.05, 2.0)], 0.035, 8, cap1=True)
        K.map_faces(bm, gp + [c1], R('PLASTIC_GREY'))
        for z in (1.0, 3.5, 4.8):   # clamp bands
            cl = K.lathe(bm, n, [(r_at(z) + 0.004, z - 0.02), (r_at(z) + 0.004, z + 0.02)],
                         cap_bottom=False, cap_top=False)
            K.map_faces(bm, cl['sides'], galv); K.nobevel(bm, cl['sides'])
        # step bolts, alternating sides, away from the street
        z = 2.4; k = 0
        while z < 9.6:
            a = math.radians(55 if k % 2 == 0 else 125)
            d = Vector((math.cos(a), math.sin(a), 0))
            p0 = d * (r_at(z) - 0.02) + Vector((0, 0, z)); p1 = d * (r_at(z) + 0.2) + Vector((0, 0, z))
            sd, _, c1 = K.tube_path(bm, [p0, p1, p1 + Vector((0, 0, 0.03))], 0.011, 4, cap1=True)
            K.map_faces(bm, sd + [c1], R('STEEL')); K.nobevel(bm, sd + [c1])
            z += 0.45; k += 1
        # number plate on the street side
        pr = r_at(2.05)
        pl = K.box(bm, -0.055, 0.055, -pr - 0.012, -pr + 0.03, 1.95, 2.17, skip=('+y',))
        K.map_faces(bm, [pl['-y']], R('POLE_PLATE'))
        K.map_faces(bm, [pl[k_] for k_ in pl if k_ != '-y'], R('PAINT_WHITE'))
    # street lamp (bōhan-tō): curved arm, flat LED head
    pts = [(0, -r_at(4.6) + 0.02, 4.55), (0, -0.45, 4.62), (0, -0.8, 4.72), (0, -0.95, 4.75)]
    sd, _, _ = K.tube_path(bm, pts, 0.022, 6)
    K.map_faces(bm, sd, R('PAINT_GREY'))
    head = K.box(bm, -0.09, 0.09, -1.18, -0.88, 4.70, 4.78)
    K.map_faces(bm, [head[k_] for k_ in head if k_ != '-z'], R('PAINT_GREY'))
    if lod == 0:
        led, _ = K.recess(bm, head['-z'], 0.02, 0.008)
        K.map_faces(bm, [led], R('LED_COOL'))
        K.map_faces(bm, _, R('PAINT_GREY'))
    else:
        K.map_faces(bm, [head['-z']], R('LED_COOL'))
    if variant == 'Guy':
        top, anchor = Vector((0, 0.0, 8.0)), Vector((-4.2, 0.0, 0.0))
        sd, _, _ = K.tube_path(bm, [top, anchor], 0.009, 4)
        K.map_faces(bm, sd, R('CABLE')); K.nobevel(bm, sd)
        d = (top - anchor).normalized()
        gd, c0, c1 = K.tube_path(bm, [anchor + d * 0.05, anchor + d * 2.3], 0.04, 8, cap1=True)
        K.map_faces(bm, gd + [c1], R('YELLOW'))
        an = K.box(bm, -4.32, -4.08, -0.12, 0.12, -0.05, 0.06)
        K.map_faces(bm, an.values(), R('CONCRETE_CAP'))
    return bm


VARIANTS = ('Transformer', 'Plain', 'Guy')


def build_variant(variant, lods=(0, 1)):
    name = f'{NAME}_{variant}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', _geo(lod, variant), col, [mat], bevel=0.006 if lod == 0 else 0.0,
                          hidden=lod > 0) for lod in lods]
    K.collider_box(f'COL_{name}', col, -R0, R0, -R0, R0, 0, H)
    for kind, pts in (('HV', HV), ('LV', LV), ('TEL', TEL)):
        for i, p in enumerate(pts):
            e = K.marker(f'CABLE_{kind}_{i}_{variant}', col, p)
    K.light_marker(f'LIGHT_{name}', col, (0, -1.03, 4.55), color=(0.9, 0.95, 1.0), watts=25, unity_range=8.0)
    return col, objs


def build():
    return [build_variant(v) for v in VARIANTS]


def preview(results, views):
    """Mood: three poles with 30 m spans between them; neutral/clay: the transformer pole."""
    from kit import preview as P
    from props import power_line as PL
    by = {c.name: (c, o) for c, o in results}
    row = [by[f'{NAME}_Guy'], by[f'{NAME}_Transformer'], by[f'{NAME}_Plain']]
    for i, (col, _) in enumerate(row):
        for o in col.objects:
            o.location.x += (i - 1) * 30.0
    spans = PL.build_span(30, name='PowerLine_Preview')
    for o in spans[0].objects:
        o.location.x -= 30.0
    spans2 = PL.build_span(30, name='PowerLine_Preview2')
    objs = [o[0] for _, o in row]
    show = [c.name for c, _ in row] + [spans[0].name, spans2[0].name]
    a = P.render(objs + spans[1][:1] + spans2[1][:1], NAME + '_street', [('mood', (-0.3, -1.0, 0.1), True)],
                 size=(960, 640), show=show)
    for i, (col, _) in enumerate(row):
        for o in col.objects:
            o.location.x -= (i - 1) * 30.0
    for c in (spans[0], spans2[0]):
        for o in list(c.objects):
            K.bpy.data.objects.remove(o, do_unlink=True)
    tr = by[f'{NAME}_Transformer']
    b = P.render(tr[1][:1], NAME, [v for v in views if v[2] is not True and v[2] != 'clay'], size=(420, 900),
                 show=[tr[0].name])
    c = P.render(tr[1][:1], NAME + '_clay', [v for v in views if v[2] == 'clay'], size=(420, 900), show=[tr[0].name])
    return f'{a}, {b}, {c}'
