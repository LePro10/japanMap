import {
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three';

import type { DebugHost } from '@/debug/DebugHost';
import type { PlacedProp, PropAsset, PropSystem } from './PropSystem';

/** Ein Schritt, den `Zurück` rückgängig machen kann. */
interface UndoStep {
  readonly asset: PropAsset;
  /** Kopie **vor** der Änderung; `null` heißt „gab es noch nicht". */
  readonly before: PlacedProp | null;
  readonly index: number;
}

/**
 * Prop-Editor — PLAN.md P5 / 5.3.
 *
 * **Wozu er da ist, und wozu nicht** — dieselbe Arbeitsteilung wie beim
 * Spline-Editor aus P3: `tools/gen-props.mjs` legt die Karte an und sucht dazu
 * im Gelände nach tragfähigen Stellen; dieser Editor ist das Werkzeug danach,
 * für den einen Torii, der zwei Meter zu weit links steht. Ohne ihn ließe sich
 * an einer einzelnen Stelle nichts ändern, ohne den Generator umzuschreiben und
 * damit die ganze Karte neu zu würfeln.
 *
 * **Er schreibt nicht selbst.** Wie der Spline-Editor exportiert er
 * `props.json` als Download; die Datei wandert von Hand nach `assets/`. Ein
 * Schreib-Endpunkt im Dev-Server wäre bequemer und würde beim ersten
 * Fehlgriff die einzige Quelle überschreiben.
 *
 * > **Der Raycast geht über `stage.slots`, nicht über die `instanceId`.** Die
 * > Instanzplätze werden je Frame neu belegt — nach Culling und LOD-Stufe.
 * > Wer die `instanceId` als Index in die Platzierungsliste nimmt, greift beim
 * > zweiten Klick daneben, und zwar reproduzierbar nur dann, wenn sich die
 * > Kamera zwischendurch bewegt hat.
 *
 * Lebt nur im Dev-Build; der Import steht in `PropSystem`-Nähe hinter
 * `import.meta.env.DEV`.
 */
export class PropEditor {
  readonly #raycaster = new Raycaster();
  readonly #pointer = new Vector2();
  readonly #plane = new Plane();
  readonly #hit = new Vector3();
  readonly #undo: UndoStep[] = [];

  #selected: { asset: PropAsset; index: number } | null = null;
  #dragging = false;
  #marker: Mesh | null = null;

  readonly #state = {
    auswahl: '—',
    position: '—',
    drehung: 0,
    groesse: 1,
    hoehe: 0,
  };

  constructor(
    private readonly system: PropSystem,
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    private readonly scene: Scene,
    private readonly seed: number,
  ) {
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointermove', this.#onPointerMove);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    window.addEventListener('keydown', this.#onKeyDown);
  }

  // ── Auswahl ──────────────────────────────────────────────────────────────

  #updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    // Nur mit gedrückter Alt-Taste: die linke Maustaste gehört der Kamera, und
    // ein Editor, der sie ihr wegnimmt, macht das Fliegen unmöglich.
    if (!event.altKey || event.button !== 0) return;
    event.preventDefault();
    this.#updatePointer(event);
    this.#raycaster.setFromCamera(this.#pointer, this.camera);

    let best: { asset: PropAsset; index: number; distance: number } | null = null;
    for (const asset of this.system.assets) {
      for (const stage of asset.stages) {
        if (!stage.count) continue;
        for (const intersection of this.#raycaster.intersectObject(stage.mesh, false)) {
          const instance = intersection.instanceId;
          if (instance === undefined) continue;
          const index = stage.slots[instance];
          if (index === undefined) continue;
          if (!best || intersection.distance < best.distance) {
            best = { asset, index, distance: intersection.distance };
          }
        }
      }
    }
    if (!best) return;
    this.#select(best.asset, best.index);
    this.#dragging = true;
  };

  #select(asset: PropAsset, index: number): void {
    this.#selected = { asset, index };
    const prop = asset.placements[index]!;
    this.#state.auswahl = `${asset.id} #${index}`;
    this.#state.drehung = Number(((prop.rot * 180) / Math.PI).toFixed(1));
    this.#state.groesse = Number(prop.scale.toFixed(3));
    this.#state.hoehe = Number(prop.yOffset.toFixed(2));
    this.#refreshMarker();
  }

  #refreshMarker(): void {
    const selection = this.#selected;
    if (!selection) {
      if (this.#marker) this.#marker.visible = false;
      return;
    }
    const prop = selection.asset.placements[selection.index]!;
    if (!this.#marker) {
      // Ein flacher Ring auf dem Boden statt einer Hüllbox: die Box eines
      // 87-m-Felsens füllte das halbe Bild, der Ring zeigt den Fußpunkt — und
      // genau der wird verschoben.
      const geometry = new RingGeometry(1.6, 2.1, 24);
      geometry.rotateX(-Math.PI / 2);
      const material = new MeshBasicMaterial({ color: 0xffcc33, depthTest: false, transparent: true, opacity: 0.85 });
      this.#marker = new Mesh(geometry, material);
      this.#marker.name = 'PropEditor:Marker';
      this.#marker.renderOrder = 999;
      this.scene.add(this.#marker);
    }
    this.#marker.visible = true;
    this.#marker.position.set(prop.x, prop.y + 0.12, prop.z);
    const size = Math.max(1, selection.asset.bounds.radius * prop.scale * 0.6);
    this.#marker.scale.setScalar(size);
    this.#state.position = `${prop.x.toFixed(1)} / ${prop.z.toFixed(1)}`;
  }

  // ── Verschieben ──────────────────────────────────────────────────────────

  readonly #onPointerMove = (event: PointerEvent): void => {
    if (!this.#dragging || !this.#selected) return;
    const prop = this.#selected.asset.placements[this.#selected.index]!;
    this.#updatePointer(event);
    this.#raycaster.setFromCamera(this.#pointer, this.camera);
    // Waagerechte Ebene auf der aktuellen Prop-Höhe. Gegen das Gelände zu
    // schneiden wäre genauer und braucht einen Raycast gegen ein Mesh, das es
    // nicht gibt: das Terrain wird im Vertex-Shader verschoben, seine
    // CPU-Geometrie ist ein flaches Einheitsgitter.
    this.#plane.set(new Vector3(0, 1, 0), -prop.y);
    if (!this.#raycaster.ray.intersectPlane(this.#plane, this.#hit)) return;
    prop.x = this.#hit.x;
    prop.z = this.#hit.z;
    this.system.snap(prop);
    this.#refreshMarker();
  };

  readonly #onPointerUp = (): void => {
    this.#dragging = false;
  };

  // ── Tastatur ─────────────────────────────────────────────────────────────

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey) return;
    const selection = this.#selected;
    if (event.key === 'z' && selection === null) return;
    switch (event.key) {
      case 'd':
        this.duplicate();
        break;
      case 'x':
        this.remove();
        break;
      case 'z':
        this.undoLast();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // ── Befehle ──────────────────────────────────────────────────────────────

  #push(asset: PropAsset, index: number, before: PlacedProp | null): void {
    this.#undo.push({ asset, index, before: before ? { ...before } : null });
    if (this.#undo.length > 64) this.#undo.shift();
  }

  duplicate(): void {
    const selection = this.#selected;
    if (!selection) return;
    const source = selection.asset.placements[selection.index]!;
    // Versetzt, sonst steckt die Kopie exakt im Original und man hält den
    // Klon für einen fehlgeschlagenen Befehl.
    const copy: PlacedProp = { ...source, x: source.x + 6, z: source.z + 6 };
    this.system.snap(copy);
    selection.asset.placements.push(copy);
    const index = selection.asset.placements.length - 1;
    this.#push(selection.asset, index, null);
    this.#select(selection.asset, index);
  }

  remove(): void {
    const selection = this.#selected;
    if (!selection) return;
    const prop = selection.asset.placements[selection.index]!;
    this.#push(selection.asset, selection.index, prop);
    selection.asset.placements.splice(selection.index, 1);
    this.#selected = null;
    this.#state.auswahl = '—';
    this.#refreshMarker();
  }

  undoLast(): void {
    const step = this.#undo.pop();
    if (!step) return;
    if (step.before === null) step.asset.placements.splice(step.index, 1);
    else step.asset.placements.splice(step.index, 0, step.before);
    this.#selected = null;
    this.#state.auswahl = '—';
    this.#refreshMarker();
  }

  /**
   * Bearbeiteten Stand als `props.json` herunterladen.
   *
   * Derselbe Weg wie beim Spline-Editor: Blob, Anker, Klick. Die Datei landet
   * im Download-Ordner und wird von Hand nach `assets/` gelegt — dieser eine
   * Handgriff ist die Sicherung dagegen, dass ein Fehlgriff im Editor die
   * eingecheckte Quelle überschreibt.
   */
  download(): void {
    const file = this.system.toFile(this.seed);
    const blob = new Blob([`${JSON.stringify(file, null, 1)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'props.json';
    anchor.click();
    URL.revokeObjectURL(url);
    console.info(
      `Prop-Editor: props.json mit ${file.props.length} Platzierungen exportiert. ` +
        'Nach assets/ legen und die Seite neu laden.',
    );
  }

  registerDebug(host: DebugHost): void {
    const folder = host.folder('Prop-Editor');
    if (!folder) return;

    folder.addBinding({ hilfe: 'Alt+Klick wählt und zieht' }, 'hilfe', {
      readonly: true,
      label: 'Bedienung',
    });
    folder.addBinding(this.#state, 'auswahl', { readonly: true, label: 'Ausgewählt' });
    folder.addBinding(this.#state, 'position', { readonly: true, label: 'X / Z' });

    folder
      .addBinding(this.#state, 'drehung', { label: 'Drehung (°)', min: -180, max: 180, step: 1 })
      .on('change', (event: { value: number }) => {
        const selection = this.#selected;
        if (!selection) return;
        selection.asset.placements[selection.index]!.rot = (event.value * Math.PI) / 180;
      });

    folder
      .addBinding(this.#state, 'groesse', { label: 'Größe', min: 0.3, max: 3, step: 0.01 })
      .on('change', (event: { value: number }) => {
        const selection = this.#selected;
        if (!selection) return;
        selection.asset.placements[selection.index]!.scale = event.value;
        this.#refreshMarker();
      });

    folder
      .addBinding(this.#state, 'hoehe', { label: 'Höhenversatz (m)', min: -8, max: 8, step: 0.05 })
      .on('change', (event: { value: number }) => {
        const selection = this.#selected;
        if (!selection) return;
        const prop = selection.asset.placements[selection.index]!;
        prop.yOffset = event.value;
        this.system.snap(prop);
        this.#refreshMarker();
      });

    folder.addButton({ title: 'Duplizieren (Alt+D)' }).on('click', () => this.duplicate());
    folder.addButton({ title: 'Löschen (Alt+X)' }).on('click', () => this.remove());
    folder.addButton({ title: 'Zurück (Alt+Z)' }).on('click', () => this.undoLast());
    folder
      .addButton({ title: 'Freiflächen neu anwenden' })
      .on('click', () => this.system.refreshClearance());
    folder.addButton({ title: 'props.json herunterladen' }).on('click', () => this.download());
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.#onPointerDown);
    this.canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.canvas.removeEventListener('pointerup', this.#onPointerUp);
    window.removeEventListener('keydown', this.#onKeyDown);
    if (this.#marker) {
      this.scene.remove(this.#marker);
      this.#marker.geometry.dispose();
      (this.#marker.material as MeshBasicMaterial).dispose();
      this.#marker = null;
    }
  }
}
