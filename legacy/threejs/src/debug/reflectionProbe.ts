import { Raycaster, Vector2, Vector3, type Camera, type Object3D, type Scene } from 'three';

/**
 * Die Messung, die PLAN.md P6 / 6.5 entscheidet — nur im Dev-Build.
 *
 * ## Warum überhaupt gemessen wird
 *
 * PLAN.md stellt drei Wege gegeneinander (SSR, planare Reflexion, Probes) und
 * gibt als Entscheidungsregel „zwei Tage SSR tunen, dann sehen, ob Rauschen
 * oder Ghosting bleibt". Das ist eine Regel über *Aufwand*, keine über eine
 * Eigenschaft — und sie geht an der Frage vorbei, die den Ausschlag gibt.
 *
 * Screen-Space-Reflexionen können ausschließlich zeigen, was **schon im Bild
 * steht**. Was hinter der Kamera liegt, außerhalb des Bildrands oder von etwas
 * anderem verdeckt wird, kann SSR nicht finden; es kann nur raten. Bei einer
 * Straßenszene ist das der Regelfall und nicht die Ausnahme: die Kamera steht
 * tief und schaut nach vorn, gespiegelt wird aber das, was **über** ihr ist —
 * Fassaden, Schilder, Himmel.
 *
 * Genau dieser Anteil ist messbar, und zwar ohne SSR zu implementieren:
 *
 *  1. Für ein Raster von Bildpunkten wird der Sehstrahl auf den nassen Asphalt
 *     geschossen.
 *  2. Am Treffer wird der Strahl an der Fläche gespiegelt.
 *  3. Der gespiegelte Strahl wird gegen die Stadt geschossen. Trifft er nichts,
 *     zeigt die Pfütze Himmel — den liefert die Umgebungskarte, und zwar
 *     richtig; dieser Fall zählt nicht als Verlust.
 *  4. Trifft er etwas, wird der Trefferpunkt in die Kamera zurückprojiziert.
 *     Liegt er außerhalb des Bildes oder ist er verdeckt, **kann SSR ihn nicht
 *     kennen**.
 *
 * Das Ergebnis ist eine Zahl, kein Eindruck, und es ist an jeder Stelle der
 * Karte reproduzierbar: `japanMap.reflectionProbe()`.
 */

export interface ReflectionProbeResult {
  /** Wie viele Sehstrahlen überhaupt auf einer spiegelnden Fläche landeten. */
  readonly onSurface: number;
  /** Davon: der gespiegelte Strahl verlässt die Szene (Himmel). */
  readonly toSky: number;
  /** Davon: er trifft Geometrie. */
  readonly toGeometry: number;
  /** Von den Geometrie-Treffern: im Bild **und** unverdeckt, also SSR-fähig. */
  readonly resolvable: number;
  /** Außerhalb des Bildrands. */
  readonly offScreen: number;
  /** Im Bild, aber verdeckt. */
  readonly occluded: number;
  /** Anteil der Geometrie-Treffer, die SSR finden könnte, in Prozent. */
  readonly ssrCoverage: number;
  /** Mittlere Höhe der gespiegelten Trefferpunkte über der Fläche, in Metern. */
  readonly meanHitHeight: number;
}

interface ProbeInput {
  readonly scene: Scene;
  readonly camera: Camera;
  /** Namen der Objekte, die als spiegelnde Fläche gelten. */
  readonly surfaces: readonly string[];
  /** Namen der Gruppen, deren Inhalt gespiegelt werden soll. */
  readonly reflected: readonly string[];
  /** Raster: so viele Proben je Achse in der unteren Bildhälfte. */
  readonly grid?: number;
}

function collect(scene: Scene, names: readonly string[]): Object3D[] {
  const found: Object3D[] = [];
  for (const name of names) {
    const object = scene.getObjectByName(name);
    if (object) found.push(object);
  }
  return found;
}

export function reflectionProbe(input: ProbeInput): ReflectionProbeResult {
  const grid = input.grid ?? 24;
  const surfaces = collect(input.scene, input.surfaces);
  const reflected = collect(input.scene, input.reflected);

  const caster = new Raycaster();
  const pointer = new Vector2();
  const normal = new Vector3(0, 1, 0);
  const reflectedDir = new Vector3();
  const origin = new Vector3();
  const projected = new Vector3();
  const toHit = new Vector3();

  let onSurface = 0;
  let toSky = 0;
  let toGeometry = 0;
  let resolvable = 0;
  let offScreen = 0;
  let occluded = 0;
  let heightSum = 0;

  for (let iy = 0; iy < grid; iy++) {
    // Nur die untere Bildhälfte: darüber liegt kein Boden.
    const ndcY = -0.95 + (0.9 * iy) / (grid - 1);
    for (let ix = 0; ix < grid; ix++) {
      const ndcX = -0.95 + (1.9 * ix) / (grid - 1);
      pointer.set(ndcX, ndcY);
      caster.setFromCamera(pointer, input.camera);

      const surfaceHits = caster.intersectObjects(surfaces, true);
      const surfaceHit = surfaceHits[0];
      if (!surfaceHit) continue;
      onSurface++;

      // Spiegelung an der waagerechten Fläche. Die Stadtplatte **ist** eine
      // Ebene — das ist keine Näherung, sondern eine Zusage aus 6.1.
      reflectedDir.copy(caster.ray.direction).reflect(normal).normalize();
      origin.copy(surfaceHit.point).addScaledVector(reflectedDir, 0.02);

      caster.set(origin, reflectedDir);
      const mirrorHits = caster.intersectObjects(reflected, true);
      const mirrorHit = mirrorHits[0];
      if (!mirrorHit) {
        toSky++;
        continue;
      }
      toGeometry++;
      heightSum += mirrorHit.point.y - surfaceHit.point.y;

      projected.copy(mirrorHit.point).project(input.camera);
      if (
        projected.x < -1 ||
        projected.x > 1 ||
        projected.y < -1 ||
        projected.y > 1 ||
        projected.z > 1
      ) {
        offScreen++;
        continue;
      }

      // Im Bild — aber sieht die Kamera ihn auch? Ein Schild an einer Fassade
      // kann in der Pfütze stehen und zugleich hinter dem Haus davor liegen.
      toHit.copy(mirrorHit.point).sub(input.camera.position);
      const distance = toHit.length();
      caster.set(input.camera.position, toHit.normalize());
      const direct = caster.intersectObject(input.scene, true);
      const first = direct.find((hit) => hit.distance > 0.05);
      if (first && first.distance < distance - 0.25) {
        occluded++;
        continue;
      }
      resolvable++;
    }
  }

  return {
    onSurface,
    toSky,
    toGeometry,
    resolvable,
    offScreen,
    occluded,
    ssrCoverage: toGeometry > 0 ? Number(((resolvable / toGeometry) * 100).toFixed(1)) : 0,
    meanHitHeight: toGeometry > 0 ? Number((heightSum / toGeometry).toFixed(1)) : 0,
  };
}
