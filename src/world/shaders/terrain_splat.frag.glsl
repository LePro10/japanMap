// Ersetzt <map_fragment>. Setzt diffuseColor sowie die beiden Globalen
// gTerrainArm und gTerrainNormal, die weiter unten in <roughnessmap_fragment>,
// <metalnessmap_fragment>, <normal_fragment_begin> und <aomap_fragment>
// weiterverwendet werden.

// Zwei getrennte UVs, weil zones.png und normal.png verschieden aufgelöst sind
// und beide ein Gitter von Stützstellen speichern, keine Zellenmitten. In P1
// stand hier eine gemeinsame, ungerechnete UV — das verschob beide Karten um
// einen halben Texel gegen das Gelände (1,5 m bzw. 0,75 m). Für Splat-Gewichte
// war das folgenlos, für die Normale nicht: bei 2,2° Sonnenstand steht die
// Schattierung dann sichtbar neben der Geometrie, die sie beschreibt.
vec2 zonesUv = atmoMapUv(vTerrainWorld.xz, uMapRes.x);
vec2 normalUv = atmoMapUv(vTerrainWorld.xz, uMapRes.y);

// Die Gewichte werden neu normiert, nicht bloß gelesen. Der Baker normiert
// zwar schon, aber die 8-bit-Rundung und die Debug-Maske verschieben die
// Summe — ohne die Division wäre das Ergebnis an manchen Stellen dunkler.
// **Drei Kanäle in der Datei, vier im Splat.** Der vierte (Reisfeld) ergibt
// sich als Rest, weil der Baker die Gewichte auf 1 normiert. Er stand früher im
// Alphakanal — was auf der GPU funktionierte und auf der CPU nicht, weil jeder
// Canvas-Umweg RGB mit Alpha multipliziert. Siehe ZoneMap.ts.
vec3 zoneRgb = texture(uZones, zonesUv).rgb;
vec4 splat = vec4(zoneRgb, max(0.0, 1.0 - zoneRgb.r - zoneRgb.g - zoneRgb.b)) * uLayerMask;
splat /= max(dot(splat, vec4(1.0)), 1e-4);
gTerrainSplat = splat;

vec3 baseNormal = normalize(texture(uTerrainNormal, normalUv).xyz * 2.0 - 1.0);
gTerrainGeoNormal = baseNormal;

// Gebackene Verschattung: Sonnenanteil und Himmelssicht. Wird weiter unten in
// <lights_fragment_end> und <aomap_fragment> auf das Licht gelegt.
gTerrainShade = atmoShade(vTerrainWorld);

float triplanar = 1.0 - smoothstep(uTriplanar.x, uTriplanar.y, baseNormal.y);
vec3 triBlend = abs(baseNormal);
triBlend.y = 0.0;
triBlend /= max(triBlend.x + triBlend.z, 1e-4);

// Detail-Normalen blenden mit der Entfernung aus. Sie sind der Anteil, der
// zuerst aliast: aus 900 m fällt eine 7-m-Kachel unter die Pixelgröße und
// erzeugt nur noch flimmerndes Rauschen im Specular.
float viewDistance = length(vTerrainWorld - cameraPosition);
float detailFade = 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, viewDistance);

vec3 terrainAlbedo = vec3(0.0);
vec3 terrainArm = vec3(0.0);
vec3 terrainTangentNormal = vec3(0.0);

for (int i = 0; i < 4; i++) {
  float weight = splat[i];
  // Unter 0,4 % ist der Beitrag unsichtbar. Splat-Karten sind fast überall
  // von einer oder zwei Ebenen dominiert, der Zweig spart also meistens die
  // Hälfte bis drei Viertel der Abfragen.
  if (weight < 0.004) continue;

  float layer = float(i);
  float scale = uDetailTile * uLayerScale[i];

  terrainAlbedo += terrainSampleLayer(uAlbedoArray, layer, scale, triplanar, triBlend).rgb * weight;
  terrainArm += terrainSampleLayer(uArmArray, layer, scale, triplanar, triBlend).rgb * weight;
  terrainTangentNormal +=
    (terrainSampleLayer(uNormalArray, layer, scale, triplanar, triBlend).xyz * 2.0 - 1.0) * weight;
}

