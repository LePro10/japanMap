# Vier Dörfer — Stil, Lage, Plan

Stand 2026-09-26: **alle vier Dörfer gebaut** — Funaura (§1), Stillwater als Gassho-Weiler (§2),
Kiso-Juku (§3) und Koedo (§4).

## Funaura — was gebaut ist und was gemessen wurde

Code: `src/world/settlements/funaura/` (Layout, Gebäude, Atlas, Leben, System),
Baukasten `src/world/settlements/wago/`. Blickpunkte `funaura`, `funaura-mole`,
`funaura-kai`, `funaura-nah`, `funaura-gasse`, `funaura-luft`. Kartenpin „Funaura 舟浦“.

- Aufgeschüttete Kaiplatte (QUAY_Y 1,8 m), 11 Funaya auf Pfeilern über Wasser mit
  Slip, Garage, Werkstatt, Wäsche; 42 Häuser (19 gesetzt, 23 verdichtet) auf
  Steinterrassen mit Zäunen, darunter Fischladen, Izakaya, Laden mit Automaten,
  Minshuku, Angelladen; Genossenschaft, Eishaus, offene Fischhalle, Steg,
  Slipanlage, zwei Molen mit ~490 Tetrapoden und rotem/weißem Molenfeuer (blinkt),
  Ebisu-Schrein mit Treppe, 36 Gemüsebeete, Schwarzkiefern, Masten mit Leitungen.
- Straße von der Mill Lane (Stillwater) über den Rücken ins Dorf, ~620 m, eigene
  Fahrfläche wie die Mill Lane, kein Rebake.
- Oberflächen: `weatheredMaterial` (Maserung, Flecken, Algen-/Salzband, triplanar,
  ohne UVs); Atlas `funauraAtlas.ts` (Schilder, Plakate, Innenräume, Automaten,
  Gullydeckel, 止まれ); Stoff im Wind (`clothMaterial`: Wäsche, Noren, Netze, Fangfahnen).
- Leben (`funauraLife.ts`): 11 gehende Figuren mit Beinen und Pausen, auslaufendes
  Tintenfischboot mit Heckwelle, Kleinboot im Becken, Rauch aus zwei Kaminen und
  einem Glutfass, fliegende und sitzende Möwen, Angler, Katzen, wippende Boote.

**Gemessen (2026-09-25, AMD iGPU 0x164E, 1280 × 720, Szene gesamt mit Dorf):**

| Stufe · Blickpunkt | Draw-Calls | Dreiecke | ohne Dorf |
|---|---|---|---|
| Minimal · funaura-gasse | 124 | 446 k | 41 / 243 k |
| Minimal · funaura-luft | 164 | 569 k | 76 / 421 k |
| Minimal · funaura-kai | 428 | 891 k | 352 / 718 k |
| Minimal · start (fern) | 273 | 596 k | 263 / 593 k |
| Ultra · funaura-gasse | 164 | 570 k | 69 / 273 k |
| Ultra · funaura-luft | 231 | 740 k | 104 / 425 k |

Zum Vergleich Tokio-Kern Minimal: 167…231 DC / 474…673 k (docs/TOKYO.md). Aufbau
0,65…1,1 s. Auf Minimal entfällt die Oberflächenschicht (`Parts.fine`) und die
unterste Tetrapodenlage; Nahschicht 160 m.

**Prüfprogramm** `node tools/funaura-traversal.mjs` (Dev-Server 5180): Auto von
Stillwater bis Stegende in 107 s, max. 2,9 m Abweichung, 0 Wasserschritte, kein
Aufsetzen; beide Molen bis zu den Feuern begehbar, Schreintreppe, Bootshauswand
hält, keine Konsolenfehler. `wp5-traversal`, `navigation-map.test` (jetzt 10
Hauptpins), `test:polish`, Typecheck, Build: grün.

**Unterwegs gefunden (und behoben):** Straße lief durch ein Stillwater-Haus;
Westmole ohne Anschluss (Figur lief über den Meeresgrund); Kei-Truck und
Gabelstapler blockierten Zufahrt und Hafenstraße; Kaikante sperrte Steg und Slip;
115 Gemüsebeete kosteten ~94 k Dreiecke; Entfernungsprüfung mit Mittelpunkt −0,7
Kacheln ließ auf Minimal alles sichtbar; `constructor(readonly …)` in
`SettlementKit` hätte die Node-Prüfstände gebrochen.

**Offen:** Tideglass steht noch in alter Form (Plan: moderner Fischmarkt, §Reihenfolge 5);
Net-House-Rätsel liegt weiter dort. Kein Innenraum in Funaura, keine eigenen
Geräusche (Wellen, Möwen, Motoren). Gehende weichen dem Auto nicht aus.
Ob es sich „AAA“ anfühlt, beantwortet kein Prüfstand — das ist die Frage an dich.

## Stillwater — Gassho-Weiler: was gebaut ist und was gemessen wurde

