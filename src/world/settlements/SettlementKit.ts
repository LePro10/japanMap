import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Ein Vertexfarben-Batch je Ort: Details kosten Dreiecke, nicht einzelne Draw-Calls. */
export class SettlementKit {
  readonly parts: BufferGeometry[] = [];
  add(g: BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    if (g.index) { const old = g; g = g.toNonIndexed(); old.dispose(); }
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
    const c = new Color(color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.deleteAttribute('uv'); this.parts.push(g);
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, rx = 0, ry = 0, rz = 0): void {
    this.add(new BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }
  cylinder(x: number, y: number, z: number, r: number, h: number, color: number, rx = 0, rz = 0, top = r): void {
    this.add(new CylinderGeometry(top, r, h, 10), color, x, y, z, rx, 0, rz);
  }
  ball(x: number, y: number, z: number, r: number, color: number): void {
    this.add(new SphereGeometry(r, 7, 5), color, x, y, z);
  }
  gable(x: number, y: number, z: number, w: number, h: number, d: number, color: number): void {
    const g = new BufferGeometry();
    const a = [-w / 2, 0, -d / 2], b = [w / 2, 0, -d / 2], c = [0, h, -d / 2];
    const f = [-w / 2, 0, d / 2], e = [w / 2, 0, d / 2], t = [0, h, d / 2];
    g.setAttribute('position', new Float32BufferAttribute([...a, ...c, ...b, ...f, ...e, ...t, ...a, ...f, ...t, ...a, ...t, ...c, ...b, ...c, ...t, ...b, ...t, ...e, ...a, ...b, ...e, ...a, ...e, ...f], 3));
    g.computeVertexNormals(); this.add(g, color, x, y, z);
  }
  geometry(): BufferGeometry {
    const merged = mergeGeometries(this.parts, false)!;
    this.parts.forEach(g => g.dispose()); this.parts.length = 0;
    merged.computeBoundingSphere(); return merged;
  }
  finish(group: Group, material: MeshStandardMaterial, name: string): Mesh {
    const mesh = new Mesh(this.geometry(), material); mesh.name = name;
    mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
}
