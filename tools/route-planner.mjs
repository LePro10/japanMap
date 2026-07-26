/**
 * Trassierung über das Höhenfeld — PLAN.md P3 / 3.1.
 *
 * **Warum das den geometrischen Zickzack ersetzt.** Der erste Entwurf legte
 * Serpentinen als reine Geometrie in den Hang: gleich lange Traversen, feste
 * Kehrenradien, Richtung aus Start und Ziel. Das Verfahren kennt das Gelände
 * nicht, dem es folgen soll. Auf einem erodierten Massiv trifft es abwechselnd
 * Grate und Rinnen, und bei 11 % Höchstneigung kann die Straße dem nicht
 * ausweichen — gemessen wurden −59,5 m Abtrag am Ring und −310 m an der
 * Böschungskante des Passes. Das ist kein Parameterfehler, sondern die Folge
 * davon, dass die Höhenlinien im Verfahren nicht vorkommen.
 *
 * Hier kommen sie vor. Die Trasse ist der billigste Weg über ein Kostenfeld,
 * und die Kosten sind das, was den Erdbau tatsächlich teuer macht:
 *
 *  1. **Längsneigung** über dem Grenzwert des Straßentyps. Quadratisch bestraft,
 *     nicht verboten — ein Verbot kann eine Suche scheitern lassen, und eine
 *     Straße, die es nicht gibt, ist schlechter als eine mit 12 % Steigung.
 *  2. **Querneigung** des Geländes. Das ist der eigentliche Fund: der Abtrag an
 *     der Böschungskante ist ungefähr `Querneigung × halbe Breite`, und keine
 *     Längsbetrachtung sieht ihn. Genau daher kamen die −310 m — die Trasse lief
 *     mit richtiger Steigung quer an einer Felsnadel vorbei.
 *  3. **Wasser.** Eine Straße durch die Bucht ist billig und falsch.
 *
 * Danach ist die Trasse eine Treppe aus Gitterschritten. Sie wird in
 * `filletPath()` in die klassische Form Gerade–Kreisbogen–Gerade gebracht, weil
 * nur die einen Mindestradius **garantiert** statt ihn anzunähern.
 */

/**
 * Kantenlänge einer Suchzelle in Metern.
 *
 * 20 m ist kein runder Wert, sondern die Breite des Eingriffs: 9 m Fahrbahn
 * plus zweimal 15 m Böschung ergeben knapp 40 m Fußabdruck. Feiner zu suchen
 * täuscht eine Genauigkeit vor, die die Straße gar nicht hat — und macht die
 * Kehren enger, weil der Weg dann in kleineren Schritten wenden kann.
 */
const CELL_SIZE = 20;

/**
 * Nachbarschaft mit 16 Richtungen statt 8.
 *
 * Mit acht Richtungen kann ein Weg nur in 45°-Stufen laufen. Am Hang heißt das:
 * die Traverse liegt entweder zu flach oder zu steil, nie dazwischen — und die
 * Steigungskosten erzwingen dann ein Sägezahnmuster aus 0°- und 45°-Schritten.
 * Die vier Springerzüge bringen 26,57° und 63,43° dazu; die feinste
 * Richtungsänderung sinkt damit von 45° auf 18,43°.
 */
const NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
];

const COST = {
  /**
   * Strafe für Längsneigung über dem Grenzwert, quadratisch im Überschuss.
   *
   * 60 heißt: bei doppelter zulässiger Steigung ist ein Meter Straße 61 Meter
   * wert. Damit weicht die Suche praktisch immer aus, gibt aber nicht auf, wenn
   * es keinen Ausweg gibt.
   */
  gradeExcess: 60,
  /** Milde Bevorzugung flacherer Abschnitte auch unterhalb des Grenzwerts. */
  gradePreference: 0.5,
  /**
   * Strafe für Querneigung, quadratisch.
   *
   * Der Abtrag an der Böschungskante wächst linear mit der Querneigung, die
   * bewegte Erdmasse ungefähr quadratisch. Bestraft wird die Masse.
   */
  crossSlope: 4,
  /** Wasser und Uferstreifen. Hoch genug zum Meiden, endlich genug zum Queren. */
  water: 400,
};

/** Unter dieser Höhe gilt eine Zelle als nass. */
const DRY_HEIGHT = 3;

// ── Suchgitter ──────────────────────────────────────────────────────────────

/**
 * Höhenfeld für die Suche aufbauen: grob abgetastet und geglättet.
 *
 * Die Glättung ist **kein** Kaschieren. Die Bezugsfläche einer Straße ist das
 * über ihren Fußabdruck gemittelte Gelände, nicht der einzelne Texel: eine
 * 40 cm tiefe Erosionsrinne quer zur Fahrbahn verschwindet unter der Böschung,
 * ohne einen Kubikmeter Erdbewegung zu kosten. Ungeglättet würde die Suche vor
 * solchen Rinnen ausweichen und dabei echte Hänge in Kauf nehmen.
 */
