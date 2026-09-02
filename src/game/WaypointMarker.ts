import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';

import type { EngineContext } from '@/core/System';

export interface WaypointPosition {
  readonly x: number;
  readonly z: number;
}

const BEAM_HEIGHT = 1200;
const LABEL_Y = 72;

/**
 * Weltmarker wie in einem Open-World-Spiel: ein weit sichtbarer Beam, heller
 * Kern, Bodenring und ein immer lesbares Label. Alles bleibt extrem klein:
 * vier simple Draw-Calls existieren nur solange tatsächlich ein Waypoint steht.
 */
export class WaypointMarker {
  #context: EngineContext | null = null;
  #group: Group | null = null;
  #outerBeam: Mesh<CylinderGeometry, MeshBasicMaterial> | null = null;
  #coreBeam: Mesh<CylinderGeometry, MeshBasicMaterial> | null = null;
  #ring: Mesh<RingGeometry, MeshBasicMaterial> | null = null;
  #label: Sprite | null = null;
  #labelTexture: CanvasTexture | null = null;
  #labelCanvas: HTMLCanvasElement | null = null;
  #waypoint: WaypointPosition | null = null;
  #distanceBucket = -1;

  attach(context: EngineContext): void {
    if (this.#group) return;
    this.#context = context;

    const group = new Group();
    group.name = 'Waypoint';
    group.visible = false;
    group.frustumCulled = false;

    const outerBeam = new Mesh(
      new CylinderGeometry(5.4, 5.4, BEAM_HEIGHT, 10, 1, true),
      new MeshBasicMaterial({
        color: 0x168cff,
        transparent: true,
        opacity: 0.28,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    outerBeam.name = 'Waypoint:Beam';
    outerBeam.position.y = BEAM_HEIGHT * 0.5;
    outerBeam.frustumCulled = false;
    outerBeam.renderOrder = 1000;

    const coreBeam = new Mesh(
      new CylinderGeometry(1.35, 1.35, BEAM_HEIGHT, 8, 1, true),
      new MeshBasicMaterial({
        color: 0x8bcaff,
        transparent: true,
        opacity: 0.86,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    coreBeam.name = 'Waypoint:Core';
    coreBeam.position.y = BEAM_HEIGHT * 0.5;
    coreBeam.frustumCulled = false;
    coreBeam.renderOrder = 1001;

    const ring = new Mesh(
      new RingGeometry(10, 21, 48),
      new MeshBasicMaterial({
        color: 0x168cff,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        side: 2,
        toneMapped: false,
      }),
    );
    ring.name = 'Waypoint:Ring';
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.y = 0.32;
    ring.frustumCulled = false;
    ring.renderOrder = 1002;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    const label = new Sprite(
      new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    label.name = 'Waypoint:Label';
    label.position.y = LABEL_Y;
    label.center.set(0.5, 0.5);
    label.renderOrder = 1003;
    label.frustumCulled = false;

    group.add(outerBeam, coreBeam, ring, label);
    context.scene.add(group);

    this.#group = group;
    this.#outerBeam = outerBeam;
    this.#coreBeam = coreBeam;
    this.#ring = ring;
    this.#label = label;
    this.#labelTexture = texture;
    this.#labelCanvas = canvas;
    this.#writeLabel(0);
  }

  get waypoint(): WaypointPosition | null {
    return this.#waypoint;
  }

  set(x: number, z: number, groundY: number): void {
    this.#waypoint = { x, z };
    this.#distanceBucket = -1;
    const group = this.#group;
    if (!group) return;
    group.position.set(x, groundY, z);
    group.visible = true;
    this.#writeLabel(0);
  }

  /**
   * Nur Distanztext und Labelgröße. Die Textur wird nicht jeden Frame neu
   * gerastert, sondern erst wenn sich die Anzeige um 10 m geändert hat.
   */
  update(playerX: number, playerZ: number): void {
    const waypoint = this.#waypoint;
    const label = this.#label;
    if (!waypoint || !label) return;
    const meters = Math.hypot(waypoint.x - playerX, waypoint.z - playerZ);
    const bucket = Math.round(meters / 10);
    if (bucket !== this.#distanceBucket) {
      this.#distanceBucket = bucket;
      this.#writeLabel(meters);
    }

    // Bewusst deutlich größer als ein HUD-Label: Der Marker soll schon aus
    // großer Entfernung sofort als Navigationsziel lesbar sein.
    const width = clamp(meters * 0.14, 58, 180);
    label.scale.set(width, width * 0.27, 1);
    label.position.y = LABEL_Y + clamp(meters * 0.015, 0, 30);
  }

  clear(): void {
    this.#waypoint = null;
    this.#distanceBucket = -1;
    if (this.#group) this.#group.visible = false;
  }

  #writeLabel(meters: number): void {
    const canvas = this.#labelCanvas;
    const texture = this.#labelTexture;
    if (!canvas || !texture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    roundedRect(ctx, 18, 18, 476, 92, 20);
    ctx.fillStyle = 'rgba(3, 11, 18, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(72, 170, 255, 0.95)';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = '#168cff';
    ctx.fillRect(18, 18, 13, 92);
    ctx.fillStyle = '#eef8ff';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('WAYPOINT', 53, 52);
    ctx.fillStyle = '#9fd2ff';
    ctx.font = '700 29px ui-monospace, monospace';
    ctx.fillText(formatDistance(meters), 53, 89);
    texture.needsUpdate = true;
  }

  dispose(): void {
    const group = this.#group;
    if (group) this.#context?.scene.remove(group);

    this.#outerBeam?.geometry.dispose();
    this.#outerBeam?.material.dispose();
    this.#coreBeam?.geometry.dispose();
    this.#coreBeam?.material.dispose();
    this.#ring?.geometry.dispose();
    this.#ring?.material.dispose();
    const labelMaterial = this.#label?.material;
    if (labelMaterial instanceof SpriteMaterial) labelMaterial.dispose();
    this.#labelTexture?.dispose();

    this.#group = null;
    this.#outerBeam = null;
    this.#coreBeam = null;
    this.#ring = null;
    this.#label = null;
    this.#labelTexture = null;
    this.#labelCanvas = null;
    this.#waypoint = null;
    this.#context = null;
  }
}

function formatDistance(meters: number): string {
  if (meters < 999.5) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
