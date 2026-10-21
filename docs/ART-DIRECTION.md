# Art Direction

## UI (D55, Richtung „Night Meet" — wartet auf das Ok des Menschen)

**Vor jeder UI- oder Look-Arbeit zuerst die Bilder in `docs/refs/` ansehen** (FH6: HUD, Karte, Ereigniskarte).
Rückmeldung des Menschen (2026-10-21): kreativ und mutig, **nicht** an den alten UI-Farben orientieren, japanisch mit
„verrückten" Elementen, Aufbau wie Forza Horizon 6. Daraus:
- **HUD wie FH6 ohne Kästen:** Schrift mit Schatten direkt auf dem Bild, Minikarte als durchsichtiger Kreis mit dünnem
  Rand, Tacho als dünner Bogen mit roter Zone und riesiger kursiver Zahl, Punkte frei oben in der Mitte.
- **Japanische Elemente** im Menü, in Meldungen und bei Erfolgen (Ticket, Hanko, Telop, Katakana, Speedlines, Blenden),
  je mit genau einer Aufgabe. Entwürfe: https://claude.ai/artifact/Um9YHs4PmbEL5AtV4s9aoS
- **Karte:** Offline-Render `JapanMap/Map/Bake Map Art` (`MapArtBaker`) in derselben Palette.

## Stimmung

**„Blaue Stunde nach Regen" in Japan.** Tiefe Sonne knapp über dem Horizont,
kühler blauer Himmel, der zum Horizont hin warm wird. Nasse Straßen spiegeln
Himmel, Laternen und Neon. Leichter Bodennebel in Senken. Warmes Kunstlicht
(Papierlaternen, Automaten, Neon) gegen kalte Umgebung — dieser Kontrast ist
das Markenzeichen. Eine feste Tageszeit, kein Tag-Nacht-Zyklus.

**Referenzbilder: `docs/refs/`** (lokal, nicht im Git; 24 Screenshots aus
Forza Horizon 6, Stand 2026-10-07). Sie zeigen **Stil und Stimmung, nicht die
Qualitätsstufe**: Tokyo bei Nacht mit Neon und Konbini, Wohnstraßen mit
Strommasten und Kabeln, Edo-Gassen in dunklem Holz, Tempel mit Kies und
Kiefern, Kirschblüten, Offroad, nasse Straßen, das HUD. Forza-Detailgrad im
Browser ist weder Ziel noch möglich.

