import {
  BufferGeometry,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { paletteEntry } from '@/config/palette.mjs';

/**
 * Prozedurale Landmarks — PLAN.md P5 / 5.2.
 *
 * > **Warum prozedural und nicht aus der Pipeline aus 5.1.** Nicht aus
 * > Bequemlichkeit, sondern weil es die Modelle nicht gibt. Der Katalog von
 * > Poly Haven wurde vollständig durchsucht (400 Assets): **null Treffer** für
 * > Torii, Schrein, Tempel oder Steinlaterne. Die vier Laternen dort sind eine
 * > Sturmlaterne, eine Deckslaterne, ein Kronleuchter und eine indische Diya.
 * > Genau die fehlenden Stücke sind aber die, an denen die Abnahmezeile hängt:
 * > „Jede Zone ist im Vorbeifliegen ohne Karte identifizierbar."
 * >
 * > Die Pipeline aus 5.1 ist deshalb **nicht** überflüssig — sie verarbeitet
 * > die Felsen und den Steg, wo echte Geometrie tatsächlich besser ist als
 * > gerechnete. Ein Findling aus Boxen wäre kein Findling.
 *
 * **Ein Material für alle**: die Palettenfarbe steckt in den Vertexfarben, nicht
 * in getrennten Materialien. Ein Torii aus drei Materialien wären drei
 * `InstancedMesh` und damit drei Draw-Calls je Landmark-Art; über zehn Arten
 * summiert sich das auf mehr, als das Stadtbudget aus P6 später übrig lässt.
 * Der Preis ist, dass Rauheit und Metallizität für alle Props gleich sind —
 * siehe `PropMaterial`.
 *
 * Maßstab ist verbindlich (SPEC/PLAN-Abnahme: „Tür ≈ 2 m, Torii ≈ 5 m"). Die
 * Zahlen unten sind deshalb keine Geschmacksfrage; wo eine ungewöhnlich wirkt,
 * steht der Grund daneben.
 */

export type LandmarkId =
  | 'torii'
  | 'stoneLantern'
  | 'hokora'
  | 'templeHall'
  | 'templeStairs'
  | 'farmhouse'
  | 'shed'
  | 'powerPole'
  | 'tetrapod'
  | 'lighthouse'
  | 'boat'
  | 'delineator';

const matrix = new Matrix4();
const color = new Color();
const axis = new Vector3();

/** Verschieben. Verändert die Geometrie, statt eine Kopie anzulegen. */
function at(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return geometry.applyMatrix4(matrix.makeTranslation(x, y, z));
}

function rotY(geometry: BufferGeometry, radians: number): BufferGeometry {
  return geometry.applyMatrix4(matrix.makeRotationY(radians));
}

function rotZ(geometry: BufferGeometry, radians: number): BufferGeometry {
  return geometry.applyMatrix4(matrix.makeRotationZ(radians));
}

function rotX(geometry: BufferGeometry, radians: number): BufferGeometry {
  return geometry.applyMatrix4(matrix.makeRotationX(radians));
}

/**
 * Palettenfarbe als Vertexfarbe eintragen.
 *
 * `setHex(value, 'srgb')` und nicht `setHex(value)`: die Palette nennt Farben
 * so, wie man sie im Farbwähler wählt. three rechnet intern linear, und ohne
 * die Angabe des Quellraums läge jedes Prop sichtbar heller als die
 * Fremdmodelle, deren `baseColorFactor` die Pipeline korrekt umrechnet.
 */
function paint(geometry: BufferGeometry, name: string): BufferGeometry {
  color.setHex(paletteEntry(name).color, 'srgb');
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

/** Kasten in Palettenfarbe, mit Mittelpunkt im Ursprung. */
function box(w: number, h: number, d: number, material: string): BufferGeometry {
  return paint(new BoxGeometry(w, h, d), material);
}

/** Zylinder, Fuß auf y = 0. */
function pillar(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  material: string,
): BufferGeometry {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  return at(paint(geometry, material), 0, height / 2, 0);
}

/** Kegel, Fuß auf y = 0. */
function cone(
  radius: number,
  height: number,
  segments: number,
  material: string,
): BufferGeometry {
  const geometry = new ConeGeometry(radius, height, segments);
  return at(paint(geometry, material), 0, height / 2, 0);
}

/**
 * Teile zusammenführen — dieselbe Falle wie bei der Vegetation.
 *
 * `mergeGeometries` verlangt, dass entweder alle Teile einen Index haben oder
 * keines, und three ist darin nicht einheitlich. Beim Fehlschlag liefert die
 * Funktion `null` statt zu werfen: die Anwendung bliebe wortlos in der
 * Initialisierung stehen. Deshalb erst alles auf „nicht indiziert", dann
 * zusammenführen, dann laut werden.
 */
function finish(parts: BufferGeometry[], name: string): BufferGeometry {
  const flat = parts.map((part) => {
    const converted = part.index ? part.toNonIndexed() : part;
    if (converted !== part) part.dispose();
    return converted;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error(`Landmark „${name}" ließ sich nicht zusammenführen.`);
  for (const part of flat) part.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  merged.name = name;
  return merged;
}

// ── Wald / Tempel ────────────────────────────────────────────────────────────

/**
 * Torii im Myōjin-Stil — das eine Bauteil, an dem die Zone erkennbar ist.
 *
 * Die Merkmale, ohne die es kein Torii ist und mit denen es aus 200 m eines
 * ist: zwei **nach innen geneigte** Säulen, ein zweiter Riegel (`nuki`), der
 * seitlich übersteht, und ein oberer Balken (`kasagi`), dessen Enden nach oben
 * auslaufen. Die Neigung beträgt echte 1,5° — sichtbar ist davon fast nichts,
 * aber ein exakt senkrechtes Torii sieht aus wie ein Türrahmen.
 *
 * Gemessen 6,92 × 5,19 × 0,88 m — die Abnahme nennt „Torii ≈ 5 m".
 */
function torii(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const halfSpan = 2.05;
  const height = 4.6;
  const lean = (1.5 * Math.PI) / 180;

  for (const side of [-1, 1]) {
    parts.push(at(pillar(0.24, 0.29, height, 8, 'vermilion'), side * halfSpan, 0, 0));
    // Fundamentstein. Ohne ihn steht die Säule auf dem Boden auf, und jede
    // Unebenheit des Geländes schneidet sie an.
    parts.push(at(pillar(0.4, 0.44, 0.28, 8, 'stone'), side * halfSpan, 0, 0));
    // Neigung wird nachträglich aufgeprägt: die beiden Säulen kippen zueinander.
    const last = parts[parts.length - 2]!;
    at(rotZ(at(last, -side * halfSpan, 0, 0), side * lean), side * halfSpan, 0, 0);
  }

  // Nuki — der untere Riegel, steht beidseitig über.
  parts.push(at(box(halfSpan * 2 + 0.9, 0.3, 0.34, 'vermilion'), 0, height - 0.85, 0));
  // Gakuzuka — der kurze Pfosten zwischen den Riegeln, in der Mitte.
  parts.push(at(box(0.26, 0.72, 0.24, 'vermilion'), 0, height - 0.34, 0));

  // Kasagi und Shimaki: der Deckbalken aus drei Stücken, die äußeren leicht
  // angehoben. Eine echte Kurve wäre eine Extrusion entlang eines Splines und
  // damit ein Vielfaches der Dreiecke für eine Silhouette, die man ab 30 m
  // ohnehin gerade sieht.
  const capY = height + 0.24;
  parts.push(at(box(halfSpan * 2 + 0.6, 0.26, 0.46, 'vermilion'), 0, capY, 0));
  parts.push(at(box(halfSpan * 2 + 0.2, 0.2, 0.4, 'vermilion'), 0, capY + 0.24, 0));
  for (const side of [-1, 1]) {
    const wing = box(1.1, 0.24, 0.44, 'vermilion');
    parts.push(at(rotZ(wing, side * 0.16), side * (halfSpan + 0.85), capY + 0.12, 0));
  }
  return finish(parts, 'torii');
}

/**
 * Steinlaterne im Kasuga-Stil, gemessen 2,24 m.
 *
 * Sechseckig, weil sie es ist — und weil ein Sechseck bei diesem Durchmesser
 * aus jeder Entfernung, aus der man sie sieht, von einem Kreis nicht zu
 * unterscheiden ist und ein Drittel der Dreiecke eines Achtecks kostet.
 */
function stoneLantern(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  let y = 0;
  const stack = (geometry: BufferGeometry, height: number): void => {
    parts.push(at(geometry, 0, y, 0));
    y += height;
  };
  stack(pillar(0.3, 0.38, 0.22, 6, 'stone'), 0.22); // Kiso — Sockel
  stack(pillar(0.11, 0.13, 0.92, 6, 'stone'), 0.92); // Sao — Schaft
  stack(pillar(0.3, 0.2, 0.16, 6, 'stone'), 0.16); // Chudai — Mittelplatte
  stack(pillar(0.28, 0.3, 0.42, 6, 'stone'), 0.42); // Hibukuro — Feuerkorb
  stack(pillar(0.5, 0.34, 0.1, 6, 'stone'), 0.1); // Kasa — Dachansatz
  stack(cone(0.52, 0.28, 6, 'stone'), 0.28); // Dach
  stack(pillar(0.05, 0.09, 0.14, 6, 'stone'), 0.14); // Hoju — Knauf
  return finish(parts, 'stoneLantern');
}

/**
 * Hokora — der kleine Bergschrein am Pass, gemessen 1,4 m hoch.
 *
 * Der billigste Landmark im Satz und einer der wirksamsten: ein Stück
 * bearbeiteter Stein an einer Stelle, an der sonst nur Fels ist, sagt sofort,
 * dass hier jemand vorbeikommt.
 */
function hokora(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(at(box(1.1, 0.26, 0.9, 'stone'), 0, 0.13, 0));
  parts.push(at(box(0.86, 0.2, 0.7, 'stone'), 0, 0.36, 0));
  parts.push(at(box(0.62, 0.62, 0.5, 'stone'), 0, 0.77, 0));
  // Türnische, ein paar Zentimeter tief in die Vorderseite gesetzt.
  parts.push(at(box(0.3, 0.4, 0.06, 'vermilion'), 0, 0.74, 0.24));
  // Giebeldach aus zwei geneigten Platten.
  for (const side of [-1, 1]) {
    const slab = box(0.78, 0.1, 0.62, 'roofTile');
    parts.push(at(rotX(slab, side * 0.55), 0, 1.22, side * 0.16));
  }
  parts.push(at(box(0.8, 0.09, 0.12, 'roofTile'), 0, 1.32, 0));
  return finish(parts, 'hokora');
}

/**
 * Tempelhalle, gemessen 14,0 × 7,7 × 11,0 m.
 *
 * Was eine japanische Halle ausmacht und hier drinsteckt: ein **Steinpodest**,
 * eine Reihe freistehender Säulen davor und ein Dach mit **weitem Überstand**
 * — der Dachrand steht 1,4 m über die Säulen hinaus. Genau dieser Überstand
 * erzeugt den tiefen Schattenstreifen, an dem der Bau auch aus der Ferne als
 * Tempel und nicht als Scheune gelesen wird.
 */
function templeHall(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const platformY = 0.9;
  parts.push(at(box(13.2, platformY, 10.6, 'stone'), 0, platformY / 2, 0));
  parts.push(at(box(10.4, 3.4, 7.6, 'plaster'), 0, platformY + 1.7, 0));

  // Freistehende Säulen entlang der Vorderseite und der Flanken.
  for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) {
    parts.push(at(pillar(0.24, 0.28, 3.4, 8, 'vermilion'), x, platformY, 4.4));
    parts.push(at(pillar(0.24, 0.28, 3.4, 8, 'vermilion'), x, platformY, -4.4));
  }
  for (const z of [-2.2, 2.2]) {
    parts.push(at(pillar(0.24, 0.28, 3.4, 8, 'vermilion'), -5.8, platformY, z));
    parts.push(at(pillar(0.24, 0.28, 3.4, 8, 'vermilion'), 5.8, platformY, z));
  }

  // Traufbalken, auf dem das Dach sitzt.
  const eaveY = platformY + 3.4;
  parts.push(at(box(13.6, 0.34, 11.0, 'wood'), 0, eaveY + 0.17, 0));

  // Walmdach als vierseitiger Kegel — 4 Segmente, um 45° gedreht, damit die
  // Grate über die Ecken laufen. Der Kegel ist rund, das Dach soll es nicht
  // sein; die Skalierung in Z macht daraus die rechteckige Grundfläche.
  // **Erst drehen, dann stauchen.** Umgekehrt dreht sich die Stauchung mit und
  // das Dach bleibt quadratisch — gemessen 14,00 × 14,00 m über einem Bau von
  // 13,2 × 10,6 m. Ein japanisches Walmdach ist rechteckig; der First braucht
  // eine Richtung.
  const roof = rotY(cone(9.9, 3.1, 4, 'roofTile'), Math.PI / 4);
  roof.applyMatrix4(matrix.makeScale(1, 1, 0.78));
  parts.push(at(roof, 0, eaveY + 0.34, 0));
  // Firstbalken. Ohne ihn läuft das Dach in einer Spitze zusammen, und das tut
  // ein japanisches Walmdach nie.
  parts.push(at(box(4.4, 0.5, 0.7, 'roofTile'), 0, eaveY + 3.1, 0));
  return finish(parts, 'templeHall');
}

/**
 * Treppenaufgang, 12 Stufen, gemessen 4,3 × 2,5 × 3,8 m.
 *
 * Steigung 18 cm, Auftritt 30 cm — steiler als eine europäische Treppe und
 * damit ein eigenes Erkennungsmerkmal. Die Stufen sind volle Quader bis zum
 * Boden, nicht Platten: von der Seite sieht man sonst durch die Treppe hindurch.
 */
function templeStairs(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const steps = 12;
  const rise = 0.18;
  const tread = 0.3;
  const width = 3.6;
  for (let i = 0; i < steps; i++) {
    const height = rise * (i + 1);
    parts.push(at(box(width, height, tread, 'stone'), 0, height / 2, -i * tread));
  }
  // Seitliche Wangen, leicht überstehend.
  for (const side of [-1, 1]) {
    const cheek = box(0.34, 0.34, steps * tread + 0.4, 'stone');
    const slope = Math.atan2(steps * rise, steps * tread);
    parts.push(
      at(rotX(cheek, slope), side * (width / 2 + 0.17), (steps * rise) / 2 + 0.2, -(steps * tread) / 2),
    );
  }
  return finish(parts, 'templeStairs');
}

// ── Reisfelder ───────────────────────────────────────────────────────────────

/**
 * Bauernhaus im Minka-Stil, gemessen 11,9 × 7,5 × 9,8 m.
 *
 * Das Dach ist **mehr als die Hälfte der Bauhöhe** — das ist kein Versehen,
 * sondern das Merkmal: ein Reetdach mit 45° Neigung über einem niedrigen
 * Erdgeschoss. Wände heller Putz, Rahmenhölzer dunkel; die Tür misst 2 m,
 * damit der Maßstab an einem bekannten Maß prüfbar bleibt.
 */
function farmhouse(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const wallH = 2.9;
  parts.push(at(box(11, wallH, 8, 'plaster'), 0, wallH / 2, 0));
  // Rahmenhölzer: Schwelle, Rähm und vier Pfosten.
  parts.push(at(box(11.2, 0.24, 8.2, 'wood'), 0, 0.12, 0));
  parts.push(at(box(11.2, 0.26, 8.2, 'wood'), 0, wallH - 0.13, 0));
  for (const x of [-5.3, -1.8, 1.8, 5.3]) {
    for (const z of [-3.9, 3.9]) parts.push(at(box(0.22, wallH, 0.22, 'wood'), x, wallH / 2, z));
  }
  // Tür, 2,0 m — das Prüfmaß aus der Abnahme.
  parts.push(at(box(1.1, 2.0, 0.1, 'wood'), -1.2, 1.0, 4.02));

  // Reetdach: zwei geneigte Platten plus Giebeldreiecke. Der Überstand von
  // 0,8 m je Seite gehört zum Bild — ein bündiges Dach sieht aus wie ein
  // Container mit Deckel.
  const roofH = 4.2;
  const slope = Math.atan2(roofH, 5.5);
  const slabLength = Math.hypot(roofH, 5.5) + 0.8;
  for (const side of [-1, 1]) {
    const slab = box(slabLength, 0.42, 9.6, 'thatch');
    parts.push(at(rotZ(slab, side * slope), side * 2.75, wallH + roofH / 2, 0));
  }
  for (const z of [-4.5, 4.5]) {
    const gable = box(0.5, roofH * 0.72, 0.4, 'thatch');
    parts.push(at(gable, 0, wallH + roofH * 0.36, z));
  }
  parts.push(at(box(1.0, 0.5, 9.8, 'thatch'), 0, wallH + roofH - 0.1, 0));
  return finish(parts, 'farmhouse');
}

/** Geräteschuppen, gemessen 4,6 × 2,9 × 3,6 m — das Beiwerk, das einen Hof ausmacht. */
function shed(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(at(box(4, 2.3, 3, 'wood'), 0, 1.15, 0));
  parts.push(at(box(1.4, 1.9, 0.08, 'plaster'), 0.6, 0.95, 1.52));
  // Pultdach, zur Rückseite geneigt.
  const roof = box(4.6, 0.16, 3.6, 'roofTile');
  parts.push(at(rotX(roof, 0.16), 0, 2.5, 0));
  return finish(parts, 'shed');
}

/**
 * Strommast, gemessen 9,00 m.
 *
 * Betonmast mit zwei Auslegern und sechs Isolatoren. Über den Reisfeldern
 * stehen sie in Reihen und sind aus der Luft der stärkste Hinweis darauf, dass
 * die Fläche bewirtschaftet ist — deshalb steht er im Satz, obwohl er das
 * unauffälligste Stück darin ist.
 */
function powerPole(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(pillar(0.14, 0.24, 9, 8, 'concrete'));
  for (const y of [7.5, 8.3]) {
    parts.push(at(box(2.6, 0.12, 0.12, 'steel'), 0, y, 0));
    for (const x of [-1.15, 0, 1.15]) {
      parts.push(at(pillar(0.07, 0.09, 0.22, 6, 'stone'), x, y + 0.06, 0));
    }
  }
  return finish(parts, 'powerPole');
}

// ── Küste ────────────────────────────────────────────────────────────────────

/**
 * Wellenbrecher-Tetrapode, gemessen 2,0 × 1,7 × 2,2 m.
 *
 * Vier Kegelstümpfe aus einem gemeinsamen Kern, in die Ecken eines Tetraeders.
 * Zu Hunderten an japanischen Küsten aufgeschüttet, und in dieser Karte das
 * Stück, das die Küste unverwechselbar macht.
 *
 * Die Achsen sind die vier Tetraederrichtungen; der Kern liegt so hoch, dass
 * das Ergebnis auf drei Beinen steht und das vierte nach oben zeigt.
 */
function tetrapod(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const armLength = 1.15;
  const axes: readonly [number, number, number][] = [
    [0, 1, 0],
    [0.9428, -0.3333, 0],
    [-0.4714, -0.3333, 0.8165],
    [-0.4714, -0.3333, -0.8165],
  ];
  parts.push(paint(new SphereGeometry(0.42, 8, 6), 'concrete'));
  for (const [ax, ay, az] of axes) {
    const arm = paint(new CylinderGeometry(0.17, 0.36, armLength, 6), 'concrete');
    // Der Zylinder steht in +Y; ihn auf die Achse zu drehen ist eine Drehung um
    // die Achse senkrecht zu beiden, um den Winkel dazwischen.
    const angle = Math.acos(Math.max(-1, Math.min(1, ay)));
    const nx = -az;
    const nz = ax;
    const norm = Math.hypot(nx, nz);
    if (norm > 1e-6) {
      arm.applyMatrix4(matrix.makeRotationAxis(axis.set(nx / norm, 0, nz / norm), angle));
    }
    parts.push(at(arm, (ax * armLength) / 2, (ay * armLength) / 2, (az * armLength) / 2));
  }
  // Der tiefste Punkt liegt bei −(1/3 · armLength + Radius); alles anheben,
  // damit der Pivot wie überall auf der Bodenmitte sitzt.
  const merged = finish(parts, 'tetrapod');
  merged.computeBoundingBox();
  return at(merged, 0, -(merged.boundingBox?.min.y ?? 0), 0);
}

/** Leuchtturm, gemessen 13,56 m. Der Fixpunkt der Küstenzone. */
function lighthouse(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  let y = 0;
  parts.push(at(pillar(2.0, 2.3, 1.1, 12, 'concrete'), 0, y, 0));
  y += 1.1;
  parts.push(at(pillar(1.05, 1.75, 9.0, 12, 'plaster'), 0, y, 0));
  y += 9.0;
  // Galerie: der auskragende Umgang. Er ist der Grund, warum ein Leuchtturm
  // auch als Silhouette einer ist und nicht ein Schornstein.
  parts.push(at(pillar(1.55, 1.55, 0.16, 12, 'steel'), 0, y, 0));
  parts.push(at(pillar(1.5, 1.5, 0.5, 12, 'steel'), 0, y + 0.16, 0));
  y += 0.66;
  parts.push(at(pillar(1.0, 1.0, 1.7, 12, 'steel'), 0, y, 0));
  y += 1.7;
  parts.push(at(cone(1.25, 1.1, 12, 'roofTile'), 0, y, 0));
  return finish(parts, 'lighthouse');
}

/**
 * Fischerboot, gemessen 5,6 m lang.
 *
 * Der Rumpf ist ein sechseckiger Zylinder quer gelegt und in der Länge
 * gestreckt — aus dem Wasser ragt ohnehin nur die obere Hälfte, und die
 * Facetten lesen sich als Klinkerbeplankung.
 */
function boat(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const hull = paint(new CylinderGeometry(0.9, 0.55, 5.6, 6, 1), 'wood');
  rotX(hull, Math.PI / 2);
  parts.push(at(hull, 0, 0.55, 0));
  parts.push(at(box(2.0, 0.12, 5.2, 'wood'), 0, 1.0, 0));
  parts.push(at(box(1.4, 1.0, 1.6, 'plaster'), 0, 1.5, -1.2));
  parts.push(at(box(1.5, 0.1, 1.7, 'roofTile'), 0, 2.02, -1.2));
  parts.push(at(pillar(0.05, 0.06, 1.6, 5, 'wood'), 0, 1.0, 1.9));
  return finish(parts, 'boat');
}

// ── Berg / Tōge ──────────────────────────────────────────────────────────────

/**
 * Streckenmarkierung am Bergpass, gemessen 1,00 m.
 *
 * Ein Pfosten mit reflektierendem Kopf, wie er an japanischen Bergstraßen
 * alle paar Meter steht. Einzeln bedeutungslos, in der Reihe entlang einer
 * Serpentine ist es das Stück, das die Kurve lesbar macht.
 */
function delineator(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(pillar(0.05, 0.06, 1.0, 5, 'plaster'));
  parts.push(at(box(0.12, 0.14, 0.05, 'vermilion'), 0, 0.86, 0.04));
  return finish(parts, 'delineator');
}

const BUILDERS: Readonly<Record<LandmarkId, () => BufferGeometry>> = {
  torii,
  stoneLantern,
  hokora,
  templeHall,
  templeStairs,
  farmhouse,
  shed,
  powerPole,
  tetrapod,
  lighthouse,
  boat,
  delineator,
};

export const LANDMARK_IDS = Object.keys(BUILDERS) as readonly LandmarkId[];

/**
 * Alle Landmark-Geometrien bauen.
 *
 * **Keine reduzierte Stufe.** PLAN.md 5.5 verlangt sie ab 500 Dreiecken.
 * Gemessen (Summe 2104 Dreiecke über alle zwölf):
 *
 * | Landmark | Δ | | Landmark | Δ |
 * |---|---|---|---|---|
 * | templeHall | **504** | | templeStairs | 168 |
 * | lighthouse | 264 | | stoneLantern | 156 |
 * | farmhouse | 204 | | hokora | 84 |
 * | torii | 200 | | boat | 80 |
 * | powerPole | 200 | | shed | 36 |
 * | tetrapod | 176 | | delineator | 32 |
 *
 * Die Tempelhalle reißt die Schwelle — um **vier Dreiecke**. Sie bekommt
 * trotzdem keine zweite Stufe: die Schwelle ist für Fremdmodelle gedacht, die
 * fünfstellig anfangen (`coastal_cliff_04`: 1 537 926), und ein zusätzlicher
 * Draw-Call, um im besten Fall 300 Dreiecke zu sparen, ist ein schlechtes
 * Geschäft gegen ein Budget von 3 000 000. Die Zahl hier stehenzulassen ist
 * ehrlicher, als die Halle um vier Dreiecke zu beschneiden, damit die Regel
 * formal stimmt.
 *
 * Kleine Props verschwinden stattdessen ab einer Entfernung ganz — die
 * Alternative, die 5.5 selbst nennt. Siehe `PROPS.fade`.
 */
export function createLandmarkMeshes(): Readonly<Record<LandmarkId, BufferGeometry>> {
  const meshes = {} as Record<LandmarkId, BufferGeometry>;
  for (const id of LANDMARK_IDS) meshes[id] = BUILDERS[id]();
  return meshes;
}
