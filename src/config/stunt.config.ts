/**
 * Sprungschanzen, Sammelstücke und die Driftzone — P24.
 *
 * ## Warum die Karte das braucht
 *
 * Die Welt dieses Projekts ist seit P8 fertig und schön: 9,4 km², neun Kehren,
 * eine Stadt, ein Tempelbezirk, ein Hafen. Was ihr fehlt, ist **etwas zu tun,
 * das nicht die Straße entlang geht.** Auf einem Portal ist das der Unterschied
 * zwischen einer Landschaft, durch die man fährt, und einer, in der man spielt:
 * niemand erzählt einem Freund von einer schönen Straße, aber jeder erzählt von
 * einem Sprung.
 *
 * ## Warum die Schanzen hier stehen und nicht im Höhenfeld
 *
 * Sie könnten im Baker liegen — dort entsteht das Gelände. Sie liegen aus zwei
 * Gründen nicht dort:
 *
 *  1. **Ein Terrain-Bake würfelt die Straßen neu.** Die Erosion trägt jede
 *     Störung über die ganze Karte (gemessen: ein Eingriff in *einer* Zone
 *     ändert 66,8 % der Texel), der Straßengenerator sucht danach andere Kehren,
 *     und jede Zahl aus P14 bis P23 wäre neu abzulesen. Das steht als
 *     ausdrückliche Warnung in CLAUDE.md.
 *  2. **Eine Schanze ist Spielgerät und kein Gelände.** Sie soll sich anfassen,
 *     verschieben und wieder wegnehmen lassen, ohne dass 40 Sekunden Bake
 *     dazwischen liegen.
 *
 * Sie sind deshalb eine **analytische Fläche** über dem Höhenfeld: eine Funktion
 * `surfaceAt(x, z)`, von der `RoadGround.height()` das Maximum nimmt. Das Mesh
 * entsteht aus derselben Funktion (`StuntSystem`), also können Bild und Physik
 * nicht auseinanderlaufen — genau die Klasse Fehler, die dieses Projekt bei der
 * Fahrbahn zweimal gekostet hat.
 *
 * ## Die Zahlen sind Wurfweiten, keine Maße
 *
 * Eine Schanze wird nicht über ihre Höhe ausgelegt, sondern über den Sprung, den
 * sie ergibt. Der schiefe Wurf sagt:
 *
 * ```
 *   Weite  w = v² · sin(2α) / g
 *   Höhe   h = v² · sin²(α) / (2g)
 * ```
 *
 * Bei 120 km/h (33,3 m/s) und 12° Absprungwinkel sind das **46 m Weite und
 * 2,4 m Scheitelhöhe**; bei 160 km/h 82 m und 4,3 m.
 *
 * ~~Der Winkel ergibt sich aus `atan(height / rampLength)`.~~
 *
 * ## Widerlegt, gemessen 2026-08-31: das ist die *mittlere* Neigung
 *
 * `liftLocal` legt die Auffahrt als **Smoothstep** an (`3t² − 2t³`), damit am
 * Fuß kein Knick steht — die Begründung dafür ist richtig und bleibt. Die
 * Ableitung `6t(1−t)` hat ihr Maximum bei `t = 0,5` und ist dort **1,5**. Die
 * steilste Stelle jeder Schanze ist also `atan(1,5 · height / length)` und
 * nicht `atan(height / length)`; jede Winkelangabe in dieser Datei stand um
 * diesen Faktor zu niedrig.
 *
 * Das war keine Kosmetik. Gemessen über alle sechs Schanzen, Anfahrt 140 km/h,
 * Tempo an der Absprungkante und tiefstes Eintauchen der Blechunterkante:
 *
 * | Schanze | Spitze | an der Kante | Blech |
 * |---|---|---|---|
 * | south-crest | 7,3° | 126 km/h | 0,040 m |
 * | paddy-launch | 13,4° | 117 km/h | 0,073 m |
 * | harbour-jump | 14,2° | 115 km/h | 0,073 m |
 * | ridge-kicker | 14,9° | 114 km/h | 0,069 m |
 * | coast-kicker | 16,0° | 120 km/h | 0,094 m |
 * | village-hop (17 m) | **19,4°** | **41 km/h** | **0,193 m** |
 *
 * Zwischen 16,0° und 19,4° verdoppelt sich die Blechtiefe, und die Bremse des
 * schleifenden Blechs nimmt dem Wagen zwei Drittel seines Tempos. Aus der
 * steilsten Schanze der Karte wurde damit eine Bremsschwelle — und im
 * Kommentar stand „13,2°", also mitten im erlaubten Band.
 *
 * > **Über 20° wird ein Sprung unlustig.** Das Fahrzeug steht dann in der Luft
 * > steil nach oben, landet auf dem Heck und überschlägt sich fast — was dieses
 * > Modell nicht kann (siehe Kopf von `Vehicle.ts`), also klappt es stattdessen
 * > flach und sieht falsch aus. 8…16° ist das Band, in dem eine Landung wie eine
 * > Landung aussieht — **gemessen an der Spitze**, und die Tabelle oben sagt,
 * > dass die Obergrenze dieses Bandes zugleich die Grenze der Karosserie ist.
 *
 * Die Grenze selbst ist **nicht** repariert. Sie ist aber auch nicht das, wonach
 * sie aussieht: `tools/bench/world.mts` misst auf einem **konstanten** Hang
 * 0,000 m Blechtiefe bei 20°, 0,048 m bei 35° und 0,050 m bei 55°. Ein Hang ist
 * eine Ebene, auf die sich der Aufbau ausrichtet; eine Schanze ist ein
 * **Übergang**, und dort überbrückt die 4,2 m lange Unterkante die konvexe
 * Krümmung. Die maßgebliche Größe ist also nicht die Neigung, sondern ihre
 * Änderung — und dafür hat der Prüfstand keine Spalte. Der Befund steht als
 * offener Punkt in PLAN.md P26; repariert ist hier nur die Schanze, die ihn
 * ausgelöst hat.
 */

