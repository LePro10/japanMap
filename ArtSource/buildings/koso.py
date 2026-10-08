"""Tokyo towers 40-154 m (task 5c): office towers with glass curtain walls,
tower mansions with balcony bands, hotel towers, mixed towers with a shop
podium and a sign skin at the bottom. Atlases `Koso` (structure, facade
strips) + `KosoShop` (crown signs, H / R roof marking, hotel signs) +
`TokyoSigns` (sign skin of the mixed towers).

Every tower is data (TOWERS): footprint, height, facade kind, sections
(setbacks, chamfered corners, a different facade on the podium floors),
podium (lobby / hotel drive / shops) and crown (plant louvres, heliport or
rescue pad, crown sign, gondola, mast, aviation lights) plus a seed.

**The height is free:** every storey of every side is one quad with its own
facade strip offset (whole window modules, from the seed). The windows line
up, the lit pattern never repeats, and a 150 m tower costs ~8 triangles per
storey and side in every LOD. The triangles go into what makes the
silhouette: setbacks, fins, balcony bands, podium and crown.

LOD0 full; LOD1 without small parts (lights, gondola, sign arms, inner
balcony faces); LOD2 = the far silhouette (shaft on the outer line, crown
as louvre band, lit crown sign kept), ~10-25 % of LOD0.
"""
import math
import random
from mathutils import Vector
from kit import core as K
from kit import atlas_koso as AK
from buildings.koedo_kit import C
from buildings.tokyo_kit import F, lbox, orient
from buildings import tokyo_signs_kit as S

KLASS = 'buildings'
NAME = 'Koso'
ZV = Vector((0, 0, 1))

# sections: (start as share of the shaft storeys, inset m, chamfer m, facade kind or None)
# podium: lobby | drive (hotel porte-cochère) | shops (+ sign skin)
# crown: list of plant (louvre band), heli / rescue (roof marking), sign:<CROWNi>, gondola, mast, frame
TOWERS = {
    # the scramble tower of the prototype (44 floors, 40 x 44 m): landmark office
    'Office_Blue_150': dict(kind='CW_BLUE', W=40.0, D=40.0, H=150.0, podium='lobby',
                            sections=[(0.0, 0.0, 4.0, None), (0.55, 2.5, 4.0, None), (0.85, 5.5, 3.0, None)],
                            crown=['plant', 'heli', 'sign:CROWN1', 'gondola', 'mast'], led=True, mech=12, seed=1),
    'Office_Dark_120': dict(kind='CW_DARK', W=32.0, D=26.0, H=120.0, podium='lobby', fins=2,
                            sections=[(0.0, 0.0, 0.0, None), (0.9, 2.0, 0.0, None)],
                            crown=['plant', 'heli', 'sign:CROWN0', 'gondola'], mech=14, seed=2),
    'Hotel_105': dict(kind='HOTEL', W=26.0, D=22.0, H=105.0, podium='drive', pilasters=2,
                      sections=[(0.0, 0.0, 0.0, 'TILE'), (0.08, 1.2, 0.0, None)],
                      crown=['plant', 'sign:CROWN2', 'heli'], hotel='HOTEL', seed=3),
    'Mansion_110': dict(kind='RESI', W=28.0, D=28.0, H=110.0, podium='lobby', balcony=1.5, led=True,
                        sections=[(0.0, 0.0, 4.0, None)], crown=['frame', 'rescue'], seed=4),
    'Mansion_75': dict(kind='RESI', W=22.0, D=20.0, H=75.0, podium='lobby', balcony=1.5,
                       sections=[(0.0, 0.0, 0.0, None)], crown=['frame', 'rescue'], seed=5),
    'Office_Silver_85': dict(kind='RIBBON', W=34.0, D=30.0, H=85.0, podium='lobby', fins=4, mech=10,
                             sections=[(0.0, 0.0, 3.0, None)], crown=['plant', 'heli', 'gondola'], seed=6),
    'Mixed_Tile_70': dict(kind='TILE', W=16.0, D=22.0, H=70.0, podium='shops', signs=1.0,
                          sections=[(0.0, 0.0, 0.0, 'HOTEL'), (0.15, 1.0, 2.0, None)],
                          crown=['plant', 'rescue', 'sign:CROWN3'], seed=7),
    'Mixed_Glass_58': dict(kind='CW_BLUE', W=11.0, D=16.0, H=58.0, podium='shops', signs=1.0,
                           sections=[(0.0, 0.0, 0.0, 'TILE'), (0.2, 0.6, 0.0, None)],
                           crown=['plant', 'rescue'], seed=8),
    'Hotel_60': dict(kind='HOTEL', W=15.0, D=20.0, H=60.0, podium='drive', pilasters=1,
                     sections=[(0.0, 0.0, 0.0, None)], crown=['plant', 'rescue'], hotel='BIZ', seed=9),
    'Office_Blue_48': dict(kind='CW_BLUE', W=22.0, D=14.0, H=48.0, podium='lobby',
                           sections=[(0.0, 0.0, 0.0, None)], crown=['plant', 'rescue'], seed=10),
    'Mansion_48': dict(kind='RESI', W=16.0, D=14.0, H=48.0, podium='lobby', balcony=1.4,
                       sections=[(0.0, 0.0, 0.0, None)], crown=['frame', 'rescue'], seed=11),
    'Mixed_Tile_45': dict(kind='TILE', W=10.0, D=14.0, H=45.0, podium='shops', signs=0.8,
                          sections=[(0.0, 0.0, 0.0, None)], crown=['plant', 'rescue'], seed=12),
    # more of the same machinery for a skyline that does not repeat
    'Office_Dark_90': dict(kind='CW_DARK', W=24.0, D=20.0, H=90.0, podium='lobby', fins=3, mech=11,
                           sections=[(0.0, 0.0, 2.5, None)], crown=['plant', 'rescue', 'sign:CROWN3', 'gondola'], seed=13),
    'Office_Blue_75': dict(kind='CW_BLUE', W=26.0, D=18.0, H=75.0, podium='lobby', led=True,
                           sections=[(0.0, 0.0, 2.0, None), (0.7, 2.0, 2.0, None)], crown=['plant', 'rescue', 'gondola'],
                           seed=14),
    'Mansion_90': dict(kind='RESI', W=24.0, D=24.0, H=90.0, podium='lobby', balcony=1.5, led=True,
                       sections=[(0.0, 0.0, 3.0, None)], crown=['frame', 'rescue'], seed=15),
    'Hotel_80': dict(kind='HOTEL', W=18.0, D=24.0, H=80.0, podium='drive', pilasters=1,
                     sections=[(0.0, 0.0, 0.0, 'RIBBON'), (0.1, 1.0, 0.0, None)], crown=['plant', 'rescue', 'sign:CROWN2'],
                     hotel='HOTEL', seed=16),
    'Mixed_Ribbon_62': dict(kind='RIBBON', W=14.0, D=20.0, H=62.0, podium='shops', signs=0.9,
                            sections=[(0.0, 0.0, 0.0, 'TILE'), (0.25, 0.8, 0.0, None)], crown=['plant', 'rescue'], seed=17),
    'Office_Silver_60': dict(kind='RIBBON', W=24.0, D=16.0, H=60.0, podium='lobby', fins=3,
                             sections=[(0.0, 0.0, 0.0, None)], crown=['plant', 'rescue', 'sign:CROWN0'], seed=18),
    # fronts (task 5c): hotel and cinema of the place families 5 and 4, built
    # with the same machinery; low enough to sit in a street of 6-10 storeys
    'Biz_34': dict(prefix='Hotel', kind='HOTEL', W=11.0, D=15.0, H=34.0, podium='drive', pilasters=1,
                   sections=[(0.0, 0.0, 0.0, None)], crown=['plant'], hotel='BIZ', seed=21),
    'City_45': dict(prefix='Hotel', kind='HOTEL', W=15.0, D=18.0, H=45.0, podium='drive', pilasters=2,
                    sections=[(0.0, 0.0, 0.0, 'RIBBON'), (0.15, 0.8, 0.0, None)], crown=['plant', 'sign:CROWN2'],
                    hotel='HOTEL', seed=22),
    'Ginga_24': dict(prefix='Cinema', kind='TILE', W=10.0, D=14.0, H=24.0, podium='cinema',
                     sections=[(0.0, 0.0, 0.0, None)], crown=['plant'], seed=23),
    'Ginga_34': dict(prefix='Cinema', kind='TILE', W=13.0, D=16.0, H=34.0, podium='cinema',
                     sections=[(0.0, 0.0, 0.0, None)], crown=['plant'], seed=24),
}
POD_H = 6.0       # double-height ground storey (lobby strip)
PARAPET = 1.2