export function createRouteGrid(terrain, worldSize, options = {}) {
  const cellSize = options.cellSize ?? CELL_SIZE;
  const res = Math.round(worldSize / cellSize) + 1;
  const half = worldSize / 2;

  const raw = new Float32Array(res * res);
  for (let iz = 0; iz < res; iz++) {
    const z = -half + iz * cellSize;
    for (let ix = 0; ix < res; ix++) {
      raw[iz * res + ix] = terrain.at(-half + ix * cellSize, z);
    }
  }

  // Zwei Durchgänge 3×3-Box ≈ Gauß mit σ ≈ 20 m — die Größenordnung der
  // Böschungsbreite.
  let height = raw;
  for (let pass = 0; pass < (options.smoothPasses ?? 2); pass++) {
    const next = new Float32Array(res * res);
    for (let iz = 0; iz < res; iz++) {
      for (let ix = 0; ix < res; ix++) {
        let sum = 0;
        let n = 0;
        for (let dz = -1; dz <= 1; dz++) {
          const jz = iz + dz;
          if (jz < 0 || jz >= res) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const jx = ix + dx;
            if (jx < 0 || jx >= res) continue;
            sum += height[jz * res + jx];
            n++;
          }
        }
        next[iz * res + ix] = sum / n;
      }
    }
    height = next;
  }

  // Geländegradient (∂h/∂x, ∂h/∂z) über zentrale Differenzen. Wird für die
  // Querneigung gebraucht und einmal vorberechnet, statt in jeder Kante erneut.
  const gradX = new Float32Array(res * res);
  const gradZ = new Float32Array(res * res);
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const i = iz * res + ix;
      const xa = height[iz * res + Math.max(ix - 1, 0)];
      const xb = height[iz * res + Math.min(ix + 1, res - 1)];
      const za = height[Math.max(iz - 1, 0) * res + ix];
      const zb = height[Math.min(iz + 1, res - 1) * res + ix];
      const spanX = (ix === 0 || ix === res - 1 ? 1 : 2) * cellSize;
      const spanZ = (iz === 0 || iz === res - 1 ? 1 : 2) * cellSize;
      gradX[i] = (xb - xa) / spanX;
      gradZ[i] = (zb - za) / spanZ;
    }
  }

  return {
    res,
    cellSize,
    half,
    height,
    gradX,
    gradZ,
    index: (ix, iz) => iz * res + ix,
    toWorld: (ix, iz) => [-half + ix * cellSize, -half + iz * cellSize],
    toCell: (x, z) => [
      Math.min(res - 1, Math.max(0, Math.round((x + half) / cellSize))),
      Math.min(res - 1, Math.max(0, Math.round((z + half) / cellSize))),
    ],
  };
}

// ── Binärer Haufen ──────────────────────────────────────────────────────────
//
// Eine eigene Implementierung statt einer sortierten Liste: die Suche zieht
// hunderttausende Einträge, und `Array.sort` bei jedem Einfügen macht daraus
// quadratischen Aufwand. Typisierte Arrays, damit kein Objekt je Eintrag entsteht.

class Heap {
  #priority = new Float64Array(1024);
  #item = new Int32Array(1024);
  #size = 0;

  get size() {
    return this.#size;
  }

