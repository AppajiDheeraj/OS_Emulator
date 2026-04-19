// 241CS104 — Ajitesh | Module: Process Synchronization
//
// Algorithm: Semaphore-based Producer-Consumer (bounded buffer)
// ─────────────────────────────────────────────────────────────
// Semaphores:
//   semEmpty (counting) — number of empty slots  (init = BUFFER_SIZE)
//   semFull  (counting) — number of filled slots (init = 0)
//   mutex    (binary)   — mutual exclusion when accessing buffer
//
// Producer cycle: wait(semEmpty) → wait(mutex) → write → signal(mutex) → signal(semFull)
// Consumer cycle: wait(semFull)  → wait(mutex) → read  → signal(mutex) → signal(semEmpty)
//
// Waiting queue: FIFO — if mutex is locked, process enqueues and blocks.
// On release, the first waiter is dequeued and resumed.

'use strict';

// ── Constants ──────────────────────────────────────────────
const BUFFER_SIZE   = 5;
const LOG_LIMIT     = 120;

let TICK_MS = 800; // mutable for speed control

// ── State ──────────────────────────────────────────────────
let buffer       = [];      // circular buffer contents (item strings)
let semEmpty     = BUFFER_SIZE;
let semFull      = 0;
let mutexLocked  = false;
let mutexHolder  = null;
let mutexQueue   = [];      // processes waiting for mutex

let totalProduced = 0;
let totalConsumed = 0;
let mutexWaits    = 0;

let simInterval = null;
let running     = false;
let itemCounter = 0;
let history     = [];

function saveState() {
  history.push({
    buffer: [...buffer],
    semEmpty, semFull, mutexLocked, mutexHolder,
    mutexQueue: [...mutexQueue],
    totalProduced, totalConsumed, mutexWaits, itemCounter,
    processes: JSON.parse(JSON.stringify(processes)),
    pending: { ...pending },
    terminalHTML: terminal.innerHTML
  });
}

function restoreState(state) {
  buffer = [...state.buffer];
  semEmpty = state.semEmpty;
  semFull = state.semFull;
  mutexLocked = state.mutexLocked;
  mutexHolder = state.mutexHolder;
  mutexQueue = [...state.mutexQueue];
  totalProduced = state.totalProduced;
  totalConsumed = state.totalConsumed;
  mutexWaits = state.mutexWaits;
  itemCounter = state.itemCounter;
  
  processes.forEach((p, i) => {
    Object.assign(p, state.processes[i]);
  });
  Object.assign(pending, state.pending);
  terminal.innerHTML = state.terminalHTML;
  terminal.scrollTop = terminal.scrollHeight;
  renderAll();
}

// Process definitions
const processes = [
  { id: 'P1', type: 'producer', state: 'idle' },
  { id: 'P2', type: 'producer', state: 'idle' },
  { id: 'C1', type: 'consumer', state: 'idle' },
  { id: 'C2', type: 'consumer', state: 'idle' },
];

// Pending action per process (queued for next available slot)
const pending = { P1: null, P2: null, C1: null, C2: null };

// ── DOM refs ───────────────────────────────────────────────
const terminal      = document.getElementById('terminal');
const startBtn      = document.getElementById('startBtn');
const resetBtn      = document.getElementById('resetBtn');
const clearBtn      = document.getElementById('clearBtn');
const bufferCount   = document.getElementById('buffer-count');
const mutexIndicator= document.getElementById('mutex-indicator');
const mutexStatusTxt= document.getElementById('mutex-status-text');
const mutexHolder_el= document.getElementById('mutex-holder');
const semEmptyVal   = document.getElementById('sem-empty-val');
const semFullVal    = document.getElementById('sem-full-val');
const semEmptyBar   = document.getElementById('sem-empty-bar');
const semFullBar    = document.getElementById('sem-full-bar');
const waitQueueEl   = document.getElementById('wait-queue');
const statProduced  = document.getElementById('stat-produced');
const statConsumed  = document.getElementById('stat-consumed');
const statSwitches  = document.getElementById('stat-switches');

