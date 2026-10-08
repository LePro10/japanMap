# Stil-Kit (Asset-Sprint, Aufgabe 1)

Regeln für alle selbst gebauten Modelle. Stimmung und Budgets:
[docs/ART-DIRECTION.md](../docs/ART-DIRECTION.md). Code: `ArtSource/kit/`.

**Kurz:** Die Form trägt das Detail (Fasen, Stufen, Rücksprünge, Ziegelreihen
sind Geometrie). Die Textur liefert nur Farbe, leichtes Rauschen und
Abnutzung. Ein Material je Baustil. **Prüfstein:** Im Grau-Bild ohne Textur
(`*_clay.png`) muss man das Objekt erkennen.

## Maßstab und Ausrichtung

- Meter. Ursprung am Boden, in der Mitte der Grundfläche.
- Vorderseite schaut in Blender nach **−Y** (Ansicht „Vorne"). Der FBX-Export
  (`axis_forward='-Z', axis_up='Y'`, Transform angewendet) macht daraus
  **+Z in Unity** — *ungeprüft, bis die Hauptsitzung das erste FBX importiert*.
- **Gebäude** sind ganze Häuser aus einem Generator mit Feldern (Bays):
  Wandprofil einmal ums Grundrissrechteck geführt (Gehrung an den Ecken),
  Fenster/Türen als Spalten darin, Dach als Profilkörper. Kura: Feld 3,0 m,
  Tiefe 4,5 m, Traufe 5,42 m, First 7,9 m. Mehr Felder = längeres Haus.
- Glaubwürdige Maße, vorher nachschlagen. Pilot-Maße: Steinlaterne 1,96 m,
  Getränkeautomat 1,83 × 1,00 × 0,75 m, Kura 6,0 × 4,5 m (2 Felder),
  Sockel 0,5 m, Namako-Band 1,0 m, Traufüberstand 1,15 m, Dachneigung 30°.

## Fasen und Normalen

- Bevel-Modifier, **1 Segment** (2 Segmente verdoppeln die Dreiecke, gemessen
  am Automaten: 1 270 → 2 498), nur Kanten über **35°**, harte Normalen.
  Runde Teile bleiben glatt, Kanten fangen Licht.
- Fasen nur, wo man sie sieht: Ziegelreihen, Gitterstäbe, Lamellen und tiefe
  Laibungen sind ausgenommen (`K.nobevel`). Gebäude verschmelzen ebene
  Nachbarflächen vor dem Fasen (`dissolve=True`), sonst zahlt jede
  Rasterspalte eigene Fasen (Kura: 4 991 → 4 035).
- Breiten: Stein 12 mm · Blech/Kunststoff 12 mm · Gebäude 20 mm.
- LOD1 ohne Fasen, mit harten Kanten ab 35°.

## Materialien und Atlanten

- Je Baustil **ein** deckendes Material `M_<Stil>_Atlas` + das gemeinsame
  `M_Glass` (durchsichtig). Atlanten: `Props` (Schrein/Stein, Automaten),
  `Street` (Masten, Schilder, Ampeln, Zäune, Ishigaki, Bänke, Haltestelle,
  Fahrräder), `Nature` (Felsen, Laub, Erde, Töpfe — später Vegetation;
  nur deckend, Blatt-Karten mit Alpha brauchen in Aufgabe 4 ein eigenes
  Material), `Kura`, `Tokyo` (Fliesen- und ALC-Wände, Konbini, Schilder,
  Neon), `TokyoSigns`, `Koedo` + `KoedoShop`, `Kiso` + `KisoShop`, `Gassho` + `GasshoShop`, `Minato` + `MinatoShop`. Neuer Baustil = neuer Atlas.
- Atlas 1024², drei Karten passend zu URP/Lit:
  `T_<Stil>_BaseColor` (sRGB) · `T_<Stil>_MaskMap` (R Metall, G AO = 1,
  A Glätte; linear) · `T_<Stil>_Emission` (sRGB).
- Aufbau des Atlas (`kit/atlas.py`, Tabelle `LAYOUTS`):
  - **Streifen** über die volle Breite — wiederholen sich in U (Wände, Stein,
    Holz). **Maßstabsgetreu in beiden Richtungen**, nie gestreckt; V beginnt am
    Fuß des Teils (Schmutz unten). Ein Streifen ist so hoch wie die höchste
    Fläche, die ihn nutzt (Putz: 2 m). Zu hohe Flächen meldet der Bau als
    `WARN stretched strips` — dann Fläche teilen oder Streifen erhöhen.
  - **Zellen** 64 px — eine Farbe mit sanftem Schmutzverlauf, **ohne
    Rauschen** (Zellen decken ganze Flächen, Rauschen würde verschmieren).
    `map_faces` bleibt in beiden Achsen vom Zellrand weg (U 0,3–0,7,
    V 0,12–0,88): Mip-Stufen mischen Nachbarzellen, eine leuchtende
    Nachbarzelle glühte sonst als Linie am Rand mit.
  - **Rechtecke** — Grafik genau auf eine Fläche (Display, Bedienfeld,
    Seitenwerbung, Aufkleber, Typenschild, Wappen, Oni-Ziegel).
- Neue Farben/Muster: Eintrag in `LAYOUTS`, nie ein zweites Material.
- **Texel-Dichte:** Streifen 128 px/m (Namako 256 px/m wegen der feinen
  Fugen). Blickfänge dürfen mehr haben (Display ≈ 580 px/m).

## Farbpalette (sRGB)

| Rolle | Farbe | | Rolle | Farbe |
|---|---|---|---|---|
| Granit (kühl) | `#808183` | | Kalkputz weiß | `#e2dccf` |
| Moos | `#4d5a2c` | | Kalkputz schwarz (Koedo) | `#1a1a1c` |
| Holz dunkel | `#3a281c` | | Namako-Fliese / Fuge | `#2f343b` / `#ddd9cf` |
| Dachziegel (3 Töne) | `#4d5560` `#454c56` `#555d68` | | Eisen | `#26272a` |
| Automat rot / blau / weiß | `#b3141c` / `#1c4a9c` / `#e6e7e6` | | Zinnober (Torii) | `#c4381c` |
| Licht warm | `#ffb768` | | Papierlicht | `#ffd9a0` |
| Licht kühl (LED) | `#dff3ff` | | Beton | `#9b9993` |
| Ishigaki (Grau/warm/kühl) | `#84817b` `#857766` `#757b81` | | Laub / Blüte Azalee | `#3c5a2a` / `#e0577f` |
| Fels | `#7f7e7a` | | Rückstrahler | `#f08a1c` |
| Fliese beige / braun (Tokyo) | `#b9a78c` / `#6e5143` | | ALC-Platte | `#d9d8d2` |
| Konbini blau / orange (fiktiv) | `#2d8fd6` / `#f39a1e` | | Neon pink / cyan | `#ff3fa4` / `#3fe6ff` |
| Kupfer-Patina (Koedo) | `#5f8f7a` | | Bretterwand (Koedo) | `#3b2a1e` |
| Senkrechte Bretter (Kiso) | `#4a3727` | | Lehmputz (Kiso) | `#b39a74` |
| Schindeln (Kiso) | `#5f5a52` | | Dachsteine (Kiso) | `#6a6965` `#5e5850` `#525a46` |
| Stroh alt / neu / bemoost (Gassho) | `#8a7658` `#ad9160` `#6c6455` | | Gras / Reisfeld-Schlamm (Gassho) | `#55602f` `#4a4034` |
| Wellblech blau / rot / grau / Rost (Minato) | `#4f7f8c` `#8a3a2c` `#9a9d9e` `#6e3a1e` | | Boje orange / Fischkiste blau (Minato) | `#e8661a` / `#1f63b0` |

Gedämpfte Grundtöne, kräftige Farben nur als Akzent (Automat, Torii, Licht).

## Japanisch, nicht allgemein (Rückmeldung 2026-10-08)

Ein Asset muss als **japanisch** erkennbar sein, nicht nur als „Mauer" oder
„Geländer". Die Betonsteinmauer in Läuferverband wirkte europäisch → ersetzt
durch **Ishigaki** (Bruchsteinmauer: runde, flach liegende Steine, tiefe
dunkle Fugen mit Keilsteinen, Moos in Flecken, geböschte Front). Vor jedem
Asset fragen: Welche Variante gibt es *so* nur in Japan? Beispiele, die
freigegeben sind: Ishigaki, Kenninji-Bambuszaun mit Palmseil-Knoten,
Itabei-Brettzaun mit Ziegeldach, Leitplanke mit Rückstrahler (デリネーター),
Mamachari mit Korb, runde バス停-Tafel auf Betonfuß, Topfgarten (roji).
Auch Muster prüfen: Voronoi-Steine ohne Licht/Schatten sahen aus wie
Gartenplatten — Steine brauchen runde Ränder, Licht oben, Schatten unten.

## Befestigung zeigen (Rückmeldung 2026-10-08)

„Zu schlicht" hieß: Profil, Pfosten und Befestigung fehlten. Jedes gebaute
Teil zeigt, **wie es hält**: Schrauben/Muttern, Halter, Schellen, Kappen,
Fußplatten, Seilbünde, Sockel, Stoßlaschen; Bleche mit echter Stärke und
Profil (W-Profil mit Kanten), Pfosten mit Kappe. Prüfen mit einer
**Nahaufnahme** (`P.details`, unten) — die Gruppen-Vorschau ist dafür zu klein.
Weißer Lack wirkt im neutralen Licht flach; Profile im Stimmungsbild oder
in der Nahaufnahme beurteilen.

## Gebäude-Bausatz (Tokyo, ab 2026-10-08)

Vorbild für neue Baustile: `buildings/tokyo_kit.py` (Module) +
`buildings/tokyo.py` (Häuser als Daten).
- **Wandprofil** je Geschossart (`profile`): Laden (Sockel, Brüstung,
  Kämpfer, Blende), Wohnen (Deckenband, Brüstung, Fensterzone, Sturz),
  oben Attika mit Abdeckblech. Läuft einmal um den Grundriss.
- **Öffnungen** sind Daten: `op(Seite, u0, u1, Geschoss, Modul, Zeilen)`.
  Module: Fenster (Laibung, Alu-Rahmen, Schiebeflügel, Sohlbank, Gitter,
  Klimagerät), Konbini-Front, Izakaya, Rollladen, Eingang, Stahltür.
- **Teile auf Wandrahmen** `F` (u entlang der Wand, z hoch, d nach außen;
  jedes Modul funktioniert auf jeder Seite): Balkon, Laubengang,
  Stahltreppe, Klimagerät, Fallrohr, Zählerkasten, Schilder, Nobori,
  Dachtechnik (Wassertank, Treppenhaus, Billboard, Antenne).
- Wand-Streifen sind 2 m hoch (96 px/m); das Profil teilt jedes Geschoss so,
  dass keine Wandfläche höher ist (`STRIP_H`).
- **Fasen** nur an Hülle, Bändern und großen Teilen; Laibungen,
  Kleinteile, Gitter, Rohre ohne (`nb`). Die Fasen kosteten sonst 40 %.
- Schilder sind auch eigene FBX (`Tokyo_Sign_*`, Ursprung = Wandbefestigung),
  damit Phase 5 sie an jede Fassade hängen kann.
- Typisch Tokyo und Pflicht im Bausatz: Klimageräte mit Leitungskanal,
  Fallrohre, Zählerkästen, Fenstergitter, senkrechte Mieterschilder,
  Nobori, Rollladenkasten, Laubengang mit Stahltreppe, Balkon-Trennwand
  (非常の際は…), Wäschestangen, Wassertank auf dem Dach, Fliesen
  (二丁掛) und ALC-Platten statt Ziegel/Putz.

**Zwei Dichten (Rückmeldung 2026-10-08):** Der Pilot ist eine normale
Tokyo-Wohn-/Nebenstraße. Das **Zentrum** (Shinjuku/Kabukichō-Art) braucht
eine eigene, viel dichtere Stufe: 6–10 Geschosse, schmal; Schilder decken
die Fassade fast ganz (je Geschoss ein Leuchtkasten quer, 2–3 senkrechte
Schildertürme je Haus, auch seitlich), Dach-Billboards, Videowände,
Leuchtkästen an den Pfeilern, Laternenketten. Maßstab: „vor lauter
Schildern sieht man die Wand kaum".

**Schilderhaut (Zentrum, `buildings/tokyo_signs_kit.py`, Atlas `TokyoSigns`):**
eigenes Mesh je Haus (`SM_<Haus>_Signs_LOD0/1`), damit Phase 5 die Dichte
je Straße wählen kann. Teile: Querkasten je Geschoss (0,7–1,25 m, deckt
Brüstung und unteren Fensterteil), Schilderturm (1,05 m breit, 1–2
Kästen übereinander, leuchtende Vorderkante, optional Glühbirnen),
auskragender Querkasten, Neon-Wort (mit Platte oder direkt an der Wand
mit Klammern), Aufsteller auf dem Gehweg, Laternenkette, Videowand mit
Wartungssteg, Dach-Billboard auf Stahlgitterturm. 36 erfundene Läden in
fünf Gestaltungen (voll, Rahmen, dunkel mit Leuchtrand, geteilt, Mincho).
Häuser im Zentrum sind Daten + Startwert (`tokyo_center.CENTER`):
Fassadenart je Geschoss, Fensterfarben und Schilderauswahl wechseln mit
dem Startwert; `density` < 1 ergibt ruhige Nebenstraßen-Versionen.
Vorderseiten teilen sich dieselben Spaltenlinien (jede Linie schneidet
jedes Geschoss der Wandhülle; 11 → 5 Spalten sparte ~650 Dreiecke).
Vorschau der Schilder mit Emissionsstärke 1,6 statt 4 (sonst wäscht AgX
die Farben pastellig aus).

## Koedo-Bausatz (Kura-Stadt, ab 2026-10-08)

`buildings/koedo_kit.py` (Module) + `buildings/koedo.py` (Häuser als Daten,
`HOUSES`; Gassen-Versionen über `lane()`). Zwei Atlanten: `Koedo` (Bau:
schwarzer/weißer Putz 96 px/m, Bretter und Kupfer 64 px/m, Namako, Stein,
Holz 48 px/m, Wappen, Oni, Shoji) und `KoedoShop` (Ladenausstattung:
7 Innenräume, 8 Dachschilder, 4 Standschilder, 6 Noren, 4 Nobori,
2 Laternen, Bonbonglas, Bambusrollo, Menütafel, Feuereimer).
- **Zwei Hausarten:** `kura` (Steinsockel 0,45 m, optional Namako,
  Putzband, dreistufiges Putzgesims 0,40 m, schweres Dach) und `machiya`
  (Steinschwelle, Bretterwand, Holz-Geschossbalken, leichtes Dach mit
  sichtbaren Sparren). Wände je Seite und Geschoss wählbar (Kupferfront,
  Bretter unten, Putz oben).
- **Dach** (`gable_roof`): First entlang X, Ziegelreihen (rund), Ortgang-
  Ziegel, Firststapel (Kura bis 1,25 m hoch), Onigawara je Haus skaliert;
  kürzere Vordertraufe hinter einer Kupfer-Attika (`eave_front`).
- **Vordach** (`hisashi`): Ziegellagen + Rundziegel, Wandanschluss,
  Kragträger (dashi-geta, an der Wand höher) + Pfette, oder verputzt;
  Brandwände (Sodekabe) je Ende wählbar.
- **Öffnungen** (`op`): offener Laden (Pfosten, Sturz, Schwelle,
  zur Seite geschobene Glastüren, Trittstein), geschlossener Laden
  (Brandschutztüren aus Putz / Bretter), Senbon-Gitter vor Shoji,
  Shōwa-Glasfront; oben Kura-Fenster mit dicken Türen (offen/zu),
  Mushiko-Schlitze, Shoji hinter Holzgeländer, Holz-Schiebefenster.
- **Ladenausstattung** als eigenes Mesh `SM_<Haus>_Shop_LOD0/1`:
  Innenraum, Dachschild auf Pfosten im Vordach, Wandschild, Noren,
  Nobori, Laternen, Zedernkugel, Warenstufen (Gläser, Kisten, Töpfe),
  Sakefässer, Bank mit rotem Filz + Schirm, Feuereimer, Bambusrollo,
  Topfpflanzen, Menütafel, Wandlampe.
- **Rückseite** automatisch: Tür + kleines Vordach + Fallrohr (Machiya
  zusätzlich ein Fenster unten) — eine leere Rückseite war ein Fehler.
- **Zwei Dichten:** Hauptstraße (alles) und Gasse (`lane()`: Läden zu,
  keine Fahnen/Stände, Pflanzen davor).
- **Bilder:** `koedo.shots(ordner)` — Straße auf Augenhöhe, von oben,
  Gasse, Grau-Test, jedes Haus vorne/hinten/grau, Nahaufnahmen;
  Kamera `P.shot(...)` (auch für andere Stile).

## Kiso-Bausatz (Poststadt an der Nakasendō, ab 2026-10-08)

`buildings/kiso_kit.py` (Module) + `buildings/kiso.py` (Häuser als Daten,
`HOUSES`; Gassen-Versionen über `lane()`; Straßenstücke `PIECES`). Zwei
Atlanten: `Kiso` (Bau: senkrechte Bretter `WOOD_TATE`, Stülpschalung,
Lehmputz, Ishigaki, Erdstraße, Steinpflaster je 64 px/m, Schindeln 96 px/m,
Holz 48 px/m, Gitterbild für LOD1, drei Dachstein-Töne, Wasser) und
`KisoShop` (6 Innenräume, 7 Schilder, 4 Standschilder, 5 Noren,
4 Wandlaternen, 2 Chōchin, 2 Nobori, Strohsandalen, Holzstirnseiten,
Korbgeflecht, Menütafel).
- **Zwei Wandzüge je Haus:** Erdgeschoss (Steinsockel, Schwelle, Sturz)
  und Obergeschoss (Stirnbrett über den Balkenköpfen, Pfette) — das obere
  um `P` nach vorn versetzt (**dashi-bari**: Untersicht aus Brettern,
  Balkenköpfe mit Eisenband und Holznagel). `P = 0` ergibt Häuser mit
  Schindel-Vordach (`board_hisashi`, Kragarme, Pfette, Steinreihe).
- **Dach:** `board_roof` = flaches Schindeldach (Neigung 0,30–0,32) mit
  Schindellagen, Untersicht aus Brettern, Sparren, Windbrettern,
  Firstabdeckung + Firstbalken, Pfettenköpfe am Giebel, Kragarme
  (udegi) mit Pfette (dashi-geta) unter der tiefen Traufe, Latten mit
  Reihen von Steinen (vorne 2–3, hinten 1 einfachere Reihe). Oder
  `tile_roof` (leichtes Koedo-Ziegeldach, mittig verschoben).
- **Udatsu:** `sode_udatsu` an einem oder beiden Enden des Obergeschosses
  (weißer Putz, dunkle Pfosten, kleines Ziegeldach).
- **Öffnungen:** `dejoshi` (vorstehendes Gitter auf Brettsockel, Shoji
  dahinter), `koshi_u` (Gitterfenster oben), `agedo` (offener Laden mit
  hochgeklappten Läden an Eisenstangen + Klappbank), dazu aus Koedo
  offener Laden, Bretterläden, Senbon-Gitter, Shoji hinter Geländer.
- **Holzgerüst sichtbar:** Pfosten an den Ecken und zwischen Öffnungen,
  an den Lehmputz-Seiten Pfosten (alle 2,7 m) + Nuki-Riegel; Giebel mit
  Firstsäule und Riegel.
- **Hang:** `plinth` = Ishigaki-Sockel (geböscht, Decksteine, gepflasterte
  Terrasse, Steintreppe längs der Front mit Wange); Haus und Ausstattung
  stehen auf `H`.
- **Ausstattung** (`_Shop`-Mesh): Wandlaterne (kake-andon), Schild an
  Eisenstangen, Noren, Chōchin, Zedernkugel, Fässer, Waren auf Stufen
  (Lackschalen, Spanschachteln, Körbe), Strohsandalen, Tragekörbe,
  Brennholzstapel mit Brettdach und Steinen, Bänke, Feuereimer, Pflanzen.
- **Straße** (eigene FBX): `Street_8m` (Erdstraße in ≤ 2-m-Bändern,
  Wasserrinne mit Granit-Bordsteinen und Steinplatten-Brücken,
  Pflasterstreifen, Schürze bis −0,4 m), `Street_Steps_8m`
  (Steinstufen +1,44 m, Rinne, Ishigaki-Seiten), `Trough` (Wassertrog mit
  Bambusrohr), `Waterwheel` (ein Mesh, dreht sich nicht).
- **Bilder:** `kiso.shots(ordner)`; für die Rinne senkt es den
  Bühnenboden auf −0,45 und legt eine Bodenplatte mit Loch um die Straße.
- **Budget gemessen** (Kaede, Teile einzeln): Erdgeschoss-Öffnungen 1 134,
  Steine + Latten 950, Gitterfenster oben 682, Holzgerüst 288,
  Vorkragung 152, Udatsu 146 Dreiecke.

## Gassho-Bausatz (Strohdachdorf Shirakawa-gō/Gokayama, ab 2026-10-08)

`buildings/gassho_kit.py` (Module) + `buildings/gassho.py` (Häuser als Daten,
`HOUSES`; ruhige Feld-Versionen über `field()`; kleine Bauten `SMALL`;
Dorfstücke `PIECES`). Atlanten `Gassho` (Stroh 3 Töne in 2-m-Lagen 48 px/m,
Schnittkante, Unterseite, Wände 1,5 m 64 px/m, Weg, Gras, Ishigaki,
Reisfeld, Strohbündel-Bild) und `GasshoShop` (3 Innenräume, 4 Schilder,
3 Standschilder, 3 Noren, 2 Wandlaternen, Menü, Schild 放水銃, Schreintafel).
- **Lokaler Rahmen:** First entlang X, Giebel bei ±L/2, Seiten S/E/N/W;
  `front` dreht das fertige Mesh, damit Giebel (`E`) oder Langseite (`S`)
  zur Straße (−Y) zeigt.
- **Strohdach** (`thatch_roof`): zwei Schalen, **Kern + 0,35-m-Haut**, damit
  Traufe und Ortgang als gestufte Lagen sichtbar sind. ~60° steil, an der
  Traufe ein Knick (flacher, 0,9 m dicke Schnittkante). Die Haut liegt in
  **Lagen ≤ 2 m** den Hang hinab, jede 4 cm über der nächsten; Stroh-UVs
  laufen mit `map_axes` am Hang entlang (nie gestreckt, Textur kachelt in U
  und V). Tonflecken alt/neu/bemoost je Lage und Abschnitt
  (`tone_patches`, Nordseite älter). First-Bündel mit gekreuzten Stangen,
  Druckstangen an Ortgang und Traufe mit Seilbünden, äußeres Sparrenpaar
  (sasu) und Pfettenköpfe am Giebel.
- **Giebel** (`gable`): Bänder ≤ 1,5 m, Geschossbalken je Dachgeschoss
  (alle 1,85 m), Fensterreihen (`wins(...)`: Shoji hell/dunkel, Bretter,
  Gitter, Lüftung, optional Brett-Haube); Fenster, die nicht unter das Dach
  passen, fallen weg.
- **Erdgeschoss:** Kiso-`Sweep` mit 1,5-m-Streifen, Wandpfette ragt ins
  Stroh (sonst Schlitz unter der Traufe). Module: `shoji` (Schiebe-Shoji mit
  Brett unten), `mado` (Shoji hinter 5–6 Holzstäben), `amado`
  (Sturmläden ≤ 0,9 m, Mittelriegel, Kasten), dazu Kiso/Koedo-Module.
  **Engawa** (Bretter, Pfosten auf Steinen, Trittstein), **Schneebretter**
  (yuki-gakoi, Felder teils offen), Vordach Brett oder Stroh (`pent`),
  Traufkies mit Steinen.
- **Kleine Bauten:** Speicher (itakura, auf Steinen, Tür mit Schloss,
  Stufen), offener Holzschuppen, Feuerhütte des Löschwerfers (Mini-Gassho,
  rote Tür, Standrohr), Bergschrein (hokora) auf Ishigaki-Sockel.
- **Ausstattung:** Kakis (hoshigaki) bzw. Rettiche an Schnüren unter der
  Traufe, Holzleiter am Dach, Strohgarben, Brennholz, Zuber, Washi-Trockenbretter.
- **Dorfstücke:** `Road_8m` (Kiesweg, Steinrinne mit Ishigaki-Wänden,
  Steinplatten-Brücke), `Paddy_8m` (Reisfeld-Rand mit Grasdamm, Stoppeln),
  `Hasa_6m` (Trockengestell mit Strohbündeln).
- **Budget gemessen** (Honke, Teile einzeln): Dach 1 916, Giebelfenster 616,
  Fenster unten 368, Sturmläden 278, Traufsteine 224. Fasen an den
  Sockel-/Schwellen-/Pfettenkanten kosteten **~900** (die Spaltenlinien der
  Öffnungen zerschneiden jede Kante) → diese Kanten ohne Fase.
- **Bilder:** `gassho.shots(ordner)`; Bodenplatte mit Löchern über Rinne
  und Reisfeld (die liegen unter 0).

## Minato-Bausatz (Fischerdorf/Hafen, Ine no Funaya / Sanriku / Noto, ab 2026-10-08)

`buildings/minato_kit.py` (Module) + `buildings/minato.py` (Häuser als Daten,
`HOUSES`; Bucht-Versionen über `quiet()`; Fischhalle `_hall`; Hafenstücke
`PIECES`, Boote `BOATS`, Kleinkram-Sets `GEAR`). Atlanten `Minato`
(Wellblech rostig/blau/rot/grau in 1,8-m-Lagen 48 px/m, Bretter senkrecht/
waagrecht, Kaimauer Beton/Stein mit Algen- und Seepockenband an der
Wasserlinie, Kai-Pflaster, Steg-Planken, Vorhang hinter Alu-Fenstern hell/
dunkel) und `MinatoShop` (4 Innenräume, 4 Schilder, Standschilder, Noren,
Nobori, Menü, Fischkiste, Styroporbox, Himono, Tintenfisch, 2 Netze,
2 Bootsnamen; Zellen für Bojen, Kisten, Rumpf, Gummi).
- **Wellblech als Geometrie** (`corr`): Profil (Welle, Faltblech, Rolltor-
  Lamelle) an seinen Knoten abgetastet, Kamm nach außen; Dreieckswelle mit
  weichen Normalen wirkt rund. UVs laufen entlang des Blechs (Rost läuft die
  Rillen hinab). Wände in Lagen ≤ 1,8 m, jede 6 cm über der unteren und
  12 mm weiter außen; Dächer in Lagen von der Traufe hoch. Abstand: Wand
  0,27 m, Dach 0,34 m, Halle 0,36 m, Faltblech 0,5 m (eine Lage, Zelle).
  LOD1 = glatte Fläche.
- **Wände mit Öffnungen** (`wall` + `cut`): Rechtecke um die Öffnungen,
  keine Profil-Sweeps; die Bleche enden an den Einfassungen (`trim`).
  Eckbleche (`corner_trims`), Betonsockel mit Lüftungsgittern (`plinth`),
  Gurtblech zwischen den Geschossen (`band`).
- **Öffnungen:** Alu-Schiebefenster (Vorhang, Gitter men-goshi, Haube),
  Alu-Haustür mit Vordach und Stufe, Holz-Glasschiebetüren, Rolltor
  (Lamellen, Führungsschienen, Kasten, `open` = hochgezogen), offener
  Laden, Bretterladen, Lüftung.
- **Dächer:** Ziegel = `KK.gable_roof` (um Traufe/4 gesenkt, damit die
  Untersicht auf der Wand sitzt); Blech = `tin_roof` (Platte mit Untersicht,
  Lagen, Firstblech, Ortgangbleche, Rinnen). Giebelwand folgt der
  Dachunterseite (`gable_top`/`tile_top`). Anbau `lean_to` (Pfetten, Pfosten
  auf Betonfüßen).
- **Japanisch, Pflicht im Bausatz:** Gasflaschen (LP) auf Sockel mit Kette,
  Kerosintank auf Beinen + Boiler, Fenstergitter, Hauben über Fenstern,
  Balkon mit Wäschestange, Yagi-Antenne, Fallrohre, Netze/Bojen/Krabbenkörbe,
  Himono-Gestelle, Tintenfisch-Leinen, weiße Gummistiefel, Styroporboxen,
  Reifen als Fender.
- **Funaya:** Giebel zum Meer, Bootsbucht = Steinfundamente ins Meer,
  Slip aus Beton bis unter Wasser, Innenwände + Decke + Rückwand (Bild
  über die Ausstattung), Boot auf der Slip in der Ausstattung.
- **Wasser:** Kai-Oberkante 0, Meer `WATER_Z = −1,1`; Kaimauer-Streifen
  beginnen 0,6 m unter Wasser (Algenband an der richtigen Stelle).
- **Bilder:** `minato.shots(ordner)` stellt Szenen aus **verlinkten
  Kopien** auf (ein Haus darf mehrmals stehen, nichts wird verschoben) und
  löscht sie danach; Bühnenboden auf −3 m, Land als eigene Platte.

## Abnutzung

- **Schmutz unten:** jede Fläche wird zum Boden hin dunkler (Spritzwasser).
- **Regenspuren:** dünne, unterbrochene Läufe (wenige cm breit, 10–60 cm
  lang) auf Putz und Stein — keine breiten Schlieren. Lack bleibt sauber;
  Abnutzung dort über Form und Aufkleber.
- **Moos:** nur auf nach oben zeigenden Flächen (Dach, Absätze).
- Nässe kommt **nicht** in die Textur — das macht später ein Shader-Effekt
  in Unity für alle Flächen gleich.

## Licht

- Leuchtende Flächen über die Emission-Karte (im Atlas).
- Wo ein echtes Licht hingehört, setzt der Generator ein Empty
  `LIGHT_<Name>` mit Eigenschaften `color`, `unity_range`, `unity_intensity`.
  Die Vorschau macht daraus eine Punktlampe, Unity später eine Light.
- Helligkeit der Emission in Unity gegen einen gemessenen Bezugspunkt
  einstellen (ART-DIRECTION.md), nicht nach Gefühl.

## Grafiken (Schilder, Tafeln, Banner)

Flache Grafiken mit Schrift entstehen als SVG in `kit/graphics.mjs` und
werden mit dem Headless-Chrome der Tools gerendert (`node
ArtSource/kit/graphics.mjs` → `kit/gfx/*.png`, committet; japanische Schrift
über Hiragino). Nur den eigenen Stil rendern (`node ArtSource/kit/graphics.mjs KI_`):
ein Gesamtlauf ändert die Schriftkanten aller anderen PNG bitweise. Der Atlas lädt sie als Rechteck (`png(...)`). Schildplatten
folgen dem Umriss der Grafik, die UVs laufen über dieselben Pixelkoordinaten.
**Keine echten Firmen- oder Betreibernamen** — Texte sind fiktiv oder
allgemein (止まれ, 稲荷神社, „Sakura-dōri").

## Runde Teile und Rohre

- Masten und Säulen: `K.map_cyl` (Höhe läuft entlang U, Umfang einmal über
  V). Die Naht liegt hinten (+Y) **auf einer Kante** — Lathe mit Phase 0 und
  Seitenzahl durch 4 teilbar, sonst ragt eine Fläche aus dem Atlasfeld.
- Rohre, Kabel, Ausleger: `K.tube_path(..., reg=Streifen)` mappt entlang der
  Rohrlänge.
- Bretter, Latten, Pfosten: eine Fläche je Brett (eigene Maserung);
  `rotate=True` für senkrechte Maserung; `s_offset` versetzt Muster (Knoten).

## Organische Formen (Felsen, Büsche)

`kit/organic.py`: `lump()` = Ikosphäre mit Rauschen, optional planare
Bruchflächen (Fels), plane Oberseite (Hecke, Trittstein), Boden-Klemme;
`shrub()` = Hauptballen + kleinere Ballen. LOD0 und LOD1 aus demselben Seed
haben dieselbe Silhouette. **Achtung Blender 5:** `create_icosphere`
zählt das Ikosaeder als Stufe 1 → 2 = 80, 3 = 320, 4 = 1 280 Dreiecke.
UVs mit `K.map_box` (Projektion entlang der Hauptachse, Nachbarflächen
nahtlos) statt `map_faces` (Tangente je Fläche → Nähte überall).

## LOD, Collider, Namen

- LOD-Stufen baut der **Generator** mit weniger Details (keine Fasen, weniger
  Segmente, kleine Teile weg) — kein Decimate. Ziel LOD1 ≈ 30–50 %.
- Ein Mesh je LOD: `SM_<Name>_LOD0`, `SM_<Name>_LOD1` (Unity baut daraus
  die LOD Group). Collider: `COL_<Name>` (einfache Box). Licht: `LIGHT_<Name>`.
- Varianten (Farbe, Fenster) sind eigene FBX: `SM_<Name>_<Variante>.fbx`.
- Weitere Marker: `CABLE_<HV|LV|TEL>_<i>` (Kabel-Anschlusspunkte am Mast),
  `LENS_<Car|Ped>_<Farbe>` (eigenes Mesh je Ampellicht — Unity schaltet es
  ein/aus, dahinter liegt eine unbeleuchtete Linse).
- `exports/manifest.json` (schreibt `build.run`): je FBX die LOD-Meshes,
  Dreiecke, Materialien, Collider, Lichter, schaltbaren Teile und
  Anschlusspunkte — der Unity-Import liest das, statt Namen zu raten.
- Lange Module (Leitplanke) sind entlang X in Stücke geteilt, damit Unity
  sie entlang einer Spline biegen kann. Linke Enden = gespiegelte rechte
  (Scale X −1).

## Arbeitsablauf

In Blender (über den Blender-MCP):

```python
import sys; sys.path.insert(0, '/Users/leandro/Documents/japanMap/ArtSource')
import importlib, build; importlib.reload(build)
build.run(['stone_lantern'])   # oder build.run() für alle
```

Baut, zählt Dreiecke, meldet die Maße (B × T × H — ein verirrtes Teil fällt
sofort auf), exportiert nach `exports/<klasse>/`, schreibt Atlanten
nach `exports/textures/` und Vorschauen nach `previews/`. Ein Asset-Modul
braucht `KLASS`, `NAME`, `build()`; optional `preview()`.

Ein Stil-Bausatz (`buildings/<stil>_kit.py`) wird bei jedem `build.run`
mit neu geladen. Nahaufnahme je Objekt (Profile, Befestigung):
`from kit import preview as P; P.details([obj, …], 'name', direction, mood=…, out_dir=…)`.

Vorschau-Bühne: Stimmung (Blaue Stunde; warmes Horizontglühen nur zur
Sonne hin — ein Rundum-Pfirsichhorizont färbte jede Wand warm), neutral,
und **Grau ohne Textur** (`*_clay.png`) für den Silhouetten-Test.

**Eingebaute Prüfungen:** Abbruch, wenn ein Material-Slot unbenutzt bleibt;
Warnung bei gestreckten Streifen (mit Ort); Dreiecke werden auch für
ausgeblendete Objekte mit Fasen gezählt; Rückseiten werden in der Vorschau
ausgeblendet wie in Unity (verdrehte Flächen sieht man als Loch); konkave
n-Ecke werden vor dem Export trianguliert; Atlas-Bereiche dürfen sich nicht
überlappen; das Manifest wirft Einträge ohne FBX-Datei hinaus
(umbenannte/entfernte Assets).
