"""Sign skin for the dense Tokyo centre (atlas TokyoSigns).

Signs go into their own mesh (SM_<building>_Signs_LOD<n>), so Phase 5 can
switch the density per street and the building stays in its budget. All
parts work in the wall frame F of tokyo_kit (u along the wall, z up, d out)
and show how they hold: stand-offs, arms, braces, lattice, feet.
"""
import math
from mathutils import Vector
from kit import core as K, atlas as A
from buildings.tokyo_kit import F, lbox, orient

ATLAS = 'TokyoSigns'


def R(name):
    return A.region(ATLAS, name)


def m(bm, faces, name, **kw):
    K.map_faces(bm, [f for f in faces if f is not None], R(name), **kw)


def nb(bm, faces):
    K.nobevel(bm, [f for f in faces if f is not None])


def tube(bm, pts, r, n=4, reg='GALV'):
    s, _, _ = K.tube_path(bm, pts, r, n)
    m(bm, s, reg); nb(bm, s)
    return s


def yoko(bm, f, u0, u1, z0, h, reg, lod, depth=0.2, out=0.08, frame='FRAME_BLACK'):
    """Flat lightbox on the facade (one per tenant floor), on stand-offs."""
    b = lbox(bm, f, u0, u1, z0, z0 + h, out, out + depth, skip=('in',))
    m(bm, [b['out']], reg); m(bm, [b[k] for k in ('top', 'bot', 'l', 'r')], frame)
    nb(bm, b.values())
    if lod:
        return
    for u in (u0 + 0.3, u1 - 0.3):
        for z in (z0 + 0.15, z0 + h - 0.15):
            tube(bm, [f(u, z, 0.0), f(u, z, out + 0.01)], 0.02)


def yoko_out(bm, f, u, z0, reg, lod, w=2.2, thick=0.2, out=0.25, frame='FRAME_BLACK'):
    """Horizontal lightbox standing out from the facade (read from the street),
    graphic on both faces, hung from two arms."""
    h = w / 4
    b = lbox(bm, f, u - thick / 2, u + thick / 2, z0, z0 + h, out, out + w, skip=('in',))
    m(bm, [b['l'], b['r']], reg); m(bm, [b['out'], b['top'], b['bot']], frame); nb(bm, b.values())
    arm = lbox(bm, f, u - 0.03, u + 0.03, z0 + h, z0 + h + 0.06, 0.0, out + w - 0.1, skip=('in',))
    m(bm, arm.values(), 'GALV'); nb(bm, arm.values())
    if not lod:
        for d in (out + 0.2, out + w - 0.2):
            tube(bm, [f(u, z0 + h + 0.06, d), f(u, z0 + h, d)], 0.008, 3, 'FRAME_BLACK')
        tube(bm, [f(u, z0 + h - 0.6, 0.01), f(u, z0 + h + 0.03, out + w * 0.6)], 0.014)


