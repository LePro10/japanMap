/**
 * Qualitätsstufen und Performance-Budgets.
 *
 * Die Budgets sind der Grund, warum dieses Projekt überhaupt eine P0 hat.
 * Die Entwicklungsmaschine (RX 7900 XTX) rendert praktisch alles flüssig —
 * "sieht bei mir gut aus" ist deshalb kein Signal. Verbindlich sind die Zahlen
 * unten, kalibriert auf GTX 1660 / RX 580 @ 1080p60 (SPEC §4).
 */

import { GRID_VERTICES_ALLOWED, type GridVertices } from './lod.config';
import { POSTFX_QUALITY, type PostFxQuality } from './postfx.config';

export type QualityLevel = 'ultra' | 'high' | 'medium' | 'low' | 'minimal';

/**
 * Was `quality:changed` tragen kann — die fünf Voreinstellungen **und** die
 * eigene Stufe aus dem Menü (P10.2).
 *
 * Bewusst ein zweiter Typ und keine Erweiterung von `QualityLevel`: die
 * Ersteinstufung leitet ihre Leiter aus `QUALITY_LEVELS` ab und geht sie der
 * Reihe nach herunter. „Eigen" hat in dieser Leiter keinen Platz — sie ist
 * geordnet, eine frei zusammengestellte Stufe ist es nicht. Wer beides in einen
 * Typ wirft, bekommt einen `indexOf` von −1 und stuft damit versehentlich auf
 * die erste Stufe **hoch**.
 */
export type QualityKey = QualityLevel | 'custom';

export type AoQuality = 'high' | 'medium' | 'low' | 'off';

export interface QualitySettings {
  readonly label: string;
  /**
   * Kantenlänge der Shadow-Map.
   *
   * **Wirkt nur im Vergleichsfall.** Echtzeit-Schatten sind seit P2 aus
   * (`LIGHTING.castShadow`), weil die Geländeverschattung gebacken ist; der
   * Schalter im Debug-Panel stellt die P1-Variante wieder her, und *dann*
   * entscheidet diese Zahl über Auflösung und Kosten. Solange er aus steht,
   * kostet die Stufe hier nichts — was in der Messtabelle unten auch so
   * dasteht, statt als Erfolg der Stufe verbucht zu werden.
   */
  readonly shadowMapSize: number;
  /**
   * Lokale Spiegelung auf nassem Asphalt (P6.5).
   *
   * Hieß im Plan `ssr`. P6 hat gemessen, dass Screen-Space-Reflexionen für
   * diese Blickgeometrie strukturell nicht taugen (19,3 % der Neonspiegelungen
   * stehen überhaupt im Bild) und stattdessen einen planaren Durchgang gebaut.
   * Der Schalter ist geblieben, sein Inhalt nicht: er schaltet jetzt den
   * planaren Durchgang, und der ist genau der Kandidat, den PLAN.md P6 dafür
   * benannt hat — er zeichnet die Szene ein zweites Mal, solange die Stadt im
   * Bild steht.
   */
  readonly reflections: boolean;
  readonly ao: AoQuality;
  /**
   * **Faktor** auf die Ferngrenze jeder Vegetationsart (`lodDistances[2]`).
   *
   * ## Warum ein Faktor und nicht mehr eine Sichtweite in Metern
   *
   * Bis P10.1 stand hier `viewDistance` in Metern (2000 / 1500 / 1000 / 600 /
   * 450) und wurde als **Deckel** auf den Sammelradius angewandt:
   * `range = min(max(lodDistances[2]), viewDistance)`. Die größte
   * Artenreichweite ist 520 m — der Deckel lag also auf vier von fünf Stufen
   * darüber und tat schlicht **nichts**:
   *
   * | Stufe | `viewDistance` alt | wirksamer Sammelradius |
   * |---|---|---|
   * | Ultra | 2000 | 520 |
   * | Hoch | 1500 | 520 |
   * | Mittel | 1000 | 520 |
   * | Niedrig | 600 | 520 |
   * | Minimal | 450 | 450 |
   *
   * Der Kommentar an der Anwendungsstelle behauptete sogar das Gegenteil („auf
   * ‚Niedrig' sind das 600 m und damit weniger als die 520 m der Bäume") — 600
   * ist mehr als 520. Ein Feld, das auf vier Fünfteln seiner Werte wirkungslos
   * ist, ist eine Zusage ohne Deckung; dasselbe Urteil hat P7.1 über
   * `shadowCascades` gefällt.
   *
   * Als Faktor kann der Wert **über 1** liegen, und genau das ist der Punkt: die
   * Karte lebt laut SPEC §2.1 von der Fernsicht, und der kahle Ring bei 520 m
   * steht heute auf *jeder* Stufe.
   *
   * ## Warum hier fünfmal 1,0 steht
   *
   * Weil P10.1 die **Kopplung** baut und nicht die Entscheidung trifft. Wie weit
   * die Vegetation reichen soll, ist P10.3 („erst messen, dann entscheiden").
   * Nach unten wird der Regler ausdrücklich *nicht* gedreht: eine niedrigere
   * Stufe kürzer sehen zu lassen wäre der billige Weg zu Rechenzeit und genau
   * die Verschlechterung, die dieser Plan ausschließt.
   *
   * **Auch Minimal steht auf 1,0 — nachgemessen.** Der erste Versuch stand auf
   * 0,87, um dessen alte 450 m nachzubilden. Das war eine Fehldeutung der alten
   * Semantik: der Deckel wirkte allein auf den **Sammelradius der Chunks**,
   * während `#speciesMask` und die LOD-Zuordnung die ungeskalierte Ferngrenze
   * je Art benutzten. Gras lief also weiterhin bis 160 m und Büsche bis 190 m;
   * nur die Bäume waren bei rund 450 m abgeschnitten. Ein Faktor auf *alle*
   * Arten kürzt Gras und Büsche mit, und das kostet gemessen genau das, was hier
   * nicht passieren darf:
   *
   * | Blickpunkt | mit 0,87 | mit 1,0 |
   * |---|---|---|
   * | reisfeld | 217 | **854** |
   * | wald-fern | 503 | **1144** |
   * | wald | 3104 | **3934** |
   *
   * Mit 1,0 gewinnt Minimal stattdessen 70 m Baumreichweite gegen vorher
   * (450 → 520). Seine Ersparnis kommt vollständig aus `lodBias`,
   * `vegetationDensity`, `renderScale` und `postFx` — und das ist die richtige
   * Reihenfolge: erst billiger zeichnen, dann weniger zeichnen, und *zuletzt*
   * kürzer sehen.
   */
  readonly vegetationRange: number;

