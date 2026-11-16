/**
 * The key state machine (PRD §10): one reducer, `press(state, key) → state`.
 * Every key is legal in every state; a key the device ignores in a given state
 * returns the state unchanged apart from clearing one-shot prefixes (2ND, INV).
 *
 * The display is a pure view of the state: see `display()`.
 */
import { roundDec, round13, solveTvm, type TvmVariable } from "../engine/index.js";
import { formatEntry, formatValue, DISPLAY_DIGITS } from "./format.js";
import { SECOND, type Fn, type Key } from "./keys.js";
import { DEFAULT_REGISTERS, WORKSHEETS, type Registers, type WorksheetId, type WsVar } from "./worksheets.js";

type BinOp = "+" | "-" | "*" | "/" | "pow" | "root" | "nPr" | "nCr";

interface Frame {
  vals: number[];
  ops: BinOp[];
}

export interface CalcState extends Registers {
  on: boolean;
  /** The x register: the value on screen when not typing and not showing a worksheet variable. */
  x: number;
  /** Digit buffer while typing ("-12.5"), or null. */
  entry: string | null;
  /** Pending arithmetic; one frame per open parenthesis, outermost first. */
  stack: Frame[];
  /** The last key was a binary operator (a second operator replaces it). */
  afterOp: boolean;
  second: boolean;
  inv: boolean;
  hyp: boolean;
  /** CPT was pressed in standard mode; the next TVM key computes. */
  compute: boolean;
  memPending: null | { kind: "STO" | "RCL"; op: BinOp | null };
  ws: null | { id: WorksheetId; index: number };
  /** In a worksheet: the screen shows the variable's stored value (not x or an entry). */
  showVar: boolean;
  /** Standard-mode label after a TVM store/recall/compute ("PMT"). */
  label: string | null;
  /** Label of the variable whose value was last computed by CPT, for the * indicator. */
  starred: string | null;
  error: number | null;
  /** RESET flow: "ask" shows RST ? and waits for ENTER; "done" shows RST 0.00. */
  reset: null | "ask" | "done";
  /** Out-of-band message for the UI (not on the LCD), e.g. a Phase 2 worksheet. */
  notice: string | null;
}

const TVM_KEYS: Partial<Record<Fn, { reg: TvmVariable; label: string }>> = {
  N: { reg: "N", label: "N" },
  IY: { reg: "IY", label: "I/Y" },
  PV: { reg: "PV", label: "PV" },
  PMT: { reg: "PMT", label: "PMT" },
  FV: { reg: "FV", label: "FV" },
};

const WS_KEYS: Partial<Record<Fn, WorksheetId>> = {
  CF: "CF", NPV: "NPV", IRR: "IRR", AMORT: "AMORT", PY: "PY", BGN: "BGN",
  FORMAT: "FORMAT", ICONV: "ICONV", PCHG: "PCHG", MEM: "MEM",
};

/** Keys whose worksheet or function is not built yet (PRD §8: Phase 2). */
const LATER: Partial<Record<Fn, string>> = {
  DATA: "DATA", STAT: "STAT", BOND: "BOND", DEPR: "DEPR", BRKEVN: "BRKEVN",
  DATE: "DATE", PROFIT: "PROFIT", K: "K (constant)",
};

const BIN_KEYS: Partial<Record<Fn, BinOp>> = {
  ADD: "+", SUB: "-", MUL: "*", DIV: "/", POW: "pow", NPR: "nPr", NCR: "nCr",
};

