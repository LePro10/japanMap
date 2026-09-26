import { Vector3 } from 'three';

/**
 * Benannte Blickpunkte.
 *
 * > **Seit P10.2 nicht mehr „nur im Dev-Build".** Hier stand dieser Satz, und er
 * > stimmte, solange nur `japanMap.view()` daran hing. Das Spielermenü listet
 * > die Tabelle jetzt als Sprungziele auf — sie ist damit Teil des gebauten
 * > Stands, und ihre Notizen sind Text, den ein Nutzer liest. Die Datei liegt
 * > trotzdem weiter unter `debug/`: ihr Zweck ist unverändert die
 * > Reproduzierbarkeit von Messungen, das Menü ist der Zweitverwerter.
 *
 * Die Abnahme dieses Projekts läuft über Bilder und Zahlen, die aus einem
 * laufenden Renderer kommen (CLAUDE.md, „Bevor etwas fertig heißt"). Beides ist
 * nur dann eine Messung, wenn der Standpunkt reproduzierbar ist: eine
 * Draw-Call-Zahl gilt an einem Ort, nicht an der Karte, und ein Vorher/Nachher
 * an zwei verschiedenen Stellen misst die Kamera statt die Änderung.
 *
 * Bis P5 wurde von Hand hingeflogen. Diese Tabelle ersetzt das durch
 * `japanMap.view('stadt')`.
 */
export interface Viewpoint {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly note?: string;
}

