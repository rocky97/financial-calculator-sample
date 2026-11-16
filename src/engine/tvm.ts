/**
 * Time Value of Money worksheet (PRD §4, §5).
 *
 *   PV + PMT·(1 + i·k)·(1 − (1+i)^−N) / i + FV·(1+i)^−N = 0
 *
 * with i the per-payment-period rate from `periodicRate` and k = 1 in BGN
 * mode, 0 in END mode. When i = 0 the relation collapses to
 * PV + PMT·N + FV = 0.
 *
 * Sign convention is the device's: cash received is positive, cash paid is
 * negative. Every solver returns the value the device would *store* — rounded
 * to 13 significant digits — not a display string.
 */
import { round13 } from "./precision.js";
import { err, ok, type Result } from "./result.js";
import { annualRate, periodicRate, type Settings } from "./settings.js";
import { brent, findBracket, rateGrid } from "./solver.js";

export type TvmVariable = "N" | "IY" | "PV" | "PMT" | "FV";

export interface TvmRegisters {
  readonly N: number;
  readonly IY: number;
  readonly PV: number;
  readonly PMT: number;
  readonly FV: number;
}

export const CLEARED_TVM: TvmRegisters = Object.freeze({ N: 0, IY: 0, PV: 0, PMT: 0, FV: 0 });

type TimingSettings = Pick<Settings, "PY" | "CY" | "timing">;

/** Annuity factor pieces shared by the closed-form solvers. */
function factors(i: number, N: number, k: 0 | 1): { v: number; A: number } {
  // v = (1+i)^−N ; A = (1 + i·k)·(1 − v) / i   (A → N as i → 0)
  // Written with log1p/expm1 so that tiny i does not cancel to 1 − 1 = 0,
  // which would fake a sign change right next to zero and mislead the I/Y solver.
  const nl = -N * Math.log1p(i);
  const v = Math.exp(nl);
  const oneMinusV = -Math.expm1(nl);
  const A = i === 0 ? N : ((1 + i * k) * oneMinusV) / i;
  return { v, A };
}

/** Left-hand side of the TVM relation at per-period rate `i`. */
export function tvmResidual(r: TvmRegisters, i: number, k: 0 | 1): number {
  const { v, A } = factors(i, r.N, k);
  return r.PV + r.PMT * A + r.FV * v;
}

/**
 * Solve `target` from the other four registers. Errors:
 *  4  N ≤ 0 where N is an input, or P/Y, C/Y not positive
 *  5  no solution (e.g. PV, PMT, FV all the same sign when solving I/Y)
 *  7  iteration limit
 */
export function solveTvm(
  r: TvmRegisters,
  s: TimingSettings,
  target: TvmVariable,
): Result<number> {
  if (!(s.PY > 0) || !(s.CY > 0)) return err(4, "P/Y and C/Y must be positive");
  const k: 0 | 1 = s.timing === "BGN" ? 1 : 0;

  switch (target) {
    case "N":
      return solveN(r, periodicRate(r.IY, s), k);
    case "IY":
      return solveIY(r, s, k);
    case "PV":
    case "PMT":
    case "FV":
      return solveClosedForm(r, periodicRate(r.IY, s), k, target);
  }
}

function solveClosedForm(
  r: TvmRegisters,
  i: number,
  k: 0 | 1,
  target: "PV" | "PMT" | "FV",
): Result<number> {
  if (r.N < 0) return err(4, "N must be ≥ 0");
  if (i <= -1) return err(4, "rate ≤ −100%");
  const { v, A } = factors(i, r.N, k);
  let out: number;
  switch (target) {
    case "PV":
      out = -(r.PMT * A + r.FV * v);
      break;
    case "PMT":
      if (A === 0) return err(5, "no payment stream (N = 0)");
      out = -(r.PV + r.FV * v) / A;
      break;
    case "FV":
      if (v === 0) return err(1, "overflow");
      out = -(r.PV + r.PMT * A) / v;
      break;
  }
  if (!Number.isFinite(out)) return err(1, "overflow");
  return ok(round13(normalizeZero(out)));
}

function solveN(r: TvmRegisters, i: number, k: 0 | 1): Result<number> {
  if (i <= -1) return err(4, "rate ≤ −100%");
  if (i === 0) {
    if (r.PMT === 0) return err(5, "no payment and zero rate");
    const n = -(r.PV + r.FV) / r.PMT;
    if (!(n > 0)) return err(5, "no solution");
    return ok(round13(n));
  }
  // Rearranged: v·(FV − C) = −PV − C  with C = PMT·(1 + i·k)/i
  const C = (r.PMT * (1 + i * k)) / i;
  const denom = r.FV - C;
  if (denom === 0) return err(5, "no solution");
  const v = (-r.PV - C) / denom;
  if (!(v > 0)) return err(5, "no solution");
  const n = -Math.log(v) / Math.log(1 + i);
  if (!Number.isFinite(n) || n < 0) return err(5, "no solution");
  return ok(round13(normalizeZero(n)));
}

function solveIY(r: TvmRegisters, s: TimingSettings, k: 0 | 1): Result<number> {
  if (!(r.N > 0)) return err(4, "N must be > 0");
  // Device rule: if every non-zero cash value has the same sign there is no
  // rate that balances them → Error 5.
  const signs = [r.PV, r.PMT, r.FV].filter((x) => x !== 0).map(Math.sign);
  if (signs.length === 0) return err(5, "all zero");
  if (signs.every((sg) => sg === signs[0])) return err(5, "all cash flows one sign");

  const f = (i: number): number => tvmResidual(r, i, k);

  // Bracket on a grid, preferring the root nearest zero when several exist.
  // (Document for the class: the device converges from its own starting
  // guess; for ordinary single-root problems both land on the same answer.)
  const grid = rateGrid();
  const nearZeroFirst = [...grid].sort((a, b) => Math.abs(a) - Math.abs(b));
  // Walk outward from 0 in both directions, bracketing between neighbours in
  // the original ascending grid.
  for (const x of nearZeroFirst) {
    const idx = grid.indexOf(x);
    const next = grid[idx + 1];
    if (next === undefined) continue;
    const br = findBracket(f, [x, next]);
    if (br) {
      const root = br.lo === br.hi ? ok(br.lo) : brent(f, br.lo, br.hi);
      if (!root.ok) return root;
      return ok(round13(normalizeZero(annualRate(root.value, s))));
    }
  }
  return err(5, "no solution");
}

/** Collapse −0 and sub-epsilon noise to a clean 0. */
function normalizeZero(x: number): number {
  return Math.abs(x) < 1e-12 ? 0 : x;
}
