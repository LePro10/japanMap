// Forza Drive Line / US8425293: Farbe = Tempo jetzt gegen Solltempo HIER.
//
// Chevrons sind Stempel, kein Wellengeist. Die alte Form war ein weiches
// V, das sich kontinuierlich durch das Band fraß — das liest sich als
// Nebel, nicht als Pfeil. GTA-GPS und Forza Horizon setzen diskrete
// >-Marken mit Luecke dazwischen, wie Fahrbahnmarkierung.

uniform float uSpeed;
uniform float uArc;
uniform float uTime;
uniform float uRedExcess;
uniform float uAmberExcess;
uniform float uNearFade;
uniform float uNearSolid;
uniform float uBehind;
uniform float uOpacity;
uniform float uReveal;
uniform float uRevealHead;

varying vec2 vUv;
varying float vArc;
varying float vLimit;

void main() {
  float ahead = vArc - uArc;
  if (ahead > uReveal || ahead < -(uBehind + 10.0)) discard;

  float excess = uSpeed - vLimit;

  vec3 cyan = vec3(0.28, 0.82, 0.96);
  vec3 amber = vec3(1.0, 0.70, 0.16);
  vec3 red = vec3(0.98, 0.22, 0.14);
  vec3 color = cyan;
  if (excess > 0.0) {
    float t = clamp(excess / uRedExcess, 0.0, 1.0);
    float a = clamp(uAmberExcess / uRedExcess, 0.05, 0.8);
    color = mix(cyan, amber, smoothstep(0.0, a, t));
    color = mix(color, red, smoothstep(a, 1.0, t));
  }

  float across = abs(vUv.x - 0.5) * 2.0;
  float tape = 1.0 - smoothstep(0.78, 0.98, across);

  // 10 m Raster, Pfeil fuellt die vordere Haelfte, Rest ist Luecke.
  float slot = fract((vArc - uTime * 5.2) / 10.0);
  float u = clamp((slot - 0.06) / 0.40, 0.0, 1.0);
  float inSlot = smoothstep(0.06, 0.10, slot) * smoothstep(0.50, 0.44, slot);

  // Gefuelltes > : hinten breit, vorne Spitze. Kleine Kerbe hinten,
  // sonst ist es ein Dreieck und kein Pfeil.
  float outer = mix(0.82, 0.04, u);
  float chev = 1.0 - smoothstep(outer, outer + 0.06, across);
  float notch = 1.0 - smoothstep(0.16, 0.28, u);
  float hollow = 1.0 - smoothstep(0.18, 0.32, across);
  chev *= 1.0 - notch * hollow;
  chev *= inSlot * smoothstep(4.0, 12.0, ahead);

  float fill = mix(0.42, 1.0, chev);
  float nearFade = smoothstep(uNearFade, uNearSolid, ahead);
  float farFade = 1.0 - smoothstep(uReveal - 48.0, uReveal, ahead);
  float behindFade = smoothstep(-(uBehind + 6.0), 3.0, ahead);
  float tip = 1.0 - smoothstep(uReveal - uRevealHead, uReveal, ahead);
  float alpha = tape * fill * nearFade * farFade * behindFade * tip * uOpacity * 0.86;
  if (alpha < 0.02) discard;

  gl_FragColor = vec4(color * mix(0.78, 1.08, chev), alpha);
}
