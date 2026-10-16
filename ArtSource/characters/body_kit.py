"""Body parts and clothing for the figure kit: torso, legs, arms, hands,
head, hair, hats, shoes and the extras that make a figure Japanese (white
face mask, tobi trousers with jika-tabi, rubber fishing apron with white
boots, tenugui headband, sailor collar, gakuran with gold buttons, maekake
shop apron, yukata with obi and geta).

Every builder takes the build context c (figure_kit.FC) and the outfit dict
o (people.py). Heights are fractions of a 1.72 m man (c.z scales them)."""
import math
from mathutils import Vector, Matrix
from characters.figure_kit import lerp_w, ARM_TILT, FWD, X, Y, Z


def W(**kw):
    return kw


def interp(table, zf):
    """Torso table (zf, w, f, k) -> (w, f, k) at zf (linear)."""
    if zf <= table[0][0]:
        return table[0][1:]
    for a, b in zip(table, table[1:]):
        if a[0] <= zf <= b[0]:
            t = (zf - a[0]) / (b[0] - a[0])
            return tuple(a[i] + (b[i] - a[i]) * t for i in (1, 2, 3))
    return table[-1][1:]


def torso_w(zf):
    """Skin weights up the torso: Hips -> Spine -> Chest -> Neck."""
    pts = [(0.86, W(Hips=1)), (0.98, W(Hips=1)), (1.08, W(Hips=0.35, Spine=0.65)), (1.16, W(Spine=1)),
           (1.26, W(Spine=0.3, Chest=0.7)), (1.34, W(Chest=1)), (1.445, W(Chest=1)), (1.49, W(Chest=0.4, Neck=0.6))]
    if zf <= pts[0][0]:
        return pts[0][1]
    for a, b in zip(pts, pts[1:]):
        if a[0] <= zf <= b[0]:
            return lerp_w(a[1], b[1], (zf - a[0]) / (b[0] - a[0]))
    return pts[-1][1]


# ── torso ───────────────────────────────────────────────────────────────────

def torso(c, o):
    """One loft crotch -> neck base. Regions: bottom garment below the top's
    hem, top above; hems and belts are steps (ring pairs at one height)."""
    t = o['top']; bt = o['bottom']
    table = c.body['torso']
    puff = t.get('puff', 0.0)           # jackets/coats stand off the body
    hem = t.get('hem', 0.98)            # top garment ends here (zf)
    if hem < 0.9:                       # coats/robes: the torso is all top, the skirt piece goes on
        hem = 0.0
    lips = {hem, hem + 0.004} if hem else set()
    levels = sorted({r[0] for r in table} | lips | ({1.02, 1.045} if bt.get('belt') and hem > 1.05 else set()))
    if c.lod == 2:
        levels = [0.86, 0.95, 1.05, 1.24, 1.40, 1.455, 1.478]
        levels = sorted(set(levels) | ({hem} if hem else set()))
    rings = []
    for zf in levels:
        w, f, k = interp(table, zf)
        above = zf >= hem
        s = 1 + (puff if above else bt.get('puff', 0.0))
        if bt.get('belt') and 1.02 <= zf <= 1.045:
            s += 0.03
        if above and zf == hem:
            s += 0.06 + puff          # hem lip stands out
        if bt.get('high') and not above and zf > 1.0:   # high-waisted skirt/trousers
            s += 0.02
        reg = t['reg'] if zf >= hem + 0.004 or (zf == hem) else bt['reg']
        if bt.get('belt') and 1.02 <= zf < 1.045:
            reg = bt['belt']
        if zf == hem and zf + 0.004 in levels:
            reg = t['reg']
        rings.append(dict(c=(0, 0.004, c.z(zf)), d=Z, a=w * s, f=f * s, k=k * s, w=torso_w(zf), reg=reg,
                          lod=1 if zf in (hem + 0.004, 1.045) else 2))
    # step at the hem: same height, the top's ring then the body's - the lip faces down
    out = []
    for r in rings:
        out.append(r)
    fn = t.get('pattern')
    if fn:
        for r in out:
            if r['reg'] == t['reg']:
                r['reg'] = fn(c, t)
    c.loft(out, c.n(14, 10, 6), cap0=True, cap1=True, p=2.5)


def hem_step(c, zf, w, f, k, s0, s1, wt, reg_out, reg_in, n, cx=0.0, cy=0.004, d=Z):
    """A short closed band that reads as a hem: outer ring s0 -> inner ring s1."""
    rings = [dict(c=(cx, cy, c.z(zf) + 0.012), d=d, a=w * s0, f=f * s0, k=k * s0, w=wt, reg=reg_out),
             dict(c=(cx, cy, c.z(zf)), d=d, a=w * s0, f=f * s0, k=k * s0, w=wt, reg=reg_in),
             dict(c=(cx, cy, c.z(zf) + 0.002), d=d, a=w * s1, f=f * s1, k=k * s1, w=wt, reg=reg_in)]
    c.loft(rings, n, cap0=False, cap1=False, p=2.5)


# ── legs and shoes ──────────────────────────────────────────────────────────

LEG_ZF = [0.93, 0.86, 0.76, 0.64, 0.52, 0.44, 0.33, 0.22, 0.13]


