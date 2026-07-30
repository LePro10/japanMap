import { Vector3 } from 'three';

/**
 * Benannte Blickpunkte — nur im Dev-Build.
 *
 * Die Abnahme dieses Projekts läuft über Bilder und Zahlen, die aus einem
 * laufenden Renderer kommen (CLAUDE.md, „Bevor etwas fertig heißt"). Beides ist
 * nur dann eine Messung, wenn der Standpunkt reproduzierbar ist: eine
 * Draw-Call-Zahl gilt an einem Ort, nicht an der Karte, und ein Vorher/Nachher
 * an zwei verschiedenen Stellen misst die Kamera statt die Änderung.
 *
 * Bis P5 wurde von Hand hingeflogen. Diese Tabelle ersetzt das durch
 * `japanMap.view('stadt')`.
 */
export interface Viewpoint {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly note?: string;
}

export const VIEWPOINTS: Readonly<Record<string, Viewpoint>> = {
  start: {
    position: [620, 330, 1010],
    lookAt: [-700, 140, -720],
    note: 'Der Startblick über die ganze Karte auf das Massiv.',
  },
  stadt: {
    position: [960, 96, 480],
    lookAt: [620, 34, 120],
    note: 'Die Stadt von der Ringstraße aus, südöstlich — der Blick der Phase.',
  },
  'stadt-strasse': {
    position: [620, 32, 268],
    lookAt: [620, 40, 60],
    note: 'Auf der Stadtstraße, Augenhöhe. Hier muss das Neon im Asphalt stehen.',
  },
  'stadt-luft': {
    position: [620, 420, 620],
    lookAt: [620, 30, 120],
    note: 'Senkrecht über dem Distrikt — Blockraster und Straßenzug.',
  },
  'stadt-fern': {
    position: [1500, 260, 900],
    lookAt: [620, 40, 120],
    note: 'Aus 1,2 km: taugt die Silhouette?',
  },
  pass: {
    position: [-700, 300, -700],
    lookAt: [-880, 400, -1200],
    note: 'Der Bergpass mit seinen Kehren.',
  },
  tempel: {
    position: [820, 200, -700],
    lookAt: [820, 150, -940],
    note: 'Die Tempelanlage im Nordosten.',
  },
  reisfeld: {
    position: [-760, 120, 400],
    lookAt: [-760, 22, 60],
    note: 'Die Reisfeld-Terrassen im Westen.',
  },
  kueste: {
    position: [200, 90, 1100],
    lookAt: [100, 0, 1400],
    note: 'Südküste mit Wellenbrecher und Steg.',
  },
};

export interface CameraPlacer {
  placeAt(position: Vector3, lookAt: Vector3): void;
}

/**
 * Blickpunkt anfliegen — benannt oder frei.
 *
 * Die freie Form (`{ position, lookAt }`) ist beim Suchen da: solange ein
 * Blickpunkt noch nicht feststeht, wäre jede Probe sonst ein Neustart des
 * Dev-Servers, weil auf einem SMB-Mount kein Datei-Watcher läuft. Was sich
 * bewährt, wandert danach in die Tabelle und wird damit reproduzierbar.
 */
export function applyViewpoint(camera: CameraPlacer, target: string | Viewpoint): string {
  const point = typeof target === 'string' ? VIEWPOINTS[target] : target;
  if (!point) {
    return `Unbekannter Blickpunkt „${String(target)}". Bekannt: ${Object.keys(VIEWPOINTS).join(', ')}`;
  }
  camera.placeAt(new Vector3(...point.position), new Vector3(...point.lookAt));
  return `${typeof target === 'string' ? target : 'frei'} — ${point.note ?? ''}`;
}
