# PRD — BA II Plus Financial Calculator (Personal)

Nov 1, 2026 · @Dave

A keystroke-faithful web emulator of the Texas Instruments BA II Plus, built in TypeScript as a pure calculation engine plus a keypad and display, for teaching a finance course where students follow along on physical units. All §9 decisions are closed as of 1 Nov 2026.

## 1. Purpose and scope decisions

The target is the Texas Instruments BA II Plus (standard model), not the website: the site is itself a third-party emulator of that device, so "emulate the site" means "emulate the device, using the site as a visual reference". Where the site and the TI guidebook disagree, the guidebook wins.

The brief has since been settled: this is a **teaching tool** for a finance course, where the author demonstrates the calculator and students follow on their own physical units. That makes keystroke fidelity the product, not a nice-to-have, and it rules out the form-based alternative:

| Option | What it is | Build cost | When it is the right call |
| --- | --- | --- | --- |
| A. Keystroke-faithful emulator | Full 10×5 keypad, 2ND layer, worksheet navigation with ENTER / arrows / CPT, display quirks | High: a key state machine plus every worksheet's cursor logic | Teaching the device, exam prep (CFA / FRM), muscle memory with the physical unit |
| B. Worksheet-driven calculator | One screen per worksheet (TVM, CF, AMORT, BOND…) with labelled fields and a Compute button | Medium: the maths only, plain forms | Day-to-day finance work where speed beats fidelity |

Decision: **Option A.** Build the **calculation engine as a pure, UI-free library**, then a **keystroke-faithful keypad and single-line display** over it; the form UI (Option B) is dropped. What students see on their own units must match what the class sees on screen, so display behaviour (indicators, prompts, rounding, error text) is in scope at the same priority as the maths. The hard part is no longer NPV; it is the key state machine and the display, which is exactly where third-party simulators drift from the device.

Out of scope: the reference site's four stand-alone form calculators (TVM, Cash Flow, Amortization, Savings) and its guide pages; BA II Plus Professional extras (NFV, modified duration, payback, discounted payback, MIRR); accounts, ads, and any multi-user features. The deliverable is one thing: the calculator.

## 2. What the reference site actually implements

