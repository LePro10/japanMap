/**
 * Stützebene und Steilhang — die zwei Physikfehler, die kein Reifen löst.
 *
 * ## Rad in der Luft
 *
 * `contactHeight = Mittel der vier Radhöhen` hebt das Auto, sobald **ein**
 * Rad eine Spitze trifft. Die anderen drei liegen dann über dem Boden, und
 * `#placeWheels` darf sie nur bis zum Federanschlag senken — optisch ein Rad
 * in der Luft, obwohl die Schwerkraft den Aufbau auf die drei tragenden
 * Räder ziehen müsste.
 *
 * `reachableSupport` nimmt nur Räder, die die Feder erreichen kann. Ein
 * Mittel der vier (oder der zwei mittleren) hebt immer noch, sobald zwei
 * Räder auf einem Absatz stehen. Gemessen am Fahrzeug, 2026-08-19:
 * 0–100 **4,82 s**, Endtempo **256 km/h**, Versatz **0,00 m** (P17:
 * 4,85 / 256 / 0,00). Eine 1,2-m-Spitze unter einem Rad: Schwerpunkt
 * bleibt bei **0,52 m**. Anfahrt gegen einen 40-m-Absatz: y bleibt
 * **0,13…0,57 m** — vorher 94 m in 4 s.
 *
 * ## Berg-Clip, dann Rakete
 *
 * Der alte Bodenfang war `position.y = terrain + r/2` bei unverändertem
 * `vx, vz`. In einem Steilhang ist das Höhenfeld eine Rampe: wer in den
 * Hang hineinfährt, wird nach oben teleportiert und behält die
 * Horizontalgeschwindigkeit — nächster Schritt dieselbe Geschichte, und das
 * Auto fährt die Berginnenseite hoch.
 *
 * Steiler als `STEEP_NY` gilt der Hang deshalb als **Wand** (Ausschieben in
 * XZ, Geschwindigkeit hinein weg). Flacher bleibt er befahrbar, aber die
 * Geschwindigkeit in die Fläche wird gestrichen, damit aus einem Clip kein
 * Skilift wird.
 */

/** Unter diesem `n_y` ist das Gelände eine Wand, keine Fahrfläche. 0,78 ≙ 38,7°. */
export const STEEP_NY = 0.78;

/**
 * Tiefer als das in einem Schritt: wir sind im Volumen, nicht auf einer Stufe.
 *
 * Der Federweg ist 26 cm, die größte legitime Fahrbahnkorrektur dieser Karte
 * liegt im Zentimeterbereich (nach der Rampenbegrenzung). 1,5 m darüber ist
 * kein Aufschlag, das ist ein Tunnel durch den Berg.
 */
export const DEEP_PENETRATION = 1.5;

export interface FollowState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Stützebene aus den Rädern, die der Aufbau **erreichen** kann.
 *
 * `expected` ist die Bodenhöhe, auf der der Schwerpunkt gerade sitzt
 * (`position.y − cgHeight`). Ein Rad, das weiter als `reach` davon entfernt
 * ist, trägt nicht — sonst hebt eine 40-m-Felswand unter zwei Vorderrädern
 * das Auto, bevor der Schwerpunkt die Kante erreicht. Gemessen: genau das
 * hat aus einer Anfahrt an einen Absatz in 3 s y = 67 m gemacht.
 *
 * Liegt kein Rad in Reichweite, gibt es **keine** Stütze — nicht `expected`.
 * `expected` zurückzugeben hieße, die Feder hält die aktuelle Höhe, und
 * jeder Rest-`vY` ratchetet das Auto nach oben. Gemessen: y = 94 m bei
 * stillstehendem Schwerpunkt vor der Kante.
 */
export const UNSUPPORTED_DROP = 2;

