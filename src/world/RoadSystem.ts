import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  type Texture,
} from 'three';

import { ROAD_TYPES, type RoadData, type RoadFile } from '@/config/roads.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import type { ReflectionUniforms } from '@/render/PlanarReflection';
import { createRoadUniforms, RoadMaterial, type RoadUniforms } from './materials/RoadMaterial';
import { buildGuardrails } from './roads/GuardrailBuilder';
import { ROAD_ASSETS } from './roads/roadAssets';
import { buildRoadGeometry } from './roads/RoadMeshBuilder';
import { RoadNetwork } from './roads/RoadNetwork';
import type { RoadEditor } from './roads/RoadEditor';

/**
 * Straßennetz — PLAN.md P3.
 *
 * Lädt `roads.json` (Ausgabe von `tools/gen-roads.mjs`), baut je Strecke ein
 * Mesh und stellt das Netz für Abfragen bereit. Die Splines selbst werden hier
 * **nicht** ausgewertet: die Mittellinie kommt fertig abgetastet aus der Datei,
 * damit Baker und Renderer garantiert dieselbe Kurve sehen.
 */
export class RoadSystem implements System {
  readonly name = 'RoadSystem';

  #context: EngineContext | null = null;
  #group: Group | null = null;
  #rails: Group | null = null;
  #material: RoadMaterial | null = null;
  #railMaterial: MeshStandardMaterial | null = null;
  #network: RoadNetwork | null = null;
  #editor: RoadEditor | null = null;

