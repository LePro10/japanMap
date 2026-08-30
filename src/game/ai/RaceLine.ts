/**
 * Die Ideallinie einer Strecke, mit Krümmung und Zieltempo — P23.
 *
 * ## Warum das nicht `RoadNetwork.getRacingLine()` ist
 *
 * Das gibt es seit P3 und liefert die **Mittellinie**, mit dem ausdrücklichen
 * Kommentar „eine echte Linienoptimierung gehört zum Fahrmodell und nicht zur
 * Streckengeometrie". Genau hier ist das Fahrmodell.
 *
 * Was hier dazukommt, ist die eine Größe, ohne die ein KI-Fahrer nicht fahren
 * kann: **wie schnell darf ich hier sein.** Sie folgt aus der Krümmung und der
 * Querbeschleunigung, die das Fahrzeug verträgt — und aus einem Rückwärtslauf,
 * der dafür sorgt, dass **vor** einer Kurve gebremst wird und nicht in ihr.
 *
 * ```
 *   v_kurve(i) = √(a_lat / κ(i))                    Fliehkraftgrenze
 *   v(i)       = min(v(i), √(v(i+1)² + 2·a_brems·ds))   rückwärts, einmal
 *   v(i)       = min(v(i), √(v(i−1)² + 2·a_zug·ds))     vorwärts, einmal
 * ```
 *
 * Das ist dasselbe Verfahren, mit dem ein Rundenzeitrechner arbeitet, auf zwei
 * Durchläufe eingedampft. Es kostet einmalig 3048 Schritte für die Ringstraße
 * und ist danach eine Tabelle.
 *
 * > **Warum nicht der Fahrer selbst vorausschauen lässt.** Ein KI-Fahrer, der je
 * > Schritt zwanzig Punkte voraus abtastet, rechnet dieselbe Tabelle 60-mal je
 * > Sekunde neu — für jeden Gegner. Bei drei Gegnern und 3048 Stützstellen ist
 * > das der Unterschied zwischen „kostet nichts" und „kostet einen Frame".
 *
 * ## Die Krümmung kommt aus drei Punkten, nicht aus einer Ableitung
 *
 * `κ = 4A / (abc)` — der Kehrwert des Umkreisradius eines Dreiecks, gebildet aus
 * den Stützstellen `i−n`, `i`, `i+n`. Eine numerische zweite Ableitung wäre auf
 * einer Linie mit 2 m Stützstellenabstand und Baker-Rauschen unbrauchbar; der
 * Umkreis ist gegen Rauschen unempfindlich, weil er über eine **Fläche** geht.
 *
 * `n = 3` (also 6 m Basislänge) ist gemessen: mit `n = 1` schwankt die Krümmung
 * der Ringstraße zwischen 0,001 und 0,08 1/m auf geraden Stücken, mit `n = 3`
 * bleibt sie unter 0,004.
 */

/** Abstand der Stützstellen für die Krümmungsdreiecke, in Punkten. */
const CURVATURE_SPAN = 3;

export interface RaceLineOptions {
  /** Querbeschleunigung, mit der die Linie gerechnet wird, m/s². */
  readonly latAccel: number;
  /** Verzögerung für den Rückwärtslauf, m/s². */
  readonly brakeAccel: number;
  /** Beschleunigung für den Vorwärtslauf, m/s². */
  readonly driveAccel: number;
  /** Deckel auf das Zieltempo, m/s. */
  readonly maxSpeed: number;
  /**
   * Wie viel von `g` eine Kuppe verbrauchen darf, 0…1.
   *
   * 0,55 heißt: über einer Kuppe bleiben 45 % der Radlast stehen. Bei 1,0 wäre
   * der Wagen genau im freien Fall — rechnerisch noch am Boden und praktisch
   * ohne Lenkung, Antrieb und Bremse.
   */
  readonly crestAccel: number;
  /** Läuft die Strecke im Kreis? */
  readonly closed: boolean;
}