export function reachableSupport(
  a: number,
  b: number,
  c: number,
  d: number,
  expected: number,
  reach: number,
): number {
  let sum = 0;
  let n = 0;
  if (Math.abs(a - expected) <= reach) {
    sum += a;
    n++;
  }
  if (Math.abs(b - expected) <= reach) {
    sum += b;
    n++;
  }
  if (Math.abs(c - expected) <= reach) {
    sum += c;
    n++;
  }
  if (Math.abs(d - expected) <= reach) {
    sum += d;
    n++;
  }
  if (n > 0) return sum / n;
  return expected - UNSUPPORTED_DROP;
}

/**
 * Stützhöhe mit **Achsprüfung** — P19.
 *
 * ## Der Fehler, den `reachableSupport` allein nicht sieht
 *
 * Sie nimmt den Mittelwert aller Räder *in Reichweite* und ist damit gegen das
 * **Anheben** abgesichert (ein Rad auf einer 40-m-Wand trägt nicht). Gegen das
 * **Schweben** ist sie es nicht: liegen zwei Räder *einer* Achse in Reichweite
 * und die andere Achse über einer Kante, trägt der Mittelwert den ganzen Aufbau
 * auf zwei Rädern — waagerecht, in der Luft, unbegrenzt lange.
 *
 * Gemessen am Bergpass bei (−1085, −512), 2026-08-21:
 *
 * | | Boden unter dem Rad |
 * |---|---|
 * | Vorderachse | 113,79 m |
 * | Hinterachse | 116,76 m |
 * | Schwerpunkt stand bei | **117,28 m** |
 *
 * Also 2,97 m Absatz mitten unter dem Auto, und der Wagen stand mit der
 * Vorderhälfte über einem Abgrund — `airborne: false`, Einfederung 0,52,
 * Durchdringung 0, **null Kontakte**. Jede Kennzahl gesund. Der Messstand
 * (`japanMap.driveProbe()`) hat am selben Ort eine Standhöhe von **18,05 m**
 * mitgeschrieben.
 *
 * Ein echtes Auto kippt in dieser Lage nach vorn. Dieses Modell kann nicht
 * kippen (siehe Kopf von `Vehicle.ts`) — also muss die Stützebene selbst
 * nachgeben.
 *
 * ## Die Regel
 *
 * *Zwei Räder **einer** Achse tragen keinen Wagen.* Ist eine ganze Achse
 * außer Reichweite, wird die Stützhöhe auf `Boden der anderen Achse + reach`
 * gedeckelt — der Aufbau sinkt der Kante nach, bis die freie Achse wieder
 * Boden findet.
 *
 * Der Deckel wirkt **nur nach unten** (`Math.min`), und das ist der Grund,
 * warum er den Schutz aus `reachableSupport` nicht aufhebt: liegt die freie
 * Achse *höher* (Böschung, Felswand), ist der Deckel größer als der Mittelwert
 * und ändert nichts. Er greift ausschließlich über einer **Kante**.
 *
 * Ein einzelnes Rad über einem Loch löst ihn nicht aus — dafür muss die
 * **ganze** Achse frei sein. Sonst führe ein Wagen mit einem Rad neben der
 * Fahrbahn in jeden Graben.
 */
export function axleSupport(
  frontLeft: number,
  frontRight: number,
  rearLeft: number,
  rearRight: number,
  expected: number,
  reach: number,
): number {
  const support = reachableSupport(frontLeft, frontRight, rearLeft, rearRight, expected, reach);

  const frontOut =
    Math.abs(frontLeft - expected) > reach && Math.abs(frontRight - expected) > reach;
  const rearOut = Math.abs(rearLeft - expected) > reach && Math.abs(rearRight - expected) > reach;
  // Beide Achsen frei: darum kümmert sich `reachableSupport` schon — es gibt
  // dann gar keine Stütze, und der Wagen fällt.
  if (frontOut === rearOut) return support;

  // Der Boden unter der **freien** Achse ist der Bezug. Ein Absatz von einem
  // halben Meter (Bordstein, Terrassenstufe) ändert damit nichts: dort liegt er
  // ohnehin innerhalb `reach`, und die Achse gilt gar nicht erst als frei.
  const frei = frontOut ? (frontLeft + frontRight) * 0.5 : (rearLeft + rearRight) * 0.5;
  return Math.min(support, frei + reach);
}

