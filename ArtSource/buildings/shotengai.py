"""Market hall front (task 5c, place family 7): a covered shopping street
(shōtengai) entered under its gate - a steel arch with the street's name
board, lanterns and seasonal flags - into a hall with a barrel-vault
polycarbonate roof on steel ribs. Stalls line the aisle (greengrocer,
fishmonger, sweets, household goods), two more open onto the street left and
right of the gate under their awnings. Above them the second floor with
windows (the shopkeepers live upstairs).

Three meshes per LOD: walls (atlas Tokyo: ALC / tile strips, windows,
shutters), steel and roof (Koso cells), dressing (KosoShop: arch board,
shop signs, stall fronts, flags). Data in MARKETS; the front looks to -Y.
"""
import math
import random
from mathutils import Vector
from kit import core as K
from buildings.koedo_kit import C
from buildings.tokyo_kit import F, lbox

KLASS = 'buildings'
NAME = 'Tokyo_Market'
ZV = Vector((0, 0, 1))
BAND = 1.98     # Tokyo wall strips are 2 m tall: no face taller than that

MARKETS = {
    'A': dict(W=10.0, D=12.0, eave=7.6, rise=2.6, aisle=4.4, wall='ALC_WHITE', storeys=2, seed=1,
              street=('STALL_VEG', 'SHOP0', 'STALL_SWEETS', 'SHOP2'),
              aisle_stalls=['STALL_FISH', 'STALL_GOODS', 'STALL_VEG', 'STALL_SWEETS', 'STALL_GOODS', 'STALL_FISH'],
              signs=['SHOP1', 'SHOP3', 'SHOP4', 'SHOP5', 'SHOP0', 'SHOP2']),
    'B': dict(W=12.0, D=10.0, eave=10.2, rise=3.0, aisle=5.0, wall='TILE_BEIGE', storeys=3, seed=2,
              street=('STALL_FISH', 'SHOP1', 'STALL_GOODS', 'SHOP3'),
              aisle_stalls=['STALL_SWEETS', 'STALL_VEG', 'STALL_GOODS', 'STALL_FISH'],
              signs=['SHOP2', 'SHOP0', 'SHOP5', 'SHOP4']),
}


def quad(c, pts, reg, normal, **kw):
    f = c.bm.faces.new([c.bm.verts.new(p) for p in pts])
    f.normal_update()
    if f.normal.dot(Vector(normal)) < 0:
        f.normal_flip()
    c.m([f], reg, **kw); c.nb([f])
    return f


def wall(c, f, u0, u1, z0, z1, reg, d=0.0):
    """Flat wall on frame f in bands no taller than the strip; V from each band foot."""
    z = z0
    out = []
    while z < z1 - 1e-4:
        zt = min(z1, z + BAND)
        out.append(quad(c, [f(u0, z, d), f(u1, z, d), f(u1, zt, d), f(u0, zt, d)], reg, f.n, metric_z0=z))
        z = zt
    return out


def arc(W, eave, rise, n):
    """Points (x, z) of the barrel vault from -W/2 to W/2."""
    R = (rise ** 2 + (W / 2) ** 2) / (2 * rise)
    zc = eave + rise - R
    a0 = math.asin((W / 2) / R)
    return [(R * math.sin(-a0 + 2 * a0 * i / n), zc + R * math.cos(-a0 + 2 * a0 * i / n)) for i in range(n + 1)]