def tower(bm, f, u, z0, regs, lod, w=0.9, thick=0.3, out=0.35, bulbs=False, edge='NEON_WHITE'):
    """Vertical sign tower (tate-kanban): stacked lightboxes, graphic on both
    faces, lit front edge, arms with braces every ~1.5 m."""
    seg = w * 5
    z = z0
    for reg in regs:
        b = lbox(bm, f, u - thick / 2, u + thick / 2, z, z + seg, out, out + w, skip=('in',) + (('bot',) if z > z0 else ()))
        m(bm, [b['l'], b['r']], reg); m(bm, [b['out']], edge if bulbs else 'FRAME_BLACK')
        m(bm, [b[k] for k in ('top', 'bot') if k in b], 'FRAME_BLACK'); nb(bm, b.values())
        z += seg
    top = z
    cap = lbox(bm, f, u - thick / 2 - 0.03, u + thick / 2 + 0.03, top, top + 0.1, out - 0.03, out + w + 0.04)
    m(bm, cap.values(), 'FRAME_BLACK'); nb(bm, cap.values())
    if lod:
        a = lbox(bm, f, u - 0.04, u + 0.04, z0 + 0.3, top - 0.3, 0.0, out, skip=('in',))
        m(bm, a.values(), 'GALV')
        return
    n = max(2, int((top - z0) / 1.5))
    for i in range(n + 1):
        zz = z0 + 0.25 + (top - z0 - 0.5) * i / n
        a = lbox(bm, f, u - 0.035, u + 0.035, zz - 0.035, zz + 0.035, 0.0, out + 0.12, skip=('in',))
        m(bm, a.values(), 'GALV'); nb(bm, a.values())
        if i % 2 == 0:
            tube(bm, [f(u, zz - 0.5, 0.01), f(u, zz - 0.04, out)], 0.013)
    if bulbs:   # chaser bulbs along the front edge on both faces
        for side in (-1, 1):
            uu = u + side * (thick / 2 + 0.01)
            k = int((top - z0) / 0.25)
            for i in range(k):
                zz = z0 + 0.12 + i * 0.25
                bb = lbox(bm, f, uu - 0.012, uu + 0.012, zz, zz + 0.05, out + w - 0.07, out + w - 0.02)
                m(bm, bb.values(), 'BULB_WARM'); nb(bm, bb.values())


def stand(bm, f, u, d, reg, lod):
    """Standing sidewalk lightbox (oki-kanban) on four feet, set across the
    facade so people walking along the street read it from both sides."""
    z0 = 0.08
    b = lbox(bm, f, u - 0.13, u + 0.13, z0, z0 + 0.88, d, d + 0.44)
    m(bm, [b['l'], b['r']], reg)
    m(bm, [b[k] for k in ('out', 'in', 'top', 'bot')], 'FRAME_WHITE'); nb(bm, b.values())
    if not lod:
        for du in (-0.1, 0.1):
            for dd in (d + 0.04, d + 0.4):
                tube(bm, [f(u + du, 0.0, dd), f(u + du, z0, dd)], 0.015, 3, 'FRAME_BLACK')


def screen(bm, f, u0, u1, z0, z1, reg, lod, out=0.15, depth=0.4):
    """LED video wall: screen box on the facade, proud frame bars, service
    walkway with a rail under it."""
    b = lbox(bm, f, u0, u1, z0, z1, out, out + depth, skip=('in',))
    m(bm, [b['out']], reg); m(bm, [b[k] for k in ('top', 'bot', 'l', 'r')], 'FRAME_BLACK'); nb(bm, b.values())
    e = out + depth
    bars = [lbox(bm, f, u0 - 0.06, u1 + 0.06, z1, z1 + 0.08, e - 0.1, e + 0.04),
            lbox(bm, f, u0 - 0.06, u1 + 0.06, z0 - 0.08, z0, e - 0.1, e + 0.04),
            lbox(bm, f, u0 - 0.06, u0, z0, z1, e - 0.1, e + 0.04),
            lbox(bm, f, u1, u1 + 0.06, z0, z1, e - 0.1, e + 0.04)]
    for x in bars:
        m(bm, x.values(), 'FRAME_BLACK'); nb(bm, x.values())
    if not lod:
        w = lbox(bm, f, u0, u1, z0 - 0.4, z0 - 0.32, 0.0, e + 0.5, skip=('in',))
        m(bm, w.values(), 'GALV'); nb(bm, w.values())
        for u in (u0 + 0.1, (u0 + u1) / 2, u1 - 0.1):
            tube(bm, [f(u, z0 - 0.32, e + 0.45), f(u, z0 + 0.7, e + 0.45)], 0.012, 3)
        tube(bm, [f(u0, z0 + 0.7, e + 0.45), f(u1, z0 + 0.7, e + 0.45)], 0.012, 3)
        for u in (u0 + 0.4, u1 - 0.4):   # brackets back to the wall
            tube(bm, [f(u, z0 - 0.36, 0.0), f(u, z0 - 0.36, e + 0.45)], 0.03, 4)


