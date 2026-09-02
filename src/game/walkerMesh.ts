import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  SphereGeometry,
} from 'three';

import type { PropMaterial } from '@/world/materials/PropMaterial';

/**
 * Der Fahrer als prozedurale Figur — dieselbe Formensprache wie die Autos.
 *
 * ## Warum dieser Schnitt
 *
 * Ein Mesh, das als ein Klumpen rotiert, sieht aus wie ein Schachfigur. Ein
 * Skinning-Rig mit 30 Bones wäre ein zweites Animationssystem, das dieses
 * Projekt nicht hat. Dazwischen: **Gelenkgruppen**. Jedes Glied ist ein Mesh
 * in einer `Group`, die sich um ihr proximales Gelenk dreht. Walk-Cycle,
 * Atmung und Sprung sind Sinus und Exponential — keine Clips, kein Download.
 *
 * Gemessen am Bild (3rd Person, 4 m Abstand) reicht das, sobald Knie und
 * Ellbogen wirklich knicken. Ein ungebogenes Bein beim Gehen ist die
 * Schachfigur; ein geknicktes ist ein Mensch.
 *
 * ## Der Look
 *
 * Touge-Fahrer der blauen Stunde: dunkle Racing-Jacke mit Zinnoberstreifen
 * (dieselbe Farbe wie die Torii), dunkle Hose, helle Sohlen. Die Palette
 * der Karte, nicht eine dritte. Haut etwas wärmer als der Putz, damit sie
 * im Streiflicht der 2,23°-Sonne nicht im Schatten verschwindet.
 */

const matrixColor = new Color();

function paint(geometry: BufferGeometry, hex: number): BufferGeometry {
  matrixColor.setHex(hex, 'srgb');
  const count = geometry.getAttribute('position').count;
  const rgb = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    rgb[i * 3] = matrixColor.r;
    rgb[i * 3 + 1] = matrixColor.g;
    rgb[i * 3 + 2] = matrixColor.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  return geometry;
}

function box(
  w: number,
  h: number,
  d: number,
  hex: number,
  ox = 0,
  oy = 0,
  oz = 0,
): BufferGeometry {
  const geometry = paint(new BoxGeometry(w, h, d), hex);
  if (ox || oy || oz) geometry.translate(ox, oy, oz);
  return geometry;
}

function cyl(
  rTop: number,
  rBot: number,
  h: number,
  hex: number,
  oy = 0,
  radial = 6,
): BufferGeometry {
  const geometry = paint(new CylinderGeometry(rTop, rBot, h, radial), hex);
  if (oy) geometry.translate(0, oy, 0);
  return geometry;
}

function ball(r: number, hex: number, oy = 0): BufferGeometry {
  const geometry = paint(new SphereGeometry(r, 7, 6), hex);
  if (oy) geometry.translate(0, oy, 0);
  return geometry;
}

const C = {
  skin: 0xc4a07a,
  hair: 0x1a1614,
  jacket: 0x1c2430,
  stripe: 0xa8382a,
  shirt: 0xd6d0c2,
  jeans: 0x2a3038,
  shoe: 0xe8e2cf,
  sole: 0x2b2e33,
  iris: 0x1a1c22,
} as const;

export interface WalkerAnim {
  /** Bogenlänge seit Start, in Metern — treibt den Cycle, nicht die Zeit.
   * Zeit würde bei Stillstand weiterlaufen und die Beine paddeln. */
  cycle: number;
  speed: number;
  grounded: boolean;
  vy: number;
  lean: number;
}

export interface WalkerRig {
  readonly group: Group;
  animate(state: WalkerAnim, dt: number): void;
  dispose(): void;
}

function mesh(geometry: BufferGeometry, material: PropMaterial, name: string): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function limb(name: string): Group {
  const g = new Group();
  g.name = name;
  return g;
}

/**
 * Die Figur bauen. Ursprung der Gruppe: **Sohlen auf y = 0**, Blick +Z.
 *
 * Dieselbe Konvention wie das Auto nach dem `cgHeight`-Versatz in der
 * anderen Richtung: das Mesh kann `Walker.position` (Bodenpunkt) direkt
 * übernehmen. Ein zweiter Versatz hier wäre die Standhöhen-Falle aus P14.
 */
