import {
  Color,
  CanvasTexture,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Quaternion,
  SrcColorFactor,
  Vector3,
  ZeroFactor,
  type Camera,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import { WATER_PHYS } from '@/config/vehicle.config';
import {
  FX_SKID_CAPACITY,
  FX_SPLASH_CAPACITY,
  FX_TILE,
  PARTICLES,
  SKID,
  fxBudgetFor,
  type FxBudget,
} from '@/config/vehicleFx.config';
import type { QualityKey } from '@/config/quality.config';
import type { EngineContext } from '@/core/System';
import type { Ground, Surface, Vehicle } from './Vehicle';

/**
 * Driftspuren, Gischt und Staub — PLAN.md P14, überarbeitet in P19.
 *
 * ## Warum das am Fahrgefühl hängt
 *
 * Der Prüfstand kann nicht sagen, ob ein Drift sich gut anfühlt. Was er auch
 * nicht kann: dem Fahrer zeigen, *dass* er driftet. Ohne Spur und ohne Gischt
 * ist ein 20°-Schwimmwinkel nur eine Zahl im HUD, und auf CrazyGames liest
 * niemand das HUD. Die Bahn hinter dem Auto *ist* die Anzeige.
 *
 * ## Kosten, gemessen an der Bauweise
 *
 * Zwei `InstancedMesh`, zwei Canvas-Texturen, kein Download. Die Puffer liegen
 * auf Ultra-Größe und werden nicht neu angelegt — ein Stufenwechsel schreibt
 * nur, wie viele Slots noch leben dürfen. Im Freiflug ist die Gruppe
 * unsichtbar: null Draw-Calls, null CPU.
 *
 * ## Was P19 geändert hat
 *
 * **Die Partikel waren eine Sorte und mussten fünf sein.** Ein langgezogener,
 * additiv gemischter Streifen stand für Wasser wie für Staub; im Bild waren das
 * weiße beziehungsweise gelbe Stäbchen. Die Begründung und die Zerlegung stehen
 * bei `PARTICLES` in der Konfiguration; hier steht, was der Code dafür tut:
 *
 *  1. **Ein Atlas statt fünf Texturen.** Die vier Formen (Tropfen, Streifen,
 *     Wolke, Korn) liegen als 2 × 2 in einer Textur, ein Instanzattribut
 *     `aTile` wählt das Feld. Ein Draw-Call, wie vorher.
 *  2. **Alpha statt additiv.** Wasser ist ein Streuer, keine Lichtquelle. Die
 *     ausführliche Rechnung steht bei `PARTICLES`.
 *  3. **Ein Alphakanal je Instanz** (`aAlpha`), weil `instanceColor` nur drei
 *     Kanäle hat und eine Wolke bei 0,26 anfangen muss, wo ein Tropfen bei 0,8
 *     steht.
 *  4. **Größe und Streckung entstehen im Shader nicht, sondern in der Matrix** —
 *     der Rest des Systems rechnet ohnehin schon je Frame eine Matrix je
 *     lebendem Partikel.
 *
 * ## Was P18 geändert hat und bleibt
 *
 * **Die Sichtbarkeit der Spuren**, gemessen und nicht geraten: die alte
 * Spurfarbe für lose Böden hatte gegen die Belagstexturen ein
 * Helligkeitsverhältnis von 1,22 : 1, und der Kommentar daneben behauptete das
 * Gegenteil. Die ganze Rechnung steht bei `SKID.asphalt`. Gezeichnet wird
 * seitdem **multiplikativ** — die Spur dämpft, was unter ihr liegt.
 *
 * **Die Kosten je Frame.** `#writeSkids` setzte `needsUpdate` in *jedem* Frame
 * für Daten, die sich nur beim Setzen eines Stempels ändern. Seit P18 hängen
 * beide an `#skidDirty`.
 */

/** Sorten, in derselben Reihenfolge wie die Tabellen unten. */
const KIND_DROP = 0;
const KIND_SHEET = 1;
const KIND_MIST = 2;
const KIND_DUST = 3;
const KIND_GRAVEL_DUST = 4;
const KIND_CLOD = 5;
const KIND_COUNT = 6;

/**
 * Die Eigenschaften der sechs Sorten, als flache Tabellen.
 *
 * Sechs Felder mit je sechs Zahlen statt sechs Objekten mit je sechs
 * Eigenschaften — dieselbe Regel wie in `CollisionWorld`: die Schleife läuft je
 * Frame über bis zu 420 Partikel, und ein Objektzugriff je Eigenschaft wäre eine
 * Zeigerverfolgung für eine Zahl.
 */
const kindTile = new Float32Array(KIND_COUNT);
const kindGravity = new Float32Array(KIND_COUNT);
const kindDrag = new Float32Array(KIND_COUNT);
const kindLift = new Float32Array(KIND_COUNT);
const kindSize0 = new Float32Array(KIND_COUNT);
const kindSize1 = new Float32Array(KIND_COUNT);
const kindStretch = new Float32Array(KIND_COUNT);
const kindAlpha = new Float32Array(KIND_COUNT);
const kindColor = new Float32Array(KIND_COUNT * 3);

function setKind(
  kind: number,
  tile: number,
  gravity: number,
  drag: number,
  lift: number,
  size0: number,
  size1: number,
  stretch: number,
  alpha: number,
  color: readonly [number, number, number],
): void {
  kindTile[kind] = tile;
  kindGravity[kind] = gravity;
  kindDrag[kind] = drag;
  kindLift[kind] = lift;
  kindSize0[kind] = size0;
  kindSize1[kind] = size1;
  kindStretch[kind] = stretch;
  kindAlpha[kind] = alpha;
  kindColor[kind * 3] = color[0];
  kindColor[kind * 3 + 1] = color[1];
  kindColor[kind * 3 + 2] = color[2];
}

setKind(
  KIND_DROP,
  FX_TILE.drop,
  PARTICLES.dropGravity,
  PARTICLES.dropDrag,
  0,
  PARTICLES.dropSize,
  PARTICLES.dropSizeEnd,
  PARTICLES.dropStretch,
  PARTICLES.waterAlpha,
  PARTICLES.waterColor,
);
setKind(
  KIND_SHEET,
  FX_TILE.streak,
  PARTICLES.sheetGravity,
  PARTICLES.sheetDrag,
  0,
  PARTICLES.sheetSize,
  PARTICLES.sheetSizeEnd,
  PARTICLES.dropStretch * 1.6,
  PARTICLES.sheetAlpha,
  PARTICLES.waterColor,
);
setKind(
  KIND_MIST,
  FX_TILE.cloud,
  PARTICLES.mistGravity,
  PARTICLES.mistDrag,
  PARTICLES.mistLift,
  PARTICLES.mistSize,
  PARTICLES.mistSizeEnd,
  0,
  PARTICLES.mistAlpha,
  PARTICLES.mistColor,
);
setKind(
  KIND_DUST,
  FX_TILE.cloud,
  PARTICLES.mistGravity,
  PARTICLES.mistDrag,
  PARTICLES.mistLift,
  PARTICLES.dustSize,
  PARTICLES.dustSizeEnd,
  0,
  PARTICLES.dustAlpha,
  PARTICLES.dustColor,
);
setKind(
  KIND_GRAVEL_DUST,
  FX_TILE.cloud,
  PARTICLES.mistGravity,
  PARTICLES.mistDrag,
  PARTICLES.mistLift,
  PARTICLES.dustSize,
  PARTICLES.dustSizeEnd,
  0,
  PARTICLES.dustAlpha,
  PARTICLES.gravelColor,
);
setKind(
  KIND_CLOD,
  FX_TILE.grain,
  PARTICLES.clodGravity,
  PARTICLES.clodDrag,
  0,
  PARTICLES.clodSize,
  PARTICLES.clodSizeEnd,
  PARTICLES.dropStretch * 0.7,
  PARTICLES.clodAlpha,
  PARTICLES.clodColor,
);

export class VehicleFx {
  readonly group = new Group();

  #skid: InstancedMesh | null = null;
  #part: InstancedMesh | null = null;

  // ── Driftspuren ─────────────────────────────────────────────────────────
  #skidFade: Float32Array | null = null;
  #skidFadeAttr: InstancedBufferAttribute | null = null;
  #skidTileData: Float32Array | null = null;
  #skidTileAttr: InstancedBufferAttribute | null = null;
  #skidLife = new Float32Array(FX_SKID_CAPACITY);
  #skidMax = new Float32Array(FX_SKID_CAPACITY);
  #skidCursor = 0;
  #skidLive = 0;
  #skidDirty = false;
  #skidTop = 0;

  // ── Partikel ────────────────────────────────────────────────────────────
  #px = new Float32Array(FX_SPLASH_CAPACITY);
  #py = new Float32Array(FX_SPLASH_CAPACITY);
  #pz = new Float32Array(FX_SPLASH_CAPACITY);
  #vx = new Float32Array(FX_SPLASH_CAPACITY);
  #vy = new Float32Array(FX_SPLASH_CAPACITY);
  #vz = new Float32Array(FX_SPLASH_CAPACITY);
  #life = new Float32Array(FX_SPLASH_CAPACITY);
  #maxLife = new Float32Array(FX_SPLASH_CAPACITY);
  #kind = new Uint8Array(FX_SPLASH_CAPACITY);
  /** Größenwürfel je Partikel, 0,75…1,25 — sonst sind alle Wolken gleich groß. */
  #jitter = new Float32Array(FX_SPLASH_CAPACITY);
  #partTile: Float32Array | null = null;
  #partTileAttr: InstancedBufferAttribute | null = null;
  #partAlpha: Float32Array | null = null;
  #partAlphaAttr: InstancedBufferAttribute | null = null;
  #partCursor = 0;
  #partLive = 0;
  #partTop = 0;

  #budget: FxBudget = fxBudgetFor('ultra');

  readonly #lastX = [0, 0, 0, 0];
  readonly #lastZ = [0, 0, 0, 0];
  readonly #prevDepth = [0, 0, 0, 0];
  /** Bruchteil-Zähler je Rad und Sorte — eine Spawnrate ist selten ganzzahlig. */
  readonly #spawnAcc = new Float32Array(4 * KIND_COUNT);

  readonly #matrix = new Matrix4();
  readonly #quat = new Quaternion();
  readonly #scale = new Vector3();
  readonly #pos = new Vector3();
  readonly #forward = new Vector3();
  readonly #right = new Vector3();
  readonly #up = new Vector3(0, 1, 0);
  readonly #look = new Vector3();
  readonly #color = new Color();
  readonly #asphalt = new Color(SKID.asphalt);
  readonly #gravel = new Color(SKID.gravel);
  readonly #terrain = new Color(SKID.terrain);

  #skidStamp: CanvasTexture | null = null;
  #partStamp: CanvasTexture | null = null;
  #skidMaterial: MeshBasicMaterial | null = null;
  #partMaterial: MeshBasicMaterial | null = null;
  #skidGeometry: PlaneGeometry | null = null;
  #partGeometry: PlaneGeometry | null = null;

  #active = false;

  attach(context: EngineContext): void {
    this.group.name = 'FahrzeugFX';
    this.group.visible = false;
    this.group.matrixAutoUpdate = false;

    this.#skidStamp = makeSkidAtlas();
    this.#partStamp = makeParticleAtlas();
    context.resources.track(this.#skidStamp);
    context.resources.track(this.#partStamp);

    this.#buildSkid();
    this.#buildParticles();

    context.scene.add(this.group);
  }

  #buildSkid(): void {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.#skidGeometry = geometry;

    const fade = new Float32Array(FX_SKID_CAPACITY);
    const fadeAttr = new InstancedBufferAttribute(fade, 1);
    fadeAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aFade', fadeAttr);
    this.#skidFade = fade;
    this.#skidFadeAttr = fadeAttr;

    const tiles = new Float32Array(FX_SKID_CAPACITY);
    const tileAttr = new InstancedBufferAttribute(tiles, 1);
    tileAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aTile', tileAttr);
    this.#skidTileData = tiles;
    this.#skidTileAttr = tileAttr;

    const material = new MeshBasicMaterial({
      map: this.#skidStamp,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
      // **Multiplikativ statt darübermalen — P18.** `dst = dst · src`. Die
      // Begründung steht ausführlich bei `SKID.asphalt`; die Kurzfassung: ein
      // `MeshBasicMaterial` wird nicht beleuchtet, und eine unbeleuchtete Spur
      // mit fester Farbe ist in der blauen Stunde mal heller und mal dunkler als
      // die Fahrbahn, auf der sie liegt. Eine Dämpfung ist es immer.
      blending: CustomBlending,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
      // **Kein Tonemapping.** Der Wert ist ein Faktor und keine Leuchtdichte;
      // durch eine Tonwertkurve gedreht wäre 0,38 nicht mehr 0,38.
      toneMapped: false,
    });
    material.name = 'DriftspurMaterial';
    injectSkidShader(material);
    this.#skidMaterial = material;

    const mesh = new InstancedMesh(geometry, material, FX_SKID_CAPACITY);
    mesh.name = 'Driftspuren';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.#scale.set(0, 0, 0);
    this.#pos.set(0, -50, 0);
    for (let i = 0; i < FX_SKID_CAPACITY; i++) {
      this.#matrix.compose(this.#pos, this.#quat.identity(), this.#scale);
      mesh.setMatrixAt(i, this.#matrix);
      mesh.setColorAt(i, this.#asphalt);
    }
    this.#skid = mesh;
    this.group.add(mesh);
  }

  #buildParticles(): void {
    const geometry = new PlaneGeometry(1, 1);
    this.#partGeometry = geometry;

    const tiles = new Float32Array(FX_SPLASH_CAPACITY);
    const tileAttr = new InstancedBufferAttribute(tiles, 1);
    tileAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aTile', tileAttr);
    this.#partTile = tiles;
    this.#partTileAttr = tileAttr;

    const alpha = new Float32Array(FX_SPLASH_CAPACITY);
    const alphaAttr = new InstancedBufferAttribute(alpha, 1);
    alphaAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aAlpha', alphaAttr);
    this.#partAlpha = alpha;
    this.#partAlphaAttr = alphaAttr;

    const material = new MeshBasicMaterial({
      map: this.#partStamp,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      // **Alpha statt additiv — P19.** Begründung bei `PARTICLES`: additiv
      // gemischt wird auf einer nachtblauen Karte jeder Partikelstapel weiß,
      // egal welche Farbe die Instanz trägt.
      blending: NormalBlending,
      side: DoubleSide,
      toneMapped: true,
    });
    material.name = 'PartikelMaterial';
    injectParticleShader(material);
    this.#partMaterial = material;

    const mesh = new InstancedMesh(geometry, material, FX_SPLASH_CAPACITY);
    mesh.name = 'Fahrpartikel';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.#scale.set(0, 0, 0);
    this.#pos.set(0, -50, 0);
    this.#color.setRGB(0, 0, 0);
    for (let i = 0; i < FX_SPLASH_CAPACITY; i++) {
      this.#matrix.compose(this.#pos, this.#quat.identity(), this.#scale);
      mesh.setMatrixAt(i, this.#matrix);
      mesh.setColorAt(i, this.#color);
    }
    mesh.instanceColor?.setUsage(DynamicDrawUsage);
    this.#part = mesh;
    this.group.add(mesh);
  }

  setQuality(level: QualityKey): void {
    this.#budget = fxBudgetFor(level);
    // Slots oberhalb des Budgets sterben sofort — sonst lägen nach einem
    // Wechsel auf Minimal 256 Spuren weiter in der Welt, nur unsichtbar
    // gezählt. Der Puffer bleibt; leben dürfen nur die ersten N.
    for (let i = this.#budget.skids; i < FX_SKID_CAPACITY; i++) {
      this.#skidLife[i] = 0;
      if (this.#skidFade) this.#skidFade[i] = 0;
    }
    // **Nicht nur die Lebensdauer, auch die Deckkraft.** Ein Slot über dem neuen
    // Budget wird nicht mehr gezeichnet (`count` folgt dem Budget), aber sein
    // `aAlpha` bleibt stehen — und damit meldet jede Zählung über das Attribut
    // Partikel, die es nicht mehr gibt. Gemessen beim Stufenwechsel auf Minimal:
    // **55 „lebende" gegen `count` 40**, darunter vier Dunstwolken auf einer
    // Stufe, die gar keinen Dunst kennt (`FX_BUDGET.minimal.mist = 0`).
    //
    // Sichtbar war das nicht — aber eine Kennzahl, die tote Instanzen mitzählt,
    // ist genau die Sorte Messfehler, die in diesem Projekt schon zweimal in die
    // Doku gewandert ist.
    const alphas = this.#partAlpha;
    for (let i = this.#budget.splash; i < FX_SPLASH_CAPACITY; i++) {
      this.#life[i] = 0;
      if (alphas) alphas[i] = 0;
    }
    if (this.#partAlphaAttr) this.#partAlphaAttr.needsUpdate = true;
    // Der gezeichnete Bereich darf das neue Budget nicht überragen — sonst
    // zeichnet ein Wechsel auf Minimal weiter 256 Instanzen, von denen 224
    // nichts tun.
    if (this.#skidTop > this.#budget.skids) this.#skidTop = this.#budget.skids;
    if (this.#partTop > this.#budget.splash) this.#partTop = this.#budget.splash;
    this.#skidDirty = true;
  }

  show(): void {
    this.#active = true;
  }

  hide(): void {
    this.#active = false;
    this.reset();
    this.group.visible = false;
  }

  reset(): void {
    this.#skidLife.fill(0);
    this.#skidMax.fill(0);
    this.#skidFade?.fill(0);
    this.#skidLive = 0;
    this.#skidTop = 0;
    this.#skidDirty = false;
    this.#life.fill(0);
    this.#partLive = 0;
    this.#partTop = 0;
    this.#spawnAcc.fill(0);
    this.#prevDepth.fill(0);
    // **Auch die letzte Stempelstelle je Rad.** Sie steuert den Mindestabstand
    // (`SKID.spacing`); blieb sie stehen, unterdrückte sie nach einem Respawn am
    // anderen Ende der Karte genau einen Stempel — oder, schlimmer, keinen,
    // weil `#lastX === 0` als „noch nie gesetzt" gilt.
    this.#lastX.fill(0);
    this.#lastZ.fill(0);
    if (this.#skid) this.#skid.count = 0;
    if (this.#part) this.#part.count = 0;
  }

  /**
   * Spuren und Partikel fortschreiben.
   *
   * Läuft im **variablen** Schritt. Das ist Darstellung, nicht Physik — dieselbe
   * Trennung wie bei der Verfolgerkamera. Ein Tropfen, der bei 144 FPS drei mal
   * so oft integriert wird, fällt trotzdem gleich schnell: die Schwere hängt an
   * `dt`.
   */
  update(dt: number, vehicle: Vehicle, ground: Ground, camera: Camera, handbrake: boolean): void {
    if (!this.#active) return;
    // Ein langer Frame (Tab im Hintergrund, `shot()` nach einer Pause) darf
    // die Bahn nicht in einem Schritt löschen. 50 ms ist drei Physikschritte.
    const step = dt > 0.05 ? 0.05 : dt;

    this.#ageSkids(step);
    this.#ageParticles(step);
    this.#emit(step, vehicle, ground, handbrake);
    this.#writeSkids();
    this.#writeParticles(camera);

    this.group.visible = this.#skidLive > 0 || this.#partLive > 0;
  }

  get liveSkids(): number {
    return this.#skidLive;
  }

  get liveSplash(): number {
    return this.#partLive;
  }

  dispose(): void {
    this.#skid?.dispose();
    this.#part?.dispose();
    this.#skidGeometry?.dispose();
    this.#partGeometry?.dispose();
    this.group.removeFromParent();
    this.#skidMaterial?.dispose();
    this.#partMaterial?.dispose();
    this.#skidStamp?.dispose();
    this.#partStamp?.dispose();
    this.#skid = null;
    this.#part = null;
  }

  // ── Erzeugen ────────────────────────────────────────────────────────────

  #emit(dt: number, vehicle: Vehicle, ground: Ground, handbrake: boolean): void {
    const t = vehicle.telemetry;
    if (t.airborne) return;

    const wheels = vehicle.wheelPositions;
    const speed = t.speed;
    const slipMark =
      Math.abs(t.slipRear) > vehicle.spec.tire.peakSlipRear * SKID.slipStart ||
      t.wheelspin > SKID.spinStart ||
      (handbrake && speed > 3);

    for (let i = 0; i < 4; i++) {
      const wheel = wheels[i]!;
      const solidY = ground.height(wheel.x, wheel.z);
      const depth = ground.waterDepth?.(wheel.x, wheel.z) ?? 0;
      const prev = this.#prevDepth[i]!;
      this.#prevDepth[i] = depth;
      const surf = ground.surface(wheel.x, wheel.z);

      if (depth > PARTICLES.minDepth && speed > PARTICLES.minSpeed) {
        this.#emitWater(i, wheel, vehicle, depth, speed, dt, prev);
      } else if (
        (surf === 'gelaende' || surf === 'kies') &&
        (speed > PARTICLES.dustMinSpeed || slipMark)
      ) {
        this.#emitDust(i, wheel, vehicle, speed, dt, surf === 'kies', slipMark);
      }

      if (slipMark && depth < WATER_PHYS.wetThreshold && speed > 4) {
        this.#emitSkid(i, wheel, solidY, vehicle, surf);
      }
    }
  }

  /**
   * Gischt unter einem Rad — drei Sorten gleichzeitig.
   *
   * Die Aufteilung ist der Kern der Sache und steht ausführlich bei
   * `PARTICLES`: ein Rad im Wasser erzeugt einen kurzen schnellen **Fächer** an
   * der Aufstandsfläche, ballistische **Tropfen** darüber und einen langsamen
   * **Dunst**, der stehen bleibt. Eine Sorte kann höchstens eines davon sein.
   *
   * Forza-Geometrie für die Richtung: Ursprung an der Aufstandsfläche,
   * Geschwindigkeit nach **außen** (weg von der Mitte) plus **hinten** plus
   * etwas hoch. Die erste Fassung spawnte über der Radmitte und erbte 45 % der
   * Wagengeschwindigkeit — im Bild klebten vier Kreise am Dach.
   */
  #emitWater(
    wheel: number,
    at: Vector3,
    vehicle: Vehicle,
    depth: number,
    speed: number,
    dt: number,
    prevDepth: number,
  ): void {
    const rear = wheel >= 2 ? 1.7 : 1;
    const wet = Math.min(1, 0.35 + depth / 0.5);
    const pace = Math.min(1.35, speed / 16);
    const scale = pace * wet * rear * this.#budget.splashRate;

    this.#accumulate(wheel, KIND_DROP, PARTICLES.dropRateAt20 * scale * dt);
    this.#accumulate(wheel, KIND_SHEET, PARTICLES.sheetRateAt20 * scale * dt);
    this.#accumulate(wheel, KIND_MIST, PARTICLES.mistRateAt20 * scale * this.#budget.mist * dt);

    // Eintauchen: ein Schwall auf einmal. Das ist der Moment, an dem ein Rad
    // die Oberfläche durchstößt, und er sieht anders aus als das Fahren darin.
    if (prevDepth <= PARTICLES.minDepth) {
      this.#accumulate(
        wheel,
        KIND_DROP,
        PARTICLES.entryBurst * this.#budget.splashRate * rear,
      );
    }

    this.#spawnAll(wheel, at, vehicle, speed, 1);
  }

  /** Staubfahne und Erdbrocken. */
  #emitDust(
    wheel: number,
    at: Vector3,
    vehicle: Vehicle,
    speed: number,
    dt: number,
    gravel: boolean,
    slipping: boolean,
  ): void {
    const pace = Math.min(1.4, speed / 16);
    const boost = slipping ? PARTICLES.dustSlipBoost : 1;
    const rear = wheel >= 2 ? 1.35 : 1;
    const scale = pace * boost * rear * this.#budget.splashRate;

    this.#accumulate(
      wheel,
      gravel ? KIND_GRAVEL_DUST : KIND_DUST,
      PARTICLES.dustRateAt20 * scale * this.#budget.mist * dt,
    );
    // Brocken fliegen nur, wenn das Rad sie herausreißt. Bei ruhiger Fahrt über
    // einen Feldweg staubt es, aber es spritzt nicht.
    if (slipping) {
      this.#accumulate(wheel, KIND_CLOD, PARTICLES.clodRateAt20 * pace * rear * this.#budget.splashRate * dt);
    }

    this.#spawnAll(wheel, at, vehicle, speed, 0.62);
  }

  #accumulate(wheel: number, kind: number, amount: number): void {
    const slot = wheel * KIND_COUNT + kind;
    this.#spawnAcc[slot] = this.#spawnAcc[slot]! + amount;
  }

  /**
   * Die aufgelaufenen Bruchteile aller Sorten dieses Rades in Instanzen umsetzen.
   *
   * `upFactor` dämpft die Aufwärtskomponente: Staub wird vom Rad nach oben
   * *geschoben*, Wasser wird nach oben *geschleudert* — das ist ein Faktor von
   * rund 1,6 zwischen beiden, und ohne ihn springt der Staub wie Gischt.
   */
  #spawnAll(wheel: number, at: Vector3, vehicle: Vehicle, speed: number, upFactor: number): void {
    const ox = at.x - vehicle.position.x;
    const oz = at.z - vehicle.position.z;
    const oLen = Math.hypot(ox, oz) || 1;
    const onx = ox / oLen;
    const onz = oz / oLen;

    const vx = vehicle.velocity.x;
    const vz = vehicle.velocity.z;
    const vLen = Math.hypot(vx, vz);
    const backX = vLen > 0.2 ? -vx / vLen : -Math.sin(vehicle.yaw);
    const backZ = vLen > 0.2 ? -vz / vLen : -Math.cos(vehicle.yaw);

    const contactY = at.y - vehicle.spec.chassis.wheelRadius * 0.42;
    const out = PARTICLES.out + speed * PARTICLES.outFromSpeed;
    const back = PARTICLES.back + speed * PARTICLES.backFromSpeed;
    const up = (PARTICLES.up + speed * PARTICLES.upFromSpeed) * upFactor;

    for (let kind = 0; kind < KIND_COUNT; kind++) {
      const slot = wheel * KIND_COUNT + kind;
      let pending = this.#spawnAcc[slot]!;
      // **Ein Deckel je Frame und Sorte.** Nach einem langen Frame (oder einem
      // `shot()` nach einer Pause) stünden sonst dreistellige Bruchteile an, und
      // die Schleife legte den halben Ringpuffer in einem Frame neu an — die
      // vorhandene Bahn wäre weg. Vier ist mehr, als 60 Hz je erzeugen.
      let budget = 12;
      while (pending >= 1 && budget > 0) {
        pending -= 1;
        budget--;
        this.#spawn(kind, at, contactY, onx, onz, backX, backZ, out, back, up, vehicle);
      }
      // Der Rest bleibt stehen, **aber gedeckelt**. Stehen lassen, weil sonst
      // der Eintauch-Schwall (22 Stück) auf zwölf gekürzt würde; deckeln, weil
      // ein aufgestauter Berg das Problem im nächsten Frame zurückholte.
      this.#spawnAcc[slot] = pending > 24 ? 24 : pending;
    }
  }

  #spawn(
    kind: number,
    at: Vector3,
    contactY: number,
    onx: number,
    onz: number,
    backX: number,
    backZ: number,
    out: number,
    back: number,
    up: number,
    vehicle: Vehicle,
  ): void {
    const mesh = this.#part;
    const tiles = this.#partTile;
    const alphas = this.#partAlpha;
    if (!mesh || !tiles || !alphas) return;

    const slot = this.#partCursor % this.#budget.splash;
    this.#partCursor = slot + 1;

    const j = hash3(slot + kind * 17);
    const j2 = hash3(slot + 91);
    const j3 = hash3(slot + 3);

    // Der Fächer sitzt direkt an der Aufstandsfläche, Tropfen und Wolken
    // streuen darum herum. Ohne diesen Unterschied steht die „Wand" aus Wasser
    // neben dem Rad statt darunter.
    const spread = kind === KIND_SHEET ? 0.05 : 0.2;
    this.#px[slot] = at.x + onx * 0.12 + (j - 0.5) * spread;
    this.#py[slot] = contactY + 0.04 + j2 * 0.09;
    this.#pz[slot] = at.z + onz * 0.12 + (j3 - 0.5) * spread;

    // Der Dunst bekommt fast keine gerichtete Geschwindigkeit — er wird
    // mitgerissen, nicht geschleudert. Sein Bild entsteht aus Wachsen und
    // Steigen, nicht aus Fliegen.
    const drift = kind === KIND_MIST || kind === KIND_DUST || kind === KIND_GRAVEL_DUST ? 0.28 : 1;
    this.#vx[slot] =
      vehicle.velocity.x * PARTICLES.inherit +
      (onx * out * (0.55 + j) + backX * back * (0.5 + j2)) * drift;
    this.#vy[slot] = up * (0.45 + hash3(slot + 5) * 0.9) * drift;
    this.#vz[slot] =
      vehicle.velocity.z * PARTICLES.inherit +
      (onz * out * (0.55 + j2) + backZ * back * (0.5 + j)) * drift;

    const life = lifeOf(kind, hash3(slot + 7));
    if (this.#life[slot]! <= 0) this.#partLive++;
    this.#life[slot] = life;
    this.#maxLife[slot] = life;
    this.#kind[slot] = kind;
    this.#jitter[slot] = 0.75 + hash3(slot + 11) * 0.5;

    tiles[slot] = kindTile[kind]!;
    alphas[slot] = kindAlpha[kind]!;
    const base = kind * 3;
    this.#color.setRGB(kindColor[base]!, kindColor[base + 1]!, kindColor[base + 2]!);
    mesh.setColorAt(slot, this.#color);
    if (slot >= this.#partTop) this.#partTop = slot + 1;
  }

  #emitSkid(wheel: number, at: Vector3, groundY: number, vehicle: Vehicle, surface: Surface): void {
    const dx = at.x - this.#lastX[wheel]!;
    const dz = at.z - this.#lastZ[wheel]!;
    if (dx * dx + dz * dz < SKID.spacing * SKID.spacing && this.#lastX[wheel] !== 0) return;
    this.#lastX[wheel] = at.x;
    this.#lastZ[wheel] = at.z;

    const mesh = this.#skid;
    const fade = this.#skidFade;
    const tiles = this.#skidTileData;
    if (!mesh || !fade || !tiles) return;

    const slot = this.#skidCursor % this.#budget.skids;
    this.#skidCursor = slot + 1;

    const vx = vehicle.velocity.x;
    const vz = vehicle.velocity.z;
    const run = Math.hypot(vx, vz);
    if (run < 0.2) return;
    this.#forward.set(vx / run, 0, vz / run);
    // `up × forward` — sonst ist die Basis linkshändig, three zerlegt die
    // Matrix mit negativer X-Skalierung, und die Quad-Normale zeigt nach unten.
    // Gemessen: 192 Instanzen, keine im Bild. Dieselbe Wickelfalle wie P8.11.
    this.#right.set(this.#forward.z, 0, -this.#forward.x);
    this.#up.set(0, 1, 0);
    this.#matrix.makeBasis(this.#right, this.#up, this.#forward);
    this.#pos.set(at.x, groundY + SKID.lift, at.z);

    // **Auf losem Boden ist es eine Furche, auf Asphalt ein Abrieb.** Zwei
    // Unterschiede, und beide sind physikalisch und nicht dekorativ: die Furche
    // ist breiter als der Reifen (er wirft Material zur Seite, statt Gummi
    // abzureiben) und sie hält länger (eine Fahrspur im Acker ist morgen noch
    // da). Die Form kommt aus dem zweiten Feld des Stempel-Atlas — ein
    // ausgefranster Rand statt eines glatten Streifens.
    const loose = surface !== 'asphalt';
    const spread = loose ? SKID.looseSpread : 1;
    // **Die Breite kommt aus dem Fahrzeug, nicht aus einer Konstanten.** Der
    // Lastwagen hat 0,30 m breite Räder gegen 0,21 m beim Coupé; eine feste
    // Stempelbreite ließe ihn eine Spur ziehen, die schmaler ist als sein Reifen.
    this.#scale.set(
      vehicle.spec.chassis.wheelWidth * SKID.widthPerTire * spread,
      1,
      SKID.length * (loose ? 1.15 : 1),
    );
    this.#matrix.setPosition(this.#pos);
    this.#matrix.scale(this.#scale);
    mesh.setMatrixAt(slot, this.#matrix);
    // Drei Beläge, drei Dämpfungen — Herleitung und Messtabelle bei `SKID.asphalt`.
    // Wasser kommt hier nie an: der Aufrufer lässt eine Spur nur unterhalb
    // `WATER_PHYS.wetThreshold` zu, und darüber gibt es Gischt statt Abrieb.
    mesh.setColorAt(
      slot,
      surface === 'asphalt' ? this.#asphalt : surface === 'kies' ? this.#gravel : this.#terrain,
    );
    tiles[slot] = loose ? 1 : 0;

    // **Einen neu belegten Slot sofort als lebend zählen.** Ohne diese Zeile
    // steht der Zähler still: `#skidLive` wird nur in `#ageSkids` gebildet, und
    // `#ageSkids` steigt bei `#skidLive === 0` sofort aus. Einmal auf null, für
    // immer auf null — und `#writeSkids` schaltet das Mesh dann unsichtbar,
    // obwohl Stempel gesetzt werden.
    //
    // Gemessen im laufenden Bild, Handbremsdrift auf dem Ring: **32 lebende
    // Alterungswerte, `count` 0, `visible` false.** Kein Typfehler, keine
    // Ausnahme, kein Konsoleneintrag — die Spuren waren einfach weg.
    if (this.#skidLife[slot]! <= 0) this.#skidLive++;
    const life = SKID.life * (loose ? SKID.looseLife : 1);
    this.#skidLife[slot] = life;
    this.#skidMax[slot] = life;
    fade[slot] = 1;
    // **Die Puffer werden nur hochgeladen, wenn sie sich geändert haben.** Vor
    // P18 stand `needsUpdate = true` bedingungslos in `#writeSkids`, also in
    // jedem Frame des Fahrmodus — 256 Matrizen (16 KB) plus 256 Farben (3 KB)
    // über den Bus, auch wenn niemand driftet.
    this.#skidDirty = true;
    if (slot >= this.#skidTop) this.#skidTop = slot + 1;
  }

  // ── Fortschreiben ───────────────────────────────────────────────────────

  #ageSkids(dt: number): void {
    const fade = this.#skidFade;
    if (!fade) return;
    // Nichts am Leben heißt nichts zu tun. Der häufigste Fall beim Fahren ist
    // „keine Spur", und der kostet seit P18 einen Vergleich statt 256
    // Schleifendurchläufen plus einen Pufferupload.
    if (this.#skidLive === 0) return;
    let live = 0;
    // Nur bis zur höchsten je belegten Instanz — der Rest war nie beschrieben.
    const cap = Math.min(this.#skidTop, this.#budget.skids);
    for (let i = 0; i < cap; i++) {
      const life = this.#skidLife[i]!;
      if (life <= 0) {
        fade[i] = 0;
        continue;
      }
      const next = life - dt;
      this.#skidLife[i] = next;
      if (next <= 0) {
        fade[i] = 0;
        continue;
      }
      // Lange voll, dann ausblenden — sonst ist die Bahn hinter dem Auto schon
      // grau, bevor man sich umdreht.
      const u = next / (this.#skidMax[i]! || SKID.life);
      fade[i] = u > 0.35 ? 1 : u / 0.35;
      live++;
    }
    this.#skidLive = live;
    if (this.#skidFadeAttr) this.#skidFadeAttr.needsUpdate = true;
  }

  /**
   * Partikel integrieren.
   *
   * Halbimpliziter Euler mit **exponentiellem** Luftwiderstand statt eines
   * linearen `v -= k·v·dt`. Der Unterschied ist nicht Kosmetik: der lineare
   * Term kippt bei `k·dt > 1` das Vorzeichen, und `mistDrag` = 3,4 mit einem
   * 50-ms-Frame liegt bei 0,17 — nah genug, dass eine schwankende Bildrate die
   * Bahn sichtbar ändern würde. `exp(−k·dt)` ist für jedes `dt` stabil und
   * kostet einen Aufruf je Sorte und Frame, nicht je Partikel.
   */
  #ageParticles(dt: number): void {
    if (this.#partLive === 0) return;
    // Ein `exp` je Sorte statt eines je Partikel: bei 420 Partikeln sind das
    // sechs Aufrufe statt 420.
    const decay = SCRATCH_DECAY;
    for (let k = 0; k < KIND_COUNT; k++) decay[k] = Math.exp(-kindDrag[k]! * dt);

    let live = 0;
    const cap = Math.min(this.#partTop, this.#budget.splash);
    for (let i = 0; i < cap; i++) {
      const life = this.#life[i]!;
      if (life <= 0) continue;
      const next = life - dt;
      if (next <= 0) {
        this.#life[i] = 0;
        continue;
      }
      this.#life[i] = next;

      const kind = this.#kind[i]!;
      const d = decay[kind]!;
      this.#vx[i] = this.#vx[i]! * d;
      this.#vz[i] = this.#vz[i]! * d;
      this.#vy[i] = this.#vy[i]! * d + (kindLift[kind]! - kindGravity[kind]!) * dt;
      this.#px[i] = this.#px[i]! + this.#vx[i]! * dt;
      this.#py[i] = this.#py[i]! + this.#vy[i]! * dt;
      this.#pz[i] = this.#pz[i]! + this.#vz[i]! * dt;
      live++;
    }
    this.#partLive = live;
  }

  // ── Zeichnen ────────────────────────────────────────────────────────────

  /**
   * Die Spuren zeichnen — und dabei so wenig wie möglich hochladen.
   *
   * Drei Sparmaßnahmen aus P18, alle an derselben Beobachtung: **eine Driftspur
   * bewegt sich nicht.** Sie entsteht einmal, altert und verschwindet. Alles,
   * was je Frame über den Bus musste, war der Alterungswert — 256 Floats.
   *
   * `count` muss die höchste **je belegte** Instanz + 1 sein und nicht die
   * Anzahl der lebenden: der Ring schreibt in beliebige Slots, und ein zu
   * kleines `count` schnitte ihn ab.
   */
  #writeSkids(): void {
    const mesh = this.#skid;
    if (!mesh) return;
    mesh.count = this.#skidLive > 0 ? this.#skidTop : 0;
    if (this.#skidDirty) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (this.#skidTileAttr) this.#skidTileAttr.needsUpdate = true;
      this.#skidDirty = false;
    }
    mesh.visible = this.#skidLive > 0;
  }

  /**
   * Partikel zeichnen.
   *
   * Zwei Ausrichtungen, und welche gilt, entscheidet `kindStretch`:
   *
   *  · **Wolken** stehen zur Kamera (Billboard). Eine Staubwolke hat keine
   *    Vorzugsrichtung, und jede Ausrichtung längs der Flugbahn ließe sie beim
   *    Umfahren kippen.
   *  · **Tropfen, Fächer und Brocken** stehen längs ihrer Bahn und werden mit
   *    dem Tempo gestreckt. Das ist Bewegungsunschärfe, und sie ist der Grund,
   *    warum ein Tropfen als *fliegend* zu lesen ist.
   *
   * > **Die Streckung hängt am Tempo und nicht an einer Konstanten.** Bis P19
   * > war sie fest 0,48 m — bei jedem Tempo dieselbe. Genau das hat die
   * > Spritzer zu Strohhalmen gemacht: bei langsamer Fahrt lag ein halber Meter
   * > Strich im Bild, wo ein Tropfen von zwei Zentimetern hingehört.
   */
  #writeParticles(camera: Camera): void {
    const mesh = this.#part;
    const alphas = this.#partAlpha;
    if (!mesh || !alphas) return;
    if (this.#partLive === 0) {
      if (mesh.count !== 0) {
        mesh.count = 0;
        mesh.visible = false;
      }
      return;
    }

    const cap = Math.min(this.#partTop, this.#budget.splash);
    camera.getWorldQuaternion(this.#quat);
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;

    for (let i = 0; i < cap; i++) {
      const life = this.#life[i]!;
      if (life <= 0) {
        if (alphas[i] !== 0) {
          alphas[i] = 0;
          this.#scale.set(0, 0, 0);
          this.#matrix.compose(this.#pos.set(0, -80, 0), this.#quat, this.#scale);
          mesh.setMatrixAt(i, this.#matrix);
        }
        continue;
      }

      const kind = this.#kind[i]!;
      const max = this.#maxLife[i]! || 1;
      const age = 1 - life / max;
      // Ein weiches Ende, aber kein weicher Anfang bei Tropfen: ein Spritzer ist
      // sofort da. Wolken blenden dagegen auch auf — sie entstehen aus Nichts.
      const cloud = kindStretch[kind] === 0;
      const fade = cloud
        ? Math.min(1, age / 0.18) * (1 - age) * (1 - age)
        : age > 0.55
          ? (1 - age) / 0.45
          : 1;
      alphas[i] = kindAlpha[kind]! * fade;

      const size = (kindSize0[kind]! + (kindSize1[kind]! - kindSize0[kind]!) * age) * this.#jitter[i]!;
      const px = this.#px[i]!;
      const py = this.#py[i]!;
      const pz = this.#pz[i]!;

      const stretch = kindStretch[kind]!;
      if (stretch === 0) {
        this.#scale.set(size, size, 1);
        this.#matrix.compose(this.#pos.set(px, py, pz), this.#quat, this.#scale);
        mesh.setMatrixAt(i, this.#matrix);
        continue;
      }

      const vx = this.#vx[i]!;
      const vy = this.#vy[i]!;
      const vz = this.#vz[i]!;
      const flen = Math.hypot(vx, vy, vz);
      if (flen < 1e-4) {
        this.#scale.set(size, size, 1);
        this.#matrix.compose(this.#pos.set(px, py, pz), this.#quat, this.#scale);
        mesh.setMatrixAt(i, this.#matrix);
        continue;
      }

      this.#forward.set(vx / flen, vy / flen, vz / flen);
      this.#look.set(cx - px, cy - py, cz - pz);
      this.#right.crossVectors(this.#look, this.#forward);
      if (this.#right.lengthSq() < 1e-8) {
        // Die Bahn zeigt zur Kamera: dann ist der Streifen ein Punkt, und eine
        // Basis gäbe es ohnehin nicht.
        this.#scale.set(size, size, 1);
        this.#matrix.compose(this.#pos.set(px, py, pz), this.#quat, this.#scale);
        mesh.setMatrixAt(i, this.#matrix);
        continue;
      }
      this.#right.normalize();
      this.#up.crossVectors(this.#forward, this.#right);
      this.#matrix.makeBasis(this.#right, this.#forward, this.#up);
      const length = Math.min(size + flen * stretch, size * PARTICLES.dropStretchMax);
      this.#scale.set(size, length, 1);
      this.#matrix.scale(this.#scale);
      this.#matrix.setPosition(px, py, pz);
      mesh.setMatrixAt(i, this.#matrix);
    }

    mesh.count = cap;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (this.#partAlphaAttr) this.#partAlphaAttr.needsUpdate = true;
    if (this.#partTileAttr) this.#partTileAttr.needsUpdate = true;
    mesh.visible = true;
  }
}

/** Ein Rechenplatz für `#ageParticles` — modulweit, damit er nichts anlegt. */
const SCRATCH_DECAY = new Float32Array(KIND_COUNT);

function lifeOf(kind: number, roll: number): number {
  switch (kind) {
    case KIND_DROP:
      return PARTICLES.dropLife + (roll - 0.5) * 2 * PARTICLES.dropLifeJitter;
    case KIND_SHEET:
      return PARTICLES.sheetLife * (0.7 + roll * 0.6);
    case KIND_MIST:
      return PARTICLES.mistLife + (roll - 0.5) * 2 * PARTICLES.mistLifeJitter;
    case KIND_CLOD:
      return PARTICLES.clodLife * (0.7 + roll * 0.6);
    default:
      return PARTICLES.dustLife + (roll - 0.5) * 2 * PARTICLES.dustLifeJitter;
  }
}

/**
 * Feldauswahl im Atlas und Alpha je Instanz.
 *
 * Die UV-Verschiebung passiert im **Vertex**-Shader und nicht im Fragment: sie
 * ist je Instanz konstant, und im Fragment wäre sie eine Rechnung je Pixel für
 * ein Ergebnis, das je Dreieck feststeht.
 *
 * > **`vMapUv` und nicht `vUv`.** Three benennt die Texturkoordinate seit
 * > r152 nach dem Kanal, der sie benutzt; `<uv_vertex>` schreibt `vMapUv`,
 * > sobald eine `map` gesetzt ist. Ein Ersetzen auf `vUv` findet dort keinen
 * > Anker und fällt still durch — der Shader übersetzt, und alle Partikel
 * > zeigen dasselbe Feld.
 */
function injectParticleShader(material: MeshBasicMaterial): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aTile;\nattribute float aAlpha;\nvarying float vAlpha;',
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n' +
          'vAlpha = aAlpha;\n' +
          '#ifdef USE_MAP\n' +
          '  vMapUv = vMapUv * 0.5 + vec2(mod(aTile, 2.0), floor(aTile * 0.5)) * 0.5;\n' +
          '#endif',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\ndiffuseColor.a *= vAlpha;',
      );
  };
}

/**
 * Alterung, Feldauswahl und Stempelmaske in die Dämpfung einrechnen.
 *
 * **Bei multiplikativer Mischung ist „unsichtbar" nicht Alpha null, sondern
 * Weiß.** Die alte Fassung schrieb `diffuseColor.a *= vFade` — mit
 * `dst = dst · src` wird Alpha aber gar nicht ausgewertet, und eine verblasste
 * Spur bliebe genauso dunkel wie eine frische. Ebenso die Stempeltextur: ihr
 * Alphakanal trägt die Form des Abdrucks, und außerhalb der Form muss der Faktor
 * **1** herauskommen und nicht 0 (0 wäre schwarz).
 *
 * Beides ist dieselbe Rechnung: `mix(weiß, farbe, maske · alterung)`.
 *
 * > **Und sie muss nach `<color_fragment>` stehen, nicht nach `<map_fragment>`.**
 * > Der erste Versuch hing an `<map_fragment>` — dort ist die Instanzfarbe (also
 * > die Dämpfung selbst) noch gar nicht eingerechnet; three multipliziert sie
 * > erst einen Baustein später in `<color_fragment>`. Das Ergebnis wäre gewesen:
 * > erst nach Weiß mischen, dann wieder abdunkeln, und eine ausgeblendete Spur
 * > bliebe für immer sichtbar.
 *
 * **`setColorAt` schreibt linear.** `new Color(0x635f66)` rechnet den Wert von
 * sRGB nach linear um (0,388 → 0,126), und die Mischung findet im linearen
 * Zielpuffer statt. Die Verhältnisse in `SKID` sind damit perzeptuell zu lesen.
 */
function injectSkidShader(material: MeshBasicMaterial): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aFade;\nattribute float aTile;\nvarying float vFade;',
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n' +
          '#ifdef USE_MAP\n' +
          '  vMapUv = vec2(vMapUv.x, vMapUv.y * 0.5 + aTile * 0.5);\n' +
          '#endif',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n' +
          'diffuseColor.rgb = mix(vec3(1.0), diffuseColor.rgb, diffuseColor.a * vFade);\n' +
          'diffuseColor.a = 1.0;',
      );
  };
}

/**
 * Der Stempel-Atlas der Driftspur: zwei Felder übereinander.
 *
 * Oben der **Abrieb** auf Asphalt — ein glatter Streifen mit weichem Rand, so
 * wie ein Reifen Gummi hinterlässt. Unten die **Furche** in losem Boden: der
 * Rand ist ausgefranst, und in der Mitte liegt eine dunklere Rinne mit zwei
 * helleren Wällen daneben. Das ist die Form, an der man eine Spur im Acker von
 * einer Bremsspur unterscheidet, und sie kostet nichts extra — beide Felder
 * liegen in derselben Textur, das Instanzattribut `aTile` wählt aus.
 */
function makeSkidAtlas(): CanvasTexture {
  const w = 32;
  const h = 128;
  const half = h / 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('VehicleFx: kein 2D-Kontext für die Driftspur.');
  const img = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const loose = y >= half;
    const v = (loose ? y - half : y) / (half - 1);
    const along = Math.sin(v * Math.PI);
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      const across = Math.max(0, 1 - u * u);
      let a: number;
      if (!loose) {
        a = across * across * along;
      } else {
        // Ausgefranst: der Rand wandert mit einer stehenden Welle, und die
        // Mitte ist die tiefste Stelle der Rinne.
        const edge = 0.82 + 0.18 * Math.sin(v * 27.4) * Math.cos(v * 11.3);
        const inside = Math.max(0, 1 - (u * u) / (edge * edge));
        const rut = 0.55 + 0.45 * Math.cos(u * 2.6);
        const grain = 0.78 + 0.22 * Math.sin(v * 61.1 + u * 9.3);
        a = inside * rut * along * grain;
      }
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, a) * 220);
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.name = 'DriftspurAtlas';
  // **Keine Mipmaps.** Zwischen den beiden Feldern liegt keine Trennfläche; auf
  // der zweiten Mip-Stufe mischte sich der Abrieb in die Furche.
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  // Dieselbe Falle wie beim Partikel-Atlas: ohne diese Zeile wählt `aTile = 0`
  // die **untere** Canvas-Hälfte, und der Asphalt bekäme die Furche.
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Der Partikel-Atlas: 2 × 2 Felder à 64 Pixel.
 *
 * | | links | rechts |
 * |---|---|---|
 * | **oben** | Tropfen | Streifen |
 * | **unten** | Wolke | Korn |
 *
 * Alle vier sind reine Alphamasken auf Weiß; die Farbe kommt aus der
 * Instanzfarbe. Das ist die Voraussetzung dafür, dass Wasser und Staub sich ein
 * Feld teilen können — die Wolke ist beides, sie hat nur eine andere Farbe.
 *
 * **Keine Mipmaps**, und das ist hier eine Entscheidung mit Preis: die Felder
 * grenzen aneinander, und schon die zweite Mip-Stufe mischt sie. Ein Tropfen mit
 * dem Rand einer Wolke wäre auffälliger als das Flimmern, das ohne Mipmaps bei
 * sehr kleinen Partikeln entsteht — und klein sind sie nur, wenn sie weit weg
 * sind, wo ohnehin kaum welche im Bild stehen.
 */
function makeParticleAtlas(): CanvasTexture {
  const size = 128;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('VehicleFx: kein 2D-Kontext für die Partikel.');
  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tileX = x < half ? 0 : 1;
      const tileY = y < half ? 0 : 1;
      // Lokale Koordinate im Feld, −1…1.
      const u = ((x % half) / (half - 1)) * 2 - 1;
      const v = ((y % half) / (half - 1)) * 2 - 1;
      const r = Math.hypot(u, v);
      let a = 0;

      if (tileY === 0 && tileX === 0) {
        // **Tropfen.** Ein Kern mit hartem Rand und ein weicher Hof darum. Der
        // Kern macht ihn als Tropfen lesbar, der Hof nimmt ihm die Kante.
        const core = Math.max(0, 1 - r / 0.55);
        const halo = Math.max(0, 1 - r);
        a = Math.min(1, core * core * 0.9 + halo * halo * halo * 0.45);
      } else if (tileY === 0 && tileX === 1) {
        // **Streifen.** Längs weich, quer parabolisch — der Fächer am Reifen.
        const along = Math.max(0, Math.cos(v * 1.5707963));
        const across = Math.max(0, 1 - u * u);
        a = across * across * along * along;
      } else if (tileX === 0) {
        // **Wolke.** Drei versetzte Ballen statt eines Kreises: ein
        // rotationssymmetrischer Fleck liest sich als Kugel und nicht als
        // Dunst. Die Versätze sind fest — bei 420 Instanzen mit gewürfelter
        // Drehung sieht man die Wiederholung nicht.
        a = puff(u, v, 0, 0, 0.78) * 0.85;
        a = Math.max(a, puff(u, v, 0.3, -0.22, 0.5) * 0.7);
        a = Math.max(a, puff(u, v, -0.28, 0.24, 0.46) * 0.65);
        // Ein Korn darüber, damit die Fläche nicht wie ein Farbverlauf wirkt.
        a *= 0.8 + 0.2 * Math.sin(u * 13.7 + v * 9.1) * Math.cos(v * 17.3 - u * 6.7);
      } else {
        // **Korn.** Ein kleiner, kantiger Brocken: harter Rand, kein Hof.
        const wobble = 0.62 + 0.14 * Math.sin(Math.atan2(v, u) * 5);
        a = r < wobble ? 1 : 0;
        if (r > wobble - 0.12) a *= (wobble - r) / 0.12;
      }

      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.name = 'PartikelAtlas';
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  // **`flipY = false`, und das ist keine Kosmetik — es war ein Fehler im Bild.**
  //
  // Three dreht eine Textur beim Hochladen senkrecht um (OpenGL zählt UV von
  // unten, ein Canvas zählt Zeilen von oben). Die **Form** merkt davon nichts,
  // alle vier Felder sind oben-unten-symmetrisch. Die **Feldwahl** sehr wohl:
  // `aTile = 2` verschiebt um +0,5 in v und landete damit auf der oberen
  // Canvas-Zeile statt auf der unteren. Die Zuordnung war paarweise vertauscht —
  // Tropfen ↔ Wolke und Streifen ↔ Korn.
  //
  // Gesehen hat es das erste Bild: aus jedem Wasserspritzer wurde eine
  // **fünfblättrige Blüte**, weil das Korn (`0,62 + 0,14·sin(5φ)`) genau so
  // aussieht. Kein Typfehler, keine Konsolenmeldung, und jede Zahl stimmte —
  // 420 lebende Instanzen, Tiefe 0,30 m, 46 km/h. Wieder die Fehlerform aus
  // CLAUDE.md: „etwas ist nicht im Bild, und jede Zahl sagt, es sei alles in
  // Ordnung", diesmal andersherum — es *war* im Bild, nur als etwas anderes.
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Ein weicher Ballen mit Mittelpunkt (cx, cz) und Radius r. */
function puff(u: number, v: number, cx: number, cy: number, r: number): number {
  const d = Math.hypot(u - cx, v - cy) / r;
  if (d >= 1) return 0;
  const t = 1 - d;
  return t * t * (3 - 2 * t);
}

/** Deterministischer Jitter ohne `Math.random` — FX dürfen die Physik nicht anfassen. */
function hash3(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
