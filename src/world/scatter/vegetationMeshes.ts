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

/** Eine Formvariante in ihren beiden Mesh-Stufen. */
export interface MeshVariant {
  readonly full: BufferGeometry;
  readonly reduced: BufferGeometry;
}

export interface SpeciesMeshes {
  /**
   * Formvarianten derselben Art.
   *
   * **Alle auf dieselbe Höhe normiert.** Die Variante darf die *Form* ändern,
   * nicht die Größe — die kommt aus der Instanzmatrix. Ohne die Normierung
   * springt ein hoher Baum beim Wechsel auf den Imposter, weil sich alle
   * Varianten einen Atlas teilen und der die Höhe der ersten Variante trägt.
   */
  readonly variants: readonly MeshVariant[];
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
 * Zufallsstrom für die Formvarianten.
 *
 * Derselbe mulberry32 wie im Terrain-Baker und in der Streuung, und aus
 * demselben Grund: `Math.random()` ist nicht Teil der Sprachspezifikation, und
 * ein Wald, der nach einem Browser-Update anders aussieht, wäre ein Fehler, den
 * man nie fände. Die Variante `v` einer Art bekommt einen festen Startwert —
 * Variante 2 der Kiefer ist auf jeder Maschine dieselbe Kiefer.
 */
function variantRandom(species: string, variant: number): () => number {
  let h = 0x9e3779b1 ^ variant;
  for (let i = 0; i < species.length; i++) {
    h = Math.imul(h ^ species.charCodeAt(i), 0x01000193) >>> 0;
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gleichverteilt zwischen `lo` und `hi`. */
const between = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng();

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
 * Nadelbaum: Stamm plus gestapelte Kegel.
 *
 * Mindestens drei Etagen — mit zweien liest sich die Silhouette aus der
 * Entfernung als Dreieck, und ein Dreieck ist im Zweifel ein Felsen. Der
 * gestufte Rand ist das, was den Baum als Baum erkennbar macht, und genau
 * darauf kommt es beim Übergang zum Imposter an.
 *
 * **Was zwischen zwei Varianten wechselt**, in der Reihenfolge, in der man es
 * aus 50 m sieht: Zahl der Etagen, Schlankheit, Höhe des Stamms unter der
 * untersten Etage, und ein leichter seitlicher Versatz je Etage. Der Versatz
 * ist der wirksamste und billigste Hebel — er nimmt der Silhouette die
 * Achsensymmetrie, und genau die verrät ein wiederholtes Modell.
 */
function pine(rng: () => number, segments: number, maxTiers: number): BufferGeometry {
  const tiers = Math.max(2, Math.min(maxTiers, Math.round(between(rng, maxTiers - 1, maxTiers))));
  const slender = between(rng, 0.78, 1.22);
  const trunk = between(rng, 1.15, 1.9);
  const sway = between(rng, 0.0, 0.16);
  const height = trunk + 3.6;

  const parts: BufferGeometry[] = [
    place(new CylinderGeometry(0.1, 0.17, trunk, segments, 1, true), 0, trunk / 2, 0),
  ];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < tiers; i++) {
    const t = tiers > 1 ? i / (tiers - 1) : 0;
    const radius = (1.45 - t * 0.75) * slender;
    const tall = 2.1 - t * 0.5;
    const base = trunk * 0.66 + i * (3.6 / tiers);
    const lean = sway * (i + 1);
    parts.push(
      place(
        new ConeGeometry(radius, tall, segments, 1, false),
        Math.cos(phase) * lean,
        base + tall / 2,
        Math.sin(phase) * lean,
      ),
    );
  }
  return finish(parts, height);
}

/**
 * Laubbaum: Stamm plus versetzte Kronenblasen.
 *
 * Eine einzelne Kugel wirkt wie ein Lutscher. Mehrere gegeneinander versetzte
 * Ikosaeder ergeben einen unregelmäßigen Umriss, und weil sie sich überlappen,
 * fällt die geringe Facettenzahl nicht auf.
 *
 * Zwischen den Varianten wechseln Zahl, Größe und Lage der Blasen sowie die
 * Stammhöhe. Bei drei Blasen liegt der Schwerpunkt der Krone woanders als bei
 * vier, und das ist aus der Ferne der sichtbare Unterschied.
 */
function broadleaf(rng: () => number, detail: number): BufferGeometry {
  const trunk = between(rng, 1.9, 3.0);
  const crown = between(rng, 1.25, 1.75);
  const blobs = 2 + Math.round(between(rng, 0, 2));
  const height = trunk + crown * 1.6;

  const parts: BufferGeometry[] = [
    place(
      new CylinderGeometry(0.16, 0.26, trunk, detail > 0 ? 7 : 4, 1, true),
      0,
      trunk / 2,
      0,
    ),
    place(new IcosahedronGeometry(crown, detail), 0, trunk + crown * 0.55, 0),
  ];
  for (let i = 0; i < blobs; i++) {
    const angle = rng() * Math.PI * 2;
    const away = between(rng, 0.5, 0.95) * crown;
    parts.push(
      place(
        new IcosahedronGeometry(crown * between(rng, 0.5, 0.78), detail),
        Math.cos(angle) * away,
        trunk + crown * between(rng, 0.15, 0.8),
        Math.sin(angle) * away,
      ),
    );
  }
  return finish(parts, height, trunk * 0.6);
}

function bush(rng: () => number, detail: number): BufferGeometry {
  const scale = between(rng, 0.8, 1.3);
  const blobs = 2 + Math.round(between(rng, 0, 2));
  const parts: BufferGeometry[] = [
    place(new IcosahedronGeometry(0.62 * scale, detail), 0, 0.5 * scale, 0),
  ];
  for (let i = 0; i < blobs; i++) {
    const angle = rng() * Math.PI * 2;
    const away = between(rng, 0.3, 0.62) * scale;
    parts.push(
      place(
        new IcosahedronGeometry(between(rng, 0.3, 0.5) * scale, detail),
        Math.cos(angle) * away,
        between(rng, 0.24, 0.45) * scale,
        Math.sin(angle) * away,
      ),
    );
  }
  return finish(parts, 1.1 * scale);
}

/**
 * Grasbüschel: sich kreuzende, nach oben spitz zulaufende Halme.
 *
 * Keine Alpha-Textur, sondern Geometrie. Alpha-Test kostet auf jeder Hardware
 * den frühen Tiefentest, und bei 50 000 Instanzen ist das der teuerste
 * denkbare Weg, ein paar Dreiecke zu sparen. Die Halme sind zweiseitig
 * gerendert — dafür gibt es beim Gras keinen sinnvollen Rückseitentest.
 */
function grass(rng: () => number, blades: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const spread = between(rng, 0.1, 0.28);
  let tallest = 0;
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2 + between(rng, 0, 1.1);
    const height = between(rng, 0.34, 0.7);
    if (height > tallest) tallest = height;
    const blade = new PlaneGeometry(between(rng, 0.08, 0.14), height, 1, 1);
    // Oben auf einen Punkt zusammenziehen: aus dem Rechteck wird ein Halm.
    const position = blade.getAttribute('position');
    for (let v = 0; v < position.count; v++) {
      if (position.getY(v) > 0) position.setX(v, position.getX(v) * 0.15);
    }
    blade.translate(0, height / 2, 0);
    blade.rotateZ((i % 2 ? 1 : -1) * spread);
    blade.rotateY(angle);
    blade.translate(Math.cos(angle) * 0.05, 0, Math.sin(angle) * 0.05);
    parts.push(blade);
  }
  return finish(parts, tallest);
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

/**
 * Geometrie auf eine Zielhöhe bringen, Fuß bleibt auf y = 0.
 *
 * Gemessen wird an der Hülle, nicht an der Sollhöhe, mit der gebaut wurde: die
 * Blasen des Laubbaums ragen je nach Wurf über sie hinaus, und ein Baum, der
 * seine eigene Höhenangabe um 20 % verfehlt, verschiebt den Imposter-Rahmen.
 */
function normalizeHeight(geometry: BufferGeometry, target: number): BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;
  const height = box.max.y - Math.min(box.min.y, 0);
  if (height <= 0.001) return geometry;
  geometry.scale(target / height, target / height, target / height);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Größter waagerechter Halbmesser — der Imposter-Rahmen muss ihn fassen. */
function horizontalRadius(geometry: BufferGeometry): number {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return 1;
  return Math.max(Math.abs(box.min.x), box.max.x, Math.abs(box.min.z), box.max.z);
}

interface SpeciesRecipe {
  readonly height: number;
  /** `(rng, detail) => Geometrie`, `detail` ist 1 für nah, 0 für reduziert. */
  readonly build: (rng: () => number, detail: number) => BufferGeometry;
}

const RECIPES: Readonly<Record<VegetationSpeciesId, SpeciesRecipe>> = {
  pine: { height: 5.4, build: (rng, d) => pine(rng, d > 0 ? 9 : 5, d > 0 ? 4 : 2) },
  broadleaf: { height: 4.9, build: (rng, d) => broadleaf(rng, d) },
  bush: { height: 1.1, build: (rng, d) => bush(rng, d) },
  grass: { height: 0.66, build: (rng, d) => grass(rng, d > 0 ? 6 : 3) },
};

export function createVegetationMeshes(
  variantsPerSpecies: Readonly<Record<string, number>>,
): Readonly<Record<VegetationSpeciesId, SpeciesMeshes>> {
  const out = {} as Record<VegetationSpeciesId, SpeciesMeshes>;

  for (const id of Object.keys(RECIPES) as VegetationSpeciesId[]) {
    const recipe = RECIPES[id];
    const count = Math.max(1, variantsPerSpecies[id] ?? 1);
    const variants: MeshVariant[] = [];

    for (let v = 0; v < count; v++) {
      // **Ein Strom je Variante, aber zwei Ziehungen daraus.** Grobe und feine
      // Stufe müssen dieselbe Form beschreiben, sonst wechselt der Baum beim
      // LOD-Sprung die Gestalt. Deshalb wird der Strom für jede Stufe neu
      // aufgesetzt statt fortgeführt.
      const full = normalizeHeight(recipe.build(variantRandom(id, v), 1), recipe.height);
      const reduced = normalizeHeight(recipe.build(variantRandom(id, v), 0), recipe.height);
      variants.push({ full, reduced });
    }

    out[id] = {
      variants,
      height: recipe.height,
      // Der Rahmen des Imposters wird aus Variante 0 gebacken, muss aber alle
      // fassen — sonst schneidet er die breiteste Krone an.
      radius: Math.max(...variants.map((variant) => horizontalRadius(variant.full))),
    };
  }

  return out;
}