// Großskalige Helligkeitsvariation gegen die sichtbare Kachelung. Als Quelle
// dient die Gras-Ebene bei sehr großer Kachelgröße — das kostet eine einzige
// zusätzliche Abfrage und keine weitere Textur.
float macro = dot(texture(uAlbedoArray, vec3(vTerrainWorld.xz / uMacroTile, 1.0)).rgb, vec3(0.3333));
terrainAlbedo *= 1.0 + (macro - 0.5) * 2.0 * uMacroStrength;

// **Der Boden bekommt die Farbe dessen, was auf ihm wächst** — P11.
//
// Die Detailtexturen sind Luftaufnahmen und zeigen den Boden *ohne* den
// Bewuchs, der laut Zonenkarte darauf steht; `aerial_grass_rock` ist zu einem
// guten Teil Fels. Gemessen war die untere Bildhälfte am Blickpunkt `wald`
// selbst auf Ultra zu 46,07 % braun. Das ist keine Frage der Instanzzahl,
// sondern der Untergrundfarbe — und es ist die Voraussetzung dafür, dass
// fehlende Instanzen auf niedrigen Stufen nicht auffallen.
//
// **Steht nach der Makro-Variation**, nicht davor: die Helligkeitsmodulation
// aus `uMacroStrength` soll durch den Farbtonwechsel hindurch erhalten bleiben,
// nicht von ihm überschrieben werden.
// **Der Farbstich folgt der Ausdünnung** — P11.6, und das ist der Kern.
//
// Gerechnet wird dieselbe Behaltequote wie in `ScatterSystem.#pushChunk`:
//
//     keep(d) = 1                        für d ≤ R
//     keep(d) = max(keepFar, (R/d)²)     darüber
//
// Daraus die **Deckung**: was übrig bleibt, wird um 1/√keep verbreitert
// (gedeckelt), die gedeckte Fläche ist also `boostMax² · keep`, nach oben auf 1
// begrenzt. Jenseits der Grasreichweite steht gar nichts mehr, dort ist sie
// null.
//
// Der Boden springt genau in dem Maße ein, in dem die Deckung fehlt. Damit ist
// die Kante bauartbedingt unsichtbar — und zwar auf jeder Stufe, weil beide
// Seiten aus **denselben** vier Zahlen rechnen. Auf Ultra greift es bei 160 m
// (Ende des Grases), auf Minimal deutlich früher.
float tintR = uGroundTintLaw.x;
float tintKeepFar = uGroundTintLaw.y;
float grassFar = uGroundTintLaw.z;
float keep = viewDistance <= tintR
  ? 1.0
  : max(tintKeepFar, (tintR * tintR) / max(viewDistance * viewDistance, 1e-4));
// Auslaufen über das letzte Viertel der Grasreichweite statt an einer Kante:
// die Streuung hört dort hart auf, der Farbstich soll es nicht.
keep *= 1.0 - smoothstep(grassFar * 0.75, grassFar, viewDistance);
float bewuchsDeckung = clamp(uGroundTintLaw.w * keep, 0.0, 1.0);
float tintStrength = mix(uGroundTint.x, uGroundTint.y, 1.0 - bewuchsDeckung);

float groundTint = dot(splat, uGroundTintWeights) * tintStrength;
if (groundTint > 0.001) {
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  float texelLuma = dot(terrainAlbedo, LUMA);
  // Die Zielfarbe auf die Helligkeit *dieses* Texels normiert: der Farbton
  // wandert, das Muster bleibt. Ein glattes mix() zöge auch die Helligkeit zur
  // Zielfarbe und plättete Felsbrocken, Erosionsrinnen und die Makro-Variation
  // zu einer einfarbigen Fläche — genau die grüne Pappe, die hier nicht
  // entstehen soll.
  vec3 shaped = clamp(uGroundTintColor * (texelLuma / max(dot(uGroundTintColor, LUMA), 1e-4)), 0.0, 1.0);
  terrainAlbedo = mix(terrainAlbedo, mix(uGroundTintColor, shaped, uGroundTint.z), groundTint);
}

diffuseColor.rgb *= terrainAlbedo;
gTerrainArm = clamp(terrainArm, 0.0, 1.0);
gTerrainNormal = terrainPerturbNormal(
  baseNormal,
  normalize(terrainTangentNormal),
  uDetailNormalStrength * detailFade
);
