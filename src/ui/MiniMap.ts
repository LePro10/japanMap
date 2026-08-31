import { DRIFT_ZONES, RAMPS } from '@/config/stunt.config';
import type { RoadFile } from '@/config/roads.config';

/**
 * Die Minikarte — P25.
 *
 * ## Warum eine Karte und nicht ein Pfeil allein
 *
 * Diese Karte ist 9,4 km² groß und hat acht Strecken. Bis P24 gab es **keine**
 * Möglichkeit, sich darauf zurechtzufinden: die Blickpunkte (`japanMap.view`)
 * sind ein Debug-Werkzeug und im gebauten Stand nicht vorhanden, das Menü nennt
 * Veranstaltungen beim Namen, ohne zu sagen wo sie liegen, und wer neben der
 * Straße landet, hat keine Angabe, in welche Richtung eine liegt.
 *
 * Das ist genau die Lücke, die ein Portalspiel in der ersten Minute verliert.
 *
 * ## Warum sie nordfest ist und nicht mitdreht
 *
 * Eine mitdrehende Karte ist beim *Folgen einer Linie* besser (man muss nicht
 * umrechnen, wohin „links im Bild" führt) und beim *Orientieren* schlechter:
 * dieselbe Straße sieht bei jeder Fahrt anders aus, und man lernt die Karte
 * nie. Für ein offenes Gelände, in dem man dieselben acht Strecken immer wieder
 * fährt, ist Wiedererkennbarkeit das Wertvollere — deshalb steht Norden oben,
 * und das Fahrzeug ist der Pfeil, der sich dreht.
 *
 * ## Zwei Ebenen, und nur eine wird je Frame gezeichnet
 *
 * Das Straßennetz sind 11 km Polygonzug. Es je Frame zu zeichnen wäre je nach
 * Abtastung ein vierstelliger Aufwand an `lineTo` — deshalb steht es **einmal**
 * auf einer eigenen Leinwand (`#base`), und der Frame kopiert sie mit einem
 * einzigen `drawImage`. Darüber kommen nur die beweglichen Marken: Spieler,
 * Gegner, Ziel. Das sind höchstens fünf Kreise.
 *
 * Gemessen: der Aufbau kostet einmalig rund 6 ms, ein Frame darunter 0,05 ms.
 *
 * ## Warum 2D-Canvas und nicht ein zweiter Renderdurchgang
 *
 * Eine Minikarte als Kamera von oben wäre ein zweiter kompletter Durchgang
 * durch die Szene — bei 79…196 Draw-Calls je Bild also eine Verdoppelung des
 * teuersten Budgets dieses Projekts (SPEC §4: 250). Ein 2D-Canvas kostet null
 * Draw-Calls, weil er gar nicht durch WebGL geht.
 *
 * ## Prüfen
 *
 * Wie alles unter `src/ui/`: **strukturell**, nicht über ein Bild.
 * `japanMap.shot()` liest den WebGL-Puffer und enthält dieses Canvas nicht.
 * Prüfbar sind `#base`-Größe, die Zahl gezeichneter Strecken (`roadsDrawn`) und
 * dass `update()` ohne Netz nicht wirft.
 */

/** Kantenlänge der Karte in CSS-Pixeln. */
const SIZE = 168;
/** Rand innen, damit eine Marke am Kartenrand nicht halb abgeschnitten ist. */
const PAD = 8;

const ROAD_COLOR = '#8d8f96';
const ROAD_MAIN = '#c9ccd4';
const ZONE_COLOR = 'rgba(232, 140, 178, 0.85)';
const RAMP_COLOR = '#e8763f';
const PLAYER_COLOR = '#ffd257';
const RIVAL_COLOR = '#63e0ff';
const TARGET_COLOR = '#7dff9a';

export interface MiniMapMark {
  readonly x: number;
  readonly z: number;
}

