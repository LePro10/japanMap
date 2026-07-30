import { Group, Mesh } from 'three';

import { CITY, CITY_LOOK, CITY_SLAB_Y } from '@/config/city.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { createCityUniforms, FacadeMaterial, type CityUniforms } from '../materials/FacadeMaterial';
import type { RoadMaterial } from '../materials/RoadMaterial';
import type { RoadNetwork } from '../roads/RoadNetwork';
import type { TerrainSampler } from '../TerrainSampler';
import { generateCity } from './CityGenerator';

/**
 * Die Stadt in der Szene — PLAN.md P6 / 6.1, 6.2.
 *
 * Baut, sobald **beide** Voraussetzungen da sind: der Terrain-Sampler für die
 * Schürze am Distriktrand und das Straßennetz, damit die Blöcke der befahrenen
 * Stadtstraße ausweichen. Beide kommen als Ereignis, beide genau einmal —
 * dieses System muss deshalb **vor** TerrainSystem und RoadSystem registriert
 * sein, wie ScatterSystem und PropSystem auch.
 *
 * Das Straßennetz kommt als letztes (main.ts baut in dieser Reihenfolge auf),
 * gebaut wird trotzdem aus einem gemeinsamen Punkt heraus statt aus dem
 * zweiten Ereignis: die Reihenfolge zweier Ereignisse ist eine Annahme über
 * eine andere Datei, und solche Annahmen halten genau bis zur nächsten
 * Umsortierung.
 */
export class CitySystem implements System {
  readonly name = 'CitySystem';

  #context: EngineContext | null = null;
  #group: Group | null = null;
  #facade: FacadeMaterial | null = null;
  #groundMaterial: RoadMaterial | null = null;
  #sampler: TerrainSampler | null = null;
  #network: RoadNetwork | null = null;
  #built = false;

  readonly #shared: CityUniforms;

