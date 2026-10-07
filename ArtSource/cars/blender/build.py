"""
Setzt ein Auto aus einer Spec zusammen: Karosserie, Anbauteile, Innenraum,
Räder — und die Knotenhierarchie, die das Web (und später das Spiel) bewegt:

  car_<id>                (Wurzel, Boden = z 0, extras = Daten)
  ├─ body_root            gefedert: Nicken/Wanken/Einfedern
  │   ├─ body             alles Statische, ein Mesh
  │   ├─ steering_wheel   dreht um lokal Z (glTF: lokal Y)
  │   ├─ popup_L/R        Klappscheinwerfer, Scharnier = Ursprung, dreht um X
  │   ├─ drs_flap         Heckflügelklappe (nur Formel), dreht um X
  │   ├─ driver           Fahrerfigur (Formel) — im Cockpitblick aus
  │   └─ eye              Augpunkt für die Ich-Perspektive
  └─ wheel_FL/FR/RL/RR    ungefedert, Radmitte; dreht um Z (Lenkung)
      ├─ caliper_*        lenkt mit, dreht nicht
      └─ spin_*           dreht um X
          └─ wheelmesh_*
"""
import bpy, bmesh, math, json
from mathutils import Vector, Matrix
import carkit as K
import livery as LV

def mats_for(cid, spec, paint_tex):
    P = spec['paint']
    m = {}
    def M(k, **kw):
        m[k] = K.material(f'{cid}_{k}', **kw)
    M('paint', color=P.get('base', 0xffffff), metal=P.get('metal', 0.4), rough=P.get('rough', 0.32),
      coat=1.0, coat_rough=0.03, tex=paint_tex)
    M('glass', color=0x0b0f12, metal=0.0, rough=0.02, alpha=0.32, double=True)
    M('trim', color=0x0c0c0d, metal=0.1, rough=0.45)
    M('under', color=0x101012, rough=0.8)
    M('liner', color=0x0e0e10, rough=0.9)
    M('interior', color=spec.get('int_color', 0x1a1a1c), rough=0.85)
    M('dash', color=0x121214, rough=0.6)
    M('seat', color=spec.get('seat_color', 0x151517), rough=0.9)
    M('seat_accent', color=spec.get('seat_accent', 0xb0142a), rough=0.8)
    M('cage', color=spec.get('cage_color', 0x2a2a2e), metal=0.7, rough=0.35)
    M('chrome', color=0xdcdcdc, metal=1.0, rough=0.08)
    M('lamp_house', color=spec.get('lamp_house', 0x1b1d20), metal=0.8, rough=0.2)
    M('head', color=0xe8eef5, rough=0.05, emit=0xdfeaff, emit_str=spec.get('head_glow', 1.5))
    M('head_bright', color=0xffffff, rough=0.05, emit=0xffffff, emit_str=8.0)
    M('tail', color=0x5a0508, rough=0.1, emit=0xff1a1a, emit_str=1.2)
    M('amber', color=0x7a3a00, rough=0.1, emit=0xff8a00, emit_str=0.6)
    M('reverse', color=0xdddddd, rough=0.1, emit=0xffffff, emit_str=0.2)
    M('grille', color=0xffffff, rough=0.5, tex=LV.honeycomb_texture(f'{cid}_honey'))
    M('carbon', color=0xffffff, metal=0.3, rough=0.25, coat=1.0, tex=LV.carbon_texture(f'{cid}_carbon'))
    M('black_gloss', color=0x050506, rough=0.12, coat=0.8)
    M('plate_f', color=0xffffff, rough=0.4, tex=LV.plate_texture(f'{cid}_plate', spec.get('plate', '86-86'),
      yellow=spec.get('plate_yellow', False)))
    W = spec['wheel']
    M('tire', color=0x141414, rough=0.88)
    M('rim', color=W.get('color', 0xb8bcc2), metal=W.get('metal', 0.9), rough=W.get('rough', 0.25), double=True)
    M('rim_dark', color=0x1a1a1c, metal=0.6, rough=0.5, double=True)
    M('disc', color=0x5c5c60, metal=0.9, rough=0.35)
    M('lip', color=W.get('lip_color', 0xe6e6e6), metal=1.0, rough=0.1, double=True)
    M('nut', color=W.get('nut', 0x303034), metal=0.9, rough=0.3)
    M('caliper', color=W.get('caliper', 0xc81e1e), metal=0.2, rough=0.35, coat=0.6)
    M('stripe', color=W.get('stripe', 0xffd400), rough=0.6)
    M('gauge', color=0x050505, rough=0.3, emit_tex=K.gauge_texture(f'{cid}_gauge', spec.get('gauge_accent', 0xff3040)), emit_str=1.0)
    M('screen', color=0x050505, rough=0.2, emit=0x40d0ff, emit_str=1.5)
    return m

def ml(mats, *keys):
    return [mats[k] for k in keys]

def set_origin(ob, p):
    p = Vector(p)
    ob.data.transform(Matrix.Translation(-p))
    ob.location = p

def mirror_outline(outline):
    return [(-a, b) for a, b in reversed(outline)]

def outline_of(shape):
    kind = shape[0]
    if kind == 'rr':
        _, w, h, r, *rest = shape
        skew = rest[0] if len(rest) > 0 else 0.0
        taper = rest[1] if len(rest) > 1 else 0.0
        return K.rounded_rect(w, h, r, 5, skew, taper)
    if kind == 'ell':
        return K.ellipse(shape[1], shape[2], 28)
    if kind == 'poly':
        return list(shape[1])
    raise ValueError(kind)

