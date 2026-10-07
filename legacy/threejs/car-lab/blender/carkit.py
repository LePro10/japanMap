"""
carkit — prozeduraler Autobaukasten für car-lab.

Konvention (Blender): Z oben, Fahrzeug schaut nach −Y, links = +X, rechts = −X.
Der glTF-Export macht daraus Y oben und vorwärts = +Z — dieselbe Achse, die das
Spiel für `forward` benutzt (CLAUDE.md, P14). X bleibt X, deshalb liegen alle
Drehachsen, die im Web gebraucht werden (Radspin, Querlenker), auf X.

Rechtslenker (JDM): der Fahrer sitzt bei x < 0.

Die Karosserie ist ein Loft aus Querschnitten entlang s ∈ [0,1] (0 = Heck,
1 = Front). Jeder Querschnitt hat 11 Halbpunkte j = 0…10 (Boden-Mitte bis
Dach-Mitte); Material, UV und Kanten-Crease hängen am Index j — damit ist die
Glasfläche, die Gürtellinie und die Lackierung für alle Autos dieselbe Rechnung.
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
TEX_DIR = os.path.join(LAB, 'textures')

# ---------------------------------------------------------------- Farben ---
def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hexc(h):
    return (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255))

def srgb_arr(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, 1.0], np.float32)

# ------------------------------------------------------------ Interpolation --
def pchip(keys):
    """Monotone kubische Interpolation (Fritsch–Carlson): kein Überschwingen
    zwischen den Stützstellen — eine Dachlinie darf zwischen zwei Werten
    nicht höher werden als beide."""
    xs = np.array([k[0] for k in keys], float)
    ys = np.array([k[1] for k in keys], float)
    n = len(xs)
    if n == 1:
        return lambda s: float(ys[0])
    h = np.diff(xs); d = np.diff(ys) / h
    m = np.zeros(n); m[0] = d[0]; m[-1] = d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0
        else:
            w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    def f(s):
        if s <= xs[0]: return float(ys[0])
        if s >= xs[-1]: return float(ys[-1])
        i = int(np.searchsorted(xs, s) - 1)
        t = (s - xs[i]) / h[i]; t2 = t * t; t3 = t2 * t
        return float((2*t3 - 3*t2 + 1) * ys[i] + (t3 - 2*t2 + t) * h[i] * m[i]
                     + (-2*t3 + 3*t2) * ys[i+1] + (t3 - t2) * h[i] * m[i+1])
    return f

# ------------------------------------------------------------ Materialien ---
def _inp(node, name):
    for s in node.inputs:
        if s.identifier == name or s.name == name:
            return s
    return None

def material(name, color=0x808080, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.05,
             emit=None, emit_str=0.0, alpha=1.0, tex=None, emit_tex=None, double=False,
             spec=0.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (400, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs[0])
    col = hexc(color) if isinstance(color, int) else color
    _inp(b, 'Base Color').default_value = (*col, 1)
    _inp(b, 'Metallic').default_value = metal
    _inp(b, 'Roughness').default_value = rough
    if coat > 0:
        _inp(b, 'Coat Weight').default_value = coat
        _inp(b, 'Coat Roughness').default_value = coat_rough
    if emit is not None:
        e = hexc(emit) if isinstance(emit, int) else emit
        _inp(b, 'Emission Color').default_value = (*e, 1)
        _inp(b, 'Emission Strength').default_value = emit_str
    if tex is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex; t.location = (-400, 0)
        nt.links.new(t.outputs[0], _inp(b, 'Base Color'))
    if emit_tex is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = emit_tex; t.location = (-400, -300)
        nt.links.new(t.outputs[0], _inp(b, 'Emission Color'))
        _inp(b, 'Emission Strength').default_value = emit_str or 1.0
    if alpha < 1.0:
        _inp(b, 'Alpha').default_value = alpha
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try: setattr(m, attr, val)
            except Exception: pass
    m.use_backface_culling = not double
    m.diffuse_color = (*col, alpha)
    return m

def image_from_array(name, arr, save=True):
    """arr: (H, W, 4) float in sRGB, Zeile 0 = unten (Blender-Konvention)."""
    h, w = arr.shape[:2]
    img = bpy.data.images.get(name)
    if img is None or img.size[0] != w or img.size[1] != h:
        if img is not None:
            bpy.data.images.remove(img)
        img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(np.ascontiguousarray(arr, np.float32).ravel())
    if save:
        os.makedirs(TEX_DIR, exist_ok=True)
        p = os.path.join(TEX_DIR, name + '.png')
        img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    img.pack()
    return img

# ------------------------------------------------------------- Szene/Objekte --
COLL = None

def set_collection(name):
    global COLL
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    COLL = c
    return c

def wipe_collection(name):
    c = bpy.data.collections.get(name)
    if c is None:
        return
    for o in list(c.all_objects):
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)
    bpy.data.collections.remove(c)

def link(ob, parent=None):
    COLL.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob

def empty(name, loc=(0, 0, 0), parent=None, size=0.1):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = loc
    return link(e, parent)

def mesh_obj(name, bm, mats, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in mats:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    return link(ob, parent)

def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)

def join(objs, name):
    """Statische Teile zu einem Mesh zusammenlegen — jedes Material ist im
    glTF ein Primitive, jedes Objekt ein weiterer Knoten; zusammengelegt bleibt
    es bei einem Draw-Call je Material."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    base = objs[0]
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    mats = []
    inv = base.matrix_world.inverted()
    for o in objs:
        me = o.data
        idx_map = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            idx_map.append(mats.index(m))
        tmp = me.copy()
        tmp.transform(inv @ o.matrix_world)
        if (inv @ o.matrix_world).determinant() < 0:
            tmp.flip_normals()
        for p in tmp.polygons:
            p.material_index = idx_map[p.material_index] if idx_map else 0
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    parent = base.parent
    mw = base.matrix_world.copy()
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    ob = mesh_obj(name, bm, mats, parent=None)
    ob.matrix_world = mw
    if parent is not None:
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    return ob

# ------------------------------------------------------------ Grundformen ---
def frame(z_axis, x_hint=(1, 0, 0)):
    z = Vector(z_axis).normalized()
    x = Vector(x_hint)
    x = (x - z * x.dot(z))
    if x.length < 1e-6:
        x = Vector((0, 1, 0)) - z * z.y
    x.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()

