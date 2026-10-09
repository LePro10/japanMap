#!/bin/bash
# Doppelklick: startet die Browser-Vorschau des letzten Web-Builds (Port 8092) und öffnet sie.
# Stört die Agenten nicht (eigene Kopie in Builds/Preview, der Unity-Editor bleibt unberührt).
# Beenden: dieses Terminal-Fenster schließen (oder Ctrl+C).
cd "$(dirname "$0")"
(sleep 2 && open "http://127.0.0.1:8092/") &
node Tools/serve-web.mjs --preview
