import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
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
  SKID,
  SPLASH,
  fxBudgetFor,
  type FxBudget,
} from '@/config/vehicleFx.config';
import type { QualityKey } from '@/config/quality.config';
import type { EngineContext } from '@/core/System';
import type { Ground, Surface, Vehicle } from './Vehicle';

/**
 * Driftspuren und Wasserspritzer — PLAN.md P14, die fehlende Rückmeldung.
 *
 * ## Warum das am Fahrgefühl hängt
 *
 * Der Prüfstand kann nicht sagen, ob ein Drift sich gut anfühlt. Was er auch
 * nicht kann: dem Fahrer zeigen, *dass* er driftet. Ohne Spur und ohne Spritzer
 * ist ein 20°-Schwimmwinkel nur eine Zahl im HUD, und auf CrazyGames liest
 * niemand das HUD. Die Bahn hinter dem Auto *ist* die Anzeige.
 *
 * ## Kosten, gemessen an der Bauweise
 *
 * Zwei `InstancedMesh`, ein Canvas-Stempel je Sorte, kein Download. Die
 * Puffer liegen auf Ultra-Größe und werden nicht neu angelegt — ein
 * Stufenwechsel schreibt nur, wie viele Slots noch leben dürfen. Im Freiflug
 * ist die Gruppe unsichtbar: null Draw-Calls, null CPU.
 *
 * Kompaktieren entfällt. Tote Instanzen haben Skalierung null; three zeichnet
 * sie trotzdem, solange `count > 0`. Deshalb gilt `mesh.visible = live > 0`
 * und `count = live` nach einem kompakten Schreibdurchgang **nicht** — der
 * Ring bleibt stehen, und `visible` geht aus, wenn niemand mehr lebt.
 * Beim Fahren ohne Drift sind das zwei leere Aufrufe, und die sind billiger
 * als jedes Frame 256 Matrizen umzusortieren. Sobald die Gruppe unsichtbar
 * ist (kein Drift, kein Wasser), fallen auch die.
 *
 * ## Was P18 daran geändert hat
 *
 * **Die Sichtbarkeit**, gemessen und nicht geraten: die alte Spurfarbe für lose
 * Böden hatte gegen die Belagstexturen ein Helligkeitsverhältnis von 1,22 : 1,
 * und der Kommentar daneben behauptete das Gegenteil. Die ganze Rechnung steht
 * bei `SKID.asphalt`. Gezeichnet wird seitdem **multiplikativ** — die Spur
 * dämpft, was unter ihr liegt, statt darüber zu malen, und ist damit von der
 * Tageszeit unabhängig.
 *
 * **Die Kosten je Frame.** Der Grundgedanke oben („eine Spur bewegt sich nicht")
 * war richtig aufgeschrieben und nicht zu Ende geführt: `#writeSkids` setzte
 * `instanceMatrix.needsUpdate` und `instanceColor.needsUpdate` trotzdem in
 * **jedem** Frame, in dem der Fahrmodus lief. Das sind 256 × 16 Floats plus
 * 256 × 3 Floats — 19 KB über den Bus, sechzigmal je Sekunde, für Daten, die
 * sich nur beim Setzen eines Stempels ändern. Seit P18 hängen beide an
 * `#skidDirty`, und `count` folgt der höchsten je belegten Instanz statt dem
 * Budget.
 */

export class VehicleFx {
  readonly group = new Group();

  #skid: InstancedMesh | null = null;
  #splash: InstancedMesh | null = null;
  #skidFade: Float32Array | null = null;
  #skidFadeAttr: InstancedBufferAttribute | null = null;
  #skidLife = new Float32Array(FX_SKID_CAPACITY);
  #splashLife = new Float32Array(FX_SPLASH_CAPACITY);
  #splashMax = new Float32Array(FX_SPLASH_CAPACITY);
  #sx = new Float32Array(FX_SPLASH_CAPACITY);
  #sy = new Float32Array(FX_SPLASH_CAPACITY);
  #sz = new Float32Array(FX_SPLASH_CAPACITY);
  #svx = new Float32Array(FX_SPLASH_CAPACITY);
  #svy = new Float32Array(FX_SPLASH_CAPACITY);
  #svz = new Float32Array(FX_SPLASH_CAPACITY);
  #ssize = new Float32Array(FX_SPLASH_CAPACITY);
  #sLen = new Float32Array(FX_SPLASH_CAPACITY);