  push(item, priority) {
    if (this.#size === this.#priority.length) {
      const grownP = new Float64Array(this.#size * 2);
      const grownI = new Int32Array(this.#size * 2);
      grownP.set(this.#priority);
      grownI.set(this.#item);
      this.#priority = grownP;
      this.#item = grownI;
    }

    let i = this.#size++;
    this.#priority[i] = priority;
    this.#item[i] = item;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.#priority[parent] <= this.#priority[i]) break;
      this.#swap(i, parent);
      i = parent;
    }
  }

  pop() {
    const top = this.#item[0];
    this.#size--;
    if (this.#size > 0) {
      this.#priority[0] = this.#priority[this.#size];
      this.#item[0] = this.#item[this.#size];
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.#size && this.#priority[left] < this.#priority[smallest]) smallest = left;
        if (right < this.#size && this.#priority[right] < this.#priority[smallest]) smallest = right;
        if (smallest === i) break;
        this.#swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  #swap(a, b) {
    const p = this.#priority[a];
    this.#priority[a] = this.#priority[b];
    this.#priority[b] = p;
    const it = this.#item[a];
    this.#item[a] = this.#item[b];
    this.#item[b] = it;
  }
}

// ── A* ──────────────────────────────────────────────────────────────────────

/**
 * Billigsten Weg von `from` nach `to` suchen, beide in Weltkoordinaten XZ.
 *
 * Die Heuristik ist die Luftlinie. Sie ist zulässig, weil jede Kante mindestens
 * ihre eigene Länge kostet (alle Zuschläge sind ≥ 0) — A* findet damit
 * garantiert das Optimum des Kostenfelds, nicht nur irgendeinen Weg.
 *
 * @returns Polygonzug in Weltkoordinaten `[[x, z], …]`, Start und Ziel exakt.
 */
export function routePath(grid, from, to, options = {}) {
  const maxGrade = options.maxGradient ?? 0.08;
  const { res, cellSize, height, gradX, gradZ } = grid;

  /**
   * Optionaler Korridor um die Luftlinie.
   *
   * Ohne ihn nimmt die Suche den billigsten Weg — und um einen kegelförmigen
   * Gipfel ist das eine **Spirale**, keine Serpentine. Gemessen: 3,77-facher
   * Umweg und null Kehren. Das ist keine falsche Lösung, sondern die Antwort auf
   * eine falsch gestellte Frage; ein Bergpass ist per Definition eine Strecke,
   * die *in einem Tal* Höhe gewinnt und nicht um den halben Berg herumläuft.
   * Der Korridor stellt die Frage richtig, und die Kehren fallen dann von
   * selbst an.
   */
  const corridorWidth = options.corridorWidth ?? 0;
  const corridorWeight = options.corridorWeight ?? 8;
  const axisX = to[0] - from[0];
  const axisZ = to[1] - from[1];
  const axisLength = Math.hypot(axisX, axisZ) || 1;

  const [sx, sz] = grid.toCell(from[0], from[1]);
  const [tx, tz] = grid.toCell(to[0], to[1]);
  const start = grid.index(sx, sz);
  const goal = grid.index(tx, tz);

  const gScore = new Float64Array(res * res).fill(Infinity);
  const cameFrom = new Int32Array(res * res).fill(-1);
  const closed = new Uint8Array(res * res);

  const heuristic = (index) => {
    const ix = index % res;
    const iz = (index / res) | 0;
    return Math.hypot(ix - tx, iz - tz) * cellSize;
  };

  const open = new Heap();
  gScore[start] = 0;
  open.push(start, heuristic(start));

  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;
    expanded++;

    const ix = current % res;
    const iz = (current / res) | 0;
    const h0 = height[current];

    for (const [dx, dz] of NEIGHBOURS) {
      const jx = ix + dx;
      const jz = iz + dz;
      if (jx < 0 || jx >= res || jz < 0 || jz >= res) continue;

      const next = grid.index(jx, jz);
      if (closed[next]) continue;

      const run = Math.hypot(dx, dz) * cellSize;
      const rise = height[next] - h0;
      const grade = Math.abs(rise) / run;

      let factor = 1;

      const excess = grade - maxGrade;
      if (excess > 0) factor += COST.gradeExcess * (excess / maxGrade) ** 2;
      factor += COST.gradePreference * (grade / maxGrade) ** 2;

      // Querneigung: Betrag des Geländegradienten senkrecht zur Fahrtrichtung.
      // In 2D ist das schlicht das Kreuzprodukt mit der normierten Richtung.
      const ux = (dx * cellSize) / run;
      const uz = (dz * cellSize) / run;
      const mid = grid.index((ix + jx) >> 1, (iz + jz) >> 1);
      const cross = Math.abs(gradX[mid] * uz - gradZ[mid] * ux);
      factor += COST.crossSlope * cross * cross;

      if (height[next] < DRY_HEIGHT) factor += COST.water;

      if (corridorWidth > 0) {
        const [wx, wz] = grid.toWorld(jx, jz);
        // Abstand zur Luftlinie: Kreuzprodukt durch Achsenlänge.
        const off =
          Math.abs((wx - from[0]) * axisZ - (wz - from[1]) * axisX) / axisLength;
        factor += corridorWeight * (off / corridorWidth) ** 2;
      }

      const tentative = gScore[current] + run * factor;
      if (tentative >= gScore[next]) continue;

      gScore[next] = tentative;
      cameFrom[next] = current;
      open.push(next, tentative + heuristic(next));
    }
  }

  if (cameFrom[goal] === -1 && goal !== start) {
    throw new Error(
      `Keine Trasse von (${from[0].toFixed(0)}, ${from[1].toFixed(0)}) nach ` +
        `(${to[0].toFixed(0)}, ${to[1].toFixed(0)}) gefunden.`,
    );
  }

  const cells = [];
  for (let at = goal; at !== -1; at = cameFrom[at]) {
    cells.push(at);
    if (at === start) break;
  }
  cells.reverse();

  const path = cells.map((index) => grid.toWorld(index % res, (index / res) | 0));
  // Start und Ziel exakt setzen: die Suche arbeitet auf Zellmitten, aber die
  // Anschlusspunkte des Netzes (Kreuzungen!) sind genaue Weltkoordinaten.
  path[0] = [from[0], from[1]];
  path[path.length - 1] = [to[0], to[1]];

  return { path, expanded, cost: gScore[goal] };
}

// ── Vereinfachung und Verrundung ────────────────────────────────────────────

/**
 * Gleitender Mittelwert über den rohen Suchweg.
 *
 * **Nicht kosmetisch.** Die Suche kann nur in den 16 Richtungen des Gitters
 * laufen. Ist die günstigste Richtung 30°, liegt sie zwischen 26,57° und 45° —
 * und A* nähert sie an, indem es zwischen beiden **abwechselt**. Das erzeugt
 * einen Sägezahn mit rund 10 m Amplitude, der nichts über das Gelände aussagt,
 * aber die Eckenerkennung mit dutzenden Scheinkurven flutet. Gemessen: ohne
 * diese Glättung fand die Verrundung am Ring 186 Bögen und musste sie
 * gegenseitig auf 2,88 m Radius zusammenstauchen.
 *
 * Der Sägezahn ist mittelwertfrei, echte Richtungswechsel sind es nicht —
 * deshalb genügt ein Mittelwertfilter, um das eine zu entfernen und das andere
 * zu behalten.
 */
export function smoothPath(points, window, closed = false) {
  const n = points.length;
  if (n < 3 || window < 1) return points.map((p) => [p[0], p[1]]);

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (!closed && (i < window || i >= n - window)) {
      out[i] = [points[i][0], points[i][1]];
      continue;
    }
    let sx = 0;
    let sz = 0;
    for (let d = -window; d <= window; d++) {
      const p = points[((i + d) % n + n) % n];
      sx += p[0];
      sz += p[1];
    }
    const count = 2 * window + 1;
    out[i] = [sx / count, sz / count];
  }
  return out;
}

/**
 * Stichwege und Schleifen aus einer zusammengesetzten Trasse entfernen.
 *
 * Eine einzelne A*-Suche liefert nie einen Weg, der sich selbst berührt. Eine
 * **zusammengesetzte** schon: das Bein B→C darf denselben Korridor benutzen wie
 * A→B und ihn ein Stück weit rückwärts durchlaufen. Am Ring stand deshalb
 * zweimal exakt derselbe Punkt in der Linie — die Straße fuhr 100 m nach Süden
 * und auf derselben Spur zurück.
 *
 * Das ist keine Ecke, die man verrunden könnte. Eine Umkehr um 180° hat den
 * Radius null, egal wie groß der Bogen gewählt wird, und die Verrundung
 * verschluckte den Verstoß, weil sie ihre Sollradien meldete statt ihr
 * Ergebnis. Der Stichweg muss weg, bevor irgendetwas anderes passiert.
 *
 * Verfahren: kommt der Weg einem früheren Punkt wieder näher als `radius`, wird
 * alles dazwischen entfernt. Das fasst Stichwege und echte Schleifen in einem
 * Schritt.
 */
export function removeSpurs(points, radius, closed, maxSpur = 800) {
  const out = [];
  const travelled = [];
  const radiusSquared = radius * radius;
  let total = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];

    // Rückwärts suchen, ob dieser Punkt einen früheren wieder trifft. Zwei
    // Grenzen dabei:
    //
    //  - Nicht die unmittelbaren Nachbarn, sonst fiele jede normale Kurve dem
    //    Verfahren zum Opfer.
    //  - Nur innerhalb von `maxSpur` Streckenlänge. Ohne diese Grenze erkennt
    //    das Verfahren die **Runde selbst** als Schleife: der Ring kommt nach
    //    10 km an seinem Anfang an, der Abstand ist null, und übrig bleibt ein
    //    einziger Punkt. Genau so ist es passiert.
    let hit = -1;
    for (let k = out.length - 3; k >= 0; k--) {
      if (total - travelled[k] > maxSpur) break;
      const q = out[k];
      const dx = p[0] - q[0];
      const dz = p[1] - q[1];
      if (dx * dx + dz * dz < radiusSquared) {
        hit = k;
        break;
      }
    }

    if (hit >= 0) {
      out.length = hit + 1;
      travelled.length = hit + 1;
      total = travelled[hit];
    }

    const previous = out[out.length - 1];
    if (previous) total += Math.hypot(p[0] - previous[0], p[1] - previous[1]);
    out.push([p[0], p[1]]);
    travelled.push(total);
  }

  // Bei einer Runde schließt sich der Weg — Anfang und Ende dürfen sich nicht
  // gegenseitig als Schleife wegkürzen.
  if (closed) {
    while (
      out.length > 4 &&
      Math.hypot(out[out.length - 1][0] - out[0][0], out[out.length - 1][1] - out[0][1]) < radius
    ) {
      out.pop();
    }
  }

  return out;
}

/** Douglas–Peucker in XZ. Macht aus der Gittertreppe saubere Geraden. */
export function simplify(points, tolerance) {
  if (points.length < 3) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;

    const ax = points[first][0];
    const az = points[first][1];
    const bx = points[last][0];
    const bz = points[last][1];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;

    let worst = -1;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const px = points[i][0];
      const pz = points[i][1];
      let t = lengthSquared > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / lengthSquared : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const distance = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
      if (distance > worst) {
        worst = distance;
        worstIndex = i;
      }
    }