def legs(c, o):
    bt = o['bottom']; L = c.body['limb']
    hem = bt.get('hem', 0.11)          # trouser hem (zf); skirts: legs below are skin/tights
    skin_below = bt.get('legs', o['skin'])
    kind = bt.get('kind', 'pants')
    for side, s in (('Left', 1), ('Right', -1)):
        hx = s * c.body['hip']
        ul, ll, ft = side + 'UpperLeg', side + 'LowerLeg', side + 'Foot'
        rings = []
        zs = LEG_ZF if c.lod < 2 else [0.93, 0.70, 0.52, 0.30, 0.13]
        zs = sorted(set(zs) | ({hem, hem - 0.003} if kind in ('pants', 'tobi', 'shorts', 'joggers') else set()), reverse=True)
        for zf in zs:
            # radius profile: thigh -> knee -> calf -> ankle
            if zf >= 0.52:
                t = (zf - 0.52) / 0.41
                r = L['knee'] + (L['thigh'] - L['knee']) * math.sqrt(max(t, 0))
            else:
                t = (0.52 - zf) / 0.39
                r = L['knee'] + (L['calf'] - L['knee']) * math.sin(min(t * 1.6, math.pi / 2)) if t < 0.45 else \
                    L['calf'] + (L['ankle'] - L['calf']) * ((t - 0.45) / 0.55) ** 1.2
            clothed = zf >= hem and kind in ('pants', 'tobi', 'shorts', 'joggers')
            if clothed:
                if kind == 'tobi':        # nikka-pokka: balloon thighs and calves, tight at the ankle
                    r = r * (1.0 + 0.9 * math.sin(math.pi * min(max((zf - 0.2) / 0.75, 0), 1)) ** 0.7)
                    if zf < 0.2:
                        r = L['ankle'] * 1.35
                elif kind == 'joggers' and zf < 0.2:
                    r = L['ankle'] * 1.25
                else:
                    r = max(r * 1.12, bt.get('wide', 0.0) or r * 1.12)
                    if bt.get('wide'):
                        r = max(r, bt['wide'])
            if zf == hem - 0.003 and kind in ('pants', 'tobi', 'shorts', 'joggers'):
                pass
            w = W(**{ul: 1}) if zf > 0.56 else (lerp_w(W(**{ul: 1}), W(**{ll: 1}), (0.56 - zf) / 0.08) if zf > 0.48 else W(**{ll: 1}))
            if zf > 0.88:
                w = lerp_w(W(Hips=1), W(**{ul: 1}), (0.93 - zf) / 0.05 * 0.6 + 0.4)
            reg = bt['reg'] if clothed and zf > hem else skin_below
            if bt.get('socks') and zf <= bt['socks'][1]:
                reg = bt['socks'][0]
            rings.append(dict(c=(hx, -0.004 + 0.006 * (0.52 - abs(zf - 0.52)), c.z(zf)), d=-Z, a=r, f=r * 0.98, k=r * 1.04,
                              w=w, reg=reg))
        # trouser hem: outer ring at hem, inner ring at the same height (the lip)
        if kind in ('pants', 'tobi', 'shorts', 'joggers'):
            for i, r in enumerate(rings):
                if abs(r['c'][2] - c.z(hem - 0.003)) < 1e-6:
                    prev = rings[i - 1]
                    r['a'], r['f'], r['k'] = prev['a'] * 0.62, prev['f'] * 0.62, prev['k'] * 0.62
                    if kind == 'shorts' or hem > 0.2:
                        r['a'], r['f'], r['k'] = prev['a'] * 0.8, prev['f'] * 0.8, prev['k'] * 0.8
                    prev['reg'] = bt['reg']
        c.loft(rings, c.n(10, 8, 6), cap0=False, cap1=True)
        shoe(c, o, side, s, hx)


