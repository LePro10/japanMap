import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import glsl from 'vite-plugin-glsl';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * Liegt das Projekt auf einem Netzlaufwerk?
 *
 * `realpathSync.native` löst unter Windows ein zugeordnetes Laufwerk auf seinen
 * UNC-Pfad auf: aus `P:\projects\japanMap` wird
 * `\\192.168.30.236\projects\projects\japanMap`. Der doppelte Backslash am
 * Anfang ist damit ein verlässliches Kennzeichen — verlässlicher als die
 * Gerätenummer aus `stat`, die unter Windows nur die Datenträger-Seriennummer
 * ist und über die Art des Datenträgers nichts sagt.
 */
const isNetworkMount = ((): boolean => {
  try {
    return realpathSync.native(projectRoot).startsWith('\\\\');
  } catch {
    return false;
  }
})();

/**
 * Bildschirmfoto aus dem laufenden Bild auf die Platte — nur im Dev-Server.
 *
 * CLAUDE.md verlangt „ein Bild ansehen", und zwar nicht als Kür: zwei der drei
 * groben Fehler dieses Projekts standen als korrekte Zahlen im Bericht und
 * waren erst im Bild zu sehen. Der Weg über das Browser-Fenster funktioniert
 * aber nur, solange jemand davorsitzt — im Hintergrund drosselt der Browser
 * `requestAnimationFrame` und komponiert gar keine Frames mehr.
 *
 * `window.japanMap.shot()` rendert deshalb einen Frame, liest ihn mit
 * `readPixels` aus und schickt ihn hierher; die Datei landet in `.cache/shots/`
 * und lässt sich mit jedem Bildbetrachter öffnen. Kein Produktionscode: der
 * Endpunkt existiert nur im Dev-Server, und `.cache/` steht in `.gitignore`.
 */
function screenshotEndpoint(): Plugin {
  const dir = join(projectRoot, '.cache', 'shots');
  return {
    name: 'japanmap-screenshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end();
          return;
        }
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const [name, base64] = body.split('\n');
          mkdirSync(dir, { recursive: true });
          // Der Name kommt aus dem Browser und wird auf einen Dateinamen ohne
          // Pfadanteile zurechtgestutzt — ein Dev-Server, den man aus Versehen
          // im Netz stehen lässt, soll nicht irgendwohin schreiben können.
          const safe = (name ?? 'shot').replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'shot';
          const file = join(dir, `${safe}.png`);
          writeFileSync(file, Buffer.from(base64 ?? '', 'base64'));
          response.statusCode = 200;
          response.end(file);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    screenshotEndpoint(),
    // Shader liegen als .glsl/.vert/.frag im Baum und werden importiert, nicht
    // als Template-String eingebettet — sonst gibt es kein Syntax-Highlighting
    // und #include funktioniert nicht (PLAN.md, Codebasis-Regeln).
    glsl({ compress: false }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    /**
     * **Auf einem Netzlaufwerk keine Pfadauflösung über `realpath`.**
     *
     * Vite löst Modul-IDs standardmäßig auf ihren echten Pfad auf. Unter Windows
     * geht das über die Freigabe und wieder zurück auf **irgendeinen**
     * zugeordneten Laufwerksbuchstaben — und wenn mehrere Buchstaben auf
     * dieselbe Freigabe zeigen, ist das nicht zwingend derselbe, unter dem der
     * Dev-Server gestartet wurde.
     *
     * Genau das ist mitten in P6 passiert: `P:` und `Z:` zeigten beide auf
     * `\\…\projects`, Vite löste `/src/main.ts` nach `Z:/projects/japanMap/…`
     * auf, und der eigene Prozess konnte diesen Pfad nicht öffnen. Der
     * Fehlerbericht war eine einzige Zeile im **Server**-Log —
     * „Pre-transform error: Failed to load url /src/main.ts. Does the file
     * exist?" —, während der Browser eine leere Seite ohne jede Konsolenmeldung
     * zeigte und `window.japanMap` schlicht fehlte. Die Datei existierte unter
     * beiden Buchstaben.
     *
     * `preserveSymlinks` schaltet die Auflösung ab: der Pfad bleibt, wie er
     * hereinkam. Symlinks im Baum gibt es hier keine, der Schalter kostet also
     * nichts. Auf lokaler Platte greift die Bedingung ohnehin nicht.
     */
    ...(isNetworkMount ? { preserveSymlinks: true } : {}),
  },

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // **Auf einem SMB-Mount wird der Datei-Watcher abgeschaltet, nicht
    // umkonfiguriert.** Der Weg dahin ging über zwei Fehlschläge, und beide
    // sahen von außen gleich aus — „es lädt einfach nie fertig":
    //
    //  1. Der native Watcher wirft auf dem Mount `UNKNOWN: unknown error,
    //     watch` und reißt den Dev-Server beim ersten Dateiereignis mit.
    //  2. Mit `usePolling` startet der Server, aber die Seite lädt im
    //     Sekundentakt neu („[vite] server connection lost. Polling for
    //     restart…" in der Konsole). Der Mount liefert Zeitstempel nicht
    //     stabil; chokidar meldet daraufhin Änderungen an Dateien, die niemand
    //     angefasst hat — darunter vite.config.ts selbst, und deren Änderung
    //     startet den **Server** neu. Der Client verliert die Verbindung und
    //     lädt beim Wiederaufbau die Seite. 42 MB Assets brauchen auf diesem
    //     Mount länger als der Abstand zwischen zwei solchen Neustarts, also
    //     kam der Start nie über die erste Textur hinaus.
    //
    // Ohne Watcher gibt es kein HMR — und auch **kein Neuladen von Hand**:
    // ohne Datei­ereignis verwirft Vite seinen Transform-Cache nicht, die Seite
    // bekommt beim Reload also dasselbe Modul wie vorher. Nach einer Änderung
    // an `src/` muss der Dev-Server neu gestartet werden. Das kostet gemessen
    // 1,2 s und ist der ehrlichere Zustand als ein HMR, das auf diesem Mount in
    // Wahrheit ein getarnter Vollneustart im Sekundentakt ist. Auf lokaler
    // Platte greift die Bedingung nicht, und alles bleibt wie gehabt.
    ...(isNetworkMount ? { watch: null } : {}),
  },

  build: {
    target: 'es2022',
    sourcemap: true,
    // Assets werden inline nie sinnvoll — Heightmaps und HDRIs sind zu groß,
    // und base64 kostet 33 % Übertragung gegen das 15-MB-Budget aus SPEC §4.
    assetsInlineLimit: 0,
  },

  // .r16 ist die rohe 16-bit-Heightmap aus tools/bake-terrain.mjs (ab P1).
  assetsInclude: ['**/*.hdr', '**/*.ktx2', '**/*.r16'],
});
