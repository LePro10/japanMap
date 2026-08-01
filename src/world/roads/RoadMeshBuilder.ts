import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

import { ROAD_MESH, ROAD_TYPES, type RoadData } from '@/config/roads.config';

/**
 * Straßen-Mesh aus einer abgetasteten Mittellinie — PLAN.md P3 / 3.4.
 *
 * Die Mittellinie kommt fertig aus `roads.json` und wird hier **nicht** noch
 * einmal ausgewertet. Der Plan sprach von „adaptiver Abtastung: dicht in
 * Kurven, spärlich auf Geraden"; das ist hier nicht nötig und wäre sogar
 * schädlich. Die Abtastung ist bereits gleichmäßig in der Bogenlänge, und
 * genau darauf beruht die maßstabsgetreue Textur — eine zweite, adaptive
 * Abtastung darüber würde die Gleichmäßigkeit wieder zerstören. Der Preis sind
 * ein paar tausend Dreiecke mehr auf Geraden; gemessen ist das ganze Netz
 * unter 30 000 Dreiecken und damit ein Prozent des Budgets.
 */

/** Querschnitt: seitlicher Versatz und Höhenversatz je Punkt, von links nach rechts. */
interface CrossSection {
  readonly lateral: readonly number[];
  readonly vertical: readonly number[];
}

/**
 * Vier Punkte: Bankett links, Fahrbahnkante links, Fahrbahnkante rechts,
 * Bankett rechts. Die Bankette liegen tiefer — ohne diesen Absatz endet die
 * Fahrbahn als messerscharfe Kante in der Luft, und bei 2,2° Sonnenstand
 * zeichnet die Kante einen harten Schattenstrich neben die Straße.
 */
const SHOULDER_DROP = 0.22;

function crossSection(width: number, shoulder: number): CrossSection {
  const half = width / 2;
  return {
    lateral: [-half - shoulder, -half, half, half + shoulder],
    vertical: [-SHOULDER_DROP, 0, 0, -SHOULDER_DROP],
  };
}

export interface RoadGeometryResult {
  readonly geometry: BufferGeometry;
  readonly triangles: number;
}

/**
 * Vorzeichenbehaftete Krümmung in der XZ-Ebene, in 1/m.
 *
 * Positiv = Linkskurve. Wird für die Querneigung gebraucht: geneigt wird zur
 * Kurvenaußenseite, und ohne Vorzeichen wüsste man nicht, welche das ist.
 */
function signedCurvature(
  positions: Float32Array,
  index: number,
  count: number,
  closed: boolean,
): number {
  const previous = closed ? (index - 1 + count) % count : Math.max(index - 1, 0);
  const next = closed ? (index + 1) % count : Math.min(index + 1, count - 1);
  if (previous === next) return 0;

  const ax = positions[index * 3]! - positions[previous * 3]!;
  const az = positions[index * 3 + 2]! - positions[previous * 3 + 2]!;
  const bx = positions[next * 3]! - positions[index * 3]!;
  const bz = positions[next * 3 + 2]! - positions[index * 3 + 2]!;

  const lengthA = Math.hypot(ax, az);
  const lengthB = Math.hypot(bx, bz);
  if (lengthA < 1e-5 || lengthB < 1e-5) return 0;

  const cross = (ax * bz - az * bx) / (lengthA * lengthB);
  const dot = (ax * bx + az * bz) / (lengthA * lengthB);
  const turn = Math.atan2(cross, dot);
  // Krümmung ist Richtungsänderung pro Weglänge.
  return turn / ((lengthA + lengthB) / 2);
}