/**
 * Trägt überhaupt ein Rad? — P20.
 *
 * Die Frage, die `axleSupport` beantwortet, ohne sie zu stellen: liegt
 * mindestens ein Rad in Federreichweite, oder hängt der Wagen frei? Die zweite
 * Lage ist mehr als „keine Stütze" — sie entscheidet darüber, ob die
 * **Karosserie** den Aufbau tragen darf (`resolveHullTerrain`).
 *
 * Ein Wagen, der nur mit dem Stoßfänger auf einer Kante aufliegt, steht nicht;
 * er kippt. Dieses Modell kann nicht kippen, also darf so ein Kontakt ihn auch
 * nicht halten — sonst steht ein Lastwagen mit dem Heck auf einer 3-m-Kante und
 * schwebt 2,91 m über dem Boden. Genau das hat der Prüfstand gemeldet, bevor es
 * diese Funktion gab.
 */
export function hasReachableWheel(
  a: number,
  b: number,
  c: number,
  d: number,
  expected: number,
  reach: number,
): boolean {
  return (
    Math.abs(a - expected) <= reach ||
    Math.abs(b - expected) <= reach ||
    Math.abs(c - expected) <= reach ||
    Math.abs(d - expected) <= reach
  );
}

/** Höhe für Nick/Wank: unerreichbare Räder zählen als `expected`, nicht als Klippe. */
export function reachableWheel(
  height: number,
  expected: number,
  reach: number,
): number {
  return Math.abs(height - expected) <= reach ? height : expected;
}

/** Mittel der zwei mittleren von vier Radhöhen. Allokationsfrei, deterministisch. */
export function supportHeight(a: number, b: number, c: number, d: number): number {
  let p = a;
  let q = b;
  let r = c;
  let s = d;
  if (p > q) {
    const t = p;
    p = q;
    q = t;
  }
  if (r > s) {
    const t = r;
    r = s;
    s = t;
  }
  if (p > r) {
    const t = p;
    p = r;
    r = t;
  }
  if (q > s) {
    const t = q;
    q = s;
    s = t;
  }
  if (q > r) {
    const t = q;
    q = r;
    r = t;
  }
  return (q + r) * 0.5;
}

export function isSteep(ny: number): boolean {
  return ny < STEEP_NY;
}

/**
 * Wie viel Radlast ein Hang noch trägt, 0…1 — P21.
 *
 * ## Warum es diese Kennlinie gibt
 *
 * `isSteep` ist ein **Schalter**, und er saß mitten im Fahrbereich: bei 38,6°
 * hatte der Wagen volle Radlast, bei 38,8° gar keine. Kein Zwischenschritt,
 * keine Vorwarnung — aus voller Kontrolle wurde in einem Simulationsschritt ein
 * Rutschen ohne Lenkung, Antrieb und Bremse. Für die *Geometrie* ist ein
 * Schalter richtig (eine Fläche ist Boden **oder** Wand, dazwischen gibt es
 * keinen dritten Fall, und beide Zweige sind seit P19 gemessen sicher). Für die
 * **Kraft** ist er falsch: Haftung fällt nicht vom Tisch, sie läuft aus.
 *
 * ## Die Kennlinie
 *
 * Voll bis `STEEP_FULL`, null ab `STEEP_NONE`, dazwischen mit `smoothstep`
 * geblendet — stetig **und** mit stetiger Ableitung, sonst wandert der Sprung
 * nur eine Stufe weiter in die Beschleunigung.
 *
 * Die Grenzen liegen so, dass der alte Schalter mitten im Band steht (34,9° bis
 * 50,2°, Schalter bei 38,7°). Unterhalb 35° ändert sich damit **nichts** — der
 * gesamte befahrbare Teil der Karte, einschließlich des steilsten Wegs
 * (Tempelaufgang, 23,3°), liegt darunter. Oberhalb 50° ändert sich ebenfalls
 * nichts: die 55°-Felswand aus P19 trägt weiter null.
 *
 * Was dazwischen neu ist: ein 45°-Hang trägt jetzt 28 % statt 0 %. Ein Wagen
 * rutscht dort immer noch ab — aber er rutscht *lenkbar* ab, statt zu fallen.
 */