# ---------------------------------------------------------------- Anbauteile
def place_pair(fn, body, spec, part, outline, **kw):
    out = []
    xs = [part['x'], -part['x']] if part.get('pair', True) and part.get('x', 0) != 0 else [part.get('x', 0)]
    for x in xs:
        o = outline
        # "+a = außen": Front hat +a = +X, Heck +a = −X (Rahmen schaut nach +Y)
        outward = 1 if x >= 0 else -1
        axis_sign = 1 if fn is K.front_part or fn is K.top_part else -1
        if outward * axis_sign < 0:
            o = mirror_outline(outline)
        ob = fn(body, spec, x, part['z'], o, **kw)
        out.append(ob)
    return out

def build_parts(body, spec, mats, root_body):
    statics, animated = [], []
    L = spec['L']
    for p in spec.get('parts', []):
        k = p['kind']
        if k in ('head', 'tail', 'fog', 'amber', 'reverse', 'intake', 'grille', 'plate_f', 'plate_r', 'vent_front'):
            fn = K.rear_part if k in ('tail', 'reverse', 'plate_r') or p.get('rear') else K.front_part
            outline = outline_of(p['shape'])
            lens = {'head': 'head', 'tail': 'tail', 'fog': 'head', 'amber': 'amber', 'reverse': 'reverse',
                    'intake': 'grille', 'grille': 'grille', 'plate_f': 'plate_f', 'plate_r': 'plate_f', 'vent_front': 'grille'}[k]
            house = p.get('house', 'lamp_house' if k in ('head', 'fog') else ('trim' if k in ('intake', 'grille', 'vent_front') else 'trim'))
            kw = dict(depth=p.get('depth', 0.08), proud=p.get('proud', 0.006), name=k,
                      mat_list=ml(mats, house, 'trim', lens))
            if k in ('head', 'tail', 'fog', 'amber', 'reverse'):
                kw.update(mats=(0, 1), inset=(p.get('inset', 0.84), 2), inset_proud=p.get('proud', 0.006) + 0.006)
            else:
                kw.update(mats=(2, 1))
            obs = place_pair(fn, body, spec, p, outline, **kw)
            statics += obs
            # Projektoren/Ringe
            for pr in p.get('proj', []):
                dx, dz, rad = pr
                sub = dict(p, x=p['x'] + dx if p['x'] >= 0 else p['x'] - dx, z=p['z'] + dz)
                for sgn in ([1, -1] if p.get('pair', True) and p['x'] != 0 else [1]):
                    xx = sgn * (abs(p['x']) + dx)
                    o = fn(body, spec, xx, p['z'] + dz, K.ellipse(rad * 2, rad * 2, 20), depth=0.05,
                           proud=p.get('proud', 0.006) + 0.012, mats=(0, 1), inset=(0.7, 2), inset_proud=p.get('proud', 0.006) + 0.016,
                           name='proj', mat_list=ml(mats, 'chrome', 'trim', 'head_bright' if k == 'head' else lens))
                    statics.append(o)
        elif k == 'side':
            outline = outline_of(p['shape'])
            for sgn in (1, -1):
                o = outline if sgn > 0 else mirror_outline(outline)
                statics.append(K.side_part(body, spec, p['s'], p['z'], o, sign=sgn, depth=0.05, proud=p.get('proud', 0.004),
                                           mats=(2, 1), name='side', mat_list=ml(mats, 'trim', 'trim', p.get('mat', 'trim'))))
        elif k == 'top':
            outline = outline_of(p['shape'])
            xs = [p.get('x', 0)] if not p.get('pair') else [p['x'], -p['x']]
            for x in xs:
                pr = p.get('proud', 0.006)
                o = K.top_part(body, spec, p['s'], x, outline, depth=0.08, proud=pr, mats=(2, 1), name='top',
                               mat_list=ml(mats, p.get('side_mat', 'trim'), p.get('side_mat', 'trim'), p.get('mat', 'grille')))
                statics.append(o)
        elif k == 'popup':
            outline = outline_of(p['shape'])
            for x, nm in ((p['x'], 'popup_L'), (-p['x'], 'popup_R')):
                y = L / 2 - p['s'] * L
                loc, nor = K.ray(body, (x, y, 5), (0, 0, -1))
                o = K.conform(body, outline, loc, nor, (1, 0, 0), depth=p.get('depth', 0.13), proud=0.004,
                              mats=(0, 1), name=nm, mat_list=ml(mats, 'paint', 'head'))
                # Scharnier an der Hinterkante (+Y)
                hy = max(v.co.y for v in o.data.vertices)
                hz = max(v.co.z for v in o.data.vertices)
                set_origin(o, (x, hy, hz))
                o['popup'] = True
                animated.append(o)
        elif k == 'mirror':
            # Sitz des Spiegels per Strahl auf die Gürtellinie — die erste
            # Fassung nahm feste (x, z) und stand frei neben dem Kotflügel.
            g_ = spec['glass']
            s = p.get('s', g_['ws'][1] - 0.18 * (g_['ws'][1] - g_['ws'][0]))
            y = L / 2 - s * L
            zb_ = K.pchip(spec['zbelt'])(s) + p.get('dz', 0.05)
            bm = bmesh.new()
            for sgn in (1, -1):
                loc, _ = K.ray(body, (sgn * 3, y, zb_), (-sgn, 0, 0))
                xs_ = abs(loc.x) if loc else spec['W'] / 2 * 0.9
                x0 = sgn * (xs_ + p.get('reach', 0.10)); z0 = zb_ + 0.07
                K.bm_box(bm, (sgn * (xs_ + 0.02), y + 0.02, zb_ + 0.015), (0.08, 0.10, 0.03), mat=0)
                K.bm_cyl(bm, (sgn * (xs_ + 0.01), y + 0.03, zb_ + 0.02), (x0 - sgn * 0.05, y + 0.02, z0 - 0.02), 0.013, segs=8, mat=0)
                K.bm_box(bm, (x0, y, z0), (0.15, 0.075, 0.095), mat=0)
                K.bm_box(bm, (x0, y + 0.039, z0), (0.13, 0.004, 0.08), mat=1)
            o = K.mesh_obj('mirror', bm, ml(mats, 'paint' if p.get('paint', True) else 'black_gloss', 'chrome'), smooth=False)
            bev = o.modifiers.new('bev', 'BEVEL'); bev.width = 0.02; bev.segments = 3
            K.apply_mods(o)
            statics.append(o)
        elif k == 'wing':
            statics.append(build_wing(body, spec, p, mats))
        elif k == 'exhaust':
            bm = bmesh.new()
            yb = L / 2
            for (x, z, r) in p['tips']:
                loc, _ = K.ray(body, (x, L, z), (0, -1, 0))
                y0 = (loc.y if loc else yb) - 0.12
                K.bm_cyl(bm, (x, y0, z), (x, y0 + 0.12 + p.get('out', 0.03), z), r, r * 1.05, segs=20, cap=False, mat=0)
                K.bm_cyl(bm, (x, y0, z), (x, y0 + 0.12 + p.get('out', 0.03) - 0.005, z), r * 0.82, segs=20, cap=True, mat=1)
            statics.append(K.mesh_obj('exhaust', bm, ml(mats, p.get('mat', 'chrome'), 'under')))
        elif k == 'splitter':
            # Höhe an die Front-Unterkante klemmen, sonst geht der Strahl darunter durch
            zsp = max(p.get('z', 0.16), K.pchip(spec['zb'])(0.99) + 0.03)
            p = dict(p, z=zsp)
            loc, _ = K.ray(body, (0, -L, zsp), (0, 1, 0))
            if loc is None:
                continue
            bm = bmesh.new()
            w = p.get('w', spec['W'] * 0.92)
            K.bm_box(bm, (0, loc.y + p.get('depth', 0.22) / 2 - p.get('out', 0.06), p.get('z', 0.16) - 0.02), (w, p.get('depth', 0.22), 0.02), mat=0)
            if p.get('canards'):
                for sgn in (1, -1):
                    for dz in (0.08, 0.16):
                        K.bm_box(bm, (sgn * w * 0.47, loc.y + 0.12, p.get('z', 0.16) + dz), (0.12, 0.2, 0.012), mat=0,
                                 rot=Matrix.Rotation(math.radians(sgn * 12), 3, 'Y'))
            statics.append(K.mesh_obj('splitter', bm, ml(mats, 'carbon'), smooth=False))
        elif k == 'diffuser':
            loc, _ = K.ray(body, (0, L, p.get('z', 0.2)), (0, -1, 0))
            bm = bmesh.new()
            w = p.get('w', spec['W'] * 0.8)
            y0 = loc.y if loc else L / 2
            K.bm_box(bm, (0, y0 - 0.22, p.get('z', 0.2) - 0.05), (w, 0.36, 0.015), mat=0,
                     rot=Matrix.Rotation(math.radians(-10), 3, 'X'))
            for i in range(p.get('fins', 5)):
                x = -w / 2 + w * (i + 0.5) / p.get('fins', 5)
                K.bm_box(bm, (x, y0 - 0.2, p.get('z', 0.2) - 0.03), (0.008, 0.30, 0.10), mat=0)
            statics.append(K.mesh_obj('diffuser', bm, ml(mats, 'carbon'), smooth=False))
        elif k == 'towhook':
            loc, _ = K.ray(body, (p['x'], -L if not p.get('rear') else L, p['z']), (0, 1, 0) if not p.get('rear') else (0, -1, 0))
            if loc is None:
                continue
            bm = bmesh.new()
            d = -1 if not p.get('rear') else 1
            y0 = loc.y
            pts = [(p['x'] - 0.03, y0 - d * 0.02, p['z']), (p['x'] - 0.03, y0 + d * 0.07, p['z']), (p['x'] + 0.03, y0 + d * 0.07, p['z']), (p['x'] + 0.03, y0 - d * 0.02, p['z'])]
            for a, b in zip(pts, pts[1:]):
                K.bm_cyl(bm, a, b, 0.009, segs=8, mat=0)
            statics.append(K.mesh_obj('towhook', bm, [K.material(f"{spec['id']}_tow", color=p.get('color', 0xe01818), rough=0.4)]))
        elif k == 'box':
            bm = bmesh.new()
            rot = Matrix.Rotation(math.radians(p.get('rx', 0)), 3, 'X') if p.get('rx') else None
            K.bm_box(bm, p['c'], p['size'], mat=0, rot=rot)
            if p.get('mirror'):
                c = p['c']
                K.bm_box(bm, (-c[0], c[1], c[2]), p['size'], mat=0, rot=rot)
            o = K.mesh_obj(p.get('name', 'box'), bm, ml(mats, p.get('mat', 'trim')), smooth=False)
            if p.get('bevel'):
                b = o.modifiers.new('bev', 'BEVEL'); b.width = p['bevel']; b.segments = 2
                K.apply_mods(o)
            statics.append(o)
        elif k == 'tubes':
            bm = bmesh.new()
            for seg in p['segs']:
                for a, b in zip(seg, seg[1:]):
                    K.bm_cyl(bm, a, b, p.get('r', 0.015), segs=10, mat=0)
                if p.get('mirror'):
                    ms = [(-q[0], q[1], q[2]) for q in seg]
                    for a, b in zip(ms, ms[1:]):
                        K.bm_cyl(bm, a, b, p.get('r', 0.015), segs=10, mat=0)
            statics.append(K.mesh_obj(p.get('name', 'tubes'), bm, ml(mats, p.get('mat', 'trim'))))
        elif k == 'lamps':  # frei stehende Rundscheinwerfer (Rallye-Pod, Lichtleiste)
            bm = bmesh.new()
            for (x, y, z, r) in p['at']:
                if y is None:
                    loc, _ = K.ray(body, (x, -L, z), (0, 1, 0))
                    y = (loc.y if loc else -L / 2) - 0.07
                d = Vector(p.get('dir', (0, -1, 0)))
                c = Vector((x, y, z))
                K.bm_cyl(bm, c + d * -0.06, c, r, r, segs=20, mat=0)
                K.bm_cyl(bm, c, c + d * 0.004, r * 0.88, segs=20, mat=1)
            statics.append(K.mesh_obj('lamps', bm, ml(mats, p.get('house', 'black_gloss'), 'head')))
        elif k == 'scoop':
            y = L / 2 - p['s'] * L
            loc, nor = K.ray(body, (0, y, 5), (0, 0, -1))
            l_, h_ = p['l'], p['h']
            # Keil: vorn hoch (Öffnung), hinten bündig. +b zeigt im Rahmen nach hinten.
            fn = lambda a, b: 0.004 + h_ * min(max(0.5 - b / l_, 0.0), 1.0) * (1 - (2 * a / p['w']) ** 4 * 0.6)
            statics.append(K.conform(body, K.rounded_rect(p['w'], l_, 0.06), loc, nor, (1, 0, 0), depth=0.06, proud=fn,
                                     mats=(0, 1), name='scoop', mat_list=ml(mats, 'paint', 'grille')))
        elif k == 'mudflap':
            _, _, yf, yr = K.wheel_s(spec)
            bm = bmesh.new()
            for y, r in ((yf, spec['r']), (yr, spec['r'])):
                for sgn in (1, -1):
                    K.bm_box(bm, (sgn * spec['track'] / 2, y + r + 0.10, 0.24), (spec['tw'] + 0.05, 0.012, 0.30), mat=0)
            statics.append(K.mesh_obj('mudflaps', bm, [K.material(f"{spec['id']}_flap", color=p.get('color', 0x151515), rough=0.7)], smooth=False))
        elif k == 'skid':
            loc, _ = K.ray(body, (0, -L, 0.48), (0, 1, 0))
            bm = bmesh.new()
            K.bm_box(bm, (0, (loc.y if loc else -L / 2) + 0.06, 0.44), (1.2, 0.34, 0.03), mat=0, rot=Matrix.Rotation(math.radians(-28), 3, 'X'))
            statics.append(K.mesh_obj('skid', bm, [K.material(f"{spec['id']}_alu", color=0xa9adb2, metal=1.0, rough=0.35)], smooth=False))
        elif k == 'roofrack':
            g_ = spec['glass']
            ztop_f = K.pchip(spec['ztop'])
            yf_ = L / 2 - g_['ws'][0] * L + 0.08
            yb_ = L / 2 - g_['rear'][1] * L - 0.10
            zr = max(ztop_f(s) for s in (g_['ws'][0], g_['rear'][1], 0.5)) + 0.09
            xr = spec['W'] / 2 * K.pchip(spec['wt'])(0.4) - 0.06
            bm = bmesh.new()
            for sgn in (1, -1):
                K.bm_cyl(bm, (sgn * xr, yf_, zr), (sgn * xr, yb_, zr), 0.018, segs=10, mat=0)
                for y in (yf_ + 0.05, yb_ - 0.05, (yf_ + yb_) / 2):
                    K.bm_box(bm, (sgn * xr, y, zr - 0.05), (0.04, 0.06, 0.10), mat=0)
            for i in range(6):
                y = yf_ + (yb_ - yf_) * i / 5
                K.bm_cyl(bm, (xr, y, zr), (-xr, y, zr), 0.015, segs=8, mat=0)
            statics.append(K.mesh_obj('roofrack', bm, ml(mats, 'trim')))
            bm = bmesh.new()
            K.bm_box(bm, (0, yf_ - 0.02, zr + 0.06), (1.05, 0.08, 0.10), mat=0)
            for i in range(6):
                x = -0.44 + 0.176 * i
                K.bm_cyl(bm, (x, yf_ - 0.06, zr + 0.06), (x, yf_ - 0.064, zr + 0.06), 0.036, segs=16, mat=1)
            statics.append(K.mesh_obj('lightbar', bm, ml(mats, 'black_gloss', 'head')))
        elif k == 'bed':
            yb_ = L / 2 - 0.005
            yc_ = L / 2 - 0.555 * L
            zf_ = 0.68
            W2 = spec['W'] / 2
            bm = bmesh.new()
            for sgn in (1, -1):
                K.bm_box(bm, (sgn * (W2 - 0.02), (yb_ + yc_) / 2, zf_ + 0.15), (0.035, yb_ - yc_, 0.30), mat=0)
                K.bm_box(bm, (sgn * (W2 - 0.02), (yb_ + yc_) / 2, zf_ + 0.305), (0.05, yb_ - yc_, 0.02), mat=1)
            K.bm_box(bm, (0, yb_ - 0.018, zf_ + 0.15), (2 * W2 - 0.02, 0.035, 0.30), mat=0)
            K.bm_box(bm, (0, yc_ + 0.03, zf_ + 0.22), (2 * W2 - 0.04, 0.04, 0.44), mat=0)
            for i in range(6):
                x = -W2 * 0.8 + i * W2 * 0.32
                K.bm_box(bm, (x, (yb_ + yc_) / 2, zf_ + 0.006), (0.04, yb_ - yc_ - 0.08, 0.012), mat=1)
            statics.append(K.mesh_obj('bed', bm, ml(mats, 'paint', 'trim'), smooth=False))
            bm = bmesh.new()
            gy = yc_ + 0.07
            K.bm_cyl(bm, (W2 - 0.06, gy, zf_ + 0.3), (W2 - 0.06, gy, 1.62), 0.018, segs=10, mat=0)
            K.bm_cyl(bm, (-W2 + 0.06, gy, zf_ + 0.3), (-W2 + 0.06, gy, 1.62), 0.018, segs=10, mat=0)
            K.bm_cyl(bm, (W2 - 0.06, gy, 1.62), (-W2 + 0.06, gy, 1.62), 0.018, segs=10, mat=0)
            for i in range(1, 8):
                x = -W2 + 0.06 + i * (2 * W2 - 0.12) / 8
                K.bm_cyl(bm, (x, gy, zf_ + 0.44), (x, gy, 1.62), 0.008, segs=6, mat=0)
            statics.append(K.mesh_obj('guard', bm, ml(mats, 'trim')))
            for x in (0.56, -0.56):
                o = K.rear_part(body, spec, x, 0.54, K.rounded_rect(0.12, 0.16, 0.02), depth=0.05, proud=0.012,
                                mats=(0, 1), inset=(0.85, 2), inset_proud=0.018, name='tail', mat_list=ml(mats, 'lamp_house', 'trim', 'tail'))
                if o:
                    statics.append(o)
            o = K.rear_part(body, spec, 0.0, 0.54, K.rounded_rect(0.33, 0.165, 0.01), depth=0.05, proud=0.012,
                            mats=(2, 1), name='plate', mat_list=ml(mats, 'trim', 'trim', 'plate_f'))
            if o:
                statics.append(o)
        elif k == 'arches':
            # Kotflügelverbreiterung aus schwarzem Kunststoff: Halbring um den Radlauf
            _, _, yf, yr = K.wheel_s(spec)
            bm = bmesh.new()
            for y, r in ((yf, spec['r']), (yr, spec.get('r_rear', spec['r']))):
                gap = spec.get('arch_gap', 0.045)
                for sgn in (1, -1):
                    loc, _ = K.ray(body, (sgn * 3, y, r + r + gap + 0.03), (-sgn, 0, 0))
                    x = abs(loc.x) if loc else spec['W'] / 2
                    outer, inner = [], []
                    ro = r + gap + p.get('w', 0.09); ri = r + gap - 0.004
                    for i in range(15):
                        a = math.pi * i / 14
                        outer.append((y + ro * math.cos(a), r + ro * math.sin(a)))
                        inner.append((y + ri * math.cos(a), r + ri * math.sin(a)))
                    K.bm_plate(bm, outer + list(reversed(inner)), sgn * (x + p.get('out', 0.0)), p.get('t', 0.07), mat=0)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            statics.append(K.mesh_obj('arches', bm, ml(mats, p.get('mat', 'trim')), smooth=False))
        elif k == 'glow':
            _, _, yf, yr = K.wheel_s(spec)
            bm = bmesh.new()
            for sgn in (1, -1):
                K.bm_box(bm, (sgn * (spec['W'] / 2 - 0.22), (yf + yr) / 2, 0.11), (0.03, abs(yf - yr) * 0.62, 0.02), mat=0)
            K.bm_box(bm, (0, yf - 0.55, 0.11), (spec['W'] * 0.6, 0.03, 0.02), mat=0)
            K.bm_box(bm, (0, yr + 0.5, 0.13), (spec['W'] * 0.6, 0.03, 0.02), mat=0)
            gm = K.material(f"{spec['id']}_glow", color=p['color'], emit=p['color'], emit_str=8.0)
            statics.append(K.mesh_obj('glow', bm, [gm], smooth=False))
    return statics, animated

