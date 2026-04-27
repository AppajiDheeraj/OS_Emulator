// 241CS109 — Anirudh Nayak | Module: Copy on Write

/* Theory summary:
 Copy-on-write lets parent and child share the same physical pages after fork().
 Those shared pages are marked read-only, so reads cost nothing extra.
 When one process writes to a shared page, a page fault occurs and the OS creates
 a private copy only for the writer. This saves memory and delays copying until
 modification actually happens.*/
'use strict';

const LOG_LIMIT = 120;
const DEFAULT_PAGE_COUNT = 4;

let TICK_MS = 900;
let pageCount = DEFAULT_PAGE_COUNT;
let operations = [];
let opIndex = 0;
let history = [];
let autoTimer = null;
let nextFrameId = 0;
let parentPages = [];
let childPages = [];
let frames = [];
let forked = false;
let copyEvents = 0;
let pageFaults = 0;
let lastFault = 'NONE';
let currentEventText = 'BASELINE';
let memoryModeText = 'PRIVATE';
let writeTargetText = '—';
let inspector = { process: '—', page: '—', frame: '—', result: 'READY' };

const terminal = document.getElementById('terminal');
const operationList = document.getElementById('operation-list');
const parentTable = document.getElementById('parent-table');
const childTable = document.getElementById('child-table');
const frameList = document.getElementById('frame-list');
const currentEvent = document.getElementById('current-event');
const writeTarget = document.getElementById('write-target');
const latestFault = document.getElementById('latest-fault');
const memoryMode = document.getElementById('memory-mode');
const heroDesc = document.getElementById('hero-desc');
const algoBadge = document.getElementById('algo-badge');
const statShared = document.getElementById('stat-shared');
const statPrivate = document.getElementById('stat-private');
const statCopies = document.getElementById('stat-copies');
const statFaults = document.getElementById('stat-faults');
const inspectProcess = document.getElementById('inspect-process');
const inspectPage = document.getElementById('inspect-page');
const inspectFrame = document.getElementById('inspect-frame');
const inspectResult = document.getElementById('inspect-result');
const pageCountInput = document.getElementById('page-count-input');
const applySetupBtn = document.getElementById('applySetupBtn');
const opTypeSelect = document.getElementById('op-type-select');
const opProcessSelect = document.getElementById('op-process-select');
const opPageSelect = document.getElementById('op-page-select');
const addOperationBtn = document.getElementById('addOperationBtn');
const loadForkBtn = document.getElementById('loadForkBtn');
const clearOpsBtn = document.getElementById('clearOpsBtn');
const startBtn = document.getElementById('startBtn');
const stepForwardBtn = document.getElementById('stepForwardBtn');
const stepBackBtn = document.getElementById('stepBackBtn');
const resetBtn = document.getElementById('resetBtn');
const clearBtn = document.getElementById('clearBtn');

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pageName(index) {
  return String.fromCharCode(65 + index);
}

function createBaseState() {
  parentPages = [];
  childPages = [];
  frames = [];
  nextFrameId = 0;

  for (let index = 0; index < pageCount; index += 1) {
    const page = pageName(index);
    const frameId = `F${nextFrameId++}`;
    parentPages.push({ page, frame: frameId, mode: 'RW' });
    frames.push({
      id: frameId,
      owners: ['PARENT'],
      refs: 1,
      state: 'private',
      source: `page ${page} base frame`
    });
  }
}

function updateHeaderCopy() {
  heroDesc.textContent = `Build a parent image with ${pageCount} page${pageCount === 1 ? '' : 's'}, then queue fork/read/write steps to watch sharing and private copies emerge.`;
  algoBadge.textContent = `PAGES: ${pageCount} · FORK · SHARED READ-ONLY MAPPINGS · PAGE FAULT COPY`;
}

function log(message, type = '') {
  if (terminal.children.length >= LOG_LIMIT) {
    terminal.removeChild(terminal.children[0]);
  }

  const row = document.createElement('div');
  if (type) row.className = `log-${type}`;
  const stamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  row.textContent = `[${stamp}] > ${message}`;
  terminal.appendChild(row);
  terminal.scrollTop = terminal.scrollHeight;
}

function getTable(processName) {
  return processName === 'PARENT' ? parentPages : childPages;
}

function getFrame(frameId) {
  return frames.find((frame) => frame.id === frameId);
}

function updateFrameState(frame) {
  frame.refs = frame.owners.length;
  if (frame.refs > 1) {
    frame.state = 'shared';
  } else if (frame.source.includes('COW')) {
    frame.state = 'copy';
  } else {
    frame.state = 'private';
  }
}

function recalculateFrames() {
  frames.forEach(updateFrameState);
}

