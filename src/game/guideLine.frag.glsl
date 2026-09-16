// Dynamische Racing Line: cyan = passt, amber = knapp, rot = zu schnell
// fuer die naechste Kurve. Die Grenze ist v_arrive = sqrt(v_limit^2 + 2 a s),
// also der Bremsweg, nicht der lokale Limit — sonst wird erst IN der Kurve
// rot, wenn es zu spaet ist. Dasselbe Verfahren wie US8425293 / F1 Dynamic.

uniform float uSpeed;
uniform float uArc;
uniform float uBrake;
uniform float uTime;
uniform float uRedExcess;
uniform float uAmberExcess;
uniform float uNearFade;
uniform float uNearSolid;
uniform float uBehind;

varying vec2 vUv;
varying float vArc;
varying float vLimit;

void main() {
  float ahead = vArc - uArc;
  if (ahead < -uBehind) discard;

  float dist = max(ahead, 0.0);
  float arrive = sqrt(max(0.0, vLimit * vLimit + 2.0 * uBrake * dist));
  float excess = uSpeed - arrive;

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
  float edge = 1.0 - smoothstep(0.62, 1.0, across);

  float chev = fract(vArc * 0.085 - uTime * 0.55);
  float arrow = 1.0 - smoothstep(0.0, 0.42, abs(across - (1.0 - chev) * 0.85));
  arrow *= step(0.12, chev) * step(chev, 0.72);
  float body = 0.55 + 0.45 * arrow;

  float nearFade = smoothstep(uNearFade, uNearSolid, ahead);
  float farFade = 1.0 - smoothstep(420.0, 780.0, ahead);
  float behindFade = smoothstep(-uBehind, 0.0, ahead);
  float alpha = edge * body * nearFade * farFade * behindFade * 0.88;
  if (alpha < 0.02) discard;

  gl_FragColor = vec4(color * (0.7 + 0.5 * arrow), alpha);
}
