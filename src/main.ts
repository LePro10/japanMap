import './style.css';

import { FreeFlyController } from './camera/FreeFlyController';
import { Engine } from './core/Engine';
import { WebGLUnsupportedError } from './core/createRenderer';
import { AtmosphereSystem } from './render/atmosphere/AtmosphereSystem';
import { LightingRig } from './render/LightingRig';
import { LookController } from './render/looks/LookController';
import { PostFXPipeline } from './render/PostFXPipeline';
import { TerrainDataError } from './world/TerrainSampler';
import { RoadSystem } from './world/RoadSystem';
import { PropSystem } from './world/props/PropSystem';
import { RicePaddy } from './world/props/RicePaddy';
import { ScatterSystem } from './world/scatter/ScatterSystem';
import { TerrainSystem } from './world/TerrainSystem';
import { WaterSystem } from './world/WaterSystem';

function fatal(message: string, detail?: string): never {
  document.body.innerHTML = `
    <div class="fatal">
      <p>${message}</p>
      ${detail ? `<p><code>${detail}</code></p>` : ''}
    </div>`;
  throw new Error(message);
}

const canvas = document.querySelector<HTMLCanvasElement>('#viewport');
const overlay = document.querySelector<HTMLElement>('#overlay');
if (!canvas || !overlay) fatal('Grundgerüst der Seite fehlt (#viewport / #overlay).');

let engine: Engine;
try {
  engine = new Engine(canvas);
} catch (error) {
  if (error instanceof WebGLUnsupportedError) {
    fatal(
      'japanMap braucht WebGL2.',
      'Bitte einen aktuellen Browser verwenden und Hardwarebeschleunigung aktivieren.',
    );
  }
  throw error;
}

// Die Debug-UI wird dynamisch geladen: so landen Tweakpane und stats-gl nicht
// im Produktions-Bundle (SPEC §4 — erstes Bild unter 15 MB).
if (import.meta.env.DEV) {
  const [{ DebugPanel }, { SceneScaffold }] = await Promise.all([
    import('./debug/DebugPanel'),
    import('./debug/SceneScaffold'),
  ]);

  engine.setDebugHost(
    await DebugPanel.create({
      renderer: engine.renderer,
      scene: engine.scene,
      camera: engine.camera,
      bus: engine.bus,
      container: overlay,
      extraTextures: () => engine.resources.tracked,
      onDispose: () => {
        engine.dispose();
      },
    }),
  );

  engine.add(new SceneScaffold());

  window.japanMap = { engine };
}

/**
 * Einen Frame rendern und das Bild sofort auslesen.
 *
 * Nur im Dev-Build. Der Grund ist ein handfestes Messproblem: der Browser
 * drosselt `requestAnimationFrame` auf wenige Hertz, sobald das Fenster verdeckt
 * ist, und mit `preserveDrawingBuffer: false` trifft ein Bildschirmfoto dann
 * fast immer die Lücke zwischen zwei Frames — schwarz, obwohl korrekt gerendert
 * wurde. Rendern und Auslesen im selben Aufruf umgeht beides und ist damit die
 * einzige Prüfung, die unabhängig von der Bildrate eine Aussage macht.
 */
function installFrameProbe(target: Engine): void {
  window.japanMap = {
    ...window.japanMap,
    engine: target,
    probe: () => {
      target.loop.tick();
      const gl = target.renderer.getContext();
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      let sum = 0;
      let maximum = 0;
      let nonBlack = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const luma = (pixels[i] ?? 0) * 0.2126 + (pixels[i + 1] ?? 0) * 0.7152 + (pixels[i + 2] ?? 0) * 0.0722;
        sum += luma;
        if (luma > maximum) maximum = luma;
        if (luma > 2) nonBlack++;
      }
      const count = pixels.length / 4;
      return {
        width,
        height,
        mittlereHelligkeit: sum / count,
        maximum,
        anteilNichtSchwarz: nonBlack / count,
      };
    },

    /**
     * Denselben Frame als PNG in `.cache/shots/` legen.
     *
     * `probe()` beantwortet „wurde überhaupt etwas gezeichnet"; für „sieht es
     * richtig aus" braucht es ein Bild. Die Kette ist bewusst kurz gehalten:
     * readPixels → Canvas → toDataURL → POST an den Dev-Server. Ein
     * Bildschirmfoto über das Fenster scheidet aus, weil der Browser im
     * Hintergrund gar keine Frames mehr komponiert.
     *
     * `readPixels` liefert die unterste Zeile zuerst — deshalb wird beim
     * Zeichnen auf den Canvas gespiegelt. Ohne das steht das Gelände auf dem
     * Kopf, und zwar plausibel genug, um es zu übersehen.
     */
    shot: async (name = 'shot') => {
      target.loop.tick();
      const gl = target.renderer.getContext();
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8ClampedArray(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      source.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0);

      const flipped = document.createElement('canvas');
      flipped.width = width;
      flipped.height = height;
      const context = flipped.getContext('2d');
      if (!context) throw new Error('Kein 2D-Kontext für das Bildschirmfoto.');
      context.translate(0, height);
      context.scale(1, -1);
      context.drawImage(source, 0, 0);

      const base64 = flipped.toDataURL('image/png').split(',')[1] ?? '';
      const response = await fetch('/__shot', { method: 'POST', body: `${name}\n${base64}` });
      return response.text();
    },
  };
}

