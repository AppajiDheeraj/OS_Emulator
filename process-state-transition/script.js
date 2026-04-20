// 241CS104 — Ajitesh | Module: Process State Transition
//
// Algorithm: Round Robin Scheduler + I/O Interrupt Simulation
// ────────────────────────────────────────────────────────────
// States: NEW → READY → RUNNING → WAITING → TERMINATED
//         RUNNING → READY  (quantum expired → preemption)
//         RUNNING → WAITING (I/O interrupt, ~30% chance / tick)
//         WAITING → READY  (I/O complete, after 2–4 ticks)
//
// Scheduler:
//   - FIFO ready queue
//   - One process runs at a time
//   - Each tick: decrement remainingTime of running process
//   - On quantum expiry: RUNNING → READY (context switch)
//   - On termination:    RUNNING → TERMINATED
//   - I/O interrupt:     RUNNING → WAITING (random per tick)
//
// Context switch counter increments on RUNNING→READY/WAITING

'use strict';

// ── Constants ─────────────────────────────────────────────
const LOG_LIMIT   = 120;
const IO_CHANCE   = 0.30;      // 30% per tick of I/O interrupt

let TICK_MS       = 800;
let QUANTUM       = 2;

// ── State ─────────────────────────────────────────────────
let processes     = [];
let readyQueue    = [];        // PIDs in FIFO order
let ioQueue       = [];        // { pid, countdown } — waiting for I/O
let runningProc   = null;      // currently running process object
let quantumLeft   = 0;
let ctxSwitches   = 0;
let simInterval   = null;
let running       = false;
let pidCounter    = 0;
let tickCount     = 0;
let history       = [];

function saveState() {
  history.push({
    processes: JSON.parse(JSON.stringify(processes)),
    readyQueue: [...readyQueue],
    ioQueue: JSON.parse(JSON.stringify(ioQueue)),
    runningProcPid: runningProc ? runningProc.pid : null,
    quantumLeft, ctxSwitches, tickCount, pidCounter,
    terminalHTML: terminal.innerHTML
  });
}

function restoreState(state) {
  processes = state.processes;
  readyQueue = state.readyQueue;
  ioQueue = state.ioQueue;
  if (state.runningProcPid) {
    runningProc = processes.find(p => p.pid === state.runningProcPid);
  } else {
    runningProc = null;
  }
  quantumLeft = state.quantumLeft;
  ctxSwitches = state.ctxSwitches;
  tickCount = state.tickCount;
  pidCounter = state.pidCounter;
  terminal.innerHTML = state.terminalHTML;
  terminal.scrollTop = terminal.scrollHeight;
  renderAll();
}

// ── Process factory ────────────────────────────────────────
const PRIORITY_MAP = { HIGH: 3, MED: 2, LOW: 1 };
const PI_COLORS    = ['#FF0000', '#00ff88', '#ffaa00', '#4fc3f7', '#c084fc'];

function createProcess(name, burstTime, priority) {
  pidCounter++;
  return {
    pid:          String(pidCounter).padStart(3, '0'),
    name,
    burstTime,
    priority,          // 'HIGH' | 'MED' | 'LOW'
    state:       'new',
    remainingTime: burstTime,
    contextSwitches: 0,
    color:         PI_COLORS[(pidCounter - 1) % PI_COLORS.length],
    ioCountdown:   0,
  };
}

function seedProcesses() {
  processes = [
    createProcess('P1', 6, 'HIGH'),
    createProcess('P2', 4, 'MED'),
    createProcess('P3', 3, 'LOW'),
    createProcess('P4', 5, 'HIGH'),
  ];
}

// ── DOM refs ───────────────────────────────────────────────
const terminal      = document.getElementById('terminal');
const startBtn      = document.getElementById('startBtn');
const resetBtn      = document.getElementById('resetBtn');
const spawnBtn      = document.getElementById('spawnBtn');
const clearBtn      = document.getElementById('clearBtn');
const ctxCount      = document.getElementById('ctx-count');
const ptableBody    = document.getElementById('ptable-body');
const readyQueueEl  = document.getElementById('ready-queue');
const ioQueueEl     = document.getElementById('io-queue');
const statRunning   = document.getElementById('stat-running');
const statTerminated= document.getElementById('stat-terminated');
const statWaiting   = document.getElementById('stat-waiting');

