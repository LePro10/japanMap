import { CITY, CITY_GROUND_Y } from '@/config/city.config';
import type { CityCollider } from './CityGenerator';
import { LocalSurfaces } from '../settlements/LocalSurfaces';

export type InteriorFinish = 'plaster' | 'wood' | 'dark' | 'tile' | 'metal' | 'red' | 'green';
export interface InteriorBox {
  x: number; y: number; z: number; w: number; h: number; d: number;
  finish: InteriorFinish;
}

/** Shared collision/render layout: shell openings cannot be accidentally painted over. */
export function createInteriorLayout(): {
  boxes: InteriorBox[]; colliders: CityCollider[]; floors: LocalSurfaces; floorY: number;
} {
  const floorY = CITY_GROUND_Y + CITY.sidewalk.height;
  const boxes: InteriorBox[] = [], colliders: CityCollider[] = [];
  const floors = new LocalSurfaces();
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, finish: InteriorFinish, solid = true, visible = true): void => {
    if (visible) boxes.push({ x, y: floorY + y, z, w, h, d, finish });
    if (solid) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, bottom: floorY + y - h / 2, top: floorY + y + h / 2 });
  };
  const floor = (x0: number, z0: number, x1: number, z1: number, finish: InteriorFinish): void => {
    floors.quad([x0, floorY, z0], [x1, floorY, z0], [x1, floorY, z1], [x0, floorY, z1]);
    box((x0 + x1) / 2, -0.06, (z0 + z1) / 2, x1 - x0, 0.12, z1 - z0, finish, false);
  };
  floor(505, 27, 521, 43, 'wood');
  floor(503.5, 33.5, 505, 36.5, 'tile');
  // Diner: 3 m west opening, 5.4 m clear ceiling, service counter to the north.
  box(505.12, 2.7, 30.25, 0.24, 5.4, 6.5, 'plaster');
  box(505.12, 2.7, 39.75, 0.24, 5.4, 6.5, 'plaster');
  box(505.12, 4.45, 35, 0.24, 1.9, 3, 'plaster');
  box(520.88, 2.7, 35, 0.24, 5.4, 16, 'plaster');
  box(513, 2.7, 27.12, 16, 5.4, 0.24, 'plaster');
  box(513, 0.5, 42.88, 16, 1, 0.24, 'plaster');
  box(513, 4.7, 42.88, 16, 1.4, 0.24, 'plaster');
  for (const x of [505.2, 509, 513, 517, 520.8]) box(x, 2.5, 42.88, 0.18, 3, 0.24, 'wood');
  // Window collisions are transparent openings filled by glazing in the render module.
  colliders.push({ minX: 505, maxX: 521, minZ: 42.76, maxZ: 43, bottom: floorY + 1, top: floorY + 4 });
  box(513, 5.55, 35, 16.4, 0.3, 16.4, 'wood');
  box(513, 7.35, 35, 15.8, 3.3, 15.8, 'plaster');
  box(513, 9.12, 35, 16.8, 0.24, 16.8, 'dark');
  box(516, 0.53, 28.1, 8, 1.06, 1.3, 'metal');
  box(516, 0.6, 32, 8.4, 1.2, 1.2, 'wood');
  box(516, 1.25, 32, 8.8, 0.1, 1.45, 'dark');
  for (const x of [512.4, 514.1, 515.8, 517.5, 519.2]) box(x, 0.38, 33.65, 0.5, 0.76, 0.5, 'red', true, false);
  for (const x of [508.2, 513.5, 518.5]) {
    box(x, 0.72, 40.4, 2.2, 0.12, 1.25, 'wood');
    box(x, 0.34, 40.4, 0.3, 0.68, 0.6, 'dark');
    box(x, 0.4, 41.7, 2.25, 0.8, 0.55, 'red');
    box(x, 0.72, 41.95, 2.25, 1.1, 0.18, 'red');
    for (const dx of [-0.65, 0.65]) box(x + dx, 0.5, 39.2, 0.55, 1, 0.6, 'wood', true, false);
  }
  // Corner Mart: 3 m south opening; center aisle remains 4 m wide.
  floor(638, 136, 650, 145, 'tile');
  floor(642.5, 145, 645.5, 146.5, 'tile');
  box(638.12, 2.6, 140.5, 0.24, 5.2, 9, 'plaster');
  box(649.88, 2.6, 140.5, 0.24, 5.2, 9, 'plaster');
  box(644, 2.6, 136.12, 12, 5.2, 0.24, 'plaster');
  for (const x of [640.25, 647.75]) {
    box(x, 0.38, 144.88, 4.5, 0.76, 0.24, 'green');
    box(x, 4.15, 144.88, 4.5, 2.1, 0.24, 'plaster');
    colliders.push({ minX: x - 2.25, maxX: x + 2.25, minZ: 144.76, maxZ: 145, bottom: floorY + 0.76, top: floorY + 3.1 });
  }
  box(644, 4.15, 144.88, 3, 2.1, 0.24, 'plaster');
  box(644, 5.35, 140.5, 12.5, 0.3, 9.5, 'plaster');
  box(644, 5.65, 140.5, 12.8, 0.3, 9.8, 'dark');
  for (const x of [640.35, 647.65]) {
    box(x, 0.88, 140.75, 0.08, 1.76, 2.6, 'metal', false);
    colliders.push({ minX: x - 0.61, maxX: x + 0.61, minZ: 139.375, maxZ: 142.125, bottom: floorY, top: floorY + 1.8 });
  }
  box(645, 1.25, 136.41, 7.7, 2.5, 0.08, 'dark', false);
  box(645, 0.08, 136.8, 7.7, 0.16, 0.85, 'dark', false);
  box(645, 2.45, 136.8, 7.7, 0.1, 0.85, 'dark', false);
  colliders.push({ minX: 641.15, maxX: 648.85, minZ: 136.375, maxZ: 137.225, bottom: floorY, top: floorY + 2.5 });
  box(640, 0.55, 143.1, 2.1, 1.1, 0.85, 'green');
  box(649.2, 1.1, 143.45, 1, 2.2, 1.1, 'red');
  for (const z of [137.25, 138]) colliders.push({ minX: 638.3, maxX: 639.1, minZ: z - 0.38, maxZ: z + 0.38, bottom: floorY, top: floorY + 1.7 });
  for (const x of [646.1, 646.7]) colliders.push({ minX: x - 0.23, maxX: x + 0.23, minZ: 144.01, maxZ: 144.49, bottom: floorY, top: floorY + 0.74 });
  return { boxes, colliders, floors, floorY };
}
