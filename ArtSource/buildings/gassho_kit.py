"""Gassho building kit (thatched farmhouses of Shirakawa-gō / Gokayama):
the steep (~60°) thick thatch roof over an A-frame of rafters (sasu), the
gable end (tsuma) with two to four attic floors of windows, a tall ground
storey with sliding shoji, storm boards and a veranda (engawa), snow boards
(yuki-gakoi); small buildings (board storehouse, shed, the thatched fire
hut of a water cannon, a mountain-god shrine); village pieces (road with a
stone channel, paddy edge, rice-drying rack).

Built in a local frame: ridge along X, gable ends at x = +-L/2 (sides E/W),
long sides at y = +-B/2 (S = -Y, N = +Y). The house module turns the
finished mesh so the chosen side faces the street (-Y).

Machinery from the Kiso/Koedo kits (C, F frames, Sweep with openings as
cells, modules). New here:
- thatch_roof: two shells - a core and a 0.35 m skin - so eave and verge
  show stepped layers; the skin is laid in courses (<= 2 m down the slope,
  each a little step proud of the one below); patches of old/new thatch;
  UVs along the slope (map_axes), never stretched;
- ridge bundle with crossed poles, pressing poles with rope bindings,
  the outer rafter pair and purlin ends at the gable;
- gable: floor beams and window rows per attic floor.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings.tokyo_kit import F, lbox
from buildings import koedo_kit as KK
from buildings import kiso_kit as KI
from buildings.koedo_kit import C, prism_u, orient, hole, grid_on, op

STRIP_H = 1.5       # wall strips of the Gassho atlas (WOOD_TATE, WOOD_BOARD)
COURSE = 1.95       # thatch course length down the slope (KAYA strips are 2 m)
SIDES = {'S': 0, 'E': 1, 'N': 2, 'W': 3}


def map_axes(c, faces, reg, origin, au, av, warn=1.05):
    """Strip mapping along given axes (metres): U = (p - o).au repeats,
    V = (p - o).av from the strip foot, clamped. For thatch: U along the
    ridge or the slope, V across the course or the layer thickness."""
    R = c.R(reg)
    uv = c.bm.loops.layers.uv.verify()
    u0, v0, u1, v1 = R['uv']
    o, au, av = Vector(origin), Vector(au).normalized(), Vector(av).normalized()
    worst = 0.0
    for f in faces:
        if f is None:
            continue
        for l in f.loops:
            d = l.vert.co - o
            tt = d.dot(av) / R['h_m']
            worst = max(worst, tt)
            l[uv].uv = (d.dot(au) / R['w_m'], v0 + min(max(tt, 0.0), 1.0) * (v1 - v0))
    if worst > warn:
        f0 = next(f for f in faces if f is not None)
        K.STRETCH.append((reg, round((worst - 1) * R['h_m'], 2), tuple(round(x, 1) for x in f0.calc_center_median())))
    c.nb(faces)


def map_under(c, f, lo, d):
    """Underside of the thatch: V along the shorter extent (verge strips are
    narrow in x, eave soffits short down the slope) - the strip is 1 m."""
    d = d if d.z > 0 else -d
    xs = [v.co.x for v in f.verts]
    if max(xs) - min(xs) < d.length:
        map_axes(c, [f], 'KAYA_UNDER', (min(xs), lo.y, lo.z), d, (1, 0, 0))
    else:
        map_axes(c, [f], 'KAYA_UNDER', (0, lo.y, lo.z), (1, 0, 0), d)


def log(c, pts, r, n=6, reg='WOOD', ends='END_GRAIN'):
    """Round timber along a polyline: the strip runs along the log (no
    stretching on long rafters), end grain on the caps."""
    sides, c0, c1 = K.tube_path(c.bm, pts, r, n, cap0=True, cap1=True, reg=c.R(reg))
    c.m([c0, c1], ends); c.nb(sides + [c0, c1])
    return sides


def _face(bm, verts, out):
    f = bm.faces.new(verts)
    f.normal_update()
    if f.normal.dot(Vector(out)) < 0:
        f.normal_flip()
    return f


# ── thatch roof ─────────────────────────────────────────────────────────────

class Thatch:
    """Section of a gassho roof (y across, z up; symmetric), from the wall
    line hw, wall-plate height G: underside zu(a), top zt(a) for a = |y|."""

    def __init__(self, B, G, slope=60.0, eave=1.4, vt=1.6, eave_h=0.9, eave_slope=1.25, sk=0.35):
        self.t = math.tan(math.radians(slope))
        self.hw, self.G, self.E, self.vt, self.sk = B / 2, G, B / 2 + eave, vt, sk
        self.zw = G + 0.1
        self.ze = self.zu(self.E) + eave_h
        self.se = min(eave_slope, self.t * 0.85)
        hw, t, se = self.hw, self.t, self.se
        self.ak = (self.ze + self.E * se - self.zw - vt - hw * t) / (se - t)
        self.ak = min(max(self.ak, 0.2), self.E - 0.3)
        self.Zt = self.zt(0.0)
        self.Zu = self.zu(0.0)

    def zu(self, a):
        return self.zw + (self.hw - a) * self.t if a <= self.hw else self.zw - (a - self.hw) * 0.45

    def zt(self, a):
        if a <= self.ak:
            return self.zw + self.vt + (self.hw - a) * self.t
        return self.ze + (self.E - a) * self.se

    def courses(self, n_min=1):
        """Course boundaries a (eave -> ridge), the kink included."""
        out = []
        for a_hi, a_lo, slope in ((self.E, self.ak, self.se), (self.ak, 0.0, self.t)):
            ln = (a_hi - a_lo) * math.sqrt(1 + slope * slope)
            n = max(n_min, math.ceil(ln / COURSE - 1e-6))
            out += [a_hi - (a_hi - a_lo) * k / n for k in range(1, n)]
            if a_lo > 0:
                out.append(a_lo)
        return out


def thatch_roof(c, L, B, G, ov=1.1, seed=0, tones=None, splits=None, slope=60.0, eave=1.4, vt=1.6, eave_h=0.9,
                eave_slope=1.25, sk=0.35, step=0.04, poles=True, ridge='cross', rafters=True):
    """Gassho thatch over the box L x B (walls), wall plate at G. Core and
    skin shells, stepped verge (ov out from the gable wall) and eave,
    courses with steps, tone patches (tones: dict (side, span) -> region),
    ridge bundle with crossed poles, pressing poles with ropes, outer rafter
    pair and purlin ends at both gables. Returns the section (Thatch) plus
    x extents."""
    bm, lod = c.bm, c.lod
    r = random.Random(seed)
    T = Thatch(B, G, slope, eave, vt, eave_h, eave_slope, sk)
    st = step if lod == 0 else 0.0
    Xs = L / 2 + ov
    Xc = Xs - (0.22 if lod == 0 else 0.0)
    Ec = T.E - (0.22 if lod == 0 else 0.0)
    bnd = T.courses()
    # ---- skin: profile loop of (y, z) points, keyed for faces/caps
    P, key = [], {}

    def add(k, y, z):
        key[k] = len(P); P.append((y, z))
    a_list = [T.E] + bnd + [0.0]             # course edges, eave -> ridge
    bot_as = sorted(set([T.E, Ec] + [a for a in bnd if a < Ec] + [0.0]), reverse=True)
    for sd in (-1, 1):
        if sd < 0:   # up the -y side
            add(('B', -1, T.E), -T.E, T.zt(T.E) - sk)
            add(('T', -1, T.E), -T.E, T.zt(T.E))
            for a in bnd:
                add(('Tp', -1, a), -a, T.zt(a) - st)
                add(('T', -1, a), -a, T.zt(a))
            add(('R',), 0.0, T.Zt)
        else:        # down the +y side
            for a in reversed(bnd):
                add(('T', 1, a), a, T.zt(a))
                add(('Tp', 1, a), a, T.zt(a) - st)
            add(('T', 1, T.E), T.E, T.zt(T.E))
            add(('B', 1, T.E), T.E, T.zt(T.E) - sk)
    for a in bot_as[1:]:                       # bottom line back from +E to -E
        if a > 0:
            add(('B', 1, a), a, T.zt(a) - sk)
    add(('B', 0, 0.0), 0.0, T.Zt - sk)
    for a in reversed(bot_as[1:-1]):
        add(('B', -1, a), -a, T.zt(a) - sk)
    n = len(P)
    xs = sorted(set([-Xs, -Xc, Xc, Xs] + [x for x in (splits or []) if abs(x) < Xc - 0.5]))
    rings = [[bm.verts.new((x, y, z)) for y, z in P] for x in xs]
    tones = tones or {}
    centre = Vector((0, 0, (T.Zt + T.zw) / 2))
    inv = {v: k for k, v in key.items()}
    X = Vector((1, 0, 0))
    for j in range(len(xs) - 1):
        span = j if xs[j] >= -Xc - 1e-6 and xs[j + 1] <= Xc + 1e-6 else None
        inner = xs[j] >= -Xc - 1e-6 and xs[j + 1] <= Xc + 1e-6
        for i in range(n):
            ka, kb = inv[i], inv[(i + 1) % n]
            pa, pb = Vector((0, *P[i])), Vector((0, *P[(i + 1) % n]))
            if ka[0] == 'B' and kb[0] == 'B':    # bottom of the skin
                ya, yb = abs(P[i][0]), abs(P[(i + 1) % n][0])
                if inner and max(ya, yb) <= Ec + 1e-6:
                    continue                      # lies on the core
            q = [rings[j][i], rings[j + 1][i], rings[j + 1][(i + 1) % n], rings[j][(i + 1) % n]]
            mid = (pa + pb) / 2
            fc = bm.faces.new(q)
            fc.normal_update()
            # outward: away from the section's inner side (bottom faces point down)
            if ka[0] == 'B' and kb[0] == 'B':
                want = Vector((0, 0, -1))
            else:
                want = Vector((0, mid.y, max(mid.z - centre.z, 0.0) + 0.3)).normalized() if abs(mid.y) > 1e-3 else Vector((0, 0, 1))
            if ka[0] in ('Tp',) and kb[0] == 'T' and abs(P[i][0] - P[(i + 1) % n][0]) < 1e-6 or \
               ka[0] == 'T' and kb[0] == 'Tp' and abs(P[i][0] - P[(i + 1) % n][0]) < 1e-6:
                want = Vector((0, 1 if mid.y > 0 else -1, 0))     # step face looks down the slope
            if ka[0] == 'B' and kb[0] == 'T' or ka[0] == 'T' and kb[0] == 'B':
                want = Vector((0, 1 if mid.y > 0 else -1, 0))     # eave cut
            if fc.normal.dot(want) < 0:
                fc.normal_flip()
            d = pb - pa
            if (ka[0] == 'B') != (kb[0] == 'B'):                 # eave cut
                lo = pa if pa.z < pb.z else pb
                map_axes(c, [fc], 'KAYA_EDGE', (0, lo.y, lo.z), X, (0, 0, 1))
            elif ka[0] == 'B':                                    # underside of the skin
                lo = pa if pa.z < pb.z else pb
                map_under(c, fc, lo, d)
            elif abs(d.y) < 1e-6:                                 # course step
                lo = pa if pa.z < pb.z else pb
                map_axes(c, [fc], 'KAYA_EDGE', (0, lo.y, lo.z), X, (0, 0, 1))
            else:                                                 # course surface
                lo = pa if pa.z < pb.z else pb
                side = 1 if mid.y > 0 else -1
                reg = tones.get((side, span), 'KAYA') if span is not None else tones.get((side, 'verge'), 'KAYA')
                map_axes(c, [fc], reg, (0, lo.y, lo.z), X, d if d.z > 0 else -d)
    # skin caps at both verges, one piece per course
    for jx, sx in ((0, -1), (len(xs) - 1, 1)):
        ring = rings[jx]
        for sd in (-1, 1):
            for k in range(len(a_list) - 1):
                a_hi, a_lo = a_list[k], a_list[k + 1]
                vs = []
                if k == 0:
                    vs += [key[('B', sd, T.E)], key[('T', sd, T.E)]]
                else:
                    vs += [key[('B', sd, a_hi)] if ('B', sd, a_hi) in key else None, key[('Tp', sd, a_hi)], key[('T', sd, a_hi)]]
                vs.append(key[('R',)] if a_lo == 0 else key[('Tp', sd, a_lo)])
                vs.append(key[('B', 0, 0.0)] if a_lo == 0 else key.get(('B', sd, a_lo)))
                for a in bot_as:                  # extra bottom points inside this course (Ec)
                    if a_lo < a < a_hi and ('B', sd, a) in key and a not in a_list:
                        vs.append(key[('B', sd, a)])
                vs = [v for v in vs if v is not None]
                if len(vs) < 3:
                    continue
                f = bm.faces.new([ring[i] for i in vs])
                f.normal_update()
                if f.normal.x * sx < 0:
                    f.normal_flip()
                pa, pb = Vector((0, *P[vs[1]])), Vector((0, *P[vs[-2] if a_lo == 0 else vs[-2]]))
                top_a = Vector((0, *P[key[('T', sd, T.E)] if k == 0 else key[('T', sd, a_hi)]]))
                top_b = Vector((0, *P[key[('R',)] if a_lo == 0 else key[('Tp', sd, a_lo)]]))
                du = top_b - top_a
                dv = Vector((0, -du.z, du.y)) * sd
                if dv.z < 0:
                    dv = -dv
                o = Vector((xs[jx], *P[vs[0]]))
                map_axes(c, [f], 'KAYA_EDGE', o - dv.normalized() * 0.02, du, dv)
    # ---- core: underside + top (= skin bottom), cut at the verge Xc and at the eave Ec
    A = sorted(set([Ec, T.hw, (Ec + T.hw) / 2] + [a for a in bnd if a < Ec] + [0.0]), reverse=True)   # soffit in two (1 m strip)
    Q, qk = [], {}

    def qadd(k, y, z):
        qk[k] = len(Q); Q.append((y, z))
    ztop = lambda a: T.zt(a) - sk
    for a in A:                                  # top, -y eave -> ridge
        if a > 0:
            qadd(('C', -1, a), -a, ztop(a))
    qadd(('C', 0, 0.0), 0.0, ztop(0.0))
    for a in reversed(A):
        if a > 0:
            qadd(('C', 1, a), a, ztop(a))
    for a in A:                                  # underside, +y eave -> ridge -> -y eave
        if a > 0:
            qadd(('U', 1, a), a, T.zu(a))
    qadd(('U', 0, 0.0), 0.0, T.Zu)
    for a in reversed(A):
        if a > 0:
            qadd(('U', -1, a), -a, T.zu(a))
    m = len(Q)
    qinv = {v: k for k, v in qk.items()}
    cx = sorted(set([-Xc, -L / 2, L / 2, Xc] + ([-(L / 2 + Xc) / 2, (L / 2 + Xc) / 2] if Xc - L / 2 > 0.95 else [])))
    crings = [[bm.verts.new((x, y, z)) for y, z in Q] for x in cx]
    for j in range(len(cx) - 1):
        mid_span = cx[j] >= -L / 2 - 1e-6 and cx[j + 1] <= L / 2 + 1e-6
        for i in range(m):
            ka, kb = qinv[i], qinv[(i + 1) % m]
            if ka[0] == 'C' and kb[0] == 'C':
                continue                              # under the skin
            pa, pb = Vector((0, *Q[i])), Vector((0, *Q[(i + 1) % m]))
            if ka[0] == 'U' and kb[0] == 'U':
                if mid_span and max(abs(pa.y), abs(pb.y)) <= T.hw + 1e-6:
                    continue                          # attic: inside the walls
            fc = bm.faces.new([crings[j][i], crings[j + 1][i], crings[j + 1][(i + 1) % m], crings[j][(i + 1) % m]])
            fc.normal_update()
            mid = (pa + pb) / 2
            if ka[0] == 'U' and kb[0] == 'U':
                want = Vector((0, 0, -1))
                lo = pa if pa.z < pb.z else pb
                d = pb - pa
                map_under(c, fc, lo, d)
            else:                                     # eave cut of the core
                want = Vector((0, 1 if mid.y > 0 else -1, 0))
                lo = pa if pa.z < pb.z else pb
                map_axes(c, [fc], 'KAYA_EDGE', (0, lo.y, lo.z), X, (0, 0, 1))
            if fc.normal.dot(want) < 0:
                fc.normal_flip()
    for jx, sx in ((0, -1), (len(cx) - 1, 1)):
        ring = crings[jx]
        for sd in (-1, 1):
            for k in range(len(A) - 1):
                a_hi, a_lo = A[k], A[k + 1]
                kk = 0 if a_lo == 0 else sd
                vs = [qk[('U', sd, a_hi)], qk[('C', sd, a_hi)], qk[('C', kk, a_lo)], qk[('U', kk, a_lo)]]
                f = bm.faces.new([ring[i] for i in vs])
                f.normal_update()
                if f.normal.x * sx < 0:
                    f.normal_flip()
                pa, pb = Vector((0, *Q[vs[1]])), Vector((0, *Q[vs[2]]))
                du = pb - pa
                dv = Vector((0, -du.z, du.y))
                if dv.z < 0:
                    dv = -dv
                # V from the underside up: origin on the lower of the two underside points
                lo = min((Vector((cx[jx], *Q[vs[0]])), Vector((cx[jx], *Q[vs[3]]))), key=lambda p: p.dot(dv.normalized()))
                map_axes(c, [f], 'KAYA_EDGE', lo, du, dv, warn=1.4)
    # ---- ridge, poles, ropes
    zr = T.Zt
    xr = Xs - 0.12
    c.tube([(-xr, 0, zr - 0.08), (xr, 0, zr - 0.08)], 0.3, 8 if lod == 0 else 6, 'KAYA_RIDGE', caps=True)
    if lod == 0 and ridge == 'cross':
        nx = max(2, int(2 * xr / 2.0))
        for i in range(nx + 1):
            x = -xr + 0.25 + (2 * xr - 0.5) * i / nx
            for sd in (-1, 1):
                a = 0.85
                c.tube([(x, sd * a, T.zt(a) + 0.02), (x, -sd * 0.3, zr + 0.55)], 0.035, 4, 'WOOD_FLAT')
            c.box(F(Vector((x, 0, 0)), (0, -1)), -0.06, 0.06, zr + 0.2, zr + 0.3, -0.06, 0.06, 'ROPE', skip=('top', 'bot'))
        c.tube([(-xr + 0.1, 0, zr + 0.34), (xr - 0.1, 0, zr + 0.34)], 0.045, 6, 'WOOD_FLAT', caps=True)
    if lod == 0 and poles:
        for sx in (-1, 1):                     # pressing poles along both verges, rope at each course
            x = sx * (Xs - 0.4)
            for sd in (-1, 1):
                pts = [(x, sd * a, T.zt(a) + 0.05) for a in [T.E - 0.15] + bnd + [0.6]]
                c.tube(pts, 0.045, 4, 'BAMBOO_DARK', caps=True)
                for a in bnd[1::3]:
                    p = Vector((x, sd * a, T.zt(a) + 0.05))
                    c.box(F(p, (0, -1)), -0.07, 0.07, p.z - 0.07, p.z + 0.07, -0.07, 0.07, 'ROPE', skip=('top', 'bot'))
        for sd in (-1, 1):                     # pressing pole along each eave
            a = T.E - 0.45
            z = T.zt(a) + 0.05
            c.tube([(-Xs + 0.25, sd * a, z), (Xs - 0.25, sd * a, z)], 0.045, 5, 'BAMBOO_DARK', caps=True)
            nn = int((2 * Xs - 0.5) / 3.6)
            for i in range(nn + 1):
                x = -Xs + 0.4 + (2 * Xs - 0.8) * i / max(nn, 1)
                c.box(F(Vector((x, sd * a, 0)), (0, -1)), -0.06, 0.06, z - 0.07, z + 0.07, -0.07, 0.07, 'ROPE', skip=('l', 'r'))
    if rafters:                                # outer rafter pair (sasu) and purlin ends at the gables
        for sx in (-1, 1):
            x = sx * (L / 2 + 0.16)
            for sd in (-1, 1):
                a0 = T.hw + 0.05
                log(c, [(x, sd * a0, T.zu(a0) - 0.18), (x, -sd * 0.35, T.Zu + 0.6 - 0.18)], 0.15, 6 if lod == 0 else 4)
            if lod == 0:
                for a in (T.hw * 0.66, T.hw * 0.33):
                    for sd in (-1, 1):
                        z = T.zu(a) - 0.2
                        log(c, [(sx * (L / 2 - 0.1), sd * a, z), (sx * (Xc - 0.25), sd * a, z)], 0.11)
                z = T.Zu - 0.25
                log(c, [(sx * (L / 2 - 0.1), 0, z), (sx * (Xc - 0.15), 0, z)], 0.13)
    return dict(T=T, Xs=Xs, Xc=Xc)


def tone_patches(seed, n_spans, base='KAYA', p_new=0.18, p_old=0.3, north_old=True):
    """Thatch tones per (side, span): mostly weathered, some re-thatched
    patches (golden), some old mossy ones; the north (+y) eave side older."""
    r = random.Random(seed)
    t = {}
    for sd in (-1, 1):
        for j in range(n_spans + 4):
            x = r.random()
            t[sd, j] = 'KAYA_NEW' if x < p_new else 'KAYA_OLD' if x < p_new + p_old + (0.2 if north_old and sd > 0 else 0) else base
        t[sd, 'verge'] = base
    return t


# ── gable end (tsuma) ───────────────────────────────────────────────────────

def gable(c, L, B, T, side, floors, reg='WOOD_TATE', seed=0):
    """Gable wall at x = side * L/2 between the wall plate and the roof
    underside: bands <= 1.5 m, a floor beam at every attic floor, windows
    per floor (floors = list of lists of (kind, width, opt)); a king post
    and a small vent in the top triangle."""
    bm, lod = c.bm, c.lod
    x = side * L / 2
    w = lambda z: max(0.0, T.hw - (z - T.zw) / T.t)
    z0 = T.zw
    cuts = [z0]
    fz = [T.G + 0.1 + 1.85 * (i + 1) for i in range(8)]
    fz = [z for z in fz if w(z) > 0.9]
    z = z0
    marks = sorted(set([zz for zz in fz] + [zz + 0.75 for zz in [z0] + fz]))
    for zz in marks:
        if zz < T.Zu - 0.05:
            cuts.append(zz)
    cuts.append(T.Zu)
    out = Vector((side, 0, 0))
    for za, zb in zip(cuts, cuts[1:]):
        wa, wb = w(za), w(zb)
        pts = [(-wa, za), (wa, za)] + ([(wb, zb), (-wb, zb)] if wb > 1e-3 else [(0.0, zb)])
        f = _face(bm, [bm.verts.new((x, y, zz)) for y, zz in pts], out)
        if zb - za > STRIP_H + 1e-6 or wb < 1e-3 and zb - za > STRIP_H:
            c.m([f], flat(reg))
        else:
            c.m([f], reg, z0=za)
    fr = F(Vector((x, 0, 0)), (side, 0))        # u = side * y ... t = (0, side)
    for zf in fz:                               # floor beams
        ww = w(zf + 0.18) - 0.02
        c.box(fr, -ww, ww, zf, zf + 0.18, 0.0, 0.07, 'WOOD', skip=('in',))
    if lod == 0:                                # king post in the top triangle
        zt = fz[-1] + 0.18 if fz else z0
        c.box(fr, -0.08, 0.08, zt, T.Zu - 0.1, 0.0, 0.05, 'WOOD', skip=('in', 'bot'), rotate=True)
    levels = [z0] + fz
    for li, row in enumerate(floors):
        if li >= len(levels):
            break
        zb = levels[li] + (0.55 if li else 0.75)
        for kind, uc, ww, opt in row:
            h = opt.get('h', 0.9 if li < 3 else 0.6)
            if abs(uc) + ww / 2 > w(zb + h) - 0.2:
                continue                        # does not fit under the roof
            gwin(c, fr, uc - ww / 2, uc + ww / 2, zb, zb + h, kind, opt)
    return levels


def gwin(c, f, u0, u1, z0, z1, kind, opt):
    """Gable window standing on the wall: frame (proud), panel (shoji,
    lattice, boards or slats), sill, optional board hood."""
    lod = c.lod
    p = c.box(f, u0 + 0.05, u1 - 0.05, z0 + 0.05, z1 - 0.05, 0.0, 0.012, None, skip=('in', 'l', 'r', 'top', 'bot'))
    lit = opt.get('lit', False)
    if kind == 'shoji':
        c.m([p['out']], 'SHOJI' if lit else 'SHOJI_DARK')
    elif kind == 'koshi':
        c.m([p['out']], 'KOSHI_LIT' if lit else 'KOSHI_DARK')
    elif kind == 'board':
        c.m([p['out']], 'WOOD_TATE_FLAT')
    else:   # vent: dark slot behind slats
        c.m([p['out']], 'INTERIOR')
    if lod:
        return
    for a, b in ((u0, u0 + 0.06), (u1 - 0.06, u1)):
        c.box(f, a, b, z0 + 0.05, z1 - 0.05, 0.0, 0.07, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
    c.box(f, u0 - 0.08, u1 + 0.08, z0 - 0.06, z0 + 0.05, 0.0, 0.11, 'WOOD', skip=('in', 'bot'))
    c.box(f, u0 - 0.04, u1 + 0.04, z1 - 0.05, z1 + 0.04, 0.0, 0.08, 'WOOD', skip=('in',))
    if kind == 'shoji':      # two sliding panels: meeting stiles
        um = (u0 + u1) / 2
        c.box(f, um - 0.025, um + 0.025, z0 + 0.05, z1 - 0.05, 0.0, 0.035, 'WOOD', skip=('in', 'top', 'bot', 'l', 'r'), rotate=True)
    elif kind == 'board':    # battens
        for zz in (z0 + 0.15, z1 - 0.2):
            c.box(f, u0 + 0.06, u1 - 0.06, zz, zz + 0.06, 0.0, 0.04, 'WOOD', skip=('in', 'l', 'r'))
    elif kind == 'vent':
        k = 3
        for i in range(k):
            zz = z0 + 0.08 + (z1 - z0 - 0.2) * (i + 0.5) / k
            c.box(f, u0 + 0.06, u1 - 0.06, zz, zz + 0.05, 0.0, 0.05, 'WOOD', skip=('in', 'l', 'r'))
    if opt.get('hood'):      # little board hood on brackets
        d = 0.42
        poly = [(0.0, 0.1), (d, -0.06), (d, -0.1), (0.0, 0.06)]
        sides, caps = prism_u(c, F(f(0, z1 + 0.12, 0), f.n), poly, u0 - 0.15, u1 + 0.15)
        for s in sides + caps:
            s.normal_update()
        c.m(sides + caps, 'WOOD_GREY_FLAT'); c.nb(sides + caps)


def flat(reg):
    return {'WOOD_TATE': 'WOOD_TATE_FLAT', 'WOOD_BOARD': 'WOOD_BOARD_FLAT'}.get(reg, reg)


# ── ground storey ───────────────────────────────────────────────────────────

def profile_ground(G, lod):
    """Footing stones, sill, wall rows g_low/g_mid/g_top, lintel, wall plate
    (keta) proud and up into the thatch, so no slit shows under the eave."""
    pts, meta = [], []

    def seg(d, z, name, kd):
        pts.append((d, z)); meta.append(dict(name=name, kind=kd, storey='g'))
    seg(0.08, 0.0, 'foot', 'stone'); seg(0.08, 0.25, 'foot_top', 'hz')
    seg(0.04, 0.25, 'sill', 'beam'); seg(0.04, 0.4, 'sill_top', 'hz')
    seg(0.0, 0.4, 'g_low', 'wall'); seg(0.0, 1.0, 'g_mid', 'wall'); seg(0.0, 2.2, 'g_top', 'wall')
    if lod == 0:
        seg(0.0, G - 0.28, 'lintel_lo', 'hz')
    seg(0.04, G - 0.28, 'lintel', 'beam')
    seg(0.04, G - 0.05, 'plate_lo', 'hz')
    seg(0.1, G - 0.05, 'plate', 'beam')
    pts.append((0.1, G + 0.3)); meta.append(dict(name='plate_top', kind='hz', storey='g'))
    pts.append((-0.02, G + 0.3))
    return pts, meta


ROWS = {'ground': ('g_low', 'g_mid', 'g_top'), 'door': ('g_low', 'g_mid'), 'window_g': ('g_mid',),
        'high': ('g_top',)}


class Sweep(KI.Sweep):
    """Kiso sweep with the 1.5 m wall strips of the Gassho atlas."""

    def map_walls(self):
        c = self.c
        for k, mt in enumerate(self.meta):
            z_lo, z_hi = self.pts[k][1], self.pts[k + 1][1]
            for e in range(4):
                fs = [f for j, f in enumerate(self.faces[k][e]) if (k, e, j) not in self.used]
                if not fs:
                    continue
                kd = mt['kind']
                if kd == 'wall':
                    bases = [p[1] for kk, p in enumerate(self.pts[:-1]) if self.meta[kk]['kind'] == 'wall']
                    z0 = min([b for b in bases if z_hi - b <= STRIP_H + 1e-6] or [z_lo])
                    c.m(fs, self.walls[e], z0=z0)
                elif kd == 'stone':
                    c.m(fs, 'STONE', z0=0.0)
                elif kd == 'beam':
                    c.m(fs, 'WOOD', z0=z_lo)
                else:   # ledges: no bevel - the opening columns cut them into many pieces (measured: ~900 tris)
                    c.m(fs, 'STONE_FLAT' if mt['name'] == 'foot_top' else 'WOOD_FLAT')
                    c.nb(fs)


def shoji_g(c, face, sh, opt):
    """Row of sliding shoji (koshi-shoji): board kick panel below, paper
    above, head rail and sill, a stile at every panel; lit or dark."""
    f0 = F.of(face)
    fl = hole(c, face, 0.1, 'WOOD_FLAT')
    f = F.of(fl)
    n = max(1, round(f.w / 0.9))
    us = [f.u0 + f.w * i / n for i in range(n + 1)]
    zk = f.z0 + 0.5
    f, g = grid_on(c, fl, us, [f.z0, zk, f.z1])
    lit = opt.get('lit', True)
    lit = range(n) if lit is True else (lit or ())
    for i in range(n):
        c.m([g[i, 0]], 'WOOD_BOARD_FLAT')
        c.m([g[i, 1]], 'SHOJI' if i in lit else 'SHOJI_DARK')
    if c.lod == 0:
        for u in us[1:-1]:
            c.box(f, u - 0.025, u + 0.025, f.z0, f.z1, 0.0, 0.03, 'WOOD', skip=('in',), rotate=True)
        c.box(f, f.u0, f.u1, zk - 0.03, zk + 0.03, 0.0, 0.03, 'WOOD', skip=('in', 'l', 'r'))
    c.box(f0, f0.u0 - 0.05, f0.u1 + 0.05, f0.z0 - 0.06, f0.z0, 0.0, 0.06, 'WOOD', skip=('in',))
    return dict(kind='shoji', f=f0, depth=0.1, lit=bool(lit))


def mado(c, face, sh, opt):
    """Ground-floor window of a farmhouse: shoji behind a few square
    wooden bars (5-6, not a fine lattice), sill and head."""
    f0 = F.of(face)
    fl = hole(c, face, 0.12, 'WOOD_FLAT')
    KI._shoji(c, fl, opt.get('lit', ()))
    c.box(f0, f0.u0 - 0.06, f0.u1 + 0.06, f0.z0 - 0.07, f0.z0, 0.0, 0.08, 'WOOD', skip=('in', 'bot'))
    if c.lod:
        return dict(kind='window', f=f0)
    c.box(f0, f0.u0 - 0.04, f0.u1 + 0.04, f0.z1, f0.z1 + 0.07, 0.0, 0.06, 'WOOD', skip=('in', 'top'))
    k = max(3, round(f0.w / 0.36))
    for i in range(1, k):
        u = f0.u0 + f0.w * i / k
        c.box(f0, u - 0.025, u + 0.025, f0.z0, f0.z1, -0.06, -0.01, 'WOOD', skip=('in', 'top', 'bot'), rotate=True)
    return dict(kind='window', f=f0)


def amado(c, face, sh, opt):
    """Closed storm boards (amado): panels of vertical boards <= 0.9 m wide
    in a track, top and bottom rail; a door box (tobukuro) at one end."""
    f0 = F.of(face)
    fl = hole(c, face, 0.08, 'WOOD_FLAT')
    f = F.of(fl)
    n = max(1, math.ceil(f.w / 0.9))
    us = [f.u0 + f.w * i / n for i in range(n + 1)]
    zs = [f.z0, (f.z0 + f.z1) / 2, f.z1] if f.z1 - f.z0 > STRIP_H else [f.z0, f.z1]   # middle rail
    f, g = grid_on(c, fl, us, zs)
    for i in range(n):
        for j in range(len(zs) - 1):
            c.m([g[i, j]], 'WOOD_TATE', z0=zs[j])
    if c.lod == 0:
        for u in us[1:-1]:
            c.box(f, u - 0.02, u + 0.02, f.z0, f.z1, 0.0, 0.025, 'WOOD_FLAT', skip=('in', 'top', 'bot'), rotate=True)
        for zz in [f.z0, f.z1 - 0.06] + zs[1:-1]:
            c.box(f0, f0.u0, f0.u1, zz, zz + 0.06, 0.0, 0.05, 'WOOD', skip=('in', 'l', 'r'))
        if opt.get('box', True) and f0.u0 > 0.5:
            b = c.box(f0, f0.u0 - 0.45, f0.u0, f0.z0, f0.z1, 0.0, 0.16, None, skip=('in', 'bot'))
            c.m([b['out']], 'WOOD_TATE_FLAT' if f0.z1 - f0.z0 > STRIP_H else 'WOOD_TATE', z0=f0.z0)
            c.m([b['l'], b['r'], b['top']], 'WOOD_FLAT')
    return dict(kind='closed', f=f0, depth=0.08)


MODULES = dict(KI.MODULES, shoji=shoji_g, mado=mado, amado=amado)


def frame_posts(c, sw, e, us, z0, z1):
    if c.lod:
        return
    f = sw.frame(e)
    for u in us:
        c.box(f, u - 0.08, u + 0.08, z0, z1, 0.0, 0.035, 'WOOD', skip=('in', 'bot'), rotate=True)


def engawa(c, f, u0, u1, d=0.95, z=0.48, step=True, seed=0):
    """Veranda along a wall: deck boards along the wall, front beam, short
    posts on footing stones, a big stepping stone (kutsunugi-ishi)."""
    lod = c.lod
    nb = 5 if lod == 0 else 2
    for i in range(nb):
        da, db = d * i / nb, d * (i + 1) / nb
        b = c.box(f, u0, u1, z - 0.04, z, da + 0.004, db - 0.004, None, skip=('in', 'bot', 'l', 'r', 'out') if i < nb - 1 else ('in', 'bot', 'l', 'r'))
        c.m([b['top']], 'WOOD_LIGHT')
        if 'out' in b:
            c.m([b['out']], 'WOOD_FLAT')
    b = c.box(f, u0, u1, z - 0.04, z, 0.0, d, None, skip=('in', 'top', 'out', 'bot'))
    c.m([b['l'], b['r']], 'WOOD_FLAT')
    c.box(f, u0, u1, z - 0.2, z - 0.04, d - 0.12, d, 'WOOD', skip=('in', 'top'))
    n = max(1, round((u1 - u0) / 1.8))
    for i in range(n + 1):
        u = u0 + 0.1 + (u1 - u0 - 0.2) * i / n
        c.box(f, u - 0.06, u + 0.06, 0.12, z - 0.2, d - 0.18, d - 0.06, 'WOOD', skip=('top', 'bot'), rotate=True)
        if lod == 0:
            c.box(f, u - 0.13, u + 0.13, 0.0, 0.12, d - 0.25, d + 0.01, 'STONE_FLAT', skip=('bot',))
    if step:
        r = random.Random(seed)
        uc = u0 + (u1 - u0) * r.uniform(0.3, 0.7)
        p = f(uc, 0, d + 0.42)
        s = K.lathe(c.bm, 7 if lod == 0 else 5, [(0.5, 0.0), (0.46, 0.24), (0.36, 0.3)], cx=p.x, cy=p.y,
                    phase=r.random(), cap_bottom=False)
        for v in [v for ring in s['rings'] for v in ring]:
            v.co.y = p.y + (v.co.y - p.y) * 0.7 if abs(f.n.y) > 0.5 else v.co.y
            if abs(f.n.x) > 0.5:
                v.co.x = p.x + (v.co.x - p.x) * 0.7
        c.m(s['sides'] + [s['top']], 'STONE_FLAT'); c.nb(s['sides'])


def yukigakoi(c, f, u0, u1, d, h=2.3, boards=(True, True, False, True), seed=0):
    """Snow boards (yuki-gakoi) before a wall: posts on stones, top and
    bottom rails, bays of vertical boards - some bays still open (being
    put up for winter)."""
    n = max(1, round((u1 - u0) / 1.8))
    us = [u0 + (u1 - u0) * i / n for i in range(n + 1)]
    for u in us:
        c.box(f, u - 0.06, u + 0.06, 0.0, h + 0.1, d - 0.06, d + 0.06, 'WOOD', skip=('bot',), rotate=True, bevel=True)
    for zz in (0.15, h - 0.12):
        c.box(f, u0, u1, zz, zz + 0.1, d + 0.06, d + 0.12, 'WOOD', skip=('in',))
    for i in range(n):
        if not boards[i % len(boards)]:
            continue
        ua, ub = us[i] + 0.06, us[i + 1] - 0.06
        for za, zb in ((0.05, h / 2), (h / 2, h)):
            b = c.box(f, ua, ub, za, zb, d - 0.03, d + 0.03 - 0.005, None, skip=('l', 'r', 'top', 'bot'))
            c.m([b['out']], 'WOOD_TATE', z0=za); c.m([b['in']], 'WOOD_TATE', z0=za)
        if c.lod == 0:
            c.box(f, ua, ub, h / 2 - 0.04, h / 2 + 0.04, d + 0.025, d + 0.06, 'WOOD_FLAT', skip=('in',))


def pent(c, f, u0, u1, z_e, depth, kind='board', slope=0.45, posts=None):
    """Pent roof (hisashi) over a ground floor or entrance: board (planks
    with a fascia, rafters, brackets) or thatch (a thick thatch wedge)."""
    lod = c.lod
    zt = z_e + depth * slope
    if kind == 'thatch':
        th = 0.45
        poly = [(depth, z_e), (depth, z_e + th), (0.0, zt + th), (0.0, zt - 0.1)]
        sides, caps = prism_u(c, f, poly, u0, u1)
        for s in sides:
            s.normal_update()
            if s.normal.z > 0.5:
                map_axes(c, [s], 'KAYA', f(u0, z_e + th, depth), f.t, (f(0, zt + th, 0) - f(0, z_e + th, depth)))
            elif s.normal.z < -0.5:
                c.m([s], 'KAYA_FLAT'); c.nb([s])
            else:
                map_axes(c, [s], 'KAYA_EDGE', f(u0, z_e, depth), f.t, (0, 0, 1))
        for cp in caps:
            map_axes(c, [cp], 'KAYA_EDGE', f(u0, z_e, depth), f(0, zt, 0) - f(0, z_e, depth),
                     (0, 0, 1), warn=2.0)
        surf = lambda d: z_e + th + (depth - d) * slope
    else:
        th = 0.05
        poly = [(depth, z_e), (depth, z_e + th), (0.0, zt + th), (0.0, zt)]
        sides, caps = prism_u(c, f, poly, u0, u1)
        for s in sides:
            s.normal_update()
            c.m([s], 'WOOD_GREY_FLAT' if s.normal.z > 0.5 else 'WOOD_BOARD_FLAT' if s.normal.z < -0.5 else 'WOOD_FLAT')
        c.m(caps, 'WOOD_FLAT'); c.nb(sides + caps)
        c.box(f, u0, u1, z_e - 0.12, z_e + 0.02, depth - 0.04, depth + 0.02, 'WOOD', skip=('in',))   # fascia
        if lod == 0:
            n = max(2, int((u1 - u0) / 0.6))
            for i in range(n + 1):
                u = u0 + 0.06 + (u1 - u0 - 0.12) * i / n
                b = c.box(f, u - 0.03, u + 0.03, 0.0, 1.0, 0.0, depth - 0.04, None, skip=('in', 'top'))
                for v in {v for x in b.values() for v in x.verts}:
                    t = (v.co - f(u, 0, 0)).dot(f.n)
                    v.co.z = z_e + (depth - t) * slope - 0.06 * (1 - v.co.z)
                c.m(b.values(), 'WOOD_FLAT')
        surf = lambda d: z_e + th + (depth - d) * slope
    for u in posts or []:
        c.box(f, u - 0.07, u + 0.07, 0.0, z_e - 0.1, depth - 0.2, depth - 0.06, 'WOOD', skip=('bot',), rotate=True, bevel=True)
        if lod == 0:
            c.box(f, u - 0.14, u + 0.14, 0.0, 0.12, depth - 0.28, depth + 0.02, 'STONE_FLAT', skip=('bot',))
    if posts:
        c.box(f, u0 + 0.05, u1 - 0.05, z_e - 0.22, z_e - 0.06, depth - 0.2, depth - 0.06, 'WOOD', skip=('in',))
    return surf


def drip_stones(c, L, B, T, ov):
    """River stones and gravel under both eaves (amaochi): the drip line."""
    if c.lod:
        return
    bm = c.bm
    r = random.Random(5)
    for sd in (-1, 1):
        y0, y1 = sd * (T.E - 0.35), sd * (T.E + 0.35)
        ya, yb = sorted((y0, y1))
        xa, xb = -L / 2 - ov, L / 2 + ov
        f = _face(bm, [bm.verts.new(p) for p in ((xa, ya, 0.01), (xb, ya, 0.01), (xb, yb, 0.01), (xa, yb, 0.01))], (0, 0, 1))
        c.m([f], 'GRAVEL'); c.nb([f])
        x = xa + 0.2
        while x < xb - 0.2:
            rad = r.uniform(0.1, 0.17)
            p = Vector((x, sd * (T.E + r.uniform(-0.25, 0.25)), 0))
            st = K.lathe(bm, 4, [(rad, 0.0), (rad * 0.6, rad * 0.7)], phase=r.random(), cx=p.x, cy=p.y, cap_bottom=False)
            c.m(st['sides'] + [st['top']], r.choice(('STONE_A', 'STONE_B', 'STONE_C'))); c.nb(st['sides'] + [st['top']])
            x += r.uniform(2.6, 4.4)


def stone_base(c, x0, x1, y0, y1, h=0.35):
    """Low dry-stone base under small buildings (storehouse, shrine)."""
    fr = F(Vector((0, 0, 0)), (0, -1))
    b = c.box(fr, x0, x1, 0.0, h, -y1, -y0, None, skip=('bot',))
    for k in ('out', 'in', 'l', 'r'):
        c.m([b[k]], 'ISHIGAKI', z0=0.0)
    c.m([b['top']], 'STONE_FLAT')
    return b


# ── village pieces (atlas Gassho) ───────────────────────────────────────────

def _quad(c, pts, reg, up=True, **kw):
    f = _face(c.bm, [c.bm.verts.new(p) for p in pts], (0, 0, 1 if up else -1))
    c.m([f], reg, **kw)
    return f


def road(c, L=8.0, width=4.6, ch_w=0.5, ch_d=0.45, bridge=1.6, seed=1):
    """Village road along X: gravel/earth lane in <= 1.3 m bands, grass
    verges, a stone-lined irrigation channel on the +Y side (stone walls,
    water, a stone slab bridge), grass bank beyond. Skirts to -0.5."""
    lod = c.lod
    r = random.Random(seed)
    W2 = width / 2
    xa, xb = -L / 2, L / 2
    y = -W2 + 0.5
    while y < W2 - 0.4 - 1e-3:
        ye = min(W2 - 0.4, y + 1.3)
        _quad(c, [(xa, y, 0.0), (xb, y, 0.0), (xb, ye, 0.0), (xa, ye, 0.0)], 'ROAD')
        y = ye
    _quad(c, [(xa, -W2, 0.0), (xb, -W2, 0.0), (xb, -W2 + 0.5, 0.0), (xa, -W2 + 0.5, 0.0)], 'GRASS')
    _quad(c, [(xa, W2 - 0.4, 0.0), (xb, W2 - 0.4, 0.0), (xb, W2, 0.0), (xa, W2, 0.0)], 'GRASS')
    # channel: stone walls both sides (ishigaki faces), floor, water
    y0, y1 = W2, W2 + ch_w
    fr = F(Vector((0, 0, 0)), (0, -1))
    for yy, n_out in ((y0, 1), (y1, -1)):
        f = _face(c.bm, [c.bm.verts.new(p) for p in ((xa, yy, -ch_d), (xb, yy, -ch_d), (xb, yy, 0.0), (xa, yy, 0.0))], (0, n_out, 0))
        c.m([f], 'ISHIGAKI', z0=-ch_d)
    _quad(c, [(xa, y0, -ch_d), (xb, y0, -ch_d), (xb, y1, -ch_d), (xa, y1, -ch_d)], 'CHANNEL')
    _quad(c, [(xa, y0, -ch_d + 0.2), (xb, y0, -ch_d + 0.2), (xb, y1, -ch_d + 0.2), (xa, y1, -ch_d + 0.2)], 'WATER')
    if lod == 0:   # coping stones on the road side
        x = xa
        while x < xb - 0.2:
            w = min(r.uniform(0.45, 0.7), xb - x)
            c.box(fr, x + 0.01, x + w - 0.01, -0.06, 0.04, -(y0 + 0.02), -(y0 - 0.22), 'STONE', skip=('bot',), metric_z0=-0.06)
            x += w
    _quad(c, [(xa, y1, 0.0), (xb, y1, 0.0), (xb, y1 + 0.9, 0.0), (xa, y1 + 0.9, 0.0)], 'GRASS')
    if bridge is not None:
        c.box(fr, bridge - 0.5, bridge + 0.5, 0.0, 0.12, -(y1 + 0.15), -(y0 - 0.15), 'STONE_FLAT', skip=('bot',), bevel=True)
    for yy in (-W2, y1 + 0.9):
        sg = -1 if yy < 0 else 1
        f = _face(c.bm, [c.bm.verts.new(p) for p in ((xa, yy, -0.5), (xb, yy, -0.5), (xb, yy, 0.0), (xa, yy, 0.0))], (0, sg, 0))
        c.m([f], 'EARTH')


def paddy_edge(c, L=8.0, depth=6.0, drop=0.35, seed=2):
    """Edge of a harvested rice paddy along X: grass bank (aze) at road
    level (y 0..0.6) with a sloping earth face down to the wet field, the
    field in <= 1.3 m bands (stubble rows), a water inlet of stones."""
    r = random.Random(seed)
    xa, xb = -L / 2, L / 2
    _quad(c, [(xa, 0.0, 0.0), (xb, 0.0, 0.0), (xb, 0.6, 0.0), (xa, 0.6, 0.0)], 'GRASS')
    f = _face(c.bm, [c.bm.verts.new(p) for p in ((xa, 0.6, 0.0), (xb, 0.6, 0.0), (xb, 0.9, -drop), (xa, 0.9, -drop))], (0, 0.6, 0.8))
    c.m([f], 'GRASS', z0=-drop)
    y = 0.9
    while y < depth - 1e-3:
        ye = min(depth, y + 1.3)
        _quad(c, [(xa, y, -drop), (xb, y, -drop), (xb, ye, -drop), (xa, ye, -drop)], 'PADDY')
        y = ye
    if c.lod == 0:
        for i in range(5):
            x = xa + 1.5 + i * 0.25
            p = Vector((x, 0.75 + r.uniform(-0.05, 0.05), 0))
            st = K.lathe(c.bm, 5, [(0.16, -drop), (0.12, 0.05)], phase=r.random(), cx=p.x, cy=p.y, cap_bottom=False)
            c.m(st['sides'] + [st['top']], r.choice(('STONE_A', 'STONE_B'))); c.nb(st['sides'])
    f = _face(c.bm, [c.bm.verts.new(p) for p in ((xa, 0.0, -0.5), (xb, 0.0, -0.5), (xb, 0.0, 0.0), (xa, 0.0, 0.0))], (0, -1, 0))
    c.m([f], 'EARTH')


def hasa(c, L=6.0, h=3.2, rows=5, seed=3):
    """Rice-drying rack (hasa): log posts with braces, bamboo rails in rows,
    bundles of rice straw hung over the lower rails (both faces)."""
    lod = c.lod
    r = random.Random(seed)
    fr = F(Vector((0, 0, 0)), (0, -1))
    n = max(2, round(L / 2.0))
    xs = [-L / 2 + L * i / n for i in range(n + 1)]
    for x in xs:
        log(c, [(x, 0, 0.0), (x, 0, h)], 0.07, 6 if lod == 0 else 4)
        if lod == 0 and x in (xs[0], xs[-1]):
            sg = -1 if x == xs[0] else 1
            log(c, [(x, 0, h * 0.7), (x + sg * 0.9, 0, 0.0)], 0.05, 4)
    zs = [0.9 + (h - 1.1) * k / max(rows - 1, 1) for k in range(rows)]
    for z in zs:
        c.tube([(xs[0] - 0.15, 0, z), (xs[-1] + 0.15, 0, z)], 0.035, 5 if lod == 0 else 3, 'BAMBOO', caps=True)
    filled = rows - 2 if lod == 0 else rows - 3
    for k, z in enumerate(zs[:max(filled, 1)]):
        x = xs[0] + 0.1 + r.uniform(0.0, 0.1)
        while x < xs[-1] - 0.25:
            w = r.uniform(0.2, 0.28)
            ln = r.uniform(0.55, 0.75)
            # one bundle straddles the rail; its two halves splay out below (picture: stalks, tie, ears)
            b = c.box(fr, x, x + w, z - ln, z + 0.06, -0.05, 0.05, None, skip=('top', 'bot') if lod else ('top',))
            c.m([b['out'], b['in']], 'HASA_STRAW')
            c.m([f for kk, f in b.items() if kk not in ('out', 'in')], 'STRAW_DARK')
            for v in {v for f in b.values() for v in f.verts}:
                if v.co.z < z - 0.3:
                    v.co.y += (0.13 if v.co.y > 0 else -0.13) * r.uniform(0.8, 1.2)
            x += w + r.uniform(0.0, 0.06) + (0.0 if lod == 0 else 0.12)


# ── small buildings ─────────────────────────────────────────────────────────

def small_house(c, L, B, G, roof, walls='WOOD_TATE', raised=0.0, door=None, seed=0):
    """Box of a small building (storehouse, shed, fire hut) with a mini
    gassho roof: stone or post footing, board walls, plate. Returns T."""
    bm, lod = c.bm, c.lod
    z0 = raised
    if raised > 0:
        for x in (-L / 2 + 0.15, L / 2 - 0.15) + ((0.0,) if L > 3 else ()):
            for y in (-B / 2 + 0.15, B / 2 - 0.15):
                p = Vector((x, y, 0))
                st = K.lathe(bm, 6 if lod == 0 else 4, [(0.22, 0.0), (0.17, raised - 0.1)], cx=p.x, cy=p.y, cap_bottom=False)
                c.m(st['sides'] + [st['top']], 'STONE_FLAT'); c.nb(st['sides'])
                c.box(F(p, (0, -1)), -0.09, 0.09, raised - 0.1, raised, -0.09, 0.09, 'WOOD', skip=('bot',))
        fl = c.box(F(Vector((0, -B / 2, 0)), (0, -1)), -L / 2 - 0.05, L / 2 + 0.05, raised, raised + 0.18, -B - 0.05, 0.05, None,
                   skip=('bot',))
        c.m([fl[k] for k in ('out', 'in', 'l', 'r')], 'WOOD'); c.m([fl['top']], 'WOOD_FLAT')
        z0 = raised + 0.18
    zm = z0 + (G - z0) / 2 if G - z0 > STRIP_H else G
    for za, zb in ((z0, zm), (zm, G)) if zm < G else ((z0, G),):
        b = c.box(F(Vector((0, -B / 2, 0)), (0, -1)), -L / 2, L / 2, za, zb, -B, 0.0, None, skip=('bot', 'top'), bevel=True)
        for k in ('out', 'in', 'l', 'r'):
            c.m([b[k]], walls, z0=za)
    if lod == 0:   # corner posts and a plate
        for x, y in ((-L / 2, -B / 2), (L / 2, -B / 2), (L / 2, B / 2), (-L / 2, B / 2)):
            c.box(F(Vector((x, y, 0)), (0, -1)), -0.07, 0.07, z0, G, -0.07, 0.07, 'WOOD', skip=('bot', 'top'), rotate=True)
    c.box(F(Vector((0, -B / 2, 0)), (0, -1)), -L / 2 - 0.06, L / 2 + 0.06, G - 0.16, G + 0.2, -B - 0.06, 0.06, 'WOOD', skip=('bot', 'top'))
    out = thatch_roof(c, L, B, G + 0.05, seed=seed, **roof)
    T = out['T']
    # gable triangles (boards) at both ends
    for sx in (-1, 1):
        x = sx * L / 2
        f = _face(bm, [bm.verts.new(p) for p in ((x, -T.hw, G), (x, T.hw, G), (x, 0.0, T.Zu))], (sx, 0, 0))
        c.m([f], walls if T.Zu - G <= STRIP_H else flat(walls), z0=G)
    return out


def door_board(c, f, u0, u1, z0, z1, lock=True, sign=None):
    """Heavy board door in a frame, iron lock bar (storehouse, fire hut)."""
    c.box(f, u0 - 0.08, u1 + 0.08, z0, z1 + 0.08, 0.0, 0.06, None, skip=('in',))
    for a, b in ((u0 - 0.08, u0), (u1, u1 + 0.08)):
        c.box(f, a, b, z0, z1 + 0.08, 0.0, 0.08, 'WOOD', skip=('in',), rotate=True)
    c.box(f, u0 - 0.08, u1 + 0.08, z1, z1 + 0.1, 0.0, 0.09, 'WOOD', skip=('in',))
    p = c.box(f, u0, u1, z0, z1, 0.0, 0.04, None, skip=('in', 'l', 'r', 'top', 'bot'))
    c.m([p['out']], 'WOOD_TATE', z0=z0)
    if c.lod == 0:
        for zz in (z0 + 0.2, z1 - 0.3):
            c.box(f, u0 + 0.04, u1 - 0.04, zz, zz + 0.07, 0.04, 0.07, 'WOOD', skip=('in',))
        if lock:
            c.box(f, (u0 + u1) / 2 - 0.2, (u0 + u1) / 2 + 0.2, (z0 + z1) / 2, (z0 + z1) / 2 + 0.05, 0.04, 0.08, 'IRON', skip=('in',))
            c.box(f, (u0 + u1) / 2 - 0.04, (u0 + u1) / 2 + 0.04, (z0 + z1) / 2 - 0.12, (z0 + z1) / 2, 0.06, 0.1, 'IRON')


def shrine(c):
    """Small mountain-god shrine (yama-no-kami hokora): stone base with
    steps, a wooden shrine box on a plinth with a gabled board roof,
    crossed finials (chigi), a rope (shimenawa) - plaque in the dressing."""
    lod = c.lod
    fr = F(Vector((0, 0, 0)), (0, -1))   # u = x, d = -y
    stone_base(c, -0.9, 0.9, -0.7, 0.9, 0.55)
    for z1, d1 in ((0.18, 1.3), (0.37, 1.0)):   # two stone steps up to the base
        c.box(fr, -0.5, 0.5, 0.0, z1, 0.7, d1, 'STONE_FLAT', skip=('bot', 'in'))
    c.box(fr, -0.5, 0.5, 0.55, 0.7, -0.6, 0.45, 'STONE_FLAT', skip=('bot',), bevel=True)
    b = c.box(fr, -0.36, 0.36, 0.7, 1.35, -0.45, 0.3, None, skip=('bot',), bevel=True)
    c.m([b[k] for k in ('out', 'in', 'l', 'r')], 'WOOD_LIGHT'); c.m([b['top']], 'WOOD_LIGHT_FLAT')
    c.box(fr, -0.42, 0.42, 0.7, 0.78, 0.3, 0.5, 'WOOD_LIGHT', skip=('bot',))   # little porch floor
    for u in (-0.38, 0.38):
        c.box(fr, u - 0.03, u + 0.03, 0.78, 1.4, 0.43, 0.49, 'WOOD', skip=('bot',), rotate=True)
    # gabled board roof, ridge along y (gable to the front)
    yc, hw, zr = -0.07, 0.42, 1.7
    poly = [(-0.6, 1.36), (-0.6, 1.4), (0.0, zr + 0.04), (0.6, 1.4), (0.6, 1.36), (0.0, zr)]
    s, c0, c1 = K.poly_prism_x(c.bm, poly, -0.75, 0.62)
    for f in s + [c0, c1]:
        f.normal_update()
    # turn it so the ridge runs along y
    vs = list({v for f in s + [c0, c1] for v in f.verts})
    bmesh.ops.rotate(c.bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Z'))
    bmesh.ops.translate(c.bm, verts=vs, vec=(0, -0.06, 0))
    c.m(s, 'WOOD_GREY_FLAT'); c.m([c0, c1], 'WOOD_FLAT'); c.nb(s + [c0, c1])
    if lod == 0:
        for y in (-0.76, 0.52):   # crossed finials (chigi)
            for sg in (-1, 1):
                c.tube([(sg * 0.07, y, zr - 0.04), (-sg * 0.06, y, zr + 0.16)], 0.016, 4, 'WOOD_GREY_FLAT', caps=True)
        c.tube([(-0.4, -0.52, 1.3), (0.0, -0.53, 1.24), (0.4, -0.52, 1.3)], 0.03, 5, 'STRAW')
        for u in (-0.2, 0.0, 0.2):   # paper streamers (shide)
            c.box(fr, u - 0.03, u + 0.03, 1.02, 1.24, 0.5, 0.505, 'PAPER')


def hydrant_hut(c):
    """Fire hut of a water cannon (hōsuijū-koya): a tiny thatched gassho
    house over the cannon, board walls, red door (sign in the dressing),
    a red standpipe with valve and hose box beside it."""
    small_house(c, 1.6, 1.3, 1.55, dict(ov=0.35, eave=0.45, vt=0.42, eave_h=0.3, sk=0.14, step=0.03, poles=False,
                                         ridge='plain', rafters=False, slope=58.0), seed=11)
    fr = F(Vector((0, -0.65, 0)), (0, -1))
    c.box(F(Vector((0, 0, 0)), (0, -1)), -1.0, 1.0, 0.0, 0.08, -0.9, 1.1, 'STONE_FLAT', skip=('bot',))
    p = c.box(fr, -0.55, 0.55, 0.15, 1.35, 0.0, 0.035, None, skip=('in',))
    c.m([p['out']], 'RED'); c.m([p['l'], p['r'], p['top'], p['bot']], 'WOOD_FLAT')
    if c.lod == 0:
        c.box(fr, -0.03, 0.03, 0.2, 1.3, 0.035, 0.05, 'WOOD', skip=('in',), rotate=True)
        for u in (-0.4, 0.4):
            c.box(fr, u - 0.05, u + 0.05, 0.7, 0.78, 0.035, 0.08, 'IRON')
    p = Vector((1.15, -0.5, 0))   # standpipe
    s = K.lathe(c.bm, 8 if c.lod == 0 else 6, [(0.09, 0.0), (0.09, 0.8), (0.12, 0.85), (0.12, 0.95), (0.0, 1.02)], cx=p.x, cy=p.y,
                cap_bottom=False)
    c.m(s['sides'], 'RED'); c.nb(s['sides'])
    if c.lod == 0:
        c.tube([(1.15, -0.5, 0.6), (1.15, -0.72, 0.6)], 0.05, 6, 'RED', caps=True)
        c.tube([(1.08, -0.5, 1.06), (1.22, -0.5, 1.06)], 0.02, 4, 'IRON', caps=True)


# ── dressing (mesh with atlas GasshoShop) ───────────────────────────────────

def kaki(c, f, u0, u1, z, d, n=5, per=7, seed=0, kind='kaki'):
    """Persimmons (hoshigaki) - or radishes - on strings from a bamboo pole
    under the eave; ropes from the pole to the rafters."""
    r = random.Random(seed)
    c.tube([f(u0 - 0.1, z, d), f(u1 + 0.1, z, d)], 0.022, 5, 'BAMBOO', caps=True)
    if c.lod == 0:
        for u in (u0, u1):
            c.tube([f(u, z, d), f(u, z + 0.5, d - 0.15)], 0.008, 3, 'ROPE')
    for i in range(n):
        u = u0 + (u1 - u0) * (i + 0.5) / n
        L = per * 0.11 + 0.1
        c.tube([f(u, z, d), f(u, z - L, d)], 0.006, 3, 'ROPE')
        if c.lod and i % 2:
            continue
        for k in range(per if c.lod == 0 else 2):
            zz = z - 0.12 - k * 0.11 * (per / (per if c.lod == 0 else 2))
            p = f(u + r.uniform(-0.01, 0.01), 0, d)
            if kind == 'kaki':
                s = K.lathe(c.bm, 4, [(0.0, zz - 0.035), (0.042, zz), (0.0, zz + 0.035)], cx=p.x, cy=p.y, phase=r.random())
                c.m(s['sides'], r.choice(('KAKI', 'KAKI', 'KAKI_DRY')))
            else:
                s = K.lathe(c.bm, 4, [(0.0, zz - 0.3), (0.04, zz - 0.05), (0.03, zz + 0.04)], cx=p.x, cy=p.y, phase=r.random(),
                            cap_top=True)
                c.m(s['sides'] + [s['top']], 'DAIKON')
                if s['top']:
                    c.m([s['top']], 'GREEN')
            c.nb(s['sides'] + ([s['top']] if s['top'] else []))


def ladder(c, f, u, z0, z1, d0, d1, w=0.45):
    """Wooden ladder leaning against the eave (rails and rungs)."""
    rungs = int((z1 - z0) / 0.3)
    for sg in (-1, 1):
        c.tube([f(u + sg * w / 2, z0, d0), f(u + sg * w / 2, z1, d1)], 0.03, 4, 'WOOD_GREY', caps=True)
    if c.lod:
        return
    for k in range(1, rungs):
        t = k / rungs
        z = z0 + (z1 - z0) * t; d = d0 + (d1 - d0) * t
        c.tube([f(u - w / 2, z, d), f(u + w / 2, z, d)], 0.018, 4, 'WOOD_GREY')


def straw_stack(c, f, u, d, seed=0, n=6):
    """Rice straw bundles (wara) stood in a little stook against the wall."""
    r = random.Random(seed)
    for i in range(n if c.lod == 0 else 2):
        a = 2 * math.pi * i / n + r.uniform(-0.2, 0.2)
        p = f(u, 0, d) + Vector((math.cos(a), math.sin(a), 0)) * 0.18
        top = f(u, 1.05, d)
        s = K.lathe(c.bm, 4, [(0.09, 0.0), (0.07, 0.75)], cx=p.x, cy=p.y, phase=r.random(), cap_bottom=False)
        for v in s['rings'][1]:
            v.co.x += (top.x - p.x) * 0.55; v.co.y += (top.y - p.y) * 0.55
        c.m(s['sides'], 'STRAW'); c.m([s['top']], 'STRAW_DARK'); c.nb(s['sides'] + [s['top']])
    s = K.lathe(c.bm, 6 if c.lod == 0 else 4, [(0.22, 0.75), (0.0, 1.15)], cx=f(u, 0, d).x, cy=f(u, 0, d).y, cap_bottom=True)
    c.m(s['sides'] + [s['bottom']], 'STRAW_DARK'); c.nb(s['sides'])


def tub(c, f, u, d, r=0.28, h=0.4, reg='WOOD_GREY'):
    p = f(u, 0, d)
    s = K.lathe(c.bm, 8, [(r * 0.85, 0.0), (r, h)], cx=p.x, cy=p.y, cap_bottom=False, cap_top=True)
    c.m(s['sides'], reg); c.m([s['top']], 'WOOD_DARK'); c.nb(s['sides'])
    if c.lod == 0:
        for zz in (0.08, h - 0.1):
            b = K.lathe(c.bm, 8, [(r * (0.88 + 0.12 * zz / h) + 0.01, zz), (r * (0.88 + 0.12 * zz / h) + 0.01, zz + 0.03)],
                        cx=p.x, cy=p.y, cap_bottom=False, cap_top=False)
            c.m(b['sides'], 'BAMBOO'); c.nb(b['sides'])


def washi_boards(c, f, u0, u1, d):
    """Washi drying boards leaning on a rail against the wall, sheets of
    fresh paper on their faces (Gokayama paper making)."""
    n = max(1, int((u1 - u0) / 0.7))
    for i in range(n):
        u = u0 + (u1 - u0) * (i + 0.5) / n
        b = c.box(f, u - 0.28, u + 0.28, 0.05, 1.85, d - 0.03, d, None)
        for v in {v for x in b.values() for v in x.verts}:
            v.co += f.n * (-(v.co.z / 1.85) * 0.35)
        c.m([b[k] for k in ('in', 'l', 'r', 'top', 'bot')], 'WOOD_LIGHT'); c.m([b['out']], 'WOOD_LIGHT')
        s = c.box(f, u - 0.22, u + 0.22, 0.3, 1.6, d, d + 0.004, None, skip=('in', 'l', 'r', 'top', 'bot'))
        for v in s['out'].verts:
            v.co += f.n * (-(v.co.z / 1.85) * 0.35)
        c.m([s['out']], 'PAPER')
    c.box(f, u0 - 0.1, u1 + 0.1, 0.0, 0.12, d - 0.1, d + 0.05, 'WOOD_DARK', skip=('bot',))
