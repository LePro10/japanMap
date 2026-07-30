import { FOG } from '@/config/atmosphere.config';
import { LIGHTING } from '@/config/lighting.config';
import { CITY_LOOK } from '@/config/city.config';
import { GRADING, POSTFX, type GradingParams } from '@/config/postfx.config';
import { ROAD_WET } from '@/config/roads.config';
import { VEGETATION_LOOK } from '@/config/vegetation.config';
import { WATER } from '@/config/water.config';

/**
 * Ein vollständiger Beleuchtungszustand — PLAN.md P2 / 2.6.
 *
 * Der Grund für dieses Format steht im Plan und ist die Erfahrung aus P1: das
 * Tuning eines Looks ist ein Prozess über Wochen, und ohne Speicherfunktion
 * ist das beste Ergebnis nach dem nächsten Neuladen weg. Hier steht deshalb
 * *alles*, was am Bild dreht — nicht nur die offensichtlichen Regler.
 *
 * Die Struktur ist absichtlich flach und aus reinen Zahlen und Hex-Strings
 * aufgebaut: sie muss durch `JSON.stringify` und wieder zurück, ohne dass
 * dabei Klassen (Color, Vector3) rekonstruiert werden müssen.
 */
export interface LookState {
  name: string;
  /** Format-Version. Ein alter Look mit fehlenden Feldern fällt auf die Vorgabe zurück. */
  version: number;

  exposure: number;

  lighting: {
    sunIntensity: number;
    sunColorHex: string;
    sunElevationDeg: number;
    environmentIntensity: number;
    skyIntensity: number;
  };

  fog: {
    groundDensity: number;
    groundFalloff: number;
    groundSkyBlend: number;
    groundTintHex: string;
    aerialDensity: number;
    aerialFalloff: number;
    aerialSkyBlend: number;
    maxOpacity: number;
  };

  shade: {
    penumbraBaseDeg: number;
    penumbraPerKmDeg: number;
    ambientFloor: number;
  };

  water: {
    deepColorHex: string;
    shallowColorHex: string;
    roughness: number;
    foamIntensity: number;
  };

  /**
   * Vegetation — ab P4.
   *
   * Nur das, was am **Bild** dreht. Streudichte und LOD-Grenzen gehören nicht
   * hierher: sie sind Leistungsparameter der Qualitätsstufe, kein Look. Ein
   * Preset, das die halbe Vegetation abschaltet, wäre kein anderer Look, sondern
   * eine andere Welt.
   */
  vegetation: {
    windStrength: number;
    /** Streulicht durch Blätter — siehe VegetationMaterial. */
    translucency: number;
    /** Bodenverdeckung am Fuß der Pflanze — siehe GroundAoMaterial. */
    groundAo: number;
  };

  /**
   * Straßenbelag — PLAN.md P6 / 6.4.
   *
   * Ein einziger Wert, und er trägt den halben Look der Phase: SPEC §3.1 legt
   * „blaue Stunde **nach Regen**" fest, und die Nässe ist das, was diesen Satz
   * im Bild einlöst. Er steuert die bedeckte **Fläche**, nicht die Stärke —
   * Begründung in `ROAD_WET`.
   */
  road: {
    wetness: number;
  };

  /**
   * Stadt — PLAN.md P6 / 6.2.
   *
   * Zwei Werte, und beide drehen unübersehbar am Bild: wie viele Fenster
   * brennen und wie hell. Bei blauer Stunde ist das Fensterlicht laut SPEC §3.1
   * die dominante urbane Lichtquelle — ein Preset ohne diese beiden Regler
   * könnte den Look der Stadt nicht festhalten.
   */
  city: {
    /** Schwelle, unter der ein Fenster dunkel bleibt. 0,45 = 55 % brennen. */
    windowLitFraction: number;
    /** Leuchtstärke eines brennenden Fensters. */
    windowEmissive: number;
  };

