/**
 * Device error codes, returned as values (PRD §5). The display layer renders
 * `Error N`; nothing in the engine throws for a user-reachable condition.
 *
 *  1  overflow / math error (e.g. x! of a non-integer, log of ≤ 0)
 *  4  out of range (negative N, bad date, bad P/Y)
 *  5  no solution (TVM inputs all one sign; cash flows with no sign change)
 *  7  iteration limit reached
 *  8  iteration canceled by the user
 */
export type ErrorCode = 1 | 4 | 5 | 7 | 8;

export interface CalcError {
  readonly ok: false;
  readonly code: ErrorCode;
  readonly detail?: string;
}

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export type Result<T> = Ok<T> | CalcError;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = (code: ErrorCode, detail?: string): CalcError =>
  detail === undefined ? { ok: false, code } : { ok: false, code, detail };

/** Unwrap in tests and internal call sites that have already checked `ok`. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`Error ${r.code}${r.detail ? `: ${r.detail}` : ""}`);
  return r.value;
}
