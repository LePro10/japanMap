// Tyre orientation for the car-lab GLBs (D52). The generator's tyre lathe (ArtSource/cars/blender/carkit.py,
// build_wheel) ran its profile from the inner to the outer flank, which winds every face towards the axle: with
// back-face culling you saw the inside of the tyre through the tread ("I see the tyre from the inside"). Fixed in
// the generator; this pass repairs already exported models and is a no-op on correct ones.
// Wheel meshes spin about their local X (README.legacy.md): the tread must face away from X, the flanks away
// from the wheel's centre plane.

const isTire = (p) => /_tire$/.test(p.getMaterial()?.getName() ?? '');

/** Share of tread/flank triangles whose winding faces outward (0..1), and how many were judged. */
export function tireOutwardShare(prim) {
  const P = prim.getAttribute('POSITION'), I = prim.getIndices();
  const n = P.getCount(), v = [0, 0, 0];
  let rMax = 0, xMax = 0, xMid = 0;
  for (let i = 0; i < n; i++) { P.getElement(i, v); rMax = Math.max(rMax, Math.hypot(v[1], v[2])); xMid += v[0] / n; }
  for (let i = 0; i < n; i++) { P.getElement(i, v); xMax = Math.max(xMax, Math.abs(v[0] - xMid)); }
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  let out = 0, judged = 0;
  for (let t = 0; t < I.getCount(); t += 3) {
    P.getElement(I.getScalar(t), a); P.getElement(I.getScalar(t + 1), b); P.getElement(I.getScalar(t + 2), c);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const m = [(a[0] + b[0] + c[0]) / 3 - xMid, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const r = Math.hypot(m[1], m[2]);
    let d;
    if (r > rMax * 0.93) d = f[1] * m[1] + f[2] * m[2];          // tread: away from the axle
    else if (Math.abs(m[0]) > xMax * 0.8) d = f[0] * m[0];       // flank: away from the centre plane
    else continue;
    judged++;
    if (d > 0) out++;
  }
  return { share: judged ? out / judged : 1, judged };
}

/** Reverses the winding (and normals) of every inside-out tyre primitive. Returns the number fixed. */
export function orientTires(doc) {
  const seen = new Set();
  let fixed = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      if (!isTire(p) || seen.has(p.getIndices())) continue;
      seen.add(p.getIndices());
      if (tireOutwardShare(p).share >= 0.5) continue;
      const I = p.getIndices();
      for (let t = 0; t < I.getCount(); t += 3) {
        const i1 = I.getScalar(t + 1);
        I.setScalar(t + 1, I.getScalar(t + 2));
        I.setScalar(t + 2, i1);
      }
      for (const sem of ['NORMAL', 'TANGENT']) {
        const A = p.getAttribute(sem);
        if (!A || seen.has(A)) continue;
        seen.add(A);
        const e = [];
        for (let i = 0; i < A.getCount(); i++) {
          A.getElement(i, e);
          e[0] = -e[0]; e[1] = -e[1]; e[2] = -e[2];
          A.setElement(i, e);
        }
      }
      fixed++;
    }
  }
  return fixed;
}

/** Worst tyre outward share of a model (for the report). */
export function worstTire(doc) {
  let worst = 1;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) if (isTire(p)) worst = Math.min(worst, tireOutwardShare(p).share);
  return worst;
}
