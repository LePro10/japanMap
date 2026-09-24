/**
 * Neo-Tokio — das Stadtraster als Daten (docs/TOKYO.md, Phase 1).
 *
 * **Reines ESM mit Typen daneben**, aus demselben Grund wie `city.mjs`: das
 * Raster wird von `tools/wp6-roads.mjs` in `roads.json` geschrieben (Minikarte,
 * Rennen, KI, Einschnitt) *und* vom `CityGenerator` zur Laufzeit gelesen
 * (Blöcke, Gehwege, Markierungen). Stünde es zweimal da, liefen Fahrbahn und
 * Bebauung beim ersten Nachtrag auseinander.
 *
 * ## Warum ein Raster und keine organischen Splines
 *
 * Die WP6-Stadtstraßen waren gerundete Polygonzüge (`filletPath`, Radius 75 m).
 * Zwischen ihnen blieben dreieckige Restflächen, und die Häuser standen im
 * Abstand zu Kurven statt an Straßenkanten — gemessen im Luftbild
 * `report_stadtluft_ultra.png`: der Kern ist ein leerer Asphaltplatz, darum
 * verstreute Kästen. Tokio ist dicht, weil seine Blöcke **Kanten** haben. Das
 * Raster ist nicht streng: Achsen springen um einige Meter, Blöcke sind
 * zusammengelegt, und eine Diagonale führt in die Scramble-Kreuzung.
 *
 * ## Der Ring
 *
 * Die Hauptstrecke läuft mitten durch den Kern (x ≈ 920…980) und fällt dabei
 * auf einem Damm von 67 m auf Stadthöhe bei z ≈ 190. Ihre Trasse bleibt
 * unverändert. Nördlich von `RING_GRADE_Z` liegt sie **über** der Stadt — dort
 * kreuzt das Raster sie nicht, es läuft darunter hindurch (die Hochstraße aus
 * Phase 6). Südlich davon liegt sie ebenerdig und wird zur Diagonale.
 *
 * Koordinaten in Metern, x nach Osten, z nach Süden (Norden ist −Z).
 */

/** Ab dieser Tiefe (z) liegt der Ring auf Stadthöhe; nördlich davon ist er Hochstraße. */
export const RING_GRADE_Z = 180;

/** Straßenklassen: Breite von Bordstein zu Bordstein in Metern. */
export const STREET_CLASS = {
  boulevard: 24,
  avenue: 16,
  street: 10,
  lane: 7,
  // Gasse: ein Auto breit, kein Gehweg — Omoide Yokochō, Golden Gai,
  // Takeshita. Fahrbar, weil man in einem Driftspiel genau dort hinein will.
  alley: 5,
};

/**
 * Das Rennen `neon-circuit` fährt auf der Straße `stadt`. Sie ist seit Neo-Tokio
 * ein Stadtkurs durch Kabukichō und die Scramble-Kreuzung: Nordkante auf der
 * Yasukuni-Achse, Ostkante auf x = 800, Diagonale in die Scramble, dann die
 * Bahnhofsallee nach Westen und zurück nach Norden. Vier 90°-Ecken mit 16 m
 * Radius — eng genug für Handbremse, weit genug für die KI.
 */
export const CITY_CIRCUIT = {
  width: 14,
  radius: 16,
  corners: [
    [480, -160],
    [800, -160],
    [800, 220],
    [640, 300],
    [480, 300],
  ],
};

/** Die Scramble-Kreuzung: fünf Arme, eine Fläche, Zebrastreifen diagonal. */
export const SCRAMBLE = { x: 640, z: 300, radius: 34 };