// ── Logging ────────────────────────────────────────────────
function log(msg, type = '') {
  const lines = terminal.children;
  if (lines.length >= LOG_LIMIT) terminal.removeChild(lines[0]);
  const el = document.createElement('div');
  if (type) el.className = `log-${type}`;
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
  el.textContent = `[${ts}] > ${msg}`;
  terminal.appendChild(el);
  terminal.scrollTop = terminal.scrollHeight;
}

// ── SVG Arrow animation ────────────────────────────────────
const arrowMap = {
  'new-ready':       'arrow-new-ready',
  'ready-running':   'arrow-ready-running',
  'running-waiting': 'arrow-running-waiting',
  'waiting-ready':   'arrow-waiting-ready',
  'running-terminated': 'arrow-running-terminated',
  'running-ready':   'arrow-running-ready',
};

function animateArrow(from, to) {
  const key = `${from}-${to}`;
  const id  = arrowMap[key];
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('transitioning');
  // Force reflow to restart animation
  void el.offsetWidth;
  el.classList.add('transitioning');
  setTimeout(() => el.classList.remove('transitioning'), 650);
}

// ── SVG Node highlight ─────────────────────────────────────
const nodeClassMap = {
  new:        '',
  ready:      'ready-node',
  running:    'active-node',
  waiting:    'waiting-node',
  terminated: 'terminated-node',
};
const labelClassMap = {
  new:        '',
  ready:      'ready-label',
  running:    'active-label',
  waiting:    'waiting-label',
  terminated: 'terminated-label',
};

function updateNodeHighlights() {
  // Reset all nodes
  const nodeIds = ['new', 'ready', 'running', 'waiting', 'terminated'];
  for (const n of nodeIds) {
    const nodeEl  = document.getElementById(`node-${n}`);
    const labelEl = nodeEl ? nodeEl.nextElementSibling : null;
    if (nodeEl) nodeEl.className.baseVal = `state-node${n === 'terminated' ? ' terminated' : ''}`;
  }

  // Collect active states among processes
  const activeCounts = {};
  for (const proc of processes) {
    if (!activeCounts[proc.state]) activeCounts[proc.state] = 0;
    activeCounts[proc.state]++;
  }

  // Apply highlights
  for (const [state, count] of Object.entries(activeCounts)) {
    if (count === 0) continue;
    const nodeEl  = document.getElementById(`node-${state}`);
    if (nodeEl) {
      const extra = state === 'terminated' ? ' terminated' : '';
      nodeEl.className.baseVal = `state-node${extra} ${nodeClassMap[state]}`.trim();
    }
  }
}

// ── Process transition ─────────────────────────────────────
function transition(proc, newState) {
  const allowed = {
    new:        ['ready'],
    ready:      ['running'],
    running:    ['waiting', 'terminated', 'ready'],
    waiting:    ['ready'],
    terminated: [],
  };
  if (!allowed[proc.state]?.includes(newState)) return false;

  const from = proc.state;
  log(`PID ${proc.pid} [${proc.name}] ${from.toUpperCase()} → ${newState.toUpperCase()}`,
      newState === 'terminated' ? 'error' :
      newState === 'waiting'    ? 'warn'  :
      newState === 'running'    ? ''      : 'info');

  proc.state = newState;
  animateArrow(from, newState);
  renderAll();
  return true;
}

// ── Render ─────────────────────────────────────────────────
function renderProcessTable() {
  ptableBody.innerHTML = '';
  for (const proc of processes) {
    const tr = document.createElement('tr');
    tr.className = proc.state === 'running'    ? 'row-running'    :
                   proc.state === 'waiting'    ? 'row-waiting'    :
                   proc.state === 'terminated' ? 'row-terminated' : '';

    const chipClass = `state-chip chip-${proc.state}`;
    const priClass  = `priority-${proc.priority.toLowerCase()}`;
    const remBar    = proc.state !== 'terminated'
      ? `<span style="color:var(--color-text-muted)">${proc.remainingTime}</span>`
      : `<span style="color:var(--color-danger)">DONE</span>`;

    tr.innerHTML = `
      <td>${proc.pid}</td>
      <td style="color:var(--color-text);font-weight:600">${proc.name}</td>
      <td><span class="${chipClass}">${proc.state.toUpperCase()}</span></td>
      <td style="color:var(--color-text-muted)">${proc.burstTime}</td>
      <td>${remBar}</td>
      <td class="${priClass}">${proc.priority}</td>
      <td style="color:var(--color-accent)">${proc.contextSwitches}</td>
    `;
    ptableBody.appendChild(tr);
  }
}

