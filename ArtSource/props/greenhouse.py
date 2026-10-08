"""Plastic greenhouse (binīru hausu), the pipe house of every Japanese
farm: galvanised arch pipes every metre, milky film over them held down by
black house bands (one between every two arches, the film bulges between
them), a sliding door in the front gable, side vents opened by rolling the
film up on a pipe with a crank handle (makiage), the film edge buried in a
soil berm. 7.1 x 14.3 m, 3.6 m high (map placeholder 7.1 x 3.6 x 14.3 m).
Length along Y, door to the front (-Y).

Greenhouse_Closed: vents shut (roll pipe at the bottom).
Greenhouse_Open: vents rolled up to 1.5 m - arches, inner film, three
ridges with black mulch film and rows of plants show through.
"""
import math
from mathutils import Vector
from kit import core as K
from buildings.koedo_kit import orient
from props import scatter_kit as S

KLASS = 'props'
NAME = 'Greenhouse'
ATLAS = 'Scatter'
W2, LEN, H_SH, H = 3.55, 14.3, 1.7, 3.6
ZC = ((W2 ** 2 + H_SH ** 2) - H ** 2) / (2 * (H_SH - H))       # arch centre height (below ground)
RA = H - ZC
VENT = (0.5, 1.5)


def profile(lod):
    """(x, z, is_vent_segment_start) from the left ground over the top to the right ground."""
    a0 = math.atan2(H_SH - ZC, W2)
    n = 8 if lod == 0 else 4
    arc = [(RA * math.cos(a0 + (math.pi / 2 - a0) * i / n), ZC + RA * math.sin(a0 + (math.pi / 2 - a0) * i / n)) for i in range(n + 1)]
    right_up = [(W2, 0.0), (W2, VENT[0]), (W2, VENT[1])] + arc   # ground -> apex on +x
    left = [(-x, z) for x, z in right_up]          # left ground -> apex
    return left + right_up[::-1][1:]


def _inward(x, z):
    v = Vector((-x, 0, 1.0 - z))
    v.y = 0
    return v.normalized() if v.length else Vector((0, 0, -1))


def film(c, pts, rows, reg, offset=0.0, skip=(), inside=False, sag=0.0):
    """Film skin over the arches: rows = y positions, odd rows sag inwards
    by `sag` (the bands press the film down). skip = segment indices left open."""
    grid = []
    for k, y in enumerate(rows):
        ring = []
        for x, z in pts:
            d = offset + (sag * min(1.0, z / 0.6) if k % 2 else 0.0)
            p = Vector((x, y, z)) + _inward(x, z) * d
            ring.append(c.bm.verts.new(p))
        grid.append(ring)
    faces = []
    for k in range(len(rows) - 1):
        for i in range(len(pts) - 1):
            if i in skip:
                continue
            f = c.bm.faces.new([grid[k][i], grid[k + 1][i], grid[k + 1][i + 1], grid[k][i + 1]])
            f.normal_update()
            ref = Vector((0, f.calc_center_median().y, 1.0))
            out = f.calc_center_median() - ref
            if (f.normal.dot(out) < 0) != inside:
                f.normal_flip()
            faces.append(f)
    c.m(faces, reg, z0=0.0)
    if reg != 'FILM_FLAT':
        c.nb(faces)
    return faces


def end_wall(c, pts, y, out_sign, reg='FILM', inside=False):
    vs = [c.bm.verts.new((x, y, z)) for x, z in pts]
    f = c.bm.faces.new(vs)
    f.normal_update()
    if (f.normal.y * out_sign < 0) != inside:
        f.normal_flip()
    c.m([f], reg, z0=0.0); c.nb([f])
    return f


def arch_tube(c, pts, y, inset=0.015, r=0.0125):
    path = [Vector((x, y, z)) + _inward(x, z) * inset for x, z in pts]
    c.tube(path, r, 4, 'GALV')


