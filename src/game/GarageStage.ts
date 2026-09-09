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
import type { CarTune, TuneCategory } from '@/config/tuning.config';
import { GarageCar } from './garageCar';

/**
 * Indoor Open Bay — only lives while the tune overlay is open.
 *
 * Placed at the real Open Bay pad so the dusk sky and sakura sit in the open
 * doorway. The driving car is hidden; this is a presentation clone on a
 * two-post lift, matching the workshop the screenshot asked for without a
 * second renderer.
 */
const RED = 0xb42318;
const CONCRETE = 0x3a3f44;
const STEEL = 0x1c2228;
const WARM = 0xffc077;

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
  readonly #lights: PointLight[] = [];
  readonly #neon: PointLight;
  readonly #engineLight: PointLight;
  readonly #sparks: Points;
  readonly #sparkVel: Float32Array;
  readonly #sparkLife: Float32Array;
  readonly #geoms: BufferGeometry[] = [];
  readonly #mats: Array<MeshStandardMaterial | MeshBasicMaterial | PointsMaterial> = [];
  #car: GarageCar | null = null;
  #lift01 = 0;
  #pulse = 0;
  #focus: TuneCategory | 'setup' | null = null;
  #sparkT = 0;
  #flicker = 0;

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

    // Floor 16 × 12 m, walls on three sides, open toward −Z (the doorway).
    const floor = boxMesh(16.4, 0.18, 12.4, floorMat, 0, -0.09, 0);
    this.group.add(floor);
    this.group.add(boxMesh(16.4, 5.6, 0.28, wallMat, 0, 2.8, 6.1));
    this.group.add(boxMesh(0.28, 5.6, 12.4, wallMat, -8.1, 2.8, 0));
    this.group.add(boxMesh(0.28, 5.6, 12.4, wallMat, 8.1, 2.8, 0));
    this.group.add(boxMesh(16.4, 0.22, 12.6, wallMat, 0, 5.7, 0.1));

    const lineMat = new MeshBasicMaterial({ color: 0xe8ba7f });
    this.#mats.push(lineMat);
    for (const z of [-3.2, 3.2]) {
      const line = new Mesh(new BoxGeometry(4.6, 0.02, 0.08), lineMat);
      line.position.set(0, 0.02, z);
      this.group.add(line);
    }
    for (const x of [-2.3, 2.3]) {
      const line = new Mesh(new BoxGeometry(0.08, 0.02, 6.4), lineMat);
      line.position.set(x, 0.02, 0);
      this.group.add(line);
    }

    this.#lift = new Group();
    this.#lift.name = 'Lift';
    for (const x of [-2.15, 2.15]) {
      this.#lift.add(boxMesh(0.22, 4.4, 0.22, redMat, x, 2.2, -1.6));
      this.#lift.add(boxMesh(0.22, 4.4, 0.22, redMat, x, 2.2, 1.6));
      this.#lift.add(boxMesh(0.22, 0.18, 3.4, redMat, x, 4.35, 0));
    }
    this.#arms = new Group();
    this.#arms.add(boxMesh(4.5, 0.1, 0.16, steelMat, 0, 0, -1.15));
    this.#arms.add(boxMesh(4.5, 0.1, 0.16, steelMat, 0, 0, 1.15));
    this.#arms.add(boxMesh(0.7, 0.08, 0.7, steelMat, -1.6, 0.08, -1.15));
    this.#arms.add(boxMesh(0.7, 0.08, 0.7, steelMat, 1.6, 0.08, -1.15));
    this.#arms.add(boxMesh(0.7, 0.08, 0.7, steelMat, -1.6, 0.08, 1.15));
    this.#arms.add(boxMesh(0.7, 0.08, 0.7, steelMat, 1.6, 0.08, 1.15));
    this.#lift.add(this.#arms);
    this.group.add(this.#lift);

    // Overhead work lamps — unlit strips, plus point lights that actually
    // light the car. Colour is warm on purpose: dusk outside, tungsten in here.
    for (const x of [-2.4, 2.4]) {
      this.group.add(boxMesh(0.18, 0.08, 3.4, lampMat, x, 5.35, 0));
      const light = new PointLight(WARM, 220, 16, 2);
      light.position.set(x, 5.1, 0.4);
      this.#lights.push(light);
      this.group.add(light);
    }
    const fill = new PointLight(0x88a0b8, 90, 18, 2);
    fill.position.set(0, 3.6, -4.5);
    this.#lights.push(fill);
    this.group.add(fill);

    this.#neon = new PointLight(0xff2a40, 0, 8, 2);
    this.#neon.position.set(0, 0.6, 2.2);
    this.group.add(this.#neon);
    this.#engineLight = new PointLight(0xff4a2a, 0, 6, 2);
    this.#engineLight.position.set(0, 1.4, 1.1);
    this.group.add(this.#engineLight);

    this.#buildProps(steelMat, redMat);
    this.#sparks = this.#makeSparks();
    this.#sparkVel = new Float32Array(48 * 3);
    this.#sparkLife = new Float32Array(48);
    this.group.add(this.#sparks);

    this.group.rotation.y = 0;
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

  #buildProps(steel: MeshStandardMaterial, red: MeshStandardMaterial): void {
    // Tyre rack on the left wall.
    const tire = new MeshStandardMaterial({ color: 0x16181b, roughness: 0.9, metalness: 0 });
    this.#mats.push(tire);
    for (let i = 0; i < 6; i++) {
      const ring = new Mesh(new TorusGeometry(0.32, 0.09, 6, 16), tire);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-7.55, 0.7 + (i % 3) * 0.85, -2.2 + Math.floor(i / 3) * 1.1);
      this.group.add(ring);
      this.#geoms.push(ring.geometry);
    }
    this.group.add(boxMesh(0.9, 0.7, 1.6, steel, 7.2, 0.35, 3.4));
    this.group.add(boxMesh(0.7, 1.1, 0.5, red, 7.25, 0.9, 2.4));

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
    plate.position.set(0, 4.6, 5.9);
    this.group.add(plate);
    this.#geoms.push(plate.geometry);
  }

  #makeSparks(): Points {
    const positions = new Float32Array(48 * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.#geoms.push(g);
    const mat = new PointsMaterial({
      color: 0xffb45e,
      size: 0.06,
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

  attach(scene: Scene, x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    scene.add(this.group);
  }

  setCar(id: VehicleId): void {
    this.#car?.dispose();
    const spec = VEHICLES[id];
    const car = new GarageCar(spec, this.#atmosphere);
    car.group.rotation.y = Math.PI;
    this.#car = car;
    this.#arms.add(car.group);
    this.#syncCarHeight();
  }

  setLift(height01: number): void {
    this.#lift01 = Math.max(0, Math.min(1, height01));
    this.#syncCarHeight();
  }

  setHood(open01: number): void {
    this.#car?.setHood(open01);
  }

  setTuneVisual(tune: CarTune, focus: TuneCategory | 'setup' | null): void {
    this.#focus = focus;
    this.#car?.setTuneVisual(tune, focus);
    const any = tune.engine + tune.brakes + tune.steering + tune.tyres > 0;
    this.#neon.intensity = any ? 40 : 0;
    const glow = this.#car?.engineGlow() ?? 0xff4a2a;
    this.#engineLight.color.setHex(glow);
    this.#engineLight.intensity = focus === 'engine' ? 90 : tune.engine > 0 ? 22 : 0;
  }

  pulseInstall(engine = false): void {
    this.#pulse = 1;
    this.#burst();
    if (engine) this.#car?.pulseEngine();
    else this.#car?.blipEngine();
  }

  blipEngine(): void {
    this.#car?.blipEngine();
  }

  carCenter(target: Vector3): Vector3 {
    const y = 0.55 + this.#lift01 * 1.15 + Math.sin(this.#pulse * Math.PI) * 0.08;
    return target.set(this.group.position.x, this.group.position.y + y, this.group.position.z);
  }

  update(dt: number): void {
    if (this.#pulse > 0) {
      this.#pulse = Math.max(0, this.#pulse - dt * 2.8);
      this.#syncCarHeight();
    }
    this.#car?.update(dt, this.#focus);
    this.#flicker += dt;
    for (const [i, light] of this.#lights.entries()) {
      light.intensity = (i < 2 ? 220 : 90) + Math.sin(this.#flicker * 6 + i * 1.7) * 6;
    }
    if (this.#sparkT > 0) {
      this.#sparkT = Math.max(0, this.#sparkT - dt);
      const pos = this.#sparks.geometry.getAttribute('position');
      for (let i = 0; i < 48; i++) {
        this.#sparkLife[i] = Math.max(0, (this.#sparkLife[i] ?? 0) - dt);
        const ix = i * 3;
        pos.setX(i, pos.getX(i) + (this.#sparkVel[ix] ?? 0) * dt);
        pos.setY(i, pos.getY(i) + (this.#sparkVel[ix + 1] ?? 0) * dt);
        pos.setZ(i, pos.getZ(i) + (this.#sparkVel[ix + 2] ?? 0) * dt);
        this.#sparkVel[ix + 1] = (this.#sparkVel[ix + 1] ?? 0) - 6 * dt;
      }
      pos.needsUpdate = true;
      (this.#sparks.material as PointsMaterial).opacity = Math.min(1, this.#sparkT * 3);
      this.#sparks.visible = this.#sparkT > 0;
    }
  }

  #syncCarHeight(): void {
    const bounce = Math.sin(this.#pulse * Math.PI) * 0.08;
    this.#arms.position.y = 0.42 + this.#lift01 * 1.15 + bounce;
  }

  #burst(): void {
    this.#sparkT = 0.45;
    const pos = this.#sparks.geometry.getAttribute('position');
    for (let i = 0; i < 48; i++) {
      const a = Math.random() * Math.PI * 2;
      pos.setXYZ(i, Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.4);
      this.#sparkVel[i * 3] = Math.cos(a) * (1 + Math.random() * 2);
      this.#sparkVel[i * 3 + 1] = 2 + Math.random() * 3;
      this.#sparkVel[i * 3 + 2] = Math.sin(a) * (1 + Math.random() * 2);
      this.#sparkLife[i] = 0.3 + Math.random() * 0.2;
    }
    pos.needsUpdate = true;
    this.#sparks.position.set(0, this.#arms.position.y + 0.4, 0);
    this.#sparks.visible = true;
  }

  dispose(): void {
    this.#car?.dispose();
    this.#car = null;
    this.group.removeFromParent();
    this.group.traverse((object) => {
      if (object instanceof Mesh || object instanceof Points) {
        if (object.geometry && !this.#geoms.includes(object.geometry)) {
          // Shared box geometries from boxMesh — dispose once via this walk
          // only if nobody else holds them. Each boxMesh has its own geometry.
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
