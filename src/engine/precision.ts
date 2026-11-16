/**
 * Numeric fidelity helpers (PRD §10, precision note).
 *
 * The device carries 13 significant digits internally and rounds to the DEC
 * setting only when rendering. Doubles carry ~15.9, so every value that is
 * *stored* into a register passes through `round13` to keep subsequent
 * arithmetic on the same footing as the hardware.
 */

/** Round to `sig` significant digits (default 13 — the device's internal width). */
export function roundSig(x: number, sig = 13): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const magnitude = Math.floor(Math.log10(Math.abs(x)));
  const scale = Math.pow(10, sig - 1 - magnitude);
  return Math.round(x * scale) / scale;
}

export const round13 = (x: number): number => roundSig(x, 13);

/**
 * Round to `dec` decimal places, half away from zero (what the device does on
 * screen and inside AMORT). `dec = 9` is the device's "floating" setting; we
 * treat it as "round to 9 places" which is what the display shows.
 */
export function roundDec(x: number, dec: number): number {
  if (!Number.isFinite(x)) return x;
  const scale = Math.pow(10, dec);
  const shifted = Math.abs(x) * scale;
  // Nudge away from binary noise (0.1 + 0.2 style) before the half-up step.
  const rounded = Math.round(shifted + 1e-9 * Math.sign(shifted));
  return (Math.sign(x) * rounded) / scale;
}

/** Round to 12 decimal places — TI's RND12 used inside the AMORT formulas. */
export const round12 = (x: number): number => roundDec(x, 12);

/** `a` and `b` agree to `sig` significant digits (used by tests). */
export function agreesTo(a: number, b: number, sig: number): boolean {
  if (a === b) return true;
  const mag = Math.max(Math.abs(a), Math.abs(b));
  if (mag === 0) return true;
  return Math.abs(a - b) / mag < Math.pow(10, -sig);
}