def shoe(c, o, side, s, hx):
    sh = o['shoes']; kind = sh.get('kind', 'sneaker'); L = c.body['limb']
    ft, to, ll = side + 'Foot', side + 'Toes', side + 'LowerLeg'
    k = c.k
    fw = L['foot']
    sole = sh.get('sole', 'SOLE_DARK'); reg = sh['reg']
    if kind == 'geta':
        # raised wooden sole on two teeth, red thong (hanao), tabi-white or bare foot
        c.box((hx, -0.045 * k, 0.055), (0.05, 0.11 * k, 0.012), 'GETA_WOOD', W(**{ft: 0.6, to: 0.4}))
        for yy in (-0.11, 0.02):
            c.box((hx, yy * k, 0.022), (0.048, 0.016, 0.022), 'GETA_WOOD', W(**{ft: 1}))
        foot_skin = sh.get('foot', o['skin'])
        c.loft([dict(c=(hx, 0.03, 0.1), a=0.034, f=0.034, k=0.034, w=W(**{ll: 0.5, ft: 0.5}), reg=foot_skin),
                dict(c=(hx, -0.0, 0.085), a=0.036, f=0.03, k=0.025, w=W(**{ft: 1}), reg=foot_skin),
                dict(c=(hx, -0.09 * k, 0.082), a=0.04, f=0.022, k=0.014, w=W(**{ft: 0.5, to: 0.5}), reg=foot_skin),
                dict(c=(hx, -0.15 * k, 0.078), a=0.036, f=0.014, k=0.01, w=W(**{to: 1}), reg=foot_skin, cap=0.01)],
               c.n(8, 6, 4))
        if c.lod < 2:
            c.tube([(hx - 0.03, -0.02, 0.07), (hx, -0.12 * k, 0.088), (hx + 0.03, -0.02, 0.07)], 0.007, 4, 'HANAO_RED',
                   W(**{ft: 1}))
        return
    top = {'boots': 0.30, 'tabi': 0.22, 'pumps': 0.07, 'sandal': 0.05}.get(kind, 0.11)
    h_toe = {'pumps': 0.032, 'leather': 0.045, 'sandal': 0.03}.get(kind, 0.055)
    heel = 0.03 if kind == 'pumps' else 0.0
    rings = []
    if kind in ('boots', 'tabi'):
        # shaft up the shin: white rubber boots for the harbour, split-toe jika-tabi for the site
        for zf, r in ((top, L['calf'] * (1.25 if kind == 'boots' else 1.05)), (top * 0.6, L['calf'] * (1.15 if kind == 'boots' else 0.95)),
                      (0.13, L['ankle'] * 1.45)):
            wt = W(**{ll: 1}) if zf > 0.13 else W(**{ll: 0.6, ft: 0.4})
            rings.append(dict(c=(hx, 0.0, c.z(zf)), d=-Z, a=r, f=r, k=r * 1.05, w=wt, reg=reg))
        if kind == 'boots' and c.lod < 2:      # rolled-down top (white boots often show the lining)
            c.loft([dict(c=(hx, 0.0, c.z(top) + 0.02), d=-Z, a=L['calf'] * 1.36, f=L['calf'] * 1.36, k=L['calf'] * 1.4,
                         w=W(**{ll: 1}), reg=sh.get('trim', reg)),
                    dict(c=(hx, 0.0, c.z(top) - 0.02), d=-Z, a=L['calf'] * 1.36, f=L['calf'] * 1.36, k=L['calf'] * 1.4,
                         w=W(**{ll: 1}), reg=sh.get('trim', reg))], c.n(10, 8, 6), cap0=True, cap1=False)
        c.loft(rings + [dict(c=(hx, 0.0, c.z(top) - 0.06), d=-Z, a=L['ankle'] * 1.4, f=L['ankle'] * 1.4,
                             k=L['ankle'] * 1.4, w=W(**{ft: 1}), reg=reg)][:len(rings)], c.n(10, 8, 6), cap0=True, cap1=False)
    # the foot: horizontal loft heel -> toe, flat sole (zfloor), f = top, k = bottom
    zf0 = heel
    seq = [(0.055, 0.6 * fw, 0.045, 0.045, W(**{ft: 1})),
           (0.035, 0.95 * fw, 0.065, 0.06, W(**{ft: 1})),
           (-0.03, 1.05 * fw, 0.06 if kind != 'pumps' else 0.045, 0.06, W(**{ft: 1})),
           (-0.10, 1.08 * fw, h_toe * 0.75, 0.05, W(**{ft: 0.4, to: 0.6})),
           (-0.165, 0.92 * fw, h_toe * 0.55, 0.04, W(**{to: 1})),
           (-0.20, 0.55 * fw, h_toe * 0.4, 0.03, W(**{to: 1}))]
    if c.lod == 2:
        seq = [seq[0], seq[2], seq[4], seq[5]]
    for yy, a, ftop, fbot, wt in seq:
        zc = 0.012 + fbot * 0.6 + (heel * max(0, (yy + 0.02) / 0.075) if heel else 0)
        rr = dict(c=(hx, yy * k, zc), d=FWD, a=a, f=ftop, k=fbot, w=wt, zfloor=(heel if yy > 0.0 else 0.0) + 0.0,
                  reg=lambda i, j, ctr, reg=reg, sole=sole, kind=kind, sh=sh: (
                      sole if ctr.z < 0.022 + (heel if ctr.y > 0 else 0) else
                      (sh.get('accent') if sh.get('accent') and kind == 'sneaker' and abs(ctr.x - hx) > 0.035 and 0.03 < ctr.z < 0.06
                       else reg)), p=2.6)
        rings.append(rr)
    foot = rings[-len(seq):]
    for r in foot:
        if r['zfloor'] is not None:
            r['zfloor'] = 0.0 if r['c'][1] < 0.0 else heel
    for r in foot:
        r['cap_reg'] = reg
    c.loft(foot, c.n(10, 8, 6), cap0=True, cap1=True, p=2.6)
    if kind == 'pumps' and c.lod < 2:      # the heel itself
        c.box((hx, 0.04 * k, heel / 2), (0.014, 0.014, heel / 2), sole, W(**{ft: 1}))
    if kind == 'tabi' and c.lod == 0:      # split toe: a groove between big toe and the rest
        c.box((hx + s * 0.012, -0.175 * k, 0.03), (0.003, 0.03, 0.025), 'EYE', W(**{to: 1}))
    if kind == 'sneaker' and c.lod == 0:   # laces / tongue
        c.box((hx, -0.05 * k, 0.085), (0.026, 0.035, 0.008), sh.get('lace', 'SNEAKER_WHITE'), W(**{ft: 1}),
              rot=Matrix.Rotation(math.radians(-28), 3, 'X'))
    if kind == 'sandal' and c.lod < 2:
        c.box((hx, -0.06 * k, 0.05), (0.05, 0.03, 0.012), reg, W(**{ft: 1}))


# ── arms and hands ──────────────────────────────────────────────────────────

def arms(c, o):
    t = o['top']; L = c.body['limb']
    sleeve = t.get('sleeve', 'long')
    s_reg = t.get('sleeve_reg', t['reg'])
    puff = t.get('puff', 0.0)
    hand_reg = o.get('gloves') or o['skin']
    for side, s in (('Left', 1), ('Right', -1)):
        sh0, el = c.J[side + 'UpperArm']; _, wr = c.J[side + 'LowerArm']
        d = (wr - sh0).normalized()
        ua, la = side + 'UpperArm', side + 'LowerArm'
        lu = (el - sh0).length; ll = (wr - el).length
        P = lambda t: sh0 + d * t
        prof = [(-0.025, 0.85 * L['uarm'], W(**{side + 'Shoulder': 0.6, ua: 0.4})),
                (0.03, 1.12 * L['uarm'], W(**{side + 'Shoulder': 0.2, ua: 0.8})),
                (0.12, 1.0 * L['uarm'], W(**{ua: 1})),
                (lu - 0.05, 0.86 * L['uarm'], W(**{ua: 0.85, la: 0.15})),
                (lu, L['elbow'], W(**{ua: 0.5, la: 0.5})),
                (lu + 0.05, L['farm'], W(**{la: 1})),
                (lu + 0.13, L['farm'] * 0.88, W(**{la: 1})),
                (lu + ll - 0.015, L['wrist'], W(**{la: 0.7, side + 'Hand': 0.3}))]
        if c.lod == 2:
            prof = [prof[0], prof[2], prof[4], prof[6], prof[7]]
        end = {'long': lu + ll - 0.03, 'short': 0.15, 'mid': lu + 0.1, 'none': -1, 'wide': lu + 0.14}[sleeve]
        rings = []
        for tt, r, w in prof:
            clothed = tt <= end
            rr = r * (1.12 + puff) if clothed else r
            rings.append(dict(c=P(tt), d=d, a=rr, f=rr * 0.96, k=rr, w=w, reg=s_reg if clothed else o['skin']))
        if sleeve not in ('none',) and c.lod < 2:
            # cuff: outer ring then inner ring at the same place (the sleeve opening)
            i = max(i for i, r in enumerate(rings) if (r['c'] - sh0).dot(d) <= end + 1e-6)
            r_out = rings[i]['a']
            w_end = rings[i]['w']
            base = next((pr[1] for pr in prof if pr[0] > end), L['wrist'])
            rings.insert(i + 1, dict(c=P(end + 0.002), d=d, a=r_out * 1.04, f=r_out, k=r_out * 1.04, w=w_end, reg=s_reg))
            rings.insert(i + 2, dict(c=P(end + 0.004), d=d, a=base * 0.98, f=base * 0.95, k=base * 0.98, w=w_end,
                                     reg=o['skin']))
            if sleeve == 'long':
                rings[i + 2]['reg'] = o['skin']
        if sleeve == 'wide':
            wide_sleeve(c, o, side, s, sh0, d, lu)
        rings[0]['cap'] = 0.03
        c.loft(rings, c.n(10, 7, 5), cap0=True, cap1=False)
        hand(c, side, s, wr, d, hand_reg, L)
        if t.get('cuff_reg') and c.lod == 0 and sleeve == 'long':
            pass


