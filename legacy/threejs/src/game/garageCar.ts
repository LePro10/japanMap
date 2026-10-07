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
import { createCarBody } from './carMesh';
import type { VehicleSpec } from '@/config/vehicles.config';
import type { CarTune, SetupId, TuneCategory, TuneTier } from '@/config/tuning.config';
import { EngineBay, beltHeight, engineLook } from './garageEngine';
import { createGarageWheel } from './garageWheels';
import { hoodBox } from './garageLayout';

export { hoodBox } from './garageLayout';

/**
 * Presentation car for Open Bay.
 *
 * The driving mesh is one merged body — there is no hood bone. The bay car
 * keeps that body and punches a hole with a discard shader when the hood
 * opens, then shows a separate hood panel and an engine bay sitting in the
 * discarded box. Same vertex-colour language as the world cars.
 *
 * The hole is the bonnet skin only (`hoodBox` in garageLayout). A painted
 * tub fills the bay so the workshop floor is not visible through the car.
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
    // Inject after PropMaterial's `vPropWorld` — a second `#include <common>`
    // replace can miss once the parent has already rewritten that include.
    shader.vertexShader = shader.vertexShader
      .replace('varying vec3 vPropWorld;', 'varying vec3 vPropWorld;\nvarying vec3 vBayLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBayLocal = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'varying vec3 vPropWorld;',
        'varying vec3 vPropWorld;\nvarying vec3 vBayLocal;\nuniform float uHoodOpen;\nuniform vec3 uHoodMin;\nuniform vec3 uHoodMax;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n' +
          'if (uHoodOpen > 0.35 && vBayLocal.x >= uHoodMin.x && vBayLocal.x <= uHoodMax.x' +
          ' && vBayLocal.y >= uHoodMin.y && vBayLocal.y <= uHoodMax.y' +
          ' && vBayLocal.z >= uHoodMin.z && vBayLocal.z <= uHoodMax.z) discard;',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:bay-body-2';
  }
}

function createHoodPanel(spec: VehicleSpec): BufferGeometry {
  const w = spec.body.hullWidth * 0.78;
  const len = spec.body.hullLength * (engineLook(spec.id).rear ? 0.26 : 0.3);
  const belt = beltHeight(spec);
  const y = belt - spec.chassis.cgHeight + 0.04;
  const z = engineLook(spec.id).rear ? -spec.body.hullLength * 0.22 : spec.body.hullLength * 0.26;
  const parts = [
    box(w, 0.025, len, 0, y, z, spec.body.trim),
    box(w * 0.72, 0.016, len * 0.7, 0, y - 0.022, z, 0x2a2420),
    box(w * 0.04, 0.028, len * 0.62, -w * 0.28, y - 0.024, z, spec.body.trim),
    box(w * 0.04, 0.028, len * 0.62, w * 0.28, y - 0.024, z, spec.body.trim),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error(`Hood: ${spec.id}`);
  return merged;
}

function createBayTub(spec: VehicleSpec): BufferGeometry {
  const rear = engineLook(spec.id).rear;
  const halfW = spec.body.hullWidth * 0.42;
  const len = spec.body.hullLength * (rear ? 0.3 : 0.34);
  const belt = beltHeight(spec) - spec.chassis.cgHeight;
  const floorY = belt - 0.2;
  const z = rear ? -spec.body.hullLength * 0.22 : spec.body.hullLength * 0.26;
  const steel = 0x2a3138;
  const dark = 0x16191d;
  const batt = 0x1e3a28;
  const parts = [
    box(halfW * 2, 0.03, len, 0, floorY, z, dark),
    box(halfW * 2, 0.22, 0.04, 0, floorY + 0.12, z + (rear ? len * 0.48 : -len * 0.48), steel),
    box(0.04, 0.22, len * 0.92, -halfW + 0.02, floorY + 0.12, z, steel),
    box(0.04, 0.22, len * 0.92, halfW - 0.02, floorY + 0.12, z, steel),
    box(halfW * 1.6, 0.03, 0.05, 0, belt - 0.02, z, 0x6a7380),
    box(0.16, 0.1, 0.22, -halfW * 0.62, floorY + 0.08, z + (rear ? 0.08 : -0.08), batt),
    box(0.12, 0.08, 0.1, halfW * 0.58, floorY + 0.07, z + (rear ? 0.1 : -0.1), 0x3a4048),
    box(0.03, 0.02, len * 0.5, 0, floorY + 0.04, z, 0x8a5a3a),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error(`Bay tub: ${spec.id}`);
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

const CALIPER = [0x1a1c1e, 0x8a9098, 0xb42318] as const;
const LUG_COUNT = 5;
const SWAP_TIME = 0.72;
const BRAKE_CORNER = 0;

function makeBrakeDisc(radius: number): BufferGeometry {
  const rotor = paint(new CylinderGeometry(radius * 0.62, radius * 0.62, 0.028, 24), 0x6a7380);
  rotor.rotateZ(Math.PI / 2);
  const hat = paint(new CylinderGeometry(radius * 0.22, radius * 0.22, 0.05, 12), 0x3a4048);
  hat.rotateZ(Math.PI / 2);
  const parts = [rotor, hat];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('Brake disc');
  return merged;
}

function makeCaliper(radius: number): BufferGeometry {
  const h = radius * 0.34;
  const parts = [
    box(0.11, h, 0.2, 0, h * 0.15, 0, 0xb42318),
    box(0.07, h * 0.45, 0.07, 0.06, h * 0.28, 0.05, 0x9aa3ad),
    box(0.07, h * 0.45, 0.07, 0.06, h * 0.28, -0.05, 0x9aa3ad),
    box(0.04, 0.04, 0.16, -0.04, -h * 0.22, 0, 0x2a3138),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('Caliper');
  return merged;
}

export class GarageCar {
  readonly group = new Group();
  readonly spec: VehicleSpec;
  readonly #body: Mesh;
  readonly #hood: Group;
  readonly #engine: EngineBay;
  readonly #wheels: Mesh[] = [];
  readonly #hubs: Group[] = [];
  readonly #wheelBase: Array<{ x: number; y: number; z: number }> = [];
  readonly #discs: Mesh[] = [];
  readonly #calipers: Mesh[] = [];
  readonly #lugs: Mesh[][] = [];
  readonly #badge: Mesh;
  readonly #bodyMat: BayBodyMaterial | PropMaterial;
  readonly #solidMat: PropMaterial;
  readonly #hoodMat: PropMaterial;
  readonly #wheelMat: PropMaterial;
  readonly #discMat: MeshStandardMaterial;
  readonly #caliperMat: MeshStandardMaterial;
  readonly #lugMat: MeshStandardMaterial;
  readonly #geoms: BufferGeometry[] = [];
  readonly #hasHood: boolean;
  #wheelGeom: BufferGeometry;
  #hoodOpen = 0;
  #spin = 0;
  #steer = 0;
  #tier: TuneTier = 0;
  #setup: SetupId = 'road';
  #swap = 0;
  #swapFrom = 0;
  #pendingGeom: BufferGeometry | null = null;
  #swapped = false;
  #instant = false;
  #brakeReveal = 0;

  constructor(spec: VehicleSpec, atmosphere: AtmosphereUniforms) {
    this.spec = spec;
    this.group.name = 'BayCar';
    this.#hasHood = spec.body.shape !== 'openwheel';
    const hole = hoodBox(spec);
    const bodyMat = this.#hasHood
      ? new BayBodyMaterial(atmosphere, hole)
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

    const tubGeom = createBayTub(spec);
    this.#geoms.push(tubGeom);
    this.group.add(new Mesh(tubGeom, solid));

    const hoodMat = new PropMaterial(atmosphere);
    hoodMat.roughness = 0.38;
    hoodMat.metalness = 0.18;
    hoodMat.polygonOffset = true;
    hoodMat.polygonOffsetFactor = -1;
    hoodMat.polygonOffsetUnits = -2;
    this.#hoodMat = hoodMat;

    this.#hood = new Group();
    this.#hood.name = 'BayHood';
    const rear = engineLook(spec.id).rear;
    const cowlZ = spec.body.hullLength * (rear ? -0.08 : 0.08);
    const cowlY = beltHeight(spec) - spec.chassis.cgHeight;
    this.#hood.position.set(0, cowlY, cowlZ);
    const hoodGeom = createHoodPanel(spec);
    this.#geoms.push(hoodGeom);
    const hoodMesh = new Mesh(hoodGeom, hoodMat);
    hoodMesh.position.set(0, -cowlY, -cowlZ);
    this.#hood.add(hoodMesh);
    this.#hood.visible = false;
    this.group.add(this.#hood);

    this.#engine = new EngineBay(spec, solid);
    this.#engine.group.visible = !this.#hasHood;
    this.group.add(this.#engine.group);

    const wheelMat = new PropMaterial(atmosphere);
    wheelMat.roughness = 0.5;
    wheelMat.metalness = 0.35;
    this.#wheelMat = wheelMat;
    this.#wheelGeom = createGarageWheel(spec, 0, 'road');
    this.#geoms.push(this.#wheelGeom);
    const halfTrack = spec.chassis.track / 2;
    const positions: Array<[number, number, number]> = [
      [-halfTrack, -spec.chassis.cgHeight + spec.chassis.wheelRadius, spec.derived.cgToFront],
      [halfTrack, -spec.chassis.cgHeight + spec.chassis.wheelRadius, spec.derived.cgToFront],
      [-halfTrack, -spec.chassis.cgHeight + spec.chassis.wheelRadius, -spec.derived.cgToRear],
      [halfTrack, -spec.chassis.cgHeight + spec.chassis.wheelRadius, -spec.derived.cgToRear],
    ];
    this.#discMat = new MeshStandardMaterial({
      color: 0x8a9098,
      emissive: 0x000000,
      roughness: 0.35,
      metalness: 0.82,
    });
    const discMat = this.#discMat;
    this.#caliperMat = new MeshStandardMaterial({
      color: CALIPER[0],
      roughness: 0.4,
      metalness: 0.45,
      flatShading: true,
    });
    this.#lugMat = new MeshStandardMaterial({
      color: 0xc5cdd4,
      roughness: 0.35,
      metalness: 0.7,
      flatShading: true,
    });
    const discGeom = makeBrakeDisc(spec.chassis.wheelRadius);
    const caliperGeom = makeCaliper(spec.chassis.wheelRadius);
    const lugGeom = new CylinderGeometry(0.012, 0.012, 0.018, 6);
    this.#geoms.push(discGeom, caliperGeom, lugGeom);
    for (const [x, y, z] of positions) {
      this.#wheelBase.push({ x, y, z });
      const hub = new Group();
      hub.position.set(x, y, z);
      this.#hubs.push(hub);
      this.group.add(hub);
      const wheel = new Mesh(this.#wheelGeom, wheelMat);
      this.#wheels.push(wheel);
      hub.add(wheel);
      const disc = new Mesh(discGeom, discMat);
      this.#discs.push(disc);
      hub.add(disc);
      const caliper = new Mesh(caliperGeom, this.#caliperMat);
      caliper.position.set(Math.sign(x) * 0.03, spec.chassis.wheelRadius * 0.28, 0);
      caliper.rotation.z = Math.sign(x) < 0 ? Math.PI : 0;
      this.#calipers.push(caliper);
      hub.add(caliper);
      const lugs: Mesh[] = [];
      const lugR = spec.chassis.wheelRadius * 0.16;
      for (let i = 0; i < LUG_COUNT; i++) {
        const lug = new Mesh(lugGeom, this.#lugMat);
        lug.rotation.z = Math.PI / 2;
        const a = (i / LUG_COUNT) * Math.PI * 2;
        lug.position.set(
          Math.sign(x) * (spec.chassis.wheelWidth / 2 + 0.02),
          Math.sin(a) * lugR,
          Math.cos(a) * lugR,
        );
        lugs.push(lug);
        hub.add(lug);
      }
      this.#lugs.push(lugs);
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

  setInstant(on: boolean): void {
    this.#instant = on;
  }

  setHood(open01: number): void {
    const t = Math.max(0, Math.min(1, open01));
    this.#hoodOpen = t;
    if (this.#bodyMat instanceof BayBodyMaterial) this.#bodyMat.hoodOpen.value = t;
    const show = this.#hasHood && t > 0.02 && t < 0.78;
    this.#hood.visible = show;
    this.#engine.group.visible = !this.#hasHood || t > 0.22;
    this.#hood.rotation.x = (this.#engine.look.rear ? 1 : -1) * t * 1.72;
    // Parked open, the panel is a cream billboard over the bay. Hide it once
    // the hole in the body is the view — the lifted lid is the animation only.
  }

  setTuneVisual(tune: CarTune, focus: TuneCategory | 'setup' | null, setup: SetupId = 'road'): void {
    this.#badge.visible = tune.engine + tune.brakes + tune.steering + tune.tyres > 0;
    const brakeGlow = focus === 'brakes' ? 0.55 + 0.35 * tune.brakes : 0.08 * tune.brakes;
    for (const disc of this.#discs) {
      const mat = disc.material as MeshStandardMaterial;
      mat.emissive.setRGB(brakeGlow, brakeGlow * 0.08, 0.02);
      mat.emissiveIntensity = focus === 'brakes' ? 2.2 : 0.6;
    }
    this.#caliperMat.color.setHex(CALIPER[tune.brakes]!, 'srgb');
    this.#caliperMat.metalness = 0.35 + 0.2 * tune.brakes;
    const caliperScale = 0.82 + 0.28 * tune.brakes;
    for (const caliper of this.#calipers) caliper.scale.setScalar(caliperScale);
    this.#wheelMat.metalness = 0.35 + 0.22 * tune.tyres;
    this.#engine.setTier(tune.engine);
    if (focus === 'engine' || this.#hoodOpen > 0.22) this.#engine.group.visible = true;
    this.#queueWheels(tune.tyres, setup);
  }

  #queueWheels(tier: TuneTier, setup: SetupId): void {
    if (tier === this.#tier && setup === this.#setup && this.#swap <= 0) return;
    if (this.#instant) {
      this.#applyWheels(tier, setup);
      return;
    }
    if (this.#swap > 0 && this.#pendingGeom) {
      this.#pendingGeom.dispose();
      this.#pendingGeom = null;
    }
    this.#pendingGeom = createGarageWheel(this.spec, tier, setup);
    this.#tier = tier;
    this.#setup = setup;
    this.#swap = SWAP_TIME;
    this.#swapFrom = SWAP_TIME;
    this.#swapped = false;
  }

  #applyWheels(tier: TuneTier, setup: SetupId): void {
    const next = createGarageWheel(this.spec, tier, setup);
    for (const wheel of this.#wheels) wheel.geometry = next;
    if (!this.#geoms.includes(this.#wheelGeom)) this.#wheelGeom.dispose();
    else {
      const i = this.#geoms.indexOf(this.#wheelGeom);
      if (i >= 0) this.#geoms.splice(i, 1);
      this.#wheelGeom.dispose();
    }
    this.#wheelGeom = next;
    this.#geoms.push(next);
    this.#tier = tier;
    this.#setup = setup;
    this.#swap = 0;
    this.#pendingGeom = null;
    this.#resetWheelPose();
  }

  #resetWheelPose(): void {
    for (let i = 0; i < this.#hubs.length; i++) {
      const base = this.#wheelBase[i]!;
      this.#hubs[i]!.position.set(base.x, base.y, base.z);
    }
  }

  pulseEngine(): void {
    this.#engine.pulse();
  }

  blipEngine(): void {
    this.#engine.blip();
  }

  engineGlow(): number {
    return this.#engine.glowColor();
  }

  enginePoint(target: Vector3): Vector3 {
    this.#engine.group.getWorldPosition(target);
    target.y += 0.1;
    return target;
  }

  wheelPoint(target: Vector3, index = 0): Vector3 {
    const hub = this.#hubs[index] ?? this.#hubs[0]!;
    hub.getWorldPosition(target);
    return target;
  }

  frontPoint(target: Vector3): Vector3 {
    this.group.getWorldPosition(target);
    // Car yaw is π in the bay, so local +Z (nose) is world −Z.
    target.z -= this.spec.body.hullLength * 0.32;
    target.y += 0.18;
    return target;
  }

  update(dt: number, focus: TuneCategory | 'setup' | null): void {
    const live = focus === 'engine' || this.#hoodOpen > 0.22;
    this.#engine.update(dt, live);
    if (focus === 'steering') {
      this.#steer += dt * 1.6;
    } else {
      this.#steer *= Math.exp(-4 * dt);
    }
    const steer = Math.sin(this.#steer) * 0.42;
    if (focus === 'tyres') this.#spin += dt * 2.8;
    if (focus === 'brakes') this.#spin += dt * 1.4;
    const wantReveal = focus === 'brakes' ? 1 : 0;
    this.#brakeReveal += (wantReveal - this.#brakeReveal) * Math.min(1, dt * 5);
    this.#tickSwap(dt);
    for (let i = 0; i < this.#hubs.length; i++) {
      const hub = this.#hubs[i]!;
      const base = this.#wheelBase[i]!;
      this.#wheels[i]!.rotation.x = this.#spin;
      this.#discs[i]!.rotation.x = focus === 'brakes' ? this.#spin * 0.7 : 0;
      hub.rotation.y = i < 2 && focus === 'steering' ? steer : 0;
      if (this.#swap <= 0) hub.position.set(base.x, base.y, base.z);
      const off = i === BRAKE_CORNER && this.#brakeReveal > 0.28;
      this.#wheels[i]!.visible = !off;
      this.#wheels[i]!.position.x = 0;
      const lugs = this.#lugs[i]!;
      for (const lug of lugs) lug.visible = !off;
    }
  }

  #tickSwap(dt: number): void {
    if (this.#swap <= 0) return;
    this.#swap = Math.max(0, this.#swap - dt);
    const u = 1 - this.#swap / this.#swapFrom;
    const unscrew = Math.min(1, u / 0.22);
    const out = u < 0.22 ? 0 : u < 0.48 ? (u - 0.22) / 0.26 : u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.28);
    const screw = u < 0.72 ? 0 : Math.min(1, (u - 0.72) / 0.28);
    if (u >= 0.48 && !this.#swapped && this.#pendingGeom) {
      for (const wheel of this.#wheels) wheel.geometry = this.#pendingGeom;
      if (!this.#geoms.includes(this.#wheelGeom)) this.#wheelGeom.dispose();
      else {
        const i = this.#geoms.indexOf(this.#wheelGeom);
        if (i >= 0) this.#geoms.splice(i, 1);
        this.#wheelGeom.dispose();
      }
      this.#wheelGeom = this.#pendingGeom;
      this.#geoms.push(this.#pendingGeom);
      this.#pendingGeom = null;
      this.#swapped = true;
    }
    for (let i = 0; i < this.#hubs.length; i++) {
      const base = this.#wheelBase[i]!;
      const side = Math.sign(base.x) || 1;
      const slide = out * 0.38 * side;
      this.#hubs[i]!.position.set(base.x + slide, base.y, base.z);
      const lugs = this.#lugs[i]!;
      const lugR = this.spec.chassis.wheelRadius * 0.16;
      for (let k = 0; k < lugs.length; k++) {
        const lug = lugs[k]!;
        const a = (k / LUG_COUNT) * Math.PI * 2 + unscrew * 6.2;
        const pull = (1 - screw) * unscrew * 0.05 * side;
        lug.position.set(
          side * (this.spec.chassis.wheelWidth / 2 + 0.02) + pull,
          Math.sin(a) * lugR,
          Math.cos(a) * lugR,
        );
        lug.rotation.x = unscrew * 8;
        lug.visible = out < 0.95 || screw > 0.05;
      }
    }
    if (this.#swap <= 0) this.#resetWheelPose();
  }

  dispose(): void {
    this.group.removeFromParent();
    this.#engine.dispose();
    this.#pendingGeom?.dispose();
    for (const g of this.#geoms) g.dispose();
    this.#bodyMat.dispose();
    this.#solidMat.dispose();
    this.#hoodMat.dispose();
    this.#wheelMat.dispose();
    this.#discMat.dispose();
    this.#caliperMat.dispose();
    this.#lugMat.dispose();
    this.#badge.geometry.dispose();
    const badgeMat = this.#badge.material as MeshStandardMaterial;
    badgeMat.map?.dispose();
    badgeMat.dispose();
  }
}
