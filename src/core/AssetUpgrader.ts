/**
 * Die volle Stufe im Hintergrund nachladen — P15.4.
 *
 * ## Der Auftrag, und die Reihenfolge darin
 *
 * „Erst wenn die Hardware gut genug ist, wird automatisch hochgeschaltet, und
 * wenn man hochschaltet, wird on the go im Hintergrund der Rest
 * runtergeladen." Die Reihenfolge ist der Punkt: **erst der Beweis, dann die
 * Bytes.** Ein Nachlader, der sofort loslegt, ist kein gestufter Start, sondern
 * ein verzögerter Vollstart — die schwache Maschine zahlte dann dieselben
 * 40 MB, nur später.
 *
 * Der Beweis kommt als `quality:headroom` aus dem Wächter (P15.5): fünf Fenster
 * à 120 Frames unter 14 ms im 90. Perzentil, also zehn Sekunden
 * ununterbrochener Reserve. Das Ereignis kommt je Sitzung höchstens einmal.
 *
 * ## Drei Eigenschaften, jede gegen eine bekannte Falle dieses Projekts
 *
 * 1. **Dekodiert wird neben dem Hauptthread.** `createImageBitmap` auf dem
 *    Antwort-`Blob` gibt die JPEG-Dekodierung an den Browser ab. Ein 1024²-JPEG
 *    im Hauptthread zu dekodieren ist ein Ruckler, und ein Ruckler ist genau
 *    das, was diese Phase verhindern soll.
 *
 * 2. **Eingetauscht wird eine Gruppe je Frame**, nicht alle auf einmal. Der
 *    Aufbau einer Array-Textur kostet `getImageData` über vier Ebenen; drei
 *    davon in einem Frame wären drei Ruckler statt einem.
 *
 * 3. **Erst einhängen, dann freigeben.** Der `ZoneMap`-Fehler aus P4 ist genau
 *    andersherum passiert (`bitmap.close()` vor der Abfrage → Auflösung 0 →
 *    `NaN` → ein Filter, der nie gefiltert hat). Die alte Textur wird deshalb
 *    erst verworfen, wenn das Uniform bereits auf die neue zeigt.
 *
 * ## Was er ausdrücklich **nicht** tut
 *
 * Er stuft nichts zurück. Eine Asset-Stufe ist eine Sperrklinke von Natur aus:
 * heruntergeladene Bytes sind ausgegeben, und die Textur wieder gegen die
 * kleine zu tauschen kostet ein sichtbar schlechteres Bild für null Ersparnis.
 * Wird die Bildrate später knapp, ist das Sache des Wächters — der ändert die
 * **Stufe**, nicht die Dateien.
 */

import type { Texture } from 'three';

import type { AssetTier } from './AssetManifest';
import type { EngineContext, System } from './System';

/** Was eine Gruppe zum Eintauschen braucht. */
interface UpgradeGroup {
  readonly name: string;
  /**
   * Baut die neue Ressource. Läuft neben dem Hauptthread, wo es geht.
   *
   * `textures` sind die **fertigen, aber noch nicht hochgeladenen** Texturen.
   * Der Nachlader schiebt sie einzeln über `renderer.initTexture()` auf die
   * GPU, bevor er `apply()` ruft — siehe „Der Ruckler, der gemessen wurde".
   */
  readonly build: () => Promise<{
    bytes: number;
    textures: readonly Texture[];
    apply: () => void;
  }>;
}

export class AssetUpgrader implements System {
  readonly name = 'AssetUpgrader';

  #context: EngineContext | null = null;
  #groups: UpgradeGroup[] = [];
  #queue: Array<{ name: string; bytes: number; textures: Texture[]; apply: () => void }> = [];
  #running = false;
  #tier: AssetTier = 'mittel';