# ── geometry helpers ────────────────────────────────────────────────────────

def outline(x0, x1, y0, y1, ch):
    """Footprint corners CCW from above; chamfered corners when ch > 0."""
    if ch <= 0:
        return [Vector((x0, y0)), Vector((x1, y0)), Vector((x1, y1)), Vector((x0, y1))]
    return [Vector(p) for p in ((x0 + ch, y0), (x1 - ch, y0), (x1, y0 + ch), (x1, y1 - ch),
                                (x1 - ch, y1), (x0 + ch, y1), (x0, y1 - ch), (x0, y0 + ch))]


def _normal(a, b):
    t = (b - a).normalized()
    return Vector((t.y, -t.x, 0))


def wall_quad(c, a, b, z0, z1, d=0.0, inward=False):
    """Vertical quad on the edge a->b (outline CCW), pushed out by d."""
    n = _normal(a, b)
    pa = Vector((a.x, a.y, 0)) + n * d; pb = Vector((b.x, b.y, 0)) + n * d
    vs = [c.bm.verts.new((p.x, p.y, z)) for p, z in ((pa, z0), (pb, z0), (pb, z1), (pa, z1))]
    f = c.bm.faces.new(vs)
    f.normal_update()
    want = -n if inward else n
    if f.normal.dot(want) < 0:
        f.normal_flip()
    return f


def strip_map(c, face, kind, k_off, z0):
    """Facade strip on one storey: V from the slab, U snapped to a whole
    module at the face start plus k_off modules (the seed's shuffle)."""
    mw = AK.module_m(kind) if kind in AK.FLOORS else 1.0
    face.normal_update()
    n = face.normal
    tang = Vector((-n.y, n.x, 0)).normalized()
    s0 = min(v.co.dot(tang) for v in face.verts)
    c.m([face], kind, metric_z0=z0, s_offset=k_off * mw - s0)
    c.nb([face])


def cap(c, pts, z, reg, up=True):
    f = c.bm.faces.new([c.bm.verts.new((p.x, p.y, z)) for p in pts])
    f.normal_update()
    if (f.normal.z > 0) != up:
        f.normal_flip()
    c.m([f], reg); c.nb([f])
    return f


def ring(c, inner, outer, z, reg, up=True):
    """Flat ring between two outlines (setback roof, balcony slab). A plain
    rectangle against a chamfered one pairs each chamfer with a corner
    (triangle there)."""
    def expand(r4):   # 4 corners -> 8 points matching a chamfered outline
        return [r4[0], r4[1], r4[1], r4[2], r4[2], r4[3], r4[3], r4[0]]
    if len(inner) != len(outer):
        inner = expand(inner) if len(inner) == 4 else inner
        outer = expand(outer) if len(outer) == 4 else outer
    fs = []
    for i in range(len(inner)):
        j = (i + 1) % len(inner)
        quad = [inner[i], inner[j], outer[j], outer[i]]
        pts = []
        for p in quad:
            if not pts or (p - pts[-1]).length > 1e-4:
                pts.append(p)
        if (pts[0] - pts[-1]).length < 1e-4:
            pts.pop()
        if len(pts) < 3:
            continue
        f = c.bm.faces.new([c.bm.verts.new((p.x, p.y, z)) for p in pts])
        f.normal_update()
        if (f.normal.z > 0) != up:
            f.normal_flip()
        fs.append(f)
    c.m(fs, reg); c.nb(fs)
    return fs


