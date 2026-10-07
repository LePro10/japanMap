import { beltHeight } from './engines.config';
import type { VehicleSpec } from './vehicles.config';

/**
 * Kabinenmaße — eine Quelle für Mesh, Haube und Sitzkamera.
 *
 * Die Z-Werte sind dieselben, die `carMesh.ts` für das Glas-Loft benutzt.
 * Wer hier etwas verschiebt, verschiebt Scheibe, Cowl und Eyellipse gemeinsam;
 * drei Kopien davon wären die Sorte Drift, die die Haube wieder ins Blech setzt.
 *
 * Koordinaten vor `−cgHeight`: Y über Grund, Z vorwärts. Nach dem Translate
 * in `carMesh` ist der Ursprung der Schwerpunkt — `cockpitEye` / `hoodCowl`
 * liefern schon diese lokale Form.
 */
export interface CabinLayout {
  readonly belt: number;
  readonly roof: number;
  readonly glassRear: number;
  readonly glassFront: number;
  readonly roofRear: number;
  readonly roofFront: number;
  readonly open: boolean;
}

export interface CockpitSocket {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function cabinLayout(spec: VehicleSpec): CabinLayout {
  const shape = spec.body.shape;
  const L = spec.body.hullLength / 2;
  const belt = beltHeight(spec);
  const roof = spec.body.roofHeight;
  if (shape === 'openwheel') {
    return {
      belt: 0.48,
      roof,
      glassRear: -0.55,
      glassFront: 0.35,
      roofRear: -0.35,
      roofFront: 0.05,
      open: true,
    };
  }
  if (shape === 'truck') {
    return {
      belt,
      roof,
      glassRear: 0.25,
      glassFront: L - 0.12,
      roofRear: 0.47,
      roofFront: L - 0.4,
      open: false,
    };
  }
  if (shape === 'suv') {
    return {
      belt,
      roof,
      glassRear: -L + 0.13,
      glassFront: 0.8,
      roofRear: -L + 0.29,
      roofFront: 0.48,
      open: false,
    };
  }
  if (shape === 'hatch') {
    return {
      belt,
      roof,
      glassRear: -L + 0.12,
      glassFront: 0.81,
      roofRear: -L + 0.29,
      roofFront: 0.36,
      open: false,
    };
  }
  if (shape === 'rally') {
    return {
      belt,
      roof,
      glassRear: -L + 0.16,
      glassFront: 1.02,
      roofRear: -L + 0.47,
      roofFront: 0.36,
      open: false,
    };
  }
  if (shape === 'liftback') {
    return {
      belt,
      roof,
      glassRear: -L + 0.2,
      glassFront: 0.94,
      roofRear: -0.92,
      roofFront: 0.24,
      open: false,
    };
  }
  if (shape === 'fastback') {
    return {
      belt,
      roof,
      glassRear: -L + 0.24,
      glassFront: 1.24,
      roofRear: -0.58,
      roofFront: 0.65,
      open: false,
    };
  }
  if (shape === 'muscle') {
    return {
      belt,
      roof,
      glassRear: -1.64,
      glassFront: 0.53,
      roofRear: -1.03,
      roofFront: -0.08,
      open: false,
    };
  }
  if (shape === 'supercar') {
    return {
      belt,
      roof,
      glassRear: -0.86,
      glassFront: 1.03,
      roofRear: -0.45,
      roofFront: 0.26,
      open: false,
    };
  }
  return {
    belt,
    roof,
    glassRear: -1.3,
    glassFront: 0.94,
    roofRear: -0.86,
    roofFront: 0.3,
    open: false,
  };
}

/**
 * Sitz-Auge im Fahrzeugsystem (Ursprung = Schwerpunkt).
 *
 * Geschlossene Wagen: 14 cm unter dem Dach, 66 cm hinter der Scheibe.
 * Blick leicht nach unten kommt aus `COCKPIT_CAMERA.lookPitch` — dann liegen
 * Lenkrad und Straße im Bild, die Haube ist ein Lackstreifen unten.
 *
 * Open-Wheel: *unter* dem Halo, *hinter* dem vorderen Stiel. Der Stiel auf
 * der Blickachse 16 cm vor dem Auge war die schwarze Wand im Bild (Near-Plane
 * schneidet ein 4-cm-Blech auf 14° Breite). 18 cm unter dem Halo, 40 cm hinter
 * dem Schwerpunkt: Stiel ≥ 55 cm voraus, Nase unten, Räder in den Ecken.
 *
 * Kein Rechtslenker-Versatz. 62° vertikales FOV sind ~94° horizontal, und
 * 30 cm nach rechts legt die rechte A-Säule in die Bildmitte — dasselbe
 * Fehlerbild, nur in der Kabine. Arcade bleibt mittig.
 */
export function cockpitEye(spec: VehicleSpec): CockpitSocket {
  const cabin = cabinLayout(spec);
  const cg = spec.chassis.cgHeight;
  const roofLocal = cabin.roof - cg;
  const beltLocal = cabin.belt - cg;
  if (cabin.open) {
    return { x: 0, y: Math.min(roofLocal - 0.18, 0.54), z: -0.4 };
  }
  const y = Math.min(roofLocal - 0.14, beltLocal + 0.48);
  return { x: 0, y, z: cabin.glassFront - 0.66 };
}

/**
 * Haubenkamera über dem Blech, nicht drauf.
 *
 * 45 cm über dem Gürtel: die Haube ist ein Streifen unten, die Straße der Rest.
 * 10 cm war die Aufnahme, in der man nur Lack gesehen hat.
 */
export function hoodCowl(spec: VehicleSpec): CockpitSocket {
  const cabin = cabinLayout(spec);
  const cg = spec.chassis.cgHeight;
  if (cabin.open) {
    // Über dem Halo, vor dem Überrollbügel — nicht in der Nase.
    return { x: 0, y: cabin.roof - cg + 0.04, z: 0.18 };
  }
  // Dachhöhe an der Scheibe, Blick über die Haube — nicht 45 cm über dem Lack.
  return {
    x: 0,
    y: cabin.roof - cg - 0.08,
    z: cabin.glassFront - 0.02,
  };
}

/**
 * Lenkradnabe — weit und tief, damit man *über* den Kranz schaut.
 *
 * 15 cm / 32 cm hat den vollen Ring um die Bildmitte gelegt (Aufnahme:
 * Tunnel). 42 cm unter dem Auge, 62 cm davor: Kranz oben ~16° unter der
 * Blickachse bei 62° FOV = unteres Viertel, kein Tunnel (Forza-Horizon-Bild).
 *
 * Open-Wheel: der Kranz sitzt näher und höher — ein Formel-Joch, kein Buslenkrad.
 */
export function helmHub(spec: VehicleSpec): CockpitSocket {
  const eye = cockpitEye(spec);
  if (cabinLayout(spec).open) {
    return { x: eye.x, y: eye.y - 0.26, z: eye.z + 0.4 };
  }
  return { x: eye.x, y: eye.y - 0.42, z: eye.z + 0.62 };
}

/**
 * Display in der Armatur, im Lenkradloch. Breite/Höhe sind die Plane, nicht
 * der Kasten darum — der sitzt in `cabinKit`.
 */
export function clusterFace(spec: VehicleSpec): CockpitSocket & { readonly width: number; readonly height: number } {
  const eye = cockpitEye(spec);
  if (cabinLayout(spec).open) {
    return { x: eye.x, y: eye.y - 0.2, z: eye.z + 0.385, width: 0.15, height: 0.075 };
  }
  return { x: 0, y: eye.y - 0.27, z: eye.z + 0.54, width: 0.2, height: 0.1 };
}

/**
 * A-Säulen am Bildrand, nicht in der Mitte.
 *
 * Three.js-FOV ist vertikal. 62° auf 16:9 → halbes Horizontal-FOV ≈ 46,9°.
 * Säulen bei 39° / 0,82 m vor dem Auge: 2–3 cm Blech am Rand, Straße frei.
 * Open-Wheel hat keine Säulen — der Halo-Stiel sitzt weiter vorn und oben.
 */
export function pillarSocket(spec: VehicleSpec): CockpitSocket & { readonly height: number } {
  const eye = cockpitEye(spec);
  const cabin = cabinLayout(spec);
  const cg = spec.chassis.cgHeight;
  const z = eye.z + 0.82;
  const x = Math.tan((41 * Math.PI) / 180) * 0.82;
  const y0 = cabin.belt - cg + 0.04;
  const y1 = Math.min(cabin.roof - cg - 0.04, eye.y + 0.34);
  return { x, y: (y0 + y1) / 2, z, height: Math.max(0.28, y1 - y0) };
}
