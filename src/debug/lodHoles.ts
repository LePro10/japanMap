import { Color, Vector3, Vector4, NoToneMapping, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';

import { VIEWPOINTS } from './viewpoints';

/**
 * Lochzählung im Terrain-Gitter — die Abnahmemessung zu P4 / 4.1 und P8.1.
 *
 * ## Warum gezählt und nicht hingesehen wird
 *
 * Ein Riss zwischen zwei LOD-Stufen ist im laufenden Bild fast unsichtbar: er
 * ist einen Pixel breit, steht an einer Kante, an der ohnehin ein Kontrast
 * liegt, und er blitzt nur auf, während die Kamera durch den Stufenbereich
 * fährt. P4 hat das Verfahren deshalb so festgelegt: alles außer dem Gelände
 * ausblenden, den Himmel auf **Magenta** setzen und je Spalte die Himmelspixel
 * *unterhalb* des obersten Geländepixels zählen. Jedes davon ist ein Loch —
 * durch das Gelände hindurch ist Hintergrund zu sehen, wo Gelände sein müsste.
 *
 * Magenta und keine andere Farbe, weil es in der Palette dieser Karte nicht
 * vorkommt: Fels, Gras, Sand und Reisfeld liegen alle im Grün-Braun-Grau, und
 * die einzigen magentanahen Töne der Szene (Neon, `city.config.ts`) sind
 * ausgeblendet.
 *
 * ## Was die Messung nicht kann
 *
 * Sie findet **Löcher**, keine Sprünge. Ein Knoten, der beim Stufenwechsel
 * ruckt, statt zu morphen, hinterlässt kein Himmelspixel — dafür ist der
 * Debug-Blick „Morph-Faktor" da. Beides zusammen ist die Abnahme, nicht eines
 * davon.
 *
 * ## Was als Loch zählt — und was nicht
 *
 * Gezählt wird Himmel **eingeschlossen zwischen Gelände**: ein Pixel gilt nur
 * dann als Loch, wenn in derselben Spalte oberhalb *und* unterhalb Gelände
 * steht. Der erste Anlauf zählte stattdessen alles unterhalb des obersten
 * Geländepixels, und das war aus zwei Gründen falsch:
 *
 *  - **Der Rand der Welt.** Sie ist 3072 m im Quadrat; von `kueste` oder
 *    `start` aus schaut man darüber hinaus, und dort steht bis zum unteren
 *    Bildrand Hintergrund. Gemessen wurden so 354 117 „Löcher" allein bei
 *    `start`.
 *  - **Echter Himmel.** Bei 22° Kippung und 60° Blickfeld liegt die
 *    Bildoberkante noch 8° *über* dem Horizont.
 *
 * Beides ist kein Riss, sondern das Ende des Geländes — und beides hat unten
 * kein Gelände unter sich. Die Einschließung trennt das sauber, und sie tut es
 * unabhängig davon, wie die Kamera steht.
 *
 * ## Warum die Kamera trotzdem gekippt wird
 *
 * Damit überhaupt Gelände im Bild steht. Gekippt wird um einen **festen**
 * Winkel und nicht „bis es passt": sonst misst ein Vorher/Nachher die
 * Kameraführung statt die Geometrie.
 */
const PITCH_DEG = 30;

/** Reinmagenta. In der Geländepalette kommt es nicht vor. */
const SKY = 0xff00ff;

export interface HoleCount {
  /** Name des Blickpunkts. */
  blick: string;
  /** Himmelspixel unterhalb der Geländesilhouette. Muss 0 oder 1 sein. */
  loecher: number;
  /** Spalten, in denen mindestens eines davon steht. */
  spalten: number;
  /** Spalten ohne jedes Geländepixel — dort ist die Messung blind. */
  leer: number;
}

export interface HoleReport {
  gitter: number;
  gesamt: number;
  schlimmster: HoleCount;
  proBlick: HoleCount[];
}

export interface HoleOptions {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Stützstellen pro Achse, nur für den Bericht. */
  readonly gridVertices: number;
  /**
   * Ein vollständiger Frame der Anwendung — **vor** jedem eigenen Render.
   *
   * Ohne diesen Aufruf misst die Zählung Unsinn, und zwar plausibel aussehenden:
   * die Knotenauswahl des Quadtrees läuft im `update()` des `TerrainSystem`,
   * nicht beim Zeichnen. Ein direktes `renderer.render()` nach einem
   * Kamerasprung zeichnet deshalb die Auswahl der **vorherigen** Kameraposition
   * — samt deren Frustum-Culling. Im ersten Anlauf sah das Ergebnis aus wie ein
   * halb leeres Bild mit Treppenkanten; die Treppen waren Knotengrenzen, und
   * die Zählung meldete 2 921 783 Löcher, wo P4 eines gemessen hatte.
   */
  readonly tick: () => void;
  /** Objekt, das sichtbar bleibt. Alles andere wird ausgeblendet. */
  readonly keep?: string;
  readonly viewpoints?: readonly string[];
}

export function countLodHoles(options: HoleOptions): HoleReport {
  const { renderer, scene, camera } = options;
  const keep = options.keep ?? 'Terrain';
  const names = options.viewpoints ?? Object.keys(VIEWPOINTS);

  // ── Zustand sichern ───────────────────────────────────────────────────────
  // Vollständig, und der Viewport ausdrücklich mit. `setRenderTarget(null)`
  // stellt in three den **Renderer**-Viewport wieder her, nicht die
  // Canvas-Größe — ein hier vergessener Viewport hat in P6 alle 64 Messbilder
  // der Phase beschnitten, ohne dass eine Zahl falsch abgelesen war.
  const previousTarget = renderer.getRenderTarget();
  const previousViewport = renderer.getViewport(new Vector4());
  const previousToneMapping = renderer.toneMapping;
  const previousBackground = scene.background;
  const previousPosition = camera.position.clone();
  const previousQuaternion = camera.quaternion.clone();

  const hidden: Object3D[] = [];
  for (const child of scene.children) {
    if (child.name === keep || !child.visible) continue;
    child.visible = false;
    hidden.push(child);
  }

  // Ohne das komprimiert AgX das Magenta und die Schwellen unten greifen
  // daneben — derselbe Grund wie beim Imposter-Bake.
  renderer.toneMapping = NoToneMapping;
  scene.background = new Color(SKY);
  renderer.setRenderTarget(null);

  const gl = renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);

  const target = new Vector3();
  const proBlick: HoleCount[] = [];

  try {
    for (const name of names) {
      const point = VIEWPOINTS[name];
      if (!point) continue;

      camera.position.set(...point.position);
      target.set(...point.lookAt);
      // Blickrichtung waagerecht nehmen und um einen festen Winkel senken.
      const dx = target.x - camera.position.x;
      const dz = target.z - camera.position.z;
      const horizontal = Math.hypot(dx, dz);
      target.y = camera.position.y - horizontal * Math.tan((PITCH_DEG * Math.PI) / 180);
      camera.lookAt(target);
      camera.updateMatrixWorld();

      // Erst die Anwendung einen Frame rechnen lassen — sie wählt dabei die
      // Quadtree-Knoten für *diese* Kamera aus. Siehe `tick` oben.
      options.tick();

      // `tick()` hinterlässt Render-Ziel und Viewport der PostFX-Kette.
      renderer.setRenderTarget(null);
      renderer.setViewport(previousViewport);
      renderer.render(scene, camera);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      proBlick.push({ blick: name, ...count(pixels, width, height) });
    }
  } finally {
    for (const child of hidden) child.visible = true;
    scene.background = previousBackground;
    renderer.toneMapping = previousToneMapping;
    renderer.setViewport(previousViewport);
    renderer.setRenderTarget(previousTarget);
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousQuaternion);
    camera.updateMatrixWorld();
  }

  const leer: HoleCount = { blick: '—', loecher: 0, spalten: 0, leer: 0 };
  return {
    gitter: options.gridVertices,
    gesamt: proBlick.reduce((sum, entry) => sum + entry.loecher, 0),
    schlimmster: proBlick.reduce((worst, entry) => (entry.loecher > worst.loecher ? entry : worst), leer),
    proBlick,
  };
}