// ── Logging ────────────────────────────────────────────────
function log(msg, type = '') {
  // Trim log
  const lines = terminal.children;
  if (lines.length >= LOG_LIMIT) terminal.removeChild(lines[0]);
  const el = document.createElement('div');
  if (type) el.className = `log-${type}`;
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
  el.textContent = `[${ts}] > ${msg}`;
  terminal.appendChild(el);
  terminal.scrollTop = terminal.scrollHeight;
}

// ── Render ─────────────────────────────────────────────────
function renderBuffer() {
  bufferCount.textContent = `${buffer.length} / ${BUFFER_SIZE}`;
  for (let i = 0; i < BUFFER_SIZE; i++) {
    const slot = document.getElementById(`slot-${i}`);
    const inner = slot.querySelector('.slot-inner');
    if (i < buffer.length) {
      slot.classList.remove('empty');
      slot.classList.add('filled');
      inner.innerHTML = `<span class="slot-index">${i}</span><span class="slot-item">${buffer[i]}</span>`;
    } else {
      slot.classList.remove('filled');
      slot.classList.add('empty');
      inner.innerHTML = `<span class="slot-index">${i}</span>`;
    }
  }
}

function renderMutex() {
  if (mutexLocked) {
    mutexIndicator.className = 'mutex-indicator locked';
    mutexStatusTxt.textContent = 'LOCKED';
    mutexHolder_el.textContent = `held by: ${mutexHolder}`;
  } else {
    mutexIndicator.className = 'mutex-indicator free';
    mutexStatusTxt.textContent = 'FREE';
    mutexHolder_el.textContent = '—';
  }
}

function renderSemaphores() {
  semEmptyVal.textContent = semEmpty;
  semFullVal.textContent  = semFull;
  semEmptyBar.style.width = `${(semEmpty / BUFFER_SIZE) * 100}%`;
  semFullBar.style.width  = `${(semFull  / BUFFER_SIZE) * 100}%`;

  // Colour cues
  semEmptyVal.className = 'sem-value' + (semEmpty === 0 ? ' warn' : '');
  semFullVal.className  = 'sem-value accent' + (semFull === BUFFER_SIZE ? ' warn' : '');
}

function renderWaitQueue() {
  waitQueueEl.innerHTML = '';
  if (mutexQueue.length === 0) {
    waitQueueEl.innerHTML = '<span class="queue-empty">—</span>';
  } else {
    mutexQueue.forEach((pid, i) => {
      const el = document.createElement('span');
      el.className = 'queue-item';
      el.textContent = `${i === 0 ? '▶ ' : ''}${pid}`;
      waitQueueEl.appendChild(el);
    });
  }
}

function renderProcessCard(proc) {
  const card  = document.getElementById(`card-${proc.id}`);
  const chip  = document.getElementById(`chip-${proc.id}`);
  const bar   = document.getElementById(`bar-${proc.id}`);

  card.className = 'process-card';
  let chipClass = 'chip';

  switch (proc.state) {
    case 'running':
      card.classList.add('active');
      chipClass += ' chip-running';
      chip.textContent = 'RUNNING';
      bar.style.width  = '100%';
      break;
    case 'waiting':
      card.classList.add('waiting');
      chipClass += ' chip-waiting';
      chip.textContent = 'WAITING';
      bar.style.width  = '60%';
      break;
    case 'blocked':
      chipClass += ' chip-blocked';
      chip.textContent = 'BLOCKED';
      bar.style.width  = '30%';
      break;
    default: // idle
      chipClass += ' chip-idle';
      chip.textContent = 'IDLE';
      bar.style.width  = '0%';
  }
  chip.className = chipClass;
}

function renderAll() {
  renderBuffer();
  renderMutex();
  renderSemaphores();
  renderWaitQueue();
  processes.forEach(renderProcessCard);
  statProduced.textContent = totalProduced;
  statConsumed.textContent = totalConsumed;
  statSwitches.textContent = mutexWaits;
}

// ── Semaphore operations ───────────────────────────────────
// Returns true if resource available, false if must block
function semWait(sem) {
  // sem is object: { name, value }
  if (sem.value > 0) {
    sem.value--;
    return true; // continue
  }
  return false; // must block
}
function semSignal(sem) {
  sem.value++;
}

