import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';

import { ROAD_TYPES, type RoadData } from '@/config/roads.config';

/**
 * Leitplanken entlang einer Strecke — PLAN.md P3 / 3.4.
 *
 * **Wo sie stehen, entscheidet der Generator, nicht der Renderer.** Die
 * Bedingung ist der Höhenabfall am Fuß der Böschung, und die kennt nur, wer das
 * Gelände vor dem Einschneiden gesehen hat. Hier steht deshalb ausschließlich
 * die Geometrie: `road.rails` sagt „von Meter 340 bis Meter 512, rechte Seite",
 * und daraus wird ein Band mit Pfosten.
 *
 * **Alles in zwei Draw-Calls.** Das Band aller Strecken landet in *einer*
 * Geometrie, die Pfosten in *einem* `InstancedMesh`. Bei 19 Abschnitten auf dem
 * Ring wären es sonst zweistellig viele Zeichenaufrufe für ein Detail, das im
 * Budget von 800 keinen solchen Platz verdient.
 */

const RAIL = {
  /** Unterkante des Bandes über der Fahrbahn, in Metern. */
  bottom: 0.5,
  /** Oberkante. Zusammen 35 cm Bandhöhe — die Größenordnung einer W-Planke. */
  top: 0.85,
  /** Wie weit außerhalb der Bankettkante das Band steht. */
  offset: 0.35,
  /** Abstand der Pfosten in Metern. */
  postSpacing: 4,
  postWidth: 0.12,
  postDepth: 0.16,
} as const;

export interface GuardrailResult {
  /** Das Band, bereits über alle Strecken zusammengefasst. */
  readonly geometry: BufferGeometry | null;
  /** Eine Matrix je Pfosten, fertig für `InstancedMesh.setMatrixAt`. */
  readonly posts: readonly Matrix4[];
  readonly triangles: number;
  readonly length: number;
}

interface Station {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Normierte Querrichtung, zeigt zur Planke. */
  readonly nx: number;
  readonly nz: number;
  readonly distance: number;
}

/**
 * Stützstellen eines Abschnitts einholen.
 *
 * Die Mittellinie liegt gleichmäßig in der **Bogenlänge**, deshalb ist der
 * Index aus einer Streckenangabe eine Division und keine Suche.
 */
function stationsFor(road: RoadData, side: number, from: number, to: number): Station[] {
  const line = road.centerline;
  const count = line.length / 3;
  const spacing = road.length / (road.closed ? count : Math.max(count - 1, 1));

  const first = Math.max(0, Math.floor(from / spacing));
  const last = Math.min(count - 1, Math.ceil(to / spacing));
  const stations: Station[] = [];

  for (let i = first; i <= last; i++) {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, count - 1);
    const tx = line[b * 3]! - line[a * 3]!;
    const tz = line[b * 3 + 2]! - line[a * 3 + 2]!;
    const length = Math.hypot(tx, tz);
    if (length < 1e-6) continue;

    stations.push({
      x: line[i * 3]!,
      y: line[i * 3 + 1]!,
      z: line[i * 3 + 2]!,
      nx: (-tz / length) * side,
      nz: (tx / length) * side,
      distance: i * spacing,
    });
  }

  return stations;
}

/**
 * Die Bandmitte jeder Leitplanke als Polygonzug — PLAN.md P14.
 *
 * Gebraucht von der Kollision im Fahrmodus. **Bewusst hier und nicht dort**: der
 * seitliche Versatz `width/2 + shoulder + RAIL.offset` und die Auswahl der
 * Stützstellen aus einer Bogenlängenangabe sind dieselbe Rechnung, die
 * `buildGuardrails` für das Mesh macht. Zweimal implementiert wären es zwei
 * Plankenreihen: eine, die man sieht, und eine, gegen die man fährt. Die Regel
 * steht in CLAUDE.md unter „Kurvenmathematik […] **nicht** doppelt
 * implementieren" — dort für `splineSampler.mjs`, hier aus demselben Grund.
 *
 * Die Punkte tragen `y` der **Mittellinie**. Wie hoch das Hindernis daraus wird,
 * entscheidet der Aufrufer; für das Mesh ist es `RAIL.bottom…RAIL.top`, für ein
 * Auto muss es am Boden anfangen (der Pfosten hält genauso wie das Band).
 */
export function railPolylines(roads: readonly RoadData[], blocked?: RailBlocked): Float32Array[] {
  const out: Float32Array[] = [];

  for (const road of roads) {
    const settings = ROAD_TYPES[road.type];
    const edge = settings.width / 2 + settings.shoulder + RAIL.offset;

    for (const rail of road.rails) {
      const alle = stationsFor(road, rail.side, rail.from, rail.to);
      if (alle.length < 2) continue;

      // **Dieselbe Zerlegung wie beim Mesh.** Wer hier anders filtert als dort,
      // baut eine Planke, die man sieht und durch die man fährt — oder eine, die
      // man nicht sieht und gegen die man fährt.
      for (const stations of runsOf(alle, blocked, edge)) {
        const points = new Float32Array(stations.length * 3);
        for (let i = 0; i < stations.length; i++) {
          const s = stations[i]!;
          points[i * 3] = s.x + s.nx * edge;
          points[i * 3 + 1] = s.y;
          points[i * 3 + 2] = s.z + s.nz * edge;
        }
        out.push(points);
      }
    }
  }

  return out;
}

