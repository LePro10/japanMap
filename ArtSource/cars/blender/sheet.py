"""Kontaktbogen: mehrere PNGs zu einem Raster — spart beim Durchsehen neun Einzelbilder."""
import bpy, os
import numpy as np

def sheet(paths, out, cols=3, tile=(640, 360)):
    tw, th = tile
    rows = (len(paths) + cols - 1) // cols
    canvas = np.zeros((rows * th, cols * tw, 4), np.float32); canvas[..., 3] = 1
    for i, p in enumerate(paths):
        img = bpy.data.images.load(p, check_existing=False)
        w, h = img.size
        a = np.array(img.pixels[:], np.float32).reshape(h, w, 4)
        ys = (np.arange(th) * h / th).astype(int); xs = (np.arange(tw) * w / tw).astype(int)
        a = a[ys][:, xs]
        r, c = i // cols, i % cols
        canvas[(rows - 1 - r) * th:(rows - r) * th, c * tw:(c + 1) * tw] = a
        bpy.data.images.remove(img)
    im = bpy.data.images.new('sheet', cols * tw, rows * th)
    im.pixels.foreach_set(canvas.ravel())
    im.filepath_raw = out; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)
    return out