function updatePageOptions() {
  opPageSelect.innerHTML = '';
  for (let index = 0; index < pageCount; index += 1) {
    const option = document.createElement('option');
    option.value = pageName(index);
    option.textContent = pageName(index);
    opPageSelect.appendChild(option);
  }
}

function updateOperationBuilderState() {
  const isFork = opTypeSelect.value === 'fork';
  opProcessSelect.disabled = isFork;
  opPageSelect.disabled = isFork;
}

function saveState() {
  history.push({
    opIndex,
    nextFrameId,
    parentPages: deepClone(parentPages),
    childPages: deepClone(childPages),
    frames: deepClone(frames),
    forked,
    copyEvents,
    pageFaults,
    lastFault,
    currentEventText,
    memoryModeText,
    writeTargetText,
    inspector: { ...inspector },
    terminalHTML: terminal.innerHTML
  });
}

function restoreState(snapshot) {
  opIndex = snapshot.opIndex;
  nextFrameId = snapshot.nextFrameId;
  parentPages = deepClone(snapshot.parentPages);
  childPages = deepClone(snapshot.childPages);
  frames = deepClone(snapshot.frames);
  forked = snapshot.forked;
  copyEvents = snapshot.copyEvents;
  pageFaults = snapshot.pageFaults;
  lastFault = snapshot.lastFault;
  currentEventText = snapshot.currentEventText;
  memoryModeText = snapshot.memoryModeText;
  writeTargetText = snapshot.writeTargetText;
  inspector = { ...snapshot.inspector };
  terminal.innerHTML = snapshot.terminalHTML;
  renderAll();
}

function performFork() {
  if (forked) {
    inspector = { process: 'SYSTEM', page: '—', frame: '—', result: 'ALREADY_FORKED' };
    log('fork() already completed.', 'warn');
    return;
  }

  childPages = parentPages.map((entry) => ({ ...entry, mode: 'RO' }));
  parentPages = parentPages.map((entry) => ({ ...entry, mode: 'RO' }));
  frames.forEach((frame) => {
    frame.owners = ['PARENT', 'CHILD'];
    updateFrameState(frame);
  });
  forked = true;
  currentEventText = 'FORK COMPLETE';
  memoryModeText = 'SHARED';
  writeTargetText = '—';
  inspector = { process: 'PARENT+CHILD', page: 'ALL', frame: 'MULTI', result: 'SHARED_RO' };
  log('fork() duplicated page tables only. Parent and child now share frames as read-only mappings.', 'success');
}

function performRead(operation) {
  if (!forked && operation.process === 'CHILD') {
    inspector = { process: operation.process, page: operation.page, frame: '—', result: 'NO_CHILD' };
    log('Child access is unavailable before fork().', 'warn');
    return;
  }

  const table = getTable(operation.process);
  const entry = table.find((page) => page.page === operation.page);
  inspector = {
    process: operation.process,
    page: operation.page,
    frame: entry.frame,
    result: entry.mode === 'RO' ? 'READ_SHARED' : 'READ_PRIVATE'
  };
  currentEventText = `${operation.process} READ ${operation.page}`;
  writeTargetText = `${operation.process}:${operation.page}`;
  memoryModeText = forked ? 'SHARED' : 'PRIVATE';
  log(`${operation.process} read page ${operation.page} from ${entry.frame}. Read access leaves frame sharing unchanged.`, 'info');
}

function performWrite(operation) {
  if (!forked && operation.process === 'CHILD') {
    inspector = { process: operation.process, page: operation.page, frame: '—', result: 'NO_CHILD' };
    log('Child writes are unavailable before fork().', 'warn');
    return;
  }

  const table = getTable(operation.process);
  const entry = table.find((page) => page.page === operation.page);
  const frame = getFrame(entry.frame);

  currentEventText = `${operation.process} WRITE ${operation.page}`;
  writeTargetText = `${operation.process}:${operation.page}`;

  if (entry.mode === 'RW' && frame.refs === 1) {
    inspector = {
      process: operation.process,
      page: operation.page,
      frame: frame.id,
      result: 'WRITE_PRIVATE'
    };
    memoryModeText = forked ? 'MIXED' : 'PRIVATE';
    log(`${operation.process} wrote page ${operation.page} on private frame ${frame.id}. No copy was needed.`, 'info');
    return;
  }

  pageFaults += 1;
  copyEvents += 1;
  lastFault = `${operation.process}:${operation.page}`;

  frame.owners = frame.owners.filter((owner) => owner !== operation.process);
  updateFrameState(frame);

  const newFrameId = `F${nextFrameId++}`;
  frames.push({
    id: newFrameId,
    owners: [operation.process],
    refs: 1,
    state: 'copy',
    source: `COW copy of page ${operation.page}`
  });

  entry.frame = newFrameId;
  entry.mode = 'RW';

  const siblingProcess = operation.process === 'PARENT' ? 'CHILD' : 'PARENT';
  const siblingTable = getTable(siblingProcess);
  const siblingEntry = siblingTable.find((page) => page.page === operation.page);
  if (siblingEntry) {
    const siblingFrame = getFrame(siblingEntry.frame);
    if (siblingFrame && siblingFrame.refs === 1) {
      siblingEntry.mode = 'RW';
    }
  }

  recalculateFrames();
  memoryModeText = 'MIXED';
  inspector = {
    process: operation.process,
    page: operation.page,
    frame: newFrameId,
    result: 'COW_COPY'
  };
  log(`${operation.process} wrote shared page ${operation.page}. A page fault allocated ${newFrameId} and installed a private copy.`, 'success');
}

