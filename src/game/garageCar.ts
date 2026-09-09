import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { PropMaterial } from '@/world/materials/PropMaterial';
import { createCarBody, createCarWheel } from './carMesh';
import type { VehicleSpec } from '@/config/vehicles.config';
import type { CarTune, TuneCategory } from '@/config/tuning.config';

/**
 * Presentation car for Open Bay.
 *
 * The driving mesh is one merged body — there is no hood bone. The bay car
 * keeps that body and punches a hole with a discard shader when the hood
 * opens, then shows a separate hood panel and an engine bay sitting in the
 * discarded box. Same vertex-colour language as the world cars.
 */
const color = new Color();

function paint(g: BufferGeometry, hex: number): BufferGeometry {
  color.setHex(hex, 'srgb');
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number): BufferGeometry {
  return paint(new BoxGeometry(w, h, d), hex).translate(x, y, z);
}

export function hoodBox(spec: VehicleSpec): { min: Vector3; max: Vector3 } {
  const cg = spec.chassis.cgHeight;
  const halfL = spec.body.hullLength / 2;
  const halfW = spec.body.hullWidth / 2 + 0.04;
  const belt =
    spec.body.shape === 'suv' ? 1.16
    : spec.body.shape === 'truck' ? 0.96
    : spec.body.shape === 'hatch' ? 0.86
    : spec.body.shape === 'rally' ? 0.88
    : spec.body.shape === 'supercar' ? 0.65
    : 0.78;
  return {
    min: new Vector3(-halfW, belt - cg - 0.06, halfL * 0.06),
    max: new Vector3(halfW, spec.body.roofHeight - cg + 0.12, halfL + 0.06),
  };
}

class BayBodyMaterial extends PropMaterial {
  readonly hoodOpen: IUniform<number> = { value: 0 };
  readonly hoodMin: IUniform<Vector3>;
  readonly hoodMax: IUniform<Vector3>;

  constructor(atmosphere: AtmosphereUniforms, box: { min: Vector3; max: Vector3 }) {
    super(atmosphere);
    this.hoodMin = { value: box.min };
    this.hoodMax = { value: box.max };
    this.roughness = 0.38;
    this.metalness = 0.18;
    this.name = 'BayBody';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    super.onBeforeCompile(shader);
    shader.uniforms.uHoodOpen = this.hoodOpen;
    shader.uniforms.uHoodMin = this.hoodMin;
    shader.uniforms.uHoodMax = this.hoodMax;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBayLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBayLocal = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vBayLocal;\nuniform float uHoodOpen;\nuniform vec3 uHoodMin;\nuniform vec3 uHoodMax;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n' +
          'if (uHoodOpen > 0.42 && vBayLocal.x >= uHoodMin.x && vBayLocal.x <= uHoodMax.x' +
          ' && vBayLocal.y >= uHoodMin.y && vBayLocal.y <= uHoodMax.y' +
          ' && vBayLocal.z >= uHoodMin.z && vBayLocal.z <= uHoodMax.z) discard;',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:bay-body';
  }
}

function createHoodPanel(spec: VehicleSpec): BufferGeometry {
  const w = spec.body.hullWidth * 0.9;
  const len = spec.body.hullLength * 0.38;
  const belt =
    spec.body.shape === 'suv' ? 1.16
    : spec.body.shape === 'truck' ? 0.96
    : spec.body.shape === 'hatch' ? 0.86
    : spec.body.shape === 'rally' ? 0.88
    : spec.body.shape === 'supercar' ? 0.65
    : 0.78;
  const y = belt - spec.chassis.cgHeight + 0.045;
  const z = spec.body.hullLength * 0.28;
  return box(w, 0.045, len, 0, y, z, spec.body.paint);
}