Code: `src/world/settlements/gassho/` (Layout, Bauten, Atlas, System `GasshoHamlet`),
Baukasten erweitert (`wago/`: Strohschicht `Parts.thatch`, `prismZ`/`polyFacing`,
Strohmaterial `weatheredMaterial({ thatch: true })`). Blickpunkte `gassho`, `gassho-gasse`,
`gassho-rad`, `gassho-muehle`, `gassho-luft`. Kartenpin „Stillwater 静水“ jetzt
„Gassho farmhouses, triple waterwheel“.

- **Ostkern auf dem Talboden** (x −1195…−1105, z 230…470, 22…25 m) wie Ogimachi neben
  dem Fluss, dazu Häuser an der Mill Lane: 15 Gassho-Häuser (58…61°-Stroh, 0,6 m dick,
  gestufte Traufe, Strohfirst mit Kurabone, Giebel mit bis zu fünf Böden Shōji,
  Rauchgitter, Umgang, Hoshigaki-Schnüre), 3 Kayabuki-Walmdächer (Miyama, Rauchgiebel,
  Umanori), 3 Kura mit Kamon im Giebel. **Alle Firste Nord–Süd.**
- Jedes Haus auf eigener Hofterrasse (Ishigaki, Kies), Zugang von der Straßenkante:
  Steinplatte über den Graben, dann Rampe (≤ 0,45 m) oder Steinstufen (0,26 m).
- Neue **Dorfstraße** (6 m, Fahrspuren, Bordsteine, Gullydeckel, 止まれ, Tempo 30,
  Bushaltestelle, Masten mit Leitungen), beidseitig an die Mill Lane angeschlossen;
  Feldwege; Wassergraben mit Koi an der Ostkante.
- **Dreifach-Wasserrad** (Asakura Sanrensui) am Ostufer: Räder 2,35/2,55/2,8 m, Rinne
  auf 70 % Radhöhe, fällt nach Norden und läuft auf die Terrasse (Auslauf 0,40 m über
  Gelände, gemessen). Räder drehen, Wasser fließt, Schaum am Radgrund.
- Mühle: Kayabuki-Walmdach statt Ziegeln. Teich: Koi statt Skiffs; Netzgestell und
  Boote raus (gehören ans Meer). Die 14 Putzhäuser (`HOMES`) sind ersetzt.
- Mill Lane: **zwei Brücken** über den Fluss (Holzgeländer mit Kollision, Randbalken,
  Steinpfeiler) — vorher lag dort das Band wie ein Damm.
- 7 Hasa-gake mit Reisbündeln, 6 Feuerwehrhütten (Hōsui-koya), Hachiman-Schrein,
  sechs Jizō mit Windrädern, Soba-Bank mit rotem Schirm, Minshuku, Doburoku-Laden mit
  Automaten, Gemüsestand, Bärenwarnung, Kei-Trucks, Traktor, Strohkegel, Vogelscheuchen.
- Kakibäume mit Früchten, Sugi-Haine, Bambus. Leben: 8 gehende Bauern (Sugegasa,
  Kiepe), 5 Bauern im Feld, Katzen, Herdrauch aus den Giebeln.
- Reismaske zur Laufzeit trocken um jeden Hof (`paddyDry`, gelesen von `RicePaddy`
  und `WaterField`) — vorher stand jedes Haus wie ein Floß im Wasser. Kein Rebake.

**Gemessen (2026-09-25, AMD iGPU 0x164E, 1280 × 720, mit Weiler / ohne):**

| Stufe · Blickpunkt | Draw-Calls | Dreiecke |
|---|---|---|
| Minimal · gassho | 164 (99) | 597 k (453 k) |
| Minimal · gassho-gasse | 109 (53) | 548 k (418 k) |
| Minimal · gassho-luft | 143 (82) | 531 k (418 k) |
| Minimal · start (fern) | 293 (273) | 633 k (596 k) |
| Ultra · gassho | 267 (195) | 796 k (609 k) |
| Ultra · gassho-luft | 218 (138) | 637 k (443 k) |

Aufbau 0,5…0,9 s, 175 k Dreiecke über alle Schichten. Wasserflächen am Rad zu zwei
Meshes verschmolzen (einzeln waren es ~20 Draw-Calls mehr). `japanMap.winding()`: 0.

**Prüfprogramm** `node tools/gassho-traversal.mjs [url]`: Dorfstraße Nord→Süd in 31 s,
max. 1,5 m Abweichung, 0 Wasserschritte; Mill Lane über beide Brücken 65 s; 41/41
Geländerproben halten; Wasserrad-Aussichtspunkt, Schreinstufen, Stufen in den Hof des
großen Hauses (1,2 m über der Straße) erreichbar; Terrassen- und Hauswand halten.
`wp5-traversal`, `wp5-phone`, `funaura-traversal`, `test:polish`, `smoke.mjs`,
`navigation-map.test`, Typecheck, Build: grün. `wp5-visit` besteht Mühle, Schleuse,
Teich und Net House und scheitert danach an `page.setViewportSize` (Protokollfehler
„restore window first“ des Headless-Chromium auf dieser Maschine, nicht an der Seite).

