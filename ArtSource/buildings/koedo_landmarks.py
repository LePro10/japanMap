"""Koedo landmarks (task 5b): the Toki-no-Kane bell tower and the sake
brewery with its brick chimney.

Toki no Kane (Kawagoe): a slender three-storey wooden tower, ~16 m, dark
weathered wood, a tiled skirt roof per storey, a balcony with railing on the
second storey, the open belfry with the bronze bell on top under a hipped
tile roof with a jewel finial. Built from the Tera kit like the pagoda
(stacked halls, curved roofs); the bell from TeraShop. The ground storey is
open front and back (a lane passes under it).

Brewery (sakagura, parcel 33.5 m wide): the long brewing hall on the street
(black boards below, white plaster above, tile roof, the shop at one end
with noren, the brewery's cedar ball and casks), a white storehouse (kura)
beside it, a wooden gate between them, and behind them the boiler shed and
the red-brick chimney (~19 m, square, tapering, iron bands, the brewery's
name down the shaft). Kura machinery from Koedo (atlas Koedo + KoedoShop),
brick from the Machi atlas (third material, the chimney only).
"""
import math
import bmesh
import bpy
from mathutils import Vector, Matrix
from kit import core as K, atlas as A
from buildings import koedo_kit as KK
from buildings import tera_kit as T
from buildings import koedo as KO
from buildings import tera as TE
from buildings.koedo_kit import C
from buildings.tokyo_kit import F

KLASS = 'buildings'
NAME = 'Koedo'
ZV = Vector((0, 0, 1))


# ── Toki no Kane ────────────────────────────────────────────────────────────

TOWER = [
    # ground storey: open front and back (passage), board walls left/right, skirt roof
    dict(bx=[3.6], by=[3.6], H=3.9, plat=0.45, floor=0.0, r=0.17, en=0.0, plat_m=0.55, plat_reg='STONE', col='WOOD', beam='WOOD',
         kumi='WOOD', end='END_GRAIN', steps=1, reach=0.35, door_h=3.0, col_base=True,
         walls=dict(S=['open'], N=['open'], E=['board'], W=['board']),
         roof=dict(kind='hip', ov=1.15, s0=0.32, s1=0.7, lift=0.35, tk=0.28)),
    # middle storey: balcony with railing, slatted windows
    dict(bx=[3.0], by=[3.0], H=3.0, plat=0.0, floor=0.3, r=0.15, en=0.55, plat_m=0.0, platform=False, col='WOOD', beam='WOOD',
         kumi='WOOD', end='END_GRAIN', steps=1, reach=0.32, door_h=2.1, col_base=False, arm_all=False, struts=False,
         walls={k: ['renji'] for k in 'SENW'},
         roof=dict(kind='hip', ov=1.0, s0=0.32, s1=0.7, lift=0.35, tk=0.26)),
    # belfry: open all round, railing, the bell inside, hipped roof
    dict(bx=[2.7], by=[2.7], H=2.9, plat=0.0, floor=0.3, r=0.14, en=0.45, plat_m=0.0, platform=False, col='WOOD', beam='WOOD',
         kumi='WOOD', end='END_GRAIN', steps=1, reach=0.35, door_h=2.3, col_base=False, arm_all=False, struts=False,
         walls={k: ['open'] for k in 'SENW'},
         roof=dict(kind='hip', ov=1.05, s0=0.34, s1=1.1, lift=0.45, tk=0.26)),
]