export const STEEP_FULL = 0.82;
export const STEEP_NONE = 0.64;

export function slopeSupport(ny: number): number {
  if (ny >= STEEP_FULL) return 1;
  if (ny <= STEEP_NONE) return 0;
  const t = (ny - STEEP_NONE) / (STEEP_FULL - STEEP_NONE);
  return t * t * (3 - 2 * t);
}

/**
 * Reibung einer Felswand, als Abklingrate der Hangbewegung in 1/s.
 *
 * Ein Wagen, der eine 55°-Wand hinunterrutscht, wird von Blech und Fels
 * gebremst, aber nicht gehalten: `μ ≈ 0,6` gegen `tan 55° = 1,43`. Ausgedrückt
 * als Abklingrate statt als Coulomb-Reibung, weil es auf einer Wand keine
 * Radlast gibt, aus der man eine Reibkraft rechnen könnte — die Feder ist dort
 * ausgefedert (`#airborne`), und eine Normalkraft, die niemand bildet, wäre eine
 * erfundene Zahl. 1,2/s heißt: nach einer Sekunde Rutschen sind 30 % der
 * Hanggeschwindigkeit weg.
 */
export const WALL_SLIDE_DAMPING = 1.2;

/**
 * Wie viel einer **hangaufwärts** gerichteten Bewegung eine Wand stehen lässt.
 *
 * 15 %. Der Rest geht in Blech. Diese Zahl ist der eigentliche Schutz gegen die
 * alte Berg-Rakete: wer mit 20 m/s in eine 72°-Wand fährt, hat danach 5,7 m/s
 * *hangaufwärts* stehen, wenn man nur den Anteil in die Fläche streicht — und
 * fährt die Berginnenseite hoch. Mit 15 % sind es 0,86 m/s, und die Schwerkraft
 * hat sie in einer Zehntelsekunde aufgezehrt.
 */
export const WALL_CLIMB_KEEP = 0.15;

/**
 * Bodenfang: flach folgen, steil als Wand.
 *
 * `clearance` ist der Mindestabstand des Schwerpunkts über dem Höhenfeld
 * (typisch ein halber Radradius). `maxPush` deckelt den Weg je Schritt —
 * dieselbe Rolle wie `VEHICLE_COLLISION.maxPushPerStep`.
 *
 * > **`dt` ist seit P19 dabei, und es ist keine Kosmetik.** Der Wandzweig setzte
 * > bis dahin `vy = 0` in **jedem** Schritt. Gedacht war das gegen den alten
 * > Berg-Clip („aus einem Clip wird kein Skilift"); die Wirkung war eine andere:
 * > die Schwerkraft konnte an einer Wand nie etwas ausrichten, und ein Auto, das
 * > dort einmal hing, hing für immer. Gemessen mit `tools/bench/world.mts` auf
 * > einer 55°-Wand: in 8 Sekunden fiel das Coupé **2,00 m** — und diese zwei
 * > Meter waren nicht einmal ein Fall, sondern exakt `UNSUPPORTED_DROP` aus der
 * > Stützebene. Genau dieses Bild hat P19 ausgelöst: ein Auto, das in einer
 * > Felswand klebt.
 * >
 * > Richtig ist die Zerlegung an der **Flächennormalen in 3D**: weggenommen wird
 * > allein die Bewegung *in* die Wand hinein, die Bewegung *längs* der Wand
 * > bleibt und wird gedämpft. Fällt der Wagen, fällt er; drückt er hinein, wird
 * > er herausgeschoben. Der Schutz gegen den Skilift bleibt vollständig erhalten
 * > — er steckt in genau dieser Zerlegung und nicht in der Klemme auf `vy`.
 */