def build_wing(body, spec, p, mats):
    L = spec['L']
    y_le = L / 2 - p['s'] * L
    span = p['span']
    zdeck = K.surface_z(body, span * 0.3, y_le + p['chord'] * 0.5) or 1.0
    z = zdeck + p['h']
    bm = bmesh.new()
    K.wing(bm, span, p['chord'], p.get('thick', 0.12), y_le, z, p.get('aoa', 8), 0,
           plate=p.get('plate', (0, 0)), mat_plate=1)
    if p.get('element2'):
        K.wing(bm, span * 0.98, p['chord'] * 0.45, 0.10, y_le + p['chord'] * 0.8, z + p['chord'] * 0.14, p.get('aoa', 8) + 18, 0)
    mount = p.get('mount', 'post')
    for sgn in (1, -1):
        x = sgn * span * p.get('post_x', 0.32)
        zd = K.surface_z(body, x, y_le + p['chord'] * 0.55) or zdeck
        if mount == 'post':
            K.bm_box(bm, (x, y_le + p['chord'] * 0.55, (zd + z) / 2), (0.018, p['chord'] * 0.5, z - zd + 0.02), mat=1)
        elif mount == 'swan':
            yy = y_le + p['chord'] * 0.4
            K.bm_box(bm, (x, yy + 0.06, (zd + z) / 2 + 0.02), (0.016, 0.06, z - zd + 0.08), mat=1)
            K.bm_box(bm, (x, yy - 0.01, z + 0.05), (0.016, 0.16, 0.035), mat=1)
        elif mount == 'hoop':
            # Bügel: vom Flügelende im Viertelkreis nach vorn-unten auf den Deckel
            xe = sgn * (span / 2 - 0.03)
            y0_ = y_le + p['chord'] * 0.35
            y1_ = y_le - 0.22
            zd2 = K.surface_z(body, xe * 0.98, y1_) or zdeck
            n_ = 8
            outer, inner = [], []
            dz_ = z - zd2 + 0.03
            for i in range(n_ + 1):
                a = math.pi / 2 * i / n_
                yy = y0_ - (y0_ - y1_) * (1 - math.cos(a)); zz = z + 0.02 - dz_ * math.sin(a)
                outer.append((yy, zz))
                w_ = 0.10 - 0.03 * i / n_
                inner.append((yy + w_ * math.sin(a) * 0.9, zz + w_ * (1 - math.sin(a) * 0.4) - 0.02))
            K.bm_plate(bm, outer + list(reversed(inner)), xe, 0.03, mat=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = K.mesh_obj('wing', bm, ml(mats, p.get('mat', 'carbon'), p.get('mat2', 'trim')), smooth=True)
    return o

# --------------------------------------------------------------- Innenraum
def build_interior(body, spec, mats, root_body):
    L = spec['L']
    g = spec['glass']
    zf = spec['zfloor']
    s_ws = g['ws'][1]
    y_ws = L / 2 - s_ws * L
    zbelt = K.pchip(spec['zbelt'])(s_ws)
    sw0, sw1 = g['side']
    # Hüftpunkt aus dem Abstand zur Windschutzscheiben-Unterkante: im ersten
    # Entwurf hing er an der Seitenscheibe, und das Lenkrad stand im
    # Armaturenbrett (Stirnwand–Hüfte 0,99 m statt ~1,3 m).
    y_hip = y_ws + spec.get('cowl_hip', 1.30)
    dx = spec.get('driver_x', 0.36)
    xd = -dx  # Rechtslenker
    s_hip = (L / 2 - y_hip) / L
    ztop_f = K.pchip(spec['ztop'])
    roof = min(ztop_f(s_hip), ztop_f(s_hip + 0.08)) - 0.06
    statics = []
    bm = bmesh.new()
    iw = spec['W'] / 2 - 0.16
    # Armaturenbrett: reicht von der Scheibe bis ~0,6 m davor
    dash_top = zbelt + 0.02
    Y = lambda d: y_ws + d
    # Armaturenbrett als Profil (YZ) über die Breite extrudiert: Oberseite
    # unter der Scheibe, Kante zum Fahrer, Knieausschnitt darunter.
    prof = [(Y(-0.02), dash_top - 0.03), (Y(0.30), dash_top + 0.015), (Y(0.54), dash_top - 0.005),
            (Y(0.60), dash_top - 0.06), (Y(0.58), dash_top - 0.16), (Y(0.46), dash_top - 0.24),
            (Y(0.44), zf + 0.30), (Y(-0.02), zf + 0.30)]
    K.bm_plate(bm, prof, 0.0, 2 * iw, mat=0)
    # Instrumentenhutze vor dem Fahrer — Schirm über den Uhren
    # Flacher, schmaler Schirm, der nicht über das Lenkrad ragt — die erste Fassung
    # reichte bis Y(0.62) und stand aus Fahrersicht quer vor dem Lenkradkranz.
    hood = [(Y(0.30), dash_top + 0.01), (Y(0.34), dash_top + 0.09), (Y(0.50), dash_top + 0.085),
            (Y(0.51), dash_top + 0.07), (Y(0.445), dash_top + 0.078), (Y(0.43), dash_top + 0.01)]
    K.bm_plate(bm, hood, xd, 0.36, mat=0)
    dash_y = y_ws + 0.27
    # Mittelkonsole + Schalthebel
    K.bm_box(bm, (0, y_hip - 0.22, zf + 0.12), (0.22, 0.75, 0.24), mat=0)
    K.bm_box(bm, (0, dash_y + 0.30, zf + 0.26), (0.26, 0.20, 0.32), mat=0)
    K.bm_cyl(bm, (0, y_hip - 0.42, zf + 0.30), (0, y_hip - 0.46, zf + 0.48), 0.009, segs=8, mat=1)
    K.bm_cyl(bm, (0, y_hip - 0.46, zf + 0.48), (0, y_hip - 0.465, zf + 0.53), 0.024, 0.02, segs=12, mat=1)
    # Handbremse (Drift!)
    K.bm_cyl(bm, (0.08, y_hip - 0.10, zf + 0.30), (0.08, y_hip - 0.36, zf + 0.40), 0.012, segs=8, mat=1)
    # Pedale
    for i, px in enumerate((-0.10, 0.0, 0.10)):
        K.bm_box(bm, (xd + px, y_hip - 0.98, zf + 0.12), (0.06, 0.02, 0.09), mat=1)
    # Innenspiegel
    ztop_ws = K.pchip(spec['ztop'])(g['ws'][0])
    K.bm_box(bm, (0, L / 2 - g['ws'][0] * L + 0.08, ztop_ws - 0.09), (0.24, 0.03, 0.065), mat=1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = K.mesh_obj('dash', bm, ml(mats, 'dash', 'trim'), smooth=False)
    b = o.modifiers.new('bev', 'BEVEL'); b.width = 0.015; b.segments = 2; b.limit_method = 'ANGLE'
    K.apply_mods(o)
    statics.append(o)
    # Instrumente
    bm = bmesh.new()
    gv = bm.verts
    cy = Y(0.452); cz = dash_top + 0.045
    quad = [gv.new((xd + 0.16, cy, cz - 0.034)), gv.new((xd - 0.16, cy, cz - 0.034)), gv.new((xd - 0.16, cy - 0.005, cz + 0.034)), gv.new((xd + 0.16, cy - 0.005, cz + 0.034))]
    f = bm.faces.new(quad)
    uvl = bm.loops.layers.uv.verify()
    # Blick des Fahrers von +Y: links im Bild ist +X
    for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lp[uvl].uv = uv
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for fc in bm.faces:
        if fc.normal.y < 0:
            fc.normal_flip()
    if spec.get('screen'):
        q = [gv.new((0.10, dash_y + 0.22, dash_top - 0.06)), gv.new((-0.10, dash_y + 0.22, dash_top - 0.06)),
             gv.new((-0.10, dash_y + 0.20, dash_top + 0.04)), gv.new((0.10, dash_y + 0.20, dash_top + 0.04))]
        f2 = bm.faces.new(q); f2.material_index = 1
        if f2.normal.y < 0:
            f2.normal_flip()
    statics.append(K.mesh_obj('gauges', bm, ml(mats, 'gauge', 'screen'), smooth=False))
    # Sitze
    bm = bmesh.new()
    racing = spec.get('racing_seats', True)
    for x in (xd, -xd):
        K.bucket_seat(bm, x, y_hip, zf, 0, 1, 2, racing=racing, scale=spec.get('seat_scale', 0.9))
    if spec.get('rear_seats'):
        K.bm_box(bm, (0, y_hip + 0.75, zf + 0.22), (2 * iw - 0.1, 0.45, 0.14), mat=0)
        K.bm_box(bm, (0, y_hip + 0.98, zf + 0.5), (2 * iw - 0.1, 0.12, 0.5), mat=0, rot=Matrix.Rotation(math.radians(-15), 3, 'X'))
    o = K.mesh_obj('seats', bm, ml(mats, 'seat', 'seat_accent', 'trim'), smooth=False)
    b = o.modifiers.new('bev', 'BEVEL'); b.width = 0.025; b.segments = 3
    K.apply_mods(o)
    for pgn in o.data.polygons:
        pgn.use_smooth = True
    statics.append(o)
    if spec.get('cage'):
        bm = bmesh.new()
        # Lichtes Maß per Strahl von innen an die Karosserie
        def zr(y):
            loc, _ = K.ray(body, (0, y, 6), (0, 0, -1))
            return (loc.z if loc else roof) - 0.075
        def hw(y):
            z = zr(y) - 0.10
            loc, _ = K.ray(body, (0, y, z), (1, 0, 0))
            return (abs(loc.x) if loc else iw) - 0.06
        K.roll_cage(bm, spec, 0, zf, y_ws + 0.62, y_hip + 0.30, zr, hw)
        statics.append(K.mesh_obj('cage', bm, ml(mats, 'cage')))
    # Lenkrad
    hub = Vector((xd, y_hip - spec.get('reach', 0.56), zf + spec.get('wheel_h', 0.60)))
    axis = Vector((0, 1, 0.42)).normalized()
    sw = K.steering_wheel('steering_wheel', 0.18 if not spec.get('small_wheel') else 0.165,
                          'round', ml(mats, 'dash', 'seat', 'screen', 'seat_accent'), grip_mat=1)
    sw.matrix_world = Matrix.Translation(hub) @ K.frame(axis, (-1, 0, 0)).to_4x4()
    sw.parent = root_body
    eye = K.empty('eye', (xd, y_hip + 0.10, min(zf + spec.get('eye_h', 0.80), roof - 0.09)), parent=root_body)
    return statics, sw, eye

# ------------------------------------------------------------------- Räder
def wheel_mats(cid, mats, opt, o):
    """Eigene Felgenmaterialien je Option — die Farbe steckt im Material."""
    m = dict(mats)
    if o == 0:
        return m
    m['rim'] = K.material(f'{cid}_rim{o}', color=opt.get('color', 0xb8bcc2), metal=opt.get('metal', 0.9),
                          rough=opt.get('rough', 0.25), double=True)
    m['lip'] = K.material(f'{cid}_lip{o}', color=opt.get('lip_color', opt.get('color', 0xe6e6e6)),
                          metal=1.0, rough=0.1, double=True)
    if 'stripe' in opt:
        m['stripe'] = K.material(f'{cid}_stripe{o}', color=opt['stripe'], rough=0.6)
    return m

def tag(ob, slot, opt, label):
    ob['tune_slot'] = slot; ob['tune_opt'] = opt; ob['tune_label'] = label

def build_wheels(spec, mats, root, opts=None):
    _, _, yf, yr = K.wheel_s(spec)
    W = spec['wheel']
    nodes = {}
    opts = opts or [dict(label='Stock')]
    meshes = {}
    for axle, y in (('F', yf), ('R', yr)):
        tr = spec['track'] / 2 if axle == 'F' else spec.get('track_rear', spec['track']) / 2
        for side, sgn in (('L', 1), ('R', -1)):
            key = axle + side
            base = dict(W, **(W.get('rear', {}) if axle == 'R' else {}))
            r_ = spec['r'] if axle == 'F' else spec.get('r_rear', spec['r'])
            piv = K.empty(f'wheel_{key}', (sgn * tr, y, r_), parent=root)
            cal = K.build_caliper(f'caliper_{key}', dict(base, r=r_), mats['caliper'], sgn)
            cal.parent = piv; cal.location = (0, 0, 0)
            spin = K.empty(f'spin_{key}', (0, 0, 0), parent=piv)
            for o, opt in enumerate(opts):
                cfg = dict(base, **{k: v for k, v in opt.items() if k != 'label'})
                cfg.update(r=r_, w=spec['tw'] if axle == 'F' else spec.get('tw_rear', spec['tw']),
                           rim_r=cfg.get('rim_r', W['rim_r']))
                mk = (axle, side, o)
                nm = f'wheelmesh_{key}' + (f'_o{o}' if o else '')
                if mk not in meshes:
                    wm = K.build_wheel(nm, cfg, wheel_mats(spec['id'], mats, cfg, o), sgn)
                    meshes[mk] = wm.data
                else:
                    wm = bpy.data.objects.new(nm, meshes[mk]); K.link(wm)
                wm.parent = spin; wm.location = (0, 0, 0)
                tag(wm, 'wheels', o, opt.get('label', f'Option {o}'))
            nodes[key] = piv
    return nodes

AERO_KINDS = ('wing', 'roofrack')

# --------------------------------------------------------------- Zusammenbau
def assemble(spec):
    import tuning as TU
    if spec.get('builder') == 'formula':
        import formula
        return formula.assemble(spec)
    cid = spec['id']
    K.wipe_collection(f'car_{cid}')
    K.set_collection(f'car_{cid}')
    for m in [m for m in bpy.data.materials if m.name.startswith(cid + '_') and m.users == 0]:
        bpy.data.materials.remove(m)
    tune = TU.T.get(cid, {})
    root = K.empty(f'car_{cid}', (0, 0, 0), size=0.5)
    root_body = K.empty('body_root', (0, 0, 0), parent=root)
    # erster Durchlauf nur für UV-Tabelle (Lackierung braucht Umfangsmaße)
    sd = spec.get('subdiv', 2); spec['subdiv'] = 0
    pre = K.build_body(spec, [K.material('_tmp')] * 4, name='_pre')
    spec['subdiv'] = sd
    me = pre.data; bpy.data.objects.remove(pre); bpy.data.meshes.remove(me)
    liv = LV.Livery(spec, spec['paint'].get('base', 0xffffff))
    spec['livery'](liv, spec)
    tex = liv.finish(f'{cid}_paint0')
    # Lack-Varianten nur als Textur — das Web tauscht die Map am Material '<id>_paint'
    for o, (label, base, style) in enumerate(tune.get('paints', [])[1:], start=1):
        lv = LV.Livery(spec, base)
        TU.paint_variant(lv, spec, style, base)
        lv.finish(f'{cid}_paint{o}')
    mats = mats_for(cid, spec, tex)
    body = K.build_body(spec, [mats['paint'], mats['glass'], mats['trim'], mats['under']])
    K.cut_arches(body, spec, mats['liner'])
    cabin = K.cabin_shell(body, spec, mats['interior'])
    base_parts = spec.get('parts', [])
    stock_aero = [p for p in base_parts if p['kind'] in AERO_KINDS]
    statics, animated = build_parts(body, dict(spec, parts=[p for p in base_parts if p['kind'] not in AERO_KINDS]), mats, root_body)
    istat, sw, eye = build_interior(body, spec, mats, root_body)
    if spec.get('extra'):
        s2, a2 = spec['extra'](body, spec, mats, root_body)
        statics += s2; animated += a2
    # Aero-Optionen: 0 = Serie, 1/2 aus tuning.py; leere Option = leerer Knoten
    aero = tune.get('aero', [None])
    labels = tune.get('aero_labels', ['Stock'] * len(aero))
    for o, parts in enumerate(aero):
        parts = stock_aero if parts is None else parts
        obs, _ = build_parts(body, dict(spec, parts=parts), mats, root_body)
        ob = K.join(obs, f'aero_o{o}') if obs else K.empty(f'aero_o{o}', (0, 0, 0))
        ob.parent = root_body
        tag(ob, 'aero', o, labels[o])
    # Motoren: drei Ausbaustufen an derselben Stelle im Motorraum
    if tune.get('engine'):
        em = TU.engine_mats(cid)
        bay = TU.engine_bay(spec)
        for o, lab in enumerate(('Stock', 'Street: turbo + intake', 'Race: big turbo, ITB / intercooler')):
            bm = TU.build_engine(tune['engine'], o, em, bay)
            ob = TU.engine_obj(f'engine_o{o}', bm, em)
            ob.parent = root_body
            tag(ob, 'engine', o, lab)
    joined = K.join([body, cabin] + statics + istat, 'body')
    joined.parent = root_body
    for a in animated:
        mw = a.matrix_world.copy(); a.parent = root_body; a.matrix_world = mw
    build_wheels(spec, mats, root, tune.get('wheels'))
    meta = spec_meta(spec)
    meta['tuning'] = dict(wheels=[w.get('label') for w in tune.get('wheels', [])], aero=labels,
                          engine=tune.get('engine'), paints=[p[0] for p in tune.get('paints', [])],
                          paint_hex=['#%06x' % p[1] for p in tune.get('paints', [])])
    root['carlab'] = json.dumps(meta)
    return root


def spec_meta(spec):
    keys = ('id', 'name', 'maker', 'klass', 'tagline', 'hp', 'kg', 'drive', 'top_kmh', 'inspo', 'L', 'W', 'H',
            'wb_len', 'track', 'r', 'travel', 'lock', 'stiff', 'roll', 'pitch', 'grip', 'drift', 'sound', 'underglow', 'popups', 'drs')
    return {k: spec[k] for k in keys if k in spec}

def tri_count(root):
    n = 0
    for o in root.children_recursive:
        if o.type == 'MESH':
            n += sum(len(p.vertices) - 2 for p in o.data.polygons) * (1 if o.data.users == 1 else 1)
    return n
