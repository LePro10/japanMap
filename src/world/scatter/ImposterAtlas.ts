import {
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  type Material,
  SRGBColorSpace,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';

import { IMPOSTER } from '@/config/vegetation.config';

/**
 * Imposter-Atlas — PLAN.md P4 / 4.4.
 *
 * Jedes Modell wird aus `tiles × tiles` Richtungen aufgenommen und in einen
 * Atlas gelegt; der Shader mischt zur Laufzeit zwischen den zwei nächsten
 * Ansichten.
 *
 * > **Gebacken wird in der laufenden Anwendung, nicht in `tools/`.** Der Plan
 * > sah `tools/bake-imposters.mjs` über das `gl`-Paket vor und nannte den
 * > In-App-Bake als Rückfall („Offene Entscheidungen", Punkt 4). Gebaut ist der
 * > Rückfall, und zwar aus drei Gründen, von denen der dritte den Ausschlag gab:
 * >
 * >  1. `gl` ist ein natives Modul und braucht eine Build-Kette, die auf dieser
 * >     Maschine nicht steht (kein node-gyp, kein Compiler).
 * >  2. Der Atlas wäre eine Datei mehr im Startdownload, der mit 51,95 MB
 * >     bereits das 15-MB-Budget aus SPEC §4 um mehr als das Dreifache reißt.
 * >     Gerechnet kostet er **null Bytes**.
 * >  3. Die Modelle entstehen selbst prozedural (`vegetationMeshes.ts`). Ein
 * >     offline gebackener Atlas wäre die Ableitung einer Quelle, die es als
 * >     Datei nicht gibt — er könnte veralten, ohne dass es jemand merkt. Ab P5
 * >     kommen echte glTF-Modelle, und dann ändert sich diese Rechnung; die
 * >     Asset-Pipeline aus 5.1 ist der richtige Ort dafür.
 * >
 * > Gemessen kostet der Bake **beider** Atlanten für vier Arten 0,9 s auf dem
 * > Software-Rasterizer dieser Maschine und liegt damit noch im Ladevorgang.
 */
export class ImposterAtlas {
  readonly albedo: Texture;
  readonly normal: Texture;
  /** Höhe des ungeskalierten Modells, in Metern. */
  readonly height: number;
  /**
   * Halbe Kantenlänge des Aufnahmerahmens, in Metern.
   *
   * **Das Quad zur Laufzeit muss genau dieser Rahmen sein** — quadratisch und um
   * `height/2` zentriert, nicht vom Boden bis zur Krone. Sonst liegt die
   * Silhouette im Bild verschoben oder gestreckt gegenüber der Geometrie, aus
   * der sie entstanden ist, und der Stufenwechsel wird als Sprung sichtbar.
   */
  readonly frameHalf: number;

  readonly #albedoTarget: WebGLRenderTarget;
  readonly #normalTarget: WebGLRenderTarget;

  private constructor(
    albedoTarget: WebGLRenderTarget,
    normalTarget: WebGLRenderTarget,
    height: number,
    frameHalf: number,
  ) {
    this.#albedoTarget = albedoTarget;
    this.#normalTarget = normalTarget;
    this.albedo = albedoTarget.texture;
    this.normal = normalTarget.texture;
    this.height = height;
    this.frameHalf = frameHalf;
  }

  /**
   * Ein Modell in zwei Atlanten aufnehmen.
   *
   * Zwei Aufnahmen je Zelle: Albedo (mit Alpha, damit der Shader freistellen
   * kann) und **Objektraum-Normale**. Objektraum und nicht Sichtraum — eine im
   * Sichtraum der Aufnahmekamera gespeicherte Normale wäre je Zelle in einem
   * anderen Bezugssystem, und der Shader müsste sie mit der Kamera
   * zurückrechnen, aus der sie stammt. Im Objektraum genügt die Drehung der
   * Instanz.
   */
  static bake(
    renderer: WebGLRenderer,
    geometry: BufferGeometry,
    color: number,
    height: number,
    radius: number,
  ): ImposterAtlas {
    const tiles = IMPOSTER.tiles;
    const tile = IMPOSTER.tileSize;
    const size = tiles * tile;

    const albedoTarget = new WebGLRenderTarget(size, size, {
      depthBuffer: true,
      generateMipmaps: false,
    });
    albedoTarget.texture.colorSpace = SRGBColorSpace;
    albedoTarget.texture.name = 'ImposterAlbedo';
    const normalTarget = new WebGLRenderTarget(size, size, {
      depthBuffer: true,
      generateMipmaps: false,
    });
    normalTarget.texture.name = 'ImposterNormal';

    const scene = new Scene();
    const albedoMaterial = new MeshBasicMaterial({ color });
    // Flache Farbe statt beleuchtetem Material: die Beleuchtung passiert zur
    // Laufzeit über die gebackene Normale. Ein hier eingebranntes Licht wäre
    // fest und stimmte nur für die eine Sonnenrichtung, aus der gebacken wurde.
    const normalMaterial = new ShaderMaterial({
      vertexShader:
        'varying vec3 vObjectNormal;\n' +
        'void main() {\n' +
        '  vObjectNormal = normal;\n' +
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n' +
        '}',
      fragmentShader:
        'varying vec3 vObjectNormal;\n' +
        'void main() {\n' +
        '  gl_FragColor = vec4(normalize(vObjectNormal) * 0.5 + 0.5, 1.0);\n' +
        '}',
    });

    const mesh = new Mesh<BufferGeometry, Material>(geometry, albedoMaterial);
    scene.add(mesh);

    // Der Rahmen ist quadratisch und umschließt das Modell vollständig: die
    // Zelle ist quadratisch, und ein anisotroper Rahmen verzerrte die
    // Silhouette, sobald die Kamera aus einer anderen Elevation schaut.
    const half = Math.max(height / 2, radius) * 1.04;
    const camera = new OrthographicCamera(-half, half, half, -half, 0.01, 40);
    const center = new Vector3(0, height / 2, 0);

    const previousTarget = renderer.getRenderTarget();
    const previousToneMapping = renderer.toneMapping;
    const previousAutoClear = renderer.autoClear;
    // **Löschfarbe und -alpha gehören mit zurückgesetzt.** Beim ersten Anlauf
    // fehlte das: der Baker setzte (0, 0, 0, 0) für die Freistellung, und die
    // Anwendung lief danach mit durchsichtigem Löschalpha weiter. Sichtbar wurde
    // es erst in einer Messung, in der `scene.background` abgeschaltet war —
    // dort stand plötzlich Weiß statt Schwarz im Bild. Im Normalbetrieb deckt
    // der Himmel den Fehler vollständig ab.
    const previousClearColor = renderer.getClearColor(new Color());
    const previousClearAlpha = renderer.getClearAlpha();
    /**
     * **Und der Viewport ebenso.** Hier stand am Ende `setViewport(0, 0, size,
     * size)` — also die Atlasgröße statt des vorherigen Werts. Das ist derselbe
     * Fehler wie bei der Löschfarbe darüber, eine Zeile weiter unten, und er
     * hatte eine sichtbarere Wirkung: `setRenderTarget(null)` nimmt in three den
     * **Renderer-Viewport**, nicht die Canvas-Größe. Nach dem Backen zeichnete
     * die ganze Kette deshalb in ein 1024er Quadrat, und bei 1280 × 720 blieb
     * ein Fünftel des Bildes rechts **schwarz** — gemessen: `probe()` meldete
     * 79,9 % nicht-schwarze Pixel, und 1024/1280 sind genau 0,8.
     *
     * Gesehen hat man es lange nicht, weil jede Größenänderung `setSize()`
     * auslöst und den Viewport dabei mitzieht: ein Fensterwechsel, ein
     * Wechsel der Qualitätsstufe, das Andocken der DevTools. Aufgefallen ist es
     * erst, als P7.4 den ersten Frame in den Ladeabschnitt vorzog — davor lag
     * zwischen Bake und erstem Bild fast immer ein Resize.
     */
    const previousViewport = renderer.getViewport(new Vector4());
    // Ohne das würde AgX die gebackene Farbe schon hier komprimieren, und zur
    // Laufzeit ein zweites Mal.
    renderer.toneMapping = NoToneMapping;
    renderer.autoClear = false;

    for (const pass of [
      { target: albedoTarget, material: albedoMaterial },
      { target: normalTarget, material: normalMaterial },
    ]) {
      mesh.material = pass.material;
      renderer.setRenderTarget(pass.target);
      renderer.setScissorTest(false);
      // Alpha 0: was kein Dreieck trifft, ist Hintergrund und wird zur Laufzeit
      // per alphaTest verworfen.
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.setScissorTest(true);

      for (let ty = 0; ty < tiles; ty++) {
        for (let tx = 0; tx < tiles; tx++) {
          // Zellenmitte, nicht Zellenecke: die Abbildung im Shader liest mit
          // der gleichen Konvention, und ein halbes Tile Versatz wäre 1/16
          // Blickwinkel — sichtbar als Springen beim Umkreisen.
          const gx = (tx + 0.5) / tiles;
          const gy = (ty + 0.5) / tiles;
          const direction = ImposterAtlas.#octDecodeHemi(gx, gy);

          camera.position.copy(center).addScaledVector(direction, 20);
          camera.up.set(0, 1, 0);
          // Blick von oben: `up` und Blickrichtung wären parallel, `lookAt`
          // liefert dann eine entartete Matrix und die Zelle bleibt leer.
          if (direction.y > 0.999) camera.up.set(0, 0, 1);
          camera.lookAt(center);
          camera.updateMatrixWorld();

          renderer.setViewport(tx * tile, ty * tile, tile, tile);
          renderer.setScissor(tx * tile, ty * tile, tile, tile);
          renderer.render(scene, camera);
        }
      }
    }

    renderer.setScissorTest(false);
    renderer.setViewport(previousViewport);
    renderer.setRenderTarget(previousTarget);
    renderer.toneMapping = previousToneMapping;
    renderer.autoClear = previousAutoClear;
    renderer.setClearColor(previousClearColor, previousClearAlpha);

    scene.remove(mesh);
    albedoMaterial.dispose();
    normalMaterial.dispose();

    return new ImposterAtlas(albedoTarget, normalTarget, height, half);
  }

  /** Muss Zeile für Zeile `octDecodeHemi` aus imposter_oct.glsl entsprechen. */
  static #octDecodeHemi(gx: number, gy: number): Vector3 {
    const px = gx * 2 - 1;
    const py = gy * 2 - 1;
    const x = (px + py) * 0.5;
    const z = (px - py) * 0.5;
    return new Vector3(x, 1 - Math.abs(x) - Math.abs(z), z).normalize();
  }

  dispose(): void {
    this.#albedoTarget.dispose();
    this.#normalTarget.dispose();
  }
}
