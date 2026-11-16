/**
 * PRD §7 golden cases. Expected values are textbook/device values rounded to
 * the display (DEC = 2); we compare the engine's stored value rounded the same
 * way, and separately check internal precision where a closed form exists.
 */
import { describe, expect, it } from "vitest";
import {
  CLEARED_TVM,
  DEFAULT_SETTINGS,
  agreesTo,
  amortize,
  effectiveToNominal,
  irr,
  nominalToEffective,
  npv,
  roundDec,
  solvePctChange,
  solveTvm,
  unwrap,
  type Settings,
} from "../src/engine/index.js";

const monthly: Settings = { ...DEFAULT_SETTINGS, PY: 12, CY: 12 };
const annual: Settings = { ...DEFAULT_SETTINGS, PY: 1, CY: 1 };
const show = (x: number, dec = 2): number => roundDec(x, dec);

describe("TVM (PRD §7)", () => {
  it("Mortgage PMT: N 360, I/Y 6, PV 200,000, FV 0, P/Y = C/Y = 12 → −1,199.10", () => {
    const pmt = unwrap(solveTvm({ ...CLEARED_TVM, N: 360, IY: 6, PV: 200_000 }, monthly, "PMT"));
    expect(show(pmt)).toBe(-1199.1);
    // Closed form: 200000 · 0.005 / (1 − 1.005^−360). PRD §6 bar: agree to the
    // 10th significant digit (the stored value is rounded to 13).
    const exact = -(200_000 * 0.005) / (1 - Math.pow(1.005, -360));
    expect(agreesTo(pmt, exact, 10)).toBe(true);
  });

  it("Lump-sum FV: N 5, I/Y 10, PV −1,000, P/Y 1 → 1,610.51", () => {
    const fv = unwrap(solveTvm({ ...CLEARED_TVM, N: 5, IY: 10, PV: -1000 }, annual, "FV"));
    expect(show(fv)).toBe(1610.51);
  });

  it("Solve I/Y: N 10, PV −1,000, FV 2,000, P/Y 1 → 7.18", () => {
    const iy = unwrap(solveTvm({ ...CLEARED_TVM, N: 10, PV: -1000, FV: 2000 }, annual, "IY"));
    expect(show(iy)).toBe(7.18);
    expect(iy).toBeCloseTo((Math.pow(2, 0.1) - 1) * 100, 9);
  });

  it("BGN vs END: N 10, I/Y 5, PMT 100, P/Y 1 → PV −772.17 END, −810.78 BGN", () => {
    const regs = { ...CLEARED_TVM, N: 10, IY: 5, PMT: 100 };
    expect(show(unwrap(solveTvm(regs, annual, "PV")))).toBe(-772.17);
    expect(show(unwrap(solveTvm(regs, { ...annual, timing: "BGN" }, "PV")))).toBe(-810.78);
  });

  it("Error 5: PV 1,000, FV 2,000, PMT 0, N 10 (same sign) when solving I/Y", () => {
    const r = solveTvm({ ...CLEARED_TVM, N: 10, PV: 1000, FV: 2000 }, annual, "IY");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(5);
  });

  it("Solve N round-trips the mortgage: PV 200,000, PMT −1,199.10, I/Y 6 → ≈ 360", () => {
    const n = unwrap(
      solveTvm({ ...CLEARED_TVM, IY: 6, PV: 200_000, PMT: -1199.1011 }, monthly, "N"),
    );
    expect(show(n)).toBe(360);
  });
});

describe("TVM edge cases (PRD §7)", () => {
  it("I/Y = 0 degenerates to linear: PV −1,000, PMT 100, N 10 → FV 0", () => {
    const fv = unwrap(solveTvm({ ...CLEARED_TVM, N: 10, IY: 0, PV: -1000, PMT: 100 }, annual, "FV"));
    expect(fv).toBe(0);
  });

  it("I/Y = 0 solving N: PV −1,000, PMT 100 → N 10", () => {
    const n = unwrap(solveTvm({ ...CLEARED_TVM, IY: 0, PV: -1000, PMT: 100 }, annual, "N"));
    expect(n).toBe(10);
  });

  it("Non-integer N: FV of 1,000 at 10% for 2.5 years", () => {
    const fv = unwrap(solveTvm({ ...CLEARED_TVM, N: 2.5, IY: 10, PV: -1000 }, annual, "FV"));
    expect(fv).toBeCloseTo(1000 * Math.pow(1.1, 2.5), 9);
  });

  it("P/Y ≠ C/Y: monthly payments, annual compounding", () => {
    // 12 monthly payments of 100, 12% compounded annually, END.
    const s: Settings = { ...DEFAULT_SETTINGS, PY: 12, CY: 1 };
    const i = Math.pow(1.12, 1 / 12) - 1;
    const expected = -(100 * (1 - Math.pow(1 + i, -12))) / i;
    const pv = unwrap(solveTvm({ ...CLEARED_TVM, N: 12, IY: 12, PMT: 100 }, s, "PV"));
    expect(pv).toBeCloseTo(expected, 9);
  });

  it("Solving I/Y with PMT only (annuity): PV −772.17, PMT 100, N 10 → 5.00", () => {
    const iy = unwrap(
      solveTvm({ ...CLEARED_TVM, N: 10, PV: -772.1734929, PMT: 100 }, annual, "IY"),
    );
    expect(show(iy)).toBe(5);
  });

  it("Regression: tiny rates do not fake a root (I/Y for a 0.1% annuity solves to 0.10, not 0)", () => {
    const i = 0.001;
    const pv = -(100 * (1 - Math.pow(1 + i, -10))) / i;
    const iy = unwrap(solveTvm({ ...CLEARED_TVM, N: 10, PV: pv, PMT: 100 }, annual, "IY"));
    expect(iy).toBeCloseTo(0.1, 8);
  });

  it("Error 4: negative N as an input", () => {
    const r = solveTvm({ ...CLEARED_TVM, N: -5, IY: 10, PV: -1000 }, annual, "FV");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(4);
  });
});