def wide_sleeve(c, o, side, s, sh0, d, lu):
    """Kimono/happi sleeve: a deep rectangular bag hanging from the arm (furi)."""
    t = o['top']; reg = t.get('sleeve_reg', t['reg'])
    ua, la = side + 'UpperArm', side + 'LowerArm'
    n = c.n(10, 8, 6)
    rings = []
    for tt, a, f, k, dy, w in ((0.0, 0.06, 0.06, 0.06, 0.0, W(**{ua: 1})), (0.1, 0.075, 0.08, 0.08, 0.0, W(**{ua: 1})),
                               (lu, 0.07, 0.12, 0.08, 0.0, W(**{ua: 0.5, la: 0.5})),
                               (lu + 0.16, 0.065, 0.17, 0.09, 0.0, W(**{la: 1}))):
        rings.append(dict(c=sh0 + d * tt, d=d, a=a, f=f, k=k, w=w, reg=reg))
    # hanging bag below the sleeve (the long part of a yukata sleeve)
    c.loft(rings, n, cap0=True, cap1=False, p=3.0)
    inner = [dict(r, a=r['a'] * 0.9, f=r['f'] * 0.92, k=r['k'] * 0.92) for r in rings[-2:]]
    for r in inner:
        r['reg'] = t.get('lining', reg)
    c.loft(inner, n, cap0=False, cap1=False, p=3.0, inside=True)
    # lip at the opening
    a, b = rings[-1], inner[-1]
    c.loft([dict(a, reg=reg), dict(b, c=Vector(b['c']) - d * 0.003, reg=reg)], n, cap0=False, cap1=False, p=3.0)


def hand(c, side, s, wr, d, reg, L):
    hb = side + 'Hand'; la = side + 'LowerArm'
    pw = L['palm']
    P = lambda t: wr + d * t
    # flat paddle: thin across (a, towards X), wide front-back (f/k)
    seq = [(-0.01, 0.022, pw * 0.55, pw * 0.5, W(**{la: 0.4, hb: 0.6})),
           (0.03, 0.022, pw * 0.82, pw * 0.72, W(**{hb: 1})),
           (0.08, 0.02, pw * 0.86, pw * 0.75, W(**{hb: 1})),
           (0.125, 0.016, pw * 0.72, pw * 0.62, W(**{hb: 1})),
           (0.16, 0.011, pw * 0.5, pw * 0.42, W(**{hb: 1}))]
    if c.lod == 2:
        seq = [seq[0], seq[2], seq[4]]
    rings = [dict(c=P(t) + FWD * 0.004, d=d, a=a, f=f, k=k, w=w, reg=reg, cap=0.012) for t, a, f, k, w in seq]
    c.loft(rings, c.n(8, 6, 4), cap0=True, cap1=True)
    if c.lod < 2:   # thumb, on the front edge, angled in
        base = P(0.035) + FWD * pw * 0.65
        tip = base + d * 0.055 + FWD * 0.012 + X * (-s * 0.012)
        c.tube([base, tip], 0.0115, c.n(6, 4, 4), reg, W(**{hb: 1}))


# ── neck, head, face ────────────────────────────────────────────────────────

def neck(c, o):
    r = c.body['neck']
    rings = [dict(c=(0, 0.006, c.z(1.42)), a=r * 1.05, f=r, k=r * 1.05, w=W(Chest=0.6, Neck=0.4), reg=o['skin']),
             dict(c=(0, 0.004, c.z(1.49)), a=r, f=r * 0.95, k=r, w=W(Neck=1), reg=o['skin']),
             dict(c=(0, 0.0, c.z(1.55)), a=r * 0.95, f=r * 0.9, k=r * 0.95, w=W(Neck=0.3, Head=0.7), reg=o['skin'])]
    c.loft(rings, c.n(10, 8, 6), cap0=False, cap1=False)