Weitere Referenzen: `legacy/threejs/docs/astra-refs/` (Forza-Japan-Stimmung, Städtchen,
Tempel, Reisfelder, Regenfahrt — **nicht im Git**, nur auf dem Rechner, auf dem
der Prototyp entstand; bei Bedarf beim Menschen erfragen), die Screenshots in
`legacy/threejs/screenshots/` und der Probelauf „Ameagari" (siehe
[CONTEXT.md](CONTEXT.md#der-probelauf-2026-10-07)).

## Regeln

- **Licht trägt die Optik.** Erst Licht, Nebel und Postprocessing richtig,
  dann Details. Jede Szene an festen Blickpunkten auf Hoch *und* Niedrig prüfen.
- **Stilisiert-realistisch — zwischen Low-Poly und realistisch.** Urteil des
  Eigentümers (2026-10-07): *POLY Japan* (Asset Store) ist etwas zu
  Low-Poly, die anderen gesichteten Packs zu realistisch. Ziel liegt
  dazwischen: glaubwürdige Proportionen, echte Details in der Form (Fasen,
  Dachziegel-Reihen, Fensterrahmen, Kabel), einfache, saubere Materialien
  statt Fototexturen. Lieber wenige, gut gemachte Bausätze als viele Klötze.
- **Alle Assets selbst bauen** (Blender, per Skript) — siehe DECISIONS D13.
- **Abnutzung und Details** machen Nähe glaubwürdig: Kanten, Moos, Rost,
  Regenspuren, Aufkleber auf Automaten, Kabel zwischen Masten.
- **Farbe:** gedämpfte Grundtöne (Holz dunkel, Putz gebrochenes Weiß, Ziegel
  grau-blau), kräftige Akzente sparsam (Torii-Zinnober, Neon, Kirschblüte).
- **Unbeleuchtete Effekte** (Partikel, Neon, Emission) gegen einen gemessenen
  Bezugspunkt im fertigen Bild einstellen, nicht nach Gefühl — im Prototyp war
  Staub 31-mal heller als der Boden.
- **Spieltexte** Englisch, japanische Schriftzeichen nur als Dekor
  (Schilder), nie als Bedienelement.

## Licht und Atmosphäre (Phase 4, Stand 2026-10-08)

Alles steht in **`Data/Look/Look.asset`** (`LookProfile`); Menü
„JapanMap/Look/Apply" schreibt es in `Game.unity`. Nichts von Hand in der
Szene ändern — sonst überschreibt der nächste Lauf es.

| Teil | Wert | Warum |
|---|---|---|
| Sonne | Richtung 126° (aus dem Prototyp), **7°** hoch, Farbe `#ffb37a`, Stärke 1,3, Schatten 0,75 | Prototyp maß 2,2°; mit Echtzeit-Schatten bleibt das Gelände bei 7° lesbar |
| Himmel | `Skybox/Procedural`, Tönung `#8f99ad`, Dichte 0,75, Sonnenscheibe 0,015 | blau oben, warm nur zur Sonne hin; Boden-Farbe = Nebel, sonst Kante am Horizont |
| Umgebungslicht | Trilight kühl: Himmel `#66789e`, Horizont `#575e6e`, Boden `#1f1f21` | kühl gegen die warme Sonne — der Kontrast ist das Markenzeichen |
| Nebel | Exp², Dichte 0,0006, `#8f9eb5` | Berg in 2 km noch erkennbar, Ferne blau |
| Post | ACES, Belichtung +0,2, Kontrast +12, Sättigung −8, Weißabgleich −8, Bloom ab 1,0 (Clamp 6), Vignette 0,22 | Bloom ohne Clamp: Sonnenscheibe füllte das halbe Bild |
| Nässe | Asphalt-Glätte 0,58, Beton 0,5 | spiegelt den Himmel; 0,72 wirkte wie Eis |
| Boden | Gras-Ebene getönt `(0,78; 1; 0,62)` (Prototyp `GROUND_TINT`), Fels leicht kühl | sonst wirkte Wiese im Sonnenlicht rotbraun |

**Prüf-Blickpunkte:** `sando` (Laternen, Torii), `stadt-sonne` (Gegenlicht,
Glanz auf Asphalt), `kiso` (Straße, Wald), `start` (Ferne, Nebel).
**Je Stufe:** Hoch mit Schatten und Forward+ (alle Lampen werfen Licht);
Niedrig ohne Schatten, ohne HDR, Forward mit 4 Lichtern je Objekt — die
Laternen leuchten, werfen aber auf das Gelände kaum Licht (bewusster
Kompromiss fürs Handy).

## Modelle in Unity

- **Freigegebene Stile** stehen in `Data/Art/LibraryImport.asset`; nur sie
  kommen in Unity an (Menü „JapanMap/Art/Import Library"). Neuer Stil
  freigegeben → Atlas dort eintragen, Import erneut.
- Je Atlas ein URP/Lit-Material: BaseColor, MaskMap (R Metall, A Glätte),
  Emission × 2 (`emissionStrength`). Lichter aus `LIGHT_`-Markern: Punktlicht
  Stärke 1,5, keine Schatten.
- **Showroom** (`Scenes/Showroom.unity`, Menü „Build Showroom"): alle Modelle
  im Spiel-Licht, eine Reihe je Stil — hier zuerst ansehen, bevor ein Modell
  auf die Karte kommt.
- **Vegetation** (D18): Streuregeln in `Data/World/Vegetation.asset`;
  Modelle vorläufig aus dem Editor bis zur Asset-Sprint-Aufgabe 4.

## Budgets (Startwerte)

| Asset-Klasse | Dreiecke LOD0 | Textur |
|---|---|---|
| Kleines Prop (Laterne, Automat, Pfosten) | ≤ 3 000 | 512², Atlas bevorzugt |
| Mittleres Prop (Torii, Boot, Hütte) | ≤ 8 000 | 1024² |
| Gebäude-Modul | ≤ 5 000 je Modul | gemeinsamer Atlas je Baustil |
| Auto | ≤ 40 000 | 2048² |
| Baum | ≤ 6 000 LOD0, LOD2 ≤ 100 (statt Billboard, D18) | 1024² Atlas |

**Zielbereich: 40–80 % des Budgets für LOD0.** Zu sparsam ist genauso falsch
wie zu viel — im Stil-Kit lagen Automat (14 %) und Kura (22 %) weit darunter
und wirkten flach; mit 42 % bzw. 81 % wurden sie freigegeben. Die
Silhouette kostet Dreiecke, Texturen und Varianten nicht.

Jedes Prop ab mittlerer Größe braucht mindestens eine LOD-Stufe. Maßstab in
Metern, Ursprung am Boden, Vorderseite nach +Z (Unity).
