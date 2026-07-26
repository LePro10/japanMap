// Ersetzt <map_fragment> im Wasser-Material.

float viewDistance = length(vWaterWorld - cameraPosition);

// Je Wellenlage ein eigener Ausblendbereich, grob proportional zur
// Wellenlänge: die 37-m-Dünung trägt bis in den Kilometerbereich, die
// 4,6-m-Kräuselung ist nach ein paar hundert Metern nur noch Rauschen.
vec3 waveFade = vec3(
  1.0 - smoothstep(600.0, 3000.0, viewDistance),
  1.0 - smoothstep(150.0, 1200.0, viewDistance),
  1.0 - smoothstep(40.0, 400.0, viewDistance)
);

// Wassertiefe unter diesem Pixel. Außerhalb der Weltgrenzen klemmt die
// Heightmap auf den Randtexel — im Norden wären das Berge, und dort stünde
// dann kein Wasser. Draußen ist aber offenes Meer, also wird die Tiefe dort
// auf einen festen Wert gesetzt.
vec2 insideWorld = step(abs(vWaterWorld.xz), vec2(uWorldSize.y));
float outside = 1.0 - insideWorld.x * insideWorld.y;
float depth = max(-terrainSurface(vWaterWorld.xz), 0.0);
depth = mix(depth, 80.0, outside);

gWaterNormal = waterNormal(vWaterWorld.xz, uAtmoTime, waveFade);
gWaterShade = atmoShade(vWaterWorld);

// Grundfarbe: flach ist heller und leicht grünlich, tief fast schwarz. Bei
// blauer Stunde trägt die Spiegelung das Bild, nicht die Eigenfarbe.
float depthMix = clamp(depth / uWaterDepthFade, 0.0, 1.0);
diffuseColor.rgb *= mix(uWaterShallowColor, uWaterDeepColor, depthMix);

// Schaumsaum. Die Wellenauslenkung moduliert die Grenze, sonst läge der Schaum
// als gleichmäßige Kontur um die Insel — eine Linie, keine Brandung.
float waveOffset = waterWaveHeight(vWaterWorld.xz, uAtmoTime, waveFade) * uWaterFoam.w;
float foam = 1.0 - smoothstep(
  uWaterFoam.x - uWaterFoam.y,
  uWaterFoam.x + uWaterFoam.y,
  depth + waveOffset
);
foam *= uWaterFoam.z * (1.0 - outside);
diffuseColor.rgb += vec3(foam);

// Rauheit wächst mit der Entfernung. Was in der Nähe eine spiegelnde Fläche
// mit sichtbaren Wellen ist, ist in zwei Kilometern eine matte Fläche — die
// Wellen sind dort kleiner als ein Pixel, und ihre Wirkung ist statistisch
// genau das: mehr Streuung. Ohne diesen Verlauf flimmert der Horizont.
gWaterRoughness = mix(uWaterRoughness, 0.30, smoothstep(100.0, 1400.0, viewDistance));
gWaterRoughness = mix(gWaterRoughness, 0.55, foam);

// Die letzten Zentimeter am Ufer blenden auf, damit die Wasserebene nicht als
// Kante ins Gelände schneidet.
//
// Das `max` mit dem Schaum ist der Punkt, an dem der erste Versuch scheiterte:
// die Uferblende zog die Deckkraft genau dort auf null, wo der Schaum am
// stärksten ist. Er wurde gerechnet und im selben Atemzug wegmultipliziert —
// übrig blieb eine harte, saumlose Schnittkante. Schaum ist aber gerade das,
// was in ganz flachem Wasser noch **sichtbar** ist; er muss die Blende
// überstimmen dürfen.
float edge = smoothstep(0.0, uWaterEdgeFade, depth);
diffuseColor.a *= max(edge, foam);
