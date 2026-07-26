import { Mesh, PlaneGeometry, type PerspectiveCamera } from 'three';

import { WATER } from '@/config/water.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import type { LookState } from '@/render/looks/lookState';
import {
  createWaterUniforms,
  WaterMaterial,
  type WaterUniforms,
} from './materials/WaterMaterial';

/**
 * Das Meer — PLAN.md P2 / 2.4.
 *
 * Eine einzige Ebene auf y = 0, die der Kamera folgt. Zwei Dreiecke; alles
 * Übrige passiert im Fragment-Shader.
 *
 * Der Fluss aus dem Plan fehlt hier bewusst: er läuft entlang eines Splines und
 * kann erst gebaut werden, wenn das Spline-System aus P3 steht.
 *
 * Wird **vor** dem TerrainSystem registriert — es wartet auf `terrain:ready`,
 * und dieses Ereignis kommt genau einmal, während das Terrain initialisiert.
 */
export class WaterSystem implements System {
  readonly name = 'WaterSystem';

  #context: EngineContext | null = null;
  #camera: PerspectiveCamera | null = null;
  #mesh: Mesh | null = null;
  #material: WaterMaterial | null = null;
  #uniforms: WaterUniforms | null = null;

  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  init(context: EngineContext): void {
    this.#context = context;
    this.#camera = context.camera;

    context.bus.on('terrain:ready', ({ height }) => {
      const uniforms = createWaterUniforms();
      this.#uniforms = uniforms;

      const material = new WaterMaterial(uniforms, height, this.atmosphere);
      this.#material = material;

      const geometry = new PlaneGeometry(WATER.extent, WATER.extent, 1, 1);
      geometry.rotateX(-Math.PI / 2);

      const mesh = new Mesh(geometry, material);
      mesh.name = 'Meer';
      // Die Ebene ist größer als jedes Sichtvolumen und folgt der Kamera —
      // Culling könnte hier nur falsch liegen und kostet zwei Dreiecke nichts.
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      this.#mesh = mesh;

      context.scene.add(mesh);
      this.#registerDebug(context);
    });

    context.bus.on('look:apply', ({ look }) => {
      this.#applyLook(look);
    });
    context.bus.on('look:collect', ({ target }) => {
      this.#collectLook(target);
    });
  }

  /**
   * Die Ebene bleibt unter der Kamera stehen.
   *
   * Sie deckt 12 km ab, die Sichtweite reicht 6 km — an der Weltkante läge der
   * Rand sonst im Bild. Wellen und Küstenlinie hängen an der **Welt**position
   * im Shader, das Mitführen verschiebt sie deshalb nicht.
   */
  update(): void {
    const mesh = this.#mesh;
    const camera = this.#camera;
    if (!mesh || !camera) return;

    mesh.position.set(camera.position.x, 0, camera.position.z);
    mesh.updateMatrix();
  }

  #applyLook(look: LookState): void {
    const uniforms = this.#uniforms;
    const material = this.#material;
    if (!uniforms || !material) return;

    uniforms.uWaterDeepColor.value.set(look.water.deepColorHex).convertSRGBToLinear();
    uniforms.uWaterShallowColor.value.set(look.water.shallowColorHex).convertSRGBToLinear();
    uniforms.uWaterRoughness.value = look.water.roughness;
    uniforms.uWaterFoam.value.z = look.water.foamIntensity;
  }

  #collectLook(target: LookState): void {
    const uniforms = this.#uniforms;
    if (!uniforms) return;

    target.water.deepColorHex = `#${uniforms.uWaterDeepColor.value
      .clone()
      .convertLinearToSRGB()
      .getHexString()}`;
    target.water.shallowColorHex = `#${uniforms.uWaterShallowColor.value
      .clone()
      .convertLinearToSRGB()
      .getHexString()}`;
    target.water.roughness = uniforms.uWaterRoughness.value;
    target.water.foamIntensity = uniforms.uWaterFoam.value.z;
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Wasser');
    const uniforms = this.#uniforms;
    const mesh = this.#mesh;
    if (!folder || !uniforms || !mesh) return;

    folder.addBinding(mesh, 'visible', { label: 'Sichtbar' });
    folder.addBinding(uniforms.uWaterDeepColor, 'value', {
      label: 'Tiefes Wasser',
      color: { type: 'float' },
    });
    folder.addBinding(uniforms.uWaterShallowColor, 'value', {
      label: 'Flaches Wasser',
      color: { type: 'float' },
    });
    folder.addBinding(uniforms.uWaterRoughness, 'value', {
      label: 'Rauheit',
      min: 0,
      max: 0.4,
      step: 0.005,
    });
    folder.addBinding(uniforms.uWaterDepthFade, 'value', {
      label: 'Tiefenverlauf (m)',
      min: 0.5,
      max: 30,
      step: 0.5,
    });
    folder.addBinding(uniforms.uWaterFoam.value, 'x', {
      label: 'Schaum — Tiefe (m)',
      min: 0,
      max: 4,
      step: 0.05,
    });
    folder.addBinding(uniforms.uWaterFoam.value, 'y', {
      label: 'Schaum — Breite (m)',
      min: 0.05,
      max: 4,
      step: 0.05,
    });
    folder.addBinding(uniforms.uWaterFoam.value, 'z', {
      label: 'Schaum — Stärke',
      min: 0,
      max: 2,
      step: 0.01,
    });
    folder.addBinding(uniforms.uWaterEdgeFade, 'value', {
      label: 'Uferkante (m)',
      min: 0.05,
      max: 4,
      step: 0.05,
    });
    folder.addBinding(uniforms.uWaterSteepness, 'value', {
      label: 'Wellenneigung',
      x: { min: 0, max: 0.5, step: 0.005 },
      y: { min: 0, max: 0.5, step: 0.005 },
      z: { min: 0, max: 0.5, step: 0.005 },
    });
  }

  dispose(): void {
    if (this.#mesh) {
      this.#context?.scene.remove(this.#mesh);
      this.#mesh.geometry.dispose();
      this.#mesh = null;
    }
    this.#material?.dispose();
    this.#material = null;
    this.#uniforms = null;
    this.#camera = null;
    this.#context = null;
  }
}
