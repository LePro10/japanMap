import {
  AdditiveBlending,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
} from 'three';

import type { EngineContext } from '@/core/System';

export interface WaypointPosition {
  readonly x: number;
  readonly z: number;
}

const BEAM_HEIGHT = 900;

/**
 * Ein bewusst sehr billiger Weltmarker: ein einziges Mesh, ein Draw-Call.
 * Er ist halbtransparent, additiv und ohne Tiefentest, damit der blaue Pfosten
 * auch hinter Bergen/Gebäuden als Navigationsziel lesbar bleibt.
 */
export class WaypointMarker {
  #context: EngineContext | null = null;
  #mesh: Mesh<CylinderGeometry, MeshBasicMaterial> | null = null;
  #waypoint: WaypointPosition | null = null;

  attach(context: EngineContext): void {
    if (this.#mesh) return;
    this.#context = context;

    const geometry = new CylinderGeometry(2.2, 2.2, BEAM_HEIGHT, 8, 1, true);
    const material = new MeshBasicMaterial({
      color: 0x168cff,
      transparent: true,
      opacity: 0.42,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Waypoint:Beam';
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1000;
    context.scene.add(mesh);
    this.#mesh = mesh;
  }

  get waypoint(): WaypointPosition | null {
    return this.#waypoint;
  }

  set(x: number, z: number, groundY: number): void {
    this.#waypoint = { x, z };
    if (!this.#mesh) return;
    this.#mesh.position.set(x, groundY + BEAM_HEIGHT * 0.5, z);
    this.#mesh.visible = true;
  }

  clear(): void {
    this.#waypoint = null;
    if (this.#mesh) this.#mesh.visible = false;
  }

  dispose(): void {
    const mesh = this.#mesh;
    if (mesh) {
      this.#context?.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.#mesh = null;
    this.#waypoint = null;
    this.#context = null;
  }
}
