import {
  Box3,
  Frustum,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type IUniform,
  type Object3D,
  type Texture,
} from 'three';

import { CITY_DISTRICT, CITY_GROUND_Y, REFLECTION } from '@/config/city.config';
import { DEFAULT_QUALITY, QUALITY } from '@/config/quality.config';
import type { RoadFile } from '@/config/roads.config';
import type { EngineContext, System } from '@/core/System';

/**
 * Rand um den spiegelnden Kasten, in Metern.
 *
 * Ein zu knapper Kasten spart einen Frame und laesst die Pfuetze aufblitzen,
 * ein zu weiter kostet nur den Test. Bei einer Optimierung, die nichts sichtbar
 * veraendern darf, ist die Richtung des Fehlers vorgegeben.
 */
const REFLECTIVE_BOX_MARGIN = 20;

/**
 * Planare Spiegelung der Stadtebene — PLAN.md P6 / 6.5, **die Entscheidung**.
 *
 * ## Warum nicht SSR
 *
 * Der Plan stellt drei Wege gegeneinander und will zuerst SSR versuchen; die
 * Abbruchregel lautete „nach zwei Tagen Tuning sichtbares Rauschen oder
 * Ghosting". Das ist eine Regel über Aufwand. Entschieden hat stattdessen eine
 * Messung, und zwar die einzige, die die Frage beantwortet:
 * **Screen-Space-Reflexionen können nur zeigen, was schon im Bild steht.**
 *
 * `japanMap.reflectionProbe()` schießt für ein Raster von Bildpunkten den
 * Sehstrahl auf den nassen Asphalt, spiegelt ihn an der Fläche, verfolgt ihn
 * gegen die Stadt und projiziert den Treffer zurück in die Kamera. Gemessen an
 * fünf Standpunkten im Distrikt, 24² bzw. 30² Proben:
 *
 * | Standpunkt | Treffer auf Geometrie | davon im Bild und unverdeckt |
 * |---|---|---|
 * | Straße, Augenhöhe | 156 | **1,3 %** |
 * | Straße, Blick hoch | 484 | 95,9 % |
 * | Gehweg an der Wand | 368 | 61,7 % |
 * | Kreuzung | 452 | 87,2 % |
 * | aus dem Wagen | 147 | 99,3 % |
 *
 * Und noch einmal, gegen **nur die Neonschilder** — das ist die Abnahmezeile
 * der Phase („Neon spiegelt sichtbar im nassen Asphalt"):
 *
 * | Standpunkt | Neon-Treffer | davon SSR-fähig |
 * |---|---|---|
 * | Straße, Augenhöhe | 24 | **4,2 %** |
 * | Straße, Blick hoch | 38 | 31,6 % |
 * | Gehweg an der Wand | 18 | 11,1 % |
 * | Kreuzung | 28 | 17,9 % |
 * | aus dem Wagen | 6 | 33,3 % |
 * | **zusammen** | **114** | **19,3 %** |
 *
 * Vier Fünftel der Neonspiegelungen sind im Primärbild **verdeckt**: das Schild
 * hängt an einer Fassade, die die Kamera streifend sieht, oder hinter dem Haus
 * davor. SSR hat dort nichts abzutasten und könnte nur raten. Das ist keine
 * Frage von Rauschen oder Ghosting und auch keine von Tuning-Tagen — es ist
 * eine Eigenschaft der Blickgeometrie einer Straßenszene: die Kamera steht
 * tief und schaut nach vorn, gespiegelt wird das, was **über** ihr ist.
 *
 * Also **B + C**, der im Plan definierte Rückfallweg — nur eben durch eine Zahl
 * entschieden statt durch Erschöpfung.
 *
 * ## Was hier passiert (B)
 *
 * Ein zusätzlicher Renderdurchgang mit einer an der Stadtebene gespiegelten
 * Kamera. Die Ebene ist **exakt** eben, und das ist keine Näherung, sondern
 * eine Zusage aus 6.1: der Distrikt ist im Baker auf 29,00 m gelegt, die
 * Stadtstraße auf 29,94 m Mittellinie, die Bodenplatte auf 29,97 m — die
 * Spiegelung an einer Ebene ist damit geometrisch **richtig** und nicht
 * angenähert. Genau dafür war die Mühe in 6.1 da.
 *
 * ## Und C
 *
 * PLAN.md nennt Reflexions-Probes als Ergänzung. Sie sind bereits vorhanden und
 * brauchen kein eigenes System: die Szene trägt seit P2 eine
 * HDRI-Umgebungskarte, und die ist genau das — eine Probe, nur eine einzige und
 * global. Sie liefert alles, was **nicht** in der Spiegelebene steht: Himmel,
 * Horizont, die Berge. Der planare Durchgang ergänzt sie um das, was sie nicht
 * kann, nämlich lokale Geometrie. Ein zweites Probe-System wäre eine dritte
 * Antwort auf eine Frage, die zwei bereits beantworten.
 */
