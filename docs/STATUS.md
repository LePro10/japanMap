# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-09 · **Phase:** 6 (Zu Fuß und Leben) abgeschlossen — deine Abnahme offen · **Phase 7 (Spielinhalt) ist als Nächstes dran**

Phase 2 ✅ · Phase 3 ✅ freigegeben · Phase 4 ✅ (Optik-Abnahme offen) · Phase 5 ✅ (Abnahme offen).

## Phase 6 — Zu Fuß und Leben ✅

Entscheidungen D22–D24. Bilder: `Captures/p6-1-vorher-nachher.png`, `p6-2-vorher-nachher.png`, `p6-traffic/near.png`,
`p6-smash/seq.png`, `p6-5-nachher.png`; Blickpunkte Hoch/Niedrig `Captures/p6-gate/hoch.png`, `niedrig.png`.

- [x] 1. **Zu Fuß:** Start in Sakura, Auto 4 m nördlich. Laufen 4,4 / Rennen 7,5 m/s, Sprung ~1 m, Rutschen (C), Kamera
  (Cinemachine), **F** ein/aus (aus nur < 5 km/h), **H** Auto rufen. Touch-Knöpfe. Figur = Stellvertreter aus Kästen.
- [x] 2. **Fußgänger** auf NavMesh (40, Niedrig 24) um den Spieler; Rückstoß (fliegen, Auto −5 %, aufstehen).
- [x] 3. **Verkehr:** 6 NPC-Autos (Niedrig 3) in Tokyo, linke Spur, halten vor Leuten/Autos, wegschiebbar. Kästen.
- [x] 4. **Zerstörbares:** 870 Pfosten/Laternen, 142 Automaten, 88 Gestelle/Zäune, 75 Hütten zerfallen in Teile. Bäume noch nicht.
- [x] 5. **Begehbare Läden** (Diner, Corner Mart in Tokyo) und **Akteure**: Sakura-Besucher, Funaura-Fischer/Katzen,
  Stillwater-Arbeiter/Ziegen/Hühner.

**Abnahme (gemessen):** Fußgänger-Test 10 min Simulation an 6 Orten: **45 987 Stichproben, 0 auf der Fahrbahn**
(`Captures/pedestrian-10min.txt`). Zerstörung: **Bruch ≤ 0,91 ms, Physik ≤ 0,36 ms mit vollem Pool (64 Stücke)**, Budget 2 ms ✓
(`Captures/smash-cost.txt`). Verkehr 1 min: 97–100 % auf der Fahrbahn. Tests EditMode 62/62, PlayMode 158/162 (4 auf Abruf),
Konsole 0 Fehler. Bench Niedrig ≤ 379 DC / ≤ 474 k ✓; **Hoch sakura-hof 1 503 DC (Budget 1 500, +0,2 %)** ✗ — Figuren mit
Schatten im Hof, vor Phase 6 schon 1 471 → Phase 10 (Schatten-Kaskaden). Web 49,34 MB (+1,6 MB NavMesh), Start 0,8 s,
Niedrig 305 fps (Blender lief parallel).

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
- **Hoch kostet viel:** Wald-Schatten, lodBias 2, Reisgras, kleine Figuren in allen Kaskaden → Phase 10. **Download 49,3 MB** (Handy-Ziel 20 MB) → Phase 10.
- Fahrtests im Batchmodus: Ursache wohl behoben (Tastatur ohne Fokus), **im Batchmodus ungeprüft**. Bäume zerbrechen nicht (Phase 7).
- Funaura: die sechs Angler an den Molenfeuern fehlen (Plätze hängen am Lichter-Layout des Prototyps). Stillwater-Hafen (Tideglass) gibt es noch nicht.

### Für die Asset-Sitzung (Lagen stehen in den Daten, Import genügt)

- **Spielfigur:** 1,72 m, Fahrer:in späte 80er, ≤ 6 k Dreiecke, Ursprung zwischen den Füßen, +Z vorn; Stehen, Gehen, Rennen, Sprung, Rutschen.
- **Leute/Tiere:** 4–6 Passanten, Fischer, Bauer, sitzende Pose; Katze 0,45 m, Ziege 1 m, Huhn 0,35 m; ≤ 3 k, Skinned.
- **Verkehrsautos:** 3–4 Stadtautos (Kei, Limousine, Taxi, Lieferwagen) ≤ 5 k, 4,1 × 1,7 m, Räder eigene Objekte.
- **Vorzerlegt:** Laterne (3 Teile), Automat, Holzgestell/Zaun, Schuppen — je Teil ≤ 1 k. **Ladeninnere:** Diner, Mart (Regale, Waren, Kasse).
- Sakura: leichte Ausstellungsautos (≤ 8 k). Koedo: 2 Kanalbrücken, Brauhalle. Needle: Tribüne, Boxen, Start-Ziel-Brücke.

## Für dich (Mensch)

1. **Asset-Aufgabe 5c freigeben?** Die Asset-Sitzung ist fertig (18 Hochhäuser, Kino/Hotel/Markthalle, Kaki, Weide, Kei-Truck;
   `ArtSource/STATUS.md`). Sag „5c freigegeben", dann importiere ich und setze sie in Tokyo/Funaura ein.
2. **Abnahme Phase 6 (~15 Min.):** `Boot` → ▶ Play. Du stehst **zu Fuß** in Sakura, das Auto 4 m vor dir.
   - **WASD** laufen, **Shift** rennen, **Leertaste** springen, **C** beim Rennen = rutschen. **Mausklick** fängt die Maus → umschauen
     (Esc gibt sie frei; alternativ rechte Maustaste halten). Mausrad = Abstand.
   - **F** am Auto: einsteigen. Fahren, anhalten, **F**: aussteigen (über 5 km/h geht es absichtlich nicht).
   - Weglaufen, **H**: das Auto kommt zu dir. Fühlt sich das Laufen/Rutschen gut an? Ist die Kamera angenehm?
   - Nach Norden/Westen nach **Tokyo**: Fußgänger auf den Gehwegen, ein paar Autos. Fahr eine **Laterne** oder einen
     **Automaten** um (ab ~25 km/h) und einen Fußgänger (fliegt, steht wieder auf). Schieb ein NPC-Auto weg.
   - **Läden:** Diner an der Nishi-Shinjuku-Avenue (Westrand, Höhe Kabukichō), Corner Mart an der Aoi-dōri neben dem roten Tor — hineinlaufen.
   - Handy/Tablet: Stick links, wischen rechts = Blick, JUMP/SLIDE, oben CAR/CALL.
3. **Browser-Probe bei ruhigem Rechner** (Blender zu): `node Tools/smoke.mjs --gpu` — ich brauche die fps-Zahl.
4. Noch offen aus früher: Abnahme Phase 5, Optik Phase 4, Asset-Stile „Scatter"/„Flora", Hachi-Heckscheibe, alte Zweige `agent/*`.
5. Commits liegen lokal; **Push** nur, wenn du es sagst.

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-08 | Release, Phase 5 (8 Orte, 164 Modelle) | 47,69 MB | 5,53 MB | 41,96 MB | 1,2–1,3 s |
| 2026-10-09 | Release, Phase 6 (zu Fuß, NavMesh, Leben) | 49,34 MB | 5,73 MB | 43,40 MB | 0,8 s |
