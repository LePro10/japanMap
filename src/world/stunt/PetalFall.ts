import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
  type Scene,
} from 'three';

import { DRIFT_ZONES } from '@/config/stunt.config';

/**
 * Fallende Kirschblüten über den Driftzonen — P24.
 *
 * ## Warum das ein Shader ist und keine Schleife
 *
 * 900 Blütenblätter, jedes mit Fallen, Drehen und Schweben — auf der CPU wären
 * das 900 Matrizen je Frame plus ein Hochladen des ganzen Instanzpuffers. Das
 * ist gemessen der teuerste Posten, den ein Effekt dieser Größe haben kann; die
 * Vegetation dieses Projekts löst dasselbe Problem seit P4 genauso
 * (`vegetation_wind.vert.glsl`).
 *
 * Hier steht deshalb **nichts** je Frame an, außer einer Uniform: der Zeit. Die
 * Bahn eines Blattes ist eine geschlossene Funktion seiner Kennzahl und der
 * Zeit, und der Vertex-Shader rechnet sie aus.
 *
 * ```
 *   y      = Deckenhöhe − mod(t · Sinkrate + Versatz, Fallhöhe)
 *   x, z   = Startpunkt + Schwingung(t, Kennzahl)
 *   Drehung= t · Drehrate
 * ```
 *
 * Der `mod` ist der ganze Trick: das Blatt fällt, und wenn es unten ankommt,
 * fängt es oben wieder an. Es gibt keinen Zustand, keine Wiedergeburt, keine
 * Liste toter Instanzen — und damit auch keine der Fehlerklassen, die
 * `VehicleFx` in P18 einen unsichtbaren Effekt gekostet hat (»wer einen Zähler
 * mit einem Frühausstieg schützt, muss prüfen, wer ihn wieder hochzählt«).
 *
 * ## Warum sie nicht überall fallen
 *
 * Blüten über der ganzen Karte wären 9,4 km² Partikel — und außerdem falsch:
 * Kirschbäume stehen hier nur an den Driftzonen. Sie fallen deshalb in genau
 * den beiden Zylindern, in denen auch die Bäume stehen. Das ist zugleich die
 * zweite Anzeige der Zone: man fährt hinein, und es schneit rosa.
 *
 * ## Was sie kosten
 *
 * Ein Draw-Call, 900 Instanzen à 2 Dreiecke, kein Tiefenschreiben, keine
 * Beleuchtung. Der Vertex-Shader rechnet zwei Sinus je Blatt.
 */

/** Blütenblätter je Zone. */
const PER_ZONE = 380;
/** Fallhöhe — von dort oben fallen sie, dorthin kehren sie zurück. */
const FALL_HEIGHT = 26;
/** Sinkrate in m/s. Ein Kirschblütenblatt fällt gemächlich. */
const SINK = 1.1;
/** Kantenlänge eines Blattes, m. */
const PETAL_SIZE = 0.18;

const VERT = /* glsl */ `
attribute vec3 seed;      // x: Startphase, y: Schwingung, z: Drehrate
attribute vec3 anchor;    // Startpunkt in der Welt (Boden)
varying float vFade;

uniform float uTime;
uniform float uFall;
uniform float uSink;
uniform float uSize;

void main() {
  // **Der Fall als Rest einer Division.** Kein Zustand, keine Wiedergeburt —
  // Begründung im Kopf der Datei.
  float drop = mod(uTime * uSink + seed.x * uFall, uFall);
  vec3 world = anchor;
  world.y += uFall - drop;

  // Schweben. Zwei Sinus mit teilerfremden Frequenzen, damit die Bahn nicht
  // periodisch aussieht; die Amplitude wächst mit der Fallhöhe, weil ein Blatt
  // hoch oben mehr Wind hat als eines kurz über dem Boden.
  float sway = (uFall - drop) * 0.06 + 0.4;
  world.x += sin(uTime * 0.7 + seed.y * 6.283) * sway;
  world.z += cos(uTime * 0.53 + seed.y * 6.283) * sway;

  // Billboard: das Blatt steht immer zur Kamera. Der Weg über die
  // Modelview-Matrix ist der billigste — die Kameraachsen stehen dort als
  // Spalten, man muss sie nur nicht mitdrehen.
  vec4 center = modelViewMatrix * vec4(world, 1.0);
  float turn = uTime * seed.z;
  float c = cos(turn);
  float s = sin(turn);
  vec2 quad = vec2(
    position.x * c - position.y * s,
    position.x * s + position.y * c
  ) * uSize;
  center.xy += quad;

  // Am Boden ausblenden, damit kein Blatt im Gras verschwindet.
  vFade = smoothstep(0.0, 2.5, drop) * (1.0 - smoothstep(uFall - 3.0, uFall, drop));
  gl_Position = projectionMatrix * center;
}
`;

