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
import { HalfFloatType, NoToneMapping, Vector2, type Material } from 'three';

import { GRADING, POSTFX, type GradingParams } from '@/config/postfx.config';
import { BUDGETS } from '@/config/quality.config';
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

  readonly #grading: GradingParams = { ...GRADING };
  #profiler: CostProfiler | null = null;

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

    this.#smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));
    composer.addPass(this.#smaaPass);

    this.#applyEnabled();
    this.#readouts.kette = 'Render → AO → Bloom/AgX/LUT/Vignette → SMAA';

    this.setPresenter(() => {
      composer.render();
    });

    context.bus.on('look:apply', ({ look }) => {
      this.#applyLook(look);
    });
    context.bus.on('look:collect', ({ target }) => {
      this.#collectLook(target);
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
    if (this.#vignette) {
      this.#vignette.offset = look.postfx.vignetteOffset;
      this.#vignette.darkness = look.postfx.vignetteDarkness;
    }
    if (this.#ao) {
      this.#ao.configuration.intensity = look.postfx.aoIntensity;
      this.#ao.configuration.aoRadius = look.postfx.aoRadius;
      this.#ao.enabled = look.postfx.aoEnabled;
    }
    if (this.#smaaPass) this.#smaaPass.enabled = look.postfx.smaaEnabled;

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
      target.postfx.aoEnabled = this.#ao.enabled;
    }
    if (this.#smaaPass) target.postfx.smaaEnabled = this.#smaaPass.enabled;

    Object.assign(target.grading, this.#grading);
  }

  #applyEnabled(): void {
    if (this.#ao) this.#ao.enabled = POSTFX.ao.enabled;
    if (this.#bloom) this.#bloom.blendMode.opacity.value = POSTFX.bloom.enabled ? 1 : 0;
    if (this.#vignette) this.#vignette.blendMode.opacity.value = POSTFX.vignette.enabled ? 1 : 0;
    if (this.#smaaPass) this.#smaaPass.enabled = POSTFX.smaa.enabled;
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
      if (this.#ao) this.#ao.enabled = event.value;
    });
    effects.addBinding(toggles, 'bloom', { label: 'Bloom' }).on('change', (event) => {
      if (this.#bloom) this.#bloom.blendMode.opacity.value = event.value ? 1 : 0;
    });
    effects.addBinding(toggles, 'lut', { label: 'Color Grading' }).on('change', (event) => {
      if (this.#lut) this.#lut.blendMode.opacity.value = event.value ? 1 : 0;
    });
    effects.addBinding(toggles, 'vignette', { label: 'Vignette' }).on('change', (event) => {
      if (this.#vignette) this.#vignette.blendMode.opacity.value = event.value ? 1 : 0;
    });
    effects.addBinding(toggles, 'smaa', { label: 'SMAA' }).on('change', (event) => {
      if (this.#smaaPass) this.#smaaPass.enabled = event.value;
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
    if (this.#smaaPass) {
      const pass = this.#smaaPass;
      steps.push({ label: 'SMAA', set: (on) => void (pass.enabled = on) });
    }
    if (this.#mainPass) {
      const pass = this.#mainPass;
      steps.push({ label: 'AgX+LUT+Vignette', set: (on) => void (pass.enabled = on) });
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
