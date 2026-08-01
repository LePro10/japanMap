import type { Mesh, Object3D } from 'three';
import { BackSide, DoubleSide } from 'three';

/**
 * Wickelprüfung — P8.11.
 *
 * **Warum es dieses Werkzeug gibt.** Zwei Flächen dieser Karte waren
 * rückseitig gewickelt und damit unsichtbar, ohne dass irgendeine Zahl es
 * gemeldet hätte:
 *
 * | Fläche | gefunden | Folge |
 * |---|---|---|
 * | Flussband (`riverGeometry.ts`) | P8.11 | der Fluss war nie im Bild — P8.6 hatte daraus auf ein Farbproblem geschlossen |
 * | Schürze des Stadtbodens (`CityGenerator.ts`) | P8.11 | 240 von 242 Dreiecken; der Distrikt stand auf einer Kante statt auf einem Übergang |
 *
 * Beide Male stimmten Draw-Calls, Dreiecke, Bounding-Box und Uniforms. Beide
 * Male zeigte das **Normal-Attribut nach oben** — es wird ja von Hand gesetzt —
 * und nur die Wickelrichtung war falsch. Genau deshalb ist die Prüfung hier
 * eine eigene Funktion und kein Kommentar: sie vergleicht nicht Absicht mit
 * Absicht, sondern **Wickelrichtung mit Normal-Attribut**.
 *
 * Ein Dreieck gilt als gegenläufig, wenn das Kreuzprodukt seiner Kanten dem
 * Normal-Attribut seines ersten Vertex entgegenzeigt. Fast senkrechte Fälle
 * (|cos| < 0,2) werden übersprungen: dort ist die Aussage nicht belastbar, und
 * eine Wand, die um 90° danebenliegt, ist ein anderer Fehler.
 *
 * **Ein Anteil über 50 % bei `FrontSide` ist ein Befund**, kein Rauschen.
 * Organische Fremdmodelle mit geglätteten Normalen liegen gemessen bei 0,7…5,6 %
 * (Felsen aus der Pipeline); alles darunter ist normal.
 */
export interface WindingRow {
  readonly name: string;
  readonly material: string;
  /** `THREE.FrontSide` = 0, `BackSide` = 1, `DoubleSide` = 2. */
  readonly side: number;
  readonly triangles: number;
  readonly sampled: number;
  /** Anteil gegenläufiger Dreiecke in Prozent. */
  readonly opposed: number;
  /** Nur bei `FrontSide` und hohem Anteil: dann ist die Fläche unsichtbar. */
  readonly suspicious: boolean;
}

/** Ab diesem Anteil gilt eine einseitige Fläche als falsch gewickelt. */
const SUSPICIOUS = 50;

/** Höchstens so viele Dreiecke je Mesh — die Prüfung läuft über die ganze Szene. */
const MAX_SAMPLES = 400;

export function checkWinding(root: Object3D): WindingRow[] {
  const rows: WindingRow[] = [];

  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    if (!position || !normal) return;

    const index = geometry.index;
    const triangles = (index ? index.count : position.count) / 3;
    if (triangles < 1) return;

    const at = (k: number): number => (index ? index.getX(k) : k);
    const step = Math.max(1, Math.floor(triangles / MAX_SAMPLES));

    let opposed = 0;
    let sampled = 0;

    for (let t = 0; t < triangles; t += step) {
      const i0 = at(t * 3);
      const i1 = at(t * 3 + 1);
      const i2 = at(t * 3 + 2);

      const ax = position.getX(i0);
      const ay = position.getY(i0);
      const az = position.getZ(i0);
      const e1x = position.getX(i1) - ax;
      const e1y = position.getY(i1) - ay;
      const e1z = position.getZ(i1) - az;
      const e2x = position.getX(i2) - ax;
      const e2y = position.getY(i2) - ay;
      const e2z = position.getZ(i2) - az;

      const fx = e1y * e2z - e1z * e2y;
      const fy = e1z * e2x - e1x * e2z;
      const fz = e1x * e2y - e1y * e2x;
      const length = Math.hypot(fx, fy, fz);
      if (length < 1e-9) continue;

      const cos =
        (fx * normal.getX(i0) + fy * normal.getY(i0) + fz * normal.getZ(i0)) / length;
      // Fast senkrecht: das Normal-Attribut sagt hier nichts über die Wicklung.
      if (Math.abs(cos) < 0.2) continue;

      sampled++;
      if (cos < 0) opposed++;
    }

    if (sampled === 0) return;

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const side = material?.side ?? 0;
    const share = (opposed / sampled) * 100;

    rows.push({
      name: mesh.name || '(ohne Namen)',
      material: material?.name || material?.type || '—',
      side,
      triangles,
      sampled,
      opposed: Math.round(share * 10) / 10,
      // Bei `DoubleSide` und `BackSide` ist eine verdrehte Wicklung folgenlos
      // für die Sichtbarkeit — sie bleibt eine Auffälligkeit, kein Fehler.
      suspicious: share >= SUSPICIOUS && side !== DoubleSide && side !== BackSide,
    });
  });

  return rows.sort((a, b) => b.opposed - a.opposed);
}
