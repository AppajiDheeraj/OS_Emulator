# OS_EMULATOR — Claude Implementation Guide

## Project Overview

A browser-based OS concepts emulator built with vanilla HTML, CSS, and JavaScript.
Each module is a self-contained interactive simulation that teaches OS concepts visually.
The project follows a dark terminal aesthetic with red accents.

---

## Design System

### Colors
```css
--color-bg:        #0a0a0a;   /* page background */
--color-surface:   #111111;   /* card / panel background */
--color-border:    #222222;   /* subtle borders */
--color-accent:    #FF0000;   /* red — primary accent */
--color-accent-dim:#7a0000;   /* muted red for hover states */
--color-text:      #FFFFFF;   /* primary text */
--color-text-muted:#888888;   /* secondary / label text */
--color-success:   #00ff88;   /* process running / success states */
--color-warning:   #ffaa00;   /* waiting / blocked states */
--color-danger:    #ff3333;   /* terminated / error states */
```

### Typography
```css
--font-display: 'Space Grotesk', monospace;   /* headings, module titles */
--font-body:    'Inter', sans-serif;           /* body text, descriptions */
--font-mono:    'JetBrains Mono', monospace;   /* code, addresses, values */
```
Import from Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Spacing Scale
```
4px / 8px / 12px / 16px / 24px / 32px / 48px / 64px
```

### Border Radius
```
4px for tags/chips, 8px for cards, 12px for panels, 9999px for pills/buttons
```

---

## Folder Structure

```
os-emulator/
├── index.html                  ← main landing page (team maintains)
├── assets/
│   └── shared.css              ← global variables, resets, shared components
│
├── process-synchronization/    ← YOUR MAIN MODULE
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── process-state-transition/   ← YOUR EXTRA MODULE
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── memory-management/          ← teammate's module
├── [other-modules]/
└── ...
```

Each module folder is **fully self-contained** — no shared JS dependencies.

---

## File Boilerplate

Use this as the starting template for every `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>MODULE_NAME — OS_EMULATOR</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <!-- NAV -->
  <nav class="nav">
    <a href="../index.html" class="nav-brand">OS_EMULATOR</a>
    <span class="nav-module">MODULE_NAME</span>
    <!-- your roll number in a comment below -->
    <!-- 241CSXXX — YOUR NAME -->
  </nav>

  <!-- HERO -->
  <section class="hero">
    <p class="hero-label">VERSION_1.0.4_STABLE</p>
    <h1 class="hero-title">MODULE_<br>NAME.V1</h1>
    <p class="hero-desc">Short one-liner describing what this module simulates.</p>
  </section>

  <!-- SIMULATION AREA -->
  <main class="sim-container" id="simulation">
    <!-- your interactive simulation goes here -->
  </main>

  <!-- CONTROLS -->
  <section class="controls">
    <button class="btn-primary" id="startBtn">RUN_SIMULATION →</button>
    <button class="btn-outlined" id="resetBtn">RESET</button>
  </section>

  <script src="script.js"></script>
</body>
</html>
```

---

## CSS Conventions

```css
/* style.css — start every module file with these variables */

:root {
  --color-bg:        #0a0a0a;
  --color-surface:   #111111;
  --color-border:    #222222;
  --color-accent:    #FF0000;
  --color-accent-dim:#7a0000;
  --color-text:      #FFFFFF;
  --color-text-muted:#888888;
  --color-success:   #00ff88;
  --color-warning:   #ffaa00;
  --color-danger:    #ff3333;

  --font-display: 'Space Grotesk', monospace;
  --font-body:    'Inter', sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  min-height: 100vh;
}

/* NAV */
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 32px;
  border-bottom: 1px solid var(--color-border);
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.08em;
}
.nav-brand { color: var(--color-text); text-decoration: none; }
.nav-module { color: var(--color-accent); text-transform: uppercase; }

/* HERO */
.hero {
  padding: 48px 32px 32px;
  max-width: 900px;
}
.hero-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-accent);
  letter-spacing: 0.12em;
  margin-bottom: 12px;
  border: 1px solid var(--color-accent-dim);
  display: inline-block;
  padding: 4px 10px;
  border-radius: 4px;
}
.hero-title {
  font-family: var(--font-display);
  font-size: clamp(40px, 6vw, 72px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin-bottom: 16px;
}
.hero-desc {
  color: var(--color-text-muted);
  font-size: 15px;
  max-width: 480px;
  line-height: 1.6;
}

/* CARDS / PANELS */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 24px;
}

/* BUTTONS */
.btn-primary {
  background: var(--color-accent);
  color: #fff;
  border: none;
  padding: 12px 28px;
  border-radius: 9999px;
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}
.btn-primary:hover  { background: var(--color-accent-dim); }
.btn-primary:active { transform: scale(0.97); }

.btn-outlined {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 12px 28px;
  border-radius: 9999px;
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: border-color 0.2s;
}
.btn-outlined:hover { border-color: var(--color-text-muted); }

/* STATUS CHIPS */
.chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
}
.chip-running    { background: #00ff8822; color: var(--color-success); border: 1px solid var(--color-success); }
.chip-waiting    { background: #ffaa0022; color: var(--color-warning); border: 1px solid var(--color-warning); }
.chip-terminated { background: #ff333322; color: var(--color-danger);  border: 1px solid var(--color-danger);  }
.chip-blocked    { background: #ffffff11; color: var(--color-text-muted); border: 1px solid var(--color-border); }

/* LOG / TERMINAL OUTPUT */
.terminal {
  background: #000;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-success);
  height: 180px;
  overflow-y: auto;
  line-height: 1.7;
}
.terminal .log-error  { color: var(--color-danger); }
.terminal .log-warn   { color: var(--color-warning); }
.terminal .log-muted  { color: var(--color-text-muted); }
```