    if (worst > tolerance) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  const result = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]);
  return result;
}

/**
 * Ecken durch Kreisbögen ersetzen — Gerade–Bogen–Gerade, wie im Straßenbau.
 *
 * **Warum nicht glätten.** Der naheliegende Griff wäre Laplace-Glättung: jeden
 * Punkt Richtung Mitte seiner Nachbarn ziehen. Das ist bei Kehren nachweislich
 * falsch. Der Scheitel einer 180°-Kehre wandert dabei auf die Verbindungslinie
 * *zwischen* den beiden Schenkeln zu — die Kehre zieht sich zusammen und wird
 * **enger** statt weiter. Glättung verkleinert den Radius genau dort, wo er
 * knapp ist.
 *
 * Der Kreisbogen dagegen ist konstruktiv: er berührt beide Schenkel, sein
 * Radius steht vorher fest. Die Tangentenlänge folgt aus dem Ablenkwinkel,
 * `T = R · tan(φ/2)`, und bei einer Kehre mit 160° Ablenkung ist das 5,7 · R —
 * der Bogen setzt also weit vor der Ecke an. Genau das macht eine echte
 * Serpentine aus.
 *
 * Passen zwei benachbarte Bögen nicht auf ihren gemeinsamen Schenkel, werden
 * **beide** verkleinert, bis sie passen. Der zurückgegebene `minRadius` sagt,
 * wie klein es dabei geworden ist — daran misst der Generator, ob die Strecke
 * den Grenzwert ihres Typs hält.
 */