// Shared semaphore objects (wrapping state vars)
const SEM_EMPTY = { get value() { return semEmpty; }, set value(v) { semEmpty = v; } };
const SEM_FULL  = { get value() { return semFull;  }, set value(v) { semFull  = v; } };

// ── Mutex operations ───────────────────────────────────────
function acquireMutex(pid) {
  if (!mutexLocked) {
    mutexLocked = true;
    mutexHolder = pid;
    renderMutex();
    return true;
  }
  // Enqueue
  if (!mutexQueue.includes(pid)) {
    mutexQueue.push(pid);
    mutexWaits++;
    log(`${pid} waiting for mutex (queue: [${mutexQueue.join(', ')}])`, 'warn');
    renderWaitQueue();
  }
  return false;
}

function releaseMutex() {
  const prev = mutexHolder;
  mutexHolder = null;
  mutexLocked = false;
  renderMutex();
  // Wake first waiter
  if (mutexQueue.length > 0) {
    const next = mutexQueue.shift();
    renderWaitQueue();
    // Allow the next process to re-attempt on next tick
    // We grant it immediately
    mutexLocked = true;
    mutexHolder = next;
    renderMutex();
    log(`mutex released by ${prev} → granted to ${next}`, 'info');
    return next; // who got it
  }
  log(`mutex released by ${prev}`, '');
  return null;
}

// ── Process simulation state machines ─────────────────────
// Each process has a multi-step pipeline tracked by `pending[pid]`
// Steps: 'wait_empty'|'wait_full' → 'acquire_mutex' → 'operate' → 'release_mutex'

function stepProducer(proc) {
  const pid = proc.id;

  if (!pending[pid]) {
    // Start a new cycle — wait(semEmpty)
    if (semWait(SEM_EMPTY)) {
      pending[pid] = 'acquire_mutex';
      proc.state = 'waiting';
      log(`${pid} acquired semEmpty → waiting for mutex`, '');
      renderSemaphores();
    } else {
      proc.state = 'blocked';
      log(`${pid} blocked on semEmpty (buffer full)`, 'warn');
    }
    renderProcessCard(proc);
    return;
  }

  if (pending[pid] === 'acquire_mutex') {
    proc.state = 'waiting';
    if (acquireMutex(pid)) {
      pending[pid] = 'operate';
      proc.state = 'running';
      log(`${pid} acquired mutex — producing...`, '');
    } else {
      proc.state = 'blocked';
    }
    renderProcessCard(proc);
    return;
  }

  if (pending[pid] === 'operate') {
    // Produce item
    if (mutexHolder !== pid) {
      // Mutex was granted but another tick passed
      return;
    }
    itemCounter++;
    const item = `I${itemCounter}`;
    const insertIdx = buffer.length;
    buffer.push(item);

    // Animate slot
    const slot = document.getElementById(`slot-${insertIdx}`);
    slot.classList.add('flash-in');
    setTimeout(() => slot.classList.remove('flash-in'), 500);

    totalProduced++;
    log(`${pid} produced item [${item}] → buffer[${insertIdx}]`, '');
    pending[pid] = 'release_mutex';
    renderProcessCard(proc);
    renderBuffer();
    return;
  }

  if (pending[pid] === 'release_mutex') {
    if (mutexHolder !== pid) return;
    const granted = releaseMutex();
    // If granted to another, that process's step will pick it up
    semSignal(SEM_FULL);
    log(`${pid} signal(semFull) → semFull=${semFull}`, '');
    pending[pid] = null;
    proc.state = 'idle';
    renderProcessCard(proc);
    renderSemaphores();

    // If mutex was handed to someone in queue, run their operate step
    if (granted) {
      const wp = processes.find(p => p.id === granted);
      if (wp) {
        pending[granted] = 'operate';
        wp.state = 'running';
        renderProcessCard(wp);
      }
    }
    return;
  }
}

