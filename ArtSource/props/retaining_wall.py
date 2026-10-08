"""Retaining walls of Japanese mountain roads (yōheki), 8.4 m modules
along X, road side -Y, chained end to end.

Wall_Concrete_8m: cast-in-place gravity wall, 2.05 m above the road
(map placeholder 8.42 x 2.05 x 0.44 m): top 0.44 m, front battered 1:0.1;
formwork panels and P-con tie holes in the texture, an expansion joint with
dark filler at the module end, two staggered rows of PVC weep pipes
(mizunuki, 75 mm) sticking out with dark run-off stains below them.
Wall_Kenchi_8m: kenchi-block wall laid diagonally, batter 1:0.4, concrete
foot and crown, weep pipes through the blocks.
Wall_Norimen_8m: cut slope 1:0.8, 6 m high, with a concrete lattice frame
(nori-waku, 0.3 m beams at 2 m) planted with grass, ground-anchor heads at
the crossings, a 0.5 m toe wall and a U-ditch with grating along the road,
a crown ditch at the top.
"""
import math
from mathutils import Vector
from kit import core as K
from buildings.koedo_kit import orient
from props import scatter_kit as S

KLASS = 'props'
NAME = 'RetainingWall'
ATLAS = 'Scatter'
L = 8.4
H = 2.05


def quad(c, pts, reg, out, **kw):
    f = c.bm.faces.new([c.bm.verts.new(p) for p in pts])
    f.normal_update()
    if f.normal.dot(Vector(out)) < 0:
        f.normal_flip()
    c.m([f], reg, **kw)
    return f


def weep(c, x, z, y_face, n_face, stain=0.55):
    """PVC weep pipe through a wall face (outward normal n_face), sticking out
    6 cm, dark bore, a dark run-off stain on the face below it."""
    n = Vector(n_face).normalized()
    p = Vector((x, y_face, z))
    k = 8 if c.lod == 0 else 4
    s = K.lathe(c.bm, k, [(0.045, -0.05), (0.045, 0.06), (0.036, 0.06), (0.036, -0.02)], cap_bottom=False, cap_top=True)
    q = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    for v in {v for r in s['rings'] for v in r}:
        v.co = p + (q @ v.co.to_4d()).to_3d()
    c.m(s['sides'][:k], 'PVC_GREY'); c.m(s['sides'][k:] + [s['top']], 'BLACK'); c.nb(s['sides'] + [s['top']])
    if c.lod == 0 and stain:
        # stain: a tapered sheet 3 mm proud of the face, running down from the pipe
        t = Vector((1, 0, 0))
        down = n.cross(t).normalized()
        if down.z > 0:
            down = -down
        o = p + n * 0.003
        pts = [o + t * 0.07, o - t * 0.07, o - t * 0.1 + down * stain, o + t * 0.1 + down * stain]   # widening run-off
        quad(c, pts, 'CONC_DARK', n)


def concrete(c):
    lod = c.lod
    yb, yt = 0.22, -0.22                 # back face, top front edge
    yf = yt - 0.1 * H                     # foot of the battered front
    xa, xb = -L / 2, L / 2
    xj = xb - (0.02 if lod == 0 else 0.0)
    front = quad(c, [(xa, yf, -0.1), (xj, yf, -0.1), (xj, yt, H), (xa, yt, H)], 'WALL_CONC', (0, -1, 0.1), z0=0.0)
    if lod == 0:   # expansion joint: dark filler 2 cm wide, 1 cm deep
        quad(c, [(xj, yf + 0.01, -0.1), (xb, yf + 0.01, -0.1), (xb, yt + 0.01, H), (xj, yt + 0.01, H)], 'BLACK', (0, -1, 0.1))
        quad(c, [(xj, yf, -0.1), (xj, yt, H), (xj, yt + 0.01, H), (xj, yf + 0.01, -0.1)], 'CONC_DARK', (1, 0, 0))
    top = quad(c, [(xa, yt, H), (xb, yt, H), (xb, yb, H), (xa, yb, H)], 'WALL_CONC', (0, 0, 1))
    back = quad(c, [(xa, yb, -0.1), (xa, yb, H), (xb, yb, H), (xb, yb, -0.1)], 'CONC_FLAT', (0, 1, 0))
    for x, sx in ((xa, -1), (xb, 1)):
        quad(c, [(x, yf, -0.1), (x, yb, -0.1), (x, yb, H), (x, yt, H)], 'WALL_CONC', (sx, 0, 0), z0=0.0)
    c.nb([back])
    nf = Vector((0, -1, 0.1)).normalized()
    for row, z in enumerate((0.45, 1.2)):
        for x in ((-3.15, -1.05, 1.05, 3.15) if row == 0 else (-2.1, 0.0, 2.1)):
            weep(c, x, z, yt - 0.1 * (H - z), nf, stain=0.4 if row == 0 else 0.7)


