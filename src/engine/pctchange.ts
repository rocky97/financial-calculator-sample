/**
 * Percent Change / Compound Interest worksheet (△%, PRD §4):
 *
 *   NEW = OLD · (1 + %CH / 100) ^ #PD
 *
 * Any one of OLD, NEW, %CH, #PD can be computed from the other three.
 * With #PD = 1 it is plain percent change; with #PD > 1 it is a compound
 * growth rate (CAGR).
 */
import { round13 } from "./precision.js";
import { err, ok, type Result } from "./result.js";

export type PctChangeVariable = "OLD" | "NEW" | "PCH" | "PD";

export interface PctChangeRegisters {
  readonly OLD: number;
  readonly NEW: number;
  /** %CH, in percent. */
  readonly PCH: number;
  /** #PD, number of periods. */
  readonly PD: number;
}

export function solvePctChange(r: PctChangeRegisters, target: PctChangeVariable): Result<number> {
  const g = 1 + r.PCH / 100;
  switch (target) {
    case "NEW": {
      const v = r.OLD * Math.pow(g, r.PD);
      return Number.isFinite(v) ? ok(round13(v)) : err(1, "overflow");
    }
    case "OLD": {
      const d = Math.pow(g, r.PD);
      if (d === 0) return err(1, "overflow");
      return ok(round13(r.NEW / d));
    }
    case "PCH": {
      if (r.OLD === 0 || r.PD === 0) return err(5, "no solution");
      const ratio = r.NEW / r.OLD;
      if (!(ratio > 0)) return err(5, "NEW and OLD must share a sign");
      return ok(round13((Math.pow(ratio, 1 / r.PD) - 1) * 100));
    }
    case "PD": {
      if (r.OLD === 0) return err(5, "no solution");
      const ratio = r.NEW / r.OLD;
      if (!(ratio > 0) || !(g > 0) || g === 1) return err(5, "no solution");
      return ok(round13(Math.log(ratio) / Math.log(g)));
    }
  }
}
