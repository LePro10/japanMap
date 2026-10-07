import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

import { clusterFace } from '@/config/cabin.config';
import type { VehicleSpec } from '@/config/vehicles.config';

/**
 * Tacho in der Armatur — die 112 aus dem Forza-Referenzbild, als Vertex-Stil.
 *
 * Absichtlich unbeleuchtet (`MeshBasicMaterial`): ein Display schreibt seine
 * Zahl ins Bild, ohne Licht. Canvas nur bei geändertem km/h / Gang, nicht
 * je Frame. Node-Prüfstände erzeugen das nicht — nur der Drive-Aufbau.
 */
export class ClusterDisplay {
  readonly mesh: Mesh;
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #texture: CanvasTexture;
  #speed = Number.NaN;
  #gear = '';
  #rpm = -1;
  #race = false;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ClusterDisplay: 2D-Kontext fehlt');
    this.#canvas = canvas;
    this.#ctx = ctx;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    this.#texture = texture;
    const material = new MeshBasicMaterial({
      map: texture,
      toneMapped: false,
      fog: false,
    });
    material.name = 'ClusterDisplay';
    const geometry = new PlaneGeometry(1, 1);
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Fahrzeug:Cluster';
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.mesh = mesh;
    this.#draw(0, 'N');
  }

  pose(
    spec: VehicleSpec,
    vehiclePosition: Mesh['position'],
    vehicleQuat: Mesh['quaternion'],
    scratch: Mesh['position'],
  ): void {
    const race = spec.body.shape === 'openwheel';
    if (race !== this.#race) {
      this.#race = race;
      this.#speed = Number.NaN;
    }
    const face = clusterFace(spec);
    scratch.set(face.x, face.y, face.z).applyQuaternion(vehicleQuat);
    this.mesh.position.copy(vehiclePosition).add(scratch);
    this.mesh.quaternion.copy(vehicleQuat);
    this.mesh.rotateY(Math.PI);
    this.mesh.rotateX(-0.22);
    this.mesh.scale.set(face.width, face.height, 1);
    this.mesh.updateMatrix();
  }

  paint(kmh: number, gear: string, rpm = 0, fraction = 0): void {
    const speed = Math.max(0, Math.round(kmh));
    const rev = Math.max(0, Math.round(rpm / 50) * 50);
    if (speed === this.#speed && gear === this.#gear && rev === this.#rpm) return;
    this.#speed = speed;
    this.#gear = gear;
    this.#rpm = rev;
    this.#draw(speed, gear, rev, fraction);
    this.#texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.#texture.dispose();
  }

  #draw(speed: number, gear: string, rpm = 0, fraction = 0): void {
    const ctx = this.#ctx;
    const w = this.#canvas.width;
    const h = this.#canvas.height;
    ctx.fillStyle = this.#race ? '#07090c' : '#0b1014';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.#race ? '#101820' : '#1a2830';
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.textBaseline = 'middle';
    if (this.#race) {
      ctx.fillStyle = '#7fd0c0';
      ctx.textAlign = 'center';
      ctx.font = '700 54px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(gear, 48, h * 0.46);
      ctx.fillStyle = '#d7e6ee';
      ctx.font = '700 44px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(String(speed), w * 0.62, h * 0.42);
      ctx.fillStyle = '#8aa0aa';
      ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('km/h', w * 0.62, h * 0.72);
    } else {
      ctx.fillStyle = '#d7e6ee';
      ctx.textAlign = 'center';
      ctx.font = '700 64px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(String(speed), w * 0.5, h * 0.46);
      ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#8aa0aa';
      ctx.fillText('km/h', w * 0.84, h * 0.7);
      ctx.fillStyle = '#7fd0c0';
      ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(gear, 16, 24);
    }
    const barY = h - 14;
    const barX = 14;
    const barW = w - 28;
    ctx.fillStyle = '#0e161c';
    ctx.fillRect(barX, barY, barW, 5);
    const lit = Math.max(0, Math.min(1, fraction));
    ctx.fillStyle = lit > 0.86 ? '#e25b4a' : '#7fd0c0';
    ctx.fillRect(barX, barY, barW * lit, 5);
    ctx.fillStyle = '#6a7a82';
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${rpm}`, w - 12, barY - 6);
  }
}
