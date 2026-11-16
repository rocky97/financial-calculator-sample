/**
 * Amortization worksheet (PRD §4). Follows the device's own algorithm, which
 * rounds at every step to the display setting (RND) and once to 12 places
 * (RND12) — this is why a spreadsheet IPMT/PPMT can differ by a cent.
 *
 *   bal(0) = RND(PV)
 *   for m = 1 … P2:
 *     I(m)   = RND( RND12( −i · bal(m−1) ) )      (I(1) = 0 in BGN mode)
 *     bal(m) = bal(m−1) − I(m) + RND(PMT)
 *   BAL = bal(P2)
 *   PRN = bal(P2) − bal(P1 − 1)
 *   INT = (P2 − P1 + 1) · RND(PMT) − PRN
 *
 * For a loan (PV +, PMT −) BAL is positive and PRN, INT are negative, exactly
 * as the device shows them.
 */
import { round12, round13, roundDec } from "./precision.js";
import { err, ok, type Result } from "./result.js";
import { periodicRate, type Settings } from "./settings.js";
import type { TvmRegisters } from "./tvm.js";

export interface AmortResult {
  readonly BAL: number;
  readonly PRN: number;
  readonly INT: number;
}

export function amortize(
  r: TvmRegisters,
  s: Pick<Settings, "PY" | "CY" | "timing" | "DEC">,
  P1: number,
  P2: number,
): Result<AmortResult> {
  if (!Number.isInteger(P1) || !Number.isInteger(P2) || P1 < 1 || P2 < P1) {
    return err(4, "P1 and P2 must be integers with 1 ≤ P1 ≤ P2");
  }
  if (!(s.PY > 0) || !(s.CY > 0)) return err(4, "P/Y and C/Y must be positive");
  const i = periodicRate(r.IY, s);
  if (i <= -1) return err(4, "rate ≤ −100%");

  const rnd = (x: number): number => roundDec(x, s.DEC);
  const pmt = rnd(r.PMT);
  const bgn = s.timing === "BGN";

  let bal = rnd(r.PV);
  let balBeforeRange = bal; // bal(P1 − 1)
  for (let m = 1; m <= P2; m++) {
    if (m === P1) balBeforeRange = bal;
    const interest = bgn && m === 1 ? 0 : rnd(round12(-i * bal));
    bal = bal - interest + pmt;
  }
  const PRN = bal - balBeforeRange;
  const INT = (P2 - P1 + 1) * pmt - PRN;
  return ok({
    BAL: round13(clean(bal)),
    PRN: round13(clean(PRN)),
    INT: round13(clean(INT)),
  });
}

/** Strip binary dust so a value that is exactly 0 or x.xx reads that way. */
function clean(x: number): number {
  const r = Math.round(x * 1e9) / 1e9;
  return Math.abs(r) < 1e-12 ? 0 : r;
}
