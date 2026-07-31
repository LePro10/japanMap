import './style.css';

import { FreeFlyController } from './camera/FreeFlyController';
import { Engine } from './core/Engine';
import { countLodHoles } from './debug/lodHoles';
import { reflectionProbe } from './debug/reflectionProbe';
import { QUALITY } from './config/quality.config';
import { applyViewpoint, type Viewpoint } from './debug/viewpoints';
import { WebGLUnsupportedError } from './core/createRenderer';
import { AtmosphereSystem } from './render/atmosphere/AtmosphereSystem';
import { LightingRig } from './render/LightingRig';
import { LookController } from './render/looks/LookController';
import { measureFrameTime } from './render/frameTiming';
import { PlanarReflection } from './render/PlanarReflection';
import { PostFXPipeline } from './render/PostFXPipeline';
import { QualitySystem } from './render/QualitySystem';
import { CitySystem } from './world/city/CitySystem';
import { NeonSystem } from './world/city/NeonSystem';
import { TerrainDataError } from './world/TerrainSampler';
import { RoadSystem } from './world/RoadSystem';
import { PropSystem } from './world/props/PropSystem';
import { RicePaddy } from './world/props/RicePaddy';
import { ScatterSystem } from './world/scatter/ScatterSystem';
import { TerrainSystem } from './world/TerrainSystem';
import { WaterSystem } from './world/WaterSystem';
import { LoadingScreen } from './ui/LoadingScreen';

let loading: LoadingScreen | null = null;

function fatal(message: string, detail?: string): never {
  // Zuerst weg: eine Fehlermeldung hinter dem Ladebildschirm ist keine.
  loading?.dispose();
  document.body.innerHTML = `
    <div class="fatal">
      <p>${message}</p>
      ${detail ? `<p><code>${detail}</code></p>` : ''}
    </div>`;
  throw new Error(message);
}

const canvasOrNull = document.querySelector<HTMLCanvasElement>('#viewport');
const overlayOrNull = document.querySelector<HTMLElement>('#overlay');
if (!canvasOrNull || !overlayOrNull) fatal('Grundgerüst der Seite fehlt (#viewport / #overlay).');
// Festgeschrieben, weil die Verengung aus der Zeile darüber innerhalb von
// `boot()` nicht mehr gilt — TypeScript führt Kontrollfluss nicht über eine
// Funktionsgrenze hinweg fort, auch nicht für Konstanten.
const canvas: HTMLCanvasElement = canvasOrNull;
const overlay: HTMLElement = overlayOrNull;

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

// Vor allem anderen: der Ladebildschirm muss stehen, bevor das erste System
// initialisiert wird — sonst zeigt er den Fortschritt erst ab der Hälfte.
loading = new LoadingScreen(engine.bus, document.body);

/**
 * Die Debug-UI wird dynamisch geladen: so landen Tweakpane und stats-gl nicht
 * im Produktions-Bundle (SPEC §4 — erstes Bild unter 15 MB).
 */
