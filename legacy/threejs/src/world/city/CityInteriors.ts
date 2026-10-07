import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide,
  Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INTERIOR_SITES } from '@/config/tokyoLayout.mjs';
import type { CityCollider } from './CityGenerator';
import type { LocalSurfaces } from '../settlements/LocalSurfaces';
import { createInteriorLayout } from './CityInteriorLayout';

export interface CityInteriorDestination {
  id: string; name: string; x: number; y: number; z: number; description: string;
}

const ATLAS_ASPECT = [5.2, 2.33, 7.2, 1.3, 1, 1, 1, 1, 1, 1, 10.8, 2.1, 1, 1.2, 1, 1.3];

/** Original hand-drawn signs and product labels, shared by every decal in both rooms. */
function makeAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const cells = [
    ['こもれび食堂', 'KOMOREBI DINER', 'RICE • NOODLES • TEA', '#203d3a', '#fff0c7'],
    ['本日の献立', 'TODAY’S KITCHEN', '山菜うどん  680   /   焼魚定食  920', '#f5e8c8', '#3b3430'],
    ['小路マート', 'KŌJI CORNER MART', 'EVERYDAY GOODS • OPEN 24H', '#14665d', '#fff9de'],
    ['いらっしゃいませ', 'WELCOME', 'OPEN • PLEASE COME IN', '#e8dbbb', '#294b43'],
    ['お茶', 'MOUNTAIN TEA', 'FRESH BREW  •  140', '#406954', '#f5edc9'],
    ['柚子', 'YUZU SODA', 'BRIGHT & BUBBLY', '#d5ac3e', '#243e3b'],
    ['珈琲', 'SLOW ROAST', 'KŌJI COFFEE', '#73503d', '#fff0ca'],
    ['お米', 'HILL RICE', 'HARVEST SELECTION', '#e7dbbc', '#6a493e'],
    ['のり', 'SEA CRISPS', 'LIGHTLY SALTED', '#264940', '#e9e1b4'],
    ['お菓子', 'LITTLE CLOUD', 'RICE CRACKERS', '#bb6851', '#fff0ca'],
    ['冷たい飲み物', 'CHILLED DRINKS', 'TEA • FRUIT • SPARKLING', '#dce9d9', '#265951'],
    ['お会計', 'CHECKOUT', 'THANK YOU FOR VISITING', '#f0e6ca', '#265951'],
    ['こもれび', 'LUNCH SET', 'RICE + SOUP + SEASONAL SIDES', '#a34537', '#fff0ca'],
    ['町のたより', 'NEIGHBOURHOOD NOTES', 'SATURDAY MARKET • RIVER WALK', '#e3d5b4', '#4a4539'],
    ['手づくり', 'FRESH DAILY', 'FROM OUR LITTLE KITCHEN', '#243c39', '#f7e6b5'],
    ['分別にご協力ください', 'RECYCLE HERE', 'CANS  /  BOTTLES  /  PAPER', '#e1e6cc', '#2f5c50'],
  ];
  cells.forEach(([jp, en, sub, bg, fg], i) => {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 512;
    ctx.fillStyle = bg!; ctx.fillRect(x, y, 512, 512);
    const aspect = ATLAS_ASPECT[i]!;
    if (aspect > 1.5) {
      const h = 480 / aspect, top = y + 256 - h / 2;
      ctx.strokeStyle = fg!; ctx.lineWidth = 2; ctx.strokeRect(x + 18, top + 3, 476, h - 6);
      ctx.fillStyle = fg!; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${h * 0.3}px "Yu Gothic", sans-serif`; ctx.fillText(jp!, x + 256, top + h * 0.25, 450);
      ctx.font = `bold ${h * 0.19}px sans-serif`; ctx.fillText(en!, x + 256, top + h * 0.58, 450);
      ctx.font = `${h * 0.12}px sans-serif`; ctx.fillText(sub!, x + 256, top + h * 0.82, 450);
      return;
    }
    ctx.strokeStyle = fg!; ctx.lineWidth = 5; ctx.strokeRect(x + 18, y + 18, 476, 476);
    ctx.fillStyle = fg!; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 49px "Yu Gothic", sans-serif'; ctx.fillText(jp!, x + 256, y + 115, 456);
    ctx.font = 'bold 34px sans-serif'; ctx.fillText(en!, x + 256, y + 208, 455);
    ctx.font = '22px sans-serif'; ctx.fillText(sub!, x + 256, y + 390, 458);
    // Simple original bowl/sun/leaf crest makes the packages legible from a few metres away.
    ctx.beginPath(); ctx.arc(x + 256, y + 290, 47, 0, Math.PI); ctx.fill();
    ctx.fillRect(x + 199, y + 281, 114, 7);
    for (let s = 0; s < 3; s++) {
      ctx.beginPath(); ctx.moveTo(x + 239 + s * 18, y + 265);
      ctx.bezierCurveTo(x + 225 + s * 18, y + 246, x + 253 + s * 18, y + 241, x + 239 + s * 18, y + 225);
      ctx.stroke();
    }
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Two real world-space interiors. No teleport, point lights, per-item materials or hidden floor. */
export function buildCityInteriors(): {
  group: Group; colliders: CityCollider[]; floors: LocalSurfaces;
  destinations: CityInteriorDestination[]; dispose(): void;
} {
  const layout = createInteriorLayout(), y0 = layout.floorY;
  const group = new Group(); group.name = 'Walk-in city interiors';
  const atlas = makeAtlas();
  const material = (color: number, roughness = 0.8, metalness = 0): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, roughness, metalness, emissive: new Color(color), emissiveIntensity: 0.14 });
  const materials: Record<string, MeshStandardMaterial> = {
    plaster: material(0xd9cdb0), wood: material(0x987044), dark: material(0x293a37),
    tile: material(0xd8dccb), metal: material(0xadb8b2, 0.35, 0.6), red: material(0xa54d3e),
    green: material(0x347567), grain: material(0x795b3c), ceramic: material(0xf2e6cc, 0.28), leaf: material(0x437353),
    amber: material(0xc49942, 0.35), glass: new MeshStandardMaterial({ color: 0xa4cbbb, transparent: true, opacity: 0.17, roughness: 0.15, side: DoubleSide, depthWrite: false }),
    glow: new MeshStandardMaterial({ color: 0xffe3a4, emissive: 0xffd699, emissiveIntensity: 2.0, roughness: 0.5 }),
    atlas: new MeshStandardMaterial({ map: atlas, roughness: 0.75, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.3, side: DoubleSide }),
  };
  const buckets = new Map<string, BufferGeometry[]>();
  const add = (g: BufferGeometry, finish: string, x: number, y: number, z: number, turn = 0): void => {
    g.rotateY(turn); g.translate(x, y0 + y, z);
    const key = `${x < 600 ? 'diner' : 'mart'}:${finish}`;
    const parts = buckets.get(key); if (parts) parts.push(g); else buckets.set(key, [g]);
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, finish: string, turn = 0): void =>
    add(new BoxGeometry(w, h, d), finish, x, y, z, turn);
  const cylinder = (x: number, y: number, z: number, r: number, h: number, finish: string, top = r): void =>
    add(new CylinderGeometry(top, r, h, 12), finish, x, y, z);
  const sphere = (x: number, y: number, z: number, r: number, finish: string): void =>
    add(new SphereGeometry(r, 10, 6), finish, x, y, z);
  const sign = (cell: number, x: number, y: number, z: number, w: number, h: number, turn = 0): void => {
    const g = new PlaneGeometry(w, h), uv = g.getAttribute('uv');
    const aspect = ATLAS_ASPECT[cell]!, span = aspect > 1.5 ? 0.96 / aspect : 0.96;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ((cell % 4) + 0.02 + uv.getX(i) * 0.96) / 4, (3 - Math.floor(cell / 4) + (1 - span) / 2 + uv.getY(i) * span) / 4);
    add(g, 'atlas', x, y, z, turn);
  };
  for (const b of layout.boxes) box(b.x, b.y - y0, b.z, b.w, b.h, b.d, b.finish);

  // Komorebi: timber shopfront, a high open noren, upper windows, weathered roof ribs.
  sign(0, 504.96, 4.38, 35, 6.8, 1.3, -Math.PI / 2);
  for (const z of [33.75, 34.58, 35.42, 36.25]) box(504.91, 3.04, z, 0.055, 0.66, 0.78, 'green');
  for (const z of [29, 31.5, 38.5, 41]) {
    box(504.95, 1.7, z, 0.04, 2.1, 1.5, 'dark');
    for (let j = 0; j < 5; j++) box(504.88, 1.7, z - 0.6 + j * 0.3, 0.06, 2.1, 0.045, 'wood');
  }
  for (const z of [29.5, 33, 37, 40.5]) {
    box(505.07, 7.35, z, 0.06, 1.5, 2.3, 'dark');
    box(505, 7.35, z, 0.1, 1.52, 0.07, 'wood');
    box(504.95, 6.56, z, 0.3, 0.12, 2.6, 'wood');
  }
  for (let z = 27; z < 43; z += 0.6) box(513, 9.27, z, 16.9, 0.05, 0.035, 'metal');
  box(513, 2.5, 42.89, 15.4, 3, 0.025, 'glass');
  for (let x = 505.6; x < 521; x += 0.5) box(x, 0.006, 35, 0.012, 0.012, 15.5, 'grain');
  box(520.73, 0.62, 35, 0.05, 1.22, 15.4, 'wood');
  box(520.68, 1.25, 35, 0.08, 0.08, 15.4, 'dark');
  for (const z of [29.5, 35, 40.5]) box(513, 5.23, z, 15.5, 0.3, 0.24, 'dark');
  for (const x of [508.2, 513.5, 518.5]) {
    cylinder(x, 4.3, 39.7, 0.018, 1.4, 'dark');
    cylinder(x, 3.61, 39.7, 0.48, 0.35, 'red', 0.22);
    cylinder(x, 3.43, 39.7, 0.36, 0.035, 'glow');
    for (const dx of [-0.5, 0.5]) {
      cylinder(x + dx, 0.81, 40.4, 0.23, 0.035, 'ceramic');
      cylinder(x + dx, 0.91, 40.4, 0.12, 0.15, 'ceramic', 0.2);
      cylinder(x + dx, 0.993, 40.4, 0.17, 0.015, 'amber');
      box(x + dx, 0.81, 40.77, 0.4, 0.018, 0.028, 'dark');
      cylinder(x + dx + 0.29, 0.89, 40.2, 0.065, 0.16, 'green');
    }
    box(x, 0.87, 40.32, 0.12, 0.2, 0.1, 'dark');
    sign(12, x, 1.03, 40.32, 0.32, 0.38);
    for (const dx of [-0.65, 0.65]) {
      box(x + dx, 0.48, 39.2, 0.55, 0.1, 0.56, 'wood');
      box(x + dx, 0.83, 38.94, 0.55, 0.35, 0.06, 'wood');
      for (const lx of [-0.22, 0.22]) for (const lz of [-0.22, 0.22])
        box(x + dx + lx, lz < 0 ? 0.49 : 0.24, 39.2 + lz, 0.055, lz < 0 ? 0.98 : 0.48, 0.055, 'dark');
    }
  }
  // Open kitchen: tiled backsplash, worktop, cookers, extractor, stacked bowls and tools.
  box(516, 1.8, 27.27, 8, 1.4, 0.025, 'tile');
  for (let x = 512; x < 520; x += 0.45) box(x, 1.8, 27.3, 0.016, 1.4, 0.016, 'metal');
  for (const y of [1.25, 1.7, 2.15]) box(516, y, 27.3, 8, 0.016, 0.016, 'metal');
  box(516.6, 3.05, 28.2, 3.7, 0.4, 1.3, 'metal');
  box(516.6, 4.3, 27.75, 1, 2.1, 0.65, 'metal');
  for (const x of [515.5, 516.6, 517.7]) {
    cylinder(x, 1.095, 28.2, 0.26, 0.04, 'dark');
    cylinder(x, 1.31, 28.2, 0.22, 0.4, 'metal');
    box(x + 0.3, 1.46, 28.2, 0.3, 0.045, 0.05, 'dark');
  }
  box(519, 1.09, 28.2, 0.95, 0.04, 0.75, 'dark');
  cylinder(519.3, 1.38, 27.85, 0.035, 0.6, 'metal');
  box(519.15, 1.67, 27.85, 0.3, 0.045, 0.045, 'metal');
  box(511.1, 1.2, 28.2, 1.2, 2.4, 1.2, 'ceramic');
  box(510.76, 1.55, 28.82, 0.055, 0.45, 0.055, 'metal');
  for (const x of [512.4, 514.1, 515.8, 517.5, 519.2]) {
    cylinder(x, 0.76, 33.65, 0.34, 0.1, 'red');
    cylinder(x, 0.38, 33.65, 0.06, 0.72, 'metal');
    cylinder(x, 0.055, 33.65, 0.28, 0.07, 'dark');
    cylinder(x, 0.34, 33.65, 0.22, 0.04, 'metal');
    cylinder(x, 1.35, 32, 0.18, 0.09, 'ceramic', 0.24);
    cylinder(x + 0.3, 1.4, 32, 0.06, 0.23, 'dark');
    box(x + 0.3, 1.59, 32, 0.09, 0.15, 0.02, 'wood');
  }
  for (let i = 0; i < 5; i++) cylinder(513, 1.12 + i * 0.045, 28.2, 0.18, 0.045, 'ceramic', 0.22);
  sign(1, 514.5, 3.85, 27.27, 3.5, 1.5);
  for (const x of [512.5, 516, 519.5]) {
    cylinder(x, 4.53, 32, 0.016, 1.2, 'dark');
    cylinder(x, 3.88, 32, 0.3, 0.3, 'glow', 0.3);
    cylinder(x, 4.04, 32, 0.32, 0.04, 'dark');
    cylinder(x, 3.72, 32, 0.32, 0.04, 'dark');
  }
  sign(14, 519, 3.8, 27.27, 1.45, 1.5);
  sign(13, 520.73, 2.45, 37.5, 2.1, 1.8, -Math.PI / 2);
  sign(3, 505.28, 2.2, 38.25, 1.3, 1.1, Math.PI / 2);
  for (const z of [30, 32, 38, 40]) {
    cylinder(505.65, 4.1, z, 0.17, 0.4, 'glow');
    cylinder(505.65, 4.31, z, 0.18, 0.04, 'dark');
    cylinder(505.65, 3.89, z, 0.18, 0.04, 'dark');
  }
  for (const [x, z] of [[506.2, 28.1], [519.8, 41.9]]) {
    cylinder(x!, 0.35, z!, 0.29, 0.7, 'red', 0.4);
    for (let i = 0; i < 7; i++) sphere(x! + Math.sin(i * 2.4) * 0.3, 0.85 + i * 0.11, z! + Math.cos(i * 2.4) * 0.3, 0.24, 'leaf');
  }

  // Corner Mart: glazing, a continuous green fascia and a real open sliding-door gap.
  for (const x of [640.25, 647.75]) box(x, 1.95, 144.9, 4.4, 2.3, 0.025, 'glass');
  box(644, 3.65, 145.08, 12.3, 0.95, 0.2, 'green');
  box(644, 4.17, 145.13, 12.3, 0.08, 0.25, 'amber');
  sign(2, 644, 3.65, 145.195, 6.3, 0.87);
  for (const x of [638.3, 642.48, 645.52, 649.7]) box(x, 1.92, 145.01, 0.07, 2.5, 0.08, 'metal');
  sign(3, 641.5, 2.07, 145.04, 1.1, 0.8);
  sign(13, 647.8, 2.12, 145.04, 1.5, 1.1);
  for (let x = 638.5; x < 650; x += 0.8) box(x, 0.006, 140.5, 0.012, 0.012, 8.7, 'metal');
  for (let z = 136.5; z < 145; z += 0.8) box(644, 0.006, z, 11.7, 0.012, 0.012, 'metal');
  for (const x of [640.2, 644, 647.8]) for (const z of [138, 142.3]) {
    box(x, 5.11, z, 0.85, 0.09, 2.5, 'metal');
    box(x, 5.05, z, 0.68, 0.03, 2.25, 'glow');
  }
  // Roof equipment gives this low building a silhouette from nearby streets.
  for (const x of [640, 648]) {
    box(x, 6.05, 139, 1.5, 0.7, 1.2, 'metal');
    cylinder(x, 6.43, 139, 0.4, 0.06, 'dark');
    for (let j = 0; j < 6; j++) box(x, 5.85 + j * 0.09, 139.62, 1.2, 0.025, 0.02, 'dark');
  }
  // Two gondolas, four stocked levels per face. Labels share one atlas/material.
  for (const [aisle, x] of [640.35, 647.65].entries()) {
    for (const y of [0.15, 0.55, 0.95, 1.35, 1.75]) {
      box(x, y, 140.75, 1.22, 0.045, 2.75, 'ceramic');
      for (const side of [-1, 1]) box(x + side * 0.61, y, 140.75, 0.02, 0.07, 2.75, 'green');
    }
    for (let level = 0; level < 4; level++) for (let j = 0; j < 8; j++) for (const side of [-1, 1]) {
      const z = 139.6 + j * 0.32, y = 0.31 + level * 0.4;
      const px = x + side * 0.43, cell = 4 + (j + level + aisle) % 6;
      if (cell <= 6) {
        cylinder(px, y, z, 0.09, 0.26, cell === 5 ? 'amber' : 'green');
        cylinder(px, y + 0.145, z, 0.06, 0.045, 'metal');
      } else box(px, y, z, 0.19, 0.28, 0.23, cell === 9 ? 'red' : 'ceramic');
      sign(cell, px + side * 0.103, y, z, 0.22, 0.23, side * Math.PI / 2);
    }
    sign(aisle === 0 ? 7 : 9, x, 1.35, 142.13, 0.8, 0.6);
  }
  // Refrigerated cabinet bays, visible bottles, gasket frames, handles and lit headers.
  for (let bay = 0; bay < 5; bay++) {
    const x = 641.9 + bay * 1.5;
    box(x, 1.28, 137.24, 1.4, 2.3, 0.035, 'glass');
    for (const dx of [-0.7, 0.7]) box(x + dx, 1.25, 137.29, 0.045, 2.4, 0.055, 'metal');
    box(x + 0.54, 1.22, 137.35, 0.035, 0.65, 0.06, 'dark');
    box(x, 2.42, 137.26, 1.4, 0.045, 0.07, 'glow');
    for (let level = 0; level < 4; level++) {
      box(x, 0.27 + level * 0.49, 137, 1.38, 0.03, 0.4, 'ceramic');
      for (let n = 0; n < 6; n++) {
        const px = x - 0.54 + n * 0.21, y = 0.46 + level * 0.49;
        cylinder(px, y, 137.03, 0.075, 0.31, (n + level) % 2 ? 'amber' : 'green');
        cylinder(px, y + 0.18, 137.03, 0.035, 0.05, 'ceramic');
        sign(4 + n % 3, px, y, 137.111, 0.12, 0.18);
      }
    }
  }
  sign(10, 645, 2.94, 136.29, 6.8, 0.63);
  // Checkout, terminal, bag station, microwave, coffee urn, recycling and vending alcove.
  box(640, 1.14, 143.1, 2.25, 0.08, 1, 'ceramic');
  box(640.3, 1.4, 143.1, 0.5, 0.46, 0.3, 'dark');
  sign(11, 640.3, 1.45, 143.26, 0.42, 0.25);
  box(639.4, 1.22, 143.1, 0.5, 0.14, 0.45, 'dark');
  sign(11, 640, 2.8, 142.85, 1.9, 0.75);
  cylinder(640, 3.75, 142.85, 0.016, 1.1, 'metal');
  box(638.7, 1.42, 138, 0.7, 0.48, 0.6, 'ceramic');
  box(638.72, 1.42, 138.31, 0.52, 0.3, 0.02, 'dark');
  box(638.7, 0.55, 138, 0.8, 1.1, 0.75, 'green');
  cylinder(638.7, 1.35, 137.25, 0.23, 0.5, 'metal');
  box(638.7, 0.55, 137.25, 0.8, 1.1, 0.65, 'green');
  box(649.19, 1.3, 144.02, 0.72, 1.05, 0.025, 'dark');
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const x = 648.95 + col * 0.23, y = 1.02 + row * 0.32;
    cylinder(x, y, 144.07, 0.065, 0.22, col % 2 ? 'amber' : 'green');
    box(x, y - 0.13, 144.14, 0.1, 0.045, 0.025, 'glow');
  }
  sign(5, 649.2, 2.04, 144.02, 0.8, 0.26);
  box(649.2, 0.45, 144.02, 0.6, 0.19, 0.04, 'dark');
  for (const x of [646.1, 646.7]) {
    box(x, 0.35, 144.25, 0.46, 0.7, 0.48, 'ceramic');
    cylinder(x, 0.715, 144.25, 0.12, 0.025, 'dark');
    sign(15, x, 0.45, 144.5, 0.36, 0.28);
  }

  const geometry = new Set<BufferGeometry>();
  for (const [key, parts] of buckets) {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!merged) throw new Error(`Cannot batch interior geometry: ${key}`);
    geometry.add(merged);
    const finish = key.split(':')[1]!;
    const mesh = new Mesh(merged, materials[finish]);
    // Neo-Tokio: der ganze Innenraum wandert an seinen neuen Platz (INTERIOR_SITES).
    const site = INTERIOR_SITES[key.startsWith('diner') ? 0 : 1]!;
    mesh.position.set(site.dx, 0, site.dz);
    mesh.name = key; mesh.castShadow = finish !== 'glass' && finish !== 'glow'; mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  return {
    group, colliders: layout.colliders, floors: layout.floors,
    destinations: [
      { id: 'komorebi-diner', name: 'Komorebi Diner', x: 508.5 + INTERIOR_SITES[0]!.dx, y: y0, z: 35 + INTERIOR_SITES[0]!.dz, description: 'Step through the noren for a quiet counter, warm lanterns and the neighbourhood kitchen.' },
      { id: 'koji-mart', name: 'Kōji Corner Mart', x: 644 + INTERIOR_SITES[1]!.dx, y: y0, z: 141 + INTERIOR_SITES[1]!.dz, description: 'Browse the little aisles, chilled drinks and handwritten neighbourhood notices.' },
    ],
    dispose(): void {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.forEach(g => g.dispose());
      Object.values(materials).forEach(m => m.dispose());
      atlas.dispose();
      group.clear();
    },
  };
}