**Unterwegs gefunden (und behoben):** Strohmaterial tastete mit 3-mm-Halmen ab (unter
einem Pixel → glatte Fläche mit Bretterstreifen); `m.defines = {…}` überschrieb
threes `STANDARD`; Moos als flache Kugeln las sich als Aufkleber; Decklagen-Leisten
im Holzmaterial lasen sich als Ziegel; Traufe als Quader las sich als Balken;
Wasserrad-Rinne floss bergauf und verdeckte die Räder; Jizō und ein Kakibaum standen
auf der Fahrbahn (Fahrtest nach 7 m bzw. 39 m fest); Stufen endeten vor dem Graben
(Figur fiel hinein); Rauch sah im Nahbild wie Seifenblasen aus (weiche Ränder jetzt
auch in Funaura); `wp5-visit`/`wp5-phone` fanden seit Funaura mehrere Hinweisfelder.

**Offen:** Kein begehbarer Innenraum (Irori sieht man nur durchs offene Tor). Mühle
steht noch auf der alten Steinplatte. Keine eigenen Geräusche (Wasserrad, Glocke).
Hasa-gake mit Reis und geflutete Felder zugleich — Herbst und Frühling in einem Bild.
Ob es sich „AAA“ anfühlt: die Frage an dich.

## Kiso-Juku — Poststation am Pass: was gebaut ist und was gemessen wurde

Code: `src/world/settlements/kiso/` (Layout in Straßenkoordinaten, Bauten, Atlas, System
`KisoJuku`). Baukasten erweitert: `Parts.interior`/`interiorTex` und `weatheredMaterial({ lift })`
(Eigenhelligkeit als Anteil der Albedo, für Innenräume). Blickpunkte `kiso`, `kiso-honjin`,
`kiso-gasse`, `kiso-tee`, `kiso-luft`. Kartenpin „Kiso-juku 木曽宿“ (11. Hauptpin).

- **Lage:** `toge` s 1668…1952, (−1314 | −945) → (−1386 | −1214), 128…152 m, 8,35 % Steigung.
  Alles ist in Straßenkoordinaten gebaut (s, o; +o = Talseite), die echte Mittellinie kommt
  zur Laufzeit aus `drive.roads`. **Die Rennstrecke bleibt unverändert:** in ±4,25 m steht
  nichts, keine Kollision, kein Rebake. Das Dorfpflaster (Waschbeton mit Granitband wie
  Magome) liegt 1,5 cm über dem Asphalt mit Polygon-Offset; die Physik sieht nur den Asphalt.
- **42 Häuser** in zwei Zeilen (21 Talseite bis 14 m tief, 21 Hangseite 6…7,5 m, Rückseite im
  Hang mit Stützmauer) aus einem parametrischen Kiso-Haus: vorkragendes Obergeschoss mit
  Balkenköpfen, Koshi-Gitter mit Licht dahinter, weiße Putzfelder, Sodekabe, Udatsu (Unno),
  Geländer (Narai), Pultdach über dem Laden, Hauptdach in drei Deckungen — Ziegel, Bretter
  mit Haltestangen und Steinen (Ishioki), Blech mit Falzen — hirairi oder mit Fachwerkgiebel
  zur Straße (Tsumairi), Sparren unter der Traufe. Rollen mit eigenem Schild, Noren,
  Laternen, Auslage und Innenraumkachel: 6 Gasthöfe, Waki-Honjin, Soba, Gohei-Mochi, Sake mit
  Sugidama, Holzhandwerk, Lackwaren, Süßes, Andenken mit Automat im Holzkleid, Post mit rotem
  Kasten. Ein Drittel der Wohnhäuser der Talseite mit Vorgarten (Kies, Bambuszaun, Niwaki).
- **Honjin** (einziger Innenraum, begehbar): Putzmauer mit Tor, violettem Maku und Laternen,
  Hof mit geharktem Kies, Trittsteinen, Kasuga-Laterne, Tsukubai, Kiefer; Haupthaus mit
  Genkan, Doma (Kamado mit Glut), Agari-kamachi-Stufe, Irori mit Kessel am Haken, Tatami,
  bemalte Fusuma, Tokonoma mit Rollbild und Ikebana, Andon, Byōbu.
- **Straße:** Gehwege beidseitig, offene Rinnen mit fließendem Wasser und Trittplatten vor
  jeder Tür, Andon-Laternen, Lichtflecken auf dem Pflaster (additiv, ein Draw-Call, keine
  Punktlichter), Gullydeckel mit Packpferd, Wassertröge, Kōsatsu-ba, Wegsteine, Ortsschilder,
  Ortsplan, Bärenwarnung, Bushaltestelle. Leitpfosten im Ort ausgeblendet (`inKiso`).