export class RaceLine {
  /** Stützstellen als x, y, z. */
  readonly points: Float32Array;
  /** Bogenlänge je Stützstelle, m. */
  readonly arc: Float64Array;
  /** Tangente in XZ, normiert. */
  readonly tangent: Float32Array;
  /** Zieltempo je Stützstelle, m/s. */
  readonly speed: Float32Array;
  /** Krümmung je Stützstelle, 1/m. */
  readonly curvature: Float32Array;
  /**
   * **Senkrechte** Krümmung je Stützstelle, 1/m — negativ auf einer Kuppe.
   *
   * Sie beantwortet die Frage, an der der erste KI-Fahrer dieses Projekts
   * gescheitert ist: *ab welchem Tempo hebt hier ein Auto ab?* Die Antwort ist
   * ein Zweizeiler aus der Mechanik — auf einer konvexen Kuppe braucht die Bahn
   * eine Zentripetalbeschleunigung nach **unten**, und die kann höchstens `g`
   * sein:
   *
   * ```
   *   v² · |κ_v| ≤ g      ⇒     v_max = √(g / |κ_v|)
   * ```
   *
   * > **Ohne sie fuhr der Gegner der Ringstraße bei 108 km/h über eine Kuppe,
   * > flog, landete 13 m neben der Fahrbahn und kam nie zurück** — gemessen
   * > 92 % der Zeit im Gelände. Die waagerechte Krümmung sagte an der Stelle
   * > nichts: die Straße ist dort gerade. Ein Tempolimit, das nur Kurven kennt,
   * > kennt die halbe Strecke nicht.
   */
  readonly verticalCurvature: Float32Array;
  readonly closed: boolean;
  readonly length: number;
  /**
   * Die Querbeschleunigung, mit der diese Linie gerechnet wurde, m/s².
   *
   * Sie steht hier, weil der KI-Fahrer sie für seine **Vorsteuerung** braucht:
   * die Lenkung, die eine Kurve verlangt, ist `v²·κ / a_lat` — und das ist
   * genau dann 1, wenn die Linie an ihrer eigenen Grenze gefahren wird. Ein
   * zweiter Wert dafür im Fahrer wäre eine Zahl, die auseinanderläuft, sobald
   * jemand die Linie anders baut.
   */
  readonly latAccel: number;
  /**
   * Krümmung **mit Vorzeichen**, 1/m — positiv heißt Linkskurve.
   *
   * „Links" ist in diesem Projekt wachsender Gierwinkel
   * (`forward = (sin ψ, cos ψ)` dreht bei wachsendem ψ von +Z nach +X). Das
   * Vorzeichen kommt aus dem Kreuzprodukt der beiden Segmentrichtungen und
   * nicht aus einer Anschauung — dieselbe Regel, die in P14 drei
   * Vorzeichenfehler gekostet hat: *eine Achse ist kein Name, sondern ein
   * Kreuzprodukt.*
   */
  readonly signedCurvature: Float32Array;

  constructor(points: Float32Array, options: RaceLineOptions) {
    this.points = points;
    this.closed = options.closed;
    const n = points.length / 3;
    this.arc = new Float64Array(n);
    this.tangent = new Float32Array(n * 2);
    this.curvature = new Float32Array(n);
    this.verticalCurvature = new Float32Array(n);
    this.signedCurvature = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.latAccel = options.latAccel;

    for (let i = 1; i < n; i++) {
      const dx = points[i * 3]! - points[(i - 1) * 3]!;
      const dz = points[i * 3 + 2]! - points[(i - 1) * 3 + 2]!;
      this.arc[i] = this.arc[i - 1]! + Math.hypot(dx, dz);
    }
    this.length = this.arc[n - 1]!;

    for (let i = 0; i < n; i++) {
      const a = this.#wrap(i - 1, n);
      const b = this.#wrap(i + 1, n);
      const dx = points[b * 3]! - points[a * 3]!;
      const dz = points[b * 3 + 2]! - points[a * 3 + 2]!;
      const len = Math.hypot(dx, dz) || 1;
      this.tangent[i * 2] = dx / len;
      this.tangent[i * 2 + 1] = dz / len;
      this.curvature[i] = this.#curvatureAt(i, n);
      this.verticalCurvature[i] = this.#verticalCurvatureAt(i, n);
      this.signedCurvature[i] = this.curvature[i]! * this.#turnSign(i, n);
    }

    this.#buildSpeed(options);
  }