export interface Ramp {
  readonly id: string;
  /** Mittelpunkt der **Absprungkante** in Weltkoordinaten. */
  readonly x: number;
  readonly z: number;
  /** Anfahrtsrichtung in Radiant (0 = nach +Z, wie der Gierwinkel). */
  readonly heading: number;
  /** Länge der Auffahrt in Metern. */
  readonly length: number;
  /** Breite in Metern. */
  readonly width: number;
  /**
   * Höhe der Absprungkante über dem **Fundament**, in Metern.
   *
   * Das Fundament ist die Geländehöhe am Fuß der Auffahrt, einmal gemessen
   * (`RampField.prepare`). Nicht „über dem Gelände an dieser Stelle": eine
   * Schanze ist ein Bauwerk und macht die Wellen unter sich nicht mit.
   */
  readonly height: number;
  /**
   * Wie weit hinter der Kante die Auflage wieder ausläuft, in Metern.
   *
   * **Null heißt Abrisskante**, und das ist bei einer Schanze richtig: dahinter
   * beginnt der Flug. Ein Wert > 0 macht daraus eine Kuppe, über die man rollt —
   * das ist die Bauform für eine Bodenwelle mitten auf der Strecke.
   */
  readonly tail: number;
  /** Beschriftung in der Oberfläche, englisch. */
  readonly name: string;
}

/**
 * Wie weit die Schanzen seitlich auslaufen, als Anteil der halben Breite.
 *
 * 0,2 — die äußeren 20 % sind eine Schräge. Ohne sie steht am Rand eine
 * senkrechte Wand, und wer sie streift, wird vom Bodenfang senkrecht
 * hochgeschoben. Mit ihr rutscht er ab, und das ist die richtige Antwort auf
 * „daneben getroffen".
 */
export const RAMP_EDGE_FADE = 0.2;

/**
 * Die Schanzen der Karte.
 *
 * **Alle Koordinaten stammen aus `node tools/find-ramps.mjs`** und sind nicht
 * gegriffen. Das Werkzeug liest dieselben Dateien wie das Spiel und sucht
 * Stellen mit 130 m geradem Anlauf, tragfähigem Fundament und freier
 * Landefläche; es fand 14 Plätze, von denen hier sechs stehen.
 *
 * > **Die erste Fassung war von Hand gesetzt, und vier von fünf Plätzen waren
 * > unbrauchbar** — auf eine Art, die man beim Hinschreiben nicht sieht:
 * > `temple-hop` hatte 7,2 s Flugzeit (die Anfahrt endete an einer Klippe),
 * > `coast-kicker` 0,02 s bei +21 m Höhe (die Anfahrt ging bergauf). Gemessen
 * > hat das `tools/smoke.mjs`. Eine Koordinate auf einer erodierten 9,4-km²-Karte
 * > ist eine Behauptung; erst ein Lauf macht eine Messung daraus.
 *
 * Sie stehen **neben** der Fahrbahn (11 m von der Mittellinie) und in
 * Fahrtrichtung. Das ist Absicht: auf der Fahrbahn würden sie die Rennen
 * kaputtmachen, weil die Ideallinie der KI von ihnen nichts weiß und drei
 * Gegner in jeder Runde an derselben Stelle abhöben.
 */