def _hall(spec, lod):
    W, D, E, rise, A = spec['W'], spec['D'], spec['eave'], spec['rise'], spec['aisle']
    cw, cs, cf = C('Tokyo', lod), C('KosoShop', lod), C('Koso', lod)
    r = random.Random(spec['seed'])
    fr = F(Vector((0, -D / 2, 0)), (0, -1))            # front, u = x
    fb = F(Vector((0, D / 2, 0)), (0, 1))              # back, u = -x
    fl = F(Vector((-W / 2, 0, 0)), (-1, 0))            # left side, u = -y
    fR = F(Vector((W / 2, 0, 0)), (1, 0))              # right side, u = y
    a2 = A / 2
    gh = 4.6                                           # gate opening height
    sh = 3.1                                           # street stall opening height
    wl = spec['wall']
    # ── front: piers, street stalls, upper floors ──
    u_st = [(-W / 2 + 0.35, -a2 - 0.45), (a2 + 0.45, W / 2 - 0.35)]     # street stall openings
    wall(cw, fr, -W / 2, u_st[0][0], 0, E, wl)
    wall(cw, fr, u_st[1][1], W / 2, 0, E, wl)
    wall(cw, fr, u_st[0][1], -a2, 0, E, wl)
    wall(cw, fr, a2, u_st[1][0], 0, E, wl)
    for u0, u1 in u_st:
        wall(cw, fr, u0, u1, sh, E, wl)
    wall(cw, fr, -a2, a2, gh, E, wl)
    # windows upstairs: aluminium sashes with curtains (Tokyo rects), one per stall bay
    zf = [4.4 + 2.9 * i for i in range(spec['storeys'] - 1)]
    for z in zf:
        for u0, u1 in u_st + [(-a2 + 0.6, a2 - 0.6)]:
            if u0 > -a2 - 0.01 and u1 < a2 + 0.01 and z < gh + 1.6:
                continue                     # the arch board covers the middle of the first floor
            wu = min(1.8, (u1 - u0) - 0.4); uc = (u0 + u1) / 2
            b = cw.box(fr, uc - wu / 2, uc + wu / 2, z + 0.8, z + 2.1, 0.0, 0.05, 'ALU', skip=('in',))
            cw.m([b['out']], r.choice(['WIN_CURTAIN', 'WIN_BLIND', 'WIN_DARK', 'WIN_CURTAIN']))
            if lod == 0:
                cw.box(fr, uc - wu / 2 - 0.1, uc + wu / 2 + 0.1, z + 0.7, z + 0.78, 0.0, 0.18, 'ALU', skip=('in',))
                if r.random() < 0.6:     # AC unit on a bracket under the window
                    ac = cw.box(fr, uc + wu / 2 - 0.8, uc + wu / 2, z + 0.1, z + 0.65, 0.05, 0.3, 'AC_IVORY', skip=('in',))
                    cw.m([ac['out']], 'AC_FRONT')
    # ── street stalls: recess with the stall front at the back, awning, sign, goods ──
    for (u0, u1), stall, sign in zip(u_st, spec['street'][0::2], spec['street'][1::2]):
        dep = 1.2
        quad(cs, [fr(u0, 0, -dep), fr(u1, 0, -dep), fr(u1, sh, -dep), fr(u0, sh, -dep)], stall, fr.n)
        for u, nn in ((u0, fr.t), (u1, -fr.t)):
            wall(cw, F(fr(u, 0, 0), (nn.x, nn.y)), 0.0 if nn.x > 0 else -dep, dep if nn.x > 0 else 0.0, 0, sh, 'TILE_WHITE')
        quad(cf, [fr(u0, sh, -dep), fr(u1, sh, -dep), fr(u1, sh, 0), fr(u0, sh, 0)], 'LIT_WARM', (0, 0, -1))
        quad(cf, [fr(u0, 0.02, -dep), fr(u1, 0.02, -dep), fr(u1, 0.02, 0.6), fr(u0, 0.02, 0.6)], 'TILE_FLOOR', (0, 0, 1))
        s = cs.box(fr, u0 - 0.05, u1 + 0.05, sh + 0.15, sh + 0.85, 0.0, 0.12, None, skip=('in',))
        cs.m([s['out']], sign); cs.m([s[k] for k in ('top', 'bot', 'l', 'r')], 'FRAME_BLACK')
        aw = cf.box(fr, u0, u1, sh - 0.05, sh + 0.05, 0.0, 0.95, 'CANOPY', skip=('in',))
        cf.m([aw['bot']], 'LIT_WARM')
        if lod == 0:
            for u in (u0 + 0.1, u1 - 0.1):           # awning stays
                cf.tube([fr(u, sh, 0.9), fr(u, sh + 0.7, 0.02)], 0.015, 4, 'STEEL_GREY')
            # goods on stepped display stands spilling onto the pavement (crates, baskets)
            for i, uu in enumerate((u0 + 0.35, (u0 + u1) / 2, u1 - 0.35)):
                st = cf.box(fr, uu - 0.32, uu + 0.32, 0.0, 0.55 + 0.2 * (i % 2), -0.9, 0.5, 'WOOD', skip=('in', 'bot'))
                cf.m([st['top']], r.choice(['CRATE_GREEN', 'CRATE_YELLOW', 'CRATE_BLUE']))
                gd = cs.box(fr, uu - 0.28, uu + 0.28, 0.55 + 0.2 * (i % 2), 0.75 + 0.2 * (i % 2), -0.6, 0.45, None, skip=('in', 'bot'))
                cs.m([gd['top'], gd['out']], 'MIKAN')
                cs.m([gd[k] for k in ('l', 'r')], 'CARDBOARD')
    # ── the gate: two steel posts, beam, name board, lanterns ──
    gx = a2 + 0.25
    for u in (-gx, gx):
        cf.box(fr, u - 0.18, u + 0.18, 0.0, gh + 2.0, 0.25, 0.61, 'PAINT_RED', skip=())
        cf.box(fr, u - 0.3, u + 0.3, 0.0, 0.25, 0.13, 0.73, 'STONE', skip=('bot',))   # foot
    bw = min(W - 1.0, 2 * gx + 1.4)
    brd = cs.box(fr, -bw / 2, bw / 2, gh + 0.1, gh + 0.1 + bw / 4, 0.62, 0.86, None, skip=('in',))
    cs.m([brd['out']], 'ARCH'); cs.m([brd[k] for k in ('top', 'bot', 'l', 'r')], 'NAVY')
    top_z = gh + 0.1 + bw / 4
    pts = [(fr(-bw / 2 - 0.1 + (bw + 0.2) * i / 8, top_z + 0.15 + 0.5 * math.sin(math.pi * i / 8), 0.74)) for i in range(9)]
    cf.tube(pts, 0.09, 6, 'PAINT_RED')                  # arched top rail of the gate
    if lod == 0:
        for i in range(9):                          # bulbs along the arch
            p = pts[i]
            cf.box(F(p, (0, -1)), -0.06, 0.06, p.z + 0.1, p.z + 0.22, 0.0, 0.12, 'BULB_WARM')
        for u in (-gx + 0.6, -gx + 1.4, gx - 1.4, gx - 0.6):   # red lanterns under the board
            lb = cs.box(fr, u - 0.18, u + 0.18, gh - 0.55, gh - 0.05, 0.56, 0.92, None)
            cs.m(list(lb.values()), 'LANTERN_RED')
            cs.tube([fr(u, gh - 0.05, 0.74), fr(u, gh + 0.1, 0.74)], 0.01, 3, 'BLACK')
    # ── aisle: floor, stalls both sides, inner walls, back stall ──
    y0, y1 = -D / 2, D / 2 - 0.3
    quad(cf, [(-a2, y0, 0.02), (a2, y0, 0.02), (a2, y1, 0.02), (-a2, y1, 0.02)], 'TILE_FLOOR', (0, 0, 1))
    n_st = max(2, len(spec['aisle_stalls']) // 2)
    L = (y1 - y0 - 0.6)
    k = 0
    for side, x, nrm in ((-1, -a2, (1, 0, 0)), (1, a2, (-1, 0, 0))):
        fa = F(Vector((x, 0, 0)), (nrm[0], nrm[1]))
        for i in range(n_st):
            ya, yb = y0 + 0.6 + L * i / n_st, y0 + 0.6 + L * (i + 1) / n_st - 0.12
            quad(cs, [(x, ya, 0.0), (x, yb, 0.0), (x, yb, 2.7), (x, ya, 2.7)], spec['aisle_stalls'][k % len(spec['aisle_stalls'])], nrm)
            sg = cs.box(fa, min(fa.t.dot(Vector((x, ya, 0))), fa.t.dot(Vector((x, yb, 0)))),
                        max(fa.t.dot(Vector((x, ya, 0))), fa.t.dot(Vector((x, yb, 0)))), 2.85, 3.45, 0.0, 0.1, None, skip=('in',))
            cs.m([sg['out']], spec['signs'][k % len(spec['signs'])]); cs.m([sg[q] for q in ('top', 'bot', 'l', 'r')], 'FRAME_BLACK')
            k += 1
        quad(cf, [(x, y0, 2.7), (x, y1, 2.7), (x, y1, 2.85), (x, y0, 2.85)], 'LIT_WARM', nrm)
        wall(cw, F(Vector((x, 0, 0)), (nrm[0], nrm[1])), -y1 if nrm[0] < 0 else y0, -y0 if nrm[0] < 0 else y1, 2.7, E, wl)
    quad(cs, [(-a2, y1, 0.0), (a2, y1, 0.0), (a2, y1, 2.7), (-a2, y1, 2.7)], spec['aisle_stalls'][-1], (0, -1, 0))
    wall(cw, fb, -a2, a2, 2.7, E, wl, d=-0.3)
    # ── vault: outer polycarbonate skin, inner face over the aisle, ribs, gable ──
    ap = arc(W, E, rise, 8 if lod < 2 else 4)
    yv0, yv1 = -D / 2 - 0.3, D / 2 + 0.3
    for i in range(len(ap) - 1):
        (xa, za), (xb, zb) = ap[i], ap[i + 1]
        mid = Vector(((xa + xb) / 2, 0, (za + zb) / 2 - (E + rise - 20)))
        quad(cf, [(xa, yv0, za), (xb, yv0, zb), (xb, yv1, zb), (xa, yv1, za)], 'POLYCARB', mid)
        if lod < 2:
            quad(cf, [(xa, yv0, za - 0.03), (xb, yv0, zb - 0.03), (xb, yv1, zb - 0.03), (xa, yv1, za - 0.03)], 'POLYCARB', -mid)
    # gable: arched panel over the eave line, front and back
    for y, nrm in ((-D / 2, (0, -1, 0)), (D / 2, (0, 1, 0))):
        for i in range(len(ap) - 1):
            (xa, za), (xb, zb) = ap[i], ap[i + 1]
            quad(cf, [(xa, y, E), (xb, y, E), (xb, y, zb), (xa, y, za)], 'CANOPY', nrm)
    # eave gutter boxes
    for x in (-W / 2, W / 2):
        cf.box(F(Vector((0, 0, 0)), (0, -1)), x - 0.15, x + 0.15, E - 0.2, E + 0.05, -yv1, -yv0, 'ALU_DARK', skip=('in',) if lod else ())
    if lod < 2:
        nr = int((yv1 - yv0) / 2.0)
        for j in range(nr + 1):
            y = yv0 + 0.15 + (yv1 - yv0 - 0.3) * j / nr
            if lod == 0 or j in (0, nr):
                cf.tube([(x, y, z - 0.06) for x, z in ap], 0.06, 4, 'STEEL_GREY')
        if lod == 0:
            # tie bars across the aisle at the eave, flags and lanterns hanging from them
            for j in range(1, nr):
                y = yv0 + 0.15 + (yv1 - yv0 - 0.3) * j / nr
                if y > y1 - 0.3:
                    continue
                cf.tube([(-a2, y, E - 0.3), (a2, y, E - 0.3)], 0.03, 4, 'STEEL_GREY')
                if j % 2:
                    for xx in (-a2 * 0.5, a2 * 0.5):
                        fg = r.choice(['FLAG0', 'FLAG1', 'FLAG2', 'FLAG3'])
                        quad(cs, [(xx - 0.3, y, E - 1.5), (xx + 0.3, y, E - 1.5), (xx + 0.3, y, E - 0.3), (xx - 0.3, y, E - 0.3)], fg, (0, -1, 0))
                        quad(cs, [(xx - 0.3, y + 0.01, E - 1.5), (xx + 0.3, y + 0.01, E - 1.5), (xx + 0.3, y + 0.01, E - 0.3),
                                  (xx - 0.3, y + 0.01, E - 0.3)], fg, (0, 1, 0))
                else:
                    lb = cs.box(F(Vector((0, y, 0)), (0, -1)), -0.2, 0.2, E - 1.0, E - 0.4, -0.2, 0.2, None)
                    cs.m(list(lb.values()), 'LIT_WARM')
    # ── sides and back: plain walls with a few windows, shutters at the back ──
    for f, (u0, u1) in ((fl, (-D / 2, D / 2)), (fR, (-D / 2, D / 2)), (fb, (-W / 2, W / 2))):
        wall(cw, f, u0, u1, 0, E, wl)
    sb = cw.box(fb, -W / 2 + 0.8, -W / 2 + 3.4, 0.0, 2.6, 0.0, 0.08, 'PANEL_GREY', skip=('in', 'bot'))
    cw.m([sb['out']], 'SHUTTER')
    cw.box(fb, W / 2 - 1.8, W / 2 - 0.9, 0.0, 2.1, 0.0, 0.06, 'PANEL_DARK', skip=('in', 'bot'))
    if lod == 0:
        for z in zf:
            for u in (-W / 2 + 1.8, W / 2 - 2.2):
                b = cw.box(fb, u - 0.6, u + 0.6, z + 1.0, z + 2.0, 0.0, 0.05, 'ALU', skip=('in',))
                cw.m([b['out']], 'WIN_DARK')
        # pipes and meters on the back (Tokyo: they live outside)
        cw.tube([fb(W / 2 - 0.4, 0.0, 0.1), fb(W / 2 - 0.4, E, 0.1)], 0.05, 4, 'PAINT_GREY')
        m_ = cw.box(fb, W / 2 - 2.6, W / 2 - 2.2, 1.2, 1.7, 0.0, 0.15, 'PAINT_GREY', skip=('in',))
        cw.m([m_['out']], 'METER')
    # front piers: a vertical tenant sign on the right pier
    if lod < 2:
        tb = cs.box(fr, W / 2 - 0.35, W / 2 - 0.05, 3.6, 3.6 + 2.4, 0.1, 0.7, None, skip=('in',))
        cs.m([tb['l'], tb['r']], 'FLAG3'); cs.m([tb[k] for k in ('out', 'top', 'bot')], 'FRAME_BLACK')
    return cw, cf, cs


def build_market(key, lods=(0, 1)):
    spec = MARKETS[key]
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mw = K.atlas_material('Tokyo')
    mf = K.atlas_material('Koso')
    ms = K.atlas_material('KosoShop', emission_strength=1.6)
    objs, extra = [], []
    for lod in lods:
        cw, cf, cs = _hall(spec, lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', cw.bm, col, [mw], bevel=0.0, hidden=lod > 0, recalc=False))
        extra.append(K.mesh_object(f'SM_{name}_Frame_LOD{lod}', cf.bm, col, [mf], bevel=0.0, hidden=lod > 0, recalc=False))
        extra.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [ms], bevel=0.0, hidden=lod > 0, recalc=False))
    W, D, E = spec['W'], spec['D'], spec['eave']
    a2 = spec['aisle'] / 2
    # colliders: the two halves either side of the aisle (walk in), the roof
    K.collider_box(f'COL_{name}_L', col, -W / 2, -a2, -D / 2, D / 2, 0.0, E)
    K.collider_box(f'COL_{name}_R', col, a2, W / 2, -D / 2, D / 2, 0.0, E)
    K.collider_box(f'COL_{name}_Back', col, -a2, a2, D / 2 - 0.3, D / 2, 0.0, E)
    K.collider_box(f'COL_{name}_Roof', col, -W / 2, W / 2, -D / 2, D / 2, E, E + spec['rise'])
    K.light_marker(f'LIGHT_{name}_Aisle', col, (0.0, 0.0, E - 1.0), color=(1.0, 0.8, 0.55), watts=60, unity_range=10.0)
    K.light_marker(f'LIGHT_{name}_Gate', col, (0.0, -D / 2 - 1.0, 4.0), color=(1.0, 0.6, 0.35), watts=40, unity_range=7.0)
    col['extra_tris'] = [K.tri_count(o) for o in extra]
    return col, objs


def build():
    out = [build_market(k) for k in MARKETS]
    print('market extras:', {c.name: list(c['extra_tris']) for c, _ in out})
    return out
