import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  type Group,
} from 'three';

import { ROAD_MESH, ROAD_TYPES, type RoadData, type RoadFile } from '@/config/roads.config';
import type { BindingApi } from '@tweakpane/core';

import type { DebugHost } from '@/debug/DebugHost';
import {
  maxGradient,
  minCurveRadius,
  sampleSpline,
} from './splineSampler.mjs';

/**
 * Spline-Editor — PLAN.md P3 / 3.2.
 *
 * **Wozu er da ist, und wozu nicht.** Der Generator legt das Netz aus dem
 * Gelände an und prüft dabei seine eigenen Grenzwerte; er ist das Werkzeug für
 * den ersten Wurf. Der Editor ist das Werkzeug danach — für die eine Kurve, die
 * zu eng gerät, für den Knoten, der zwei Meter zu weit im Hang liegt. Ohne ihn
 * ließe sich an einer einzelnen Stelle nichts ändern, ohne den Generator
 * umzuschreiben und damit die ganze Karte neu zu würfeln.
 *
 * **Er misst mit.** Nach jeder Änderung wertet er den Spline neu aus und zeigt
 * Radius, Steigung und Länge an — dieselben Zahlen, an denen der Generator
 * scheitert oder besteht, und in denselben Einheiten. Ein Editor, der eine
 * Kurve schöner macht und dabei still unter 15 m Radius rutscht, wäre eine
 * Falle.
 *
 * **Er rechnet mit demselben Sampler wie alle anderen.** `splineSampler.mjs`
 * ist reines ESM und wird hier, im Generator und im Terrain-Baker importiert.
 * Eine zweite Auswertung derselben Kurve wäre genau die Sorte Abweichung, die
 * erst auffällt, wenn man auf der Straße fährt und die eingeschnittene Rinne im
 * Terrain daneben liegt.
 *
 * Der Editor lebt nur im Dev-Build; der Import steht in `RoadSystem` hinter
 * `import.meta.env.DEV`, damit Tweakpane-nahe Logik nicht ins Produktions-Bundle
 * gerät.
 */

/** Ein bearbeitbarer Knoten. Spiegel von `RoadData.nodes`, aber schreibbar. */
interface EditableNode {
  pos: [number, number, number];
  width: number;
  banking: number;
}

interface EditableRoad {
  readonly id: string;
  readonly type: RoadData['type'];
  readonly closed: boolean;
  readonly tags: readonly string[];
  nodes: EditableNode[];
}

export interface RoadEditorOptions {
  readonly file: RoadFile;
  readonly group: Group;
  /** Wird nach jeder Änderung mit den neu abgetasteten Strecken aufgerufen. */
  readonly onRebuild: (roads: readonly RoadData[]) => void;
}

/** Größe der Knotenmarker in Metern. */
const MARKER_SIZE = 2.2;

export class RoadEditor {
  readonly #roads = new Map<string, EditableRoad>();
  readonly #source: RoadFile;
  readonly #group: Group;
  readonly #onRebuild: (roads: readonly RoadData[]) => void;

  #markers: InstancedMesh | null = null;
  #cursor: Mesh | null = null;