export const RAMPS: readonly Ramp[] = [
  {
    id: 'paddy-launch',
    name: 'Paddy Launch',
    // Ringstraße West, über den Reisfeldern. Fundament 27,5 m, 5,1 m Gefälle
    // dahinter — die weichste Landung der Karte.
    x: -721.2,
    z: 9.6,
    heading: 2.776,
    length: 24,
    width: 13,
    // Mittlere Neigung atan(3,8 / 24) = 9,0°, Spitze 13,4°. Bei 140 km/h
    // gemessen 94 m Weite bei 3,2 s Flug.
    height: 3.8,
    tail: 0,
  },
  {
    id: 'ridge-kicker',
    name: 'Ridge Kicker',
    // Ringstraße Ost, auf dem Rücken über der Stadt. 12,1 m Gefälle dahinter —
    // der Sprung, bei dem der Boden unter einem wegbleibt.
    x: 951.2,
    z: -268.7,
    heading: 0.219,
    length: 26,
    width: 13,
    // Mittlere Neigung atan(4,6 / 26) = 10,0°, Spitze 14,9°.
    height: 4.6,
    tail: 0,
  },
  {
    id: 'coast-kicker',
    name: 'Coast Kicker',
    // Küstenabschnitt der Ringstraße, Richtung Meer.
    x: 335.9,
    z: 819.1,
    heading: -1.194,
    length: 22,
    width: 12,
    // Mittlere Neigung atan(4,2 / 22) = 10,8°, Spitze 16,0° — die steilste,
    // die gemessen noch sauber trägt (120 km/h an der Kante aus 140).
    height: 4.2,
    tail: 0,
  },
  {
    id: 'village-hop',
    name: 'Village Hop',
    // Die Dorfstraße. Kurz und steil — der Sprung, den man im Vorbeifahren
    // mitnimmt, ohne die Strecke zu verlassen.
    x: -442.8,
    z: -90.9,
    heading: 1.277,
    // ~~17~~ — **gemessen verlängert, und der Grund steht in der Tabelle bei
    // `RAMPS`.** Mit 17 m lag die Spitzenneigung bei 19,4°, und dort schleift
    // die Karosserie: aus 140 km/h Anfahrt wurden **41 km/h an der Kante**,
    // Blechtiefe 0,193 m. Die anderen fünf Schanzen liegen bei 7,3…16,0° und
    // halten ihr Tempo (114…126 km/h, Blech 0,040…0,094 m).
    //
    // Verlängert und **nicht** abgeflacht: die Höhe ist das, was den Sprung
    // ausmacht. 4,0 m auf 22 m ergibt 15,3° Spitze — knapp unter dem
    // `coast-kicker`, der gemessen sauber trägt.
    length: 22,
    width: 11,
    // Mittlere Neigung atan(4,0 / 22) = 10,3°, Spitze 15,3°.
    height: 4.0,
    tail: 0,
  },
  {
    id: 'harbour-jump',
    name: 'Harbour Jump',
    // Ringstraße Nordwest, oberhalb des Hafens.
    x: -926.8,
    z: 622.3,
    heading: -2.705,
    length: 24,
    width: 13,
    // Mittlere Neigung atan(4,0 / 24) = 9,5°, Spitze 14,2°.
    height: 4.0,
    tail: 0,
  },
  {
    id: 'south-crest',
    name: 'South Crest',
    // **Eine Kuppe und keine Schanze** (`tail` > 0): sie hebt den Wagen kurz aus
    // der Straße, ohne ihn von ihr wegzuschicken. Der Unterschied ist der
    // Auslauf — eine Abrisskante ist ein Absprung, eine Kuppe ist ein Moment.
    x: 83.2,
    z: 918.9,
    heading: -1.194,
    length: 28,
    width: 15,
    height: 2.4,
    tail: 24,
  },
];

