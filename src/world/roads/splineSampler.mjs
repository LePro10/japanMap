/**
 * Catmull-Rom-Auswertung mit Bogenlängen-Parametrisierung — PLAN.md P3 / 3.1.
 *
 * **Diese Datei ist bewusst kein TypeScript.** Sie wird von zwei Seiten
 * benutzt, die nichts gemeinsam haben: von `tools/bake-terrain.mjs` und
 * `tools/gen-roads.mjs` unter Node, und vom Renderer im Browser. Beide müssen
 * *exakt* dieselbe Kurve sehen — sonst liegt die eingeschnittene Rinne im
 * Terrain neben dem Straßen-Mesh, und zwar um Beträge, die erst auffallen,
 * wenn man darauf fährt. Zwei Implementierungen derselben Formel sind genau die
 * Art Fehler, die monatelang unentdeckt bleibt.
 *
 * Node 18 führt kein TypeScript aus, also ist reines ESM der kleinste
 * gemeinsame Nenner. Die Typen stehen daneben in `splineSampler.d.mts`.
 */

/**
 * Zentripetale Catmull-Rom-Variante (α = 0,5).
 *
 * Nicht die uniforme: die überschwingt bei ungleichen Punktabständen und
 * erzeugt Schleifen — auf einer Straße wären das Kurven, die sich selbst
 * schneiden. Zentripetal ist garantiert schleifen- und knickfrei, und genau
 * deshalb ist sie der Standard für Streckenführung.
 */
const ALPHA = 0.5;

function knotInterval(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  // Der Mindestwert verhindert eine Division durch null bei doppelten Punkten.
  return Math.max(Math.pow(Math.hypot(dx, dy, dz), ALPHA), 1e-5);
}

/**
 * Ein Punkt auf dem Segment p1→p2, mit p0 und p3 als Nachbarn.
 * `t` läuft von 0 bis 1. Schreibt in `out` und gibt es zurück.
 */
export function catmullRom(p0, p1, p2, p3, t, out) {
  const t01 = knotInterval(p0, p1);
  const t12 = knotInterval(p1, p2);
  const t23 = knotInterval(p2, p3);

  for (let i = 0; i < 3; i++) {
    // Tangenten nach Barry–Goldman, auf das Segment normiert.
    const m1 =
      t12 *
      ((p1[i] - p0[i]) / t01 - (p2[i] - p0[i]) / (t01 + t12) + (p2[i] - p1[i]) / t12);
    const m2 =
      t12 *
      ((p2[i] - p1[i]) / t12 - (p3[i] - p1[i]) / (t12 + t23) + (p3[i] - p2[i]) / t23);

    const a = 2 * (p1[i] - p2[i]) + m1 + m2;
    const b = -3 * (p1[i] - p2[i]) - 2 * m1 - m2;
    out[i] = ((a * t + b) * t + m1) * t + p1[i];
  }

  return out;
}

/** Index-Zugriff mit Umlauf bzw. Klemmung an den Enden. */
function nodeAt(nodes, index, closed) {
  const n = nodes.length;
  if (closed) return nodes[((index % n) + n) % n];
  return nodes[Math.min(Math.max(index, 0), n - 1)];
}

/**
 * Spline in gleichmäßigen Abständen entlang der **Bogenlänge** abtasten.
 *
 * Das ist der Kern von 3.1 und der Grund, warum hier nicht einfach `getPoint()`
 * steht: bei gleichmäßigem Kurvenparameter liegen die Abtastpunkte in Kurven
 * dichter als auf Geraden. Die Folge wäre eine Textur, die sich in jeder Kurve
 * staucht, und eine Streckenlänge, die nicht stimmt — und auf letzterer bauen
 * später Rundenzeiten und Streckenpositionen auf.
 *
 * Verfahren: erst dicht in Parameterschritten abtasten und die Bogenlänge
 * aufsummieren, dann auf dieses dichte Polygon in gleichen Längenschritten
 * zurückgreifen. Die Genauigkeit hängt an `substeps`; 24 pro Segment liegen bei
 * Straßenradien deutlich unter einem Zentimeter Fehler.
 *
 * @returns Dicht abgetastete Mittellinie. `spacing` ist der *angestrebte*
 *   Abstand; der tatsächliche wird so angepasst, dass die Länge glatt aufgeht.
 */