def head(c, o):
    H = c.body['head']; w, f, b = H['w'], H['f'], H['b']
    sk = o['skin']
    hz = lambda zf: c.z(H['chin']) + (zf - 1.495) * (c.z(H['crown']) - c.z(H['chin'])) / 0.25
    # z (as on a 1.72 m man), half width, front, back, centre y
    prof = [(1.497, 0.0, 0, 0, -0.06), (1.505, w * 0.38, f * 0.26, b * 0.2, -0.062),
            (1.52, w * 0.66, f * 0.62, b * 0.42, -0.034), (1.548, w * 0.86, f * 0.84, b * 0.8, -0.012),
            (1.585, w * 0.96, f * 0.98, b * 0.95, -0.004), (1.625, w, f * 0.98, b, 0.0),
            (1.66, w * 0.98, f * 0.92, b * 1.0, 0.002), (1.695, w * 0.88, f * 0.78, b * 0.92, 0.006),
            (1.725, w * 0.62, f * 0.52, b * 0.66, 0.008), (1.745, 0.0, 0, 0, 0.01)]
    if c.lod == 2:
        prof = [prof[0], prof[2], prof[4], prof[6], prof[8], prof[9]]
    rings = [dict(c=(0, cy, hz(zf)), d=Z, a=a, f=ff, k=kk, w=W(Head=1), reg=sk) for zf, a, ff, kk, cy in prof]
    c.loft(rings, c.n(12, 8, 6), p=2.2)
    if c.lod == 2:
        return
    F = lambda x, y, zf: Vector((x, y, hz(zf)))
    # where the face surface is, at a height zf (front of the head loft)
    def face_y(zf):
        for (z0, a0, f0, k0, c0), (z1, a1, f1, k1, c1) in zip(prof, prof[1:]):
            if z0 <= zf <= z1:
                t = (zf - z0) / (z1 - z0)
                return (c0 + (c1 - c0) * t) - (f0 + (f1 - f0) * t)
        return -f
    # nose: a small wedge (bridge, two nostril corners, tip)
    top = F(0, face_y(1.615) + 0.002, 1.615)
    bl = F(0.014, face_y(1.575) + 0.003, 1.575); br = F(-0.014, face_y(1.575) + 0.003, 1.575)
    tip = F(0, face_y(1.582) - 0.017, 1.58)
    vs = [c.bm.verts.new(p) for p in (top, bl, br, tip)]
    c.weigh(vs, W(Head=1))
    nose = [c.bm.faces.new([vs[0], vs[3], vs[1]]), c.bm.faces.new([vs[0], vs[2], vs[3]]), c.bm.faces.new([vs[1], vs[3], vs[2]])]
    c.paint(nose, sk)
    for s in (1, -1):    # ears, a little behind the cheek line
        c.box(F(s * (w + 0.003), 0.012, 1.603), (0.008, 0.016, 0.025), sk, W(Head=1),
              rot=Matrix.Rotation(math.radians(s * 12), 3, 'Z'))
    if c.lod == 0:
        ez = 1.628
        eye = o.get('eyes', 'EYE')
        for s in (1, -1):
            c.box(F(s * 0.03, face_y(ez) - 0.001, ez), (0.011, 0.003, 0.0058), eye, W(Head=1),
                  rot=Matrix.Rotation(math.radians(-s * 8), 3, 'Z'))
            brow = o.get('brows', o.get('hair', {}).get('reg', 'HAIR_BLACK'))
            c.box(F(s * 0.031, face_y(1.652) - 0.001, 1.652), (0.015, 0.003, 0.0032), brow, W(Head=1),
                  rot=Matrix.Rotation(math.radians(-s * 7), 3, 'Y') @ Matrix.Rotation(math.radians(-s * 10), 3, 'Z'))
        if not o.get('mask'):
            c.box(F(0, face_y(1.548) - 0.0005, 1.548), (0.0135, 0.003, 0.0026), 'LIP', W(Head=1))


def mask(c, o):
    """White pleated face mask (very common in Japan): covers nose to chin, ear loops."""
    if c.lod == 2:
        return
    H = c.body['head']; w, f = H['w'], H['f']
    hz = lambda zf: c.z(H['chin']) + (zf - 1.495) * (c.z(H['crown']) - c.z(H['chin'])) / 0.25
    rings = []
    for zf, a, ff in ((1.515, w * 0.72, f * 0.7), (1.555, w * 0.9, f * 0.92), (1.6, w * 0.92, f * 1.02)):
        rings.append(dict(c=(0, -0.004, hz(zf)), d=Z, a=a + 0.004, f=ff + 0.006, k=0.0, w=W(Head=1), reg='MASK'))
    # front half only: a shell from ear to ear
    n = c.n(10, 6, 6)
    vs = []
    for r in rings:
        row = []
        for j in range(n + 1):
            th = math.pi + math.pi * j / n           # left ear -> front -> right ear
            row.append(c.bm.verts.new((r['c'][0] - r['a'] * math.cos(th) * -1, r['c'][1] + r['f'] * math.sin(th), r['c'][2])))
        c.weigh(row, W(Head=1))
        vs.append(row)
    fs = []
    for i in range(len(vs) - 1):
        for j in range(n):
            fs.append(c.bm.faces.new([vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]]))
    from buildings.koedo_kit import orient
    orient(fs, Vector((0, 0.03, hz(1.56))))
    c.paint(fs, 'MASK')


