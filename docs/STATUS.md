# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-09 · **Phase:** 6 abgeschlossen, **alle fertigen Assets eingebaut** (D25) — deine Abnahme offen · **Phase 7 (Spielinhalt) ist als Nächstes dran**

Phase 2 ✅ · Phase 3 ✅ freigegeben · Phase 4 ✅ (Optik-Abnahme offen) · Phase 5 ✅ (Abnahme offen).

## Phase 6 — Zu Fuß und Leben ✅ (D22–D24)

Zu Fuß (F ein/aus, H Auto rufen, C rutschen), Fußgänger auf NavMesh, Verkehr in Tokyo, Zerstörbares (Pfosten, Automaten, Zäune,
Hütten, Bäume), begehbare Läden, Arbeiter/Tiere — alles mit Stellvertreter-Figuren. **Abnahme gemessen:** Fußgänger 10 min, 45 987
Stichproben, **0 auf der Fahrbahn**; Zerstörung Bruch ≤ 1,05 ms, Physik ≤ 0,36 ms (Budget 2 ms). Tests EditMode 63/63, PlayMode
159/163 (4 auf Abruf). Bilder `Captures/p6-*`, Blickpunkte `Captures/p6-gate/`.

## Assets eingebaut (D25)

5b, 5c, Flora, Scatter: Tokyo-Türme (40–150 m) + Kino/Hotel/Izakaya/Fertighäuser, Sakura Autohaus + Werkstatt, Koedo Brauerei,
Funaura Kei-Trucks, **der ganze Wald aus echten Bäumen** (Sugi, Kiefer, Momiji, Kirsche, Bambus, Sträucher, Weide, Kaki),
Leitpfosten, Tetrapoden, Gewächshäuser, Mauern, Nobori, Jizō, Friedhof. Vergleich `Captures/5c-vergleich.png`, `Captures/5c-after/`.
Bench (`Captures/bench-p6-assets-*`): Niedrig ≤ 380 DC / ≤ 576 k ✓; Hoch wie vor dem Einbau (2,7–7 M, sakura-hof 1 524 DC).
Web **53,9 MB** (+4,6), Browser Niedrig 240 / Hoch 65 fps (Blender lief).

## Phase 7 — Spielinhalt (als Nächstes, PLAN.md)

- [ ] 1. Drift-Wertung (Kette, Multiplikator bis ×5, Driftzonen ×2)
- [ ] 2. Zonen/Regionen (8), „Region erkundet" + Belohnung
- [ ] 3. Entdeckungen (24) statt anonymer Pickups, Easter Eggs
- [ ] 4. Schanzen und Stunts (Fundament statt Geländeauflage), Stunt-Modus
- [ ] 5. Rennen mit KI-Gegnern (Coast Loop, Tōge, Neon Circuit, Ring, Drift Run); Abnahme: KI gegen KI ohne Hängenbleiben

## Offen / Gefunden

- **Kartenpunkte:** Kuppen-Knicke/Höhenstufen alter Straßen, Stadtplatte ohne Böschung, treppige Reisfeldränder; Viadukt-Brüstungsmauer (Modell).
- **Sakura:** `commons-drive` beginnt als Asphaltkante in der Schale (Startbild) — nicht behoben (Straßen-Import, nicht Phase 6);
  Fußgänger und Verkehr meiden sie bereits (NavMesh schneidet Fahrbahnen aus, Verkehr schließt sie aus).
- **Tokyo-Kollider** bleiben GameObjects (das NavMesh-Backen braucht sie; Game.unity 10,3 MB, durch Phase 6 nicht gewachsen).
- **Browser-fps** nur mit laufendem Blender gemessen → bei ruhigem Rechner `node Tools/smoke.mjs --gpu` wiederholen.
- **Hoch kostet viel:** Wald-Schatten, lodBias 2, Reisgras, Figuren in allen Kaskaden; sakura-hof 1 524 DC → Phase 10. **Download 53,9 MB**
  (Desktop-Ziel 50, Handy 20) → Phase 10 (Addressables). Markthalle (Tokyo_Market) braucht einen eigenen Ort (Phase 7).
- Fahrtests im Batchmodus: Ursache wohl behoben (Tastatur ohne Fokus), **im Batchmodus ungeprüft**.
- Funaura: die sechs Angler an den Molenfeuern fehlen (Plätze hängen am Lichter-Layout des Prototyps). Stillwater-Hafen (Tideglass) gibt es noch nicht.