def _tower(lod):
    c = C('Tera', lod)
    zbase = 0.0
    info0 = None
    bell = None
    ridge = 0.0
    for i, s in enumerate(TOWER):
        last = i == len(TOWER) - 1
        s = dict(s)
        if not last:   # skirt roof: a ring that stops under the next storey (like the pagoda)
            nxt = sum(TOWER[i + 1]['bx']) / 2 + TOWER[i + 1]['en']
            s['roof'] = dict(s['roof'], top=(sum(s['bx']) / 2 + s['roof']['ov']) - nxt + 0.15)
        before = set(c.bm.verts)
        R, sl, info = T.hall(c, s)
        T.roof(c, R, kind='tile', pitch=0.42, amp=0.07, raft_sp=0.7, bell=i == 0, raft=i != 1 or lod == 0)
        if last:
            TE._bell_beam(c, dict(beam='WOOD'), info)
            bell = (info['zc'] - 0.62, R.z('S', 0.0, R.D))
            ztop = R.z('S', 0.0, R.D)
            # jewel finial (hōju) on a short post
            j = K.lathe(c.bm, 8 if lod == 0 else 6, [(0.16, ztop - 0.1), (0.2, ztop + 0.15), (0.24, ztop + 0.3), (0.2, ztop + 0.5),
                                                      (0.08, ztop + 0.68), (0.0, ztop + 0.8)], cap_bottom=False)
            c.m(j['sides'], 'BRONZE'); c.nb(j['sides'])
            ridge = ztop + 0.8
        new = [v for v in c.bm.verts if v not in before]
        bmesh.ops.translate(c.bm, verts=new, vec=(0, 0, zbase))
        if i == 0:
            info0 = info
        if last:
            bell = (bell[0] + zbase, ridge + zbase)
            ridge += zbase
        else:
            zbase += R.z('S', 0.0, s['roof']['top']) - 0.3
    info0['ridge'] = ridge
    info0['bell_z'] = bell[0]
    return c, info0


def build_tower(key='TokiNoKane', lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Tera')
    smat = K.atlas_material('TeraShop', emission_strength=1.6)
    objs, shop = [], []
    for lod in lods:
        c, info = _tower(lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = C('TeraShop', lod)
        T.bonsho(cs, (0, 0), info['bell_z'], h=1.15, r=0.42)
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    h = sum(TOWER[0]['bx']) / 2
    for x in (-h, h):
        for y in (-h, h):
            K.collider_box(f'COL_{name}_Post{len(col.objects)}', col, x - 0.25, x + 0.25, y - 0.25, y + 0.25, 0.0, 4.4)
    K.collider_box(f'COL_{name}_Upper', col, -h - 0.3, h + 0.3, -h - 0.3, h + 0.3, 4.4, info['ridge'])
    K.collider_box(f'COL_{name}_Base', col, -h - 0.55, h + 0.55, -h - 0.55, h + 0.55, 0.0, TOWER[0]['plat'])
    K.light_marker(f'LIGHT_{name}_Belfry', col, (0.0, 0.0, info['bell_z'] + 0.4), color=(1.0, 0.75, 0.45), watts=20, unity_range=5.0)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=round(info['ridge'], 2))
    return col, objs


# ── brewery ─────────────────────────────────────────────────────────────────

BOARD, WHITE, BLACK = 'WOOD_BOARD', 'PLASTER_WHITE', 'PLASTER_BLACK'
HALL = dict(kind='kura', W=19.5, D=10.5, G=4.0, U=3.0, wall_g=BOARD, wall_u=WHITE, kamon='KAMON_A',
            ground=[(0.6, 5.2, 'shop', dict(img='INT_SAKE')), (8.6, 11.6, 'closed', dict(style='boards')),
                    (14.4, 17.4, 'closed', dict(style='boards'))],
            upper=[(1.2, 2.2, 'kannon', dict(lit=True)), (9.6, 10.6, 'kannon', dict(closed=True)), (16.8, 17.8, 'kannon', dict())],
            back=[(5.0, 6.0, 'kannon', dict(closed=True)), (13.5, 14.5, 'kannon', dict(closed=True))],
            back_ground=[(8.8, 10.0, 'closed', dict(style='boards'), ('g_low', 'g_mid'))],
            hisashi=dict(u0=0.0, u1=6.2, z_e=3.15, depth=1.6, fascia=0.26, plaster=False),
            roof=dict(heavy=False, ridge_h=0.9, oni=1.2, slope=0.55, eave_out=0.85, oh=0.7, fascia=0.35),
            gutter=True,
            dress=[('roof_board', 0, dict(img='KB0', uc=3.0, w=3.4, h=0.95)),
                   ('noren', 0, dict(img='NOREN0', u0=1.6, u1=4.2, z=3.2, d=0.12, length=1.05)),
                   ('sugidama', 0, dict(u=5.6, z=2.4, d=1.3, r=0.55, hang=0.5)),
                   ('kv', 0, dict(img='KV2', u=0.3, d=1.0)),
                   ('chochin', 0, dict(img='CHOCHIN1', u=0.9, z=2.3, d=1.4, hang=0.5)),
                   ('buckets', 0, dict(u=7.4, d=0.45))])
STORE = dict(kind='kura', W=8.4, D=7.0, G=3.4, U=2.6, wall=WHITE, namako=True, kamon='KAMON_A',
             ground=[(3.4, 5.0, 'closed', dict(style='plaster', reg=WHITE))],
             upper=[(1.2, 2.2, 'kannon', dict(closed=True)), (6.2, 7.2, 'kannon', dict(closed=True))],
             back=[(3.7, 4.7, 'kannon', dict(closed=True))],
             roof=dict(heavy=True, ridge_h=1.05, oni=1.25, fascia=0.45), dress=[])
# local layout of the complex (front = -Y on the street): hall left, gate, storehouse right, chimney + boiler shed behind
BREW = dict(hall=(-6.1, -5.85), store=(11.5, -7.6), gate=(5.45, -10.8, 2.9), chimney=(9.0, 3.6, 2.3, 1.35, 19.0), shed=(4.4, 7.4, 1.8, 6.0, 3.2))


def _merge(dst, src, offset):
    """Append the geometry of bmesh src (moved by offset) to dst."""
    me = bpy.data.meshes.new('_merge_tmp')
    bmesh.ops.translate(src, verts=list(src.verts), vec=offset)
    src.to_mesh(me)
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)