  #skidCursor = 0;
  #splashCursor = 0;
  #skidLive = 0;
  #splashLive = 0;
  #budget: FxBudget = fxBudgetFor('ultra');

  readonly #lastX = [0, 0, 0, 0];
  readonly #lastZ = [0, 0, 0, 0];
  readonly #prevDepth = [0, 0, 0, 0];
  readonly #spawnAcc = [0, 0, 0, 0];

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

  /** Ist seit dem letzten Upload ein Stempel dazugekommen? Siehe `#writeSkids`. */
  #skidDirty = false;
  /** Höchste je belegte Spur-Instanz + 1 — die Obergrenze für `count`. */
  #skidTop = 0;

  #skidStamp: CanvasTexture | null = null;
  #splashStamp: CanvasTexture | null = null;
  #skidMaterial: MeshBasicMaterial | null = null;
  #splashMaterial: MeshBasicMaterial | null = null;
  #skidGeometry: PlaneGeometry | null = null;
  #splashGeometry: PlaneGeometry | null = null;

  #active = false;

  attach(context: EngineContext): void {
    this.group.name = 'FahrzeugFX';
    this.group.visible = false;
    this.group.matrixAutoUpdate = false;

    this.#skidStamp = makeSkidStamp();
    this.#splashStamp = makeSplashStamp();
    context.resources.track(this.#skidStamp);
    context.resources.track(this.#splashStamp);

    const skidGeom = new PlaneGeometry(1, 1);
    skidGeom.rotateX(-Math.PI / 2);
    this.#skidGeometry = skidGeom;

    const fade = new Float32Array(FX_SKID_CAPACITY);
    const fadeAttr = new InstancedBufferAttribute(fade, 1);
    fadeAttr.setUsage(DynamicDrawUsage);
    skidGeom.setAttribute('aFade', fadeAttr);
    this.#skidFade = fade;
    this.#skidFadeAttr = fadeAttr;

    const skidMat = new MeshBasicMaterial({
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
      //
      // `MultiplyBlending` von three tut genau das (`ZeroFactor`/`SrcColorFactor`);
      // es ausdrücklich hinzuschreiben spart beim nächsten Lesen einen Blick in
      // die three-Quelle.
      blending: CustomBlending,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
      // **Kein Tonemapping.** Der Wert ist ein Faktor und keine Leuchtdichte;
      // durch eine Tonwertkurve gedreht wäre 0,38 nicht mehr 0,38.
      toneMapped: false,
    });
    skidMat.name = 'DriftspurMaterial';
    injectFade(skidMat);
    this.#skidMaterial = skidMat;

    const skid = new InstancedMesh(skidGeom, skidMat, FX_SKID_CAPACITY);
    skid.name = 'Driftspuren';
    skid.frustumCulled = false;
    skid.matrixAutoUpdate = false;
    skid.count = 0;
    skid.instanceMatrix.setUsage(DynamicDrawUsage);
    this.#scale.set(0, 0, 0);
    this.#pos.set(0, -50, 0);
    for (let i = 0; i < FX_SKID_CAPACITY; i++) {
      this.#matrix.compose(this.#pos, this.#quat.identity(), this.#scale);
      skid.setMatrixAt(i, this.#matrix);
      skid.setColorAt(i, this.#asphalt);
    }
    this.#skid = skid;
    this.group.add(skid);

    const splashGeom = new PlaneGeometry(1, 1);
    this.#splashGeometry = splashGeom;
    const splashMat = new MeshBasicMaterial({
      map: this.#splashStamp,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: true,
    });
    splashMat.name = 'SpritzerMaterial';
    this.#splashMaterial = splashMat;

    const splash = new InstancedMesh(splashGeom, splashMat, FX_SPLASH_CAPACITY);
    splash.name = 'Spritzer';
    splash.frustumCulled = false;
    splash.matrixAutoUpdate = false;
    splash.count = 0;
    splash.instanceMatrix.setUsage(DynamicDrawUsage);
    this.#color.setRGB(0, 0, 0);
    for (let i = 0; i < FX_SPLASH_CAPACITY; i++) {
      this.#matrix.compose(this.#pos, this.#quat.identity(), this.#scale);
      splash.setMatrixAt(i, this.#matrix);
      splash.setColorAt(i, this.#color);
    }
    splash.instanceColor?.setUsage(DynamicDrawUsage);
    this.#splash = splash;
    this.group.add(splash);

    context.scene.add(this.group);
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
    for (let i = this.#budget.splash; i < FX_SPLASH_CAPACITY; i++) this.#splashLife[i] = 0;
    // Der gezeichnete Bereich darf das neue Budget nicht überragen — sonst
    // zeichnet ein Wechsel auf Minimal weiter 256 Instanzen, von denen 224 nichts
    // tun. Sie wären zwar wirkungslos (Alterung null heißt Faktor 1, also keine
    // Dämpfung), aber bezahlt werden sie trotzdem.
    if (this.#skidTop > this.#budget.skids) this.#skidTop = this.#budget.skids;
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
    this.#splashLife.fill(0);
    this.#skidFade?.fill(0);
    this.#skidLive = 0;
    this.#splashLive = 0;
    this.#skidTop = 0;
    this.#skidDirty = false;
    this.#spawnAcc.fill(0);
    this.#prevDepth.fill(0);
    // **Auch die letzte Stempelstelle je Rad.** Sie steuert den Mindestabstand
    // (`SKID.spacing`); blieb sie stehen, unterdrückte sie nach einem Respawn am
    // anderen Ende der Karte genau einen Stempel — oder, schlimmer, keinen,
    // weil `#lastX === 0` als „noch nie gesetzt" gilt. Ein Zustand, der ein
    // Reset überlebt, tarnt sich als „nicht ganz reproduzierbar" (siehe
    // `Vehicle.respawn`).
    this.#lastX.fill(0);
    this.#lastZ.fill(0);
    if (this.#skid) this.#skid.count = 0;
    if (this.#splash) this.#splash.count = 0;
  }

  /**
   * Spuren und Spritzer fortschreiben.
   *
   * Läuft im **variablen** Schritt. Das ist Darstellung, nicht Physik — dieselbe
   * Trennung wie bei der Verfolgerkamera. Ein Spritzer, der bei 144 FPS drei
   * mal so oft integriert wird, fällt trotzdem gleich schnell: die Schwere
   * hängt an `dt`.
   */
  update(dt: number, vehicle: Vehicle, ground: Ground, camera: Camera, handbrake: boolean): void {
    if (!this.#active) return;
    // Ein langer Frame (Tab im Hintergrund, `shot()` nach einer Pause) darf
    // die Bahn nicht in einem Schritt löschen. 50 ms ist drei Physikschritte.
    const step = dt > 0.05 ? 0.05 : dt;

    this.#ageSkids(step);
    this.#ageSplash(step);
    this.#emit(step, vehicle, ground, handbrake);
    this.#writeSkids();
    this.#writeSplash(camera);

    const show = this.#skidLive > 0 || this.#splashLive > 0;
    this.group.visible = show;
  }

  get liveSkids(): number {
    return this.#skidLive;
  }

  get liveSplash(): number {
    return this.#splashLive;
  }

  dispose(): void {
    this.#skid?.dispose();
    this.#splash?.dispose();
    this.#skidGeometry?.dispose();
    this.#splashGeometry?.dispose();
    this.group.removeFromParent();
    this.#skidMaterial?.dispose();
    this.#splashMaterial?.dispose();
    this.#skidStamp?.dispose();
    this.#splashStamp?.dispose();
    this.#skid = null;
    this.#splash = null;
  }

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

      if (depth > SPLASH.minDepth && speed > SPLASH.minSpeed) {
        this.#emitSpray(i, wheel, vehicle, depth, speed, dt, prev, true);
      } else if (
        (surf === 'gelaende' || surf === 'kies') &&
        (speed > SPLASH.dustMinSpeed || slipMark)
      ) {
        this.#emitSpray(i, wheel, vehicle, 0.2, speed, dt, prev, false);
      }

      if (slipMark && depth < WATER_PHYS.wetThreshold && speed > 4) {
        this.#emitSkid(i, wheel, solidY, vehicle, surf);
      }
    }
  }

  #emitSkid(wheel: number, at: Vector3, groundY: number, vehicle: Vehicle, surface: Surface): void {
    const dx = at.x - this.#lastX[wheel]!;
    const dz = at.z - this.#lastZ[wheel]!;
    if (dx * dx + dz * dz < SKID.spacing * SKID.spacing && this.#lastX[wheel] !== 0) return;
    this.#lastX[wheel] = at.x;
    this.#lastZ[wheel] = at.z;

    const mesh = this.#skid;
    const fade = this.#skidFade;
    if (!mesh || !fade) return;

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
    // **Die Breite kommt aus dem Fahrzeug, nicht aus einer Konstanten.** Der
    // Lastwagen hat 0,30 m breite Räder gegen 0,21 m beim Coupé; eine feste
    // Stempelbreite ließe ihn eine Spur ziehen, die schmaler ist als sein Reifen.
    this.#scale.set(vehicle.spec.chassis.wheelWidth * SKID.widthPerTire, 1, SKID.length);
    this.#matrix.setPosition(this.#pos);
    this.#matrix.scale(this.#scale);
    mesh.setMatrixAt(slot, this.#matrix);
    // Drei Beläge, drei Dämpfungen — Herleitung und Messtabelle bei `SKID.asphalt`.
    // Wasser kommt hier nie an: der Aufrufer lässt eine Spur nur unterhalb
    // `WATER_PHYS.wetThreshold` zu, und darüber gibt es Spritzer statt Abrieb.
    mesh.setColorAt(
      slot,
      surface === 'asphalt' ? this.#asphalt : surface === 'kies' ? this.#gravel : this.#terrain,
    );

    // **Einen neu belegten Slot sofort als lebend zählen.** Ohne diese Zeile
    // steht der Zähler still: `#skidLive` wird nur in `#ageSkids` gebildet, und
    // `#ageSkids` steigt bei `#skidLive === 0` sofort aus. Einmal auf null, für
    // immer auf null — und `#writeSkids` schaltet das Mesh dann unsichtbar,
    // obwohl Stempel gesetzt werden.
    //
    // Gemessen im laufenden Bild, Handbremsdrift auf dem Ring: **32 lebende
    // Alterungswerte, `count` 0, `visible` false.** Kein Typfehler, keine
    // Ausnahme, kein Konsoleneintrag — die Spuren waren einfach weg. Genau die
    // Fehlerform aus CLAUDE.md („etwas ist nicht im Bild, und jede Zahl sagt, es
    // sei alles in Ordnung"), diesmal beim Einbau der Sparmaßnahme selbst
    // entstanden.
    if (this.#skidLife[slot]! <= 0) this.#skidLive++;
    this.#skidLife[slot] = SKID.life;
    fade[slot] = 1;
    // **Die Puffer werden nur hochgeladen, wenn sie sich geändert haben.** Vor
    // P18 stand `needsUpdate = true` bedingungslos in `#writeSkids`, also in
    // jedem Frame des Fahrmodus — 256 Matrizen (16 KB) plus 256 Farben (3 KB)
    // über den Bus, auch wenn niemand driftet. Matrix und Farbe eines Stempels
    // ändern sich **genau einmal**, nämlich hier.
    this.#skidDirty = true;
    if (slot >= this.#skidTop) this.#skidTop = slot + 1;
  }

  /**
   * Strahl unter dem Rad — Wasser oder Staub.
   *
   * Forza-Geometrie: Ursprung an der Aufstandsfläche, Geschwindigkeit nach
   * **außen** (weg von der Mitte) plus **hinten** plus etwas hoch. Die erste
   * Fassung spawnte über der Radmitte und erbte 45 % der Wagengeschwindigkeit —
   * im Bild klebten vier Kreise am Dach. Gemessen und verworfen.
   */
  #emitSpray(
    wheel: number,
    at: Vector3,
    vehicle: Vehicle,
    depth: number,
    speed: number,
    dt: number,
    prevDepth: number,
    water: boolean,
  ): void {
    const mesh = this.#splash;
    if (!mesh) return;

    const rear = wheel >= 2 ? SPLASH.rearBoost : 1;
    const wet = water ? Math.min(1, 0.35 + depth / 0.5) : 0.65;
    const pace = Math.min(1.35, speed / 16);
    const rate = (water ? SPLASH.rateAt20 : SPLASH.dustRateAt20) * pace * wet * rear * this.#budget.splashRate;
    this.#spawnAcc[wheel] = (this.#spawnAcc[wheel] ?? 0) + rate * dt;

    let burst = 0;
    if (water && prevDepth <= SPLASH.minDepth) {
      burst = Math.round(SPLASH.entryBurst * this.#budget.splashRate * rear);
    }

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

    while (this.#spawnAcc[wheel]! >= 1 || burst > 0) {
      if (this.#spawnAcc[wheel]! >= 1) this.#spawnAcc[wheel]! -= 1;
      else burst--;

      const slot = this.#splashCursor % this.#budget.splash;
      this.#splashCursor = slot + 1;

      const j = hash3(slot + wheel * 17);
      const j2 = hash3(slot + 91);
      this.#sx[slot] = at.x + onx * 0.12 + (j - 0.5) * 0.18;
      this.#sy[slot] = contactY + 0.04 + j2 * 0.08;
      this.#sz[slot] = at.z + onz * 0.12 + (hash3(slot + 3) - 0.5) * 0.18;

      const out = SPLASH.out + speed * SPLASH.outFromSpeed;
      const back = SPLASH.back + speed * SPLASH.backFromSpeed;
      const up = SPLASH.up + speed * SPLASH.upFromSpeed;
      this.#svx[slot] =
        vehicle.velocity.x * SPLASH.inherit + onx * out * (0.55 + j) + backX * back * (0.5 + j2);
      this.#svy[slot] = up * (0.45 + hash3(slot + 5) * 0.9) * (water ? 1 : 0.55);
      this.#svz[slot] =
        vehicle.velocity.z * SPLASH.inherit + onz * out * (0.55 + j2) + backZ * back * (0.5 + j);

      const life = SPLASH.life + (hash3(slot + 7) - 0.5) * 2 * SPLASH.lifeJitter;
      // Dieselbe Buchführung wie bei der Spur, und aus demselben Grund —
      // `#ageSplash` steigt bei null aus und käme sonst nie wieder hoch.
      if (this.#splashLife[slot]! <= 0) this.#splashLive++;
      this.#splashLife[slot] = life;
      this.#splashMax[slot] = life;
      this.#ssize[slot] = SPLASH.width + hash3(slot + 11) * SPLASH.widthJitter;
      this.#sLen[slot] = SPLASH.length + hash3(slot + 13) * SPLASH.lengthJitter * (0.6 + pace);

      if (water) this.#color.setRGB(0.82, 0.9, 0.96);
      else this.#color.setRGB(0.42, 0.3, 0.16);
      mesh.setColorAt(slot, this.#color);
    }
  }

  #ageSkids(dt: number): void {
    const fade = this.#skidFade;
    if (!fade) return;
    // Nichts am Leben heißt nichts zu tun. Der häufigste Fall beim Fahren ist
    // „keine Spur", und der kostet seit P18 einen Vergleich statt 256 Schleifen-
    // durchläufen plus einen Pufferupload.
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
      const u = next / SKID.life;
      fade[i] = u > 0.35 ? 1 : u / 0.35;
      live++;
    }
    this.#skidLive = live;
    if (this.#skidFadeAttr) this.#skidFadeAttr.needsUpdate = true;
  }

  #ageSplash(dt: number): void {
    if (this.#splashLive === 0) return;
    let live = 0;
    const cap = this.#budget.splash;
    for (let i = 0; i < cap; i++) {
      const life = this.#splashLife[i]!;
      if (life <= 0) continue;
      const next = life - dt;
      if (next <= 0) {
        this.#splashLife[i] = 0;
        continue;
      }
      this.#splashLife[i] = next;
      this.#svy[i] = this.#svy[i]! - SPLASH.gravity * dt;
      this.#sx[i] = this.#sx[i]! + this.#svx[i]! * dt;
      this.#sy[i] = this.#sy[i]! + this.#svy[i]! * dt;
      this.#sz[i] = this.#sz[i]! + this.#svz[i]! * dt;
      live++;
    }
    this.#splashLive = live;
  }

  /**
   * Die Spuren zeichnen — und dabei so wenig wie möglich hochladen.
   *
   * Drei Sparmaßnahmen aus P18, alle an derselben Beobachtung: **eine Driftspur
   * bewegt sich nicht.** Sie entsteht einmal, altert und verschwindet. Alles,
   * was je Frame über den Bus musste, war der Alterungswert — 256 Floats.
   *
   *  1. `instanceMatrix` und `instanceColor` gehen nur nach einem neuen Stempel
   *     hoch (`#skidDirty`), nicht in jedem Frame. Vor P18 waren das 16 KB + 3 KB
   *     je Frame, im Freiflug wie beim Geradeausfahren.
   *  2. `count` ist die höchste je belegte Instanz und nicht das Budget. Beim
   *     ersten Drift stehen drei Stempel und nicht 256; three verwirft die
   *     leeren zwar über die Nullskalierung, aber erst nach dem Vertex-Shader.
   *  3. Steht keine Spur, ist das Mesh unsichtbar und `count` null.
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
      this.#skidDirty = false;
    }
    mesh.visible = this.#skidLive > 0;
  }

  #writeSplash(camera: Camera): void {
    const mesh = this.#splash;
    if (!mesh) return;
    // Ein Spritzer **fliegt** — anders als die Spur muss seine Matrix je Frame
    // neu, solange er lebt. Was sich sparen lässt, ist der Durchgang, wenn
    // keiner lebt: das ist beim Fahren auf trockenem Asphalt immer.
    if (this.#splashLive === 0) {
      if (mesh.count !== 0) {
        mesh.count = 0;
        mesh.visible = false;
      }
      return;
    }
    const cap = this.#budget.splash;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;

    for (let i = 0; i < cap; i++) {
      const life = this.#splashLife[i]!;
      if (life <= 0) {
        this.#scale.set(0, 0, 0);
        this.#matrix.compose(this.#pos.set(0, -80, 0), this.#quat.identity(), this.#scale);
        mesh.setMatrixAt(i, this.#matrix);
        continue;
      }
      const max = this.#splashMax[i]! || SPLASH.life;
      const u = life / max;
      const fade = u > 0.4 ? 1 : u / 0.4;
      const px = this.#sx[i]!;
      const py = this.#sy[i]!;
      const pz = this.#sz[i]!;
      const vx = this.#svx[i]!;
      const vy = this.#svy[i]!;
      const vz = this.#svz[i]!;
      const flen = Math.hypot(vx, vy, vz) || 1;
      this.#forward.set(vx / flen, vy / flen, vz / flen);
      this.#look.set(cx - px, cy - py, cz - pz);
      this.#right.crossVectors(this.#look, this.#forward);
      if (this.#right.lengthSq() < 1e-8) {
        camera.getWorldQuaternion(this.#quat);
        this.#scale.set(this.#ssize[i]! * fade, this.#sLen[i]! * fade, 1);
        this.#matrix.compose(this.#pos.set(px, py, pz), this.#quat, this.#scale);
      } else {
        this.#right.normalize();
        this.#up.crossVectors(this.#forward, this.#right);
        this.#matrix.makeBasis(this.#right, this.#forward, this.#up);
        this.#scale.set(
          this.#ssize[i]! * (0.65 + fade * 0.55),
          this.#sLen[i]! * (0.55 + fade * 0.7),
          1,
        );
        this.#matrix.scale(this.#scale);
        this.#matrix.setPosition(px, py, pz);
      }
      mesh.setMatrixAt(i, this.#matrix);
    }
    mesh.count = this.#splashLive > 0 ? cap : 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = this.#splashLive > 0;
  }
}

/**
 * Alterung und Stempelmaske in die Dämpfung einrechnen.
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
 * Nach `<color_fragment>` steht in `diffuseColor` genau das Richtige: `rgb` ist
 * der Dämpfungsfaktor aus `setColorAt`, `a` die Form aus dem Stempel.
 *
 * **`setColorAt` schreibt linear.** `new Color(0x635f66)` rechnet den Wert von
 * sRGB nach linear um (0,388 → 0,126), und die Mischung findet im linearen
 * Zielpuffer statt. Das ist genau richtig und kein Zufall: ein Faktor von 0,126
 * im Linearen ist ein *wahrgenommener* Helligkeitsanteil von 0,388. Die
 * Verhältnisse in `SKID` sind damit perzeptuell zu lesen — so, wie man eine
 * Farbe im Farbwähler auch wählt.
 */
function injectFade(material: MeshBasicMaterial): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
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

function makeSkidStamp(): CanvasTexture {
  const w = 32;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('VehicleFx: kein 2D-Kontext für die Driftspur.');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const along = Math.sin(v * Math.PI);
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      const across = Math.max(0, 1 - u * u);
      const a = across * across * along;
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 220);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.name = 'DriftspurStempel';
  tex.needsUpdate = true;
  return tex;
}

function makeSplashStamp(): CanvasTexture {
  const w = 32;
  const h = 96;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('VehicleFx: kein 2D-Kontext für den Spritzer.');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const along = Math.sin(v * Math.PI);
    const tip = v < 0.15 ? v / 0.15 : 1;
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      const across = Math.max(0, 1 - u * u);
      const a = across * across * along * tip;
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 230);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.name = 'SpritzerStempel';
  tex.needsUpdate = true;
  return tex;
}

/** Deterministischer Jitter ohne `Math.random` — FX dürfen die Physik nicht anfassen. */
function hash3(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