  /**
   * **Faktor auf die Ferngrenze der Bodendecker** (Gras, Busch) — P11.6.
   *
   * Getrennt von `vegetationRange`, weil die beiden Schichten verschiedene
   * Fragen beantworten (siehe `SpeciesLayer`): Bäume tragen die Silhouette
   * gegen den Himmel und müssen weit reichen, Gras gibt dem Boden Farbe — und
   * **die kann der Boden seit P11.4/11.6 selbst tragen**.
   *
   * Genau deshalb ist das der billigste Hebel im ganzen System. Am Blickpunkt
   * `wald` waren 34 986 der 50 711 sichtbaren Instanzen Gras-Imposter; die
   * Grasreichweite zu halbieren nimmt also aus dem größten Posten heraus, und
   * der Farbstich schließt die Lücke im selben Zug, weil er an **dasselbe**
   * Ausdünnungsgesetz gekoppelt ist (`uGroundTintLaw` in TerrainMaterial).
   *
   * Eine gemeinsame Reichweite für beide Schichten könnte das nicht: sie würde
   * entweder die Grate kahl machen oder das Gras unnötig weit tragen.
   */
  readonly vegetationGroundRange: number;

  /**
   * **Faktor** auf die beiden *inneren* LOD-Grenzen einer Art
   * (`lodDistances[0]` und `[1]`) — also darauf, wann vom vollen Mesh auf die
   * reduzierte Stufe und wann von dort auf den Imposter gewechselt wird.
   *
   * **Der einzige Hebel im ganzen Plan, für den eine Messung in beide Richtungen
   * spricht.** P4 hat an 229 Kiefern zwischen 180 und 240 m nachgezählt, wie
   * viele Pixel Mesh und Imposter jeweils decken (Tabelle bei
   * `IMPOSTER.alphaTest`): der Imposter deckt **34 bis 38 % mehr**, und der
   * Grund ist nicht weiches Alpha, sondern Abtastung. Ein 5,4-m-Baum ist auf
   * 180 m rund 19 Pixel hoch; das Mesh besteht dort aus Dreiecken unterhalb der
   * Pixelgröße und fällt in Lücken, während der Imposter eine gefilterte Textur
   * ist. **Er ist an dieser Stelle nicht schlechter, sondern besser
   * abgetastet.**
   *
   * Früher umzuschalten spart also Dreiecke, ohne Silhouette zu verlieren — bis
   * zu einer Entfernung, an der das Mesh wieder gewinnt. Wo die liegt, ist
   * nicht gemessen, und deshalb bleibt die Leiter flach: 0,65 auf Minimal heißt
   * Imposter ab 117 m statt 180 m, und dort ist ein Baum immer noch rund
   * 29 Pixel hoch.
   *
   * **Ultra und Hoch bleiben bei 1,0.** Der erste `live`-Lauf hat gemessen, dass
   * Ultra→Hoch mit 16 % die schwächste Sprosse der Leiter ist — die
   * naheliegende Antwort wäre, Hoch zu verschlechtern. Das ist die falsche
   * Richtung: den Abstand macht P10.3, indem **Ultra weiter sieht**, nicht indem
   * Hoch weniger scharf wird.
   */
  readonly lodBias: number;
  /**
   * Entfernung in Metern, innerhalb derer **nichts** ausgedünnt wird — P11.2.
   *
   * ## Was hier vorher stand, und warum es weg ist
   *
   * Bis P11 stand hier `vegetationDensity`: ein Anteil von 0…1, mit dem
   * `scatterChunk` seine Kandidaten verwarf — `roll >= suitability * density`.
   * Das dünnt **gleichmäßig über die ganze Fläche** aus, auch einen Meter vor
   * der Kamera. Gemessen am Blickpunkt `wald`, alles andere auf Ultra, nur
   * dieser eine Wert von 1,0 auf 0,1:
   *
   * | untere Bildhälfte | Dichte 1,0 | Dichte 0,1 |
   * |---|---|---|
   * | Grünanteil | 44,22 % | **5,71 %** |
   * | Braunanteil | 46,07 % | **87,82 %** |
   * | Instanzen | 51 187 | 5 216 |
   *
   * Aus dem Wald wurde eine Steppe. Der Regler hat genau dort gespart, wo man
   * es am besten sieht — und am Reisfeld kostete er 90 % der Vegetation für
   * 4,4 % der Dreiecke, das schlechteste Tauschgeschäft der ganzen Messreihe.
   *
   * ## Was stattdessen gilt
   *
   * Ausgedünnt wird **mit der Entfernung**, nicht über die Fläche: bis
   * `vegetationFullRadius` bleibt jede Instanz stehen, danach fällt der Anteil
   * bis auf `vegetationFarKeep` an der Ferngrenze. Der Gedanke dahinter ist,
   * die Zahl der Instanzen **pro Bildschirmfläche** ungefähr konstant zu halten
   * statt pro Quadratmeter Welt: ein Grashalm auf 5 m ist 100 px hoch, derselbe
   * auf 150 m ein Viertelpixel — beide kosten gleich viel, nur einer ist zu
   * sehen. Auf der Zielhardware (Intel-iGPU) ist der unterpixelige Halm sogar
   * der teurere Fall, weil jedes Dreieck als 2 × 2-Quad schattiert wird.
   *
   * Folge, und sie ist der eigentliche Zweck: **im Nahbereich unterscheidet
   * sich keine Stufe mehr von Ultra.** Ein einzelner Baum aus der Nähe sieht
   * auf Minimal aus wie auf Ultra.
   *
   * Die Leiter ist deshalb nach unten kurz und nicht null: 30 m auf Minimal ist
   * immer noch der ganze Vordergrund.
   */
  readonly vegetationFullRadius: number;
  /**
   * Anteil der Instanzen, der an der **Ferngrenze** übrig bleibt, 0…1 — P11.2.
   *
   * Zwischen `vegetationFullRadius` und der Ferngrenze der Art wird linear
   * dahin überblendet. Was wegfällt, wird über einen **ortsfesten Hash je
   * Instanz** entschieden und nicht über die Reihenfolge im Puffer: dieselbe
   * Instanz fällt bei derselben Entfernung immer weg, sonst flackerte der
   * Bestand bei jeder Kamerabewegung.
   *
   * **Die Deckung bleibt trotzdem erhalten** — was übrig bleibt, wächst um
   * 1/√Anteil (gedeckelt, siehe `SCATTER.thinBoostMax`). Das ist der Grund,
   * warum ein kleiner Wert hier nicht wieder zur Steppe führt: die gedeckte
   * Bodenfläche ist dieselbe, es sind nur weniger und größere Büschel.
   *
   * **Obergrenze ist bauartbedingt das heutige Ultra.** Der Anteil ist nie über
   * 1, es kann also nie mehr gestreut werden als bei `vegetationDensity: 1` —
   * und für diesen Fall sind die Instanzpuffer gemessen ausreichend (0
   * verworfene Instanzen über 20 Zellen des P10.1-Laufs). Ein Überlauf in
   * `InstancedLOD.push()`, der stillschweigend verwirft, ist damit
   * ausgeschlossen und muss nicht bewacht werden.
   */
  readonly vegetationFarKeep: number;
  /** Auflösungsfaktor des Render-Targets gegenüber der Canvas-Größe. */
  readonly renderScale: number;
  /**
   * Stützstellen pro Achse im Terrain-Knotengitter (ab P8.1).
   *
   * **Der einzige Hebel, mit dem eine Stufe an der Geländelast überhaupt etwas
   * ändert.** Bis P8 war das eine Konstante, und die Messtabelle unten zeigte
   * die Folge: „Mittel" und „Niedrig" unterschieden sich um 705 Dreiecke, also
   * um nichts. Der ganze Abfall von Hoch auf Mittel stammte aus dem
   * wegfallenden Spiegeldurchgang.
   *
   * Zulässige Werte und die Herleitung, warum das die Rissfreiheit *nicht*
   * verletzt: `GRID_VERTICES_ALLOWED` in `lod.config.ts`.
   */
  readonly terrainGridVertices: GridVertices;
  /**
   * Was die Postprocessing-Kette auf dieser Stufe tut (ab P8.2).
   *
   * Tabelle und Begründung: `POSTFX_QUALITY` in `postfx.config.ts`. Der Wert
   * `'off'` ist kein Regler, sondern ein **anderer Renderpfad** — die Kette
   * läuft dann gar nicht.
   */
  readonly postFx: PostFxQuality;
  /**
   * Nahdetail der Wasseroberflächen, 0…1 (ab P19).
   *
   * Meer, Fluss und Reisfeld tragen drei Wellenlagen mit 37 m, 13 m und 4,6 m
   * Länge. Aus der Ferne stimmt das; **neben dem Auto** ist die kürzeste davon
   * fünf Wagenlängen lang, und die Fläche dazwischen ist ein Spiegel. Zwei
   * zusätzliche Lagen (1,1 m und 0,42 m) schließen die Lücke, blenden aber
   * jenseits von 42 m aus — darüber hinaus wären sie kleiner als ein Pixel und
   * ergäben Moiré statt Struktur.
   *
   * Der Wert ist ein **Faktor auf die Stärke** und kein Schalter, damit die
   * mittleren Stufen ihn abschwächen können, statt ihn zu verlieren. Bei 0 fällt
   * der ganze Zweig im Shader weg — auf Minimal kostet er dann auch nichts.
   *
   * Kosten: drei Kosinus je Wasserpixel, und nur innerhalb von 42 m. Auf einer
   * Karte, deren Wasserflächen meist weiter weg sind, ist das der billigste
   * sichtbare Posten, den diese Leiter hat.
   */
  readonly waterDetail: number;
}

