/**
 * Browser shell: renders `display(state)` and feeds key presses into the
 * reducer. All calculator behaviour lives in src/keypad; this file only wires
 * DOM events, the key log, and local-storage persistence (PRD §6).
 */
import {
  DEFAULT_REGISTERS,
  KEYPAD,
  display,
  initialState,
  keyName,
  press,
  registersOf,
  type CalcState,
  type Key,
  type Registers,
} from "../keypad/index.js";

const STORE = "ba2plus.registers.v2"; // v2: P/Y and C/Y default to 1
const PREFS = "ba2plus.prefs.v1";

function load(): CalcState {
  try {
    localStorage.removeItem("ba2plus.registers.v1"); // pre-P/Y-1 state, not migrated
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Registers>;
      return initialState({ ...structuredClone(DEFAULT_REGISTERS), ...saved });
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return initialState();
}

function save(s: CalcState): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(registersOf(s)));
  } catch {
    /* ignore */
  }
}

let state = load();

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

// ─── keypad ─────────────────────────────────────────────────────────────────

const keypad = $("keypad");
const buttons = new Map<Key, HTMLButtonElement>();
for (const row of KEYPAD) {
  for (const face of row) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const sec = document.createElement("span");
    sec.className = "sec";
    sec.textContent = face.second ?? "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `key g-${face.group}`;
    btn.textContent = face.label;
    btn.setAttribute("aria-label", face.second ? `${face.label}, 2ND ${face.second}` : face.label);
    btn.addEventListener("click", () => hit(face.key));
    cell.append(sec, btn);
    keypad.append(cell);
    buttons.set(face.key, btn);
  }
}

// ─── display ────────────────────────────────────────────────────────────────

const TOP: [keyof ReturnType<typeof display>["indicators"], string][] = [
  ["second", "2ND"], ["inv", "INV"], ["hyp", "HYP"], ["compute", "COMPUTE"],
  ["enter", "ENTER"], ["set", "SET"], ["up", "↑"], ["down", "↓"], ["del", "DEL"], ["ins", "INS"],
];
const BOTTOM: [keyof ReturnType<typeof display>["indicators"], string][] = [
  ["bgn", "BGN"], ["rad", "RAD"], ["star", "*"],
];

function renderIndicators(el: HTMLElement, list: typeof TOP, ind: ReturnType<typeof display>["indicators"]): void {
  el.replaceChildren(
    ...list.map(([k, text]) => {
      const span = document.createElement("span");
      span.textContent = text;
      span.className = ind[k] ? "on" : "";
      return span;
    }),
  );
}

/** Teaching aid (PRD §3, job 8): the settings the LCD never shows but every TVM answer depends on. */
function renderSettings(): void {
  const s = state.settings;
  const d = DEFAULT_REGISTERS.settings;
  const rows: [string, string, boolean][] = [
    ["P/Y", String(s.PY), s.PY !== d.PY],
    ["C/Y", String(s.CY), s.CY !== d.CY],
    ["Timing", s.timing, s.timing !== d.timing],
    ["DEC", String(s.DEC), s.DEC !== d.DEC],
    ["Method", s.method, s.method !== d.method],
    ["Angle", s.angle, s.angle !== d.angle],
  ];
  $("settings").replaceChildren(
    ...rows.flatMap(([k, v, changed]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      if (changed) dd.className = "changed";
      return [dt, dd];
    }),
  );
}

/** The device never clips a value: shrink the readout only when it would not fit. */
function fitLcd(): void {
  const main = $("lcd-main");
  main.style.fontSize = "";
  const need = main.scrollWidth;
  const have = main.clientWidth;
  if (need > have && have > 0) {
    const base = parseFloat(getComputedStyle(main).fontSize);
    main.style.fontSize = `${Math.floor(base * (have / need) * 0.97)}px`;
  }
}
window.addEventListener("resize", fitLcd);

function render(): void {
  renderSettings();
  const d = display(state);
  $("lcd").classList.toggle("off", !d.on);
  renderIndicators($("ind-top"), TOP, d.indicators);
  renderIndicators($("ind-bottom"), BOTTOM, d.indicators);
  $("lcd-label").textContent = d.label + (d.indicators.eq && d.label ? "=" : "");
  $("lcd-value").textContent = d.value;
  $("lcd-exp").textContent = d.exponent ?? "";
  fitLcd();
  buttons.get("2ND")?.classList.toggle("armed", state.second);
  const notice = $("notice");
  notice.hidden = !state.notice;
  notice.textContent = state.notice ?? "";
}

// ─── key log ────────────────────────────────────────────────────────────────

const log = $("log");
function logKey(key: Key, withSecond: boolean): void {
  if (key === "2ND") return; // shown as part of the next key
  const li = document.createElement("li");
  const name = keyName(key, withSecond);
  li.textContent = withSecond ? `2ND ${name}` : name;
  if (withSecond) li.className = "second";
  log.append(li);
  log.scrollTop = log.scrollHeight;
}
$("log-clear").addEventListener("click", () => log.replaceChildren());

function hit(key: Key): void {
  const withSecond = state.second;
  state = press(state, key);
  logKey(key, withSecond && key !== "2ND");
  const btn = buttons.get(key);
  if (btn) {
    btn.classList.remove("flash");
    void btn.offsetWidth; // restart the animation
    btn.classList.add("flash");
  }
  save(state);
  render();
}

// ─── physical keyboard (PRD §6) ─────────────────────────────────────────────

const KEYBOARD: Record<string, Key> = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  ".": "DOT", ",": "DOT", "+": "ADD", "-": "SUB", "*": "MUL", x: "MUL", "/": "DIV",
  "(": "LPAREN", ")": "RPAREN", "=": "EQ", "^": "POW", "%": "PCT",
  Enter: "ENTER", Backspace: "CE", Delete: "BKSP", ArrowUp: "UP", ArrowDown: "DOWN",
  c: "CPT", n: "N", i: "IY", p: "PV", m: "PMT", f: "FV",
};

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "Shift") {
    if (!e.repeat) hit("2ND");
    return;
  }
  if (e.key === "Escape") {
    // QUIT is 2ND CPT
    if (!state.second) hit("2ND");
    hit("CPT");
    e.preventDefault();
    return;
  }
  const k = KEYBOARD[e.key] ?? KEYBOARD[e.key.toLowerCase()];
  if (!k) return;
  e.preventDefault();
  // Shifted symbols (+ * ( ) % ^) already carry Shift; don't let it arm 2ND.
  if (state.second && /^[+*()%^=]$/.test(e.key)) hit("2ND");
  hit(k);
});

// ─── options ────────────────────────────────────────────────────────────────

const large = $<HTMLInputElement>("opt-large");
const limits = $<HTMLInputElement>("opt-limits");
try {
  large.checked = localStorage.getItem(PREFS) === "large";
} catch {
  /* ignore */
}
document.body.classList.toggle("large", large.checked);
large.addEventListener("change", () => {
  document.body.classList.toggle("large", large.checked);
  try {
    localStorage.setItem(PREFS, large.checked ? "large" : "");
  } catch {
    /* ignore */
  }
});

limits.checked = state.settings.deviceLimitsOff;
limits.addEventListener("change", () => {
  state = { ...state, settings: { ...state.settings, deviceLimitsOff: limits.checked } };
  save(state);
  render();
});

$("opt-wipe").addEventListener("click", () => {
  if (!confirm("Clear all saved registers, memory and settings?")) return;
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
  state = initialState();
  limits.checked = false;
  log.replaceChildren();
  render();
});

render();