  readonly #state = {
    strecke: '',
    knoten: 0,
    x: 0,
    y: 0,
    z: 0,
    breite: 0,
    querneigung: 0,
    marker: true,
  };

  readonly #readouts = {
    knoten: '—',
    radius: '—',
    steigung: '—',
    laenge: '—',
  };

  constructor(options: RoadEditorOptions) {
    this.#source = options.file;
    this.#group = options.group;
    this.#onRebuild = options.onRebuild;

    for (const road of options.file.roads) {
      this.#roads.set(road.id, {
        id: road.id,
        type: road.type,
        closed: road.closed,
        tags: road.tags,
        nodes: road.nodes.map((node) => ({
          pos: [node.pos[0], node.pos[1], node.pos[2]],
          width: node.width,
          banking: node.banking,
        })),
      });
    }

    const first = options.file.roads[0];
    if (first) this.#state.strecke = first.id;
  }

  get #current(): EditableRoad | null {
    return this.#roads.get(this.#state.strecke) ?? null;
  }

  register(debug: DebugHost): void {
    const folder = debug.folder('Spline-Editor');

    const options: Record<string, string> = {};
    for (const road of this.#source.roads) {
      options[`${ROAD_TYPES[road.type].label} (${road.id})`] = road.id;
    }

    folder
      .addBinding(this.#state, 'strecke', { label: 'Strecke', options })
      .on('change', () => {
        this.#state.knoten = 0;
        this.#pull();
        this.#refreshMarkers();
        debug.refresh();
      });

    const nodeSlider = folder
      .addBinding(this.#state, 'knoten', { label: 'Knoten', min: 0, max: 1, step: 1 })
      .on('change', () => {
        this.#pull();
        this.#moveCursor();
        debug.refresh();
      });

    // Die Grenzen der Position sind die Weltgrenzen; die Schrittweite ist fein
    // genug, um eine Kurve um Zentimeter zu verschieben, ohne dass der Regler
    // unbrauchbar wird.
    const move = (): void => {
      this.#push();
      this.#rebuild();
      this.#moveCursor();
      debug.refresh();
    };

    folder.addBinding(this.#state, 'x', { label: 'X', min: -1536, max: 1536, step: 0.25 })
      .on('change', move);
    folder.addBinding(this.#state, 'y', { label: 'Y (Höhe)', min: -40, max: 450, step: 0.1 })
      .on('change', move);
    folder.addBinding(this.#state, 'z', { label: 'Z', min: -1536, max: 1536, step: 0.25 })
      .on('change', move);
    folder.addBinding(this.#state, 'breite', { label: 'Breite', min: 3, max: 16, step: 0.1 })
      .on('change', move);
    folder.addBinding(this.#state, 'querneigung', { label: 'Querneigung °', min: 0, max: 12, step: 0.5 })
      .on('change', move);

    folder.addBlade({ view: 'separator' });

    folder.addButton({ title: 'Knoten dahinter einfügen' }).on('click', () => {
      const road = this.#current;
      if (!road) return;
      const i = this.#state.knoten;
      const j = road.closed ? (i + 1) % road.nodes.length : Math.min(i + 1, road.nodes.length - 1);
      const a = road.nodes[i]!;
      const b = road.nodes[j]!;
      // Mitte zwischen beiden. Auf der Kurve läge sie schöner, aber die Mitte
      // ist vorhersagbar — und ein eingefügter Knoten wird ohnehin sofort
      // verschoben, dafür ist er da.
      road.nodes.splice(i + 1, 0, {
        pos: [
          (a.pos[0] + b.pos[0]) / 2,
          (a.pos[1] + b.pos[1]) / 2,
          (a.pos[2] + b.pos[2]) / 2,
        ],
        width: (a.width + b.width) / 2,
        banking: (a.banking + b.banking) / 2,
      });
      this.#state.knoten = i + 1;
      this.#afterStructureChange(nodeSlider, debug);
    });

    folder.addButton({ title: 'Knoten löschen' }).on('click', () => {
      const road = this.#current;
      // Unter vier Knoten ist eine zentripetale Catmull-Rom-Kurve nicht mehr
      // sinnvoll auswertbar; der Sampler bräche mit einer Meldung ab, die dann
      // wie ein Programmfehler aussähe.
      if (!road || road.nodes.length <= 4) return;
      road.nodes.splice(this.#state.knoten, 1);
      this.#state.knoten = Math.min(this.#state.knoten, road.nodes.length - 1);
      this.#afterStructureChange(nodeSlider, debug);
    });

    folder.addButton({ title: 'Zurücksetzen auf roads.json' }).on('click', () => {
      for (const road of this.#source.roads) {
        const editable = this.#roads.get(road.id);
        if (!editable) continue;
        editable.nodes = road.nodes.map((node) => ({
          pos: [node.pos[0], node.pos[1], node.pos[2]],
          width: node.width,
          banking: node.banking,
        }));
      }
      this.#state.knoten = 0;
      this.#afterStructureChange(nodeSlider, debug);
    });

    folder.addButton({ title: 'roads.json herunterladen' }).on('click', () => {
      this.#download();
    });

    folder.addBlade({ view: 'separator' });
    folder.addBinding(this.#state, 'marker', { label: 'Knoten zeigen' }).on('change', () => {
      if (this.#markers) this.#markers.visible = this.#state.marker;
      if (this.#cursor) this.#cursor.visible = this.#state.marker;
    });

    folder.addBinding(this.#readouts, 'knoten', { readonly: true, label: 'Knotenzahl' });
    folder.addBinding(this.#readouts, 'radius', { readonly: true, label: 'R min' });
    folder.addBinding(this.#readouts, 'steigung', { readonly: true, label: 'Steigung' });
    folder.addBinding(this.#readouts, 'laenge', { readonly: true, label: 'Länge' });

    this.#createMarkers();
    this.#afterStructureChange(nodeSlider, debug);
  }

  #afterStructureChange(slider: BindingApi<unknown, number>, debug: DebugHost): void {
    const road = this.#current;
    if (road) {
      // Tweakpane liest `max` beim Anlegen; nach einem Einfügen muss der Regler
      // den neuen Bereich kennen, sonst lässt sich der letzte Knoten nicht mehr
      // auswählen.
      (slider as unknown as { max: number }).max = road.nodes.length - 1;
    }
    this.#pull();
    this.#rebuild();
    this.#refreshMarkers();
    debug.refresh();
  }

  /** Zustand aus dem gewählten Knoten in die Regler holen. */
  #pull(): void {
    const road = this.#current;
    if (!road) return;
    const node = road.nodes[Math.min(this.#state.knoten, road.nodes.length - 1)];
    if (!node) return;
    this.#state.x = node.pos[0];
    this.#state.y = node.pos[1];
    this.#state.z = node.pos[2];
    this.#state.breite = node.width;
    this.#state.querneigung = node.banking;
  }

  /** Reglerwerte zurück in den Knoten schreiben. */
  #push(): void {
    const road = this.#current;
    if (!road) return;
    const node = road.nodes[this.#state.knoten];
    if (!node) return;
    node.pos = [this.#state.x, this.#state.y, this.#state.z];
    node.width = this.#state.breite;
    node.banking = this.#state.querneigung;
  }

  /**
   * Alle Strecken neu abtasten und den Renderer anstoßen.
   *
   * Bewusst **alle** und nicht nur die geänderte: die Kosten liegen bei ein
   * paar Millisekunden, und eine Teilaktualisierung wäre eine zweite Quelle für
   * Zustandsfehler in einem Werkzeug, dessen Zweck das Vertrauen in die Zahlen
   * ist.
   */
  #rebuild(): void {
    const rebuilt: RoadData[] = [];

    for (const source of this.#source.roads) {
      const road = this.#roads.get(source.id);
      if (!road) continue;

      let sampled;
      try {
        sampled = sampleSpline(road.nodes, {
          closed: road.closed,
          spacing: ROAD_MESH.sampleSpacing,
        });
      } catch (error) {
        // Der Sampler bricht bei doppelten Knoten ab. Im Editor ist das kein
        // Datenfehler, sondern eine Bewegung, die zu weit ging — also wird die
        // Änderung verworfen statt die Anwendung mitzunehmen.
        console.warn(`Spline-Editor: ${(error as Error).message}`);
        return;
      }

      rebuilt.push({
        ...source,
        nodes: road.nodes.map((node) => ({
          pos: [node.pos[0], node.pos[1], node.pos[2]] as const,
          width: node.width,
          banking: node.banking,
        })),
        centerline: Array.from(sampled.positions),
        widths: Array.from(sampled.widths),
        banking: Array.from(sampled.banking),
        length: sampled.length,
        measured: {
          ...source.measured,
          minRadius: minCurveRadius(sampled),
          maxGradient: maxGradient(sampled),
        },
      });
    }

    const current = rebuilt.find((road) => road.id === this.#state.strecke);
    if (current) {
      const settings = ROAD_TYPES[current.type];
      const radius = current.measured.minRadius;
      const gradient = current.measured.maxGradient;
      this.#readouts.knoten = `${current.nodes.length}`;
      this.#readouts.radius =
        `${radius.toFixed(1)} m ${radius >= settings.minRadius ? '✓' : '✗'} ` +
        `(Soll ≥ ${settings.minRadius})`;
      this.#readouts.steigung =
        `${(gradient * 100).toFixed(1)} % ${gradient <= settings.maxGradient ? '✓' : '✗'} ` +
        `(Soll ≤ ${(settings.maxGradient * 100).toFixed(0)} %)`;
      this.#readouts.laenge = `${Math.round(current.length)} m`;
    }

    this.#onRebuild(rebuilt);
  }

  // ── Marker ────────────────────────────────────────────────────────────────

  #createMarkers(): void {
    const cursor = new Mesh(
      new OctahedronGeometry(MARKER_SIZE * 1.6),
      new MeshBasicMaterial({ color: new Color(0xffcc33), depthTest: false, transparent: true, opacity: 0.9 }),
    );
    cursor.name = 'Editor:Cursor';
    cursor.renderOrder = 10;
    cursor.matrixAutoUpdate = false;
    this.#cursor = cursor;
    this.#group.add(cursor);
  }

  #refreshMarkers(): void {
    const road = this.#current;
    if (!road) return;

    if (this.#markers) {
      this.#group.remove(this.#markers);
      this.#markers.geometry.dispose();
      (this.#markers.material as MeshBasicMaterial).dispose();
      this.#markers = null;
    }

    const markers = new InstancedMesh(
      new BoxGeometry(MARKER_SIZE, MARKER_SIZE, MARKER_SIZE),
      new MeshBasicMaterial({ color: new Color(0x33ddff), depthTest: false, transparent: true, opacity: 0.55 }),
      road.nodes.length,
    );
    markers.name = 'Editor:Knoten';
    markers.renderOrder = 9;
    markers.frustumCulled = false;

    const matrix = new Matrix4();
    for (let i = 0; i < road.nodes.length; i++) {
      const pos = road.nodes[i]!.pos;
      markers.setMatrixAt(i, matrix.makeTranslation(pos[0], pos[1] + 1.5, pos[2]));
    }
    markers.instanceMatrix.needsUpdate = true;
    markers.visible = this.#state.marker;

    this.#markers = markers;
    this.#group.add(markers);
    this.#moveCursor();
  }

  #moveCursor(): void {
    const road = this.#current;
    const cursor = this.#cursor;
    if (!road || !cursor) return;
    const node = road.nodes[Math.min(this.#state.knoten, road.nodes.length - 1)];
    if (!node) return;
    cursor.matrix.makeTranslation(node.pos[0], node.pos[1] + 3, node.pos[2]);
    cursor.visible = this.#state.marker;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * Bearbeitetes Netz als `roads.json` herunterladen.
   *
   * Ausgegeben wird die **volle** Datei, einschließlich der abgetasteten
   * Mittellinie — der Terrain-Baker liest sie, und er soll die Kurve nicht
   * selbst auswerten müssen. `measured` bleibt stehen, wo der Editor es nicht
   * neu bestimmen kann (Erdbewegung etwa braucht das Höhenfeld); die Werte, die
   * er kennt, schreibt er neu.
   */
  #download(): void {
    const roads: RoadData[] = [];
    let totalLength = 0;

    for (const source of this.#source.roads) {
      const road = this.#roads.get(source.id);
      if (!road) continue;
      const sampled = sampleSpline(road.nodes, {
        closed: road.closed,
        spacing: ROAD_MESH.sampleSpacing,
      });
      totalLength += sampled.length;

      roads.push({
        ...source,
        nodes: road.nodes.map((node) => ({
          pos: [
            Number(node.pos[0].toFixed(3)),
            Number(node.pos[1].toFixed(3)),
            Number(node.pos[2].toFixed(3)),
          ] as const,
          width: node.width,
          banking: node.banking,
        })),
        centerline: Array.from(sampled.positions, (v) => Number(v.toFixed(3))),
        widths: Array.from(sampled.widths, (v) => Number(v.toFixed(3))),
        banking: Array.from(sampled.banking, (v) => Number(v.toFixed(3))),
        length: Number(sampled.length.toFixed(2)),
        measured: {
          ...source.measured,
          minRadius: Number(minCurveRadius(sampled).toFixed(2)),
          maxGradient: Number(maxGradient(sampled).toFixed(4)),
        },
      });
    }

    const file: RoadFile = {
      ...this.#source,
      roads,
      measured: { totalLength: Number(totalLength.toFixed(2)), count: roads.length },
    };

    const blob = new Blob([`${JSON.stringify(file, null, 1)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'roads.json';
    anchor.click();
    URL.revokeObjectURL(url);

    console.info(
      'Spline-Editor: roads.json exportiert. Nach assets/generated/roads/ legen und ' +
        '`npm run bake && npm run shade` laufen lassen, damit das Terrain dazu passt.',
    );
  }

  dispose(): void {
    if (this.#markers) {
      this.#group.remove(this.#markers);
      this.#markers.geometry.dispose();
      (this.#markers.material as MeshBasicMaterial).dispose();
      this.#markers = null;
    }
    if (this.#cursor) {
      this.#group.remove(this.#cursor);
      this.#cursor.geometry.dispose();
      (this.#cursor.material as MeshBasicMaterial).dispose();
      this.#cursor = null;
    }
  }
}