/**
 * Was eine AO-Stufe für N8AO bedeutet.
 *
 * ## `halfRes` steht seit P12.2 auf **jeder** Stufe auf `true`
 *
 * Bis dahin fuhr Ultra die Umgebungsverdeckung in **voller** Auflösung, und das
 * war der teuerste einzelne Posten des ganzen Frames. Gemessen am 2026-08-16,
 * Blickpunkt `wald`, 3840 × 2160, interleavt gegen Ultra (Rauschband ±0,23 ms
 * bei 4,54 ms Basis, also 5 %):
 *
 * | Eingriff | GPU | Δ gegen Ultra |
 * |---|---|---|
 * | AO **ganz aus** | 2,27 ms | **−48,6 %** |
 * | AO auf **halbe Auflösung** | 2,72 ms | **−38,3 %** |
 * | AO halb + 8 Abtastungen | 2,64 ms | −41,8 % |
 * | *(ganze PostFX-Kette aus)* | *0,91 ms* | *−77,9 %* |
 *
 * **Die AO allein war 62 % der gesamten Postprocessing-Kette**, und der Schritt
 * von voller auf halbe Auflösung holt allein 38 % des Frames.
 *
 * ## Und er ist am Bild nicht zu sehen — nachgesehen, nicht angenommen
 *
 * Bildpaare bei 1280 × 720, dazu das Rauschband aus zwei Aufnahmen **desselben**
 * Zustands (Wind bewegt Vegetation, das gehört abgezogen):
 *
 * | Blickpunkt | Rauschband | halbe Auflösung | AO ganz aus |
 * |---|---|---|---|
 * | `pass` | 0,09 % der Pixel | **2,76 %** (Mittel 0,94/255) | 55,72 % (Mittel 4,06) |
 * | `stadt-neon` | 0,37 % | **4,13 %** (Mittel 0,72/255) | 50,12 % (Mittel 7,53) |
 *
 * Die mittlere Abweichung liegt bei **unter einem Wert von 255** — 0,4 %
 * Helligkeit. Im achtfach verstärkten Differenzbild
 * (`.cache/shots/p12ao_*_diff8x.png`) ist die Fläche schwarz; sichtbar sind nur
 * Ränder an Vegetationssilhouetten, und die stehen zum Teil schon im
 * Rauschband. Zum Vergleich: AO *auszuschalten* verändert die Hälfte des
 * Bildes.
 *
 * Der Kommentar in `postfx.config.ts` sagte das seit P2 voraus („niederfrequentes
 * Signal, der depth-aware Upsampler holt die Kanten zurück, kostet rund ein
 * Drittel") — er stand nur bei der Konstante und nicht bei der Stufe, und
 * deshalb hat Ultra vier Phasen lang dafür bezahlt.
 *
 * Was die Stufen jetzt noch unterscheidet, ist die **Abtastzahl** — der kleinere
 * Hebel, und der einzige, der bei diesem Effekt überhaupt noch Körnung gegen
 * Kosten tauscht.
 */
export interface AoSettings {
  readonly enabled: boolean;
  readonly aoSamples: number;
  readonly denoiseSamples: number;
  readonly halfRes: boolean;
}

export const AO_QUALITY: Readonly<Record<AoQuality, AoSettings>> = {
  high: { enabled: true, aoSamples: 16, denoiseSamples: 8, halfRes: true },
  medium: { enabled: true, aoSamples: 12, denoiseSamples: 4, halfRes: true },
  low: { enabled: true, aoSamples: 8, denoiseSamples: 2, halfRes: true },
  off: { enabled: false, aoSamples: 8, denoiseSamples: 2, halfRes: true },
};