def gbox(c, x0, x1, y0, y1, z0, z1, reg, skip=()):
    f = F(Vector((0, 0, 0)), (0, -1))
    return c.box(f, x0, x1, z0, z1, -y1, -y0, reg, skip=skip)


def offset(pts, d):
    """Outline pushed in by d (rectangles / chamfered rectangles stay similar)."""
    xs = [p.x for p in pts]; ys = [p.y for p in pts]
    ch = (pts[2] - pts[1]).length / math.sqrt(2) if len(pts) == 8 else 0.0
    return outline(min(xs) + d, max(xs) - d, min(ys) + d, max(ys) - d, max(0.01, ch - d * (math.sqrt(2) - 1)) if ch else 0.0)


def frame_of(a, b, z=0.0):
    """Wall frame F on edge a->b: u from a along the edge, d out."""
    n = _normal(a, b)
    f = F(Vector((a.x, a.y, z)), (n.x, n.y))
    # F.t = (-n.y, n.x): make u run from a to b
    return f, (Vector((a.x, a.y, 0)) - f.o).dot(f.t), (Vector((b.x, b.y, 0)) - f.o).dot(f.t)


# ── the plan: everything decided once (same for every LOD) ──────────────────

def _plan(spec):
    kind = spec['kind']
    mw = AK.module_m(kind)
    W = max(2, round(spec['W'] / mw)) * mw
    D = max(2, round(spec['D'] / mw)) * mw
    zp = POD_H
    crown_h = 3.0 if ('plant' in spec['crown'] or 'frame' in spec['crown']) else PARAPET
    secs = spec['sections']
    # storeys: each section's own floor height (its facade kind)
    fh = AK.FLOORS[kind]['fh']
    n = max(4, round((spec['H'] - zp - crown_h) / fh))
    starts = [min(n - 1, round(s[0] * n)) for s in secs] + [n]
    floors, z = [], zp           # (z0, z1, section index, plant floor)
    every = spec.get('mech', 0)  # intermediate plant floors (recessed louvre band) every n storeys
    for i, s in enumerate(secs):
        k = s[3] or kind
        for _ in range(starts[i + 1] - starts[i]):
            h = AK.FLOORS[k]['fh']
            j = len(floors) + 1
            mech = bool(every) and k == kind and j % every == 0 and j < n - 3
            floors.append((z, z + h, i, mech))
            z += h
    top = z
    rng = random.Random(spec['seed'])
    offs = [[rng.randrange(AK.FLOORS[secs[fl[2]][3] or kind]['n']) for _ in range(8)] for fl in floors]
    return dict(W=W, D=D, zp=zp, top=top, floors=floors, offs=offs, mw=mw, n=n, crown_h=crown_h,
                H=top + crown_h)


def _sec_outline(spec, P, i, extra=0.0):
    _, inset, ch, _ = spec['sections'][i]
    W, D = P['W'], P['D']
    b = spec.get('balcony', 0.0)
    d = inset + extra
    return outline(-W / 2 + d, W / 2 - d, -D / 2 + d, D / 2 - d, max(0.0, ch - d * 0.4) if ch else 0.0)


# ── shaft ───────────────────────────────────────────────────────────────────

def shaft(c, spec, P, lod):
    kind = spec['kind']
    b = spec.get('balcony', 0.0)
    secs = spec['sections']
    for fi, (z0, z1, si, mech) in enumerate(P['floors']):
        k = secs[si][3] or kind
        outer = _sec_outline(spec, P, si)
        bal = b and k == 'RESI'
        wall = _sec_outline(spec, P, si, b) if (bal and lod < 2) else outer
        if mech and lod < 2:
            # plant floor: louvre band set back 0.9 m - a deep shadow line up the shaft
            inner = offset(outer, 0.9)
            for ei in range(len(inner)):
                f = wall_quad(c, inner[ei], inner[(ei + 1) % len(inner)], z0, z1)
                c.m([f], 'LOUVRE', metric_z0=z0); c.nb([f])
            ring(c, inner, outer, z0, 'ROOF_GREY', up=True)
            ring(c, inner, outer, z1, 'ALU_DARK', up=False)
            continue
        for ei in range(len(wall)):
            a, bb = wall[ei], wall[(ei + 1) % len(wall)]
            f = wall_quad(c, a, bb, z0, z1)
            strip_map(c, f, k, P['offs'][fi][ei], z0)
        if bal and lod < 2:
            balcony_band(c, wall, outer, z0, lod, P['offs'][fi])
    # setback roofs between sections, and the podium roof under section 0 if inset
    for i in range(1, len(secs)):
        lo, hi = _sec_outline(spec, P, i - 1), _sec_outline(spec, P, i)
        z = next(fl[0] for fl in P['floors'] if fl[2] == i)
        ring(c, hi, lo, z, 'ROOF_GREEN' if i % 2 else 'ROOF_GREY')
        if lod < 2:
            parapet(c, lo, z, 1.1, lod)


def led_edges(c, spec, P, lod):
    """Lit LED strip down the middle of every chamfered corner (the tower's
    night signature, seen from kilometres)."""
    for si, sec in enumerate(spec['sections']):
        fl = [f for f in P['floors'] if f[2] == si]
        pts = _sec_outline(spec, P, si, spec.get('balcony', 0.0))
        if not fl or len(pts) != 8:
            continue
        for ei in range(1, 8, 2):
            fr, u0, u1 = frame_of(pts[ei], pts[(ei + 1) % 8])
            um = (u0 + u1) / 2
            c.box(fr, um - 0.15, um + 0.15, fl[0][0] + 0.3, fl[-1][1] - 0.3, 0.0, 0.12, 'LIT_COOL',
                  skip=('in',) if lod == 0 else ('in', 'top', 'bot'))