def _chimney(cb, lod, x, y, b0, b1, h):
    """Square tapering brick chimney on a concrete base, iron bands, a cap,
    the brewery's name down the front in white (on the brick, MachiShop is
    not this mesh: painted letters are a brighter band of brick faces)."""
    bm = cb.bm
    base_h = 1.2
    gb = KK.lbox(bm, F(Vector((x, y, 0)), (0, -1)), -b0 / 2 - 0.25, b0 / 2 + 0.25, 0.0, base_h, -b0 / 2 - 0.25, b0 / 2 + 0.25, skip=('bot',))
    cb.m(list(gb.values()), 'CONC_FLAT'); cb.nb(list(gb.values()))
    n = math.ceil((h - base_h) / 0.98)
    hw = lambda z: (b0 + (b1 - b0) * (z - base_h) / (h - base_h)) / 2
    R = cb.R('BRICK')
    for k in range(n):
        za, zb = base_h + (h - base_h) * k / n, base_h + (h - base_h) * (k + 1) / n
        for e in range(4):
            a = math.pi / 2 * e
            nrm = Vector((math.sin(a), -math.cos(a), 0))
            t = Vector((math.cos(a), math.sin(a), 0))
            pts = [Vector((x, y, za)) + nrm * hw(za) - t * hw(za), Vector((x, y, za)) + nrm * hw(za) + t * hw(za),
                   Vector((x, y, zb)) + nrm * hw(zb) + t * hw(zb), Vector((x, y, zb)) + nrm * hw(zb) - t * hw(zb)]
            f = bm.faces.new([bm.verts.new(p) for p in pts])
            f.normal_update()
            if f.normal.dot(nrm) < 0:
                f.normal_flip()
            from buildings import gassho_kit as GK
            GK.map_axes(cb, [f], 'BRICK', Vector((x, y, za)) - t * 5.0, t, ZV)
            f.material_index = 1
    # iron bands and the cap (oversailing brick courses = darker flat band)
    for z in ([base_h + 2.0, base_h + 6.0, base_h + 10.0, h - 2.5] if lod == 0 else [h - 2.5]):
        w = hw(z) + 0.04
        b = KK.lbox(bm, F(Vector((x, y, 0)), (0, -1)), -w, w, z, z + 0.12, -w, w, skip=('top', 'bot'))
        cb.m(list(b.values()), 'IRON'); cb.nb(list(b.values()))
        for fc in b.values():
            fc.material_index = 1
    w = hw(h) + 0.12
    b = KK.lbox(bm, F(Vector((x, y, 0)), (0, -1)), -w, w, h - 0.35, h, -w, w, skip=())
    cb.m(list(b.values()), 'BRICK_FLAT'); cb.nb(list(b.values()))
    inner = hw(h) - 0.15
    top = [f for k, f in b.items() if k == 'top'][0]
    cb.m([top], 'SOOT')
    for fc in b.values():
        fc.material_index = 1
    # gb faces too
    for fc in gb.values():
        fc.material_index = 1
    return h


