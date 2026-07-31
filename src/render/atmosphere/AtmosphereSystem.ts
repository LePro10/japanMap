import { Color, LinearFilter, MathUtils, type Texture } from 'three';

import type { ShadeMeta } from '@/config/atmosphere.config';
import { FALLBACK_SUN, type SunData } from '@/config/lighting.config';
import type { EngineContext, System } from '@/core/System';
import type { LookState } from '@/render/looks/lookState';
import { HDRI_ASSETS, TERRAIN_ASSETS } from '@/world/terrainAssets';
import { createAtmosphereUniforms, type AtmosphereUniforms } from './atmosphereUniforms';
import { createCloudTexture } from './createCloudTexture';
import { createSkyLut } from './createSkyLut';

/**
 * Nebel und gebackene Verschattung — PLAN.md P2 / 2.2 und 2.3.
 *
 * Besitzt den Uniform-Block, den sich alle Weltmaterialien teilen, und die
 * beiden Texturen dahinter: die Nebelfarben-Tabelle aus dem Himmels-HDRI und
 * `shade.png` aus tools/bake-shadows.mjs.
 *
 * Wird **vor** Terrain und Wasser registriert, weil beide den Block beim Bauen
 * ihrer Materialien brauchen.
 */
export class AtmosphereSystem implements System {
  readonly name = 'AtmosphereSystem';

  readonly #uniforms: AtmosphereUniforms = createAtmosphereUniforms();

  #context: EngineContext | null = null;
  #skyLut: Texture | null = null;
  #cloudMap: Texture | null = null;