/**
 * Himmelspixel **zwischen** dem obersten und dem untersten Geländepixel einer
 * Spalte.
 *
 * `readPixels` liefert die unterste Zeile zuerst; „oben" ist deshalb der größte
 * Zeilenindex. Wer die Richtung verwechselt, bekommt in jeder Spalte ein
 * Ergebnis, das plausibel aussieht und nichts bedeutet — dieselbe Umkehr, die
 * in `main.ts` bei `shot()` das Gelände auf den Kopf stellt.
 */
function count(
  pixels: Uint8Array,
  width: number,
  height: number,
): { loecher: number; spalten: number; leer: number } {
  const isSky = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4;
    return (pixels[i] ?? 0) > 200 && (pixels[i + 1] ?? 0) < 60 && (pixels[i + 2] ?? 0) > 200;
  };

  let loecher = 0;
  let spalten = 0;
  let leer = 0;

  for (let x = 0; x < width; x++) {
    let top = -1;
    for (let y = height - 1; y >= 0; y--) {
      if (!isSky(x, y)) {
        top = y;
        break;
      }
    }
    let bottom = -1;
    for (let y = 0; y < height; y++) {
      if (!isSky(x, y)) {
        bottom = y;
        break;
      }
    }
    if (top < 0 || bottom < 0 || top === bottom) {
      leer++;
      continue;
    }
    let inColumn = 0;
    for (let y = bottom + 1; y < top; y++) if (isSky(x, y)) inColumn++;
    loecher += inColumn;
    if (inColumn > 0) spalten++;
  }

  return { loecher, spalten, leer };
}
