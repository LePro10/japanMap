// Atmosphäre: Höhennebel und gebackene Geländeverschattung.
// PLAN.md P2 / 2.2 und 2.3. Wird per onBeforeCompile in alle Materialien
// eingesetzt, die in der Welt stehen (Terrain, Wasser, ab P3 Straßen).
//
// Bewusst **ohne eigenes Varying**: die Weltposition wird als Parameter
// übergeben. Terrain und Wasser haben ihre eigene bereits, ein zusätzliches
// Varying wäre reine Dopplung. Alle Namen tragen das Präfix `uAtmo`/`atmo`,
// damit nichts mit den Uniforms der Materialien kollidiert, in die dieser
// Block eingesetzt wird.

uniform float uAtmoTime;
/** x = Kantenlänge der Welt, y = halbe Kantenlänge. */
uniform vec2 uAtmoWorldSize;

/** Nebelschichten: x = Dichte pro Meter, y = Abfallhöhe, z = Himmelsanteil. */
uniform vec3 uAtmoFogGround;
uniform vec3 uAtmoFogAerial;
uniform vec3 uAtmoFogGroundTint;
uniform vec3 uAtmoFogAerialTint;
uniform float uAtmoFogMaxOpacity;
/** Heruntergerechneter Himmel als Nebelfarbe über die Blickrichtung. */
uniform sampler2D uAtmoSkyLut;

uniform vec3 uAtmoSunDirection;
uniform float uAtmoSunElevationDeg;

/** shade.png: R = Horizontwinkel, G = Verdeckerentfernung, B = Himmelssicht. */
uniform sampler2D uAtmoShade;
/** x = maxHorizonDeg, y = maxOccluderDistance, z = Auflösung der Karte. */
uniform vec3 uAtmoShadeDecode;
/** x = Grundbreite des Halbschattens in Grad, y = Zuwachs pro Meter. */
uniform vec2 uAtmoShadeSoftness;
uniform float uAtmoShadeAmbient;
/** x = Wirkung der Himmelssicht auf diffus, y = auf spekular. */
uniform vec2 uAtmoSkyOcclusion;

/** Kachelbares FBM-Rauschen, erzeugt in createCloudTexture.ts. */
uniform sampler2D uAtmoCloudMap;
/** x = Deckung, y = Weichheit der Ränder, z = Stärke (0 = aus). */
uniform vec3 uAtmoCloud;
/** xy = Kantenlänge beider Lagen in Metern, zw = ihre Geschwindigkeit in m/s. */
uniform vec4 uAtmoCloudTile;
/** Normierte Windrichtung in XZ. */
uniform vec2 uAtmoCloudDirection;

/**
 * Weltposition auf eine Weltkarten-UV.
 *
 * Die gebackenen Karten sind ein Gitter von **Stützstellen**: Texel 0 liegt auf
 * −half, Texel (res−1) auf +half. `texture()` erwartet dagegen Zellenmitten.
 * Ohne die Umrechnung hier läge jede Karte einen halben Texel neben dem
 * Gelände — bei 2,2° Sonnenstand ist ein halber Texel Versatz in der
 * Verschattung eine sichtbar falsch stehende Schattenkante.
 */
vec2 atmoMapUv(vec2 worldXZ, float res) {
  vec2 uv = (worldXZ + uAtmoWorldSize.y) / uAtmoWorldSize.x;
  return uv * ((res - 1.0) / res) + 0.5 / res;
}