/**
 * Prüft, ob an dieser Stelle **keine** Planke stehen darf.
 *
 * Gebraucht wird das an Einmündungen: der Generator setzt die Planke der
 * Hauptstrecke durchgehend, und wo eine andere Straße abzweigt, läuft sie quer
 * über deren Mündung. Im Bild ist das eine Planke, die eine Straße absperrt; beim
 * Fahren ist es eine Wand.
 *
 * **Gemessen am 2026-08-18, bevor es repariert war:** 67 von 1608 Plankenpunkten
 * (4,2 %) standen auf einer Fahrbahn — 43 auf dem Ring, 20 auf dem Bergpass, 4 auf
 * der Zufahrt. Aufgefallen ist es erst mit dem Fahrmodus: der Prüfstand kam auf
 * der Zufahrt 48 m weit und hing dann **3081 von 3600 Schritten** in einem
 * Hindernis fest. Ein halbes Jahr lang hat das niemand gesehen, weil niemand
 * gefahren ist.
 *
 * Der Aufrufer reicht die Prüfung herein, statt dass sie hier entsteht: sie
 * braucht das Abfragenetz (`RoadNetwork.isOnRoad`), und das kennt dieser Baustein
 * nicht — er bekommt nur die rohen Streckendaten.
 */
export type RailBlocked = (x: number, z: number) => boolean;

/**
 * Stationen in zusammenhängende Läufe zerlegen.
 *
 * Eine gesperrte Station **teilt** den Lauf, sie wird nicht einfach übersprungen.
 * Übersprungen ergäbe ein Viereck, das über die Lücke hinweg spannt — also genau
 * die Planke quer über die Mündung, nur mit weniger Stützstellen.
 */
function runsOf(stations: readonly Station[], blocked: RailBlocked | undefined, edge: number): Station[][] {
  if (!blocked) return stations.length >= 2 ? [stations as Station[]] : [];
  const runs: Station[][] = [];
  let current: Station[] = [];
  for (const s of stations) {
    if (blocked(s.x + s.nx * edge, s.z + s.nz * edge)) {
      if (current.length >= 2) runs.push(current);
      current = [];
    } else {
      current.push(s);
    }
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

export function buildGuardrails(roads: readonly RoadData[], blocked?: RailBlocked): GuardrailResult {
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const posts: Matrix4[] = [];

  const forward = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3(RAIL.postWidth, RAIL.top + 0.1, RAIL.postDepth);
  const position = new Vector3();

  let totalLength = 0;

  for (const road of roads) {
    const settings = ROAD_TYPES[road.type];
    const edge = settings.width / 2 + settings.shoulder + RAIL.offset;

    for (const rail of road.rails) {
      const alle = stationsFor(road, rail.side, rail.from, rail.to);
      if (alle.length < 2) continue;

      for (const stations of runsOf(alle, blocked, edge)) {
      // Gezählt wird, was **gebaut** wurde, nicht was geplant war. Der
      // Unterschied ist die Länge, die an Einmündungen entfällt — und eine
      // Kennzahl, die den Sollwert meldet statt das Ergebnis, ist in diesem
      // Projekt der erste Eintrag unter „was schon schiefgegangen ist".
      const first = stations[0]!;
      const last = stations[stations.length - 1]!;
      totalLength += last.distance - first.distance;

      const base = vertices.length / 3;

      for (let i = 0; i < stations.length; i++) {
        const s = stations[i]!;
        const px = s.x + s.nx * edge;
        const pz = s.z + s.nz * edge;

        // Zwei Punkte je Station: Unter- und Oberkante des Bandes.
        vertices.push(px, s.y + RAIL.bottom, pz, px, s.y + RAIL.top, pz);
        // Die Normale zeigt zur Fahrbahn — von dort wird die Planke gesehen.
        normals.push(-s.nx, 0, -s.nz, -s.nx, 0, -s.nz);
        const u = (s.distance - rail.from) / 4;
        uvs.push(u, 0, u, 1);

        if (i + 1 < stations.length) {
          const a = base + i * 2;
          const b = a + 1;
          const c = a + 2;
          const d = a + 3;
          // Wickelrichtung wie beim Straßen-Mesh: (a, b, c) ergibt die Normale
          // zur Fahrbahn hin. Andersherum verschwindet das Band im
          // Backface-Culling, und zwar ohne dass eine einzige Kennzahl
          // auffällig würde — derselbe Fehler wie in `RoadMeshBuilder`.
          indices.push(a, b, c, b, d, c);
        }
      }

      // Pfosten in festem Abstand, unabhängig von der Stützstellendichte.
      const railLength = last.distance - first.distance;
      const postCount = Math.max(2, Math.round(railLength / RAIL.postSpacing));
      for (let k = 0; k <= postCount; k++) {
        const target = first.distance + (railLength * k) / postCount;
        // Nächste Station zu dieser Streckenangabe.
        let best = stations[0]!;
        for (const s of stations) {
          if (Math.abs(s.distance - target) < Math.abs(best.distance - target)) best = s;
        }

        position.set(
          best.x + best.nx * edge,
          best.y + (RAIL.top + 0.1) / 2 - 0.1,
          best.z + best.nz * edge,
        );
        forward.set(-best.nz, 0, best.nx);
        quaternion.setFromUnitVectors(new Vector3(0, 0, 1), forward.normalize());
        posts.push(new Matrix4().compose(position, quaternion, scale));
      }
      }
    }
  }

  if (indices.length === 0) {
    return { geometry: null, posts, triangles: 0, length: 0 };
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeBoundingSphere();
  geometry.name = 'Leitplanken';

  return {
    geometry,
    posts,
    triangles: indices.length / 3,
    length: totalLength,
  };
}

export { RAIL };
