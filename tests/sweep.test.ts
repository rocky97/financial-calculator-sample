/**
 * Breadth sweep: short key scripts across arithmetic, entry, display, memory,
 * every Phase 1 worksheet, and power/2ND edge cases. Expected displays follow
 * the TI guidebook's rules; confirm against the physical unit before relying
 * on one in class.
 */
import { expect, it } from "vitest";
import { display, initialState, press, type CalcState, type Key } from "../src/keypad/index.js";
const keys = (s: string): Key[] => s.trim().split(/\s+/).flatMap((t): Key[] => /^\d*\.?\d+$|^\d+\.$/.test(t) ? [...t].map(c => c === "." ? "DOT" : c as Key) : [t as Key]);
const run = (s: string, from: CalcState = initialState()) => keys(s).reduce(press, from);
const screen = (s: CalcState) => { const d = display(s); const eq = d.indicators.eq ? "=" : ""; const ex = d.exponent ? ` E${d.exponent}` : ""; return d.label ? `${d.label}${eq} ${d.value}${ex}`.trim() : `${d.value}${ex}`; };
const annual = "2ND IY 1 ENTER 2ND CPT";
const cases: [string, string][] = [
  // arithmetic
  ["2 ADD 3 EQ", "5.00"], ["10 SUB 4 EQ", "6.00"], ["6 MUL 7 EQ", "42.00"], ["9 DIV 4 EQ", "2.25"],
  ["3 ADD EQ", "3.00"], ["5 EQ", "5.00"], ["2 MUL LPAREN 3 ADD 4 RPAREN EQ", "14.00"], ["LPAREN 2 ADD 3 RPAREN MUL 4 EQ", "20.00"],
  ["200 ADD 10 PCT", "20.00"], ["200 ADD 10 PCT EQ", "220.00"], ["50 PCT", "0.50"], ["200 SUB 10 PCT EQ", "180.00"],
  ["5 NEG", "-5"], ["5 NEG NEG", "5"], ["5 ADD 3 EQ NEG", "-8.00"], ["0 NEG", "-0"],
  ["3 SQR", "9.00"], ["2 POW 3 POW 2 EQ", "64.00"], ["27 INV POW 3 EQ", "3.00"], ["1 LN", "0.00"], ["1 2ND LN", "2.72"], ["0 LN", "Error 2"],
  ["5 2ND MUL", "120.00"], ["5 2ND SUB 2 EQ", "20.00"], ["5 2ND ADD 2 EQ", "10.00"], ["2.5 2ND MUL", "Error 2"],
  ["90 2ND LPAREN", "1.00"], ["180 2ND RPAREN", "-1.00"], ["45 2ND POW", "1.00"], ["90 2ND POW", "Error 2"], ["1 INV 2ND POW", "45.00"],
  ["3.14159 2ND DOT DOWN 2ND ENTER 2ND CPT 2ND LPAREN", "0.00"],
  ["1234567.891 2ND STO", "1,234,567.89"], ["2ND EQ", "0.00"], ["7 ADD 1 EQ 2ND EQ", "8.00"], ["7 ADD 1 EQ CE 2ND EQ", "8.00"],
  // entry and display
  ["0.5", "0.5"], ["DOT 5", "0.5"], ["1 DOT DOT 5", "1.5"], ["00012", "12"], ["12 BKSP BKSP BKSP", "0"], ["1 EQ BKSP", "1.00"],
  ["9999999999 MUL 10 EQ", "1.00 E11"], ["1 DIV 3 EQ", "0.33"], ["2 DIV 3 EQ 2ND DOT 9 ENTER 2ND CPT", "0."],
  ["2ND DOT 9 ENTER 2ND CPT 2 DIV 3 EQ", "0.666666667"], ["2ND DOT 9 ENTER 2ND CPT 2 EQ", "2."], ["2ND DOT 0 ENTER 2ND CPT 2.5 EQ", "3."],
  ["2ND DOT DOWN DOWN DOWN 2ND ENTER 2ND CPT 1234.5 EQ", "1.234,50"],
  // CE|C
  ["5 ADD 3 CE 4 EQ", "9.00"], ["5 ADD 3 CE CE 4 EQ", "4.00"], ["1 DIV 0 EQ CE 2 ADD 2 EQ", "4.00"],
  // TVM
  [`${annual} 10 N 5 IY 100 PMT 0 FV CPT PV`, "PV= -772.17"], [`${annual} 3 N 8 IY 1000 NEG PV 0 PMT CPT FV`, "FV= 1,259.71"],
  [`${annual} 1000 NEG PV 2000 FV 0 PMT 10 IY CPT N`, "N= 7.27"], ["CPT 5 EQ", "5.00"], ["2ND IY 4 ENTER DOWN 12 ENTER 2ND CPT 2 N 8 IY 1000 NEG PV 0 PMT CPT FV", "FV= 1,040.67"],
  ["5 N RCL N", "N= 5.00"], ["5 N 2ND CPT 5 IY RCL IY", "I/Y= 5.00"], ["CPT N", "Error 5"], ["CPT N CE", "0.00"],
  // RESET
  ["5 N 2ND NEG CE RCL N", "N= 5.00"], ["5 N 2ND NEG ENTER RCL N", "N= 0.00"], ["2ND NEG", "RST ?"], ["2ND NEG ENTER 3", "3"],
  // STO / RCL
  ["5 STO 1 10 STO ADD 1 RCL 1", "15.00"], ["5 STO 1 2 STO MUL 1 RCL 1", "10.00"], ["5 STO 1 CE RCL 1 ADD 1 EQ", "6.00"], ["5 STO 1 2ND 0 DOWN", "M1= 5.00"],
  ["5 STO 1 2ND 0 DOWN 9 ENTER 2ND CPT RCL 1", "9.00"], ["5 STO 1 2ND 0 2ND CE DOWN", "M1= 0.00"], ["5 STO N", "N= 5.00"],
  // worksheets
  ["2ND IY", "P/Y= 1.00"], ["2ND IY 0 ENTER", "Error 4"], ["2ND IY 0 ENTER CE", "P/Y= 1.00"], ["2ND IY 4 ENTER 2ND CE", "P/Y= 1.00"],
  ["2ND PMT", "END"], ["2ND PMT 2ND ENTER", "BGN"], ["2ND PMT 2ND ENTER 2ND ENTER", "END"], ["2ND PMT 2ND ENTER 2ND CPT 5", "5"],
  ["2ND DOT", "DEC= 2.00"], ["2ND DOT 10 ENTER", "Error 4"], ["2ND DOT DOWN", "DEG"], ["2ND DOT DOWN DOWN", "US 12-31-1990"], ["2ND DOT DOWN DOWN DOWN DOWN DOWN", "DEC= 2.00"],
  ["2ND 2", "NOM= 0.00"], ["2ND 2 DOWN", "EFF= 0.00"], ["2ND 2 DOWN DOWN", "C/Y= 1.00"], ["2ND 2 DOWN 12.68 ENTER DOWN 12 ENTER UP UP CPT", "NOM= 12.00"],
  ["2ND 5", "OLD= 0.00"], ["2ND 5 100 ENTER DOWN DOWN 50 ENTER DOWN 1 ENTER UP UP CPT", "NEW= 150.00"], ["2ND 5 100 ENTER DOWN 200 ENTER DOWN 7.18 ENTER DOWN CPT", "#PD= 10.00"],
  ["CF 5 ENTER DOWN", "C01= 0.00"], ["CF DOWN", "C01= 0.00"], ["CF DOWN DOWN", "CF0= 0.00"], ["CF DOWN 100 ENTER DOWN", "F01= 1.00"],
  ["CF DOWN 100 ENTER DOWN DOWN", "C02= 0.00"], ["CF DOWN 100 ENTER DOWN DOWN DOWN", "CF0= 0.00"], ["CF DOWN 100 ENTER 2ND DOWN", "C01= 0.00"], ["CF DOWN 100 ENTER 2ND DOWN DOWN DOWN", "C02= 100.00"],
  ["CF 2ND UP", "CF0= 0.00"], ["CF DOWN 100 ENTER DOWN 2 MUL 3 EQ ENTER", "F01= 6.00"], ["CF DOWN 100 ENTER DOWN 1.5 ENTER", "Error 4"], ["CF DOWN 100 ENTER DOWN 10000 ENTER", "Error 4"],
  ["CF 100 NEG ENTER NPV", "I= 0.00"], ["CF 100 NEG ENTER NPV DOWN CPT", "NPV= -100.00"], ["CF 100 NEG ENTER IRR CPT", "Error 5"], ["NPV 5 ENTER 2ND CPT 2ND IY", "P/Y= 1.00"],
  ["CF 100 NEG ENTER DOWN 110 ENTER IRR CPT", "IRR= 10.00"], ["CF 100 NEG ENTER DOWN 110 ENTER IRR CPT 2ND CPT", "0.00"],
  ["CF 100 NEG ENTER DOWN 110 ENTER CF 2ND CE DOWN", "C01= 0.00"],
  // AMORT
  [`${annual} 3 N 10 IY 1000 PV 0 FV CPT PMT 2ND PV`, "P1= 1.00"], [`${annual} 3 N 10 IY 1000 PV 0 FV CPT PMT 2ND PV DOWN DOWN`, "BAL= 697.89"],
  [`${annual} 3 N 10 IY 1000 PV 0 FV CPT PMT 2ND PV DOWN DOWN DOWN`, "PRN= -302.11"], [`${annual} 3 N 10 IY 1000 PV 0 FV CPT PMT 2ND PV DOWN DOWN DOWN DOWN`, "INT= -100.00"],
  [`${annual} 3 N 10 IY 1000 PV 0 FV CPT PMT 2ND PV DOWN 3 ENTER DOWN`, "BAL= 0.02"] /* device amortises the rounded PMT */, ["2ND PV 0 ENTER", "Error 4"], ["2ND PV DOWN 2 ENTER UP 3 ENTER", "P1= 3.00"],
  // 2ND behaviour
  ["2ND 2ND 5", "5"], ["2ND 5 2ND 2ND CPT", "OLD= 0.00"], ["5 2ND ONOFF", ""], ["ONOFF", ""], ["5 ONOFF ONOFF", "0.00"], ["5 ONOFF 3", ""], ["5 N ONOFF ONOFF RCL N", "N= 5.00"],
  // power on
  ["", "0.00"],
];
it.each(cases)("%s → %s", (script, want) => {
  expect(screen(run(script))).toBe(want);
});
