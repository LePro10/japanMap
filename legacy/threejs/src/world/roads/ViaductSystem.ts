import { Group, MeshStandardMaterial } from 'three';

import { roadWidthAt } from '@/config/roads.config';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import { SettlementKit } from '../settlements/SettlementKit';

/** Ab dieser lichten Höhe über dem Gelände bekommt eine Fahrbahn ein Deck, in Metern. */
const DECK_FROM = 2.5;
/** Ab dieser lichten Höhe stehen Pfeiler darunter, in Metern. */
const PIER_FROM = 4;
/** Pfeilerabstand entlang der Achse, in Metern. */
const PIER_SPACING = 28;
/** Deckstärke unter der Fahrbahnoberkante, in Metern. */
const DECK_DEPTH = 1.35;
const CONCRETE = 0x7b7f80;
const CONCRETE_DARK = 0x5d6163;

/**
 * Deck und Pfeiler unter jeder Fahrbahn, die über dem Gelände liegt.
 *
 * ## Warum es das braucht
 *
 * Das Straßen-Mesh ist ein einseitiges Band (`RoadMeshBuilder`). Wo eine Straße
 * über dem Gelände liegt — vor allem die Ring-Hochstraße über Neo-Tokio, 7 bis
 * 30 m über den Straßen —, war sie von unten **gar nicht da**: im Bild standen
 * nur die beiden Leitplanken in der Luft, und von oben las sich die Fahrbahn
 * als papierdünnes Blatt (Review 2026-09; TODO.md nannte das die „Brücke mit
 * durchsichtigem Fundament"). `docs/TOKYO.md` führte die Pfeiler als offen.
 *
 * Gebaut wird aus der Mittellinie in `roads.json` gegen das gebackene Höhenfeld,
 * also ohne einen einzigen Handgriff an der Karte: ändert sich eine Trasse,
 * ändert sich das Bauwerk mit. Ein Mesh mit Vertexfarben — ein Draw-Call.
 *
 * Kollision nur an den Pfeilern. Das Deck liegt über dem Verkehr darunter;
 * `CollisionWorld`-Körper tragen eine Höhenspanne, ein Auto darunter berührt es
 * nicht, und oben fährt man auf der Fahrbahn, nicht auf dem Beton.
 */
export class ViaductSystem implements System {
  readonly name = 'ViaductSystem';
  readonly group = new Group();
  #material: MeshStandardMaterial | null = null;
  #context: EngineContext | null = null;

  constructor(private readonly drive: DriveSystem) {}

