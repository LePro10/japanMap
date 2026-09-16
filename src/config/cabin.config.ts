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
 * Unter dem Dach mit 8 cm Luft, über dem Gürtel, hinter der Scheibe.
 * Seitlich mittig: auf 16:9 ist die tote Mitte spielbarer als eine echte
 * Eyellipse, die die A-Säule auf den Apex legt.
 */
export function cockpitEye(spec: VehicleSpec): CockpitSocket {
  const cabin = cabinLayout(spec);
  const cg = spec.chassis.cgHeight;
  const roofLocal = cabin.roof - cg;
  const beltLocal = cabin.belt - cg;
  const y = Math.min(roofLocal - 0.08, beltLocal + 0.38);
  const z = cabin.open ? -0.08 : cabin.glassFront - 0.58;
  return { x: 0, y, z };
}

/**
 * Haubenkamera *auf* dem Blech, vor der Scheibe — nicht im Gewächshaus.
 *
 * 10 cm über dem Gürtel, 18 cm vor der Glasfront. Open-Wheel: über der Nase.
 */
export function hoodCowl(spec: VehicleSpec): CockpitSocket {
  const cabin = cabinLayout(spec);
  const cg = spec.chassis.cgHeight;
  if (cabin.open) {
    return { x: 0, y: 0.62 - cg, z: 0.9 };
  }
  return {
    x: 0,
    y: cabin.belt - cg + 0.1,
    z: cabin.glassFront + 0.18,
  };
}

/** Lenkradnabe relativ zum Auge — vor und unter dem Blick, nicht im Near-Clip. */
export function helmHub(spec: VehicleSpec): CockpitSocket {
  const eye = cockpitEye(spec);
  return { x: eye.x, y: eye.y - 0.22, z: eye.z + 0.36 };
}
