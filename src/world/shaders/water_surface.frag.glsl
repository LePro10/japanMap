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
// **Gegen die Höhe dieser Fläche, nicht gegen null.** Bis P8.6 stand hier
// `-terrainSurface(...)`, weil es nur das Meer gab und das auf y = 0 liegt.
// Der Fluss liegt auf jeder Höhe zwischen 163 m und dem Meer; mit der alten
// Formel wäre er auf ganzer Länge „80 m tief" gewesen. Für das Meer ändert
// sich nichts: dort ist `vWaterWorld.y` exakt 0.
float depth = max(vWaterWorld.y - terrainSurface(vWaterWorld.xz), 0.0);
depth = mix(depth, 80.0, outside);

gWaterNormal = waterNormal(vWaterWorld.xz, uAtmoTime, waveFade);
gWaterShade = atmoShade(vWaterWorld);

// Fließendes Wasser steht schief. Die Wellennormale oben ist um die Senkrechte
// gebaut — auf einem Bett mit Gefälle und erst recht auf einer Wasserfallstufe
// gehört ihre Störung auf die **tatsächliche** Flächennormale gedreht, sonst
// wird eine 40-m-Stufe beleuchtet wie ein Teich.
//
// Der Zweig hängt an einer Uniform statt an einem eigenen Programm: beide
// Materialien teilen sich den Shader (`customProgramCacheKey`), und ein
// zweites Programm für zwei Zeilen wäre 30 zusätzliche Übersetzungen wert.
float riverFoam = 0.0;
float riverVoid = 0.0;
if (uWaterRiver > 0.5) {
  gWaterNormal = normalize(vWaterSurfaceN + (gWaterNormal - vec3(0.0, 1.0, 0.0)));
  // Schaum, wo die Fläche steil steht: Stromschnelle und Wasserfall.
  riverFoam = smoothstep(0.10, 0.45, 1.0 - clamp(vWaterSurfaceN.y, 0.0, 1.0));

  // **Wo kein Bett ist, ist auch kein Wasser.** Der Straßeneinschnitt kreuzt
  // das Flussbett an 19 von 422 Knoten und schneidet dort bis 35 m tief — die
  // Wasserfläche spannte sich als **Aquädukt** über den Graben. Im Bild war
  // das ein helles Band, das frei in der Luft steht; gefunden hat es die
  // Differenz gegen ein Bild ohne Fluss, nicht die Zahlen (die Wasserlinie ist
  // an keinem Knoten unter dem Gelände, das war nie das Problem).
  //
  // Das hier ist eine **Notmaßnahme, keine Lösung**: der Fluss blendet über
  // dem Graben aus, statt darüber zu schweben. Richtig wäre eine Brücke oder
  // ein Durchlass — beides Geometrie, beides nicht in P8.
  riverVoid = smoothstep(6.0, 14.0, depth);
}

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
foam = max(foam, riverFoam);
foam *= uWaterFoam.z * (1.0 - outside);

// ── Kielwelle ────────────────────────────────────────────────────────────
//
// Forza-Look: ein V hinter dem Auto (Schaum wird nach hinten breiter) plus
// ein Bugwulst um die Karosserie. Nur wenn `uVehicleFwd.z` an ist — sonst
// bleibt das Meer, was es war. Die Geometrie ist ein Quad, also lebt das
// hier im Fragment, nicht in den Vertices.
float wakeFoam = 0.0;
if (uVehicleFwd.z > 0.5) {
  vec2 toCar = vWaterWorld.xz - uVehicleWake.xy;
  float along = -dot(toCar, uVehicleFwd.xy);
  float across = toCar.x * (-uVehicleFwd.y) + toCar.y * uVehicleFwd.x;
  float dist = length(toCar);
  float pace = smoothstep(1.5, 14.0, uVehicleWake.w);

  float halfW = 0.85 + along * 0.42;
  float inV = smoothstep(0.2, 2.2, along)
    * (1.0 - smoothstep(halfW, halfW + 2.4, abs(across)))
    * exp(-along * 0.055);
  float bow = exp(-dist * dist * 0.085) * (1.0 - smoothstep(4.5, 7.0, dist));
  wakeFoam = pace * clamp(inV * 0.95 + bow * 0.55, 0.0, 1.0);

  gWaterNormal = normalize(gWaterNormal + vec3(
    across * 0.08,
    0.0,
    -along * 0.05
  ) * wakeFoam);
}

foam = max(foam, wakeFoam);
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
diffuseColor.a *= 1.0 - riverVoid;