export function buildRoadGeometry(road: RoadData): RoadGeometryResult {
  const settings = ROAD_TYPES[road.type];
  const full = Float32Array.from(road.centerline);
  const fullCount = full.length / 3;
  const closed = road.closed;

  /**
   * Rücksprung an Kreuzungen — PLAN.md P3 / 3.5.
   *
   * Nach dem Höhenabgleich liegen die einmündende und die durchgehende Straße
   * an der Kreuzung exakt auf derselben Höhe. Das ist gewollt und macht genau
   * deshalb ein neues Problem: zwei koplanare Flächen entscheiden im
   * Tiefenpuffer zufällig, welche gewinnt, und das Ergebnis flimmert beim
   * Fahren. Die einmündende Straße hört deshalb am Fahrbahnrand der anderen
   * auf. Eine Lücke bleibt nicht sichtbar — der Böschungs-Einschnitt im Terrain
   * ebnet beide auf dieselbe Fläche ein.
   */
  const spacing = road.length / (closed ? fullCount : Math.max(fullCount - 1, 1));
  const skipStart = closed ? 0 : Math.round(road.trimStart / spacing);
  const skipEnd = closed ? 0 : Math.round(road.trimEnd / spacing);
  const count = fullCount - skipStart - skipEnd;

  if (count < 2) {
    throw new Error(
      `Straße ${road.id}: nach dem Rücksprung von ${road.trimStart} / ${road.trimEnd} m ` +
        `bleiben nur ${count} Stützstellen übrig.`,
    );
  }

  const positions =
    skipStart === 0 && skipEnd === 0
      ? full
      : full.slice(skipStart * 3, (fullCount - skipEnd) * 3);

  const section = crossSection(settings.width, settings.shoulder);
  const lanes = section.lateral.length;
  const stations = closed ? count + 1 : count;

  const vertices = new Float32Array(stations * lanes * 3);
  const uvs = new Float32Array(stations * lanes * 2);
  const colors = new Float32Array(stations * lanes * 3);

  const tangent = new Vector3();
  const right = new Vector3();
  const roadUp = new Vector3();
  const center = new Vector3();
  const worldUp = new Vector3(0, 1, 0);

  const totalWidth = settings.width + 2 * settings.shoulder;
  const gravel = settings.surface === 'kies';

  for (let s = 0; s < stations; s++) {
    // Bei einer geschlossenen Strecke wird die erste Station am Ende
    // wiederholt. Sie bekommt dieselbe Position, aber eine fortgesetzte
    // Textur-Koordinate — sonst liefe die Textur am Rundenschluss zurück auf
    // null und erzeugte dort einen sichtbaren Sprung.
    const i = closed && s === count ? 0 : s;

    const previous = closed ? (i - 1 + count) % count : Math.max(i - 1, 0);
    const next = closed ? (i + 1) % count : Math.min(i + 1, count - 1);

    center.set(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!);
    tangent
      .set(
        positions[next * 3]! - positions[previous * 3]!,
        positions[next * 3 + 1]! - positions[previous * 3 + 1]!,
        positions[next * 3 + 2]! - positions[previous * 3 + 2]!,
      )
      .normalize();

    right.crossVectors(tangent, worldUp).normalize();
    roadUp.crossVectors(right, tangent).normalize();

    // Querneigung aus der Krümmung, nicht als fester Wert. `banking` aus der
    // Datei ist die **maximale** Neigung; wo die Strecke gerade läuft, gibt es
    // keinen Grund für eine schiefe Fahrbahn.
    const curvature = signedCurvature(positions, i, count, closed);
    const maxBank = (road.banking[i + skipStart] ?? 0) * (Math.PI / 180);
    const bank = Math.max(-maxBank, Math.min(maxBank, curvature * BANK_GAIN * maxBank));
    const cosBank = Math.cos(bank);
    const sinBank = Math.sin(bank);

    // Textur-Koordinate aus der **Bogenlänge**, gemessen an der ungekürzten
    // Mittellinie: sonst springt die Kachelung dort, wo eine Straße wegen einer
    // Kreuzung später anfängt.
    const arcLength =
      closed && s === count ? road.length : (i + skipStart) * spacing;
    const v = arcLength / settings.textureLength;

    for (let k = 0; k < lanes; k++) {
      const lateral = section.lateral[k]!;
      const vertical = section.vertical[k]! + ROAD_MESH.surfaceOffset;
      const base = (s * lanes + k) * 3;

      vertices[base] =
        center.x + right.x * lateral * cosBank + roadUp.x * (lateral * sinBank + vertical);
      vertices[base + 1] =
        center.y + right.y * lateral * cosBank + roadUp.y * (lateral * sinBank + vertical);
      vertices[base + 2] =
        center.z + right.z * lateral * cosBank + roadUp.z * (lateral * sinBank + vertical);

      const uvBase = (s * lanes + k) * 2;
      const across = (lateral + totalWidth / 2) / totalWidth;
      // **Ein Pfad tastet nicht die Fahrbahnmitte ab.** Die Belagstextur trägt
      // bei u ≈ 0,5 den Längsriss einer Fahrbahn; auf einem 1,8 m breiten
      // Trampelpfad lief der als durchgehende schwarze Naht mit — im Bild von
      // 8.9 das auffälligste Merkmal des Aufgangs. Die u-Koordinate wird
      // deshalb in ein schmales Band am linken Rand gelegt, wo der Belag glatt
      // ist. Das kostet zur Laufzeit nichts: es steht schon im Mesh.
      uvs[uvBase] = gravel ? 0.08 + across * 0.3 : across;
      uvs[uvBase + 1] = v;

      // Vertex-Farbe als Datenkanal: R = Pfützenneigung (an den Fahrbahnkanten
      // und auf flachen Abschnitten sammelt sich Wasser), G = Krümmung,
      // B = Belagsart (0 Asphalt, 1 Kies/Erde, seit P8.9).
      const edge = Math.abs(lateral) / (totalWidth / 2);
      colors[base] = Math.min(1, edge * 0.8 + (1 - Math.min(1, Math.abs(curvature) * 40)) * 0.3);
      colors[base + 1] = Math.min(1, Math.abs(curvature) * 40);
      colors[base + 2] = gravel ? 1 : 0;
    }
  }

  const spans = stations - 1;
  const indices = new Uint32Array(spans * (lanes - 1) * 6);
  let cursor = 0;
  for (let s = 0; s < spans; s++) {
    for (let k = 0; k < lanes - 1; k++) {
      // a = diese Station, linke Kante · b = eine Spur weiter rechts
      // c = nächste Station, gleiche Kante · d = deren rechter Nachbar
      const a = s * lanes + k;
      const b = a + 1;
      const cIndex = a + lanes;
      const d = cIndex + 1;

      // Wickelrichtung a→b→c, nicht a→c→b. Die Normale ist
      // (b−a) × (c−a) = rechts × tangente, und weil `rechts` als
      // `tangente × oben` gebildet wird, ergibt das wieder `oben` — unabhängig
      // davon, wohin die Straße gerade läuft.
      //
      // Andersherum zeigt sie nach unten. Die Straße wird dann zwar gezeichnet
      // (die Draw-Calls stimmen, die Dreiecke auch), verschwindet aber
      // vollständig im Backface-Culling: ein Fehler, bei dem jede Zahl richtig
      // aussieht und trotzdem nichts im Bild steht.
      indices[cursor++] = a;
      indices[cursor++] = b;
      indices[cursor++] = cIndex;
      indices[cursor++] = b;
      indices[cursor++] = d;
      indices[cursor++] = cIndex;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = `Road:${road.id}`;

  return { geometry, triangles: indices.length / 3 };
}

/**
 * Wie stark die Krümmung auf die Querneigung schlägt.
 *
 * `curvature * BANK_GAIN` ist bei einem 20-m-Radius (κ = 0,05) genau 1, also
 * volle Neigung. Alles Weitere wird geklemmt. Die Zahl ist damit keine
 * beliebige Konstante, sondern die Aussage „ab 20 m Radius voll geneigt".
 */
const BANK_GAIN = 20;