function createEngineBay(spec: VehicleSpec): BufferGeometry {
  const cover = spec.body.paint === 0xe3b0df ? 0xc44536 : 0xb42318;
  const block = 0x2a3036;
  const steel = 0x8a93a0;
  const belt =
    spec.body.shape === 'suv' ? 1.16
    : spec.body.shape === 'truck' ? 0.96
    : spec.body.shape === 'hatch' ? 0.86
    : spec.body.shape === 'rally' ? 0.88
    : spec.body.shape === 'supercar' ? 0.65
    : 0.78;
  const y = belt - spec.chassis.cgHeight - 0.18;
  const z = spec.body.hullLength * 0.28;
  const parts = [
    box(0.62, 0.28, 0.72, 0, y, z, block),
    box(0.5, 0.08, 0.58, 0, y + 0.18, z, cover),
    box(0.18, 0.16, 0.22, 0.28, y + 0.06, z + 0.22, steel),
    box(0.12, 0.1, 0.34, -0.22, y + 0.12, z - 0.04, 0x1a1e22),
    box(0.08, 0.22, 0.08, 0.18, y + 0.22, z - 0.18, steel),
    box(0.08, 0.22, 0.08, -0.18, y + 0.22, z - 0.18, steel),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error(`Engine bay: ${spec.id}`);
  return merged;
}

function tunedLabel(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#140306';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#ff3b4e';
  ctx.shadowColor = '#ff2440';
  ctx.shadowBlur = 18;
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TUNED', 256, 68);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export type BayShot = 'hero' | 'engine' | 'wheels' | 'front' | 'rear';

export class GarageCar {
  readonly group = new Group();
  readonly #body: Mesh;
  readonly #hood: Group;
  readonly #engine: Mesh;
  readonly #wheels: Mesh[] = [];
  readonly #discs: Mesh[] = [];
  readonly #badge: Mesh;
  readonly #bodyMat: BayBodyMaterial | PropMaterial;
  readonly #solidMat: PropMaterial;
  readonly #wheelMat: PropMaterial;
  readonly #geoms: BufferGeometry[] = [];
  readonly #hasHood: boolean;
  #hoodOpen = 0;
  #spin = 0;

  constructor(spec: VehicleSpec, atmosphere: AtmosphereUniforms) {
    this.group.name = 'BayCar';
    this.#hasHood = spec.body.shape !== 'openwheel';
    const box = hoodBox(spec);
    const bodyMat = this.#hasHood
      ? new BayBodyMaterial(atmosphere, box)
      : (() => {
          const m = new PropMaterial(atmosphere);
          m.roughness = 0.38;
          m.metalness = 0.18;
          return m;
        })();
    this.#bodyMat = bodyMat;
    const bodyGeom = createCarBody(spec);
    this.#geoms.push(bodyGeom);
    this.#body = new Mesh(bodyGeom, bodyMat);
    this.#body.name = 'BayBody';
    this.group.add(this.#body);

    const solid = new PropMaterial(atmosphere);
    solid.roughness = 0.38;
    solid.metalness = 0.18;
    this.#solidMat = solid;

    this.#hood = new Group();
    this.#hood.name = 'BayHood';
    const cowlZ = spec.body.hullLength * 0.08;
    const cowlY = (spec.body.shape === 'supercar' ? 0.65 : 0.78) - spec.chassis.cgHeight;
    this.#hood.position.set(0, cowlY, cowlZ);
    const hoodGeom = createHoodPanel(spec);
    this.#geoms.push(hoodGeom);
    const hoodMesh = new Mesh(hoodGeom, solid);
    hoodMesh.position.set(0, -cowlY, -cowlZ);
    solid.polygonOffset = true;
    solid.polygonOffsetFactor = -1;
    solid.polygonOffsetUnits = -2;
    this.#hood.add(hoodMesh);
    this.#hood.visible = false;
    this.group.add(this.#hood);

    const engineGeom = createEngineBay(spec);
    this.#geoms.push(engineGeom);
    this.#engine = new Mesh(engineGeom, solid);
    this.#engine.visible = false;
    this.group.add(this.#engine);

    const wheelMat = new PropMaterial(atmosphere);
    wheelMat.roughness = 0.5;
    wheelMat.metalness = 0.35;
    this.#wheelMat = wheelMat;
    const wheelGeom = createCarWheel(spec);
    this.#geoms.push(wheelGeom);
    const halfTrack = spec.chassis.track / 2;
    const positions: Array<[number, number, number]> = [
      [-halfTrack, -spec.chassis.cgHeight + spec.chassis.wheelRadius, spec.derived.cgToFront],
      [halfTrack, -spec.chassis.cgHeight + spec.chassis.wheelRadius, spec.derived.cgToFront],
      [-halfTrack, -spec.chassis.cgHeight + spec.chassis.wheelRadius, -spec.derived.cgToRear],
      [halfTrack, -spec.chassis.cgHeight + spec.chassis.wheelRadius, -spec.derived.cgToRear],
    ];
    const discMat = new MeshStandardMaterial({
      color: 0x1a1c1e,
      emissive: 0x000000,
      roughness: 0.45,
      metalness: 0.7,
    });
    for (const [x, y, z] of positions) {
      const wheel = new Mesh(wheelGeom, wheelMat);
      wheel.position.set(x, y, z);
      this.#wheels.push(wheel);
      this.group.add(wheel);
      const disc = new Mesh(
        new CylinderGeometry(spec.chassis.wheelRadius * 0.42, spec.chassis.wheelRadius * 0.42, 0.04, 18),
        discMat,
      );
      disc.rotation.z = Math.PI / 2;
      disc.position.set(x, y, z);
      this.#discs.push(disc);
      this.group.add(disc);
    }

    const badgeTex = tunedLabel();
    const badgeMat = new MeshStandardMaterial({
      map: badgeTex,
      color: 0xffffff,
      emissive: 0xff2a40,
      emissiveIntensity: 1.35,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
    });
    this.#badge = new Mesh(new BoxGeometry(0.9, 0.16, 0.04), badgeMat);
    this.#badge.position.set(0, -spec.chassis.cgHeight + 0.28, spec.body.hullLength / 2 + 0.04);
    this.#badge.visible = false;
    this.group.add(this.#badge);
  }

  setHood(open01: number): void {
    const t = Math.max(0, Math.min(1, open01));
    this.#hoodOpen = t;
    if (this.#bodyMat instanceof BayBodyMaterial) this.#bodyMat.hoodOpen.value = t;
    const show = this.#hasHood && t > 0.02;
    this.#hood.visible = show;
    this.#engine.visible = t > 0.35;
    this.#hood.rotation.x = -t * 1.05;
  }

  setTuneVisual(tune: CarTune, focus: TuneCategory | 'setup' | null): void {
    this.#badge.visible = tune.engine + tune.brakes + tune.steering + tune.tyres > 0;
    const brakeGlow = focus === 'brakes' ? 0.55 + 0.35 * tune.brakes : 0.08 * tune.brakes;
    for (const disc of this.#discs) {
      const mat = disc.material as MeshStandardMaterial;
      mat.emissive.setRGB(brakeGlow, brakeGlow * 0.08, 0.02);
      mat.emissiveIntensity = focus === 'brakes' ? 2.2 : 0.6;
    }
    this.#wheelMat.metalness = 0.35 + 0.2 * tune.tyres;
    this.#engine.visible = this.#hoodOpen > 0.35 || focus === 'engine';
    if (focus === 'engine' && this.#hoodOpen < 0.35) this.#engine.visible = true;
  }

  update(dt: number, focus: TuneCategory | 'setup' | null): void {
    if (focus !== 'tyres' && focus !== 'brakes' && focus !== 'engine') return;
    this.#spin += dt * (focus === 'engine' ? 8 : 2.4);
    if (focus === 'tyres' || focus === 'brakes') {
      for (const wheel of this.#wheels) wheel.rotation.x = this.#spin;
    }
    if (focus === 'engine') {
      this.#engine.position.y = Math.sin(this.#spin * 2) * 0.004;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.#geoms) g.dispose();
    this.#bodyMat.dispose();
    this.#solidMat.dispose();
    this.#wheelMat.dispose();
    for (const disc of this.#discs) (disc.material as MeshStandardMaterial).dispose();
    const badgeMat = this.#badge.material as MeshStandardMaterial;
    badgeMat.map?.dispose();
    badgeMat.dispose();
    this.#discs[0]?.geometry.dispose();
    this.#badge.geometry.dispose();
  }
}