/**
 * Das Straßennetz — `[id, Klasse, Kontrollpunkte, Eckradius?]`.
 *
 * ## v2: kein Raster mehr, sondern Viertel mit eigener Handschrift
 *
 * Die erste Fassung war ein achsparalleles Gitter, weil der Generator nur
 * achsparallele Blöcke konnte. Das hat man ihm angesehen, im Luftbild wie beim
 * Fahren: „das Gitter ist statisch und langweilig", „repetitiv durch die Straßen
 * zu fahren", und die einzige Diagonale wurde zu Treppenstufen aus 2-m-Kacheln.
 * Seit Generator v2 (Blöcke aus einem Abstandsfeld, Häuser entlang der
 * Bordsteinlinie gedreht) darf eine Straße jede Form haben — und jedes Viertel
 * bekommt die, die zu ihm gehört:
 *
 *  - **Ginza** bleibt ein strenges Raster mit 40-m-Blöcken — der eine Ort, an
 *    dem Ordnung der Charakter ist.
 *  - **Shibuya** fächert von der Scramble aus: Kōen-dōri schwingt nach Norden,
 *    Bunkamura-dōri und Dōgenzaka laufen auseinander, Takeshita ist eine Gasse.
 *  - **Kabukichō** hat die geschwungene Hanamichi-dōri (im Vorbild ein
 *    zugeschütteter Fluss), Gassen, die an ihr enden, und einen Kinoplatz.
 *  - **Golden Gai** und **Omoide Yokochō** sind Gassen von 5 m.
 *  - **Minato** windet sich den Hang hinauf, mit Schrein und Taschenpark.
 *  - **Akiba** bekommt die Schräge der Denki-gai.
 *
 * Die Hauptachsen (Aoi-dōri, Meiji-dōri, Chūō-dōri, Yasukuni, Scramble-Ost)
 * bleiben gerade: an ihnen hängen der Stadtkurs, die Anschlüsse nach außen und
 * die Orientierung. Ein Eckradius rundet die Knicke des Polygonzugs
 * (`streetPoints`); die Spline in `buildRoad` läuft durch jeden Punkt.
 */
