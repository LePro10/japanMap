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
 * Bodenfang: flach folgen, steil als Wand.
 *
 * `clearance` ist der Mindestabstand des Schwerpunkts über dem Höhenfeld
 * (typisch ein halber Radradius). `maxPush` deckelt den Weg je Schritt —
 * dieselbe Rolle wie `VEHICLE_COLLISION.maxPushPerStep`.
 */
export function resolveTerrainFollow(
  s: FollowState,
  height: number,
  nx: number,
  ny: number,
  nz: number,
  clearance: number,
  maxPush: number,
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
    }
    s.vx *= 0.25;
    s.vz *= 0.25;
    if (s.vy < 0) s.vy = 0;
    return { wall: true, snapped: true };
  }

  if (ny < STEEP_NY) {
    const horiz = Math.hypot(nx, nz);
    if (horiz > 1e-5) {
      const wx = nx / horiz;
      const wz = nz / horiz;
      // `pen / sinθ` ≈ `pen / horiz`: wie weit man in XZ raus muss, damit
      // dasselbe Texel nicht mehr über uns liegt. Gedeckelt, sonst schleudert
      // ein 40-m-Clip durch den halben Berg.
      const push = Math.min(maxPush, pen / Math.max(horiz, 0.2));
      s.x += wx * push;
      s.z += wz * push;
      const along = s.vx * wx + s.vz * wz;
      if (along < 0) {
        s.vx -= wx * along;
        s.vz -= wz * along;
      }
    }
    if (s.vy < 0) s.vy = 0;
    return { wall: true, snapped: true };
  }

  s.y = floor;
  if (s.vy < 0) s.vy = 0;
  const vn = s.vx * nx + s.vy * ny + s.vz * nz;
  if (vn < 0) {
    s.vx -= nx * vn;
    s.vy -= ny * vn;
    s.vz -= nz * vn;
  }
  return { wall: false, snapped: true };
}
