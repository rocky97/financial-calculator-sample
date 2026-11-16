/**
 * Worksheet cursor definitions (PRD §10, "Worksheet cursor semantics"). Each
 * worksheet is an ordered list of variables with a kind that decides which
 * keys act on it:
 *
 *   enter    ENTER stores the displayed value
 *   compute  CPT computes it; ENTER does nothing
 *   both     ENTER stores or CPT computes
 *   auto     shown already computed from the other variables (AMORT BAL/PRN/INT)
 *   toggle   2ND SET cycles its setting
 *
 * Variable lists are functions of state because some depend on it (the CF
 * worksheet grows with each flow). The functions mutate a draft state the
 * machine has already cloned.
 */
import {
  CLEARED_TVM,
  DEFAULT_SETTINGS,
  DEVICE_MAX_FLOWS,
  DEVICE_MAX_FREQUENCY,
  amortize,
  effectiveToNominal,
  err,
  irr,
  nominalToEffective,
  npv,
  ok,
  solvePctChange,
  type CashFlow,
  type PctChangeRegisters,
  type Result,
  type Settings,
  type TvmRegisters,
} from "../engine/index.js";

export type WorksheetId = "CF" | "NPV" | "IRR" | "AMORT" | "PY" | "BGN" | "FORMAT" | "ICONV" | "PCHG" | "MEM";

/** Every register the keypad can reach; persisted between sessions (PRD §6). */
export interface Registers {
  settings: Settings;
  tvm: TvmRegisters;
  CF0: number;
  flows: CashFlow[];
  npvI: number;
  npvValue: number;
  irrValue: number;
  amort: { P1: number; P2: number };
  iconv: { NOM: number; EFF: number; CY: number };
  pct: PctChangeRegisters;
  mem: number[];
  ans: number;
}

export const DEFAULT_REGISTERS: Readonly<Registers> = Object.freeze<Registers>({
  settings: { ...DEFAULT_SETTINGS },
  tvm: { ...CLEARED_TVM },
  CF0: 0,
  flows: [],
  npvI: 0,
  npvValue: 0,
  irrValue: 0,
  amort: { P1: 1, P2: 1 },
  iconv: { NOM: 0, EFF: 0, CY: 1 },
  pct: { OLD: 0, NEW: 0, PCH: 0, PD: 1 },
  mem: Array<number>(10).fill(0),
  ans: 0,
});

export type VarKind = "enter" | "compute" | "both" | "auto" | "toggle";

export interface WsVar {
  readonly label: string;
  readonly kind: VarKind;
  /** Current value; `auto` variables compute here and may return an error. */
  value(r: Registers): Result<number>;
  /** Text shown instead of a number for `toggle` variables ("END", "AOS"…). */
  text?(r: Registers): string;
  /** Store an entered value. Returns an error code to display, or null. */
  set?(r: Registers, v: number): Result<null>;
  /** CPT: compute, store, and return the value. */
  compute?(r: Registers): Result<number>;
  toggle?(r: Registers): void;
}

export interface WorksheetDef {
  readonly id: WorksheetId;
  vars(r: Registers): WsVar[];
  /** 2ND CLR WORK. */
  clear(r: Registers): void;
  /** 2ND DEL / 2ND INS at cursor `index`; returns the new cursor, or null if not allowed. */
  del?(r: Registers, index: number): number | null;
  ins?(r: Registers, index: number): number | null;
}

const done = ok(null);
const num = (label: string, kind: VarKind, get: (r: Registers) => number, set?: (r: Registers, v: number) => Result<null>): WsVar =>
  set ? { label, kind, value: (r) => ok(get(r)), set } : { label, kind, value: (r) => ok(get(r)) };

const isInt = (v: number): boolean => Number.isInteger(v);
const pad2 = (n: number): string => String(n).padStart(2, "0");