function renderReadyQueue() {
  readyQueueEl.innerHTML = '';
  if (readyQueue.length === 0) {
    readyQueueEl.innerHTML = '<span class="queue-empty">—</span>';
    return;
  }
  readyQueue.forEach((pid, i) => {
    const el = document.createElement('span');
    el.className = 'queue-proc ready-proc';
    const proc = processes.find(p => p.pid === pid);
    el.textContent = `${i === 0 ? '▶ ' : ''}${proc?.name ?? pid}`;
    readyQueueEl.appendChild(el);
  });
}

function renderIoQueue() {
  ioQueueEl.innerHTML = '';
  if (ioQueue.length === 0) {
    ioQueueEl.innerHTML = '<span class="queue-empty">—</span>';
    return;
  }
  ioQueue.forEach(item => {
    const el = document.createElement('span');
    el.className = 'queue-proc io-proc';
    const proc = processes.find(p => p.pid === item.pid);
    el.textContent = `${proc?.name ?? item.pid} [${item.countdown}t]`;
    ioQueueEl.appendChild(el);
  });
}

function renderStats() {
  const terminated = processes.filter(p => p.state === 'terminated').length;
  const waiting    = processes.filter(p => p.state === 'waiting').length;
  const run        = processes.filter(p => p.state === 'running').length;

  statRunning.textContent    = run;
  statTerminated.textContent = terminated;
  statWaiting.textContent    = waiting;
  ctxCount.textContent       = ctxSwitches;
}

function renderAll() {
  renderProcessTable();
  renderReadyQueue();
  renderIoQueue();
  renderStats();
  updateNodeHighlights();
}

// ── Scheduler tick ─────────────────────────────────────────
function tick() {
  saveState();
  tickCount++;

  // 1. Admit NEW processes → READY  (all at start, or freshly spawned)
  for (const proc of processes) {
    if (proc.state === 'new') {
      readyQueue.push(proc.pid);
      transition(proc, 'ready');
    }
  }

  // 2. I/O completions — count down IO queue
  const stillWaiting = [];
  for (const item of ioQueue) {
    item.countdown--;
    if (item.countdown <= 0) {
      const proc = processes.find(p => p.pid === item.pid);
      if (proc && proc.state === 'waiting') {
        readyQueue.push(proc.pid);
        transition(proc, 'ready');
        log(`PID ${proc.pid} [${proc.name}] I/O complete → READY`, 'info');
      }
    } else {
      stillWaiting.push(item);
    }
  }
  ioQueue = stillWaiting;

  // 3. If nothing running, dispatch from ready queue
  if (!runningProc && readyQueue.length > 0) {
    const nextPid = readyQueue.shift();
    runningProc   = processes.find(p => p.pid === nextPid);
    quantumLeft   = QUANTUM;
    if (runningProc) {
      transition(runningProc, 'running');
      log(`PID ${runningProc.pid} [${runningProc.name}] dispatched (quantum=${QUANTUM}, rem=${runningProc.remainingTime})`, '');
    }
  }

  // 4. Run the current process for one tick
  if (runningProc) {
    const proc = runningProc;

    // Check for I/O interrupt (random, only if not last tick of burst)
    const willTerminate = proc.remainingTime <= 1;
    const ioEvent = !willTerminate && Math.random() < IO_CHANCE;

    if (ioEvent) {
      // RUNNING → WAITING
      proc.contextSwitches++;
      ctxSwitches++;
      const ioTime = 2 + Math.floor(Math.random() * 3); // 2–4 ticks
      ioQueue.push({ pid: proc.pid, countdown: ioTime });
      log(`PID ${proc.pid} [${proc.name}] I/O interrupt! Waiting ${ioTime} tick(s)`, 'warn');
      runningProc = null;
      transition(proc, 'waiting');
      renderAll();
      return;
    }

    // Decrement remaining time
    proc.remainingTime--;

    // Check termination
    if (proc.remainingTime <= 0) {
      runningProc = null;
      transition(proc, 'terminated');
      log(`PID ${proc.pid} [${proc.name}] finished execution`, 'error');

      // Check if all done
      if (processes.every(p => p.state === 'terminated')) {
        log('── all processes terminated ──', 'muted');
        stopSimulation();
      }
      return;
    }

    // Decrement quantum
    quantumLeft--;
    if (quantumLeft <= 0) {
      // RUNNING → READY (preemption)
      proc.contextSwitches++;
      ctxSwitches++;
      readyQueue.push(proc.pid);
      log(`PID ${proc.pid} [${proc.name}] quantum expired → preempted (rem=${proc.remainingTime})`, 'warn');
      runningProc = null;
      transition(proc, 'ready');
      return;
    }

    // Still running
    log(`PID ${proc.pid} [${proc.name}] running... rem=${proc.remainingTime}, qLeft=${quantumLeft}`, '');
    renderAll();
  } else {
    // CPU idle
    if (processes.some(p => p.state !== 'terminated')) {
      log('CPU idle — waiting for I/O or new processes', 'muted');
      renderAll();
    }
  }
}