const DIGITS = new Set<Fn>(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
const UNARY = new Set<Fn>(["SQRT", "SQR", "RECIP", "LN", "EXP", "FACT", "ROUND", "XPY", "SIN", "COS", "TAN"]);

/** AOS precedence; Chn ignores it and evaluates left to right. */
const PREC: Record<BinOp, number> = { "+": 1, "-": 1, "*": 2, "/": 2, pow: 3, root: 3, nPr: 3, nCr: 3 };
const MAX_PENDING = 15;

/** Thrown inside a key handler to put the calculator into an error state. */
class DeviceError {
  constructor(readonly code: number) {}
}
const fail = (code: number): never => {
  throw new DeviceError(code);
};

export function initialState(regs: Registers = DEFAULT_REGISTERS): CalcState {
  return {
    ...structuredClone(regs),
    on: true,
    x: 0,
    entry: null,
    stack: [{ vals: [], ops: [] }],
    afterOp: false,
    second: false,
    inv: false,
    hyp: false,
    compute: false,
    memPending: null,
    ws: null,
    showVar: false,
    label: null,
    starred: null,
    error: null,
    reset: null,
    notice: null,
  };
}

/** The registers worth persisting (PRD §6). */
export function registersOf(s: CalcState): Registers {
  return structuredClone({
    settings: s.settings, tvm: s.tvm, CF0: s.CF0, flows: s.flows, npvI: s.npvI,
    npvValue: s.npvValue, irrValue: s.irrValue, amort: s.amort, iconv: s.iconv,
    pct: s.pct, mem: s.mem, ans: s.ans,
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function checked(v: number): number {
  if (Number.isNaN(v)) fail(2);
  if (!Number.isFinite(v) || Math.abs(v) >= 1e100) fail(1);
  return round13(Math.abs(v) < 1e-99 ? 0 : v);
}

function currentVar(s: CalcState): WsVar | null {
  if (!s.ws) return null;
  return WORKSHEETS[s.ws.id].vars(s)[s.ws.index] ?? null;
}

/** The number the user is looking at. */
function current(s: CalcState): number {
  if (s.entry !== null) return parseEntry(s.entry);
  if (s.ws && s.showVar) {
    const v = currentVar(s);
    if (v && v.kind !== "toggle") {
      const r = v.value(s);
      if (r.ok) return r.value;
    }
  }
  return s.x;
}

function parseEntry(e: string): number {
  const n = Number(e === "" || e === "-" ? "0" : e.endsWith(".") ? e.slice(0, -1) : e);
  return round13(n);
}

/** Leave the typed or shown value in x, ready to be operated on. */
function settle(s: CalcState): number {
  const v = current(s);
  s.x = v;
  s.entry = null;
  s.showVar = false;
  return v;
}

function freshResult(s: CalcState, v: number): void {
  s.x = checked(v);
  s.entry = null;
  s.showVar = false;
  s.label = null;
  s.starred = null;
  s.afterOp = false;
}

function apply(a: number, op: BinOp, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? fail(2) : a / b;
    case "pow": {
      if (a < 0 && !Number.isInteger(b)) fail(2);
      return a ** b;
    }
    case "root": {
      if (b === 0) fail(2);
      if (a < 0) {
        // Odd integer roots of negatives are real.
        if (Number.isInteger(b) && Math.abs(b) % 2 === 1) return -((-a) ** (1 / b));
        fail(2);
      }
      return a ** (1 / b);
    }
    case "nPr":
    case "nCr": {
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || b > a) fail(2);
      let r = 1;
      for (let i = 0; i < b; i++) r *= a - i;
      return op === "nPr" ? r : r / factorial(b);
    }
  }
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) fail(2);
  if (n > 69) fail(1);
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function top(s: CalcState): Frame {
  const f = s.stack[s.stack.length - 1];
  if (!f) throw new Error("empty stack");
  return f;
}

function reduce(f: Frame, minPrec: number): void {
  for (;;) {
    const op = f.ops[f.ops.length - 1];
    if (op === undefined || PREC[op] < minPrec) return;
    const b = f.vals.pop();
    const a = f.vals.pop();
    f.ops.pop();
    if (a === undefined || b === undefined) throw new Error("operand underflow");
    f.vals.push(checked(apply(a, op, b)));
  }
}

function pendingCount(s: CalcState): number {
  return s.stack.reduce((n, f) => n + f.ops.length, 0) + s.stack.length - 1;
}

/** "=" — and what ENTER, STO, and TVM keys do first to any pending arithmetic. */
function resolveAll(s: CalcState): number {
  const v = current(s);
  const pending = s.stack.length > 1 || top(s).ops.length > 0;
  if (!pending) return v;
  let x = v;
  for (let i = s.stack.length - 1; i >= 0; i--) {
    const f = s.stack[i];
    if (!f) continue;
    // A dangling operator ("3 + =") is dropped.
    if (f === top(s) && s.afterOp) f.ops.pop();
    else f.vals.push(x);
    reduce(f, 0);
    x = f.vals[0] ?? x;
  }
  s.stack = [{ vals: [], ops: [] }];
  s.afterOp = false;
  return checked(x);
}

function clearPending(s: CalcState): void {
  s.stack = [{ vals: [], ops: [] }];
  s.afterOp = false;
  s.memPending = null;
  s.compute = false;
}

function toStandard(s: CalcState): void {
  s.ws = null;
  s.showVar = false;
  s.entry = null;
  s.x = 0;
  s.label = null;
  s.starred = null;
  clearPending(s);
}

function openWorksheet(s: CalcState, id: WorksheetId): void {
  clearPending(s);
  s.ws = { id, index: 0 };
  s.showVar = true;
  s.entry = null;
  s.label = null;
  s.starred = null;
}

function powerOn(s: CalcState): void {
  s.on = true;
  s.error = null;
  s.reset = null;
  s.second = s.inv = s.hyp = false;
  toStandard(s);
}

function factoryReset(s: CalcState): void {
  const fresh = initialState();
  Object.assign(s, fresh);
  s.reset = "done";
}

// ─── unary functions ────────────────────────────────────────────────────────

const toRad = (s: CalcState, v: number): number => (s.settings.angle === "DEG" ? (v * Math.PI) / 180 : v);
const fromRad = (s: CalcState, v: number): number => (s.settings.angle === "DEG" ? (v * 180) / Math.PI : v);

function trig(s: CalcState, fn: "SIN" | "COS" | "TAN", v: number, inv: boolean, hyp: boolean): number {
  if (hyp) {
    if (!inv) return fn === "SIN" ? Math.sinh(v) : fn === "COS" ? Math.cosh(v) : Math.tanh(v);
    if (fn === "COS" && v < 1) fail(2);
    if (fn === "TAN" && Math.abs(v) >= 1) fail(2);
    return fn === "SIN" ? Math.asinh(v) : fn === "COS" ? Math.acosh(v) : Math.atanh(v);
  }
  if (inv) {
    if (fn !== "TAN" && Math.abs(v) > 1) fail(2);
    return fromRad(s, fn === "SIN" ? Math.asin(v) : fn === "COS" ? Math.acos(v) : Math.atan(v));
  }
  const r = toRad(s, v);
  // Snap exact multiples of 90° so sin 180 is 0 and tan 90 is an error, as on the device.
  const quarter = r / (Math.PI / 2);
  const q = Math.round(quarter);
  const exact = Math.abs(quarter - q) < 1e-12;
  if (exact) {
    const m = ((q % 4) + 4) % 4;
    if (fn === "SIN") return [0, 1, 0, -1][m] ?? 0;
    if (fn === "COS") return [1, 0, -1, 0][m] ?? 0;
    if (m % 2 === 1) fail(2);
    return 0;
  }
  return fn === "SIN" ? Math.sin(r) : fn === "COS" ? Math.cos(r) : Math.tan(r);
}

function unary(s: CalcState, fn: Fn, v: number, inv: boolean, hyp: boolean): number | null {
  switch (fn) {
    case "SQRT": return v < 0 ? fail(2) : Math.sqrt(v);
    case "SQR": return inv ? (v < 0 ? fail(2) : Math.sqrt(v)) : v * v;
    case "RECIP": return v === 0 ? fail(2) : 1 / v;
    case "LN": return inv ? Math.exp(v) : v <= 0 ? fail(2) : Math.log(v);
    case "EXP": return inv ? (v <= 0 ? fail(2) : Math.log(v)) : Math.exp(v);
    case "FACT": return factorial(v);
    case "ROUND": return roundDec(v, s.settings.DEC);
    case "XPY": return v * s.settings.PY;
    case "SIN":
    case "COS":
    case "TAN":
      return trig(s, fn, v, inv, hyp);
    default:
      return null;
  }
}

// ─── the reducer ────────────────────────────────────────────────────────────

export function press(prev: CalcState, key: Key): CalcState {
  const s = structuredClone(prev);
  s.notice = null;
  try {
    step(s, key);
  } catch (e) {
    if (!(e instanceof DeviceError)) throw e;
    s.error = e.code;
    s.entry = null;
    clearPending(s);
  }
  return s;
}

function step(s: CalcState, key: Key): void {
  if (key === "ONOFF") {
    if (s.on) s.on = false;
    else powerOn(s);
    return;
  }
  if (!s.on) return;

  if (key === "2ND") {
    s.second = !s.second;
    return;
  }
  const withSecond = s.second;
  s.second = false;
  const fn: Fn | undefined = withSecond ? SECOND[key] : (key as Fn);
  if (fn === undefined) return; // 2ND then a key with no second function: nothing.

  // An error waits for CE|C (or QUIT); every other key is ignored.
  if (s.error !== null) {
    if (fn === "CE" || fn === "QUIT") {
      s.error = null;
      if (fn === "QUIT" || !s.ws) toStandard(s);
      else s.showVar = true;
    }
    return;
  }

  if (s.reset === "ask") {
    if (fn === "ENTER") factoryReset(s);
    else if (fn === "CE" || fn === "QUIT") {
      s.reset = null;
      toStandard(s);
    }
    return;
  }
  if (s.reset === "done") s.reset = null;

  // INV / HYP are one-shot prefixes for the next function key.
  if (fn === "INV") {
    s.inv = !s.inv;
    return;
  }
  if (fn === "HYP") {
    s.hyp = !s.hyp;
    return;
  }
  const inv = s.inv;
  const hyp = s.hyp;
  s.inv = s.hyp = false;

  const computeArmed = s.compute;
  s.compute = false;

  // STO / RCL waiting for a register.
  if (s.memPending) {
    const mp = s.memPending;
    const bin = BIN_KEYS[fn];
    if (mp.kind === "STO" && bin && mp.op === null && bin !== "nPr" && bin !== "nCr") {
      s.memPending = { ...mp, op: bin };
      return;
    }
    s.memPending = null;
    if (DIGITS.has(fn)) {
      const d = Number(fn);
      if (mp.kind === "STO") {
        const v = settle(s);
        const old = s.mem[d] ?? 0;
        s.mem[d] = checked(mp.op ? apply(old, mp.op, v) : v);
        s.label = null;
      } else {
        freshResult(s, s.mem[d] ?? 0);
      }
      return;
    }
    const tvm = TVM_KEYS[fn];
    if (mp.kind === "RCL" && tvm) {
      freshResult(s, s.tvm[tvm.reg]);
      s.ws = null;
      s.label = tvm.label;
      return;
    }
    // Any other key cancels STO/RCL and then acts normally.
  }

  if (DIGITS.has(fn) || fn === "DOT") return typeDigit(s, fn);

  const tvm = TVM_KEYS[fn];
  if (tvm) return tvmKey(s, tvm.reg, tvm.label, computeArmed);

  const wsId = WS_KEYS[fn];
  if (wsId) return openWorksheet(s, wsId);

  const later = LATER[fn];
  if (later) {
    s.notice = `${later} is not built yet (Phase 2).`;
    return;
  }

  const bin = BIN_KEYS[fn];
  if (bin) return binary(s, fn === "POW" && inv ? "root" : bin);

  if (UNARY.has(fn)) {
    const v = settle(s);
    freshResult(s, unary(s, fn, v, inv, hyp) ?? v);
    return;
  }

  switch (fn) {
    case "CPT":
      return cpt(s);
    case "ENTER":
      return enter(s);
    case "SET": {
      const v = currentVar(s);
      if (v?.kind === "toggle" && v.toggle) {
        v.toggle(s);
        s.showVar = true;
        s.entry = null;
      }
      return;
    }
    case "UP":
    case "DOWN":
      return move(s, fn === "UP" ? -1 : 1);
    case "DEL":
    case "INS": {
      if (!s.ws) return;
      const def = WORKSHEETS[s.ws.id];
      const handler = fn === "DEL" ? def.del : def.ins;
      const idx = handler?.(s, s.ws.index);
      if (idx === null || idx === undefined) return;
      s.ws.index = Math.min(idx, def.vars(s).length - 1);
      s.showVar = true;
      s.entry = null;
      s.starred = null;
      return;
    }
    case "QUIT":
      return toStandard(s);
    case "CE":
      return clearEntry(s);
    case "CLRWORK": {
      if (!s.ws) return;
      const def = WORKSHEETS[s.ws.id];
      def.clear(s);
      s.ws.index = Math.min(s.ws.index, def.vars(s).length - 1);
      s.showVar = true;
      s.entry = null;
      s.starred = null;
      clearPending(s);
      return;
    }
    case "CLRTVM":
      s.tvm = { N: 0, IY: 0, PV: 0, PMT: 0, FV: 0 };
      if (!s.ws) toStandard(s);
      return;
    case "RESET":
      s.reset = "ask";
      clearPending(s);
      s.entry = null;
      return;
    case "BKSP":
      if (s.entry === null) return;
      s.entry = s.entry.slice(0, -1);
      if (s.entry === "" || s.entry === "-") s.entry = s.entry + "0";
      return;
    case "NEG":
      if (s.entry !== null) {
        s.entry = s.entry.startsWith("-") ? s.entry.slice(1) : "-" + s.entry;
        return;
      }
      if (s.ws && s.showVar) {
        // Negating a shown worksheet value leaves it pending ENTER, like a fresh entry.
        const v = -current(s);
        s.entry = String(v === 0 ? 0 : v);
        s.showVar = false;
        s.starred = null;
        return;
      }
      freshResult(s, -current(s));
      return;
    case "PCT": {
      const v = settle(s);
      const f = top(s);
      const op = f.ops[f.ops.length - 1];
      const base = f.vals[f.vals.length - 1];
      const r = (op === "+" || op === "-") && base !== undefined ? (base * v) / 100 : v / 100;
      freshResult(s, r);
      return;
    }
    case "LPAREN":
      if (pendingCount(s) >= MAX_PENDING) fail(3);
      s.entry = null;
      s.showVar = false;
      s.label = null;
      s.afterOp = false;
      s.stack.push({ vals: [], ops: [] });
      return;
    case "RPAREN": {
      if (s.stack.length < 2) return;
      const f = top(s);
      if (s.afterOp) f.ops.pop();
      else f.vals.push(settle(s));
      reduce(f, 0);
      s.stack.pop();
      freshResult(s, f.vals[0] ?? s.x);
      return;
    }
    case "EQ": {
      const v = resolveAll(s);
      freshResult(s, v);
      s.ans = s.x;
      return;
    }
    case "ANS":
      freshResult(s, s.ans);
      return;
    case "RAND":
      freshResult(s, Math.random());
      return;
    case "STO":
    case "RCL":
      s.memPending = { kind: fn, op: null };
      return;
    default:
      return;
  }
}

function typeDigit(s: CalcState, fn: Fn): void {
  if (s.entry === null) {
    s.entry = "";
    s.showVar = false;
    s.afterOp = false;
    if (!s.ws) s.label = null;
    s.starred = null;
  }
  const neg = s.entry.startsWith("-");
  let body = neg ? s.entry.slice(1) : s.entry;
  if (fn === "DOT") {
    if (body.includes(".")) return;
    body = (body === "" ? "0" : body) + ".";
  } else {
    if (body.replace(/\D/g, "").length >= DISPLAY_DIGITS) return;
    body = body === "0" ? fn : body + fn;
  }
  s.entry = (neg ? "-" : "") + body;
}

function binary(s: CalcState, op: BinOp): void {
  const f = top(s);
  if (s.afterOp && f.ops.length > 0) {
    f.ops[f.ops.length - 1] = op; // a second operator replaces the first
    return;
  }
  const v = settle(s);
  s.label = null;
  s.starred = null;
  f.vals.push(v);
  reduce(f, s.settings.method === "Chn" ? 0 : PREC[op]);
  if (pendingCount(s) >= MAX_PENDING) fail(3);
  f.ops.push(op);
  s.x = f.vals[f.vals.length - 1] ?? v;
  s.afterOp = true;
}

function tvmKey(s: CalcState, reg: TvmVariable, label: string, computeArmed: boolean): void {
  s.ws = null;
  s.showVar = false;
  if (computeArmed) {
    clearPending(s);
    s.entry = null;
    const r = solveTvm(s.tvm, s.settings, reg);
    if (!r.ok) fail(r.code);
    else {
      s.tvm = { ...s.tvm, [reg]: r.value };
      freshResult(s, r.value);
      s.label = label;
      s.starred = label;
    }
    return;
  }
  // Store: finish any pending arithmetic first ("30 × 12 N" stores 360).
  const v = resolveAll(s);
  s.tvm = { ...s.tvm, [reg]: v };
  freshResult(s, v);
  s.label = label;
}

function cpt(s: CalcState): void {
  if (!s.ws) {
    s.compute = true;
    return;
  }
  const v = currentVar(s);
  if (!v?.compute) return;
  clearPending(s);
  const r = v.compute(s);
  if (!r.ok) fail(r.code);
  s.entry = null;
  s.showVar = true;
  // AMORT's CPT advances the range rather than computing a result.
  s.starred = s.ws.id === "AMORT" ? null : v.label;
}

function enter(s: CalcState): void {
  const v = currentVar(s);
  if (!v || !v.set || (v.kind !== "enter" && v.kind !== "both")) return;
  if (s.showVar && s.entry === null) return; // nothing new to store
  const value = resolveAll(s);
  const r = v.set(s, value);
  if (!r.ok) fail(r.code);
  s.entry = null;
  s.showVar = true;
  s.starred = null;
}

function move(s: CalcState, dir: 1 | -1): void {
  if (!s.ws) return;
  const n = WORKSHEETS[s.ws.id].vars(s).length;
  s.ws.index = (s.ws.index + dir + n) % n;
  // Moving away without ENTER discards a typed value.
  s.entry = null;
  s.showVar = true;
  clearPending(s);
}

function clearEntry(s: CalcState): void {
  if (s.entry !== null) {
    s.entry = null;
    if (s.ws) s.showVar = true;
    else s.x = 0;
    return;
  }
  clearPending(s);
  if (s.ws) {
    s.showVar = true;
    return;
  }
  s.x = 0;
  s.label = null;
  s.starred = null;
}

// ─── display ────────────────────────────────────────────────────────────────

export interface Indicators {
  second: boolean;
  inv: boolean;
  hyp: boolean;
  compute: boolean;
  enter: boolean;
  set: boolean;
  del: boolean;
  ins: boolean;
  bgn: boolean;
  rad: boolean;
  up: boolean;
  down: boolean;
  eq: boolean;
  star: boolean;
}

export interface Display {
  /** Variable label at the left ("PMT", "C01"), or "". */
  label: string;
  /** Main readout: a formatted number, a setting ("END"), or "Error 5". */
  value: string;
  exponent: string | null;
  indicators: Indicators;
  /** False when the calculator is switched off. */
  on: boolean;
}

export function display(s: CalcState): Display {
  const ind: Indicators = {
    second: s.second, inv: s.inv, hyp: s.hyp,
    compute: s.compute, enter: false, set: false, del: false, ins: false,
    bgn: s.settings.timing === "BGN", rad: s.settings.angle === "RAD",
    up: false, down: false, eq: false, star: false,
  };
  const out = (label: string, value: string, exponent: string | null = null): Display => ({
    label, value, exponent, indicators: ind, on: s.on,
  });
  if (!s.on) return out("", "");
  if (s.error !== null) return out("", `Error ${s.error}`);
  if (s.reset === "ask") {
    ind.enter = true;
    return out("RST", "?");
  }
  if (s.reset === "done") {
    const z = formatValue(0, s.settings);
    return out("RST", z.mantissa);
  }

  const v = currentVar(s);
  if (s.ws && v) {
    const def = WORKSHEETS[s.ws.id];
    const count = def.vars(s).length;
    ind.up = ind.down = count > 1;
    ind.enter = v.kind === "enter" || v.kind === "both";
    ind.compute = ind.compute || v.kind === "compute" || v.kind === "both" || (s.ws.id === "AMORT" && !!v.compute);
    ind.set = v.kind === "toggle";
    ind.del = ind.ins = s.ws.id === "CF";
    if (v.kind === "toggle") return out(v.text?.(s) ?? "", "");
  }

  if (s.entry !== null) {
    return out(s.ws && v ? v.label : "", formatEntry(s.entry, s.settings));
  }

  if (s.ws && v && s.showVar) {
    const r = v.value(s);
    if (!r.ok) return out("", `Error ${r.code}`);
    ind.eq = true;
    ind.star = s.starred === v.label;
    const f = formatValue(r.value, s.settings);
    return out(v.label, f.mantissa, f.exponent);
  }

  const f = formatValue(s.x, s.settings);
  const label = s.ws && v ? v.label : (s.label ?? "");
  if (!s.ws && s.label) {
    ind.eq = true;
    ind.star = s.starred === s.label;
  }
  return out(label, f.mantissa, f.exponent);
}
