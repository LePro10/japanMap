import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { CHASSIS } from '@/config/vehicle.config';

/**
 * Das Fahrzeug als prozedurale Geometrie — PLAN.md P14.
 *
 * **Warum kein Modell.** Es gibt keines: `assets/source/models` enthält vier
 * Poly-Haven-Assets (zwei Felsen, ein Kliff, eine Mole), und der Startdownload
 * liegt mit 51,95 MB schon weit über den 15 MB aus SPEC §4. Dieselbe Rechnung wie
 * bei den Landmarks in P5.2, mit demselben Ergebnis: gerechnete Geometrie kostet
 * null Bytes, und die Formensprache dieses Projekts ist ohnehin flächig
 * (`flatShading`, Farbe aus Vertexattributen, Look aus dem Licht).
 *
 * Zwei Meshes und damit **zwei Draw-Calls**: Karosserie und ein `InstancedMesh`
 * mit vier Rädern. Die Räder müssen getrennt sein, weil sie lenken und sich
 * drehen; sie zusammenzuführen hieße, die Geometrie je Frame neu zu schreiben.
 *
 * ## Maße
 *
 * 4,20 m lang, 1,68 m breit, 1,30 m hoch über einem Radstand von 2,40 m — die
 * Maße eines japanischen Kompakt-Coupés der späten Achtziger (Toyota AE86:
 * 4,20 × 1,63 × 1,34). Der Maßstab ist in diesem Projekt verbindlich (SPEC-Abnahme
 * „Tür ≈ 2 m, Torii ≈ 5 m"), und ein Auto ist der Maßstab, an dem man alles
 * andere nachprüft: es passt in die 6,5 m Fahrbahn des Bergpasses zweimal neben-
 * einander, und die Leitplanke (Band 0,50…0,85 m) liegt auf Türhöhe.
 *
 * ## Was fehlt
 *
 * **Scheinwerfer leuchten nicht.** Sie sind hell lackierte Flächen, kein
 * Eigenlicht. Emissiv wären sie ein zweites Material und damit ein dritter
 * Draw-Call plus ein Eintrag in der Bloom-Kette — und bei der Beleuchtung dieser
 * Karte (blaue Stunde, 2,23° Sonnenstand) wäre ein Lichtkegel auf der Fahrbahn
 * eine eigene Aufgabe mit eigener Messung, nicht ein Nebenbei. Das ist eine
 * Lücke und keine Entscheidung gegen Licht.
 */

/**
 * Lackfarben, als sRGB-Hex — so, wie man sie in einem Farbwähler wählt.
 *
 * **Nicht in `palette.mjs`**, und das ist Absicht: die Palette ist die
 * Materialliste der *Karte* (Fels, Putz, Reet, Zinnober) und wird auch von den
 * Werkzeugen unter `tools/` gelesen. Autolack gehört nicht in dieselbe Liste,
 * nur weil beides Farben sind.
 *
 * Die Umrechnung nach linear ist Pflicht und nicht Kosmetik: `setHex(value)`
 * ohne Angabe des Quellraums behandelt den Wert als bereits linear, und das Auto
 * stünde sichtbar heller in der Landschaft als jedes Prop daneben. Dieselbe Falle
 * steht in `landmarkMeshes.paint()` und in `roads.config.ts` beim Kiesbelag.
 */
const CAR_COLORS = {
  /** Grundlack: ein kühles Weiß mit Blaustich — bei blauer Stunde lesbar, ohne zu leuchten. */
  paint: 0xd9dee3,
  /** Zweite Lackfläche: Motorhaube und Dachkante, das Panda-Zweifarbenschema. */
  paintDark: 0x2b3038,
  glass: 0x1b2430,
  tire: 0x191b1e,
  rim: 0x9aa0a6,
  lamp: 0xe8e2cf,
  lampRear: 0x7a2320,
  trim: 0x3a3f46,
} as const;

const matrix = new Matrix4();
const color = new Color();