def billboard(bm, x, y, z, w, h, reg, lod, lift=2.0, depth=1.6):
    """Rooftop billboard facing -Y on a galvanised lattice tower: posts,
    rails and cross braces behind the face, lamps on arms."""
    f = F((0, 0, 0), (0, -1, 0))
    zb = z + lift
    face = lbox(bm, f, x - w / 2, x + w / 2, zb, zb + h, -y - 0.1, -y + 0.1)
    m(bm, [face['out']], reg); m(bm, [k for kk, k in face.items() if kk != 'out'], 'FRAME_WHITE'); nb(bm, face.values())
    nx = max(2, round(w / 2.0))
    xs = [x - w / 2 + 0.15 + (w - 0.3) * i / nx for i in range(nx + 1)]
    yb = y + depth                                   # back row of posts
    for xx in xs:
        for yy, top in ((y + 0.15, zb + h - 0.05), (yb, zb + h * 0.7)):
            p = lbox(bm, F((0, 0, 0), (0, -1, 0)), xx - 0.05, xx + 0.05, z, top, -yy - 0.05, -yy + 0.05, skip=('bot',))
            m(bm, p.values(), 'GALV'); nb(bm, p.values())
        if not lod:
            tube(bm, [(xx, y + 0.15, z + 0.2), (xx, yb, zb + h * 0.6)], 0.03, 4)
            tube(bm, [(xx, yb, z + 0.2), (xx, y + 0.15, zb + h * 0.5)], 0.03, 4)
    if lod:
        return
    for zz in (z + lift * 0.5, zb + 0.1, zb + h * 0.6):
        for yy in (y + 0.15, yb):
            tube(bm, [(xs[0], yy, zz), (xs[-1], yy, zz)], 0.03, 4)
    for i in range(len(xs) - 1):      # cross braces in the front plane
        tube(bm, [(xs[i], y + 0.2, z + 0.3), (xs[i + 1], y + 0.2, zb - 0.1)], 0.025, 4)
    for xx in xs[::2]:
        tube(bm, [(xx, y - 0.05, zb + h), (xx, y - 0.9, zb + h + 0.25)], 0.015, 3)
        lt = lbox(bm, f, xx - 0.12, xx + 0.12, zb + h + 0.15, zb + h + 0.3, -y + 0.75, -y + 1.0)
        m(bm, [lt['bot']], 'NEON_WHITE'); m(bm, [k for kk, k in lt.items() if kk != 'bot'], 'SIGN_BACK'); nb(bm, lt.values())


STROKES = {   # neon strokes in a unit box (u, z)
    'su': [[(0.15, 0.85), (0.8, 0.85), (0.55, 0.5), (0.12, 0.08)], [(0.5, 0.42), (0.88, 0.08)]],
    'na': [[(0.08, 0.66), (0.92, 0.66)], [(0.56, 0.95), (0.56, 0.45), (0.45, 0.2), (0.22, 0.04)]],
    'tsu': [[(0.22, 0.52), (0.3, 0.38)], [(0.45, 0.56), (0.52, 0.42)], [(0.8, 0.58), (0.66, 0.28), (0.4, 0.08)]],
    'ku': [[(0.42, 0.95), (0.14, 0.58)], [(0.33, 0.8), (0.86, 0.8), (0.7, 0.4), (0.32, 0.04)]],
    'ra': [[(0.2, 0.88), (0.8, 0.88)], [(0.12, 0.62), (0.86, 0.62), (0.7, 0.25), (0.32, 0.03)]],
    '-': [[(0.08, 0.5), (0.92, 0.5)]],
    'me': [[(0.78, 0.92), (0.58, 0.45), (0.18, 0.04)], [(0.25, 0.66), (0.82, 0.12)]],
    'n': [[(0.18, 0.8), (0.36, 0.64)], [(0.12, 0.12), (0.5, 0.3), (0.88, 0.78)]],
    'B': [[(0.2, 0.05), (0.2, 0.95), (0.62, 0.95), (0.78, 0.82), (0.62, 0.52), (0.2, 0.52)],
          [(0.62, 0.52), (0.82, 0.36), (0.66, 0.05), (0.2, 0.05)]],
    'A': [[(0.1, 0.05), (0.5, 0.95), (0.9, 0.05)], [(0.28, 0.42), (0.72, 0.42)]],
    'R': [[(0.2, 0.05), (0.2, 0.95), (0.65, 0.95), (0.8, 0.78), (0.65, 0.55), (0.2, 0.55)], [(0.5, 0.55), (0.85, 0.05)]],
}
WORDS = {'snack': ['su', 'na', 'tsu', 'ku'], 'ramen': ['ra', '-', 'me', 'n'], 'bar': ['B', 'A', 'R']}