def balcony_band(c, wall, outer, z, lod, offs):
    """Balcony slab + frosted glass railing round the storey (tower mansion)."""
    for ei in range(len(outer)):
        a, bb = outer[ei], outer[(ei + 1) % len(outer)]
        f = wall_quad(c, a, bb, z, z + 1.15)
        strip_map(c, f, 'RAIL', offs[ei] % 12, z)
        if lod == 0:
            g = wall_quad(c, a, bb, z, z + 1.15, d=-0.06, inward=True)
            strip_map(c, g, 'RAIL', offs[ei] % 12, z)
    ring(c, wall, outer, z, 'SLAB_WHITE', up=False)
    if lod == 0:
        ring(c, wall, outer, z + 0.02, 'CONCRETE', up=True)


def parapet(c, pts, z, h, lod, reg='ALU'):
    """Parapet round a roof: outer face (wall continues), coping, inner face."""
    fs = []
    for ei in range(len(pts)):
        a, b = pts[ei], pts[(ei + 1) % len(pts)]
        fs.append(wall_quad(c, a, b, z, z + h))
        if lod == 0:
            fs.append(wall_quad(c, a, b, z, z + h, d=-0.25, inward=True))
    c.m(fs, 'SLAB_WHITE' if reg == 'ALU' else reg); c.nb(fs)
    if lod == 0:
        ring(c, offset(pts, 0.25), pts, z + h, reg)


def fins(c, spec, P, every, lod, depth=0.45, w=0.16, reg='ALU_DARK'):
    """Vertical fins every `every` modules over each section (curtain wall
    relief: catches the light at a grazing angle, reads from far away)."""
    secs = spec['sections']
    for si in range(len(secs)):
        fl = [f for f in P['floors'] if f[2] == si]
        if not fl or (secs[si][3] and secs[si][3] != spec['kind']):
            continue
        z0, z1 = fl[0][0], fl[-1][1]
        pts = _sec_outline(spec, P, si)
        step = P['mw'] * every
        for ei in range(len(pts)):
            a, b = pts[ei], pts[(ei + 1) % len(pts)]
            L = (b - a).length
            if L < step * 1.5:
                continue
            fr, u0, u1 = frame_of(a, b)
            k = int(L / step)
            for j in range(1, k):
                u = u0 + (u1 - u0) * (j * step) / L
                c.box(fr, u - w / 2, u + w / 2, z0, z1 + (0.6 if lod == 0 else 0.0), 0.0, depth, reg,
                      skip=('in', 'bot') if lod else ('in',))


# ── podium ──────────────────────────────────────────────────────────────────

def colonnade(c, cs, spec, a, b, ins, lod, every=7.5):
    """Front of an office / mansion lobby: glass set back `ins` behind a row
    of granite columns, lit soffit with downlights, returns at both ends,
    revolving door, push doors, the cornerstone (定礎) by the door."""
    H = POD_H
    n = _normal(a, b)
    inn = -n
    t = (b - a).normalized(); t3 = Vector((t.x, t.y, 0))
    A, B = Vector((a.x, a.y, 0)), Vector((b.x, b.y, 0))
    Ai, Bi = A + inn * ins, B + inn * ins
    bm = c.bm
    fs = []
    for p0, p1, want in ((A, Ai, t3), (Bi, B, -t3)):          # end returns
        f = bm.faces.new([bm.verts.new(v) for v in (p0, p1, p1 + ZV * H, p0 + ZV * H)])
        f.normal_update()
        if f.normal.dot(want) < 0:
            f.normal_flip()
        fs.append(f)
    c.m(fs, 'GRANITE'); c.nb(fs)
    so = bm.faces.new([bm.verts.new(v + ZV * H) for v in (A, B, Bi, Ai)])
    so.normal_update()
    if so.normal.z > 0:
        so.normal_flip()
    c.m([so], 'CANOPY'); c.nb([so])
    fr, u0, u1 = frame_of(a, b)
    L = u1 - u0
    k = max(2, round(L / every))
    for j in range(k + 1):
        u = u0 + 0.7 + (L - 1.4) * j / k
        c.box(fr, u - 0.45, u + 0.45, 0.0, H, -0.9, 0.0, 'GRANITE', skip=('top', 'bot'))
        if lod == 0 and j < k:
            for i in range(3):
                uu = u + (L - 1.4) / k * (i + 1) / 4
                c.box(fr, uu - 0.2, uu + 0.2, H - 0.04, H, -ins * 0.55 - 0.2, -ins * 0.55 + 0.2, 'LIT_WARM', skip=('top',))
    um = (u0 + u1) / 2
    dr = c.box(fr, um - 1.5, um + 1.5, 0.12, 2.75, -ins, -ins + 0.9, 'ALU', skip=('in',))
    c.m([dr['out']], 'GLASS_DARK')
    if lod == 0:
        c.box(fr, um - 1.6, um + 1.6, 2.75, 3.0, -ins, -ins + 1.2, 'ALU_DARK', skip=('in',))   # door hood
        q = cs.box(fr, um - 3.0, um - 2.4, 1.2, 1.8, -ins, -ins + 0.02, None, skip=('in', 'top', 'bot', 'l', 'r'))
        cs.m([q['out']], 'TEISO')