def _brewery(lod):
    hall_c, hall_sh, hall_slots, hall_roof = KO._house(HALL, lod)
    store_c, st_sh, st_slots, st_roof = KO._house(STORE, lod)
    c = C('Koedo', lod)
    hx, hy = BREW['hall']
    sx, sy = BREW['store']
    _merge(c.bm, hall_c.bm, (hx, hy, 0.0))
    _merge(c.bm, store_c.bm, (sx, sy, 0.0))
    c.bm.verts.ensure_lookup_table()
    # wooden gate between hall and storehouse: two posts, a cross beam, a small tile roof (kabuki-mon)
    gx, gy, gw = BREW['gate']
    fg = F(Vector((gx, gy, 0)), (0, -1))
    for u in (-gw / 2, gw / 2):
        c.box(fg, u - 0.14, u + 0.14, 0.0, 3.2, -0.14, 0.14, 'WOOD', skip=('bot',), rotate=True, bevel=True)
        c.box(fg, u - 0.22, u + 0.22, 0.0, 0.18, -0.22, 0.22, 'STONE', skip=('bot',))
    c.box(fg, -gw / 2 - 0.5, gw / 2 + 0.5, 2.85, 3.15, -0.12, 0.12, 'WOOD', skip=(), bevel=True)
    poly = [(-0.75, 3.2), (0.0, 3.85), (0.75, 3.2), (0.75, 3.12), (0.0, 3.72), (-0.75, 3.12)]
    sides, caps = KK.prism_u(c, F(Vector((gx, gy, 0)), (0, -1)), poly, -gw / 2 - 0.8, gw / 2 + 0.8)
    c.m([sides[0], sides[1]], 'TILE_A'); c.m(sides[2:] + caps, 'WOOD_FLAT'); c.nb(sides + caps)
    for k in range(2):     # gate leaves folded open against the posts
        u = (-1) ** k * (gw / 2 - 0.12)
        c.box(fg, u - 0.04 if k else u, u if k else u + 0.04, 0.1, 2.8, -1.55, -0.15, 'WOOD_FLAT', skip=())
    # boiler shed behind: board walls, tin lean roof, a door
    x0, x1, y0, y1, hh = BREW['shed']
    fs = F(Vector((0, 0, 0)), (0, -1))
    for za, zb in ((0.0, hh / 2), (hh / 2, hh)):      # two bands: the board strip is 2 m
        b = c.box(fs, x0, x1, za, zb, -y1, -y0, None, skip=('bot', 'top'))
        for k_ in ('out', 'in', 'l', 'r'):
            c.m([b[k_]], 'WOOD_BOARD', z0=za)
    b = c.box(fs, x0 - 0.1, x1 + 0.1, hh, hh + 0.12, -y1 - 0.1, -y0 + 0.1, 'TILE_DARK', skip=())
    KK.hisashi(c, F(Vector((0, y0, 0)), (0, -1)), x0 - 0.3, x1 + 0.3, hh - 0.2, 0.6, slope=0.35, fascia=0.12, fascia_reg='WOOD',
               beams=[x0 + 0.3, x1 - 0.3], rows=False)
    c.box(F(Vector((0, y0, 0)), (0, -1)), x0 + 1.0, x0 + 2.0, 0.0, 2.1, -0.02, 0.02, 'WOOD_FLAT', skip=('in',))
    # chimney (brick from the Machi atlas, material slot 1)
    cb = C('Machi', lod); cb.bm = c.bm
    chx, chy, b0, b1, h = BREW['chimney']
    _chimney(cb, lod, chx, chy, b0, b1, h)
    # flue from the shed into the chimney base
    if lod == 0:
        t = K.tube_path(c.bm, [(x1 - 0.3, (y0 + y1) / 2, hh - 0.6), (chx - b0 / 2 - 0.2, chy + 0.3, 0.9)], 0.18, 6)
        c.m(t[0] + [t[1], t[2]], 'IRON'); c.nb(t[0])
    return c, dict(hall=(hall_sh, hall_slots, hall_roof), store=(st_sh, st_slots, st_roof), ridge=h)