- **Hang:** Steingasse (Magome) mit Stufen ≤ 21 cm, Geländer, Mauersteinen, Wasserrad am Weg,
  oberer Weg zum Glockenturm (Ishigaki-Sockel), Hokora mit Torii und zum **Teehaus auf Stelzen**
  (Kakezukuri, Kayabuki-Dach aus dem Gassho-Baukasten) mit Terrasse über den Dächern.
  Kein Tempel: oben gibt es keine ebene Stelle (30…35°), er hätte 9 m Mauer gebraucht.
- **Hinterland:** Hintergassen, Kura, Schuppen, Kei-Van, Gemüsebeete, Friedhof, Kaki, Bambus,
  Zedernwald (164 Sugi), Momiji im Herbstlaub, Hoshigaki, Fahrräder, Futons, Herdrauch.
- **Keine Figuren** — Leute kommen später (Auftrag 2026-09-26).
- **Variation (Nachtrag 2026-09-26, Rückmeldung „nicht immer die gleichen Häuser“):** jedes
  dritte Haus springt zurück (Talseite 0,9…2,2 m mit Vorgarten, Hangseite 0,4…0,9 m), jedes
  fünfte steht 0,3 m vor der Flucht; Gierwinkel ±2,3°; ein Fünftel der Fugen 1,5…3 m breit;
  ein Drittel der Wohnhäuser eingeschossig (Hiraya); Obergeschoss zum Teil 0,45 m höher;
  jedes vierte Haus unbehandelt silbergrau, jedes fünfte mit Lehmputz statt Weiß.
- **Zufahrten** s 1582…1667 und 1953…2040: Ishigaki-Stützmauern aus Bruchstein (≤ 2,8 m, Moos
  und Büsche auf der Krone, Rinne am Fuß, Kollision außerhalb ±4,25 m) mit Nischen für
  Jizō-Schrein und Stammholz vom Einschlag, Holzmasten mit Leitungen (nur außerhalb des
  Kerns, wie in Narai), vier Wegweiser des Nakasendō, Steinlaternen am Ortseingang,
  Kurvenspiegel an der Kehre, Zedernwald bis 90 m vor und hinter dem Ort.

**Gemessen (2026-09-26, AMD iGPU 0x164E, 1280 × 720, Szene gesamt mit Dorf / ohne):**

| Stufe · Blickpunkt | Draw-Calls | Dreiecke |
|---|---|---|
| Minimal · kiso | 99 (42) | 457 k (216 k) |
| Minimal · kiso-gasse | 336 (280) | 955 k (708 k) |
| Minimal · kiso-luft | 102 (38) | 444 k (184 k) |
| Minimal · kiso-tee | 241 (188) | 854 k (623 k) |
| Ultra · kiso | 148 (77) | 689 k (280 k) |
| Ultra · kiso-luft | 144 (72) | 625 k (214 k) |

Aufbau 1,2…1,9 s, 389 k Dreiecke über alle Schichten (Masse 68 k, Nahschicht ~165 k,
Oberfläche ~130 k — auf Minimal aus). Minimal an der Straße liegt unter dem Tokio-Kern
(167…231 DC / 474…673 k). `japanMap.winding()`: leer.

**Prüfprogramm** `node tools/kiso-traversal.mjs [url]`: Pass bergauf (22 m/s) und bergab durch
das Dorf, 0 Kontakte, 0 Wasser, Spur ≤ 3,0 m; Fahrbahn ±3,8 m an 1505 Proben frei; Figur die
Steingasse hinauf bis auf die Teehausterrasse; durchs Honjin-Tor, über den Hof, in die Doma
und hinauf ans Irori; Hausfront hält. `gassho-traversal`, `funaura-traversal`,
`wp5-traversal`, `test:polish`, `smoke.mjs`, `navigation-map.test`, Typecheck, Build: grün.

**Unterwegs gefunden (und behoben):** flach aufgelegte Gehwegplatten, Rinnenkanten und
Trittplatten standen auf 8 % als Sägezahn im Bild; Häuser auf Geländehöhe gehoben ergaben vor
fast jeder Tür drei Stufen (jetzt Boden = Gehweg + 0,3 m, Gelände im Haus ist unsichtbar);
Töpfe und Bänke schwebten bis 0,7 m über dem Gehweg (jetzt `street(x)`); Holzstapel lasen
sich als Ziegelmauer; Mauersteine der Treppe zeigten nach innen (Culling); Maku hing auf
Augenhöhe; Steingasse lief durch die Ecke des Soba-Hauses (nur der Messlauf hat es gezeigt);
Terrassengeländer ließ den Steg nicht hinein; Wasserrad steckte halb im Hang; Momiji wie
Luftballons; Dachsteine und Zylinder-Ziegelstirnen kosteten ~60 k Dreiecke in der Nahschicht.

**Offen:** Keine eigenen Geräusche (Wasser, Glocke). Die Hangfläche über dem Dorf zeigt das
Fels-Material des Geländes. Die Lichtflecken sind in der Abendsonne dezent — ob sie genug
tragen, ist eine Frage an dich. Ob es sich „AAA“ anfühlt, auch.

