import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
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

/**
 * Messlauf-Berichte auf die Platte — PLAN.md P10 / 10.0, nur im Dev-Server.
 *
 * Der Zwilling von `/__shot`, und er existiert aus demselben Grund: die Zahlen,
 * die dieses Projekt braucht, entstehen in einem laufenden Renderer, und auf der
 * Entwicklungsmaschine gibt es keine GPU-Zeit (CLAUDE.md, „Umgebung"). Wer eine
 * echte GPU hat, startet den Dev-Server, ruft `japanMap.report()` und schickt
 * die Datei zurück — sie liegt danach in `.cache/reports/` und lässt sich lesen,
 * ohne dass jemand vor dem Bild sitzen muss.
 *
 * Kein Produktionscode: `apply: 'serve'`, und `.cache/` steht in `.gitignore`.
 */
function reportEndpoint(): Plugin {
  const dir = join(projectRoot, '.cache', 'reports');
  return {
    name: 'japanmap-report',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__report', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end();
          return;
        }
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          // Nur am **ersten** Zeilenumbruch trennen: der Bericht ist eingerücktes
          // JSON und enthält selbst welche. `split('\n')` wie bei `/__shot` würde
          // ihn nach der ersten Zeile abschneiden — dort ist der Rumpf Base64 und
          // damit einzeilig, hier nicht.
          const cut = body.indexOf('\n');
          const name = cut < 0 ? 'report' : body.slice(0, cut);
          const json = cut < 0 ? '' : body.slice(cut + 1);
          mkdirSync(dir, { recursive: true });
          // Wie bei `/__shot`: der Name kommt aus dem Browser und wird auf einen
          // Dateinamen ohne Pfadanteile zurechtgestutzt.
          const safe = name.replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'report';
          const file = join(dir, `${safe}.json`);
          writeFileSync(file, json);
          response.statusCode = 200;
          response.end(file);
        });
      });
    },
  };
}

/**
 * Brotli-Vorkompression — PLAN.md P7 / 7.5.
 *
 * Zur Bauzeit statt beim Ausliefern: Brotli auf Stufe 11 kostet für die
 * Heightmap Sekunden, und das kann kein Server pro Anfrage tun. Web-Server
 * liefern eine `.br`-Datei neben dem Original aus, wenn der Browser
 * `Accept-Encoding: br` schickt (nginx `brotli_static`, Caddy und die üblichen
 * CDNs von Haus aus).
 *
 * **Komprimiert wird nur, was sich lohnt.** JPEG, PNG und glTF-Binärdaten sind
 * bereits komprimiert; Brotli darüber kostet Bauzeit und Speicherplatz und
 * bringt einstellige Promille. Gemessen wird trotzdem jede Datei — geschrieben
 * nur die, bei denen wenigstens 5 % herauskommen. Der Bericht am Ende sagt, was
 * es gebracht hat, statt es zu behaupten.
 */
function brotliAssets(): Plugin {
  const MIN_BYTES = 4096;
  const MIN_GAIN = 0.05;
  return {
    name: 'japanmap-brotli',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const outDir = join(projectRoot, 'dist');
      const files = await readdir(outDir, { recursive: true, withFileTypes: true });
      let originalTotal = 0;
      let compressedTotal = 0;
      let written = 0;

      for (const entry of files) {
        if (!entry.isFile() || entry.name.endsWith('.br') || entry.name.endsWith('.map')) continue;
        const file = join(entry.parentPath, entry.name);
        const source = await readFile(file);
        if (source.byteLength < MIN_BYTES) continue;

        const packed = brotliCompressSync(source, {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,
            [constants.BROTLI_PARAM_SIZE_HINT]: source.byteLength,
          },
        });
        originalTotal += source.byteLength;
        if (packed.byteLength <= source.byteLength * (1 - MIN_GAIN)) {
          await writeFile(`${file}.br`, packed);
          compressedTotal += packed.byteLength;
          written++;
        } else {
          compressedTotal += source.byteLength;
        }
      }

      const mb = (bytes: number): string => (bytes / 1048576).toFixed(2);
      console.log(
        `\nBrotli: ${written} Dateien vorkomprimiert — ` +
          `${mb(originalTotal)} MB → ${mb(compressedTotal)} MB ` +
          `(${(100 - (compressedTotal / originalTotal) * 100).toFixed(1)} % weniger).`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    screenshotEndpoint(),
    reportEndpoint(),
    brotliAssets(),
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

    rollupOptions: {
      output: {
        /**
         * **Die Fremdbibliotheken müssen aus dem Einstiegs-Chunk heraus, und
         * zwar nicht der Dateigrößen wegen.**
         *
         * Der gebaute Stand hing beim Start. Reproduzierbar, ohne jede
         * Fehlermeldung: der Ladebildschirm blieb bei 31 % („PropSystem")
         * stehen, alle 15 bis dahin angeforderten Dateien kamen mit 200 zurück,
         * und die erste `.glb` wurde nie angefordert.
         *
         * Die Ursache ist ein **Deadlock über Top-Level-await**:
         *
         *  1. `main.ts` wartet auf oberster Ebene auf `engine.init()`. Der
         *     Einstiegs-Chunk ist damit so lange „am Auswerten".
         *  2. Rollup legt den geteilten three-Code in genau diesen Chunk.
         *  3. `GLTFLoader` wird per `import()` nachgeladen — und der gebaute
         *     Chunk beginnt mit `import{…}from"./index-….js"`.
         *  4. Ein Modul darf erst laufen, wenn seine Abhängigkeiten fertig
         *     ausgewertet sind. Der Einstiegs-Chunk wird das aber erst, wenn
         *     `init()` durch ist — und das wartet auf diesen Import.
         *
         * Im Dev-Server passiert das nicht: dort ist jede Quelldatei ihr eigenes
         * Modul, `GLTFLoader` hängt an `three` statt an `main.ts`, und der Kreis
         * schließt sich nicht. **Der Fehler existiert ausschließlich im Build**
         * — und war damit genau die Sorte, für die es diesen Schritt gibt.
         *
         * Mit eigenem Chunk hängen Einstieg *und* Nachladung beide an `three`,
         * das vor beiden fertig ausgewertet ist. Der Kreis ist aufgetrennt.
         *
         * Die zweite Hälfte der Absicherung steht in `main.ts`: die
         * Startsequenz läuft dort inzwischen in einer async-Funktion statt auf
         * oberster Ebene. Beides zusammen, weil hier jede für sich reicht und
         * keine für sich offensichtlich ist.
         */
        manualChunks: {
          three: ['three'],
          postfx: ['postprocessing', 'n8ao'],
        },
      },
    },
  },

  // .r16 ist die rohe 16-bit-Heightmap aus tools/bake-terrain.mjs (ab P1).
  assetsInclude: ['**/*.hdr', '**/*.ktx2', '**/*.r16'],
});