export interface ReflectionUniforms {
  readonly uReflectMap: IUniform<Texture | null>;
  readonly uReflectMatrix: IUniform<Matrix4>;
  readonly uReflectStrength: IUniform<number>;
  /**
   * Höhe der Spiegelebene, und ob überhaupt gespiegelt wird.
   *
   * x = Höhe in Metern, y = 1 wenn der Durchgang in diesem Frame gelaufen ist.
   *
   * **Das zweite Feld ist keine Bequemlichkeit, sondern eine Korrektur.** Das
   * Belagsmaterial liegt auf *allen* Straßen der Karte, auch auf dem Bergpass in
   * 300 m Höhe. Ohne Bindung an die Ebene projizierte der Shader dort dieselbe
   * Spiegelmatrix und zöge, wo die Koordinate zufällig im Puffer landet, ein
   * Stück Stadt auf eine Passstraße. Der Abstand zur Ebene blendet die
   * Spiegelung deshalb über 3 m aus — und wo kein Durchgang lief, ist sie ganz
   * aus.
   */
  readonly uReflectPlane: IUniform<Vector3>;
}

export function createReflectionUniforms(): ReflectionUniforms {
  return {
    uReflectMap: { value: null },
    uReflectMatrix: { value: new Matrix4() },
    uReflectStrength: { value: REFLECTION.strength },
    uReflectPlane: { value: new Vector3(CITY_GROUND_Y, 0, REFLECTION.planeFalloff) },
  };
}

export class PlanarReflection implements System {
  readonly name = 'PlanarReflection';

  #context: EngineContext | null = null;
  #target: WebGLRenderTarget | null = null;
  #hidden: Object3D[] = [];

  readonly #camera = new PerspectiveCamera();
  readonly #plane = new Plane();
  readonly #normal = new Vector3(0, 1, 0);
  readonly #reflectorPosition = new Vector3(0, CITY_GROUND_Y, 0);
  readonly #textureMatrix = new Matrix4();
  /** Für den Sichttest in `update()` — siehe dort. */
  readonly #frustum = new Frustum();
  readonly #viewProjection = new Matrix4();
  readonly #reflectiveBox = new Box3();
  readonly #scratch = new Vector3();
  #boxReady = false;
  readonly #clipPlane = new Vector4();
  readonly #q = new Vector4();
  readonly #view = new Vector3();
  readonly #target3 = new Vector3();
  readonly #up = new Vector3();

  readonly uniforms: ReflectionUniforms = createReflectionUniforms();

