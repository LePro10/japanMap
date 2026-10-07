import type { WebGLRenderer } from 'three';

import { DEFAULT_QUALITY, type QualityLevel } from '@/config/quality.config';

/**
 * Grobe Vorabschätzung des Geräts — PLAN.md P8.3.
 *
 * ## Das Problem
 *
 * Die Ersteinstufung misst von `DEFAULT_QUALITY` aus und stuft herunter, bis
 * die Bildrate hält. Das ist die richtige Richtung — heruntergestuft wird
 * gemessen, hochgestuft nie —, aber der falsche **Startpunkt**: bis die erste
 * Runde entschieden ist, liegen 30 Aufwärm- plus 60 Messframes auf Ultra
 * hinter dem Gerät. Auf genau der Hardware, für die es diese Messung gibt, sind
 * das mehrere Sekunden unter Vollast; im schlechtesten Fall verliert der
 * Browser den Kontext, bevor die Einstufung ihr Ergebnis hat.
 *
 * ## Was das hier ist — und was nicht
 *
 * Es ist eine **Startstufe**, kein Urteil. Der Benchmark läuft unverändert
 * weiter und kann von hier aus beliebig tief gehen. Falsch geraten heißt
 * deshalb: eine Runde mehr oder ein etwas schlechteres Bild, bis jemand von
 * Hand hochschaltet — nicht ein falsches Ergebnis.
 *
 * Große Titel pflegen dafür Gerätedatenbanken mit tausenden Einträgen. Das ist
 * hier weder machbar noch nötig, und der Versuch wäre schädlich: eine Liste,
 * die nicht gepflegt wird, altert zu einer Sammlung falscher Zusagen. Die vier
 * Signale unten sind bewusst grob.
 *
 * ## Warum die GPU-Zeichenkette die anderen Signale schlägt
 *
 * **Gemessen auf der Entwicklungsmaschine dieses Projekts**, und der Fall ist
 * genau der Grund für die Reihenfolge:
 *
 * | Signal | Wert |
 * |---|---|
 * | `hardwareConcurrency` | 16 |
 * | `deviceMemory` | 8 |
 * | `pointer: coarse` | nein |
 * | GPU | `ANGLE (Microsoft, Microsoft Basic Render Driver … D3D11)` |
 *
 * Die ersten drei sagen „starke Maschine", und das stimmt sogar — für die CPU.
 * Gerendert wird trotzdem im **Software-Rasterisierer**, und ein Frame kostet
 * dort rund 170 ms. Wer Kerne und Speicher zuerst fragt, bekommt hier die
 * teuerste Stufe auf dem langsamsten Renderer.
 *
 * ## Die Zeichenkette ist nur über die Erweiterung zu bekommen
 *
 * `gl.getParameter(gl.RENDERER)` liefert in Chrome `"WebKit WebGL"` — eine
 * Konstante ohne jeden Informationsgehalt. Erst
 * `WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL` nennt die GPU. Fehlt die
 * Erweiterung (manche Browser blenden sie zur Fingerabdruck-Abwehr aus), fällt
 * die Schätzung auf die übrigen Signale zurück — deshalb steht sie nicht als
 * einzige da.
 */

/** Zeichenketten, die einen Software-Rasterisierer verraten. */
const SOFTWARE = /swiftshader|basic render|llvmpipe|softpipe|software|mesa offscreen/i;

export interface DeviceEstimate {
  /** Stufe, auf der die Einstufung anfangen soll. */
  readonly level: QualityLevel;
  /** Ein Satz für Konsole und Debug-Panel. Wird angezeigt, nicht ausgewertet. */
  readonly reason: string;
  readonly gpu: string | null;
  readonly cores: number;
  readonly memory: number | null;
  readonly touch: boolean;
}

/**
 * Der Renderer wird **übergeben**, nicht selbst erzeugt.
 *
 * Ein eigener Kontext nur für die Abfrage kostet auf schwacher Hardware
 * messbar, und einige Browser begrenzen die Zahl gleichzeitiger WebGL-Kontexte
 * — den ältesten zu verlieren, während die Anwendung ihn benutzt, wäre ein
 * teurer Preis für eine Schätzung.
 */
export function estimateDevice(renderer: WebGLRenderer): DeviceEstimate {
  const gpu = readGpu(renderer);
  const cores = navigator.hardwareConcurrency || 0;
  // `deviceMemory` gibt es nur in Chromium. `null` heißt „unbekannt", nicht
  // „wenig" — sonst stufte jeder Firefox sich selbst herunter.
  const memory = readMemory();
  const touch = matchMedia('(pointer: coarse)').matches;

  const base = { gpu, cores, memory, touch };

  if (gpu && SOFTWARE.test(gpu)) {
    return { ...base, level: 'minimal', reason: `Software-Rasterisierer erkannt (${gpu})` };
  }

  // Ein Touch-Gerät ist kein Beweis für eine schwache GPU — ein iPad Pro
  // rendert mehr als so mancher Laptop. Es ist aber ein Hinweis auf ein
  // Wärmebudget, und die Einstufung darf sich hier gern irren: sie irrt nach
  // unten, und der Benchmark hebt das nicht wieder an.
  if (touch) {
    return { ...base, level: 'medium', reason: 'Touch-Gerät — vorsichtiger Start' };
  }

  if (cores > 0 && cores <= 4) {
    return { ...base, level: 'medium', reason: `nur ${cores} Kerne` };
  }
  if (memory !== null && memory <= 4) {
    return { ...base, level: 'medium', reason: `nur ${memory} GB Speicher` };
  }

  return { ...base, level: DEFAULT_QUALITY, reason: 'kein Warnsignal — Start auf der höchsten Stufe' };
}

function readGpu(renderer: WebGLRenderer): string | null {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (!info) return null;
    const value: unknown = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    return typeof value === 'string' ? value : null;
  } catch {
    // Die Erweiterung ist optional und in manchen Browsern hinter einer
    // Einstellung. Ein Fehler hier darf den Start nicht kosten.
    return null;
  }
}

function readMemory(): number | null {
  // `navigator.deviceMemory` steht nicht in der DOM-Typdefinition, weil es kein
  // Standard ist. Der Zugriff ist deshalb eine bewusste Ausnahme von „kein
  // any" — geprüft wird der Laufzeittyp direkt darunter.
  const value = (navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;
  return typeof value === 'number' && value > 0 ? value : null;
}