export function createWalkerRig(material: PropMaterial): WalkerRig {
  const group = new Group();
  group.name = 'Fahrer';

  const hips = limb('Hüfte');
  // 0,98 m: Oberschenkel 0,44 + Wade 0,40 + Sohle 0,08 + Gelenkversatz 0,06.
  // Die Sohle sitzt damit auf y = 0 — ein Versatz nach unten wäre die
  // Standhöhen-Falle aus P14, nur zu Fuß.
  hips.position.y = 0.98;
  group.add(hips);

  const pelvis = mesh(box(0.32, 0.16, 0.2, C.jeans, 0, -0.02, 0), material, 'Becken');
  hips.add(pelvis);

  const spine = limb('Wirbelsäule');
  spine.position.y = 0.08;
  hips.add(spine);

  const torso = mesh(box(0.4, 0.42, 0.24, C.jacket, 0, 0.22, 0), material, 'Jacke');
  spine.add(torso);
  spine.add(mesh(box(0.42, 0.08, 0.26, C.stripe, 0, 0.4, 0), material, 'Kragen'));
  spine.add(mesh(box(0.08, 0.36, 0.26, C.stripe, 0.17, 0.22, 0), material, 'StreifenL'));
  spine.add(mesh(box(0.08, 0.36, 0.26, C.stripe, -0.17, 0.22, 0), material, 'StreifenR'));
  // Unterjacke am Saum — sonst endet die Jacke als Klotz ohne Kleidung darunter.
  spine.add(mesh(box(0.34, 0.08, 0.2, C.shirt, 0, 0.02, 0.02), material, 'Hemd'));

  const neck = limb('Hals');
  neck.position.y = 0.46;
  spine.add(neck);
  neck.add(mesh(cyl(0.05, 0.055, 0.09, C.skin, 0.04, 6), material, 'HalsMesh'));

  const head = limb('Kopf');
  head.position.y = 0.14;
  neck.add(head);
  head.add(mesh(ball(0.11, C.skin, 0.02), material, 'Schädel'));
  // Haare als Kappe, etwas nach hinten — ein Vollkugel-Kopf ohne Haar ist
  // eine Glatze, und die liest sich auf 4 m als Fehler, nicht als Schnitt.
  head.add(mesh(ball(0.115, C.hair, 0.055), material, 'Haar'));
  head.add(mesh(box(0.22, 0.07, 0.16, C.hair, 0, 0.08, -0.02), material, 'HaarOben'));
  head.add(mesh(box(0.035, 0.025, 0.02, C.iris, 0.035, 0.03, 0.09), material, 'AugeL'));
  head.add(mesh(box(0.035, 0.025, 0.02, C.iris, -0.035, 0.03, 0.09), material, 'AugeR'));

  const lArm = makeArm(material, 1);
  const rArm = makeArm(material, -1);
  lArm.root.position.set(0.23, 0.38, 0);
  rArm.root.position.set(-0.23, 0.38, 0);
  spine.add(lArm.root, rArm.root);

  const lLeg = makeLeg(material, 1);
  const rLeg = makeLeg(material, -1);
  lLeg.root.position.set(0.09, -0.06, 0);
  rLeg.root.position.set(-0.09, -0.06, 0);
  hips.add(lLeg.root, rLeg.root);

  const geometries: BufferGeometry[] = [];
  group.traverse((obj) => {
    if (obj instanceof Mesh) geometries.push(obj.geometry);
  });

  let airPose = 0;
  let land = 0;
  let breatheT = 0;

  return {
    group,
    animate(state, dt) {
      breatheT += dt;
      const grounded = state.grounded;
      const speed = state.speed;
      const moving = grounded && speed > 0.35;
      const run = speed > 5.4;

      if (!grounded) airPose = Math.min(1, airPose + dt * 8);
      else airPose = Math.max(0, airPose - dt * 10);
      if (grounded && state.vy < -2.5) land = 1;
      land = Math.max(0, land - dt * 5);

      // Schrittfrequenz aus der Bogenlänge, nicht aus der Zeit: bei 4,4 m/s
      // und 1,35 m Schrittweite sind das 3,3 Hz. `cycle` ist Meter, mal
      // 2π / Weite ergibt Radiant.
      const stride = run ? 1.55 : 1.28;
      const phase = (state.cycle / stride) * Math.PI * 2;
      const swing = moving ? (run ? 0.85 : 0.55) : 0;
      const step = Math.sin(phase);
      const stepOpp = Math.sin(phase + Math.PI);
      const knee = Math.max(0, -Math.cos(phase));
      const kneeOpp = Math.max(0, -Math.cos(phase + Math.PI));

      const bob = moving ? Math.abs(Math.sin(phase * 2)) * (run ? 0.045 : 0.028) : 0;
      const crouch = land * 0.12;
      hips.position.y = 0.98 - bob - crouch - airPose * 0.04;
      hips.rotation.z = moving ? step * 0.06 : Math.sin(breatheT * 1.1) * 0.02;
      hips.rotation.y = moving ? step * 0.08 : 0;

      const breath = Math.sin(breatheT * 2.2) * 0.012;
      spine.rotation.x = (moving ? -state.lean * 0.18 : breath) - airPose * 0.12;
      spine.rotation.y = moving ? -step * 0.1 : 0;

      head.rotation.x = airPose * 0.15 - spine.rotation.x * 0.4;
      head.rotation.y = moving ? step * 0.05 : Math.sin(breatheT * 0.4) * 0.04;

      const armSwing = moving ? (run ? 0.95 : 0.55) : Math.sin(breatheT * 1.3) * 0.04;
      lArm.root.rotation.x = stepOpp * armSwing + airPose * 0.6;
      rArm.root.rotation.x = step * armSwing + airPose * 0.6;
      lArm.root.rotation.z = 0.12 + airPose * 0.25;
      rArm.root.rotation.z = -0.12 - airPose * 0.25;
      lArm.fore.rotation.x = moving ? -0.35 - kneeOpp * 0.4 : -0.15;
      rArm.fore.rotation.x = moving ? -0.35 - knee * 0.4 : -0.15;

      const thighSwing = swing;
      lLeg.root.rotation.x = step * thighSwing - airPose * 0.35;
      rLeg.root.rotation.x = stepOpp * thighSwing - airPose * 0.35;
      lLeg.shin.rotation.x = moving ? knee * 0.95 : 0.08;
      rLeg.shin.rotation.x = moving ? kneeOpp * 0.95 : 0.08;
      if (!grounded) {
        lLeg.shin.rotation.x = 0.7;
        rLeg.shin.rotation.x = 0.7;
      }
      lLeg.foot.rotation.x = moving ? -lLeg.root.rotation.x * 0.35 - lLeg.shin.rotation.x * 0.25 : 0;
      rLeg.foot.rotation.x = moving ? -rLeg.root.rotation.x * 0.35 - rLeg.shin.rotation.x * 0.25 : 0;
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      group.removeFromParent();
    },
  };
}