def podium(c, cs, sg, spec, P, lod):
    """Ground storey (0..6 m): lobby glass all round, granite back with the
    service side, entrance by type: office/mansion colonnade (the glass steps
    back behind granite columns, lit soffit, public plaza with planters,
    benches and the building's name stone), hotel drive (porte-cochère) or
    shop fronts with the sign skin above."""
    W, D = P['W'], P['D']
    pts = _sec_outline(spec, P, 0)
    p = spec['podium']
    # the entrance steps back under the building (everything stays on the lot:
    # the game puts the front on the building line, the street starts there)
    ins = {'lobby': 2.4, 'drive': 7.0}.get(p, 0.0) if lod < 2 else 0.0
    for ei in range(len(pts)):
        a, b = pts[ei], pts[(ei + 1) % len(pts)]
        n = _normal(a, b)
        front = n.y < -0.7
        f = wall_quad(c, a, b, 0.0, POD_H, d=-ins if front else 0.0)
        if n.y > 0.7 and p != 'shops':     # back: service side in granite
            c.m([f], 'GRANITE'); c.nb([f])
        else:
            strip_map(c, f, 'LOBBY', ei * 5 + spec['seed'], 0.0)
        if front and ins:
            colonnade(c, cs, spec, a, b, ins, lod, every=7.5 if p == 'lobby' else 11.0)
    if lod >= 2:
        return
    fr = F(Vector((0, -D / 2, 0)), (0, -1))     # front frame: u = x, d out of the front
    fb = F(Vector((0, D / 2, 0)), (0, 1))       # back frame
    fsd = F(Vector((W / 2, 0, 0)), (1, 0))      # right side
    # plinth band (granite) in front
    c.box(fr, -W / 2, W / 2, 0.0, 0.12, -ins, 1.0, 'GRANITE', skip=('in', 'bot'))
    # service side: loading shutters, steel door, louvre; fire brigade inlet (送水口) on the side
    sw_ = min(4.0, W / 4)
    for u in (-W / 2 + 2.0, -W / 2 + 2.6 + sw_):
        if u + sw_ < W / 2 - 3.0:
            g = c.box(fb, u, u + sw_, 0.0, 4.4, 0.0, 0.12, 'MECH_GREY', skip=('in', 'bot'))
            c.box(fb, u - 0.1, u + sw_ + 0.1, 4.4, 4.9, 0.0, 0.5, 'ALU_DARK', skip=('in',))
    c.box(fb, W / 2 - 3.0, W / 2 - 2.0, 0.0, 2.2, 0.0, 0.06, 'ALU_DARK', skip=('in', 'bot'))
    c.box(fsd, D / 2 - 6.0, D / 2 - 2.0, 3.0, 5.0, 0.0, 0.05, 'LOUVRE', skip=('in', 'bot'))
    c.box(fsd, -D / 2 + 3.0, -D / 2 + 3.7, 0.4, 1.2, 0.0, 0.18, 'PAINT_RED', skip=('in', 'bot'))
    if lod == 0:
        for du in (0.17, 0.53):
            c.tube([fsd(-D / 2 + 3.0 + du, 0.8, 0.18), fsd(-D / 2 + 3.0 + du, 0.8, 0.32)], 0.06, 6, 'BRASS')
    if p == 'lobby':
        # planters along the front (Tokyo: on the lot edge), granite benches between the columns
        for u in (-W / 2 + 1.6, W / 2 - 1.6):
            c.box(fr, u - 0.8, u + 0.8, 0.12, 0.6, 0.15, 0.95, 'GRANITE', skip=('bot',))
            c.box(fr, u - 0.7, u + 0.7, 0.6, 1.15, 0.22, 0.88, 'PLANT', skip=('bot',))
        if W > 18 and lod == 0:
            for u in (-W / 4, W / 4):
                c.box(fr, u - 1.0, u + 1.0, 0.12, 0.55, -1.7, -1.2, 'GRANITE', skip=('bot',))
        # name stone under the colonnade: the crown sign's name, or the first crown sign
        key = next((k[5:] for k in spec['crown'] if k.startswith('sign:')), 'CROWN0')
        st = c.box(fr, W / 2 - 7.0, W / 2 - 3.0, 0.12, 1.0, -2.0, -1.5, 'GRANITE_DARK', skip=('bot',))
        q = cs.box(fr, W / 2 - 6.9, W / 2 - 3.1, 0.5, 1.0, -1.5, -1.48, None, skip=('in', 'top', 'bot', 'l', 'r'))
        cs.m([q['out']], key)
    elif p == 'drive':
        # hotel drive under the building (porte-cochère in the recess): lit soffit
        # from the colonnade, drive paving, bollards, name fascia hung at the front edge
        key = spec.get('hotel', 'HOTEL')
        sw = min(W - 3.0, 9.0)
        s_ = cs.box(fr, -sw / 2, sw / 2, 4.9, 5.7, -0.5, -0.2, None, skip=('in',))
        cs.m([s_['out']], f'{key}_FASCIA'); cs.m([s_[k] for k in ('top', 'bot', 'l', 'r')], 'FRAME_BLACK')
        c.box(fr, -W / 2 + 1.2, W / 2 - 1.2, 0.0, 0.08, -6.8, 0.0, 'TILE_FLOOR', skip=('in', 'bot'))
        if lod == 0:
            for u in (-W / 2 + 2.2, W / 2 - 2.2):
                for d in (-5.5, -1.5):
                    c.box(fr, u - 0.12, u + 0.12, 0.08, 0.95, d - 0.12, d + 0.12, 'ALU', skip=('bot',))
            c.box(fr, -sw / 2, sw / 2, 5.95, 6.0, -6.5, -1.0, 'LIT_WARM', skip=('top',))   # light cove
        tate(cs, fr, W / 2 - 0.45, 7.5, 1.5, f'{key}_TATE', 'FRAME_SILVER', lod)
    elif p == 'shops':
        shop_skin(sg, spec, P, lod)
    elif p == 'cinema':
        cinema_front(c, cs, spec, P, lod)


def tate(cs, f, u, z0, w, reg, frame, lod, thick=0.32, out=0.3):
    """Vertical name sign standing out from a corner (graphic 1:4 on both
    faces), arms with braces every 2 m."""
    h = w * 4
    t = cs.box(f, u - thick / 2, u + thick / 2, z0, z0 + h, out, out + w, None, skip=('in',))
    cs.m([t['l'], t['r']], reg); cs.m([t[k] for k in ('out', 'top', 'bot')], frame)
    for z in [z0 + 0.4 + i * 2.0 for i in range(int(h / 2.0) + 1)] if lod == 0 else (z0 + 0.4, z0 + h - 0.4):
        cs.box(f, u - 0.05, u + 0.05, z, z + 0.08, 0.0, out + 0.02, 'STEEL', skip=('in',))


