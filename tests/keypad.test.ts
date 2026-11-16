/**
 * Keystroke-level tests (PRD §10): literal key sequences with the expected
 * display afterwards. These use the §7 cases as scripts. Expected displays
 * follow the TI guidebook; confirm against the physical unit before a lesson.
 */
import { describe, expect, it } from "vitest";
import { display, initialState, press, type CalcState, type Key } from "../src/keypad/index.js";

/** "360 N 6 IY" → keys. Numbers expand to digit keys; everything else is a Key. */
function keys(script: string): Key[] {
  return script.trim().split(/\s+/).flatMap((tok): Key[] => {
    if (/^\d*\.?\d+$|^\d+\.$/.test(tok)) return [...tok].map((c) => (c === "." ? "DOT" : (c as Key)));
    return [tok as Key];
  });
}

function run(script: string, from: CalcState = initialState()): CalcState {
  return keys(script).reduce(press, from);
}

/** "LABEL= value" or "value", as a student would read it off the screen. */
function screen(s: CalcState): string {
  const d = display(s);
  const eq = d.indicators.eq ? "=" : "";
  const exp = d.exponent ? ` E${d.exponent}` : "";
  return d.label ? `${d.label}${eq} ${d.value}${exp}`.trim() : `${d.value}${exp}`;
}

describe("power-on and entry", () => {
  it("shows 0.00 at power-on", () => {
    expect(screen(initialState())).toBe("0.00");
  });

  it("groups thousands while typing and limits entry to ten digits", () => {
    expect(screen(run("200000"))).toBe("200,000");
    expect(screen(run("12345678901"))).toBe("1,234,567,890");
  });

  it("→ deletes the last digit; CE|C clears the entry", () => {
    expect(screen(run("1234 BKSP"))).toBe("123");
    expect(screen(run("1234 CE"))).toBe("0.00");
  });
});

describe("Chn vs AOS (PRD §10)", () => {
  it("Chn evaluates left to right: 3 + 2 × 4 = 20", () => {
    expect(screen(run("3 ADD 2 MUL 4 EQ"))).toBe("20.00");
  });

  it("AOS applies precedence: 3 + 2 × 4 = 11", () => {
    expect(screen(run("2ND DOT DOWN DOWN DOWN DOWN 2ND ENTER 2ND CPT 3 ADD 2 MUL 4 EQ"))).toBe("11.00");
  });

  it("parentheses work in Chn", () => {
    expect(screen(run("3 ADD LPAREN 2 MUL 4 RPAREN EQ"))).toBe("11.00");
  });

  it("a second operator replaces the first", () => {
    expect(screen(run("8 ADD SUB 3 EQ"))).toBe("5.00");
  });

  it("yˣ, 1/x and √x", () => {
    expect(screen(run("2 POW 10 EQ"))).toBe("1,024.00");
    expect(screen(run("4 RECIP"))).toBe("0.25");
    expect(screen(run("16 SQRT"))).toBe("4.00");
  });

  it("division by zero is Error 2 and waits for CE|C", () => {
    const s = run("1 DIV 0 EQ");
    expect(screen(s)).toBe("Error 2");
    expect(screen(press(s, "5"))).toBe("Error 2");
    expect(screen(press(s, "CE"))).toBe("0.00");
  });
});

// P/Y and C/Y default to 1 (PRD §9, 1 Nov 2026); monthly cases set 12 first.
const monthly = "2ND IY 12 ENTER 2ND CPT";

describe("TVM (PRD §7)", () => {
  it("Mortgage PMT: 360 N 6 I/Y 200000 PV 0 FV CPT PMT → PMT= -1,199.10 *", () => {
    const s = run(`${monthly} 360 N 6 IY 200000 PV 0 FV CPT PMT`);
    expect(screen(s)).toBe("PMT= -1,199.10");
    expect(display(s).indicators.star).toBe(true);
  });

  it("stores the result of pending arithmetic: 30 × 12 N → N= 360.00", () => {
    expect(screen(run("30 MUL 12 N"))).toBe("N= 360.00");
  });

  it("xP/Y multiplies by P/Y: 30 2ND N N → N= 360.00 at P/Y 12, 30.00 at P/Y 1", () => {
    expect(screen(run(`${monthly} 30 2ND N N`))).toBe("N= 360.00");
    expect(screen(run("30 2ND N N"))).toBe("N= 30.00");
  });

  it("P/Y: 5 N 7 I/Y 16000 +/- PV CPT FV is 22,440.83 by default (P/Y 1) and 16,472.14 at P/Y 12", () => {
    // A physical unit ships with P/Y = 12 and shows 16,472.14 (five months at
    // 7%/12); this emulator defaults to 1 so the textbook answer comes straight out.
    const script = "5 N 7 IY 16000 NEG PV CPT FV";
    expect(screen(run(script))).toBe("FV= 22,440.83");
    expect(screen(run(`${monthly} ${script}`))).toBe("FV= 16,472.14");
  });

  it("course cases at P/Y 1: N 4 I/Y 6.5 PV 16000 → FV −20,583.46; N 5 I/Y 7 → −22,440.83", () => {
    const annual = "2ND IY 1 ENTER 2ND CPT";
    expect(screen(run(`${annual} 4 N 6.5 IY 16000 PV CPT FV`))).toBe("FV= -20,583.46");
    expect(screen(run(`${annual} 5 N 7 IY 16000 PV CPT FV`))).toBe("FV= -22,440.83");
    // Same cases with the deposit entered as an outflow, as the sign convention intends.
    expect(screen(run(`${annual} 4 N 6.5 IY 16000 NEG PV CPT FV`))).toBe("FV= 20,583.46");
  });

  it("Lump-sum FV with P/Y = 1", () => {
    const s = run("2ND IY 1 ENTER 2ND CPT 5 N 10 IY 1000 NEG PV 0 PMT CPT FV");
    expect(screen(s)).toBe("FV= 1,610.51");
  });

  it("BGN vs END via 2ND BGN 2ND SET", () => {
    const setup = "2ND IY 1 ENTER 2ND CPT 10 N 5 IY 100 PMT 0 FV";
    expect(screen(run(`${setup} CPT PV`))).toBe("PV= -772.17");
    const bgn = run(`${setup} 2ND PMT 2ND ENTER 2ND CPT CPT PV`);
    expect(screen(bgn)).toBe("PV= -810.78");
    expect(display(bgn).indicators.bgn).toBe(true);
  });

  it("Error 5 when solving I/Y with all cash flows one sign", () => {
    expect(screen(run("2ND IY 1 ENTER 2ND CPT 10 N 1000 PV 2000 FV 0 PMT CPT IY"))).toBe("Error 5");
  });

  it("RCL N recalls a TVM register", () => {
    expect(screen(run("360 N CE CE RCL N"))).toBe("N= 360.00");
  });

  it("2ND CLR TVM zeroes the registers", () => {
    expect(screen(run("360 N 2ND FV RCL N"))).toBe("N= 0.00");
  });
});