/**
 * Die vier Stufen — und was sie **gemessen** bewirken.
 *
 * Blickpunkt `stadt-neon`, 1280×720 CSS-Pixel, Streuung je Stufe bis zur
 * Stabilität vorgefüllt (sonst misst man den Füllvorgang, siehe
 * `frameTiming.ts`), danach 12 Frames, Median:
 *
 * | Stufe | Zeichenpuffer | Draw-Calls | Dreiecke | davon Gelände | Durchgänge |
 * |---|---|---|---|---|---|
 * | Ultra   | 1280×720 | 96 | 605 486 | 264 192 | 28 |
 * | Hoch    | 1280×720 | 97 | 605 487 | 264 192 | 29 |
 * | Mittel  | 1088×612 | 61 | 212 763 | 148 608 | 22 |
 * | Niedrig |  896×503 | 49 | 130 191 |  66 048 | 10 |
 * | Minimal |  640×360 | 40 | 130 182 |  66 048 |  1 |
 *
 * „Durchgänge" ist die Zahl der Draw-Calls bei **leerer Szene** — also das,
 * was die Postprocessing-Kette allein kostet. Anders ist sie nicht zu
 * beziffern, solange kein GPU-Timer da ist.
 *
 * Zu lesen ist das so:
 *
 *  - **Der Sprung von Hoch auf Mittel** hat zwei Ursachen, nicht eine: der
 *    planare Spiegeldurchgang fällt weg (er zeichnet die Szene ein zweites Mal),
 *    *und* das Knotengitter geht von 33² auf 25².
 *  - **Mittel gegen Niedrig ist seit P8.1 ein echter Abstand.** Vorher waren es
 *    329 823 gegen 329 118 Dreiecke — 705 Stück, also Rauschen. Jetzt sind es
 *    82 567. Der Unterschied kommt vollständig aus dem Gitter; die
 *    ~~Sichtweite~~ und die Vegetationsdichte wirken auf die Instanzen, nicht
 *    auf das Gelände.
 *  - **Die Knotenzahl ist auf allen Stufen gleich** (129 an diesem Blickpunkt),
 *    und das ist Absicht: `ranges` und `morphStart` bleiben unangetastet, weil
 *    sie die Rissfreiheit tragen. Verstellt wird allein die Auflösung
 *    *innerhalb* eines Knotens. Herleitung und Lochzählung stehen bei
 *    `GRID_VERTICES_ALLOWED`.
 *  - **Minimal und Niedrig trennen an diesem Blickpunkt fast nur Kette und
 *    Puffer**: 130 182 gegen 130 191 Dreiecke. Sichtweite und
 *    Vegetationsdichte gehen weiter herunter, aber in einer Geschäftsstraße
 *    steht kaum Bewuchs. Wo der Unterschied wirklich zählt, ist `start` oder
 *    `reisfeld` — **dort nicht neu abgelesen.**
 *  - **Der Sprung von Niedrig auf Minimal ist die Kette**, und nur die: zehn
 *    Vollbilddurchgänge gegen einen. Das ist der einzige Posten der Szene, der
 *    **nicht** mit `renderScale` schrumpft, weil sein Ziel der Canvas ist und
 *    nicht der Szenenpuffer.
 *  - **Die Shadow-Map steht in keiner Spalte.** Echtzeit-Schatten sind aus, also
 *    kostet ihre Auflösung nichts. Das ist kein Verdienst der Stufe.
 *
 * > **Die Frame-Zeiten sind aus dieser Tabelle entfernt.** Sie standen hier mit
 * > 169,4 / 164,9 / 104,3 / 63,2 ms und gehören dem Software-Rasterisierer
 * > dieser Maschine (ANGLE / Microsoft Basic Render Driver). Vier Wiederholungen
 * > **desselben** Zustands ergaben 107,9 / 129,7 / 117,7 / 112,5 ms, also rund
 * > ±10 % — der Abstand Ultra↔Hoch lag darunter. Was unter dem Rauschen liegt,
 * > wird hier nicht behauptet; belastbar sind die exakten Zähler.
 *
 * > **Der vorletzte Punkt ist seit P10.0 gemessen und war zu vorsichtig
 * > formuliert.** „Wo der Unterschied wirklich zählt, ist `start` oder
 * > `reisfeld`" — nachgezählt trägt `start` **67** Vegetationsinstanzen auf
 * > Ultra und `reisfeld` 8804. `start` taugt dafür also gar nicht: es steht auf
 * > 330 m Höhe, und bei 520 m Streureichweite liegt von dort fast alles
 * > außerhalb. Die Blickpunkte mit Bewuchs heißen seitdem `wald` (38 948) und
 * > `wald-fern` (11 068).
 *
 * ## Was P10.1 daran geändert hat
 *
 * Zwei Regler statt einem wirkungslosen (`vegetationRange`, `lodBias` — beide
 * oben hergeleitet). Gemessen im Messlauf aus P10.0, Betriebsart `driven`,
 * dieselbe Matrix vorher und nachher:
 *
 * | Stufe | Blickpunkt | Dreiecke vorher | nachher | Δ |
 * |---|---|---|---|---|
 * | Ultra | wald | 681 120 | 681 120 | **±0** |
 * | Hoch | wald | 579 813 | 579 813 | **±0** |
 * | Mittel | wald | 204 057 | 194 789 | −4,5 % |
 * | Niedrig | wald | 126 855 | 117 833 | **−7,1 %** |
 * | Minimal | wald | 100 542 | 95 394 | −5,1 % |
 *
 * **Und keine einzige Zelle verliert Vegetation.** Über alle 20 Zellen (fünf
 * Stufen × vier Blickpunkte) ist die Instanzzahl gleich oder höher; Minimal
 * gewinnt sogar (+22 / +17 / +15), weil seine Bäume jetzt 520 statt 450 m weit
 * stehen. Verworfene Instanzen: **0** in jeder Zelle — die Puffergrößen halten
 * den kleineren `lodBias` aus, siehe `LOD_BIAS_MIN`.
 *
 * Am Bild geprüft, weil Dreiecke keine Aussage über das Aussehen sind:
 * `lodBias` 1,0 gegen 0,75 auf „Niedrig" am Blickpunkt `wald`, 896 × 503. Die
 * beiden Bilder sind in Baumbestand, Grasverteilung, Silhouette und Baumgrenze
 * nicht zu unterscheiden. **Die Differenzzahl allein hätte das nicht
 * hergegeben** — sie liegt bei Schwelle 24 auf 2,77 %, das Rauschband aus
 * zwei Aufnahmen *desselben* Zustands aber schon bei 2,36 % (Wind und ziehende
 * Wolken). Wer hier nur die Prozentzahl liest, misst das Wetter.
 *
 * Die Instanzzahlen aus dem P7-Lauf (1622 / 1166 / 735 / 386 = 1,00 / 0,719 /
 * 0,453 / 0,238 gegen die eingestellten 1 / 0,7 / 0,45 / 0,25) sind **nicht neu
 * abgelesen**; sie hängen an `vegetationDensity`, und daran hat P8.1 nichts
 * geändert.
 */