/**
 * Ecken durch Kreisbögen ersetzen — Gerade–Bogen–Gerade, wie im Straßenbau.
 *
 * **Warum nicht glätten.** Der naheliegende Griff wäre Laplace-Glättung: jeden
 * Punkt Richtung Mitte seiner Nachbarn ziehen. Das ist bei Kehren nachweislich
 * falsch. Der Scheitel einer 180°-Kehre wandert dabei auf die Verbindungslinie
 * *zwischen* den beiden Schenkeln zu — die Kehre zieht sich zusammen und wird
 * **enger** statt weiter. Glättung verkleinert den Radius genau dort, wo er
 * knapp ist.
 *
 * **Nur der einbeschriebene Bogen.** Hier stand zwischenzeitlich eine zweite
 * Konstruktion — ein Kreis jenseits des Scheitels, der die Strecke *verlängern*
 * statt sie zu kürzen sollte. Die Idee war richtig, die Herleitung nicht: der
 * Kreis berührt zwar beide Schenkel, aber der Bogen, der die Fahrtrichtung um
 * den Ablenkwinkel dreht, endet nicht auf dem Berührpunkt der Ausfahrt. Ein
 * Test mit einer 63°-Ecke zeigte 81,8° Knick und 24 m seitlichen Versatz.
 *
 * Nachgerechnet gilt für **beide** Kreise dieselbe Tangentenlänge
 * `T = R · tan(φ/2)`; die vermeintliche Ersparnis von `R / tan(φ/2)` gab es nie.
 * Der zweite Kreis führt lediglich die lange Runde herum (Sweep `2π − φ`) und
 * ist damit eine Tropfenschleife — sinnvoll für eine Wendeschleife auf engem
 * Raum, nicht für eine Serpentine.
 *
 * Also bleibt der einbeschriebene Bogen. Dass er Strecke kostet, ist keine
 * Eigenart der Implementierung, sondern Geometrie: eine 15-m-Kehre zwischen
 * zwei Schenkeln, die sich unter 10° treffen, muss 171 m vor deren Schnittpunkt
 * ansetzen. Die Länge, die dabei verloren geht, holt die Trassierung vorher
 * wieder herein — sie plant mit einer strengeren Steigung als der Grenzwert,
 * damit nach dem Verrunden noch genug Strecke für den Höhengewinn übrig ist.
 */