def kenchi(c):
    lod = c.lod
    xa, xb = -L / 2, L / 2
    batter = 0.4
    yt = -0.15                            # top front edge of the blocks
    zf = 0.25                             # top of the concrete foot
    yf = yt - batter * (H - 0.15 - zf)
    zc = H - 0.15                         # crown concrete from here up
    quad(c, [(xa, yf, zf), (xb, yf, zf), (xb, yt, zc), (xa, yt, zc)], 'KENCHI', (0, -1, batter), z0=zf)
    # crown (tenba concrete): 0.15 high, 0.35 deep, 2 cm proud of the blocks
    fr = S.F(Vector((0, 0, 0)), (0, -1))
    b = c.box(fr, xa, xb, zc, H, -0.3, -yt + 0.02, None, skip=('l', 'r', 'bot', 'in'), bevel=True)
    c.m([b['out']], 'WALL_CONC', z0=zc); c.m([b['top']], 'CONC_FLAT')
    # foot: concrete footing 0.35 high (0.1 below grade), 0.15 proud of the blocks
    b = c.box(fr, xa, xb, -0.1, zf, 0.1, -yf + 0.15, None, skip=('l', 'r', 'bot', 'in'), bevel=True)
    c.m([b['out']], 'WALL_CONC', z0=0.0); c.m([b['top']], 'CONC_FLAT')
    under = quad(c, [(xa, yf, zf), (xa, yf - 0.15, zf), (xb, yf - 0.15, zf), (xb, yf, zf)], 'CONC_FLAT', (0, 0, 1))
    for x, sx in ((xa, -1), (xb, 1)):   # ends (a run of modules shows only the last one)
        quad(c, [(x, yf - 0.15, -0.1), (x, 0.3, -0.1), (x, 0.3, H), (x, yt - 0.02, H), (x, yt - 0.02, zc),
                 (x, yf, zf), (x, yf - 0.15, zf)], 'CONC_FLAT', (sx, 0, 0))
    quad(c, [(xa, 0.3, -0.1), (xa, 0.3, H), (xb, 0.3, H), (xb, 0.3, -0.1)], 'CONC_FLAT', (0, 1, 0))
    quad(c, [(xa, yt - 0.02, H), (xb, yt - 0.02, H), (xb, 0.3, H), (xa, 0.3, H)], 'CONC_FLAT', (0, 0, 1))
    nf = Vector((0, -1, batter)).normalized()
    for x in (-3.0, -1.0, 1.0, 3.0):
        z = 0.75 if (x + 3.0) % 4 < 1 else 1.25
        weep(c, x, z, yt - batter * (zc - z), nf, stain=0.45)


A_SLOPE = math.atan2(1.0, 0.8)           # 1:0.8 cut slope, ~51 deg
TOE = 0.5
HS = 5.5                                  # slope rise above the toe wall