function stepConsumer(proc) {
  const pid = proc.id;

  if (!pending[pid]) {
    // Start a new cycle — wait(semFull)
    if (semWait(SEM_FULL)) {
      pending[pid] = 'acquire_mutex';
      proc.state = 'waiting';
      log(`${pid} acquired semFull → waiting for mutex`, '');
      renderSemaphores();
    } else {
      proc.state = 'blocked';
      log(`${pid} blocked on semFull (buffer empty)`, 'warn');
    }
    renderProcessCard(proc);
    return;
  }

  if (pending[pid] === 'acquire_mutex') {
    proc.state = 'waiting';
    if (acquireMutex(pid)) {
      pending[pid] = 'operate';
      proc.state = 'running';
      log(`${pid} acquired mutex — consuming...`, '');
    } else {
      proc.state = 'blocked';
    }
    renderProcessCard(proc);
    return;
  }

  if (pending[pid] === 'operate') {
    if (mutexHolder !== pid) return;
    if (buffer.length === 0) {
      // Shouldn't happen due to semFull guard, but safety check
      pending[pid] = 'release_mutex';
      return;
    }
    const item = buffer.shift();
    const consumedIdx = 0;

    // Animate
    const slot = document.getElementById(`slot-0`);
    slot.classList.add('flash-out');
    setTimeout(() => slot.classList.remove('flash-out'), 500);

    totalConsumed++;
    log(`${pid} consumed item [${item}] from buffer`, 'info');
    pending[pid] = 'release_mutex';
    renderProcessCard(proc);
    renderBuffer();
    return;
  }

  if (pending[pid] === 'release_mutex') {
    if (mutexHolder !== pid) return;
    const granted = releaseMutex();
    semSignal(SEM_EMPTY);
    log(`${pid} signal(semEmpty) → semEmpty=${semEmpty}`, '');
    pending[pid] = null;
    proc.state = 'idle';
    renderProcessCard(proc);
    renderSemaphores();

    if (granted) {
      const wp = processes.find(p => p.id === granted);
      if (wp) {
        pending[granted] = 'operate';
        wp.state = 'running';
        renderProcessCard(wp);
      }
    }
    return;
  }
}

// ── Tick ───────────────────────────────────────────────────
function tick() {
  saveState();
  // Interleave: each process gets a step per tick
  // Use a shuffled order each tick for realistic contention
  const order = ['P1', 'P2', 'C1', 'C2'].sort(() => Math.random() - 0.5);
  for (const pid of order) {
    const proc = processes.find(p => p.id === pid);
    if (proc.type === 'producer') stepProducer(proc);
    else                          stepConsumer(proc);
  }
  statProduced.textContent = totalProduced;
  statConsumed.textContent = totalConsumed;
  statSwitches.textContent = mutexWaits;
}

// ── Controls ───────────────────────────────────────────────
function toggleSimulation() {
  if (running) {
    clearInterval(simInterval);
    simInterval = null;
    running = false;
    startBtn.textContent = 'AUTO RUN';
    log('── simulation paused ──', 'muted');
  } else {
    running = true;
    startBtn.textContent = 'PAUSE';
    log('── simulation running ──', 'muted');
    simInterval = setInterval(tick, TICK_MS);
  }
}

function stepForward() {
  if (running) toggleSimulation();
  tick();
}

function stepBackward() {
  if (running) toggleSimulation();
  if (history.length > 0) {
    const prevState = history.pop();
    restoreState(prevState);
  } else {
    log('already at beginning of simulation', 'warn');
  }
}

function resetSimulation() {
  clearInterval(simInterval);
  simInterval = null;
  running = false;
  history = [];

  buffer       = [];
  semEmpty     = BUFFER_SIZE;
  semFull      = 0;
  mutexLocked  = false;
  mutexHolder  = null;
  mutexQueue   = [];
  totalProduced = 0;
  totalConsumed = 0;
  mutexWaits   = 0;
  itemCounter  = 0;

  processes.forEach(p => {
    p.state = 'idle';
    pending[p.id] = null;
  });

  startBtn.textContent = 'AUTO RUN';
  startBtn.disabled = false;

  terminal.innerHTML = '<div class="log-muted">&gt; simulation reset. press AUTO RUN or NEXT to begin.</div>';
  renderAll();
}

startBtn.addEventListener('click', toggleSimulation);
document.getElementById('stepBackBtn').addEventListener('click', stepBackward);
document.getElementById('stepForwardBtn').addEventListener('click', stepForward);
resetBtn.addEventListener('click', resetSimulation);
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

// Init
renderAll();