---

## Module 1 — Process Synchronization

**Folder:** `process-synchronization/`

### What to Simulate
A **Producer-Consumer problem** with a bounded buffer, controlled by a semaphore/mutex.
Show processes competing for a shared resource in real time.

### UI Layout
```
┌─────────────────────────────────────────┐
│  HERO: Process Synchronization          │
├──────────────┬──────────────────────────┤
│  PRODUCERS   │   BUFFER (slots 1–5)     │
│  [P1] [P2]   │   [■][■][□][□][□]        │
│              │                          │
│  CONSUMERS   │   MUTEX STATUS           │
│  [C1] [C2]   │   🔴 LOCKED / 🟢 FREE    │
├──────────────┴──────────────────────────┤
│  TERMINAL LOG                           │
│  > P1 acquired mutex, writing item...   │
│  > C1 waiting for mutex...              │
└─────────────────────────────────────────┘
```

### JS Logic Outline
```javascript
// script.js — Process Synchronization

const BUFFER_SIZE = 5;
let buffer = [];
let mutex = false;        // true = locked
let semFull = 0;          // items in buffer
let semEmpty = BUFFER_SIZE;

const producers = [
  { id: 'P1', state: 'idle', color: '#FF0000' },
  { id: 'P2', state: 'idle', color: '#ff6666' },
];
const consumers = [
  { id: 'C1', state: 'idle', color: '#00ff88' },
  { id: 'C2', state: 'idle', color: '#66ffaa' },
];

// States: idle → waiting → running → idle
// Use setInterval + async simulation steps
// Log each step to .terminal div

function acquireMutex(processId) {
  // if mutex is free, lock it and return true
  // else process enters WAITING state
}

function releaseMutex() {
  // unlock mutex, wake up next waiting process
}

function produce(producer) {
  // wait(semEmpty) → acquireMutex → add to buffer → releaseMutex → signal(semFull)
}

function consume(consumer) {
  // wait(semFull) → acquireMutex → remove from buffer → releaseMutex → signal(semEmpty)
}

function log(msg, type = '') {
  const el = document.createElement('div');
  el.className = `log-${type}`;
  el.textContent = `> ${msg}`;
  terminal.appendChild(el);
  terminal.scrollTop = terminal.scrollHeight;
}
```

### Algorithms to Implement
- Semaphore-based mutex (counting + binary)
- Producer-Consumer with bounded buffer
- Optional: Readers-Writers or Dining Philosophers as bonus

---

## Module 2 — Process State Transition

**Folder:** `process-state-transition/`

### What to Simulate
A visual **state machine** showing how processes move between:
`NEW → READY → RUNNING → WAITING → TERMINATED`

Multiple processes running simultaneously, each with their own state transitions animated.

### UI Layout
```
┌─────────────────────────────────────────┐
│  HERO: Process State Transition         │
├─────────────────────────────────────────┤
│                                         │
│   [NEW] ──→ [READY] ←──→ [WAITING]     │
│                ↓               ↑        │
│           [RUNNING] ───────────┘        │
│                ↓                        │
│          [TERMINATED]                   │
│                                         │
│   (arrows animate when transition fires)│
├─────────────────────────────────────────┤
│  PROCESS TABLE                          │
│  PID  NAME   STATE      BURST  PRIORITY │
│  001  P1     RUNNING    4ms    HIGH     │
│  002  P2     WAITING    2ms    MED      │
├─────────────────────────────────────────┤
│  TERMINAL LOG                           │
└─────────────────────────────────────────┘
```

