import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  LUT3DEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type LookupTexture,
} from 'postprocessing';
import { AgXToneMapping, HalfFloatType, NoToneMapping, Vector2, type Material } from 'three';

import {
  GRADING,
  POSTFX,
  POSTFX_QUALITY,
  type GradingParams,
  type PostFxSettings,
} from '@/config/postfx.config';
import {
  AO_QUALITY,
  BUDGETS,
  DEFAULT_QUALITY,
  QUALITY,
  type AoSettings,
} from '@/config/quality.config';
import type { Presenter } from '@/core/Engine';
import type { EngineContext, System } from '@/core/System';
import { createGradingLut, toCube, updateGradingLut } from './grading';
import type { LookState } from './looks/lookState';

/**
 * Die Postprocessing-Kette — PLAN.md P2 / 2.1.
 *
 * ```
 * RenderPass                    Szene → HDR-Puffer
 *   → N8AOPostPass              Umgebungsverdeckung aus der Tiefe
 *   → EffectPass(Bloom, AgX, LUT, Vignette)
 *   → EffectPass(SMAA)
 * ```
 *
 * **Warum SMAA einen eigenen Pass bekommt.** PLAN.md verlangt an einer Stelle
 * „alle Nicht-Geometrie-Effekte in einen EffectPass" und an der nächsten „SMAA
 * immer zuletzt, nach dem Tonemapping — Kantenglättung auf HDR-Werten
 * funktioniert nicht". Beides zusammen geht nicht: `SMAAEffect.update()` bekommt
 * den **Eingangspuffer seines EffectPass** zur Kantenerkennung, nicht das
 * Zwischenergebnis der Effekte davor. Im selben Pass wie AgX würde SMAA also
 * genau auf den HDR-Werten arbeiten, die der Plan ausschließt. Die
 * Korrektheitsregel gewinnt; es bleiben zwei Fullscreen-Durchläufe statt fünf.
 */
export class PostFXPipeline implements System {
  readonly name = 'PostFXPipeline';

  #context: EngineContext | null = null;
  #composer: EffectComposer | null = null;
  #ao: N8AOPostPass | null = null;
  #bloom: BloomEffect | null = null;
  #lut: LUT3DEffect | null = null;
  #lutTexture: LookupTexture | null = null;
  #vignette: VignetteEffect | null = null;
  #mainPass: EffectPass | null = null;
  #smaaPass: EffectPass | null = null;
  /**
   * Der Pass für `postFx: 'compact'` — LUT und Vignette **ohne** Bloom und ohne
   * Tonemapping-Effekt, weil dort der Renderer tonemappt (P12.1).
   *
   * **Ein zweiter Pass und nicht ein umgebauter erster.** `EffectPass` backt
   * seine Effekte beim Bauen in *einen* Shader; die Effektliste nachträglich zu
   * ändern hieße, den Pass zu ersetzen — mitten im Bild, mit
   * Shader-Übersetzung. Zwei Pässe, von denen immer genau einer läuft, kosten
   * dagegen ein zusätzliches Programm im Aufwärmframe und danach nichts.
   *
   * Der abgeschaltete Pass wird von `EffectComposer.render()` vollständig
   * übersprungen (`if (!pass.enabled) continue`) — deshalb muss
   * `#updateRenderToScreen()` danach laufen, sonst zeichnet niemand mehr auf
   * den Bildschirm. Das ist der Fehler aus P8.2, und er wartet hier an genau
   * derselben Stelle wieder.
   */
  #compactPass: EffectPass | null = null;
  #compactVignette: VignetteEffect | null = null;

  readonly #grading: GradingParams = { ...GRADING };
  #profiler: CostProfiler | null = null;

