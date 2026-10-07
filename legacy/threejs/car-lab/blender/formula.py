"""
Formelwagen. Passt nicht in den Querschnitt-Loft der Straßenautos (offene
Räder, Seitenkästen, Flügel), benutzt aber dieselbe Knotenhierarchie und
dieselben Tuning-Slots — das Web muss ihn nicht gesondert kennen.

Neu gegenüber den Straßenautos: sichtbare Querlenker. Jeder Lenker ist ein
Rohr der Länge 1 entlang lokal +X (X übersteht den glTF-Export unverändert).
extras.arm_in = Innenpunkt im Aufbau, extras.arm_out = Außenpunkt relativ zum
Radträger, beide schon in glTF-Koordinaten (x, z, −y). Das Web richtet die
Rohre je Frame zwischen Aufbau und Rad aus — dann federn sie sichtbar mit.
"""
import bpy, bmesh, math, json
import numpy as np
from mathutils import Vector, Matrix
import carkit as K
import livery as LV
import build as B
import tuning as TU

def superellipse(w, h, n, M=28):
    pts = []
    for k in range(M):
        a = 2 * math.pi * k / M
        c, s = math.cos(a), math.sin(a)
        pts.append((w / 2 * np.sign(c) * abs(c) ** (2 / n), h / 2 * np.sign(s) * abs(s) ** (2 / n)))
    return pts

