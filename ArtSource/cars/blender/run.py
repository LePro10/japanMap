# In Blender ausführen: IDS = ['suprema']; exec(open(r'...\run.py').read())
import sys, importlib, traceback, io, time
_p = r"C:\Users\Leandro\Documents\projects\projects\japanMap\car-lab\blender"
if _p not in sys.path:
    sys.path.insert(0, _p)
_out = io.StringIO()
try:
    import carkit, livery, tuning, build, formula, cars
    for _m in (carkit, livery, tuning, build, formula, cars):
        importlib.reload(_m)
    for _id in IDS:
        _t = time.time()
        _spec = dict(cars.BY_ID[_id])
        _root = build.assemble(_spec)
        _out.write('%s ok %.1fs tris=%d\n' % (_id, time.time() - _t, build.tri_count(_root)))
except Exception:
    _out.write(traceback.format_exc())
print(_out.getvalue())
