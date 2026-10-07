# Einrichtung — einmalig, für den Menschen

Was ein Agent nicht selbst kann (installieren, anmelden). Danach läuft alles
über Claude Code.

## 1. Programme

| Programm | Hinweis |
|---|---|
| **Git + Git LFS** | Nach der Installation einmal `git lfs install` ausführen |
| **Unity Hub** | Mit Unity-Konto anmelden, Lizenz *Personal* (kostenlos bis 200 000 $ Umsatz) |
| **Unity 6.6** (6000.6.x) | Im Hub installieren, Modul **Web Build Support** anhaken. Dieselbe Version wie im Probelauf |
| **Blender** (5.x) | Mit installiertem Blender-MCP-Add-on |
| **Node.js ≥ 22** | Für Hilfsskripte und den Legacy-Prototyp |
| **Claude Code** | Desktop-App oder CLI |

## 2. MCP-Server in Claude Code

- **Unity-MCP** — z. B. „MCP for Unity" (CoplayDev, kostenlos): Unity-Paket
  ins Projekt, MCP-Eintrag für Claude Code nach deren Anleitung (braucht
  Python 3.10+ und `uv`). Das Unity-Paket installiert der Agent in Phase 1;
  der MCP-Eintrag auf deinem Rechner ist deine Aufgabe.
  Alternative: offizieller Unity-MCP (Paket „AI Assistant", braucht Unity-AI-Abo).
- **Blender-MCP** — wie im Probelauf. Blender muss beim Arbeiten offen sein.

## 3. Repo holen und starten

```bash
git pull
git lfs install
```

Dann eine **neue** Claude-Code-Sitzung **im Repo-Ordner** öffnen, Unity Hub
und Blender offen haben und sagen:

> Beginne mit Phase 1.

Der Agent prüft zuerst die Umgebung und sagt dir, falls noch etwas fehlt.
Den Pfad zum Projekt aus dem Probelauf bereithalten — dessen Einstellungen
können übernommen werden.

## 4. Optional

- **Unity-YAML-Merge** für Konflikte in Szenen (selten nötig, weil nur ein
  Agent arbeitet): in `.git/config` den Treiber `unityyamlmerge` auf
  `<Unity-Ordner>/Editor/Data/Tools/UnityYAMLMerge.exe merge -p %O %B %A %A`
  setzen.
- **Handy im WLAN** für Tests des Web-Builds: der Agent nennt dir dann die
  Adresse.