def neon(bm, f, u0, z0, word, lod, colour='NEON_PINK', border='NEON_CYAN', ch=0.5, board=True):
    """Neon word in glass tubes: on a black board with stand-offs, or clipped
    straight to the wall (board=False) - both common."""
    keys = WORDS[word]
    cw = ch * 0.85
    w = cw * len(keys) + 0.3
    h = ch + 0.24
    dz = 0.165 if board else 0.06
    if board:
        bd = lbox(bm, f, u0, u0 + w, z0, z0 + h, 0.1, 0.14)
        m(bm, bd.values(), 'FRAME_BLACK'); nb(bm, bd.values())
    n = 4 if not lod else 3
    if border and not lod:
        bx = [(0.06, 0.06), (w - 0.06, 0.06), (w - 0.06, h - 0.06), (0.06, h - 0.06), (0.06, 0.06)]
        tube(bm, [f(u0 + a, z0 + b, dz) for a, b in bx], 0.013, n, border)
    for i, k in enumerate(keys):
        for stroke in STROKES[k]:
            pts = [f(u0 + 0.15 + cw * (i + 0.08 + 0.84 * a), z0 + 0.12 + ch * b, dz) for a, b in stroke]
            tube(bm, pts, 0.016, n, colour)
            if not board and not lod:   # clips holding the tube off the wall
                p = pts[0]
                tube(bm, [p - f.n * (dz - 0.005), p], 0.006, 3, 'FRAME_BLACK')
    if board and not lod:
        for a in (0.15, w - 0.15):
            for b in (0.12, h - 0.12):
                tube(bm, [f(u0 + a, z0 + b, 0.0), f(u0 + a, z0 + b, 0.1)], 0.012, 4)
        tb = lbox(bm, f, u0 + w + 0.06, u0 + w + 0.3, z0 + h - 0.32, z0 + h, 0.0, 0.12, skip=('in',))
        m(bm, tb.values(), 'SIGN_BACK'); nb(bm, tb.values())
    return w


def lantern_string(bm, f, u0, u1, z, d, lod, n=6):
    """Row of small red lanterns on a cable under an eave (izakaya alley)."""
    if lod:
        return
    pts = K.catenary(f(u0, z, d), f(u1, z, d), 0.12, 8)
    tube(bm, pts, 0.006, 3, 'FRAME_BLACK')
    for i in range(n):
        t = (i + 0.5) / n
        p = K.catenary(f(u0, z, d), f(u1, z, d), 0.12, 100)[int(t * 100)]
        lt = K.lathe(bm, 6, [(0.0, p.z - 0.36), (0.09, p.z - 0.32), (0.11, p.z - 0.2), (0.09, p.z - 0.08),
                             (0.0, p.z - 0.04)], cx=p.x, cy=p.y)
        m(bm, lt['sides'], 'LANTERN_RED'); nb(bm, lt['sides'])
        tube(bm, [p, Vector((p.x, p.y, p.z - 0.05))], 0.004, 3, 'FRAME_BLACK')