export function filletPath(points, options = {}) {
  const target = options.radius ?? 20;
  const closed = options.closed === true;
  const n0 = points.length;
  if (n0 < 3) return { path: points.slice(), minRadius: Infinity, corners: 0 };

  const work = points.map((p) => [p[0], p[1]]);

  const geometryOf = (list) => {
    const n = list.length;
    const first = closed ? 0 : 1;
    const last = closed ? n - 1 : n - 2;
    const deflection = new Float64Array(n);

    for (let i = first; i <= last; i++) {
      const p = list[((i - 1) % n + n) % n];
      const q = list[i];
      const r = list[(i + 1) % n];
      const ax = q[0] - p[0];
      const az = q[1] - p[1];
      const bx = r[0] - q[0];
      const bz = r[1] - q[1];
      const la = Math.hypot(ax, az);
      const lb = Math.hypot(bx, bz);
      if (la < 1e-6 || lb < 1e-6) continue;
      const phi = Math.atan2((ax * bz - az * bx) / (la * lb), (ax * bx + az * bz) / (la * lb));
      // Klemmung bei knapp 180°: dort ginge die innere Tangente gegen unendlich
      // und die äußere Schleifenmitte wäre nicht mehr bestimmt.
      deflection[i] = Math.max(-Math.PI * 0.985, Math.min(Math.PI * 0.985, phi));
    }

    return { n, first, last, deflection };
  };

  const tangentLength = (phi, r) => r * Math.tan(Math.abs(phi) / 2);

  // Bögen wählen, notfalls Ecken entfernen — und **nach jedem Schritt messen**,
  // ob die Radien noch stehen. Örtlicher Eingriff; der frühere Versuch,
  // stattdessen die Vereinfachungstoleranz hochzudrehen, wirkte auf die ganze
  // Strecke und machte aus 13 km trassierter Linie 9 Ecken.
  let geometry = geometryOf(work);
  let radius = new Float64Array(work.length).fill(target);

  /**
   * Untergrenze für den Radius.
   *
   * Standardmäßig die Hälfte des Sollwerts; der Generator setzt stattdessen den
   * **Grenzwert des Straßentyps** ein. Das ist der Unterschied zwischen „der
   * Bogen ist kleiner geworden" und „der Bogen erfüllt die Vorgabe nicht mehr":
   * unterschreitet eine Ecke den Grenzwert, wird sie entfernt statt behalten,
   * und die Zusage der Funktion gilt wieder.
   */
  const floor = options.floor ?? target * 0.5;

  for (let guard = 0; guard < n0 * 3; guard++) {
    geometry = geometryOf(work);
    const { n, first, last, deflection } = geometry;
    if (n < 5) break;
    radius = new Float64Array(n).fill(target);

    const need = (i) =>
      i < first || i > last ? 0 : tangentLength(deflection[i], radius[i]);

    const span = (i) => {
      const j = (i + 1) % n;
      return Math.hypot(work[j][0] - work[i][0], work[j][1] - work[i][1]) * 0.97;
    };
    const edgeLast = closed ? n - 1 : n - 2;

    // 1. Überlappende Nachbarbögen verkleinern.
    for (let pass = 0; pass < 200; pass++) {
      let changed = false;
      for (let i = 0; i <= edgeLast; i++) {
        const j = (i + 1) % n;
        const available = span(i);
        const needed = need(i) + need(j);
        if (available < 1e-9 || needed <= available || needed < 1e-9) continue;
        const scale = available / needed;
        if (i >= first && i <= last) radius[i] *= scale;
        if (j >= first && j <= last) radius[j] *= scale;
        changed = true;
      }
      if (!changed) break;
    }

    // 2. Nachsehen, ob dabei ein Bogen zusammengebrochen ist.
    //
    //    Dieser Schritt fehlte, und sein Fehlen war doppelt teuer: die
    //    Verkleinerung kaskadierte bis auf 0,4 m Radius, und die Meldung
    //    übersprang genau diese Bögen beim Bilden des Minimums — gemeldet wurden
    //    56,3 m, im Polygonzug standen 1,4 m. Ein Bogen unter der Untergrenze
    //    ist keine Kurve mehr; dann ist die Ecke selbst überflüssig.
    let smallestRadius = Infinity;
    let collapsed = -1;
    for (let i = first; i <= last; i++) {
      if (Math.abs(deflection[i]) < 0.02) continue;
      if (radius[i] < smallestRadius) {
        smallestRadius = radius[i];
        collapsed = i;
      }
    }
    if (smallestRadius >= floor || collapsed < 0) break;

    work.splice(collapsed, 1);
  }

  const { n, first, last, deflection } = geometry;
  const out = [];
  const push = (x, z) => {
    const previous = out[out.length - 1];
    if (previous && Math.hypot(previous[0] - x, previous[1] - z) < 0.25) return;
    out.push([x, z]);
  };

  if (!closed) push(work[0][0], work[0][1]);

  let smallest = Infinity;
  let corners = 0;

  for (let i = first; i <= last; i++) {
    const q = work[i];
    const phi = deflection[i];
    const r = radius[i];

    if (Math.abs(phi) < 0.02 || r < 0.5) {
      push(q[0], q[1]);
      continue;
    }

    const p = work[((i - 1) % n + n) % n];
    const inLength = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const inX = (q[0] - p[0]) / inLength;
    const inZ = (q[1] - p[1]) / inLength;

    const side = Math.sign(phi) || 1;
    const reach = tangentLength(phi, r);
    const startX = q[0] - inX * reach;
    const startZ = q[1] - inZ * reach;
    // Links von (inX, inZ) ist (−inZ, inX); bei Rechtskurve kehrt `side` das um.
    const centerX = startX - inZ * r * side;
    const centerZ = startZ + inX * r * side;

    // Der überstrichene Winkel **ist** der Ablenkwinkel — ein Bogen, der
    // tangential anfängt, dreht die Fahrtrichtung um genau diesen Betrag. Über
    // die Endpunkte zurückgerechnet wäre das Vorzeichen bei Kehren nahe 180°
    // nicht mehr eindeutig.
    const angleStart = Math.atan2(startZ - centerZ, startX - centerX);
    const sweep = phi;

    // Schrittweite 7,5° je Stützpunkt.
    //
    // Der Bogen wird als Sehnenzug ausgegeben, und der liegt **innerhalb** des
    // Kreises; die Spline-Kurve durch diese Punkte schneidet noch einmal nach
    // innen. Beides zusammen hängt allein an dieser Schrittweite: bei 30°
    // blieben von 24,3 m Sollradius 18,0 m übrig, bei 15° meldete der Ring
    // 41,8 m statt 72,0 m. Bei 7,5° liegt der Verlust unter 2 %.
    //
    // Ein Nachtasten in `toControlPoints` hilft dagegen nicht: das unterteilt
    // die Sehnen und liegt damit weiter auf dem Sehnenzug, nicht auf dem Kreis.
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
    for (let k = 0; k <= steps; k++) {
      const angle = angleStart + (sweep * k) / steps;
      push(centerX + Math.cos(angle) * r, centerZ + Math.sin(angle) * r);
    }

    if (r < smallest) smallest = r;
    corners++;
  }

  if (!closed) push(work[n - 1][0], work[n - 1][1]);

  // Gemessen wird der **Polygonzug**, nicht die Liste der Sollradien.
  //
  // Der Unterschied ist keine Feinheit. Ein Bogen kann tadellos konstruiert sein
  // und trotzdem nicht tangential anschließen, und eine Ecke, deren Radius unter
  // die Untergrenze fiel, wird gar nicht als Bogen ausgegeben — beide Fälle
  // fehlen in einem Minimum über `radius[]`. Genau daran lag es, dass hier
  // 56,3 m gemeldet wurden, während im Ergebnis 1,4 m standen und das Netz
  // seinen Grenzwert um den Faktor 32 verfehlte.
  return {
    path: out,
    minRadius: Math.min(smallest, measureRadius(out, closed)),
    corners,
  };
}

/**
 * Polygonzug gleichmäßig neu abtasten, in XZ.
 */
