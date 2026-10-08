"""Build, export and preview assets in the running Blender.

    import sys; sys.path.insert(0, '<repo>/ArtSource')
    import build; build.run(['stone_lantern'])          # or build.run() for all

Each asset module: KLASS, NAME, build() -> (collection, [LOD meshes]),
optional PREVIEW_VIEWS / preview(col) for a custom shot."""
import importlib, json, os, sys, time, traceback

ASSETS = {
    'stone_lantern': 'props.stone_lantern',
    'vending_machine': 'props.vending_machine',
    'kura': 'buildings.kura',
    'utility_pole': 'props.utility_pole',
    'power_line': 'props.power_line',
    'street_light': 'props.street_light',
    'guardrail': 'props.guardrail',
    'road_sign': 'props.road_sign',
    'traffic_light': 'props.traffic_light',
    'fence': 'props.fence',
    'torii': 'props.torii',
    'bench': 'props.bench',
    'bus_stop': 'props.bus_stop',
    'bicycle': 'props.bicycle',
    'planter': 'props.planter',
    'rocks': 'props.rocks',
}

# 3/4 front in the mood light, 3/4 front neutral, 3/4 back neutral (same as
# the first previews, so before/after stay comparable) + clay (grey only)
VIEWS = [('mood', (-0.9, -1.6, 0.55), True),
         ('front', (1.0, -1.7, 0.6), False),
         ('back', (-1.2, 1.5, 0.7), False)]
CLAY = [('clay', (1.0, -1.7, 0.6), 'clay'), ('clay back', (-1.2, 1.5, 0.7), 'clay')]


def _reload():
    import kit, kit.atlas, kit.core, kit.preview, kit.organic
    for m in (kit.atlas, kit.core, kit.preview, kit.organic):
        importlib.reload(m)


MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports', 'manifest.json')


def _manifest_entry(col, klass, path, tris):
    """What the Unity importer needs to know about one FBX (no guessing from names)."""
    objs = list(col.all_objects)
    mats = sorted({m.name for o in objs if o.type == 'MESH' for m in o.data.materials if m})
    return {
        'fbx': os.path.relpath(path, os.path.dirname(MANIFEST)),
        'class': klass,
        'lods': [f'{o.name}' for o in sorted(objs, key=lambda o: o.name) if o.name.startswith('SM_')],
        'tris': tris,
        'materials': mats,
        'colliders': sorted(o.name for o in objs if o.name.startswith('COL_')),
        'lights': [{'name': o.name, 'pos': [round(c, 3) for c in o.location],
                    'color': list(o.get('color', [])), 'range': o.get('unity_range')}
                   for o in objs if o.name.startswith('LIGHT_')],
        'switchable': sorted(o.name for o in objs if o.name.startswith('LENS_')),
        'attach': [{'name': o.name, 'pos': [round(c, 3) for c in o.location]}
                   for o in objs if o.name.startswith('CABLE_')],
    }


def _write_manifest(entries):
    data = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as f:
            data = json.load(f)
    data.update(entries)
    # a renamed or dropped asset leaves its old entry behind: keep only FBX that exist
    base = os.path.dirname(MANIFEST)
    gone = [k for k, v in data.items() if not os.path.exists(os.path.join(base, v['fbx']))]
    for k in gone:
        del data[k]
    if gone:
        print('manifest: dropped stale entries', gone)
    with open(MANIFEST, 'w') as f:
        json.dump(dict(sorted(data.items())), f, indent=1, ensure_ascii=False)


def run(names=None, preview=True, export=True):
    _reload()
    from kit import core as K, preview as P
    out = []
    manifest = {}
    for key in names or list(ASSETS):
        t = time.time()
        try:
            mod = importlib.reload(importlib.import_module(ASSETS[key]))
            K.STRETCH.clear()
            results = mod.build()
            if K.STRETCH:  # a strip used on a surface taller than the strip
                out.append(f'  WARN stretched strips: {sorted(set(K.STRETCH))}')
            if isinstance(results, tuple):
                results = [results]
            for col, lods in results:
                tris = [K.tri_count(o) for o in lods]
                line = f'{col.name}: tris ' + ' / '.join(f'LOD{i} {n}' for i, n in enumerate(tris))
                if export:
                    path, size = K.export_fbx(col, mod.KLASS, f'SM_{col.name}')
                    line += f' · fbx {size // 1024} KB'
                    manifest[col.name] = _manifest_entry(col, mod.KLASS, path, tris)
                out.append(line)
            if preview:
                if hasattr(mod, 'preview'):
                    p = mod.preview(results, VIEWS + CLAY)
                else:
                    col, lods = results[0]
                    p = P.render(lods[:1], mod.NAME, VIEWS, show=[col.name])
                    p += ', ' + P.render(lods[:1], mod.NAME + '_clay', CLAY, show=[col.name])
                out.append(f'  preview {p}')
            out.append(f'  {key} {time.time() - t:.1f}s')
        except Exception:
            out.append(f'{key}: FAILED\n' + traceback.format_exc())
    if manifest:
        _write_manifest(manifest)
    print('\n'.join(out))
    return out
