import {
  AdditiveBlending,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Scene,
} from 'three';

/**
 * Das Tor, durch das man fahren soll — P23.
 *
 * ## Warum es überhaupt sichtbar sein muss
 *
 * Ein Rennen auf einer offenen Karte hat ein Problem, das ein Rennen auf einer
 * geschlossenen Strecke nicht hat: **man weiß nicht, wo es langgeht.** Die Karte
 * hat acht Strecken, die sich viermal kreuzen; wer an der Kreuzung Ring ×
 * Bergpass falsch abbiegt, fährt zwei Kilometer in die Irre, bevor eine Anzeige
 * es ihm sagt.
 *
 * Ein Tor beantwortet das ohne ein Wort Text, und zwar aus jeder Entfernung, aus
 * der es sichtbar ist.
 *
 * ## Warum nur zwei gleichzeitig
 *
 * Zwölf Tore auf der Ringstraße wären zwölf Draw-Calls und — schlimmer — ein
 * Bild voller Tore, in dem keines mehr etwas bedeutet. Sichtbar sind das
 * **nächste** (voll) und das **übernächste** (halb). Das ist genau die
 * Information, die ein Fahrer braucht: wo muss ich hin, und wohin geht es danach.
 *
 * ## Warum additiv und nicht als Körper
 *
 * Der Vorhang ist ein Rechteck mit additivem Mischen und ohne Tiefenschreiben.
 * Damit ist er von beiden Seiten sichtbar, verdeckt nichts, wirft keinen Schatten
 * und braucht keinen Platz in der Kollisionswelt — man **fährt hindurch**, und
 * das ist der Punkt. Ein Tor, an dem man hängen bleibt, ist ein Hindernis und
 * keine Anweisung.
 *
 * Die Pfosten sind Kästen mit demselben Material: sie geben dem Vorhang eine
 * Kante, und ohne Kante ist ein additives Rechteck in der blauen Stunde ein
 * Nebelfleck.
 */

/** Höhe des Vorhangs über der Fahrbahn, m. */
const CURTAIN_HEIGHT = 7;
/** Was über die halbe Fahrbahnbreite hinaus steht, m. */
const CURTAIN_MARGIN = 1.5;
const POST_WIDTH = 0.45;

export class CheckpointGate {
  readonly #group = new Group();
  readonly #curtain: Mesh;
  readonly #left: Mesh;
  readonly #right: Mesh;
  readonly #material: MeshBasicMaterial;
  #width = 10;

  constructor(color: number, opacity: number) {
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      // **Ohne Nebel.** Der Höhennebel dieser Karte (P2) blendet ein additives
      // Material gegen die Nebelfarbe, und additiv heißt: der Nebel wird
      // *addiert*. Ein Tor auf 400 m wäre damit heller als eines auf 40 m.
      fog: false,
    });
    this.#material = material;

    this.#curtain = new Mesh(new PlaneGeometry(1, 1), material);
    this.#curtain.name = 'Kontrollpunkt:Vorhang';
    this.#left = new Mesh(new BoxGeometry(1, 1, 1), material);
    this.#right = new Mesh(new BoxGeometry(1, 1, 1), material);
    this.#group.add(this.#curtain, this.#left, this.#right);
    this.#group.name = 'Kontrollpunkt';
    this.#group.visible = false;
    // Der Vorhang wird von Hand positioniert, jeden Frame höchstens einmal.
    this.#group.matrixAutoUpdate = true;
  }

  addTo(scene: Scene): void {
    scene.add(this.#group);
  }

  get visible(): boolean {
    return this.#group.visible;
  }

  hide(): void {
    this.#group.visible = false;
  }

  /** Tor an eine Stelle setzen. `forward` ist die Fahrtrichtung in XZ. */
  place(x: number, y: number, z: number, forwardX: number, forwardZ: number, halfWidth: number): void {
    const width = (halfWidth + CURTAIN_MARGIN) * 2;
    if (Math.abs(width - this.#width) > 0.01) {
      this.#width = width;
      this.#curtain.scale.set(width, CURTAIN_HEIGHT, 1);
      this.#left.scale.set(POST_WIDTH, CURTAIN_HEIGHT, POST_WIDTH);
      this.#right.scale.set(POST_WIDTH, CURTAIN_HEIGHT, POST_WIDTH);
    }
    // Rechts der Fahrtrichtung ist `(−fz, fx)` — die Konvention aus
    // `Vehicle.#updateBasis` (`right = forward × up`).
    const rx = -forwardZ;
    const rz = forwardX;
    const half = width / 2;
    const cy = y + CURTAIN_HEIGHT / 2;
    this.#group.position.set(0, 0, 0);
    this.#curtain.position.set(x, cy, z);
    this.#curtain.rotation.set(0, Math.atan2(forwardX, forwardZ), 0);
    this.#left.position.set(x - rx * half, cy, z - rz * half);
    this.#right.position.set(x + rx * half, cy, z + rz * half);
    this.#group.visible = true;
  }

  setColor(color: number, opacity: number): void {
    this.#material.color.setHex(color);
    this.#material.opacity = opacity;
  }

  dispose(): void {
    this.#group.removeFromParent();
    this.#curtain.geometry.dispose();
    this.#left.geometry.dispose();
    this.#right.geometry.dispose();
    this.#material.dispose();
  }
}
