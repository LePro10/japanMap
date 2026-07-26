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