export const GRID_STREETS = [
  // ── Unter der Hochstraße ───────────────────────────────────────────────
  // Folgt der Ring-Mittellinie (Werte aus roads.json, Stand Phase 1) von der
  // Kita-dōri bis zur Aoi-dōri — in Tokio liegt unter der Shuto fast immer eine
  // Straße. Zuerst in der Liste, damit die Querstraßen an ihr einrasten.
  ['shuto-shita', 'avenue', [[964, -240], [965, -209], [970, -183], [978, -132], [976, -106], [968, -79], [951, -26], [943, 0], [935, 28], [929, 60]], 0],

  // ── Hauptachsen ────────────────────────────────────────────────────────
  ['aoi-dori', 'boulevard', [[300, 60], [1300, 60]]],
  ['meiji-dori', 'boulevard', [[640, -250], [640, 300]]],
  ['meiji-south', 'boulevard', [[640, 300], [640, 450]]],
  ['chuo-dori', 'avenue', [[1040, -250], [1040, 440]]],
  ['scramble-east', 'avenue', [[640, 300], [1300, 300]]],
  ['nishi-shinjuku', 'avenue', [[400, -250], [400, 450]]],
  ['yasukuni-west', 'avenue', [[300, -160], [480, -160]]],
  ['yasukuni-east', 'avenue', [[800, -160], [1300, -160]]],
  ['kita-dori', 'street', [[320, -240], [560, -240], [700, -232], [880, -240], [1040, -240]], 60],
  ['shinjuku-dori', 'street', [[400, 4], [520, 8], [640, 2], [800, 6], [900, -2], [1040, 2], [1280, -4]], 80],

  // ── Nishi-Shinjuku: Superblöcke, Türme stehen auf Plätzen ─────────────────
  ['tocho-dori', 'street', [[300, -60], [400, -60]]],
  ['koen-west', 'street', [[300, 140], [400, 140]]],

  // ── Kabukichō ──────────────────────────────────────────────────────────
  ['kabuki-north', 'street', [[480, -250], [480, -160]]],
  ['hanamichi-dori', 'street', [[400, -44], [445, -52], [495, -72], [545, -80], [595, -70], [640, -58]], 40],
  ['ichiban-gai', 'lane', [[560, 60], [557, 20], [552, -22], [548, -79]], 20],
  ['sakura-dori', 'lane', [[520, -160], [522, -128], [506, -112], [504, -73]], 12],
  ['shokuan-dori', 'street', [[400, -112], [470, -112], [506, -112]]],
  ['kuyakusho', 'lane', [[440, -160], [440, -112]]],
  ['sakura-south', 'lane', [[470, 60], [476, 20], [470, -60]], 20],
  ['omoide-yokocho', 'alley', [[594, -250], [594, -160]]],

  // ── Golden Gai: Gassen von 5 m zwischen Meiji-dōri und Stadtkurs ─────────
  ['golden-lane', 'street', [[720, -250], [720, -160]]],
  ['gai-1', 'alley', [[690, -160], [690, -60]]],
  ['gai-2', 'alley', [[745, -160], [742, -110], [748, -60]], 8],
  ['gai-cross', 'lane', [[640, -60], [700, -64], [800, -60]], 20],

  // ── Unter der Shuto ────────────────────────────────────────────────────
  ['kawa-dori', 'street', [[880, -240], [874, -170], [886, -90], [872, -10], [880, 60]], 50],
  ['sumida-yoko', 'street', [[800, -80], [880, -86], [1040, -80]], 40],
  // Endet vor dem Ring: der liegt hier noch 2…4 m über der Stadt, auf der Rampe.
  ['kanda', 'lane', [[800, 128], [845, 136], [880, 130]], 20],

  // ── Akiba: die Schräge der Denki-gai ───────────────────────────────────
  ['denki-gai', 'street', [[1040, -30], [1130, -95], [1220, -160]], 30],
  ['showa-dori', 'street', [[1120, -160], [1120, 300]]],
  ['harumi-dori', 'street', [[1200, -160], [1200, 300]]],
  ['east-rim', 'street', [[1280, -160], [1280, 440]]],

  // ── Ginza: das eine strenge Raster ─────────────────────────────────────
  ['ginza-2', 'street', [[990, 140], [1280, 140]]],
  ['ginza-4', 'avenue', [[876, 222], [1280, 222]]],
  ['ginza-namiki', 'lane', [[1160, 60], [1160, 222]]],
  ['ginza-azuma', 'lane', [[1240, 60], [1240, 222]]],

  // ── Minato: gewunden, den Hang hinauf ──────────────────────────────────
  ['juban-dori', 'lane', [[866, 262], [930, 272], [1040, 262]], 30],
  ['sakamichi', 'street', [[1040, 300], [1010, 334], [1024, 372], [990, 410], [998, 437]], 25],
  ['shirokane', 'lane', [[900, 300], [912, 350], [896, 400], [905, 437]], 20],
  ['hikawa-zaka', 'lane', [[1120, 300], [1104, 340], [1132, 380], [1118, 437]], 20],
  ['azabu', 'lane', [[1200, 300], [1214, 350], [1186, 396], [1200, 438]], 20],
  ['sendai-zaka', 'lane', [[1040, 372], [1120, 364], [1200, 376], [1280, 366]], 30],
  ['minami-east', 'street', [[760, 440], [860, 432], [960, 444], [1060, 434], [1200, 440], [1280, 440]], 50],

  // ── Shibuya: fächert von der Scramble aus ──────────────────────────────
  ['koen-dori', 'street', [[700, 270], [706, 220], [700, 160], [712, 100], [720, 60]], 30],
  ['spain-zaka', 'alley', [[640, 200], [662, 188], [672, 164], [703, 158]], 10],
  ['station-lane', 'lane', [[560, 60], [560, 200]]],
  ['inokashira', 'lane', [[480, 150], [520, 140], [560, 146]], 20],
  ['udagawa', 'lane', [[400, 210], [440, 200], [480, 214]], 20],
  ['dogenzaka', 'avenue', [[300, 300], [480, 300]]],
  ['bunkamura-dori', 'street', [[640, 300], [600, 338], [560, 378], [520, 440]], 30],
  ['udagawa-south', 'lane', [[400, 384], [470, 374], [556, 384]], 20],
  ['takeshita', 'alley', [[720, 300], [716, 350], [724, 400], [718, 440]], 20],
  ['cat-street', 'lane', [[640, 380], [680, 372], [720, 380]], 20],
  ['minami-dori', 'street', [[400, 440], [640, 440]]],
];