def loft(name, secs, mats, M=28, subdiv=1, cap_mats=(0, 0), mat_of=None):
    """secs: [(y, cx, cz, w, h, n)] entlang Y. UV: u = Position entlang, v = Umfang."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    ys = [s[0] for s in secs]
    y0, y1 = min(ys), max(ys)
    rings = []
    for (y, cx, cz, w, h, n) in secs:
        rings.append([bm.verts.new((cx + x, y, cz + z)) for x, z in superellipse(w, h, n, M)])
    for i in range(len(secs) - 1):
        for k in range(M):
            k2 = (k + 1) % M
            f = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            f.smooth = True
            if mat_of:
                f.material_index = mat_of(i, k)
            u0 = (secs[i][0] - y0) / (y1 - y0); u1 = (secs[i + 1][0] - y0) / (y1 - y0)
            v0 = k / M; v1 = (k + 1) / M
            for lp, uv in zip(f.loops, ((u0, v0), (u0, v1), (u1, v1), (u1, v0))):
                lp[uvl].uv = uv
    for ring, m, u in ((rings[0], cap_mats[0], 0.0), (list(reversed(rings[-1])), cap_mats[1], 1.0)):
        f = bm.faces.new(ring); f.material_index = m
        for lp in f.loops:
            lp[uvl].uv = (u, 0.25)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = K.mesh_obj(name, bm, mats)
    if subdiv:
        md = ob.modifiers.new('sub', 'SUBSURF'); md.levels = md.render_levels = subdiv
        K.apply_mods(ob)
    return ob

def f1_texture(name, scheme):
    """Lackierung im Loft-UV: v = 0.25 oben, 0 / 0.5 Flanken, u = 0 Nase."""
    H, W = 512, 1024
    base, top, flower, flower2 = scheme
    img = np.empty((H, W, 4), np.float32); img[:] = K.srgb_arr(base)
    v = (np.arange(H)[:, None] + 0.5) / H
    u = (np.arange(W)[None, :] + 0.5) / W
    dtop = np.abs(v - 0.25)
    mask_top = (dtop < 0.09) | (u < 0.30) & (dtop < 0.22)
    img[np.broadcast_to(mask_top, (H, W))] = K.srgb_arr(top)
    rng = np.random.default_rng(26)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for i in range(70):
        cx = rng.uniform(0.25, 1.0) * W
        cy = (rng.choice([0.0, 0.5]) + rng.uniform(-0.17, 0.17)) % 1.0 * H
        R = rng.uniform(10, 26)
        dx, dy = (xx - cx) * 0.5, yy - cy   # u-Richtung ist gestreckt
        r = np.hypot(dx, dy); th = np.arctan2(dy, dx) + rng.uniform(0, 6)
        c = np.abs(np.cos(2.5 * th))
        m = r < R * (0.38 + 0.62 * c ** 0.55)
        img[m] = K.srgb_arr(flower if i % 3 else flower2)
        img[r < R * 0.2] = K.srgb_arr(0xfff2f6)
    return K.image_from_array(name, img)

SCHEMES = [('Sakura', (0xf6f3f4, 0x0d0d10, 0xff6fb5, 0xffb7d5)),
           ('Midnight gold', (0x101014, 0x101014, 0xc9a13b, 0x8a6a22)),
           ('Papaya', (0xff7a1a, 0x1c3f9a, 0xffffff, 0xffc08a))]

def arm_mesh(name, mat, r=0.016):
    bm = bmesh.new()
    K.bm_cyl(bm, (0, 0, 0), (1, 0, 0), r, segs=8, mat=0)
    ob = K.mesh_obj(name, bm, [mat])
    ob.scale = (1, 1, 0.55)       # flach wie ein Aero-Lenker
    return ob

def gl(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]

def assemble(spec):
    cid = spec['id']
    K.wipe_collection(f'car_{cid}'); K.set_collection(f'car_{cid}')
    tune = TU.T.get(cid, {})
    root = K.empty(f'car_{cid}', (0, 0, 0), size=0.5)
    rb = K.empty('body_root', (0, 0, 0), parent=root)
    tex = f1_texture(f'{cid}_paint0', SCHEMES[0][1])
    for o, (lab, sch) in enumerate(SCHEMES[1:], start=1):
        f1_texture(f'{cid}_paint{o}', sch)
    fake = dict(spec, glass=dict(rear=(0, 0), ws=(0, 0), side=(0, 0)), paint=dict(base=0xffffff, metal=0.3, rough=0.25))
    mats = B.mats_for(cid, fake, tex)
    black = mats['black_gloss']; carbon = mats['carbon']
    paint = mats['paint']
    pink = K.material(f'{cid}_accent', color=0xff4fa3, metal=0.2, rough=0.3, coat=1.0)
    ti = K.material(f'{cid}_titanium', color=0x3a3c40, metal=0.9, rough=0.35)
    statics = []
    # Monocoque + Nase + Motorabdeckung
    mono = [(-2.62, 0, 0.20, 0.08, 0.05, 2.2), (-2.40, 0, 0.23, 0.17, 0.10, 2.4), (-1.90, 0, 0.30, 0.26, 0.19, 2.6),
            (-1.30, 0, 0.39, 0.36, 0.30, 2.8), (-0.80, 0, 0.45, 0.46, 0.38, 3.0), (-0.40, 0, 0.46, 0.58, 0.40, 3.2),
            (0.20, 0, 0.47, 0.72, 0.44, 3.4), (0.62, 0, 0.60, 0.64, 0.66, 3.0), (1.10, 0, 0.53, 0.52, 0.50, 2.8),
            (1.60, 0, 0.44, 0.38, 0.34, 2.6), (2.05, 0, 0.40, 0.22, 0.22, 2.4), (2.30, 0, 0.40, 0.10, 0.12, 2.2)]
    statics.append(loft('mono', mono, [paint, black]))
    for sgn in (1, -1):
        pod = [(-0.30, sgn * 0.52, 0.34, 0.30, 0.30, 3.6), (-0.22, sgn * 0.54, 0.35, 0.36, 0.34, 3.4), (0.30, sgn * 0.54, 0.34, 0.40, 0.36, 3.2),
               (0.90, sgn * 0.46, 0.30, 0.32, 0.28, 3.0), (1.45, sgn * 0.33, 0.26, 0.20, 0.18, 2.6), (1.80, sgn * 0.22, 0.24, 0.10, 0.10, 2.4)]
        statics.append(loft('pod', pod, [paint, black], cap_mats=(1, 0)))
    bm = bmesh.new()
    # Unterboden mit Kanten, Planke
    K.bm_box(bm, (0, 0.55, 0.045), (1.40, 2.9, 0.02), mat=0)
    for sgn in (1, -1):
        K.bm_box(bm, (sgn * 0.70, 0.55, 0.08), (0.012, 2.8, 0.07), mat=0)
    K.bm_box(bm, (0, 0.6, 0.028), (0.3, 2.4, 0.012), mat=2)
    # Frontflügel: drei Elemente + Endplatten + Aufhängung
    K.wing(bm, 1.80, 0.26, 0.10, -2.78, 0.09, 2, 0)
    K.wing(bm, 1.70, 0.14, 0.10, -2.58, 0.13, 16, 1)
    K.wing(bm, 1.55, 0.11, 0.10, -2.47, 0.19, 28, 1)
    for sgn in (1, -1):
        K.bm_box(bm, (sgn * 0.905, -2.62, 0.16), (0.012, 0.42, 0.20), mat=0)
        K.bm_box(bm, (sgn * 0.10, -2.55, 0.15), (0.012, 0.14, 0.14), mat=0)
    # Schwanenhals-Pylon + Beam-Wing
    K.bm_plate(bm, [(1.85, 0.48), (2.28, 0.86), (2.36, 0.86), (2.02, 0.44)], 0.0, 0.02, mat=0)
    K.wing(bm, 0.80, 0.18, 0.10, 2.20, 0.40, 10, 0)
    # Haifischflosse
    K.bm_plate(bm, [(0.75, 0.90), (2.05, 0.66), (2.05, 0.58), (0.95, 0.66)], 0.0, 0.008, mat=1)
    # Lufteinlass über dem Kopf + Kühleinlässe der Seitenkästen
    K.bm_cyl(bm, (0, 0.34, 0.86), (0, 0.33, 0.86), 0.085, segs=16, mat=2)
    for sgn in (1, -1):
        K.bm_box(bm, (sgn * 0.52, -0.315, 0.35), (0.26, 0.012, 0.24), mat=2)
        K.bm_box(bm, (sgn * 0.46, -0.30, 0.68), (0.14, 0.05, 0.07), mat=0)             # Spiegel
        K.bm_cyl(bm, (sgn * 0.30, -0.28, 0.60), (sgn * 0.44, -0.29, 0.67), 0.01, segs=6, mat=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    statics.append(K.mesh_obj('aero_fixed', bm, [carbon, pink, black], smooth=False))
    # Cockpitöffnung (dunkel) + Halo
    bm = bmesh.new()
    K.bm_cyl(bm, (0, -0.10, 0.665), (0, -0.10, 0.672), 0.28, segs=28, mat=0)
    halo = [(0, -0.60, 0.62), (0, -0.46, 0.80), (0.20, -0.32, 0.84), (0.30, -0.12, 0.84), (0.33, 0.08, 0.78), (0.30, 0.20, 0.64)]
    for a, b in zip(halo, halo[1:]):
        K.bm_cyl(bm, a, b, 0.026, segs=10, mat=1)
    for a, b in zip(halo[2:], halo[3:]):
        K.bm_cyl(bm, (-a[0], a[1], a[2]), (-b[0], b[1], b[2]), 0.026, segs=10, mat=1)
    K.bm_cyl(bm, halo[1], (-0.20, -0.32, 0.84), 0.026, segs=10, mat=1)
    K.bm_cyl(bm, (0.20, -0.32, 0.84), (-0.20, -0.32, 0.84), 0.024, segs=10, mat=1)
    statics.append(K.mesh_obj('halo', bm, [mats['interior'], ti]))
    # Fahrer (Helm + Schultern) — im Cockpitblick blendet das Web ihn aus
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=0.135,
                              matrix=Matrix.Translation((0, 0.02, 0.80)))
    for f in bm.faces:
        c = f.calc_center_median()
        f.material_index = 1 if (c.y < -0.04 and 0.78 < c.z < 0.85) else 0
        f.smooth = True
    K.bm_box(bm, (0, 0.10, 0.62), (0.44, 0.22, 0.14), mat=2)
    helmet = K.material(f'{cid}_helmet', color=0xf4f4f4, rough=0.2, coat=1.0)
    drv = K.mesh_obj('driver', bm, [helmet, black, mats['seat']])
    drv.parent = rb
    # Lenkrad
    sw = K.steering_wheel('steering_wheel', style='formula', mats=[black, mats['seat'], mats['screen'], pink], grip_mat=1)
    sw.matrix_world = Matrix.Translation((0, -0.36, 0.60)) @ K.frame(Vector((0, 1, 0.6)).normalized(), (-1, 0, 0)).to_4x4()
    sw.parent = rb
    # Auge knapp über dem Halo-Bügel (0,84 m): auf 0,82 lag er genau quer im Blickfeld
    K.empty('eye', (0, 0.0, 0.94), parent=rb)
    body = K.join(statics, 'body'); body.parent = rb
    # Aero-Optionen: Heckflügel (DRS-Klappe separat) + Gurney je Variante
    variants = [dict(ch=0.30, aoa=8, flap=0.18, fa=30, z=0.84), dict(ch=0.24, aoa=3, flap=0.13, fa=18, z=0.82),
                dict(ch=0.36, aoa=14, flap=0.22, fa=40, z=0.86)]
    labels = tune.get('aero_labels', ['Standard', 'Low drag (Monza)', 'High downforce (Monaco)'])
    for o, v in enumerate(variants):
        bm = bmesh.new()
        K.wing(bm, 1.0, v['ch'], 0.12, 2.18, v['z'], v['aoa'], 0)
        for sgn in (1, -1):
            K.bm_plate(bm, [(2.10, 0.50), (2.62, 0.52), (2.62, 1.00), (2.14, 0.98)], sgn * 0.505, 0.012, mat=1)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = K.mesh_obj(f'aero_o{o}', bm, [carbon, pink], smooth=False)
        ob.parent = rb; B.tag(ob, 'aero', o, labels[o])
        bm = bmesh.new()
        y_le = 2.18 + v['ch'] * 0.82
        z_le = v['z'] + v['ch'] * math.sin(math.radians(v['aoa'])) + 0.035
        K.wing(bm, 0.99, v['flap'], 0.10, 0.0, 0.0, v['fa'], 0)
        fl = K.mesh_obj(f'drs_flap_o{o}', bm, [pink], smooth=False)
        fl.location = (0, y_le, z_le)       # Ursprung = Vorderkante: dort ist das Scharnier
        fl.parent = rb; fl['drs'] = True; B.tag(fl, 'aero', o, labels[o])
    # Motor
    em = TU.engine_mats(cid)
    for o, lab in enumerate(('Stock', 'Qualifying map', 'Full-attack ERS')):
        ob = TU.engine_obj(f'engine_o{o}', TU.build_engine('f1v6', o, em, (0.0, 1.0, 0.14, 0.62)), em)
        ob.parent = rb; B.tag(ob, 'engine', o, lab)
    # Räder + Querlenker
    nodes = B.build_wheels(spec, mats, root, tune.get('wheels'))
    arm_mat = K.material(f'{cid}_arm', color=0x141416, metal=0.3, rough=0.4)
    _, _, yf, yr = K.wheel_s(spec)
    for key, piv in nodes.items():
        sgn = 1 if key[1] == 'L' else -1
        y = yf if key[0] == 'F' else yr
        P = piv.location.copy()
        tr = abs(P.x); r = P.z
        ins = [(0.18, -0.20, 0.46), (0.18, 0.20, 0.44), (0.14, -0.24, 0.22), (0.14, 0.26, 0.22), (0.16, 0.06, 0.56 if key[0] == 'F' else 0.50),
               (0.15, 0.14 if key[0] == 'F' else -0.14, 0.30)]
        outs = [(tr - 0.12, 0, r + 0.12), (tr - 0.12, 0, r + 0.12), (tr - 0.10, 0, r - 0.13), (tr - 0.10, 0, r - 0.13),
                (tr - 0.13, 0.02, r - 0.10), (tr - 0.11, 0.13 if key[0] == 'F' else -0.13, r - 0.02)]
        for i, (a, b) in enumerate(zip(ins, outs)):
            pin = Vector((sgn * a[0], y + a[1], a[2]))
            pout = Vector((sgn * b[0], y + b[1], b[2]))
            ob = arm_mesh(f'arm_{key}_{i}', arm_mat, 0.018 if i < 4 else 0.013)
            ob.parent = root
            d = pout - pin
            ob.matrix_world = Matrix.Translation(pin) @ K.frame(d, (0, 0, 1)).to_4x4() @ Matrix.Rotation(-math.pi / 2, 4, 'Y') @ Matrix.Diagonal((d.length, 1, 0.55, 1))
            ob['arm_in'] = json.dumps(gl(pin))
            ob['arm_out'] = json.dumps(gl(pout - P))
            ob['arm_wheel'] = key
    meta = B.spec_meta(spec)
    meta['tuning'] = dict(wheels=[w.get('label') for w in tune.get('wheels', [])], aero=labels, engine='f1v6',
                          paints=[s[0] for s in SCHEMES], paint_hex=['#%06x' % s[1][0] for s in SCHEMES])
    root['carlab'] = json.dumps(meta)
    return root
