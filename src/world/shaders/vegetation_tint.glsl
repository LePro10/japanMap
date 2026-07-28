// Farbwurf je Instanz — PLAN.md P4 / 4.3.
//
// Steht in einer eigenen Datei, weil **zwei** Materialien ihn brauchen: das
// Mesh-Material und das Imposter-Material. Liefe die Rechnung an beiden Stellen
// getrennt, wäre der Übergang von Stufe 1 auf Stufe 2 ein Farbsprung — und zwar
// ein leiser, der als „Imposter sehen anders aus" durchgeht, ohne dass jemand
// die Ursache benennt. Genau diese Sorte Doppelimplementierung hat in P3 die
// eingeschnittene Rinne neben das Straßen-Mesh gelegt.
//
// Gerechnet statt übertragen: ein `instanceColor` wäre ein zweites Attribut, das
// bei jedem Umsortieren mitkopiert werden müsste. Bei 60 000 Instanzen und einem
// Umbau alle vier Frames ist das messbar; der Hash kostet drei Rechenschritte.

/** Ortsfester Wurf aus der Instanzposition, 0…1. */
float vegetationTintHash(vec2 originXZ) {
  return fract(sin(dot(originXZ, vec2(12.9898, 78.233))) * 43758.5453);
}

/**
 * Wurf → Farbfaktor.
 *
 * Nicht nur Helligkeit: ein Wald aus einer Farbe in fünf Helligkeiten liest sich
 * immer noch als eine Farbe. Der Faktor verschiebt zusätzlich ins Gelbe
 * (heller Wurf) oder ins Blaue (dunkler Wurf) — die Richtung, in die echtes Laub
 * je nach Alter und Art auseinandergeht.
 */
vec3 vegetationTint(float t) {
  return vec3(0.82 + t * 0.40, 0.86 + t * 0.30, 0.94 - t * 0.22);
}
