"""Organic shapes for rocks and shrubs (also for vegetation, task 4).
Icosphere subdivisions count the plain icosahedron as 1: 2 = 80, 3 = 320 tris.

Everything is an icosphere pushed by smooth noise, so LOD0 and LOD1 built
from the same seed share one silhouette (only the subdivision differs)."""
import math, random
import bmesh
from mathutils import Vector, noise


def lump(bm, center, size, seed, subdiv=3, amp=0.2, freq=1.4, detail=0.06, cuts=0, floor=None, flat_top=None):
    """Noise-displaced ellipsoid. size = full extents (x, y, z).
    cuts: number of random planar breaks (rocks split along planes);
    floor: z below which vertices are clamped (sits flat on soil);
    flat_top: fraction of the half-height above which the top is planed off
    (clipped hedge, stepping stone). Returns the new faces."""
    rng = random.Random(seed)
    off = Vector((rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    verts = res['verts']
    faces = list({f for v in verts for f in v.link_faces})
    half = Vector(size) / 2
    planes = []
    for _ in range(cuts):   # mostly side and upper planes; a rock rarely splits underneath
        n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.2, 1.0))).normalized()
        planes.append((n, rng.uniform(0.62, 0.85)))
    for v in verts:
        d = v.co.normalized()
        r = 1 + amp * noise.noise(d * freq + off) + detail * noise.noise(d * freq * 3.1 + off * 1.7)
        p = d * r
        for n, k in planes:
            e = p.dot(n) - k
            if e > 0:
                p -= n * e
        if flat_top is not None and p.z > flat_top:
            p.z = flat_top + (p.z - flat_top) * 0.15
        v.co = Vector((center[0] + p.x * half.x, center[1] + p.y * half.y, center[2] + p.z * half.z))
        if floor is not None and v.co.z < floor:
            v.co.z = floor
    for f in faces:
        f.normal_update()
    return faces


def shrub(bm, center, size, seed, subdiv=3, lumps=3, floor=None):
    """A clump of foliage: one main lump and a few smaller ones around it."""
    rng = random.Random(seed)
    sx, sy, sz = size
    out = lump(bm, (center[0], center[1], center[2] + sz * 0.45), (sx * 0.85, sy * 0.85, sz * 0.9), seed,
               subdiv, amp=0.18, freq=2.2, detail=0.08, floor=floor)
    for i in range(lumps - 1):
        a = rng.uniform(0, 2 * math.pi)
        c = (center[0] + math.cos(a) * sx * 0.25, center[1] + math.sin(a) * sy * 0.25,
             center[2] + sz * rng.uniform(0.35, 0.55))
        k = rng.uniform(0.45, 0.65)
        out += lump(bm, c, (sx * k, sy * k, sz * k), seed * 31 + i, max(1, subdiv - 1), amp=0.2, freq=2.5,
                    detail=0.08, floor=floor)
    return out