def hair(c, o):
    hr = o.get('hair')
    if not hr:
        return
    H = c.body['head']; w, f, b = H['w'], H['f'], H['b']
    reg = hr['reg']; style = hr.get('style', 'short')
    hz = lambda zf: c.z(H['chin']) + (zf - 1.495) * (c.z(H['crown']) - c.z(H['chin'])) / 0.25
    n = c.n(12, 8, 6)
    # shell rings: plane tilted so the hairline sits high in front and low at the nape
    long_ = style in ('bob', 'long', 'ponytail')
    seq = [(1.62, 1.08, 26 if not long_ else 4), (1.668, 1.1, 18), (1.705, 1.06, 10), (1.738, 0.72, 0), (1.765, 0.0, 0)]
    if long_:
        seq = [(1.5 if style == 'bob' else 1.47, 1.12, 0), (1.57, 1.13, 0), (1.63, 1.1, 8)] + seq[1:]
    if style == 'bun':
        seq = [(1.6, 1.07, 30), (1.66, 1.09, 18), (1.705, 1.05, 10), (1.738, 0.7, 0), (1.76, 0.0, 0)]
    if style == 'crop':
        seq = [(1.63, 1.05, 30), (1.675, 1.06, 18), (1.71, 1.03, 8), (1.735, 0.7, 0), (1.752, 0.0, 0)]
    if c.lod == 2:
        seq = [seq[0], seq[-3], seq[-1]]
    rings = []
    for zf, s, tilt in seq:
        d = Matrix.Rotation(math.radians(-tilt), 3, 'X') @ Z   # normal leans back: front edge rises, nape drops
        rings.append(dict(c=(0, 0.004 + 0.0004 * tilt, hz(zf)), d=d, a=w * s, f=f * s * (0.98 if not long_ else 1.0),
                          k=b * s * 1.02, w=W(Head=1), reg=reg))
    if long_:
        # cut the face out of the lower rings: front faces of bands below the hairline are skipped
        _shell_open_front(c, rings, n, reg, hz)
    else:
        bands, caps = c.loft(rings, n, cap0=False, cap1=True, p=2.2)
        lip(c, rings[0], n, reg)
    if c.lod == 2:
        return
    if style in ('short', 'side', 'crop', 'messy'):
        # fringe: thin locks lying on the forehead under the shell edge; 'side' sweeps them
        locks = ((-0.04, 0, 10), (-0.013, 0.003, 4), (0.014, 0.002, -4), (0.04, -0.002, -10))
        if style == 'crop':
            locks = locks[1:3]
        for i, (x, dz, ang) in enumerate(locks):
            if style == 'side':
                ang += 22; dz -= 0.004 * i
            ln = 0.03 if style != 'crop' else 0.012
            zf = 1.676 + dz
            p = Vector((x, -f * (0.97 if zf > 1.67 else 0.99) - 0.008, hz(zf)))
            c.box(p, (0.016, 0.005, ln / 2), reg, W(Head=1),
                  rot=Matrix.Rotation(math.radians(ang), 3, 'Y') @ Matrix.Rotation(math.radians(-38), 3, 'X'))
        if style == 'messy' and c.lod == 0:
            for x, y, zf, ang in ((0.03, -0.03, 1.742, 20), (-0.04, 0.02, 1.737, -25), (0.0, 0.06, 1.728, 0), (0.05, 0.05, 1.716, 30),
                                  (-0.05, 0.07, 1.705, -30)):
                c.box(Vector((x, y, hz(zf))), (0.018, 0.024, 0.008), reg, W(Head=1),
                      rot=Matrix.Rotation(math.radians(ang), 3, 'Y') @ Matrix.Rotation(math.radians(-25), 3, 'X'))
        for s in (1, -1):   # sideburns, in front of the ear
            c.box(Vector((s * w * 0.99, -0.014, hz(1.612))), (0.005, 0.009, 0.02), reg, W(Head=1))
    if style in ('bob', 'long', 'ponytail'):
        # straight fringe (patsun), slightly parted
        c.box(Vector((0, -f * 1.04, hz(1.668))), (w * 0.86, 0.012, 0.026), reg, W(Head=1),
              rot=Matrix.Rotation(math.radians(-12), 3, 'X'))
    if style == 'ponytail':
        top = Vector((0, b * 1.08, hz(1.66)))
        pts = [top, top + Vector((0, 0.035, -0.04)), top + Vector((0, 0.045, -0.14)), top + Vector((0, 0.035, -0.24))]
        rad = [0.03, 0.034, 0.026, 0.008]
        rr = [dict(c=p, a=r, f=r, k=r, w=W(Head=1) if i < 2 else W(Head=0.6, Neck=0.4), reg=reg) for i, (p, r) in enumerate(zip(pts, rad))]
        c.loft(rr, c.n(8, 6, 4))
        c.box(top + Vector((0, 0.012, -0.004)), (0.02, 0.012, 0.012), hr.get('tie', 'SCARF_RED'), W(Head=1))
    if style == 'long':
        # hair down the back to the shoulder blades, a flat curtain
        rr = []
        for zf, a, k in ((1.6, w * 1.05, b * 1.0), (1.5, w * 1.05, b * 0.8), (1.4, w * 0.95, b * 0.55)):
            rr.append(dict(c=(0, b * 0.55, hz(zf)), d=-Z, a=a, f=0.02, k=k * 0.5,
                           w=W(Head=1) if zf > 1.55 else W(Neck=0.5, Chest=0.5), reg=reg))
        c.loft(rr, c.n(8, 6, 4), p=3.0)
    if style == 'bun':
        top = Vector((0, b * 0.5, hz(1.74)))
        c.loft([dict(c=top + Vector((0, 0, -0.03)), a=0.0, w=W(Head=1), reg=reg),
                dict(c=top, a=0.042, f=0.04, k=0.04, w=W(Head=1), reg=reg),
                dict(c=top + Vector((0, 0.012, 0.045)), a=0.0, w=W(Head=1), reg=reg)], c.n(8, 6, 4))
        if hr.get('pin') and c.lod == 0:
            c.tube([top + Vector((-0.06, 0.0, 0.01)), top + Vector((0.07, 0.01, 0.03))], 0.004, 4, hr['pin'], W(Head=1))
            c.box(top + Vector((0.07, 0.01, 0.03)), (0.012, 0.012, 0.012), hr['pin'], W(Head=1))


def lip(c, r, n, reg):
    """Close the bottom edge of a hair shell or hat: a ring 12 mm in."""
    inner = dict(r, a=r['a'] - 0.012, f=r['f'] - 0.012, k=r['k'] - 0.012)
    c.loft([dict(r, reg=reg), inner], n, cap0=False, cap1=False, p=2.2, inside=True)


def _shell_open_front(c, rings, n, reg, hz):
    """Long hair: a closed shell above the hairline, below it only the sides
    and back (the face stays free); both sides of the open part are built."""
    bm = c.bm
    vs = []
    for r in rings:
        if r['a'] <= 0:
            v = [bm.verts.new(r['c'])]
        else:
            v = c.ring(Vector(r['c']), r['d'], r['a'], r['f'], r['k'], n, 2.2)
        c.weigh(v, r['w'])
        vs.append(v)
    fs = []
    open_rows = [i for i, r in enumerate(rings) if r['c'][2] < hz(1.6)]
    for i in range(len(vs) - 1):
        a, b = vs[i], vs[i + 1]
        for j in range(n):
            jj = (j + 1) % n
            if len(b) == 1:
                fs.append(bm.faces.new([a[j], a[jj], b[0]]))
                continue
            mid = (a[j].co + a[jj].co) / 2
            if i in open_rows and mid.y < -0.035 and abs(mid.x) < 0.07:
                continue
            fs.append(bm.faces.new([a[j], a[jj], b[jj], b[j]]))
    c.paint(fs, reg)
    # inner skin of the shell (seen past the cheeks)
    inner = []
    for f in fs:
        if f.calc_center_median().z < hz(1.66):
            vv = [bm.verts.new(l.vert.co - f.normal * 0.006) for l in f.loops][::-1]
            for v, l in zip(vv, reversed(list(f.loops))):
                pass
            c.weigh(vv, W(Head=1))
            inner.append(bm.faces.new(vv))
    for f in inner:
        f.normal_update()
    c.paint(inner, reg)


