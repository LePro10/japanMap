import { Vector3, type PerspectiveCamera } from 'three';

/**
 * Wegweiser über den Orten der Sakura Commons — „wo gibt es was".
 *
 * Die Commons hatte zwei Schilder über den Türen und sonst nichts. Wer aus
 * dem Hof kam, sah zwei gleich aussehende Hallen und wusste nicht, dass die
 * eine Autos verkauft und die andere sie tunt, und dass es eine dritte Sache
 * (Rennen) überhaupt gibt. Ein schwebendes Etikett über jedem Ort, im Bild
 * verankert, ist das Mittel, mit dem jede Open-World-Basis das löst.
 *
 * DOM, projiziert — kein Text in der Welt: die Schrift bleibt bei jeder
 * Entfernung lesbar, und nah am Ort blendet sie aus, weil dort der
 * Aktions-Hinweis der Commons übernimmt. Zwei Hinweise für dieselbe Tür wären
 * zwei Stimmen, die dasselbe sagen.
 */
export interface Beacon {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly title: string;
  readonly sub: string;
  /** Farbe des Punktes — Amber = Geld, Nitro = Fahren, Sakura = Entdeckung. */
  readonly tone: 'amber' | 'nitro' | 'sakura' | 'paddy';
}

const NEAR_FADE = 5.5;
/** Abstand zum Bildrand in Pixeln. */
const EDGE_PAD = 8;
/**
 * HUD-Flächen, die eine Marke nicht überdecken darf. Die Liste nennt, was im
 * Review 2026-09 tatsächlich überdeckt wurde (Aktionshinweis, Regionskarte,
 * Kontostand, Minikarte, Touch-Knöpfe).
 */
const BLOCKERS = [
  '.commons-prompt:not([hidden])',
  '.city-discovery:not([hidden])',
  '.hud:not([hidden]) .hud__money',
  '.hud:not([hidden]) .hud__nav',
  '.hud:not([hidden]) .hud__prompt',
  '.touch:not([hidden]) button',
];

interface Rect { l: number; t: number; r: number; b: number }
interface Item { beacon: Beacon; el: HTMLElement; dist: HTMLElement; w: number; h: number; d: number }

const clamp = (v: number, lo: number, hi: number): number => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

function overlapsAny(a: Rect, list: readonly Rect[]): boolean {
  for (const b of list) {
    if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) return true;
  }
  return false;
}
const FAR = 95;

export class CommonsBeacons {
  readonly #root = document.createElement('div');
  readonly #items: Item[] = [];
  /** Dieselben Einträge, nach Entfernung sortiert — eine Liste, kein Neuanlegen je Frame. */
  readonly #order: Item[] = [];
  readonly #p = new Vector3();

  constructor(container: HTMLElement, beacons: readonly Beacon[]) {
    this.#root.className = 'commons-beacons';
    this.#root.setAttribute('aria-hidden', 'true');
    for (const beacon of beacons) {
      const el = document.createElement('div');
      el.className = `commons-beacon commons-beacon--${beacon.tone}`;
      el.innerHTML = `<strong>${beacon.title}</strong><span>${beacon.sub}</span><em></em><i></i>`;
      this.#root.append(el);
      const item: Item = { beacon, el, dist: el.querySelector('em')!, w: 0, h: 0, d: 0 };
      this.#items.push(item);
      this.#order.push(item);
    }
    container.append(this.#root);
  }

  /**
   * Einmal je Frame. `visible = false` blendet alle aus, ohne das DOM zu
   * berühren — außer dem einen Schalter.
   */
  update(
    camera: PerspectiveCamera,
    width: number,
    height: number,
    px: number,
    pz: number,
    visible: boolean,
  ): void {
    this.#root.classList.toggle('is-on', visible);
    if (!visible || width === 0) return;
    camera.updateMatrixWorld();
    // **Erst lesen, dann schreiben.** Maße und Hindernisse in einem Durchgang
    // abfragen — dazwischen geschriebene Transformationen lösen kein Layout aus,
    // ein Lesen nach `textContent` dagegen schon, und das je Etikett.
    const origin = this.#root.getBoundingClientRect();
    const blockers: Rect[] = [];
    for (const selector of BLOCKERS) {
      for (const node of this.#root.ownerDocument.querySelectorAll<HTMLElement>(selector)) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        blockers.push({ l: r.left - origin.left, t: r.top - origin.top, r: r.right - origin.left, b: r.bottom - origin.top });
      }
    }
    for (const item of this.#items) {
      item.w = item.el.offsetWidth;
      item.h = item.el.offsetHeight;
      item.d = Math.hypot(item.beacon.x - px, item.beacon.z - pz);
    }
    // Die nähere Marke gewinnt einen Platz — sie ist die, auf die man zufährt.
    this.#order.sort((a, b) => a.d - b.d);
    const placed: Rect[] = [];
    for (const item of this.#order) {
      const { beacon, el, dist, d } = item;
      this.#p.set(beacon.x, beacon.y, beacon.z).project(camera);
      // Hinter der Kamera spiegelt `project` x/y — dort gibt es nichts zu zeigen.
      const ahead = this.#p.z < 1;
      // Seitlich außerhalb des Bildes: an den Rand geklebt, mit Pfeil. Beim
      // Spawnen liegt Petal Motors gemessen 48° links, außerhalb des
      // Sichtfelds — ohne Randmarke wüsste der Spieler nicht, dass es sie gibt.
      const edge = ahead && Math.abs(this.#p.x) > 0.9;
      const fade = d < NEAR_FADE ? 0 : d < NEAR_FADE + 3 ? (d - NEAR_FADE) / 3 : d > FAR ? 0 : 1;
      let alpha = ahead && Math.abs(this.#p.y) < 1.1 ? fade * (edge ? 0.8 : 1) : 0;
      el.classList.toggle('is-edge-left', edge && this.#p.x < 0);
      el.classList.toggle('is-edge-right', edge && this.#p.x > 0);
      if (alpha > 0) {
        // Nähere Etiketten etwas größer — Tiefe ohne 3D-Text.
        const s = Math.max(0.78, Math.min(1.08, 1.12 - d / 140));
        const w = item.w * s;
        const h = item.h * s;
        const nx = edge ? Math.sign(this.#p.x) * 0.84 : this.#p.x;
        // **Im Bild halten.** Am Rand geklebte Marken ragten zur Hälfte hinaus
        // (Petal Motors bei x −13 auf 390 px), und oben liefen sie in den
        // Bildrand, sobald der Ort über dem Horizont lag.
        const x = clamp((nx * 0.5 + 0.5) * width, w / 2 + EDGE_PAD, width - w / 2 - EDGE_PAD);
        const y = clamp((-Math.max(-0.2, this.#p.y) * 0.5 + 0.5) * height, h + EDGE_PAD, height - EDGE_PAD);
        const rect: Rect = { l: x - w / 2, t: y - h, r: x + w / 2, b: y };
        // **Nichts überdecken.** Im Review lag „Event Board" über dem
        // Aktionshinweis, „Open Bay" im Kontostand und auf dem Telefon Marken
        // über Minikarte und ⟲. Eine Marke, die gerade keinen Platz hat, setzt
        // aus — die nächste Kopfdrehung bringt sie zurück.
        if (overlapsAny(rect, placed) || overlapsAny(rect, blockers)) alpha = 0;
        else {
          placed.push(rect);
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
          el.style.zIndex = String(1000 - Math.round(d));
          dist.textContent = `${Math.round(d)} m`;
        }
      }
      el.style.opacity = alpha.toFixed(2);
    }
  }

  dispose(): void {
    this.#root.remove();
  }
}
