import {
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  MathUtils,
  PMREMGenerator,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three';

import { FALLBACK_SUN, LIGHTING, type SunData } from '@/config/lighting.config';
import { QUALITY, DEFAULT_QUALITY } from '@/config/quality.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import type { LookState } from '@/render/looks/lookState';
import { HDRI_ASSETS } from '@/world/terrainAssets';

/**
 * Himmel, IBL und Sonne — PLAN.md P1 / 1.6.
 *
 * Zwei HDRIs: eines als sichtbarer Himmel, eines als Lichtquelle. Die Sonne
 * ist eine einzelne DirectionalLight, deren Richtung aus dem Himmels-HDRI
 * gemessen wurde (tools/hdri-sun.mjs) — geraten passt sie nie, und das Auge
 * sieht den Fehler sofort, auch wenn es ihn nicht benennen kann.
 */
export class LightingRig implements System {
  readonly name = 'LightingRig';

  #scene: Scene | null = null;
  #camera: PerspectiveCamera | null = null;
  #light: DirectionalLight | null = null;

  readonly #sunDirection = new Vector3();
  readonly #focus = new Vector3();
  #sun: SunData = FALLBACK_SUN;
  #shadowTexelSize = 1;

  readonly #readouts = {
    richtung: '—',
  };

  /** Siehe TerrainSystem: der Block kommt beim Konstruieren, nicht per Ereignis. */
  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  async init(context: EngineContext): Promise<void> {
    this.#scene = context.scene;
    this.#camera = context.camera;

    const [sky, ibl, sun] = await Promise.all([
      context.resources.hdri(HDRI_ASSETS.sky),
      context.resources.hdri(HDRI_ASSETS.ibl),
      context.resources
        .json<SunData>(HDRI_ASSETS.sun)
        .catch((): SunData => {
          console.warn('Sonnendaten nicht ladbar — Rückfallwerte aus lighting.config.ts.');
          return FALLBACK_SUN;
        }),
    ]);
    this.#sun = sun;

    sky.mapping = EquirectangularReflectionMapping;
    context.scene.background = sky;
    context.scene.backgroundIntensity = LIGHTING.skyIntensity;

    // PMREM einmalig: die gefilterte Umgebungskarte ist das, was die
    // Materialien tatsächlich abtasten. Die Quelltextur wird danach nicht mehr
    // gebraucht und gibt 16 MB frei.
    const pmrem = new PMREMGenerator(context.renderer);
    const environment = pmrem.fromEquirectangular(ibl);
    pmrem.dispose();
    context.resources.releaseHdri(HDRI_ASSETS.ibl, ibl);

    context.scene.environment = context.resources.track(environment).texture;
    context.scene.environmentIntensity = LIGHTING.environmentIntensity;

    this.#light = this.#createSun();
    context.scene.add(this.#light, this.#light.target);

    context.bus.on('look:apply', ({ look }) => {
      this.#applyLook(look);
    });
    context.bus.on('look:collect', ({ target }) => {
      this.#collectLook(target);
    });
    context.bus.on('quality:changed', ({ level }) => {
      this.#setShadowMapSize(QUALITY[level].shadowMapSize);
    });

    this.#registerDebug(context);
  }

  #applyLook(look: LookState): void {
    const light = this.#light;
    if (!light) return;
    light.intensity = look.lighting.sunIntensity;
    light.color.set(look.lighting.sunColorHex);
    this.#setElevation(look.lighting.sunElevationDeg);
    if (this.#scene) {
      this.#scene.environmentIntensity = look.lighting.environmentIntensity;
      this.#scene.backgroundIntensity = look.lighting.skyIntensity;
    }
  }

  #collectLook(target: LookState): void {
    const light = this.#light;
    if (light) {
      target.lighting.sunIntensity = light.intensity;
      target.lighting.sunColorHex = `#${light.color.getHexString()}`;
    }
    target.lighting.sunElevationDeg = this.atmosphere.uAtmoSunElevationDeg.value;
    if (this.#scene) {
      target.lighting.environmentIntensity = this.#scene.environmentIntensity;
      target.lighting.skyIntensity = this.#scene.backgroundIntensity;
    }
  }

  #createSun(): DirectionalLight {
    const light = new DirectionalLight(new Color(LIGHTING.sunColor), LIGHTING.sunIntensity);
    light.name = 'Sonne';
    light.castShadow = LIGHTING.castShadow;

    const size = QUALITY[DEFAULT_QUALITY].shadowMapSize;
    light.shadow.mapSize.set(size, size);

    const { radius, distance, depth, bias, normalBias } = LIGHTING.shadow;
    const shadowCamera = light.shadow.camera;
    shadowCamera.left = -radius;
    shadowCamera.right = radius;
    shadowCamera.top = radius;
    shadowCamera.bottom = -radius;
    shadowCamera.near = 1;
    shadowCamera.far = distance + depth;
    shadowCamera.updateProjectionMatrix();

    light.shadow.bias = bias;
    // normalBias verschiebt den Abtastpunkt entlang der Flächennormale statt
    // in der Tiefe. Bei einer sehr flach stehenden Sonne ist das der einzige
    // Bias, der Selbstverschattungs-Artefakte auf großen Flächen wegbekommt,
    // ohne die Schatten von ihren Objekten zu lösen.
    light.shadow.normalBias = normalBias;

    this.#shadowTexelSize = (2 * radius) / size;
    this.#applySunDirection();
    return light;
  }

  /**
   * Auflösung der Shadow-Map umstellen (P7 / 7.1).
   *
   * `mapSize` allein reicht nicht: three legt die Textur beim ersten Gebrauch an
   * und schaut danach nicht mehr auf die Größe. Die alte muss weg, sonst bleibt
   * sie im Speicher **und** im Bild — der Wechsel wäre wirkungslos und würde
   * dabei noch Texturspeicher liegen lassen.
   *
   * Wirkt nur, solange Echtzeit-Schatten überhaupt an sind; seit P2 sind sie das
   * nicht (siehe `LIGHTING.castShadow`). Der Aufruf steht trotzdem hier und
   * nicht hinter einer Abfrage: wer den Schalter im Panel umlegt, soll die
   * Auflösung der eingestellten Stufe bekommen und nicht die vom Programmstart.
   */
  #setShadowMapSize(size: number): void {
    const light = this.#light;
    if (!light || light.shadow.mapSize.x === size) return;

    light.shadow.mapSize.set(size, size);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    this.#shadowTexelSize = (2 * LIGHTING.shadow.radius) / size;
  }

  #applySunDirection(): void {
    const [x, y, z] = this.#sun.direction;
    this.#sunDirection.set(x, y, z).normalize();
    this.#publishSun(MathUtils.radToDeg(Math.asin(this.#sunDirection.y)));
  }

  /**
   * Sonnenhöhe neu setzen — Azimut bleibt.
   *
   * Der Azimut ist in `shade.png` eingebacken und lässt sich zur Laufzeit nicht
   * ändern, ohne dass Licht und Schatten auseinanderlaufen. Die **Höhe**
   * dagegen wird erst im Shader gegen den gebackenen Horizontwinkel verglichen
   * und darf deshalb am Regler hängen.
   */
  #setElevation(elevationDeg: number): void {
    const azimuth = MathUtils.degToRad(this.#sun.azimuthDeg);
    const elevation = MathUtils.degToRad(elevationDeg);
    // Azimut zählt von Norden (-Z) im Uhrzeigersinn — dieselbe Konvention
    // wie in tools/hdri-sun.mjs.
    this.#sunDirection
      .set(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        -Math.cos(azimuth) * Math.cos(elevation),
      )
      .normalize();
    this.#publishSun(elevationDeg);
  }

  /** Die Atmosphäre braucht Richtung und Höhe — Nebel und Verschattung hängen daran. */
  #publishSun(elevationDeg: number): void {
    this.atmosphere.uAtmoSunDirection.value.copy(this.#sunDirection);
    this.atmosphere.uAtmoSunElevationDeg.value = elevationDeg;
    this.#readouts.richtung =
      `${elevationDeg.toFixed(1)}° über Horizont, ${this.#sun.azimuthDeg.toFixed(0)}° von N`;
  }

  /**
   * Die Schattenkamera folgt dem Betrachter.
   *
   * Sie deckt nur 700 m ab — eine Karte über die ganzen 3 km hätte bei 2048²
   * anderthalb Meter pro Texel, und damit hätte jede Geländekante eine
   * Treppe. Kaskaden, die beides können, kommen in P2.
   *
   * Der Fokus wird auf das Texelraster gerundet. Ohne diese Rundung wandert
   * das Schattenraster mit der Kamera mit, und die Schattenkanten kriechen
   * bei jeder Bewegung sichtbar über den Boden — ein Effekt, der beim Fliegen
   * mehr stört als eine niedrige Auflösung.
   */
  update(): void {
    const light = this.#light;
    const camera = this.#camera;
    if (!light || !camera) return;

    const texel = this.#shadowTexelSize;
    this.#focus.set(
      Math.round(camera.position.x / texel) * texel,
      Math.round(camera.position.y / texel) * texel,
      Math.round(camera.position.z / texel) * texel,
    );

    light.target.position.copy(this.#focus);
    light.target.updateMatrixWorld();
    light.position.copy(this.#focus).addScaledVector(this.#sunDirection, LIGHTING.shadow.distance);
    light.updateMatrixWorld();
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Licht');
    const light = this.#light;
    if (!folder || !light) return;

    folder.addBinding(this.#readouts, 'richtung', { readonly: true, label: 'Sonnenstand' });
    folder.addBinding(light, 'intensity', {
      label: 'Sonne',
      min: 0,
      max: 12,
      step: 0.05,
    });
    folder.addBinding(light, 'color', { label: 'Sonnenfarbe', color: { type: 'float' } });
    folder.addBinding(light, 'castShadow', { label: 'Schatten' });

    const scene = context.scene;
    folder.addBinding(scene, 'environmentIntensity', {
      label: 'Umgebungslicht',
      min: 0,
      max: 4,
      step: 0.01,
    });
    folder.addBinding(scene, 'backgroundIntensity', {
      label: 'Himmel',
      min: 0,
      max: 4,
      step: 0.01,
    });

    // Gemessene Richtung gegen von Hand gesetzte: der schnellste Weg zu sehen,
    // ob der Extraktor recht hat. Seit P2 verschiebt der Regler zugleich die
    // Schattengrenze — der Vergleich mit dem gebackenen Horizont läuft live mit.
    folder
      .addBinding({ hoehe: this.#sun.elevationDeg }, 'hoehe', {
        label: 'Höhe über Horizont',
        min: -5,
        max: 80,
        step: 0.1,
      })
      .on('change', (event) => {
        this.#setElevation(event.value);
      });
  }

  dispose(): void {
    const scene = this.#scene;
    if (this.#light && scene) {
      scene.remove(this.#light, this.#light.target);
      this.#light.shadow.dispose();
      this.#light.dispose();
      this.#light = null;
    }
    if (scene) {
      scene.background = null;
      scene.environment = null;
    }
    this.#scene = null;
    this.#camera = null;
  }
}