export function resolveTerrainFollow(
  s: FollowState,
  height: number,
  nx: number,
  ny: number,
  nz: number,
  clearance: number,
  maxPush: number,
  dt: number,
): { wall: boolean; snapped: boolean } {
  const floor = height + clearance;
  const pen = floor - s.y;
  if (pen <= 0) return { wall: false, snapped: false };

  // Im Volumen: nicht auf die Oberfläche teleportieren. Zurück entlang der
  // Anfahrt — die Flächennormale einer Hochebene zeigt nach oben und sagt
  // nicht, durch welche Wand wir gekommen sind.
  if (pen > DEEP_PENETRATION) {
    const horiz = Math.hypot(s.vx, s.vz);
    if (horiz > 0.15) {
      s.x -= (s.vx / horiz) * maxPush;
      s.z -= (s.vz / horiz) * maxPush;
    } else {
      // **Steht der Wagen still, gibt es keine Anfahrt, an der man zurückkann —
      // und bis P19 passierte dann gar nichts.** Zusammen mit dem `vy`-Deckel
      // eine Zeile darunter war das ein Auto, das im Berg **steht**: keine
      // Bewegung, kein Ausweg, kein Bild. Die Flächennormale ist in diesem Fall
      // die einzige Richtung, die es gibt; sie zeigt zwar nur nach oben aus der
      // Hochebene heraus, aber ihr waagerechter Anteil führt zur nächsten Kante.
      const nHoriz = Math.hypot(nx, nz);
      if (nHoriz > 1e-5) {
        s.x += (nx / nHoriz) * maxPush;
        s.z += (nz / nHoriz) * maxPush;
      }
    }
    s.vx *= 0.25;
    s.vz *= 0.25;
    if (s.vy < 0) s.vy = 0;
    return { wall: true, snapped: true };
  }

  if (ny < STEEP_NY) {
    // `ny < 0,78` heißt `horiz > 0,62` — auf einer Wand ist die waagerechte
    // Komponente der Normalen nie klein. Der alte Nullschutz ist deshalb keine
    // Vorsichtsmaßnahme, sondern toter Code; er steht hier trotzdem als Klemme,
    // damit die Division es auch dann bleibt, wenn jemand `STEEP_NY` anhebt.
    const horiz = Math.max(Math.hypot(nx, nz), 1e-4);
    const invH = 1 / horiz;
    // `pen / sinθ` ≈ `pen / horiz`: wie weit man in XZ raus muss, damit dasselbe
    // Texel nicht mehr über uns liegt. Gedeckelt, sonst schleudert ein
    // 40-m-Clip durch den halben Berg.
    const push = Math.min(maxPush, pen / Math.max(horiz, 0.2));
    s.x += nx * invH * push;
    s.z += nz * invH * push;

    blockIntoSurface(s, nx, ny, nz, dt);
    return { wall: true, snapped: true };
  }

  s.y = floor;
  // Auf der Fläche **aufgesetzt**: kein Rest-Fall. Diese Zeile gehört zum
  // Aufsetzen und nicht zum Abweisen — deshalb steht sie hier und nicht in
  // `blockIntoSurface`. Der Unterschied ist in P20 teuer geworden: die
  // Karosserie ruft dieselbe Abweisung, und dort verbot die Klemme auf `vy` dem
  // Wagen das **Absetzen**. Er hing mit der Nase im Hang, die Räder in der Luft,
  // ohne Radlast und damit ohne Antrieb — gemessen 400 von 900 Schritten mit
  // Hüllkontakt und 0,0 km/h bei Vollgas. Dieselbe Fehlerform wie der Wandzweig
  // vor P19: eine Klemme auf einen Zustand trifft **beide** Vorzeichen.
  if (s.vy < 0) s.vy = 0;
  blockIntoSurface(s, nx, ny, nz, dt);
  return { wall: false, snapped: true };
}

