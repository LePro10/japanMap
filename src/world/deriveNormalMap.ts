import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';

import type { TerrainSampler } from './TerrainSampler';

/**
 * Die Geländenormalen aus dem Höhenfeld rechnen, statt sie zu laden — P15.3.
 *
 * ## Warum
 *
 * `normal.png` ist mit **5,49 MB** der zweitgrößte Posten des Startdownloads
 * (gemessen am 2026-08-18, Port 4180). Sein Inhalt ist vollständig aus
 * `height.r16` ableitbar, und `height.r16` wird ohnehin geladen — es ist
 * Weltdatum und trägt den Boden, auf dem das Fahrzeug steht. Zwei Dateien, ein
 * Informationsgehalt.
 *
 * Das ist der beste Posten der ganzen Liste: er kostet **kein** Detail. Alle
 * anderen Hebel dieser Phase tauschen Bytes gegen Bildgüte; dieser tauscht
 * Bytes gegen Rechenzeit.
 *
 * ## Dieselbe Rechnung wie im Baker, Zeichen für Zeichen
 *
 * `tools/bake-terrain.mjs · computeNormals()` bildet einen Sobel-Operator über
 * die 8er-Nachbarschaft, setzt `n = normalize(-dh/dx, 1, -dh/dz)` und legt das
 * Ergebnis als `rgb8-world-normal` ab. Genau das steht unten noch einmal — und
 * das ist eine **Doppelung mit Absicht**: die Alternative wäre, den Baker aus
 * dem Browser zu importieren (`tools/*.mjs` ist reines Node-ESM, siehe
 * CLAUDE.md) oder die Formel in ein drittes Modul zu ziehen, das dann keiner
 * von beiden mehr besitzt. Wer eine der beiden Stellen ändert, ändert die
 * andere mit — deshalb steht dieser Absatz hier.
 *
 * ## Der eine Unterschied, und er ist gemessen
 *
 * Der Baker rechnet auf seinem **Fließkomma**-Höhenfeld, hier steht nur die
 * auf 16 bit quantisierte Fassung zur Verfügung. Bei 490 m Höhenbereich über
 * 65535 Stufen sind das 0,0075 m je Stufe, auf 1,5 m Texelabstand also ein
 * Gradientenfehler von rund 0,005 — knapp 0,3° Neigung im ungünstigsten Fall.
 *
 * **Das ist eine Bildänderung und keine Größenänderung**, und PLAN.md P10 führt
 * genau diese Verwechslung als Risiko. Die Zahl dazu steht in P15.6; sie ist
 * gegen ein Rauschband gemessen und nicht geschätzt.
 *
 * ## Warum RGBA und nicht RGB
 *
 * `RGBFormat` gibt es in three seit r137 nicht mehr, und WebGL2 richtet
 * Texturzeilen ohnehin auf 4 Byte aus — ein dreikanaliger Upload würde intern
 * aufgefüllt. Der vierte Kanal kostet 4 MB Texturspeicher und **null** Bytes
 * über das Netz, was der ganze Punkt dieser Datei ist.
 */
export interface DerivedNormalMap {
  readonly texture: DataTexture;
  /** Reine Rechenzeit in ms — Messgröße für P15.6, nicht Kosmetik. */
  readonly millis: number;
}

/**
 * `anisotropy` wird **übergeben**, weil die geladene `normal.png` ihn von
 * `ResourceManager.texture()` bekam (dort `getMaxAnisotropy()` als
 * Voreinstellung). Ihn hier wegzulassen wäre eine zweite Änderung im selben
 * Messschritt — und dieses Projekt hat sich schon einmal eine Wirkung
 * zugeschrieben, die von einem anderen Regler kam.
 */
export function deriveNormalMap(sampler: TerrainSampler, anisotropy: number): DerivedNormalMap {
  const started = performance.now();

  const res = sampler.meta.heightmap.res;
  const spacing = sampler.meta.heightmap.spacing;
  const raw = sampler.raw;
  // Nur der Maßstab, nicht der Nullpunkt: `minHeight` kürzt sich in jeder
  // Differenz heraus. Ihn trotzdem zu addieren wäre 4 Millionen mal umsonst.
  const scale = sampler.meta.heightmap.heightRange / 65535;

  const data = new Uint8Array(res * res * 4);
  const last = res - 1;

  for (let y = 0; y < res; y++) {
    // Die Zeilenklemmung steht **außerhalb** der x-Schleife: sie hängt nicht
    // von x ab, und innen gerechnet wäre sie 2048-mal je Zeile derselbe Wert.
    const rowUp = (y > 0 ? y - 1 : 0) * res;
    const rowMid = y * res;
    const rowDown = (y < last ? y + 1 : last) * res;

    for (let x = 0; x < res; x++) {
      const xl = x > 0 ? x - 1 : 0;
      const xr = x < last ? x + 1 : last;

      const tl = raw[rowUp + xl]!;
      const t = raw[rowUp + x]!;
      const tr = raw[rowUp + xr]!;
      const l = raw[rowMid + xl]!;
      const r = raw[rowMid + xr]!;
      const bl = raw[rowDown + xl]!;
      const b = raw[rowDown + x]!;
      const br = raw[rowDown + xr]!;

      // Sobel, wie im Baker. Der Faktor `scale` wandelt die 16-bit-Stufen in
      // Meter — ohne ihn wäre die Neigung um Faktor 130 zu groß und das ganze
      // Gelände sähe aus wie zerknittertes Papier.
      const dhdx = ((tr + 2 * r + br - (tl + 2 * l + bl)) * scale) / (8 * spacing);
      const dhdz = ((bl + 2 * b + br - (tl + 2 * t + tr)) * scale) / (8 * spacing);

      let nx = -dhdx;
      let ny = 1;
      let nz = -dhdz;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;

      const o = (rowMid + x) * 4;
      data[o] = (nx * 0.5 + 0.5) * 255 + 0.5;
      data[o + 1] = (ny * 0.5 + 0.5) * 255 + 0.5;
      data[o + 2] = (nz * 0.5 + 0.5) * 255 + 0.5;
      data[o + 3] = 255;
    }
  }

  const texture = new DataTexture(data, res, res, RGBAFormat, UnsignedByteType);
  texture.colorSpace = NoColorSpace;
  // `flipY` ist bei `DataTexture` von Haus aus `false`, und genau das wird hier
  // gebraucht: die Zeilen liegen wie in `height.r16` von Nord (−Z) nach Süd,
  // und der Shader liest sie mit `v = (z + half) / size`. Die geladene
  // `normal.png` stand aus demselben Grund auf `flipY: false` — wer das hier
  // umstellt, bekommt Fels am Wasser und Strand im Gebirge.
  // Filter und Anisotropie **wie die geladene Datei**: `ResourceManager.texture()`
  // ließ three seine Voreinstellungen (Mipmap-Kette, lineare Filterung) und
  // setzte `anisotropy` auf das Maximum der Karte. Hier etwas anderes zu wählen
  // hieße, in einer Messung über den Wegfall einer Datei zusätzlich die
  // Filterung zu ändern — und hinterher nicht zu wissen, welche der beiden
  // Änderungen man sieht.
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.name = 'TerrainNormal:abgeleitet';
  texture.needsUpdate = true;

  return { texture, millis: performance.now() - started };
}
