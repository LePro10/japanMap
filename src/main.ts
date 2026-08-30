import './style.css';

import { AudioSystem } from './audio/AudioSystem';
import { FreeFlyController } from './camera/FreeFlyController';
import { Engine } from './core/Engine';
import { BestTimes, formatTime } from './game/BestTimes';
import { Profile, VEHICLE_PRICE } from './game/Profile';
import { DRIFT_YEN_PER_POINT, EVENTS, findEvent } from './config/events.config';
import { DriveSystem } from './game/DriveSystem';
import { DriveHud } from './ui/DriveHud';
import { runAb } from './debug/abMeasure';
import { runDriveProbe } from './debug/driveProbe';
import { captureShot, probeFrame, type CaptureTarget } from './debug/capture';
import { countLodHoles } from './debug/lodHoles';
import { runReport } from './debug/report';
import { checkWinding } from './debug/winding';
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
import { StuntSystem } from './world/stunt/StuntSystem';
import { AssetUpgrader } from './core/AssetUpgrader';
import { TerrainSystem } from './world/TerrainSystem';
import { WaterSystem } from './world/WaterSystem';
import { StartScreen } from './ui/StartScreen';
import { PlayerUi, type DebugControl } from './ui/PlayerUi';

let loading: StartScreen | null = null;

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
loading = new StartScreen(engine.bus, document.body);

/**
 * Die Debug-UI wird dynamisch geladen: so landen Tweakpane und stats-gl nicht
 * im Produktions-Bundle (SPEC §4 — erstes Bild unter 15 MB).
 *
 * **Gibt seit P13 eine Steuerung zurück.** Der Reiter „Debug" im Spielermenü
 * schaltet Zahlenblock und Werkzeugleiste, und `PlayerUi` darf dafür nichts aus
 * `src/debug/` importieren — es wird ohne `import.meta.env.DEV` ausgeliefert.
 * Die Brücke ist deshalb dieses Objekt: hier gebaut, dort nur als
 * `DebugControl` bekannt. Im Build wird diese Funktion nie gerufen, das Feld
 * bleibt leer, und der Reiter existiert nicht.
 */
