#!/usr/bin/env bash
# Einmalig: verschiebt den Three.js-Prototyp nach legacy/threejs/ und setzt die
# vorbereiteten Unity-Dateien aus _migration/ ein (docs/PLAN.md, Phase 0).
# Alles über `git mv` — rückgängig machbar mit `git reset --hard` + Ordner
# zurückschieben, solange nicht committet ist. Committet selbst nichts.
set -euo pipefail
cd "$(dirname "$0")"

[ -d _migration ] || { echo "_migration/ fehlt — wurde das Skript schon ausgeführt?"; exit 1; }
[ ! -e legacy/threejs ] || { echo "legacy/threejs existiert schon — Abbruch."; exit 1; }

mkdir -p legacy/threejs

# 1. Alle getrackten Einträge der obersten Ebene, außer denen, die bleiben.
git ls-files | cut -d/ -f1 | sort -u | while IFS= read -r e; do
  case "$e" in .github|.claude|docs) continue ;; esac
  git mv -- "$e" "legacy/threejs/$e"
done

# 2. Die alte Doku aus docs/ (nur getrackte Dateien — die neue ist noch ungetrackt).
mkdir -p legacy/threejs/docs
git ls-files docs | cut -d/ -f2 | sort -u | while IFS= read -r f; do
  git mv -- "docs/$f" "legacy/threejs/docs/$f"
done

# 3. Workflow, der nur zum Prototyp gehört.
mkdir -p legacy/threejs/.github/workflows
git mv .github/workflows/verify-navigation-ui.yml legacy/threejs/.github/workflows/

# 4. Arbeitsordner des Prototyps (nicht getrackt): mitnehmen, damit er lauffähig bleibt.
#    docs/astra-refs/ sind fremde Referenzbilder — bleiben ungetrackt (Legacy-.gitignore).
for d in node_modules dist .cache export docs/astra-refs; do
  if [ -e "$d" ]; then mv "$d" "legacy/threejs/$d"; fi
done
# Entwürfe vom 2026-10-07, aufgegangen in docs/PLAN.md und docs/CONTEXT.md.
rm -f docs/UNITY-UMZUG.md docs/unity-spike-prompt.md

# 5. Alte Agenten-Anleitungen umbenennen, damit Claude Code sie nicht automatisch lädt.
git mv legacy/threejs/CLAUDE.md legacy/threejs/WORKFLOW-LEGACY.md
git mv legacy/threejs/AGENTS.md legacy/threejs/AGENTS-LEGACY.md

# 6. Neue Dateien an ihren Platz (CLAUDE.md, AGENTS.md, README.md, .gitignore,
#    Workflows, .claude/launch.json).
cp -R _migration/. .
rm -rf _migration

echo "Fertig. Nächster Schritt: Claude prüfen und committen lassen."
git status --short | grep -v '^R ' | head -40
rm -- "$0"
