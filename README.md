# ba2plus

Keystroke-faithful emulator of the Texas Instruments BA II Plus for teaching a finance course. Spec: [PRD.md](./PRD.md).

Not affiliated with, endorsed by, or connected to Texas Instruments. "BA II Plus" is a trademark of Texas Instruments; it is used here only to identify the device being emulated.

## Status

| Phase | State |
| --- | --- |
| 0 · Engine | TVM, Cash Flow (NPV/IRR), AMORT, ICONV, △% implemented; 26 golden tests passing |
| 1 · Keypad and display | Built: key state machine (`src/keypad`), browser UI (`src/ui`), 158 keystroke tests. Not yet checked against the physical unit |
| 2 · Remaining worksheets | Not started |
| 3 · Teaching aids | Not started |

## Layout

```
src/engine/     pure calculation engine — no DOM, no framework imports
  result.ts     Result<T> with device error codes (Error 1/4/5/7/8) as values
  precision.ts  13-significant-digit storage rounding, RND / RND12 helpers
  settings.ts   P/Y, C/Y, BGN/END, DEC, …; periodicRate()
  solver.ts     bracket + Brent root finder, iteration cap → Error 7
  tvm.ts        solve N / I/Y / PV / PMT / FV
  cashflow.ts   NPV, IRR with frequencies
  amort.ts      device AMORT algorithm (per-step RND, RND12)
  iconv.ts      NOM ↔ EFF
  pctchange.ts  OLD / NEW / %CH / #PD
src/keypad/     key state machine — press(state, key) → state; display(state) → LCD model; no DOM
  keys.ts       keypad layout and 2ND layer
  worksheets.ts worksheet cursor definitions (CF, NPV, IRR, AMORT, P/Y, BGN, FORMAT, ICONV, Δ%, MEM)
  machine.ts    the reducer: entry, Chn/AOS arithmetic, TVM keys, worksheets, errors, RESET
  format.ts     ten-digit display formatting, DEC, separators
src/ui/         browser shell: renders the display, key log, keyboard map, local-storage persistence
tests/          PRD §7 golden cases (engine), keystroke scripts (keypad), breadth sweep of short key scripts
```

## Commands

```
npm install
npm run dev       # the calculator at http://localhost:5173
npm test          # vitest
npm run typecheck
```

## Oracle order (PRD §7)

1. The physical BA II Plus — capture display after every key press.
2. The TI guidebook's worked examples.
3. Excel as a cross-check only; it does not reproduce the device's AMORT rounding.

### P/Y note

P/Y and C/Y default to **1** here (PRD §9, decided 1 Nov 2026); a physical unit defaults to 12. `5 N 7 I/Y 16000 +/- PV CPT FV` therefore gives the textbook 22,440.83 straight away, where a fresh physical unit shows 16,472.14 (five *months* at 7%/12). For monthly problems set `2ND P/Y 12 ENTER` first. The app shows the settings in effect beside the LCD, since the device's screen does not.

### AMORT note

The device rounds interest to DEC every period and uses RND(PMT). For the §7 mortgage (200,000 at 6%/12 over 360), year-1 balance:

| Method | BAL after 12 |
| --- | --- |
| Device algorithm (this engine, DEC = 2) | 197,543.99 |
| Rounded PMT, no per-step rounding | 197,543.99 |
| Exact PMT, no rounding (spreadsheet) | 197,543.98 |

Confirm on the physical unit; the engine's value is the one to compare against.
