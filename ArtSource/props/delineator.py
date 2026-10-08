"""Roadside delineators (shisen yūdō-hyō) the Japanese way.

Delineator_White / _Orange: white steel post (60.5 mm) driven into a small
concrete pad, a reflector unit on top: round 100 mm prism reflector in a
black housing, double-sided (the road sees one from each direction), held
by a band clamp with bolted lugs. White on the left road edge, orange on
the median / right edge. Top at 1.0 m (map placeholder 0.15 x 1.0 m).
SnowPole: fixed snow pole of the snow country (Gassho valley, passes):
4.6 m post, an arm over the road edge carrying the red-and-white arrow
plate (yabane) pointing down at the edge, a delineator at 1.1 m.
PostCone: flexible orange post cone with two white reflective bands on a
black rubber foot bolted to the asphalt (centre lines, junctions).
Front (-Y) faces the road; reflectors face along X (both ways).
"""
import math
from mathutils import Vector
from kit import core as K
from props import scatter_kit as S

KLASS = 'props'
NAME = 'Delineator'
ATLAS = 'Scatter'
R_POST = 0.03


def reflector(c, x, y, z, lens, r=0.05):
    """Double-sided reflector unit on a post top: housing ring, two lenses
    facing +-X, a stem down into the post with a band clamp."""
    n = 12 if c.lod == 0 else 8
    for sx in (-1, 1):
        S.disc(c, (x + sx * 0.022, y, z), r + 0.008, (sx, 0, 0), n, 'PLASTIC_BLACK', 'PLASTIC_BLACK', t=0.022)
        S.disc(c, (x + sx * 0.026, y, z), r, (sx, 0, 0), n, lens, 'PLASTIC_BLACK', t=0.004)
    stem = K.lathe(c.bm, 6, [(0.016, z - 0.15), (0.016, z - r)], cx=x, cy=y, cap_bottom=False, cap_top=False)
    c.m(stem['sides'], 'STEEL_DARK'); c.nb(stem['sides'])


def _post(c, lens):
    S.pad(c, 0, 0, 0.22, 0.22, h=0.03)
    S.post(c, 0, 0, 0.0, 0.86, R_POST, 'PAINT_WHITE', cap='flat', cap_reg='PLASTIC_BLACK')
    S.band(c, 0, 0, 0.82, R_POST, ear=(0, 1, 0))
    reflector(c, 0, 0, 0.94, lens)


def _snow_pole(c):
    lod = c.lod
    S.pad(c, 0, 0, 0.35, 0.35, h=0.05)
    S.anchor_bolts(c, 0, 0, 0.05, 0.12)
    if lod == 0:   # base plate with four bolts
        b = c.box(S.F(Vector((0, 0, 0)), (0, -1)), -0.13, 0.13, 0.05, 0.065, -0.13, 0.13, 'GALV', skip=('bot',))
    S.post(c, 0, 0, 0.05, 4.6, 0.038, 'PAINT_WHITE', cap='dome', cap_reg='GALV')
    # arm over the road edge (-Y) and the arrow plate hanging from it, pointing down
    arm = [(0, 0, 4.45), (0, -0.55, 4.45)]
    c.tube(arm, 0.024, 6 if lod == 0 else 4, 'GALV', caps=True)
    if lod == 0:
        c.tube([(0, -0.02, 4.1), (0, -0.4, 4.43)], 0.012, 4, 'GALV')    # brace
    S.band(c, 0, 0, 4.45, 0.038, ear=(1, 0, 0))
    S.plate(c, (0, -0.55, 3.82), 0.32, 1.2, (1, 0, 0), 'YABANE', 'YABANE', t=0.006, edge='PAINT_WHITE')
    if lod == 0:
        for z in (4.32, 3.4):   # plate clamps on a short hanger
            c.box(S.F(Vector((0, -0.55, 0)), (1, 0, 0)), -0.03, 0.03, z, z + 0.04, -0.012, 0.01, 'GALV')
            S.bolt(c, (0.012, -0.55, z + 0.02), (1, 0, 0), r=0.008)
        c.tube([(0, -0.55, 4.43), (0, -0.55, 4.36)], 0.01, 4, 'GALV')
    reflector(c, 0, 0, 1.12, 'REFLECTOR_WHITE')
    S.band(c, 0, 0, 1.0, 0.038, ear=(0, 1, 0))


def _post_cone(c):
    lod = c.lod
    n = 12 if lod == 0 else 6
    foot = K.lathe(c.bm, n, [(0.15, 0.0), (0.15, 0.025), (0.11, 0.05), (0.06, 0.06)], cap_bottom=False, cap_top=False)
    c.m(foot['sides'], 'PLASTIC_BLACK')
    S.anchor_bolts(c, 0, 0, 0.03, 0.12, n=3, phase=0.3)
    bands = [(0.06, 0.06, 'CONE_ORANGE'), (0.052, 0.48, 'REFLECTOR_WHITE'), (0.05, 0.56, 'CONE_ORANGE'),
             (0.048, 0.64, 'REFLECTOR_WHITE'), (0.046, 0.72, 'CONE_ORANGE'), (0.045, 0.8, None)]
    for (r0, z0, reg), (r1, z1, _) in zip(bands, bands[1:]):
        s = K.lathe(c.bm, n, [(r0, z0), (r1, z1)], cap_bottom=False, cap_top=False)
        c.m(s['sides'], reg)
    top = K.lathe(c.bm, n, [(0.045, 0.8), (0.03, 0.81), (0.0, 0.815)], cap_bottom=False, cap_top=False)
    c.m(top['sides'], 'CONE_ORANGE'); c.nb(top['sides'])


VARIANTS = {
    'Delineator_White': (lambda c: _post(c, 'REFLECTOR_WHITE'), (-0.06, 0.06, -0.06, 0.06, 0.0, 1.0)),
    'Delineator_Orange': (lambda c: _post(c, 'REFLECTOR'), (-0.06, 0.06, -0.06, 0.06, 0.0, 1.0)),
    'SnowPole': (_snow_pole, (-0.08, 0.08, -0.08, 0.08, 0.0, 4.6)),
    'PostCone': (_post_cone, (-0.08, 0.08, -0.08, 0.08, 0.0, 0.8)),
}


def build():
    mat = K.atlas_material(ATLAS)
    return [S.build_lods(k, fn, mat, [('', *cb)]) for k, (fn, cb) in VARIANTS.items()]


def preview(results, views):
    return S.lineup(results, NAME, views, gap=0.6)