def _brewery_dress(lod, info):
    hx, hy = BREW['hall']
    cs = KO._dress(HALL, info['hall'][1], lod, 1.0)
    bmesh.ops.translate(cs.bm, verts=list(cs.bm.verts), vec=(hx, hy, 0.0))     # hall dressing is built round the hall's centre
    # casks stacked at the hall front, wooden vats in the yard, more casks by the gate
    c = C('KoedoShop', lod); c.bm = cs.bm
    f0 = F(Vector((hx - HALL['W'] / 2, hy - HALL['D'] / 2, 0)), (0, -1))
    for u, d, z in ((6.4, 0.55, 0.0), (7.05, 0.55, 0.0), (6.72, 0.55, 0.5), (12.3, 0.5, 0.0), (12.95, 0.5, 0.0)):
        KK.cask(c, f0, u, d, z=z)
    for (x, y, r, hh) in ((1.0, 3.2, 1.0, 1.9), (3.3, 3.6, 0.9, 1.7), (13.4, 2.0, 0.8, 1.5)):
        v = K.lathe(c.bm, 12 if lod == 0 else 8, [(r, 0.0), (r * 1.04, hh * 0.5), (r * 1.08, hh)], cx=x, cy=y, cap_bottom=False)
        c.m(v['sides'], 'WOOD_LIGHT'); c.m([v['top']], 'WOOD_DARK'); c.nb(v['sides'])
        if lod == 0:
            for z in (0.25, hh * 0.5, hh - 0.25):
                rr = r * (1 + 0.08 * z / hh) + 0.015
                b = K.lathe(c.bm, 12, [(rr, z), (rr, z + 0.06)], cx=x, cy=y, cap_bottom=False, cap_top=False)
                c.m(b['sides'], 'BAMBOO'); c.nb(b['sides'])
    return cs


def build_brewery(key='Brewery', lods=(0, 1)):
    name = f'{NAME}_{key}'
    col = K.collection(name)
    mat = K.atlas_material('Koedo')
    smat = K.atlas_material('KoedoShop', emission_strength=1.6)
    bmat = K.atlas_material('Machi')
    objs, shop = [], []
    for lod in lods:
        c, info = _brewery(lod)
        objs.append(K.mesh_object(f'SM_{name}_LOD{lod}', c.bm, col, [mat, bmat], bevel=0.02 if lod == 0 else 0.0,
                                  hidden=lod > 0, recalc=False, dissolve=True))
        cs = _brewery_dress(lod, info)
        hx, hy = BREW['hall']
        shop.append(K.mesh_object(f'SM_{name}_Shop_LOD{lod}', cs.bm, col, [smat], bevel=0.0, hidden=lod > 0, recalc=False))
    hx, hy = BREW['hall']; sx, sy = BREW['store']
    for nm, (cx, cy, s) in (('Hall', (hx, hy, HALL)), ('Store', (sx, sy, STORE))):
        K.collider_box(f'COL_{name}_{nm}', col, cx - s['W'] / 2, cx + s['W'] / 2, cy - s['D'] / 2, cy + s['D'] / 2, 0.0,
                       s['G'] + s['U'] + 2.5)
    chx, chy, b0, b1, h = BREW['chimney']
    K.collider_box(f'COL_{name}_Chimney', col, chx - b0 / 2 - 0.25, chx + b0 / 2 + 0.25, chy - b0 / 2 - 0.25, chy + b0 / 2 + 0.25, 0.0, h)
    x0, x1, y0, y1, hh = BREW['shed']
    K.collider_box(f'COL_{name}_Shed', col, x0, x1, y0, y1, 0.0, hh)
    f0 = F(Vector((hx - HALL['W'] / 2, hy - HALL['D'] / 2, 0)), (0, -1))
    K.light_marker(f'LIGHT_{name}_Shop', col, tuple(f0(2.9, 2.4, 0.6)), color=(1.0, 0.68, 0.4), watts=45, unity_range=6.0)
    K.light_marker(f'LIGHT_{name}_Lantern', col, tuple(f0(0.9, 2.5, 1.4)), color=(1.0, 0.75, 0.45), watts=12, unity_range=3.5)
    col['shop_tris'] = [K.tri_count(o) for o in shop]
    col['dims'] = dict(ridge=h)
    return col, objs


def build():
    out = [build_tower(), build_brewery()]
    print('dressing:', {c.name: list(c['shop_tris']) for c, _ in out})
    return out
