# Lehren und Vorkehrungen

> Jede Zeile: was passiert ist → welche **Vorkehrung** es künftig verhindert.
> Eine Lehre ohne Vorkehrung ist nur eine Geschichte. Format und Ablauf:
> Skill `retro`. Neueste oben. Bei mehr als 60 Zeilen: ähnliche Einträge
> zusammenfassen (die Vorkehrung bleibt, der Text wird kürzer).

| Datum | Phase | Was passiert ist | Vorkehrung (wo) | Art |
|---|---|---|---|---|
| 2026-10-07 | 1 | Editor per `kill` beendet, MCP-Server lief verwaist weiter; der nächste Editor meldete sich nicht an | Skill `unity-verify`, Falle "Editor schließen" | Skill |
| 2026-10-07 | 1 | Web-Player liefert „Draw Calls"/„Batches" als 0, obwohl gezeichnet wird — eine falsche Budgetzahl | Overlay zeigt „n/a" (`StatsOverlay.Snapshot.Count`), Test in `FrameTimeStatsTests` | Test |
| 2026-10-07 | 1 | Capture im Editor ohne gespeicherte Szene schrieb `Captures/.png` | Fallback-Name in `Capture.FromMenu` | Werkzeug |
| 2026-10-07 | 1 | Rauchprobe meldete Unitys absichtlich abgebrochenen Brotli-Stream als Fehler | Filter nur für `ERR_ABORTED` auf `*.unityweb` in `Tools/smoke.mjs` | Werkzeug |
| 2026-10-07 | 1 | Web-Server (launch.json) und Unity-MCP wollten beide Port 8080 | `Tools/serve-web.mjs` auf 8090, launch.json angepasst | Werkzeug |
| 2026-10-07 | 1 | Editor per AppleScript schließen griff nicht; Unity-MCP verbindet sich nicht in eine laufende Sitzung; Batch-PlayMode rendert nicht (Zähler 0) | Skill `unity-verify`, „Bekannte Fallen" | Skill |
| 2026-10-07 | 0 | Prototyp-Anleitung wuchs auf 48 000 Tokens Fehlergeschichten und wurde bei jedem Start geladen | `CLAUDE.md` hat Budget 150 Zeilen; Lehren nur hier, als Zeile | Regel |
| 2026-10-07 | 0 | Vier KI-Werkzeuge und zwölf parallele Agent-Zweige erzeugten Widersprüche | `CLAUDE.md` Regel 13: ein Agent zur Zeit auf `master` | Regel |
| 2026-10-07 | 0 | Doku widersprach dem Code (`npm run roads` „ohne `--wp6`", obwohl längst mit) | Phasen-Tor Schritt 5: Doku-gegen-Code-Prüfung | Ablauf |
| 2026-10-07 | 0 | Prototyp baute Physik, Kollision und Renderweg selbst (≈ 29 000 Zeilen, Hauptquelle der Bugs) | `CLAUDE.md` Regel 3: Standard vor Eigenbau, Begründung in DECISIONS.md | Regel |

Arten: **Test** (automatisch geprüft) · **Werkzeug** (Skript übernimmt den
Schritt) · **Skill** (Ablauf angepasst) · **Regel** (CLAUDE.md) · **Ablauf**
(Phasen-Tor / Sitzungsablauf).
