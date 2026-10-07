import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { VehicleSpec } from '@/config/vehicles.config';
import { engineLook, type EngineLook } from '@/config/engines.config';
import type { TuneTier } from '@/config/tuning.config';
import { PropMaterial } from '@/world/materials/PropMaterial';
import { engineLocal } from './garageLayout';

export { beltHeight, engineLook, type EngineLook } from '@/config/engines.config';

/**
 * Animated bay engine. Static metal is one mesh; fan, pulley, cover and
 * glow stay separate so they can move without rebuilding the car.
 *
 * Sized to sit *in* the bay: the old stack (block + cover + intake) poked
 * through the bonnet plane. Everything here stays below the belt so a closed
 * hood is a hood, not a hole, and an open hood still frames the engine.
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
function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, rz = 0): BufferGeometry {
  const g = paint(new BoxGeometry(w, h, d), hex);
  if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
}

const BLOCK = 0x1c2228;
const ALU = 0x9aa3ad;
const STEEL = 0x6a7380;
const DARK = 0x14161a;
const COPPER = 0x8a5a3a;
const GOLD = 0xc4a35a;
const RED = 0xb42318;
const BLACK = 0x1a1c20;
const HOSE = 0x2a1c14;

function trumpets(out: BufferGeometry[], count: number, y: number, z: number, hex: number, spread = 0.09): void {
  const origin = -((count - 1) * spread) / 2;
  for (let i = 0; i < count; i++) {
    out.push(paint(new CylinderGeometry(0.022, 0.032, 0.055, 8), hex).translate(origin + i * spread, y, z));
  }
}

function staticParts(look: EngineLook): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const long = look.layout === 'i6t' || look.layout === 'v6tt' ? 0.78 : look.layout === 'i3' ? 0.46 : 0.6;
  const wide = look.layout === 'v8' ? 0.52 : look.layout === 'v6' || look.layout === 'v6tt' || look.layout === 'race' ? 0.48 : 0.36;
  out.push(box(wide, 0.22, long, 0, 0, 0, BLOCK));
  if (look.layout === 'v8' || look.layout === 'v6' || look.layout === 'v6tt' || look.layout === 'race') {
    const lean = look.layout === 'v8' ? 0.38 : 0.3;
    out.push(box(0.16, 0.13, long * 0.84, -0.14, 0.1, 0, BLOCK, lean));
    out.push(box(0.16, 0.13, long * 0.84, 0.14, 0.1, 0, BLOCK, -lean));
  }
  out.push(box(0.11, 0.08, 0.14, wide * 0.52, 0.0, long * 0.26, STEEL));
  out.push(box(0.04, 0.035, long * 0.62, -wide * 0.4, -0.08, 0, COPPER));
  out.push(box(0.04, 0.035, long * 0.5, wide * 0.4, -0.08, 0.03, COPPER));
  out.push(box(0.03, 0.03, long * 0.4, wide * 0.38, 0.04, -0.04, HOSE));
  out.push(box(0.08, 0.05, 0.1, -wide * 0.42, 0.08, long * 0.18, BLACK));
  if (look.layout === 'i3') trumpets(out, 3, 0.16, 0.05, ALU, 0.09);
  else if (look.layout === 'i4' || look.layout === 'i4t') trumpets(out, 4, 0.16, 0.05, ALU);
  else if (look.layout === 'i6t') trumpets(out, 6, 0.16, 0.03, ALU, 0.075);
  else if (look.layout === 'race') trumpets(out, 6, 0.17, 0.02, GOLD, 0.07);
  if (look.layout === 'i4t' || look.layout === 'i6t') {
    out.push(paint(new CylinderGeometry(0.055, 0.07, 0.08, 10), STEEL).rotateZ(Math.PI / 2).translate(wide * 0.5, -0.03, -long * 0.24));
  }
  if (look.layout === 'v6tt') {
    out.push(paint(new CylinderGeometry(0.05, 0.065, 0.07, 10), STEEL).rotateZ(Math.PI / 2).translate(-wide * 0.46, -0.02, -long * 0.2));
    out.push(paint(new CylinderGeometry(0.05, 0.065, 0.07, 10), STEEL).rotateZ(Math.PI / 2).translate(wide * 0.46, -0.02, -long * 0.2));
  }
  if (look.layout === 'v8') {
    out.push(box(0.06, 0.12, 0.06, -0.1, 0.22, 0.14, GOLD));
    out.push(box(0.06, 0.12, 0.06, 0.1, 0.22, 0.14, GOLD));
  }
  if (look.layout === 'race') {
    out.push(box(0.28, 0.06, 0.22, 0, 0.22, -0.1, DARK));
    out.push(box(0.18, 0.04, 0.32, 0, -0.12, -0.16, STEEL));
  }
  // Alternator + belt path so the front of the bay is not a blank block.
  out.push(paint(new CylinderGeometry(0.045, 0.045, 0.05, 10), ALU).rotateZ(Math.PI / 2).translate(-wide * 0.38, -0.04, long * 0.28));
  out.push(box(0.02, 0.09, 0.02, -wide * 0.22, 0.02, long * 0.3, BLACK));
  return out;
}

function coverHex(look: EngineLook, tier: TuneTier): number {
  if (tier === 2) return look.layout === 'v8' || look.layout === 'race' ? GOLD : RED;
  if (tier === 1) return look.layout === 'i3' ? 0x3a6a8a : 0x2c3540;
  return look.layout === 'race' ? DARK : ALU;
}

function makeFan(material: PropMaterial): Group {
  const group = new Group();
  group.add(new Mesh(paint(new CylinderGeometry(0.04, 0.04, 0.035, 10), STEEL), material));
  for (let i = 0; i < 5; i++) {
    const blade = new Mesh(box(0.13, 0.01, 0.032, 0.065, 0, 0, ALU), material);
    blade.rotation.z = (i / 5) * Math.PI * 2;
    group.add(blade);
  }
  return group;
}

export class EngineBay {
  readonly group = new Group();
  readonly look: EngineLook;
  readonly #fan: Group;
  readonly #pulley: Mesh;
  readonly #cover: Mesh;
  readonly #intake: Mesh;
  readonly #coils: Mesh;
  readonly #glow: Mesh;
  readonly #turbo: Mesh | null;
  readonly #geoms: BufferGeometry[] = [];
  readonly #glowMat: MeshStandardMaterial;
  readonly #coverMat: MeshStandardMaterial;
  readonly #coilMat: MeshStandardMaterial;
  #tier: TuneTier = 0;
  #t = 0;
  #blip = 0;
  #install = 0;
  #coverPop = 0;
  readonly #baseY: number;
  readonly #coverY: number;

  constructor(spec: VehicleSpec, material: PropMaterial) {
    this.look = engineLook(spec.id);
    this.group.name = `Engine:${spec.id}`;
    const parts = staticParts(this.look);
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) throw new Error(`Engine: ${spec.id}`);
    this.#geoms.push(merged);
    this.group.add(new Mesh(merged, material));

    this.#coverMat = new MeshStandardMaterial({
      color: coverHex(this.look, 0),
      roughness: 0.45,
      metalness: 0.35,
      flatShading: true,
    });
    const long = this.look.layout === 'i6t' || this.look.layout === 'v6tt' ? 0.66 : this.look.layout === 'i3' ? 0.36 : 0.48;
    const wide = this.look.layout === 'v8' ? 0.42 : 0.3;
    const coverGeom = new BoxGeometry(wide, 0.055, long);
    this.#geoms.push(coverGeom);
    this.#cover = new Mesh(coverGeom, this.#coverMat);
    this.#coverY = 0.14;
    this.#cover.position.set(0, this.#coverY, 0);
    this.group.add(this.#cover);

    const intakeGeom = paint(new BoxGeometry(wide * 0.62, 0.06, 0.16), ALU);
    this.#geoms.push(intakeGeom);
    this.#intake = new Mesh(intakeGeom, material);
    this.#intake.position.set(0, 0.2, 0.18);
    this.group.add(this.#intake);

    this.#coilMat = new MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.55,
      metalness: 0.2,
      flatShading: true,
    });
    const coilGeom = new BoxGeometry(wide * 0.72, 0.03, long * 0.7);
    this.#geoms.push(coilGeom);
    this.#coils = new Mesh(coilGeom, this.#coilMat);
    this.#coils.position.set(0, 0.175, 0);
    this.group.add(this.#coils);

    this.#fan = makeFan(material);
    this.#fan.position.set(wide * 0.02, 0.02, long * 0.5);
    this.group.add(this.#fan);

    const pulleyGeom = paint(new CylinderGeometry(0.042, 0.042, 0.026, 12), STEEL);
    this.#geoms.push(pulleyGeom);
    this.#pulley = new Mesh(pulleyGeom, material);
    this.#pulley.rotation.z = Math.PI / 2;
    this.#pulley.position.set(-wide * 0.38, -0.03, long * 0.16);
    this.group.add(this.#pulley);

    if (this.look.turbo) {
      const snail = paint(new CylinderGeometry(0.045, 0.058, 0.065, 10), STEEL);
      snail.rotateZ(Math.PI / 2);
      this.#geoms.push(snail);
      this.#turbo = new Mesh(snail, material);
      this.#turbo.position.set(wide * 0.42, -0.04, -long * 0.26);
      this.group.add(this.#turbo);
    } else this.#turbo = null;

    this.#glowMat = new MeshStandardMaterial({
      color: 0x1a0806,
      emissive: this.look.glow,
      emissiveIntensity: 0.4,
      roughness: 0.6,
      transparent: true,
      opacity: 0.85,
    });
    const glowGeom = new BoxGeometry(wide * 0.7, 0.016, long * 0.62);
    this.#geoms.push(glowGeom);
    this.#glow = new Mesh(glowGeom, this.#glowMat);
    this.#glow.position.set(0, 0.175, 0);
    this.group.add(this.#glow);

    const local = engineLocal(spec);
    this.#baseY = local.y;
    this.group.position.set(local.x, local.y, local.z);
    if (this.look.rear) this.group.rotation.y = Math.PI;
    this.setTier(0);
  }

  setTier(tier: TuneTier): void {
    if (tier !== this.#tier) this.#coverPop = 1;
    this.#tier = tier;
    this.#coverMat.color.setHex(coverHex(this.look, tier), 'srgb');
    this.#coverMat.metalness = tier === 2 ? 0.62 : 0.3;
    this.#coverMat.roughness = tier === 2 ? 0.22 : 0.5;
    this.#coilMat.color.setHex(tier === 2 ? RED : tier === 1 ? 0x2c3540 : 0x1a1c20, 'srgb');
    this.#intake.visible = tier > 0 || this.look.layout === 'race';
    if (this.#turbo) this.#turbo.scale.setScalar(0.9 + tier * 0.12);
  }

  pulse(): void {
    this.#install = 1;
    this.#blip = 1;
    this.#coverPop = 1;
  }

  blip(): void {
    this.#blip = 1;
  }

  update(dt: number, live: boolean): void {
    this.#t += dt;
    if (this.#install > 0) this.#install = Math.max(0, this.#install - dt * 2.4);
    if (this.#blip > 0) this.#blip = Math.max(0, this.#blip - dt * 1.6);
    if (this.#coverPop > 0) this.#coverPop = Math.max(0, this.#coverPop - dt * 2.6);
    const rev = (live ? 1 : 0.35) + this.#tier * 0.45 + this.#blip * 2.2;
    const spin = this.#t * this.look.fanHz * rev;
    this.#fan.rotation.z = spin;
    this.#pulley.rotation.x = spin * 1.7;
    if (this.#turbo) this.#turbo.rotation.x = spin * 3.2;
    const shake = (0.0014 + this.#tier * 0.0018) * (1 + this.#blip * 2);
    this.group.position.y = this.#baseY + Math.sin(this.#t * (22 + this.#tier * 10)) * shake;
    const yaw = this.look.rear ? Math.PI : 0;
    this.group.rotation.y = yaw;
    this.group.rotation.z = Math.sin(this.#t * 26) * shake * 4;
    const drop = this.#install > 0 ? (1 - this.#install) * (1 - this.#install) : 1;
    this.group.scale.setScalar(0.9 + 0.1 * drop + this.#install * 0.03);
    const pop = Math.sin(this.#coverPop * Math.PI) * 0.1;
    this.#cover.position.y = this.#coverY + pop;
    this.#coils.position.y = 0.175 + pop * 0.6;
    const intakeScale = 0.82 + this.#tier * 0.16;
    this.#intake.scale.setScalar(intakeScale);
    const heat = 0.35 + this.#tier * 0.4 + this.#blip * 1.2 + Math.sin(this.#t * 9) * 0.12;
    this.#glowMat.emissiveIntensity = heat;
    this.#glow.visible = live || this.#tier > 0 || this.#blip > 0;
  }

  glowColor(): number {
    return this.look.glow;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.#geoms) g.dispose();
    this.#glowMat.dispose();
    this.#coverMat.dispose();
    this.#coilMat.dispose();
    this.#fan.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
  }
}
