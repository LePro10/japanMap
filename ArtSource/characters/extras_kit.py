"""Clothing details and carried things for the figure kit: collars, lapels,
zips, buttons, emblems (top_details) and the extras list of people.py
(tie, glasses, mask, bags, hi-vis vest, aprons, towels, belts).

Everything rides on the bones it belongs to: bags on Chest/Spine or rigidly
on a hand, aprons below the waist share Hips and thighs like a skirt."""
import math
from mathutils import Vector, Matrix
from characters import body_kit as B
from characters.figure_kit import lerp_w, X, Y, Z, FWD

W = B.W
Rx = lambda a: Matrix.Rotation(math.radians(a), 3, 'X')
Ry = lambda a: Matrix.Rotation(math.radians(a), 3, 'Y')
Rz = lambda a: Matrix.Rotation(math.radians(a), 3, 'Z')


def fy(c, zf, x=0.0, puff=0.0):
    """Front surface y of the clothed torso at zf (negative = in front)."""
    w, f, k = B.interp(c.body['torso'], zf)
    s = 1 + puff
    q = max(1 - (abs(x) / (w * s)) ** 2.5, 0.02) ** (1 / 2.5)
    return 0.004 - f * s * q


def by(c, zf, x=0.0, puff=0.0):
    w, f, k = B.interp(c.body['torso'], zf)
    s = 1 + puff
    q = max(1 - (abs(x) / (w * s)) ** 2.5, 0.02) ** (1 / 2.5)
    return 0.004 + k * s * q


def on_front(c, zf, x, puff, out=0.004):
    return Vector((x, fy(c, zf, x, puff) - out, c.z(zf)))


def strip_front(c, z0, z1, x, half_w, reg, puff, out=0.003, depth=0.003, n=4):
    """A flat strip lying on the chest from z0 down to z1 (zip, placket, tie)."""
    pts = [on_front(c, z0 + (z1 - z0) * i / n, x, puff, out) for i in range(n + 1)]
    rings = [dict(c=p, a=half_w(i / n) if callable(half_w) else half_w, f=depth, k=depth,
                  w=B.torso_w(z0 + (z1 - z0) * i / n), reg=reg) for i, p in enumerate(pts)]
    return c.loft(rings, 4, p=2.0)


def vfront(c, z_top, z_bot, half_top, reg, puff, out=0.002, n=4, half_bot=0.003):
    """V-shaped sheet on the chest (shirt or blouse in the jacket opening)."""
    rows = []
    for i in range(n + 1):
        zf = z_top + (z_bot - z_top) * i / n
        hw = half_top + (half_bot - half_top) * i / n
        row = [c.bm.verts.new(on_front(c, zf, x, puff, out)) for x in (-hw, 0.0, hw)]
        c.weigh(row, B.torso_w(zf))
        rows.append(row)
    fs = []
    for i in range(n):
        for j in range(2):
            f = c.bm.faces.new([rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]])
            f.normal_update()
            if f.normal.y > 0:
                f.normal_flip()
            fs.append(f)
    c.paint(fs, reg)
    return fs


def lapel(c, s, z_top, z_bot, x_top, x_bot, width, reg, puff, out=0.006):
    """Lapel / collar edge: a flat bar from the shoulder down to the V point."""
    a = on_front(c, z_top, s * x_top, puff, out)
    b = on_front(c, z_bot, s * x_bot, puff, out)
    mid = (a + b) / 2
    d = (a - b)
    ang = math.degrees(math.atan2(d.x, d.z))
    c.box(mid, (width, 0.004, d.length / 2), reg, B.torso_w((z_top + z_bot) / 2),
          rot=Ry(-ang) @ Rx(math.degrees(math.atan2(-(a.y - b.y), d.length)) * 0.0))


def button(c, zf, x, reg, puff, r=0.008):
    if c.lod > 0:
        return
    p = on_front(c, zf, x, puff, 0.004)
    c.box(p, (r, 0.003, r), reg, B.torso_w(zf))


def emblem_back(c, reg, puff, z0=1.2, z1=1.42):
    """Planar emblem over the back faces of the torso (bg = jacket colour)."""
    bm = c.bm
    zc0, zc1 = c.z(z0), c.z(z1)
    h = zc1 - zc0
    faces = [f for f in bm.faces if f.calc_center_median().y > 0.04 and zc0 - 0.05 < f.calc_center_median().z < zc1 + 0.05
             and abs(f.calc_center_median().x) < 0.15]
    for f in faces:
        f.normal_update()
    faces = [f for f in faces if f.normal.y > 0.45]
    origin = Vector((h / 2, 0, zc0))       # seen from behind: +x is the left of the picture
    c.paint_planar(faces, reg, origin, Vector((-1, 0, 0)), Z, h, h)