function paint(geometry: BufferGeometry, hex: number): BufferGeometry {
  color.setHex(hex, 'srgb');
  const count = geometry.getAttribute('position').count;
  const rgb = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    rgb[i * 3] = color.r;
    rgb[i * 3 + 1] = color.g;
    rgb[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  return geometry;
}

/** Kasten in Lackfarbe, Mittelpunkt bei (x, y, z). y wird **vom Boden** gemessen. */
function part(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: number,
): BufferGeometry {
  const geometry = paint(new BoxGeometry(w, h, d), hex);
  return geometry.applyMatrix4(matrix.makeTranslation(x, y, z));
}

/**
 * Die Karosserie.
 *
 * Der Ursprung der zurückgegebenen Geometrie liegt im **Schwerpunkt** — also auf
 * `CHASSIS.cgHeight` über der Radaufstandsfläche, nicht am Boden. Das Mesh kann
 * damit direkt `Vehicle.position` und `Vehicle.quaternion` übernehmen, ohne
 * Zwischenknoten und ohne dass jemand den Versatz an zwei Stellen führen muss.
 *
 * `+Z` ist vorn, `+X` rechts — dieselbe Konvention wie im Fahrmodell
 * (`forward = (sin yaw, 0, cos yaw)`), damit ein Vorzeichenfehler nicht erst als
 * rückwärts fahrendes Auto auffällt.
 */
export function createCarBody(): BufferGeometry {
  const parts: BufferGeometry[] = [
    // Unterbau: von 0,34 bis 0,90 über Grund.
    //
    // **Schmaler als `CHASSIS.bodyWidth`, und das ist eine Reparatur aus einem
    // Bild.** Die erste Fassung nahm die Kollisionsbreite (1,62 m) auch für das
    // Blech. Die Spurweite ist 1,48 m, ein Rad 0,21 m breit — die Radaußenkante
    // liegt damit bei 0,845 m, die Blechkante bei 0,810 m. Das Rad stand also
    // **3,5 cm** heraus, und von hinten war das Auto ein Kasten ohne Räder.
    // Gemeldet hat das keine Zahl: Draw-Calls, Instanzzahl und Position waren
    // richtig. Gesehen hat es das erste Bild.
    //
    // 1,44 m lassen das Rad 12,5 cm herausstehen — die Kotflügelbreite eines
    // Coupés mit breiter Spur, und genug, dass man von hinten Räder sieht.
    part(1.44, 0.56, 4.2, 0, 0.62, 0, CAR_COLORS.paint),
    // Kotflügel über den Rädern. Sie schließen die Lücke zwischen dem schmalen
    // Unterbau und der Radaußenkante — ohne sie steht das Rad an einer scharfen
    // Blechkante und sieht angeklebt aus.
    part(1.74, 0.26, 1.05, 0, 0.77, 1.13, CAR_COLORS.paint),
    part(1.74, 0.26, 1.05, 0, 0.77, -1.27, CAR_COLORS.paint),
    // Motorhaube, flach und dunkel — die zweite Lackfläche.
    part(1.58, 0.1, 1.5, 0, 0.91, 1.15, CAR_COLORS.paintDark),
    // Kofferraumdeckel.
    part(1.58, 0.1, 0.95, 0, 0.91, -1.6, CAR_COLORS.paint),
    // Fahrgastzelle, unterer Teil (Türbrüstung).
    part(1.52, 0.16, 2.0, 0, 0.98, -0.25, CAR_COLORS.paint),
    // Verglasung als eigener Ring: schmaler als die Brüstung, damit eine Kante
    // stehen bleibt. Flach schattiert wird daraus eine Fensterlinie.
    part(1.44, 0.34, 1.94, 0, 1.23, -0.25, CAR_COLORS.glass),
    // Dach.
    part(1.46, 0.08, 1.7, 0, 1.44, -0.35, CAR_COLORS.paintDark),
    // Stoßfänger vorn und hinten, in Anbauteil-Grau.
    part(1.5, 0.24, 0.22, 0, 0.46, 2.06, CAR_COLORS.trim),
    part(1.5, 0.24, 0.22, 0, 0.46, -2.06, CAR_COLORS.trim),
    // Scheinwerfer und Rückleuchten. Sie leuchten nicht — siehe Kopf.
    part(0.36, 0.16, 0.08, -0.55, 0.82, 2.11, CAR_COLORS.lamp),
    part(0.36, 0.16, 0.08, 0.55, 0.82, 2.11, CAR_COLORS.lamp),
    part(0.42, 0.14, 0.08, -0.5, 0.82, -2.11, CAR_COLORS.lampRear),
    part(0.42, 0.14, 0.08, 0.5, 0.82, -2.11, CAR_COLORS.lampRear),
    // Seitenspiegel — zwei Klötzchen, aber sie geben der Silhouette die Breite,
    // an der man das Auto in der Verfolgerkamera als Auto erkennt.
    part(0.16, 0.08, 0.1, -0.78, 1.06, 0.75, CAR_COLORS.paintDark),
    part(0.16, 0.08, 0.1, 0.78, 1.06, 0.75, CAR_COLORS.paintDark),
  ];

  const merged = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  if (!merged) {
    // `mergeGeometries` gibt bei nicht zusammenpassenden Attributen `null`
    // zurück. Das ist hier unmöglich (alle Teile sind gleich aufgebaute
    // BoxGeometry), aber ein stiller `null`-Durchlauf wäre ein unsichtbares Auto
    // — und dieses Projekt hat vier davon in P6 gesucht.
    throw new Error('Fahrzeug-Karosserie: mergeGeometries hat null geliefert.');
  }
  merged.applyMatrix4(matrix.makeTranslation(0, -CHASSIS.cgHeight, 0));
  merged.computeBoundingSphere();
  merged.name = 'Fahrzeug';
  return merged;
}

/**
 * Ein Rad. Achse längs **X**, Mittelpunkt im Ursprung.
 *
 * `CylinderGeometry` steht auf Y; die Drehung um Z legt sie auf die Achse, auf der
 * das Rad sich später um seine eigene Achse dreht. Wer das vergisst, bekommt ein
 * Rad, das wie ein Kreisel auf dem Asphalt steht — und das ist der einzige Fehler
 * hier, der im Bild sofort auffällt.
 */
export function createCarWheel(): BufferGeometry {
  const tire = paint(
    new CylinderGeometry(CHASSIS.wheelRadius, CHASSIS.wheelRadius, CHASSIS.wheelWidth, 14, 1),
    CAR_COLORS.tire,
  );
  // Felge: etwas breiter als der Reifen, damit sie an beiden Seiten sichtbar
  // bleibt, und deutlich kleiner im Radius. Sie ist der Teil, an dem man die
  // Raddrehung überhaupt sieht — ein einfarbiger Zylinder dreht sich unsichtbar.
  const rim = paint(
    new CylinderGeometry(
      CHASSIS.wheelRadius * 0.58,
      CHASSIS.wheelRadius * 0.58,
      CHASSIS.wheelWidth + 0.02,
      6,
      1,
    ),
    CAR_COLORS.rim,
  );

  const merged = mergeGeometries([tire, rim], false);
  tire.dispose();
  rim.dispose();
  if (!merged) throw new Error('Fahrzeug-Rad: mergeGeometries hat null geliefert.');
  merged.applyMatrix4(matrix.makeRotationZ(Math.PI / 2));
  merged.computeBoundingSphere();
  merged.name = 'Fahrzeugrad';
  return merged;
}