  postfx: {
    bloomEnabled: boolean;
    bloomIntensity: number;
    bloomThreshold: number;
    bloomSmoothing: number;
    vignetteEnabled: boolean;
    vignetteOffset: number;
    vignetteDarkness: number;
    aoEnabled: boolean;
    aoIntensity: number;
    aoRadius: number;
    smaaEnabled: boolean;
  };

  grading: GradingParams;
}

export const LOOK_VERSION = 2;

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** Der Zustand, wie er aus den Konfigurationsdateien folgt. */
export function defaultLook(): LookState {
  return {
    name: 'Standard',
    version: LOOK_VERSION,
    exposure: POSTFX.exposure,
    lighting: {
      sunIntensity: LIGHTING.sunIntensity,
      sunColorHex: hex(LIGHTING.sunColor),
      sunElevationDeg: 2.23,
      environmentIntensity: LIGHTING.environmentIntensity,
      skyIntensity: LIGHTING.skyIntensity,
    },
    fog: {
      groundDensity: FOG.ground.density,
      groundFalloff: FOG.ground.falloff,
      groundSkyBlend: FOG.ground.skyBlend,
      groundTintHex: hex(FOG.ground.tint),
      aerialDensity: FOG.aerial.density,
      aerialFalloff: FOG.aerial.falloff,
      aerialSkyBlend: FOG.aerial.skyBlend,
      maxOpacity: FOG.maxOpacity,
    },
    shade: {
      penumbraBaseDeg: 0.25,
      penumbraPerKmDeg: 0.3,
      ambientFloor: 0.04,
    },
    water: {
      deepColorHex: hex(WATER.deepColor),
      shallowColorHex: hex(WATER.shallowColor),
      roughness: WATER.roughness,
      foamIntensity: WATER.foam.intensity,
    },
    vegetation: {
      windStrength: VEGETATION_LOOK.windStrength,
      translucency: VEGETATION_LOOK.translucency,
      groundAo: VEGETATION_LOOK.groundAo,
    },
    road: {
      wetness: ROAD_WET.wetness,
    },
    city: {
      windowLitFraction: CITY_LOOK.windowLitFraction,
      windowEmissive: CITY_LOOK.windowEmissive,
    },
    postfx: {
      bloomEnabled: POSTFX.bloom.enabled,
      bloomIntensity: POSTFX.bloom.intensity,
      bloomThreshold: POSTFX.bloom.threshold,
      bloomSmoothing: POSTFX.bloom.smoothing,
      vignetteEnabled: POSTFX.vignette.enabled,
      vignetteOffset: POSTFX.vignette.offset,
      vignetteDarkness: POSTFX.vignette.darkness,
      aoEnabled: POSTFX.ao.enabled,
      aoIntensity: POSTFX.ao.intensity,
      aoRadius: POSTFX.ao.aoRadius,
      smaaEnabled: POSTFX.smaa.enabled,
    },
    grading: { ...GRADING },
  };
}

/**
 * Geladenen Look mit der Vorgabe auffüllen.
 *
 * Ein Preset aus einer früheren Sitzung kennt neue Felder nicht. Ohne dieses
 * Auffüllen käme dort `undefined` an, und `undefined` in einer Uniform ist in
 * WebGL kein Fehler, sondern eine schwarze Fläche. Deshalb wird jeder Abschnitt
 * einzeln über die Vorgabe gelegt statt das Objekt als Ganzes zu übernehmen.
 */
export function mergeLook(partial: unknown): LookState {
  const base = defaultLook();
  if (typeof partial !== 'object' || partial === null) return base;

  const source = partial as Record<string, unknown>;
  const section = <K extends keyof LookState>(key: K): void => {
    const value = source[key as string];
    if (typeof value === 'object' && value !== null) {
      base[key] = { ...(base[key] as object), ...(value as object) } as LookState[K];
    }
  };

  if (typeof source.name === 'string') base.name = source.name;
  if (typeof source.exposure === 'number') base.exposure = source.exposure;
  section('lighting');
  section('fog');
  section('shade');
  section('water');
  section('vegetation');
  section('road');
  section('city');
  section('postfx');
  section('grading');

  return base;
}