## Koedo — Kura-Handelsstädtchen: was gebaut ist und was gemessen wurde

Code: `src/world/settlements/koedo/` (Layout in Straßenkoordinaten, Bauten, Atlas, System
`KoedoTown`). Baukasten erweitert: zwei Schichten in `Parts` — `gloss` (polierter schwarzer
Kalkputz, Rauheit 0,28) und `namako` (Namako-kabe **im Shader**: Diagonalgitter aus der
Weltposition in der Wandebene, ohne UVs, ohne Textur, mit Auf-Mittelwert-Blenden gegen Moiré;
`weatheredMaterial({ namako: true })`). `LocalSurfaces.kind` / `surfaceAt` (neu, optional): eine
lokale Fläche kann `asphalt` statt `kies` melden; `RoadGround.surface` fragt das ab. Blickpunkte
`koedo`, `koedo-strasse`, `koedo-kanal`, `koedo-damm`, `koedo-brauerei`, `koedo-reis`,
`koedo-luft`. Kartenpin „Koedo 小江戸“ (12. Hauptpin).

- **Lage (gemessen 2026-09-26):** am Ende der `dorf`-Straße (Sackgasse bei (−190 | 90), 34,1 m).
  Westlich die Reisebene (24…27 m in Parzellenstufen), östlich der Hang (45…55 m), oben 170 m
  weiter die Tokioter Vorstadt. Dort endet auch die Terrace Track — beide bleiben unverändert:
  kein Rebake, keine Kollision auf Fahrbahn und Track.
- **Aufbau als eine Achse** wie Kiso-Juku: bis s 692 ist sie die Dorfstraße (Straße A,
  Ichibangai mit Autoverkehr, Gehwege, Granitrinne), dann biegt sie am Platz (R ≈ 35 m) nach
  Süden ab — **Straße B**, neu, Kopfsteinpflaster, eigene Fläche. Ihr Höhenprofil ist die
  kleinste Fläche über dem höchsten Geländepunkt des Querschnitts mit ≤ 5 % Neigung; zwischen
  z 100 und 125 liegt sie bis 3 m über einer Senke.
- **Platz und Toki no Kane:** außen an der Biegung, in der Verlängerung der Dorfstraße — wer
  hineinfährt, hat den Turm vor sich. Drei Geschosse mit umlaufenden Pultdächern, offenes
  Glockengeschoss, Pyramidendach, 18 m. Der Platz steht auf einer Ishigaki-Mauer über der Senke;
  Steinlaternen, Tafel, Ginkgo in Gold, Kiefer, Rikscha, Poller.
- **46 Häuser**: Kawagoe-Kura (schwarzer Glanzputz, eingeputzte Traufe, hoher First, Onigawara
  bis 1,5 m, Kannon-biraki-Läden, Pultdach, Kanban auf dem Pultdach oder an der Wand, Seitenfenster,
  zum Teil Brandwände), weiße Kura mit Namako (Museum), Machiya (Mushiko-mado, Bengara-Gitter,
  eingeschossige Varianten). 19 Rollen mit eigenem Kanban, Noren, Innenraumkachel und Auslage
  (Aal, Süßkartoffel, Kimono, Keramik, Weihrauch, Soba, Miso, Washi, Kaffee …). Variation von
  Anfang an: Rücksprung 0,5…1,4 m mit Vorplatz, 0,25 m vor der Flucht, ±1,3° Gier, ungleiche
  Fugen, Putz schwarz/anthrazit/braunschwarz, vier Ziegeltöne, Firsthöhe ±0,4 m.
- **Brauerei Izumiya (Hero, begehbar):** Laden-Kura mit großem Kanban, Sugidama und Komodaru;
  innen Steinboden, Probiertheke, Flaschenregale, Lampen; Hintertür in den Hof (Brunnen, Fässer,
  Kei-Truck), Brauhalle mit sechs Emailletanks, drei Holzbottichen, Reisdämpfer mit Glut,
  Lüftungsaufsatz; Reisspeicher mit Namako, 18-m-Ziegelschornstein mit Schrift. Auf einem
  Sockel, der zur Kanalseite bis 5 m hoch wird.
- **Kanal (Kurashiki):** Nord-Süd am Rand der Reisebene, **zwei Haltungen** (Spiegel 28,84 und
  26,49 m, gerechnet: höchster Geländepunkt + 0,45) mit Stufenwehr — mit einem Spiegel hätte das
  Südende auf 3 m Damm gestanden. Bruchsteinmauern mit Algenband, Granit-Deckstein, Promenade
  (1,25 m über dem Wasser) mit Pfosten und Kette, Westdamm mit Kiesweg, Grasböschung mit Susuki
  und zwei Treppen in die Felder. Granit-Bogenbrücke (Nakabashi), Plattenbrücke über dem Wehr,
  Anlegestelle mit schaukelndem Stakboot, elf Trauerweiden (Ruten als Stoffbahnen im Wind),
  Schütze an beiden Enden. Zehn Häuser der Kanalzeile (weiße Kura mit Namako-Sockel, -Ecken und
  -Gurt oder Yakisugi, Giebel mit Wappen, Fenster mit kleinem Dach).
