# Art Direction (Startfassung — wird in Phase 4 ausgebaut)

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

## Budgets (Startwerte)

| Asset-Klasse | Dreiecke LOD0 | Textur |
|---|---|---|
| Kleines Prop (Laterne, Automat, Pfosten) | ≤ 3 000 | 512², Atlas bevorzugt |
| Mittleres Prop (Torii, Boot, Hütte) | ≤ 8 000 | 1024² |
| Gebäude-Modul | ≤ 5 000 je Modul | gemeinsamer Atlas je Baustil |
| Auto | ≤ 40 000 | 2048² |
| Baum | ≤ 6 000 + Billboard | 1024² Atlas |

**Zielbereich: 40–80 % des Budgets für LOD0.** Zu sparsam ist genauso falsch
wie zu viel — im Stil-Kit lagen Automat (14 %) und Kura (22 %) weit darunter
und wirkten flach; mit 42 % bzw. 81 % wurden sie freigegeben. Die
Silhouette kostet Dreiecke, Texturen und Varianten nicht.

Jedes Prop ab mittlerer Größe braucht mindestens eine LOD-Stufe. Maßstab in
Metern, Ursprung am Boden, Vorderseite nach +Z (Unity).
