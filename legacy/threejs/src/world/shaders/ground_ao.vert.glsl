// Bodenverdeckung, Vertex-Anteil — offener Punkt aus P4.
//
// Der Fleck ist ein Gitter in der XZ-Ebene, dessen Stützstellen ihre Höhe
// **aus der Heightmap** holen (terrain_height.glsl, direkt darüber eingesetzt).
// Ein einzelnes ebenes Quad mit `polygonOffset` wäre der kürzere Weg und am
// Hang falsch: es stünde schräg im Boden, eine Hälfte in der Luft, die andere
// darunter. Weil derselbe Code auch das Gelände verschiebt, liegen Fleck und
// Oberfläche bauartbedingt aufeinander — bis auf das Morphing, siehe
// `GROUND_AO.lift`.
//
// **Die Instanzmatrix wird zweckentfremdet.** `position.y` ist überall null,
// also multipliziert Spalte 1 der Matrix nichts — dort steht deshalb die
// Stärke statt einer Y-Skalierung. Das spart ein zweites Instanz-Attribut samt
// eigenem Upload je Durchlauf; der Preis ist, dass diese Matrix keine
// Ähnlichkeitsabbildung mehr ist und außerhalb dieses Shaders nichts bedeutet.

uniform float uAoLift;

varying float vAoRadial;
varying float vAoStrength;
varying float vAoDistance;

void main() {
  // Spalte 0 trägt den Durchmesser, Spalte 3 den Standort. Die Vegetations-
  // Gruppe steht im Ursprung, `modelMatrix` wäre also die Einheitsmatrix — die
  // Instanzmatrizen tragen Weltkoordinaten, dieselbe Annahme wie überall in
  // der Streuung.
  float diameter = instanceMatrix[0].x;
  vec3 world = vec3(
    instanceMatrix[3].x + position.x * diameter,
    0.0,
    instanceMatrix[3].z + position.z * diameter
  );
  world.y = terrainSurface(world.xz) + uAoLift;

  // `position.xz` läuft von −0,5 bis 0,5: der Wert ist damit 0 in der Mitte und
  // 1 auf dem einbeschriebenen Kreis. Die Ecken kommen auf 1,41 und fallen im
  // Fragment-Shader ganz weg — der Fleck ist rund, das Gitter nur sein Träger.
  vAoRadial = length(position.xz) * 2.0;
  vAoStrength = instanceMatrix[1].y;
  vAoDistance = distance(world, cameraPosition);

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
