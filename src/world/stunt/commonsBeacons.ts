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
const FAR = 95;

export class CommonsBeacons {
  readonly #root = document.createElement('div');
  readonly #items: { beacon: Beacon; el: HTMLElement; dist: HTMLElement }[] = [];
  readonly #p = new Vector3();

  constructor(container: HTMLElement, beacons: readonly Beacon[]) {
    this.#root.className = 'commons-beacons';
    this.#root.setAttribute('aria-hidden', 'true');
    for (const beacon of beacons) {
      const el = document.createElement('div');
      el.className = `commons-beacon commons-beacon--${beacon.tone}`;
      el.innerHTML = `<strong>${beacon.title}</strong><span>${beacon.sub}</span><em></em><i></i>`;
      this.#root.append(el);
      this.#items.push({ beacon, el, dist: el.querySelector('em')! });
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
    for (const { beacon, el, dist } of this.#items) {
      const d = Math.hypot(beacon.x - px, beacon.z - pz);
      this.#p.set(beacon.x, beacon.y, beacon.z).project(camera);
      // Hinter der Kamera spiegelt `project` x/y — dort gibt es nichts zu zeigen.
      const ahead = this.#p.z < 1;
      // Seitlich außerhalb des Bildes: an den Rand geklebt, mit Pfeil. Beim
      // Spawnen liegt Petal Motors gemessen 48° links, außerhalb des
      // Sichtfelds — ohne Randmarke wüsste der Spieler nicht, dass es sie gibt.
      const edge = ahead && Math.abs(this.#p.x) > 0.9;
      const fade = d < NEAR_FADE ? 0 : d < NEAR_FADE + 3 ? (d - NEAR_FADE) / 3 : d > FAR ? 0 : 1;
      const alpha = ahead && Math.abs(this.#p.y) < 1.1 ? fade * (edge ? 0.8 : 1) : 0;
      el.style.opacity = alpha.toFixed(2);
      el.classList.toggle('is-edge-left', edge && this.#p.x < 0);
      el.classList.toggle('is-edge-right', edge && this.#p.x > 0);
      if (alpha <= 0) continue;
      const nx = edge ? Math.sign(this.#p.x) * 0.84 : this.#p.x;
      const x = (nx * 0.5 + 0.5) * width;
      const y = (-Math.max(-0.2, this.#p.y) * 0.5 + 0.5) * height;
      // Nähere Etiketten etwas größer — Tiefe ohne 3D-Text.
      const s = Math.max(0.78, Math.min(1.08, 1.12 - d / 140));
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      el.style.zIndex = String(1000 - Math.round(d));
      dist.textContent = `${Math.round(d)} m`;
    }
  }

  dispose(): void {
    this.#root.remove();
  }
}
