import assert from 'node:assert/strict';
import { createInteriorLayout } from '../src/world/city/CityInteriorLayout.ts';

// Catch sealed entrances, furniture blocking the main aisles, and missing floor seams.
const layout = createInteriorLayout();
const routes = [
  [[503.8, 35], [509, 35], [512, 36.8], [516, 36.8], [516, 38]],
  [[644, 146], [644, 142], [644, 138.5], [646, 138.5]],
];
for (const route of routes) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    const steps = Math.ceil(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) / 0.1);
    for (let n = 0; n <= steps; n++) {
      const x = a[0]! + (b[0]! - a[0]!) * n / steps;
      const z = a[1]! + (b[1]! - a[1]!) * n / steps;
      for (const wall of layout.colliders) {
        if (wall.bottom > layout.floorY + 2) continue;
        const dx = Math.max(wall.minX - x, 0, x - wall.maxX);
        const dz = Math.max(wall.minZ - z, 0, z - wall.maxZ);
        assert.ok(Math.hypot(dx, dz) >= 0.6, `Blocked walk-in route at ${x}, ${z}`);
      }
      assert.ok(Math.abs(layout.floors.height(x, z) - layout.floorY) < 1e-6, `Missing flush floor at ${x}, ${z}`);
    }
  }
}
for (const [x, z] of [[508.5, 35], [514, 36.8], [644, 141]]) {
  for (const c of layout.colliders) {
    if (c.bottom > layout.floorY + 2) continue;
    const dx = Math.max(c.minX - x!, 0, x! - c.maxX);
    const dz = Math.max(c.minZ - z!, 0, z! - c.maxZ);
    assert.ok(Math.hypot(dx, dz) >= 1.2, 'Camera turnaround must have clear space');
  }
}
assert.ok(layout.colliders.some(c => c.minX <= 520.9 && c.maxX >= 520.9 && c.minZ <= 35 && c.maxZ >= 35), 'Diner back wall must remain solid');
assert.equal(layout.floors.height(530, 35), -Infinity, 'Interior floors must stay inside the reserved sites');
console.log('City interiors: both entrances, full return routes, floor seams and camera turnarounds are clear.');
