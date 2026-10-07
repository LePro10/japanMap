import type { Object3D } from 'three';

import type { Budget } from '@/config/quality.config';

/**
 * Die Ampel.
 *
 *   ok    — im Budget
 *   warn  — über der Warnschwelle (~75 %), Puffer schrumpft
 *   over  — über dem Limit aus SPEC §4
 *   none  — für diese Metrik gibt es kein Budget (reine Information)
 */
export type BudgetStatus = 'ok' | 'warn' | 'over' | 'none';

export function evaluateBudget(value: number, budget: Budget | null): BudgetStatus {
  if (budget === null) return 'none';
  if (value > budget.limit) return 'over';
  if (value > budget.warn) return 'warn';
  return 'ok';
}

/**
 * Draw-Calls und Dreiecke eines Teilbaums abschätzen.
 *
 * Es ist eine **Schätzung**, und das gehört dazugesagt: gezählt wird, was
 * sichtbar ist und Geometrie hat, ohne Frustum-Culling und ohne die zweite
 * Runde für eine Schattenkarte. Die Summe über alle Gruppen weicht deshalb von
 * `renderer.info.render.calls` ab.
 *
 * Für ein **Teilbudget** ist genau das die richtige Zahl: es soll die Bauweise
 * prüfen — „ein Mesh je Block, nicht je Haus" — und nicht davon abhängen, wohin
 * die Kamera gerade schaut. Für die absolute Zahl gilt weiterhin das, was der
 * Renderer meldet.
 *
 * Liegt hier und nicht im BudgetGuard, weil Overlay und Guard dieselbe Zahl
 * zeigen müssen; zwei Zählungen wären zwei Wahrheiten.
 */
/**
 * Szenengruppen, die zum Teilbudget der Stadt zählen (PLAN.md P6).
 *
 * Die Straßendecals gehören **nicht** dazu: sie liegen auf dem ganzen Netz,
 * nicht in der Stadt, und ihr eines Instanz-Mesh wäre in diesem Budget eine
 * Zahl, die nichts über die Stadt aussagt.
 */
export const CITY_BUDGET_GROUPS: readonly string[] = ['Stadt', 'Neon'];

/** Draw-Calls der Stadt — die Zahl, die Overlay **und** Guard zeigen. */
export function tallyCityCalls(scene: Object3D): number {
  let calls = 0;
  for (const name of CITY_BUDGET_GROUPS) {
    const group = scene.getObjectByName(name);
    if (group) calls += tallySubtree(group).calls;
  }
  return calls;
}

export function tallySubtree(root: Object3D): { calls: number; triangles: number } {
  let calls = 0;
  let triangles = 0;

  root.traverseVisible((object) => {
    const geometry = (
      object as {
        geometry?: {
          index?: { count: number } | null;
          attributes?: { position?: { count: number } };
          instanceCount?: number;
        };
      }
    ).geometry;
    if (!geometry) return;
    const vertices = geometry.index?.count ?? geometry.attributes?.position?.count ?? 0;
    if (vertices === 0) return;

    const instances = (object as { isInstancedMesh?: boolean; count?: number }).isInstancedMesh
      ? ((object as { count: number }).count ?? 1)
      : (geometry.instanceCount ?? 1);
    if (instances === 0) return;

    calls += 1;
    triangles += (vertices / 3) * instances;
  });

  return { calls, triangles };
}

/** Ganzzahl mit Tausenderpunkt — 2451300 → "2.451.300". */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('de-DE');
}

/**
 * Zeiten mit gleitender Genauigkeit. Feste eine Nachkommastelle wäre ein
 * Eigentor: ein leerer Frame kostet ~0,02 ms GPU und stünde dann als "0.0 ms"
 * da — nicht zu unterscheiden von einem Timer, der gar nicht misst.
 */
export function formatMillis(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)} ms`;
}

export function formatMegabytes(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)} MB`;
}

/** Kurzform für die Budget-Spalte rechts im Overlay. */
export function formatLimit(budget: Budget | null, unit: string): string {
  if (budget === null) return '';
  const limit = budget.limit;
  const text = limit >= 1_000_000 ? `${(limit / 1_000_000).toFixed(1)}M` : formatCount(limit);
  return `/ ${text}${unit}`;
}
