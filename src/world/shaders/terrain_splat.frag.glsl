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
vec4 splat = texture(uZones, zonesUv) * uLayerMask;
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

diffuseColor.rgb *= terrainAlbedo;
gTerrainArm = clamp(terrainArm, 0.0, 1.0);
gTerrainNormal = terrainPerturbNormal(
  baseNormal,
  normalize(terrainTangentNormal),
  uDetailNormalStrength * detailFade
);