/**
 * Die Driftzone — P24.
 *
 * ## Warum sie ein Kreis ist und keine Strecke
 *
 * Eine Driftzone als Streckenabschnitt („von Bogenlänge A bis B") wäre die
 * naheliegende Bauform und die falsche: sie verlangt, dass der Spieler die
 * Strecke *kennt*, bevor er weiß, dass er gerade punktet. Ein Kreis mit einem
 * Ring aus Kirschbäumen ist von 200 m Entfernung als „dort passiert etwas"
 * lesbar, und das ist die ganze Anforderung.
 *
 * Innerhalb der Zone zählt die Driftwertung doppelt. Das ist der einzige Grund,
 * warum jemand von der Ideallinie abbiegt — und damit der einzige Grund, warum
 * es die Zone gibt.
 *
 * ## Die Standorte sind gemessen
 *
 * Eine Driftzone auf einem Hang ist keine. Beide Plätze stammen aus einem
 * Rasterlauf über das Höhenfeld, der die flachsten Kreise mit 60…70 m Radius
 * sucht — unter Ausschluss des Stadtdistrikts (dort ist es eben, aber voller
 * Häuser) und der Reisterrassen (dort ist es eben, aber in Stufen von 2,4 m).
 *
 * > **Zwei Fassungen davor waren falsch, und beide sahen richtig aus.** Die
 * > erste stand bei (−120 | −180) mit der Beschreibung „die Senke zwischen
 * > Reisfeldern und Wald" — gemessen 26,7 m Höhenunterschied auf 156 m
 * > Durchmesser, also ein Hang. Die zweite stand bei (−1020 | −20), dem
 * > **flachsten** Platz der Karte (1,7 m) — und ein Bild zeigte, warum: es ist
 * > eine gefluteter Reisterrasse. Flach ist dort das Wasser.
 * >
 * > Seitdem prüft der Rasterlauf zusätzlich `paddy.png`, und seitdem gehört ein
 * > **Bild** zur Abnahme einer Koordinate. Zwei Zahlen (Höhenband, Abstand zur
 * > Straße) beschreiben einen Platz nicht vollständig; das ist derselbe Satz,
 * > mit dem CLAUDE.md seit P4 anfängt.
 */
export interface DriftZone {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Punktemultiplikator innerhalb der Zone. */
  readonly bonus: number;
  /** Zahl der Kirschbäume auf dem Ring. */
  readonly trees: number;
}

export const DRIFT_ZONES: readonly DriftZone[] = [
  {
    id: 'sakura-bowl',
    name: 'Sakura Bowl',
    // Die Wiese zwischen Stadt und Küste. Gemessen 3,9 m Höhenunterschied auf
    // 124 m Durchmesser, kein Reisfeld, 128 m von der Ringstraße.
    x: 550,
    z: 510,
    radius: 62,
    bonus: 2,
    trees: 24,
  },
  {
    id: 'harbour-pan',
    name: 'Harbour Pan',
    // Die Fläche oberhalb des Hafens. 8,4 m auf 124 m, 93 m von der Straße —
    // der beste Platz der Westhälfte.
    x: -810,
    z: 630,
    radius: 58,
    bonus: 2,
    trees: 20,
  },
];

/**
 * Sammelstücke — P24.
 *
 * ## Warum sie an den Straßen liegen und nicht in der Landschaft
 *
 * Ein Sammelstück im Nirgendwo ist eine Aufforderung, die Karte abzugrasen, und
 * das ist bei 9,4 km² eine halbe Stunde Langeweile. An der Straße ist es eine
 * Aufforderung, die **Linie** zu ändern: es liegt außen in der Kurve, wo man
 * langsamer ist, oder auf der Innenseite, wo man den Bordstein mitnehmen muss.
 * Das ist dieselbe Idee, mit der ein Rennspiel seit dreißig Jahren Boost-Pads
 * platziert.
 *
 * Erzeugt werden sie aus dem Straßennetz (`StuntSystem`), nicht von Hand: bei
 * 11 km Straße wären 90 Handkoordinaten eine Liste, die beim nächsten
 * `npm run world` still falsch wird.
 */
export const PICKUPS = {
  /** Wie viele Stücke insgesamt auf der Karte liegen. */
  count: 90,
  /** Abstand zur Fahrbahnmitte, als Anteil der halben Breite. */
  offset: 0.55,
  /** Aufsammelradius in Metern. Großzügig — ein verpasstes Stück ist Frust. */
  radius: 4.5,
  /** Höhe über der Fahrbahn, m. */
  height: 1.1,
  /** Wert in ¥. */
  yen: 120,
  /** Anteil des Nitro-Vorrats, den ein Stück auffüllt. */
  boost: 0.2,
  /**
   * Wie lange ein eingesammeltes Stück wegbleibt, in Sekunden.
   *
   * **Es kommt wieder, und das ist eine Entscheidung.** Sammelstücke, die für
   * immer weg sind, machen aus der Karte eine Checkliste, die einmal abgehakt
   * wird; danach ist die Welt leerer als vorher. Wiederkehrende sind eine
   * dauerhafte Belohnung fürs Fahren — und der Grund, warum die zwanzigste
   * Runde auf dem Ring immer noch etwas einbringt.
   */
  respawn: 45,
} as const;
