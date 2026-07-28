import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Vegetationsgeometrie, prozedural — PLAN.md P4 / 4.2, 4.3.
 *
 * Vier Arten in je zwei Mesh-Stufen. Die dritte Stufe ist kein Mesh, sondern
 * der Imposter aus 4.4.
 *
 * > **Warum hier keine CC0-Modelle geladen werden**, steht in
 * > `vegetation.config.ts`: die verpflichtende Normalisierungs-Pipeline ist
 * > P5.1, und ein Modell davor direkt einzuhängen wäre genau der Stil-Mix, vor
 * > dem SPEC §6 warnt. Was P4 abnehmen muss — Streuung, Instanzierung, LOD,
 * > Budget — hängt nicht an der Silhouette.
 *
 * Jede Geometrie trägt neben Position, Normale und UV ein Attribut `aWind`:
 * die Amplitude, mit der der Vertex im Wind ausschlägt. PLAN.md 4.5 nennt dafür
 * die **Vertex-Farbe**; dagegen spricht, dass `MeshStandardMaterial` mit
 * `vertexColors` das Albedo damit multipliziert. Der Wurzelbereich wäre dann
 * schwarz — die Maske hat mit Farbe nichts zu tun und bekommt deshalb ein
 * eigenes Attribut.
 */

export type VegetationSpeciesId = 'pine' | 'broadleaf' | 'bush' | 'grass';

/** Die beiden Mesh-Stufen. Stufe 2 ist der Imposter und hat keine Geometrie. */
export interface SpeciesMeshes {
  readonly full: BufferGeometry;
  readonly reduced: BufferGeometry;
  /** Höhe des ungeskalierten Modells in Metern — der Imposter-Baker braucht sie. */
  readonly height: number;
  /** Halber Durchmesser der Krone, ebenfalls für den Imposter. */
  readonly radius: number;
}

const transform = new Matrix4();

function place(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return geometry.applyMatrix4(transform.makeTranslation(x, y, z));
}

/**
 * Windmaske aus der Höhe: unten null, oben eins, dazwischen quadratisch.
 *
 * Quadratisch und nicht linear, weil ein Stamm sich wie ein eingespannter
 * Balken biegt — die Auslenkung wächst zur Spitze hin überproportional. Linear
 * sieht aus, als würde der ganze Baum kippen statt sich zu biegen.
 */
function addWindMask(geometry: BufferGeometry, height: number, floor = 0): BufferGeometry {
  const position = geometry.getAttribute('position');
  const wind = new Float32Array(position.count);
  const span = Math.max(height - floor, 0.001);
  for (let i = 0; i < position.count; i++) {
    const t = Math.min(Math.max((position.getY(i) - floor) / span, 0), 1);
    wind[i] = t * t;
  }
  geometry.setAttribute('aWind', new BufferAttribute(wind, 1));
  return geometry;
}

function finish(parts: BufferGeometry[], height: number, floor = 0): BufferGeometry {
  // **Erst alle Teile auf „nicht indiziert" bringen, dann zusammenführen.**
  // `mergeGeometries` verlangt, dass entweder *alle* Teile einen Index haben
  // oder *keines* — und three ist darin nicht einheitlich: `CylinderGeometry`
  // und `PlaneGeometry` sind indiziert, `IcosahedronGeometry` (über
  // `PolyhedronGeometry`) nicht. Beim Laubbaum stehen beide Sorten in einer
  // Liste, und das Zusammenführen scheitert dann mit einer Meldung, die nur in
  // der Konsole landet: die Funktion liefert `null`, und die Anwendung bleibt
  // mitten in der Initialisierung stehen, ohne etwas anzuzeigen.
  //
  // Die Richtung „nicht indiziert" ist nicht die sparsamere, aber die richtige:
  // das Material rendert mit `flatShading`, und dafür braucht jedes Dreieck
  // ohnehin eigene Vertices.
  const flat = parts.map((part) => {
    const converted = part.index ? part.toNonIndexed() : part;
    if (converted !== part) part.dispose();
    return converted;
  });

  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('Vegetationsgeometrie ließ sich nicht zusammenführen.');
  for (const part of flat) part.dispose();
  addWindMask(merged, height, floor);
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Nadelbaum: Stamm plus vier gestapelte Kegel.
 *
 * Vier statt der naheliegenden drei — mit dreien liest sich die Silhouette aus
 * der Entfernung als Dreieck, und ein Dreieck ist im Zweifel ein Felsen. Der
 * gestufte Rand ist das, was den Baum als Baum erkennbar macht, und genau
 * darauf kommt es beim Übergang zum Imposter an.
 */
function pine(segments: number, tiers: number): BufferGeometry {
  const parts: BufferGeometry[] = [
    place(new CylinderGeometry(0.1, 0.17, 1.5, segments, 1, true), 0, 0.75, 0),
  ];
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const radius = 1.45 - t * 0.75;
    const tall = 2.1 - t * 0.5;
    const base = 1.0 + i * (3.6 / tiers);
    parts.push(place(new ConeGeometry(radius, tall, segments, 1, false), 0, base + tall / 2, 0));
  }
  return finish(parts, 5.4);
}

