# japanMap — Arbeitsanleitung für Agenten

Open-World-Fahrspiel in Japan („Blaue Stunde nach Regen"), gebaut in
**Unity 6 (URP)**, Ziel **Browser / CrazyGames** (Desktop + Handy).
Der Mensch, dem das Projekt gehört, schreibt keinen Code und klickt nicht im
Editor — alles läuft über Agenten. Er spricht Deutsch; erkläre einfach.

**Diese Datei bleibt unter 150 Zeilen.** Details stehen in Skills und `docs/`.

## Sitzungsablauf

1. **Start:** [docs/STATUS.md](docs/STATUS.md) lesen, dann **nur** den
   Abschnitt der aktuellen Phase in [docs/PLAN.md](docs/PLAN.md).
2. **Arbeiten:** eine Aufgabe nach der anderen. Nach jeder Änderung prüfen
   (Skill `unity-verify`). Nach jeder fertigen Aufgabe: STATUS.md abhaken,
   committen.
3. **Ende:** STATUS.md aktualisieren (wo stehen wir, was ist als Nächstes
   dran, was muss der Mensch tun), Skill `retro`, commit. Push nur, wenn der
   Mensch es sagt.
4. **Phasenende:** Skill `phase-gate`.

## Repo-Karte

| Pfad | Inhalt |
|---|---|
| `Assets/_Project/` | Alles Eigene: `Scripts/<Modul>/`, `Art/`, `Data/` (ScriptableObjects), `Prefabs/`, `Scenes/`, `Editor/`, `Tests/` |
| `Assets/ThirdParty/` | Fremd-Assets, unverändert; Lizenzen in `LICENSES.md` dort |
| `Packages/`, `ProjectSettings/` | Unity — committen |
| `SourceData/legacy/` | Kartendaten aus dem Prototyp (nur lesen, README dort: **Achsen!**) |
| `ArtSource/` | Blender-Quellen und Generator-Skripte für Assets |
| `Tools/` | Kommandozeilen-Werkzeuge für Agenten (ab Phase 1) |
| `Captures/`, `Builds/` | Bilder und Builds — nicht im Git |
| `docs/` | PLAN, STATUS, DECISIONS, LESSONS, CONTEXT, LEGACY-MAP, SETUP, ART-DIRECTION |
| `legacy/threejs/` | Alter Three.js-Prototyp. **Nur lesen.** Einstieg: [docs/LEGACY-MAP.md](docs/LEGACY-MAP.md) |

Module (je eine `.asmdef`, Namespace `JapanMap.<Modul>`): `Core`, `World`,
`Vehicles`, `OnFoot`, `Gameplay`, `UI`, `Audio`, `Platform`, `DevTools`;
dazu `Editor` und `Tests`. Abhängigkeiten nur nach unten zu `Core`.

## Befehle

> Werden in Phase 1 gebaut. Jeder Befehl steht erst hier, wenn er einmal
> ausgeführt wurde.

| Zweck | Befehl |
|---|---|
| Prüfen (kompilieren, Tests, Konsole) | *Phase 1* |
| Bild von Blickpunkt | *Phase 1/2* |
| Web-Build + Größenbericht | *Phase 1* |
| Web-Build ausliefern + Rauchprobe | *Phase 1* |

Wichtig: **Batchmode geht nicht, solange der Editor das Projekt offen hat.**
Dann alles über den Unity-MCP auslösen.

## Regeln

1. **Was nicht gemessen wurde, gilt als nicht erledigt.** Ergebnis melden,
   nicht Absicht. Ungeprüftes ausdrücklich als ungeprüft benennen.
2. **Zahl *und* Bild.** Bei allem Sichtbaren ein Bild machen und ansehen.
   Vorher/Nachher immer vom selben Blickpunkt.
3. **Standard vor Eigenbau.** Erst Unity-Funktion oder Paket (Physik,
   NavMesh, Splines, Cinemachine, Terrain, UI Toolkit), dann Asset Store, erst
   dann eigener Code — mit einem Satz Begründung in DECISIONS.md.
4. **Daten statt Zahlen im Code.** Einstellwerte in ScriptableObjects unter
   `Data/`, nicht als Konstanten verstreut. Ein Regler, dessen Wirkung nie
   gemessen wurde (Wert verdoppeln / auf null → ändert sich etwas?), ist tot.
5. **Ein Regler je Messung.** Bei Optik- oder Fahrproblemen erst Ursachen
   trennen (Teil abschalten, messen), dann drehen.
6. **Echte Wege testen.** Zustand nicht von Hand setzen, sondern über den Weg,
   den das Spiel geht (Menü über Knopf, Auto über Spawn). Ein von Hand
   gesetzter Zustand existiert im Betrieb nicht.
7. **Ein Fehler ist eine Klasse.** Wer einen findet, sucht dieselbe Ursache
   im ganzen Projekt, bevor er weitergeht.
8. **Szenen und Prefabs über Editor/MCP ändern**, nicht durch Bearbeiten des
   YAML — außer bei trivialen Werten. `.meta`-Dateien immer mit ihrem Asset
   committen, nie einzeln löschen oder umbenennen.
9. **Code und Code-Kommentare Englisch, Doku Deutsch.** Kommentare erklären
   das *Warum*, kurz.
10. **Spieltexte Englisch** (internationales Publikum).
11. **Nicht im Legacy-Ordner arbeiten.** Verhalten portieren, nicht Code
    abschreiben. `legacy/threejs/WORKFLOW-LEGACY.md` nie ganz laden (48 000
    Tokens) — gezielt suchen.
12. **Leistung zählt ab Tag 1.** Budgets in docs/PLAN.md; nach größeren
    Änderungen Web-Build bauen und Größe/FPS notieren.
13. **Ein Agent zur Zeit auf `master`.** Subagenten für Recherche sind ok,
    parallele Schreib-Agenten nicht.

## Sich selbst verbessern — Pflicht, nicht Kür

Jeder Fehler, jede Sackgasse und jeder langsame Arbeitsschritt wird zu einer
**Vorkehrung**, damit er nicht wieder passiert (Skill `retro`). Reihenfolge,
von stark nach schwach:

1. automatischer Test / Prüfung im Importer / Editor-Validierung,
2. Werkzeug oder Skript, das den Schritt übernimmt,
3. Skill anpassen (`.claude/skills/`),
4. Regel hier in CLAUDE.md — nur wenn sie überall gilt und das Budget
   von 150 Zeilen hält; sonst lieber eine alte Regel zusammenfassen.

Jede Vorkehrung bekommt eine Zeile in [docs/LESSONS.md](docs/LESSONS.md).
Du darfst und sollst CLAUDE.md, Skills, Werkzeuge und Tests ändern, wenn das
die Arbeit verbessert — mit Begründung im Commit. Keine Geschichten in
CLAUDE.md: Geschichte gehört in `git log`.

## Der Mensch

- Braucht der Mensch etwas zu tun (installieren, anmelden, Fahrgefühl
  prüfen, Handy testen, Kauf im Asset Store), sammle es gebündelt in
  STATUS.md unter „Für dich" — mit genauer Anleitung — statt mittendrin zu
  fragen. Nur bei echten Blockaden sofort fragen.
- Ein Durchlauf darf das Kontingent nicht sinnlos fressen: Bilder klein
  halten (≈ 512–1024 px), keine Endlosschleifen — nach drei Fehlversuchen
  notieren und anders angehen.
- Rechner des Menschen: Leistung nur grob prüfen; nie zwei Spiel-Instanzen
  gleichzeitig rendern (der PC ist dabei einmal abgestürzt).

## Werkzeuge

- **Unity-MCP**: Szene, Objekte, Skripte, Konsole, Play, Tests, Builds.
  Zuerst die verfügbaren Tools auflisten, nicht Namen raten.
- **Blender-MCP**: Assets per Python (`bpy`) bauen, `look` zum Prüfen. Keine
  kostenpflichtige Generierung ohne Zustimmung des Menschen.
- **CLI**: git (mit LFS), Node für Hilfsskripte, Unity im Batchmode.
