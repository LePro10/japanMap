import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { buildDecals } from '../src/world/roads/Decals.ts';
import { buildRoadGeometry } from '../src/world/roads/RoadMeshBuilder.ts';

function road(overrides = {}) {
  const centerline = Array.from({ length: 51 }, (_, i) => [0, 10, i * 2]).flat();
  return { id: 'branch', type: 'city', closed: false, nodes: [], tags: [],
    centerline, widths: Array(51).fill(8), banking: Array(51).fill(0),
    length: 100, trimStart: 0, trimEnd: 0, junctions: [], rails: [], measured: {}, ...overrides };
}
const junction = (at = 'start') => ({ at, with: 'host', trim: 6, moved: 0, height: 10 });
const scale = matrix => new Vector3().setFromMatrixScale(matrix);

test('footpaths do not receive drains, asphalt repairs, or zebra crossings', () => {
  const result = buildDecals([road({ type: 'pfad', junctions: [junction()], trimStart: 6 })]);
  assert.equal(result.matrices.length, 0);
});

test('decals stay wholly inside the rendered branch after junction trimming', () => {
  const result = buildDecals([road({ junctions: [junction()], trimStart: 6, trimEnd: 6 })]);
  for (const matrix of result.matrices) {
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) {
      const point = new Vector3(x, y, 0).applyMatrix4(matrix);
      assert.ok(point.z >= 6 - 1e-6 && point.z <= 94 + 1e-6, `decal extends into missing asphalt at z=${point.z}`);
    }
  }
});

test('stop bars follow the incoming left-hand lane at both ends', () => {
  const result = buildDecals([road({ junctions: [junction(), junction('end')], trimStart: 6, trimEnd: 6 })]);
  const stops = result.matrices.filter(m => Math.abs(scale(m).y - .4) < 1e-6);
  assert.equal(stops.length, 2);
  assert.ok(stops[0].elements[12] < 0, 'start-end approach stops on right of increasing road direction');
  assert.ok(stops[1].elements[12] > 0, 'far-end approach stops on left of increasing road direction');
});

test('zebra crossings clear the whole host road at shallow junction angles', () => {
  const angle = Math.PI / 12;
  const branch = road({ centerline: Array.from({ length: 51 }, (_, i) => [i * 2 * Math.cos(angle), 10, i * 2 * Math.sin(angle)]).flat(),
    trimStart: 6, junctions: [junction()] });
  const host = road({ id: 'host', type: 'highway', centerline: Array.from({ length: 51 }, (_, i) => [i * 2 - 50, 10, 0]).flat(), widths: Array(51).fill(9) });
  const stripes = buildDecals([host, branch]).matrices.filter(m => Math.abs(scale(m).x - .45) < 1e-6);
  assert.ok(stripes.length >= 2, 'the branch still has a usable crossing');
  for (const matrix of stripes) for (const x of [-.5, .5]) for (const y of [-.5, .5]) {
    const point = new Vector3(x, y, 0).applyMatrix4(matrix);
    assert.ok(point.z > 6.1, `zebra stripe is inside the host's pavement/shoulder at z=${point.z}`);
  }
});

test('host edge lines leave the branch mouth open', () => {
  const branch = road({ trimStart: 6, junctions: [junction()] });
  const host = road({ id: 'host', type: 'highway', centerline: Array.from({ length: 51 }, (_, i) => [i * 2 - 50, 10, 0]).flat(), widths: Array(51).fill(9) });
  const lines = buildDecals([host, branch]).matrices.filter(m => Math.abs(scale(m).x - .15) < 1e-6);
  for (const matrix of lines) {
    const center = new Vector3().setFromMatrixPosition(matrix);
    assert.ok(!(Math.abs(center.x) < 4 && center.z >= 0 && center.z < 6), `paint closes the road mouth at ${center.toArray()}`);
  }
});

test('road mesh respects authored widths instead of replacing them with the type default', () => {
  const built = buildRoadGeometry(road({ widths: Array(51).fill(12) }));
  const positions = built.geometry.getAttribute('position');
  assert.ok(Math.abs(positions.getX(1) - positions.getX(2)) >= 11.999);
  built.geometry.dispose();
});

test('edge paint follows banked asphalt instead of floating above or disappearing underneath it', () => {
  const count = 100, radius = 30;
  const centerline = Array.from({ length: count }, (_, i) => {
    const a = i / count * Math.PI * 2;
    return [Math.cos(a) * radius, 10, Math.sin(a) * radius];
  }).flat();
  const curved = road({ closed: true, centerline, widths: Array(count).fill(8), banking: Array(count).fill(8), length: 2 * Math.PI * radius });
  const mesh = buildRoadGeometry(curved).geometry;
  const positions = mesh.getAttribute('position');
  const firstEdge = buildDecals([curved]).matrices[0];
  // At the first station, interpolate across the mesh's two pavement edges.
  const left = new Vector3().fromBufferAttribute(positions, 1);
  const right = new Vector3().fromBufferAttribute(positions, 2);
  const center = new Vector3().setFromMatrixPosition(firstEdge);
  const across = right.clone().sub(left);
  const t = center.clone().sub(left).dot(across) / across.lengthSq();
  const surface = left.addScaledVector(across, t);
  assert.ok(Math.abs(center.y - surface.y) < .005, `paint is ${(center.y - surface.y).toFixed(3)}m away from banked road`);
  mesh.dispose();
});
