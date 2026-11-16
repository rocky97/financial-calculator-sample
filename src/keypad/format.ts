/**
 * Number rendering for the single-line display (PRD §10, "Entry and number
 * formatting"). The display holds ten digits; DEC rounds at render only.
 */
import { roundDec } from "../engine/index.js";
import type { Settings } from "../engine/index.js";

export const DISPLAY_DIGITS = 10;

export interface Rendered {
  readonly mantissa: string;
  /** Exponent for scientific notation, or null for a plain number. */
  readonly exponent: string | null;
}

function group(intPart: string, sep: Settings["separator"]): string {
  const thousands = sep === "US" ? "," : ".";
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
}

function joinParts(neg: boolean, int: string, frac: string | null, sep: Settings["separator"]): string {
  const point = sep === "US" ? "." : ",";
  return (neg ? "-" : "") + group(int, sep) + (frac === null ? "" : point + frac);
}

/** A stored value, rounded to DEC and fitted to ten digits. */
export function formatValue(x: number, s: Pick<Settings, "DEC" | "separator">): Rendered {
  if (!Number.isFinite(x)) return { mantissa: "Error 1", exponent: null };
  const abs = Math.abs(x);
  const floating = s.DEC === 9;
  const tooBig = abs >= 10 ** DISPLAY_DIGITS;
  const tooSmall = abs !== 0 && abs < 1e-9 && floating;
  if (tooBig || tooSmall) return scientific(x, s);

  const intDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 1;
  const room = Math.max(0, DISPLAY_DIGITS - intDigits);
  let text: string;
  if (floating) {
    text = roundDec(abs, room).toFixed(room).replace(/0+$/, "");
  } else {
    const dec = Math.min(s.DEC, room);
    text = roundDec(abs, dec).toFixed(dec);
  }
  // Rounding can carry into an eleventh digit (9,999,999,999.5 → 10,000,000,000).
  if (text.replace(/\D/g, "").replace(/^0+/, "").length > DISPLAY_DIGITS + 1) return scientific(x, s);
  const [int = "0", frac = ""] = text.split(".");
  const isZero = Number(text) === 0;
  // The decimal point is always lit: DEC 0 shows "3." and floating shows "2.".
  return {
    mantissa: joinParts(x < 0 && !isZero, int, frac, s.separator),
    exponent: null,
  };
}

function scientific(x: number, s: Pick<Settings, "DEC" | "separator">): Rendered {
  const digits = Math.min(s.DEC === 9 ? 7 : s.DEC, 7);
  const [m = "0", e = "0"] = x.toExponential(digits).split("e");
  let mant = m;
  if (s.DEC === 9) mant = mant.replace(/\.?0+$/, "");
  if (s.separator === "EUR") mant = mant.replace(".", ",");
  return { mantissa: mant, exponent: String(Number(e)) };
}

/** The digit buffer while the user is typing, grouped but not rounded. */
export function formatEntry(entry: string, s: Pick<Settings, "separator">): string {
  const neg = entry.startsWith("-");
  const body = neg ? entry.slice(1) : entry;
  if (body === "") return neg ? "-0" : "0";
  const dot = body.indexOf(".");
  const int = dot === -1 ? body : body.slice(0, dot) || "0";
  const frac = dot === -1 ? null : body.slice(dot + 1);
  return joinParts(neg, int, frac, s.separator);
}