const cashFlow: WorksheetDef = {
  id: "CF",
  vars(r) {
    const out: WsVar[] = [num("CF0", "enter", (x) => x.CF0, (x, v) => ((x.CF0 = v), done))];
    r.flows.forEach((_, j) => {
      out.push(
        num(`C${pad2(j + 1)}`, "enter", (x) => x.flows[j]?.amount ?? 0, (x, v) => {
          const f = x.flows[j];
          if (f) x.flows[j] = { ...f, amount: v };
          return done;
        }),
        num(`F${pad2(j + 1)}`, "enter", (x) => x.flows[j]?.frequency ?? 1, (x, v) => {
          const max = x.settings.deviceLimitsOff ? Infinity : DEVICE_MAX_FREQUENCY;
          if (!isInt(v) || v < 1 || v > max) return err(4, "frequency out of range");
          const f = x.flows[j];
          if (f) x.flows[j] = { ...f, frequency: v };
          return done;
        }),
      );
    });
    const limit = r.settings.deviceLimitsOff ? Infinity : DEVICE_MAX_FLOWS;
    if (r.flows.length < limit) {
      // The next, still-empty flow: entering a value creates it with F = 1.
      out.push(num(`C${pad2(r.flows.length + 1)}`, "enter", () => 0, (x, v) => {
        x.flows.push({ amount: v, frequency: 1 });
        return done;
      }));
    }
    return out;
  },
  clear(r) {
    r.CF0 = 0;
    r.flows = [];
  },
  del(r, index) {
    if (index === 0) return null;
    const j = Math.floor((index - 1) / 2);
    if (j >= r.flows.length) return null;
    r.flows.splice(j, 1);
    return 1 + 2 * j;
  },
  ins(r, index) {
    if (index === 0) return null;
    const limit = r.settings.deviceLimitsOff ? Infinity : DEVICE_MAX_FLOWS;
    if (r.flows.length >= limit) return null;
    const j = Math.floor((index - 1) / 2);
    r.flows.splice(j, 0, { amount: 0, frequency: 1 });
    return 1 + 2 * j;
  },
};

const sheetOf = (r: Registers) => ({ CF0: r.CF0, flows: r.flows });

const npvSheet: WorksheetDef = {
  id: "NPV",
  vars: () => [
    num("I", "enter", (r) => r.npvI, (r, v) => ((r.npvI = v), done)),
    {
      label: "NPV",
      kind: "compute",
      value: (r) => ok(r.npvValue),
      compute(r) {
        const v = npv(sheetOf(r), r.npvI);
        if (v.ok) r.npvValue = v.value;
        return v;
      },
    },
  ],
  clear(r) {
    r.npvI = 0;
    r.npvValue = 0;
  },
};

const irrSheet: WorksheetDef = {
  id: "IRR",
  vars: () => [
    {
      label: "IRR",
      kind: "compute",
      value: (r) => ok(r.irrValue),
      compute(r) {
        const v = irr(sheetOf(r));
        if (v.ok) r.irrValue = v.value;
        return v;
      },
    },
  ],
  clear(r) {
    r.irrValue = 0;
  },
};

const amortVar = (label: "BAL" | "PRN" | "INT"): WsVar => ({
  label,
  kind: "auto",
  value(r) {
    const a = amortize(r.tvm, r.settings, r.amort.P1, r.amort.P2);
    return a.ok ? ok(a.value[label]) : a;
  },
});

const amortSheet: WorksheetDef = {
  id: "AMORT",
  vars: () => {
    const period = (key: "P1" | "P2"): WsVar => ({
      label: key,
      kind: "enter",
      value: (r) => ok(r.amort[key]),
      set(r, v) {
        if (!isInt(v) || v < 1) return err(4, "P1 and P2 must be whole periods ≥ 1");
        r.amort[key] = v;
        return done;
      },
      // CPT at P1 or P2 moves to the next range of the same length.
      compute(r) {
        const len = r.amort.P2 - r.amort.P1 + 1;
        r.amort = { P1: r.amort.P2 + 1, P2: r.amort.P2 + len };
        return ok(r.amort[key]);
      },
    });
    return [period("P1"), period("P2"), amortVar("BAL"), amortVar("PRN"), amortVar("INT")];
  },
  clear(r) {
    r.amort = { P1: 1, P2: 1 };
  },
};

const positive = (v: number): boolean => v > 0;

const pySheet: WorksheetDef = {
  id: "PY",
  vars: () => [
    num("P/Y", "enter", (r) => r.settings.PY, (r, v) => {
      if (!positive(v)) return err(4, "P/Y must be positive");
      r.settings = { ...r.settings, PY: v, CY: v }; // C/Y follows P/Y
      return done;
    }),
    num("C/Y", "enter", (r) => r.settings.CY, (r, v) => {
      if (!positive(v)) return err(4, "C/Y must be positive");
      r.settings = { ...r.settings, CY: v };
      return done;
    }),
  ],
  clear(r) {
    r.settings = { ...r.settings, PY: DEFAULT_SETTINGS.PY, CY: DEFAULT_SETTINGS.CY };
  },
};

const toggle = (text: (r: Registers) => string, flip: (r: Registers) => void): WsVar => ({
  label: "",
  kind: "toggle",
  value: () => ok(0),
  text,
  toggle: flip,
});

