// Forza Drive Line / US8425293: Farbe = Tempo jetzt gegen Solltempo HIER.
//
// Das Solltempo (aLimit) kommt aus dem Rueckwaertslauf von RaceLine:
// vor einer Kurve ist es schon heruntergesetzt. Wer bei 50 m/s auf einen
// Punkt mit Soll 22 m/s zufahrt, sieht Rot auf der Anfahrt — nicht erst
// am Scheitel. Die Formel sqrt(v_limit^2 + 2 a s) von der Auto-Position
// aus zaehlt denselben Bremsweg zweimal und schiebt das Rot in die Kurve.
//
// Das Band ist nur das Sichtfenster (uReveal), nicht die ganze Reststrecke.

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

  vec3 cyan = vec3(0.24, 0.88, 1.0);
  vec3 amber = vec3(1.0, 0.72, 0.18);
  vec3 red = vec3(1.0, 0.16, 0.1);
  vec3 color = cyan;
  if (excess > 0.0) {
    float t = clamp(excess / uRedExcess, 0.0, 1.0);
    float a = clamp(uAmberExcess / uRedExcess, 0.05, 0.8);
    color = mix(cyan, amber, smoothstep(0.0, a, t));
    color = mix(color, red, smoothstep(a, 1.0, t));
  }

  float across = abs(vUv.x - 0.5) * 2.0;
  float edge = 1.0 - smoothstep(0.55, 1.0, across);
  float spine = 1.0 - smoothstep(0.0, 0.42, across);

  float chev = fract(vArc * 0.068 - uTime * 0.78);
  float head = 1.0 - chev;
  float chevShape = 1.0 - smoothstep(0.0, 0.34, abs(across - head * 0.88));
  float chevLife = smoothstep(0.02, 0.14, chev) * smoothstep(0.94, 0.58, chev);
  float eat = smoothstep(5.0, 16.0, ahead);
  float arrow = chevShape * chevLife * eat;

  float body = 0.38 * spine + 0.62 * arrow;

  float nearFade = smoothstep(uNearFade, uNearSolid, ahead);
  float farFade = 1.0 - smoothstep(uReveal - 48.0, uReveal, ahead);
  float behindFade = smoothstep(-(uBehind + 6.0), 3.0, ahead);
  float tip = 1.0 - smoothstep(uReveal - uRevealHead, uReveal, ahead);
  float alpha = edge * body * nearFade * farFade * behindFade * tip * uOpacity * 0.92;
  if (alpha < 0.018) discard;

  gl_FragColor = vec4(color * (0.62 + 0.55 * arrow), alpha);
}