function makeArm(material: PropMaterial, side: 1 | -1): { root: Group; fore: Group } {
  const root = limb(side > 0 ? 'ArmL' : 'ArmR');
  root.add(
    mesh(cyl(0.055, 0.05, 0.28, C.jacket, -0.14, 6), material, side > 0 ? 'OberarmL' : 'OberarmR'),
  );
  const fore = limb('Unterarm');
  fore.position.y = -0.28;
  root.add(fore);
  fore.add(mesh(cyl(0.045, 0.04, 0.24, C.jacket, -0.12, 6), material, 'UnterarmMesh'));
  fore.add(mesh(ball(0.045, C.skin, -0.26), material, 'Hand'));
  // Arme hängen nach unten: Cylinder-Achse ist Y, also Mesh nach −Y vom
  // Schultergelenk. Ohne den Versatz säße der Arm im Schulterpunkt.
  return { root, fore };
}

function makeLeg(material: PropMaterial, side: 1 | -1): { root: Group; shin: Group; foot: Group } {
  const root = limb(side > 0 ? 'BeinL' : 'BeinR');
  root.add(
    mesh(cyl(0.075, 0.065, 0.44, C.jeans, -0.22, 6), material, side > 0 ? 'OberschenkelL' : 'OberschenkelR'),
  );
  const shin = limb('Unterschenkel');
  shin.position.y = -0.44;
  root.add(shin);
  shin.add(mesh(cyl(0.055, 0.05, 0.4, C.jeans, -0.2, 6), material, 'Wade'));
  const foot = limb('Fuß');
  foot.position.y = -0.4;
  shin.add(foot);
  foot.add(mesh(box(0.1, 0.07, 0.26, C.shoe, 0, -0.02, 0.06), material, 'Schuh'));
  foot.add(mesh(box(0.1, 0.03, 0.27, C.sole, 0, -0.065, 0.06), material, 'Sohle'));
  return { root, shin, foot };
}