def cinema_front(c, cs, spec, P, lod):
    """Cinema: marquee canopy with chaser bulbs over the doors, ticket
    windows, lit poster cases at eye level, big poster boxes up the front
    (they cover the windowless auditorium floors), the vertical name sign."""
    W, D = P['W'], P['D']
    fr = F(Vector((0, -D / 2, 0)), (0, -1))
    r = random.Random(spec['seed'])
    posters = [f'POSTER{i}' for i in range(6)]; r.shuffle(posters)
    mw = min(W - 1.0, 9.0)
    mq = cs.box(fr, -mw / 2, mw / 2, 4.2, 5.6, 0.0, 1.2, None, skip=('in',))
    cs.m([mq['out']], 'MARQUEE'); cs.m([mq['bot']], 'LIT_WARM'); cs.m([mq['top'], mq['l'], mq['r']], 'FRAME_BLACK')
    if lod == 0:
        for i in range(int(mw / 0.3)):
            u = -mw / 2 + 0.15 + i * 0.3
            cs.box(fr, u - 0.05, u + 0.05, 5.62, 5.7, 1.05, 1.15, 'BULB_WARM')
        for u in (-mw / 2 + 0.5, mw / 2 - 0.5):        # hangers
            c.tube([fr(u, 5.6, 1.0), fr(u, 6.6, 0.02)], 0.035, 4, 'ALU')
    # doors and ticket windows (dark glass, lit brass frames)
    c.box(fr, -2.0, 2.0, 0.12, 2.6, 0.0, 0.15, 'GLASS_DARK', skip=('in', 'bot'))
    for u in (-3.2, 2.4):
        if abs(u) + 0.8 < W / 2:
            tw = c.box(fr, u, u + 0.8, 0.9, 2.1, 0.0, 0.25, 'BRASS', skip=('in', 'bot'))
            c.m([tw['out']], 'LIT_WARM')
    # poster cases at eye level, both sides of the doors
    k = 0
    for u in (-W / 2 + 0.5, W / 2 - 1.6):
        pc = cs.box(fr, u, u + 1.1, 0.75, 2.4, 0.0, 0.12, None, skip=('in',))
        cs.m([pc['out']], posters[k % 6]); cs.m([pc[x] for x in ('top', 'bot', 'l', 'r')], 'FRAME_SILVER'); k += 1
    # big poster boxes over the auditorium floors (3 x 4.5 m), lit
    zs = [fl[0] for fl in P['floors']]
    fa = cs.box(fr, -mw / 2, mw / 2, 6.0, 7.1, 0.0, 0.15, None, skip=('in',))
    cs.m([fa['out']], 'CINEMA_FASCIA'); cs.m([fa[x] for x in ('top', 'bot', 'l', 'r')], 'FRAME_BLACK')
    z = POD_H + 1.6
    n = max(1, int((W - 2.4) / 3.4))
    while z + 4.5 < P['top'] - 0.5 and z < POD_H + 12:
        for i in range(n):
            u = -n * 3.4 / 2 + 0.2 + i * 3.4
            b = cs.box(fr, u, u + 3.0, z, z + 4.5, 0.15, 0.45, None, skip=('in',))
            cs.m([b['out']], posters[k % 6]); cs.m([b[x] for x in ('top', 'bot', 'l', 'r')], 'FRAME_BLACK'); k += 1
            if lod == 0:   # lamps on arms over each poster
                for uu in (u + 0.6, u + 2.4):
                    cs.tube([fr(uu, z + 4.5, 0.3), fr(uu, z + 4.9, 1.0)], 0.02, 4, 'STEEL')
                    cs.box(fr, uu - 0.15, uu + 0.15, z + 4.85, z + 4.95, 0.9, 1.2, 'LIT_WARM')
        z += 5.4
    tate(cs, fr, W / 2 - 0.45, 7.4, 1.4, 'CINEMA_TATE', 'BULB_WARM', lod)

def shop_skin(bm, spec, P, lod):
    """Sign skin of a mixed tower (TokyoSigns): lightbox per podium storey
    and bay, sign towers on the corners, standing signs, a video wall."""
    r = random.Random(spec['seed'] * 7 + 3)
    W, D = P['W'], P['D']
    dens = spec.get('signs', 1.0)
    f0 = F(Vector((0, -D / 2, 0)), (0, -1))
    f1 = F(Vector((W / 2, 0, 0)), (1, 0))
    ys = [f'Y{i:02d}' for i in range(24)]; r.shuffle(ys)
    ts = [f'T{i:02d}' for i in range(16)]; r.shuffle(ts)
    ss = [f'S{i}' for i in range(8)]; r.shuffle(ss)
    S.yoko(bm, f0, -W / 2 + 0.3, W / 2 - 0.3, 4.75, 0.95, ys.pop(), lod)
    S.yoko(bm, f1, -D / 2 + 0.3, D / 2 - 0.3, 4.75, 0.95, ys.pop(), lod)
    pod = [fl for fl in P['floors'] if fl[2] == 0][:6]
    for z0, z1, *_ in pod:
        for f, w in ((f0, W), (f1, D)):
            if r.random() < dens:
                h = r.choice([0.85, 1.05, 1.25])
                if w > 9 and r.random() < 0.5:
                    S.yoko(bm, f, -w / 2 + 0.4, -0.1, z0 + 0.15, h, ys.pop(), lod)
                    S.yoko(bm, f, 0.1, w / 2 - 0.4, z0 + 0.15, h, ys.pop(), lod)
                else:
                    S.yoko(bm, f, -w / 2 + 0.4, w / 2 - 0.4, z0 + 0.15, h, ys.pop(), lod,
                           frame=r.choice(['FRAME_BLACK', 'FRAME_SILVER', 'FRAME_WHITE']))
    ztop = pod[-1][1] if pod else POD_H + 6
    S.tower(bm, f0, W / 2 - 0.3, POD_H + 0.4, [ts.pop() for _ in range(max(1, min(3, int((ztop - POD_H) / 5.25))))], lod,
            w=1.05, bulbs=True, edge='NEON_YELLOW')
    S.tower(bm, f1, -D / 2 + 0.3, POD_H + 0.4, [ts.pop() for _ in range(max(1, min(2, int((ztop - POD_H) / 5.25))))], lod,
            w=1.05, edge='NEON_PINK')
    if W >= 12 and len(pod) >= 3:
        S.screen(bm, f0, -W / 2 + 1.5, W / 2 - 2.0, pod[1][0] + 0.3, pod[2][1] - 0.3, 'VIDEO_A', lod)
    for i in range(2):
        S.stand(bm, f0, -W / 2 + 1.5 + i * (W - 3.0), 0.6, ss.pop(), lod)


