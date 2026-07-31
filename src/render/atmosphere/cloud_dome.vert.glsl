varying vec3 vDirection;

void main() {
  // Die Kuppel ist eine Kugel um die Kamera; `position` zeigt damit bereits in
  // Blickrichtung und wird im Fragment normiert. Bewusst **nicht** über die
  // Weltposition gerechnet: die Kuppel wird je Frame auf die Kamera gesetzt,
  // und die Differenz zweier großer, fast gleicher Zahlen verliert genau die
  // Genauigkeit, die eine Richtung braucht.
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