async function attachDebugUi(target: Engine, container: HTMLElement): Promise<DebugControl> {
  const [{ DebugPanel }, { SceneScaffold }] = await Promise.all([
    import('./debug/DebugPanel'),
    import('./debug/SceneScaffold'),
  ]);

  const panel = await DebugPanel.create({
    renderer: target.renderer,
    scene: target.scene,
    camera: target.camera,
    bus: target.bus,
    container,
    extraTextures: () => target.resources.tracked,
    onDispose: () => {
      target.dispose();
    },
  });
  target.setDebugHost(panel);

  target.add(new SceneScaffold());

  window.japanMap = { engine: target };

  // Durchgereicht statt kopiert: `panel` führt den Zustand und schreibt ihn nach
  // `localStorage`. Ein zweites Feld hier wäre eine zweite Wahrheit.
  return {
    get statsVisible() {
      return panel.statsVisible;
    },
    set statsVisible(value: boolean) {
      panel.statsVisible = value;
    },
    get paneVisible() {
      return panel.paneVisible;
    },
    set paneVisible(value: boolean) {
      panel.paneVisible = value;
    },
  };
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
  scatter: ScatterSystem,
  drive: DriveSystem,
): void {
  // Der gemeinsame Nenner von `probe()`, `shot()` und dem Messlauf: rendern und
  // im selben Aufruf auslesen. Siehe `debug/capture.ts`.
  const capture: CaptureTarget = {
    renderer: target.renderer,
    tick: () => {
      target.loop.tick();
    },
  };

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

    /**
     * Was die Gerätevorschätzung aus P8.3 gesehen hat.
     *
     * Sie setzt die **Startstufe** der Ersteinstufung; ohne diese Ausgabe wäre
     * nicht nachprüfbar, warum eine Maschine anders anfängt als eine andere.
     */
    device: () => qualitySystem.estimate,

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

    /**
     * Wickelrichtung aller Meshes prüfen — `japanMap.winding()`.
     *
     * Ohne Argument nur die Auffälligen; `winding(true)` gibt alles aus. Die
     * Prüfung liest nur Attribute und rendert nichts — sie ist damit unabhängig
     * von Kamera, Stufe und Streuung.
     *
     * Sie hat in P8.11 zwei unsichtbare Flächen gefunden, die jede Zahl vorher
     * für in Ordnung erklärt hatte. Siehe `debug/winding.ts`.
     */
    winding: (alle) => {
      const rows = checkWinding(target.scene);
      return alle ? rows : rows.filter((r) => r.suspicious);
    },

    /**
     * Fahrmodus schalten oder abfragen — `japanMap.drive(true)`, P14.
     *
     * Der Weg für Messungen und für die Konsole: die Taste `V` verlangt einen
     * gefangenen Zeiger, und den gibt es in der eingebetteten Vorschau nicht
     * (CLAUDE.md, „Pointer Lock ist in der eingebetteten Vorschau unmöglich").
     * Ohne diesen Aufruf wäre der Fahrmodus dort **überhaupt nicht** prüfbar.
     */
    drive: (on) => {
      if (on === true) drive.enter();
      else if (on === false) drive.exit();
      return drive.active;
    },

    /**
     * Die Rundenzählung — P9.3.
     *
     * Ohne Argument: der aktuelle Stand. Mit einer Strecken-Kennung: die Tore
     * werden auf diese Strecke gesetzt und die Zählung beginnt von vorn.
     *
     * **Ablesbar ohne Renderer**, weil der `LapTimer` seinen Zustand selbst
     * hält — der Messstand aus P14 treibt ihn im selben Schritt wie die Physik,
     * also liefert `japanMap.driveProbe()` gefahrene Runden gleich mit.
     */
    laps: (roadId) => {
      if (roadId !== undefined) {
        const network = drive.roads;
        if (!network) throw new Error('Rundenzählung: das Straßennetz ist noch nicht geladen.');
        if (!drive.laps.setRoad(network, roadId)) {
          throw new Error(`Rundenzählung: Strecke „${roadId}" gibt es nicht.`);
        }
      }
      return {
        strecke: drive.laps.roadId,
        tore: drive.laps.gates.length,
        laufend: drive.laps.running,
        verstrichen: drive.laps.elapsed,
        runden: drive.laps.laps,
      };
    },

    /**
     * Der Messstand des Fahrmodus (P14) — siehe `debug/driveProbe.ts`.
     *
     * Fährt jede Strecke mit einem Regler ab und schreibt mit, was dabei
     * passiert: Durchdringung, Abstand zur Mittellinie, Tempo, CPU je Schritt.
     * Dazu die Höhendifferenz zwischen Sampler und Mittellinie — die Messung, die
     * PLAN.md 9.1 verlangt.
     */
    driveProbe: (options) => {
      const sampler = drive.terrain;
      const network = drive.roads;
      if (!sampler || !network) {
        throw new Error('Fahr-Messstand: Terrain oder Straßennetz sind noch nicht geladen.');
      }
      return runDriveProbe({ drive, sampler, network }, options);
    },

    probe: () => probeFrame(capture),

    /**
     * Denselben Frame als PNG in `.cache/shots/` legen.
     *
     * `probe()` beantwortet „wurde überhaupt etwas gezeichnet"; für „sieht es
     * richtig aus" braucht es ein Bild. Beides steht seit P10.0 in
     * `debug/capture.ts`, weil der Messlauf dieselbe Kette braucht.
     */
    shot: (name = 'shot') => captureShot(capture, name),

    /**
     * Der Messlauf — `japanMap.report()`, PLAN.md P10 / 10.0.
     *
     * Fährt Blickpunkte × Qualitätsstufen ab und legt einen JSON-Bericht plus
     * je ein PNG in `.cache/`. **Das Werkzeug für die Maschine, die dieses
     * Projekt nicht hat:** hier fehlt `EXT_disjoint_timer_query_webgl2`, dort
     * nicht — und der Bericht sagt in beiden Fällen ausdrücklich, was er messen
     * konnte und was nicht.
     *
     * Ein voller Lauf sind 25 Zellen und dauert Minuten. Kleiner geht es über
     * die Optionen, etwa
     * `japanMap.report({ levels: ['ultra'], viewpoints: ['reisfeld'] })`.
     */
    /**
     * Interleavte A/B-Messung der GPU-Zeit — PLAN.md P12 / 12.0.
     *
     * Der Unterschied zu `report()`: der misst **Zustände** (Blickpunkt ×
     * Stufe) und schreibt Bilder dazu; dieser hier misst **Eingriffe** gegen
     * eine Basis, und zwar so, dass eine driftende oder mitbenutzte GPU das
     * Ergebnis nicht mehr bestimmt. Warum das nötig ist, steht im Kopf von
     * `abMeasure.ts` — die Kurzfassung: eine sequenzielle Messreihe stieg dort
     * um 56 %, ohne dass ein Eingriff das erklärt hätte.
     *
     * ```js
     * japanMap.view('wald');
     * await japanMap.ab({ variants: { 'Kette aus': { postFx: 'off' }, 'AO aus': { ao: 'off' } } });
     * ```
     */
    ab: (options) =>
      runAb(
        {
          renderer: target.renderer,
          scene: target.scene,
          capture,
          timing: target.context.debug,
          quality: {
            get level() {
              return qualitySystem.level;
            },
            setCustom: (patch) => {
              qualitySystem.setCustom(patch);
            },
            set: (level) => {
              qualitySystem.set(level);
            },
          },
          streaming: () => scatter.streaming,
          dropped: () => scatter.dropped,
        },
        options,
      ),

    report: (options) =>
      runReport(
        {
          renderer: target.renderer,
          scene: target.scene,
          camera,
          capture,
          quality: {
            get level() {
              return qualitySystem.level;
            },
            get estimate() {
              return qualitySystem.estimate;
            },
            get classifying() {
              return qualitySystem.classifying;
            },
            set: (level) => {
              qualitySystem.set(level);
            },
          },
          timing: target.context.debug,
          extraTextures: () => target.resources.tracked,
          streaming: () => scatter.streaming,
          dropped: () => scatter.dropped,
        },
        options,
      ),
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
  // **Vor dem Terrain, den Straßen, der Stadt und den Props**, weil er auf alle
  // vier Ereignisse hört und jedes genau einmal gesendet wird. Der Freiflug wird
  // ihm hereingereicht statt gesucht — Begründung im Kopf von `DriveSystem`.
  const drive = new DriveSystem(atmosphere.uniforms, controller);

  // **Hier und nicht im System selbst.** `roads:ready` wird gesendet, während
  // sich das RoadSystem initialisiert; wer es hören will, muss vorher
  // registriert sein. `PlanarReflection` wird aber bewusst **danach**
  // hinzugefügt — es muss nach allem aktualisieren, was Geometrie einbringt.
  // Ein Zuhörer in seinem `init()` löst deshalb nie aus, und der Sichttest, der
  // daran hängt, wäre von totem Code nicht zu unterscheiden (gemessen: fünf
  // Blickpunkte, Draw-Calls in beiden Fassungen bitgleich).
  //
  // `engine.bus` gibt es schon vor `engine.init()`, und die Verdrahtung
  // zwischen Systemen liegt ohnehin in dieser Datei.
  engine.bus.on('roads:ready', ({ network }) => {
    reflection.setRoadNetwork(network.file);
  });

  // Vor allen anderen Systemen, weil sie sich sonst nicht mehr anmelden lassen.
  const debug = import.meta.env.DEV ? await attachDebugUi(engine, overlay) : null;

  engine.add(controller);
  // **Direkt nach der Kamera**, und das ist zweimal wichtig: `init()` läuft in
  // dieser Reihenfolge (er muss sich vor Terrain, Straßen, Stadt und Props
  // anmelden), und `update()` ebenfalls — die Verfolgerkamera muss nach der
  // Fahrphysik und vor allem laufen, was sich an der Kamera ausrichtet (Sonne,
  // Wasserebene, Spiegelung).
  engine.add(drive);
  // **Nach dem Fahrmodus**, damit `update()` in dieser Reihenfolge läuft: der
  // Ton liest die Telemetrie desselben Frames und nicht die des vorigen. Die
  // Telemetrie wird als Objekt übergeben und nicht je Frame abgefragt — die
  // Physik schreibt sie ohnehin fort, und ein zweiter Weg dorthin wäre eine
  // zweite Gelegenheit, ihn zu vergessen.
  const audio = new AudioSystem();
  audio.setTelemetry(drive.vehicle.telemetry);
  engine.add(audio);

  // ── Zeitfahren (P16) ──────────────────────────────────────────────────
  //
  // `LapTimer` zählt seit P9.3 Runden, und **kein Spieler hat je eine Zeit
  // gesehen**: die Ablesewerte hingen im Tweakpane-Ordner „Runden", und
  // Tweakpane liegt im gebauten Stand nicht im Bundle. Hier bekommen sie ein
  // HUD und eine Bestzeit, die das Neuladen überlebt.
  //
  // **Hier oben und nicht unten bei `PlayerUi`**, obwohl es Oberfläche ist:
  // `Engine.add()` wirft, sobald `init()` gelaufen ist („Systeme müssen vor
  // Engine.init() registriert werden"), und die Aktualisierung je Frame ist ein
  // System. Der Fehler wäre erst zur Laufzeit aufgefallen — `typecheck` sieht
  // ihn nicht.
  const hud = new DriveHud(overlay);
  const bestTimes = new BestTimes();
  const profile = new Profile();
  hud.setMoney(profile.yen);
  profile.onChange(() => {
    hud.setMoney(profile.yen);
  });

  engine.bus.on('drive:mode', ({ active }) => {
    hud.setDriveActive(active);
    if (active) hud.setGate(drive.laps.readouts.naechstesTor);
  });

  engine.bus.on('drive:rescued', () => {
    hud.showRescue();
  });

  engine.bus.on('pickup:collected', ({ yen }) => {
    profile.earn(yen);
    audio.click();
    hud.flash(`+¥${yen}`, true);
  });

  engine.bus.on('drive:lap', (result) => {
    const strecke = drive.laps.roadId;
    // **Ein Vergleich, nicht zwei.** `submit()` entscheidet, ob es eine
    // Bestzeit ist, und Ton wie Anzeige übernehmen die Antwort. Zwei getrennte
    // Vergleiche wären zwei Gelegenheiten, sie auseinanderlaufen zu lassen —
    // und der Ton feierte dann eine Bestzeit, die die Anzeige nicht kennt.
    //
    // **Nur außerhalb eines Rennens.** In einem Rennen zählt der Rennleiter, und
    // zwei Rundenzähler auf demselben Bild sind zwei Zahlen, von denen eine
    // falsch aussieht.
    if (drive.race.state !== 'idle') return;
    const best = strecke !== null && bestTimes.submit(strecke, result.seconds);
    hud.showLap(result, best);
    audio.lap(best);
  });

  // ── Die Veranstaltung — P23 ───────────────────────────────────────────
  engine.bus.on('race:checkpoint', () => {
    audio.click();
  });

  engine.bus.on('race:lap', ({ lap }) => {
    hud.flash(`LAP ${lap}`, false);
  });

  engine.bus.on('race:finished', (result) => {
    const event = findEvent(result.event);
    if (!event) return;
    profile.earn(result.yen);
    const bestBefore = profile.bestOf(event.id);
    const isBest = profile.submitTime(event.id, result.seconds);
    const driftBest = event.kind === 'drift' && profile.submitDrift(event.id, result.driftScore);
    audio.lap(isBest || driftBest || result.place === 1);

    const title =
      event.kind === 'race'
        ? result.place === 1
          ? 'WINNER'
          : 'FINISHED'
        : event.kind === 'drift'
          ? 'DRIFT RUN'
          : 'TIME TRIAL';
    const headline =
      event.kind === 'race' ? `P${result.place}` : formatTime(result.seconds);
    const rows: string[] = [];
    if (event.kind === 'race') {
      rows.push(row('Time', formatTime(result.seconds)));
    }
    if (bestBefore !== null) rows.push(row('Previous best', formatTime(bestBefore)));
    if (isBest) rows.push(row('New record', '✓'));
    if (result.driftScore > 0) rows.push(row('Drift score', String(result.driftScore)));
    rows.push(row('Earned', `¥${result.yen.toLocaleString('en-US')}`));

    hud.showResult(
      `<p class="hud__resultTitle">${title}</p>` +
        `<p class="hud__resultPlace">${headline}</p>` +
        rows.join('') +
        `<button class="hud__resultButton" data-close type="button">Continue</button>`,
      () => {
        drive.race.clear();
        hud.hideRace();
      },
    );
  });

  // Die Aktualisierung je Frame als eigenes kleines System — **nach** `drive`
  // registriert, damit sie die Telemetrie desselben Frames liest und nicht die
  // des vorigen. `System` ist eine Schnittstelle, kein Basistyp; für diese paar
  // Zeilen lohnt keine Klasse in einer eigenen Datei.
  // Zwei Zähler für die Abrechnung der Driftketten. Sie stehen hier und nicht
  // im HUD: das HUD zeigt an, es rechnet nicht.
  let lastChain = 0;
  let lastBanked = 0;

  engine.add({
    name: 'DriveHudUpdate',
    update: () => {
      if (!hud.visible) return;
      const race = drive.race;
      hud.update(
        drive.vehicle.telemetry,
        race.state === 'running' ? race.elapsed : drive.laps.elapsed,
        race.state === 'running' || drive.laps.running,
        race.state === 'idle'
          ? drive.laps.roadId === null
            ? null
            : bestTimes.get(drive.laps.roadId)
          : race.event
            ? profile.bestOf(race.event.id)
            : null,
      );
      const drift = race.drift.state;
      hud.setDrift(drift);
      // ── Eine beendete Kette abrechnen — P24 ──────────────────────────
      //
      // **Hier und nicht in `DriftScore`**, weil nur diese Stelle beides kennt:
      // den Fortschritt (das Geld) und das HUD (die Meldung). Die Wertung selbst
      // soll ohne beides laufen — ein Prüfstand treibt sie ohne Bus und ohne
      // Konto.
      if (drift.lastChain !== lastChain) {
        lastChain = drift.lastChain;
        hud.driftEnded(drift);
      }
      if (drift.banked > lastBanked) {
        // Außerhalb einer Veranstaltung wird sofort gutgeschrieben; in einer
        // rechnet der Zieleinlauf ab, sonst gäbe es die Punkte zweimal.
        if (race.state === 'idle') {
          profile.earn((drift.banked - lastBanked) * DRIFT_YEN_PER_POINT);
        }
        lastBanked = drift.banked;
      } else if (drift.banked < lastBanked) {
        lastBanked = drift.banked;
      }
      if (race.state === 'countdown') hud.setCountdown(race.countdown);
      else if (race.state === 'running') {
        hud.setCountdown(0);
        const event = race.event;
        hud.setRace(
          race.standings(),
          race.lap,
          event?.laps ?? 1,
          race.distanceToNext(drive.vehicle.position.x, drive.vehicle.position.z),
          race.checkpointsLeft,
        );
      } else if (!hud.resultOpen) {
        hud.hideRace();
      }
      if (race.state === 'idle') hud.setGate(drive.laps.readouts.naechstesTor);
    },
    dispose: () => {
      hud.dispose();
    },
  });

  engine.add(atmosphere);
  engine.add(new LightingRig(atmosphere.uniforms));
  const water = new WaterSystem(atmosphere.uniforms);
  engine.add(water);
  drive.setWake((x, z, dirX, dirZ, speed, active) => {
    water.setVehicleWake(x, z, dirX, dirZ, speed, active);
  });
  // Vor Terrain **und** Straßen: die Streuung hört auf `terrain:ready` und
  // `roads:ready`, und beide werden genau einmal gesendet, während sich jene
  // Systeme initialisieren.
  // Festgehalten statt nur angemeldet: der Messlauf (P10.0) fragt sie, ob sie
  // noch arbeitet — ohne dieses Signal hält er eine leere Welt für eine fertige.
  const scatter = new ScatterSystem(atmosphere.uniforms);
  engine.add(scatter);
  drive.setCanopy(scatter);
  // Ebenfalls vor dem Terrain: die Props holen ihre Höhe aus dem Sampler, damit
  // sie einen neuen Terrain-Bake überleben, statt eine Zahl aus der Datei zu
  // glauben.
  engine.add(new PropSystem(atmosphere.uniforms));
  // Schanzen, Kirschbäume, Fahnen und Sammelstücke — P24. **Vor dem Terrain**,
  // weil das System auf `terrain:ready` und `roads:ready` hört und beide genau
  // einmal gesendet werden, während sich jene Systeme initialisieren.
  const stunt = new StuntSystem(atmosphere.uniforms, drive.ramps);
  engine.add(stunt);
  drive.setStunt(stunt);
  // Ebenso: die Wasserflächen der Reisfelder holen ihre Höhe aus dem Sampler,
  // weil das Gelände die Parzellen bereits trägt (Baker, Schritt 5c).
  const paddy = new RicePaddy(atmosphere.uniforms);
  engine.add(paddy);
  // **Die Reisfelder hängen am WaterSystem und nicht am Fahrmodus** — P19. Sie
  // brauchen dieselben zwei Zahlen wie Meer und Fluss (Nahdetail aus der Stufe,
  // Kielwelle aus dem Auto), und die laufen dort ohnehin durch. Zwei Zuhörer für
  // dieselbe Sache wären zwei Gelegenheiten, einen davon zu vergessen — genau
  // das ist der Grund, warum die Reisfelder bis P19 die einzige Wasserfläche
  // ohne Kielwelle waren.
  water.setPaddy(paddy);
  // Und ebenso die Stadt: sie braucht den Sampler für die Schürze am
  // Distriktrand und das Straßennetz, damit die Blöcke der Stadtstraße
  // ausweichen. Beides kommt als Ereignis aus Systemen, die danach kommen.
  engine.add(new CitySystem(atmosphere.uniforms));
  // Nach der Stadt: das Neon hört auf `city:ready` und hat vorher nichts zu tun.
  engine.add(new NeonSystem(atmosphere.uniforms));
  // Der Nachlader (P15.4) wird **vor** seinen Nutzern angelegt und **nach**
  // ihnen angemeldet. Beides ist nötig und aus verschiedenen Gründen:
  //
  //  - vorher angelegt, weil Terrain und Straße ihn im Konstruktor bekommen —
  //    dieselbe Entscheidung wie beim Atmosphärenblock. Eine Abhängigkeit an
  //    der Registrierungsstelle sichtbar zu machen ist ehrlicher, als sie
  //    nachträglich über ein Ereignis einzusammeln.
  //  - nachher angemeldet, weil sein `update()` die fertig geladenen Gruppen
  //    eintauscht, und das soll nach dem passieren, was in diesem Frame ohnehin
  //    schon zeichnet.
  const upgrader = new AssetUpgrader();
  engine.add(new TerrainSystem(atmosphere.uniforms, upgrader));
  engine.add(new RoadSystem(atmosphere.uniforms, reflection.uniforms, upgrader));
  engine.add(upgrader);
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

  // **Nicht hinter `import.meta.env.DEV`** — anders als alles darunter. Das ist
  // der ganze Zweck von P10.2: bis hierher hing jede Bedienung am Debug-Panel,
  // und im gebauten Stand gab es damit weder Steuerungshinweis noch
  // Qualitätswahl noch Pause.
  //
  // **Nach `start()`, und das ist seit P13 keine Kosmetik mehr.** `start()`
  // sendet `engine:warmedup` noch in seinem eigenen Aufruf; genau dieses
  // Ereignis macht aus dem Ladebildschirm den Startbildschirm mit dem
  // „Starten"-Knopf. Der Knopf steht also, bevor die Zeile darunter läuft —
  // deshalb merkt sich `StartScreen` einen Druck, für den noch niemand
  // zuständig war, statt ihn fallen zu lassen.
  const ui = new PlayerUi({
    bus: engine.bus,
    canvas,
    container: overlay,
    camera: controller,
    hud,
    ...(debug ? { debug } : {}),
    // Der Fahrmodus als schmale Schnittstelle statt als System — dieselbe
    // Bauart wie `quality` darunter. `PlayerUi` reicht sie unverändert an
    // `TouchControls` weiter; beide Oberflächen bedienen damit **denselben**
    // Zustand, und die Taste `V` meldet sich über `drive:mode` bei beiden.
    audio: {
      get muted() {
        return audio.muted;
      },
      setMuted: (muted) => {
        audio.setMuted(muted);
      },
      click: () => {
        audio.click();
      },
    },
    drive: {
      get active() {
        return drive.active;
      },
      toggle: () => {
        drive.toggle();
      },
      respawn: () => {
        drive.respawn();
      },
      setHandbrake: (down) => {
        drive.setTouchHandbrake(down);
      },
      get vehicleId() {
        return drive.vehicleId;
      },
      setVehicle: (id) => {
        drive.setVehicle(id);
      },
    },
    // ── Die Veranstaltungen — P23 ────────────────────────────────────────
    //
    // Dieselbe schmale Bauart wie `drive` und `quality` darüber: das Menü
    // bekommt Getter und drei Methoden, kein System. Verdrahtet ist es hier,
    // weil hier ohnehin alles zusammenläuft, was mehr als ein System braucht —
    // Fortschritt, Rennleiter und Fahrmodus.
    events: {
      list: EVENTS,
      get yen() {
        return profile.yen;
      },
      bestOf: (id) => profile.bestOf(id),
      driftBestOf: (id) => profile.driftBestOf(id),
      get runningEvent() {
        return drive.race.state === 'idle' ? null : (drive.race.event?.id ?? null);
      },
      start: (id) => {
        const event = findEvent(id);
        if (event) drive.startEvent(event);
      },
      abort: () => {
        drive.abortEvent();
        hud.hideRace();
      },
      owns: (id) => profile.owns(id),
      price: (id) => VEHICLE_PRICE[id],
      buy: (id) => profile.buy(id),
      onChange: (fn) => {
        profile.onChange(fn);
      },
    },
    quality: {
      get level() {
        return quality.level;
      },
      set: (level) => {
        quality.set(level);
      },
      setCustom: (patch) => {
        quality.setCustom(patch);
      },
      seedCustomFrom: (level) => {
        quality.seedCustomFrom(level);
      },
      reclassify: () => {
        quality.reclassify();
      },
    },
  });

  // Der „Starten"-Knopf holt den Pointer Lock — **synchron im Klick**, sonst ist
  // die Nutzergeste verbraucht und der Browser lehnt ab.
  loading?.onStart(() => {
    // **Im Klick selbst**, nicht danach: ein `AudioContext` bleibt für immer
    // suspendiert, wenn sein `resume()` nicht aus einer Nutzergeste kommt.
    // Genau deshalb kommt in vielen Web-Spielen der Ton erst nach einem
    // Tab-Wechsel. `armAutoUnlock()` unten deckt den Fall ab, in dem dieser
    // Rückruf nachgeholt wird und damit außerhalb der Geste liegt.
    audio.unlock();
    ui.begin();
  });
  audio.armAutoUnlock();

  if (import.meta.env.DEV) installFrameProbe(engine, controller, quality, scatter, drive);
}

/** Eine Zeile der Zieltafel. Englisch, wie alles im DOM. */
function row(label: string, value: string): string {
  return `<p class="hud__resultRow"><span>${label}</span><span>${value}</span></p>`;
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