  readonly #readouts = {
    stufe: 'mittel',
    stand: 'wartet auf Reserve',
  };

  get tier(): AssetTier {
    return this.#tier;
  }

  /**
   * Gruppen melden sich **selbst** an, statt hier aufgezählt zu werden.
   *
   * Sonst stünde in dieser Datei, welche Systeme es gibt — dieselbe Regel wie
   * bei `quality:changed` in `QualitySystem`: „sonst müsste hier stehen, welche
   * Systeme es gibt". `TerrainSystem` und `RoadSystem` wissen, wie ihre
   * Texturen entstehen; dieses System weiß nur, *wann*.
   */
  register(group: UpgradeGroup): void {
    this.#groups.push(group);
  }

  init(context: EngineContext): void {
    this.#context = context;
    this.#registerDebug(context);

    context.bus.on('quality:headroom', ({ p90Ms, level }) => {
      if (this.#running || this.#tier === 'voll') return;
      this.#running = true;
      this.#readouts.stand = `lädt … (${p90Ms.toFixed(1)} ms bei ${level})`;
      console.info(
        `Nachlader: ${p90Ms.toFixed(1)} ms je Frame über zehn Sekunden — ` +
          `die volle Texturstufe wird im Hintergrund geholt.`,
      );
      void this.#fetchAll();
    });
  }

  /**
   * Holen und dekodieren, alles nebenläufig — aber **nicht** eintauschen.
   *
   * Das Eintauschen wartet auf `update()`, also auf einen Frame. Hier zu
   * tauschen hieße, es irgendwo mitten in einem Frame zu tun: `Promise`-
   * Fortsetzungen laufen als Mikrotasks und damit möglicherweise zwischen zwei
   * Zeichenaufrufen. Eine Textur, die im selben Frame ausgetauscht und benutzt
   * wird, ist genau die Sorte Fehler, die man später an einem einzelnen
   * schwarzen Bild sucht.
   */
  async #fetchAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.#groups.map(async (g) => ({ name: g.name, ...(await g.build()) })),
    );

    const fehler: string[] = [];
    for (const [i, r] of results.entries()) {
      if (r.status === 'fulfilled') this.#queue.push({ ...r.value, textures: [...r.value.textures] });
      else fehler.push(`${this.#groups[i]?.name ?? '?'}: ${String(r.reason)}`);
    }

    if (fehler.length > 0) {
      // **Ein Fehlschlag ist eine Konsolenzeile, kein Schweigen.** Sonst bliebe
      // die halbe Auflösung auf der vollen Stufe hängen, und niemand wüsste
      // warum — PLAN.md P15 führt das ausdrücklich als Risiko.
      console.warn(`Nachlader: ${fehler.length} Gruppe(n) nicht geladen —`, fehler.join(' · '));
      this.#readouts.stand = `${fehler.length} Gruppe(n) fehlgeschlagen`;
    }
    if (this.#queue.length === 0) this.#running = false;
  }

  /**
   * Eine Sache je Frame — erst hochladen, dann eintauschen.
   *
   * ## Der Ruckler, der gemessen wurde
   *
   * Die erste Fassung tauschte je Frame eine ganze **Gruppe** und ließ den
   * Upload dem Renderer. Gemessen im laufenden Stand, Rauschband 3,3 ms:
   *
   * | Frame | was | Kosten |
   * |---|---|---|
   * | 777 | Gelände-Detailtexturen | 11,7 ms |
   * | 778 | **Asphalt** | **177,8 ms** |
   *
   * Der Kommentar an der Asphalt-Gruppe behauptete damals, three übersetze
   * dabei nicht neu. Das war eine **Begründung ohne Messung** — genau der
   * Fehler, den CLAUDE.md als eigenen Punkt führt. Zwei Ursachen lagen
   * übereinander: `material.needsUpdate = true` erzwang die Neuübersetzung, und
   * drei 2048²-Texturen wanderten in demselben Frame auf die GPU, in dem sie
   * zum ersten Mal gebraucht wurden.
   *
   * Deshalb hat die Warteschlange jetzt zwei Stufen: `initTexture()` schiebt
   * **eine** Textur je Frame hoch, und erst wenn eine Gruppe vollständig oben
   * ist, wird sie eingehängt. Der Upload passiert damit dann, wenn niemand auf
   * die Textur wartet.
   */
  update(): void {
    const next = this.#queue[0];
    if (!next) return;

    const pending = next.textures.shift();
    if (pending) {
      // Ein Upload je Frame. `initTexture` ist synchron und kostet, was die
      // Textur kostet — deshalb genau einer, nicht „alle der Gruppe".
      this.#context?.renderer.initTexture(pending);
      this.#readouts.stand = `lädt auf die GPU … (${next.name})`;
      return;
    }

    this.#queue.shift();
    next.apply();
    this.#context?.bus.emit('assets:upgraded', { gruppe: next.name, bytes: next.bytes });

    if (this.#queue.length === 0) {
      this.#tier = 'voll';
      this.#running = false;
      this.#readouts.stufe = 'voll';
      this.#readouts.stand = 'vollständig';
      console.info('Nachlader: volle Texturstufe eingetauscht.');
    } else {
      this.#readouts.stand = `tauscht … (${this.#queue.length} offen)`;
    }
  }

  dispose(): void {
    this.#groups = [];
    this.#queue = [];
    this.#context = null;
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Nachlader');
    if (!folder) return;
    folder.addBinding(this.#readouts, 'stufe', { readonly: true, label: 'Asset-Stufe' });
    folder.addBinding(this.#readouts, 'stand', {
      readonly: true,
      label: 'Stand',
      interval: 500,
    });
  }
}

/**
 * Die Bytes einer Antwort, ohne sie zu wiegen.
 *
 * `PerformanceResourceTiming.transferSize` ist die Zahl, die auch P15.1 misst —
 * also dieselbe Größe, in der die Ersparnis dieser Phase angegeben ist. Fehlt
 * der Eintrag (andere Herkunft, zu früh gefragt), kommt 0 zurück statt einer
 * geschätzten Zahl. Eine Anzeige, die rät, ist schlimmer als eine, die schweigt.
 */
export function transferredBytes(url: string): number {
  const absolute = new URL(url, location.href).href;
  const entries = performance.getEntriesByName(absolute, 'resource');
  const last = entries[entries.length - 1] as PerformanceResourceTiming | undefined;
  return last?.transferSize ?? 0;
}

