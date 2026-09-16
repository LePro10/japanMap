import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  TorusGeometry,
  Vector3,
  type Scene,
} from 'three';

import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { VEHICLES, type VehicleId } from '@/config/vehicles.config';
import type { CarTune, SetupId, TuneCategory } from '@/config/tuning.config';
import { GarageCar } from './garageCar';
import { garageSitHeight, jackPoints, LIFT_PAD } from './garageLayout';

/**
 * Indoor Open Bay — only lives while the tune overlay is open.
 *
 * Closed box on purpose. The first bay left the −Z wall open so dusk and
 * sakura sat in the doorway; from the rear shot that was the whole map
 * leaking in. The roller door is shut. Camera containment in TuningGarage
 * keeps the lens inside the walls.
 *
 * Two-post lift: pads sit on the sills, inboard of both axles. The old
 * 4.5 m beams ran through z = ±1.15, which is where every car's tyres are.
 */

const RED = 0xb42318;
const CONCRETE = 0x3a3f44;
const STEEL = 0x1c2228;
const WARM = 0xffc077;
const PAD_TOP = 0.1;
const POST_X = 2.35;

function boxMesh(w: number, h: number, d: number, mat: MeshStandardMaterial, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export class GarageStage {
  readonly group = new Group();
  readonly carAnchor = new Vector3();
  readonly #atmosphere: AtmosphereUniforms;
  readonly #lift: Group;
  readonly #arms: Group;
  readonly #armBits: Mesh[] = [];
  readonly #lights: PointLight[] = [];
  readonly #neon: PointLight;
  readonly #engineLight: PointLight;
  readonly #dropLamp: Mesh;
  readonly #sparks: Points;
  readonly #weldSparks: Points;
  readonly #sparkVel: Float32Array;
  readonly #weldVel: Float32Array;
  readonly #geoms: BufferGeometry[] = [];
  readonly #mats: Array<MeshStandardMaterial | MeshBasicMaterial | PointsMaterial> = [];
  readonly #mechanic: Group;
  readonly #mechArm: Group;
  #car: GarageCar | null = null;
  #lift01 = 0;
  #pulse = 0;
  #focus: TuneCategory | 'setup' | null = null;
  #sparkT = 0;
  #weldT = 0;
  #flicker = 0;
  #work = 0;
  #sitY = 0.42;
  #instant = false;

  constructor(atmosphere: AtmosphereUniforms) {
    this.#atmosphere = atmosphere;
    this.group.name = 'OpenBay';

    const floorMat = this.#std(CONCRETE, 0.92, 0);
    const wallMat = this.#std(STEEL, 0.86, 0.08);
    const redMat = this.#std(RED, 0.48, 0.22);
    const steelMat = this.#std(0x2a3138, 0.55, 0.45);
    const lampMat = new MeshStandardMaterial({
      color: 0xffe0b0,
      emissive: 0xffc077,
      emissiveIntensity: 1.6,
      roughness: 0.4,
    });
    this.#mats.push(lampMat);

    // 18 × 14 × 6.8 m closed box. Overlapping edges so orbit never finds a gap.
    this.group.add(boxMesh(19.2, 0.28, 15.2, floorMat, 0, -0.12, 0));
    this.group.add(boxMesh(19.2, 6.9, 0.5, wallMat, 0, 3.4, 7.2));
    this.group.add(boxMesh(0.5, 6.9, 15.2, wallMat, -9.3, 3.4, 0));
    this.group.add(boxMesh(0.5, 6.9, 15.2, wallMat, 9.3, 3.4, 0));
    this.group.add(boxMesh(19.2, 0.4, 15.4, wallMat, 0, 6.85, 0));
    this.#buildDoor(wallMat, steelMat);

    const lineMat = new MeshBasicMaterial({ color: 0xe8ba7f });
    this.#mats.push(lineMat);
    for (const z of [-3.4, 3.4]) {
      const line = new Mesh(new BoxGeometry(4.8, 0.02, 0.08), lineMat);
      line.position.set(0, 0.02, z);
      this.group.add(line);
    }
    for (const x of [-2.4, 2.4]) {
      const line = new Mesh(new BoxGeometry(0.08, 0.02, 6.8), lineMat);
      line.position.set(x, 0.02, 0);
      this.group.add(line);
    }

    this.#lift = new Group();
    this.#lift.name = 'Lift';
    for (const x of [-POST_X, POST_X]) {
      this.#lift.add(boxMesh(0.28, 5.2, 0.28, redMat, x, 2.6, 0));
      this.#lift.add(boxMesh(0.42, 0.16, 0.42, redMat, x, 5.22, 0));
      this.#lift.add(boxMesh(0.5, 0.22, 0.5, steelMat, x, 0.1, 0));
    }
    this.#lift.add(boxMesh(POST_X * 2 + 0.28, 0.12, 0.2, redMat, 0, 5.18, 0));
    this.#lift.add(boxMesh(0.55, 0.7, 0.4, steelMat, POST_X + 0.55, 0.4, 0.35));
    this.#arms = new Group();
    this.#lift.add(this.#arms);
    this.group.add(this.#lift);

    for (const x of [-2.6, 2.6]) {
      this.group.add(boxMesh(0.18, 0.08, 4.2, lampMat, x, 6.45, 0));
      const light = new PointLight(WARM, 260, 18, 2);
      light.position.set(x, 6.15, 0.3);
      this.#lights.push(light);
      this.group.add(light);
    }
    const fill = new PointLight(0x88a0b8, 70, 16, 2);
    fill.position.set(0, 3.4, 3.2);
    this.#lights.push(fill);
    this.group.add(fill);

    this.#neon = new PointLight(0xff2a40, 0, 8, 2);
    this.#neon.position.set(0, 0.6, 2.2);
    this.group.add(this.#neon);
    this.#engineLight = new PointLight(0xff4a2a, 0, 5, 2);
    this.#engineLight.position.set(0, 1.6, 1.0);
    this.group.add(this.#engineLight);

    const dropMat = new MeshStandardMaterial({
      color: 0xffe0b0,
      emissive: 0xffc077,
      emissiveIntensity: 0.4,
      roughness: 0.45,
    });
    this.#mats.push(dropMat);
    this.#dropLamp = boxMesh(0.55, 0.08, 0.55, dropMat, 0, 6.2, 1.1);
    this.group.add(this.#dropLamp);

    this.#buildProps(steelMat, redMat, floorMat);
    this.#mechanic = this.#buildMechanic(steelMat, redMat);
    this.#mechArm = this.#mechanic.getObjectByName('MechArm') as Group;
    this.group.add(this.#mechanic);

    this.#sparks = this.#makeSparks(0xffb45e);
    this.#weldSparks = this.#makeSparks(0x9ad8ff);
    this.#sparkVel = new Float32Array(48 * 3);
    this.#weldVel = new Float32Array(48 * 3);
    this.group.add(this.#sparks, this.#weldSparks);
  }

  #std(hex: number, roughness: number, metalness: number): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({
      color: hex,
      roughness,
      metalness,
      vertexColors: false,
      flatShading: true,
    });
    this.#mats.push(mat);
    return mat;
  }

  #buildDoor(wall: MeshStandardMaterial, steel: MeshStandardMaterial): void {
    const doorTex = this.#doorTexture();
    const doorMat = new MeshStandardMaterial({
      map: doorTex,
      roughness: 0.7,
      metalness: 0.35,
      flatShading: true,
    });
    this.#mats.push(doorMat);
    const door = new Mesh(new PlaneGeometry(17.4, 6.5), doorMat);
    door.position.set(0, 3.25, -6.92);
    this.group.add(door);
    this.#geoms.push(door.geometry);
    this.group.add(boxMesh(18.2, 6.8, 0.22, wall, 0, 3.4, -7.12));
    this.group.add(boxMesh(0.28, 6.6, 0.28, steel, -8.7, 3.3, -6.92));
    this.group.add(boxMesh(0.28, 6.6, 0.28, steel, 8.7, 3.3, -6.92));
    this.group.add(boxMesh(17.8, 0.22, 0.28, steel, 0, 6.55, -6.92));
    const frost = new MeshStandardMaterial({
      color: 0xc8d0d4,
      emissive: 0xffe0b0,
      emissiveIntensity: 0.22,
      roughness: 0.85,
      metalness: 0,
    });
    this.#mats.push(frost);
    for (const x of [-5.2, -1.7, 1.7, 5.2]) {
      this.group.add(boxMesh(2.2, 0.55, 0.06, frost, x, 5.55, -6.88));
    }
    this.group.add(boxMesh(1.1, 2.2, 0.08, steel, 8.55, 1.15, 4.6));
    this.group.add(boxMesh(0.12, 0.08, 0.08, this.#std(0xc4a35a, 0.4, 0.6), 8.05, 1.15, 4.6));
  }

  #doorTexture(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 1024;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#2a3138';
    ctx.fillRect(0, 0, 256, 1024);
    for (let y = 0; y < 1024; y += 36) {
      ctx.fillStyle = y % 72 === 0 ? '#323a42' : '#262c32';
      ctx.fillRect(0, y, 256, 28);
      ctx.fillStyle = '#1a1e22';
      ctx.fillRect(0, y + 28, 256, 8);
    }
    ctx.fillStyle = '#b42318';
    ctx.fillRect(0, 40, 256, 18);
    ctx.fillStyle = '#e8ba7f';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OPEN BAY', 128, 980);
    const tex = new CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  #buildProps(steel: MeshStandardMaterial, red: MeshStandardMaterial, floor: MeshStandardMaterial): void {
    const tire = new MeshStandardMaterial({ color: 0x16181b, roughness: 0.9, metalness: 0 });
    this.#mats.push(tire);
    for (let i = 0; i < 8; i++) {
      const ring = new Mesh(new TorusGeometry(0.32, 0.09, 6, 16), tire);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-8.55, 0.7 + (i % 4) * 0.78, -3.4 + Math.floor(i / 4) * 1.15);
      this.group.add(ring);
      this.#geoms.push(ring.geometry);
    }
    const wood = this.#std(0x5a4634, 0.85, 0);
    const orange = this.#std(0xc45a1a, 0.55, 0.1);
    this.group.add(boxMesh(0.9, 1.15, 2.2, red, 8.2, 0.58, -2.4));
    for (const y of [0.28, 0.55, 0.82]) {
      this.group.add(boxMesh(0.86, 0.04, 2.14, steel, 8.2, y, -2.4));
    }
    this.group.add(boxMesh(1.8, 0.08, 0.7, wood, 7.7, 0.95, 3.6));
    this.group.add(boxMesh(1.8, 0.9, 0.7, steel, 7.7, 0.45, 3.6));
    this.group.add(boxMesh(0.18, 0.22, 0.18, steel, 7.15, 1.12, 3.45));
    this.group.add(boxMesh(0.28, 0.08, 0.4, this.#std(0x4a5560, 0.5, 0.4), 8.2, 1.02, 3.55));
    this.group.add(boxMesh(0.16, 0.22, 0.12, orange, 8.35, 1.14, 3.55));
    this.group.add(boxMesh(0.55, 0.7, 0.4, steel, 7.4, 0.4, 4.5));
    this.group.add(boxMesh(0.12, 0.55, 0.12, this.#std(0x8a9098, 0.4, 0.7), 7.4, 0.95, 4.5));
    this.group.add(boxMesh(0.42, 0.7, 0.42, red, -8.2, 0.4, 2.6));
    this.group.add(boxMesh(0.42, 0.7, 0.42, red, -8.2, 0.4, 3.2));
    this.group.add(boxMesh(0.55, 0.18, 0.55, steel, -7.4, 0.12, 4.4));
    this.group.add(boxMesh(0.08, 1.4, 0.08, steel, -8.3, 1.5, 0.6));
    this.group.add(boxMesh(0.7, 1.1, 0.06, steel, -8.5, 1.6, 0.6));
    const tool = this.#std(0x8a9098, 0.4, 0.65);
    for (let i = 0; i < 6; i++) {
      this.group.add(boxMesh(0.04, 0.28 + (i % 3) * 0.06, 0.04, tool, -8.42, 1.35 + (i % 2) * 0.35, 0.2 + i * 0.14));
    }
    this.group.add(boxMesh(0.05, 0.05, 1.8, steel, -4.6, 4.8, -1.2));
    this.group.add(boxMesh(0.12, 0.18, 0.18, orange, -4.6, 4.55, -0.4));
    this.group.add(boxMesh(0.7, 0.12, 1.1, steel, -8.2, 0.08, -0.4));
    this.group.add(boxMesh(0.9, 0.04, 1.4, this.#std(0x2a2420, 0.9, 0), 0, 0.03, -4.6));
    this.group.add(boxMesh(0.55, 0.9, 0.4, steel, 8.15, 0.5, 0.4));
    this.group.add(boxMesh(0.35, 0.08, 0.35, floor, 8.15, 0.96, 0.4));
    const sign = document.createElement('canvas');
    sign.width = 512;
    sign.height = 128;
    const ctx = sign.getContext('2d')!;
    ctx.fillStyle = '#14191d';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#e8ba7f';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OPEN BAY', 256, 58);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#b7c4c8';
    ctx.fillText('TUNE  ·  FIT  ·  LEAVE', 256, 100);
    const tex = new CanvasTexture(sign);
    const signMat = new MeshBasicMaterial({ map: tex, side: DoubleSide });
    this.#mats.push(signMat);
    const plate = new Mesh(new PlaneGeometry(4.4, 1.1), signMat);
    plate.position.set(0, 5.6, 6.88);
    this.group.add(plate);
    this.#geoms.push(plate.geometry);
  }

  #buildMechanic(steel: MeshStandardMaterial, red: MeshStandardMaterial): Group {
    const g = new Group();
    g.name = 'Mechanic';
    g.position.set(7.15, 0, 3.15);
    g.rotation.y = -Math.PI / 2;
    const skin = this.#std(0xc4a07a, 0.7, 0);
    const cloth = this.#std(0xc45a1a, 0.7, 0.05);
    const dark = this.#std(0x2a2420, 0.8, 0);
    g.add(boxMesh(0.34, 0.5, 0.22, cloth, 0, 1.22, 0));
    g.add(boxMesh(0.3, 0.18, 0.2, steel, 0, 0.9, 0));
    g.add(boxMesh(0.22, 0.2, 0.2, skin, 0, 1.56, 0));
    g.add(boxMesh(0.24, 0.08, 0.22, dark, 0, 1.68, 0));
    g.add(boxMesh(0.1, 0.46, 0.1, cloth, 0.09, 0.48, 0));
    g.add(boxMesh(0.1, 0.46, 0.1, cloth, -0.09, 0.48, 0));
    g.add(boxMesh(0.11, 0.08, 0.22, dark, 0.09, 0.22, 0.04));
    g.add(boxMesh(0.11, 0.08, 0.22, dark, -0.09, 0.22, 0.04));
    g.add(boxMesh(0.09, 0.32, 0.09, cloth, -0.22, 1.28, 0.04));
    const arm = new Group();
    arm.name = 'MechArm';
    arm.position.set(0.22, 1.38, 0);
    arm.add(boxMesh(0.09, 0.32, 0.09, cloth, 0, -0.14, 0.02));
    const torch = boxMesh(0.04, 0.04, 0.22, steel, 0, -0.32, 0.12);
    torch.name = 'Torch';
    arm.add(torch);
    arm.add(boxMesh(0.05, 0.05, 0.05, red, 0, -0.32, 0.24));
    g.add(arm);
    return g;
  }

  #makeSparks(hex: number): Points {
    const positions = new Float32Array(48 * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.#geoms.push(g);
    const mat = new PointsMaterial({
      color: hex,
      size: 0.05,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.#mats.push(mat);
    const pts = new Points(g, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    return pts;
  }

  #rebuildArms(car: GarageCar): void {
    for (const mesh of this.#armBits) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.#armBits.length = 0;
    const steel = this.#std(0x2a3138, 0.55, 0.45);
    const rubber = this.#std(0x16181b, 0.9, 0);
    const pads = jackPoints(car.spec);
    for (const [lx, lz] of pads) {
      // Car yaw is π in the bay, so local XZ maps to (−x, −z) on the lift.
      const px = -lx;
      const pz = -lz;
      const side = Math.sign(px) || 1;
      const midX = (POST_X * side + px) / 2;
      const len = Math.abs(POST_X * side - px);
      const arm = boxMesh(len, 0.08, 0.12, steel, midX, 0.04, pz);
      const pad = boxMesh(LIFT_PAD, 0.07, LIFT_PAD, rubber, px, PAD_TOP - 0.035, pz);
      this.#arms.add(arm, pad);
      this.#armBits.push(arm, pad);
    }
    this.#sitY = garageSitHeight(car.spec, PAD_TOP);
    car.group.position.y = this.#sitY;
  }

  attach(scene: Scene, x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    scene.add(this.group);
  }

  setCar(id: VehicleId): void {
    this.#car?.dispose();
    const spec = VEHICLES[id];
    const car = new GarageCar(spec, this.#atmosphere);
    car.setInstant(this.#instant);
    car.group.rotation.y = Math.PI;
    this.#car = car;
    this.#rebuildArms(car);
    this.#arms.add(car.group);
    this.#syncCarHeight();
  }

  setInstant(on: boolean): void {
    this.#instant = on;
    this.#car?.setInstant(on);
  }

  setLift(height01: number): void {
    this.#lift01 = Math.max(0, Math.min(1, height01));
    this.#syncCarHeight();
  }

  setHood(open01: number): void {
    this.#car?.setHood(open01);
  }

  setTuneVisual(tune: CarTune, focus: TuneCategory | 'setup' | null, setup: SetupId = 'road'): void {
    this.#focus = focus;
    this.#car?.setTuneVisual(tune, focus, setup);
    const any = tune.engine + tune.brakes + tune.steering + tune.tyres > 0;
    this.#neon.intensity = any ? 40 : 0;
    const glow = this.#car?.engineGlow() ?? 0xff4a2a;
    this.#engineLight.color.setHex(glow);
    this.#engineLight.intensity = focus === 'engine' ? 36 : tune.engine > 0 ? 14 : 0;
  }

  pulseInstall(engine = false): void {
    this.#pulse = 1;
    this.#burst(this.#sparks, this.#sparkVel, 0);
    this.#sparkT = 0.45;
    if (engine) this.#car?.pulseEngine();
    else this.#car?.blipEngine();
  }

  blipEngine(): void {
    this.#car?.blipEngine();
  }

  carCenter(target: Vector3): Vector3 {
    const y = this.#arms.position.y + this.#sitY + 0.2;
    return target.set(this.group.position.x, this.group.position.y + y, this.group.position.z);
  }

  focusPoint(focus: TuneCategory | 'setup' | null, target: Vector3): Vector3 {
    this.group.updateWorldMatrix(true, true);
    const car = this.#car;
    if (!car) return this.carCenter(target);
    if (focus === 'engine') return car.enginePoint(target);
    if (focus === 'tyres' || focus === 'brakes') {
      this.carCenter(target);
      car.wheelPoint(_wheel, 1);
      return target.lerp(_wheel, 0.42);
    }
    if (focus === 'steering') return car.frontPoint(target);
    return this.carCenter(target);
  }

  interiorClamp(point: Vector3): void {
    const o = this.group.position;
    point.x = Math.max(o.x - 7.6, Math.min(o.x + 7.6, point.x));
    point.y = Math.max(o.y + 0.35, Math.min(o.y + 6.2, point.y));
    point.z = Math.max(o.z - 5.8, Math.min(o.z + 5.8, point.z));
  }

  update(dt: number): void {
    if (this.#pulse > 0) {
      this.#pulse = Math.max(0, this.#pulse - dt * 2.8);
      this.#syncCarHeight();
    }
    this.#car?.update(dt, this.#focus);
    this.#flicker += dt;
    this.#work += dt;
    for (const [i, light] of this.#lights.entries()) {
      light.intensity = (i < 2 ? 260 : 70) + Math.sin(this.#flicker * 6 + i * 1.7) * 8;
    }
    const lampY = this.#focus === 'engine' ? 2.85 : 6.2;
    this.#dropLamp.position.y += (lampY - this.#dropLamp.position.y) * Math.min(1, dt * 3);
    (this.#dropLamp.material as MeshStandardMaterial).emissiveIntensity =
      this.#focus === 'engine' ? 2.4 : 0.4;
    if (this.#car && this.#focus === 'engine') {
      this.#car.enginePoint(_tmp);
      this.#engineLight.position.set(
        _tmp.x - this.group.position.x,
        _tmp.y - this.group.position.y + 0.35,
        _tmp.z - this.group.position.z,
      );
      this.#dropLamp.position.x = this.#engineLight.position.x;
      this.#dropLamp.position.z = this.#engineLight.position.z;
    }
    if (this.#mechArm) {
      this.#mechArm.rotation.x = -0.4 + Math.sin(this.#work * 7) * 0.35;
      this.#mechArm.rotation.z = 0.15 + Math.sin(this.#work * 3.2) * 0.08;
    }
    if (this.#weldT <= 0 && Math.sin(this.#work * 0.7) > 0.92) {
      this.#burst(this.#weldSparks, this.#weldVel, 1);
      this.#weldT = 0.35;
    }
    this.#tickSparks(dt, this.#sparks, this.#sparkVel, 'spark');
    this.#tickSparks(dt, this.#weldSparks, this.#weldVel, 'weld');
  }

  #syncCarHeight(): void {
    const bounce = Math.sin(this.#pulse * Math.PI) * 0.08;
    this.#arms.position.y = 0.38 + this.#lift01 * 1.35 + bounce;
    this.carAnchor.set(
      this.group.position.x,
      this.group.position.y + this.#arms.position.y + this.#sitY,
      this.group.position.z,
    );
  }

  #burst(pts: Points, vel: Float32Array, kind: 0 | 1): void {
    const pos = pts.geometry.getAttribute('position');
    for (let i = 0; i < 48; i++) {
      const a = Math.random() * Math.PI * 2;
      if (kind === 1) {
        pos.setXYZ(i, 7.05 + Math.cos(a) * 0.05, 1.22, 3.35 + Math.sin(a) * 0.05);
        vel[i * 3] = Math.cos(a) * (0.4 + Math.random());
        vel[i * 3 + 1] = 0.6 + Math.random() * 1.4;
        vel[i * 3 + 2] = Math.sin(a) * (0.4 + Math.random());
      } else {
        pos.setXYZ(i, Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.4);
        vel[i * 3] = Math.cos(a) * (1 + Math.random() * 2);
        vel[i * 3 + 1] = 2 + Math.random() * 3;
        vel[i * 3 + 2] = Math.sin(a) * (1 + Math.random() * 2);
      }
    }
    pos.needsUpdate = true;
    pts.visible = true;
    if (kind === 0) pts.position.set(0, this.#arms.position.y + 0.4, 0);
    else pts.position.set(0, 0, 0);
  }

  #tickSparks(dt: number, pts: Points, vel: Float32Array, kind: 'spark' | 'weld'): void {
    const t = kind === 'spark' ? this.#sparkT : this.#weldT;
    if (t <= 0) {
      pts.visible = false;
      return;
    }
    const next = Math.max(0, t - dt);
    if (kind === 'spark') this.#sparkT = next;
    else this.#weldT = next;
    const pos = pts.geometry.getAttribute('position');
    for (let i = 0; i < 48; i++) {
      const ix = i * 3;
      pos.setX(i, pos.getX(i) + (vel[ix] ?? 0) * dt);
      pos.setY(i, pos.getY(i) + (vel[ix + 1] ?? 0) * dt);
      pos.setZ(i, pos.getZ(i) + (vel[ix + 2] ?? 0) * dt);
      vel[ix + 1] = (vel[ix + 1] ?? 0) - 8 * dt;
    }
    pos.needsUpdate = true;
    (pts.material as PointsMaterial).opacity = Math.min(1, next * 3);
    pts.visible = next > 0;
  }

  dispose(): void {
    this.#car?.dispose();
    this.#car = null;
    this.group.removeFromParent();
    this.group.traverse((object) => {
      if (object instanceof Mesh || object instanceof Points) {
        if (object.geometry && !this.#geoms.includes(object.geometry)) {
          object.geometry.dispose();
        }
      }
    });
    for (const g of this.#geoms) g.dispose();
    for (const m of this.#mats) {
      if ('map' in m && m.map) m.map.dispose();
      m.dispose();
    }
    this.#geoms.length = 0;
    this.#mats.length = 0;
  }
}

const _tmp = new Vector3();
const _wheel = new Vector3();
