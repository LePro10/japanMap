import {
  AdditiveBlending,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three';

import { WAYPOINT } from '@/config/waypoint.config';
import type { EngineContext } from '@/core/System';
import { pinScreen, type PinScreen } from './waypointScreen';

export interface WaypointPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly label: string;
}

const _world = new Vector3();
const _view = new Vector3();

/**
 * Weltmarker ohne Text. Der Text war ein Sprite in Weltmetern und ist
 * genau deshalb je nach Standpunkt zu groß, zu klein oder unsichtbar
 * gewesen — Begründung in `waypoint.config.ts`. Was hier bleibt: Schaft,
 * Ring, Pin. Lesbare Schrift sitzt im HUD.
 */
export class WaypointMarker {
  #context: EngineContext | null = null;
  #group: Group | null = null;
  #ring: Mesh<RingGeometry, MeshBasicMaterial> | null = null;
  #pin: Mesh<ConeGeometry, MeshBasicMaterial> | null = null;
  #waypoint: WaypointPosition | null = null;
  #pulse = 0;
  #screen: PinScreen | null = null;

  attach(context: EngineContext): void {
    if (this.#group) return;
    this.#context = context;

    const group = new Group();
    group.name = 'Waypoint';
    group.visible = false;
    group.frustumCulled = false;

    const outerBeam = new Mesh(
      new CylinderGeometry(1.4, 2.1, WAYPOINT.beamHeight, 12, 1, true),
      new MeshBasicMaterial({
        color: 0x66d7f4,
        transparent: true,
        opacity: WAYPOINT.beamOpacity,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    outerBeam.name = 'Waypoint:Beam';
    outerBeam.position.y = WAYPOINT.beamHeight * 0.5;
    outerBeam.frustumCulled = false;
    outerBeam.renderOrder = 1000;

    const coreBeam = new Mesh(
      new CylinderGeometry(0.28, 0.42, WAYPOINT.beamHeight, 8, 1, true),
      new MeshBasicMaterial({
        color: 0xffe1a3,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    coreBeam.name = 'Waypoint:Core';
    coreBeam.position.y = WAYPOINT.beamHeight * 0.5;
    coreBeam.frustumCulled = false;
    coreBeam.renderOrder = 1001;

    const ring = new Mesh(
      new RingGeometry(WAYPOINT.ringInner, WAYPOINT.ringOuter, 48),
      new MeshBasicMaterial({
        color: 0x66d7f4,
        transparent: true,
        opacity: 0.85,
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

    const pin = new Mesh(
      new ConeGeometry(WAYPOINT.pinRadius * 1.35, WAYPOINT.pinHeight, 10),
      new MeshBasicMaterial({
        color: 0x3ee0ff,
        transparent: true,
        opacity: 0.92,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    pin.name = 'Waypoint:Pin';
    pin.rotation.x = Math.PI;
    pin.position.y = WAYPOINT.pinHeight * 0.5 + 0.4;
    pin.frustumCulled = false;
    pin.renderOrder = 1003;

    const head = new Mesh(
      new SphereGeometry(WAYPOINT.pinRadius * 1.15, 12, 10),
      new MeshBasicMaterial({
        color: 0xe8ba7f,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    head.position.y = WAYPOINT.pinHeight + 0.55;
    head.frustumCulled = false;
    head.renderOrder = 1004;

    group.add(outerBeam, coreBeam, ring, pin, head);
    context.scene.add(group);

    this.#group = group;
    this.#ring = ring;
    this.#pin = pin;
  }

  get waypoint(): WaypointPosition | null {
    return this.#waypoint;
  }

  get screen(): PinScreen | null {
    return this.#screen;
  }

  set(x: number, z: number, groundY: number, label = 'Waypoint'): void {
    this.#waypoint = { x, y: groundY, z, label };
    const group = this.#group;
    if (!group) return;
    group.position.set(x, groundY, z);
    group.visible = true;
  }

  update(
    playerX: number,
    playerZ: number,
    dt = 0,
    camera: PerspectiveCamera | null = null,
    viewW = 0,
    viewH = 0,
  ): void {
    const waypoint = this.#waypoint;
    const ring = this.#ring;
    if (!waypoint) {
      this.#screen = null;
      return;
    }

    this.#pulse += dt;
    if (ring) {
      const wave = 1 + 0.14 * Math.sin(this.#pulse * 3.2);
      ring.scale.setScalar(wave);
      ring.material.opacity = 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(this.#pulse * 3.2));
    }

    const meters = Math.hypot(waypoint.x - playerX, waypoint.z - playerZ);
    const pin = this.#pin;
    if (pin) {
      const scale = clamp(1 + meters * 0.0012, 1, 3.2);
      pin.scale.setScalar(scale);
    }

    if (!camera || viewW < 8 || viewH < 8) {
      this.#screen = null;
      return;
    }
    if (meters < WAYPOINT.pinHideMeters) {
      this.#screen = null;
      return;
    }

    _world.set(waypoint.x, waypoint.y + WAYPOINT.pinHeight + 1.2, waypoint.z);
    _view.copy(_world).applyMatrix4(camera.matrixWorldInverse);
    const inFront = _view.z < 0;
    _world.project(camera);
    this.#screen = pinScreen(_world.x, _world.y, inFront, viewW, viewH);
  }

  clear(): void {
    this.#waypoint = null;
    this.#screen = null;
    if (this.#group) this.#group.visible = false;
  }

  dispose(): void {
    const group = this.#group;
    if (group) {
      this.#context?.scene.remove(group);
      group.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          if (child.material instanceof MeshBasicMaterial) child.material.dispose();
        }
      });
    }
    this.#group = null;
    this.#ring = null;
    this.#pin = null;
    this.#waypoint = null;
    this.#screen = null;
    this.#context = null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
