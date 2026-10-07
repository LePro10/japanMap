"""
Lackierungen im UV-Raum der Karosserie.

u = s (0 Heck … 1 Front), v = Umfangsposition (0 Boden links, 0.5 Dachmitte,
1 Boden rechts). Gezeichnet wird in **Metern** (x entlang der Länge, y entlang
des Umfangs) — die Textur ist anisotrop (4,4 m auf 2048 px gegen ~4 m auf
1024 px), und ein Kreis in Pixeln wäre auf dem Blech eine Ellipse.

Gezeichnet wird nur die linke Hälfte (v < 0.5); `finish()` spiegelt. Beide
Seiten tragen damit dieselbe Grafik — gespiegelt, deshalb keine Schrift.
"""
import math
import numpy as np
from carkit import srgb_arr, image_from_array

class Livery:
    def __init__(self, spec, base, W=2048, H=1024):
        self.spec = spec
        self.W, self.H = W, H
        self.L = spec['L']; self.P = spec['_perim']; self.vh = spec['_vhalf']
        self.img = np.empty((H, W, 4), np.float32)
        self.img[:] = srgb_arr(base)
        self.xm = ((np.arange(W) + 0.5) / W) * self.L            # Meter entlang
        self.ym = ((np.arange(H) + 0.5) / H) * self.P            # Meter Umfang

    # --- Koordinaten
    def vj(self, j):
        """v (links) für einen — auch gebrochenen — Ringindex."""
        j0 = int(math.floor(j)); j1 = min(j0 + 1, 11); t = j - j0
        return self.vh[j0] * (1 - t) + self.vh[j1] * t

    def ym_of_j(self, j):
        return self.vj(j) * self.P

    def region(self, s0, s1, j0, j1):
        c0 = max(int(s0 * self.W), 0); c1 = min(int(math.ceil(s1 * self.W)), self.W)
        r0 = max(int(self.vj(j0) * self.H), 0); r1 = min(int(math.ceil(self.vj(j1) * self.H)), self.H // 2)
        return r0, r1, c0, c1

    def paint(self, mask, r0, c0, col, alpha=1.0):
        c = srgb_arr(col) if isinstance(col, int) else np.asarray(col, np.float32)
        sub = self.img[r0:r0 + mask.shape[0], c0:c0 + mask.shape[1]]
        a = mask.astype(np.float32)[..., None] * alpha
        sub[:] = sub * (1 - a) + c * a

    def grid(self, s0, s1, j0, j1):
        r0, r1, c0, c1 = self.region(s0, s1, j0, j1)
        X, Y = np.meshgrid(self.xm[c0:c1], self.ym[r0:r1])
        return X, Y, r0, c0

    # --- Grundformen
    def band(self, j0, j1, col, s0=0.0, s1=1.0):
        X, Y, r0, c0 = self.grid(s0, s1, j0, j1)
        self.paint(np.ones_like(X, bool), r0, c0, col)

    def stripe_top(self, off, width, col, s0=0.0, s1=1.0):
        """Streifen parallel zur Mittellinie; off/width in Metern vom Dachfirst."""
        yc = 0.5 * self.P
        X, Y, r0, c0 = self.grid(s0, s1, 7, 11)
        d = yc - Y
        self.paint((d >= off) & (d <= off + width), r0, c0, col)

    def seam(self, s, j0, j1, col=0x0a0a0a, w=0.004, lean=0.0):
        """Fuge quer zur Längsrichtung (Tür, Haube). lean kippt sie (m/m)."""
        X, Y, r0, c0 = self.grid(max(s - 0.08, 0), min(s + 0.08, 1), j0, j1)
        y0 = self.ym_of_j(j0)
        xc = s * self.L + lean * (Y - y0)
        self.paint(np.abs(X - xc) < w, r0, c0, col, 0.85)

    def seam_long(self, j, s0, s1, col=0x0a0a0a, w=0.004):
        X, Y, r0, c0 = self.grid(s0, s1, max(j - 0.3, 0), min(j + 0.3, 11))
        self.paint(np.abs(Y - self.ym_of_j(j)) < w, r0, c0, col, 0.85)

    def shape(self, fn, col, s0, s1, j0, j1, alpha=1.0):
        X, Y, r0, c0 = self.grid(s0, s1, j0, j1)
        m = fn(X, Y)
        self.paint(m, r0, c0, col, alpha)

    def circle(self, s, j, rad, col, ring=0.0):
        xc, yc = s * self.L, self.ym_of_j(j)
        def fn(X, Y):
            d = np.hypot(X - xc, Y - yc)
            return (d < rad) & (d >= ring) if ring else d < rad
        self.shape(fn, col, s - rad / self.L * 1.2, s + rad / self.L * 1.2, 0, 11)

    def sakura(self, s, j, R, col, center=0xffe0ec, rot=0.0):
        xc, yc = s * self.L, self.ym_of_j(j)
        def fn(X, Y):
            dx, dy = X - xc, Y - yc
            r = np.hypot(dx, dy); th = np.arctan2(dy, dx) + rot
            c = np.abs(np.cos(2.5 * th))
            edge = R * (0.38 + 0.62 * c ** 0.55)
            edge = np.where(c > 0.985, edge * 0.82, edge)
            return r < edge
        self.shape(fn, col, s - 1.3 * R / self.L, s + 1.3 * R / self.L, 0, 11)
        def fc(X, Y):
            return np.hypot(X - xc, Y - yc) < R * 0.22
        self.shape(fc, center, s - R / self.L, s + R / self.L, 0, 11)

    def stroke(self, pts, width, col, outline=None, ow=0.02):
        """Polylinie in (s, j)-Koordinaten, Breite in Metern."""
        P = [(s * self.L, self.ym_of_j(j)) for s, j in pts]
        ss = [p[0] for p in pts]; js = [p[1] for p in pts]
        pad = (width + ow) / self.L * 1.5
        for w_, c_ in (((width + ow), outline), (width, col)):
            if c_ is None:
                continue
            X, Y, r0, c0 = self.grid(max(min(ss) - pad, 0), min(max(ss) + pad, 1), max(min(js) - 1.5, 0), min(max(js) + 1.5, 11))
            m = np.zeros_like(X, bool)
            for (x0, y0), (x1, y1) in zip(P, P[1:]):
                dx, dy = x1 - x0, y1 - y0
                t = np.clip(((X - x0) * dx + (Y - y0) * dy) / max(dx * dx + dy * dy, 1e-9), 0, 1)
                d = np.hypot(X - x0 - t * dx, Y - y0 - t * dy)
                m |= d < w_ / 2
            self.paint(m, r0, c0, c_)

    def speckle(self, j0, j1, col, density=0.02, seed=1, s0=0, s1=1, alpha=0.6):
        rng = np.random.default_rng(seed)
        X, Y, r0, c0 = self.grid(s0, s1, j0, j1)
        m = rng.random(X.shape) < density
        # nach unten dichter — Schmutz sitzt am Schweller
        yrel = (Y - Y.min()) / max(Y.max() - Y.min(), 1e-6)
        m &= rng.random(X.shape) > yrel
        self.paint(m, r0, c0, col, alpha)

    def grime(self, j0, j1, col, strength=0.6, seed=2):
        rng = np.random.default_rng(seed)
        X, Y, r0, c0 = self.grid(0, 1, j0, j1)
        yrel = 1 - (Y - Y.min()) / max(Y.max() - Y.min(), 1e-6)
        n = rng.random((X.shape[0] // 8 + 1, X.shape[1] // 8 + 1))
        n = np.kron(n, np.ones((8, 8)))[:X.shape[0], :X.shape[1]]
        a = np.clip(yrel ** 1.8 * strength * (0.6 + 0.8 * n), 0, 1)
        c = srgb_arr(col)
        sub = self.img[r0:r0 + X.shape[0], c0:c0 + X.shape[1]]
        sub[:] = sub * (1 - a[..., None]) + c * a[..., None]

    def finish(self, name):
        h = self.H // 2
        self.img[h:] = self.img[:h][::-1]
        return image_from_array(name, self.img)

def plate_texture(name, text='86-86', yellow=False, green=False):
    """Japanisches Kennzeichen, Ziffern als Siebensegment — ohne Schriftbibliothek."""
    H, W = 128, 256
    bg = 0xf2d23a if yellow else (0x1f6b3a if green else 0xf4f4f0)
    fg = 0x1a1a1a if yellow else (0xf4f4f0 if green else 0x1f5a34)
    img = np.empty((H, W, 4), np.float32); img[:] = srgb_arr(bg)
    img[:4] = img[-4:] = srgb_arr(fg); img[:, :4] = img[:, -4:] = srgb_arr(fg)
    SEG = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc',
           '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': ''}
    fgc = srgb_arr(fg)
    def seg(x, y, w, h, t):
        return {'a': (x, y + h - t, w, t), 'b': (x + w - t, y + h / 2, t, h / 2), 'c': (x + w - t, y, t, h / 2),
                'd': (x, y, w, t), 'e': (x, y, t, h / 2), 'f': (x, y + h / 2, t, h / 2), 'g': (x, y + h / 2 - t / 2, w, t)}
    cw, ch, gap = 34, 62, 12
    total = len(text) * (cw + gap) - gap
    x = (W - total) // 2
    for chr_ in text:
        for sname in SEG.get(chr_, ''):
            sx, sy, sw, sh = seg(x, 16, cw, ch, 8)[sname]
            img[int(sy):int(sy + sh), int(sx):int(sx + sw)] = fgc
        x += cw + gap
    # kleine Oberzeile (Ort/Klasse) als Balken
    img[92:104, 70:120] = fgc; img[92:104, 136:186] = fgc
    return image_from_array(name, img)

def honeycomb_texture(name, fg=0x2a2a2a, bg=0x040404, n=24):
    H = W = 256
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) / H * n
    # Sechseckraster über zwei versetzte Gitter
    a = np.abs(((xx) % 1) - 0.5); b = np.abs(((yy + np.floor(xx) * 0.5) % 1) - 0.5)
    m = (a > 0.40) | (b > 0.42)
    img = np.empty((H, W, 4), np.float32); img[:] = srgb_arr(bg); img[m] = srgb_arr(fg)
    return image_from_array(name, img)

def carbon_texture(name):
    H = W = 256
    yy, xx = np.mgrid[0:H, 0:W]
    k = 16
    tw = ((xx // k) + (yy // k)) % 2
    g = np.where(tw == 0, (np.sin(xx / k * math.pi) ** 2), (np.sin(yy / k * math.pi) ** 2)) * 0.10 + 0.03
    img = np.ones((H, W, 4), np.float32); img[..., 0] = g; img[..., 1] = g; img[..., 2] = g * 1.1
    return image_from_array(name, img)