def top_details(c, o):
    t = o['top']; kind = t['kind']; puff = t.get('puff', 0.0)
    nr = c.body['neck']
    lo = c.lod
    if t.get('hem', 1) < 0.9:   # coats and robes go on below the crotch as a skirt
        flare = {'trench': 0.32, 'yukata': 0.12, 'suit': 0.05, 'happi': 0.12}.get(kind, 0.2)
        B.skirt(c, o, 0.99, t['hem'], flare, t['reg'], lining=t.get('lining'))
    bt = o['bottom']
    if bt.get('kind') == 'skirt':
        B.skirt(c, o, 1.0 if not bt.get('high') else 1.06, bt.get('hem', 0.5), bt.get('flare', 0.35), bt['reg'],
                pleats=bt.get('pleats', 0))
    if bt.get('kind') == 'robe':
        pass
    if kind == 'bomber':
        rib = t.get('rib', 'RIB_BLACK')
        B.collar_band(c, 1.445, nr * 1.45, 0.035, rib)
        if lo < 2:
            # tee showing in the open zip, the zip itself
            vfront(c, 1.47, 1.405, 0.032, t.get('inner', 'TEE_WHITE'), puff, out=0.002, n=2)
            strip_front(c, 1.405, 0.99, 0.0, 0.006, t.get('zip', 'ZIP'), puff, out=0.002, depth=0.003)
            # sleeve stripes: two thin lines down the outside of each sleeve
            for side, s in (('Left', 1), ('Right', -1)):
                sh, el = c.J[side + 'UpperArm']; _, wr = c.J[side + 'LowerArm']
                d = (wr - sh).normalized()
                outv = Vector((s * math.cos(math.radians(12)), 0, s * math.sin(math.radians(12)) * 0 + 0.0)).normalized()
                L = c.body['limb']
                for off in (-0.012, 0.012):
                    pts = []
                    for tt, r in ((0.02, 1.18 * L['uarm']), (0.15, 1.0 * L['uarm']), ((el - sh).length, L['elbow']),
                                  ((wr - sh).length - 0.05, L['wrist'] * 1.1)):
                        pts.append(sh + d * tt + outv * (r * (1.12 + puff) + 0.002) + FWD * off)
                    wts = lambda i, side=side: W(**{side + 'UpperArm': 1}) if i < 2 else (
                        W(**{side + 'UpperArm': 0.5, side + 'LowerArm': 0.5}) if i == 2 else W(**{side + 'LowerArm': 1}))
                    c.tube(pts, 0.0045, 3 if lo else 4, t['stripe'], wts, caps=False)
            # rib cuffs
            for side, s in (('Left', 1), ('Right', -1)):
                sh, el = c.J[side + 'UpperArm']; _, wr = c.J[side + 'LowerArm']
                d = (wr - sh).normalized()
                L = c.body['limb']
                p0 = wr - d * 0.07
                c.loft([dict(c=p0, d=d, a=L['wrist'] * 1.45, f=L['wrist'] * 1.4, k=L['wrist'] * 1.45,
                             w=W(**{side + 'LowerArm': 1}), reg=rib),
                        dict(c=wr - d * 0.03, d=d, a=L['wrist'] * 1.3, f=L['wrist'] * 1.25, k=L['wrist'] * 1.3,
                             w=W(**{side + 'LowerArm': 1}), reg=rib)], c.n(10, 7, 5), cap0=False, cap1=False)
            # rib waistband (a band just above the hem)
            w, f, k = B.interp(c.body['torso'], 0.99)
            s = 1.08 + puff
            c.loft([dict(c=(0, 0.004, c.z(0.985)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(0.99), reg=rib),
                    dict(c=(0, 0.004, c.z(1.03)), d=Z, a=w * (s - 0.01), f=f * (s - 0.01), k=k * (s - 0.01), w=B.torso_w(1.03), reg=rib)],
                   c.n(14, 10, 6), cap0=False, cap1=False, p=2.5)
            # chest pocket with zip (left chest)
            if lo == 0:
                c.box(on_front(c, 1.3, 0.085, puff, 0.002), (0.035, 0.003, 0.004), t['stripe'], B.torso_w(1.3),
                      rot=Ry(-20))
        if t.get('emblem') and lo < 2:
            emblem_back(c, 'EMBLEM' if t['reg'] == 'JACKET_NAVY' else 'EMBLEM_CREAM', puff)
    elif kind in ('suit', 'trench', 'cardigan', 'vest', 'happi', 'yukata'):
        inner = t.get('shirt') or t.get('inner')
        vz = {'suit': 1.25, 'trench': 1.3, 'cardigan': 1.22, 'vest': 1.25, 'happi': 1.2, 'yukata': 1.24}[kind]
        if inner and lo < 2:
            # the inner layer in the V opening
            vfront(c, 1.45, vz - 0.01, 0.062, inner, puff, out=0.003)
        if t.get('shirt'):
            B.collar_band(c, 1.445, nr * 1.15, 0.04, t['shirt'], wt=W(Neck=0.6, Chest=0.4))
        if kind == 'yukata':
            B.collar_band(c, 1.44, nr * 1.3, 0.03, t['reg'])
        if lo < 2:
            lw = {'trench': 0.03, 'suit': 0.022, 'happi': 0.018, 'yukata': 0.02}.get(kind, 0.012)
            for s in (1, -1):
                lapel(c, s, 1.455, vz, 0.062, 0.004 if kind != 'yukata' else -s * 0.02, lw,
                      t.get('lapel', t['reg']), puff, out=0.009)
            if kind in ('happi',):   # the eri band runs on down the front to the hem
                for s in (1, -1):
                    strip_front(c, vz, 0.86, s * 0.012, 0.016, t.get('lapel', 'SUIT_BLACK'), puff, out=0.005)
        if kind == 'suit' and lo == 0:
            for zf in (1.08, 1.0):
                button(c, zf, 0.0, 'SUIT_BLACK', puff)
            for s in (1, -1):
                c.box(on_front(c, 0.97, s * 0.095, puff, 0.004), (0.045, 0.004, 0.008), t['reg'], B.torso_w(0.97))
            c.box(on_front(c, 1.31, 0.09, puff, 0.004), (0.03, 0.003, 0.006), t['reg'], B.torso_w(1.31))
        if kind == 'trench':
            if lo < 2:
                for zf in (1.2, 1.1, 0.98):
                    for x in (0.05, -0.05):
                        button(c, zf, x, 'TRENCH_DARK', puff, 0.009)
                for side, s in (('Left', 1), ('Right', -1)):   # epaulettes
                    sh = c.J[side + 'UpperArm'][0]
                    c.box(Vector((s * 0.12, 0.004, sh.z + 0.028)), (0.055, 0.02, 0.005), t['reg'], W(Chest=1), rot=Ry(-s * 14))
            w, f, k = B.interp(c.body['torso'], 1.05)
            s = 1.1 + puff
            c.loft([dict(c=(0, 0.004, c.z(1.03)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(1.03), reg=t['belt']),
                    dict(c=(0, 0.004, c.z(1.065)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(1.065), reg=t['belt'])],
                   c.n(14, 10, 6), cap0=False, cap1=False, p=2.5)
            if lo < 2:
                c.box(on_front(c, 1.05, -0.05, puff + 0.1, 0.002), (0.02, 0.004, 0.018), 'BUCKLE', B.torso_w(1.05))
                c.box(on_front(c, 1.02, -0.09, puff + 0.1, 0.0), (0.012, 0.004, 0.06), t['belt'], B.torso_w(1.0))
        if kind == 'cardigan' and lo == 0:
            for zf in (1.18, 1.1, 1.02, 0.94):
                button(c, zf, 0.0, 'BUCKLE', puff, 0.006)
        if kind == 'vest':
            pass
        if kind == 'yukata':
            obi(c, o, puff)
            if t.get('print') and lo == 0:
                flowers(c, o)
    elif kind == 'gakuran':
        B.collar_band(c, 1.44, nr * 1.3, 0.045, t['reg'])
        if lo < 2:
            B.collar_band(c, 1.484, nr * 1.25, 0.004, 'SHIRT_WHITE')   # the white collar liner on top
            for i in range(5):
                button(c, 1.4 - i * 0.095, 0.0, 'BUTTON_GOLD', puff, 0.009)
            if lo == 0:
                strip_front(c, 1.43, 0.94, 0.0, 0.004, 'SUIT_BLACK', puff, out=0.001, depth=0.002)
    elif kind == 'sailor':
        col = t['collar']
        if lo < 2:
            for s in (1, -1):
                lapel(c, s, 1.455, 1.29, 0.065, 0.0, 0.026, col, puff, out=0.005)
            # square flap on the back with a white line
            z0, z1 = 1.3, 1.46
            yb = by(c, 1.4, 0, puff) + 0.006
            c.box(Vector((0, yb, c.z((z0 + z1) / 2))), (0.125, 0.004, c.z((z1 - z0) / 2)), col, W(Chest=1), rot=Rx(-6))
            if lo == 0:
                for dz in (0.015,):
                    c.box(Vector((0, yb + 0.004, c.z(z0 + dz))), (0.11, 0.002, 0.004), 'SAILOR_WHITE', W(Chest=1), rot=Rx(-6))
                    for s in (1, -1):
                        c.box(Vector((s * 0.11, yb + 0.004, c.z((z0 + z1) / 2))), (0.004, 0.002, c.z((z1 - z0) / 2) - 0.01),
                              'SAILOR_WHITE', W(Chest=1), rot=Rx(-6))
            # red scarf knot and its tails
            p = on_front(c, 1.3, 0, puff, 0.012)
            c.box(p, (0.022, 0.012, 0.018), t['scarf'], B.torso_w(1.3))
            for s in (1, -1):
                c.box(p + Vector((s * 0.018, 0.002, -0.06)), (0.016, 0.004, 0.05), t['scarf'], B.torso_w(1.24), rot=Ry(s * 12))
            c.box(on_front(c, 1.38, 0, puff, 0.0), (0.035, 0.003, 0.05), t['reg'], B.torso_w(1.38))
        # navy cuffs
    elif kind == 'hoodie':
        if lo < 2:
            # the hood lies bunched round the back of the neck
            yb = by(c, 1.42, 0, puff)
            pts = [Vector((0.085, -0.01, c.z(1.455))), Vector((0.08, yb * 0.6, c.z(1.47))), Vector((0.0, yb + 0.015, c.z(1.465))),
                   Vector((-0.08, yb * 0.6, c.z(1.47))), Vector((-0.085, -0.01, c.z(1.455)))]
            c.tube(pts, 0.032, c.n(8, 6, 4), t['reg'], W(Chest=0.6, Neck=0.4))
            c.loft([dict(c=(0, yb + 0.012, c.z(1.44)), d=-Z, a=0.09, f=0.02, k=0.02, w=W(Chest=1), reg=t['reg']),
                    dict(c=(0, yb + 0.02, c.z(1.36)), d=-Z, a=0.075, f=0.025, k=0.025, w=W(Chest=1), reg=t['reg']),
                    dict(c=(0, yb + 0.0, c.z(1.3)), d=-Z, a=0.03, f=0.01, k=0.01, w=W(Chest=1), reg=t['reg'])],
                   c.n(8, 6, 4), p=2.6)
            # kangaroo pocket and drawstrings
            c.box(on_front(c, 1.03, 0, puff, 0.004), (0.095, 0.006, 0.05), t['reg'], B.torso_w(1.03))
            if lo == 0:
                for s in (1, -1):
                    c.tube([on_front(c, 1.45, s * 0.03, puff, 0.004), on_front(c, 1.31, s * 0.035, puff, 0.004)], 0.003, 3,
                           'TEE_WHITE', B.torso_w(1.4), caps=False)
        B.collar_band(c, 1.44, nr * 1.4, 0.025, t['reg'])
    elif kind == 'knit':
        B.collar_band(c, 1.44, nr * 1.45, 0.028, t['reg'])
    elif kind == 'work':
        B.collar_band(c, 1.445, nr * 1.3, 0.03, t['reg'])
        if lo < 2:
            for s in (1, -1):    # pointed collar tips
                c.box(on_front(c, 1.445, s * 0.04, puff, 0.008), (0.025, 0.004, 0.022), t['reg'], W(Chest=1), rot=Ry(s * 35))
            c.box(on_front(c, 1.31, 0.08, puff, 0.004), (0.04, 0.004, 0.045), t['reg'], B.torso_w(1.31))
            if lo == 0:
                strip_front(c, 1.43, 0.97, -0.004, 0.012, t['reg'], puff, out=0.003)
    if o.get('top', {}).get('kind') == 'yukata':
        pass


def obi(c, o, puff):
    t = o['top']
    w, f, k = B.interp(c.body['torso'], 1.1)
    s = 1.1 + puff
    rr = []
    for zf in (1.02, 1.17):
        rr.append(dict(c=(0, 0.004, c.z(zf)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(zf), reg=t['obi']))
    c.loft(rr, c.n(14, 10, 6), cap0=False, cap1=False, p=2.5)
    for r in rr:
        B.lip(c, dict(r, a=r['a'] + 0.004, f=r['f'] + 0.004, k=r['k'] + 0.004), c.n(14, 10, 6), t['obi'])
    if c.lod < 2:
        # bunko bow at the back: knot, two wings, two tails
        yb = by(c, 1.1, 0, puff + 0.1) + 0.03
        c.box(Vector((0, yb, c.z(1.1))), (0.03, 0.03, 0.05), t['obi'], B.torso_w(1.1))
        for sx in (1, -1):
            c.box(Vector((sx * 0.1, yb + 0.005, c.z(1.12))), (0.07, 0.025, 0.05), t['obi'], B.torso_w(1.1), rot=Ry(sx * 10))
        c.box(Vector((0, yb + 0.01, c.z(1.0))), (0.05, 0.012, 0.08), t['obi'], B.torso_w(1.0))
        # obijime cord
        c.loft([dict(c=(0, 0.004, c.z(1.095)), d=Z, a=w * (s + 0.02), f=f * (s + 0.03), k=k * (s + 0.02), w=B.torso_w(1.1),
                     reg='OBI_YELLOW'),
                dict(c=(0, 0.004, c.z(1.105)), d=Z, a=w * (s + 0.02), f=f * (s + 0.03), k=k * (s + 0.02), w=B.torso_w(1.1),
                     reg='OBI_YELLOW')], c.n(14, 10, 6), cap0=False, cap1=False, p=2.5)


def flowers(c, o):
    """Asagao print as geometry: a few pale five-petal discs on the robe."""
    import random
    r = random.Random(7)
    spots = [(1.35, 0.08, -1), (1.25, -0.11, -1), (0.8, 0.12, -1), (0.6, -0.08, -1), (0.4, 0.14, -1), (0.3, -0.12, -1),
             (1.3, 0.06, 1), (0.9, -0.1, 1), (0.5, 0.1, 1), (0.25, -0.05, 1)]
    for zf, x, side in spots:
        if 0.98 < zf < 1.2:
            continue
        if zf >= 0.9:
            y = (fy(c, zf, x, 0.05) - 0.004) if side < 0 else (by(c, zf, x, 0.05) + 0.004)
        else:
            t = (0.99 - zf) / 0.9
            w, f, k = B.interp(c.body['torso'], 0.9)
            s = 1.04 + 0.12 * t
            q = max(1 - (abs(x) / (w * s)) ** 2.3, 0.02) ** (1 / 2.3)
            y = (0.006 + 0.01 * t - f * s * (1 + 0.15 * t) * q - 0.004) if side < 0 else (0.006 + 0.01 * t + k * s * (1 + 0.1 * t) * q + 0.004)
        rr = 0.028
        ctr = Vector((x, y, c.z(zf)))
        n = 10
        vs = [c.bm.verts.new(ctr + Vector((rr * (0.75 + 0.25 * math.cos(5 * a)) * math.cos(a), 0,
                                            rr * (0.75 + 0.25 * math.cos(5 * a)) * math.sin(a))))
              for a in (2 * math.pi * i / n for i in range(n))]
        mid = c.bm.verts.new(ctr + Vector((0, side * 0.001, 0)))
        if zf >= 0.9:
            wt = B.torso_w(zf)
        else:
            t = (0.99 - zf) / 0.9; legw = 0.75 * t ** 1.2; sl = min(max(0.5 + x / 0.2, 0), 1)
            wt = {'Hips': 1 - legw + 1e-4, 'LeftUpperLeg': legw * sl + 1e-4, 'RightUpperLeg': legw * (1 - sl) + 1e-4}
        c.weigh(vs + [mid], wt)
        fs = []
        for i in range(n):
            q = [mid, vs[i], vs[(i + 1) % n]]
            f = c.bm.faces.new(q if side > 0 else q[::-1])
            fs.append(f)
        c.paint(fs, 'KNIT_CREAM')


# ── extras ──────────────────────────────────────────────────────────────────

def tie(c, o, reg):
    puff = o['top'].get('puff', 0.0)
    p = on_front(c, 1.44, 0, puff, 0.012)
    c.box(p, (0.014, 0.008, 0.013), reg, B.torso_w(1.44), rot=Rx(10))
    strip_front(c, 1.425, 1.13, 0.0, lambda t: 0.012 + 0.022 * t, reg, puff - 0.02, out=0.01, depth=0.0035, n=c.n(4, 3, 2))


def glasses(c, o):
    if c.lod == 2:
        return
    H = c.body['head']; f = H['f']; w = H['w']
    hz = lambda zf: c.z(H['chin']) + (zf - 1.495) * (c.z(H['crown']) - c.z(H['chin'])) / 0.25
    zc = hz(1.628)
    for s in (1, -1):
        cx = s * 0.032
        pts = [Vector((cx + 0.02 * math.cos(a), -f - 0.012, zc + 0.013 * math.sin(a)))
               for a in (2 * math.pi * i / 8 for i in range(9))]
        c.tube(pts, 0.0025, 3, 'GLASSES', W(Head=1), caps=False)
        c.tube([Vector((s * 0.052, -f - 0.01, zc + 0.006)), Vector((s * (w + 0.006), -0.02, zc + 0.008)),
                Vector((s * (w + 0.004), 0.01, zc - 0.01))], 0.0022, 3, 'GLASSES', W(Head=1), caps=False)
    c.tube([Vector((0.012, -f - 0.014, zc + 0.006)), Vector((-0.012, -f - 0.014, zc + 0.006))], 0.002, 3, 'GLASSES',
           W(Head=1), caps=False)


def mask(c, o):
    B.mask(c, o)
    if c.lod == 0:
        H = c.body['head']; w = H['w']
        hz = lambda zf: c.z(H['chin']) + (zf - 1.495) * (c.z(H['crown']) - c.z(H['chin'])) / 0.25
        for s in (1, -1):
            c.tube([Vector((s * w * 0.9, -0.05, hz(1.6))), Vector((s * (w + 0.008), 0.0, hz(1.61))),
                    Vector((s * w * 0.9, -0.05, hz(1.53)))], 0.002, 3, 'MASK', W(Head=1), caps=False)


def hand_grip(c, side):
    """Point in the closed hand and the hand's down direction."""
    wr, tip = c.J[side + 'Hand']
    d = (tip - wr).normalized()
    return wr + d * 0.075 + FWD * 0.012, d


def briefcase(c, o, reg):
    if c.lod == 2:
        return
    g, d = hand_grip(c, 'Right')
    wt = W(RightHand=1)
    c.tube([g + Y * 0.04 + Z * 0.0, g + Y * 0.035 - Z * 0.02, g - Y * 0.035 - Z * 0.02, g - Y * 0.04], 0.007, 4, reg, wt)
    top = g - Z * 0.03
    c.box(top - Z * 0.14, (0.042, 0.19, 0.14), reg, wt)
    if c.lod == 0:
        for yy in (0.08, -0.08):
            c.box(top - Z * 0.005 + Y * yy, (0.044, 0.012, 0.008), 'BUCKLE', wt)


def lanyard(c, o, reg):
    if c.lod == 2:
        return
    puff = o['top'].get('puff', 0)
    nr = c.body['neck']
    pts = [Vector((0.045, 0.03, c.z(1.47))), Vector((0.0, 0.065, c.z(1.47))), Vector((-0.045, 0.03, c.z(1.47))),
           on_front(c, 1.36, -0.03, puff, 0.01), on_front(c, 1.27, 0.0, puff, 0.012), on_front(c, 1.36, 0.03, puff, 0.01),
           Vector((0.045, 0.03, c.z(1.47)))]
    c.tube(pts, 0.003, 3, reg, W(Chest=0.8, Neck=0.2), caps=False)
    c.box(on_front(c, 1.22, 0, puff, 0.014), (0.028, 0.003, 0.04), 'PLASTIC_WHITE', B.torso_w(1.22))


def shoulder_bag(c, o, reg, tote=False):
    puff = o['top'].get('puff', 0)
    wt = W(Hips=0.5, Spine=0.5)
    x = 0.19 if not tote else 0.2
    zc = c.z(1.0 if not tote else 1.02)
    hh = (0.035, 0.12, 0.09) if not tote else (0.03, 0.15, 0.15)
    c.loft([dict(c=(x, 0.05, zc - hh[2]), d=Z, a=hh[0], f=hh[1], k=hh[1], w=wt, reg=reg, p=4),
            dict(c=(x, 0.05, zc + hh[2] * 0.6), d=Z, a=hh[0], f=hh[1] * 1.02, k=hh[1] * 1.02, w=wt, reg=reg),
            dict(c=(x, 0.05, zc + hh[2]), d=Z, a=hh[0] * 0.8, f=hh[1] * 0.98, k=hh[1] * 0.98, w=wt, reg=reg, cap=0.004)],
           c.n(10, 8, 4), p=4.0)
    if c.lod < 2:
        sh = c.J['LeftUpperArm'][0]
        pts = [Vector((x, -0.05, zc + hh[2])), Vector((0.15, fy(c, 1.3, 0.13, puff) - 0.004, c.z(1.3))),
               Vector((0.13, -0.02, sh.z + 0.045)), Vector((0.13, 0.05, sh.z + 0.035)),
               Vector((0.15, by(c, 1.3, 0.13, puff) + 0.004, c.z(1.3))), Vector((x, 0.15, zc + hh[2]))]
        c.tube(pts, 0.006, 4, 'STRAP_BLACK' if not tote else reg, lambda i: W(Chest=1) if 1 <= i <= 4 else wt, caps=False)


def tote(c, o, reg):
    shoulder_bag(c, o, reg, tote=True)


def backpack(c, o, reg, school=False):
    puff = o['top'].get('puff', 0)
    yb = by(c, 1.25, 0, puff) - 0.01
    wt = W(Chest=0.6, Spine=0.4)
    dd = 0.075
    rr = []
    for zf, a, f in ((1.04, 0.13, dd * 0.8), (1.1, 0.145, dd), (1.32, 0.145, dd), (1.42, 0.12, dd * 0.8), (1.45, 0.06, dd * 0.5)):
        rr.append(dict(c=(0, yb + f, c.z(zf)), d=Z, a=a, f=f, k=f, w=wt, reg=reg))
    if c.lod == 2:
        rr = [rr[0], rr[2], rr[4]]
    c.loft(rr, c.n(12, 8, 6), p=3.2)
    if c.lod < 2:
        # front pocket, shoulder straps under the arms, a top handle
        c.loft([dict(c=(0, yb + 2 * dd, c.z(1.08)), d=-Y * -1, a=0.1, f=0.08, k=0.06, w=wt, reg=reg),
                dict(c=(0, yb + 2 * dd + 0.03, c.z(1.12)), d=Y, a=0.09, f=0.06, k=0.05, w=wt, reg=reg)], c.n(8, 6, 4), p=3.5)
        for s in (1, -1):
            pts = [Vector((s * 0.09, yb + 0.02, c.z(1.42))), Vector((s * 0.1, 0.0, c.z(1.47))),
                   on_front(c, 1.36, s * 0.11, puff, 0.008), on_front(c, 1.2, s * 0.13, puff, 0.004),
                   Vector((s * 0.14, yb * 0.4, c.z(1.12))), Vector((s * 0.11, yb + 0.02, c.z(1.08)))]
            c.tube(pts, 0.012 if c.lod == 0 else 0.01, 3, 'STRAP_BLACK', lambda i: W(Chest=1) if i < 4 else wt, caps=False)
        if c.lod == 0:
            c.tube([Vector((0.03, yb + dd, c.z(1.45))), Vector((0.0, yb + dd, c.z(1.48))), Vector((-0.03, yb + dd, c.z(1.45)))],
                   0.006, 3, 'STRAP_BLACK', wt, caps=False)


def school_bag(c, o, reg):
    """Flat nylon school bag on a long strap (worn on the shoulder)."""
    shoulder_bag(c, o, reg)


def eco_bag(c, o, reg):
    """Shopping bag hanging from the left hand (daikon leaves sticking out)."""
    if c.lod == 2:
        return
    g, d = hand_grip(c, 'Left')
    wt = W(LeftHand=1)
    top = g - Z * 0.07
    c.loft([dict(c=top - Z * 0.3, d=Z, a=0.06, f=0.14, k=0.14, w=wt, reg=reg),
            dict(c=top, d=Z, a=0.07, f=0.16, k=0.16, w=wt, reg=reg)], c.n(8, 6, 4), cap0=True, cap1=False, p=3.5)
    c.loft([dict(c=top - Z * 0.002, d=Z, a=0.065, f=0.155, k=0.155, w=wt, reg='CHICKEN_DARK'),
            dict(c=top - Z * 0.004, d=Z, a=0.0, w=wt, reg='CHICKEN_DARK')], c.n(8, 6, 4), cap0=False, cap1=False, p=3.5)
    for yy in (0.06, -0.06):
        c.tube([top + Y * yy * 1.4, g + Y * yy * 0.3, top + Y * yy * 0.6], 0.006, 3, reg, wt, caps=False)
    if c.lod == 0:
        c.tube([top + Y * 0.05 - Z * 0.05, top + Y * 0.08 + Z * 0.12], 0.025, 5, 'PLASTIC_WHITE', wt)
        c.box(top + Y * 0.09 + Z * 0.16, (0.01, 0.03, 0.05), 'HOODIE_OLIVE', wt, rot=Rx(-20))


def kinchaku(c, o, reg):
    if c.lod == 2:
        return
    g, d = hand_grip(c, 'Left')
    wt = W(LeftHand=1)
    top = g - Z * 0.06
    c.loft([dict(c=top - Z * 0.14, a=0.0, w=wt, reg=reg), dict(c=top - Z * 0.12, a=0.05, f=0.05, k=0.05, w=wt, reg=reg),
            dict(c=top - Z * 0.04, a=0.055, f=0.055, k=0.055, w=wt, reg=reg), dict(c=top, a=0.025, f=0.025, k=0.025, w=wt, reg=reg),
            dict(c=top + Z * 0.02, a=0.035, f=0.035, k=0.035, w=wt, reg=reg)], c.n(8, 6, 4), cap1=True)
    c.tube([top + Z * 0.01, g + Y * 0.01, top + Z * 0.01 - Y * 0.01], 0.004, 3, 'OBI_RED', wt, caps=False)


def hivis(c, o, reg):
    """Hi-vis safety vest (anzen besuto) over the work jacket: reflective bands."""
    puff = o['top'].get('puff', 0) + 0.05
    rr = []
    levels = [0.99, 1.08, 1.1, 1.2, 1.22, 1.38]
    for zf in levels:
        w, f, k = B.interp(c.body['torso'], zf)
        s = 1 + puff
        reg_b = 'REFLECT' if zf in (1.08, 1.2) else reg
        rr.append(dict(c=(0, 0.004, c.z(zf)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(zf), reg=reg_b))
    if c.lod == 2:
        rr = [rr[0], rr[-1]]
        rr[0]['reg'] = reg
    c.loft(rr, c.n(14, 10, 6), cap0=False, cap1=False, p=2.5)
    B.lip(c, dict(rr[0], a=rr[0]['a'], f=rr[0]['f'], k=rr[0]['k']), c.n(14, 10, 6), reg)
    B.lip(c, dict(rr[-1]), c.n(14, 10, 6), reg)
    if c.lod < 2:
        for s in (1, -1):   # shoulder straps with a reflective line
            pts = [on_front(c, 1.38, s * 0.1, puff, 0.0), Vector((s * 0.11, -0.03, c.z(1.47))), Vector((s * 0.11, 0.04, c.z(1.47))),
                   Vector((s * 0.1, by(c, 1.38, 0.1, puff), c.z(1.38)))]
            c.loft([dict(c=p, a=0.03, f=0.004, k=0.004, w=W(Chest=1), reg=reg) for p in pts], 4)
            if c.lod == 0:
                c.loft([dict(c=p + (p - Vector((s * 0.1, 0, c.z(1.4)))).normalized() * 0.004, a=0.008, f=0.002, k=0.002,
                             w=W(Chest=1), reg='REFLECT') for p in pts], 4)


def neck_towel(c, o, reg):
    if c.lod == 2:
        return
    nr = c.body['neck']
    puff = o['top'].get('puff', 0)
    B.collar_band(c, 1.455, nr * 1.5, 0.035, reg, wt=W(Neck=0.4, Chest=0.6))
    for s in (1, -1):
        c.box(on_front(c, 1.36, s * 0.035, puff, 0.012), (0.022, 0.006, 0.075), reg, B.torso_w(1.36), rot=Ry(s * 6))


def tool_belt(c, o, reg):
    w, f, k = B.interp(c.body['torso'], 1.0)
    s = 1.18
    c.loft([dict(c=(0, 0.004, c.z(0.98)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(0.98), reg=reg),
            dict(c=(0, 0.004, c.z(1.01)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(1.01), reg=reg)],
           c.n(14, 10, 6), cap0=False, cap1=False, p=2.5)
    if c.lod < 2:
        for sx in (1, -1):
            c.box(Vector((sx * w * 1.05, 0.03, c.z(0.93))), (0.03, 0.06, 0.07), reg, W(Hips=1))
        c.box(Vector((-w * 1.12, -0.02, c.z(0.88))), (0.012, 0.012, 0.11), 'METAL_STEEL', W(Hips=1))   # a spanner in the loop
        c.box(on_front(c, 0.995, 0, 0.18, 0.0), (0.03, 0.006, 0.022), 'BUCKLE', W(Hips=1))


def apron_sheet(c, o, reg, z_top, z_bot, half_w, bib=False, out=0.012):
    """Front apron: sheet over chest/belly, below the crotch shared by both thighs."""
    puff = o['top'].get('puff', 0)
    n_x = c.n(6, 4, 2)
    zs = [z_top + (z_bot - z_top) * i / c.n(8, 5, 3) for i in range(c.n(8, 5, 3) + 1)]
    bm = c.bm
    rows = []
    for zf in zs:
        row = []
        hw = half_w(zf) if callable(half_w) else half_w
        for i in range(n_x + 1):
            x = -hw + 2 * hw * i / n_x
            if zf > 0.9:
                y = fy(c, zf, x, puff) - out
                wt = B.torso_w(zf)
            else:
                t = (0.9 - zf) / 0.5
                y = fy(c, 0.9, x, puff) - out - 0.015 * t
                legw = min(0.85, 0.3 + 0.8 * t)
                sl = min(max(0.5 + x / 0.16, 0), 1)
                wt = {'Hips': 1 - legw + 1e-4, 'LeftUpperLeg': legw * sl + 1e-4, 'RightUpperLeg': legw * (1 - sl) + 1e-4}
            v = bm.verts.new((x, y, c.z(zf)))
            c.weigh([v], wt)
            row.append(v)
        rows.append(row)
    front, back = [], []
    for j in range(len(rows) - 1):
        for i in range(n_x):
            a, b, cc, d = rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]
            front.append(bm.faces.new([a, b, cc, d][::-1]))
    # back side: offset copy, reversed
    rows2 = []
    for row in rows:
        r2 = []
        for v in row:
            v2 = bm.verts.new(v.co + Vector((0, 0.004, 0)))
            v2[c.dl].clear()
            for k_, w_ in v[c.dl].items():
                v2[c.dl][k_] = w_
            r2.append(v2)
        rows2.append(r2)
    for j in range(len(rows2) - 1):
        for i in range(n_x):
            a, b, cc, d = rows2[j][i], rows2[j][i + 1], rows2[j + 1][i + 1], rows2[j + 1][i]
            back.append(bm.faces.new([a, b, cc, d]))
    # rim
    rim = []
    loop = [rows[0][i] for i in range(n_x + 1)] + [rows[j][n_x] for j in range(1, len(rows))] + \
           [rows[-1][i] for i in range(n_x - 1, -1, -1)] + [rows[j][0] for j in range(len(rows) - 2, 0, -1)]
    loop2 = [rows2[0][i] for i in range(n_x + 1)] + [rows2[j][n_x] for j in range(1, len(rows2))] + \
            [rows2[-1][i] for i in range(n_x - 1, -1, -1)] + [rows2[j][0] for j in range(len(rows2) - 2, 0, -1)]
    for i in range(len(loop)):
        ii = (i + 1) % len(loop)
        rim.append(bm.faces.new([loop[i], loop[ii], loop2[ii], loop2[i]]))
    from buildings.koedo_kit import orient
    for f in front:
        f.normal_update()
    # make sure front faces point forward
    for f in front:
        if f.normal.y > 0:
            f.normal_flip()
    for f in back:
        f.normal_update()
        if f.normal.y < 0:
            f.normal_flip()
    ctr = Vector((0, 0.0, c.z((z_top + z_bot) / 2)))
    for f in rim:
        f.normal_update()
        m = f.calc_center_median()
        if f.normal.dot(Vector((m.x, 0, m.z - ctr.z))) < 0:
            f.normal_flip()
    c.paint(front + back + rim, reg)
    return rows


def bib_apron(c, o, reg):
    """Rubber fishing apron (gyogyo maekake): chest bib to below the knee, neck
    strap, waist ties; glossy orange like the harbour gear."""
    apron_sheet(c, o, reg, 1.38, 0.42, lambda zf: 0.1 if zf > 1.08 else (0.16 if zf > 0.9 else 0.17))
    if c.lod < 2:
        puff = o['top'].get('puff', 0)
        for s in (1, -1):
            c.tube([on_front(c, 1.38, s * 0.09, puff, 0.012), Vector((s * 0.07, -0.03, c.z(1.47))),
                    Vector((0, by(c, 1.45, 0, puff) + 0.01, c.z(1.47)))], 0.006, 3, reg, W(Chest=1), caps=False)
            c.tube([on_front(c, 1.06, s * 0.15, puff, 0.012), Vector((s * 0.16, 0.0, c.z(1.05))),
                    Vector((s * 0.06, by(c, 1.05, 0.06, puff) + 0.006, c.z(1.05)))], 0.006, 3, reg, B.torso_w(1.05), caps=False)


def maekake(c, o, reg):
    """Shop apron (maekake) from the waist to the knee, white crest on the front."""
    apron_sheet(c, o, reg, 1.02, 0.5, 0.17, out=0.01)
    puff = o['top'].get('puff', 0)
    w, f, k = B.interp(c.body['torso'], 1.0)
    s = 1.1 + puff
    c.loft([dict(c=(0, 0.004, c.z(1.0)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(1.0), reg='MAEKAKE_TEXT'),
            dict(c=(0, 0.004, c.z(1.03)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(1.03), reg='MAEKAKE_TEXT')],
           c.n(14, 10, 6), cap0=False, cap1=False, p=2.5)
    if c.lod == 0:
        # crest: a ring with a bar (maru ni ichi), white on navy
        y = fy(c, 0.9, 0, puff) - 0.01 - 0.007
        ctr = Vector((0, y, c.z(0.72)))
        n = 12
        ro, ri = 0.07, 0.055
        out_v = [c.bm.verts.new(ctr + Vector((ro * math.cos(2 * math.pi * i / n), 0, ro * math.sin(2 * math.pi * i / n)))) for i in range(n)]
        in_v = [c.bm.verts.new(ctr + Vector((ri * math.cos(2 * math.pi * i / n), 0, ri * math.sin(2 * math.pi * i / n)))) for i in range(n)]
        wt = {'Hips': 0.4, 'LeftUpperLeg': 0.3, 'RightUpperLeg': 0.3}
        c.weigh(out_v + in_v, wt)
        fs = [c.bm.faces.new([out_v[i], in_v[i], in_v[(i + 1) % n], out_v[(i + 1) % n]]) for i in range(n)]
        for f_ in fs:
            f_.normal_update()
            if f_.normal.y > 0:
                f_.normal_flip()
        c.paint(fs, 'MAEKAKE_TEXT')
        c.box(ctr, (0.045, 0.001, 0.009), 'MAEKAKE_TEXT', wt)


def fingerless(c, o, reg):
    pass


def randoseru(c, o, reg):
    """The Japanese school satchel: a stiff leather box high on the back with a
    rounded flap, metal clasp, side hook, shoulder straps; often a charm hangs on it."""
    puff = o['top'].get('puff', 0)
    yb = by(c, 1.25, 0, puff) - 0.005
    wt = W(Chest=0.7, Spine=0.3)
    zc = c.z(1.22)
    h, w, d = 0.15, 0.13, 0.09
    c.box(Vector((0, yb + d, zc)), (w, d, h), reg, wt)
    if c.lod < 2:
        # the flap rounds over the top and comes down the back to the clasp
        # rounded top-back edge where the flap folds over
        c.tube([Vector((-w - 0.004, yb + 2 * d - 0.025, zc + h - 0.02)), Vector((w + 0.004, yb + 2 * d - 0.025, zc + h - 0.02))],
               0.032, c.n(8, 6, 4), reg, wt)
        c.box(Vector((0, yb + 2 * d + 0.012, zc + 0.02)), (w + 0.004, 0.006, h * 0.85), reg, wt)
        c.box(Vector((0, yb + 2 * d + 0.02, zc - 0.07)), (0.022, 0.006, 0.016), 'BUTTON_GOLD', wt)
        for s in (1, -1):
            pts = [Vector((s * 0.07, yb + 0.02, zc + h - 0.01)), Vector((s * 0.09, 0.0, c.z(1.46))),
                   on_front(c, 1.32, s * 0.1, puff, 0.008), on_front(c, 1.16, s * 0.11, puff, 0.004),
                   Vector((s * 0.12, yb * 0.5, c.z(1.08))), Vector((s * 0.09, yb + 0.02, zc - h + 0.02))]
            c.tube(pts, 0.011, 3, reg, lambda i: W(Chest=1) if i < 4 else wt, caps=False)
        if c.lod == 0:
            c.box(Vector((w + 0.01, yb + d, zc - 0.05)), (0.008, 0.012, 0.012), 'METAL_STEEL', wt)        # side hook
            c.tube([Vector((w + 0.012, yb + d, zc - 0.06)), Vector((w + 0.02, yb + d, zc - 0.12))], 0.003, 3, 'SCARF_RED', wt)
            c.box(Vector((w + 0.02, yb + d, zc - 0.14)), (0.012, 0.012, 0.016), 'HELMET_YELLOW', wt)        # charm (omamori bell)


def xbelt(c, o, reg):
    """Traffic guard's crossed reflective belt over the uniform."""
    puff = o['top'].get('puff', 0) + 0.02
    for s in (1, -1):
        pts_f = [on_front(c, zf, s * x, puff, 0.004) for zf, x in ((1.43, 0.11), (1.25, 0.03), (1.05, -0.09))]
        c.loft([dict(c=p, a=0.022, f=0.003, k=0.003, w=B.torso_w(zf), reg=reg) for p, zf in zip(pts_f, (1.43, 1.25, 1.05))], 4)
        pts_b = [Vector((p.x, by(c, zf, p.x, puff) + 0.004, p.z)) for p, zf in zip(pts_f, (1.43, 1.25, 1.05))]
        c.loft([dict(c=p, a=0.022, f=0.003, k=0.003, w=B.torso_w(zf), reg=reg) for p, zf in zip(pts_b, (1.43, 1.25, 1.05))], 4)
    w, f, k = B.interp(c.body['torso'], 1.03)
    s = 1.12 + puff
    c.loft([dict(c=(0, 0.004, c.z(1.01)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(1.01), reg=reg),
            dict(c=(0, 0.004, c.z(1.05)), d=Z, a=w * s, f=f * s, k=k * s, w=B.torso_w(1.05), reg=reg)], c.n(14, 10, 6),
           cap0=False, cap1=False, p=2.5)


EXTRAS = dict(randoseru=randoseru, xbelt=xbelt, tie=tie, glasses=glasses, mask=mask, briefcase=briefcase, lanyard=lanyard, shoulder_bag=shoulder_bag,
              tote=tote, backpack=backpack, school_bag=school_bag, eco_bag=eco_bag, kinchaku=kinchaku, hivis=hivis,
              neck_towel=neck_towel, tool_belt=tool_belt, bib_apron=bib_apron, maekake=maekake, fingerless=fingerless)