- **Gassen:** Kashiya Yokochō (Süßigkeitengasse) von Straße B zum Kanal mit sechs Buden,
  Chōchin am Draht und Tor mit Schild; Wehrgasse mit Jizō. Speicher und Gärten im Hinterland.
- **Übergänge (die 100 m ringsum):** Zufahrt durch die Reisfelder mit Leitungsmasten (im Ort wie
  in Kawagoe ohne), Inari-Schrein mit sieben roten Torii, Jizō, Wegweiser („東京 12km“),
  Bushaltestelle mit Automaten, Steinlaternen und Ortsschild; Strohhaufen, Kaki. Südende:
  Hikawa-Schrein (Torii, Halle, Komainu, heiliger Baum). Osthang: moderne Häuser mit
  Faserzement, Balkonen, Kei-Cars, ein Konbini mit Parkplatz, Leitung hinauf zur Stadt — Reisfeld,
  Kanal, Kura, Beton, Tokio in einer Blickachse (`koedo-reis`).
- **Keine Figuren, keine Tiere** (Auftrag). Rauch aus Aalgrill, Dango, Brauerei, Herden.

**Gemessen (2026-09-26, AMD iGPU 0x164E, 1280 × 720, Szene gesamt mit Koedo / ohne):**

| Stufe · Blickpunkt | Draw-Calls | Dreiecke |
|---|---|---|
| Minimal · koedo (Blick zur Stadt) | 336 (288) | 869 k (679 k) |
| Minimal · koedo-strasse | 143 (95) | 676 k (510 k) |
| Minimal · koedo-kanal | 129 (92) | 639 k (517 k) |
| Minimal · koedo-luft | 307 (249) | 810 k (621 k) |
| Ultra · koedo | 626 (504) | 2171 k (1465 k) |
| Ultra · koedo-strasse | 310 (202) | 1612 k (1054 k) |
| Ultra · koedo-kanal | 288 (204) | 1478 k (1081 k) |
| Ultra · koedo-luft | 644 (461) | 2128 k (1319 k) |

Koedo selbst kostet auf Minimal +37…58 Draw-Calls und +120…190 k Dreiecke (Kiso: +57 / +240 k);
im Ort liegt Minimal unter dem Tokio-Kern (167…231 DC / 474…673 k). Der Blickpunkt `koedo`
schaut auf die Stadt — die 288 DC ohne Dorf sind Tokio. Ultra steigt um bis +800 k. Aufbau
0,74…1,9 s (kalt), 398 k Dreiecke über alle Schichten: Masse 60 k, Nahschicht 125 k,
Oberfläche 173 k (auf Minimal aus), Stoff 17 k. `japanMap.winding()`: leer.

**Prüfprogramm** `node tools/koedo-traversal.mjs [url]`: Auto von den Reisfeldern (s 450) die
Dorfstraße hinauf, über den Platz, Straße B bis vor den Schrein in 31,8 s und zurück in 34,9 s,
0 Kontakte, 0 Wasser, Spur ≤ 2,9 m; Fahrbahn an 1415 Proben frei, **Terrace Track im Ort an 219
Proben frei**; Figur durch den Brauereiladen, den Hof und in die Brauhalle zwischen die Tanks;
die Kashiya-Gasse hinunter, über die Bogenbrücke auf den Damm; die Wehrgasse hinunter und über
die Plattenbrücke; auf den Turmplatz; Kura-Front hält. `kiso-`, `gassho-`, `funaura-`,
`wp5-traversal` (gegen 5181, das Skript kennt nur 5180), `test:polish`, `smoke.mjs` („Konsole
sauber“), `navigation-map.test` (12 Hauptpins), Typecheck, Build: grün.

**Unterwegs gefunden (und behoben):** Die erste Biegung (R 23 m) trug das Auto bei 50 km/h auf
„Kies“-Haftung in die Poller am Platz — Kurve geweitet, Poller zurückgesetzt, und die Pflaster-
flächen melden jetzt Asphalt. Der Turm stand verkehrt herum (Tür von der Dorfstraße weg; erst der
Prüfweg lief hinter ihn). Zwischen Brauereiladen und Hof lag ein 0,5-m-Spalt im Boden (die Figur
fiel hindurch). Die Platzmauer hatte die Außenseite vertauscht (Steine nach innen — die Culling-
Falle aus Kiso). Die Laden-Innenwände trugen den Glanzputz auch innen (schwarzer Raum). Weiden-
ruten als 0,34 m breite Bahnen lasen sich als Klebestreifen, die Kronen als Schirme; Susuki als
Pylonen; Lampions als leuchtende Klötze; Laternengläser blendeten im Bloom; die Grasböschung des
Damms war eine dunkle Wand; Gemüsebeete schwebten als Kasten über dem Gelände; Streu-Bäume standen
mitten auf der Kashiya-Gasse (Freihaltung deckte das Hinterland nicht); eine freistehende
Kura-Seite am Platz war eine leere schwarze Fläche von 9 × 6 m.

