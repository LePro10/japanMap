"""Assets of the page's loading screen (Assets/WebGLTemplates/JapanMap), small enough for the start download.

  python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools brotli
  /tmp/fontvenv/bin/python ArtSource/web/loader_assets.py

- TemplateData/display.woff2: Archivo Condensed Black Italic cut to the characters the loader shows (name, stages,
  percent) — the same face as the game's titles (D55), a few KB instead of the whole font.
- Prints SVG path data for the Japanese words (雨上がり, 雨) from Dela Gothic One: the 2.5 MB CJK font never ships to
  the page, the paths are pasted into index.html (a 1000 × 1000 em box per glyph, y down).
"""
import os
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONTS = os.path.join(ROOT, 'Assets', '_Project', 'Art', 'Fonts')
OUT = os.path.join(ROOT, 'Assets', 'WebGLTemplates', 'JapanMap', 'TemplateData')
# Upper case only: the loader writes every display line in capitals (the tip line uses the system face).
CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 %.,·—-–!?\'’'


def woff2():
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern']
    opts.name_IDs = [1, 2]
    opts.notdef_outline = False
    opts.hinting = False
    font = subset.load_font(os.path.join(FONTS, 'ArchivoCondensed-BlackItalic.ttf'), opts)
    s = subset.Subsetter(opts)
    s.populate(text=CHARS)
    s.subset(font)
    path = os.path.join(OUT, 'display.woff2')
    subset.save_font(font, path, opts)
    print(f'display.woff2 {os.path.getsize(path)} bytes')


def paths(text):
    font = TTFont(os.path.join(FONTS, 'DelaGothicOne-Regular.ttf'))
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    upm = font['head'].unitsPerEm
    asc = 880  # CJK em box: 880 above the baseline, 120 below → each glyph fills 0…1000
    for ch in text:
        pen = SVGPathPen(glyphs, lambda v: f'{v:.0f}')
        # Font units, y up → 1000 per em, y down from the ascender (SVG).
        k = 1000 / upm
        glyphs[cmap[ord(ch)]].draw(TransformPen(pen, (k, 0, 0, -k, 0, asc * k)))
        print(f'{ch} {pen.getCommands()}')


if __name__ == '__main__':
    woff2()
    paths('雨上がり')