const PRESETS: Readonly<Record<QualityLevel, QualitySettings>> = {
  ultra: {
    label: 'Ultra',
    shadowMapSize: 2048,
    reflections: true,
    ao: 'high',
    vegetationRange: 1,
    lodBias: 1,
    // Ultra dünnt bis zur Ferngrenze nur wenig aus.
    vegetationGroundRange: 1,
    vegetationFullRadius: 160,
    vegetationFarKeep: 0.6,
    renderScale: 1,
    terrainGridVertices: 33,
    postFx: 'full',
    waterDetail: 1,
  },
  /**
   * ## „Hoch" war bis P12.3 **teurer als Ultra**
   *
   * Gemessen am 2026-08-16 über vier Blickpunkte, 1280 × 720, GPU-Zeit:
   *
   * | Blickpunkt | Ultra | Hoch |
   * |---|---|---|
   * | `wald` | 2,32 ms | **2,81 ms** |
   * | `stadt-neon` | 3,21 ms | **3,32 ms** |
   * | `reisfeld` | 2,51 ms | 2,44 ms |
   * | `start` | 3,28 ms | 2,62 ms |
   *
   * An drei von vier Stellen kostete die *niedrigere* Stufe mehr. Der Grund
   * steht in `AO_QUALITY`: Ultras `ao: 'high'` lief in voller Auflösung, Hochs
   * `'medium'` in halber — und der Aufwärtsfilter der halben Auflösung ist
   * offenbar teurer als der Unterschied, den er einspart. Ein Stufenwechsel,
   * der nichts spart und trotzdem Vegetation kostet, ist keine Stufe.
   *
   * Seit P12.2 rechnen **alle** Stufen die AO in halber Auflösung. Was „Hoch"
   * jetzt von Ultra trennt, ist der Bloom-Baum (5 statt 8 MIP-Stufen), vier
   * AO-Abtastungen weniger und etwas Vegetation — alles gemessen unauffällig im
   * Bild.
   *
   * ## Und das bleibt die schwächste Sprosse — mit Absicht benannt
   *
   * Gemessen am `stadt-neon`, 3840 × 2160, interleavt gegen Ultra (Rauschband
   * 1,2 %): Bloom 5 statt 8 bringt **−1,2 % (im Rauschen)**, AO 12 statt 16
   * bringt **−2,9 %**. Zusammen liegt „Hoch" also rund 4 % unter Ultra, während
   * „Mittel" 39 % darunter liegt.
   *
   * Das ist keine Nachlässigkeit, sondern der ehrliche Befund: **zwischen
   * „alles an" und „ohne Kantenglättung bei 85 % Auflösung" liegt nichts von
   * Gewicht.** Die großen Hebel dieses Renderers sind die Kette und die
   * Auflösung, und beide anzufassen ist bereits „Mittel". Wer „Hoch" größer
   * machen will, muss ihm etwas Sichtbares wegnehmen — und genau das schließt
   * die Vorgabe aus P12 aus.
   */
  high: {
    label: 'Hoch',
    shadowMapSize: 1024,
    reflections: true,
    // 12 statt 16 Abtastungen — gemessen −2,9 % am `stadt-neon` bei 4K, und im
    // Bild nicht zu finden. Zusammen mit dem kürzeren Bloom-Baum ist das der
    // ganze Abstand zu Ultra; mehr gibt diese Sprosse ehrlicherweise nicht her,
    // siehe die Anmerkung unten.
    ao: 'medium',
    vegetationRange: 1,
    lodBias: 1,
    vegetationGroundRange: 0.9,
    vegetationFullRadius: 130,
    vegetationFarKeep: 0.5,
    renderScale: 1,
    // Bewusst wie Ultra. Das Gelände gröber zu stellen wäre der erste sichtbare
    // Verlust und gehört an den Anfang der *unteren* Hälfte der Tabelle, nicht
    // ans Ende der oberen — und gemessen bringt es ohnehin 3,5 % (im Rauschen).
    terrainGridVertices: 33,
    postFx: 'reduced',
    waterDetail: 0.85,
  },
  medium: {
    label: 'Mittel',
    shadowMapSize: 1024,
    reflections: false,
    ao: 'medium',
    vegetationRange: 1,
    lodBias: 0.85,
    vegetationGroundRange: 0.75,
    vegetationFullRadius: 105,
    vegetationFarKeep: 0.4,
    renderScale: 0.85,
    // 2,0 m je Vertex auf dem Blattknoten. Über dem Texelabstand der Heightmap
    // (1,5 m), aber deutlich unter dem festen P1-Gitter (4,0 m).
    terrainGridVertices: 25,
    postFx: 'lean',
    waterDetail: 0.6,
  },
  /**
   * Ab hier läuft die **kompakte** Kette statt der vollen — P12.1.
   *
   * Bis P12 sprang „Niedrig" auf `lean` (volle Kette ohne SMAA) und „Minimal"
   * auf `off` (gar keine Kette, und damit **ohne Grading-LUT**). Der Sprung war
   * ein Look-Bruch mitten in der Leiter. `compact` schließt ihn: Bloom und
   * Kantenglättung fallen weg, der Farbstich bleibt.
   */
  low: {
    label: 'Niedrig',
    shadowMapSize: 1024,
    reflections: false,
    ao: 'low',
    vegetationRange: 1,
    lodBias: 0.75,
    vegetationGroundRange: 0.62,
    vegetationFullRadius: 80,
    vegetationFarKeep: 0.3,
    renderScale: 0.7,
    // 3,0 m je Vertex — jede zweite Stützstelle der Heightmap wird nicht mehr
    // gelesen. Ein Viertel der Dreiecke von Ultra.
    terrainGridVertices: 17,
    postFx: 'compact',
    waterDetail: 0.35,
  },
  /**
   * Die Stufe für Geräte, auf denen sonst gar nichts liefe — P8.2, umgebaut in
   * P12.1.
   *
   * ## Was sich geändert hat, und warum
   *
   * ~~**Kein „Niedrig mit weniger", sondern ein anderer Renderpfad.** Der
   * Composer wird umgangen; damit fallen Bloom, SMAA, Vignette und die
   * Grading-LUT weg.~~ Der Composer läuft jetzt wieder — in der **kompakten**
   * Form aus P12.1. Der Grund ist der Auftrag aus P12: „Minimal darf weniger
   * Details haben, muss aber gut aussehen." Der `off`-Pfad nahm ihm dafür
   * ausgerechnet den **Farbstich**, also den Anteil, der am wenigsten kostet
   * und am meisten trägt — ein Vollbild-Durchgang gegen die ganze Stimmung.
   *
   * Bloom fällt weiterhin weg, und das ist der teure Teil: acht MIP-Stufen sind
   * gemessen **17 Draw-Calls** (1 Luminanz + 8 ab + 8 auf).
   *
   * ~~Die Sichtweite geht bewusst noch einmal deutlich herunter (450 m statt
   * 600).~~ Die Reichweite ist seit P10.1 kein Deckel mehr, sondern ein Faktor,
   * und sie steht auf allen Stufen auf 1 — ausgedünnt wird mit der Entfernung
   * (P11.2), und wo Halme fehlen, trägt der Boden ihre Farbe (P11.4/11.6).
   *
   * **`ao: 'off'` bleibt hier als einzige Stufe.** Die Umgebungsverdeckung ist
   * auch in halber Auflösung der zweitteuerste Posten der Kette (gemessen
   * 2,21 ms von 4,54 ms bei 4K), und auf der Zielhardware ist die Füllrate der
   * Engpass. Der Kontakt am Stammfuß geht dabei **nicht** verloren: die
   * Bodenverdeckungs-Flecken aus P4 sind ein eigenes System und bleiben.
   */
  minimal: {
    label: 'Minimal',
    shadowMapSize: 1024,
    reflections: false,
    ao: 'off',
    vegetationRange: 1,
    lodBias: 0.65,
    vegetationGroundRange: 0.5,
    vegetationFullRadius: 55,
    vegetationFarKeep: 0.22,
    renderScale: 0.5,
    terrainGridVertices: 17,
    postFx: 'compact',
    // Null heißt: der Zweig im Shader fällt ganz weg. Siehe `waterDetail`.
    waterDetail: 0,
  },
};

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  'ultra',
  'high',
  'medium',
  'low',
  'minimal',
];