// Die Reihenfolge ist dreifach bedeutsam, deshalb steht sie hier und nicht
// verstreut in den Systemen:
//
//  1. init() läuft nacheinander. Das TerrainSystem sendet `terrain:ready`
//     während seiner Initialisierung — wer den Sampler oder die Höhen-Uniforms
//     will, muss vorher angemeldet sein. Deshalb stehen Kamera und Wasser
//     **vor** dem Terrain.
//  2. Der Atmosphären-Block wird dagegen beim Konstruieren weitergereicht, nicht
//     per Ereignis. Terrain und Wasser brauchen ihn schon beim Bauen ihrer
//     Materialien, also *nach* der Initialisierung der Atmosphäre — und für
//     diese Richtung taugt das Ereignismuster nicht (siehe TerrainSystem).
//  3. update() läuft in derselben Reihenfolge. Die Kamera bewegt sich zuerst,
//     danach richten Sonne, Wasserebene und Bodenmarkierung sich daran aus;
//     sonst hinkten alle drei einen Frame hinterher.
const atmosphere = new AtmosphereSystem();

engine.add(new FreeFlyController());
engine.add(atmosphere);
engine.add(new LightingRig(atmosphere.uniforms));
engine.add(new WaterSystem(atmosphere.uniforms));
// Vor Terrain **und** Straßen: die Streuung hört auf `terrain:ready` und
// `roads:ready`, und beide werden genau einmal gesendet, während sich jene
// Systeme initialisieren.
engine.add(new ScatterSystem(atmosphere.uniforms));
// Ebenfalls vor dem Terrain: die Props holen ihre Höhe aus dem Sampler, damit
// sie einen neuen Terrain-Bake überleben, statt eine Zahl aus der Datei zu
// glauben.
engine.add(new PropSystem(atmosphere.uniforms));
// Ebenso: die Wasserflächen der Reisfelder holen ihre Höhe aus dem Sampler,
// weil das Gelände die Parzellen bereits trägt (Baker, Schritt 5c).
engine.add(new RicePaddy(atmosphere.uniforms));
engine.add(new TerrainSystem(atmosphere.uniforms));
engine.add(new RoadSystem(atmosphere.uniforms));
engine.add(
  new PostFXPipeline((present) => {
    engine.setPresenter(present);
  }),
);
// Zuletzt: `look:apply` beim Start erreicht nur Systeme, die bereits angemeldet
// sind. Ein Preset, das die Hälfte der Werte setzt, wäre schlimmer als keins.
engine.add(new LookController());

// Erste Größe setzen, bevor der ResizeObserver das erste Mal feuert — sonst
// rendert der erste Frame mit 1×1 Pixeln.
engine.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);

try {
  await engine.init();
} catch (error) {
  if (error instanceof TerrainDataError) {
    fatal('Das gebackene Terrain passt nicht zur Konfiguration.', error.message);
  }
  // **Jeder andere Fehler wird ebenfalls angezeigt, nicht nur geworfen.**
  // Vorher lief er als unbehandelte Zusage ins Nichts: die Seite blieb bei
  // halb aufgebautem Debug-Panel stehen, ohne Meldung, und der Grund stand
  // ausschließlich in der Konsole. Genau so ist beim Bau der Vegetation eine
  // fehlgeschlagene Geometrie-Zusammenführung eine Viertelstunde lang als
  // „lädt eben langsam" durchgegangen.
  fatal('Ein System ist beim Initialisieren gescheitert.', String(error));
}
engine.start();

if (import.meta.env.DEV) installFrameProbe(engine);

// Vite führt dieses Modul bei einem Hot-Update erneut aus, ohne die Seite neu
// zu laden. Ohne diesen Haken entsteht dabei eine **zweite** Engine im selben
// Dokument: zwei Render-Schleifen auf einem Canvas, zwei Debug-Overlays
// übereinander, doppelte Draw-Calls im Budget. Genau dafür hat P0 dispose()
// gebaut — hier wird es benutzt.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    engine.dispose();
  });
}