def bm_cyl(bm, p0, p1, r0, r1=None, segs=12, cap=True, mat=0):
    """Zylinder/Kegel von p0 nach p1 in ein bestehendes bmesh."""
    r1 = r0 if r1 is None else r1
    p0 = Vector(p0); p1 = Vector(p1)
    d = p1 - p0
    L = d.length
    if L < 1e-6:
        return
    R = frame(d)
    ring0, ring1 = [], []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c = Vector((math.cos(a), math.sin(a), 0))
        ring0.append(bm.verts.new(p0 + R @ (c * r0)))
        ring1.append(bm.verts.new(p1 + R @ (c * r1)))
    for i in range(segs):
        j = (i + 1) % segs
        f = bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i])); f.material_index = mat; f.smooth = True
    if cap:
        f = bm.faces.new(list(reversed(ring0))); f.material_index = mat
        f = bm.faces.new(ring1); f.material_index = mat

def bm_box(bm, center, size, mat=0, rot=None):
    c = Vector(center); sx, sy, sz = (s / 2 for s in size)
    R = rot or Matrix.Identity(3)
    pts = [c + R @ Vector((x * sx, y * sy, z * sz)) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    v = [bm.verts.new(p) for p in pts]
    idx = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for q in idx:
        f = bm.faces.new([v[i] for i in q]); f.material_index = mat; f.smooth = False

def bm_plate(bm, pts_yz, x, thick, mat=0):
    """Ebenes Profil in der YZ-Ebene, entlang X extrudiert (Stütze, Finne, Armaturenbrett)."""
    a = [bm.verts.new((x - thick / 2, y, z)) for y, z in pts_yz]
    b = [bm.verts.new((x + thick / 2, y, z)) for y, z in pts_yz]
    n = len(pts_yz)
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((a[i], a[j], b[j], b[i])); f.material_index = mat
    f = bm.faces.new(list(reversed(a))); f.material_index = mat
    f = bm.faces.new(b); f.material_index = mat

def bm_lathe(bm, profile, segs, mat_of=None, axis='X', uv=None, radial_mod=None):
    """Rotationskörper um X. profile: [(radius, axial)], Reihenfolge bestimmt
    die Normalenrichtung. mat_of(i) → Materialindex je Profilsegment."""
    rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        ca, sa = math.cos(a), math.sin(a)
        ring = []
        for pi_, (r, x) in enumerate(profile):
            rr = r + (radial_mod(k, pi_) if radial_mod else 0.0)
            ring.append(bm.verts.new((x, rr * ca, rr * sa)))
        rings.append(ring)
    uvl = bm.loops.layers.uv.verify()
    n = len(profile)
    for k in range(segs):
        k2 = (k + 1) % segs
        for i in range(n - 1):
            f = bm.faces.new((rings[k][i], rings[k][i + 1], rings[k2][i + 1], rings[k2][i]))
            f.smooth = True
            if mat_of:
                f.material_index = mat_of(i)
            u0 = k / segs; u1 = (k + 1) / segs
            for lp, (uu, vv) in zip(f.loops, ((u0, i / (n - 1)), (u0, (i + 1) / (n - 1)), (u1, (i + 1) / (n - 1)), (u1, i / (n - 1)))):
                lp[uvl].uv = (uu, vv)
    return rings

def rounded_rect(w, h, r, n=5, skew=0.0, taper=0.0):
    """2D-Umriss (gegen den Uhrzeigersinn). skew verschiebt die Oberkante
    seitlich, taper verschmälert sie — so werden aus Rechtecken
    schräg gezogene Scheinwerfer."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    corners = [(w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)]
    for cx, cy, a0 in corners:
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    out = []
    for x, y in pts:
        t = (y + h / 2) / h
        out.append((x * (1 - taper * t) + skew * t, y))
    return out

def ellipse(w, h, n=24):
    return [(w / 2 * math.cos(2 * math.pi * i / n), h / 2 * math.sin(2 * math.pi * i / n)) for i in range(n)]

def airfoil(chord, thick, n=10):
    """Symmetrisches NACA-4-Profil, Vorderkante bei 0, Sehne entlang +u."""
    up, lo = [], []
    for i in range(n + 1):
        x = (1 - math.cos(math.pi * i / n)) / 2
        t = 5 * thick * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4)
        up.append((x * chord, t * chord)); lo.append((x * chord, -t * chord * 0.6))
    return up + list(reversed(lo[1:-1]))

# --------------------------------------------------------------- Karosserie --
RING = 12  # Halbpunkte je Querschnitt
GLASS_J = (6, 7)       # Seitenscheibe
PILLAR_J = 8           # schmaler Streifen am Dachrand: A-/C-Säule
TOP_J = (9, 10)        # Wind-/Heckscheibe
BODY_MATS = ('paint', 'glass', 'trim', 'under')

def ring_half(zb, zbelt, ztop, wb, wt, crown, ledge, flare, rr=0.07):
    hb = max(zbelt - zb, 0.05)
    wbl = wb + flare
    p5x = 0.975 * wb + 0.25 * flare
    wg = p5x - ledge
    wt = min(wt, wg - 0.005)
    zre = ztop - crown
    gh = max(zre - zbelt, 0.004)
    rr_ = min(rr, 0.35 * gh)
    p6 = (wg, zbelt + min(0.012, 0.15 * gh))
    p8 = (wt, zre - rr_)
    bow = 0.012 if gh > 0.12 else 0.0
    p7 = ((p6[0] + p8[0]) / 2 + bow, (p6[1] + p8[1]) / 2)
    return [(0.0, zb), (0.80 * wbl, zb), (0.965 * wbl, zb + 0.10 * hb), (wbl, zb + 0.45 * hb),
            (0.99 * wb + 0.6 * flare, zb + 0.82 * hb), (p5x, zbelt), p6, p7, p8,
            (max(wt - 0.085, 0.72 * wt), zre + 0.12 * crown + 0.3 * rr_),
            (0.5 * wt, ztop - 0.2 * crown), (0.0, ztop)]

def body_profiles(spec):
    W2 = spec['W'] / 2
    f = {k: pchip(spec[k]) for k in ('zb', 'zbelt', 'ztop')}
    fw = pchip(spec['wb']); ft = pchip(spec['wt'])
    fc = pchip(spec.get('crown', [(0, 0.03), (1, 0.03)]))
    g = spec['glass']
    r0, r1 = g['rear']; w0, w1 = g['ws']
    fl = pchip(spec.get('ledge', [(0, 0.0), (r0 - 0.02, 0.0), (r0 + 0.02, 0.035), (w1 - 0.02, 0.035), (w1 + 0.02, 0.0), (1, 0.0)]))
    return f, fw, ft, fc, fl, W2

def wheel_s(spec):
    L = spec['L']
    off = spec.get('axle_off', 0.0)
    yf = -spec['wb_len'] / 2 + off
    yr = spec['wb_len'] / 2 + off
    return (L / 2 - yr) / L, (L / 2 - yf) / L, yf, yr

def flare_at(spec, s):
    sr, sf, _, _ = wheel_s(spec)
    L = spec['L']
    a = 0.0
    for sc, amt in ((sf, spec.get('flare_f', 0.0)), (sr, spec.get('flare_r', 0.0))):
        if amt:
            hw = (spec['r'] + 0.12) / L
            t = (s - sc) / hw
            a += amt * math.exp(-t * t * 1.6)
    return a

def build_body(spec, mats, name='body'):
    L = spec['L']
    f, fw, ft, fc, fl, W2 = body_profiles(spec)
    g = spec['glass']
    r0, r1 = g['rear']; w0, w1 = g['ws']; sw0, sw1 = g['side']
    bp = g.get('bpillar')
    pillars = [] if not bp else ([bp] if isinstance(bp[0], (int, float)) else list(bp))
    bp = None
    sr, sf, _, _ = wheel_s(spec)
    hw = (spec['r'] + 0.05) / L
    ss = set(np.round(np.linspace(0, 1, spec.get('nsec', 46)), 5))
    for v in (r0, r1, w0, w1, sw0, sw1, sf - hw, sf + hw, sr - hw, sr + hw, 0.008, 0.992, 0.03, 0.97) + tuple(x for p in pillars for x in p):
        ss.add(round(float(v), 5))
    ss = sorted(ss)
    clean = [ss[0]]
    for s in ss[1:]:
        if s - clean[-1] > 0.006:
            clean.append(s)
    ss = clean

    rr = spec.get('roof_round', 0.07)
    sections = []
    for s in ss:
        h = ring_half(f['zb'](s), f['zbelt'](s), f['ztop'](s), fw(s) * W2, ft(s) * W2,
                      fc(s), fl(s), flare_at(spec, s), rr)
        sections.append(h)

    # UV v aus Bogenlänge am Referenzquerschnitt (Kabinenmitte)
    ref = sections[min(range(len(ss)), key=lambda i: abs(ss[i] - (sw0 + sw1) / 2))]
    seg = [math.dist(ref[j], ref[j + 1]) for j in range(RING - 1)]
    tot = sum(seg)
    vh = [0.0]
    for d in seg:
        vh.append(vh[-1] + d / tot * 0.5)
    spec['_vhalf'] = vh
    spec['_perim'] = 2 * tot
    spec['_s'] = ss

    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    crease = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    NR = 2 * (RING - 1)  # 20 Punkte je Vollring
    grid = []
    for s, half in zip(ss, sections):
        y = L / 2 - s * L
        ring = []
        for k in range(NR):
            j = k if k <= RING - 1 else NR - k
            x, z = half[j]
            if k > RING - 1:
                x = -x
            ring.append(bm.verts.new((x, y, z)))
        grid.append(ring)

    def jof(k):
        return k if k <= RING - 1 else NR - k

    def vof(k, wrap=False):
        if wrap:
            return 1.0
        j = jof(k)
        return vh[j] if k <= RING - 1 else 1.0 - vh[j]

    apil = 2 if spec.get('apillar_black') else 0
    def matof(s, jl):
        if jl == 0:
            return 3
        cab = r0 - 0.005 <= s <= w1 + 0.005
        # Seitenscheibe: volle Höhe bis zum Windschutzscheiben-Anfang, danach
        # nur das untere Dreieck — dazwischen steht die A-Säule. Ohne sie lief
        # das Glas um die Ecke und das Dach wurde zur Blase.
        # Seit dem Ringpunkt am Dachrand (PILLAR_J) ist die A-Säule ein
        # schmaler eigener Streifen — vorher nahm sie die ganze obere
        # Scheibenspalte ein und stand als weißes Dreieck im Glas.
        if jl in GLASS_J and sw0 <= s <= sw1:
            for p0, p1 in pillars:
                if p0 <= s <= p1:
                    return 2 if spec.get('bpillar_black', True) else 0
            return 1
        if jl == PILLAR_J and (w0 <= s <= w1 or r0 <= s <= r1):
            return apil
        if jl in TOP_J and (w0 <= s <= w1 or r0 <= s <= r1):
            return 1
        if jl == 5 and cab and sw0 - 0.01 <= s <= sw1 + 0.01:
            return 2
        return 0

    for i in range(len(ss) - 1):
        smid = (ss[i] + ss[i + 1]) / 2
        for k in range(NR):
            k2 = (k + 1) % NR
            jl = min(jof(k), jof(k2))
            if (jof(k) == 0 and jof(k2) == 1) or (jof(k2) == 0 and jof(k) == 1):
                jl = 0
            q = (grid[i][k], grid[i + 1][k], grid[i + 1][k2], grid[i][k2])
            fc_ = bm.faces.new(q)
            fc_.material_index = matof(smid, jl)
            uvs = ((ss[i], vof(k)), (ss[i + 1], vof(k)), (ss[i + 1], vof(k2, k2 == 0)), (ss[i], vof(k2, k2 == 0)))
            for lp, uv in zip(fc_.loops, uvs):
                lp[uvl].uv = uv
    # Stirnflächen: UV je Randpunkt aus dessen Ringposition. Ein fester Wert
    # (erst v = 0.02) landete im dunklen Schwellerband der Lackierung und
    # malte Front und Heck schwarz aus.
    for ring, s in ((grid[0], 0.0), (list(reversed(grid[-1])), 1.0)):
        fc_ = bm.faces.new(ring); fc_.material_index = 0
        kof = {v: (grid[0] if s == 0.0 else grid[-1]).index(v) for v in ring}
        for lp in fc_.loops:
            k = kof[lp.vert]
            vv = vof(k)
            lp[uvl].uv = (s, min(max(vv, 0.12), 0.88))
    bm.edges.ensure_lookup_table()
    cmap = spec.get('creases', {5: 0.75, 8: 0.6, 2: 0.4})
    for i in range(len(ss) - 1):
        for k in range(NR):
            j = jof(k)
            if j in cmap:
                e = bm.edges.get((grid[i][k], grid[i + 1][k]))
                if e:
                    e[crease] = cmap[j]
    # Stirn- und Heckfläche: Kante leicht schärfen, sonst rundet die
    # Unterteilung Front und Heck zur Seifenform
    cc = spec.get('cap_crease', 0.45)
    for ring in (grid[0], grid[-1]):
        for k in range(NR):
            e = bm.edges.get((ring[k], ring[(k + 1) % NR]))
            if e:
                e[crease] = cc
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, list(mats))
    md = ob.modifiers.new('sub', 'SUBSURF')
    md.levels = md.render_levels = spec.get('subdiv', 2)
    apply_mods(ob)
    return ob

def cut_arches(body, spec, mat_liner):
    """Radläufe per Boolean. Der Schneider bringt sein Material mit — die
    Innenwand des Schnitts wird damit automatisch zum dunklen Radhaus."""
    _, _, yf, yr = wheel_s(spec)
    r = spec['r']
    tw = spec['track'] / 2
    bm = bmesh.new()
    for y, rr in ((yf, r + spec.get('arch_gap', 0.045)), (yr, r + spec.get('arch_gap', 0.045))):
        for sgn in (1, -1):
            x_in = sgn * (tw - spec['tw'] / 2 - 0.10)
            x_out = sgn * (spec['W'] / 2 + 0.3)
            bm_cyl(bm, (x_in, y, r), (x_out, y, r), rr, segs=40)
    cutter = mesh_obj('cutter', bm, [mat_liner])
    md = body.modifiers.new('arch', 'BOOLEAN')
    md.object = cutter
    md.operation = 'DIFFERENCE'
    try: md.solver = 'EXACT'
    except Exception: pass
    try: md.material_mode = 'TRANSFER'
    except Exception: pass
    cutter.hide_render = True; cutter.hide_viewport = True
    apply_mods(body)
    me = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(me)
    for p in body.data.polygons:
        p.use_smooth = True

def cabin_shell(body, spec, mat_in):
    """Innenverkleidung: Kabinenflächen der Karosserie kopieren, nach innen
    versetzen und umdrehen. Ohne sie sähe man aus dem Cockpit die Rückseite
    des Lacks — ein oranger Dachhimmel."""
    L = spec['L']
    g = spec['glass']
    s0, s1 = g['rear'][0] - 0.03, g['ws'][1] + 0.02
    y_lo, y_hi = L / 2 - s1 * L, L / 2 - s0 * L
    zfloor = spec['zfloor']
    glass_idx = [i for i, m in enumerate(body.data.materials) if m and m.name.endswith('glass')]
    bm = bmesh.new(); bm.from_mesh(body.data)
    kill = [f for f in bm.faces if not (y_lo <= f.calc_center_median().y <= y_hi and f.calc_center_median().z > zfloor + 0.02)
            or f.material_index in glass_idx]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co -= v.normal * 0.018
    for f in bm.faces:
        f.material_index = 0
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    # Boden
    W2 = spec['W'] / 2 - 0.12
    # Reihenfolge so, dass die Normale nach oben zeigt — umgekehrt sah man aus dem Cockpit den Asphalt
    vs = [bm.verts.new(p) for p in ((W2, y_hi, zfloor), (-W2, y_hi, zfloor), (-W2, y_lo, zfloor), (W2, y_lo, zfloor))]
    bm.faces.new(vs)
    return mesh_obj('cabin', bm, [mat_in])

# ------------------------------------------------------------- Aufsetzteile --
def ray(body, origin, direction):
    ok, loc, nor, _ = body.ray_cast(Vector(origin), Vector(direction).normalized(), distance=20)
    return (loc, nor) if ok else (None, None)

def conform(body, outline, origin, axis_n, x_hint, depth=0.06, proud=0.006, mats=(0, 0),
            inset=None, inset_proud=None, name='part', mat_list=None):
    """Ein flaches Teil (Scheinwerfer, Grill, Kennzeichen), dessen Vorderseite
    der Karosserie folgt: jeder Umrisspunkt wird entlang −n auf die Fläche
    projiziert. Ein starres Prisma stünde auf gewölbtem Blech an den Rändern
    frei oder steckte darin."""
    n = Vector(axis_n).normalized()
    R = frame(n, x_hint)
    X = R.col[0]; Y = R.col[1]
    O = Vector(origin)
    pr = proud if callable(proud) else (lambda a, b, _p=proud: _p)
    def proj(a, b, extra):
        P = O + X * a + Y * b
        loc, nor = ray(body, P + n * 0.6, -n)
        if loc is None:
            loc = P
        return loc + n * extra, loc - n * depth
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    N = len(outline)
    xs = [p[0] for p in outline]; ys = [p[1] for p in outline]
    cx = sum(xs) / N; cy = sum(ys) / N
    w = max(xs) - min(xs); h = max(ys) - min(ys)
    # Konzentrische Ringe statt einer N-Ecke: eine ebene N-Ecke über
    # gewölbtem Blech steckt in der Mitte im Lack oder steht am Rand frei —
    # die ersten Scheinwerfer sahen deshalb wie ausgefranste Löcher aus.
    if inset is None:
        levels = [(1.0, None, None), (0.7, None, mats[0]), (0.4, None, mats[0]), (0.15, None, mats[0])]
        cmat = mats[0]
    else:
        sc, m_in = inset
        ipd = inset_proud
        levels = [(1.0, None, None), (sc, ipd, mats[0]), (sc * 0.62, ipd, m_in), (sc * 0.3, ipd, m_in)]
        cmat = m_in
    rings, rings2d = [], []
    back = []
    for li, (sc, extra, _) in enumerate(levels):
        ring = []; pts2 = []
        for a, b in outline:
            aa, bb = cx + (a - cx) * sc, cy + (b - cy) * sc
            e = pr(aa, bb) if extra is None else (extra(aa, bb) if callable(extra) else extra)
            fp, bp = proj(aa, bb, e)
            ring.append(bm.verts.new(fp)); pts2.append((aa, bb))
            if li == 0:
                back.append(bm.verts.new(bp))
        rings.append(ring); rings2d.append(pts2)
    def uv(face, pts2):
        for lp, (a, b) in zip(face.loops, pts2):
            lp[uvl].uv = ((a - min(xs)) / max(w, 1e-6), (b - min(ys)) / max(h, 1e-6))
    for i in range(N):
        j = (i + 1) % N
        f = bm.faces.new((back[i], back[j], rings[0][j], rings[0][i])); f.material_index = mats[1]
    for li in range(1, len(levels)):
        A, B = rings[li - 1], rings[li]
        A2, B2 = rings2d[li - 1], rings2d[li]
        for i in range(N):
            j = (i + 1) % N
            f = bm.faces.new((A[i], A[j], B[j], B[i])); f.material_index = levels[li][2]
            uv(f, (A2[i], A2[j], B2[j], B2[i]))
    last = levels[-1]
    ce = pr(cx, cy) if last[1] is None else (last[1](cx, cy) if callable(last[1]) else last[1])
    cfp, _ = proj(cx, cy, ce)
    cv = bm.verts.new(cfp)
    for i in range(N):
        j = (i + 1) % N
        f = bm.faces.new((rings[-1][i], rings[-1][j], cv)); f.material_index = cmat
        uv(f, (rings2d[-1][i], rings2d[-1][j], (cx, cy)))
    f = bm.faces.new(list(reversed(back))); f.material_index = mats[1]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat_list or [], smooth=False)

def front_part(body, spec, x, z, outline, **kw):
    """Teil auf der Frontpartie: Strahl von vorn (−Y) bei (x, z)."""
    loc, nor = ray(body, (x, -spec['L'], z), (0, 1, 0))
    if loc is None:
        return None
    n = kw.pop('normal', None) or nor
    return conform(body, outline, loc, n, (1 if x >= 0 else 1, 0, 0), **kw)

def rear_part(body, spec, x, z, outline, **kw):
    loc, nor = ray(body, (x, spec['L'], z), (0, -1, 0))
    if loc is None:
        return None
    n = kw.pop('normal', None) or nor
    return conform(body, outline, loc, n, (-1, 0, 0), **kw)

def side_part(body, spec, s, z, outline, sign=1, **kw):
    y = spec['L'] / 2 - s * spec['L']
    loc, nor = ray(body, (sign * 3, y, z), (-sign, 0, 0))
    if loc is None:
        return None
    return conform(body, outline, loc, nor, (0, -sign, 0), **kw)

def top_part(body, spec, s, x, outline, **kw):
    y = spec['L'] / 2 - s * spec['L']
    loc, nor = ray(body, (x, y, 5), (0, 0, -1))
    if loc is None:
        return None
    return conform(body, outline, loc, nor, (1, 0, 0), **kw)

def surface_z(body, x, y):
    loc, _ = ray(body, (x, y, 6), (0, 0, -1))
    return loc.z if loc is not None else None

def wing(bm, span, chord, thick, y_le, z, aoa, mat, plate=(0.0, 0.0), mat_plate=None, sweep=0.0):
    """Flügel entlang X. aoa > 0 hebt die Hinterkante (Abtrieb)."""
    prof = airfoil(chord, thick)
    ca, sa = math.cos(math.radians(aoa)), math.sin(math.radians(aoa))
    def pt(u, t, x):
        # Sehne zeigt nach hinten (+Y), Profil-Oberseite nach +Z; Anstellwinkel dreht um die Vorderkante
        yy = u * ca - t * sa
        zz = u * sa + t * ca
        sw = sweep * abs(x) / (span / 2)
        return (x, y_le + yy + sw, z + zz)
    left = [bm.verts.new(pt(u, t, span / 2)) for u, t in prof]
    right = [bm.verts.new(pt(u, t, -span / 2)) for u, t in prof]
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((left[i], left[j], right[j], right[i])); f.material_index = mat; f.smooth = True
    f = bm.faces.new(left); f.material_index = mat
    f = bm.faces.new(list(reversed(right))); f.material_index = mat
    if plate[0] > 0:
        ph, pl = plate
        for x in (span / 2 + 0.006, -span / 2 - 0.006):
            bm_box(bm, (x, y_le + chord * 0.45, z + chord * sa * 0.5 - ph * 0.25), (0.012, pl, ph),
                   mat=mat_plate if mat_plate is not None else mat)

# ------------------------------------------------------------------ Räder ---
def tire_profile(r, w, rim_r, grooves=3, stretch=0.0, bulge=1.0):
    a = w / 2
    sw_top = r - 0.028
    prof = [(rim_r + 0.006, -a * (0.86 - stretch)), (rim_r + 0.02, -a * (0.95 - stretch * 0.5)),
            ((rim_r + sw_top) / 2, -a * (1.0 + 0.02 * bulge)), (sw_top, -a * 0.99), (r - 0.008, -a * 0.93)]
    tread = []
    xs = np.linspace(-a * 0.88, a * 0.88, 2 * grooves + 3)
    gpos = np.linspace(-a * 0.5, a * 0.5, grooves) if grooves else []
    tread.append((r - 0.002, -a * 0.88))
    for g in gpos:
        tread += [(r, g - 0.012), (r - 0.009, g - 0.008), (r - 0.009, g + 0.008), (r, g + 0.012)]
    tread.append((r - 0.002, a * 0.88))
    prof += tread
    prof += [(r - 0.008, a * 0.93), (sw_top, a * 0.99), ((rim_r + sw_top) / 2, a * (1.0 + 0.02 * bulge)),
             (rim_r + 0.02, a * (0.95 - stretch * 0.5)), (rim_r + 0.006, a * (0.86 - stretch))]
    return prof

# Felgenstile: Anzahl, Halbbreite der Speiche (m) an Nabe/Felge, Verdrehung,
# Paarversatz. Die erste Fassung baute Speichen als dünne Quader von der
# Nabe zum Horn — aus drei Metern Abstand sahen sie wie Zahnstocher aus.
# Jetzt ist jede Speiche ein Körper mit Fase, der zur Nabe hin breiter und
# tiefer wird (Konkavität), und zwischen den Speichen sieht man Felgenbett,
# Bremsscheibe und Sattel.
RIM_STYLES = {
    'six':      dict(n=6,  hub=0.036, rim=0.026, face=0.028),
    'five':     dict(n=5,  hub=0.044, rim=0.030, face=0.030),
    'split':    dict(n=5,  hub=0.016, rim=0.012, face=0.024, pair=(0.025, 0.11)),
    'mesh':     dict(n=10, hub=0.010, rim=0.008, face=0.016, cross=0.30),
    'multi':    dict(n=10, hub=0.016, rim=0.011, face=0.022),
    'eight':    dict(n=8,  hub=0.022, rim=0.016, face=0.024),
    'dish':     dict(n=6,  hub=0.030, rim=0.024, face=0.026),
    'steel':    dict(n=8,  hub=0.060, rim=0.070, face=0.012, steel=True),
    'fan':      dict(n=14, hub=0.018, rim=0.020, face=0.018, twist=0.55),
    'y5':       dict(n=5,  hub=0.040, rim=0.013, face=0.028, pair=(0.0, 0.10)),
    'disc':     dict(n=0,  hub=0.0,   rim=0.0,   face=0.02),
}

def _spoke(bm, base, off_hub, off_rim, hw_hub, hw_rim, r0, r1, x_face, x_back, concave, chamfer=0.78, steps=5, twist=0.0, mat=1):
    F, B = [], []
    for k in range(steps + 1):
        t = k / steps
        r = r0 + (r1 - r0) * t
        ac = base + off_hub + (off_rim - off_hub) * t + twist * t * t
        hw = hw_hub + (hw_rim - hw_hub) * t
        xf = x_face - concave * (1 - t) ** 1.4
        xb = min(x_back, xf - 0.012)
        row_f, row_b = [], []
        for sd in (-1, 1):
            af = ac + sd * hw * chamfer / r
            ab = ac + sd * hw / r
            row_f.append(bm.verts.new((xf, r * math.cos(af), r * math.sin(af))))
            row_b.append(bm.verts.new((xb, r * math.cos(ab), r * math.sin(ab))))
        F.append(row_f); B.append(row_b)
    faces = []
    for k in range(steps):
        faces.append(bm.faces.new((F[k][0], F[k][1], F[k + 1][1], F[k + 1][0])))
        faces.append(bm.faces.new((B[k][0], B[k + 1][0], B[k + 1][1], B[k][1])))
        faces.append(bm.faces.new((F[k][0], F[k + 1][0], B[k + 1][0], B[k][0])))
        faces.append(bm.faces.new((F[k][1], B[k][1], B[k + 1][1], F[k + 1][1])))
    faces.append(bm.faces.new((F[0][0], B[0][0], B[0][1], F[0][1])))
    faces.append(bm.faces.new((F[-1][0], F[-1][1], B[-1][1], B[-1][0])))
    for f in faces:
        f.material_index = mat; f.smooth = False
    return faces

def build_wheel(name, cfg, mats, side=1):
    """Rad mit Flanke nach +X (links); rechts wird um Z gedreht.
    Dreht um X — die Achse, die der glTF-Export unverändert lässt."""
    r, w, rim_r = cfg['r'], cfg['w'], cfg['rim_r']
    style = cfg.get('style', 'six')
    st = RIM_STYLES.get(style, RIM_STYLES['six'])
    bm = bmesh.new()
    # 0 tire, 1 rim, 2 rim_dark, 3 disc, 4 lip, 5 nut, 6 stripe
    prof = tire_profile(r, w, rim_r, cfg.get('grooves', 3), cfg.get('stretch', 0.0))
    mod = None
    if cfg.get('mud'):
        nprof = len(prof)
        def mod(k, i):
            if 4 <= i < nprof - 4:
                blk = ((k // 3) + (1 if i < nprof / 2 else 0)) % 2
                return 0.018 if blk else -0.004
            if i in (3, nprof - 4):
                return 0.012 if (k // 3) % 2 else 0.0
            return 0.0
    np_ = len(prof)
    bm_lathe(bm, prof, cfg.get('segs', 64), mat_of=(lambda i: 6 if cfg.get('stripe') and i in (1, np_ - 3) else 0), radial_mod=mod)
    a = w / 2
    dish = cfg.get('dish', 0.0)
    lip = max(cfg.get('lip', 0.012), 0.008)
    concave = cfg.get('concave', 0.02)
    x_lip = a * 0.90                       # Stirnfläche des Felgenhorns
    x_face = x_lip - 0.012 - dish          # Speichen-Außenkante am Rand
    # Felgenhorn + (polierte) Lippe + Stufe ins Bett; das Horn sitzt über dem Wulst
    horn = [(rim_r + 0.022, a * 0.86), (rim_r + 0.024, x_lip), (rim_r + 0.004, x_lip + 0.004),
            (rim_r - lip, x_lip + 0.002), (rim_r - lip - 0.004, x_lip - 0.006)]
    bm_lathe(bm, horn, 64, mat_of=lambda i: 4 if i >= 2 else 1)
    step = [(rim_r - lip - 0.004, x_lip - 0.006), (rim_r - lip - 0.006, x_face - 0.004), (rim_r - 0.012, x_face - 0.03)]
    bm_lathe(bm, step, 48, mat_of=lambda i: 1)
    # Felgenbett innen (dunkel, sichtbar zwischen den Speichen)
    bm_lathe(bm, [(rim_r - 0.012, x_face - 0.03), (rim_r - 0.016, -a * 0.75), (rim_r + 0.022, -a * 0.86)], 40, mat_of=lambda i: 2)
    hub_r = cfg.get('hub_r', 0.085)
    r0 = hub_r * 0.92
    r1 = rim_r - lip - 0.004
    x_back = x_face - st['face'] - 0.02
    n = st['n']
    if style == 'disc':
        bm_lathe(bm, [(r1 + 0.002, x_face), (r1 * 0.55, x_face + 0.004), (hub_r, x_face + 0.006), (0.001, x_face + 0.006)], 48, mat_of=lambda i: 1)
    elif st.get('steel'):
        # Stahlfelge: geschlossene Schüssel mit runden Fenstern
        bm_lathe(bm, [(r1 + 0.002, x_face), (r1 - 0.02, x_face - 0.012), (hub_r + 0.03, x_face - 0.03), (hub_r, x_face - 0.025)], 40, mat_of=lambda i: 1)
        for i in range(n):
            ang = 2 * math.pi * (i + 0.5) / n
            c, s_ = math.cos(ang) * (r0 + r1) / 2, math.sin(ang) * (r0 + r1) / 2
            bm_cyl(bm, (x_face - 0.022, c, s_), (x_face - 0.016, c, s_), 0.022, segs=12, mat=2)
    else:
        kw = dict(x_face=x_face, x_back=x_back, concave=concave, twist=st.get('twist', 0.0))
        for i in range(n):
            base = 2 * math.pi * i / n + math.pi / 2
            if style == 'y5':
                rm = r0 + (r1 - r0) * 0.45
                _spoke(bm, base, 0, 0, st['hub'], st['hub'] * 0.8, r0, rm + 0.01, **kw)
                for sd in (-1, 1):
                    _spoke(bm, base, 0, sd * st['pair'][1], st['rim'] * 1.5, st['rim'], rm - 0.01, r1, **kw)
            elif 'pair' in st:
                oh, orr = st['pair']
                for sd in (-1, 1):
                    _spoke(bm, base, sd * oh, sd * orr, st['hub'], st['rim'], r0, r1, **kw)
            elif 'cross' in st:
                for sd in (-1, 1):
                    _spoke(bm, base, 0, sd * st['cross'], st['hub'], st['rim'], r0, r1, **kw)
            else:
                _spoke(bm, base, 0, 0, st['hub'], st['rim'], r0, r1, **kw)
    # Nabe, Zentralkappe, Radmuttern
    hx = x_face - concave
    bm_cyl(bm, (x_back - 0.01, 0, 0), (hx + 0.004, 0, 0), hub_r, hub_r * 0.94, segs=28, mat=1)
    cap = cfg.get('cap_r', hub_r * 0.42)
    bm_cyl(bm, (hx, 0, 0), (hx + 0.016, 0, 0), cap, cap * 0.8, segs=20, mat=5)
    nn = cfg.get('nuts', 5)
    for i in range(nn):
        ang = 2 * math.pi * i / nn
        c, s_ = math.cos(ang) * hub_r * 0.68, math.sin(ang) * hub_r * 0.68
        bm_cyl(bm, (hx, c, s_), (hx + 0.018, c, s_), 0.0105, 0.009, segs=6, mat=5)
    # Bremsscheibe (dreht mit): Reibring hell, Glocke dunkel
    dr = rim_r - 0.035
    bm_cyl(bm, (-0.034, 0, 0), (-0.004, 0, 0), dr, segs=48, mat=3)
    bm_cyl(bm, (-0.004, 0, 0), (0.012, 0, 0), dr * 0.55, segs=32, mat=2)
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.material_index in (1, 5) and not f.smooth])
    if side < 0:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Z'))
    return mesh_obj(name, bm, [mats['tire'], mats['rim'], mats['rim_dark'], mats['disc'], mats['lip'], mats['nut'], mats['stripe']])


def build_caliper(name, cfg, mat, side=1):
    rim_r = cfg['rim_r']
    dr = rim_r - 0.04
    bm = bmesh.new()
    segs = 8
    a0, a1 = math.radians(95), math.radians(150)   # oben-hinten (Heck = +Y)
    xs = (0.012, 0.05)
    verts = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        c, s = math.cos(a), math.sin(a)
        ring = []
        for rad in (dr - 0.055, dr + 0.012):
            for x in xs:
                ring.append(bm.verts.new((x, rad * c, rad * s)))
        verts.append(ring)
    for i in range(segs):
        A, B = verts[i], verts[i + 1]
        for q in ((0, 1, 3, 2), (0, 2, 6, 4)):
            pass
        faces = [(A[0], A[1], B[1], B[0]), (A[2], B[2], B[3], A[3]), (A[0], B[0], B[2], A[2]), (A[1], A[3], B[3], B[1])]
        for q in faces:
            bm.faces.new(q)
    bm.faces.new((verts[0][0], verts[0][2], verts[0][3], verts[0][1]))
    bm.faces.new((verts[-1][0], verts[-1][1], verts[-1][3], verts[-1][2]))
    # innere Hälfte hinter der Scheibe
    for i in range(segs):
        pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if side < 0:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Z'))
        # nach Drehung liegt der Sattel vorn — zurück nach hinten spiegeln
        bmesh.ops.scale(bm, vec=(1, -1, 1), verts=bm.verts)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return mesh_obj(name, bm, [mat], smooth=False)

# --------------------------------------------------------------- Innenraum --
def gauge_texture(name, accent=0xff3040, n=2, style='analog'):
    H, W = 256, 256 * n
    img = np.zeros((H, W, 4), np.float32); img[..., 3] = 1
    img[..., :3] = 0.015
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ac = srgb_arr(accent)
    for d in range(n):
        cx, cy = 128 + 256 * d, 128
        dx, dy = xx - cx, yy - cy
        rad = np.hypot(dx, dy); ang = np.degrees(np.arctan2(dy, dx))
        ring = (rad > 108) & (rad < 113)
        img[ring, :3] = 0.55
        # Skalenstriche über 270°: von 225° (unten links) im Uhrzeigersinn bis −45°
        a = (225 - ang) % 360
        inarc = a <= 270
        tick = inarc & (rad > 88) & (rad < 104) & ((a % 27) < 2.2)
        small = inarc & (rad > 96) & (rad < 104) & ((a % 5.4) < 1.0)
        img[tick | small, :3] = 0.95
        red = inarc & (a > 215) & (rad > 90) & (rad < 106)
        if d == 0:
            img[red, :3] = ac[:3]
        # Zeiger
        na = math.radians(225 - 60 - 40 * d)
        t = (dx * math.cos(na) + dy * math.sin(na))
        nrm = np.abs(-dx * math.sin(na) + dy * math.cos(na))
        needle = (t > -10) & (t < 95) & (nrm < 2.5)
        img[needle, :3] = ac[:3]
        img[rad < 9, :3] = 0.25
    return image_from_array(name, img)

def bucket_seat(bm, x, y, zfloor, mat_seat, mat_accent, mat_frame, racing=True, scale=1.0):
    """Schalensitz. y = Hüftpunkt. Rücken lehnt nach hinten (+Y)."""
    s = scale
    zc = zfloor + 0.13 * s
    bm_box(bm, (x, y - 0.20 * s, zc), (0.48 * s, 0.50 * s, 0.10 * s), mat=mat_seat)
    for sx in (-1, 1):
        bm_box(bm, (x + sx * 0.22 * s, y - 0.20 * s, zc + 0.07 * s), (0.07 * s, 0.48 * s, 0.10 * s), mat=mat_accent)
    tilt = Matrix.Rotation(math.radians(-14), 3, 'X')
    back_c = Vector((x, y + 0.08 * s, zc + 0.36 * s))
    bm_box(bm, back_c, (0.50 * s, 0.10 * s, 0.70 * s), mat=mat_seat, rot=tilt)
    for sx in (-1, 1):
        bm_box(bm, back_c + tilt @ Vector((sx * 0.24 * s, -0.06 * s, -0.08 * s)), (0.08 * s, 0.16 * s, 0.46 * s), mat=mat_accent, rot=tilt)
    head = back_c + tilt @ Vector((0, 0, 0.44 * s))
    if racing:
        bm_box(bm, head, (0.34 * s, 0.10 * s, 0.22 * s), mat=mat_seat, rot=tilt)
        for sx in (-1, 1):
            bm_box(bm, head + tilt @ Vector((sx * 0.16 * s, -0.05 * s, 0)), (0.05 * s, 0.14 * s, 0.22 * s), mat=mat_accent, rot=tilt)
    else:
        bm_box(bm, head, (0.26 * s, 0.09 * s, 0.18 * s), mat=mat_seat, rot=tilt)
    bm_box(bm, (x, y - 0.15 * s, zfloor + 0.08 * s), (0.36 * s, 0.40 * s, 0.1 * s), mat=mat_frame)

def roll_cage(bm, spec, mat, zfloor, y_front, y_back, z_roof_at, half_w_at):
    """Käfig innerhalb der Kabine. z_roof_at(y) / half_w_at(y) liefern das
    lichte Maß an der Stelle y — die erste Fassung nahm eine feste Dachhöhe
    und Breite, und bei vier von fünf Autos stachen die Rohre durchs Dach."""
    r = 0.019
    zb, zf_ = z_roof_at(y_back), z_roof_at(y_front)
    xb, xf = half_w_at(y_back), half_w_at(y_front)
    xl = min(xb + 0.08, spec['W'] / 2 - 0.2)       # unten ist die Kabine breiter als oben
    hoop = [(xl, y_back, zfloor), (xb, y_back, zb - 0.05), (xb * 0.6, y_back, zb), (-xb * 0.6, y_back, zb),
            (-xb, y_back, zb - 0.05), (-xl, y_back, zfloor)]
    for a, b in zip(hoop, hoop[1:]):
        bm_cyl(bm, a, b, r, segs=8, mat=mat)
    for sx in (1, -1):
        bm_cyl(bm, (sx * xb, y_back, zb - 0.05), (sx * xf, y_front, zf_ - 0.03), r, segs=8, mat=mat)
        bm_cyl(bm, (sx * xf, y_front, zf_ - 0.03), (sx * xl, y_front - 0.30, zfloor + 0.30), r, segs=8, mat=mat)
        bm_cyl(bm, (sx * xl, y_back, zfloor + 0.45), (sx * xl, y_front - 0.2, zfloor + 0.38), r * 0.9, segs=8, mat=mat)
        bm_cyl(bm, (sx * xb, y_back, zb - 0.07), (sx * xb * 0.8, y_back + 0.75, zfloor + 0.15), r, segs=8, mat=mat)
    bm_cyl(bm, (xl, y_back, zfloor + 0.1), (-xb * 0.6, y_back, zb), r, segs=8, mat=mat)
    bm_cyl(bm, (xf, y_front, zf_ - 0.03), (-xf, y_front, zf_ - 0.03), r * 0.9, segs=8, mat=mat)


def steering_wheel(name, radius=0.185, style='round', mats=None, grip_mat=1):
    """Lenkrad in der lokalen XY-Ebene, Achse = lokal +Z (zeigt zum Fahrer).
    Nach dem glTF-Export ist diese Achse lokal +Y — dort dreht das Web."""
    bm = bmesh.new()
    if style == 'formula':
        bm_box(bm, (0, 0, 0), (0.27, 0.13, 0.04), mat=0)
        for sx in (-1, 1):
            bm_box(bm, (sx * 0.135, -0.005, 0.005), (0.05, 0.15, 0.05), mat=grip_mat)
        bm_box(bm, (0, 0.012, 0.022), (0.11, 0.06, 0.004), mat=2)
        for i in range(6):
            bm_cyl(bm, (-0.09 + 0.036 * i, -0.045, 0.02), (-0.09 + 0.036 * i, -0.045, 0.03), 0.008, segs=8, mat=3)
    else:
        segs, tsegs = 36, 8
        rt = 0.016
        rings = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            c = Vector((math.cos(a), math.sin(a), 0))
            ring = []
            for k in range(tsegs):
                b = 2 * math.pi * k / tsegs
                p = c * (radius + rt * math.cos(b)) + Vector((0, 0, rt * math.sin(b)))
                ring.append(bm.verts.new(p))
            rings.append(ring)
        for i in range(segs):
            i2 = (i + 1) % segs
            for k in range(tsegs):
                k2 = (k + 1) % tsegs
                f = bm.faces.new((rings[i][k], rings[i2][k], rings[i2][k2], rings[i][k2]))
                f.smooth = True
                f.material_index = grip_mat
        # Markierung 12 Uhr
        bm_box(bm, (0, radius, 0.0), (0.02, 0.03, 0.036), mat=3)
        for ang in (0, math.pi, -math.pi / 2):
            c = Vector((math.cos(ang), math.sin(ang), 0))
            bm_cyl(bm, c * 0.04 + Vector((0, 0, -0.01)), c * (radius - 0.005), 0.012, 0.009, segs=6, mat=0)
        bm_cyl(bm, (0, 0, -0.03), (0, 0, 0.02), 0.05, 0.045, segs=16, mat=0)
    bm_cyl(bm, (0, 0, -0.35), (0, 0, -0.03), 0.025, segs=10, mat=0)
    return mesh_obj(name, bm, mats, smooth=True)
