/**
 * Root finding for I/Y and IRR (PRD §5): bracket a sign change, then Brent's
 * method to machine precision. Iteration counts are capped so a pathological
 * input becomes Error 7 instead of a hang.
 */
import { err, ok, type Result } from "./result.js";

export const MAX_ITERATIONS = 1000;

export interface Bracket {
  readonly lo: number;
  readonly hi: number;
}

/**
 * Scan `grid` (ascending) for the first adjacent pair whose f-values differ in
 * sign. Returns null if none. Non-finite evaluations are skipped so a pole in
 * the function doesn't masquerade as a sign change.
 */
export function findBracket(f: (x: number) => number, grid: readonly number[]): Bracket | null {
  let prevX: number | null = null;
  let prevF: number | null = null;
  for (const x of grid) {
    const fx = f(x);
    if (!Number.isFinite(fx)) {
      prevX = null;
      prevF = null;
      continue;
    }
    if (fx === 0) return { lo: x, hi: x };
    if (prevX !== null && prevF !== null && Math.sign(fx) !== Math.sign(prevF)) {
      return { lo: prevX, hi: x };
    }
    prevX = x;
    prevF = fx;
  }
  return null;
}

/** Brent's method on [lo, hi] where f(lo) and f(hi) differ in sign. */
export function brent(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tol = 1e-15,
  maxIter = MAX_ITERATIONS,
): Result<number> {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return ok(a);
  if (fb === 0) return ok(b);
  if (Math.sign(fa) === Math.sign(fb)) return err(5, "no sign change in bracket");

  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;

  for (let iter = 0; iter < maxIter; iter++) {
    if (Math.sign(fb) === Math.sign(fc)) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return ok(b);

    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : tol1 * Math.sign(xm);
    fb = f(b);
  }
  return err(7, "iteration limit");
}

/**
 * Per-period rate grid used to bracket I/Y and IRR. Dense near zero (where
 * nearly every real-world rate lives), coarser as it grows. Covers −99% to
 * +10,000% per period.
 */
export function rateGrid(): number[] {
  // Built from integer counters so values are exact decimals (0 is exactly 0,
  // not 1e-16), which keeps the near-zero evaluation honest.
  const grid: number[] = [];
  for (let n = -99; n < -10; n++) grid.push(n / 100);
  for (let n = -200; n < 200; n++) grid.push(n / 2000);
  for (let n = 20; n < 200; n++) grid.push(n / 200);
  for (let n = 10; n < 100; n++) grid.push(n / 10);
  for (let n = 10; n <= 100; n++) grid.push(n);
  return grid;
}
