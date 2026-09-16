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
    const face = clusterFace(spec);
    scratch.set(face.x, face.y, face.z).applyQuaternion(vehicleQuat);
    this.mesh.position.copy(vehiclePosition).add(scratch);
    this.mesh.quaternion.copy(vehicleQuat);
    this.mesh.rotateY(Math.PI);
    this.mesh.rotateX(-0.22);
    this.mesh.scale.set(face.width, face.height, 1);
    this.mesh.updateMatrix();
  }

  paint(kmh: number, gear: string): void {
    const speed = Math.max(0, Math.round(kmh));
    if (speed === this.#speed && gear === this.#gear) return;
    this.#speed = speed;
    this.#gear = gear;
    this.#draw(speed, gear);
    this.#texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.#texture.dispose();
  }

  #draw(speed: number, gear: string): void {
    const ctx = this.#ctx;
    const w = this.#canvas.width;
    const h = this.#canvas.height;
    ctx.fillStyle = '#0b1014';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a2830';
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#d7e6ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 72px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(speed), w * 0.46, h * 0.5);
    ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#8aa0aa';
    ctx.textAlign = 'left';
    ctx.fillText('km/h', w * 0.72, h * 0.62);
    ctx.fillStyle = '#7fd0c0';
    ctx.font = '700 28px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(gear, 18, 28);
  }
}
