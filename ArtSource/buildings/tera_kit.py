"""Tera kit (temples and shrines: Nara/Kyoto mountain temples like
Kiyomizu-dera and Murō-ji, rural village shrines): main hall, gates, bell
tower, shrine halls, pagoda, small precinct buildings, walls, paths, and the
dressing of a busy precinct (flags, lanterns, ema, omikuji, incense burner).

Machinery from the Koedo/Gassho/Minato kits (C, F frames, prism_u, lbox,
`GK.map_axes`, `edge_frame`). New here:
- the curved temple roof (`Roof`): one height field over the plan, z =
  eave + g(d) + lift, d = depth in from the eave. g is concave (flat at the
  eave, steep at the ridge: sori), lift raises the eave towards the corners
  (noki-zori). Kinds: hip (yosemune, pagoda tiers), irimoya (hip below, gable
  above), gable (kirizuma), shed (pent roof over steps, kōhai). Tile rows
  are geometry (crests of a corrugated surface, one per tile row); copper and
  bark roofs are smooth with a thick layered edge. Slopes meet at the hips
  under the hip ridges (kudamune);
- eave: tile ends + boards on the fascia (one texture period per tile row),
  soffit, rafters (taruki) with white ends, corner beam (sumigi) with a
  metal cap and wind bell;
- bracket sets (kumimono) as stepped geometry: bearing block, arms along
  the wall and out, small blocks, the eave purlin they carry;
- round columns on stone bases, tie beams and nageshi, walls between
  columns: lattice doors, board doors with fittings, plaster, renji windows,
  shitomi; raised floor with veranda, railing (kōran) and steps.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
from kit import core as K
from buildings.tokyo_kit import F, lbox
from buildings import koedo_kit as KK
from buildings import gassho_kit as GK
from buildings.koedo_kit import C, prism_u, orient, tile_row

ZV = Vector((0, 0, 1))
SIDES = {'S': 0, 'E': 1, 'N': 2, 'W': 3}


def _face(c, pts, out):
    vs = []
    for p in pts:
        if isinstance(p, bmesh.types.BMVert):
            if not vs or vs[-1] is not p:
                vs.append(p)
        else:
            vs.append(c.bm.verts.new(p))
    if len(vs) > 2 and vs[0] is vs[-1]:
        vs.pop()
    if len(vs) < 3:
        return None
    f = c.bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(Vector(out)) < 0:
        f.normal_flip()
    return f


def frame(L, B, e, inset=0.0):
    """Wall frame of side e (0 S, 1 E, 2 N, 3 W) of the box L x B centred on
    the origin, u from the left corner seen from outside, the wall plane
    moved in by inset."""
    corners = [(-L / 2, -B / 2), (L / 2, -B / 2), (L / 2, B / 2), (-L / 2, B / 2)]
    c0 = Vector((*corners[e], 0)); c1 = Vector((*corners[(e + 1) % 4], 0))
    t = (c1 - c0).normalized()
    n = Vector((t.y, -t.x, 0))
    f = F(c0 - n * inset, n)
    f.u0, f.u1 = 0.0, (L, B, L, B)[e]
    return f


def uvset(c, f, uvs):
    lay = c.bm.loops.layers.uv.verify()
    for l, uv in zip(f.loops, uvs):
        l[lay].uv = uv


# ── the curved roof ─────────────────────────────────────────────────────────

class Roof:
    """Height field of a temple roof over the eave rectangle +-Ex x +-Ey
    (the outer line of the tile ends at the middle of each side, before the
    corner lift). d = depth in from the eave of a side, a = position along
    that side (from its middle). ze = top of the tiles at the eave middle.
    s0 / s1 = pitch at the eave / at the ridge (D = Ey: front and back meet).
    lift = corner rise at the eave, fading up the slope and along the eave
    (decay length lam). irimoya: the hips stop at depth dg, above it the
    front/back slopes run on as a gable to +-Xg (gable wall at Ex - dg,
    overhang og). gable: front/back only, verges at +-Ex. hip with top < D:
    a band (pagoda tier) ending flat at depth top."""

    def __init__(self, kind, Ex, Ey, ze, s0=0.35, s1=0.95, lift=0.5, lam=None, dg=None, og=0.6, top=None,
                 ov=1.8, tk=0.36, su=0.22):
        self.kind, self.Ex, self.Ey, self.ze = kind, Ex, Ey, ze
        self.s0, self.s1, self.Lc = s0, s1, lift
        self.D = Ey
        self.top = self.D if top is None else top
        self.lam = lam or 0.22 * max(Ex, Ey)
        if kind == 'irimoya':
            self.dg = dg if dg is not None else 0.45 * Ey
            self.Xg = Ex - self.dg + og
        elif kind in ('gable', 'shed'):
            self.dg, self.Xg = 0.0, Ex
        else:
            self.dg, self.Xg = self.top, None
        self.ov, self.tk, self.su = ov, tk, su     # eave depth to the wall line, fascia height, soffit pitch
        self._arc = None

    def g(self, d):
        return self.s0 * d + (self.s1 - self.s0) * d * d / (2 * self.D)

    def A(self, side):
        return self.Ex if side in 'SN' else self.Ey

    def h(self, side, a, d):
        """Distance along the eave contour to the hip (0 on the hip line)."""
        A = self.A(side)
        if self.kind in ('gable', 'shed'):
            return max(0.0, A - abs(a))
        return max(0.0, A - d - abs(a))

    def lift(self, side, a, d):
        if not self.Lc:
            return 0.0
        return self.Lc * math.exp(-self.h(side, a, d) / self.lam) * max(0.0, 1 - d / self.D) ** 2

    def z(self, side, a, d):
        return self.ze + self.g(d) + self.lift(side, a, d)

    def xy(self, side, a, d):
        Ex, Ey = self.Ex, self.Ey
        return {'S': (a, -(Ey - d)), 'N': (-a, Ey - d), 'E': (Ex - d, a), 'W': (-(Ex - d), -a)}[side]

    def p(self, side, a, d, dz=0.0, dd=0.0):
        """Point on the roof surface (dd: further out from the eave, horizontally)."""
        x, y = self.xy(side, a, d - dd)
        return Vector((x, y, self.z(side, a, d) + dz))

    def out(self, side):
        return {'S': Vector((0, -1, 0)), 'N': Vector((0, 1, 0)), 'E': Vector((1, 0, 0)), 'W': Vector((-1, 0, 0))}[side]

    def along(self, side):
        return {'S': Vector((1, 0, 0)), 'N': Vector((-1, 0, 0)), 'E': Vector((0, 1, 0)), 'W': Vector((0, -1, 0))}[side]

    def arc(self, d):
        """Slope length from the eave to depth d (middle of a side, no lift)."""
        n = 24
        s, prev = 0.0, 0.0
        for k in range(1, n + 1):
            t = d * k / n
            s += math.hypot(t - prev, self.g(t) - self.g(prev))
            prev = t
        return s

    def rows(self, d0, d1, band, extra=()):
        """Depths from d0 to d1 in bands of at most `band` metres of slope."""
        L = self.arc(d1) - self.arc(d0)
        n = max(2, math.ceil(L / band - 1e-6))
        ds = [d0 + (d1 - d0) * k / n for k in range(n + 1)]
        # refine by slope length (the slope steepens up the roof)
        tgt = [self.arc(d0) + L * k / n for k in range(n + 1)]
        out = [d0]
        for t in tgt[1:-1]:
            lo, hi = d0, d1
            for _ in range(30):
                m = (lo + hi) / 2
                if self.arc(m) < t:
                    lo = m
                else:
                    hi = m
            out.append((lo + hi) / 2)
        out.append(d1)
        return sorted(set([round(x, 5) for x in out + [e for e in extra if d0 < e < d1]]))

    def zu(self, side, a, d):
        """Soffit under the eave: from the fascia foot (d = 0) up to the wall
        line (d = ov) at pitch su, lifted like the roof."""
        return self.ze - self.tk + self.su * d + self.lift(side, a, d)


def _knots(a0, a1, step, extra=(), phase=0.0):
    ks = {round(a0, 5), round(a1, 5)}
    k = math.ceil((a0 - phase) / step)
    while phase + k * step < a1 - 1e-4:
        a = phase + k * step
        if a > a0 + 1e-4:
            ks.add(round(a, 5))
        k += 1
    ks |= {round(e, 5) for e in extra if a0 - 1e-6 <= e <= a1 + 1e-6}
    return sorted(ks)


def crest_w(a, pitch):
    """0 in the pan-tile valley (a = k * pitch), 1 on the round cover tile."""
    return 1 - abs(((a / pitch) % 1.0) - 0.5) * 2


def roof_surface(c, R, reg='KAWARA', pitch=0.4, amp=0.07, side_list='SNEW'):
    """Top surface of the roof: per side a grid over (a, d), clipped at the
    hips, crests raised by amp (tile rows). Returns {side: {(a, d): vert}}
    of the eave row (for the fascia) and the knots used."""
    lod = c.lod
    corr = amp > 0 and lod == 0
    if not corr:
        amp = 0.0
    band = c.R(reg)['h_m'] - 0.06
    reg_d = c.R(reg)
    u0, v0, u1, v1 = reg_d['uv']
    lay = c.bm.loops.layers.uv.verify()
    out_rows = {}
    smooth_step = 0.7 if lod == 0 else 1.6
    for side in side_list:
        if R.kind == 'shed' and side != 'S':
            continue
        if R.kind == 'gable' and side in 'EW':
            continue
        A = R.A(side)
        parts = []       # (a0, a1, d0, d1, clip)
        if side in 'SN':
            if R.kind == 'irimoya':
                parts = [(-A, A, 0.0, R.dg, True), (-R.Xg, R.Xg, R.dg, R.D, False)]
            elif R.kind in ('gable', 'shed'):
                parts = [(-A, A, 0.0, R.top, False)]
            else:
                parts = [(-A, A, 0.0, R.top, True)]
        else:
            if R.kind == 'irimoya':
                parts = [(-A, A, 0.0, R.dg, True)]
            else:
                parts = [(-A, A, 0.0, min(R.top, R.Ey), True)]
        cache = {}
        extra = [0.0]
        if R.kind == 'irimoya' and side in 'SN':
            extra += [R.Ex - R.dg, -(R.Ex - R.dg)]
        # corner refinement (the lift curls up within ~lam of the hip)
        ref = [A - R.lam * t for t in (0.15, 0.35, 0.7, 1.2)]
        extra += ref + [-r for r in ref]

        def V(a, d, cache=cache, side=side):     # bind per side (late binding gave every side the last one)
            key = (round(a, 5), round(d, 5))
            v = cache.get(key)
            if v is None:
                w = crest_w(a, pitch) if corr else 0.0
                v = c.bm.verts.new(R.p(side, a, d, dz=amp * w))
                cache[key] = v
            return v
        for a0, a1, d0, d1, clip in parts:
            ks = _knots(a0, a1, pitch / 2, extra) if corr else _knots(a0, a1, smooth_step, extra)
            rs = R.rows(d0, d1, band)
            ar = {d: R.arc(d) for d in rs}
            for aL, aR in zip(ks, ks[1:]):
                eL = (A - abs(aL)) if clip else 1e9
                eR = (A - abs(aR)) if clip else 1e9
                for i in range(len(rs) - 1):
                    r0, r1 = rs[i], rs[i + 1]
                    dl0, dl1 = min(r0, eL), min(r1, eL)
                    dr0, dr1 = min(r0, eR), min(r1, eR)
                    if dl0 >= dl1 - 1e-6 and dr0 >= dr1 - 1e-6:
                        continue
                    pts = [(aL, dl0), (aR, dr0), (aR, dr1), (aL, dl1)]
                    vs, keep = [], []
                    for a, d in pts:
                        vv = V(a, d)
                        if not vs or vs[-1] is not vv:
                            vs.append(vv); keep.append((a, d))
                    if vs[0] is vs[-1]:
                        vs.pop(); keep.pop()
                    if len(vs) < 3:
                        continue
                    f = c.bm.faces.new(vs)
                    f.normal_update()
                    if f.normal.z < 0:
                        f.normal_flip()
                    base = ar[r0]
                    for l in f.loops:
                        a, d = next(k for k, vv in zip(keep, vs) if vv is l.vert)
                        vv_ = (R.arc(d) - base) / reg_d['h_m']
                        l[lay].uv = (a / reg_d['w_m'], v0 + min(max(vv_, 0.0), 1.0) * (v1 - v0))
                    c.nb([f])
            if d0 == 0.0:
                out_rows[side] = (ks, V)
    return out_rows


def eave(c, R, rows, pitch=0.4, amp=0.07, kind='tile', fascia_reg='FASCIA', soffit='BOARD_FLAT', side_list='SNEW'):
    """Fascia (tile ends over two boards, or the thick edge of a copper/bark
    roof) under the eave row of every side, and the soffit back to the wall
    line. Fascia verts are shared with the roof surface (closed edge)."""
    lod = c.lod
    corr = amp > 0 and lod == 0
    lay = c.bm.loops.layers.uv.verify()
    tk = R.tk
    for side, (ks, V) in rows.items():
        A = R.A(side)
        o = R.out(side)
        if kind == 'tile':
            reg = c.R(fascia_reg)
            u0, v0, u1, v1 = reg['uv']
            per = 0.4 / reg['w_m']        # one texture period (0.4 m) = one tile row
        bots = [a for a in ks if not corr or crest_w(a, pitch) < 0.02 or a in (ks[0], ks[-1])]
        Bv = {a: c.bm.verts.new(R.p(side, a, 0.0, dz=-tk)) for a in bots}
        for aL, aR in zip(bots, bots[1:]):
            tops = [a for a in ks if aL - 1e-6 <= a <= aR + 1e-6]
            vs = [Bv[aL], Bv[aR]] + [V(a, 0.0) for a in reversed(tops)]
            f = c.bm.faces.new(vs)
            f.normal_update()
            if f.normal.dot(o) < 0:
                f.normal_flip()
            c.nb([f])
            if kind == 'tile':
                for l in f.loops:
                    co = l.vert.co
                    a = co.dot(R.along(side))
                    zb = R.z(side, a, 0.0) - tk
                    l[lay].uv = (a / pitch * per, v0 + min(max((co.z - zb) / reg['h_m'], 0), 1) * (v1 - v0))
            else:
                c.m([f], fascia_reg)
        # soffit: fascia foot back to the wall line, clipped at the hips
        if R.kind in ('gable', 'shed') and side in 'EW':
            continue
        clip = R.kind not in ('gable', 'shed')
        ov = R.ov
        sk = bots if lod == 0 else _knots(-A, A, 1.6, [A - R.lam * t for t in (0.3, 1.0)] + [-(A - R.lam * t) for t in (0.3, 1.0)])
        S = {}

        def SV(a, d):
            key = (round(a, 5), round(d, 5))
            if key not in S:
                if d == 0.0 and a in Bv:
                    S[key] = Bv[a]
                else:
                    x, y = R.xy(side, a, d)
                    S[key] = c.bm.verts.new((x, y, R.zu(side, a, d)))
            return S[key]
        fs = []
        for aL, aR in zip(sk, sk[1:]):
            eL = (A - abs(aL)) if clip else 1e9
            eR = (A - abs(aR)) if clip else 1e9
            pts = [(aL, 0.0), (aR, 0.0), (aR, min(ov, eR)), (aL, min(ov, eL))]
            vs = []
            for a, d in pts:
                vv = SV(a, d)
                if not vs or vs[-1] is not vv:
                    vs.append(vv)
            if vs[0] is vs[-1]:
                vs.pop()
            if len(vs) < 3:
                continue
            f = c.bm.faces.new(vs)
            f.normal_update()
            if f.normal.z > 0:
                f.normal_flip()
            fs.append(f)
        c.m(fs, soffit); c.nb(fs)


def rafters(c, R, spacing=0.4, w=0.09, h=0.11, reg='WOOD_FLAT', end='GOFUN', side_list='SNEW', stick=0.06):
    """Rafters (taruki) under the soffit, square to the eave, stopping at the
    hip diagonal; ends a little proud of the fascia foot, painted white."""
    if c.lod:
        return
    for side in side_list:
        if R.kind in ('gable', 'shed') and side in 'EW':
            continue
        A = R.A(side)
        o, t = R.out(side), R.along(side)
        n = int(2 * (A - 0.15) / spacing)
        clip = R.kind not in ('gable', 'shed')
        for k in range(n + 1):
            a = -(A - 0.15) + 2 * (A - 0.15) * k / n
            dmax = min(R.ov, (A - abs(a)) if clip else R.ov) - 0.02
            if dmax < 0.15:
                continue
            p0 = Vector((*R.xy(side, a, -stick), 0)); p1 = Vector((*R.xy(side, a, dmax), 0))
            z0 = R.zu(side, a, 0.0) - 0.005 - R.su * stick; z1 = R.zu(side, a, dmax) - 0.005
            vs = []
            for p, z in ((p0, z0), (p1, z1)):
                vs.append([c.bm.verts.new(p + t * s * w / 2 + ZV * (z - dz)) for s, dz in ((-1, 0), (1, 0), (1, h), (-1, h))])
            a_, b_ = vs
            faces = [c.bm.faces.new([a_[1], b_[1], b_[2], a_[2]]), c.bm.faces.new([a_[3], b_[3], b_[0], a_[0]]),
                     c.bm.faces.new([a_[2], b_[2], b_[3], a_[3]])]
            orient(faces, (p0 + p1) / 2 + ZV * ((z0 + z1) / 2 - h / 2))
            cap = c.bm.faces.new(a_)
            cap.normal_update()
            if cap.normal.dot(o) < 0:
                cap.normal_flip()
            c.m(faces, reg, rotate=False); c.m([cap], end); c.nb(faces + [cap])


def corner_beams(c, R, reg='WOOD_FLAT', cap='GOLD', bell=True, w=0.16, h=0.22):
    """Corner beam (sumigi) along each hip diagonal under the soffit, with a
    metal end cap; a small wind bell (fūtaku) hangs from it."""
    if R.kind in ('gable', 'shed'):
        return
    for sx in (-1, 1):
        for sy in (-1, 1):
            side = 'S' if sy < 0 else 'N'
            a = sx * R.Ex if side == 'S' else -sx * R.Ex
            p_out = Vector((sx * (R.Ex + 0.18), sy * (R.Ey + 0.18), 0))
            dd = min(R.ov, 1.6)
            p_in = Vector((sx * (R.Ex - dd), sy * (R.Ey - dd), 0))
            z_out = R.zu(side, a, 0.0) - 0.02
            z_in = R.zu(side, a - sx * dd * (1 if side == 'S' else -1), dd) - 0.02
            dirn = (p_out - p_in).normalized()
            side_v = dirn.cross(ZV).normalized()
            vs = []
            for p, z in ((p_in, z_in), (p_out, z_out + 0.06)):
                vs.append([c.bm.verts.new(p + side_v * s * w / 2 + ZV * (z - dz)) for s, dz in ((-1, h), (1, h), (1, 0), (-1, 0))])
            A_, B_ = vs
            fs = [c.bm.faces.new([A_[k], A_[(k + 1) % 4], B_[(k + 1) % 4], B_[k]]) for k in range(4)]
            orient(fs, (p_in + p_out) / 2 + ZV * ((z_in + z_out) / 2 - h / 2))
            endf = c.bm.faces.new(B_)
            endf.normal_update()
            if endf.normal.dot(dirn) < 0:
                endf.normal_flip()
            c.m(fs, reg); c.m([endf], cap); c.nb(fs + [endf])
            if c.lod == 0:
                if bell:
                    bp = p_out - dirn * 0.1
                    zb = z_out + 0.06 - h
                    c.tube([(bp.x, bp.y, zb), (bp.x, bp.y, zb - 0.25)], 0.008, 3, 'IRON')
                    r = K.lathe(c.bm, 6, [(0.0, zb - 0.62), (0.09, zb - 0.6), (0.08, zb - 0.4), (0.05, zb - 0.3), (0.0, zb - 0.25)],
                                cx=bp.x, cy=bp.y, cap_bottom=False, cap_top=False)
                    c.m(r['sides'], 'BRONZE'); c.nb(r['sides'])


def _sweep_rect(c, pts, w, h, reg, ends=True, up=ZV, z_bot=0.0):
    """Rectangular ridge (w wide, h tall above the points) swept along a
    polyline: top and both sides; end caps optional."""
    P = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        s = t.cross(up).normalized()
        rings.append([c.bm.verts.new(p + s * sg * w / 2 + up * dz) for sg, dz in ((-1, z_bot), (1, z_bot), (1, h), (-1, h))])
    fs = []
    for A_, B_ in zip(rings, rings[1:]):
        for k in (0, 1, 2):
            fs.append(c.bm.faces.new([A_[(k + 1) % 4], A_[(k + 2) % 4], B_[(k + 2) % 4], B_[(k + 1) % 4]]))
    cen = sum(P, Vector()) / len(P)
    for f in fs:
        f.normal_update()
    # orient each side face away from the ridge axis (local test per face)
    for i, (A_, B_) in enumerate(zip(rings, rings[1:])):
        mid = (P[i] + P[i + 1]) / 2 + up * (h / 2)
        for f in fs[3 * i:3 * i + 3]:
            if f.normal.dot(f.calc_center_median() - mid) < 0:
                f.normal_flip()
    caps = []
    if ends:
        for ring, sg in ((rings[0], -1), (rings[-1], 1)):
            f = c.bm.faces.new(ring)
            f.normal_update()
            d = (P[-1] - P[-2]) if sg > 0 else (P[0] - P[1])
            if f.normal.dot(d) < 0:
                f.normal_flip()
            caps.append(f)
    c.m(fs + caps, reg); c.nb(fs + caps)
    return fs, caps


def ridges(c, R, kind='tile', ridge_h=0.7, ridge_w=0.5, hip_h=0.32, hip_w=0.32, oni=1.0, shibi=False):
    """Main ridge (stacked noshi tiles with a round cap and onigawara or
    shibi at the ends), hip ridges down the hip lines (lower hips of an
    irimoya end at the gable foot), descending ridges along the gable verges."""
    lod = c.lod
    tile = kind == 'tile'
    reg = 'TILE_DARK' if tile else ('COPPER_FLAT' if kind == 'copper' else 'HIWADA_FLAT')
    D = R.D
    zr = R.z('S', 0.0, D)
    if R.kind == 'irimoya' or R.kind == 'gable':
        xr = R.Xg - (0.25 if tile else 0.1)
    elif R.kind == 'hip':
        xr = R.Ex - D
    else:
        xr = None
    if R.kind == 'shed':
        xr = None
    if xr is not None and xr > 0.3 and R.top >= D - 1e-6:
        # stacked ridge: courses of noshi tiles stepping in, round cap on top
        layers = 5 if lod == 0 else 1
        hh = ridge_h
        poly = [(-ridge_w / 2 - 0.05, zr - 0.25), (-ridge_w / 2, zr + 0.1)]
        for k in range(layers):
            z = zr + 0.1 + hh * (k + 1) / layers
            y = -ridge_w / 2 + 0.02 * k
            poly += [(y, z - 0.03), (y, z)] if lod == 0 else [(y, z)]
        poly += [(-y, z) for y, z in reversed(poly)]
        sides, c0, c1 = K.poly_prism_x(c.bm, poly, -xr, xr)
        c.m(sides, reg); c.m([c0, c1], reg); c.nb(sides + [c0, c1])
        ztop = zr + 0.1 + hh
        if tile:
            fs = tile_row(c.bm, (-xr, 0, ztop), (xr, 0, ztop), 0.13, 6 if lod == 0 else 3, (0, 1, 0))
            c.m(fs, 'TILE_A'); c.nb(fs)
            for sx in (-1, 1):
                if shibi:
                    _shibi(c, sx * xr, ztop, scale=oni)
                else:
                    _oni(c, sx * xr, zr, ztop, oni)
        R.ridge_top = ztop + (0.13 if tile else 0.0)
    else:
        R.ridge_top = zr
    # hip ridges: along the hip diagonal from the corner up to dg (irimoya) or the ridge end
    if R.kind in ('hip', 'irimoya'):
        dmax = R.dg if R.kind == 'irimoya' else min(R.top, D)
        nseg = 6 if lod == 0 else 3
        for sx in (-1, 1):
            for sy in (-1, 1):
                pts = []
                for k in range(nseg + 1):
                    d = dmax * (k / nseg) ** 0.8
                    x, y = sx * (R.Ex - d), sy * (R.Ey - d)
                    side = 'S'
                    pts.append(Vector((x, y, R.z('S', R.Ex - d, d) - 0.03)))
                pts[0] = pts[0] + Vector((sx * 0.12, sy * 0.12, 0.05))
                _sweep_rect(c, pts, hip_w, hip_h, reg)
                if tile and lod == 0:   # small end tile (oni) at the foot of each hip ridge
                    p = pts[0]
                    dirn = Vector((sx, sy, 0)).normalized()
                    sv = dirn.cross(ZV)
                    q = [p + sv * s * 0.2 + ZV * z for s, z in ((-1, -0.05), (1, -0.05), (1, 0.42), (0, 0.55), (-1, 0.42))]
                    f = _face(c, q, dirn)
                    back = _face(c, [x - dirn * 0.08 for x in q], -dirn)
                    c.m([f], 'ONI'); c.m([back], 'TILE_DARK')
    # gable verge ridges (kudari-mune) of irimoya and gable roofs
    if R.kind in ('irimoya', 'gable') and lod == 0 and tile:
        d0 = R.dg
        for sx in (-1, 1):
            for side in ('S', 'N'):
                xx = R.Xg - 0.25
                a = xx if side == 'S' else -xx
                a = sx * abs(a) * (1 if side == 'S' else -1)
                pts = []
                n = 5
                for k in range(n + 1):
                    d = d0 + (D - d0) * k / n
                    pts.append(R.p(side, a, d, dz=-0.02))
                _sweep_rect(c, pts, 0.26, 0.26, reg)
    return R.ridge_top


def _oni(c, x, zr, ztop, s=1.0):
    """Onigawara at a ridge end: a fired tile plate with a crest, facing out."""
    sx = 1 if x > 0 else -1
    half = [(-0.55, 0.0), (-0.55, 0.6), (-0.48, 0.95), (-0.36, 1.25), (-0.2, 1.05), (0.0, 1.15)]
    if c.lod:
        half = [(-0.5, 0.0), (-0.5, 0.75), (0.0, 1.0)]
    h = (ztop - zr + 0.4)
    poly = [(y * s, zr - 0.25 + z * h * 0.95 * s) for y, z in half] + [(-y * s, zr - 0.25 + z * h * 0.95 * s) for y, z in reversed(half[:-1])]
    xa, xb = sorted((x - sx * 0.05, x + sx * 0.14))
    sides, c0, c1 = K.poly_prism_x(c.bm, poly, xa, xb)
    c.m(sides + [c0 if sx > 0 else c1], 'TILE_DARK')
    c.m([c1 if sx > 0 else c0], 'ONI')
    c.nb(sides)


def _shibi(c, x, ztop, scale=1.0):
    """Shibi: fish-tail ridge ornament (Nara-period halls), curving inward."""
    sx = 1 if x > 0 else -1
    s = scale
    prof = [(0.0, 0.0), (0.0, 0.5), (-0.05, 0.9), (-0.18, 1.3), (-0.42, 1.5), (-0.5, 1.3), (-0.45, 0.8), (-0.5, 0.3), (-0.55, 0.0)]
    poly = [(sx * (-px) * s * 1.0 + x, ztop + pz * s) for px, pz in prof]   # (x, z) in the ridge plane
    w = 0.2 * s
    vs0 = [c.bm.verts.new((px, -w, pz)) for px, pz in poly]
    vs1 = [c.bm.verts.new((px, w, pz)) for px, pz in poly]
    fs = [_face(c, vs0, (0, -1, 0)), _face(c, vs1, (0, 1, 0))]
    n = len(poly)
    for i in range(n):
        f = c.bm.faces.new([vs0[i], vs0[(i + 1) % n], vs1[(i + 1) % n], vs1[i]])
        fs.append(f)
    cen = Vector((sum(p[0] for p in poly) / n, 0, sum(p[1] for p in poly) / n))
    orient(fs[2:], cen)
    c.m(fs, 'GOLD'); c.nb(fs)


def gable_wall(c, R, reg='BOARD', lattice=True, gegyo=True):
    """Gable of an irimoya (tsuma) at x = +-(Ex - dg) under the gable roof,
    and the barge boards (hafu) along the verges at +-Xg with the soffit
    under the verge overhang; for gable roofs the verges at +-Ex."""
    lod = c.lod
    rows = R.rows(R.dg, R.top if R.kind == 'shed' else R.D, 0.8)
    for sx in (-1, 1):
        xw = sx * (R.Ex - R.dg) if R.kind == 'irimoya' else None
        # gable triangle (both slopes), under the soffit line
        if xw is not None:
            pts = []
            for d in rows:
                pts.append(Vector((xw, -(R.Ey - d), R.z('S', R.Ex - R.dg, d) - R.tk * 0.9)))
            for d in reversed(rows[:-1]):
                pts.append(Vector((xw, R.Ey - d, R.z('S', R.Ex - R.dg, d) - R.tk * 0.9)))
            zb = R.z('S', R.Ex - R.dg, R.dg) - R.tk * 0.9
            f = _face(c, pts, (sx, 0, 0))
            c.m([f], reg if not lattice else 'BOARD_FLAT')
            if lattice and lod == 0:   # kitsure-goshi: vertical lattice battens over the gable
                n = int(2 * (R.Ey - R.dg) / 0.45)
                for k in range(1, n):
                    y = -(R.Ey - R.dg) + 2 * (R.Ey - R.dg) * k / n
                    d = R.Ey - abs(y)
                    zt = R.z('S', R.Ex - R.dg, d) - R.tk * 0.9 - 0.03
                    c.box(F(Vector((xw, 0, 0)), (sx, 0)), y * sx - 0.025, y * sx + 0.025, zb + 0.05, zt, 0.0, 0.04, 'WOOD', skip=('in', 'bot', 'top'), rotate=True)
            # skirt board at the gable foot (where the lower hip roof meets the gable)
            c.box(F(Vector((xw, 0, 0)), (sx, 0)), -(R.Ey - R.dg), R.Ey - R.dg, zb - 0.02, zb + 0.28, 0.0, 0.1, 'WOOD', skip=('in',))
        # barge boards (hafu) along the verge, both slopes, curved with the roof
        xg = sx * R.Xg
        for side in (('S',) if R.kind == 'shed' else ('S', 'N')):
            for k in range(len(rows) - 1):
                da, db = rows[k], rows[k + 1]
                pa = Vector((xg, -(R.Ey - da) if side == 'S' else R.Ey - da, R.z(side, R.Xg, da)))
                pb = Vector((xg, -(R.Ey - db) if side == 'S' else R.Ey - db, R.z(side, R.Xg, db)))
                hb = 0.38
                q = [pa + ZV * 0.04, pb + ZV * 0.04, pb - ZV * hb, pa - ZV * hb]
                o = _face(c, [x + Vector((sx * 0.06, 0, 0)) for x in q], (sx, 0, 0))
                bot = _face(c, [pa - ZV * hb + Vector((sx * 0.06, 0, 0)), pb - ZV * hb + Vector((sx * 0.06, 0, 0)),
                               pb - ZV * hb - Vector((sx * 0.06, 0, 0)), pa - ZV * hb - Vector((sx * 0.06, 0, 0))], (0, 0, -1))
                inn = _face(c, [x - Vector((sx * 0.06, 0, 0)) for x in q], (-sx, 0, 0))
                c.m([o, bot, inn], 'WOOD_FLAT'); c.nb([o, bot, inn])
            # verge soffit from the gable wall (or wall line) out to the hafu
            xin = sx * ((R.Ex - R.dg) if R.kind == 'irimoya' else (R.Ex - R.ov))
            vs = []
            for k in range(len(rows) - 1):
                da, db = rows[k], rows[k + 1]
                ya = -(R.Ey - da) if side == 'S' else R.Ey - da
                yb = -(R.Ey - db) if side == 'S' else R.Ey - db
                za = R.z(side, R.Xg, da) - R.tk * 0.9; zb_ = R.z(side, R.Xg, db) - R.tk * 0.9
                f = _face(c, [(xin, ya, za), (xg, ya, za), (xg, yb, zb_), (xin, yb, zb_)], (0, 0, -1))
                c.m([f], 'BOARD_FLAT'); c.nb([f])
        if gegyo and lod == 0 and R.kind != 'shed':   # gegyo: ornament board hanging at the apex
            zt = R.z('S', R.Xg, R.D) - 0.1
            q = [(xg + sx * 0.08, -0.35, zt), (xg + sx * 0.08, 0.35, zt), (xg + sx * 0.08, 0.2, zt - 0.55), (xg + sx * 0.08, 0.0, zt - 0.7),
                 (xg + sx * 0.08, -0.2, zt - 0.55)]
            f = _face(c, q, (sx, 0, 0))
            c.m([f], 'GOFUN'); c.nb([f])
        # the lower edge of the gable roof above the hip roof (irimoya)
        if R.kind == 'irimoya':
            for side in ('S', 'N'):
                a0, a1 = R.Ex - R.dg, R.Xg
                pts = []
                for a in (a0, a1):
                    aa = sx * a if side == 'S' else -sx * a
                    pts.append(R.p(side, aa, R.dg))
                q = [pts[0], pts[1], pts[1] - ZV * R.tk * 0.9, pts[0] - ZV * R.tk * 0.9]
                f = _face(c, q, R.out(side))
                c.m([f], 'TILE_DARK'); c.nb([f])


# ── the hall: platform, floor, columns, beams, walls, brackets ──────────────

def stone_platform(c, x0, x1, y0, y1, h, reg='STONE', top='ISHIDATAMI', cap=True):
    """Stone podium (kidan): dressed granite sides, paved top, a cap course."""
    fr = F(Vector((0, 0, 0)), (0, -1))
    b = c.box(fr, x0, x1, 0.0, h, -y1, -y0, None, skip=('bot',), bevel=True)
    hm = c.R(reg)['h_m'] - 0.02
    for k in ('out', 'in', 'l', 'r'):
        if h <= hm:
            c.m([b[k]], reg)
            continue
        # taller than the strip: split the side into courses
        fc = b[k]
        fr_k = F.of(fc)
        c.bm.faces.remove(fc)
        n = math.ceil(h / hm)
        for i in range(n):
            za, zb = h * i / n, h * (i + 1) / n
            q = _face(c, [fr_k(fr_k.u0, za), fr_k(fr_k.u1, za), fr_k(fr_k.u1, zb), fr_k(fr_k.u0, zb)], fr_k.n)
            GK.map_axes(c, [q], reg, fr_k(0, za), fr_k.t, ZV)
    c.bm.faces.remove(b['top'])
    n = max(1, math.ceil((y1 - y0) / (c.R(top)['h_m'] - 0.02)))
    tops = []
    for k in range(n):
        ya, yb = y0 + (y1 - y0) * k / n, y0 + (y1 - y0) * (k + 1) / n
        tops.append(_face(c, [(x0, ya, h), (x1, ya, h), (x1, yb, h), (x0, yb, h)], (0, 0, 1)))
    c.m(tops, top)
    if cap and c.lod == 0 and h > 0.25:   # cap course (katsura-ishi), a little proud
        c.box(fr, x0 - 0.04, x1 + 0.04, h - 0.14, h, -y1 - 0.04, -y0 + 0.04, 'STONE_FLAT', skip=('bot', 'top'))
    return b


def column(c, x, y, z0, z1, r, reg='NURI', base=True, n=None):
    n = n or (8 if c.lod == 0 else 6)
    rr = r / math.cos(math.pi / n)          # circumradius: the flats sit at r
    col = K.lathe(c.bm, n, [(rr, z0), (rr, z1)], cx=x, cy=y, cap_bottom=False, cap_top=False)
    K.map_cyl(c.bm, col['sides'], c.R(reg), cx=x, cy=y, rotate=True) if c.R(reg)['kind'] == 'strip' else c.m(col['sides'], reg)
    c.nb(col['sides'])
    if base:   # soseki: round-topped base stone
        s = K.lathe(c.bm, 8 if c.lod == 0 else 6, [(r * 1.75, z0 - 0.02), (r * 1.4, z0 + 0.05), (0.0, z0 + 0.05)],
                    cx=x, cy=y, cap_bottom=False)
        c.m(s['sides'], 'STONE_FLAT'); c.nb(s['sides'])
    return col


def beam(c, f, u0, u1, z0, z1, d0, d1, reg='NURI', ends='GOFUN', skip=('in',)):
    """Tie beam / plank on frame f; grain along u; white end faces."""
    b = c.box(f, u0, u1, z0, z1, d0, d1, None, skip=skip)
    c.m([x for k, x in b.items() if k not in ('l', 'r')], reg)
    c.m([x for k, x in b.items() if k in ('l', 'r')], ends)
    return b


def bracket(c, f, u, z, steps=2, reach=0.42, reg='WOOD', end='GOFUN', lev=0.3, arm=0.55, arm_all=True):
    """One bracket set (kumimono) on a column top at height z: bearing block
    (daito), then per step an arm along the wall (hijiki) with small blocks,
    an arm stepping out (deeper each step) with a block (makito) at its end.
    Returns the height of the top."""
    lod = c.lod
    if steps == 0:
        return z
    sk = ('in', 'top')
    c.box(f, u - 0.22, u + 0.22, z, z + 0.24, -0.22, 0.22, reg, skip=sk)
    if lod:
        c.box(f, u - arm, u + arm, z + 0.24, z + 0.24 + lev * steps, -0.1, 0.1 + reach * steps, reg + '_FLAT' if reg == 'NURI' else 'WOOD_FLAT',
              skip=('in', 'top'))
        return z + 0.24 + lev * steps
    zk = z + 0.24
    for k in range(steps):
        # arm along the wall, its two small blocks
        if k == 0 or arm_all:
            c.box(f, u - arm, u + arm, zk, zk + lev, -0.08, 0.08, reg, skip=('top', 'in'))
        # arm stepping out, its end block (painted end)
        dk = reach * (k + 1)
        b = c.box(f, u - 0.08, u + 0.08, zk, zk + 0.16, 0.08, dk + 0.1, reg, skip=('top', 'in'))
        c.m([b['out']], end)
        c.box(f, u - 0.11, u + 0.11, zk + 0.16, zk + lev, dk - 0.1, dk + 0.1, reg, skip=('top', 'in'))
        zk += lev
    return zk


def bracket_row(c, f, cols, z, steps, reach, reg, end, lev=0.3, between=True, arm_all=True, corners=True):
    """corners=False: the corner sets belong to the front/back walls (one set per corner column)."""
    """Bracket sets on every column of a wall, a small strut (kentozuka)
    between them, the wall plate and the eave purlin (gangyo) they carry."""
    ztop = z
    for u in (cols if corners else cols[1:-1]):
        ztop = bracket(c, f, u, z, steps, reach, reg, end, lev, arm_all=arm_all)
    if not corners and len(cols) == 2:
        ztop = z + 0.24 + lev * steps
    if between and c.lod == 0 and steps:
        for ua, ub in zip(cols, cols[1:]):
            um = (ua + ub) / 2
            c.box(f, um - 0.09, um + 0.09, z, ztop - lev + 0.16, -0.09, 0.09, reg, skip=('in', 'top'))
    u0, u1 = cols[0] - 0.6, cols[-1] + 0.6
    # wall plate on top of the bracket arms and the eave purlin on the outermost blocks
    beam(c, f, u0, u1, ztop, ztop + 0.18, -0.12, 0.12, reg, end, skip=('in', 'bot') if c.lod else ('in',))
    if steps:
        beam(c, f, u0 - reach * steps, u1 + reach * steps, ztop, ztop + 0.2, reach * steps - 0.1, reach * steps + 0.1, reg, end)
    return ztop + 0.2


def panel(c, f, u0, u1, z0, z1, reg, d=0.0):
    """Flat wall panel on frame f; strips in bands no taller than the strip."""
    R_ = c.R(reg)
    n = max(1, math.ceil((z1 - z0) / (R_['h_m'] - 0.02) - 1e-6)) if R_['kind'] == 'strip' else 1
    out = None
    for k in range(n):
        za, zb = z0 + (z1 - z0) * k / n, z0 + (z1 - z0) * (k + 1) / n
        p = _face(c, [f(u0, za, d), f(u1, za, d), f(u1, zb, d), f(u0, zb, d)], f.n)
        if R_['kind'] == 'strip':
            GK.map_axes(c, [p], reg, f(0, za, d), f.t, ZV)
        else:
            c.m([p], reg); c.nb([p])
        out = out or p
    return out


def door_lattice(c, f, u0, u1, z0, z1, opt):
    """Lattice doors (koshi-do): two or four leaves, frame and mid rail as
    geometry, the fine grid as a picture (lit from inside or dark)."""
    d = -0.06
    lit = opt.get('lit')
    p = panel(c, f, u0, u1, z0, z1, 'KOSHI_LIT' if lit else 'KOSHI_DARK', d)
    if c.lod:
        return dict(kind='lattice', lit=lit)
    n = 4 if u1 - u0 > 2.0 else 2
    reg = opt.get('frame', 'WOOD')
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        c.box(f, u - 0.04, u + 0.04, z0, z1, d, d + 0.06, reg, skip=('in', 'top', 'bot'), rotate=True)
    for z in (z0, z0 + 0.5 * (z1 - z0), z1 - 0.07):
        c.box(f, u0, u1, z, z + 0.07, d, d + 0.06, reg, skip=('in',))
    return dict(kind='lattice', lit=lit)


def door_board(c, f, u0, u1, z0, z1, opt):
    """Board doors (itado): two leaves of vertical boards, battens, rows of
    gilt nail heads and hinge straps; open = leaves swung back into the
    hall, dark room behind (the dressing puts the interior picture in)."""
    d = -0.05
    lod = c.lod
    reg = opt.get('reg', 'BOARD')
    if opt.get('open'):
        if not opt.get('gate'):
            panel(c, f, u0, u1, z0, z1, 'INTERIOR', -0.4)
        zm = (z0 + z1) / 2
        for s, ua in ((1, u0), (-1, u1)):   # leaves folded back against the reveal, in two bands (strip height)
            w = (u1 - u0) / 2
            for za, zb in ((z0, zm), (zm, z1)):
                q = [f(ua, za, d), f(ua, zb, d), f(ua + s * 0.12, zb, d - w), f(ua + s * 0.12, za, d - w)]
                fc = _face(c, q, f.t * s)
                GK.map_axes(c, [fc], reg, f(ua, za, d), (f(ua + s * 0.12, za, d - w) - f(ua, za, d)).normalized(), ZV)
        return dict(kind='open', f=F(f.o, f.n, u0, u1, z0, z1))
    p = panel(c, f, u0, u1, z0, z1, reg, d)
    if lod or opt.get('plain'):
        if not lod:
            c.box(f, u0 + 0.04, u1 - 0.04, z0 + 0.25, z0 + 0.35, d, d + 0.035, 'BOARD_FLAT', skip=('in',))
        return dict(kind='closed')
    um = (u0 + u1) / 2
    c.box(f, um - 0.02, um + 0.02, z0, z1, d, d + 0.03, 'BLACK', skip=('in', 'top', 'bot'))
    for z in (z0 + 0.25, z1 - 0.35):
        c.box(f, u0 + 0.04, u1 - 0.04, z, z + 0.1, d, d + 0.035, reg + '_FLAT' if reg in ('BOARD',) else reg, skip=('in',))
        n = 4
        for i in range(n):   # nail heads (kugi-kakushi) along the battens
            u = u0 + 0.12 + (u1 - u0 - 0.24) * i / (n - 1)
            c.box(f, u - 0.022, u + 0.022, z + 0.028, z + 0.072, d + 0.035, d + 0.05, 'GOLD', skip=('in', 'bot', 'top'))
    for s, ua in ((1, u0), (-1, u1)):   # hinge straps
        for z in (z0 + 0.3, z1 - 0.3):
            c.box(f, ua, ua + s * 0.32 if s > 0 else ua, z - 0.04, z + 0.04, d, d + 0.045, 'IRON', skip=('in',)) if s > 0 else \
                c.box(f, ua - 0.32, ua, z - 0.04, z + 0.04, d, d + 0.045, 'IRON', skip=('in',))
    return dict(kind='closed')


def wall_plaster(c, f, u0, u1, z0, z1, opt):
    panel(c, f, u0, u1, z0, z1, opt.get('reg', 'PLASTER'), -0.04)
    return dict(kind='wall')


def window_renji(c, f, u0, u1, z0, z1, opt):
    """Plaster wall with a renji window: square bars set diagonally in a
    frame, dark room behind; board below the sill."""
    zs, zt = z0 + 0.85, min(z1 - 0.25, z0 + 1.75)
    um = (u0 + u1) / 2
    w = min(1.2, (u1 - u0) * 0.6)
    wa, wb = um - w / 2, um + w / 2
    for a, b, za, zb in ((u0, u1, z0, zs), (u0, u1, zt, z1), (u0, wa, zs, zt), (wb, u1, zs, zt)):
        panel(c, f, a, b, za, zb, 'PLASTER' if za >= zs else opt.get('low', 'BOARD'), -0.04)
    panel(c, f, wa, wb, zs, zt, 'INTERIOR', -0.16)
    reg = opt.get('frame', 'WOOD')
    c.box(f, wa - 0.08, wb + 0.08, zs - 0.08, zs, -0.16, 0.02, reg, skip=('in',))
    c.box(f, wa - 0.08, wb + 0.08, zt, zt + 0.08, -0.16, 0.02, reg, skip=('in',))
    for a, b in ((wa - 0.08, wa), (wb, wb + 0.08)):
        c.box(f, a, b, zs, zt, -0.16, 0.02, reg, skip=('in', 'top', 'bot'), rotate=True)
    if c.lod == 0:
        n = max(4, int(w / 0.13))
        for i in range(n):
            u = wa + w * (i + 0.5) / n
            q = [f(u - 0.035, zs, -0.08), f(u, zs, -0.045), f(u + 0.035, zs, -0.08), f(u, zs, -0.115)]
            vs0 = [c.bm.verts.new(p) for p in q]
            vs1 = [c.bm.verts.new(p + ZV * (zt - zs)) for p in q]
            fs = [c.bm.faces.new([vs0[k], vs0[(k + 1) % 4], vs1[(k + 1) % 4], vs1[k]]) for k in range(4)]
            orient(fs, f(u, (zs + zt) / 2, -0.08))
            c.m(fs, reg, rotate=True); c.nb(fs)
    return dict(kind='window')


def door_shitomi(c, f, u0, u1, z0, z1, opt):
    """Shitomi: lattice shutter in the upper part (hinged at the top; open =
    swung up and hung from the eave hooks), board panel below."""
    zm = z0 + 0.42 * (z1 - z0)
    panel(c, f, u0, u1, z0, zm, 'BOARD', -0.05)
    if opt.get('open'):
        panel(c, f, u0, u1, zm, z1, 'INTERIOR', -0.4)
        q = [f(u0, z1, -0.02), f(u1, z1, -0.02), f(u1, z1 + 0.1, z1 - zm - 0.1), f(u0, z1 + 0.1, z1 - zm - 0.1)]
        a = _face(c, q, ZV * -1 + f.n * 0.2)
        b = _face(c, [x + ZV * 0.06 for x in q], ZV)
        c.m([a], 'KOSHI_DARK'); c.m([b], 'BOARD_FLAT'); c.nb([a, b])
        kind = 'open'
    else:
        door_lattice(c, f, u0, u1, zm, z1, dict(lit=opt.get('lit')))
        kind = 'lattice'
    if c.lod == 0:
        c.box(f, u0, u1, zm - 0.04, zm + 0.04, -0.06, 0.0, 'WOOD', skip=('in',))
    return dict(kind=kind, lit=opt.get('lit'), f=F(f.o, f.n, u0, u1, zm, z1))


WALLS = {'lattice': door_lattice, 'board': door_board, 'plaster': wall_plaster, 'renji': window_renji,
         'shitomi': door_shitomi}


def railing(c, f, u0, u1, z, d, h=0.85, reg='NURI', posts=None, gibo=(False, False), struts=True):
    """Veranda railing (kōran) on frame f at d out: posts, bottom rail on
    blocks, middle rail, top rail; onion caps (giboshi) at open ends."""
    lod = c.lod
    posts = posts if posts is not None else [u0, u1]
    for u in posts:
        c.box(f, u - 0.05, u + 0.05, z, z + h, d - 0.05, d + 0.05, reg, skip=('bot',), rotate=True)
    c.box(f, u0, u1, z + h - 0.07, z + h, d - 0.04, d + 0.04, reg, skip=('l', 'r'))
    if lod == 0:
        c.box(f, u0, u1, z + 0.45, z + 0.5, d - 0.03, d + 0.03, reg, skip=('l', 'r'))
        c.box(f, u0, u1, z + 0.08, z + 0.18, d - 0.04, d + 0.04, reg, skip=('bot', 'l', 'r'))
        n = int((u1 - u0) / 1.0) if struts else 0
        for i in range(1, n):   # short struts between the middle and top rail
            u = u0 + (u1 - u0) * i / n
            c.box(f, u - 0.025, u + 0.025, z + 0.5, z + h - 0.07, d - 0.025, d + 0.025, reg, skip=('top', 'bot'))
        for u, g in zip((u0, u1), gibo):
            if g:
                p = f(u, z + h, d)
                s = K.lathe(c.bm, 8, [(0.07, z + h), (0.08, z + h + 0.06), (0.1, z + h + 0.14), (0.05, z + h + 0.24), (0.0, z + h + 0.32)],
                            cx=p.x, cy=p.y, cap_bottom=False)
                c.m(s['sides'], 'GOLD'); c.nb(s['sides'])


def stairs(c, f, u0, u1, z_lo, z_hi, d0, tread=0.3, reg='WOOD', side='NURI', rail=True):
    """Wooden steps (kizahashi) on frame f from z_lo at d0 + run up to the
    floor edge at d0: treads, risers, stringers, handrails with onion caps."""
    n = max(2, math.ceil((z_hi - z_lo) / 0.2))
    rise = (z_hi - z_lo) / n
    run = tread * n
    for k in range(n):
        za = z_lo + rise * k
        da = d0 + run - tread * k
        c.box(f, u0 + 0.06, u1 - 0.06, za, za + rise, da - tread, da, reg, skip=('in', 'bot', 'l', 'r'))
    for u in (u0, u1 - 0.07):   # stringers
        q = [f(u, z_lo, d0 + run), f(u, z_hi, d0), f(u, z_hi + 0.14, d0), f(u, z_lo + 0.14 + 0.2, d0 + run)]
        for du, sg in ((0.0, -1), (0.07, 1)):
            fc = _face(c, [p + f.t * du for p in q], f.t * sg)
            c.m([fc], side if c.R(side)['kind'] == 'cell' else side + '_FLAT'); c.nb([fc])
    if rail and c.lod == 0:
        for u in (u0 + 0.035, u1 - 0.035):
            p0, p1 = f(u, z_lo + 0.85, d0 + run - 0.1), f(u, z_hi + 0.85, d0)
            c.tube([p0, p1], 0.035, 6, side if c.R(side)['kind'] == 'cell' else side + '_FLAT')
            c.box(f, u - 0.05, u + 0.05, z_lo, z_lo + 0.85, d0 + run - 0.15, d0 + run - 0.05, side, skip=('bot',), rotate=True)
            s = K.lathe(c.bm, 8, [(0.07, z_lo + 0.85), (0.08, z_lo + 0.91), (0.1, z_lo + 0.99), (0.05, z_lo + 1.09), (0.0, z_lo + 1.17)],
                        cx=f(u, 0, d0 + run - 0.1).x, cy=f(u, 0, d0 + run - 0.1).y, cap_bottom=False)
            c.m(s['sides'], 'GOLD'); c.nb(s['sides'])
    return run


def side_cols(s, e):
    """Column positions u along side e (seen from outside, from the left corner)."""
    bays = (s['bx'], s['by'], list(reversed(s['bx'])), list(reversed(s['by'])))[e]
    us = [0.0]
    for b in bays:
        us.append(us[-1] + b)
    return us


def hall(c, s):
    """A hall from data: platform, (raised floor with veranda, railing and
    steps), round columns on base stones, nageshi and tie beams, a wall
    module per bay and side, bracket sets with plaster panels between, and
    the curved roof sized to the bracket height. Returns (roof, slots, info)."""
    lod = c.lod
    bx, by = s['bx'], s['by']
    L, B = sum(bx), sum(by)
    P = s.get('plat', 0.45)
    FL = s.get('floor', 0.0)
    z0 = P + FL
    H = s['H']
    zc = z0 + H
    r = s.get('r', 0.2)
    en = s.get('en', 0.0)
    creg = s.get('col', 'NURI')
    breg = s.get('beam', creg)
    kreg = s.get('kumi', breg)
    end = s.get('end', 'GOFUN')
    m = s.get('plat_m', 1.2)
    if s.get('platform', True):
        stone_platform(c, -L / 2 - en - m, L / 2 + en + m, -B / 2 - en - m, B / 2 + en + m, P, reg=s.get('plat_reg', 'STONE'))
    xs = [-L / 2]
    for b in bx:
        xs.append(xs[-1] + b)
    ys = [-B / 2]
    for b in by:
        ys.append(ys[-1] + b)
    pts = {(x, y) for x in xs for y in (ys[0], ys[-1])} | {(x, y) for y in ys for x in (xs[0], xs[-1])}
    for x, y in sorted(pts):
        column(c, x, y, P, zc, r, creg, base=s.get('col_base', True) and lod == 0)
    for x, y in s.get('inner_cols', []):
        column(c, x, y, P, zc, r, creg)
    zd = min(z0 + s.get('door_h', 2.5), zc - 0.75)
    zk = zc + 0.2
    steps, reach, lev = s.get('steps', 2), s.get('reach', 0.42), 0.3
    ztop = zk + (0.24 + lev * steps if steps else 0.0)
    zu_wall = ztop + 0.22 + 0.22 * reach * steps
    if s.get('roof'):
        rf = dict(s['roof'])
        ov = rf.pop('ov')
        tk = rf.pop('tk', 0.36)
        su = 0.22
        R = Roof(rf.pop('kind'), L / 2 + ov, B / 2 + ov, zu_wall + tk - su * ov, ov=ov, tk=tk, su=su,
                 **{k: v for k, v in rf.items() if k in ('s0', 's1', 'lift', 'lam', 'dg', 'og', 'top')})
    else:
        R, ov = None, 0.0
    slots = []
    walls = s.get('walls', {})
    for side, e in SIDES.items():
        f = frame(L, B, e)
        Lw = (L, B, L, B)[e]
        us = side_cols(s, e)
        if FL > 0.2:   # dark void under the raised floor
            panel(c, f, -0.0, Lw, P, z0 - 0.1, 'BLACK', -0.12)
            beam(c, f, -r, Lw + r, z0 - 0.18, z0, r - 0.04, r + 0.03, breg, end)       # ji-nageshi
        # nageshi over the door heads, head tie beam with protruding ends, head plate
        beam(c, f, -r, Lw + r, zd, zd + 0.22, r - 0.06, r + 0.03, breg, end)
        beam(c, f, -0.35, Lw + 0.35, zc - 0.45, zc - 0.2, -0.1, 0.12, breg, end)
        beam(c, f, -r - 0.05, Lw + r + 0.05, zc - 0.02, zk, -0.16, 0.16, breg, end, skip=('in', 'bot'))
        ws = walls.get(side, ['plaster'] * (len(us) - 1))
        for i, (ua, ub) in enumerate(zip(us, us[1:])):
            k = ws[i] if i < len(ws) else 'plaster'
            opt = {}
            if isinstance(k, tuple):
                k, opt = k
            if k != 'open':
                slot = WALLS[k](c, f, ua + r * 0.75, ub - r * 0.75, (z0 if FL > 0.2 else P) + (0.0 if FL > 0.2 else 0.0), zd, opt)
                slot.update(side=side, u0=ua, u1=ub, z0=z0, z1=zd)
                slot.setdefault('f', F(f.o, f.n, ua + r, ub - r, z0, zd))
                slot['img'] = opt.get('img')
                slots.append(slot)
            else:
                slots.append(dict(kind='passage', side=side, u0=ua, u1=ub, z0=z0, z1=zd, f=F(f.o, f.n, ua + r, ub - r, z0, zd)))
            # plaster above the nageshi up to the head beam (transom), board in open bays
            panel(c, f, ua + r * 0.75, ub - r * 0.75, zd + 0.22, zc - 0.45, 'PLASTER', -0.04)
        # bracket zone: sets on every column, plaster panels behind, up to the soffit
        bracket_row(c, f, us, zk, steps, reach, kreg, end, lev, between=s.get('between', True), arm_all=s.get('arm_all', True),
                    corners=side in 'SN')
        A = Lw / 2
        side_n = side
        for ua, ub in zip(us, us[1:]):
            za, zb = (R.zu(side_n, ua - A, ov), R.zu(side_n, ub - A, ov)) if R else (zu_wall - 0.05, zu_wall - 0.05)
            if zb < zk + 0.08 and za < zk + 0.08:
                continue
            p = _face(c, [f(ua, zk, -0.06), f(ub, zk, -0.06), f(ub, zb + 0.05, -0.06), f(ua, za + 0.05, -0.06)], f.n)
            c.m([p], 'PLASTER_FLAT'); c.nb([p])
        if en and FL > 0.2:
            ua, ub = (-en, Lw + en) if side in 'SN' else (0.0, Lw)
            fl = c.box(f, ua, ub, z0 - 0.14, z0, r, en, None, skip=('in',))
            c.m([fl['top']], 'BOARD'); c.m([fl['out']], 'WOOD'); c.m([fl['bot']], 'WOOD_FLAT'); c.m([x for k, x in fl.items() if k in ('l', 'r')], 'END_GRAIN')
            for u in us:
                c.box(f, u - 0.08, u + 0.08, P, z0 - 0.14, en - 0.25, en - 0.09, breg, skip=('top', 'bot'), rotate=True)
            if s.get('rail', True):
                st = s.get('stairs')
                segs = [(-en + 0.06, Lw + en - 0.06)]
                if st and st[0] == side:
                    a, b = us[st[1]] + 0.1, us[st[1] + 1] - 0.1
                    segs = [(-en + 0.06, a), (b, Lw + en - 0.06)]
                for k_, (a, b) in enumerate(segs):
                    posts = [u for u in us if a + 0.2 < u < b - 0.2] + [a, b]
                    if side in 'EW':
                        posts = [u for u in posts if 0.3 < u < Lw - 0.3]
                    gib = (len(segs) > 1 and k_ == 1, len(segs) > 1 and k_ == 0)
                    railing(c, f, a, b, z0, en - 0.1, reg=breg, posts=posts, gibo=gib, struts=s.get('struts', True))
        st = s.get('stairs')
        if st and st[0] == side:
            a, b = us[st[1]] + 0.15, us[st[1] + 1] - 0.15
            stairs(c, f, a, b, P, z0, en if FL > 0.2 else r, reg='WOOD', side=breg)
        ps = s.get('plat_steps')
        if ps and ps[0] == side and P > 0.2:   # stone steps up the podium
            w = ps[1]
            n = max(2, math.ceil(P / 0.18)); rise = P / n
            for k in range(n):
                dk = en + m + 0.35 * (n - k)
                c.box(f, Lw / 2 - w / 2, Lw / 2 + w / 2, rise * k, rise * (k + 1), en + m - 0.02, dk, 'STONE_FLAT', skip=('in', 'bot'), bevel=True)
    info = dict(L=L, B=B, z0=z0, zc=zc, zk=zk, zd=zd, zu=zu_wall, P=P, en=en, ov=ov, xs=xs, ys=ys)
    return R, slots, info


def roof(c, R, kind='tile', pitch=0.4, amp=0.07, raft=True, raft_reg='WOOD', soffit='BOARD_FLAT', fascia=None, oni=None, shibi=False,
         ridge_h=None, corner=True, raft_sp=0.58, bell=True):
    """Roof surface, eave, rafters, corner beams, ridges and gables of R."""
    reg = {'tile': 'KAWARA', 'copper': 'DOBAN', 'bark': 'HIWADA'}[kind]
    if kind != 'tile':
        amp = 0.0
    rows = roof_surface(c, R, reg, pitch, amp)
    eave(c, R, rows, pitch, amp, kind='tile' if kind == 'tile' else 'edge',
         fascia_reg=fascia or {'tile': 'FASCIA', 'copper': 'COPPER_FLAT', 'bark': 'HIWADA_EDGE'}[kind], soffit=soffit)
    if raft:
        rafters(c, R, spacing=max(raft_sp, pitch), reg=raft_reg if raft_reg.endswith('_FLAT') else raft_reg + '_FLAT')
    if corner:
        corner_beams(c, R, reg=raft_reg if raft_reg.endswith('_FLAT') else raft_reg + '_FLAT', bell=bell)
    # ridge size follows the roof (a 0.7 m ridge on a gate roof was a wall)
    sc = min(1.0, max(0.35, (R.Ey - 1.0) / 6.5))
    rh = ridge_h if ridge_h is not None else 0.75 * sc
    top = ridges(c, R, kind, ridge_h=rh, ridge_w=0.22 + 0.3 * sc, hip_h=0.16 + 0.17 * sc, hip_w=0.18 + 0.15 * sc,
                 oni=oni if oni is not None else 0.45 + 0.55 * sc, shibi=shibi)
    if R.kind in ('irimoya', 'gable'):
        gable_wall(c, R)
    return top


# ── dressing (atlas TeraShop, own mesh) ─────────────────────────────────────

def taper_tube(c, pts, rs, n, reg, caps=True):
    """Tube along a polyline with a radius per point (shimenawa, bell rope)."""
    P = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        up = ZV if abs(t.dot(ZV)) < 0.95 else Vector((1, 0, 0))
        a = t.cross(up).normalized(); b = t.cross(a).normalized()
        rings.append([c.bm.verts.new(p + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * rs[i]) for k in range(n)])
    fs = []
    for i in range(len(rings) - 1):
        A_, B_ = rings[i], rings[i + 1]
        for k in range(n):
            f = c.bm.faces.new([A_[k], A_[(k + 1) % n], B_[(k + 1) % n], B_[k]])
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - (P[i] + P[i + 1]) / 2) < 0:
                f.normal_flip()
            fs.append(f)
    if caps:
        for ring, p, q in ((rings[0], P[0], P[1]), (rings[-1], P[-1], P[-2])):
            f = c.bm.faces.new(ring)
            f.normal_update()
            if f.normal.dot(p - q) < 0:
                f.normal_flip()
            fs.append(f)
    if reg:
        c.m(fs, reg)
    c.nb(fs)
    return fs


def shide(c, p, t, h=0.42, w=0.07):
    """Zigzag paper streamer (shide): four steps hanging from point p, in the
    plane of t (both sides)."""
    t = Vector(t).normalized()
    p = Vector(p)
    fs = []
    for k in range(4):
        o = p + t * (w * (k % 2)) - ZV * (h * k / 4)
        q = [o, o + t * w, o + t * w - ZV * h / 4 * 0.95, o - ZV * h / 4 * 0.95]
        n = t.cross(ZV)
        fs += [_face(c, q, n), _face(c, [x + n * 0.003 for x in q], -n)]
    c.m(fs, 'PAPER'); c.nb(fs)


def shimenawa(c, p0, p1, sag=0.25, r=0.16, tassels=3, n_shide=4):
    """Sacred straw rope: thick in the middle, thin at the ends, sagging;
    straw tassels (kazari) and paper shide hang from it."""
    pts = K.catenary(p0, p1, sag, 10 if c.lod == 0 else 4)
    m = len(pts) - 1
    rs = [r * (0.35 + 0.65 * math.sin(math.pi * i / m)) for i in range(m + 1)]
    taper_tube(c, pts, rs, 8 if c.lod == 0 else 5, 'ROPE')
    if c.lod:
        return
    t = (Vector(p1) - Vector(p0)).normalized()
    for k in range(tassels):
        i = round((k + 1) * m / (tassels + 1))
        q = pts[i] - ZV * rs[i] * 0.8
        taper_tube(c, [q, q - ZV * 0.35, q - ZV * 0.5], [0.05, 0.06, 0.02], 5, 'ROPE_DARK')
    for k in range(n_shide):
        i = round((k + 0.5) * m / n_shide)
        shide(c, pts[i] - ZV * rs[i] * 0.7, t)


def suzu(c, p_top, length=2.4):
    """Shrine bell (suzu) on its bracket with the twisted cloth rope."""
    p = Vector(p_top)
    c.tube([p, p - ZV * 0.15], 0.012, 4, 'IRON')
    zc = p.z - 0.32
    s = K.lathe(c.bm, 10 if c.lod == 0 else 6, [(0.0, zc - 0.17), (0.12, zc - 0.13), (0.17, zc), (0.12, zc + 0.13), (0.0, zc + 0.17)],
                cx=p.x, cy=p.y, cap_bottom=False, cap_top=False)
    c.m(s['sides'], 'BRASS'); c.nb(s['sides'])
    top, bot = p - ZV * 0.5, p - ZV * (0.5 + length)
    rope = K.lathe(c.bm, 8 if c.lod == 0 else 4, [(0.05, bot.z), (0.045, top.z)], cx=p.x, cy=p.y, cap_bottom=True, cap_top=False)
    K.map_cyl(c.bm, rope['sides'], c.R('SUZU_O'), cx=p.x, cy=p.y)
    c.nb(rope['sides'] + [rope['bottom']])
    c.m([rope['bottom']], 'RED')


def saisen(c, f, uc, d, w=1.6, z=0.0):
    """Offering box (saisen-bako): slatted top, gilt lettering, low feet."""
    h, dd = 0.62, 0.55
    b = c.box(f, uc - w / 2, uc + w / 2, z + 0.06, z + h, d - dd, d, None, skip=('top',), bevel=True)
    c.m([b['out']], 'SAISEN'); c.m([b[k] for k in ('l', 'r', 'in', 'bot')], 'WOOD_DARK')
    if c.lod == 0:
        n = int(w / 0.09)
        for i in range(n):
            u = uc - w / 2 + 0.05 + (w - 0.1) * i / (n - 1)
            q = c.box(f, u - 0.02, u + 0.02, z + h - 0.12, z + h, d - dd + 0.04, d - 0.04, 'WOOD_DARK', skip=('bot',))
        for u in (uc - w / 2 + 0.06, uc + w / 2 - 0.06):
            c.box(f, u - 0.06, u + 0.06, z, z + 0.06, d - dd, d, 'WOOD_DARK', skip=('bot',))
        c.box(f, uc - w / 2 - 0.02, uc + w / 2 + 0.02, z + h - 0.03, z + h + 0.01, d - dd - 0.02, d + 0.02, 'GOLD', skip=('bot',))
    else:
        c.box(f, uc - w / 2, uc + w / 2, z + h - 0.01, z + h, d - dd, d, 'WOOD_DARK', skip=('bot',))


def gaku(c, f, uc, z, d, img, w, h, frame='WOOD_DARK'):
    """Name plaque under the eave, tilted forward, framed, on two hooks."""
    tilt = 0.12
    q = [f(uc - w / 2, z, d + h * tilt), f(uc + w / 2, z, d + h * tilt), f(uc + w / 2, z + h, d), f(uc - w / 2, z + h, d)]
    face = _face(c, q, f.n)
    c.m([face], img); c.nb([face])
    back = _face(c, [p - f.n * 0.05 for p in q], -f.n)
    c.m([back], frame)
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)):
        e = _face(c, [q[a], q[b], q[b] - f.n * 0.05, q[a] - f.n * 0.05], (q[a] + q[b]) / 2 - f(uc, z + h / 2, d - 0.1))
        c.m([e], frame); c.nb([e])
    if c.lod == 0:
        for u in (uc - w / 3, uc + w / 3):
            c.tube([f(u, z + h, d), f(u, z + h + 0.3, d - 0.1)], 0.008, 3, 'IRON')


def big_lantern(c, f, u, z_top, d, img='CHOCHIN0', r=0.55, h=1.5):
    """Large votive lantern (ōchōchin) hanging under the eave."""
    KK.chochin(c, f, u, z_top - h - 0.1, d, img, r=r, h=h, hook=True, hang=0.25)


def jokoro(c, p, s=1.0, rot=0.0):
    """Incense burner (jōkōro): stone plinth, bronze bowl on three legs, a
    little curved roof lid with a finial, ash."""
    x, y = p[0], p[1]
    lod = c.lod
    n = 8 if lod == 0 else 6
    b = K.lathe(c.bm, 4, [(0.62 * s, 0.0), (0.62 * s, 0.35 * s), (0.55 * s, 0.4 * s), (0.0, 0.4 * s)], cx=x, cy=y, phase=math.pi / 4 + rot,
                cap_bottom=False)
    c.m(b['sides'], 'STONE'); c.nb(b['sides'])
    z0 = 0.4 * s
    for k in range(3):
        a = rot + 2 * math.pi * k / 3
        q = (x + 0.32 * s * math.cos(a), y + 0.32 * s * math.sin(a))
        c.tube([(q[0], q[1], z0), (q[0] * 0.9 + x * 0.1, q[1] * 0.9 + y * 0.1, z0 + 0.3 * s)], 0.05 * s, 4, 'BRONZE_DARK')
    bowl = K.lathe(c.bm, n, [(0.28 * s, z0 + 0.25 * s), (0.42 * s, z0 + 0.4 * s), (0.46 * s, z0 + 0.62 * s), (0.5 * s, z0 + 0.66 * s), (0.4 * s, z0 + 0.62 * s),
                             (0.0, z0 + 0.58 * s)], cx=x, cy=y, cap_bottom=True)
    c.m(bowl['sides'][:-n] + [bowl['bottom']], 'BRONZE'); c.m(bowl['sides'][-n:], 'ASH'); c.nb(bowl['sides'])
    # four posts carrying the roof lid
    zt = z0 + 1.15 * s
    for k in range(4):
        a = rot + math.pi / 4 + k * math.pi / 2
        q = (x + 0.36 * s * math.cos(a), y + 0.36 * s * math.sin(a))
        c.tube([(q[0], q[1], z0 + 0.64 * s), (q[0], q[1], zt)], 0.025 * s, 4, 'BRONZE_DARK')
    lift = lambda i, k: (0.08 * s if k == 0 else 0.0)
    roof = K.lathe(c.bm, 4, [(0.78 * s, zt), (0.7 * s, zt + 0.06 * s), (0.3 * s, zt + 0.3 * s), (0.08 * s, zt + 0.42 * s), (0.0, zt + 0.42 * s)],
                   cx=x, cy=y, phase=math.pi / 4 + rot, lift=lambda i, k: 0.1 * s if k == 0 else (0.04 * s if k == 1 else 0.0))
    c.m(roof['sides'] + [roof['bottom']], 'BRONZE'); c.nb(roof['sides'])
    fin = K.lathe(c.bm, 6, [(0.05 * s, zt + 0.42 * s), (0.09 * s, zt + 0.5 * s), (0.0, zt + 0.66 * s)], cx=x, cy=y, cap_bottom=False)
    c.m(fin['sides'], 'BRONZE_DARK'); c.nb(fin['sides'])


def komainu(c, p, face=(0, -1), mirror=False, s=1.0):
    """Guardian lion-dog (koma-inu) on a stepped stone pedestal, seated,
    head turned a little to the approach; built from blocks."""
    x, y = p[0], p[1]
    f = F(Vector((x, y, 0)), face)
    sg = -1 if mirror else 1
    lod = c.lod
    c.box(f, -0.45 * s, 0.45 * s, 0.0, 0.5 * s, -0.55 * s, 0.35 * s, 'STONE_DARK', skip=('bot',), bevel=True)
    c.box(f, -0.38 * s, 0.38 * s, 0.5 * s, 0.85 * s, -0.48 * s, 0.28 * s, 'STONE', skip=('bot',), bevel=True)
    c.box(f, -0.42 * s, 0.42 * s, 0.85 * s, 0.93 * s, -0.52 * s, 0.32 * s, 'STONE_DARK', skip=('bot',))
    z = 0.93 * s
    # haunches, chest, forelegs, head with mane, tail flame
    c.box(f, -0.24 * s, 0.24 * s, z, z + 0.32 * s, -0.42 * s, -0.02 * s, 'STONE', skip=('bot',), bevel=True)
    c.box(f, -0.2 * s, 0.2 * s, z, z + 0.62 * s, -0.08 * s, 0.14 * s, 'STONE', skip=('bot',), bevel=True)
    for u in (-0.13, 0.13):
        c.box(f, (u - 0.06) * s, (u + 0.06) * s, z, z + 0.5 * s, 0.1 * s, 0.24 * s, 'STONE', skip=('bot',))
    hz = z + 0.58 * s
    hf = F(f(0, 0, 0.05 * s), (f.n.x * 0.94 - sg * f.t.x * 0.34, f.n.y * 0.94 - sg * f.t.y * 0.34))
    c.box(hf, -0.22 * s, 0.22 * s, hz, hz + 0.38 * s, -0.2 * s, 0.12 * s, 'STONE', skip=('bot',), bevel=True)    # mane
    c.box(hf, -0.15 * s, 0.15 * s, hz + 0.04 * s, hz + 0.3 * s, 0.12 * s, 0.3 * s, 'STONE', skip=('bot',), bevel=True)  # face
    c.box(hf, -0.12 * s, 0.12 * s, hz + 0.0, hz + 0.08 * s, 0.12 * s, 0.32 * s, 'STONE_DARK', skip=())                  # jaw
    if lod == 0:
        for u in (-0.08, 0.08):
            c.box(hf, (u - 0.03) * s, (u + 0.03) * s, hz + 0.2 * s, hz + 0.25 * s, 0.3 * s, 0.32 * s, 'STONE_DARK', skip=('in',))
        for u in (-0.2, 0.2):
            c.box(hf, (u - 0.05) * s, (u + 0.05) * s, hz + 0.3 * s, hz + 0.42 * s, -0.05 * s, 0.05 * s, 'STONE', skip=('bot',))
        c.box(f, -0.1 * s, 0.1 * s, z + 0.3 * s, z + 0.7 * s, -0.5 * s, -0.36 * s, 'STONE', skip=('bot',), bevel=True)


def ema_rack(c, f, u0, u1, d, seed=0, h=1.7):
    """Ema rack: two posts, three hanging bars, a small board roof, and rows
    of wooden prayer plaques (both sides)."""
    rnd = random.Random(seed)
    lod = c.lod
    for u in (u0, u1):
        c.box(f, u - 0.06, u + 0.06, 0.0, h + 0.2, d - 0.06, d + 0.06, 'WOOD_LIGHT', skip=('bot',), rotate=True)
    zs = [0.75, 1.15, 1.55]
    for z in zs:
        c.box(f, u0, u1, z, z + 0.05, d - 0.03, d + 0.03, 'WOOD_LIGHT', skip=('l', 'r'))
    # little gable roof of boards
    for sg in (-1, 1):
        q = [f(u0 - 0.15, h + 0.15, d + sg * 0.42), f(u1 + 0.15, h + 0.15, d + sg * 0.42), f(u1 + 0.15, h + 0.38, d), f(u0 - 0.15, h + 0.38, d)]
        a = _face(c, q, ZV + f.n * sg)
        b = _face(c, [x - ZV * 0.03 for x in q], -ZV - f.n * sg)
        c.m([a, b], 'WOOD_DARK'); c.nb([a, b])
    if lod:
        for z in zs:
            for sg in (-1, 1):
                q = [f(u0 + 0.05, z - 0.14, d + sg * 0.03), f(u1 - 0.05, z - 0.14, d + sg * 0.03), f(u1 - 0.05, z, d + sg * 0.03), f(u0 + 0.05, z, d + sg * 0.03)]
                fc = _face(c, q, f.n * sg)
                c.m([fc], 'WOOD_PALE'); c.nb([fc])
        return
    for z in zs:
        u = u0 + 0.07
        while u < u1 - 0.18:
            w = 0.15
            for sg in (-1, 1):
                if rnd.random() < 0.82:
                    dz = rnd.uniform(-0.02, 0.02)
                    dd = d + sg * (0.035 + 0.02 * rnd.random())
                    q = [f(u, z - 0.13 + dz, dd), f(u + w, z - 0.13 + dz, dd), f(u + w, z - 0.03 + dz, dd), f(u + w / 2, z + dz, dd), f(u, z - 0.03 + dz, dd)]
                    fc = _face(c, q, f.n * sg)
                    c.m([fc], 'EMA0' if rnd.random() < 0.5 else 'EMA1'); c.nb([fc])
            u += w + rnd.uniform(0.0, 0.03)


def omikuji_rack(c, f, u0, u1, d, seed=0):
    """Rack for tying fortune slips (omikuji): posts, three wires full of
    small white paper knots; a sign on top."""
    rnd = random.Random(seed)
    for u in (u0, u1):
        c.box(f, u - 0.05, u + 0.05, 0.0, 1.55, d - 0.05, d + 0.05, 'WOOD_DARK', skip=('bot',), rotate=True)
    c.box(f, u0 - 0.1, u1 + 0.1, 1.55, 1.62, d - 0.08, d + 0.08, 'WOOD_DARK', skip=())
    b = c.box(f, (u0 + u1) / 2 - 0.3, (u0 + u1) / 2 + 0.3, 1.62, 1.92, d - 0.02, d + 0.02, None, skip=('bot',))
    c.m([b['out'], b['in']], 'OMIKUJI'); c.m([b[k] for k in ('l', 'r', 'top')], 'WOOD_DARK')
    for z in (0.75, 1.05, 1.35):
        c.tube([f(u0, z, d), f(u1, z, d)], 0.006, 3, 'STEEL')
        if c.lod:
            q = [f(u0 + 0.05, z - 0.06, d + 0.02), f(u1 - 0.05, z - 0.06, d + 0.02), f(u1 - 0.05, z + 0.03, d + 0.02), f(u0 + 0.05, z + 0.03, d + 0.02)]
            fc = _face(c, q, f.n); c.m([fc], 'PAPER'); c.nb([fc])
            continue
        u = u0 + 0.06
        while u < u1 - 0.06:
            if rnd.random() < 0.85:
                dz = rnd.uniform(-0.02, 0.01)
                c.box(f, u - 0.018, u + 0.018, z - 0.06 + dz, z + 0.03, d - 0.012, d + 0.012, 'PAPER', skip=())
            u += rnd.uniform(0.04, 0.07)


def broom(c, p, lean=(0.25, 0.1)):
    """Bamboo broom (take-bōki) leaning on something: handle and twig fan."""
    p = Vector(p)
    top = p + Vector((lean[0], lean[1], 1.45))
    c.tube([p + ZV * 0.35, top], 0.018, 4, 'BAMBOO')
    a = Vector((-lean[1], lean[0], 0)).normalized()
    fan = [p + a * 0.25, p - a * 0.25, p + ZV * 0.45 + (top - p) * 0.05 - a * 0.05, p + ZV * 0.45 + (top - p) * 0.05 + a * 0.05]
    n = a.cross(ZV)
    fs = [_face(c, fan, n), _face(c, [x + n * 0.01 for x in fan], -n)]
    c.m(fs, 'BROOM'); c.nb(fs)


def tatefuda(c, f, u, d, img='YUISHO', w=1.2, h=0.9):
    """Notice board on two posts with a small board roof (shrine history)."""
    z0 = 0.8
    for uu in (u - w / 2 - 0.05, u + w / 2 + 0.05):
        c.box(f, uu - 0.05, uu + 0.05, 0.0, z0 + h + 0.15, d - 0.05, d + 0.05, 'WOOD_GREY', skip=('bot',), rotate=True)
    b = c.box(f, u - w / 2, u + w / 2, z0, z0 + h, d - 0.03, d + 0.03, None, skip=())
    c.m([b['out']], img); c.m([b[k] for k in ('in', 'l', 'r', 'top', 'bot')], 'WOOD_GREY')
    for sg in (-1, 1):
        q = [f(u - w / 2 - 0.2, z0 + h + 0.12, d + sg * 0.3), f(u + w / 2 + 0.2, z0 + h + 0.12, d + sg * 0.3),
             f(u + w / 2 + 0.2, z0 + h + 0.3, d), f(u - w / 2 - 0.2, z0 + h + 0.3, d)]
        a = _face(c, q, ZV + f.n * sg); bb = _face(c, [x - ZV * 0.03 for x in q], -ZV - f.n * sg)
        c.m([a, bb], 'WOOD_DARK'); c.nb([a, bb])


def bonsho(c, p, beam_z, h=1.55, r=0.5):
    """Temple bell (bonshō): bronze body with raised bands and the boss
    zone, dragon hook (simplified), hung from the beam; the striker log
    (shumoku) on two ropes beside it with its pull rope."""
    x, y, z_hook = p[0], p[1], beam_z
    lod = c.lod
    n = 12 if lod == 0 else 8
    zt = z_hook - 0.35
    zb = zt - h
    prof = [(r * 1.04, zb), (r * 1.06, zb + 0.06), (r * 1.0, zb + 0.12), (r * 0.98, zb + 0.35), (r * 1.01, zb + 0.38), (r * 0.98, zb + 0.41),
            (r * 0.95, zb + 0.9), (r * 0.98, zb + 0.93), (r * 0.94, zb + 0.96), (r * 0.9, zt - 0.08), (r * 0.7, zt), (0.0, zt + 0.02)]
    if lod:
        prof = [(r * 1.04, zb), (r * 0.98, zb + 0.35), (r * 0.92, zt - 0.08), (0.0, zt + 0.02)]
    b = K.lathe(c.bm, n, prof, cx=x, cy=y, cap_bottom=False)
    c.m(b['sides'], 'BRONZE'); c.nb(b['sides'])
    inner = K.lathe(c.bm, n, [(r * 0.98, zb + 0.005), (r * 0.6, zt - 0.3)], cx=x, cy=y, cap_bottom=False, cap_top=True)
    for fc in inner['sides'] + [inner['top']]:
        fc.normal_flip()
    c.m(inner['sides'] + [inner['top']], 'BRONZE_DARK'); c.nb(inner['sides'] + [inner['top']])
    # dragon hook (ryūzu): a loop on top
    c.tube([(x - 0.18, y, zt), (x - 0.15, y, zt + 0.25), (x, y, z_hook), (x + 0.15, y, zt + 0.25), (x + 0.18, y, zt)], 0.06, 6, 'BRONZE_DARK')
    # striker log on two ropes, beside the bell (strikes the lotus boss)
    sx0, sx1 = x + r + 0.25, x + r + 2.1
    zs = zb + 0.4
    log = K.tube_path(c.bm, [(sx0, y, zs), (sx1, y, zs)], 0.13, 8 if lod == 0 else 5, cap0=True, cap1=True)
    c.m(log[0], 'WOOD_GREY'); c.m([log[1], log[2]], 'WOOD_PALE'); c.nb(log[0] + [log[1], log[2]])
    for xx in (sx0 + 0.35, sx1 - 0.35):
        c.tube([(xx, y, zs + 0.1), (xx, y, z_hook)], 0.015, 3, 'ROPE')
    if lod == 0:
        c.tube([(sx0 + 0.9, y, zs - 0.08), (sx0 + 1.2, y - 0.4, 0.8)], 0.012, 3, 'ROPE')


def chochin_rack(c, f, u0, u1, d, img='CHOCHIN1', n=6, z=1.9):
    """Votive lantern frame (kentō-dai): two posts, a beam, a row of paper
    lanterns (dedications), a little board roof."""
    for u in (u0, u1):
        c.box(f, u - 0.06, u + 0.06, 0.0, z + 0.85, d - 0.06, d + 0.06, 'WOOD_DARK', skip=('bot',), rotate=True)
    c.box(f, u0 - 0.1, u1 + 0.1, z + 0.6, z + 0.7, d - 0.06, d + 0.06, 'WOOD_DARK', skip=())
    for sg in (-1, 1):
        q = [f(u0 - 0.25, z + 0.78, d + sg * 0.3), f(u1 + 0.25, z + 0.78, d + sg * 0.3), f(u1 + 0.25, z + 0.95, d), f(u0 - 0.25, z + 0.95, d)]
        a = _face(c, q, ZV + f.n * sg); bb = _face(c, [x - ZV * 0.02 for x in q], -ZV - f.n * sg)
        c.m([a, bb], 'WOOD_DARK'); c.nb([a, bb])
    for i in range(n):
        u = u0 + (u1 - u0) * (i + 0.5) / n
        KK.chochin(c, f, u, z, d, img, r=0.16, h=0.45, hook=True, hang=0.15)


def nobori_row(c, f, u0, u1, d, imgs=('NOBORI0', 'NOBORI1'), step=1.6, h=2.6, w=0.5):
    """Row of red flags on bamboo poles in stone weights along the approach."""
    n = max(1, int((u1 - u0) / step) + 1)
    for i in range(n):
        u = u0 + (u1 - u0) * i / max(n - 1, 1)
        KK.nobori(c, f, u, d, imgs[i % len(imgs)], h=h, w=w)