describe("P/Y worksheet", () => {
  it("setting P/Y also sets C/Y", () => {
    expect(screen(run("2ND IY 4 ENTER DOWN"))).toBe("C/Y= 4.00");
  });

  it("↓ discards a value typed without ENTER", () => {
    expect(screen(run("2ND IY 4 DOWN UP"))).toBe("P/Y= 1.00");
  });
});

describe("Cash flow (PRD §7)", () => {
  const flows = "CF 2ND CE 1000 NEG ENTER DOWN 400 ENTER DOWN 3 ENTER";

  it("walks CF0 → C01 → F01 → C02", () => {
    expect(screen(run("CF"))).toBe("CF0= 0.00");
    expect(screen(run(`${flows}`))).toBe("F01= 3.00");
    expect(screen(run(`${flows} DOWN`))).toBe("C02= 0.00");
    expect(screen(run(`${flows} DOWN DOWN`))).toBe("CF0= -1,000.00"); // wraps
  });

  it("NPV at 10% = -5.26", () => {
    const s = run(`${flows} NPV 10 ENTER DOWN CPT`);
    expect(screen(s)).toBe("NPV= -5.26");
    expect(display(s).indicators.star).toBe(true);
  });

  it("IRR = 9.70", () => {
    expect(screen(run(`${flows} IRR CPT`))).toBe("IRR= 9.70");
  });

  it("2ND DEL removes a flow", () => {
    expect(screen(run(`${flows} UP 2ND UP`))).toBe("C01= 0.00");
  });

  it("frequency 0 is rejected", () => {
    expect(screen(run("CF DOWN 5 ENTER DOWN 0 ENTER"))).toBe("Error 4");
  });
});

describe("AMORT (PRD §7)", () => {
  const mortgage = `${monthly} 360 N 6 IY 200000 PV 0 FV CPT PMT`;

  it("year 1: BAL 197,543.99, then CPT advances to year 2", () => {
    const s = run(`${mortgage} 2ND PV 1 ENTER DOWN 12 ENTER DOWN`);
    expect(screen(s)).toBe("BAL= 197,543.99");
    expect(screen(run("DOWN DOWN DOWN CPT", s))).toBe("P1= 13.00");
    expect(screen(run("DOWN DOWN DOWN CPT DOWN", s))).toBe("P2= 24.00");
  });
});

describe("other worksheets", () => {
  it("ICONV: NOM 12, C/Y 12 → EFF 12.68", () => {
    expect(screen(run("2ND 2 12 ENTER DOWN DOWN 12 ENTER UP CPT"))).toBe("EFF= 12.68");
  });

  it("Δ% as CAGR: OLD 100, NEW 150, #PD 5 → %CH 8.45", () => {
    expect(screen(run("2ND 5 100 ENTER DOWN 150 ENTER DOWN DOWN 5 ENTER UP CPT"))).toBe("%CH= 8.45");
  });

  it("FORMAT DEC 4 changes rounding at render only", () => {
    expect(screen(run("2 SQRT 2ND DOT 4 ENTER 2ND CPT RCL 0"))).toBe("0.0000");
    expect(screen(run("2ND DOT 4 ENTER 2ND CPT 2 SQRT"))).toBe("1.4142");
  });

  it("STO / RCL memory", () => {
    expect(screen(run("42 STO 3 CE 7 RCL 3"))).toBe("42.00");
  });

  it("2ND RESET ENTER restores defaults", () => {
    const s = run("2ND IY 12 ENTER 2ND CPT 2ND NEG ENTER");
    expect(screen(s)).toBe("RST 0.00");
    expect(s.settings.PY).toBe(1);
  });

  it("2ND then a key with no 2ND function does nothing", () => {
    const s = run("5 2ND CF");
    expect(screen(s)).toBe("5");
    expect(display(s).indicators.second).toBe(false);
  });
});
