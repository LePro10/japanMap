import { CanvasTexture, DoubleSide, MeshStandardMaterial, RepeatWrapping, type IUniform } from 'three';

/**
 * Oberflächen für den Wago-Baukasten — ohne UVs, ohne Texturen je Haus.
 *
 * Warum überhaupt: die erste Fassung von Funaura war reine Vertexfarbe. Aus
 * dem Auto ging das, zu Fuß aus zwei Metern sah jedes Brett, jeder Stein und
 * jedes Dach aus wie lackiertes Plastik. Tokio löst das mit gemalten Atlanten
 * pro Fassade; für verwittertes Holz und Stein reicht eine billigere Frage:
 * *wie sähe diese Fläche nach dreißig Jahren Seeluft aus?*
 *
 * Eine einzige 256²-Rauschtextur, triplanar in Weltkoordinaten abgetastet:
 * - Fleckigkeit in zwei Maßstäben (0,4 m und 3 m),
 * - auf senkrechten Flächen eine gestreckte Abtastung als Maserung und Regenspuren,
 * - an der Wasserlinie (Welt-y < 0,6) ein dunkles Algen- und Salzband.
 * Kosten: drei Texturzugriffe je Pixel, kein zusätzlicher Draw-Call.
 */
let noise: CanvasTexture | null = null;
function noiseTexture(): CanvasTexture {
  if (noise) return noise;
  const N = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = N;
  const g = canvas.getContext('2d')!, img = g.createImageData(N, N);
  // Kachelbares Wertrauschen, vier Oktaven — R: Flecken, G: feines Korn, B: Streifen.
  const lattice = (size: number, seed: number): Float32Array => {
    const a = new Float32Array(size * size); let s = seed;
    for (let i = 0; i < a.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; a[i] = s / 4294967296; }
    return a;
  };
  const sample = (a: Float32Array, size: number, x: number, y: number): number => {
    const fx = x * size / N, fy = y * size / N, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (i: number, j: number): number => a[((j % size + size) % size) * size + ((i % size + size) % size)]!;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  };
  const oct = [4, 8, 16, 32, 64].map((size, i) => ({ size, a: lattice(size, 0x51 + i * 977) }));
  const streak = lattice(128, 0xabc);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, amp = 0.5, total = 0;
    for (const o of oct.slice(0, 4)) { v += sample(o.a, o.size, x, y) * amp; total += amp; amp *= 0.5; }
    const grain = sample(oct[4]!.a, 64, x, y);
    // Streifen: in y kaum veränderlich, in x fein — auf Holz Maserung, auf Putz Regenläufer.
    const st = sample(streak, 128, x, y / 16);
    const i = (y * N + x) * 4;
    img.data[i] = Math.round(v / total * 255); img.data[i + 1] = Math.round(grain * 255); img.data[i + 2] = Math.round(st * 255); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noise = new CanvasTexture(canvas); noise.wrapS = noise.wrapT = RepeatWrapping;
  return noise;
}

export interface WeatherOptions {
  roughness?: number; metalness?: number; strength?: number; doubleSide?: boolean;
  /**
   * Stroh (Gassho, Kayabuki): Halme entlang der Falllinie jeder Dachfläche und
   * Moospolster auf den nach oben zeigenden Flächen. Ohne das liest sich eine
   * 60°-Fläche von 12 m als brauner Karton.
   */
  thatch?: boolean;
  /**
   * Eigenhelligkeit als Anteil der eigenen Farbe (warm getönt). Für Innenräume:
   * ein fester Emissive-Wert wüsche alle Farben gleich aus, ein Anteil der Albedo
   * hält dunkles Holz dunkel und Tatami hell. 0 = aus.
   */
  lift?: number;
  /**
   * Namako-kabe (Koedo, Kurashiki): quadratische Schieferfliesen, um 45° gedreht,
   * mit erhabenen weißen Kalkfugen. Das Muster entsteht im Shader aus der
   * Weltposition in der Wandebene — gilt für jede Wandrichtung, ohne UVs, und
   * bleibt aus der Nähe scharf. Die Vertexfarbe ist die Fugenfarbe (Kalk).
   */
  namako?: boolean;
}

