"""Overhead line span between two utility poles (props/utility_pole.py).

Wires hang from the pole's CABLE_ points at x = 0 to the same points at
x = L: three high-voltage wires, three low-voltage wires and a thick telecom
cable bundle with a splice closure. Sag grows with the span (HV 1.5 %,
LV 2 %, telecom 2.5 % of L). Exported spans: 20, 30, 40 m - in Unity the
same curve can also be built at runtime from two poles' CABLE_ points.
"""
from mathutils import Vector
from kit import core as K, atlas as A
from props import utility_pole as UP

KLASS = 'props'
NAME = 'PowerLine'
ATLAS = 'Street'
SPANS = (20, 30, 40)


def _geo(L, lod):
    bm = K.new_bm()
    R = lambda n: A.region(ATLAS, n)
    segs = 12 if lod == 0 else 6
    for kind, pts, sag, r, n in (('HV', UP.HV, 0.015, 0.009, 4), ('LV', UP.LV, 0.02, 0.012, 4),
                                 ('TEL', UP.TEL, 0.025, 0.024, 6 if lod == 0 else 4)):
        for p in pts:
            curve = K.catenary(p, Vector(p) + Vector((L, 0, 0)), sag * L, segs)
            sd, _, _ = K.tube_path(bm, curve, r, n)
            K.map_faces(bm, sd, R('CABLE')); K.nobevel(bm, sd)
            if kind == 'TEL' and lod == 0:   # splice closure a third along the span
                i = segs // 3
                a, b = curve[i] - (curve[i + 1] - curve[i]) * 0.4, curve[i] + (curve[i + 1] - curve[i]) * 0.4
                cl, c0, c1 = K.tube_path(bm, [a, b], 0.07, 8, cap0=True, cap1=True)
                K.map_faces(bm, cl + [c0, c1], R('PLASTIC_BLACK'))
    return bm


def build_span(L, name=None, lods=(0, 1)):
    name = name or f'{NAME}_Span{L}'
    col = K.collection(name)
    mat = K.atlas_material(ATLAS)
    objs = [K.mesh_object(f'SM_{name}_LOD{lod}', _geo(L, lod), col, [mat], hidden=lod > 0) for lod in lods]
    return col, objs


def build():
    return [build_span(L) for L in SPANS]


def preview(results, views):
    return 'see UtilityPole_street.png'
