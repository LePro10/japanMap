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
import { damp } from './waypointScreen';
import vertexShader from './guideLine.vert.glsl';
import fragmentShader from './guideLine.frag.glsl';

/**
 * Das Band auf der Fahrbahn. Ein Mesh, ein Draw-Call, Farbe im Shader.
 *
 * Geometrie nur beim Setzen der Route. Je Frame gehen Tempo, Bogenlänge,
 * Opacity und Reveal als Uniforms rüber. Das Sichtfenster schneidet
 * `drawRange` — ein 5-km-Band, von dem 720 m vor dem Wagen liegen, darf
 * den Rest nicht rastern.
 */
export class GuideLine {
  #context: EngineContext | null = null;
  #mesh: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  #path: RoutePath | null = null;
  #arc = 0;
  #time = 0;
  #xz: Float32Array | null = null;
  #arcs: Float32Array | null = null;
  #opacity = 0;
  #opacityGoal = 0;
  #reveal = 0;
  #speedSmooth = 0;
  #arcSmooth = 0;
  #winLo = 0;

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
        uOpacity: { value: 0 },
        uReveal: { value: 0 },
        uRevealHead: { value: WAYPOINT.revealHead },
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
    this.#arcSmooth = 0;
    this.#winLo = 0;
    this.#xz = path ? pack(path) : this.#xz;
    const mesh = this.#mesh;
    if (!mesh) return;
    if (!path || path.points.length < 2) {
      this.#opacityGoal = 0;
      return;
    }
    mesh.geometry.dispose();
    const built = buildRibbon(path);
    mesh.geometry = built.geometry;
    this.#arcs = built.arcs;
    this.#reveal = 16;
    this.#opacityGoal = 1;
    mesh.visible = true;
    this.#xz = pack(path);
    const material = mesh.material;
    material.uniforms.uReveal!.value = this.#reveal;
    material.uniforms.uOpacity!.value = this.#opacity;
    material.uniforms.uArc!.value = 0;
    this.#applyWindow(0, this.#reveal);
  }

  setBrake(accel: number): void {
    const material = this.#mesh?.material;
    if (material) material.uniforms.uBrake!.value = accel;
  }

  update(speed: number, arc: number, dt: number): void {
    this.#arc = arc;
    this.#time += dt;
    const mesh = this.#mesh;
    const material = mesh?.material;
    if (!material || !mesh) return;

    const appear = this.#opacityGoal > this.#opacity;
    const lambda = appear ? WAYPOINT.fadeIn : WAYPOINT.fadeOut;
    this.#opacity = damp(this.#opacity, this.#opacityGoal, lambda, dt);
    if (Math.abs(arc - this.#arcSmooth) > 48) this.#arcSmooth = arc;
    else this.#arcSmooth = damp(this.#arcSmooth, arc, WAYPOINT.arcSmooth, dt);
    this.#speedSmooth = damp(this.#speedSmooth, speed, WAYPOINT.speedSmooth, dt);
    if (this.#opacityGoal > 0) {
      this.#reveal = Math.min(WAYPOINT.revealMax, this.#reveal + dt * WAYPOINT.revealSpeed);
    }

    material.uniforms.uSpeed!.value = this.#speedSmooth;
    material.uniforms.uArc!.value = this.#arcSmooth;
    material.uniforms.uTime!.value = this.#time;
    material.uniforms.uOpacity!.value = this.#opacity;
    material.uniforms.uReveal!.value = this.#reveal;

    this.#applyWindow(this.#arcSmooth, this.#reveal);

    if (this.#opacityGoal <= 0 && this.#opacity < 0.012) {
      mesh.visible = false;
      this.#xz = null;
      this.#arcs = null;
      if (mesh.geometry.attributes.position) {
        mesh.geometry.dispose();
        mesh.geometry = new BufferGeometry();
      }
    } else if (this.#opacity > 0.012) {
      mesh.visible = true;
    }
  }

  clear(): void {
    this.#path = null;
    this.#opacityGoal = 0;
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
    this.#arcs = null;
    this.#context = null;
  }

  #applyWindow(arc: number, reveal: number): void {
    const arcs = this.#arcs;
    const geometry = this.#mesh?.geometry;
    if (!arcs || !geometry || arcs.length < 2) return;
    const n = arcs.length;
    const loBound = arc - WAYPOINT.lineBehind - 14;
    const hiBound = arc + reveal + 8;
    let lo = this.#winLo;
    if (lo < 0 || lo >= n) lo = 0;
    while (lo > 0 && arcs[lo]! > loBound) lo--;
    while (lo < n - 2 && arcs[lo + 1]! < loBound) lo++;
    let hi = lo;
    while (hi < n - 1 && arcs[hi]! < hiBound) hi++;
    this.#winLo = lo;
    const from = lo;
    const to = Math.max(from + 1, hi);
    geometry.setDrawRange(from * 6, Math.max(6, (to - from) * 6));
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

function buildRibbon(path: RoutePath): { geometry: BufferGeometry; arcs: Float32Array } {
  const pts = path.points;
  const n = pts.length;
  const lift = ROAD_MESH.surfaceOffset + WAYPOINT.lineLift;
  const half = WAYPOINT.lineWidth * 0.5;
  const apex = WAYPOINT.apexOffset;

  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const arcsAttr = new Float32Array(n * 2);
  const limits = new Float32Array(n * 2);
  const indices = new Uint32Array((n - 1) * 6);
  const arcs = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    arcs[i] = p.arc;
    const prev = pts[i === 0 ? 0 : i - 1]!;
    const next = pts[i === n - 1 ? n - 1 : i + 1]!;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const rx = tz;
    const rz = -tx;
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
    arcsAttr[a] = p.arc;
    arcsAttr[b] = p.arc;
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
  geometry.setAttribute('aArc', new BufferAttribute(arcsAttr, 1));
  geometry.setAttribute('aLimit', new BufferAttribute(limits, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return { geometry, arcs };
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
  return -cross / (l1 * l2 * ((l1 + l2) * 0.5));
}