describe("Cash Flow (PRD §7)", () => {
  const sheet = { CF0: -1000, flows: [{ amount: 400, frequency: 3 }] };

  it("NPV at I = 10 → −5.26", () => {
    expect(show(unwrap(npv(sheet, 10)))).toBe(-5.26);
  });

  it("IRR → 9.70", () => {
    const r = unwrap(irr(sheet));
    expect(show(r)).toBe(9.7);
    // NPV at the IRR is zero to engine precision.
    expect(Math.abs(unwrap(npv(sheet, r)))).toBeLessThan(1e-8);
  });

  it("Error 5 when flows never change sign", () => {
    const r = irr({ CF0: 1000, flows: [{ amount: 400, frequency: 3 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(5);
  });

  it("Frequency expands correctly: 3 × 400 equals three explicit 400s", () => {
    const explicit = {
      CF0: -1000,
      flows: [
        { amount: 400, frequency: 1 },
        { amount: 400, frequency: 1 },
        { amount: 400, frequency: 1 },
      ],
    };
    expect(unwrap(npv(sheet, 10))).toBe(unwrap(npv(explicit, 10)));
  });
});

describe("Amortization (PRD §7)", () => {
  // Device algorithm uses PMT rounded to DEC. Payment on the mortgage is
  // −1,199.1011…, so RND(PMT) = −1,199.10 at DEC = 2.
  const regs = { ...CLEARED_TVM, N: 360, IY: 6, PV: 200_000, PMT: -1199.1011 };

  it("Year 1 (P1 1, P2 12): BAL positive, PRN and INT negative, PRN + INT = 12 × RND(PMT)", () => {
    const { BAL, PRN, INT } = unwrap(amortize(regs, monthly, 1, 12));
    expect(BAL).toBeGreaterThan(197_000);
    expect(BAL).toBeLessThan(198_000);
    expect(PRN).toBeLessThan(0);
    expect(INT).toBeLessThan(0);
    expect(show(PRN + INT)).toBe(show(12 * -1199.1));
    // PRD §7 asks for the cent to be confirmed on the physical unit; the
    // device-algorithm value is recorded here so a divergence is visible.
    expect(show(BAL)).toBe(197_543.99);
  });

  it("First payment splits into 1,000.00 interest and 199.10 principal", () => {
    const { PRN, INT } = unwrap(amortize(regs, monthly, 1, 1));
    expect(show(INT)).toBe(-1000);
    expect(show(PRN)).toBe(-199.1);
  });

  it("Ranges chain: BAL after 1–12 equals BAL after 1–6 then 7–12 starting from the same PV", () => {
    const whole = unwrap(amortize(regs, monthly, 1, 12));
    const firstHalf = unwrap(amortize(regs, monthly, 1, 6));
    const secondHalf = unwrap(amortize(regs, monthly, 7, 12));
    expect(secondHalf.BAL).toBe(whole.BAL);
    expect(show(firstHalf.PRN + secondHalf.PRN)).toBe(show(whole.PRN));
  });

  it("Error 4 on a bad range", () => {
    const r = amortize(regs, monthly, 5, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(4);
  });
});

describe("Interest Conversion (PRD §7)", () => {
  it("NOM 12, C/Y 12 → EFF 12.68", () => {
    expect(show(unwrap(nominalToEffective(12, 12)))).toBe(12.68);
  });
  it("round-trips EFF → NOM", () => {
    const eff = unwrap(nominalToEffective(12, 12));
    expect(unwrap(effectiveToNominal(eff, 12))).toBeCloseTo(12, 10);
  });
});

describe("Percent Change (PRD §7)", () => {
  it("△% as CAGR: OLD 100, NEW 150, #PD 5 → 8.45", () => {
    const pch = unwrap(solvePctChange({ OLD: 100, NEW: 150, PCH: 0, PD: 5 }, "PCH"));
    expect(show(pch)).toBe(8.45);
  });
  it("Plain change: OLD 100, NEW 150, #PD 1 → 50.00", () => {
    expect(unwrap(solvePctChange({ OLD: 100, NEW: 150, PCH: 0, PD: 1 }, "PCH"))).toBe(50);
  });
  it("Solve NEW from a 10% rise over 2 periods", () => {
    expect(unwrap(solvePctChange({ OLD: 100, NEW: 0, PCH: 10, PD: 2 }, "NEW"))).toBe(121);
  });
});
