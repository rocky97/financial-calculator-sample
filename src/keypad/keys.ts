/**
 * Physical keys of the device (PRD §5 keypad map) and the function each one
 * performs, with and without 2ND. A `Key` is what a finger presses; a `Fn` is
 * what the state machine acts on after 2ND has been resolved.
 */

export type Key =
  | "CPT" | "ENTER" | "UP" | "DOWN" | "ONOFF"
  | "2ND" | "CF" | "NPV" | "IRR" | "BKSP"
  | "N" | "IY" | "PV" | "PMT" | "FV"
  | "PCT" | "SQRT" | "SQR" | "RECIP" | "DIV"
  | "INV" | "LPAREN" | "RPAREN" | "POW" | "MUL"
  | "LN" | "7" | "8" | "9" | "SUB"
  | "STO" | "4" | "5" | "6" | "ADD"
  | "RCL" | "1" | "2" | "3" | "EQ"
  | "CE" | "0" | "DOT" | "NEG";

export type Fn =
  | Exclude<Key, "2ND" | "ONOFF">
  | "QUIT" | "SET" | "DEL" | "INS"
  | "XPY" | "PY" | "AMORT" | "BGN" | "CLRTVM"
  | "K" | "RAND" | "HYP" | "SIN" | "COS" | "TAN" | "FACT"
  | "EXP" | "DATA" | "STAT" | "BOND" | "NPR"
  | "ROUND" | "DEPR" | "PCHG" | "BRKEVN" | "NCR"
  | "DATE" | "ICONV" | "PROFIT" | "ANS"
  | "CLRWORK" | "MEM" | "FORMAT" | "RESET";

/** 2ND layer. Keys without an entry do nothing after 2ND (the 2ND indicator just clears). */
export const SECOND: Partial<Record<Key, Fn>> = {
  CPT: "QUIT", ENTER: "SET", UP: "DEL", DOWN: "INS",
  N: "XPY", IY: "PY", PV: "AMORT", PMT: "BGN", FV: "CLRTVM",
  PCT: "K", DIV: "RAND",
  INV: "HYP", LPAREN: "SIN", RPAREN: "COS", POW: "TAN", MUL: "FACT",
  LN: "EXP", "7": "DATA", "8": "STAT", "9": "BOND", SUB: "NPR",
  STO: "ROUND", "4": "DEPR", "5": "PCHG", "6": "BRKEVN", ADD: "NCR",
  "1": "DATE", "2": "ICONV", "3": "PROFIT", EQ: "ANS",
  CE: "CLRWORK", "0": "MEM", DOT: "FORMAT", NEG: "RESET",
};

export interface KeyFace {
  readonly key: Key;
  /** Primary legend on the key cap. */
  readonly label: string;
  /** 2ND legend printed above the key, if any. */
  readonly second?: string;
  readonly group: "nav" | "second" | "cash" | "tvm" | "fn" | "digit" | "op" | "mem" | "clear";
}

/** Rows of the keypad, top to bottom, as on the device (PRD §5). */
export const KEYPAD: readonly (readonly KeyFace[])[] = [
  [
    { key: "CPT", label: "CPT", second: "QUIT", group: "nav" },
    { key: "ENTER", label: "ENTER", second: "SET", group: "nav" },
    { key: "UP", label: "↑", second: "DEL", group: "nav" },
    { key: "DOWN", label: "↓", second: "INS", group: "nav" },
    { key: "ONOFF", label: "ON|OFF", group: "nav" },
  ],
  [
    { key: "2ND", label: "2ND", group: "second" },
    { key: "CF", label: "CF", group: "cash" },
    { key: "NPV", label: "NPV", group: "cash" },
    { key: "IRR", label: "IRR", group: "cash" },
    { key: "BKSP", label: "→", group: "fn" },
  ],
  [
    { key: "N", label: "N", second: "xP/Y", group: "tvm" },
    { key: "IY", label: "I/Y", second: "P/Y", group: "tvm" },
    { key: "PV", label: "PV", second: "AMORT", group: "tvm" },
    { key: "PMT", label: "PMT", second: "BGN", group: "tvm" },
    { key: "FV", label: "FV", second: "CLR TVM", group: "tvm" },
  ],
  [
    { key: "PCT", label: "%", second: "K", group: "fn" },
    { key: "SQRT", label: "√x", group: "fn" },
    { key: "SQR", label: "x²", group: "fn" },
    { key: "RECIP", label: "1/x", group: "fn" },
    { key: "DIV", label: "÷", second: "RAND", group: "op" },
  ],
  [
    { key: "INV", label: "INV", second: "HYP", group: "fn" },
    { key: "LPAREN", label: "(", second: "SIN", group: "fn" },
    { key: "RPAREN", label: ")", second: "COS", group: "fn" },
    { key: "POW", label: "yˣ", second: "TAN", group: "fn" },
    { key: "MUL", label: "×", second: "x!", group: "op" },
  ],
  [
    { key: "LN", label: "LN", second: "eˣ", group: "fn" },
    { key: "7", label: "7", second: "DATA", group: "digit" },
    { key: "8", label: "8", second: "STAT", group: "digit" },
    { key: "9", label: "9", second: "BOND", group: "digit" },
    { key: "SUB", label: "−", second: "nPr", group: "op" },
  ],
  [
    { key: "STO", label: "STO", second: "ROUND", group: "mem" },
    { key: "4", label: "4", second: "DEPR", group: "digit" },
    { key: "5", label: "5", second: "Δ%", group: "digit" },
    { key: "6", label: "6", second: "BRKEVN", group: "digit" },
    { key: "ADD", label: "+", second: "nCr", group: "op" },
  ],
  [
    { key: "RCL", label: "RCL", group: "mem" },
    { key: "1", label: "1", second: "DATE", group: "digit" },
    { key: "2", label: "2", second: "ICONV", group: "digit" },
    { key: "3", label: "3", second: "PROFIT", group: "digit" },
    { key: "EQ", label: "=", second: "ANS", group: "op" },
  ],
  [
    { key: "CE", label: "CE|C", second: "CLR WORK", group: "clear" },
    { key: "0", label: "0", second: "MEM", group: "clear" },
    { key: "DOT", label: ".", second: "FORMAT", group: "clear" },
    { key: "NEG", label: "+|−", second: "RESET", group: "clear" },
  ],
];

const FACES = new Map(KEYPAD.flat().map((f) => [f.key, f]));

/** Human-readable name of a key press, for the key log ("2ND PV" → "AMORT"). */
export function keyName(key: Key, withSecond: boolean): string {
  const face = FACES.get(key);
  if (!face) return key;
  return withSecond ? (face.second ?? face.label) : face.label;
}
