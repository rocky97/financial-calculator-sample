/** Device settings (PRD §5 table). */

export type PaymentTiming = "END" | "BGN";
export type AngleUnit = "DEG" | "RAD";
export type DateFormat = "US" | "EUR";
export type Separator = "US" | "EUR";
export type CalcMethod = "Chn" | "AOS";

export interface Settings {
  /** Payments per year. */
  readonly PY: number;
  /** Compounding periods per year. Follows P/Y when P/Y is set, unless set separately. */
  readonly CY: number;
  readonly timing: PaymentTiming;
  /** Display decimals 0–9. 9 is the device's "floating" setting. */
  readonly DEC: number;
  readonly angle: AngleUnit;
  readonly dateFormat: DateFormat;
  readonly separator: Separator;
  readonly method: CalcMethod;
  /**
   * Not a device setting (PRD §9): when true the keypad stops enforcing the
   * device's 24-cash-flow / 50-data-point limits. Off by default so that a
   * class sees exactly what their units do.
   */
  readonly deviceLimitsOff: boolean;
}

/**
 * Defaults. P/Y and C/Y are 1, not the device's 12: decided 1 Nov 2026 so that
 * annual textbook problems work without a setup step; a lesson that needs
 * monthly periods sets 2ND P/Y 12 ENTER explicitly (PRD §9).
 */
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  PY: 1,
  CY: 1,
  timing: "END",
  DEC: 2,
  angle: "DEG",
  dateFormat: "US",
  separator: "US",
  method: "Chn",
  deviceLimitsOff: false,
});

/**
 * The per-payment-period rate the TVM and AMORT formulas use:
 *   i = (1 + I/Y ÷ 100 ÷ C/Y) ^ (C/Y ÷ P/Y) − 1
 * `iy` is the annual nominal rate in percent, as entered.
 */
export function periodicRate(iy: number, s: Pick<Settings, "PY" | "CY">): number {
  return Math.pow(1 + iy / 100 / s.CY, s.CY / s.PY) - 1;
}

/** Inverse of `periodicRate`: per-period rate → annual nominal I/Y in percent. */
export function annualRate(i: number, s: Pick<Settings, "PY" | "CY">): number {
  return (Math.pow(1 + i, s.PY / s.CY) - 1) * s.CY * 100;
}