// ── Simulation control ─────────────────────────────────────
function toggleSimulation() {
  if (running) {
    clearInterval(simInterval);
    simInterval = null;
    running = false;
    startBtn.textContent = 'AUTO RUN';
    log('── simulation paused ──', 'muted');
  } else {
    // Admit any still-new processes
    for (const proc of processes) {
      if (proc.state === 'new') {
        readyQueue.push(proc.pid);
        transition(proc, 'ready');
      }
    }
    running = true;
    startBtn.textContent = 'PAUSE';
    log('── simulation running ──', 'muted');
    simInterval = setInterval(tick, TICK_MS);
  }
}

function stepForward() {
  if (running) toggleSimulation();
  // Admit any still-new processes
  for (const proc of processes) {
    if (proc.state === 'new') {
      readyQueue.push(proc.pid);
      transition(proc, 'ready');
    }
  }
  tick();
}

function stepBackward() {
  if (running) toggleSimulation();
  if (history.length > 0) {
    restoreState(history.pop());
  } else {
    log('already at beginning of simulation', 'warn');
  }
}

function stopSimulation() {
  clearInterval(simInterval);
  simInterval = null;
  running = false;
  startBtn.textContent = 'COMPLETE ✓';
  startBtn.disabled = true;
}

function resetSimulation() {
  clearInterval(simInterval);
  simInterval = null;
  running     = false;
  history     = [];
  runningProc = null;
  readyQueue  = [];
  ioQueue     = [];
  ctxSwitches = 0;
  quantumLeft = 0;
  tickCount   = 0;
  pidCounter  = 0;

  seedProcesses();

  startBtn.textContent = 'AUTO RUN';
  startBtn.disabled = false;
  terminal.innerHTML  = '<div class="log-muted">&gt; simulation reset. press AUTO RUN or NEXT to begin.</div>';
  renderAll();
}

// Spawn a random new process mid-simulation
const SPAWN_NAMES = ['P5','P6','P7','P8','P9'];
let spawnIdx = 0;
function spawnProcess() {
  if (spawnIdx >= SPAWN_NAMES.length) {
    log('max spawn limit reached', 'warn');
    return;
  }
  const priorities = ['HIGH','MED','LOW'];
  const burst = 2 + Math.floor(Math.random() * 5);
  const prio  = priorities[Math.floor(Math.random() * 3)];
  const proc  = createProcess(SPAWN_NAMES[spawnIdx++], burst, prio);
  processes.push(proc);
  log(`spawned PID ${proc.pid} [${proc.name}] burst=${burst} priority=${prio}`, 'info');

  if (running) {
    readyQueue.push(proc.pid);
    proc.state = 'ready';
    renderAll();
  }
}

// ── Event listeners ────────────────────────────────────────
startBtn.addEventListener('click', toggleSimulation);
document.getElementById('stepBackBtn').addEventListener('click', stepBackward);
document.getElementById('stepForwardBtn').addEventListener('click', stepForward);
resetBtn.addEventListener('click', resetSimulation);
spawnBtn.addEventListener('click', spawnProcess);
clearBtn.addEventListener('click', () => {
  terminal.innerHTML = '<div class="log-muted">&gt; log cleared.</div>';
});

// Speed buttons
document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    TICK_MS = parseInt(btn.dataset.speed, 10);
    if (running) {
      clearInterval(simInterval);
      simInterval = setInterval(tick, TICK_MS);
    }
    log(`speed set to ${btn.textContent} (${TICK_MS}ms/tick)`, 'muted');
  });
});

// Quantum buttons
document.querySelectorAll('.qbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.qbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    QUANTUM = parseInt(btn.dataset.q, 10);
    log(`quantum set to ${QUANTUM} tick(s)`, 'muted');
  });
});

// ── Init ───────────────────────────────────────────────────
seedProcesses();
renderAll();
