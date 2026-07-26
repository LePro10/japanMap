import {
  AxesHelper,
  Box3,
  Box3Helper,
  BoxGeometry,
  Color,
  GridHelper,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
} from 'three';

import { WORLD } from '@/config/world.config';
import type { EngineContext, System } from '@/core/System';

/** Abstände in Metern, an denen ein Maßstabswürfel steht. */
const MARKER_DISTANCES = [0, 50, 100, 250, 500, 1000, WORLD.half] as const;
const MARKER_SIZE = 2;

/**
 * Orientierungshilfen für die leere Szene: Chunk-Raster, Achsen, Weltvolumen
 * und eine Reihe 2-m-Würfel in bekannten Abständen.
 *
 * Zweck ist nicht Dekoration, sondern Maßstab. "3072 Meter" ist eine Zahl ohne
 * Anschauung — erst wenn ein 2-m-Würfel bei 1000 m steht, sieht man, was die
 * Weltgröße für Sichtweite und Detailgrad bedeutet. Das Raster zeigt zugleich
 * die 12 × 12 Chunks aus WORLD.chunkSize, an denen ab P4 das LOD hängt.
 *
 * Nur im Dev-Build (siehe main.ts). Kostet 4 Draw-Calls.
 */
export class SceneScaffold implements System {
  readonly name = 'SceneScaffold';

  readonly #group = new Group();
  #context: EngineContext | null = null;

  init(context: EngineContext): void {
    this.#context = context;
    this.#group.name = 'SceneScaffold';
    // Seit P1 liegt Terrain in der Szene: das Raster auf Meereshöhe schneidet
    // dann quer durch die Landschaft. Standardmäßig aus, im Ordner
    // "Orientierung" zuschaltbar, wenn man den Maßstab wieder braucht.
    this.#group.visible = false;

    // Raster auf Meereshöhe, eine Zelle = ein Chunk (256 m).
    const grid = new GridHelper(
      WORLD.size,
      WORLD.chunksPerAxis,
      new Color(0x3d5a80),
      new Color(0x1c2733),
    );
    grid.position.y = WORLD.seaLevel;
    this.#group.add(grid);

    // X rot, Y grün, Z blau. Norden ist -Z (PLAN.md, Konventionen).
    this.#group.add(new AxesHelper(200));

    // Das Volumen, in dem alles stattfindet: 3072 × 490 × 3072 m.
    const bounds = new Box3(
      new Vector3(-WORLD.half, WORLD.minHeight, -WORLD.half),
      new Vector3(WORLD.half, WORLD.maxHeight, WORLD.half),
    );
    this.#group.add(new Box3Helper(bounds, new Color(0x2b3a4a)));

    this.#group.add(this.#createDistanceMarkers());

    context.scene.add(this.#group);
    this.#registerDebugControls(context);
  }

  #createDistanceMarkers(): InstancedMesh {
    const geometry = new BoxGeometry(MARKER_SIZE, MARKER_SIZE, MARKER_SIZE);
    const material = new MeshBasicMaterial({ color: 0xe0e6ef, wireframe: true });
    const mesh = new InstancedMesh(geometry, material, MARKER_DISTANCES.length);
    mesh.name = 'Maßstabsmarken';

    const matrix = new Matrix4();
    MARKER_DISTANCES.forEach((distance, index) => {
      matrix.makeTranslation(distance, WORLD.seaLevel + MARKER_SIZE / 2, 0);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  #registerDebugControls(context: EngineContext): void {
    const folder = context.debug?.folder('Orientierung');
    folder?.addBinding(this.#group, 'visible', { label: 'Sichtbar' });
  }

  dispose(): void {
    this.#context?.scene.remove(this.#group);

    // Helper von three besitzen eigene Geometrie und Material und geben sie
    // nicht von selbst frei — ohne diese Schleife bleibt renderer.info.memory
    // nach dispose() stehen, und genau das prüft das P0-Kriterium.
    this.#group.traverse((object) => {
      const disposable = object as {
        geometry?: { dispose(): void };
        material?: { dispose(): void } | Array<{ dispose(): void }>;
      };
      disposable.geometry?.dispose();
      if (Array.isArray(disposable.material)) {
        for (const material of disposable.material) material.dispose();
      } else {
        disposable.material?.dispose();
      }
    });

    this.#group.clear();
    this.#context = null;
  }
}