function applyOperation() {
  if (opIndex >= operations.length) {
    log('All queued COW operations have completed.', 'info');
    stopAuto();
    return;
  }

  saveState();
  const operation = operations[opIndex];
  if (operation.type === 'fork') {
    performFork();
  } else if (operation.type === 'write') {
    performWrite(operation);
  } else {
    performRead(operation);
  }
  opIndex += 1;
  renderAll();
}

function operationLabel(operation) {
  if (operation.type === 'fork') return 'FORK()';
  return `${operation.process} ${operation.type.toUpperCase()} ${operation.page}`;
}

function operationDetail(operation) {
  if (operation.type === 'fork') {
    return 'Create child page table mappings and switch both sides to read-only.';
  }
  if (operation.type === 'write') {
    return 'Write may trigger a page fault if the frame is still shared.';
  }
  return 'Read keeps the mapping untouched and preserves sharing.';
}

function renderOperations() {
  operationList.innerHTML = '';
  if (!operations.length) {
    operationList.innerHTML = '<div class="operation-card"><div class="operation-meta">Add operations from the builder or load the default flow.</div></div>';
    return;
  }

  operations.forEach((operation, index) => {
    const card = document.createElement('div');
    const classes = ['operation-card'];
    if (index < opIndex) classes.push('done');
    if (index === opIndex) classes.push('active');
    card.className = classes.join(' ');
    card.innerHTML = `
      <div class="operation-head">
        <div class="operation-id">${operationLabel(operation)}</div>
        <span class="chip ${index < opIndex ? 'ok' : index === opIndex ? 'warn' : ''}">${index < opIndex ? 'DONE' : index === opIndex ? 'NEXT' : 'PENDING'}</span>
      </div>
      <div class="operation-meta">${operationDetail(operation)}</div>
      <div class="operation-note">STEP ${index + 1}</div>
    `;
    operationList.appendChild(card);
  });
}

function renderTable(target, entries, emptyLabel) {
  target.innerHTML = '';
  if (!entries.length) {
    target.innerHTML = `<div class="table-row"><div class="table-cell main">${emptyLabel}</div><div class="table-cell muted">waiting for fork()</div></div>`;
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.innerHTML = `
      <div class="table-cell main">PAGE ${entry.page} → ${entry.frame}</div>
      <div class="table-cell muted">${entry.mode}</div>
    `;
    target.appendChild(row);
  });
}

function renderFrames() {
  frameList.innerHTML = '';
  frames.forEach((frame) => {
    const card = document.createElement('div');
    card.className = `frame-card ${frame.state}`;
    card.innerHTML = `
      <div class="frame-head">
        <div class="frame-id">${frame.id}</div>
        <span class="chip ${frame.refs > 1 ? 'warn' : 'ok'}">REFS ${frame.refs}</span>
      </div>
      <div class="frame-meta">owners: ${frame.owners.join(', ')}</div>
      <div class="frame-meta">${frame.source}</div>
    `;
    frameList.appendChild(card);
  });
}

function renderStats() {
  const sharedCount = frames.filter((frame) => frame.refs > 1).length;
  const privateCount = frames.filter((frame) => frame.refs === 1).length;
  statShared.textContent = String(sharedCount);
  statPrivate.textContent = String(privateCount);
  statCopies.textContent = String(copyEvents);
  statFaults.textContent = String(pageFaults);
}

function renderStatus() {
  currentEvent.textContent = currentEventText;
  writeTarget.textContent = writeTargetText;
  latestFault.textContent = lastFault;
  memoryMode.textContent = memoryModeText;
  memoryMode.className = `status-value ${memoryModeText === 'SHARED' ? 'accent' : 'ok'}`;
}