  readonly #readouts = {
    status: 'aus',
    ziel: '—',
    /** Ausdehnung des spiegelnden Bereichs — der Sichttest hängt daran. */
    kasten: '—',
  };

  /** Der Schalter im Panel. */
  #enabled = REFLECTION.enabled;
  /**
   * Was die Qualitätsstufe erlaubt (P7 / 7.1).
   *
   * Getrennt vom Schalter und mit UND verknüpft — sonst entschiede die
   * Reihenfolge, ob man zuletzt die Stufe oder den Schalter angefasst hat.
   * Derselbe Aufbau wie bei der Umgebungsverdeckung in der PostFX-Kette.
   */
  #allowed = QUALITY[DEFAULT_QUALITY].reflections;
  #lastCost = 0;

  /**
   * Welche Objekte im Spiegeldurchgang **nicht** gezeichnet werden.
   *
   * Die spiegelnden Flächen selbst müssen raus: sie liegen in der Spiegelebene,
   * und eine Fläche, die sich selbst spiegelt, ist entweder eine Rückkopplung
   * oder ein Z-Fighting-Fest. Das Wasser ebenso — es hat seine eigene
   * Spiegelung und läge im Stadtbild ohnehin unter dem Horizont.
   */
  static readonly EXCLUDED = ['Stadtboden', 'Straßen', 'Meer', 'Bodenmarkierung', 'FahrzeugFX'];

  init(context: EngineContext): void {
    this.#context = context;

    this.#resizeTarget();

    context.bus.on('look:apply', ({ look }) => {
      this.uniforms.uReflectStrength.value = look.road.reflection;
    });
    context.bus.on('look:collect', ({ target }) => {
      target.road.reflection = this.uniforms.uReflectStrength.value;
    });
    context.bus.on('quality:changed', ({ level }) => {
      this.#allowed = QUALITY[level].reflections;
    });

    this.#registerDebug(context);
  }

  resize(): void {
    this.#resizeTarget();
  }

  /**
   * Den Kasten bestimmen, in dem eine Spiegelung überhaupt sichtbar werden kann.
   *
   * **Warum das von außen gerufen wird und nicht aus einem eigenen
   * `roads:ready`-Zuhörer.** Der erste Entwurf hatte den Zuhörer hier drin und
   * er hat **nie** ausgelöst: `roads:ready` wird gesendet, *während* sich das
   * RoadSystem initialisiert, und dieses System wird bewusst **danach**
   * registriert (es muss nach allem aktualisieren, was Geometrie einbringt).
   * Wer zuhören will, muss vorher registriert sein — genau die
   * Reihenfolgenbedingung, die in ARCHITECTURE.md §2 steht, und der Autor
   * dieser Zeilen ist zuerst hineingelaufen.
   *
   * Gemessen sah das so aus: Draw-Calls und Dreiecke über fünf Blickpunkte in
   * beiden Fassungen **bitgleich**. Ein Sichttest, der nie greift, ist von
   * totem Code nicht zu unterscheiden.
   *
   * `main.ts` hängt sich deshalb vor `engine.init()` an das Ereignis und reicht
   * die Datei herein — dort liegt die Verdrahtung ohnehin, und dort ist der Bus
   * früh genug da.
   *
   * **Abgeleitet aus den Straßendaten, nicht geschätzt.** Der erste Versuch nahm
   * dafür `REFLECTION.range` — also 2800 × 2800 m um den Distrikt — und der Test
   * hat **nie** gegriffen: die Kamera steht bei jedem Stadtblick mitten in diesem
   * Kasten, und ein Sichtvolumen schneidet einen Kasten, der es enthält, immer.
   * Gemessen war der Unterschied null Draw-Calls, in beiden Fassungen identisch.
   *
   * Was wirklich spiegeln kann, steht im Shader: `RoadMaterial` blendet über
   * `planeFalloff` (3 m) Höhendifferenz zur Ebene aus. Sichtbar wird die
   * Spiegelung also nur auf Fahrbahn, die in diesem dünnen Band liegt — plus
   * der Bodenplatte des Distrikts, die per Konstruktion darin liegt.
   *
   * Aus `roads.json` gerechnet: von 5794 Stützpunkten liegen **730** im Band und
   * in Reichweite (ring 157, toge 57, dorf 49, stadt 434, zufahrt 33), und ihre
   * Hülle misst **1580 × 755 m** statt 2800 × 2800. Damit greift der Test: über
   * die sechzehn benannten Blickpunkte läuft der Durchgang heute an dreizehn,
   * und an **fünf** davon (`tempel`, `sando`, `kueste`, `wald`, `wald-fern`)
   * entfällt er — dort ist von der Stadt kein Pixel im Bild.
   *
   * Der Rand von 20 m ist Absicht: ein zu knapper Kasten spart einen Frame und
   * lässt die Pfütze aufblitzen, ein zu weiter kostet nur den Test. Bei einer
   * Optimierung, die nichts sichtbar verändern darf, ist die Richtung des
   * Fehlers vorgegeben.
   */
  setRoadNetwork(file: RoadFile): void {
    const band = REFLECTION.planeFalloff;
    const range = REFLECTION.range;

    // Die Bodenplatte liegt per Konstruktion in der Ebene und ist immer dabei.
    this.#reflectiveBox.makeEmpty();
    this.#scratch.set(CITY_DISTRICT.minX, CITY_GROUND_Y - band, CITY_DISTRICT.minZ);
    this.#reflectiveBox.expandByPoint(this.#scratch);
    this.#scratch.set(CITY_DISTRICT.maxX, CITY_GROUND_Y + band, CITY_DISTRICT.maxZ);
    this.#reflectiveBox.expandByPoint(this.#scratch);

    for (const road of file.roads) {
      const line = road.centerline;
      for (let i = 0; i + 2 < line.length; i += 3) {
        const x = line[i]!;
        const y = line[i + 1]!;
        const z = line[i + 2]!;
        if (y < CITY_GROUND_Y - band || y > CITY_GROUND_Y + band) continue;
        // Jenseits der Reichweite entfällt der Durchgang ohnehin — solche
        // Punkte dürfen den Kasten nicht aufblähen.
        const dx = x - CITY_DISTRICT.centerX;
        const dz = z - CITY_DISTRICT.centerZ;
        if (dx * dx + dz * dz > range * range) continue;
        this.#scratch.set(x, y, z);
        this.#reflectiveBox.expandByPoint(this.#scratch);
      }
    }

    this.#reflectiveBox.expandByScalar(REFLECTIVE_BOX_MARGIN);
    this.#boxReady = true;
    const size = this.#reflectiveBox.getSize(this.#scratch);
    this.#readouts.kasten = `${size.x.toFixed(0)} × ${size.z.toFixed(0)} m`;
    this.#context?.debug?.refresh();
  }

  #resizeTarget(): void {
    const context = this.#context;
    if (!context) return;
    const gl = context.renderer.getContext();
    const width = Math.max(
      64,
      Math.round(Math.min(gl.drawingBufferWidth, REFLECTION.maxWidth) * REFLECTION.scale),
    );
    const height = Math.max(
      64,
      Math.round(
        (gl.drawingBufferHeight / Math.max(1, gl.drawingBufferWidth)) *
          Math.min(gl.drawingBufferWidth, REFLECTION.maxWidth) *
          REFLECTION.scale,
      ),
    );

    this.#target?.dispose();
    // HalfFloat wie der Composer: die Spiegelung trägt Neon und Fensterlicht
    // weit über 1, und in 8 Bit wäre genau das abgeschnitten, was blühen soll.
    const target = new WebGLRenderTarget(width, height, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
    target.texture.name = 'PlanarReflection';
    this.#target = target;
    this.uniforms.uReflectMap.value = target.texture;
    this.#readouts.ziel = `${width} × ${height} · HalfFloat`;
  }

  update(): void {
    const context = this.#context;
    const target = this.#target;
    if (!context || !target) return;

    const camera = context.camera;
    const plane = this.uniforms.uReflectPlane.value;

    // Übersprungen wird aus **vier** Gründen, und jeder spart einen ganzen
    // Szenendurchgang: abgeschaltet, unter der Ebene (dann sieht man die
    // Unterseite), zu weit weg, oder — seit P10.5 — **außer Sicht**.
    const dx = camera.position.x - CITY_DISTRICT.centerX;
    const dz = camera.position.z - CITY_DISTRICT.centerZ;
    const tooFar = dx * dx + dz * dz > REFLECTION.range * REFLECTION.range;

    const on = this.#enabled && this.#allowed;
    const below = camera.position.y <= CITY_GROUND_Y + 0.05;

    // **Der Sichttest.** Die drei Bedingungen darüber fragen alle nur, *wo die
    // Kamera steht* — nicht, *wohin sie schaut*. Wer 200 m neben dem Distrikt
    // steht und wegblickt, hat die Szene bis P10.5 trotzdem ein zweites Mal
    // gezeichnet, für eine Spiegelung, von der kein einziges Pixel im Bild
    // stand.
    //
    // Der spiegelnde Bereich ist scharf begrenzt, und zwar **im Shader**:
    // `RoadMaterial` blendet die Spiegelung über `planeFalloff` (3 m)
    // Höhendifferenz zur Ebene aus. Was die Spiegelung überhaupt zeigen kann,
    // liegt also in einer dünnen Scheibe um `CITY_GROUND_Y`, begrenzt auf
    // `REFLECTION.range` um den Distriktmittelpunkt. Steht diese Scheibe nicht
    // im Sichtvolumen, kann kein Fragment die Spiegelkarte sichtbar abtasten.
    //
    // Der Kasten ist bewusst **großzügig**: volle Reichweite in XZ statt der
    // Distriktgröße, und in Y das Doppelte des Ausblendbandes. Ein zu knapper
    // Kasten spart einen Frame und lässt die Pfütze aufblitzen — ein zu weiter
    // kostet nur den Test. Bei einer Optimierung, die nichts sichtbar
    // verändern darf, ist die Richtung des Fehlers vorgegeben.
    // Solange der Kasten nicht steht (vor `roads:ready`), wird **nicht**
    // übersprungen. Ein Sichttest gegen einen leeren Kasten verwürfe alles.
    let outOfSight = false;
    if (on && !below && !tooFar && this.#boxReady) {
      this.#viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.#frustum.setFromProjectionMatrix(this.#viewProjection);
      outOfSight = !this.#frustum.intersectsBox(this.#reflectiveBox);
    }

    if (!on || below || tooFar || outOfSight) {
      plane.y = 0;
      this.#readouts.status = !this.#allowed
        ? 'von der Qualitätsstufe abgeschaltet'
        : !this.#enabled
          ? 'aus'
          : tooFar
            ? 'außer Reichweite — übersprungen'
            : below
              ? 'unter der Ebene — übersprungen'
              : 'außer Sicht — übersprungen';
      return;
    }
    plane.y = 1;

    const started = performance.now();

    // ── Spiegelkamera ────────────────────────────────────────────────────
    //
    // Nach demselben Verfahren wie `three/addons/objects/Reflector`: die
    // gespiegelte Kamera wird **als richtige Kamera aufgebaut** — Position,
    // Blickziel und Aufwärtsvektor je einzeln an der Ebene gespiegelt —, nicht
    // als Produkt aus Spiegelmatrix und Kameramatrix. Der Unterschied ist
    // praktisch: eine Spiegelmatrix hat negative Determinante, dreht damit die
    // Wickelrichtung aller Dreiecke um und verlangt, dass man das Culling
    // mitdreht. Der Umweg über `lookAt` liefert eine gewöhnliche
    // rechtshändige Kamera, und es bleibt beim üblichen Backface-Culling.
    this.#plane.setFromNormalAndCoplanarPoint(this.#normal, this.#reflectorPosition);

    this.#view.subVectors(this.#reflectorPosition, camera.position);
    if (this.#view.dot(this.#normal) > 0) {
      plane.y = 0;
      this.#readouts.status = 'Kamera hinter der Ebene — übersprungen';
      return;
    }
    this.#view.reflect(this.#normal).negate().add(this.#reflectorPosition);

    this.#up.set(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    this.#target3
      .subVectors(this.#reflectorPosition, this.#up)
      .reflect(this.#normal)
      .negate()
      .add(this.#reflectorPosition);

    this.#camera.position.copy(this.#view);
    this.#camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(this.#normal);
    this.#camera.lookAt(this.#target3);
    this.#camera.near = camera.near;
    this.#camera.far = camera.far;
    this.#camera.updateMatrixWorld(true);
    this.#camera.matrixWorldInverse.copy(this.#camera.matrixWorld).invert();
    this.#camera.projectionMatrix.copy(camera.projectionMatrix);

    // ── Schiefe Nahebene ─────────────────────────────────────────────────
    //
    // Ohne sie zeichnet der Spiegeldurchgang auch, was **unter** der Ebene
    // liegt, und das erscheint dann als Geisterbild im Asphalt. Die Nahebene
    // wird deshalb auf die Spiegelebene gekippt (Lengyel, „Oblique Near-Plane
    // Clipping") — sie schneidet genau dort ab, wo die Ebene ist.
    const clipPlane = this.#plane.clone().applyMatrix4(this.#camera.matrixWorldInverse);
    this.#clipPlane.set(clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.constant);

    const projection = this.#camera.projectionMatrix;
    this.#q.x = (Math.sign(this.#clipPlane.x) + projection.elements[8]!) / projection.elements[0]!;
    this.#q.y = (Math.sign(this.#clipPlane.y) + projection.elements[9]!) / projection.elements[5]!;
    this.#q.z = -1;
    this.#q.w = (1 + projection.elements[10]!) / projection.elements[14]!;
    this.#clipPlane.multiplyScalar(2 / this.#clipPlane.dot(this.#q));
    projection.elements[2] = this.#clipPlane.x;
    projection.elements[6] = this.#clipPlane.y;
    projection.elements[10] = this.#clipPlane.z + 1 - REFLECTION.clipBias;
    projection.elements[14] = this.#clipPlane.w;

    // ── Texturmatrix: Weltposition → UV im Spiegelbild ───────────────────
    this.#textureMatrix.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    this.#textureMatrix.multiply(this.#camera.projectionMatrix);
    this.#textureMatrix.multiply(this.#camera.matrixWorldInverse);
    this.uniforms.uReflectMatrix.value.copy(this.#textureMatrix);

    // ── Durchgang ────────────────────────────────────────────────────────
    this.#hidden.length = 0;
    for (const name of PlanarReflection.EXCLUDED) {
      const object = context.scene.getObjectByName(name);
      if (object && object.visible) {
        object.visible = false;
        this.#hidden.push(object);
      }
    }

    const renderer = context.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(context.scene, this.#camera);
    renderer.setRenderTarget(previousTarget);
    renderer.shadowMap.enabled = previousShadow;

    for (const object of this.#hidden) object.visible = true;
    this.#hidden.length = 0;

    this.#lastCost = performance.now() - started;
    this.#readouts.status = `an · ${this.#lastCost.toFixed(2)} ms CPU je Frame`;
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Reflexion');
    if (!folder) return;

    folder.addBinding(this.#readouts, 'status', { readonly: true, label: 'Durchgang' });
    folder.addBinding(this.#readouts, 'ziel', { readonly: true, label: 'Puffer' });
    folder.addBinding(this.uniforms.uReflectStrength, 'value', {
      label: 'Stärke',
      min: 0,
      max: 1.5,
      step: 0.01,
    });
    const toggle = { an: this.#enabled };
    folder.addBinding(toggle, 'an', { label: 'Planare Spiegelung' }).on('change', (event) => {
      this.#enabled = event.value;
    });
  }

  dispose(): void {
    this.#target?.dispose();
    this.#target = null;
    this.uniforms.uReflectMap.value = null;
    this.#context = null;
  }
}
