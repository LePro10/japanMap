import { Group, Mesh } from 'three';

import { CITY_DISTRICT, CITY_LOD, CITY_LOOK, CITY_ROAD_LEVEL, CITY_SLAB_Y } from '@/config/city.config';
import type { QualityKey } from '@/config/quality.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { createCityUniforms, FacadeMaterial, type CityUniforms } from '../materials/FacadeMaterial';
import type { RoadMaterial } from '../materials/RoadMaterial';
import type { RoadNetwork } from '../roads/RoadNetwork';
import type { TerrainSampler } from '../TerrainSampler';
import type { CityBuilding } from './CityGenerator';
import { generateTokyo, type TokyoOpenLot, type TokyoRoad, type TokyoTile } from './TokyoGenerator';
import { generateSuburbs } from './TokyoSuburbs';

/**
 * Die Stadt — PLAN.md P6, seit 2026-09-23 Neo-Tokio (docs/TOKYO.md).
 *
 * Baut die Stadt einmal, sobald Gelände und Straßennetz da sind, und schaltet
 * danach je Frame die Detailstufe der 160-m-Kacheln um. Der Aufbau selbst steht
 * in `TokyoGenerator`; hier stehen nur die beiden Abfragen, die er vom
 * Straßennetz braucht, und die Umschaltung.
 */
interface TileMeshes {
  readonly tile: TokyoTile;
  readonly full: Mesh;
  readonly shell: Mesh;
}

export class CitySystem implements System {
  readonly name = 'CitySystem';
  buildings: readonly CityBuilding[] = [];
  /** Freiflächen (Parks, Schrein, Plätze, Münzparkplätze) für die Ausstattung. */
  openLots: readonly TokyoOpenLot[] = [];
  /** Bordsteinlinien als x,z-Züge — Masten, Laternen, Poller stehen daran. */
  curbLines: readonly (readonly number[])[] = [];
  /** Gartenbäume der Vororte (Phase 5) — gebaut von `TokyoOpenSpaceSystem`. */
  gardenTrees: readonly { readonly x: number; readonly y: number; readonly z: number; readonly s: number }[] = [];

  #context: EngineContext | null = null;
  #group: Group | null = null;
  #facade: FacadeMaterial | null = null;
  #groundMaterial: RoadMaterial | null = null;
  #sampler: TerrainSampler | null = null;
  #network: RoadNetwork | null = null;
  #built = false;
  #tiles: TileMeshes[] = [];
  #detailRange: number = CITY_LOD.detailRange.ultra;

  readonly #shared: CityUniforms;