def norimen(c):
    lod = c.lod
    xa, xb = -L / 2, L / 2
    run = 0.8 * HS
    sv = Vector((0, 0.8, 1.0)).normalized()          # up the slope
    nv = Vector((0, -1.0, 0.8)).normalized()          # out of the slope
    o = Vector((0, 0.0, TOE))                         # foot of the slope (behind the toe wall)
    P = lambda x, s, d=0.0: Vector((x, 0, 0)) + o + sv * s + nv * d
    Ls = HS / math.sin(A_SLOPE)
    beam, bh = 0.3, 0.3
    xs = [-3.0, -1.0, 1.0, 3.0]
    ss = [0.0, 1.85, 3.7, 5.55, Ls]
    # planted cells: the slope surface between the beams (one face per cell, mapped up the slope)
    ux = [xa] + [v for x in xs for v in (x - beam / 2, x + beam / 2)] + [xb]
    us = [0.0] + [v for s in ss[1:-1] for v in (s - beam / 2, s + beam / 2)] + [Ls]
    for i in range(0, len(ux), 2):
        for j in range(0, len(us), 2):
            f = quad(c, [P(ux[i], us[j]), P(ux[i + 1], us[j]), P(ux[i + 1], us[j + 1]), P(ux[i], us[j + 1])], 'GRASS', nv,
                     z0=P(0, us[j]).z)
            c.nb([f])
    # slope surface under the beams (keeps the slope closed where a beam sits)
    for i in range(1, len(ux) - 1, 2):
        for j in range(0, len(us) - 1):
            quad(c, [P(ux[i], us[j]), P(ux[i + 1], us[j]), P(ux[i + 1], us[j + 1]), P(ux[i], us[j + 1])], 'CONC_FLAT', nv)
    for j in range(1, len(us) - 1, 2):
        for i in range(0, len(ux) - 1, 2):
            quad(c, [P(ux[i], us[j]), P(ux[i + 1], us[j]), P(ux[i + 1], us[j + 1]), P(ux[i], us[j + 1])], 'CONC_FLAT', nv)

    def bar(x0, x1, s0, s1):
        """Frame beam as a box standing out of the slope (no bottom)."""
        corners = {(a, b, d): P(x, s, dd) for a, x in enumerate((x0, x1)) for b, s in enumerate((s0, s1))
                   for d, dd in enumerate((0.0, bh))}
        faces = []
        for key, q in {'top': [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], 'l': [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)],
                       'r': [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], 'lo': [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],
                       'hi': [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]}.items():
            faces.append(c.bm.faces.new([c.bm.verts.new(corners[k]) for k in q]))
        orient(faces, P((x0 + x1) / 2, (s0 + s1) / 2, bh / 2))
        for f in faces:
            c.m([f], 'CONC_FLAT')
        return faces
    for x in xs:
        bar(x - beam / 2, x + beam / 2, 0.0, Ls)
    for s in ss[1:-1]:
        segs = [xa] + [v for x in xs for v in (x - beam / 2, x + beam / 2)] + [xb]
        for i in range(0, len(segs), 2):
            bar(segs[i], segs[i + 1], s - beam / 2, s + beam / 2)
        if lod == 0:   # ground-anchor heads at the crossings: concrete block + steel cap on a bearing plate
            for x in xs:
                c0 = P(x, s, bh)
                fr = S.F(Vector((0, 0, 0)), (0, -1))
                k = K.lathe(c.bm, 8, [(0.08, 0.0), (0.08, 0.1), (0.06, 0.13), (0.0, 0.14)], cap_bottom=False, cap_top=False)
                pl = K.lathe(c.bm, 4, [(0.2, -0.01), (0.2, 0.02)], phase=math.pi / 4, cap_bottom=False)
                q = nv.to_track_quat('Z', 'Y').to_matrix()
                for st, reg in ((k, 'GALV'), (pl, 'STEEL_DARK')):
                    for v in {v for r in st['rings'] for v in r}:
                        v.co = c0 + q @ v.co
                    fs = st['sides'] + ([st['top']] if st['top'] else [])
                    c.m(fs, reg); c.nb(fs)
    # toe wall (0.5 m) and the U-ditch in front of it, grating every other metre
    fr = S.F(Vector((0, 0, 0)), (0, -1))
    b = c.box(fr, xa, xb, -0.1, TOE, 0.0, 0.3, None, skip=('l', 'r', 'bot', 'in'), bevel=True)
    c.m([b['out']], 'WALL_CONC', z0=0.0); c.m([b['top']], 'CONC_FLAT')
    # U-ditch (u-jikō) between the toe wall and the road edge: outer kerb, dark water, gratings
    c.box(fr, xa, xb, -0.1, 0.02, 0.7, 0.78, 'CONC_FLAT', skip=('l', 'r', 'bot'), bevel=True)
    quad(c, [(xa, -0.7, -0.3), (xb, -0.7, -0.3), (xb, -0.3, -0.3), (xa, -0.3, -0.3)], 'WATER', (0, 0, 1))
    quad(c, [(xa, -0.7, -0.3), (xa, -0.7, 0.02), (xb, -0.7, 0.02), (xb, -0.7, -0.3)], 'CONC_DARK', (0, 1, 0))
    quad(c, [(xa, -0.3, -0.3), (xb, -0.3, -0.3), (xb, -0.3, -0.1), (xa, -0.3, -0.1)], 'CONC_DARK', (0, -1, 0))
    if lod == 0:
        for x in (-3.5, -1.5, 0.5, 2.5):   # galvanised gratings over the ditch (grēchingu)
            c.box(fr, x, x + 1.0, -0.02, 0.0, 0.3, 0.7, 'GALV')
            for k in range(1, 10):
                c.box(fr, x + k * 0.1 - 0.006, x + k * 0.1 + 0.006, -0.02, 0.005, 0.3, 0.7, 'STEEL_DARK', skip=('bot',))
    # crown ditch at the top of the slope
    top = P(0, Ls)
    c.box(S.F(Vector((0, top.y, 0)), (0, -1)), xa, xb, top.z - 0.05, top.z + 0.08, -0.5, 0.0, 'CONC_FLAT', skip=('l', 'r', 'bot'), bevel=True)
    quad(c, [(xa, top.y, top.z + 0.08), (xb, top.y, top.z + 0.08), (xb, top.y + 0.5, top.z + 0.08), (xa, top.y + 0.5, top.z + 0.08)],
         'CONC_DARK', (0, 0, 1))


VARIANTS = {
    'Wall_Concrete_8m': (concrete, [('', -L / 2, L / 2, -0.43, 0.22, 0.0, H)]),
    'Wall_Kenchi_8m': (kenchi, [('', -L / 2, L / 2, -0.95, 0.3, 0.0, H)]),
    'Wall_Norimen_8m': (norimen, [('_Toe', -L / 2, L / 2, -0.78, 0.0, -0.3, TOE),
                                   ('_Slope', -L / 2, L / 2, 0.0, 0.8 * HS, 0.0, TOE + HS)]),
}


def build():
    mat = K.atlas_material(ATLAS)
    return [S.build_lods(k, fn, mat, cb) for k, (fn, cb) in VARIANTS.items()]


def preview(results, views):
    return S.lineup(results, NAME, views, gap=1.0, size=(1200, 480))