### JS Logic Outline
```javascript
// script.js — Process State Transition

const STATES = ['new', 'ready', 'running', 'waiting', 'terminated'];

class Process {
  constructor(pid, name, burstTime, priority) {
    this.pid = pid;
    this.name = name;
    this.burstTime = burstTime;
    this.priority = priority;
    this.state = 'new';         // initial state
    this.remainingTime = burstTime;
  }

  transition(newState) {
    const allowed = {
      new:        ['ready'],
      ready:      ['running'],
      running:    ['waiting', 'terminated', 'ready'],
      waiting:    ['ready'],
      terminated: [],
    };
    if (allowed[this.state].includes(newState)) {
      log(`PID ${this.pid} [${this.state.toUpperCase()} → ${newState.toUpperCase()}]`);
      this.state = newState;
      renderProcessTable();
      animateArrow(this.state, newState);  // highlight arrow in diagram SVG
    }
  }
}

// Draw state diagram using SVG or Canvas
// Animate the transition arrow when a process moves state
// Update process table on every state change
// Use setTimeout chains to simulate scheduling

function animateArrow(from, to) {
  // find the SVG path between `from` and `to` nodes
  // add a CSS class that pulses it red for 600ms
}
```

### Algorithms to Implement
- Round Robin scheduler driving the transitions
- I/O interrupt simulation → triggers RUNNING → WAITING
- Context switch counter display

---

## JavaScript Conventions

```javascript
// Always use const/let, never var
// Use classes for Process, Scheduler objects
// Separate concerns:
//   - data/state  → plain objects / classes
//   - rendering   → dedicated render functions
//   - simulation  → scheduler / tick functions

// Animation timing constants
const TICK_MS       = 800;   // simulation step interval
const TRANSITION_MS = 400;   // CSS transition duration
const LOG_LIMIT     = 100;   // max terminal lines before clearing

// Always clear intervals on reset
let simInterval = null;

function startSimulation() {
  if (simInterval) clearInterval(simInterval);
  simInterval = setInterval(tick, TICK_MS);
}

function resetSimulation() {
  clearInterval(simInterval);
  simInterval = null;
  // reset all state, re-render
}
```

---

## Animation Guidelines

Use CSS transitions and keyframes — no external animation libraries needed.

```css
/* Process card state change */
.process-card {
  transition: background 0.3s ease, border-color 0.3s ease;
}

/* Pulse animation for active process */
@keyframes pulse-border {
  0%, 100% { border-color: var(--color-accent); box-shadow: 0 0 0 0 rgba(255,0,0,0.4); }
  50%       { border-color: var(--color-accent); box-shadow: 0 0 0 6px rgba(255,0,0,0); }
}
.process-card.active {
  animation: pulse-border 1.2s ease infinite;
}

/* Arrow highlight for state transitions */
@keyframes flash-red {
  0%   { stroke: var(--color-border); }
  40%  { stroke: var(--color-accent); stroke-width: 3px; }
  100% { stroke: var(--color-border); }
}
.arrow.transitioning {
  animation: flash-red 0.6s ease forwards;
}

/* Terminal new line entrance */
@keyframes slide-in {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
.terminal div {
  animation: slide-in 0.2s ease;
}
```

---

## Comment Format (Required by Team Lead)

Add your roll number at the top of every file:

```html
<!-- 241CSXXX — Your Name | Module: Process Synchronization -->
```

```css
/* 241CSXXX — Your Name | Module: Process Synchronization */
```

```javascript
// 241CSXXX — Your Name | Module: Process Synchronization
```

---

## Checklist Before Submission

- [ ] Roll number comment in all 3 files (HTML, CSS, JS)
- [ ] Folder named exactly as the module (e.g. `process-synchronization`)
- [ ] Simulation runs without errors on a fresh browser open
- [ ] RESET button fully restores initial state
- [ ] Terminal log shows meaningful step-by-step output
- [ ] No external JS libraries (vanilla only)
- [ ] Responsive down to 768px width
- [ ] Colors match the design system above
- [ ] Algorithm used is documented in a `<!-- comment -->` at top of script.js

---

## Presentation Tips (from Guidelines PDF)

- **2 min group overview**: show the site, explain which algorithm you implemented
- **1 min individual**: explain YOUR module — what the simulation shows, walk through one full cycle
- **Q&A prep**: know your semaphore/mutex logic cold; be ready to explain race conditions, deadlock prevention
- **5 bonus marks**: you get these if your algorithm is NOT from lab assignments — Process Synchronization with Semaphores and State Machine with Round Robin both qualify

---

*This file is your personal implementation reference. Keep it in your module folder or local notes.*
