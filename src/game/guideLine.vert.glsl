// GPS-Band auf der Fahrbahn. Position kommt fertig aus dem Mesh
// (Apex-Versatz schon auf der CPU); hier nur UV und Bogenlänge weiterreichen.

attribute float aArc;
attribute float aLimit;

varying vec2 vUv;
varying float vArc;
varying float vLimit;

void main() {
  vUv = uv;
  vArc = aArc;
  vLimit = aLimit;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