  readonly #readouts = {
    netz: '—',
    planken: '—',
    abfrage: 'noch nicht gemessen',
  };

  /**
   * Nässe und Pfützenrand — geteilt mit der Bodenplatte der Stadt.
   *
   * Liegt hier und nicht im CitySystem, weil das Straßennetz die ältere und
   * größere Fläche ist: die Stadt kommt zu ihr dazu, nicht umgekehrt.
   */
  readonly #surface: RoadUniforms = createRoadUniforms();

  constructor(
    private readonly atmosphere: AtmosphereUniforms,
    private readonly reflection: ReflectionUniforms,
  ) {}

  get network(): RoadNetwork | null {
    return this.#network;
  }

  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    const anisotropy = context.renderer.capabilities.getMaxAnisotropy();

    const [file, albedo, normal, arm] = await Promise.all([
      context.resources.json<RoadFile>(ROAD_ASSETS.network),
      context.resources.texture(ROAD_ASSETS.albedo, { srgb: true, anisotropy }),
      context.resources.texture(ROAD_ASSETS.normal, { srgb: false, anisotropy }),
      context.resources.texture(ROAD_ASSETS.arm, { srgb: false, anisotropy }),
    ]);

    for (const texture of [albedo, normal, arm]) this.#prepare(texture);

    this.#material = new RoadMaterial(
      { albedo, normal, arm },
      this.atmosphere,
      this.#surface,
      this.reflection,
    );

    const group = new Group();
    group.name = 'Straßen';
    group.matrixAutoUpdate = false;
    this.#group = group;

    const rails = new Group();
    rails.name = 'Leitplanken';
    rails.matrixAutoUpdate = false;
    this.#rails = rails;
    group.add(rails);

    // Ein Material für Band und Pfosten: beide sind verzinktes Blech, und zwei
    // Materialien wären zwei Programme im Budget für exakt denselben Look.
    this.#railMaterial = new MeshStandardMaterial({
      color: 0x9aa3a8,
      roughness: 0.55,
      metalness: 0.85,
      side: 2,
    });

    this.#build(file.roads);
    context.scene.add(group);

    // Erst nach `#build()`: dort entsteht das Abfragenetz. Die Streuung in P4
    // hört darauf und darf es nicht halb aufgebaut bekommen.
    if (this.#network) {
      context.bus.emit('roads:ready', { network: this.#network, surface: this.#material });
    }

    context.bus.on('look:apply', ({ look }) => {
      this.#surface.uWetness.value = look.road.wetness;
      this.#context?.debug?.refresh();
    });
    context.bus.on('look:collect', ({ target }) => {
      target.road.wetness = this.#surface.uWetness.value;
    });

    await this.#registerDebug(context, file);
  }

  /**
   * Meshes aus einem Straßensatz aufbauen — beim Start und nach jeder Änderung
   * im Editor.
   *
   * Wirft alles Vorherige weg und baut neu. Das klingt verschwenderisch und ist
   * gemessen unter zehn Millisekunden für das ganze Netz; eine
   * Teilaktualisierung wäre zusätzlicher Zustand in einem Werkzeug, dessen
   * Zweck darin besteht, dass man den Zahlen glauben kann.
   */
  #build(roads: readonly RoadData[]): void {
    const group = this.#group;
    const rails = this.#rails;
    if (!group || !rails || !this.#material || !this.#railMaterial) return;

    for (const child of [...group.children]) {
      if (child === rails) continue;
      group.remove(child);
      if (child instanceof Mesh) child.geometry.dispose();
    }
    for (const child of [...rails.children]) {
      rails.remove(child);
      if (child instanceof Mesh) child.geometry.dispose();
    }

    let triangles = 0;
    for (const road of roads) {
      const built = buildRoadGeometry(road);
      triangles += built.triangles;

      const mesh = new Mesh(built.geometry, this.#material);
      mesh.name = `Straße:${road.id}`;
      mesh.matrixAutoUpdate = false;
      // Die Verschattung ist gebacken (P2 / 2.3); es gibt keine Schattenkarte,
      // in die die Straße etwas werfen könnte.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
    }

    const guardrails = buildGuardrails(roads);
    if (guardrails.geometry) {
      const band = new Mesh(guardrails.geometry, this.#railMaterial);
      band.name = 'Leitplanken:Band';
      band.matrixAutoUpdate = false;
      rails.add(band);
      triangles += guardrails.triangles;
    }
    if (guardrails.posts.length > 0) {
      const posts = new InstancedMesh(
        new BoxGeometry(1, 1, 1),
        this.#railMaterial,
        guardrails.posts.length,
      );
      posts.name = 'Leitplanken:Pfosten';
      posts.frustumCulled = false;
      for (let i = 0; i < guardrails.posts.length; i++) {
        posts.setMatrixAt(i, guardrails.posts[i]!);
      }
      posts.instanceMatrix.needsUpdate = true;
      rails.add(posts);
      triangles += guardrails.posts.length * 12;
    }

    const totalLength = roads.reduce((sum, road) => sum + road.length, 0);
    this.#readouts.netz =
      `${roads.length} Strecken · ${(totalLength / 1000).toFixed(2)} km · ` +
      `${triangles.toLocaleString('de-DE')} Dreiecke`;
    this.#readouts.planken =
      `${Math.round(guardrails.length)} m · ${guardrails.posts.length} Pfosten ` +
      `(2 Draw-Calls)`;

    this.#network = new RoadNetwork({
      seed: 0,
      sampleSpacing: 2,
      roads,
      measured: { totalLength, count: roads.length },
    });
  }

  #prepare(texture: Texture): void {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
  }

  async #registerDebug(context: EngineContext, file: RoadFile): Promise<void> {
    const folder = context.debug?.folder('Straßen');
    const group = this.#group;
    const rails = this.#rails;
    const material = this.#material;
    const network = this.#network;
    if (!folder || !group || !rails || !material || !network) return;

    // Der Editor wird dynamisch geladen — er hängt an Tweakpane-nahen Typen und
    // hat im Produktions-Bundle nichts verloren (SPEC §4).
    if (import.meta.env.DEV && context.debug) {
      const { RoadEditor } = await import('./roads/RoadEditor');
      this.#editor = new RoadEditor({
        file,
        group,
        onRebuild: (roads) => {
          this.#build(roads);
        },
      });
      this.#editor.register(context.debug);
    }

    folder.addBinding(this.#readouts, 'netz', { readonly: true, label: 'Netz' });
    folder.addBinding(this.#readouts, 'planken', { readonly: true, label: 'Leitplanken' });
    folder.addBinding(rails, 'visible', { label: 'Leitplanken zeigen' });
    folder.addBinding(this.#readouts, 'abfrage', { readonly: true, label: 'Abfrage' });
    folder.addBinding(group, 'visible', { label: 'Sichtbar' });
    folder.addBinding(material, 'wireframe', { label: 'Drahtgitter' });
    folder.addBinding(this.#surface.uWetness, 'value', {
      label: 'Nässe (Fläche)',
      min: 0,
      max: 1,
      step: 0.01,
    });
    folder.addBinding(this.#surface.uPuddleEdge, 'value', {
      label: 'Pfützenrand',
      min: 0.01,
      max: 0.4,
      step: 0.005,
    });

    for (const road of file.roads) {
      const mesh = group.getObjectByName(`Straße:${road.id}`);
      if (!mesh) continue;
      folder.addBinding(mesh, 'visible', {
        label: `${ROAD_TYPES[road.type].label} (${Math.round(road.length)} m)`,
      });
    }

    // Das Akzeptanzkriterium aus PLAN.md P3 lautet „100 000 Abfragen in unter
    // 50 ms". Es steht hier als Knopf, damit es auf jeder Maschine nachgemessen
    // werden kann statt einmalig geglaubt zu werden.
    folder.addButton({ title: '100 000 Abfragen messen' }).on('click', () => {
      const samples = 100_000;
      // Feste Pseudo-Zufallsfolge: dieselben Punkte bei jeder Messung.
      let seed = 1;
      const random = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const points = new Float32Array(samples * 2);
      for (let i = 0; i < samples; i++) {
        points[i * 2] = (random() - 0.5) * 3072;
        points[i * 2 + 1] = (random() - 0.5) * 3072;
      }

      const active = this.#network ?? network;
      const start = performance.now();
      let near = 0;
      for (let i = 0; i < samples; i++) {
        if (active.distanceToNearestRoad(points[i * 2]!, points[i * 2 + 1]!) < 30) near++;
      }
      const elapsed = performance.now() - start;

      this.#readouts.abfrage =
        `${elapsed.toFixed(1)} ms / 50 ms · ${((near / samples) * 100).toFixed(1)} % nah`;
      console.info(
        `distanceToNearestRoad: ${samples.toLocaleString('de-DE')} Abfragen in ` +
          `${elapsed.toFixed(1)} ms (${(elapsed / samples * 1000).toFixed(3)} µs je Abfrage), ` +
          `${active.segmentCount.toLocaleString('de-DE')} Segmente im Gitter.`,
      );
    });
  }

  dispose(): void {
    this.#editor?.dispose();
    this.#editor = null;
    this.#railMaterial?.dispose();
    this.#railMaterial = null;
    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      this.#group.traverse((child) => {
        if (child instanceof Mesh) child.geometry.dispose();
      });
      this.#group = null;
    }
    this.#material?.dispose();
    this.#material = null;
    this.#network = null;
    this.#context = null;
  }
}
