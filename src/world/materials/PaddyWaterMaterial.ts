import { Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';

import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { PropMaterial } from './PropMaterial';

/**
 * Das Wasser der Reisfelder — P5.4, belebt in P19.
 *
 * ## Warum es überhaupt ein eigenes Material braucht
 *
 * Bis P19 waren die 101 ha Reisfeldwasser ein `PropMaterial` mit `roughness`
 * 0,06 und sonst nichts. Das ist eine **spiegelglatte, unbewegte Fläche**, und
 * genau so sah sie aus: Lack. Meer und Fluss haben seit P2 drei Wellenlagen und
 * seit P14 eine Kielwelle; die Reisfelder hatten weder das eine noch das andere
 * — und ausgerechnet in ihnen fährt man, weil sie mitten auf der Karte liegen.
 *
 * ## Warum nicht einfach `WaterMaterial`
 *
 * Weil die beiden Flächen verschiedene Dinge sind, und der Unterschied steht
 * schon in `PADDY_WATER.color`: ein Reisfeld im Mai ist eine **dünne Schicht
 * über Schlamm**, kein See. `WaterMaterial` rechnet Tiefenfarbe, Schaumsaum und
 * Uferblende aus der Wassertiefe gegen die Heightmap — bei 30 cm Tiefe ergibt
 * das eine Fläche, die vollständig aus Schaum besteht. Es bringt außerdem
 * `depthWrite: false` und die Horizontausblendung mit, beides hier falsch.
 *
 * Übernommen wird deshalb nur, was hier auch gilt: **Wellennormalen und
 * Kielwelle**. Beides ist eine Störung der Normalen und braucht weder Tiefe noch
 * Uferlinie.
 *
 * ## Kosten
 *
 * Ein zusätzliches Shaderprogramm (`customProgramCacheKey`) und drei Sinus je
 * Pixel im Nahbereich. Die Draw-Call-Zahl bleibt gleich — es ist dasselbe
 * Material auf denselben Kacheln, nur mit anderem Fragment-Shader. Jenseits von
 * `uPaddyDetail = 0` (Minimal) fällt der ganze Zweig weg und die Fläche ist
 * wieder, was sie vor P19 war.
 */
export class PaddyWaterMaterial extends PropMaterial {
  /** xy = Fahrzeug-XZ, z = Fahrtrichtung X, w = Tempo. Siehe `uPaddyWake`. */
  readonly uPaddyWake: IUniform<Vector4> = { value: new Vector4() };
  /** xy = Fahrtrichtung XZ, z = 1 wenn aktiv. */
  readonly uPaddyFwd: IUniform<Vector4> = { value: new Vector4() };
  /** Stärke der Kräuselung, 0…1 — aus der Qualitätsstufe. */
  readonly uPaddyDetail: IUniform<number> = { value: 1 };

  constructor(atmosphere: AtmosphereUniforms) {
    super(atmosphere);
    this.name = 'PaddyWaterMaterial';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    // **Erst die Elternklasse.** Sie hängt `vPropWorld`, die Verschattung und
    // die Atmosphäre ein; alles davon wird unten gebraucht, und ein Ersetzen vor
    // ihr fände die Anker nicht.
    super.onBeforeCompile(shader);

    shader.uniforms.uPaddyWake = this.uPaddyWake as IUniform;
    shader.uniforms.uPaddyFwd = this.uPaddyFwd as IUniform;
    shader.uniforms.uPaddyDetail = this.uPaddyDetail as IUniform;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform vec4 uPaddyWake;
uniform vec4 uPaddyFwd;
uniform float uPaddyDetail;
float gPaddyFoam;
vec2 gPaddyRipple;`,
    );

    // ── Die Reihenfolge im Fragment-Shader ist hier der springende Punkt ──
    //
    // `<roughnessmap_fragment>` steht in three **vor** `<normal_fragment_begin>`.
    // Wer den Schaum bei der Normalen rechnet und ihn bei der Rauheit benutzt,
    // liest eine Variable, die noch nicht zugewiesen ist — der Shader übersetzt,
    // und die Rauheit ist Müll. (Gefunden beim Schreiben, nicht im Bild: ein
    // undefinierter Float sieht auf einer dunklen Fläche aus wie eine
    // Geschmacksfrage.)
    //
    // Gerechnet wird deshalb **einmal ganz vorn**, an der Stelle, an der
    // `PropMaterial` schon `gPropShade` bildet, und danach nur noch benutzt.
    shader.fragmentShader = shader.fragmentShader.replace(
      'gPropShade = atmoShade(vPropWorld);',
      `gPropShade = atmoShade(vPropWorld);
{
  vec2 p = vPropWorld.xz;
  float t = uAtmoTime;
  vec2 stoerung = vec2(0.0);
  gPaddyFoam = 0.0;

  if (uPaddyDetail > 0.004) {
    // Drei Lagen mit 2,4 m, 0,9 m und 0,35 m. Kürzer als beim Meer, und das ist
    // der Punkt: ein Reisfeld ist eine Pfütze mit Halmen darin, kein Seegang.
    // Die Wellenlängen sind so gewählt, dass die längste rund eine Parzelle
    // breit ist — dann steht in jedem Feld genau ein Muster und nicht zehn.
    stoerung += vec2(0.71, 0.71) * (0.045 * cos(dot(vec2(0.71, 0.71), p) * 2.6 + t * 1.7));
    stoerung += vec2(-0.6, 0.8) * (0.032 * cos(dot(vec2(-0.6, 0.8), p) * 7.0 - t * 2.4));
    stoerung += vec2(0.95, -0.31) * (0.020 * cos(dot(vec2(0.95, -0.31), p) * 18.0 + t * 4.1));
    stoerung *= uPaddyDetail;
  }

  // ── Kielwelle ─────────────────────────────────────────────────────────
  //
  // Dieselbe Geometrie wie im Meer (water_surface.frag.glsl): ein V hinter
  // dem Auto plus ein Bugwulst. Hier trägt sie mehr Gewicht als dort — im
  // Reisfeld steht das Auto *im* Wasser, und der Ring um die Karosserie ist das
  // Einzige, was zeigt, dass es eine Flüssigkeit ist.
  if (uPaddyFwd.z > 0.5) {
    vec2 zumAuto = p - uPaddyWake.xy;
    float laengs = -dot(zumAuto, uPaddyFwd.xy);
    float quer = zumAuto.x * (-uPaddyFwd.y) + zumAuto.y * uPaddyFwd.x;
    float weite = length(zumAuto);
    float tempo = smoothstep(0.8, 10.0, uPaddyWake.w);

    // **Die Beträge hier sind gemessen und nicht geschätzt.** Der erste Versuch
    // übernahm die Geometrie des Meeres unverändert ('halb = 0,85 + laengs·0,42',
    // 'exp(-laengs·0,055)') — und im Reisfeld ist das ein **weißer Teppich über
    // die halbe untere Bildhälfte**. Isoliert mit 'tools/bench/imgdiff.mjs',
    // Kielwelle an gegen aus: **44,7 % der Pixel geändert, mittlere Differenz
    // 29,6**. Die Partikel derselben Szene lagen bei 21,8 % und 6,5.
    //
    // Der Grund ist der Maßstab: auf dem Meer ist die Kamera weit weg und der
    // Keil ein Strich im Bild; im Reisfeld klebt sie sechs Meter hinter dem Auto,
    // und derselbe Keil füllt den Vordergrund. Ein Effekt, der aus der Ferne
    // stimmt, stimmt aus der Nähe deshalb noch lange nicht.
    //
    // Also: schmaler (0,22 statt 0,42 je Meter), kürzer (Abklinglänge 6 m statt
    // 18 m) und schwächer. Was bleibt, ist eine Spur, die man sieht, wenn man
    // sich umdreht — und nicht eine, die das Bild übernimmt.
    float halb = 0.55 + laengs * 0.22;
    float imV = smoothstep(0.15, 1.2, laengs)
      * (1.0 - smoothstep(halb, halb + 1.1, abs(quer)))
      * exp(-laengs * 0.17);
    float bug = exp(-weite * weite * 0.5) * (1.0 - smoothstep(1.8, 3.2, weite));
    gPaddyFoam = tempo * clamp(imV * 0.55 + bug * 0.45, 0.0, 1.0);

    // Ringe, die vom Auto weglaufen — die Störung, die eine stehende Pfütze von
    // einer bewegten unterscheidet. Sie leben nur in den ersten sechs Metern;
    // weiter draußen wäre es ein Muster ohne Ursache.
    float ringe = sin(weite * 5.5 - t * 9.0) * exp(-weite * 0.42) * tempo;
    vec2 raus = weite > 1e-3 ? zumAuto / weite : vec2(0.0);
    stoerung += raus * ringe * 0.07;
    stoerung += vec2(quer * 0.05, -laengs * 0.03) * gPaddyFoam;
  }

  gPaddyRipple = stoerung;
}`,
    );

    // Die Störung wird an derselben Stelle eingesetzt wie im 'WaterMaterial':
    // nach `<normal_fragment_begin>`, also nachdem `normal` im Ansichtsraum
    // steht und bevor die Beleuchtung sie liest.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n' +
        'normal = normalize(normal + ' +
        '(viewMatrix * vec4(-gPaddyRipple.x, 0.0, -gPaddyRipple.y, 0.0)).xyz);',
    );

    // Schaum ist heller **und** matter. Nur die Farbe zu heben ergäbe eine weiße
    // Fläche, die weiterspiegelt wie Glas — dieselbe Falle, in die P8.6 am Fluss
    // schon einmal getreten ist.
    //
    // Der Zuschlag geht auf `reflectedLight.indirectDiffuse` und **nicht** auf
    // `totalDiffuse`: die Variable gibt es an dieser Stelle noch gar nicht, sie
    // entsteht erst in `<opaque_fragment>`. Und er kommt *nach*
    // `<lights_fragment_end>`, damit die Verschattung aus `PropMaterial` ihn
    // nicht mitdämpft — Schaum leuchtet auch im Kernschatten des Massivs, weil
    // er Himmelslicht streut.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, gPaddyFoam);',
      )
      .replace(
        'reflectedLight.directSpecular *= gPropShade.x;',
        'reflectedLight.directSpecular *= gPropShade.x;\n' +
          'reflectedLight.indirectDiffuse += vec3(gPaddyFoam * 0.16);',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:paddywater';
  }
}