const FRAG = /* glsl */ `
precision mediump float;
varying float vFade;
uniform vec3 uColor;

void main() {
  // Ohne Textur: ein rosa Fleck von 18 cm ist auf 30 m Entfernung zwei Pixel
  // groß, und zwei Pixel brauchen keine Blütenform. Dieselbe Rechnung, mit der
  // die Vegetation dieses Projekts ohne Albedo-Texturen auskommt (SPEC,
  // Leitprinzip).
  //
  // > **Additiv war der erste Entwurf, und ein Bild hat ihn verworfen.** 900
  // > Blätter, die sich überlagern, addieren sich auf Weiß — und der Bloom der
  // > PostFX-Kette macht daraus zwei Scheinwerfer mitten in der Landschaft.
  // > Genau die Fehlerform, die CLAUDE.md unter „es war im Bild, nur als etwas
  // > anderes" führt: jede Zahl stimmte (900 Instanzen, ein Draw-Call, volles
  // > Bild), und im Bild standen zwei weiße Blasen.
  gl_FragColor = vec4(uColor, vFade * 0.55);
}
`;

export class PetalFall {
  #mesh: Mesh | null = null;
  #material: ShaderMaterial | null = null;
  #time = 0;

  /**
   * Aufbauen. `heightAt` liefert den Boden — die Blüten fallen relativ dazu,
   * nicht auf eine feste Höhe.
   */
  build(scene: Scene, heightAt: (x: number, z: number) => number): void {
    const count = DRIFT_ZONES.length * PER_ZONE;
    const anchors = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);

    let i = 0;
    for (const zone of DRIFT_ZONES) {
      for (let k = 0; k < PER_ZONE; k++) {
        // Gleichverteilt in der Kreisfläche: die Wurzel ist nötig, sonst
        // drängen sich alle Blätter in der Mitte. Deterministisch aus dem
        // Index — eine Karte, die bei jedem Laden anders aussieht, ist eine
        // Karte, in der niemand einen Ort wiedererkennt.
        const a = hash(k * 1.7, zone.x) * Math.PI * 2;
        const r = zone.radius * Math.sqrt(hash(k * 3.1, zone.z));
        const x = zone.x + Math.cos(a) * r;
        const z = zone.z + Math.sin(a) * r;
        anchors[i * 3] = x;
        anchors[i * 3 + 1] = heightAt(x, z);
        anchors[i * 3 + 2] = z;
        seeds[i * 3] = hash(k * 5.3, zone.x + 11);
        seeds[i * 3 + 1] = hash(k * 7.9, zone.z - 7);
        seeds[i * 3 + 2] = 0.6 + hash(k * 2.3, zone.x + zone.z) * 1.8;
        i++;
      }
    }

    const geometry = new InstancedBufferGeometry();
    // Ein Quadrat als zwei Dreiecke, in Blattkoordinaten (−0,5…0,5).
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- Eckpunkte.
        Float32Array.from([
          -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
        ]),
        3,
      ),
    );
    geometry.setAttribute('anchor', new InstancedBufferAttribute(anchors, 3));
    geometry.setAttribute('seed', new InstancedBufferAttribute(seeds, 3));
    geometry.instanceCount = count;
    // **Die Hüllkugel von Hand.** Der Vertex-Shader verschiebt jedes Blatt, und
    // three weiß davon nichts — eine gerechnete Hüllkugel wäre die der
    // Ankerpunkte und schnitte die fallenden Blätter oben ab. Dieselbe Falle
    // wie beim `InstancedMesh` der Räder (P14), nur andersherum: dort wurde
    // Culling abgeschaltet, hier bekommt es die richtige Kugel.
    geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 3000);

    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uFall: { value: FALL_HEIGHT },
        uSink: { value: SINK },
        uSize: { value: PETAL_SIZE },
        uColor: { value: new Vector3(0.98, 0.78, 0.86) },
      },
      transparent: true,
      depthWrite: false,
    });
    this.#material = material;

    const mesh = new Mesh(geometry, material);
    mesh.name = 'Kirschblüten';
    mesh.frustumCulled = false;
    this.#mesh = mesh;
    scene.add(mesh);
  }

  /**
   * Die Zeit weiterdrehen.
   *
   * Läuft im **variablen** Schritt: Blütenblätter sind Darstellung und dürfen
   * mit der Bildrate laufen. Dieselbe Begründung wie bei der Verfolgerkamera.
   */
  update(dt: number): void {
    if (!this.#material) return;
    this.#time += dt;
    this.#material.uniforms.uTime!.value = this.#time;
  }

  dispose(): void {
    this.#mesh?.removeFromParent();
    this.#mesh?.geometry.dispose();
    this.#material?.dispose();
    this.#mesh = null;
    this.#material = null;
  }
}

/** Deterministisch aus zwei Zahlen, 0…1. Wie in `StuntSystem`. */
function hash(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