export function resample(points, spacing, closed) {
  const n = points.length;
  const segments = closed ? n : n - 1;
  const out = [[points[0][0], points[0][1]]];
  let carried = 0;

  for (let i = 0; i < segments; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-9) continue;

    let position = 0;
    for (;;) {
      const step = Math.max(0, spacing - carried);
      if (position + step > length) break;
      position += step;
      carried = 0;
      const t = position / length;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    carried += length - position;
  }

  // Bei einer Runde darf der letzte Punkt nicht auf dem ersten liegen.
  if (closed) {
    while (
      out.length > 3 &&
      Math.hypot(out[out.length - 1][0] - out[0][0], out[out.length - 1][1] - out[0][1]) <
        spacing * 0.5
    ) {
      out.pop();
    }
  }

  return out;
}

/**
 * Mindestradius durch **Relaxation** herstellen statt durch Kreisbögen.
 *
 * Die Konstruktion Gerade–Bogen–Gerade steht in jedem Straßenbau-Handbuch und
 * ist hier trotzdem falsch. Der Grund ist eine Zahl: ein 15-m-Bogen zwischen
 * zwei Schenkeln, die sich unter 10° treffen, setzt `R · tan(85°)` = 171 m vor
 * deren Schnittpunkt an. Er ersetzt also 342 m Strecke durch 44 m Bogen. Auf
 * einer Passstraße mit sieben Kehren sind das zwei Kilometer — und zwar genau
 * die Länge, über die der Pass seinen Höhengewinn verteilen wollte. Gemessen
 * lief das in eine Rückkopplung: die Suche plante flacher, wurde dadurch länger,
 * bekam mehr Kehren, verlor an jeder wieder Strecke. Nach sieben Anläufen stand
 * eine 30-km-Trasse mit 12,4 % Steigung.
 *
 * Hier wird stattdessen **örtlich verformt**. Wo der Krümmungsradius unter dem
 * Grenzwert liegt, rückt der Punkt ein Stück auf die Sehne seiner Nachbarn zu.
 * Für ein Dreieck mit Basis `c` und Höhe `h` ist der Umkreisradius
 * `R ≈ c²/(8h)` — kleineres `h` heißt also größerer Radius. Die Schärfe
 * verteilt sich über die Nachbarpunkte, und über die Durchläufe wird aus dem
 * Knick ein Bogen. Die Kehre bleibt dabei eine Kehre; sie wird weiter, nicht
 * kürzer.
 *
 * Zwei Grenzen halten das Verfahren ehrlich:
 *
 *  - **Korridor.** Kein Punkt entfernt sich weiter als `corridor` von seiner
 *    Ausgangslage. Ohne das würde die Diffusion die ganze Strecke geradeziehen
 *    und die mühsam trassierte Höhenlinienführung aufgeben.
 *  - **Nur wo nötig.** Punkte, die den Grenzwert bereits halten, bleiben
 *    unangetastet. Eine Glättung, die überall wirkt, ist eine Glättung; eine,
 *    die nur an Verstößen wirkt, ist eine Projektion.
 */
export function relaxCurvature(points, options = {}) {
  const minRadius = options.minRadius ?? 20;
  const closed = options.closed === true;
  const corridor = options.corridor ?? 30;
  const spacing = options.spacing ?? 6;
  const iterations = options.iterations ?? 600;

  const work = resample(points, spacing, closed);
  const n = work.length;
  if (n < 5) return { path: work, minRadius: measureRadius(work, closed), passes: 0 };

  const origin = work.map((p) => [p[0], p[1]]);
  const shiftX = new Float64Array(n);
  const shiftZ = new Float64Array(n);

  const first = closed ? 0 : 1;
  const last = closed ? n - 1 : n - 2;

  let passes = 0;
  for (let iter = 0; iter < iterations; iter++) {
    passes = iter + 1;
    shiftX.fill(0);
    shiftZ.fill(0);
    let violations = 0;

    for (let i = first; i <= last; i++) {
      const a = work[((i - 1) % n + n) % n];
      const b = work[i];
      const cc = work[(i + 1) % n];

      const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const lb = Math.hypot(cc[0] - b[0], cc[1] - b[1]);
      const lc = Math.hypot(cc[0] - a[0], cc[1] - a[1]);
      const area2 = Math.abs((b[0] - a[0]) * (cc[1] - a[1]) - (b[1] - a[1]) * (cc[0] - a[0]));
      if (area2 < 1e-9 || la < 1e-9 || lb < 1e-9) continue;

      const radius = (la * lb * lc) / (2 * area2);
      if (radius >= minRadius) continue;
      violations++;

      // Anteil, um den zu weit gegangen wird — daraus die Schrittweite. Voll
      // auf die Sehne zu springen überschießt und lässt die Linie schwingen.
      const deficit = 1 - radius / minRadius;
      const midX = (a[0] + cc[0]) / 2;
      const midZ = (a[1] + cc[1]) / 2;
      shiftX[i] = (midX - b[0]) * 0.4 * deficit;
      shiftZ[i] = (midZ - b[1]) * 0.4 * deficit;
    }

    if (violations === 0) break;

    for (let i = first; i <= last; i++) {
      let x = work[i][0] + shiftX[i];
      let z = work[i][1] + shiftZ[i];

      const offX = x - origin[i][0];
      const offZ = z - origin[i][1];
      const off = Math.hypot(offX, offZ);
      if (off > corridor) {
        x = origin[i][0] + (offX / off) * corridor;
        z = origin[i][1] + (offZ / off) * corridor;
      }

      work[i][0] = x;
      work[i][1] = z;
    }
  }

  return { path: work, minRadius: measureRadius(work, closed), passes };
}