[baiiplusfinancialcalculator.com](https://baiiplusfinancialcalculator.com/) is a keypad simulator of the standard BA II Plus plus four stand-alone form calculators and a set of tutorial pages. Its keypad legend (QUIT, SET, ENTER, 2ND, CF, NPV, IRR, N, I/Y, PV, PMT, FV with xP/Y, P/Y, AMORT, BGN, CLR TVM; DATA, STAT, BOND, DEPR, △%, BRKEVN, DATE, ICONV, PROFIT, MEM, FORMAT, RESET; nPr, nCr, x!, RAND, HYP, ROUND, K, ANS) matches the standard model, not the Professional.

| Surface | What it offers | Carry into our build? |
| --- | --- | --- |
| Keypad simulator | Full layout with 2ND functions, single-line display | Yes: Phase 1, the core product |
| TVM calculator page | Form for N, I/Y, PV, PMT, FV | No: form UI dropped with Option A |
| Cash Flow calculator page | Form for CF0, CFn with frequencies, NPV and IRR | No: form UI dropped |
| Amortization calculator page | P1–P2 range with BAL, PRN, INT | No: form UI dropped |
| Savings calculator page | Consumer-style savings growth form | No: a TVM special case |
| User guides | BGN mode, Chn vs AOS, AMORT, clearing memory, NPV/IRR, exponents | Use as behaviour reference only |
| Accounts, ads, testimonials | Marketing scaffolding | No |

The site claims hardware-exact output but publishes no test evidence, so it is not a correctness oracle. The oracle for this project is the TI BA II Plus guidebook and its worked examples (§7).

## 3. User and use cases

Two users. The **instructor** (the author) drives the emulator on a projector or screen-share while teaching a finance course, so every key press and display state must be legible from the back of a room. **Students** watch, then repeat the same key sequence on a physical BA II Plus; any divergence between emulator and device is a teaching defect, not a cosmetic one. No accounts, no student-side deployment in scope.

Jobs the product must do, in priority order:

1. Reproduce the device's key sequences exactly: 2ND layer, worksheet entry, ENTER to store, ↑ ↓ to move, CPT to solve, QUIT to leave, CE|C to back out.
2. Show the display as the device does: the value, plus BGN, 2ND, COMPUTE, ENTER, SET, ↑↓ worksheet and DEL / INS indicators, and the variable label in worksheets.
3. Solve any one TVM variable from the other four, with P/Y, C/Y and BGN/END set correctly.
4. Take an uneven cash-flow series with frequencies and return NPV and IRR.
5. Break a loan into principal, interest and balance over any payment range.
6. Price a bond or solve its yield, with accrued interest, on 30/360 or actual/actual.
7. Convert nominal ↔ effective rates; percent change, breakeven, profit margin, depreciation and statistics as the remaining worksheets.
8. Teaching aids that the device does not have: a large-display mode for projection, a key-press log of the current sequence, and the ability to highlight the next key for a scripted demo.

## 4. Functional requirements by worksheet

Each worksheet is a pure function in the engine: inputs in, outputs out, no shared mutable state except the registers listed in §5. Variables and semantics follow the TI guidebook.

| Worksheet | Inputs | Computes | Must-have behaviour |
| --- | --- | --- | --- |
| TVM | N, I/Y, PV, PMT, FV; settings P/Y, C/Y, BGN/END | Any one of the five | Sign convention (cash in +, cash out −); I/Y is annual nominal, converted via C/Y; xP/Y multiplies years to N; I/Y solved iteratively with Error 5 when no solution |
| Cash Flow (CF) | CF0, C01…C24 with F01…F24 frequencies; I for NPV | NPV, IRR | Engine unbounded; keypad enforces the device's 24-flow limit unless "device limits off" is set; IRR via bracketed Newton with Error 5 (no sign change) and Error 7 (iteration limit) |
| Amortization (AMORT) | TVM values plus P1, P2 | BAL, PRN, INT for the P1–P2 range | Uses rounded payment per TI (PMT rounded to display decimals before amortising); ↓ advances P1/P2 by the range length |
| Bond (BOND) | SDT, CPN, RDT, RV, ACT/360, 1/Y or 2/Y, YLD or PRI | PRI or YLD, plus AI | Day-count 30/360 and actual/actual; dates as mm.ddyy or dd.mmyy per DATE format; price per 100 redemption |
| Depreciation (DEPR) | SL, SYD, DB with %, DBX, SLF, DBF; LIF, M01, DT1, CST, SAL, YR | DEP, RBV, RDV for year YR | French variants (SLF, DBF) need dates; DB crossover to SL in DBX |
| Statistics (DATA / STAT) | X01…X50, Y01…Y50 | n, mean, sample and population SD for X and Y, Σx, Σx², Σxy, a, b, r; predicted X′ and Y′ | Four regressions: LIN, Ln, EXP, PWR, plus 1-V mode |
| Interest Conversion (ICONV) | NOM, EFF, C/Y | NOM or EFF | Standard conversion; C/Y defaults to 12 |
| Percent Change (△%) | OLD, NEW, %CH, #PD | Any one | #PD compounds the change over periods (growth rate use) |
| Breakeven (BRKEVN) | FC, VC, P, PFT, Q | Any one | Linear model |
| Profit Margin (PROFIT) | CST, SEL, MAR | Any one | Margin on selling price, not markup on cost |
| Date (DATE) | DT1, DT2, DBD, ACT/360 | DT1, DT2 or DBD | Returns day of week; ranges 1 Jan 1950–31 Dec 2049 as per device |
| Memory (STO / RCL / MEM) | 10 numeric registers M0–M9 | Store, recall, store-arithmetic | Survives reset of worksheets but not RESET |

Scalar maths (y^x, 1/x, √x, x², LN, e^x, trig, nPr, nCr, x!, ROUND, RAND, ANS, K constant, parentheses) is in scope from Phase 1, since students see those keys and a course will use at least y^x, 1/x and the parentheses under both Chn and AOS.

## 5. Calculator behaviour

The engine is a state object holding the TVM registers, every worksheet's variables, M0–M9, and the settings below; every worksheet function reads from and writes to it so AMORT sees the TVM values the way the device does.

| Setting | Values | Default | Effect |
| --- | --- | --- | --- |
| P/Y, C/Y | positive integers | 1, 1 (C/Y follows P/Y when P/Y is set; the physical unit defaults to 12 — see §9) | Converts I/Y into the per-period rate used by TVM and AMORT |
| BGN / END | END, BGN | END | Annuity-due vs ordinary annuity; indicator shown whenever BGN |
| DEC (FORMAT) | 0–9 | 2 | Display rounding only; internal precision is unaffected |
| DEG / RAD | DEG, RAD | DEG | Trig only |
| Date format | US (mm.ddyy), EUR (dd.mmyy) | US | BOND and DATE input parsing |
| Separator | US (1,000.00), EUR (1.000,00) | US | Display only |
| Chn / AOS | Chain, AOS | Chain | Operator precedence in keypad arithmetic; indicator shown when AOS |

The TVM relation the engine solves, with i = (1 + I/Y ÷ 100 ÷ C/Y)^(C/Y ÷ P/Y) − 1 and k = 1 for BGN, 0 for END:

```latex
PV + PMT\,(1+ik)\,\frac{1-(1+i)^{-N}}{i} + FV\,(1+i)^{-N} = 0
```

Solving for N, PV, PMT and FV is closed-form; I/Y and IRR are root-finds (bracket, then Newton or Brent) with the device's error codes. Error 1 overflow; Error 4 out-of-range (e.g. negative N, bad date); Error 5 no solution (no sign change in cash flows, or TVM inputs all the same sign); Error 7 iteration limit; Error 8 canceled iteration. Errors are returned as values, never thrown through the UI.

Clearing has three levels, matching the device: CE|C clears the current entry; CLR WORK clears the open worksheet's variables; CLR TVM clears the five TVM registers only (P/Y, C/Y and BGN persist). RESET restores all defaults and wipes M0–M9. All four are reached exactly as on the device: CE|C, 2ND CLR WORK, 2ND CLR TVM, 2ND RESET ENTER.

### Keypad map

Ten rows of five keys; each cell is primary key / 2ND function. This is the device's layout, taken from the reference site and corrected where the site departs from the device.

| Row | Col 1 | Col 2 | Col 3 | Col 4 | Col 5 |
| --- | --- | --- | --- | --- | --- |
| 1 | CPT / QUIT | ENTER / SET | ↑ / DEL | ↓ / INS | ON·OFF (site shows a bare =; the device has ON·OFF here) |
| 2 | 2ND | CF | NPV | IRR | → (backspace) |
| 3 | N / xP/Y | I/Y / P/Y | PV / AMORT | PMT / BGN | FV / CLR TVM |
| 4 | % / K | √x | x² | 1/x | ÷ / RAND |
| 5 | INV / HYP | ( / SIN | ) / COS | yˣ / TAN | × / x! |
| 6 | LN / eˣ | 7 / DATA | 8 / STAT | 9 / BOND | − / nPr |
| 7 | STO / ROUND | 4 / DEPR | 5 / △% | 6 / BRKEVN | + / nCr |
| 8 | RCL | 1 / DATE | 2 / ICONV | 3 / PROFIT | = / ANS |
| 9 | CE\|C / CLR WORK | 0 / MEM | . / FORMAT | +/− / RESET |  |

Key colouring follows the device's grouping (2ND distinct; CF, NPV, IRR grouped; STO and RCL grouped; the four bottom-row keys grouped) but uses the project's own palette. The display carries no "BA II PLUS" label, per the §6 licensing decision.

## 6. Non-functional requirements

Accuracy is the only requirement that matters; everything else is convenience.

| Requirement | Target |
| --- | --- |
| Numerical accuracy | Match the device's 13-digit internal precision to within 1 unit in the 10th significant digit on every §7 case; display rounding to DEC applied only at render |
| Platform | Single-page web app, installable as a PWA; one HTML file plus one engine module, no backend |
| Offline | Fully functional with no network after first load |
| Persistence | Settings, every worksheet's last inputs, and M0–M9 persist in local storage; a RESET button clears them |
| Performance | Any compute under 50 ms on a phone; IRR capped at 1,000 iterations before Error 7 |
| Engine isolation | Engine has zero DOM or framework imports and runs under Node for tests |
| Input ergonomics | On-screen keypad with the device's 10×5 layout; physical keyboard mapped to it (digits, operators, Enter = ENTER, Backspace = CE\|C, Shift = 2ND); a large-display mode legible at projector distance |
| Licensing | Key labels use the device's function names (N, I/Y, CPT, 2ND…) so students can follow on their units; no TI or BA II Plus marks, logo, key-cap artwork or guidebook text; a persistent no-affiliation disclaimer in the app footer and on any course material that shows it |

## 7. Correctness and test strategy

Every worksheet ships with a golden-case suite run under Node before any UI exists; the physical unit is the primary oracle, the TI BA II Plus guidebook's worked examples the second, with Excel (PMT, PV, FV, RATE, NPV, IRR, IPMT, PPMT, EFFECT, PRICE, YIELD) as the cross-check. Seed cases below are textbook values; expand with the guidebook examples once the engine runs.

| Case | Inputs | Expected |
| --- | --- | --- |
| Mortgage PMT | N 360, I/Y 6, PV 200,000, FV 0, P/Y = C/Y = 12, END | PMT −1,199.10 |
| Lump-sum FV | N 5, I/Y 10, PV −1,000, PMT 0, P/Y 1 | FV 1,610.51 |
| Solve I/Y | N 10, PV −1,000, FV 2,000, PMT 0, P/Y 1 | I/Y 7.18 |
| BGN vs END | N 10, I/Y 5, PMT 100, FV 0, P/Y 1 | PV −772.17 END, −810.78 BGN |
| Error 5 | PV 1,000, FV 2,000, PMT 0, N 10 (same sign) | Error 5 |
| NPV / IRR | CF0 −1,000; C01 400, F01 3; I 10 | NPV −5.26; IRR 9.70 |
| AMORT year 1 | Mortgage case, P1 1, P2 12 | BAL ≈ 197,544 (confirm to the cent against IPMT/PPMT) |
| ICONV | NOM 12, C/Y 12 | EFF 12.68 |
| △% as CAGR | OLD 100, NEW 150, #PD 5 | %CH 8.45 |

Edge cases the suite must cover: I/Y = 0 (closed-form degenerates to linear); N non-integer; P/Y ≠ C/Y; cash-flow series with multiple IRRs (device returns the first root found, document which); frequencies above 9,999; bond settlement on a coupon date (AI = 0) and in a leap year under actual/actual; dates at the 1950 / 2049 bounds; DEC 9 display of a 13-digit result.

## 8. Phasing and non-goals

Ship the engine before any screen, then the keypad and display with the three core worksheets, then the rest of the worksheets, then the teaching aids; a course lesson can be run from the end of Phase 1.

&#91;embedded content: build roadmap · 4 phases, 3 gates\]

Each gate is pass/fail; Phase 1's gate is behavioural (a lesson taught with it, students following on real units, no divergence found), not a feature list.

Non-goals, stated so they stay out: BA II Plus Professional functions; multi-user accounts or sync; a backend of any kind; pixel-matching TI's industrial design or using its trademarks; a general spreadsheet or scenario-comparison tool (if that need appears, it is a different product).

## 9. Open questions to settle before code

- [ ] Decided 1 Nov 2026: Option A, teaching tool for a finance course. Phasing updated in §8.
- [ ] Decided 1 Nov 2026: web PWA.
- [ ] Decided 1 Nov 2026: TypeScript. Doubles meet the §6 accuracy bar; see §10 for the one place decimal handling matters.
- [ ] Decided 1 Nov 2026: a physical BA II Plus is available. It is the primary oracle: capture the §7 cases and the §10 keystroke scripts from it (display after every key press, including indicators) before writing the keypad, and confirm the AMORT ≈ 197,544 figure to the cent.
- [ ] Decided 1 Nov 2026: do not keep the 24-cash-flow / 50-data-point limit in the engine. Caveat for the keypad: the device stops at C24 and X50, so the emulator must still enforce those limits by default or students will see a divergence; the lifted limit is exposed behind a "device limits off" setting, off by default.
- [ ] Decided 1 Nov 2026: all §4 worksheets are in scope. Phase 2 is sequenced by the course syllabus (BOND and DATE first, then △%, ICONV, then DEPR, STAT, BRKEVN, PROFIT), so a lesson is never blocked on a worksheet it does not use.
- [ ] Decided 1 Nov 2026: P/Y and C/Y default to 1, not the device's 12. Course problems are mostly annual, and with 12 the first TVM example gives a different answer from the textbook unless the class sets P/Y first. The emulator shows the settings in effect beside the display so a divergence from a student's unit is visible; a lesson on monthly payments sets 2ND P/Y 12 ENTER explicitly.
- [ ] Decided 1 Nov 2026: the app carries a no-affiliation disclaimer (wording in §6); key labels keep the device's function names, no TI marks or logo.

## 10. Fidelity: what closes the gap to the device

The reference site is a keypad with the device's logic behind it; the distance between "has the same worksheets" and "behaves identically" is almost entirely in six mechanisms below, in order of how much each buys. The site itself is only a secondary oracle: where it and the TI guidebook disagree, the guidebook is right and the site is a bug to avoid copying.

| Mechanism | What it is | Why it matters for exactness |
| --- | --- | --- |
| Key state machine, not button handlers | One reducer: `(state, key) → state`. States: idle, entering, 2ND armed, operator pending, worksheet (variable cursor, SET-able, CPT-able), STO / RCL pending, error. Every key is legal in every state and does what the device does, including nothing. | Most simulators wire each button to a function and get the happy path right; the device's feel comes from the off-path cases (2ND then an unmapped key, CPT on a non-computable variable, ENTER outside a worksheet) |
| Display model as a struct | `{ value, label, indicators }` with indicators 2ND, INV, HYP, COMPUTE, ENTER, SET, DEL, INS, BGN, RAD, ↑, ↓, =, \*, and the variable label (N, I/Y, CF0, C01, F01, BAL, PRI…). Rendering is a pure view of this struct. | Students read indicators, not values, to know where they are; `*` on a computed variable and `=` after ENTER are what the guidebook teaches |
| Worksheet cursor semantics | Each worksheet is an ordered list of variables with per-variable flags: enter-only, compute-only, enter-or-compute, SET-toggle, auto-advance (CF frequencies, STAT pairs), hidden until a condition (DB% only for DB). ↑ ↓ wrap at the ends as the device does. | The cursor order and which variables appear are the key sequence the class copies |
| Entry and number formatting | Digit entry buffer with 10-digit limit, leading-zero rules, +/− on the buffer vs on the result, DEC rounding at render, separator setting, scientific notation above 10 digits, display of `Error N` strings | The visible number must match the physical screen digit for digit |
| Chn vs AOS expression evaluator | Chain evaluates left to right as keys arrive; AOS holds a precedence stack with up to 15 pending operations and parentheses. Both feed the same display struct. | The site's own guide calls this the most common exam trap; a course has to demonstrate it exactly |
| Keystroke-level golden tests | Tests are literal key sequences with the expected display after each press (not engine function calls), captured from the physical unit and spot-checked against the site. §7's cases become keystroke scripts. | This is the only test that proves parity; engine tests prove the maths, not the experience |

One precision note for TypeScript: the device holds 13 significant digits internally and rounds to the display only at render, except AMORT, which uses the displayed (rounded) PMT. Doubles give \~15.9 digits, so match the device by rounding to 13 significant digits after each stored operation and to DEC digits for AMORT's PMT, rather than reaching for a decimal library.

What does not close the gap: pixel-matching the site's CSS, copying its marketing pages, or adding features the device lacks before Phase 3.