/**
 * Die Felder, die der Nutzer im Menü einzeln stellen darf — P10.2.
 *
 * `shadowMapSize` fehlt mit Absicht: Echtzeit-Schatten sind seit P2 aus, der
 * Wert kostet nichts und ändert nichts. Ein Regler ohne Wirkung ist genau das,
 * was P10.1 an `viewDistance` beanstandet hat; er gehört nicht in ein Menü, das
 * jemand ernst nehmen soll.
 */
export interface CustomQuality {
  readonly renderScale: number;
  readonly terrainGridVertices: GridVertices;
  readonly vegetationGroundRange: number;
  readonly vegetationFullRadius: number;
  readonly vegetationFarKeep: number;
  readonly vegetationRange: number;
  readonly lodBias: number;
  readonly ao: AoQuality;
  readonly postFx: PostFxQuality;
  readonly reflections: boolean;
}

/** Zustand der eigenen Stufe. Startwert ist Ultra — siehe `setCustomQuality`. */
const customState: { value: QualitySettings } = {
  value: { ...PRESETS.ultra, label: 'Eigen' },
};

/**
 * Die Stufentabelle, wie sie alle Systeme lesen — `QUALITY[level].renderScale`.
 *
 * **`custom` ist ein Getter und keine Kopie.** Die Systeme schlagen ihre Werte
 * beim Eintreffen von `quality:changed` nach; wer stattdessen ein eingefrorenes
 * Objekt hier einträgt, liefert nach dem ersten Reglerzug die Werte von vorher
 * aus. Das ist wörtlich der Fehler, den CLAUDE.md unter „Zusage statt Ergebnis"
 * führt — nur im Datenpfad statt im Bericht.
 *
 * Die fünf Voreinstellungen bleiben unveränderlich; änderbar ist allein die
 * eigene Stufe, und die nur über `setCustomQuality()`, weil dort geklemmt wird.
 */
export const QUALITY: Readonly<Record<QualityKey, QualitySettings>> = {
  ...PRESETS,
  get custom(): QualitySettings {
    return customState.value;
  },
};

/**
 * Ungünstigster `lodBias` und größter `vegetationRange` über **alle** Stufen.
 *
 * Wofür: `ScatterSystem` legt seine Instanzpuffer **einmal** beim Start an, die
 * LOD-Grenzen ändern sich aber mit der Stufe. Ein kleinerer `lodBias` schiebt
 * Instanzen aus den beiden Mesh-Stufen in die Imposter-Stufe — deren Ring wächst
 * also, während die anderen schrumpfen. Ein Puffer, der für Ultra bemessen ist,
 * liefe auf Minimal über, und ein Überlauf in `InstancedLOD.push()` **verwirft
 * Instanzen stillschweigend** (er zählt sie nur in `#dropped`). Das wäre exakt
 * die Verschlechterung, die P10.1 ausschließt — und sie wäre unsichtbar, weil
 * die Zahl bis P10.1 nirgends in einer Abnahme stand.
 *
 * Bemessen wird deshalb über den ungünstigsten Fall: innere Grenzen mit dem
 * kleinsten Bias, äußere mit der größten Reichweite.
 *
 * **Abgeleitet und nicht abgeschrieben.** Eine sechste Stufe mit einem noch
 * kleineren Bias verändert diese Konstanten von selbst; eine handgepflegte Zahl
 * daneben wäre der nächste Wert, der irgendwann nicht mehr stimmt.
 */
export const LOD_BIAS_MIN: number = Math.min(...QUALITY_LEVELS.map((l) => QUALITY[l].lodBias));
export const VEGETATION_RANGE_MAX: number = Math.max(
  ...QUALITY_LEVELS.map((l) => QUALITY[l].vegetationRange),
);
/** Dasselbe für die Bodendecker — siehe `vegetationGroundRange`. */
export const VEGETATION_GROUND_RANGE_MAX: number = Math.max(
  ...QUALITY_LEVELS.map((l) => QUALITY[l].vegetationGroundRange),
);

/**
 * Grenzen der Einzelregler — und **warum sie keine Geschmacksfrage sind.**
 *
 * Zwei davon sind hart und stehen genau deshalb hier, abgeleitet statt
 * abgeschrieben:
 *
 *  - **`lodBias` darf nicht unter `LOD_BIAS_MIN`.** `ScatterSystem` legt seine
 *    Instanzpuffer **einmal** beim Start an, bemessen auf den ungünstigsten
 *    Fall über alle Stufen. Ein kleinerer Bias schiebt Instanzen aus den
 *    Mesh-Stufen in die Imposter-Stufe, deren Puffer läuft über — und
 *    `InstancedLOD.push()` verwirft dann **stillschweigend**. Der Regler würde
 *    also Vegetation kosten und dabei aussehen, als täte er nichts.
 *  - **`vegetationRange` nicht über `VEGETATION_RANGE_MAX`**, aus demselben
 *    Grund von der anderen Seite: der äußere Ring wächst mit.
 *
 * Ein Regler darf den Renderer nicht in einen Zustand bringen, den kein
 * Messlauf je gesehen hat. Wer die Reichweite wirklich erhöhen will, erhöht
 * `vegetationRange` in der Tabelle oben — dann wachsen die Puffer mit, weil sie
 * daraus bemessen werden. Das ist P10.3 und nicht die Aufgabe eines Menüs.
 *
 * `renderScale` ab 0,5: darunter ist die Schrift der Beschilderung nicht mehr
 * lesbar (gemessen an `stadt-neon`, 1280 × 720 → 640 × 360 ist die untere
 * Grenze, an der die Kanji noch als Zeichen und nicht als Muster stehen).
 */
export const CUSTOM_LIMITS = {
  renderScale: { min: 0.5, max: 1, step: 0.05 },
  vegetationGroundRange: { min: 0.25, max: VEGETATION_GROUND_RANGE_MAX, step: 0.05 },
  vegetationFullRadius: { min: 10, max: 260, step: 5 },
  vegetationFarKeep: { min: 0.05, max: 1, step: 0.05 },
  vegetationRange: { min: 0.5, max: VEGETATION_RANGE_MAX, step: 0.05 },
  lodBias: { min: LOD_BIAS_MIN, max: 1, step: 0.05 },
} as const;

const AO_KEYS = Object.keys(AO_QUALITY) as readonly AoQuality[];
const POSTFX_KEYS = Object.keys(POSTFX_QUALITY) as readonly PostFxQuality[];

function clamp(value: number, { min, max }: { min: number; max: number }): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}

/** Die eigene Stufe lesen — für die Regler im Menü. */
export function readCustomQuality(): QualitySettings {
  return customState.value;
}