export const VIEWPOINTS: Readonly<Record<string, Viewpoint>> = {
  start: {
    position: [620, 330, 1010],
    lookAt: [-700, 140, -720],
    note: 'Der Startblick über die ganze Karte auf das Massiv.',
  },
  stadt: {
    position: [960, 96, 480],
    lookAt: [620, 34, 120],
    note: 'Die Stadt von der Ringstraße aus, südöstlich — der Blick der Phase.',
  },
  'stadt-strasse': {
    position: [620, 32, 268],
    lookAt: [620, 40, 60],
    note: 'Auf der Stadtstraße, Augenhöhe. Hier muss das Neon im Asphalt stehen.',
  },
  'stadt-neon': {
    position: [660, 31.4, 200],
    lookAt: [600, 34, 40],
    note: 'Der Money-Shot der Phase: Geschäftsstraße, Kanban über der Fahrbahn, Neon in der Pfütze.',
  },
  'stadt-luft': {
    position: [620, 420, 620],
    lookAt: [620, 30, 120],
    note: 'Senkrecht über dem Distrikt — Blockraster und Straßenzug.',
  },
  'stadt-fern': {
    position: [1500, 260, 900],
    lookAt: [620, 40, 120],
    note: 'Aus 1,2 km: taugt die Silhouette?',
  },
  pass: {
    // **Zeigte bis P8.11 auf das Massiv statt auf die Straße.** Der alte Blick
    // (−700, 300, −700) → (−880, 400, −1200) lief 500 m an den Kehren vorbei
    // ins Gebirge; im Bild stand Fels und kein einziger Meter Asphalt — und
    // genau dieser Blickpunkt heißt „Der Bergpass mit seinen Kehren".
    // Die Trasse liegt gemessen bei x −552…−520, z −730…−261, y 28…199.
    position: [-620, 420, -180],
    lookAt: [-880, 110, -470],
    note: 'Der Bergpass mit seinen Kehren — von Südosten über die Flanke.',
  },
  'pass-kehren': {
    // **Blick seit der Pol-Reparatur: 15° statt 0° von der Senkrechten.** Der
    // alte Blick (−900, 620, −480) → (−900, 60, −481) schaute mit 89,9° fast
    // senkrecht nach unten. Das kann der Maus-Controller nicht mehr bedienen:
    // `CAMERA.pitchLimitDeg = 75°` ist das Maximum, und ein Blickpunkt
    // außerhalb des Bereichs spränge beim ersten Mauszug. Neu steht die
    // Kamera westlich des Stapels und blickt mit exakt −75° auf sein Zentrum
    // (x −552…−520, z −730…−261, y 28…199) — alle vier Ecken liegen gemessen
    // im 16:9-Bild. Der Zweck („die Kehren zum Abzählen") bleibt; die Zahl
    // selbst kommt aus `npm run inspect`.
    position: [-672, 620, -495],
    lookAt: [-536, 113, -495],
    note: '15° über dem Serpentinenstapel — die Kehren zum Abzählen.',
  },
  tempel: {
    position: [820, 200, -700],
    lookAt: [820, 150, -940],
    note: 'Die Tempelanlage im Nordosten.',
  },
  // ── P8.9 ───────────────────────────────────────────────────────────────────
  //
  // Drei Blickpunkte auf Augenhöhe. Die Abnahmezeile von 8.9 verlangt sie
  // wörtlich („je ein Bild aus Augenhöhe"), und sie sind der Grund, warum in
  // 8.9 überhaupt etwas gefunden wurde: aus 200 m Höhe sieht ein Dorf immer
  // richtig aus.
  sando: {
    // Zwischen dem siebten und achten Torii, nicht **auf** einem: bei (843, −820)
    // steht das achte 1 m vor der Linse und füllt ein Drittel des Bildes.
    position: [842, 133.8, -830],
    lookAt: [822, 152, -945],
    note: 'Auf dem Tempelaufgang, Augenhöhe, Blick bergauf durch die Torii-Reihe.',
  },
  dorf: {
    // **Zwischen den Hütten, nicht im Wasser.** Der erste Versuch stand auf
    // (793, 1075) — das liegt 38 m vor der Uferlinie, mitten zwischen den
    // Booten, und im Bild füllte ein Kahn die untere Bildhälfte, während das
    // Dorf als Streifen am Horizont lag. Augenhöhe heißt: auf dem Boden, den
    // die Hütten teilen (0,17 m + 1,7 m).
    // Zweite Korrektur: (700, 1052) stand 11,5 m neben der Hütte bei (706, 1042),
    // und die füllte die halbe Bildbreite. Hier ist die nächste Hütte 28 m
    // entfernt — die Zeile ist ganz im Bild, der Steg auch.
    position: [745, 1.7, 1048],
    lookAt: [806, 5, 998],
    note: 'Im Fischerdorf, Augenhöhe am Wasser, Blick über die Zeile zum Steg.',
  },
  'stadt-rand': {
    position: [620, 62, 620],
    lookAt: [620, 40, 120],
    note: 'Der Blick von 8.8 auf die Südkante des Distrikts. Vorher/Nachher der Stadtrandbebauung.',
  },
  reisfeld: {
    position: [-760, 120, 400],
    lookAt: [-760, 22, 60],
    note: 'Die Reisfeld-Terrassen im Westen.',
  },
  // ── P10.0 ──────────────────────────────────────────────────────────────────
  //
  // **Zwei Blickpunkte, weil der erste Messlauf gezeigt hat, dass vier von fünf
  // alten für die Stufenfrage blind sind.** Gemessen am 2026-08-07 über
  // `scene.byGroup.Vegetation`, Ultra gegen Minimal:
  //
  // | Blickpunkt | Ultra | Minimal |
  // |---|---|---|
  // | reisfeld | 8804 | 856 |
  // | stadt-neon | 1363 | 98 |
  // | pass | 171 | 16 |
  // | start | 67 | 9 |
  // | kueste | **0** | **0** |
  //
  // Der Grund ist Geometrie, nicht Bewuchs: `start` steht auf 330 m, `pass` auf
  // 420 m, und die Vegetation reicht 520 m weit — aus der Luft liegt fast alles
  // davon außerhalb. Wer die Vegetationsstufen an einem Luftbild abliest, misst
  // das Gelände. Die beiden hier stehen deshalb **auf dem Boden bzw. knapp
  // darüber**, und zwar dort, wo gemessen am meisten wächst: um (768, −730)
  // stehen 391 Instanzen je 64-m-Zelle, Boden bei y ≈ 132…136.
  wald: {
    position: [742, 133.7, -690],
    lookAt: [800, 138, -800],
    note: 'Im Wald östlich des Tempels, Augenhöhe. Nahfeld-Meshes, Mittelfeld, Baumgrenze.',
  },
  'wald-fern': {
    // **Der Blickpunkt, an dem der kahle Ring bei 520 m im Bild steht.** Vorne
    // bewaldete Hänge, dahinter ein vollständig kahler Kamm — nicht, weil dort
    // nichts wächst, sondern weil die Streuung dort endet. Er ist die
    // Vorher-Aufnahme für P10.3 und der Ort, an dem dessen drei Kandidaten
    // gegeneinander zu sehen sind.
    position: [700, 205, -540],
    lookAt: [790, 150, -900],
    note: 'Über dem Waldrücken nach Nordwesten — hier ist die 520-m-Kante der Streuung sichtbar.',
  },
  // Funaura (docs/DOERFER.md §1): Bootshausreihe vom Becken, Gasse auf Augenhöhe, Luftbild.
  funaura: {
    position: [-1250, 3.2, 1170],
    lookAt: [-1265, 5, 1100],
    note: 'Funaura — Funaya-Reihe vom Hafenbecken aus, Augenhöhe über dem Wasser.',
  },
  'funaura-gasse': {
    position: [-1270, 8.2, 960],
    lookAt: [-1262, 2, 1060],
    note: 'Funaura — die Dorfgasse hinunter zum Kai, Blick aufs Meer.',
  },
  'funaura-kai': {
    position: [-1306, 3.5, 1082],
    lookAt: [-1250, 3.2, 1084],
    note: 'Funaura — Hafenstraße zwischen Bootshäusern (rechts) und Häuserzeile, Augenhöhe.',
  },
  'funaura-nah': {
    position: [-1262, 3.4, 1083],
    lookAt: [-1284, 3.6, 1070],
    note: 'Funaura — zu Fuß vor Izakaya und Minshuku: Schilder, Noren, Laternen, Automaten.',
  },
  'funaura-mole': {
    position: [-1300, 5.2, 1200],
    lookAt: [-1250, 6, 1090],
    note: 'Funaura — vom weißen Molenfeuer zurück auf Becken, Bootshäuser und Hang.',
  },
  'funaura-luft': {
    position: [-1120, 95, 1250],
    lookAt: [-1250, 0, 1060],
    note: 'Funaura aus der Luft: Kai, Molen, Becken, Hang.',
  },
  // Stillwater als Gassho-Weiler (docs/DOERFER.md §2): Dorfstraße, Wasserrad, Mühle, Luftbild.
  gassho: {
    position: [-1183.5, 24.2, 262],
    lookAt: [-1174, 24.6, 330],
    note: 'Stillwater — die Dorfstraße nach Süden zwischen den Gassho-Häusern, Augenhöhe.',
  },
  'gassho-gasse': {
    position: [-1171, 24.9, 372],
    lookAt: [-1178, 25.8, 300],
    note: 'Stillwater — vor dem großen Haus nach Norden: Engawa, Shōji, Hasa-gake, Feuerwehrhütte.',
  },
  'gassho-rad': {
    position: [-1236, 22.7, 327],
    lookAt: [-1206, 22.4, 343],
    note: 'Stillwater — das Dreifach-Wasserrad am Ostufer vom Westufer aus, mit Rinne auf die Terrasse.',
  },
  'gassho-muehle': {
    position: [-1266, 29.2, 428],
    lookAt: [-1244, 29.5, 409],
    note: 'Stillwater — die Mühle mit Kayabuki-Dach von der Mill Lane.',
  },
  'gassho-luft': {
    position: [-1165, 62, 525],
    lookAt: [-1195, 22, 330],
    note: 'Stillwater aus der Luft nach Norden: Strohdächer zwischen den Reisfeldern, dahinter das Massiv.',
  },
  // Kiso-Juku (docs/DOERFER.md §3): Straße auf Augenhöhe bergauf, Honjin, Steingasse, Teehaus, Luftbild.
  kiso: {
    position: [-1322.0, 131.7, -963.8],
    lookAt: [-1340.6, 136.3, -1020.6],
    note: 'Kiso-Juku — die Poststraße bergauf auf Augenhöhe, links Talseite, rechts Hangseite.',
  },
  'kiso-honjin': {
    position: [-1342.9, 137.7, -1032.8],
    lookAt: [-1357.2, 137.9, -1029.8],
    note: 'Kiso-Juku — vor dem Honjin-Tor: Maku, Laternen, Vorhof.',
  },
  'kiso-gasse': {
    position: [-1377.0, 148.8, -1159.5],
    lookAt: [-1370.6, 142.9, -1105.1],
    note: 'Kiso-Juku — bergab durch die Häuserzeilen, Abendlicht in den Gittern.',
  },
  'kiso-tee': {
    position: [-1354.6, 155.2, -1105.6],
    lookAt: [-1356.8, 140.4, -1046.6],
    note: 'Kiso-Juku — von der Teehausterrasse über die Dächer.',
  },
  'kiso-luft': {
    position: [-1262.1, 212.8, -1022.4],
    lookAt: [-1363.4, 139.5, -1070.7],
    note: 'Kiso-Juku aus der Luft: Dachkette am Pass, Zedernhang, Talseite.',
  },
  // Koedo (docs/DOERFER.md §4): Ichibangai zum Turm, Straße B im Gegenlicht, Kanal, Damm, Brauerei, Reisfeld, Luft.
  koedo: {
    position: [-232, 32.5, 44],
    lookAt: [-167, 40, 108],
    note: 'Koedo — die Dorfstraße als Ichibangai: schwarze Kura beidseitig, am Ende der Glockenturm.',
  },
  'koedo-strasse': {
    position: [-181.4, 35.3, 136],
    lookAt: [-187.9, 35.3, 186],
    note: 'Koedo — Straße B nach Süden im Gegenlicht: Kopfsteinpflaster, Kura, Laternen, am Ende der Schrein.',
  },
  'koedo-kanal': {
    position: [-258, 31.7, 140],
    lookAt: [-266, 30.1, 175],
    note: 'Koedo — Kanalpromenade (Kurashiki): weiße Kura mit Namako, Trauerweiden, Bogenbrücke.',
  },
  'koedo-damm': {
    position: [-272, 31.4, 176],
    lookAt: [-258, 33.1, 160],
    note: 'Koedo — vom Westdamm über den Kanal: Bogenbrücke, Kanalzeile, Brauerei mit Schornstein.',
  },
  'koedo-brauerei': {
    position: [-186.5, 35.8, 166],
    lookAt: [-195, 36, 170],
    note: 'Koedo — Izumiya-Brauerei: Laden mit Kanban und Sugidama, offen bis zur Probiertheke.',
  },
  'koedo-reis': {
    position: [-320, 27.5, 185],
    lookAt: [-240, 31, 160],
    note: 'Koedo aus den Reisfeldern: Damm, Kanalzeile, Brauerei — dahinter die Türme von Tokio.',
  },
  'koedo-luft': {
    position: [-330, 110, 290],
    lookAt: [-205, 30, 140],
    note: 'Koedo aus der Luft: Kanal am Rand der Reisebene, Hauptstraße, Platz mit Turm, Stadt am Horizont.',
  },
  kueste: {
    position: [200, 90, 1100],
    lookAt: [100, 0, 1400],
    note: 'Südküste mit Wellenbrecher und Steg.',
  },
};

export interface CameraPlacer {
  placeAt(position: Vector3, lookAt: Vector3): void;
}

/**
 * Blickpunkt anfliegen — benannt oder frei.
 *
 * Die freie Form (`{ position, lookAt }`) ist beim Suchen da: solange ein
 * Blickpunkt noch nicht feststeht, wäre jede Probe sonst ein Neustart des
 * Dev-Servers, weil auf einem SMB-Mount kein Datei-Watcher läuft. Was sich
 * bewährt, wandert danach in die Tabelle und wird damit reproduzierbar.
 */
export function applyViewpoint(camera: CameraPlacer, target: string | Viewpoint): string {
  const point = typeof target === 'string' ? VIEWPOINTS[target] : target;
  if (!point) {
    return `Unbekannter Blickpunkt „${String(target)}". Bekannt: ${Object.keys(VIEWPOINTS).join(', ')}`;
  }
  camera.placeAt(new Vector3(...point.position), new Vector3(...point.lookAt));
  return `${typeof target === 'string' ? target : 'frei'} — ${point.note ?? ''}`;
}
