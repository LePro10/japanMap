import {
  BackSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  type PerspectiveCamera,
  type Scene,
  type Texture,
} from 'three';

import { CLOUDS, CLOUD_DOME } from '@/config/atmosphere.config';
import { CAMERA } from '@/config/world.config';
import fragmentShader from './cloud_dome.frag.glsl';
import vertexShader from './cloud_dome.vert.glsl';

/**
 * Ziehende Wolkenschicht — PLAN.md P8.4, Teil 2.
 *
 * ## Warum eine große Kugel und keine kleine
 *
 * Der naheliegende Aufbau ist eine Einheitskugel um die Kamera, ohne
 * Tiefentest, ganz vorn gezeichnet. Das geht hier **nicht**, und der Grund ist
 * die Sortierung: das Material ist halbtransparent, three steckt es damit in
 * die Transparenz-Liste, und die wird **nach** allen undurchsichtigen Objekten
 * gezeichnet. Ohne Tiefentest stünden die Wolken dann vor dem Gelände.
 *
 * Also andersherum: die Kugel bekommt einen Radius knapp innerhalb der
 * Far-Ebene und einen echten Tiefentest. Damit verdeckt jede Geometrie sie
 * korrekt, und der Tiefenpuffer erledigt, was die Sortierung nicht kann.
 * `depthWrite` bleibt aus — die Kuppel soll nichts verdecken, was nach ihr
 * kommt.
 *
 * ## Warum sie der Kamera folgt
 *
 * Eine ortsfeste Kuppel hätte einen Rand, und der stünde bei 3072 m Weltgröße
 * regelmäßig im Bild. Mitgeführt ist sie unendlich weit weg — dieselbe
 * Konvention wie beim Himmel selbst. Die **Wolken** bewegen sich trotzdem
 * gegenüber der Welt, weil die Projektion im Shader von der Weltposition der
 * Kamera ausgeht und nicht von der Kuppel.
 */
export class CloudDome {
  readonly mesh: Mesh;
  readonly #material: ShaderMaterial;
  readonly #geometry: SphereGeometry;

  constructor(cloudMap: Texture, skyLut: Texture) {
    // Knapp innerhalb der Far-Ebene: weiter weg würde die Kuppel weggeclippt,
    // näher käme sie irgendwann vor einen Berg.
    const radius = CAMERA.far * 0.92;

    // 32 × 16 Segmente. Die Kuppel trägt keine eigene Form — alles Sichtbare
    // entsteht im Fragment-Shader —, sie muss nur den Blickkegel lückenlos
    // füllen. Feiner unterteilt kostete Dreiecke ohne jeden Gegenwert.
    this.#geometry = new SphereGeometry(radius, 32, 16);

    this.#material = new ShaderMaterial({
      name: 'CloudDomeMaterial',
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: BackSide,
      uniforms: {
        uCloudMap: { value: cloudMap },
        uSkyLut: { value: skyLut },
        uTime: { value: 0 },
        uCloudDome: {
          value: new Vector4(
            CLOUD_DOME.height,
            CLOUD_DOME.coverage,
            CLOUD_DOME.softness,
            CLOUD_DOME.opacity,
          ),
        },
        uCloudTile: {
          value: new Vector4(
            CLOUD_DOME.tileMeters[0],
            CLOUD_DOME.tileMeters[1],
            CLOUD_DOME.speed[0],
            CLOUD_DOME.speed[1],
          ),
        },
        // Dieselbe Richtung wie der Bodenschatten. Zögen sie auseinander, wäre
        // der Widerspruch schlimmer als gar keine Wolkenebene.
        uCloudDirection: {
          value: new Vector2(CLOUDS.direction[0], CLOUDS.direction[1]).normalize(),
        },
        uCloudFade: { value: new Vector2(CLOUD_DOME.fadeStart, CLOUD_DOME.fadeEnd) },
        uCameraWorld: { value: new Vector3() },
      },
    });

    this.mesh = new Mesh(this.#geometry, this.#material);
    this.mesh.name = 'Wolken';
    // Die Kuppel umschließt die Kamera immer — ein Frustum-Test darauf kann nur
    // falsch ausgehen, weil ihre Hülle mit der Kamera wandert.
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    // Vor allem anderen Halbtransparenten: Wasser und Vegetation sollen über
    // den Wolken liegen, nicht darunter.
    this.mesh.renderOrder = -1;
  }

  get uniforms(): ShaderMaterial['uniforms'] {
    return this.#material.uniforms;
  }

  /** Deckkraft — 0 schaltet die Ebene ab und ist der Bezugspunkt jeder Messung. */
  get opacity(): number {
    return (this.#material.uniforms.uCloudDome?.value as Vector4).w;
  }

  set opacity(value: number) {
    (this.#material.uniforms.uCloudDome?.value as Vector4).w = value;
    this.mesh.visible = value > 0;
  }

  add(scene: Scene): void {
    scene.add(this.mesh);
  }

  update(camera: PerspectiveCamera, time: number): void {
    if (!this.mesh.visible) return;
    this.mesh.position.copy(camera.position);
    this.mesh.updateMatrix();
    this.mesh.updateMatrixWorld(true);
    (this.#material.uniforms.uCameraWorld?.value as Vector3).copy(camera.position);
    const uTime = this.#material.uniforms.uTime;
    if (uTime) uTime.value = time;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.#geometry.dispose();
    this.#material.dispose();
  }
}