  readonly #readouts = {
    stadt: 'noch nicht gebaut',
    geometrie: '—',
    platte: '—',
    aufbau: '—',
    kacheln: '—',
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
      this.#groundMaterial = surface;
      this.#tryBuild();
    });
    context.bus.on('quality:changed', ({ level }) => {
      this.#detailRange = CITY_LOD.detailRange[level as QualityKey] ?? CITY_LOD.detailRange.medium;
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
    this.#shared.uCityTime.value = elapsed;
    const camera = this.#context?.camera;
    if (!camera || this.#tiles.length === 0) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    let full = 0;
    for (const t of this.#tiles) {
      const b = t.tile.bounds;
      const dx = Math.max(b.minX - cx, cx - b.maxX, 0);
      const dz = Math.max(b.minZ - cz, cz - b.maxZ, 0);
      const near = dx * dx + dz * dz < this.#detailRange * this.#detailRange;
      t.full.visible = near;
      t.shell.visible = !near;
      if (near) full++;
    }
    this.#readouts.kacheln = `${full} voll · ${this.#tiles.length - full} Hülle (bis ${this.#detailRange} m)`;
  }

  #tryBuild(): void {
    if (this.#built || !this.#sampler || !this.#network || !this.#group) return;
    const sampler = this.#sampler;
    const network = this.#network;
    const facade = this.#facade;
    const ground = this.#groundMaterial;
    if (!facade || !ground) return;
    this.#built = true;

    // Fahrbahnen für das Abstandsfeld: jedes Stück, das ebenerdig (±1,5 m um
    // die Stadthöhe) im Kern oder bis 40 m davor liegt, in Läufe zerlegt. Was
    // höher liegt, ist Hochstraße — darunter Gehweg, aber kein Haus.
    const roads: TokyoRoad[] = [];
    const viaduct: TokyoRoad[] = [];
    const margin = 40;
    const near = (x: number, z: number): boolean =>
      x > CITY_DISTRICT.minX - margin && x < CITY_DISTRICT.maxX + margin && z > CITY_DISTRICT.minZ - margin && z < CITY_DISTRICT.maxZ + margin;
    for (const road of network.roads) {
      const l = road.centerline;
      const width = road.widths[0] ?? 8;
      let run: number[] = [];
      let runElevated = false;
      const flush = (): void => {
        if (run.length >= 4) (runElevated ? viaduct : roads).push({ points: run, width });
        run = [];
      };
      for (let i = 0; i < l.length; i += 3) {
        const x = l[i]!, y = l[i + 1]!, z = l[i + 2]!;
        if (!near(x, z)) { flush(); continue; }
        const elevated = y > CITY_ROAD_LEVEL + 1.5;
        if (run.length && elevated !== runElevated) {
          const px = run[run.length - 2]!, pz = run[run.length - 1]!;
          flush();
          run.push(px, pz);
        }
        runElevated = elevated;
        run.push(x, z);
      }
      if (road.closed && run.length && !runElevated && l.length >= 3) run.push(l[0]!, l[2]!);
      flush();
    }

    const started = performance.now();
    const result = generateTokyo({ roads, viaduct, sampleTerrain: (x, z) => sampler.getHeightAt(x, z) });
    // Phase 5: der Übergang auf den WP6-Terrassen vor dem Kern.
    const suburbs = generateSuburbs(network.file.urbanLots ?? [], (x, z) => {
      const hit = network.closestPoint(x, z, 90);
      if (!hit) return null;
      const dx = hit.x - x, dz = hit.z - z, l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    });
    const elapsed = performance.now() - started;
    this.buildings = [...result.buildings, ...suburbs.buildings];
    this.gardenTrees = suburbs.trees;
    this.openLots = result.openLots;
    this.curbLines = result.curbLines;

    for (const tile of [...result.tiles, ...suburbs.tiles]) {
      const full = new Mesh(tile.full, facade);
      const shell = new Mesh(tile.shell, facade);
      full.name = tile.full.name;
      shell.name = tile.shell.name;
      for (const m of [full, shell]) {
        m.matrixAutoUpdate = false;
        m.castShadow = false;
        m.receiveShadow = false;
        this.#group.add(m);
      }
      shell.visible = false;
      this.#tiles.push({ tile, full, shell });
    }

    // Gehwege: ein Mesh für den ganzen Kern, in beiden Detailstufen dasselbe.
    const walks = new Mesh(result.sidewalks, facade);
    walks.name = 'Gehwege';
    walks.matrixAutoUpdate = false;
    walks.receiveShadow = false;
    this.#group.add(walks);

    const slab = new Mesh(result.ground, ground);
    slab.name = 'Stadtboden';
    slab.matrixAutoUpdate = false;
    slab.frustumCulled = false;
    this.#group.add(slab);

    const s = result.stats;
    this.#readouts.stadt =
      `${s.blocks} Blöcke · ${s.buildings} Gebäude von ${s.parcels} Parzellen · ` +
      `${result.signs.length} Schilderplätze · ${Object.entries(s.byStyle).map(([k, v]) => `${k} ${v}`).join(', ')} · ` +
      `Vororte ${suburbs.stats.houses} Häuser auf ${suburbs.stats.lots} Terrassen`;
    this.#readouts.geometrie =
      `${s.trianglesFull.toLocaleString('de-DE')} Dreiecke voll · ${s.trianglesShell.toLocaleString('de-DE')} Hülle · ` +
      `${result.tiles.length} Kacheln · höchstes Haus ${s.floorsMax} Etagen / ${s.heightMax.toFixed(1)} m · ` +
      `Gehwege ${s.trianglesSidewalk.toLocaleString('de-DE')} Dreiecke · auf Fahrbahn ${s.onRoad} · Feld ${s.fieldMs.toFixed(0)} ms · ${s.phases}`;
    this.#readouts.platte =
      `y = ${CITY_SLAB_Y.toFixed(2)} m · geringster Abstand zum Gelände ` +
      `${(s.slabClearance * 100).toFixed(1)} cm bei (${s.slabClearanceAt.x}, ${s.slabClearanceAt.z})`;
    this.#readouts.aufbau = `${elapsed.toFixed(1)} ms`;
    console.info(`[Stadt] ${this.#readouts.stadt} · ${this.#readouts.geometrie} · Aufbau ${this.#readouts.aufbau}`);

    if (s.slabClearance <= 0) {
      console.error(
        `Stadt: die Bodenplatte liegt bei (${s.slabClearanceAt.x}, ${s.slabClearanceAt.z}) ` +
          `${(-s.slabClearance * 100).toFixed(1)} cm **unter** dem Gelände. ` +
          'Der Baker hat den Distrikt anders eingeebnet als city.mjs annimmt.',
      );
    }

    this.#context?.debug?.refresh();
    this.#context?.bus.emit('city:ready', {
      signs: result.signs,
      uniforms: this.#shared,
      colliders: [...result.colliders, ...suburbs.colliders],
      curbs: result.curbs,
    });
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Stadt');
    const group = this.#group;
    if (!folder || !group) return;

    folder.addBinding(this.#readouts, 'stadt', { readonly: true, label: 'Bestand' });
    folder.addBinding(this.#readouts, 'geometrie', { readonly: true, label: 'Geometrie' });
    folder.addBinding(this.#readouts, 'kacheln', { readonly: true, label: 'Kacheln' });
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
    folder.addBinding(this.#shared.uCityDebug, 'value', {
      label: 'Fassaden-Diagnose',
      options: { Aus: 0, Detailanteil: 1, Fensterleuchten: 2, 'Hash je Fenster': 3 },
    });
  }

  dispose(): void {
    this.buildings = [];
    this.#tiles = [];
    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      this.#group.traverse((child) => {
        if (child instanceof Mesh) child.geometry.dispose();
      });
      this.#group = null;
    }
    this.#facade?.dispose();
    this.#facade = null;
    this.#groundMaterial = null;
    this.#sampler = null;
    this.#network = null;
    this.#context = null;
  }
}
