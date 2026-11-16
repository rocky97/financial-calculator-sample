/**
 * Interest Conversion worksheet (PRD §4): NOM ↔ EFF for C/Y compounding
 * periods per year. Rates in percent, as entered on the device.
 */
import { round13 } from "./precision.js";
import { err, ok, type Result } from "./result.js";

export function nominalToEffective(NOM: number, CY: number): Result<number> {
  if (!(CY > 0)) return err(4, "C/Y must be positive");
  const eff = (Math.pow(1 + NOM / 100 / CY, CY) - 1) * 100;
  if (!Number.isFinite(eff)) return err(1, "overflow");
  return ok(round13(eff));
}

export function effectiveToNominal(EFF: number, CY: number): Result<number> {
  if (!(CY > 0)) return err(4, "C/Y must be positive");
  if (EFF / 100 <= -1) return err(4, "EFF ≤ −100%");
  const nom = (Math.pow(1 + EFF / 100, 1 / CY) - 1) * CY * 100;
  if (!Number.isFinite(nom)) return err(1, "overflow");
  return ok(round13(nom));
}