  init(context: EngineContext): void {
    this.#context = context;
    const terrain = this.drive.terrain;
    const network = this.drive.roads;
    if (!terrain || !network) throw new Error('ViaductSystem braucht Gelände und Straßennetz.');
    this.group.name = 'Hochstraßen';

    const kit = new SettlementKit();
    let deckSegments = 0;
    let piers = 0;

    for (const road of network.roads) {
      const c = road.centerline;
      const count = c.length / 3;
      const last = road.closed ? count : count - 1;
      let sincePier = PIER_SPACING / 2;
      for (let i = 0; i < last; i++) {
        const j = (i + 1) % count;
        const ax = c[i * 3]!, ay = c[i * 3 + 1]!, az = c[i * 3 + 2]!;
        const bx = c[j * 3]!, by = c[j * 3 + 1]!, bz = c[j * 3 + 2]!;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const run = Math.hypot(dx, dz);
        if (run < 1e-3) continue;
        sincePier += run;
        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
        const ground = terrain.getHeightAt(mx, mz);
        const clearance = my - ground;
        if (clearance < DECK_FROM) continue;

        const width = roadWidthAt(road, i) + 0.8;
        const yaw = Math.atan2(dx, dz);
        // Nicken um die Querachse: +z zeigt nach dem Drehen um X auf
        // (0, −sin θ, cos θ) — für ein steigendes Stück also θ = −atan(dy/run).
        const pitch = -Math.atan2(dy, run);
        const length = Math.hypot(run, dy) + 0.35; // überlappen, sonst Fugen im Knick
        kit.box(mx, my - 0.08 - DECK_DEPTH / 2, mz, width, DECK_DEPTH, length, CONCRETE, pitch, yaw);
        // Die dunklere Unterkante gibt dem Deck von unten eine Kante statt
        // einer gleichförmigen Fläche.
        kit.box(mx, my - 0.08 - DECK_DEPTH - 0.2, mz, width - 1.6, 0.4, length, CONCRETE_DARK, pitch, yaw);
        deckSegments++;

        if (clearance < PIER_FROM || sincePier < PIER_SPACING) continue;
        const top = my - 0.08 - DECK_DEPTH;
        const ux = dx / run, uz = dz / run;
        // Erst ein Einzelpfeiler in der Achse (bis 6 m längs verschoben), wo
        // unten keine Fahrbahn liegt.
        let placed = false;
        for (const shift of [0, 4, -4, 6, -6]) {
          const px = mx + ux * shift, pz = mz + uz * shift;
          const g = terrain.getHeightAt(px, pz);
          const below = network.closestPoint(px, pz, 24, g + 1);
          if (below && below.roadId !== road.id && below.distance < below.width / 2 + 2) continue;
          if (top - g < 2) break;
          this.#pier(kit, px, pz, g - 0.4, top, yaw);
          kit.box(px, top - 0.55, pz, width - 0.6, 1.1, 2.2, CONCRETE_DARK, 0, yaw);
          placed = true;
          break;
        }
        // **Sonst ein Portal über der unteren Straße.** Unter dem Ring liegt
        // fast auf ganzer Länge die 16 m breite `shuto-shita`; ein Pfeiler in
        // der Achse stünde auf ihrer Fahrbahn, und die erste Fassung kam so auf
        // drei Pfeiler für 408 m Hochstraße. In Tokio steht die Shuto dort auf
        // Rahmen: je eine Stütze auf jedem Gehweg, ein Riegel darüber.
        if (!placed) {
          const g = terrain.getHeightAt(mx, mz);
          const below = network.closestPoint(mx, mz, 24, g + 1);
          if (below && below.roadId !== road.id && top - g >= 4) {
            const reach = below.width / 2 + 1.3;
            // Quer zur **unteren** Straße messen, nicht zur Hochstraße: nur so
            // stehen beide Stützen neben ihrer Fahrbahn.
            const sx = -uz, sz = ux;
            const legs = [-1, 1].map((side) => {
              const lx = below.x + sx * reach * side, lz = below.z + sz * reach * side;
              return { x: lx, z: lz, ground: terrain.getHeightAt(lx, lz) };
            });
            const clear = legs.every((leg) => {
              const hit = network.closestPoint(leg.x, leg.z, 24, leg.ground + 1);
              return !hit || hit.roadId === road.id || hit.distance > hit.width / 2 + 0.9;
            });
            if (clear) {
              for (const leg of legs) this.#pier(kit, leg.x, leg.z, leg.ground - 0.4, top, yaw);
              const cx = (legs[0]!.x + legs[1]!.x) / 2, cz = (legs[0]!.z + legs[1]!.z) / 2;
              kit.box(cx, top - 0.6, cz, reach * 2 + 2, 1.2, 2.2, CONCRETE_DARK, 0, yaw);
              placed = true;
            }
          }
        }
        if (placed) {
          piers++;
          sincePier = 0;
        }
      }
    }

    if (kit.parts.length > 0) {
      const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.05 });
      this.#material = material;
      const mesh = kit.finish(this.group, material, 'Hochstraße Deck und Pfeiler');
      mesh.castShadow = true;
      context.scene.add(this.group);
    }
    console.info(`[Straßen] Hochstraßen: ${deckSegments} Deckabschnitte, ${piers} Pfeiler`);
  }

  /** Eine Stütze mit Kollision, von `bottom` bis unter das Deck. */
  #pier(kit: SettlementKit, x: number, z: number, bottom: number, top: number, yaw: number): void {
    const height = top - bottom;
    kit.box(x, bottom + height / 2, z, 2.0, height, 2.4, CONCRETE, 0, yaw);
    // `addOrientedBox` dreht u = (cos a, sin a); entlang der Achse heißt
    // (sin yaw, cos yaw), also a = π/2 − yaw. `hu` längs, `hv` quer.
    this.drive.collision.addOrientedBox(x, z, Math.PI / 2 - yaw, 1.2, 1.0, bottom - 1, top);
  }

  dispose(): void {
    for (const child of this.group.children) {
      const mesh = child as { geometry?: { dispose(): void } };
      mesh.geometry?.dispose();
    }
    this.#material?.dispose();
    this.#context?.scene.remove(this.group);
  }
}