/**
 * Die eigene Stufe setzen — der einzige Weg dorthin.
 *
 * **Es wird geklemmt und geprüft, nicht vertraut.** Die Werte kommen aus einem
 * Menü, aus `localStorage` (also aus einem früheren Programmstand) und
 * potenziell aus der Konsole. `terrainGridVertices` ist dabei der gefährlichste:
 * P4 hat 207 Löcher im Terrain gezählt, als die Rissfreiheit nicht mehr galt,
 * und die zulässigen Werte stehen aus genau diesem Grund in
 * `GRID_VERTICES_ALLOWED`. Ein Wert daneben wird **nicht** übernommen, statt
 * ein Gitter zu bauen, dessen Nachbarn nicht mehr zusammenpassen.
 *
 * Liefert die fertige Stufe zurück, damit der Aufrufer anzeigen kann, was
 * wirklich gilt — und nicht, was er wollte.
 */
export function setCustomQuality(patch: Partial<CustomQuality>): QualitySettings {
  const before = customState.value;
  const grid = patch.terrainGridVertices;
  customState.value = {
    label: 'Eigen',
    shadowMapSize: before.shadowMapSize,
    renderScale: clamp(patch.renderScale ?? before.renderScale, CUSTOM_LIMITS.renderScale),
    vegetationGroundRange: clamp(
      patch.vegetationGroundRange ?? before.vegetationGroundRange,
      CUSTOM_LIMITS.vegetationGroundRange,
    ),
    vegetationFullRadius: clamp(
      patch.vegetationFullRadius ?? before.vegetationFullRadius,
      CUSTOM_LIMITS.vegetationFullRadius,
    ),
    vegetationFarKeep: clamp(
      patch.vegetationFarKeep ?? before.vegetationFarKeep,
      CUSTOM_LIMITS.vegetationFarKeep,
    ),
    vegetationRange: clamp(
      patch.vegetationRange ?? before.vegetationRange,
      CUSTOM_LIMITS.vegetationRange,
    ),
    lodBias: clamp(patch.lodBias ?? before.lodBias, CUSTOM_LIMITS.lodBias),
    terrainGridVertices: GRID_VERTICES_ALLOWED.includes(grid as GridVertices)
      ? (grid as GridVertices)
      : before.terrainGridVertices,
    ao: patch.ao !== undefined && AO_KEYS.includes(patch.ao) ? patch.ao : before.ao,
    postFx:
      patch.postFx !== undefined && POSTFX_KEYS.includes(patch.postFx) ? patch.postFx : before.postFx,
    reflections:
      typeof patch.reflections === 'boolean' ? patch.reflections : before.reflections,
    // **Kein eigener Regler im Menü** (`CustomQuality` führt ihn nicht), aber
    // auch keine Konstante: die eigene Stufe erbt ihn von der Kette, die sie
    // fährt. Wer auf `compact` stellt, will keine zusätzliche Kräuselung — und
    // wer die volle Kette wählt, will sie.
    waterDetail: before.waterDetail,
  };
  return customState.value;
}

/** Die stellbaren Felder einer beliebigen Stufe herausziehen — Startwert der Regler. */
export function customFromSettings(settings: QualitySettings): CustomQuality {
  return {
    renderScale: settings.renderScale,
    terrainGridVertices: settings.terrainGridVertices,
    vegetationGroundRange: settings.vegetationGroundRange,
    vegetationFullRadius: settings.vegetationFullRadius,
    vegetationFarKeep: settings.vegetationFarKeep,
    vegetationRange: settings.vegetationRange,
    lodBias: settings.lodBias,
    ao: settings.ao,
    postFx: settings.postFx,
    reflections: settings.reflections,
  };
}

/**
 * Stufe, mit der die Einstufung beginnt — und die gilt, wenn sie nicht
 * stattfindet (gespeicherte Wahl, verdecktes Fenster, abgeschaltet).
 *
 * Bewusst die höchste: heruntergestuft wird gemessen, hochgestuft nie. Andersrum
 * bekäme jede starke Maschine dauerhaft das schlechtere Bild, weil niemand
 * merkt, dass mehr ginge.
 */
export const DEFAULT_QUALITY: QualityLevel = 'ultra';

/**
 * Ersteinstufung beim ersten Start — PLAN.md P7 / 7.1.
 *
 * Gemessen wird der **Abstand zwischen zwei rAF-Frames**, nicht die Rechenzeit
 * eines Frames. Das ist Absicht und der Unterschied ist wesentlich: die
 * Einstufung soll beantworten, ob die Maschine die Bildrate *hält* — und dazu
 * gehören Vsync, der Verbund mit dem Compositor und alles, was der Browser
 * zwischen zwei Bildern sonst noch tut. `frameTiming.ts` misst die andere
 * Frage (was kostet ein Zustand gegen einen anderen) und taugt dafür nicht:
 * es rendert ohne Vsync, so schnell es geht.
 *
 * Heruntergestuft wird höchstens viermal — von Ultra nach Minimal ist Schluss.
 * (Bis P8.2 waren es drei; die Schleife liest die Zahl aus `QUALITY_LEVELS`,
 * eine neue Stufe verlängert sie also von selbst.)
 */