**Offen:** Das Ende der Terrace Track liegt seit jeher ~0,4 m über dem Ende der Dorfstraße
(gemessen 34,59 gegen 34,18 m) — das Auto hüpft dort; die Track ist nicht angefasst, und ihr
rotbraunes Band läuft unverändert durch den Westteil des Ortes. Die Straße B liegt über der
Senke bei z 100…125 bis 3 m hoch; von unten (Hinterhöfe) sieht man ihre Stützmauern. Namako nur
diagonal (die quadratische Kurashiki-Variante fehlt). Das Stakboot liegt nur vor Anker, der Kanal
hat keine Geräusche, die Kaki am Ortseingang (aus dem Gassho-Baukasten) lesen sich aus der Nähe
etwas wie Ballons. Ob es sich „AAA“ anfühlt: die Frage an dich.

---

# Plan (Entwurf 2026-09-25)

Referenzen: `C:\Users\Leandro\Downloads\towns\<dorf>\` (eigene Bilder) und
`…\<dorf>\web\` (Wikimedia Commons, Lizenz je Bild in `web/_manifest.json`).
Wie bei Tokyo: Vorlagen, keine Assets — nichts davon wird ins Projekt kopiert.
Übersicht mit Karte: `…\towns\_plan\ueberblick.jpg`.

## Warum umsortiert wurde

Die ersten Bilder überschnitten sich: Magome, Narai und Takayama sind **dieselbe**
Bauweise (dunkles Edo-Holz, Nakasendo/Hida), Gassho stand in zwei Ordnern,
Kurashiki (Kanal-Handelsstadt) lag beim Fischerdorf, zwei Bilder zeigen Tokio
(Wohnhang, modernes Kleinhaus). Neue Regel: **jedes Dorf hat eine eigene
Silhouette, eine eigene Materialpalette und einen eigenen Boden** — man muss es
aus 300 m am Dachumriss erkennen.

| Ordner | Vorbild | erkennbar an |
|---|---|---|
| Fischerdorf | Ine no Funaya (Kyoto) + Tomonoura + Gyokō | Bootshäuser mit Bootsgarage auf Wasserhöhe, Giebel zum Wasser |
| Farmingdorf | Shirakawa-gō / Ainokura, Miyama | steile Gassho-Strohdreiecke vor dem Schneegebirge |
| Bergdorf | Tsumago / Magome / Narai (Kiso-Tal, Nakasendo) | dunkles Zedernholz, vorkragendes OG, Steinstraße am Hang |
| Dorf | Kawagoe „Koedo" + Kurashiki Bikan | weiß-schwarze Kura, Namako-Gitter, Kanal, Glockenturm |
| `_tokyo-rand` | — | gehört zu `TokyoSuburbs`, kein Dorf |

## Die vier Orte

Koordinaten in Metern, Höhen aus `height.r16` (gemessen 2026-09-25).

### 1 · Funaura — Fischerdorf an der Flussmündung (neu, höchste Priorität)

- **Lage:** Mündung des Westflusses, x −1400…−1170, z 870…1160. Land 2…12 m,
  Flusswasser 1…6 m, Meer davor −1…−4 m. Die ganze Südküste ist ein flacher
  Sandstrand ohne Bucht (Profil alle 100 m gemessen) — die Mündung ist die
  einzige Stelle mit **ruhigem Wasser**, das Funaya überhaupt brauchen.
- **Warum nicht Tideglass:** liegt am Tokio-Rand; ein Holzdorf neben dem neuen
  Tokio beißt sich. Tideglass wird der **moderne Fischmarkt** (Beton, Kühlhaus,
  Gabelstapler) und passt dann zu Tokio. Net House + Puzzle ziehen nach Funaura.
- **Stil:** silbergrau verwitterte Zeder, Kawara-Dächer mit Giebel zum Wasser,
  Blech-Vordächer (grün/blau), Balkone mit Wäsche, Netze, orange Bojen.
  Weiße Fischerboote mit blauer Linie, Tintenfisch-Lampenketten.
- **Inhalt:** ~16 Funaya am Ostufer (Bootsbuchten offen, Boote drin), Kai aus
  Betonstein mit Gangi-Treppe, zwei Molen aus Tetrapoden mit **rotem und weißem
  Hafenlicht**, Fischhalle, Eishaus, Trockengestelle (Tintenfisch), kleiner
  Schrein am Hang, Kiefern-Schutzwald (Kuromatsu) als Rücken. ~10 Wohnhäuser
  in engen Gassen dahinter.
- **Anbindung:** neuer **Flusspfad** (Schotter, 6 m) von Mill Lane (−1130, 470)
  am Fluss entlang (~550 m) — erzählt den Fluss: Wasserfall → Bauerndorf → Meer.

### 2 · Stillwater — Bauerndorf, Gassho-Weiler (Umbau)

- **Lage:** bleibt (x −1340…−1080, z 240…520, 20…28 m), direkt vor dem
  schneebedeckten Massiv — genau das Bild von Shirakawa-gō.
- **Was stört heute:** Boote auf dem Teich, Netzgestell, Bootsrampe — das ist das
  „Fischerdorf im Reisfeld". Das wandert nach Funaura.
- **Stil:** 60°-Strohdächer (Gassho) und einige Kayabuki-Walmdächer (Miyama),
  dunkles Holz, Papierfenster, Steinsockel. Hasa-Gake-Reistrockengestelle,
  Kura-Speicher, Wassergräben, **Dreifach-Wasserrad** (Asakura) statt
  Mühlteich-Boote, Kakibäume, Bambushain.
- **Behalten:** Mühle, Schleuse, Teich (als Koi-/Bewässerungsteich), Ziegen,
  Hühner, Gemüsebeete, alle Prüfprogramme aus WP5.

### 3 · Kiso-Juku — Bergdorf, Poststation am Pass (neu)

- **Lage:** am `toge` zwischen s ≈ 1510 und 1910 m, (−1260, −795) → (−1381, −1174),
  115…148 m, 8,3 % Steigung. Talseite (West) liegt fast auf Straßenhöhe, Hangseite
  steigt 12…47 m auf 30…60 m — ideal für Terrassen mit Ishigaki-Mauern.
  Weit weg vom Flusskonflikt bei s ≈ 1200 (Fluss 29 m über der Straße, TODO.md).
- **Prinzip:** der Pass führt **durch** das Dorf (Narai-Modell) — ein Fahrmoment
  wie in Forza, die Rennlinie bleibt unverändert. Dazu eine steile Steingasse
  bergauf (Magome-Modell), zu Fuß, mit Stufen, Wasserrad und Aussicht.
- **Stil:** fast schwarzes Zedernholz, weiße Putzstreifen, vorkragendes
  Obergeschoss (Dashi-bari), Koshi-Gitter, Bretterdächer mit Steinen
  (Ishioki-yane), Holzschilder und Laternen, Wasserrinne am Straßenrand,
  Kōsatsu-Tafel am Ortseingang. Zedernwald ringsum.
- **Inhalt:** ~24 Häuser, Honjin (Gasthof) als Hero-Gebäude mit Innenraum,
  Teehaus am oberen Ende.

### 4 · Koedo — Kura-Handelsstädtchen (gebaut 2026-09-26, siehe oben)

- **Lage:** x −300…−90, z −110…240, Ende der Dorfstraße (−190, 90). Gelände
  steigt von 24 m (Reisfeldkante) auf 48 m (Osthang) — der Übergang
  Reisfeld → Tokio, wie Kawagoe vor Tokio. Keine Hauptreisfelder betroffen,
  Tokio-Lots beginnen erst bei x ≈ −7.
- **Stil:** schwarzer Lehmputz und weißer Kalkputz, schwere Kawara-Dächer mit
  Onigawara, **Namako-kabe** (weißes Diagonalgitter auf grauen Fliesen), Noren,
  Kanban. Steingefasster Kanal mit Trauerweiden am Fuß, **Glockenturm
  (Toki no Kane)** oben am Hang als Fernmarke.
- **Inhalt:** ~22 Kura/Machiya, Kanal mit zwei Steinbrücken und Stakboot,
  Sake-Brauerei (Sugidama-Kugel) als Hero mit Innenraum.

## Gemeinsame Bauweise (ein Baukasten statt vier Einzelstücke)

- `src/world/settlements/wago/` — parametrisches Haus: Dachtyp (kirizuma,
  irimoya, gassho, ishioki, kura), Wandmodul (Holzgitter, Putz, Namako,
  Bretter), Vordach, Traufen-Konsolen, Regenrinnen, Noren, Laternen, Schilder.
  Detailtiefe wie Tokio v2: Klimakisten, Kabel, Rohre, Pflanzkübel — nur eben
  Holz statt Neon.
- **Ein** prozedurales Texturatlas (Muster wie `CityGraphicAtlas`), gemergte
  Geometrie je Dorf und Kachel, Kleinteile instanziert; Fernstufe = nur
  Dachumrisse. Böden als lokale Meshes (`LocalSurfaces`), **kein Rebake**
  (Erosion würfelt sonst die Karte neu, CLAUDE.md).
- Budget: Minimal bleibt ≈ gleich (Fernstufe), Ultra darf steigen.

## Reihenfolge

1. Baukasten + Funaura (größte Lücke: am Wasser ist nichts).
2. Stillwater zum Gassho-Weiler, Boote/Netze raus.
3. Kiso-Juku am Pass.
4. Koedo.
5. Flusspfad, Karte/Reiseziele/Blickpunkte, Tideglass zum Fischmarkt.

Abnahme je Dorf: Bild von Fahrerhöhe + aus der Luft, `winding()`, Durchfahrt
mit dem Fahrprüfstand, Zähler an einem festen Blickpunkt (Minimal/Ultra).