/** Gleiche Konvention wie `equirectUv` in three — sonst steht der Nebel schief. */
vec2 atmoEquirectUv(vec3 direction) {
  return vec2(
    atan(direction.z, direction.x) * RECIPROCAL_PI2 + 0.5,
    asin(clamp(direction.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5
  );
}

/**
 * Wandernder Wolkenschatten — P8.4.
 *
 * Zwei Lagen desselben kachelbaren Rauschens mit unterschiedlicher Kantenlänge
 * und Geschwindigkeit, verknüpft über das **geometrische Mittel**.
 *
 * Der erste Entwurf multiplizierte einfach. Das ist als Modell richtig — ein
 * Punkt liegt nur in der Sonne, wenn ihn keine der beiden Lagen verdeckt —,
 * verschiebt aber den Wertebereich: das Produkt zweier auf 0…1 gestreckter
 * Lagen hat den Mittelwert 0,25, und `coverage = 0,52` als Schwelle darauf
 * legte die **ganze Karte** in den Schatten. Die Wurzel stellt die Skala
 * wieder her, ohne den Charakter zu ändern: ist eine Lage null, ist das
 * Ergebnis null.
 *
 * Projiziert wird in **Weltkoordinaten XZ**, nicht in Bildschirm- oder
 * Objektkoordinaten. Nur so passt der Schatten über alle Systeme zusammen: der
 * Fleck auf der Straße muss derselbe sein wie der auf dem Gras daneben und dem
 * Dach darüber.
 *
 * Der senkrechte Wurf ist eine bewusste Vereinfachung. Bei 2,23° Sonnenstand
 * läge der Schatten einer Wolke in 1500 m Höhe geometrisch **38 km** neben ihr;
 * eine korrekte Projektion hieße, dass die sichtbare Wolke und ihr Schatten
 * nichts miteinander zu tun haben. Der Betrachter sieht ohnehin nie beide
 * zugleich in einem Bild.
 */
float atmoCloudShadow(vec2 worldXZ) {
  if (uAtmoCloud.z <= 0.0) return 1.0;

  vec2 drift = uAtmoCloudDirection * uAtmoTime;
  vec2 uvA = (worldXZ + drift * uAtmoCloudTile.z) / uAtmoCloudTile.x;
  vec2 uvB = (worldXZ + drift * uAtmoCloudTile.w) / uAtmoCloudTile.y;

  float noise = sqrt(texture(uAtmoCloudMap, uvA).r * texture(uAtmoCloudMap, uvB).r);

  // Über der Schwelle steht Sonne, darunter Wolke.
  float sun = smoothstep(
    uAtmoCloud.x - uAtmoCloud.y, uAtmoCloud.x + uAtmoCloud.y, noise
  );
  return mix(1.0 - uAtmoCloud.z, 1.0, sun);
}

/**
 * Verschattung an einer Weltposition.
 *
 * Rückgabe: x = Sonnenanteil (0 = Kernschatten), y = Himmelssicht.
 *
 * Verglichen wird der gebackene Horizontwinkel mit dem aktuellen Sonnenstand.
 * Weil der Vergleich erst hier passiert, bleibt die Sonnenhöhe zur Laufzeit
 * einstellbar — nur der **Azimut** steckt fest in der Karte, weil entlang von
 * ihm gebacken wurde.
 *
 * Die Breite des Halbschattens wächst mit der Entfernung des verdeckenden
 * Kamms. Ein Grat drei Meter neben einem Stein wirft eine scharfe Kante, ein
 * Gipfel zwei Kilometer entfernt einen weichen Verlauf — dieselbe Beobachtung,
 * die auch echte Schatten macht.
 */
vec2 atmoShade(vec3 worldPos) {
  vec3 shade = texture(uAtmoShade, atmoMapUv(worldPos.xz, uAtmoShadeDecode.z)).rgb;

  float horizonDeg = shade.r * shade.r * uAtmoShadeDecode.x;
  float occluderDistance = shade.g * shade.g * uAtmoShadeDecode.y;
  float penumbra = max(uAtmoShadeSoftness.x + occluderDistance * uAtmoShadeSoftness.y, 1e-3);

  float lit = smoothstep(horizonDeg - penumbra, horizonDeg + penumbra, uAtmoSunElevationDeg);
  // Der Wolkenschatten wird **hier** aufgeschlagen und nicht bei den Aufrufern.
  // Sieben Materialien rufen atmoShade() (Terrain, Wasser, Straßen, Decals,
  // Props, Vegetation, Imposter, Fassaden); jedes einzeln zu bedienen wäre
  // genau der Fehler aus P4, wo der Wind nur im Mesh-Material hing und drei
  // Viertel der sichtbaren Instanzen stillstanden. An dieser einen Stelle kann
  // ihn kein System verpassen.
  return vec2(mix(uAtmoShadeAmbient, 1.0, lit) * atmoCloudShadow(worldPos.xz), shade.b);
}

/**
 * Optische Dichte einer exponentiellen Schicht entlang eines Strahls.
 *
 * Analytisch, nicht per Ray-Marching: für ρ(y) = ρ₀·exp(−y/H) lässt sich das
 * Integral über eine Strecke geschlossen angeben. Das ist der Unterschied
 * zwischen einem Nebel, der pro Pixel eine Handvoll Rechenschritte kostet, und
 * einem, der zwanzig Abtastungen braucht.
 */
float atmoOpticalDepth(float density, float falloff, float yFrom, float yTo, float length) {
  float fFrom = exp(-yFrom / falloff);
  float dy = yTo - yFrom;

  // Fast waagerechter Strahl: der Grenzwert des Bruchs unten, ohne die
  // Auslöschung, die 0/0 in Gleitkomma anrichtet.
  if (abs(dy) < 0.05) return density * length * fFrom;

  float fTo = exp(-yTo / falloff);
  return density * length * falloff * (fFrom - fTo) / dy;
}

/**
 * Nebelfarbe aus dem Himmel.
 *
 * `blend` mischt zwischen unbunt (gleiche Helligkeit, kein Farbton) und der
 * vollen Himmelsfarbe in Blickrichtung. Die unbunte Variante ist der Anker:
 * so lässt sich Bodennebel entsättigen, ohne ihn dunkler zu machen.
 */
vec3 atmoFogColor(vec3 sky, float blend, vec3 tint) {
  float gray = dot(sky, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(gray), sky, blend) * tint;
}

/**
 * Zwei Nebelschichten auf eine Farbe legen.
 *
 * Bodennebel (dicht, niedrig) und Distanznebel (dünn, hoch) werden getrennt
 * integriert und dann **nach ihrem Beitrag gewichtet** gemischt. Eine einzelne
 * gemittelte Farbe wäre falsch: im Tal soll die kühle Bodenfarbe dominieren,
 * über den Gipfeln die Himmelsfarbe.
 */
vec3 atmoApplyFog(vec3 color, vec3 worldPos) {
  vec3 toFragment = worldPos - cameraPosition;
  float distance = length(toFragment);
  if (distance < 1e-3) return color;

  vec3 viewDirection = toFragment / distance;

  float ground = atmoOpticalDepth(
    uAtmoFogGround.x, uAtmoFogGround.y, cameraPosition.y, worldPos.y, distance
  );
  float aerial = atmoOpticalDepth(
    uAtmoFogAerial.x, uAtmoFogAerial.y, cameraPosition.y, worldPos.y, distance
  );

  float total = ground + aerial;
  if (total < 1e-4) return color;

  vec3 sky = texture(uAtmoSkyLut, atmoEquirectUv(viewDirection)).rgb;
  vec3 fogColor =
    (atmoFogColor(sky, uAtmoFogGround.z, uAtmoFogGroundTint) * ground +
     atmoFogColor(sky, uAtmoFogAerial.z, uAtmoFogAerialTint) * aerial) / total;

  float opacity = (1.0 - exp(-total)) * uAtmoFogMaxOpacity;
  return mix(color, fogColor, opacity);
}