/** Vertexfarbe × Verwitterung. `strength` 1 = Holz/Stein am Meer, 0,4 = Lack. */
export function weatheredMaterial(o: WeatherOptions = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.86, metalness: o.metalness ?? 0 });
  if (o.doubleSide) m.side = DoubleSide;
  const strength = o.strength ?? 1;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWeatherNoise = { value: noiseTexture() };
    shader.uniforms.uWeatherStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        wp4 = modelMatrix * wp4;
        vWPos = wp4.xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uWeatherNoise;
        uniform float uWeatherStrength;
        varying vec3 vWPos;
        varying vec3 vWNrm;
        vec3 wTri(vec3 p, vec3 n, float s) {
          vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
          return texture2D(uWeatherNoise, p.zy * s).rgb * w.x + texture2D(uWeatherNoise, p.xz * s).rgb * w.y + texture2D(uWeatherNoise, p.xy * s).rgb * w.z;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vWNrm);
          vec3 big = wTri(vWPos, n, 0.045);
          vec3 fine = wTri(vWPos, n, 0.55);
          float vertical = 1.0 - abs(n.y);
          // Maserung/Regenläufer nur auf senkrechten Flächen: gestreckt entlang y.
          vec2 sp = abs(n.x) > abs(n.z) ? vec2(vWPos.z * 1.9, vWPos.y * 0.09) : vec2(vWPos.x * 1.9, vWPos.y * 0.09);
          float streak = texture2D(uWeatherNoise, sp).b;
          float f = 1.0 + ((big.r - 0.5) * 0.34 + (fine.g - 0.5) * 0.22 + (streak - 0.5) * 0.26 * vertical) * uWeatherStrength;
          diffuseColor.rgb *= f;
          // Algen- und Salzband an der Wasserlinie.
          float wet = smoothstep(0.7, 0.05, vWPos.y) * step(-3.0, vWPos.y) * uWeatherStrength;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.5, 0.4), wet * 0.75);
          float salt = smoothstep(0.55, 0.85, vWPos.y) * smoothstep(1.25, 0.85, vWPos.y) * vertical * uWeatherStrength;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.78, 0.74), salt * 0.18 * big.r);
          #ifdef WAGO_THATCH
          {
            // Halme: quer zur Falllinie fein, entlang grob. Die Falllinie ist die
            // waagerechte Projektion der Normalen — gilt so für jede Dachrichtung,
            // ohne UVs und ohne Wissen über das Haus.
            // Maßstab nachgerechnet: Kanal b hat 128 Zellen je Kachel quer und 8 längs,
            // also Halmbreite 1/(128·0,42) ≈ 1,9 cm und Halmlänge 1/(8·0,22) ≈ 0,57 m.
            // Die erste Fassung tastete mit 2,3 statt 0,42 ab — 3 mm, unter einem Pixel,
            // und im Bild blieb eine glatte Fläche mit Bretterstreifen.
            vec2 fall = normalize(n.xz + vec2(1e-4));
            float across = dot(vWPos.xz, vec2(-fall.y, fall.x));
            float s1 = texture2D(uWeatherNoise, vec2(across * 0.42, vWPos.y * 0.22)).b;
            float s2 = texture2D(uWeatherNoise, vec2(across * 1.4, vWPos.y * 0.5)).g;
            float s3 = texture2D(uWeatherNoise, vec2(across * 0.09, vWPos.y * 0.07)).r;
            float slopeLook = 0.6 + s1 * 0.52 + s2 * 0.26 + (s3 - 0.5) * 0.3;
            // Schnittkanten (Traufe, Giebel) zeigen Halmenden statt Halme: Punkte,
            // keine Streifen. Mit Streifen las sich die Traufe als Holzbalken.
            float dots = texture2D(uWeatherNoise, vec2(across * 1.7, vWPos.y * 1.7)).g;
            float cut = 1.0 - smoothstep(0.25, 0.45, abs(n.y));
            diffuseColor.rgb *= mix(slopeLook, 0.72 + dots * 0.5 + (s3 - 0.5) * 0.2, cut);
            // Moos in großen Flecken, nur auf Flächen, die Regen abbekommen.
            float moss = smoothstep(0.48, 0.66, big.r) * smoothstep(0.15, 0.6, n.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.07) * (0.7 + s1 * 0.6), moss * 0.7);
          }
          #endif
          #ifdef WAGO_NAMAKO
          {
            // Ebene aus der waagerechten Normalen: u entlang der Wand, v = Höhe.
            // Gitter um 45° gedreht, Fliese 0,32/√2 ≈ 0,23 m — gemessen an den
            // Referenzbildern (ein Fenster von 0,9 m sind knapp vier Rauten).
            vec2 hor = normalize(vec2(-n.z, n.x) + vec2(1e-5));
            float u = dot(vWPos.xz, hor), v = vWPos.y;
            const float NL = 0.32;
            vec2 q = vec2(u + v, u - v) / NL;
            vec2 fq = abs(fract(q) - 0.5);
            // Abstand zur nächsten Fuge in Metern (Fugen bei ganzzahligem q).
            float d = (0.5 - max(fq.x, fq.y)) * NL * 0.70711;
            float px = max(length(fwidth(q)), 1e-4) * NL * 0.70711;
            float jw = 0.022;
            float joint = 1.0 - smoothstep(jw - px, jw + px, d);
            float bead = clamp(1.0 - d / jw, 0.0, 1.0);
            // Fliesen leicht verschieden: ganzzahlige Zelle, klein gehalten — ein
            // sin-Hash mit großem Argument rauscht pixelweise (CLAUDE.md, Fassaden).
            vec2 cell = mod(floor(q), 61.0);
            float hsh = fract(cell.x * 0.1377 + cell.y * 0.2819 + cell.x * cell.y * 0.0123);
            vec3 plaster = diffuseColor.rgb;
            vec3 slate = plaster * vec3(0.2, 0.215, 0.235) * (0.78 + hsh * 0.44);
            vec3 pattern = mix(slate, plaster * (0.8 + bead * 0.2), joint);
            // Aus der Ferne unter einem Pixel je Fuge: auf den Mittelwert blenden, sonst Moiré.
            float far = smoothstep(0.01, 0.028, px);
            diffuseColor.rgb = mix(pattern, mix(slate, plaster, 0.33), far);
          }
          #endif
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.8, 0.58) * ${(o.lift ?? 0).toFixed(3)};`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (texture2D(uWeatherNoise, vWPos.xz * 0.3).g - 0.5) * 0.2 * uWeatherStrength, 0.04, 1.0);`);
  };
  // Ergänzen, nicht ersetzen: three setzt für MeshStandardMaterial selbst `STANDARD`.
  // Die erste Fassung überschrieb das Objekt und rechnete damit ein anderes Material.
  if (o.thatch) m.defines = { ...(m.defines ?? {}), WAGO_THATCH: '' };
  if (o.namako) m.defines = { ...(m.defines ?? {}), WAGO_NAMAKO: '' };
  m.customProgramCacheKey = () => `wago-weather-${strength}-${o.doubleSide ? 1 : 0}-${o.thatch ? 1 : 0}-${o.lift ?? 0}-${o.namako ? 1 : 0}-${o.roughness ?? 0.86}`;
  return m;
}

/**
 * Stoff im Wind: Wäsche, Noren, Netze, Fischerfahnen. Das Attribut `aSway`
 * (0 an der Aufhängung, 1 am freien Ende) legt fest, wie weit ein Punkt
 * ausschlägt. Ausgelenkt wird entlang der Flächennormale — so flattert eine
 * Fahne, statt als Ganzes zu wandern. Funktioniert auch instanziert: die
 * Auslenkung passiert vor der Instanzmatrix.
 */
export function clothMaterial(time: IUniform<number>): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = position.x * 0.9 + position.z * 0.7;
          float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ph * 0.1);
          float wave = sin(uTime * 3.1 + ph + position.y * 2.3) * 0.6 + sin(uTime * 5.3 + ph * 1.7) * 0.25;
          transformed += objectNormal * wave * aSway * 0.16 * gust;
          transformed.y += abs(wave) * aSway * 0.03;
        }`);
  };
  m.customProgramCacheKey = () => 'wago-cloth';
  return m;
}