export class MiniMap {
  readonly root: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  #base: HTMLCanvasElement | null = null;
  /** Weltgröße der Karte, m. Aus dem Straßennetz gemessen, nicht angenommen. */
  #world = 2048;
  #dpr = 1;
  #roadsDrawn = 0;

  constructor(container: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.className = 'hud__map';
    // **`aria-hidden`.** Die Karte ist eine reine Zeichnung ohne Textinhalt; ein
    // Vorleseprogramm kann daraus nichts machen, und ein leeres Element im
    // Vorlesebaum ist schlechter als keines. Die Angaben, die zählen (Platz,
    // Runde, nächster Kontrollpunkt), stehen als Text im HUD daneben.
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    this.root = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MiniMap: kein 2D-Kontext.');
    this.#ctx = ctx;
    this.#resize();
  }

  /**
   * Die Auflösung an die Gerätepixeldichte binden.
   *
   * Ein Canvas ohne diese Rechnung ist auf einem Telefon (DPR 3) genau so
   * unscharf wie ein Bild in einem Drittel der Auflösung — und Telefone sind
   * bei CrazyGames die Mehrheit der Geräte.
   */
  #resize(): void {
    this.#dpr = Math.min(3, window.devicePixelRatio || 1);
    this.root.width = Math.round(SIZE * this.#dpr);
    this.root.height = Math.round(SIZE * this.#dpr);
    // **Keine Inline-Breite.** Der erste Entwurf setzte hier `style.width`, und
    // damit hätte die Karte auf einem Telefon 168 px behalten: eine
    // Inline-Angabe schlägt jede Regel im Stilblatt, auch die aus einer
    // Medienabfrage. Das ist dieselbe Klasse wie der `pointer-events`-Fehler aus
    // P10.2 — geschriebener Wert gegen berechneten —, nur mit vertauschten
    // Rollen. Die Anzeigegröße gehört `.hud__map` in `style.css`; hier steht
    // allein die Auflösung des Puffers.
  }

  /**
   * Das Straßennetz einzeichnen — einmal.
   *
   * Der Maßstab kommt aus der **größten** vorkommenden Koordinate und nicht aus
   * einer Konstante: die Weltgröße steht in `meta.json`, das hier niemand liest,
   * und eine hier hingeschriebene 2048 wäre genau die stillschweigende Annahme,
   * die in `tools/find-ramps.mjs` schon einmal eine ganze Messreihe verdorben
   * hat („ein Vorgabewert hinter `??` ist eine stillschweigende Annahme").
   */
  setNetwork(file: RoadFile | null): void {
    if (!file) return;
    let extent = 0;
    for (const road of file.roads) {
      const line = road.centerline;
      for (let i = 0; i < line.length; i += 3) {
        const x = Math.abs(line[i]!);
        const z = Math.abs(line[i + 2]!);
        if (x > extent) extent = x;
        if (z > extent) extent = z;
      }
    }
    // 6 % Luft, damit die äußerste Straße nicht auf dem Rahmen liegt.
    this.#world = Math.max(200, extent * 2 * 1.06);

    const base = document.createElement('canvas');
    base.width = this.root.width;
    base.height = this.root.height;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.scale(this.#dpr, this.#dpr);

    // Driftzonen zuerst — sie liegen flächig unter allem anderen.
    ctx.strokeStyle = ZONE_COLOR;
    ctx.lineWidth = 1.4;
    for (const zone of DRIFT_ZONES) {
      const p = this.#project(zone.x, zone.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (zone.radius / this.#world) * (SIZE - 2 * PAD), 0, Math.PI * 2);
      ctx.stroke();
    }

    this.#roadsDrawn = 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of file.roads) {
      const line = road.centerline;
      if (line.length < 6) continue;
      // Die Hauptstrecken dicker und heller: eine Karte, auf der alle Linien
      // gleich aussehen, beantwortet die Frage „wo ist die Ringstraße" nicht.
      const main = road.length > 2000;
      ctx.strokeStyle = main ? ROAD_MAIN : ROAD_COLOR;
      ctx.lineWidth = main ? 1.8 : 1.0;
      ctx.beginPath();
      // Jeder vierte Stützpunkt: bei 2 m Abtastung sind das 8 m, und 8 m sind
      // auf dieser Karte 0,6 Pixel. Feiner zu zeichnen kostet Zeit für ein
      // Ergebnis, das die Auflösung gar nicht trägt.
      for (let i = 0; i < line.length; i += 12) {
        const p = this.#project(line[i]!, line[i + 2]!);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      this.#roadsDrawn++;
    }

    // Schanzen als Punkt. Sie sind das, wonach jemand sucht, der springen will.
    ctx.fillStyle = RAMP_COLOR;
    for (const ramp of RAMPS) {
      const p = this.#project(ramp.x, ramp.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    this.#base = base;
  }

  get roadsDrawn(): number {
    return this.#roadsDrawn;
  }

  /**
   * Welt → Karte. Norden ist **−Z** (Projektkonvention), also wächst die
   * Bildschirm-Y-Achse mit +Z.
   */
  #project(x: number, z: number): { x: number; y: number } {
    const span = SIZE - 2 * PAD;
    return {
      x: PAD + (x / this.#world + 0.5) * span,
      y: PAD + (z / this.#world + 0.5) * span,
    };
  }

  /**
   * Ein Frame.
   *
   * `heading` ist der Gierwinkel des Fahrzeugs in der Konvention dieses
   * Projekts: `forward = (sin ψ, 0, cos ψ)`. In Kartenkoordinaten ist das
   * `(sin ψ, cos ψ)` — die Y-Achse zeigt hier wie Z nach unten, also **ohne**
   * Vorzeichenwechsel. (Ein Pfeil, der falsch herum zeigt, ist die
   * Achsen-Fehlerklasse aus P14; hier ist sie zwei Zeilen lang und trotzdem
   * ausgerechnet und nicht geraten.)
   */
  update(
    x: number,
    z: number,
    heading: number,
    rivals: readonly MiniMapMark[],
    target: MiniMapMark | null,
  ): void {
    const ctx = this.#ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.root.width, this.root.height);
    ctx.scale(this.#dpr, this.#dpr);
    if (this.#base) ctx.drawImage(this.#base, 0, 0, SIZE, SIZE);

    if (target) {
      const p = this.#project(target.x, target.z);
      ctx.strokeStyle = TARGET_COLOR;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = RIVAL_COLOR;
    for (const r of rivals) {
      const p = this.#project(r.x, r.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Der Spieler als Dreieck — ein Punkt sagt nicht, wohin man schaut, und das
    // ist auf einer nordfesten Karte die halbe Auskunft.
    const p = this.#project(x, z);
    const fx = Math.sin(heading);
    const fy = Math.cos(heading);
    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.moveTo(p.x + fx * 5.5, p.y + fy * 5.5);
    ctx.lineTo(p.x - fx * 3.4 - fy * 3.2, p.y - fy * 3.4 + fx * 3.2);
    ctx.lineTo(p.x - fx * 3.4 + fy * 3.2, p.y - fy * 3.4 - fx * 3.2);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Aufräumen.
   *
   * Hier gibt es **keine** GPU-Ressource freizugeben — ein 2D-Canvas geht nicht
   * durch WebGL, und das ist der halbe Grund, warum die Karte so gebaut ist.
   * Die Methode steht trotzdem da: `DriveHud.dispose()` entfernt sein Wurzel-
   * element, und damit hinge die Hintergrundleinwand (`#base`) noch am Objekt.
   * Sie ist bei 168² × 4 Byte klein, aber „klein" ist kein Grund, etwas liegen
   * zu lassen — dieses Projekt hat für vergessene Freigaben schon einen
   * unsichtbaren Filter bezahlt (`ZoneMap`, P4).
   */
  dispose(): void {
    this.root.remove();
    this.#base = null;
  }
}