/** Kleinster Umkreisradius dreier aufeinanderfolgender Punkte, in XZ. */
export function measureRadius(path, closed) {
  const n = path.length;
  let smallest = Infinity;
  const limit = closed ? n : n - 2;
  for (let i = 0; i < limit; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const c = path[(i + 2) % n];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const lc = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (area2 < 1e-9) continue;
    const radius = (la * lb * lc) / (2 * area2);
    if (radius < smallest) smallest = radius;
  }
  return smallest;
}

/**
 * Polygonzug in Kontrollpunkte umsetzen.
 *
 * Nicht gleichmäßig: auf Geraden reichen weite Abstände, in Bögen braucht es
 * enge. Das Verhältnis der beiden ist aber gedeckelt (`spacing.ratio`), und das
 * ist eine Lehre aus dem ersten Bergpass — dort standen Traversenpunkte im
 * Abstand von 136 m neben Bogenpunkten im Abstand von 14 m. Die
 * Barry-Goldman-Tangenten der zentripetalen Variante verkraften ungleiche
 * Abstände, aber nicht zehn zu eins: die über die lange Gerade aufgebaute
 * Höhenänderung schwappte in das kurze Bogensegment und ergab dort 134 %
 * Steigung.
 */
export function toControlPoints(path, options = {}) {
  const fine = options.fine ?? 8;
  const coarse = options.coarse ?? 24;
  const closed = options.closed === true;

  const n = path.length;
  const segments = closed ? n : n - 1;
  if (segments < 1) return path.slice();

  // Je Segment: gehört es zu einem Bogen? Die Bogenpunkte stehen aus
  // `filletPath` in 15°-Schritten und damit dicht; auf Geraden liegen oft
  // hunderte Meter zwischen zwei Punkten.
  const inArc = new Uint8Array(segments);
  for (let i = 0; i < segments; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < coarse) inArc[i] = 1;
  }
  // Zwei Segmente Vorlauf an jedem Bogenrand: der Wechsel der Schrittweite soll
  // nicht genau im Bogenanfang liegen, sonst steht dort die größte
  // Abstandsstufe genau an der Stelle mit der größten Krümmung.
  const dense = inArc.slice();
  for (let i = 0; i < segments; i++) {
    if (!inArc[i]) continue;
    for (let d = -2; d <= 2; d++) dense[((i + d) % segments + segments) % segments] = 1;
  }

  const result = [[path[0][0], path[0][1]]];
  let carried = 0;

  for (let i = 0; i < segments; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-9) continue;
    const want = dense[i] ? fine : coarse;

    // Lange Geraden werden **unterteilt**, nicht nur ausgedünnt. Ohne das
    // stünden zwei Kontrollpunkte 300 m auseinander direkt neben Bogenpunkten
    // im Abstand von 4 m — dasselbe Verhältnis von 75 zu 1, an dem der erste
    // Bergpass mit 134 % Steigung gescheitert ist.
    //
    // `Math.max(0, …)` ist kein Sicherheitsnetz, sondern der Kern: beim
    // Übergang von der weiten Geraden- auf die enge Bogenschrittweite ist der
    // aufgelaufene Rest **größer** als der neue Sollabstand. Ohne die Klemmung
    // wurde die Restlänge negativ und der nächste Kontrollpunkt landete hinter
    // dem vorherigen — eine Falte im Polygonzug. Der Radius fiel dadurch von
    // 18,8 m auf 4,2 m, und zwar *nach* der Verrundung, die ihre 18,8 m korrekt
    // gebaut und gemeldet hatte.
    let position = 0;
    for (;;) {
      const remaining = Math.max(0, want - carried);
      if (position + remaining > length) break;
      position += remaining;
      carried = 0;
      const t = position / length;
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    carried += length - position;
  }

  if (!closed) {
    const end = path[n - 1];
    const tail = result[result.length - 1];
    if (Math.hypot(tail[0] - end[0], tail[1] - end[1]) > 1e-6) result.push([end[0], end[1]]);
  }

  // Zu dichte Punkte entfernen — `sampleSpline` bricht unter 5 cm ab, und schon
  // ab etwa einem Meter wird die Tangentenschätzung unruhig.
  const minimum = Math.min(fine, coarse) * 0.6;
  const cleaned = [result[0]];
  for (let i = 1; i < result.length - (closed ? 0 : 1); i++) {
    const previous = cleaned[cleaned.length - 1];
    if (Math.hypot(result[i][0] - previous[0], result[i][1] - previous[1]) < minimum) continue;
    cleaned.push(result[i]);
  }
  if (!closed) {
    const end = result[result.length - 1];
    const tail = cleaned[cleaned.length - 1];
    if (Math.hypot(tail[0] - end[0], tail[1] - end[1]) < minimum) cleaned.pop();
    cleaned.push(end);
  } else {
    const head = cleaned[0];
    while (
      cleaned.length > 4 &&
      Math.hypot(cleaned[cleaned.length - 1][0] - head[0], cleaned[cleaned.length - 1][1] - head[1]) <
        minimum
    ) {
      cleaned.pop();
    }
  }

  return cleaned;
}

export { CELL_SIZE, DRY_HEIGHT };
