"""Build, export and preview assets in the running Blender.

    import sys; sys.path.insert(0, '<repo>/ArtSource')
    import build; build.run(['stone_lantern'])          # or build.run() for all

Each asset module: KLASS, NAME, build() -> (collection, [LOD meshes]),
optional PREVIEW_VIEWS / preview(col) for a custom shot."""
import importlib, sys, time, traceback

ASSETS = {
    'stone_lantern': 'props.stone_lantern',
    'vending_machine': 'props.vending_machine',
    'kura_bay': 'buildings.kura_bay',
}

# 3/4 front in the mood light, 3/4 front neutral, 3/4 back neutral
VIEWS = [('mood', (-0.9, -1.6, 0.55), True),
         ('front', (1.0, -1.7, 0.6), False),
         ('back', (-1.2, 1.5, 0.7), False)]


def _reload():
    import kit, kit.atlas, kit.core, kit.preview
    for m in (kit.atlas, kit.core, kit.preview):
        importlib.reload(m)


def run(names=None, preview=True, export=True):
    _reload()
    from kit import core as K, preview as P
    out = []
    for key in names or list(ASSETS):
        t = time.time()
        try:
            mod = importlib.reload(importlib.import_module(ASSETS[key]))
            results = mod.build()
            if isinstance(results, tuple):
                results = [results]
            for col, lods in results:
                tris = [K.tri_count(o) for o in lods]
                line = f'{col.name}: tris ' + ' / '.join(f'LOD{i} {n}' for i, n in enumerate(tris))
                if export:
                    path, size = K.export_fbx(col, mod.KLASS, f'SM_{col.name}')
                    line += f' · fbx {size // 1024} KB'
                out.append(line)
            if preview:
                if hasattr(mod, 'preview'):
                    p = mod.preview(results, VIEWS)
                else:
                    col, lods = results[0]
                    p = P.render(lods[:1], mod.NAME, getattr(mod, 'PREVIEW_VIEWS', VIEWS), show=[col.name])
                out.append(f'  preview {p}')
            out.append(f'  {key} {time.time() - t:.1f}s')
        except Exception:
            out.append(f'{key}: FAILED\n' + traceback.format_exc())
    print('\n'.join(out))
    return out