/** Kontrollpunkte einer Straße → dichter Polygonzug mit gerundeten Knicken. */
export function streetPoints(street, step = 8) {
  const [, , controls, round = 0] = street;
  return round > 0 && controls.length > 2 ? filletOpen(controls, round, step) : densify(controls, step);
}

/**
 * Freiflächen — Parks, Schrein, Plätze. Der Generator baut hier keine Häuser;
 * `TokyoOpenSpaces` stattet sie aus. Die Polygone werden nur auf Enthaltensein
 * geprüft, der Umlaufsinn ist gleichgültig.
 *
 * Warum überhaupt: eine Stadt, die nur aus Blöcken besteht, ist auch dicht
 * langweilig — „mal ein Park oder mal was Verschiedenes". Tokio hat zwischen
 * den Türmen Plätze, am Bahndamm einen langen Park (Miyashita), hinter jeder
 * dritten Ecke einen Schrein.
 */
export const OPEN_SPACES = [
  { id: 'nishi-koen', type: 'park', polygon: [[304, 149], [391, 149], [391, 291], [304, 291]] },
  { id: 'tower-plaza', type: 'plaza', polygon: [[306, -150], [391, -150], [391, -118], [306, -118]] },
  { id: 'miyashita', type: 'park', polygon: [[613, 74], [627, 74], [627, 204], [613, 204]] },
  { id: 'cinema-plaza', type: 'plaza', polygon: [[528, -150], [597, -150], [597, -118], [528, -118]] },
  { id: 'hikawa-jinja', type: 'shrine', polygon: [[1222, 381], [1274, 381], [1274, 434], [1222, 434]] },
  { id: 'azabu-pocket', type: 'park', polygon: [[1053, 309], [1097, 309], [1097, 352], [1053, 352]] },
];

/**
 * Außennetz: die WP6-Routen des Stadtrands, die bisher durch den Kern liefen,
 * enden jetzt an dessen Rand und schließen an das Raster an. Routen, die ganz
 * außerhalb lagen, stehen weiter unverändert in `tools/wp6-layout.mjs`.
 *
 * `[id, Breite, Kontrollpunkte]` — dasselbe Format wie `URBAN_ROUTES`.
 */
export const EDGE_ROUTES = [
  ['crosslight-west', 14, [[80, 160], [300, 60]]],
  ['crosslight-east', 14, [[1300, 60], [1410, 240]]],
  ['lantern-north', 12, [[620, -380], [640, -250]]],
  ['lantern-south', 12, [[640, 450], [700, 540], [850, 600], [700, 730], [470, 740], [440, 850]]],
  ['workshop-way', 11, [[80, 160], [180, 280], [300, 300]]],
  ['market-street', 11, [[400, 450], [300, 500], [310, 650], [470, 740]]],
  ['rain-garden-drive', 12, [[1300, 300], [1340, 460], [1160, 620], [850, 600]]],
  // Keine Stichstraßen vom Nordostrand in den Hang: der Kern liegt dort auf 30 m,
  // der Hang auf 45…65 m. Gemessen zog die Steigungsgrenze über gekoppelte Knoten
  // east-lantern-road um 20,6 m und beacon-road um 14,3 m in einen Graben. Der
  // Hang bleibt über east-lantern-road (Anschluss crosslight-east) erreichbar.
  ['east-lantern-08', 9, [[1120, 440], [1160, 620]]],
  ['west-works-03', 9, [[160, -540], [220, -450], [400, -250]]],
  ['west-works-05', 9, [[180, -160], [330, -300], [480, -450]]],
  ['commons-drive', 9, [[550, 510], [520, 440]]],
];

/**
 * Viertel — Forza-Collage, dicht in der Mitte. Rechtecke in Weltkoordinaten;
 * wer in keinem liegt, gehört zum Übergangsgürtel (`urbanity` < 1).
 */