const bgnSheet: WorksheetDef = {
  id: "BGN",
  vars: () => [
    toggle(
      (r) => r.settings.timing,
      (r) => (r.settings = { ...r.settings, timing: r.settings.timing === "END" ? "BGN" : "END" }),
    ),
  ],
  clear(r) {
    r.settings = { ...r.settings, timing: "END" };
  },
};

const formatSheet: WorksheetDef = {
  id: "FORMAT",
  vars: () => [
    num("DEC", "enter", (r) => r.settings.DEC, (r, v) => {
      if (!isInt(v) || v < 0 || v > 9) return err(4, "DEC is 0–9");
      r.settings = { ...r.settings, DEC: v };
      return done;
    }),
    toggle(
      (r) => r.settings.angle,
      (r) => (r.settings = { ...r.settings, angle: r.settings.angle === "DEG" ? "RAD" : "DEG" }),
    ),
    toggle(
      (r) => (r.settings.dateFormat === "US" ? "US 12-31-1990" : "EUR 31-12-1990"),
      (r) => (r.settings = { ...r.settings, dateFormat: r.settings.dateFormat === "US" ? "EUR" : "US" }),
    ),
    toggle(
      (r) => (r.settings.separator === "US" ? "US 1,000." : "EUR 1.000,"),
      (r) => (r.settings = { ...r.settings, separator: r.settings.separator === "US" ? "EUR" : "US" }),
    ),
    toggle(
      (r) => r.settings.method,
      (r) => (r.settings = { ...r.settings, method: r.settings.method === "Chn" ? "AOS" : "Chn" }),
    ),
  ],
  clear(r) {
    const d = DEFAULT_REGISTERS.settings;
    r.settings = {
      ...r.settings,
      DEC: d.DEC, angle: d.angle, dateFormat: d.dateFormat, separator: d.separator, method: d.method,
    };
  },
};

const iconvSheet: WorksheetDef = {
  id: "ICONV",
  vars: () => [
    {
      label: "NOM",
      kind: "both",
      value: (r) => ok(r.iconv.NOM),
      set: (r, v) => ((r.iconv.NOM = v), done),
      compute(r) {
        const v = effectiveToNominal(r.iconv.EFF, r.iconv.CY);
        if (v.ok) r.iconv.NOM = v.value;
        return v;
      },
    },
    {
      label: "EFF",
      kind: "both",
      value: (r) => ok(r.iconv.EFF),
      set: (r, v) => ((r.iconv.EFF = v), done),
      compute(r) {
        const v = nominalToEffective(r.iconv.NOM, r.iconv.CY);
        if (v.ok) r.iconv.EFF = v.value;
        return v;
      },
    },
    num("C/Y", "enter", (r) => r.iconv.CY, (r, v) => {
      if (!positive(v)) return err(4, "C/Y must be positive");
      r.iconv.CY = v;
      return done;
    }),
  ],
  clear(r) {
    r.iconv = { NOM: 0, EFF: 0, CY: 1 };
  },
};

const pctVar = (label: string, key: keyof PctChangeRegisters): WsVar => ({
  label,
  kind: "both",
  value: (r) => ok(r.pct[key]),
  set: (r, v) => ((r.pct = { ...r.pct, [key]: v }), done),
  compute(r) {
    const target = key === "PCH" ? "PCH" : key === "PD" ? "PD" : key;
    const v = solvePctChange(r.pct, target);
    if (v.ok) r.pct = { ...r.pct, [key]: v.value };
    return v;
  },
});

const pctSheet: WorksheetDef = {
  id: "PCHG",
  vars: () => [pctVar("OLD", "OLD"), pctVar("NEW", "NEW"), pctVar("%CH", "PCH"), pctVar("#PD", "PD")],
  clear(r) {
    r.pct = { OLD: 0, NEW: 0, PCH: 0, PD: 1 };
  },
};

const memSheet: WorksheetDef = {
  id: "MEM",
  vars: () =>
    Array.from({ length: 10 }, (_, d) =>
      num(`M${d}`, "enter", (r) => r.mem[d] ?? 0, (r, v) => ((r.mem[d] = v), done)),
    ),
  clear(r) {
    r.mem = Array<number>(10).fill(0);
  },
};

export const WORKSHEETS: Readonly<Record<WorksheetId, WorksheetDef>> = {
  CF: cashFlow,
  NPV: npvSheet,
  IRR: irrSheet,
  AMORT: amortSheet,
  PY: pySheet,
  BGN: bgnSheet,
  FORMAT: formatSheet,
  ICONV: iconvSheet,
  PCHG: pctSheet,
  MEM: memSheet,
};