# ── hats ────────────────────────────────────────────────────────────────────

def hat(c, o):
    ht = o.get('hat')
    if not ht:
        return
    H = c.body['head']; w, f, b = H['w'], H['f'], H['b']
    hz = lambda zf: c.z(H['chin']) + (zf - 1.495) * (c.z(H['crown']) - c.z(H['chin'])) / 0.25
    kind = ht['kind']; reg = ht['reg']
    n = c.n(12, 8, 6)
    if kind == 'helmet':
        # construction helmet: shell with a centre ridge, short visor, brim lip, chin strap
        rr = []
        for zf, s in ((1.64, 1.2), (1.68, 1.22), (1.72, 1.17), (1.755, 1.0), (1.785, 0.68), (1.8, 0.0)):
            rr.append(dict(c=(0, 0.006, hz(zf)), d=Z, a=w * s, f=f * s, k=b * s, w=W(Head=1), reg=reg))
        if c.lod == 2:
            rr = [rr[0], rr[2], rr[4], rr[5]]
        c.loft(rr, n, cap0=False, cap1=True, p=2.2)
        lip(c, rr[0], n, reg)
        if c.lod < 2:
            c.box(Vector((0, 0.0, hz(1.79))), (0.016, 0.1, 0.01), reg, W(Head=1))                 # ridge
            c.box(Vector((0, -f * 1.25, hz(1.643))), (w * 0.8, 0.035, 0.006), reg, W(Head=1),
                  rot=Matrix.Rotation(math.radians(10), 3, 'X'))                                  # visor
            c.tube([Vector((w * 1.12, -0.01, hz(1.645))), Vector((w * 0.75, -0.05, hz(1.5))),
                    Vector((0, -0.07, hz(1.49))), Vector((-w * 0.75, -0.05, hz(1.5))), Vector((-w * 1.12, -0.01, hz(1.645)))],
                   0.004, 4, 'STRAP_BLACK', W(Head=1), caps=False)
        if c.lod == 0 and ht.get('sticker'):
            c.box(Vector((0, -f * 1.2, hz(1.71))), (0.03, 0.004, 0.012), ht['sticker'], W(Head=1),
                  rot=Matrix.Rotation(math.radians(-20), 3, 'X'))
    elif kind == 'cap':
        rr = [dict(c=(0, 0.006, hz(1.655)), d=Z, a=w * 1.1, f=f * 1.08, k=b * 1.1, w=W(Head=1), reg=reg),
              dict(c=(0, 0.008, hz(1.71)), d=Z, a=w * 1.06, f=f * 1.0, k=b * 1.06, w=W(Head=1), reg=reg),
              dict(c=(0, 0.01, hz(1.755)), d=Z, a=w * 0.7, f=f * 0.66, k=b * 0.7, w=W(Head=1), reg=reg),
              dict(c=(0, 0.01, hz(1.77)), d=Z, a=0.0, w=W(Head=1), reg=reg)]
        c.loft(rr, n, cap0=False, cap1=True)
        lip(c, rr[0], n, reg)
        back = ht.get('backwards')
        sy = 1 if back else -1
        c.box(Vector((0, sy * (f * 1.12 + 0.045), hz(1.655))), (w * 0.85, 0.05, 0.005), ht.get('bill', reg), W(Head=1),
              rot=Matrix.Rotation(math.radians(-8 * sy), 3, 'X'))
        if ht.get('badge') and c.lod < 2:
            c.box(Vector((0, -f * 1.1, hz(1.69))), (0.012, 0.004, 0.014), 'BUTTON_GOLD', W(Head=1))
    elif kind in ('sunhat', 'bucket', 'flat'):
        top = {'sunhat': 1.77, 'bucket': 1.77, 'flat': 1.735}[kind]
        brim_r = ht.get('brim', {'sunhat': 0.2, 'bucket': 0.12, 'flat': 0.0}[kind])
        rr = [dict(c=(0, 0.006, hz(1.66)), d=Z, a=w * 1.14, f=f * 1.1, k=b * 1.12, w=W(Head=1), reg=reg),
              dict(c=(0, 0.006, hz(top - 0.03)), d=Z, a=w * 1.05, f=f * 1.0, k=b * 1.04, w=W(Head=1),
                   reg=ht.get('band', reg) if kind == 'sunhat' else reg),
              dict(c=(0, 0.006, hz(top)), d=Z, a=w * 0.95, f=f * 0.9, k=b * 0.95, w=W(Head=1), reg=reg, cap=0.008)]
        if kind == 'flat':   # hunting cap (hantingu): flat crown pulled forward, short bill
            rr = [dict(c=(0, 0.006, hz(1.66)), d=Z, a=w * 1.12, f=f * 1.08, k=b * 1.1, w=W(Head=1), reg=reg),
                  dict(c=(0, -0.004, hz(1.72)), d=Z, a=w * 1.14, f=f * 1.18, k=b * 1.02, w=W(Head=1), reg=reg, cap=0.004)]
        c.loft(rr, n, cap0=False, cap1=True, p=2.4)
        lip(c, rr[0], n, reg)
        if brim_r:
            # brim: annulus with thickness, drooping a little at the rim
            m = c.n(16, 10, 8)
            pr = [(w * 1.1, hz(1.665)), (w * 1.1 + brim_r, hz(1.665) - brim_r * 0.25),
                  (w * 1.1 + brim_r, hz(1.665) - brim_r * 0.25 - 0.006), (w * 1.1, hz(1.665) - 0.008)]
            c.lathe(pr, m, 0, 0.006, reg, W(Head=1), closed=True, sx=1.0, sy=1.1)
        if kind == 'flat' and c.lod < 2:
            c.box(Vector((0, -f * 1.2 - 0.02, hz(1.665))), (w * 0.8, 0.035, 0.005), reg, W(Head=1),
                  rot=Matrix.Rotation(math.radians(-14), 3, 'X'))
    elif kind in ('hachimaki', 'towel'):
        # tenugui tied round the forehead, knot at the back (or a towel knotted at the front)
        zf = 1.66
        rr = [dict(c=(0, 0.006, hz(zf - 0.016)), d=Z, a=w * 1.06, f=f * 1.04, k=b * 1.06, w=W(Head=1), reg=reg),
              dict(c=(0, 0.006, hz(zf + 0.016)), d=Z, a=w * 1.03, f=f * 1.0, k=b * 1.03, w=W(Head=1), reg=reg)]
        c.loft(rr, n, cap0=False, cap1=False)
        lip(c, dict(rr[0], c=(0, 0.006, hz(zf - 0.016))), n, reg)
        lip(c, dict(rr[1], k=rr[1]['k'], c=(0, 0.006, hz(zf + 0.016))), n, reg)
        if c.lod < 2:
            ky = -f * 1.07 if kind == 'towel' else b * 1.08
            c.box(Vector((0, ky, hz(zf))), (0.02, 0.015, 0.018), reg, W(Head=1))
            for s in (1, -1):
                c.box(Vector((s * 0.02, ky + (0.012 if ky > 0 else -0.012), hz(zf - 0.035))), (0.012, 0.004, 0.03), reg, W(Head=1),
                      rot=Matrix.Rotation(math.radians(s * 20), 3, 'Y'))