export const DISTRICTS = [
  // Erster Treffer gilt — Golden Gai und Omoide stehen deshalb vor Kabukichō.
  { id: 'golden-gai', name: 'Golden Gai', minX: 655, maxX: 800, minZ: -160, maxZ: -40, style: 'yokocho' },
  { id: 'omoide', name: 'Omoide Yokochō', minX: 560, maxX: 640, minZ: -250, maxZ: -160, style: 'yokocho' },
  { id: 'west-shinjuku', name: 'Nishi Towers', minX: 300, maxX: 400, minZ: -250, maxZ: 140, style: 'towers' },
  { id: 'kabukicho', name: 'Kabukichō', minX: 400, maxX: 800, minZ: -250, maxZ: 60, style: 'neon' },
  { id: 'shibuya', name: 'Shibuya Scramble', minX: 400, maxX: 800, minZ: 60, maxZ: 450, style: 'scramble' },
  { id: 'shuto', name: 'Under the Shuto', minX: 800, maxX: 1040, minZ: -250, maxZ: 222, style: 'underpass' },
  { id: 'akiba', name: 'Akiba Electric', minX: 1040, maxX: 1300, minZ: -250, maxZ: 60, style: 'electric' },
  { id: 'ginza', name: 'Ginza', minX: 1040, maxX: 1300, minZ: 60, maxZ: 222, style: 'ginza' },
  { id: 'minato', name: 'Minato', minX: 800, maxX: 1300, minZ: 222, maxZ: 450, style: 'residential' },
  { id: 'nishi-south', name: 'Nishi Park Side', minX: 300, maxX: 400, minZ: 140, maxZ: 450, style: 'residential' },
];

/** Wahrzeichen: der rote Gitterturm am Nordosthang, sichtbar von der ganzen Karte. */
export const LANDMARKS = {
  tower: { x: 1190, z: -330, height: 150 },
};

/**
 * Sonderbauten, die der Generator statt Parzellen setzt (Phase 4).
 *
 * - `cylinder` in der Gabel zwischen Dōgenzaka und Bunkamura-dōri — genau dort,
 *   wo in Shibuya der runde Kaufhausturm steht; die Spitze des Keils zeigt auf
 *   die Kreuzung.
 * - `tower`: das Hochhaus an der Südostecke der Scramble, Blickfang aus jeder
 *   Richtung und Orientierung in der ganzen Stadt.
 * - `station`: flache, lange Bahnhofshalle an der Nordwestecke, darüber die
 *   Hochbahn.
 */
export const SPECIAL_SITES = [
  { id: 'round-tower', type: 'cylinder', x: 585, z: 324, radius: 9, floors: 11 },
  { id: 'scramble-tower', type: 'tower', minX: 660, maxX: 700, minZ: 318, maxZ: 362, floors: 44 },
  { id: 'station', type: 'station', minX: 567, maxX: 621, minZ: 211, maxZ: 287, floors: 2 },
  // Das Kino am Kinoplatz — im Vorbild trägt es einen Kaiju-Kopf auf dem Dach.
  { id: 'cinema-tower', type: 'tower', minX: 536, maxX: 588, minZ: -112, maxZ: -90, floors: 14 },
];

/**
 * Die Hochbahn: Nord–Süd durch Shibuya und Kabukichō bei x = 606, Fahrbahnplatte
 * auf 9,8 m über der Stadt. Blöcke verlieren darunter einen 12-m-Streifen; die
 * Pfeiler stehen nur in Blöcken, nie auf der Fahrbahn. 9,8 m und nicht 8,5: das
 * Bahnhofsdach steht samt Brüstung auf 38,6 m und hätte die Platte durchstoßen.
 */
export const RAIL_LINE = { x: 606, minZ: -250, maxZ: 450, width: 11, deck: 9.8 };