# ── crown ───────────────────────────────────────────────────────────────────

def crown(c, cs, spec, P, lod, col=None, name=None):
    secs = spec['sections']
    pts = _sec_outline(spec, P, len(secs) - 1)
    top = P['top']
    cr = spec['crown']
    xs = [p.x for p in pts]; ys = [p.y for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    roof = cap(c, pts, top, 'ROOF_GREEN' if 'frame' in cr or 'rescue' in cr else 'ROOF_GREY')
    h = P['crown_h']
    if 'plant' in cr or 'frame' in cr:
        # plant screen: louvre band flush with the facade, hides the plant
        fs = []
        for ei in range(len(pts)):
            a, b = pts[ei], pts[(ei + 1) % len(pts)]
            f = wall_quad(c, a, b, top, top + h)
            c.m([f], 'LOUVRE', metric_z0=top); c.nb([f]); fs.append(f)
            if lod < 2:
                g = wall_quad(c, a, b, top, top + h, d=-0.3, inward=True)
                c.m([g], 'MECH_GREY'); c.nb([g])
        if lod < 2:
            ring(c, offset(pts, 0.3), pts, top + h, 'ALU')
        if 'frame' in cr and lod < 2:
            # tower-mansion crown: an open frame standing 3.5 m above the screen, lit edge
            fz = top + h
            for ei in range(len(pts)):
                a, b = pts[ei], pts[(ei + 1) % len(pts)]
                fr, u0, u1 = frame_of(a, b)
                L = (b - a).length
                if L < 6:
                    continue
                c.box(fr, u0 + 0.2, u1 - 0.2, fz + 3.0, fz + 3.5, -0.6, 0.0, 'PAINT_WHITE', skip=('in',))
                for u in (u0 + 0.2, u1 - 0.8):
                    c.box(fr, u, u + 0.6, fz, fz + 3.0, -0.6, 0.0, 'PAINT_WHITE', skip=('in', 'bot'))
                if lod == 0:
                    c.box(fr, u0 + 0.8, u1 - 0.8, fz + 2.94, fz + 3.0, -0.5, -0.1, 'LIT_COOL', skip=('in', 'top'))
    elif lod < 2:
        parapet(c, pts, top, PARAPET, lod)
    if lod >= 2:
        _crown_sign(cs, spec, pts, top, h, lod)
        return
    # roof marking: H (heliport, towers over 100 m) or R (rescue space)
    pad = 'PAD_H' if 'heli' in cr else ('PAD_R' if 'rescue' in cr else None)
    if pad:
        s = min(x1 - x0, y1 - y0) * 0.55
        s = min(s, 20.0 if pad == 'PAD_H' else 10.0)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + (y1 - y0) * 0.08
        zz = top + (0.6 if pad == 'PAD_H' else 0.05)
        if pad == 'PAD_H':   # raised steel deck on a frame, edge lights
            gbox(c, cx - s / 2, cx + s / 2, cy - s / 2, cy + s / 2, top, zz - 0.02, 'STEEL_GREY', skip=('bot',))
            if lod == 0:
                for i in range(8):
                    a = 2 * math.pi * i / 8
                    px, py = cx + math.cos(a) * s * 0.47, cy + math.sin(a) * s * 0.47
                    gbox(c, px - 0.12, px + 0.12, py - 0.12, py + 0.12, zz, zz + 0.12, 'LIT_WARM')
        q = cs.bm.faces.new([cs.bm.verts.new(v) for v in ((cx - s / 2, cy - s / 2, zz), (cx + s / 2, cy - s / 2, zz),
                                                           (cx + s / 2, cy + s / 2, zz), (cx - s / 2, cy + s / 2, zz))])
        q.normal_update()
        cs.m([q], pad); cs.nb([q])
    # plant on the roof: chillers, a stair house, water tanks
    r = random.Random(spec['seed'] * 13)
    gbox(c, x0 + 1.5, x0 + 6.5, y1 - 6.0, y1 - 1.5, top, top + 3.2, 'MECH_GREY', skip=('bot',))      # stair / lift house
    for i in range(3 if lod == 0 else 1):
        xx = x1 - 3.0 - i * 3.2
        gbox(c, xx - 1.2, xx + 1.2, y1 - 4.0, y1 - 1.6, top, top + 2.0, 'TANK_CREAM', skip=('bot',))   # chillers
        if lod == 0:
            gbox(c, xx - 0.5, xx + 0.5, y1 - 3.3, y1 - 2.3, top + 2.0, top + 2.2, 'BLACK', skip=('bot',))
    if 'gondola' in cr and lod == 0:
        # window-cleaning gondola (BMU) on its rail along the back
        gbox(c, x0 + 2.0, x1 - 2.0, y1 - 0.9, y1 - 0.7, top, top + 0.25, 'STEEL_GREY', skip=('bot',))
        bx = x0 + (x1 - x0) * r.uniform(0.3, 0.7)
        gbox(c, bx - 1.4, bx + 1.4, y1 - 2.4, y1 - 0.2, top + 0.25, top + 1.8, 'PAINT_WHITE', skip=('bot',))
        gbox(c, bx - 0.2, bx + 0.2, y1 - 1.6, y1 + 0.9, top + 1.8, top + 2.2, 'PAINT_WHITE')
        gbox(c, bx - 1.0, bx + 1.0, y1 + 0.35, y1 + 0.9, top - 0.5, top + 1.8, 'ALU')   # cradle hanging off the edge
        c.tube([(bx, y1 + 0.62, top + 1.8), (bx, y1 + 0.62, top + 2.0)], 0.02, 4, 'BLACK')
    if 'mast' in cr:
        mz = top + h + 14.0
        c.tube([((x0 + x1) / 2, (y0 + y1) / 2, top), ((x0 + x1) / 2, (y0 + y1) / 2, mz)], 0.35, 6, 'PAINT_WHITE')
        if lod == 0:
            for k in range(1, 5):
                c.tube([((x0 + x1) / 2 - 1.2, (y0 + y1) / 2, top + k * 3.0), ((x0 + x1) / 2 + 1.2, (y0 + y1) / 2, top + k * 3.0)],
                       0.06, 4, 'PAINT_RED' if k % 2 else 'PAINT_WHITE')
    _crown_sign(cs, spec, pts, top, h, lod)


def _crown_sign(cs, spec, pts, top, h, lod):
    keys = [k[5:] for k in spec['crown'] if k.startswith('sign:')]
    if not keys:
        return
    xs = [p.x for p in pts]; ys = [p.y for p in pts]
    for f, w in ((F(Vector((0, min(ys), 0)), (0, -1)), max(xs) - min(xs)),
                 (F(Vector((max(xs), 0, 0)), (1, 0)), max(ys) - min(ys))):
        sw = min(w * 0.72, 24.0); sh = sw / 8
        z0 = top + (h - sh) / 2 if h >= sh else top - sh - 0.6
        b = cs.box(f, -sw / 2, sw / 2, z0, z0 + sh, 0.05, 0.35 if lod < 2 else 0.06, None, skip=('in',) if lod < 2 else ('in', 'top', 'bot', 'l', 'r'))
        cs.m([b['out']], keys[0])
        if lod < 2:
            cs.m([b[k] for k in ('top', 'bot', 'l', 'r')], 'FRAME_BLACK')


def lights(c, spec, P, col, name, lod):
    """Aviation obstruction lights (Japan: towers over 60 m): red on the crown
    corners, a middle ring on towers over 100 m. Boxes glow (Emission), the
    LIGHT_ markers ask Unity for small red lights (blinking is Unity's job)."""
    if spec['H'] < 60:
        return
    pts = _sec_outline(spec, P, len(spec['sections']) - 1)
    zt = P['top'] + P['crown_h'] + (3.5 if 'frame' in spec['crown'] else 0.0)
    rows = [(pts, zt)]
    if spec['H'] > 100:
        mid = P['floors'][len(P['floors']) // 2]
        rows.append((_sec_outline(spec, P, mid[2]), mid[1] - 0.4))
    i = 0
    for ps, z in rows:
        xs = [p.x for p in ps]; ys = [p.y for p in ps]
        for x in (min(xs) + 0.4, max(xs) - 0.4):
            for y in (min(ys) + 0.4, max(ys) - 0.4):
                if lod == 0:
                    gbox(c, x - 0.18, x + 0.18, y - 0.18, y + 0.18, z, z + 0.3, 'LIGHT_RED', skip=('bot',))
                if col is not None:
                    K.light_marker(f'LIGHT_{name}_Aviation{i}', col, (x, y, z + 0.2), color=(1.0, 0.1, 0.05),
                                   watts=20, unity_range=6.0, unity_intensity=1.5)
                i += 1
    if 'mast' in spec['crown'] and col is not None:
        cx, cy = sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts)
        K.light_marker(f'LIGHT_{name}_Mast', col, (cx, cy, P['top'] + P['crown_h'] + 14.3), color=(1.0, 0.1, 0.05),
                       watts=30, unity_range=8.0, unity_intensity=2.0)


# ── build ───────────────────────────────────────────────────────────────────

def _tower(spec, lod):
    P = _plan(spec)
    c = C('Koso', lod)
    cs = C('KosoShop', lod)
    sg = K.new_bm()
    shaft(c, spec, P, lod)
    if spec.get('fins') and lod < 2:
        fins(c, spec, P, spec['fins'], lod)
    if spec.get('led'):
        led_edges(c, spec, P, lod)
    if spec.get('pilasters') and lod < 2:
        fins(c, spec, P, spec['pilasters'] * 2, lod, depth=0.35, w=0.5, reg='SLAB_WHITE')
    podium(c, cs, sg, spec, P, lod)
    crown(c, cs, spec, P, lod)
    lights(c, spec, P, None, None, lod)
    return c, cs, sg, P


def build_tower(key, lods=(0, 1, 2)):
    spec = TOWERS[key]
    name = f"Tokyo_{spec.get('prefix', 'Tower')}_{key}"
    col = K.collection(name)
    mat = K.atlas_material('Koso')
    smat = K.atlas_material('KosoShop', emission_strength=1.6)
    gmat = K.atlas_material('TokyoSigns', emission_strength=1.6)
    objs, shop, signs = [], [], []
    for lod in lods:
        c, cs, sg, P = _tower(spec, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.0, hidden=lod > 0, recalc=False,
                                  dissolve=False))
        if cs.bm.faces:
            shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0,
                                      recalc=False))
        else:
            cs.bm.free()
        if sg.faces:
            signs.append(K.mesh_object(f'SM_{name}_Signs_LOD{lod}', sg, col, [gmat], bevel=0.0, hidden=lod > 0,
                                       recalc=False))
        else:
            sg.free()
    P = _plan(spec)
    W, D = P['W'], P['D']
    K.collider_box(f'COL_{name}', col, -W / 2, W / 2, -D / 2, D / 2, 0.0, P['top'] + P['crown_h'])
    lights(None, spec, P, col, name, 1)
    K.light_marker(f'LIGHT_{name}_Entrance', col, (0.0, -D / 2 - 2.0, 4.0), color=(1.0, 0.75, 0.5), watts=60,
                   unity_range=9.0)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['sign_tris'] = [K.tri_count(o) for o in signs]
    col['dims'] = dict(W=round(W, 2), D=round(D, 2), H=round(P['top'] + P['crown_h'], 1), floors=len(P['floors']))
    return col, objs


def build(keys=None):
    out = [build_tower(k) for k in (keys or TOWERS)]
    print('towers:', {c.name: dict(c['dims'], shop=list(c['shop_tris']), signs=list(c['sign_tris'])) for c, _ in out})
    return out