/**
 * Die Geschwindigkeit gegen eine Geländefläche abweisen — **die eine Stelle**,
 * an der das im Projekt passiert.
 *
 * Seit P20 rufen sie zwei Aufrufer: der Bodenfang am Schwerpunkt
 * (`resolveTerrainFollow`) und die Karosserie gegen das Gelände
 * (`resolveHullTerrain`). Zwei Abschriften wären zwei Gelegenheiten, den
 * Vorzeichensatz unten auseinanderlaufen zu lassen — und genau diese
 * Fehlerklasse (dieselbe Regel an zwei Stellen, eine davon veraltet) hat dieses
 * Projekt in P14 drei Vorzeichenfehler in einer Kette gekostet.
 *
 * ## Flach: abweisen
 *
 * `v -= n (v·n)` für alles, was in die Fläche zeigt — und **nur** das. Die
 * Klemme `vy = max(vy, 0)` gehört nicht hierher, sondern zum Aufsetzen; sie
 * steht bei ihrem Aufrufer. Begründung dort.
 *
 * ## Steil: in drei Richtungen zerlegen
 *
 * Drei Richtungen, und jede bekommt eine andere Behandlung. Das ist der ganze
 * Unterschied zu vor P19, wo eine einzige Zeile (`if (vy < 0) vy = 0`) alle drei
 * zugleich erschlug — und dabei ausgerechnet die **falsche** erwischte: sie
 * verbot das Fallen und ließ das Klettern zu.
 *
 *  · **hinein** — verschwindet. Ein Fels gibt nicht nach.
 *  · **hangaufwärts** — bleibt zu 15 % übrig. Ein Auto, das mit 70 km/h gegen
 *    eine Wand fährt, klettert sie nicht hinauf; es knautscht. Das ist derselbe
 *    Schutz, den die alte Zeile leisten *sollte* („aus einem Clip wird kein
 *    Skilift"), nur an der Komponente, die ihn braucht.
 *  · **hangabwärts und quer** — bleibt und wird nur gebremst. Ohne diesen Teil
 *    gibt es kein Herunterrutschen, und ein Auto, das oben hängt, hängt für
 *    immer.
 *
 * Die Basis: `t_auf = (ŷ − n·n_y)` zeigt die Falllinie hinauf und hat die Länge
 * `horiz`; `t_quer = n × ŷ` steht senkrecht darauf, ebenfalls mit der Länge
 * `horiz`.
 */
export function blockIntoSurface(
  s: FollowState,
  nx: number,
  ny: number,
  nz: number,
  dt: number,
): void {
  if (ny >= STEEP_NY) {
    const vn = s.vx * nx + s.vy * ny + s.vz * nz;
    if (vn < 0) {
      s.vx -= nx * vn;
      s.vy -= ny * vn;
      s.vz -= nz * vn;
    }
    return;
  }

  const horiz = Math.max(Math.hypot(nx, nz), 1e-4);
  const invH = 1 / horiz;
  const tux = -nx * ny * invH;
  const tuy = (1 - ny * ny) * invH;
  const tuz = -nz * ny * invH;
  const tsx = -nz * invH;
  const tsz = nx * invH;

  let auf = s.vx * tux + s.vy * tuy + s.vz * tuz;
  let quer = s.vx * tsx + s.vz * tsz;
  // Ein Anteil **von** der Wand weg bleibt unangetastet — wer abprallt, prallt
  // ab. Nur der Anteil hinein verschwindet.
  const raus = s.vx * nx + s.vy * ny + s.vz * nz;
  const weg = raus > 0 ? raus : 0;

  if (auf > 0) auf *= WALL_CLIMB_KEEP;
  // Hangreibung auf das, was längs der Wand übrig ist.
  const brake = Math.exp(-WALL_SLIDE_DAMPING * dt);
  auf *= brake;
  quer *= brake;

  s.vx = auf * tux + quer * tsx + nx * weg;
  s.vy = auf * tuy + ny * weg;
  s.vz = auf * tuz + quer * tsz + nz * weg;
}