  readonly #readouts = {
    stadt: 'noch nicht gebaut',
    geometrie: '—',
    platte: '—',
    aufbau: '—',
  };

  constructor(private readonly atmosphere: AtmosphereUniforms) {
    this.#shared = createCityUniforms(
      CITY_LOOK.windowLitFraction,
      CITY_LOOK.windowEmissive,
      CITY_LOOK.neonEmissive,
    );
  }

  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    this.#facade = new FacadeMaterial(this.atmosphere, this.#shared);

    const group = new Group();
    group.name = 'Stadt';
    group.matrixAutoUpdate = false;
    this.#group = group;
    context.scene.add(group);

    context.bus.on('terrain:ready', ({ sampler }) => {
      this.#sampler = sampler;
      this.#tryBuild();
    });
    context.bus.on('roads:ready', ({ network, surface }) => {
      this.#network = network;
      // **Dasselbe Material wie die Fahrbahn**, nicht ein gleich aussehendes.
      // Bodenplatte und Stadtstraße stoßen im Distrikt aneinander; mit zwei
      // Materialien liefe die Pfützenmaske aus 6.4 über zwei Uniform-Blöcke und
      // die Nässe spränge an der Bordsteinkante.
      this.#groundMaterial = surface;
      this.#tryBuild();
    });
    context.bus.on('look:apply', ({ look }) => {
      this.#shared.uWindowLitFraction.value = look.city.windowLitFraction;
      this.#shared.uWindowEmissive.value = look.city.windowEmissive;
    });
    context.bus.on('look:collect', ({ target }) => {
      target.city.windowLitFraction = this.#shared.uWindowLitFraction.value;
      target.city.windowEmissive = this.#shared.uWindowEmissive.value;
    });

    this.#registerDebug(context);
  }

  update(_delta: number, elapsed: number): void {
    // Eine Zeitbasis für alle Fenster. Sie läuft weiter, auch wenn die Stadt
    // nicht im Bild ist — ein Flackern, das beim Hinsehen von vorn beginnt,
    // wäre auffälliger als das Flackern selbst.
    this.#shared.uCityTime.value = elapsed;
  }

  #tryBuild(): void {
    if (this.#built || !this.#sampler || !this.#network || !this.#group) return;
    const sampler = this.#sampler;
    const network = this.#network;
    const facade = this.#facade;
    const ground = this.#groundMaterial;
    if (!facade || !ground) return;
    this.#built = true;

    const started = performance.now();
    const result = generateCity({
      isRoad: (x, z) =>
        network.distanceToNearestRoad(x, z, CITY.clearance.road) < CITY.clearance.road,
      sampleTerrain: (x, z) => sampler.getHeightAt(x, z),
    });
    const elapsed = performance.now() - started;

    for (const block of result.blocks) {
      const mesh = new Mesh(block.geometry, facade);
      mesh.name = block.geometry.name;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.#group.add(mesh);
    }

    const sidewalks = new Mesh(result.sidewalks, facade);
    sidewalks.name = 'Bürgersteige';
    sidewalks.matrixAutoUpdate = false;
    this.#group.add(sidewalks);

    const slab = new Mesh(result.ground, ground);
    slab.name = 'Stadtboden';
    slab.matrixAutoUpdate = false;
    // Die Platte ist 360 × 360 m groß und liegt fast immer teilweise im Bild;
    // ihre Bounding-Sphere hat 255 m Radius. Culling brächte hier nichts außer
    // einer Kugel-Frustum-Prüfung je Frame.
    slab.frustumCulled = false;
    this.#group.add(slab);

    const s = result.stats;
    this.#readouts.stadt =
      `${s.blocks} Blöcke · ${s.buildings} Gebäude von ${s.parcels} Parzellen · ` +
      `${result.signs.length} Schilderplätze`;
    this.#readouts.geometrie =
      `${s.triangles.toLocaleString('de-DE')} Dreiecke · ` +
      `${s.blocks + 2} Draw-Calls · höchstes Haus ${s.floorsMax} Etagen / ` +
      `${s.heightMax.toFixed(1)} m`;
    this.#readouts.platte =
      `y = ${CITY_SLAB_Y.toFixed(2)} m · geringster Abstand zum Gelände ` +
      `${(s.slabClearance * 100).toFixed(1)} cm bei (${s.slabClearanceAt.x}, ` +
      `${s.slabClearanceAt.z})`;
    this.#readouts.aufbau = `${elapsed.toFixed(1)} ms`;

    // **Die knappe Zusage aus city.mjs wird hier geprüft, nicht geglaubt.**
    // Liegt die Platte auf dem Gelände auf, wächst irgendwo ein Grasbüschel
    // durch den Asphalt — ein Fehler, den man auf einem Bild aus 200 m
    // Entfernung nicht sieht und aus 5 m nicht mehr übersieht.
    if (s.slabClearance <= 0) {
      console.error(
        `Stadt: die Bodenplatte liegt bei (${s.slabClearanceAt.x}, ${s.slabClearanceAt.z}) ` +
          `${(-s.slabClearance * 100).toFixed(1)} cm **unter** dem Gelände. ` +
          'Der Baker hat den Distrikt anders eingeebnet als city.mjs annimmt.',
      );
    }

    this.#context?.debug?.refresh();
    this.#context?.bus.emit('city:ready', { signs: result.signs, uniforms: this.#shared });
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Stadt');
    const group = this.#group;
    if (!folder || !group) return;

    folder.addBinding(this.#readouts, 'stadt', { readonly: true, label: 'Bestand' });
    folder.addBinding(this.#readouts, 'geometrie', { readonly: true, label: 'Geometrie' });
    folder.addBinding(this.#readouts, 'platte', { readonly: true, label: 'Bodenplatte' });
    folder.addBinding(this.#readouts, 'aufbau', { readonly: true, label: 'Aufbau' });
    folder.addBinding(group, 'visible', { label: 'Sichtbar' });
    folder
      .addBinding(this.#shared.uWindowLitFraction, 'value', {
        label: 'Fenster dunkel',
        min: 0,
        max: 1,
        step: 0.01,
      })
      .on('change', () => {
        this.#context?.debug?.refresh();
      });
    folder.addBinding(this.#shared.uWindowEmissive, 'value', {
      label: 'Fensterlicht',
      min: 0,
      max: 12,
      step: 0.05,
    });
    folder.addBinding(this.#shared.uNeonEmissive, 'value', {
      label: 'Neonlicht',
      min: 0,
      max: 20,
      step: 0.1,
    });
    // Die Diagnose-Ausgabe der Fassade. Sie hat das Pixelrauschen der Fenster
    // gefunden, nachdem drei Vermutungen daran vorbeigegangen waren — und sie
    // bleibt aus genau dem Grund stehen.
    folder.addBinding(this.#shared.uCityDebug, 'value', {
      label: 'Fassaden-Diagnose',
      options: { Aus: 0, Detailanteil: 1, Fensterleuchten: 2, 'Hash je Fenster': 3 },
    });
  }

  dispose(): void {
    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      this.#group.traverse((child) => {
        if (child instanceof Mesh) child.geometry.dispose();
      });
      this.#group = null;
    }
    this.#facade?.dispose();
    this.#facade = null;
    // Das Belagsmaterial gehört dem RoadSystem und wird dort freigegeben. Es
    // hier ein zweites Mal zu entsorgen hieße, dem Straßennetz sein Programm
    // unter den Meshes wegzuziehen.
    this.#groundMaterial = null;
    this.#sampler = null;
    this.#network = null;
    this.#context = null;
  }
}