# ── clothing pieces ─────────────────────────────────────────────────────────

def skirt(c, o, z0, z1, flare, reg, pleats=0, lining=None, inner=True):
    """Skirt, coat tail or robe: a cone from the waist down, weighted from the
    hips into the thighs so it follows a stride. Built with an inner shell."""
    table = c.body['torso']
    n = c.n(20 if pleats else 14, 12, 8)
    levels = [z0, z0 - (z0 - z1) * 0.35, z0 - (z0 - z1) * 0.7, z1]
    if c.lod == 2:
        levels = [z0, z1]
    rings = []
    for i, zf in enumerate(levels):
        t = (z0 - zf) / max(z0 - z1, 1e-6)
        w, f, k = interp(table, max(zf, 0.9))
        s = 1.04 + flare * t
        rings.append(dict(c=(0, 0.006 + 0.01 * t, c.z(zf)), d=-Z, a=w * s, f=f * s * (1 + 0.15 * t), k=k * s * (1 + 0.1 * t),
                          t=t, reg=reg))
    bm = c.bm

    def build(rings, inward):
        vs = []
        for r in rings:
            v = c.ring(Vector(r['c']), r['d'], r['a'], r['f'], r['k'], n, 2.3)
            if pleats and c.lod < 2:
                for j, vv in enumerate(v):
                    if j % 2:
                        ctr = Vector(r['c'])
                        vv.co = ctr + (vv.co - ctr) * (1 - 0.06 * r['t'])
            for vv in v:
                # left/right share by x, more leg the lower down
                sl = min(max(0.5 + vv.co.x / 0.2, 0.0), 1.0)
                legw = 0.75 * r['t'] ** 1.2
                c.weigh([vv], {'Hips': 1 - legw + 1e-4, 'LeftUpperLeg': legw * sl + 1e-4, 'RightUpperLeg': legw * (1 - sl) + 1e-4})
            vs.append(v)
        fs = []
        for i in range(len(vs) - 1):
            a, b = vs[i], vs[i + 1]
            for j in range(n):
                jj = (j + 1) % n
                q = [a[j], a[jj], b[jj], b[j]]
                fs.append(bm.faces.new(q[::-1] if inward else q))
        return vs, fs
    vo, fo = build(rings, False)
    c.paint(fo, reg)
    if inner and c.lod < 2:
        ri = [dict(r, a=r['a'] - 0.008, f=r['f'] - 0.008, k=r['k'] - 0.008) for r in rings[1:]]
        vi, fi = build(ri, True)
        c.paint(fi, lining or reg)
        # hem lip joining outer and inner bottom rings
        a, b = vo[-1], vi[-1]
        hem = [bm.faces.new([a[(j + 1) % n], a[j], b[j], b[(j + 1) % n]]) for j in range(n)]
        c.paint(hem, reg)
    return rings


def collar_band(c, zf, r, h, reg, wt=None, front_gap=False, sy=1.0, fwd=0.0):
    """Closed band round the neck (shirt collar, stand collar of a gakuran, rib collar)."""
    n = c.n(12, 8, 6)
    z0 = c.z(zf)
    pr = [(r, z0), (r + 0.01, z0), (r + 0.006, z0 + h), (r - 0.002, z0 + h)]
    return c.lathe(pr, n, 0, 0.004 + fwd, reg, wt or W(Neck=0.5, Chest=0.5), closed=True, sy=sy)


def plate(c, centre, half, reg, wt, rot=None):
    return c.box(centre, half, reg, wt, rot=rot)


def front_y(c, zf, x=0.0):
    """y of the torso's front surface at height zf (for things lying on the chest)."""
    w, f, k = interp(c.body['torso'], zf)
    return -f * math.sqrt(max(1 - (abs(x) / w) ** 2.5, 0.05)) ** 1.0 + 0.004


def back_y(c, zf, x=0.0):
    w, f, k = interp(c.body['torso'], zf)
    return k * math.sqrt(max(1 - (abs(x) / w) ** 2.5, 0.05)) + 0.004
