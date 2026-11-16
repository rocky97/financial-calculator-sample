/**
 * Cash Flow worksheet: NPV and IRR (PRD §4).
 *
 * CF0 at t = 0, then each flow Cnn repeated Fnn times at consecutive periods.
 * The engine accepts any number of flows; the keypad enforces the device's
 * 24-flow limit unless `deviceLimitsOff` is set (PRD §9).
 */
import { round13 } from "./precision.js";
import { err, ok, type Result } from "./result.js";
import { brent, findBracket, rateGrid } from "./solver.js";

export interface CashFlow {
  /** Cnn — the amount. */
  readonly amount: number;
  /** Fnn — how many consecutive periods it repeats (1…9999 on the device). */
  readonly frequency: number;
}

export interface CashFlowSheet {
  readonly CF0: number;
  readonly flows: readonly CashFlow[];
}

/** The device's hard limits, for the keypad layer to enforce. */
export const DEVICE_MAX_FLOWS = 24;
export const DEVICE_MAX_FREQUENCY = 9999;

/** Expand (amount, frequency) pairs into one amount per period, t = 1…T. */
export function expandFlows(flows: readonly CashFlow[]): number[] {
  const out: number[] = [];
  for (const f of flows) {
    const n = Math.max(0, Math.floor(f.frequency));
    for (let j = 0; j < n; j++) out.push(f.amount);
  }
  return out;
}

/** Σ CF_t / (1 + i)^t over t = 0…T at per-period rate `i`. */
export function npvAt(sheet: CashFlowSheet, i: number): number {
  const series = expandFlows(sheet.flows);
  let total = sheet.CF0;
  let disc = 1;
  for (const cf of series) {
    disc /= 1 + i;
    total += cf * disc;
  }
  return total;
}

/**
 * NPV at the rate `I` the user entered (percent per period, as on the device).
 * Error 4 for a rate ≤ −100%.
 */
export function npv(sheet: CashFlowSheet, I: number): Result<number> {
  const i = I / 100;
  if (i <= -1) return err(4, "rate ≤ −100%");
  for (const f of sheet.flows) if (!(f.frequency >= 1)) return err(4, "frequency must be ≥ 1");
  const v = npvAt(sheet, i);
  if (!Number.isFinite(v)) return err(1, "overflow");
  return ok(round13(v));
}

/**
 * IRR in percent per period. Errors:
 *  5  no sign change among the cash flows (no IRR exists)
 *  7  iteration limit
 *
 * Root choice when several exist: the bracket nearest 0% is taken. Note this
 * in course material if a multi-root example is ever used (PRD §7 edge cases).
 */
export function irr(sheet: CashFlowSheet): Result<number> {
  const series = [sheet.CF0, ...expandFlows(sheet.flows)];
  const signs = series.filter((x) => x !== 0).map(Math.sign);
  if (signs.length === 0 || signs.every((s) => s === signs[0])) {
    return err(5, "cash flows do not change sign");
  }
  const f = (i: number): number => npvAt(sheet, i);
  const grid = rateGrid();
  const nearZeroFirst = [...grid].sort((a, b) => Math.abs(a) - Math.abs(b));
  for (const x of nearZeroFirst) {
    const idx = grid.indexOf(x);
    const next = grid[idx + 1];
    if (next === undefined) continue;
    const br = findBracket(f, [x, next]);
    if (br) {
      const root = br.lo === br.hi ? ok(br.lo) : brent(f, br.lo, br.hi);
      if (!root.ok) return root;
      return ok(round13(root.value * 100));
    }
  }
  return err(5, "no IRR found");
}