export const BENCHMARK = {
  /**
   * Frames, die vor der Messung verworfen werden.
   *
   * Der Start ist der ungünstigste denkbare Messzeitpunkt: der Chunk-Cache der
   * Streuung ist leer und füllt sich mit einem Zeitbudget je Frame, die
   * Texturen wandern noch auf die GPU. In P4 hat genau diese Verwechslung
   * 0,70 ms statt 12,7 ms gemeldet.
   */
  warmupFrames: 30,
  /** Frames je Runde. Bei 60 Hz ist das eine Sekunde. */
  sampleFrames: 60,
  /**
   * Ab diesem Median wird eine Stufe heruntergegangen.
   *
   * 20 ms und nicht 16,6: bei Vsync gibt es keine Zwischenwerte. Wer 60 Hz
   * hält, misst 16,7 ms; wer sie verfehlt, springt auf 33,3 ms. Die Schwelle
   * liegt dazwischen und ist damit gegen die übliche Streuung robust.
   */
  stepDownMs: 20,
  /**
   * Darüber gilt die Messung als **unbrauchbar**, nicht als schlecht.
   *
   * Ein verdecktes Fenster bekommt rAF im Sekundentakt. Ohne diese Grenze
   * stufte ein kurz weggeklickter Tab die Maschine dauerhaft auf „Niedrig" —
   * und speicherte das Ergebnis auch noch.
   */
  implausibleMs: 400,
  /**
   * ── Der Wächter — P15.5 ───────────────────────────────────────────────
   *
   * Die Ersteinstufung darüber endet, sobald sie ein Ergebnis hat. Danach sah
   * **niemand** mehr auf die Bildrate: ein Gerät, das beim Start kühl ist und
   * nach zehn Minuten drosselt, fuhr den Rest der Sitzung unter 60 Bildern,
   * ohne dass etwas passierte. Die Zusage „immer mindestens 60" war damit eine
   * Zusage über die ersten 90 Frames.
   *
   * ## Warum das trotzdem keine Regelung ist
   *
   * Im Kopf von `QualitySystem.update()` stand seit P7: „Hochgestuft wird nie.
   * Eine Regelung in beide Richtungen ist genau das, was in diesem Projekt
   * zweimal davongelaufen ist." Der Satz bleibt richtig — deshalb ist das hier
   * ein **Sperrklinkenwerk** und keine Regelung:
   *
   *  - Die Sitzungsobergrenze wandert **ausschließlich nach unten**. Wer einmal
   *    von „Hoch" heruntergestuft wurde, bekommt „Hoch" in dieser Sitzung nicht
   *    wieder angeboten.
   *  - Zwischen „reicht nicht mehr" (`stepDownMs`) und „reicht wieder"
   *    (`stepUpMs`) liegt eine Lücke, in der nichts passiert.
   *  - Hochgestuft wird über ein **fünfmal längeres** Fenster als
   *    heruntergestuft.
   *
   * Bei fünf Stufen und einer nur fallenden Obergrenze sind höchstens vier
   * Hochstufungen je Sitzung überhaupt möglich, und jede verkleinert die Menge
   * der später noch erreichbaren Stufen. Ein Pendeln ist damit nicht
   * unwahrscheinlich, sondern **unmöglich**.
   */
  guard: {
    /**
     * Frames je Beobachtungsfenster.
     *
     * 120 bei 60 Hz sind zwei Sekunden. Kürzer wäre nervös: ein Nachladen von
     * Vegetation oder ein Stufenwechsel kostet einzelne Frames, und darauf soll
     * der Wächter gerade **nicht** anspringen.
     */
    window: 120,
    /**
     * Perzentil statt Median — und das ist der Kern der Sache.
     *
     * Ein einzelner Ruckler ist keine Überlastung; jeder zehnte Frame zu spät
     * ist eine. Der Median sähe beides als gesund an, weil er die schlechte
     * Hälfte gar nicht ansieht. Dieselbe Überlegung wie beim 10. Perzentil in
     * `abMeasure.ts`, nur am anderen Ende der Verteilung: dort sollen Störungen
     * heraus, hier sollen sie gerade **hinein**.
     */
    percentile: 0.9,
    /**
     * Ab hier gilt „reicht wieder" — deutlich unter `stepDownMs`.
     *
     * 14 gegen 20 ms. Die Lücke dazwischen ist die Hysterese; ohne sie stünde
     * ein Gerät, das bei 19,9 ms herunterstuft und danach 19,1 ms liefert,
     * unmittelbar vor der Rückkehr — und das ist die Schleife, die dieses
     * Projekt zweimal ausgebaut hat.
     *
     * 14 ms sind bei 60 Hz kein „schafft es knapp", sondern 16 % Luft auf ein
     * Vsync-Fenster. Wer nur 16,7 ms trifft, hat keine Reserve für die nächste
     * Kurve mit mehr Bewuchs im Bild.
     */
    stepUpMs: 14,
    /**
     * Wie viele **aufeinanderfolgende** gute Fenster eine Hochstufung braucht.
     *
     * Fünf Fenster à 120 Frames sind zehn Sekunden ununterbrochener Reserve.
     * Heruntergestuft wird nach **einem** Fenster: eine zu langsame Anwendung
     * ist sofort ein Problem, eine zu schnelle nie. Diese Asymmetrie ist
     * Absicht und der zweite Grund, warum das Werk nicht pendeln kann.
     */
    goodWindows: 5,
    /**
     * Frames, die nach einem Stufenwechsel verworfen werden.
     *
     * Ein Wechsel übersetzt Shader neu (P10.2 hat 17 zusätzliche Übersetzungen
     * gemessen) und wirft Texturen um. Wer die Frames unmittelbar danach als
     * Messung nimmt, misst den Wechsel und stuft daraufhin weiter — genau die
     * davonlaufende Schleife. Doppelt so lang wie `warmupFrames`, weil hier
     * zusätzlich der Nachlader im Hintergrund arbeiten kann.
     */
    settleFrames: 60,
  },
  /** Schlüssel im localStorage. */
  storageKey: 'japanMap.quality',
  /**
   * Erhöhen, wenn sich die Bedeutung der Stufen ändert. Eine gespeicherte
   * Einstufung aus einer anderen Tabelle ist keine Einstufung.
   *
   * **2 seit P12.3.** Die AO rechnet auf jeder Stufe in halber Auflösung, es
   * gibt die Kettenstufe `compact`, und „Hoch" bedeutet etwas anderes als
   * vorher. Eine gespeicherte „Niedrig" aus Version 1 stünde damit für Werte,
   * die es nicht mehr gibt — und eine gespeicherte *eigene* Stufe für einen
   * `postFx`-Namen, den `setCustomQuality()` heute stillschweigend verwürfe.
   */
  storageVersion: 2,
} as const;

/**
 * Ein Budget hat zwei Schwellen: `warn` färbt gelb (noch tragbar, aber der
 * Puffer schrumpft), `limit` färbt rot (SPEC §4 verletzt).
 *
 * Die Warnschwelle liegt bewusst bei ~75 % des Limits. Wer erst bei 100 %
 * reagiert, hat keinen Spielraum mehr für die Systeme, die noch kommen.
 */
export interface Budget {
  readonly warn: number;
  readonly limit: number;
}

export const BUDGETS = {
  /** Frame-Time gesamt: 16,6 ms bei 60 FPS. */
  frameTimeMs: { warn: 13, limit: 16.6 },
  /** Reine GPU-Zeit des Frames. */
  gpuMs: { warn: 13, limit: 16.6 },
  /** Anteil davon, den die Postprocessing-Kette kosten darf (ab P2 messbar). */
  postFxMs: { warn: 4, limit: 5 },
  drawCalls: { warn: 600, limit: 800 },
  /**
   * Teilbudget der Stadt — PLAN.md P6, Akzeptanzkriterium.
   *
   * Der Plan nennt „< 300 Draw-Calls" als eigenes Budget für die Stadt, und das
   * ist kein Unterposten des Gesamtbudgets, sondern eine Aussage über die
   * Bauweise: Gebäude werden **je Block** zusammengefasst, nicht je Haus. Ohne
   * diese Zusammenfassung wären es bei 135 Gebäuden allein dafür 135 Aufrufe,
   * und jede spätere Erweiterung der Stadt liefe unbemerkt darauf zu.
   *
   * Gezählt wird über die Szenengruppen `Stadt` und `Neon` und **ohne
   * Frustum-Culling** — also der Fall, dass der ganze Distrikt im Bild steht.
   * Das ist strenger als das, was der Renderer meldet, und genau richtig für
   * ein Budget: es soll nicht davon abhängen, wohin die Kamera gerade schaut.
   */
  cityDrawCalls: { warn: 200, limit: 300 },
  triangles: { warn: 2_250_000, limit: 3_000_000 },
  /** Geschätzter Texturspeicher auf der GPU. */
  textureMemoryMb: { warn: 384, limit: 512 },
  /** Übertragene Bytes bis zum ersten Bild (ab P7 gemessen). */
  initialDownloadMb: { warn: 12, limit: 15 },
} as const satisfies Record<string, Budget>;

export type BudgetKey = keyof typeof BUDGETS;
