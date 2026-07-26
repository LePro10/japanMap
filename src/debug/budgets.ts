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