def house(c, open_vents):
    lod = c.lod
    pts = profile(lod)
    nseg = len(pts) - 1
    vent_idx = (1, nseg - 2)          # segments between z 0.5 and 1.5 on both sides
    skip = vent_idx if open_vents else ()
    step = 0.5 if lod == 0 else LEN / 4   # LOD1: rows every 3.6 m (film strip is 4 m)
    rows = [-LEN / 2 + i * step for i in range(int(round(LEN / step)) + 1)]
    film(c, pts, rows, 'FILM', skip=skip, sag=0.045 if lod == 0 else 0.0)
    for y, sg in ((-LEN / 2, -1), (LEN / 2, 1)):
        end_wall(c, pts, y, sg)
    # bands over the film in the sag lines (between the arches)
    if lod == 0:
        for k in range(1, len(rows) - 1, 2):
            y = rows[k]
            for i in range(nseg):
                if i in skip:
                    continue
                (x0, z0), (x1, z1) = pts[i], pts[i + 1]
                pa = Vector((x0, 0, z0)) + _inward(x0, z0) * (0.045 * min(1.0, z0 / 0.6) - 0.006)
                pb = Vector((x1, 0, z1)) + _inward(x1, z1) * (0.045 * min(1.0, z1 / 0.6) - 0.006)
                q = [c.bm.verts.new((p.x, y + dy, p.z)) for p, dy in ((pa, -0.022), (pb, -0.022), (pb, 0.022), (pa, 0.022))]
                f = c.bm.faces.new(q)
                orient([f], Vector((0, y, 1.0)))
                c.m([f], 'BAND_BLACK'); c.nb([f])
    # end arches (outside the gables) and the roll-up pipes with crank boxes
    for y in (-LEN / 2 - 0.02, LEN / 2 + 0.02):
        arch_tube(c, pts, y, inset=-0.02)
    zr = VENT[1] if open_vents else VENT[0] + 0.04
    rr = 0.055 if open_vents else 0.03
    for sx in (-1, 1):
        c.tube([(sx * (W2 + 0.04), -LEN / 2 + 0.05, zr), (sx * (W2 + 0.04), LEN / 2 - 0.05, zr)], rr, 6 if lod == 0 else 4,
               'FILM_ROLL' if open_vents else 'GALV', caps=True)
        if lod == 0:   # crank gearbox at the front end, handle hanging down
            g = c.box(S.F(Vector((sx * (W2 + 0.04), -LEN / 2 - 0.08, 0)), (0, -1)), -0.07, 0.07, zr - 0.08, zr + 0.06, -0.05, 0.05, 'STEEL_DARK')
            c.tube([(sx * (W2 + 0.04), -LEN / 2 - 0.14, zr), (sx * (W2 + 0.04), -LEN / 2 - 0.14, zr - 0.55)], 0.012, 4, 'GALV')
            c.tube([(sx * (W2 + 0.04), -LEN / 2 - 0.14, zr - 0.55), (sx * (W2 + 0.18), -LEN / 2 - 0.14, zr - 0.55)], 0.014, 4, 'PLASTIC_BLACK')
    # soil berm burying the film edge along both sides
    for sx in (-1, 1):
        fr = S.F(Vector((sx * W2, 0, 0)), (sx, 0))
        b = c.box(fr, -LEN / 2 - 0.1, LEN / 2 + 0.1, 0.0, 0.1, -0.02, 0.22, None, skip=('bot', 'in'))
        c.m(list(b.values()), 'SOIL')
    # front gable: door frame (pipes), two sliding film doors on a top rail, posts
    yf = -LEN / 2 - 0.03
    if True:
        frame = [(-0.9, yf, 0.0), (-0.9, yf, 2.0), (0.9, yf, 2.0), (0.9, yf, 0.0)]
        c.tube(frame, 0.016, 4, 'GALV')
        c.tube([(-1.0, yf - 0.03, 2.05), (1.0, yf - 0.03, 2.05)], 0.014, 4, 'GALV')
        for x0, x1 in ((-0.9, 0.02), (-0.02, 0.9)) if not open_vents else ((-0.9, 0.02), (0.88, 1.8)):
            pnl = S.plate(c, ((x0 + x1) / 2, yf - 0.05, 1.0), x1 - x0, 1.96, (0, -1, 0), 'FILM_FLAT', 'FILM_FLAT', t=0.01, edge='GALV')
            if lod == 0:
                c.tube([(x0, yf - 0.06, 0.04), (x0, yf - 0.06, 1.98), (x1, yf - 0.06, 1.98), (x1, yf - 0.06, 0.04), (x0, yf - 0.06, 0.04)],
                       0.012, 4, 'GALV')
                c.box(S.F(Vector((0, yf - 0.07, 0)), (0, -1)), x1 - 0.12 if x0 < 0 else x0 + 0.04, x1 - 0.04 if x0 < 0 else x0 + 0.12,
                      0.95, 1.1, 0.0, 0.015, 'PLASTIC_BLACK')   # handle
    for x in (-2.0, 2.0):
        zt = ZC + math.sqrt(max(RA ** 2 - x * x, 0.0))
        for y in (yf, LEN / 2 + 0.03):
            c.tube([(x, y, 0.0), (x, y, zt - 0.05)], 0.0125, 4, 'GALV')
    c.tube([(-W2, LEN / 2 + 0.03, H_SH), (W2, LEN / 2 + 0.03, H_SH)], 0.0125, 4, 'GALV')
    # blue water barrel and two concrete blocks by the door
    if lod == 0:
        b = K.lathe(c.bm, 10, [(0.27, 0.0), (0.29, 0.1), (0.29, 0.8), (0.27, 0.88), (0.2, 0.9)], cx=1.6, cy=-LEN / 2 - 0.6)
        c.m(b['sides'] + [b['top']], 'PLASTIC_BLUE'); c.nb(b['sides'])
        for i, x in enumerate((-1.7, -1.25)):
            c.box(S.F(Vector((x, -LEN / 2 - 0.5, 0)), (0, -1)), -0.2, 0.2, 0.0, 0.15 + 0.15 * i, -0.1, 0.1, 'CONC_FLAT', skip=('bot',), bevel=True)
    if not open_vents:
        return
    # inside: inner film, arches, floor, ridges with mulch, plants
    film(c, pts, rows, 'FILM_FLAT', offset=0.03, skip=skip, inside=True)
    for y, sg in ((-LEN / 2 + 0.02, -1), (LEN / 2 - 0.02, 1)):
        end_wall(c, pts, y, sg, 'FILM_FLAT', inside=True)
    for k in range(0, len(rows), 2 if lod == 0 else 1):
        arch_tube(c, pts, rows[k], inset=0.04)
    f = c.bm.faces.new([c.bm.verts.new(p) for p in ((-W2, -LEN / 2, 0.01), (W2, -LEN / 2, 0.01), (W2, LEN / 2, 0.01), (-W2, LEN / 2, 0.01))])
    orient([f], Vector((0, 0, -1)))
    c.m([f], 'SOIL'); c.nb([f])
    import random
    r = random.Random(5)
    for xr in (-2.2, 0.0, 2.2):
        fr = S.F(Vector((xr, 0, 0)), (1, 0))
        b = c.box(fr, -LEN / 2 + 0.8, LEN / 2 - 0.8, 0.0, 0.2, -0.5, 0.5, None, skip=('bot',))
        c.m([b['top'], b['l'], b['r']], 'MULCH'); c.m([b['in'], b['out']], 'MULCH')
        y = -LEN / 2 + 1.1
        while y < LEN / 2 - 1.0:
            for dx in (-0.25, 0.25):
                p = K.lathe(c.bm, 4 if lod == 0 else 3, [(0.2, 0.2), (0.22, 0.32), (0.0, 0.5 + r.uniform(-0.05, 0.08))],
                            cx=xr + dx, cy=y + r.uniform(-0.05, 0.05), phase=r.uniform(0, 6.28), cap_bottom=False)
                c.m(p['sides'], 'CROP'); c.nb(p['sides'])
            y += 0.7 if lod == 0 else 1.4


VARIANTS = {
    'Greenhouse_Closed': lambda c: house(c, False),
    'Greenhouse_Open': lambda c: house(c, True),
}


def build():
    mat = K.atlas_material(ATLAS)
    cb = [('', -W2, W2, -LEN / 2, LEN / 2, 0.0, H)]
    return [S.build_lods(k, fn, mat, cb, bevel=0.0) for k, fn in VARIANTS.items()]


def preview(results, views):
    return S.lineup(results, NAME, views, gap=2.0, size=(1000, 480))