  readonly #readouts = {
    verschattung: '—',
  };

  get uniforms(): AtmosphereUniforms {
    return this.#uniforms;
  }

  async init(context: EngineContext): Promise<void> {
    this.#context = context;

    const [shade, shadeMeta, sky, sun] = await Promise.all([
      // flipY: false wie bei allen gebackenen Karten — sie sind zeilenweise von
      // Nord nach Süd gespeichert (siehe TerrainSystem).
      context.resources.texture(TERRAIN_ASSETS.shade, {
        srgb: false,
        wrap: 'clamp',
        flipY: false,
      }),
      context.resources.json<ShadeMeta>(TERRAIN_ASSETS.shadeMeta),
      context.resources.hdri(HDRI_ASSETS.sky),
      context.resources.json<SunData>(HDRI_ASSETS.sun).catch((): SunData => FALLBACK_SUN),
    ]);
    // Anisotropie bringt hier nichts (die Karte wird flach von oben gelesen)
    // und kostet auf einer 1024²-Textur unnötig Bandbreite.
    shade.anisotropy = 1;
    shade.minFilter = LinearFilter;
    shade.magFilter = LinearFilter;
    shade.generateMipmaps = false;
    shade.needsUpdate = true;

    this.#verifyBakedAzimuth(shadeMeta, sun);

    this.#uniforms.uAtmoShade.value = shade;
    this.#uniforms.uAtmoShadeDecode.value.set(
      shadeMeta.maxHorizonDeg,
      shadeMeta.maxOccluderDistance,
      shadeMeta.res,
    );

    this.#skyLut = context.resources.track(createSkyLut(sky));
    this.#uniforms.uAtmoSkyLut.value = this.#skyLut;

    // Gerechnet statt geladen — Begründung in createCloudTexture.ts.
    this.#cloudMap = context.resources.track(createCloudTexture());
    this.#uniforms.uAtmoCloudMap.value = this.#cloudMap;

    this.#readouts.verschattung =
      `${(shadeMeta.measured.litFraction * 100).toFixed(0)} % besonnt · ` +
      `${shadeMeta.res}² · Azimut ${shadeMeta.sun.azimuthDeg.toFixed(0)}°`;

    context.bus.on('look:apply', ({ look }) => {
      this.#applyLook(look);
    });
    context.bus.on('look:collect', ({ target }) => {
      this.#collectLook(target);
    });

    this.#registerDebug(context);
  }

  /**
   * Der Azimut steckt fest in der gebackenen Karte.
   *
   * Wird die Sonne im HDRI gewechselt oder `tools/hdri-sun.mjs` neu ausgeführt,
   * ohne danach `npm run shade` laufen zu lassen, stimmen Licht und Schatten
   * nicht mehr überein — und zwar auf eine Art, die plausibel aussieht: die
   * Schatten liegen sauber, nur in der falschen Richtung. Genau deshalb steht
   * hier eine Prüfung und keine Annahme.
   */
  #verifyBakedAzimuth(meta: ShadeMeta, sun: SunData): void {
    const difference = Math.abs(
      MathUtils.euclideanModulo(meta.sun.azimuthDeg - sun.azimuthDeg + 180, 360) - 180,
    );
    if (difference <= 0.5) return;

    console.warn(
      `Verschattung wurde für Azimut ${meta.sun.azimuthDeg.toFixed(1)}° gebacken, ` +
        `die Sonne steht bei ${sun.azimuthDeg.toFixed(1)}°. ` +
        'Schatten und Licht laufen auseinander — `npm run shade` erneut ausführen.',
    );
  }

  /** Die Wellen des Wassers hängen daran; sonst steht das Meer still. */
  update(dt: number): void {
    this.#uniforms.uAtmoTime.value += dt;
  }

  // ── Look ───────────────────────────────────────────────────────────────

  #applyLook(look: LookState): void {
    const u = this.#uniforms;
    u.uAtmoFogGround.value.set(
      look.fog.groundDensity,
      look.fog.groundFalloff,
      look.fog.groundSkyBlend,
    );
    u.uAtmoFogAerial.value.set(
      look.fog.aerialDensity,
      look.fog.aerialFalloff,
      look.fog.aerialSkyBlend,
    );
    u.uAtmoFogGroundTint.value.set(look.fog.groundTintHex).convertSRGBToLinear();
    u.uAtmoFogMaxOpacity.value = look.fog.maxOpacity;

    u.uAtmoShadeSoftness.value.set(
      look.shade.penumbraBaseDeg,
      look.shade.penumbraPerKmDeg / 1000,
    );
    u.uAtmoShadeAmbient.value = look.shade.ambientFloor;
  }

  #collectLook(target: LookState): void {
    const u = this.#uniforms;
    target.fog.groundDensity = u.uAtmoFogGround.value.x;
    target.fog.groundFalloff = u.uAtmoFogGround.value.y;
    target.fog.groundSkyBlend = u.uAtmoFogGround.value.z;
    target.fog.groundTintHex = `#${new Color()
      .copy(u.uAtmoFogGroundTint.value)
      .convertLinearToSRGB()
      .getHexString()}`;
    target.fog.aerialDensity = u.uAtmoFogAerial.value.x;
    target.fog.aerialFalloff = u.uAtmoFogAerial.value.y;
    target.fog.aerialSkyBlend = u.uAtmoFogAerial.value.z;
    target.fog.maxOpacity = u.uAtmoFogMaxOpacity.value;

    target.shade.penumbraBaseDeg = u.uAtmoShadeSoftness.value.x;
    target.shade.penumbraPerKmDeg = u.uAtmoShadeSoftness.value.y * 1000;
    target.shade.ambientFloor = u.uAtmoShadeAmbient.value;
  }

  // ── Debug ──────────────────────────────────────────────────────────────

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Atmosphäre');
    if (!folder) return;

    const u = this.#uniforms;

    folder.addBinding(this.#readouts, 'verschattung', {
      readonly: true,
      label: 'Verschattung',
    });

    const fog = folder.addFolder({ title: 'Nebel', expanded: true });
    // Die Dichten sind winzige Zahlen; ohne kleine Schrittweite springt der
    // Regler über den ganzen brauchbaren Bereich hinweg.
    fog.addBinding(u.uAtmoFogGround.value, 'x', {
      label: 'Boden — Dichte',
      min: 0,
      max: 0.02,
      step: 0.0001,
    });
    fog.addBinding(u.uAtmoFogGround.value, 'y', {
      label: 'Boden — Höhe',
      min: 2,
      max: 200,
      step: 1,
    });
    fog.addBinding(u.uAtmoFogGround.value, 'z', {
      label: 'Boden — Himmelsanteil',
      min: 0,
      max: 1,
      step: 0.01,
    });
    fog.addBinding(u.uAtmoFogGroundTint, 'value', {
      label: 'Boden — Farbton',
      color: { type: 'float' },
    });
    fog.addBinding(u.uAtmoFogAerial.value, 'x', {
      label: 'Distanz — Dichte',
      min: 0,
      max: 0.003,
      step: 0.00001,
    });
    fog.addBinding(u.uAtmoFogAerial.value, 'y', {
      label: 'Distanz — Höhe',
      min: 50,
      max: 2000,
      step: 5,
    });
    fog.addBinding(u.uAtmoFogMaxOpacity, 'value', {
      label: 'Höchste Deckung',
      min: 0,
      max: 1,
      step: 0.01,
    });

    const shade = folder.addFolder({ title: 'Verschattung', expanded: false });
    shade.addBinding(u.uAtmoShadeSoftness.value, 'x', {
      label: 'Halbschatten (Grad)',
      min: 0,
      max: 3,
      step: 0.01,
    });
    shade.addBinding(u.uAtmoShadeSoftness.value, 'y', {
      label: 'Zuwachs pro km',
      min: 0,
      max: 0.003,
      step: 0.00001,
    });
    shade.addBinding(u.uAtmoShadeAmbient, 'value', {
      label: 'Restlicht im Schatten',
      min: 0,
      max: 0.5,
      step: 0.005,
    });
    shade.addBinding(u.uAtmoSkyOcclusion.value, 'x', {
      label: 'Himmelssicht — diffus',
      min: 0,
      max: 1,
      step: 0.01,
    });
    shade.addBinding(u.uAtmoSkyOcclusion.value, 'y', {
      label: 'Himmelssicht — spekular',
      min: 0,
      max: 1,
      step: 0.01,
    });

    // Der Stärke-Regler ist zugleich der Ausschalter (0 = aus). Er ist der
    // Bezugspunkt jeder Messung an diesem Effekt: die Wirkung wird als
    // Differenz gegen ein Bild mit Stärke 0 gemessen, nicht am Mittelwert
    // über das ganze Bild — der Effekt ist lokal (CLAUDE.md, P6).
    const clouds = folder.addFolder({ title: 'Wolkenschatten', expanded: false });
    clouds.addBinding(u.uAtmoCloud.value, 'z', {
      label: 'Stärke (0 = aus)',
      min: 0,
      max: 1,
      step: 0.01,
    });
    clouds.addBinding(u.uAtmoCloud.value, 'x', {
      label: 'Deckung',
      min: 0,
      max: 1,
      step: 0.01,
    });
    clouds.addBinding(u.uAtmoCloud.value, 'y', {
      label: 'Weichheit der Ränder',
      min: 0.01,
      max: 0.5,
      step: 0.01,
    });
    clouds.addBinding(u.uAtmoCloudTile.value, 'z', {
      label: 'Tempo grobe Lage (m/s)',
      min: 0,
      max: 60,
      step: 0.5,
    });
    clouds.addBinding(u.uAtmoCloudTile.value, 'w', {
      label: 'Tempo feine Lage (m/s)',
      min: 0,
      max: 60,
      step: 0.5,
    });
  }

  dispose(): void {
    this.#skyLut?.dispose();
    if (this.#skyLut) this.#context?.resources.untrack(this.#skyLut);
    this.#skyLut = null;
    this.#cloudMap?.dispose();
    if (this.#cloudMap) this.#context?.resources.untrack(this.#cloudMap);
    this.#cloudMap = null;
    this.#uniforms.uAtmoSkyLut.value = null;
    this.#uniforms.uAtmoCloudMap.value = null;
    this.#uniforms.uAtmoShade.value = null;
    this.#context = null;
  }
}
