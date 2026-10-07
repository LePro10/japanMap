/**
 * Der Stadtdistrikt — PLAN.md P6 / 6.1.
 *
 * **Reines ESM mit Typen daneben in `.d.mts`**, nach dem Muster von
 * `palette.mjs` und `splineSampler.mjs`. Der Grund ist derselbe wie dort und
 * hier besonders scharf: `tools/gen-roads.mjs` legt das Höhenprofil der
 * Stadtstraße auf `groundY`, der Baker füllt das Gelände darauf auf, und der
 * `CityGenerator` legt seine Bodenplatte in dieselbe Ebene. Laufen diese drei
 * Zahlen auseinander, entsteht entweder eine Stufe im Asphalt oder ein
 * Tiefenpuffer-Streit — beides sichtbar, beides schwer zuzuordnen.
 *
 * ## Warum genau dieser Kasten
 *
 * Die Stadtzone des Bakers ist 800 × 800 m um (780, 90) und wird gegen 30 m
 * eingeebnet. Gemessen im **unverbauten** Höhenfeld (`.cache/clean.r16`,
 * Raster 6 m):
 *
 * | Kasten | Größe | Höhe min … max | Abstand zum Straßennetz |
 * |---|---|---|---|
 * | ganzes Plateau | 800 × 800 | 27,71 … 32,67 m | 0 m (der Ring läuft hindurch) |
 * | 450…850 / 0…430 | 400 × 430 | 28,76 … 29,74 m | **0 m** |
 * | 420…820 / −100…320 | 400 × 420 | 28,88 … 29,77 m | 14 m |
 * | **440…800 / −60…300** | **360 × 360** | **28,96 … 29,77 m** | **41 m** |
 *
 * Der gewählte Kasten ist nicht der größte, sondern der einzige, der beides
 * hält: unter 1 m Höhenspanne **und** genug Abstand, dass die Ringstraße nicht
 * mitten hindurchläuft. Der Ring verläuft östlich und südöstlich daran vorbei —
 * die Stadt liegt damit an der Strecke, ohne sie zu zerschneiden.
 *
 * `groundY` liegt **über** dem höchsten gemessenen Geländepunkt im Kasten
 * (29,77 m), damit die Platte nirgends vom Terrain durchstoßen wird. Der
 * Sicherheitsabstand ist mit 23 cm knapp und deshalb eine geprüfte Zusage, keine
 * Annahme: `CityGenerator` misst ihn beim Bauen nach und meldet ihn.
 *
 * > **Neo-Tokio, 2026-09-23 (docs/TOKYO.md): der Distrikt ist jetzt der
 * > 1-km-Kern, und der Ring läuft absichtlich hindurch.** Die Begründung oben
 * > („nicht mitten hindurch") gilt für eine Stadt, die neben der Strecke liegt.
 * > Die neue Stadt nimmt den Ring auf: sein Dammstück im Norden wird zur
 * > aufgeständerten Stadtautobahn, der ebenerdige Südabschnitt zur Diagonale.
 * > Die Trasse des Rings bleibt dabei unverändert — er wird auf dem **alten**
 * > sauberen Feld trassiert, siehe `LEGACY_PAD_DISTRICT`.
 * >
 * > Gelände im neuen Kasten, abgelesen am gebackenen Feld (100-m-Raster):
 * > 25…37 m, am Nordrand (z = −250) im Osten bis ~55 m — dort übernimmt eine
 * > Stützmauer die Kante.
 */

/** Der Distrikt in Weltkoordinaten. Norden ist −Z. */
export const CITY_DISTRICT = {
  minX: 300,
  maxX: 1300,
  minZ: -250,
  maxZ: 450,
  centerX: 800,
  centerZ: 100,
  /** Kantenlängen in Metern — seit Neo-Tokio kein Quadrat mehr. */
  sizeX: 1000,
  sizeZ: 700,
  /** Größere Kantenlänge; nur noch für grobe Reichweiten gedacht. */
  size: 1000,
  /**
   * Der Kern ist kein Rechteck: im Nordosten (x > 1040) beginnt er erst bei
   * z = −160. Dort steigt das Gelände auf 45…55 m; mit Rasterstraßen auf 30 m
   * gemessen **bis 22 m Einschnitt** (east-rim, kita-dori, showa-dori). Statt
   * einer 20-m-Stützmauer wird der Hang zum Park unter dem Turm.
   * `minX…maxZ` oben ist die umschließende Box.
   */
  parts: [
    { minX: 300, maxX: 1300, minZ: -160, maxZ: 450 },
    { minX: 300, maxX: 1040, minZ: -250, maxZ: -160 },
  ],
};

/**
 * Der alte 360-m-Kasten — **nur** für die Einebnung in `bake:clean`.
 *
 * `padCity` läuft auch ohne Straßen, und auf genau diesem sauberen Feld
 * trassiert `gen-roads` den Ring. Ein größerer Kasten hier hätte ihm ein anderes
 * Gelände gezeigt und die Rennstrecke verschoben. Im sauberen Feld bleibt die
 * Einebnung deshalb bitgleich zum Stand vor Neo-Tokio; der neue Kern wird erst
 * im echten Bake **nach** dem Einschneiden eingeebnet.
 */
export const LEGACY_PAD_DISTRICT = {
  minX: 440,
  maxX: 800,
  minZ: -60,
  maxZ: 300,
};

/**
 * Höhe der Asphaltebene des Distrikts, in Metern.
 *
 * Alles Städtische bezieht sich hierauf: Bodenplatte, Bürgersteige (+15 cm),
 * Gebäudesockel, und über `CITY_ROAD_LEVEL` auch die Fahrbahn der Stadtstraße.
 */
