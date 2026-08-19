import { Mesh, PlaneGeometry, type PerspectiveCamera } from 'three';

import { WATER } from '@/config/water.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import type { LookState } from '@/render/looks/lookState';
import type { TerrainHeightUniforms } from './materials/TerrainMaterial';
import {
  createWaterUniforms,
  WaterMaterial,
  type WaterUniforms,
} from './materials/WaterMaterial';
import { TERRAIN_ASSETS } from './terrainAssets';
import {
  buildRiverGeometry,
  type RiverFile,
  type RiverGeometryReport,
} from './water/riverGeometry';

/**
 * Das Meer — PLAN.md P2 / 2.4.
 *
 * Eine einzige Ebene auf y = 0, die der Kamera folgt. Zwei Dreiecke; alles
 * Übrige passiert im Fragment-Shader.
 *
 * ~~Der Fluss aus dem Plan fehlt hier bewusst: er läuft entlang eines Splines
 * und kann erst gebaut werden, wenn das Spline-System aus P3 steht.~~ Seit P8.6
 * ist er da — und er brauchte das Spline-System nie: seine Trasse entsteht im
 * Baker, indem sie dem Gefälle folgt, und liegt als river.json vor.
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
  #riverMesh: Mesh | null = null;
  #riverMaterial: WaterMaterial | null = null;
  #riverUniforms: WaterUniforms | null = null;
  #riverReport: RiverGeometryReport | null = null;

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
      void this.#addRiver(context, height);
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

  /**
   * Kielwelle des Fahrzeugs in beide Wassermaterialien schreiben.
   *
   * Zwei Uniform-Blöcke (Meer und Fluss), dieselbe Zahl — sonst stünde die
   * Spur nur auf dem Meer und der Fluss bliebe glatt. `active === false`
   * schaltet den Shader-Zweig aus; die Kosten dort sind ein Vergleich.
   */
  setVehicleWake(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    speed: number,
    active: boolean,
  ): void {
    const write = (uniforms: WaterUniforms): void => {
      uniforms.uVehicleWake.value.set(x, z, 0, speed);
      uniforms.uVehicleFwd.value.set(dirX, dirZ, active ? 1 : 0, 0);
    };
    if (this.#uniforms) write(this.#uniforms);
    if (this.#riverUniforms) write(this.#riverUniforms);
  }

  /**
   * Das Flussband — PLAN.md P8.6.
   *
   * **Dasselbe Material wie das Meer, nur mit `uWaterRiver = 1`.** Wellen,
   * Tiefenfarbe, Schaum, Uferblende und die Atmosphärenanbindung sind
   * dieselbe Rechnung; verschieden sind nur die Flächennormale (das Band kippt
   * mit dem Bett) und der Schaum an steilen Abschnitten. Ein zweites Material
   * hieße ein zweites Shaderprogramm für zwei Zeilen — und zwei Programme mehr
   * kosten hier messbar Übersetzungszeit beim Stufenwechsel (P8.2).
   *
   * **Mit `depthWrite`, anders als das Meer.** Die Meeresebene schreibt keine
   * Tiefe, damit Stege und Boote darauf sichtbar bleiben. Das Flussband liegt
   * dagegen *im* Gelände und wird von Vegetation überstreut — ohne
   * Tiefenschreiben stünden Grashalme, die hinter dem Wasser liegen, davor.
   */
  async #addRiver(context: EngineContext, height: TerrainHeightUniforms): Promise<void> {
    let file: RiverFile;
    try {
      const response = await fetch(TERRAIN_ASSETS.river);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      file = (await response.json()) as RiverFile;
    } catch (error) {
      // Kein Abbruch: `river.json` entsteht erst, wenn der Baker mit Fluss
      // gelaufen ist (`--no-river` lässt sie weg). Eine Karte ohne Fluss ist
      // ein gültiger Zustand, eine Anwendung, die daran stirbt, nicht.
      console.warn('[WaterSystem] river.json nicht geladen — Karte ohne Fluss.', error);
      return;
    }

    const { geometry, report } = buildRiverGeometry(file);
    this.#riverReport = report;

    const uniforms = createWaterUniforms();
    uniforms.uWaterRiver.value = 1;
    const material = new WaterMaterial(uniforms, height, this.atmosphere);
    material.name = 'RiverMaterial';
    material.depthWrite = true;

    const mesh = new Mesh(geometry, material);
    mesh.name = 'Fluss';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = false;
    mesh.castShadow = false;

    this.#riverMesh = mesh;
    this.#riverMaterial = material;
    this.#riverUniforms = uniforms;
    context.scene.add(mesh);

    const folder = context.debug?.folder('Wasser');
    folder?.addBinding(mesh, 'visible', { label: 'Fluss sichtbar' });
    folder?.addBinding(
      {
        get Fluss() {
          return (
            `${report.nodes} Knoten · ${report.triangles} Dreiecke · ` +
            `steilster Abschnitt ${(report.steepest * 100).toFixed(0)} % · ` +
            `Schaumstrecke ${report.rapidsLength.toFixed(0)} m`
          );
        },
      },
      'Fluss',
      { readonly: true },
    );
  }

  /** Für `japanMap.river()` — die Messung zu P8.6 ohne Umweg über das Panel. */
  get riverReport(): RiverGeometryReport | null {
    return this.#riverReport;
  }

  #applyLook(look: LookState): void {
    const uniforms = this.#uniforms;
    const material = this.#material;
    if (!uniforms || !material) return;

    uniforms.uWaterDeepColor.value.set(look.water.deepColorHex).convertSRGBToLinear();
    uniforms.uWaterShallowColor.value.set(look.water.shallowColorHex).convertSRGBToLinear();
    uniforms.uWaterRoughness.value = look.water.roughness;
    uniforms.uWaterFoam.value.z = look.water.foamIntensity;

    // Der Fluss hängt am selben Look. Ohne das behielte er die Vorgabewerte
    // und stünde bei einer Nachtstimmung als hellblaues Band in der Landschaft.
    const river = this.#riverUniforms;
    if (!river) return;
    river.uWaterDeepColor.value.copy(uniforms.uWaterDeepColor.value);
    river.uWaterShallowColor.value.copy(uniforms.uWaterShallowColor.value);
    river.uWaterRoughness.value = look.water.roughness;
    river.uWaterFoam.value.z = look.water.foamIntensity;
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
    if (this.#riverMesh) {
      this.#context?.scene.remove(this.#riverMesh);
      this.#riverMesh.geometry.dispose();
      this.#riverMesh = null;
    }
    this.#riverMaterial?.dispose();
    this.#riverMaterial = null;
    this.#riverUniforms = null;
    this.#riverReport = null;

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
