import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [
    // Shader liegen als .glsl/.vert/.frag im Baum und werden importiert, nicht
    // als Template-String eingebettet — sonst gibt es kein Syntax-Highlighting
    // und #include funktioniert nicht (PLAN.md, Codebasis-Regeln).
    glsl({ compress: false }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      // Auf einem SMB-Mount (siehe CLAUDE.md, „Umgebung") liefert der native
      // Watcher `UNKNOWN: unknown error, watch` und reißt den Dev-Server beim
      // ersten Dateiereignis mit — der Server startet, stirbt aber, sobald
      // irgendetwas im Baum angefasst wird. Polling ist der einzige Modus, den
      // der Mount trägt; auf lokaler Platte kostet es nichts, weil chokidar
      // node_modules ohnehin auslässt.
      usePolling: true,
      interval: 500,
    },
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