export const CITY_GROUND_Y = 30;

/**
 * Höhe, auf die `tools/gen-roads.mjs` das Profil der Stadtstrecken legt.
 *
 * **Nicht `CITY_GROUND_Y`.** Das Straßen-Mesh liegt um `ROAD_MESH.surfaceOffset`
 * (6 cm) über seiner Mittellinie — ein Abstand, den P3 eingeführt hat, damit
 * Fahrbahn und eingeschnittenes Gelände nicht um jedes Pixel streiten. Läge die
 * Mittellinie auf 30,00 m, stünde die Fahrbahn 6 cm über der Stadtplatte und
 * zöge quer durch den Distrikt eine Bordsteinkante, die es nicht geben soll.
 * Also wird die Mittellinie um genau diesen Betrag abgesenkt; die Fahrbahn
 * landet dann exakt in der Ebene der Platte.
 */
export const CITY_ROAD_LEVEL = CITY_GROUND_Y - 0.06;

/**
 * Höhe, auf die der Baker das Gelände im Distrikt legt — Schritt 5d.
 *
 * ## Warum das Gelände tiefer liegt als die Stadt
 *
 * Die Bodenplatte ist eine **flache Fläche über einem verschobenen Gitter**.
 * Das Terrain wird im Vertex-Shader aus der Heightmap ausgelenkt, und zwar an
 * den Stützstellen des CDLOD-Gitters — nicht an denen der Heightmap. Zwischen
 * zwei Gitterpunkten läuft eine Gerade, und die liegt über der Kurve, der sie
 * folgen soll. Wie weit, hängt an der LOD-Stufe und ist nicht vorhersagbar.
 *
 * **Gemessen wurde das als Fehler, nicht ausgerechnet.** Der erste Entwurf gab
 * der Platte 3 cm Abstand zum eingeschnittenen Gelände — sauber gerechnet aus
 * 14 641 Höhenproben. Im Bild stand die Stadt trotzdem auf Gras: das Terrain
 * wurde über der Platte gezeichnet, auf ganzer Fläche, und zwar auch direkt vor
 * der Kamera. Die Proben waren richtig und die Frage war falsch — gemessen
 * gehört das **gerenderte Gitter**, nicht das Höhenfeld, aus dem es entsteht.
 *
 * Ein knapper Abstand ist gegen diesen Fehler nicht zu verteidigen, also
 * bekommt er einen ganzen Meter. Das kostet nichts: unter der Platte sieht
 * niemand hin.
 *
 * Der Schritt läuft **nach** dem Straßeneinschnitt. Sonst füllte die Böschung
 * der Stadtstraße das Gelände wieder auf ihre eigene Höhe auf — und läge damit
 * erneut Zentimeter unter der Platte.
 */
export const CITY_PAD_Y = 29;

/**
 * Über welche Strecke die Einebnung ausläuft, in Metern.
 *
 * 60 und nicht 120: der Auslauf verändert das Gelände, und das Gelände trägt
 * die Ringstraße, die 41 m am Distrikt vorbeiführt. Jeder Meter Reichweite hier
 * ist ein Meter, den die Trassierung der Ringstraße mitbekommt — siehe
 * CLAUDE.md, „Ein Parameter mit Fernwirkung".
 */
export const CITY_PAD_FEATHER = 60;

/**
 * Harte Zugehörigkeit zum Distrikt — ja oder nein, ohne Auslauf.
 *
 * `districtBlend` ist für Höhen: der 60-m-Saum der Einebnung und der 24-m-Saum
 * der Schürze müssen weich auslaufen, sonst knickt das Gelände. Die Belagsfrage
 * ist binär. Die Bodenplatte (`RoadMaterial`, dieselbe Textur wie die Fahrbahn)
 * liegt genau in diesem Kasten; der Saum der Schürze ist der Übergang ins
 * Gelände und bleibt Gelände.
 */
export function inCityDistrict(x, z) {
  for (const p of CITY_DISTRICT.parts) {
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return true;
  }
  return false;
}

/**
 * Weiche Zugehörigkeit zum Distrikt, 1 innen und 0 weiter als `feather` außen.
 *
 * Die Höhenanpassung der Straße braucht keinen harten Rand: ein Sprung von
 * „Gelände folgen" auf „30 m halten" an einer Kante wäre ein Knick im Profil,
 * den die Steigungsbegrenzung anschließend mühsam wieder ausbügelt. Mit dem
 * Auslauf steigt die Trasse über `feather` Meter aus dem Gelände auf die
 * Stadtebene — bei 60 m und knapp einem Meter Differenz sind das 1,6 % Neigung.
 */
export function districtBlend(x, z, feather = 60, box = CITY_DISTRICT) {
  // Abstand zur Vereinigung der Teilkästen = kleinster Abstand zu einem davon.
  let q = Infinity;
  for (const p of box.parts ?? [box]) {
    const dx = Math.max(p.minX - x, x - p.maxX, 0);
    const dz = Math.max(p.minZ - z, z - p.maxZ, 0);
    if (dx === 0 && dz === 0) return 1;
    const d = dx * dx + dz * dz;
    if (d < q) q = d;
  }

  // Quadratisch vergleichen und die Wurzel nur ziehen, wenn sie gebraucht wird.
  // Das ist hier keine Mikrooptimierung: die Vegetations-Streuung ruft diese
  // Funktion für **jeden** Kandidaten auf, das sind bei Gras rund 6700 je Chunk,
  // und für die weit über 99 % der Karte, die nicht Stadt sind, endet sie damit
  // nach zwei Multiplikationen.
  if (q >= feather * feather) return 0;
  const t = 1 - Math.sqrt(q) / feather;
  return t * t * (3 - 2 * t);
}
