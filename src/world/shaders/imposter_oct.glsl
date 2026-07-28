// Oktaedrische Projektion für Imposter — PLAN.md P4 / 4.4.
//
// Gebraucht wird sie zweimal und muss beide Male **exakt gleich** rechnen: der
// Baker leitet aus einer Atlas-Zelle die Blickrichtung ab, aus der er das Modell
// aufnimmt, und der Shader leitet aus der Blickrichtung die Atlas-Zelle ab.
// Laufen die zwei Abbildungen auseinander, sieht man beim Umkreisen einen Baum,
// der sich gegen die Bewegung dreht — und zwar nur ein bisschen, was den Fehler
// schwer zu finden macht. Deshalb liegt die Mathematik in einer Datei, die beide
// Seiten importieren, und nicht zweimal aufgeschrieben.
//
// **Halbkugel, nicht Kugel.** Eine volle Oktaeder-Abbildung verteilt 64 Zellen
// auf 4π; die untere Hälfte davon zeigt Bäume von unten und wird in dieser Karte
// nie gebraucht (die Kamera darf zwar unter den Meeresspiegel, aber nicht unter
// den Waldboden). Auf die Halbkugel verteilt sind es doppelt so viele Zellen pro
// Raumwinkel, also der halbe Winkelfehler zum Nulltarif.

/** Richtung (normiert, y ≥ 0) → Gitterkoordinate in [0,1]². */
vec2 octEncodeHemi(vec3 dir) {
  vec3 d = dir / (abs(dir.x) + abs(dir.y) + abs(dir.z));
  vec2 p = vec2(d.x + d.z, d.x - d.z);
  return p * 0.5 + 0.5;
}

/** Gitterkoordinate in [0,1]² → Richtung (normiert, y ≥ 0). */
vec3 octDecodeHemi(vec2 grid) {
  vec2 p = grid * 2.0 - 1.0;
  vec2 xz = vec2(p.x + p.y, p.x - p.y) * 0.5;
  return normalize(vec3(xz.x, 1.0 - abs(xz.x) - abs(xz.y), xz.y));
}
