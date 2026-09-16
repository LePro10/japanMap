import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  ShaderMaterial,
} from 'three';

import { WAYPOINT } from '@/config/waypoint.config';
import { ROAD_MESH } from '@/config/roads.config';
import type { EngineContext } from '@/core/System';
import type { RoutePath } from './routeGraph';
import vertexShader from './guideLine.vert.glsl';
import fragmentShader from './guideLine.frag.glsl';

/**
 * Das Band auf der Fahrbahn. Ein Mesh, ein Draw-Call, Farbe im Shader.
 *
 * Geometrie nur beim Setzen der Route. Je Frame gehen Tempo, Bogenlänge und
 * Zeit als Uniforms rüber — Vertexfarben je Frame wären ein Upload für eine
 * Zahl, die der Shader selbst hat.
 */
export class GuideLine {
  #context: EngineContext | null = null;
  #mesh: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  #path: RoutePath | null = null;
  #arc = 0;
  #time = 0;
  #xz: Float32Array | null = null;

  attach(context: EngineContext): void {
    if (this.#mesh) return;
    this.#context = context;
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSpeed: { value: 0 },
        uArc: { value: 0 },
        uBrake: { value: 9 },
        uTime: { value: 0 },
        uRedExcess: { value: WAYPOINT.redExcess },
        uAmberExcess: { value: WAYPOINT.amberExcess },
        uNearFade: { value: WAYPOINT.lineNearFade },
        uNearSolid: { value: WAYPOINT.lineNearSolid },
        uBehind: { value: WAYPOINT.lineBehind },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    const mesh = new Mesh(new BufferGeometry(), material);
    mesh.name = 'GuideLine';
    mesh.frustumCulled = false;
    mesh.renderOrder = 40;
    mesh.visible = false;
    context.scene.add(mesh);
    this.#mesh = mesh;
  }

  get path(): RoutePath | null {
    return this.#path;
  }

  get arc(): number {
    return this.#arc;
  }

  get xz(): Float32Array | null {
    return this.#xz;
  }

  setPath(path: RoutePath | null): void {
    this.#path = path;
    this.#arc = 0;
    this.#xz = path ? pack(path) : null;
    const mesh = this.#mesh;
    if (!mesh) return;
    mesh.geometry.dispose();
    if (!path || path.points.length < 2) {
      mesh.geometry = new BufferGeometry();
      mesh.visible = false;
      return;
    }
    mesh.geometry = buildRibbon(path);
    mesh.visible = true;
  }

  setBrake(accel: number): void {
    const material = this.#mesh?.material;
    if (material) material.uniforms.uBrake!.value = accel;
  }

  update(speed: number, arc: number, dt: number): void {
    this.#arc = arc;
    this.#time += dt;
    const material = this.#mesh?.material;
    if (!material) return;
    material.uniforms.uSpeed!.value = speed;
    material.uniforms.uArc!.value = arc;
    material.uniforms.uTime!.value = this.#time;
  }

  clear(): void {
    this.setPath(null);
  }

  dispose(): void {
    const mesh = this.#mesh;
    if (mesh) {
      this.#context?.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.#mesh = null;
    this.#path = null;
    this.#xz = null;
    this.#context = null;
  }
}

function pack(path: RoutePath): Float32Array {
  const out = new Float32Array(path.points.length * 2);
  for (let i = 0; i < path.points.length; i++) {
    out[i * 2] = path.points[i]!.x;
    out[i * 2 + 1] = path.points[i]!.z;
  }
  return out;
}

function buildRibbon(path: RoutePath): BufferGeometry {
  const pts = path.points;
  const n = pts.length;
  const lift = ROAD_MESH.surfaceOffset + WAYPOINT.lineLift;
  const half = WAYPOINT.lineWidth * 0.5;
  const apex = WAYPOINT.apexOffset;

  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const arcs = new Float32Array(n * 2);
  const limits = new Float32Array(n * 2);
  const indices = new Uint32Array((n - 1) * 6);

  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const prev = pts[i === 0 ? 0 : i - 1]!;
    const next = pts[i === n - 1 ? n - 1 : i + 1]!;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const rx = tz;
    const rz = -tx;
    // Innenversatz: positive Krümmung (links) schiebt nach links.
    const k = signedK(prev, p, next);
    const inset = Math.max(-apex, Math.min(apex, -Math.sign(k) * Math.min(apex, Math.abs(k) * 55)));
    const cx = p.x + rx * inset;
    const cz = p.z + rz * inset;
    const y = p.y + lift;

    const a = i * 2;
    const b = a + 1;
    positions[a * 3] = cx - rx * half;
    positions[a * 3 + 1] = y;
    positions[a * 3 + 2] = cz - rz * half;
    positions[b * 3] = cx + rx * half;
    positions[b * 3 + 1] = y;
    positions[b * 3 + 2] = cz + rz * half;
    uvs[a * 2] = 0;
    uvs[a * 2 + 1] = p.arc * 0.12;
    uvs[b * 2] = 1;
    uvs[b * 2 + 1] = p.arc * 0.12;
    arcs[a] = p.arc;
    arcs[b] = p.arc;
    const limit = p.limit > 0.5 ? p.limit : 40;
    limits[a] = limit;
    limits[b] = limit;
  }

  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    const o = i * 6;
    indices[o] = a;
    indices[o + 1] = a + 1;
    indices[o + 2] = a + 2;
    indices[o + 3] = a + 1;
    indices[o + 4] = a + 3;
    indices[o + 5] = a + 2;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('aArc', new BufferAttribute(arcs, 1));
  geometry.setAttribute('aLimit', new BufferAttribute(limits, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function signedK(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
): number {
  const d1x = b.x - a.x;
  const d1z = b.z - a.z;
  const d2x = c.x - b.x;
  const d2z = c.z - b.z;
  const l1 = Math.hypot(d1x, d1z);
  const l2 = Math.hypot(d2x, d2z);
  if (l1 < 1e-3 || l2 < 1e-3) return 0;
  const cross = d1x * d2z - d1z * d2x;
  // Wie RaceLine.#turnSign: negativer Cross = links = positiv.
  return -cross / (l1 * l2 * ((l1 + l2) * 0.5));
}