### Für die Asset-Sitzung (Lagen stehen in den Daten, Import genügt)

- **Spielfigur:** 1,72 m, Fahrer:in späte 80er, ≤ 6 k Dreiecke, Ursprung zwischen den Füßen, +Z vorn; Stehen, Gehen, Rennen, Sprung, Rutschen.
- **Leute/Tiere:** 4–6 Passanten, Fischer, Bauer, sitzende Pose; Katze 0,45 m, Ziege 1 m, Huhn 0,35 m; ≤ 3 k, Skinned.
- **Verkehrsautos:** 3–4 Stadtautos (Kei, Limousine, Taxi, Lieferwagen) ≤ 5 k, 4,1 × 1,7 m, Räder eigene Objekte.
- **Vorzerlegt:** Laterne (3 Teile), Automat, Holzgestell/Zaun, Schuppen — je Teil ≤ 1 k. **Ladeninnere:** Diner, Mart (Regale, Waren, Kasse).
- Sakura: leichte Ausstellungsautos (≤ 8 k). Koedo: 2 Kanalbrücken. Needle: Tribüne, Boxen, Start-Ziel-Brücke.
- **Nacharbeit:** `Tokyo_Tower_Mixed_Tile_70` Fernstufe 306 von 564 Dreiecken (54 %, Stil-Kit ≤ 35 %; im Test als Ausnahme vermerkt).
  Vorzerlegter **Baum** (Stamm + Krone in 3–4 Teilen) — jetzt fliegen grüne Kästen.

## Für dich (Mensch)

1. **Neue Assets ansehen:** Sakura mit Autohaus und Skyline, Tokyo mit Türmen, Wald mit echten Bäumen (`Captures/5c-after/`).
   Gefällt dir der Wald? (Er schaltet früh auf die Fernform, damit es bezahlbar bleibt — achte im Spiel auf „ploppende“ Bäume.)
2. **Abnahme Phase 6 (~15 Min.):** `Boot` → ▶ Play. Du stehst **zu Fuß** in Sakura, das Auto 4 m vor dir.
   - **WASD** laufen, **Shift** rennen, **Leertaste** springen, **C** beim Rennen = rutschen. **Mausklick** fängt die Maus → umschauen
     (Esc gibt sie frei; alternativ rechte Maustaste halten). Mausrad = Abstand.
   - **F** am Auto: einsteigen. Fahren, anhalten, **F**: aussteigen (über 5 km/h geht es absichtlich nicht).
   - Weglaufen, **H**: das Auto kommt zu dir. Fühlt sich das Laufen/Rutschen gut an? Ist die Kamera angenehm?
   - Nach Norden/Westen nach **Tokyo**: Fußgänger auf den Gehwegen, ein paar Autos. Fahr eine **Laterne** oder einen
     **Automaten** um (ab ~25 km/h), einen **Baum** (ab ~40 km/h) und einen Fußgänger (fliegt, steht wieder auf). Schieb ein NPC-Auto weg.
   - **Läden:** Diner an der Nishi-Shinjuku-Avenue (Westrand, Höhe Kabukichō), Corner Mart an der Aoi-dōri neben dem roten Tor — hineinlaufen.
   - Handy/Tablet: Stick links, wischen rechts = Blick, JUMP/SLIDE, oben CAR/CALL.
3. **Browser-Probe bei ruhigem Rechner** (Blender zu): `node Tools/smoke.mjs --gpu` — ich brauche die fps-Zahl.
4. Noch offen aus früher: Abnahme Phase 5, Optik Phase 4, Hachi-Heckscheibe, alte Zweige `agent/*`.
5. Commits liegen lokal; **Push** nur, wenn du es sagst.

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-08 | Release, Phase 5 (8 Orte, 164 Modelle) | 47,69 MB | 5,53 MB | 41,96 MB | 1,2–1,3 s |
| 2026-10-09 | Release, Phase 6 (zu Fuß, NavMesh, Leben) | 49,34 MB | 5,73 MB | 43,40 MB | 0,8 s |
| 2026-10-09 | Release, + Assets 5b/5c/Flora/Scatter (248 Modelle) | 53,91 MB | 5,74 MB | 47,97 MB | 0,8–0,9 s |