  /**
   * Zwei Quellen, ein Schalter — und deshalb ein UND statt eines Zuweisens.
   *
   * Das Look-Preset sagt, ob Umgebungsverdeckung zum Bild gehört; die
   * Qualitätsstufe sagt, ob sie sich die Maschine leisten kann. Würde jede
   * Seite direkt `ao.enabled` setzen, entschiede die Reihenfolge der Ereignisse
   * — also ob der Nutzer erst das Preset oder erst die Stufe angefasst hat.
   * Beides getrennt zu halten und beim Anwenden zu verknüpfen, macht das
   * Ergebnis von der Reihenfolge unabhängig.
   */
  #lookWantsAo: boolean = POSTFX.ao.enabled;
  #aoLevel: AoSettings = AO_QUALITY[QUALITY[DEFAULT_QUALITY].ao];
  /** Dieselbe Trennung wie bei der AO — Wunsch des Presets gegen Stufe. */
  #lookWantsSmaa: boolean = POSTFX.smaa.enabled;
  #postFxLevel: PostFxSettings = POSTFX_QUALITY[QUALITY[DEFAULT_QUALITY].postFx];

  readonly #readouts = {
    kette: '—',
    kosten: 'noch nicht gemessen',
  };

  constructor(private readonly setPresenter: (present: Presenter) => void) {}

  /** Für P6: dort wird ein SSR-Pass zwischen AO und Effektkette eingehängt. */
  get composer(): EffectComposer | null {
    return this.#composer;
  }

  init(context: EngineContext): void {
    this.#context = context;
    const { renderer, scene, camera } = context;

    // Ab hier tonemappt der Effekt, nicht der Renderer. Bliebe hier AgX stehen,
    // liefe das Bild zweimal durch den Operator — ein Fehler, den man kaum
    // sieht und der trotzdem jede Farbe verschiebt.
    renderer.toneMapping = NoToneMapping;

    // HalfFloat, nicht UnsignedByte: zwischen Szene und Tonemapping stehen
    // Werte weit über 1. In 8 Bit wären sie schon vor dem Bloom abgeschnitten,
    // und genau die abgeschnittenen Spitzen sind das, was blühen soll.
    const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    this.#composer = composer;
    composer.addPass(new RenderPass(scene, camera));

    const size = renderer.getDrawingBufferSize(new Vector2());
    this.#ao = this.#createAo(context, size.width, size.height);
    composer.addPass(this.#ao);

    this.#bloom = new BloomEffect({
      luminanceThreshold: POSTFX.bloom.threshold,
      luminanceSmoothing: POSTFX.bloom.smoothing,
      intensity: POSTFX.bloom.intensity,
      mipmapBlur: POSTFX.bloom.mipmapBlur,
      radius: POSTFX.bloom.radius,
    });

    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });

    this.#lutTexture = createGradingLut(this.#grading);
    this.#lut = new LUT3DEffect(this.#lutTexture, { tetrahedralInterpolation: true });

    this.#vignette = new VignetteEffect({
      offset: POSTFX.vignette.offset,
      darkness: POSTFX.vignette.darkness,
    });

    this.#mainPass = new EffectPass(camera, this.#bloom, toneMapping, this.#lut, this.#vignette);
    composer.addPass(this.#mainPass);

    // Der schlanke Zwilling für `compact`. **Eigene Effekt-Instanzen**, weil ein
    // Effekt genau einem `EffectPass` gehört — die *Textur* der LUT ist dagegen
    // dieselbe, also wirkt jede Grading-Änderung sofort auf beide Pässe.
    this.#compactVignette = new VignetteEffect({
      offset: POSTFX.vignette.offset,
      darkness: POSTFX.vignette.darkness,
    });
    this.#compactPass = new EffectPass(
      camera,
      new LUT3DEffect(this.#lutTexture, { tetrahedralInterpolation: true }),
      this.#compactVignette,
    );
    composer.addPass(this.#compactPass);

    this.#smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));
    composer.addPass(this.#smaaPass);

    this.#applyEnabled();
    this.#refreshPostFx();

    context.bus.on('look:apply', ({ look }) => {
      this.#applyLook(look);
    });
    context.bus.on('look:collect', ({ target }) => {
      this.#collectLook(target);
    });
    context.bus.on('quality:changed', ({ level }) => {
      this.#aoLevel = AO_QUALITY[QUALITY[level].ao];
      this.#refreshAo();
      this.#postFxLevel = POSTFX_QUALITY[QUALITY[level].postFx];
      this.#refreshPostFx();
    });

    this.#registerDebug(context);
  }

  #createAo(context: EngineContext, width: number, height: number): N8AOPostPass {
    const ao = new N8AOPostPass(context.scene, context.camera, width, height);
    const c = ao.configuration;
    c.aoRadius = POSTFX.ao.aoRadius;
    c.distanceFalloff = POSTFX.ao.distanceFalloff;
    c.intensity = POSTFX.ao.intensity;
    c.aoSamples = POSTFX.ao.aoSamples;
    c.denoiseSamples = POSTFX.ao.denoiseSamples;
    c.denoiseRadius = POSTFX.ao.denoiseRadius;
    c.halfRes = POSTFX.ao.halfRes;
    c.gammaCorrection = POSTFX.ao.gammaCorrection;
    // Muss **nach** allem anderen kommen: das Setzen schaltet zugleich die
    // automatische Erkennung ab, die sonst beim ersten Frame mit Wasser in der
    // Szene zwei zusätzliche Szenendurchläufe anwirft.
    c.transparencyAware = POSTFX.ao.transparencyAware;
    fixN8aoDepthTest(ao);
    return ao;
  }

  update(): void {
    this.#profiler?.update();
  }

  resize(width: number, height: number): void {
    // false: die CSS-Größe steuert das Layout. Der Composer rechnet die
    // Puffergrößen selbst aus der Drawing-Buffer-Größe, also inklusive
    // Pixelverhältnis — deshalb kommen hier die CSS-Pixel an, nicht die echten.
    this.#composer?.setSize(width, height, false);
  }

  // ── Look ───────────────────────────────────────────────────────────────

  #applyLook(look: LookState): void {
    const context = this.#context;
    if (context) context.renderer.toneMappingExposure = look.exposure;

    if (this.#bloom) {
      this.#bloom.intensity = look.postfx.bloomIntensity;
      this.#bloom.luminanceMaterial.threshold = look.postfx.bloomThreshold;
      this.#bloom.luminanceMaterial.smoothing = look.postfx.bloomSmoothing;
    }
    // **Beide Vignetten.** Der kompakte Pass hat eine eigene Instanz (siehe
    // `#compactPass`); wer nur die erste setzt, bekommt auf den unteren Stufen
    // stillschweigend die Startwerte statt des Presets — ein Regler, der auf
    // vier von fünf Stufen wirkt, ist genau die Sorte halbe Zusage, die dieses
    // Projekt zweimal ausgebaut hat.
    for (const vignette of [this.#vignette, this.#compactVignette]) {
      if (!vignette) continue;
      vignette.offset = look.postfx.vignetteOffset;
      vignette.darkness = look.postfx.vignetteDarkness;
    }
    if (this.#ao) {
      this.#ao.configuration.intensity = look.postfx.aoIntensity;
      this.#ao.configuration.aoRadius = look.postfx.aoRadius;
    }
    this.#lookWantsAo = look.postfx.aoEnabled;
    this.#refreshAo();
    this.#lookWantsSmaa = look.postfx.smaaEnabled;
    this.#refreshPostFx();

    Object.assign(this.#grading, look.grading);
    this.#refreshLut();
  }

  #collectLook(target: LookState): void {
    const context = this.#context;
    if (context) target.exposure = context.renderer.toneMappingExposure;

    if (this.#bloom) {
      target.postfx.bloomIntensity = this.#bloom.intensity;
      target.postfx.bloomThreshold = this.#bloom.luminanceMaterial.threshold;
      target.postfx.bloomSmoothing = this.#bloom.luminanceMaterial.smoothing;
    }
    if (this.#vignette) {
      target.postfx.vignetteOffset = this.#vignette.offset;
      target.postfx.vignetteDarkness = this.#vignette.darkness;
    }
    if (this.#ao) {
      target.postfx.aoIntensity = this.#ao.configuration.intensity;
      target.postfx.aoRadius = this.#ao.configuration.aoRadius;
    }
    // Der **Wunsch**, nicht der wirksame Zustand. Sonst schriebe ein Preset, das
    // jemand auf „Niedrig" speichert, das Abschalten der AO dauerhaft fest — und
    // es wäre auf „Ultra" wieder da, ohne dass jemand den Schalter angefasst hat.
    target.postfx.aoEnabled = this.#lookWantsAo;
    // Ebenfalls der Wunsch, aus demselben Grund: sonst schriebe ein auf
    // „Niedrig" gespeichertes Preset das Abschalten von SMAA dauerhaft fest.
    target.postfx.smaaEnabled = this.#lookWantsSmaa;

    Object.assign(target.grading, this.#grading);
  }

  /**
   * Die Kette an die Qualitätsstufe anpassen — P8.2.
   *
   * ## Der Bypass
   *
   * Bei `composer: false` wird der Präsentierer ausgetauscht: gerendert wird
   * direkt in den Canvas, die Kette läuft **gar nicht**. Das ist der einzige
   * Weg, ihre Kosten wirklich loszuwerden — jeder Effekt, der „aus" ist, kostet
   * immer noch seinen Durchgang, sobald der Composer läuft.
   *
   * Dabei muss das **Tonemapping mitwandern**. Die Kette tonemappt mit einem
   * Effekt, und `init()` stellt den Renderer deshalb auf `NoToneMapping`; ohne
   * den Tausch stünde im Bypass rohes HDR im Bild, also ein ausgebranntes
   * Weiß. Der Renderer bekommt AgX, damit die Helligkeit dieselbe bleibt.
   *
   * > **Der Wechsel kostet eine Shader-Übersetzung, und zwar aller Materialien.**
   * > `toneMapping` steht im Programm-Cache-Schlüssel von three (eines der 53
   * > Felder, die P7.4 beim Aufwärmframe durchgezählt hat). Beim Umschalten auf
   * > oder von „Minimal" werden deshalb alle Programme neu gebaut. Das ist
   * > hinnehmbar, weil die Stufe im Regelfall **vor** dem ersten Bild feststeht
   * > (gespeicherte Wahl oder Ersteinstufung) und nicht mitten im Flug gewählt
   * > wird — gemessen und beziffert gehört es trotzdem, siehe PLAN.md P8.2.
   */
  #refreshPostFx(): void {
    const level = this.#postFxLevel;
    // Wer tonemappt, entscheidet zugleich, welcher der beiden Effekt-Pässe
    // läuft: der volle bringt den `ToneMappingEffect` mit, der kompakte nicht.
    const chain = level.toneMapping === 'chain';

    if (this.#bloom) this.#bloom.mipmapBlurPass.levels = Math.max(1, level.bloomLevels);
    if (this.#smaaPass) this.#smaaPass.enabled = this.#lookWantsSmaa && level.smaa;
    if (this.#mainPass) this.#mainPass.enabled = chain;
    if (this.#compactPass) this.#compactPass.enabled = !chain;

    const context = this.#context;
    const composer = this.#composer;
    if (!context || !composer) return;

    const { renderer, scene, camera } = context;
    if (level.composer) {
      // **Das Tonemapping wandert, nicht die Helligkeit.** Bei `compact`
      // tonemappt three schon im Materialshader; ab dem Puffer stehen
      // Anzeigewerte, und LUT und Vignette arbeiten genau darauf — dieselbe
      // Reihenfolge wie in der vollen Kette, nur ohne eigenen Durchgang dafür.
      renderer.toneMapping = chain ? NoToneMapping : AgXToneMapping;
      this.setPresenter(() => {
        composer.render();
      });
      this.#readouts.kette = chain
        ? `Render → AO → Bloom(${level.bloomLevels})/AgX/LUT/Vignette` +
          (this.#smaaPass?.enabled ? ' → SMAA' : '')
        : 'Render (AgX im Renderer) → AO → LUT/Vignette — kompakt, ein Durchgang';
    } else {
      renderer.toneMapping = AgXToneMapping;
      this.setPresenter(() => {
        // Ausdrücklich auf den Canvas: der letzte Lauf der Kette hinterlässt
        // sonst sein Zwischenziel, und dann zeichnet die Anwendung in einen
        // Puffer, den niemand mehr anzeigt.
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      });
      this.#readouts.kette = 'Kette umgangen — direkt in den Canvas (AgX im Renderer)';
    }

    this.#updateRenderToScreen();
  }

  /**
   * Den letzten **aktiven** Pass auf den Bildschirm zeichnen lassen.
   *
   * ## Ein Schwarzbild, das es schon vor P8.2 gab
   *
   * `EffectComposer.addPass` setzt `renderToScreen` genau einmal, und zwar auf
   * den letzten Pass **im Array** — bei uns ist das SMAA. `render()` überspringt
   * abgeschaltete Pässe dagegen vollständig (`if (!pass.enabled) continue`).
   * Wer SMAA abschaltet, nimmt der Kette damit ihren einzigen Ausgang: das
   * fertige Bild landet im Zwischenpuffer, und der Canvas bleibt schwarz.
   *
   * Gefunden hat es die Stufe „Niedrig", die SMAA seit 8.2 abschaltet — aber
   * **der Fehler ist älter**: der Schalter „SMAA" im Debug-Panel tat seit P2
   * genau dasselbe. Aufgefallen ist es nie, weil niemand ihn benutzt hat.
   *
   * Gemessen wurde es nicht am Bild, sondern an `probe()`: `anteilNichtSchwarz`
   * stand bei 0,000, während Draw-Calls, Dreiecke und Instanzen unverändert
   * plausibel aussahen. Genau der Fall aus CLAUDE.md, „Etwas ist nicht im Bild —
   * und jede Zahl sagt, es sei alles in Ordnung".
   */
  #updateRenderToScreen(): void {
    const composer = this.#composer;
    if (!composer) return;
    let last: (typeof composer.passes)[number] | null = null;
    for (const pass of composer.passes) if (pass.enabled) last = pass;
    for (const pass of composer.passes) pass.renderToScreen = pass === last;
  }

  /** Qualitätsstufe und Look-Wunsch in den einen Schalter zusammenführen. */
  #refreshAo(): void {
    const ao = this.#ao;
    if (!ao) return;
    ao.enabled = this.#lookWantsAo && this.#aoLevel.enabled;
    const c = ao.configuration;
    c.aoSamples = this.#aoLevel.aoSamples;
    c.denoiseSamples = this.#aoLevel.denoiseSamples;
    c.halfRes = this.#aoLevel.halfRes;
  }

  #applyEnabled(): void {
    this.#lookWantsAo = POSTFX.ao.enabled;
    this.#refreshAo();
    if (this.#bloom) this.#bloom.blendMode.opacity.value = POSTFX.bloom.enabled ? 1 : 0;
    for (const vignette of [this.#vignette, this.#compactVignette]) {
      if (vignette) vignette.blendMode.opacity.value = POSTFX.vignette.enabled ? 1 : 0;
    }
    this.#lookWantsSmaa = POSTFX.smaa.enabled;
  }

  #refreshLut(): void {
    if (this.#lutTexture) updateGradingLut(this.#lutTexture, this.#grading);
  }

  // ── Debug ──────────────────────────────────────────────────────────────

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('PostFX');
    if (!folder) return;

    folder.addBinding(this.#readouts, 'kette', { readonly: true, label: 'Kette' });
    folder.addBinding(this.#readouts, 'kosten', {
      readonly: true,
      label: 'GPU-Kosten',
      multiline: true,
      rows: 5,
    });

    // Der A/B-Messknopf statt einer Dauer-Anzeige pro Effekt: verschachtelte
    // GPU-Zeitabfragen sind in WebGL2 nicht erlaubt (EXT_disjoint_timer_query
    // lässt genau eine offene Abfrage zu), und stats-gl hält bereits eine über
    // den ganzen Frame. Der ehrliche Ersatz ist die Differenzmessung: Effekt
    // aus, Frames zählen, Effekt an, Differenz bilden.
    folder.addButton({ title: 'Kosten messen (A/B)' }).on('click', () => {
      this.#startProfiling(context);
    });

    const effects = folder.addFolder({ title: 'Effekte', expanded: true });
    const toggles = {
      ao: POSTFX.ao.enabled,
      bloom: POSTFX.bloom.enabled,
      vignette: POSTFX.vignette.enabled,
      lut: true,
      smaa: POSTFX.smaa.enabled,
    };

    effects.addBinding(toggles, 'ao', { label: 'Umgebungsverdeckung' }).on('change', (event) => {
      this.#lookWantsAo = event.value;
      this.#refreshAo();
    });
    effects.addBinding(toggles, 'bloom', { label: 'Bloom' }).on('change', (event) => {
      if (this.#bloom) this.#bloom.blendMode.opacity.value = event.value ? 1 : 0;
    });
    effects.addBinding(toggles, 'lut', { label: 'Color Grading' }).on('change', (event) => {
      if (this.#lut) this.#lut.blendMode.opacity.value = event.value ? 1 : 0;
    });
    effects.addBinding(toggles, 'vignette', { label: 'Vignette' }).on('change', (event) => {
      for (const vignette of [this.#vignette, this.#compactVignette]) {
        if (vignette) vignette.blendMode.opacity.value = event.value ? 1 : 0;
      }
    });
    effects.addBinding(toggles, 'smaa', { label: 'SMAA' }).on('change', (event) => {
      // Über den Wunsch, nicht über den Pass — sonst hebt der Schalter die
      // Qualitätsstufe auf, und der nächste Stufenwechsel nimmt es wortlos
      // zurück. Dieselbe Trennung wie beim AO-Schalter darüber.
      this.#lookWantsSmaa = event.value;
      this.#refreshPostFx();
    });

    const bloom = folder.addFolder({ title: 'Bloom', expanded: false });
    if (this.#bloom) {
      bloom.addBinding(this.#bloom, 'intensity', { label: 'Stärke', min: 0, max: 3, step: 0.01 });
      bloom.addBinding(this.#bloom.luminanceMaterial, 'threshold', {
        label: 'Schwelle (HDR)',
        min: 0,
        max: 4,
        step: 0.01,
      });
      bloom.addBinding(this.#bloom.luminanceMaterial, 'smoothing', {
        label: 'Weichheit',
        min: 0,
        max: 1,
        step: 0.01,
      });
    }

    if (this.#ao) {
      const ao = folder.addFolder({ title: 'Umgebungsverdeckung', expanded: false });
      const c = this.#ao.configuration;
      ao.addBinding(c, 'intensity', { label: 'Stärke', min: 0, max: 8, step: 0.05 });
      ao.addBinding(c, 'aoRadius', { label: 'Radius (m)', min: 0.5, max: 60, step: 0.5 });
      ao.addBinding(c, 'distanceFalloff', { label: 'Abfall', min: 0, max: 4, step: 0.05 });
      ao.addBinding(c, 'halfRes', { label: 'Halbe Auflösung' });
      ao.addBinding(c, 'renderMode', {
        label: 'Ansicht',
        options: { Fertig: 0, 'Nur AO': 1, 'Ohne AO': 2, Geteilt: 3 },
      });
    }

    this.#registerGradingDebug(folder);
  }

  #registerGradingDebug(folder: ReturnType<NonNullable<EngineContext['debug']>['folder']>): void {
    const grading = folder.addFolder({ title: 'Color Grading', expanded: false });
    const refresh = (): void => {
      this.#refreshLut();
    };

    const ranges: Record<keyof GradingParams, { min: number; max: number; step: number }> = {
      contrast: { min: 0.5, max: 1.8, step: 0.005 },
      saturation: { min: 0, max: 2, step: 0.005 },
      temperature: { min: -1, max: 1, step: 0.005 },
      tint: { min: -1, max: 1, step: 0.005 },
      lift: { min: -0.15, max: 0.15, step: 0.001 },
      gamma: { min: 0.4, max: 2.4, step: 0.005 },
      gain: { min: 0.4, max: 2, step: 0.005 },
      shadowTint: { min: -0.6, max: 0.6, step: 0.005 },
    };
    const labels: Record<keyof GradingParams, string> = {
      contrast: 'Kontrast',
      saturation: 'Sättigung',
      temperature: 'Temperatur',
      tint: 'Tint (Grün/Magenta)',
      lift: 'Tiefen (Lift)',
      gamma: 'Mitten (Gamma)',
      gain: 'Lichter (Gain)',
      shadowTint: 'Farbstich in Tiefen',
    };

    for (const key of Object.keys(ranges) as (keyof GradingParams)[]) {
      grading
        .addBinding(this.#grading, key, { label: labels[key], ...ranges[key] })
        .on('change', refresh);
    }

    grading.addButton({ title: '.cube exportieren' }).on('click', () => {
      downloadText(toCube(this.#grading, 'japanMap blue hour'), 'blue_hour.cube');
    });
  }

  /**
   * A/B-Messung der Effektkosten.
   *
   * Läuft über mehrere Frames, weil eine einzelne GPU-Messung nichts aussagt:
   * der Treiber puffert, und der erste Frame nach einer Zustandsänderung
   * enthält Programmwechsel. Deshalb je Zustand eine Aufwärmphase und danach
   * ein Mittel über mehrere Frames.
   */
  #startProfiling(context: EngineContext): void {
    if (this.#profiler) return;
    const debug = context.debug;
    if (!debug || debug.lastGpuMs === null) {
      this.#readouts.kosten = 'GPU-Timer nicht verfügbar — keine Messung möglich.';
      return;
    }
    // Ohne laufende Kette misst die A/B-Differenz nichts: die Schalter unten
    // stellen Effekte um, die gar nicht ausgeführt werden. Eine Messung, die
    // in diesem Fall Zahlen lieferte, wäre schlimmer als keine.
    if (!this.#postFxLevel.composer) {
      this.#readouts.kosten = 'Kette ist auf dieser Stufe umgangen — nichts zu messen.';
      return;
    }
    // Auf `compact` laufen Bloom, SMAA und der volle Effekt-Pass gar nicht; die
    // Schalter unten schalteten dann Pässe um, die ohnehin übersprungen werden,
    // und die A/B-Differenz meldete Nullen als Ergebnis.
    if (this.#postFxLevel.toneMapping !== 'chain') {
      this.#readouts.kosten =
        'Kompakte Kette — Bloom und SMAA laufen hier nicht. Für die Aufschlüsselung ' +
        'auf eine Stufe mit voller Kette wechseln.';
      return;
    }

    const steps: ProfileStep[] = [];
    if (this.#ao) {
      steps.push({ label: 'AO', set: (on) => void (this.#ao && (this.#ao.enabled = on)) });
    }
    if (this.#bloom) {
      const bloom = this.#bloom;
      steps.push({
        label: 'Bloom',
        set: (on) => void (bloom.blendMode.opacity.value = on ? 1 : 0),
      });
    }
    // Beide schalten **hintere** Pässe ab, und der hinterste aktive ist der, der
    // auf den Bildschirm zeichnet. Ohne das Nachziehen misst die A/B-Differenz
    // die Kosten eines schwarzen Bildes — siehe `#updateRenderToScreen`.
    if (this.#smaaPass) {
      const pass = this.#smaaPass;
      steps.push({
        label: 'SMAA',
        set: (on) => {
          pass.enabled = on;
          this.#updateRenderToScreen();
        },
      });
    }
    if (this.#mainPass) {
      const pass = this.#mainPass;
      steps.push({
        label: 'AgX+LUT+Vignette',
        set: (on) => {
          pass.enabled = on;
          this.#updateRenderToScreen();
        },
      });
    }

    this.#readouts.kosten = 'messe …';
    this.#profiler = new CostProfiler(steps, debug, (report) => {
      this.#readouts.kosten = report;
      this.#profiler = null;
    });
  }

  dispose(): void {
    this.#composer?.dispose();
    this.#composer = null;
    this.#lutTexture?.dispose();
    this.#lutTexture = null;
    this.#ao = null;
    this.#bloom = null;
    this.#lut = null;
    this.#vignette = null;
    this.#mainPass = null;
    this.#smaaPass = null;
    this.#compactPass = null;
    this.#compactVignette = null;
    this.#profiler = null;
    this.#context = null;
  }
}

// ── Hilfsmittel ──────────────────────────────────────────────────────────

/**
 * Tiefentest am Kopier-Quad von N8AO abschalten.
 *
 * **Ohne diese Zeile ist das gesamte Bild schwarz.** Die Ursache ist eine
 * Kette, die einzeln jeweils harmlos aussieht:
 *
 *  1. `N8AOPostPass` meldet `needsDepthTexture`. Der EffectComposer hängt
 *     daraufhin an **beide** Ping-Pong-Puffer eine Tiefentextur.
 *  2. Der Puffer, in den N8AO sein Ergebnis kopiert, wird nie gerendert und nie
 *     geleert — seine frisch angelegte Tiefentextur enthält also Nullen.
 *  3. Das Material des Kopier-Quads setzt `depthWrite: false`, aber nicht
 *     `depthTest: false`. Das Quad liegt bei Tiefe 0,5, der Vergleich lautet
 *     `0.5 <= 0.0` — jedes Fragment fällt durch.
 *
 * Am Bildschirm tritt der Fehler nicht auf: dessen Tiefenpuffer leert der
 * Browser jeden Frame auf 1,0. Sichtbar wird er nur, wenn nach dem AO noch ein
 * Pass folgt — also in genau der Kette, die diese Phase baut.
 *
 * Der Zugriff geht an der öffentlichen Schnittstelle vorbei und kann bei einem
 * Update von `n8ao` ins Leere laufen. Deshalb wird der Fund geprüft und das
 * Ausbleiben laut gemeldet, statt still ein schwarzes Bild zu liefern.
 */
function fixN8aoDepthTest(ao: N8AOPostPass): void {
  const quad = (ao as unknown as { copyQuad?: { _mesh?: { material?: Material } } }).copyQuad;
  const material = quad?._mesh?.material;

  if (!material) {
    console.warn(
      'N8AO: copyQuad._mesh.material nicht gefunden — der Tiefentest-Fix greift nicht. ' +
        'Falls das Bild schwarz bleibt, ist das der Grund (siehe fixN8aoDepthTest).',
    );
    return;
  }

  material.depthTest = false;
  material.needsUpdate = true;
}

interface ProfileStep {
  readonly label: string;
  readonly set: (enabled: boolean) => void;
}

/** Frames je Zustand: die ersten werden verworfen (Programmwechsel, Treiberpuffer). */
const PROFILE_WARMUP = 20;
const PROFILE_SAMPLES = 45;

class CostProfiler {
  #index = -1;
  #frame = 0;
  #sum = 0;
  #baseline = 0;
  readonly #results: string[] = [];

  constructor(
    private readonly steps: readonly ProfileStep[],
    private readonly debug: { readonly lastGpuMs: number | null },
    private readonly done: (report: string) => void,
  ) {}

  update(): void {
    const sample = this.debug.lastGpuMs;
    if (sample === null) {
      this.done('GPU-Timer während der Messung ausgefallen.');
      return;
    }

    this.#frame++;
    if (this.#frame > PROFILE_WARMUP) this.#sum += sample;

    if (this.#frame < PROFILE_WARMUP + PROFILE_SAMPLES) return;

    const mean = this.#sum / PROFILE_SAMPLES;
    if (this.#index === -1) {
      // Erste Runde: alles an. Das ist die Bezugsgröße.
      this.#baseline = mean;
    } else {
      const step = this.steps[this.#index];
      if (step) {
        this.#results.push(`${step.label}: ${(this.#baseline - mean).toFixed(2)} ms`);
        step.set(true);
      }
    }

    this.#index++;
    this.#frame = 0;
    this.#sum = 0;

    const next = this.steps[this.#index];
    if (!next) {
      // Die Kette kostet, was der Frame ohne sie *nicht* kostet. Gegen das
      // Budget aus SPEC §4 gemessen, damit die Zahl eine Aussage hat und nicht
      // nur eine Zahl ist.
      const chain = this.#results.reduce((sum, line) => {
        const value = Number.parseFloat(line.split(': ')[1] ?? '0');
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      const verdict = chain <= BUDGETS.postFxMs.limit ? 'im Budget' : 'ÜBER Budget';
      this.#results.push(
        `Kette gesamt: ${chain.toFixed(2)} ms / ${BUDGETS.postFxMs.limit} ms — ${verdict}`,
      );
      this.done(this.#results.join('\n'));
      return;
    }
    next.set(false);
  }
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