/**
 * Begehbare Läden (Innenräume aus `CityInteriorLayout`) — verschoben statt neu
 * gebaut. Die Innenräume sind auf die alten Koordinaten modelliert (Diner bei
 * x 505…521, Mart bei x 638…650); hier steht nur, um wie viel jeder als Ganzes
 * wandert und welches Rechteck der Generator dafür freihält.
 *
 * - Diner: Öffnung nach Westen → an die Ostseite der Nishi-Shinjuku-Avenue
 *   (x = 400, Baulinie 412), Front bündig auf der Baulinie.
 * - Mart: Öffnung nach Süden → an die Nordseite der Aoi-dōri (z = 60, Baulinie
 *   43), neben dem Kabukichō-Tor. Die Fensterfront liegt dort auf 42,88.
 */
export const INTERIOR_SITES = [
  { id: 'diner', dx: -93, dz: -7, minX: 410, maxX: 429, minZ: 19.5, maxZ: 36.5 },
  { id: 'mart', dx: -66, dz: -102, minX: 571.5, maxX: 584.5, minZ: 33.5, maxZ: 44.5 },
];

/** Welcher Innenraum gehört zu einem Punkt in **alten** Koordinaten? */
export function interiorOffset(oldX) {
  return INTERIOR_SITES[oldX < 600 ? 0 : 1];
}

/** Das rote Tor über der Einfahrt nach Kabukichō (Gasse x = 560 an der Aoi-dōri). */
export const KABUKI_GATE = { x: 560, z: 48, span: 9, height: 7.4 };

/**
 * Städtischkeit `u(x, z)` — 1 im Kern, 0 in der freien Landschaft.
 *
 * **Eine Funktion für alle.** Baumdichte, Bodenmischung, Gebäudehöhe und die
 * Dichte der Ausstattung lesen alle hier. Vorher hingen sie an fünf eigenen
 * Regeln (`districtBlend`, `urbanLots.blocks`, Randring in `gen-props`, …) — und
 * genau daher kam der Eindruck „plötzlich im Wald": jede Regel hatte ihre eigene
 * Kante an einer anderen Stelle.
 *
 * Der Abfall läuft über `URBAN_FADE` Meter vom Kernrand und ist quadratisch
 * geglättet, damit zwischen dichter Stadt und Einzelhaus kein Sprung liegt.
 */
export const URBAN_FADE = 380;

export function urbanity(x, z, box = CORE_BOX) {
  let q = Infinity;
  for (const p of box.parts ?? [box]) {
    const dx = Math.max(p.minX - x, x - p.maxX, 0);
    const dz = Math.max(p.minZ - z, z - p.maxZ, 0);
    if (dx === 0 && dz === 0) return 1;
    q = Math.min(q, dx * dx + dz * dz);
  }
  const d = Math.sqrt(q);
  if (d >= URBAN_FADE) return 0;
  const t = 1 - d / URBAN_FADE;
  return t * t * (3 - 2 * t);
}

/** Der Kern — gleich `CITY_DISTRICT`, hier ohne Import, damit die Datei allein steht. */
export const CORE_BOX = {
  minX: 300,
  maxX: 1300,
  minZ: -250,
  maxZ: 450,
  parts: [
    { minX: 300, maxX: 1300, minZ: -160, maxZ: 450 },
    { minX: 300, maxX: 1040, minZ: -250, maxZ: -160 },
  ],
};

// ── Geometrie-Helfer für die Werkzeuge ──────────────────────────────────────