/**
 * Laubbaum: Stamm plus drei versetzte Kronenblasen.
 *
 * Eine einzelne Kugel wirkt wie ein Lutscher. Drei gegeneinander versetzte
 * Ikosaeder ergeben einen unregelmäßigen Umriss, und weil sie sich überlappen,
 * fällt die geringe Facettenzahl nicht auf.
 */
function broadleaf(detail: number): BufferGeometry {
  const parts: BufferGeometry[] = [
    place(new CylinderGeometry(0.16, 0.26, 2.4, detail > 0 ? 7 : 4, 1, true), 0, 1.2, 0),
    place(new IcosahedronGeometry(1.5, detail), 0, 3.3, 0),
    place(new IcosahedronGeometry(1.05, detail), 0.95, 2.75, 0.35),
    place(new IcosahedronGeometry(0.9, detail), -0.7, 3.0, -0.75),
  ];
  return finish(parts, 4.9, 1.4);
}

function bush(detail: number): BufferGeometry {
  const parts: BufferGeometry[] = [
    place(new IcosahedronGeometry(0.62, detail), 0, 0.5, 0),
    place(new IcosahedronGeometry(0.44, detail), 0.45, 0.35, 0.2),
    place(new IcosahedronGeometry(0.38, detail), -0.35, 0.32, -0.35),
  ];
  return finish(parts, 1.1);
}

/**
 * Grasbüschel: sich kreuzende, nach oben spitz zulaufende Halme.
 *
 * Keine Alpha-Textur, sondern Geometrie. Alpha-Test kostet auf jeder Hardware
 * den frühen Tiefentest, und bei 50 000 Instanzen ist das der teuerste
 * denkbare Weg, ein paar Dreiecke zu sparen. Die Halme sind zweiseitig
 * gerendert — dafür gibt es beim Gras keinen sinnvollen Rückseitentest.
 */
function grass(blades: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2 + (i % 2) * 0.4;
    const height = 0.42 + (i % 3) * 0.12;
    const blade = new PlaneGeometry(0.11, height, 1, 1);
    // Oben auf einen Punkt zusammenziehen: aus dem Rechteck wird ein Halm.
    const position = blade.getAttribute('position');
    for (let v = 0; v < position.count; v++) {
      if (position.getY(v) > 0) position.setX(v, position.getX(v) * 0.15);
    }
    blade.translate(0, height / 2, 0);
    blade.rotateZ((i % 2 ? 1 : -1) * 0.18);
    blade.rotateY(angle);
    blade.translate(Math.cos(angle) * 0.05, 0, Math.sin(angle) * 0.05);
    parts.push(blade);
  }
  return finish(parts, 0.66);
}

/**
 * Das Quad, auf dem ein Imposter liegt — PLAN.md P4 / 4.4.
 *
 * `position.x` läuft von −0,5 bis 0,5, `position.y` von 0 bis 1; Maßstab und
 * Verschiebung setzt der Shader aus dem Aufnahmerahmen des Atlas. Zwei Dreiecke,
 * keine Normalen (die kommen aus dem Atlas) — aber eine `normal` wird trotzdem
 * angelegt, weil `MeshStandardMaterial` das Attribut deklariert und ein nicht
 * gebundenes in WebGL2 als Nullvektor liest.
 */
export function createImposterQuad(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = 'ImposterQuad';
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]),
      3,
    ),
  );
  geometry.setAttribute(
    'normal',
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  );
  geometry.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
  );
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  return geometry;
}

export function createVegetationMeshes(): Readonly<Record<VegetationSpeciesId, SpeciesMeshes>> {
  return {
    pine: { full: pine(9, 4), reduced: pine(5, 2), height: 5.4, radius: 1.5 },
    broadleaf: { full: broadleaf(1), reduced: broadleaf(0), height: 4.9, radius: 2.1 },
    bush: { full: bush(1), reduced: bush(0), height: 1.1, radius: 1.1 },
    grass: { full: grass(6), reduced: grass(3), height: 0.66, radius: 0.35 },
  };
}