export function sampleSpline(nodes, options = {}) {
  const closed = options.closed === true;
  const spacing = options.spacing ?? 2;
  const substeps = options.substeps ?? 24;

  if (nodes.length < 2) {
    throw new Error(`Spline braucht mindestens 2 Knoten, hat ${nodes.length}.`);
  }

  // Doppelte Knoten sind kein Randfall, sondern ein Datenfehler — und zwar
  // einer, der ohne diese Prüfung *plausibel aussehende* Zahlen liefert: das
  // Knotenintervall geht gegen null, die Tangentenformel dividiert dadurch, und
  // heraus kommt eine Kurve mit Radien im Zentimeterbereich und Steigungen von
  // über 1000 %. Genau das ist beim Bau des Bergpasses passiert. Lieber laut
  // abbrechen als still Unsinn abtasten.
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1].pos;
    const b = nodes[i].pos;
    const gap = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (gap < 0.05) {
      throw new Error(
        `Knoten ${i - 1} und ${i} liegen ${gap.toFixed(4)} m auseinander — ` +
          'zu dicht für eine zentripetale Catmull-Rom-Auswertung.',
      );
    }
  }

  const segments = closed ? nodes.length : nodes.length - 1;
  const dense = [];
  const scratch = [0, 0, 0];
  let total = 0;

  for (let s = 0; s < segments; s++) {
    const p0 = nodeAt(nodes, s - 1, closed).pos;
    const p1 = nodeAt(nodes, s, closed).pos;
    const p2 = nodeAt(nodes, s + 1, closed).pos;
    const p3 = nodeAt(nodes, s + 2, closed).pos;

    const a = nodeAt(nodes, s, closed);
    const b = nodeAt(nodes, s + 1, closed);

    // Das erste Segment liefert seinen Startpunkt mit, alle weiteren nicht —
    // sonst läge an jeder Segmentgrenze ein doppelter Punkt mit Abstand null.
    for (let k = s === 0 ? 0 : 1; k <= substeps; k++) {
      const t = k / substeps;
      catmullRom(p0, p1, p2, p3, t, scratch);

      const point = {
        pos: [scratch[0], scratch[1], scratch[2]],
        width: a.width + (b.width - a.width) * t,
        banking: a.banking + (b.banking - a.banking) * t,
        distance: 0,
      };

      const previous = dense[dense.length - 1];
      if (previous) {
        total += Math.hypot(
          point.pos[0] - previous.pos[0],
          point.pos[1] - previous.pos[1],
          point.pos[2] - previous.pos[2],
        );
      }
      point.distance = total;
      dense.push(point);
    }
  }

  // Schrittweite so anpassen, dass der letzte Punkt genau auf dem Ende landet.
  // Ohne das bliebe am Streckenende ein Reststück, und bei einer geschlossenen
  // Strecke klaffte dort eine Lücke im Mesh.
  const count = Math.max(2, Math.round(total / spacing) + (closed ? 0 : 1));
  const step = closed ? total / count : total / (count - 1);

  const positions = new Float32Array(count * 3);
  const widths = new Float32Array(count);
  const banking = new Float32Array(count);
  const distances = new Float32Array(count);

  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (cursor < dense.length - 2 && dense[cursor + 1].distance < target) cursor++;

    const a = dense[cursor];
    const b = dense[cursor + 1] ?? a;
    const span = b.distance - a.distance;
    const t = span > 1e-6 ? (target - a.distance) / span : 0;

    positions[i * 3] = a.pos[0] + (b.pos[0] - a.pos[0]) * t;
    positions[i * 3 + 1] = a.pos[1] + (b.pos[1] - a.pos[1]) * t;
    positions[i * 3 + 2] = a.pos[2] + (b.pos[2] - a.pos[2]) * t;
    widths[i] = a.width + (b.width - a.width) * t;
    banking[i] = a.banking + (b.banking - a.banking) * t;
    distances[i] = target;
  }

  return { positions, widths, banking, distances, length: total, closed, count };
}

/**
 * Kleinster Krümmungsradius entlang einer abgetasteten Mittellinie, in Metern.
 *
 * Gemessen wird in der **XZ-Ebene**: der Radius, den ein Fahrzeug tatsächlich
 * fährt, hat mit der Steigung nichts zu tun. Der Radius folgt aus dem
 * Umkreisradius dreier aufeinanderfolgender Punkte — R = abc / 4A.
 *
 * Ist das Kriterium aus PLAN.md P3 („fahrbare Radien ≥ 15 m") überhaupt
 * erfüllt, sagt diese Funktion, nicht das Auge.
 */
export function minCurveRadius(sampled, stride = 3) {
  const { positions, count, closed } = sampled;
  let smallest = Infinity;

  const limit = closed ? count : count - 2 * stride;
  for (let i = 0; i < limit; i++) {
    const ia = i;
    const ib = closed ? (i + stride) % count : i + stride;
    const ic = closed ? (i + 2 * stride) % count : i + 2 * stride;

    const ax = positions[ia * 3];
    const az = positions[ia * 3 + 2];
    const bx = positions[ib * 3];
    const bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3];
    const cz = positions[ic * 3 + 2];

    const a = Math.hypot(bx - ax, bz - az);
    const b = Math.hypot(cx - bx, cz - bz);
    const c = Math.hypot(cx - ax, cz - az);
    // Doppelte Dreiecksfläche über das Kreuzprodukt.
    const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));

    if (area2 < 1e-6) continue; // kollinear — unendlicher Radius, also gerade
    const radius = (a * b * c) / (2 * area2);
    if (radius < smallest) smallest = radius;
  }

  return smallest;
}

/** Größte Längsneigung entlang der Mittellinie, als Verhältnis (0,08 = 8 %). */
export function maxGradient(sampled) {
  const { positions, count, closed } = sampled;
  let steepest = 0;

  const limit = closed ? count : count - 1;
  for (let i = 0; i < limit; i++) {
    const j = closed ? (i + 1) % count : i + 1;
    const dy = positions[j * 3 + 1] - positions[i * 3 + 1];
    const horizontal = Math.hypot(
      positions[j * 3] - positions[i * 3],
      positions[j * 3 + 2] - positions[i * 3 + 2],
    );
    if (horizontal < 1e-4) continue;
    steepest = Math.max(steepest, Math.abs(dy) / horizontal);
  }

  return steepest;
}