/** Punkte in `step`-Abständen entlang eines Polygonzugs (Endpunkt inklusive). */
export function densify(points, step = 16) {
  const out = [points[0].slice()];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/**
 * Offener Polygonzug mit Kreisbögen in den inneren Knicken, dicht abgetastet.
 * Wie `filletLoop`, nur ohne Schluss — Anfangs- und Endpunkt bleiben liegen,
 * damit die Straße an ihren Anschluss einrastet.
 */
export function filletOpen(points, radius, step = 8) {
  const out = [points[0].slice()];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1], c = points[i], q = points[i + 1];
    const ux = p[0] - c[0], uz = p[1] - c[1], lu = Math.hypot(ux, uz);
    const vx = q[0] - c[0], vz = q[1] - c[1], lv = Math.hypot(vx, vz);
    const ax = ux / lu, az = uz / lu, bx = vx / lv, bz = vz / lv;
    const cos = Math.max(-1, Math.min(1, ax * bx + az * bz));
    const half = Math.acos(cos) / 2;
    // Fast gerade: kein Bogen, nur weiterlaufen.
    if (half > Math.PI / 2 - 0.01) {
      out.push(...densify([out[out.length - 1], c], step).slice(1));
      continue;
    }
    const tangent = Math.min(radius / Math.tan(half), lu * 0.45, lv * 0.45);
    const r = tangent * Math.tan(half);
    const s = [c[0] + ax * tangent, c[1] + az * tangent];
    const e = [c[0] + bx * tangent, c[1] + bz * tangent];
    const hx = ax + bx, hz = az + bz, hl = Math.hypot(hx, hz) || 1;
    const d = r / Math.sin(half);
    const m = [c[0] + (hx / hl) * d, c[1] + (hz / hl) * d];
    const a0 = Math.atan2(s[1] - m[1], s[0] - m[0]);
    let da = Math.atan2(e[1] - m[1], e[0] - m[0]) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    out.push(...densify([out[out.length - 1], s], step).slice(1));
    const steps = Math.max(2, Math.ceil((Math.abs(da) * r) / (step * 0.5)));
    for (let k = 1; k <= steps; k++) {
      const a = a0 + (da * k) / steps;
      out.push([m[0] + Math.cos(a) * r, m[1] + Math.sin(a) * r]);
    }
  }
  out.push(...densify([out[out.length - 1], points[points.length - 1]], step).slice(1));
  return out;
}

/**
 * Geschlossener Polygonzug mit Kreisbögen in den Ecken, dicht abgetastet.
 *
 * Die Spline in `buildRoad` läuft durch **jeden** Punkt; mit einem Punkt alle
 * ~8 m folgt sie Gerade und Bogen, statt die Ecke nach eigenem Gusto zu runden.
 */
export function filletLoop(corners, radius, step = 8) {
  const n = corners.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = corners[(i - 1 + n) % n];
    const c = corners[i];
    const q = corners[(i + 1) % n];
    const ux = p[0] - c[0], uz = p[1] - c[1], lu = Math.hypot(ux, uz);
    const vx = q[0] - c[0], vz = q[1] - c[1], lv = Math.hypot(vx, vz);
    const ax = ux / lu, az = uz / lu, bx = vx / lv, bz = vz / lv;
    const cos = Math.max(-1, Math.min(1, ax * bx + az * bz));
    const half = Math.acos(cos) / 2;
    const tangent = Math.min(radius / Math.tan(half), lu * 0.45, lv * 0.45);
    const r = tangent * Math.tan(half);
    const s = [c[0] + ax * tangent, c[1] + az * tangent];
    const e = [c[0] + bx * tangent, c[1] + bz * tangent];
    // Mittelpunkt: auf der Winkelhalbierenden im Abstand r / sin(half).
    const hx = ax + bx, hz = az + bz, hl = Math.hypot(hx, hz) || 1;
    const d = r / Math.sin(half);
    const m = [c[0] + (hx / hl) * d, c[1] + (hz / hl) * d];
    const a0 = Math.atan2(s[1] - m[1], s[0] - m[0]);
    let a1 = Math.atan2(e[1] - m[1], e[0] - m[0]);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil((Math.abs(da) * r) / (step * 0.5)));
    // Gerade vom letzten Bogenende bis hierher.
    if (out.length) {
      const last = out[out.length - 1];
      const straight = densify([last, s], step).slice(1, -1);
      out.push(...straight);
    }
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (da * k) / steps;
      out.push([m[0] + Math.cos(a) * r, m[1] + Math.sin(a) * r]);
    }
  }
  // Schlussgerade zurück zum ersten Bogen.
  const straight = densify([out[out.length - 1], out[0]], step).slice(1, -1);
  out.push(...straight);
  return out;
}
