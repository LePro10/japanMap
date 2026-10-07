# Art Direction (Startfassung — wird in Phase 4 ausgebaut)

## Stimmung

**„Blaue Stunde nach Regen" in Japan.** Tiefe Sonne knapp über dem Horizont,
kühler blauer Himmel, der zum Horizont hin warm wird. Nasse Straßen spiegeln
Himmel, Laternen und Neon. Leichter Bodennebel in Senken. Warmes Kunstlicht
(Papierlaternen, Automaten, Neon) gegen kalte Umgebung — dieser Kontrast ist
das Markenzeichen. Eine feste Tageszeit, kein Tag-Nacht-Zyklus.

Referenzen: `legacy/threejs/docs/astra-refs/` (Forza-Japan-Stimmung, Städtchen,
Tempel, Reisfelder, Regenfahrt — **nicht im Git**, nur auf dem Rechner, auf dem
der Prototyp entstand; bei Bedarf beim Menschen erfragen), die Screenshots in
`legacy/threejs/screenshots/` und der Probelauf „Ameagari" (siehe
[CONTEXT.md](CONTEXT.md#der-probelauf-2026-10-07)).

## Regeln

- **Licht trägt die Optik.** Erst Licht, Nebel und Postprocessing richtig,
  dann Details. Jede Szene an festen Blickpunkten auf Hoch *und* Niedrig prüfen.
- **Stilisiert-realistisch:** glaubwürdige Proportionen und Materialien,
  saubere Formen mit Fasen, keine fotorealistischen Texturen um jeden Preis.
  Lieber wenige, gut gemachte Bausätze als viele einfache Klötze.
- **Abnutzung und Details** machen Nähe glaubwürdig: Kanten, Moos, Rost,
  Regenspuren, Aufkleber auf Automaten, Kabel zwischen Masten.
- **Farbe:** gedämpfte Grundtöne (Holz dunkel, Putz gebrochenes Weiß, Ziegel
  grau-blau), kräftige Akzente sparsam (Torii-Zinnober, Neon, Kirschblüte).
- **Unbeleuchtete Effekte** (Partikel, Neon, Emission) gegen einen gemessenen
  Bezugspunkt im fertigen Bild einstellen, nicht nach Gefühl — im Prototyp war
  Staub 31-mal heller als der Boden.
- **Spieltexte** Englisch, japanische Schriftzeichen nur als Dekor
  (Schilder), nie als Bedienelement.

## Budgets (Startwerte)

| Asset-Klasse | Dreiecke LOD0 | Textur |
|---|---|---|
| Kleines Prop (Laterne, Automat, Pfosten) | ≤ 3 000 | 512², Atlas bevorzugt |
| Mittleres Prop (Torii, Boot, Hütte) | ≤ 8 000 | 1024² |
| Gebäude-Modul | ≤ 5 000 je Modul | gemeinsamer Atlas je Baustil |
| Auto | ≤ 40 000 | 2048² |
| Baum | ≤ 6 000 + Billboard | 1024² Atlas |

Jedes Prop ab mittlerer Größe braucht mindestens eine LOD-Stufe. Maßstab in
Metern, Ursprung am Boden, Vorderseite nach +Z (Unity).