async function attachDebugUi(target: Engine, container: HTMLElement): Promise<void> {
  const [{ DebugPanel }, { SceneScaffold }] = await Promise.all([
    import('./debug/DebugPanel'),
    import('./debug/SceneScaffold'),
  ]);

  target.setDebugHost(
    await DebugPanel.create({
      renderer: target.renderer,
      scene: target.scene,
      camera: target.camera,
      bus: target.bus,
      container,
      extraTextures: () => target.resources.tracked,
      onDispose: () => {
        target.dispose();
      },
    }),
  );

  target.add(new SceneScaffold());

  window.japanMap = { engine: target };
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
function installFrameProbe(
  target: Engine,
  camera: FreeFlyController,
  qualitySystem: QualitySystem,
): void {
  window.japanMap = {
    ...window.japanMap,
    engine: target,

    /**
     * Qualitätsstufe setzen oder abfragen — `japanMap.quality('low')`.
     *
     * Zusammen mit `view()` und `bench()` ist das die Messkette für P7.1: an
     * einen benannten Standpunkt fliegen, Stufe setzen, Frame-Zeit messen.
     * Ohne den festen Standpunkt misst ein Vorher/Nachher die Kamera.
     */
    quality: (level) => {
      if (level) qualitySystem.set(level);
      return qualitySystem.level;
    },

    /** Frame-Zeit ohne Vsync und ohne rAF-Drosselung — siehe frameTiming.ts. */
    bench: (frames) =>
      measureFrameTime({
        tick: () => {
          target.loop.tick();
        },
        gl: target.renderer.getContext() as WebGL2RenderingContext,
        ...(frames === undefined ? {} : { frames }),
      }),

    /**
     * Benannten Blickpunkt anfliegen — `japanMap.view('stadt')`.
     *
     * Der Gegenpart zu `shot()` und `probe()`: die beiden liefern Bild und
     * Zahlen, dieser hier den Standpunkt, an dem sie gelten.
     */
    view: (target: string | Viewpoint) => applyViewpoint(camera, target),

    /**
     * Die Messung zur Reflexions-Entscheidung (P6 / 6.5).
     *
     * Liefert, welcher Anteil der Spiegelbilder überhaupt im Bildschirmraum
     * steht — die Zahl, an der SSR gegen planare Reflexion entschieden wird.
     */
    reflectionProbe: (grid?: number) =>
      reflectionProbe({
        scene: target.scene,
        camera: target.camera,
        surfaces: ['Stadtboden', 'Straßen'],
        reflected: ['Stadt', 'Neon'],
        ...(grid === undefined ? {} : { grid }),
      }),
    /**
     * Löcher im Terrain-Gitter zählen — die Abnahme von P8.1.
     *
     * `japanMap.lodHoles('low')` schaltet zuerst um und misst dann. Ohne das
     * Argument gilt die eingestellte Stufe. Die Messung rendert selbst und
     * umgeht dabei die PostFX-Kette; ihr Ergebnis ist deshalb unabhängig von
     * Tonemapping und Bloom.
     */
    lodHoles: (level) => {
      if (level) qualitySystem.set(level);
      return countLodHoles({
        renderer: target.renderer,
        scene: target.scene,
        camera: target.camera,
        gridVertices: QUALITY[qualitySystem.level].terrainGridVertices,
        tick: () => {
          target.loop.tick();
        },
      });
    },

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

/**
 * Hochfahren.
 *
 * **Warum das eine Funktion ist und kein Top-Level-await.** Der gebaute Stand
 * hing genau daran: `await engine.init()` auf oberster Ebene hält den
 * Einstiegs-Chunk „am Auswerten", und ein `import()` auf einen Chunk, der von
 * ihm abhängt, kann dann nie fertig werden. Der Ladebildschirm blieb bei 31 %
 * stehen, alle Dateien kamen mit 200 zurück, und keine Fehlermeldung nirgends.
 * Ausführlich in `vite.config.ts` bei `manualChunks`.
 *
 * Innerhalb einer Funktion ist die Auswertung des Moduls längst durch, wenn
 * gewartet wird — der Kreis kann sich gar nicht erst schließen. Das ist die
 * strukturelle Hälfte der Absicherung; die andere ist der eigene Chunk für
 * three.
 */
async function boot(): Promise<void> {
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
  const reflection = new PlanarReflection();
  const controller = new FreeFlyController();

  // Vor allen anderen Systemen, weil sie sich sonst nicht mehr anmelden lassen.
  if (import.meta.env.DEV) await attachDebugUi(engine, overlay);

  engine.add(controller);
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
  // Und ebenso die Stadt: sie braucht den Sampler für die Schürze am
  // Distriktrand und das Straßennetz, damit die Blöcke der Stadtstraße
  // ausweichen. Beides kommt als Ereignis aus Systemen, die danach kommen.
  engine.add(new CitySystem(atmosphere.uniforms));
  // Nach der Stadt: das Neon hört auf `city:ready` und hat vorher nichts zu tun.
  engine.add(new NeonSystem(atmosphere.uniforms));
  engine.add(new TerrainSystem(atmosphere.uniforms));
  engine.add(new RoadSystem(atmosphere.uniforms, reflection.uniforms));
  // **Nach** allen Systemen, die Geometrie in die Szene bringen, und **vor** der
  // PostFX-Kette: der Spiegeldurchgang rendert die fertige Szene ein zweites Mal
  // aus der gespiegelten Kamera, und er muss das tun, bevor der Composer den
  // eigentlichen Frame zeichnet.
  engine.add(reflection);
  engine.add(
    new PostFXPipeline((present) => {
      engine.setPresenter(present);
    }),
  );
  // Zuletzt: `look:apply` beim Start erreicht nur Systeme, die bereits angemeldet
  // sind. Ein Preset, das die Hälfte der Werte setzt, wäre schlimmer als keins.
  engine.add(new LookController());
  // Und danach die Qualitätsstufe, aus demselben Grund und noch eine Stufe
  // strenger: sie sendet ihre Stufe beim Start genau einmal, und wer sie hört,
  // muss vorher registriert sein. Nach dem Look, weil beide auf die
  // Umgebungsverdeckung zeigen — dass die Reihenfolge trotzdem egal ist, stellt
  // die UND-Verknüpfung in der PostFX-Kette sicher, nicht diese Zeile.
  const quality = new QualitySystem();
  engine.add(quality);

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

  if (import.meta.env.DEV) installFrameProbe(engine, controller, quality);
}

void boot();

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