function renderInspector() {
  inspectProcess.textContent = inspector.process;
  inspectPage.textContent = inspector.page;
  inspectFrame.textContent = inspector.frame;
  inspectResult.textContent = inspector.result;
  inspectResult.className = `inspector-value ${
    inspector.result === 'COW_COPY' ? 'ok' :
    inspector.result === 'READ_SHARED' ? 'warn' :
    inspector.result === 'WRITE_PRIVATE' ? 'accent' : ''
  }`;
}

function renderAll() {
  updateHeaderCopy();
  renderOperations();
  renderTable(parentTable, parentPages, 'PARENT READY');
  renderTable(childTable, childPages, 'CHILD NOT FORKED');
  renderFrames();
  renderStats();
  renderStatus();
  renderInspector();
}

function stopAuto() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  startBtn.textContent = 'AUTO RUN';
}

function resetSimulation() {
  stopAuto();
  opIndex = 0;
  history = [];
  createBaseState();
  forked = false;
  copyEvents = 0;
  pageFaults = 0;
  lastFault = 'NONE';
  currentEventText = 'BASELINE';
  memoryModeText = 'PRIVATE';
  writeTargetText = '—';
  inspector = { process: '—', page: '—', frame: '—', result: 'READY' };
  terminal.innerHTML = '<div class="log-muted">&gt; copy-on-write monitor ready. add steps from the builder, then run the queue.</div>';
  renderAll();
}

function rebuildSetup() {
  const nextCount = Number(pageCountInput.value);
  if (!Number.isFinite(nextCount) || nextCount < 1 || nextCount > 8) {
    log('Page count must stay between 1 and 8.', 'error');
    return;
  }
  pageCount = nextCount;
  operations = [];
  updatePageOptions();
  updateOperationBuilderState();
  log(`Parent memory image rebuilt with ${pageCount} pages.`, 'success');
  resetSimulation();
}

function addOperation() {
  const type = opTypeSelect.value;
  if (type === 'fork') {
    if (operations.some((operation) => operation.type === 'fork')) {
      log('Only one fork() step is needed in the queue.', 'warn');
      return;
    }
    operations.push({ type: 'fork' });
    log('Queued fork() step.', 'info');
    renderAll();
    return;
  }

  const process = opProcessSelect.value;
  const page = opPageSelect.value;
  operations.push({ type, process, page });
  log(`Queued ${process} ${type} on page ${page}.`, 'info');
  renderAll();
}

function clearOperations() {
  stopAuto();
  operations = [];
  resetSimulation();
}

function loadDefaultFlow() {
  resetSimulation();
  operations = [
    { type: 'fork' },
    { type: 'write', process: 'CHILD', page: pageName(Math.min(1, pageCount - 1)) },
    { type: 'write', process: 'PARENT', page: pageName(Math.min(3, pageCount - 1)) },
    { type: 'read', process: 'CHILD', page: pageName(Math.min(2, pageCount - 1)) },
    { type: 'write', process: 'PARENT', page: pageName(0) }
  ];
  log('Loaded a default COW walkthrough based on the current page count.', 'success');
  renderAll();
}

document.querySelectorAll('.speed-btn').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
    TICK_MS = Number(button.dataset.speed);
    if (autoTimer) {
      stopAuto();
      autoTimer = setInterval(applyOperation, TICK_MS);
      startBtn.textContent = 'PAUSE';
    }
  });
});

opTypeSelect.addEventListener('change', updateOperationBuilderState);
applySetupBtn.addEventListener('click', rebuildSetup);
addOperationBtn.addEventListener('click', addOperation);
loadForkBtn.addEventListener('click', loadDefaultFlow);
clearOpsBtn.addEventListener('click', clearOperations);

startBtn.addEventListener('click', () => {
  if (autoTimer) {
    stopAuto();
    return;
  }
  if (!operations.length) {
    log('Queue at least one operation before starting auto-run.', 'warn');
    return;
  }
  startBtn.textContent = 'PAUSE';
  autoTimer = setInterval(() => {
    if (opIndex >= operations.length) {
      stopAuto();
      return;
    }
    applyOperation();
  }, TICK_MS);
});

stepForwardBtn.addEventListener('click', () => {
  if (!operations.length) {
    log('Queue at least one operation before stepping forward.', 'warn');
    return;
  }
  applyOperation();
});

stepBackBtn.addEventListener('click', () => {
  stopAuto();
  if (!history.length) {
    log('No previous state available.', 'warn');
    return;
  }
  restoreState(history.pop());
});

resetBtn.addEventListener('click', resetSimulation);
clearBtn.addEventListener('click', () => {
  terminal.innerHTML = '<div class="log-muted">&gt; terminal cleared.</div>';
});

updatePageOptions();
updateOperationBuilderState();
resetSimulation();