  #wrap(i: number, n: number): number {
    if (this.closed) return ((i % n) + n) % n;
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  }

  /** Kehrwert des Umkreisradius über drei Stützstellen. Begründung im Kopf. */
  #curvatureAt(i: number, n: number): number {
    const p = this.points;
    const a = this.#wrap(i - CURVATURE_SPAN, n);
    const c = this.#wrap(i + CURVATURE_SPAN, n);
    const ax = p[a * 3]!;
    const az = p[a * 3 + 2]!;
    const bx = p[i * 3]!;
    const bz = p[i * 3 + 2]!;
    const cx = p[c * 3]!;
    const cz = p[c * 3 + 2]!;
    const ab = Math.hypot(bx - ax, bz - az);
    const bc = Math.hypot(cx - bx, cz - bz);
    const ca = Math.hypot(ax - cx, az - cz);
    if (ab < 1e-3 || bc < 1e-3 || ca < 1e-3) return 0;
    // Doppelte Dreiecksfläche über das Kreuzprodukt.
    const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
    return (2 * area2) / (ab * bc * ca);
  }

  /**
   * Zweite Ableitung der Höhe über der Bogenlänge, 1/m.
   *
   * Zentrale Differenz über dieselbe Basislänge wie die waagerechte Krümmung
   * (`CURVATURE_SPAN`) — und aus demselben Grund: das Höhenfeld hat 1,5 m
   * Texelabstand, und eine Ableitung über 2 m Stützstellenabstand misst
   * hauptsächlich dessen Rauschen.
   */
  #verticalCurvatureAt(i: number, n: number): number {
    const p = this.points;
    const a = this.#wrap(i - CURVATURE_SPAN, n);
    const c = this.#wrap(i + CURVATURE_SPAN, n);
    const ay = p[a * 3 + 1]!;
    const by = p[i * 3 + 1]!;
    const cy = p[c * 3 + 1]!;
    const sa = Math.hypot(p[i * 3]! - p[a * 3]!, p[i * 3 + 2]! - p[a * 3 + 2]!);
    const sc = Math.hypot(p[c * 3]! - p[i * 3]!, p[c * 3 + 2]! - p[i * 3 + 2]!);
    if (sa < 1e-3 || sc < 1e-3) return 0;
    // f''(x) ≈ 2·(f(a)/(sa(sa+sc)) − f(b)/(sa·sc) + f(c)/(sc(sa+sc))) — die
    // zentrale Differenz für **ungleiche** Schrittweiten. Die gleichabständige
    // Form wäre hier falsch: die Stützstellen liegen 2 m in XZ auseinander, und
    // auf einer 11-%-Steigung ist die Bogenlänge um 0,6 % länger.
    return (
      2 *
      (ay / (sa * (sa + sc)) - by / (sa * sc) + cy / (sc * (sa + sc)))
    );
  }

  /**
   * Drehsinn an einer Stützstelle: +1 = links, −1 = rechts, 0 = gerade.
   *
   * Aus der z-Komponente des Kreuzprodukts der beiden Segmentrichtungen in XZ.
   * Probe an einem Knick von +Z nach +X (also nach links, wachsendes ψ):
   * `d₁ = (0,1)`, `d₂ = (1,1)` ⇒ `d₁ₓ·d₂_z − d₁_z·d₂ₓ = −1`. Ein **negatives**
   * Kreuzprodukt heißt damit Linkskurve, daher das Minus.
   */
  #turnSign(i: number, n: number): number {
    const p = this.points;
    const a = this.#wrap(i - CURVATURE_SPAN, n);
    const c = this.#wrap(i + CURVATURE_SPAN, n);
    const d1x = p[i * 3]! - p[a * 3]!;
    const d1z = p[i * 3 + 2]! - p[a * 3 + 2]!;
    const d2x = p[c * 3]! - p[i * 3]!;
    const d2z = p[c * 3 + 2]! - p[i * 3 + 2]!;
    const cross = d1x * d2z - d1z * d2x;
    return cross < 0 ? 1 : cross > 0 ? -1 : 0;
  }

  /** Vorzeichenbehaftete Krümmung an einer Bogenlänge, 1/m. */
  signedCurvatureAt(arc: number): number {
    return this.signedCurvature[this.indexAt(arc)]!;
  }

  #buildSpeed(o: RaceLineOptions): void {
    const n = this.speed.length;
    for (let i = 0; i < n; i++) {
      const k = this.curvature[i]!;
      // Bei κ → 0 wäre das Ergebnis unendlich; der Deckel ist ohnehin da.
      const v = k > 1e-5 ? Math.sqrt(o.latAccel / k) : o.maxSpeed;
      // **Und die Kuppe.** `κ_v < 0` heißt konvex; darüber hebt der Wagen ab,
      // sobald `v²·|κ_v| > g`. Herleitung bei `verticalCurvature`. Der Faktor
      // lässt Reserve: genau an der Grenze wird die Radlast null, und ein Auto
      // mit Radlast null lenkt nicht mehr.
      const kv = this.verticalCurvature[i]!;
      const crest =
        kv < -1e-5 ? Math.sqrt((o.crestAccel * 9.81) / -kv) : o.maxSpeed;
      this.speed[i] = Math.min(v, crest, o.maxSpeed);
    }
    // Zwei Durchläufe, und die Reihenfolge ist bedeutsam: erst rückwärts (das
    // Bremsen **vor** die Kurve legen), dann vorwärts (nicht schneller
    // beschleunigen, als das Fahrzeug kann). Andersherum überschriebe der
    // Vorwärtslauf die Bremspunkte.
    const rounds = this.closed ? 2 : 1;
    for (let r = 0; r < rounds; r++) {
      for (let i = n - 2; i >= 0; i--) {
        const ds = this.arc[i + 1]! - this.arc[i]!;
        const limit = Math.sqrt(this.speed[i + 1]! ** 2 + 2 * o.brakeAccel * ds);
        if (this.speed[i]! > limit) this.speed[i] = limit;
      }
      if (this.closed && n > 1) {
        const ds = Math.max(0.5, this.arc[1]! - this.arc[0]!);
        const limit = Math.sqrt(this.speed[0]! ** 2 + 2 * o.brakeAccel * ds);
        if (this.speed[n - 1]! > limit) this.speed[n - 1] = limit;
      }
      for (let i = 1; i < n; i++) {
        const ds = this.arc[i]! - this.arc[i - 1]!;
        const limit = Math.sqrt(this.speed[i - 1]! ** 2 + 2 * o.driveAccel * ds);
        if (this.speed[i]! > limit) this.speed[i] = limit;
      }
    }
  }

  /** Stützstellenindex zu einer Bogenlänge. */
  indexAt(arc: number): number {
    const n = this.arc.length;
    const s = this.closed ? ((arc % this.length) + this.length) % this.length : arc;
    if (s <= 0) return 0;
    if (s >= this.length) return n - 1;
    // Binäre Suche — die Linie ist streng monoton in `arc`.
    let lo = 0;
    let hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.arc[mid]! <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Zieltempo an einer Bogenlänge, m/s. */
  speedAt(arc: number): number {
    return this.speed[this.indexAt(arc)]!;
  }

  /** Punkt an einer Bogenlänge in `out` schreiben (x, y, z). */
  pointAt(arc: number, out: { x: number; y: number; z: number }): void {
    const i = this.indexAt(arc);
    const j = this.closed ? (i + 1) % this.arc.length : Math.min(i + 1, this.arc.length - 1);
    const s0 = this.arc[i]!;
    const ds = (j === 0 ? this.length : this.arc[j]!) - s0;
    const s = this.closed ? ((arc % this.length) + this.length) % this.length : arc;
    const t = ds > 1e-6 ? Math.min(1, Math.max(0, (s - s0) / ds)) : 0;
    const p = this.points;
    out.x = p[i * 3]! + (p[j * 3]! - p[i * 3]!) * t;
    out.y = p[i * 3 + 1]! + (p[j * 3 + 1]! - p[i * 3 + 1]!) * t;
    out.z = p[i * 3 + 2]! + (p[j * 3 + 2]! - p[i * 3 + 2]!) * t;
  }

  /**
   * Der kürzeste vorzeichenbehaftete Weg von `from` nach `to`, in Metern.
   *
   * **Auf einer geschlossenen Strecke ist `to − from` nicht der Weg.** An der
   * Start-Ziel-Linie springt die Bogenlänge von 6096 auf 0, und die Differenz
   * ist dann −6096 statt +0,7. Wer daraus einen Fortschritt bildet, bekommt eine
   * Runde je Schritt.
   *
   * > **Genau das ist passiert.** Der erste Entwurf erkannte einen Rundenwechsel
   * > als „Sprung von über 75 % auf unter 25 % der Streckenlänge". Die Gegner
   * > stehen aber vor dem Start **hinter** der Linie, also bei arc ≈ 6088 — und
   * > die Suche in `nearestArc` greift über die Naht hinweg, weil sie auf einer
   * > geschlossenen Linie wrappt. Der Wert pendelte um die Naht, und jede
   * > Pendelung zählte als Runde: gemessen mit der Rauchprobe stand AOKI nach
   * > 60 Sekunden bei **7474 m** — 448 km/h.
   */
  delta(from: number, to: number): number {
    let d = to - from;
    if (!this.closed) return d;
    const half = this.length / 2;
    while (d > half) d -= this.length;
    while (d < -half) d += this.length;
    return d;
  }

  /**
   * Bogenlänge des nächstgelegenen Punkts, **ausgehend von einer Vermutung**.
   *
   * Der Cursor ist kein Geschwindigkeitstrick, sondern eine Korrektheitsfrage:
   * die Ringstraße kommt sich an der Kreuzung mit dem Bergpass auf 11 m nahe,
   * und eine globale Suche springt dort auf den anderen Ast. Ein Gegner, der das
   * tut, fährt plötzlich die Runde rückwärts. Gesucht wird deshalb nur in einem
   * Fenster um den letzten Stand.
   */
  nearestArc(x: number, z: number, from: number, window = 60): number {
    const n = this.arc.length;
    const start = this.indexAt(from);
    let best = start;
    let bestDist = Infinity;
    for (let d = -window; d <= window; d++) {
      const i = this.#wrap(start + d, n);
      if (!this.closed && (start + d < 0 || start + d >= n)) continue;
      const dx = this.points[i * 3]! - x;
      const dz = this.points[i * 3 + 2]! - z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return this.arc[best]!;
  }
}
