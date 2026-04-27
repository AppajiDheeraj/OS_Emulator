// 241CS109 — Anirudh Nayak | Module: Fragmentation
//
/* Theory summary:
 Fragmentation happens when memory allocation leaves unusable space behind.
 Internal fragmentation is wasted space inside an allocated block after alignment.
 External fragmentation is free memory split across many holes, so a large request
 can fail even when total free memory is technically sufficient. Compaction reduces
 external fragmentation by regrouping live allocations into a contiguous layout.*/
'use strict';

const LOG_LIMIT = 120;
const DEFAULT_CONFIG = {
  mode: 'external',
  fitAlgorithm: 'first',
  totalMemory: 196,
  reservedMemory: 32,
  blockSize: 16
};

let TICK_MS = 900;
let config = { ...DEFAULT_CONFIG };
let operations = [];
let history = [];
let autoTimer = null;
let segments = [];
let opIndex = 0;
let totalInternal = 0;
let failedRequests = 0;
let compactionSuggested = false;
let nextHoleId = 1;
let lastInspector = { process: '—', requested: '—', allocated: '—', result: 'READY' };

const terminal = document.getElementById('terminal');
const requestList = document.getElementById('request-list');
const memoryMap = document.getElementById('memory-map');
const holeList = document.getElementById('hole-list');
const currentEvent = document.getElementById('current-event');
const largestHoleEl = document.getElementById('largest-hole');
const failedRequestsEl = document.getElementById('failed-requests');
const fragmentationState = document.getElementById('fragmentation-state');
const statUsed = document.getElementById('stat-used');
const statFree = document.getElementById('stat-free');
const statInternal = document.getElementById('stat-internal');
const statExternal = document.getElementById('stat-external');
const inspectProcess = document.getElementById('inspect-process');
const inspectRequested = document.getElementById('inspect-requested');
const inspectAllocated = document.getElementById('inspect-allocated');
const inspectResult = document.getElementById('inspect-result');
const heroDesc = document.getElementById('hero-desc');
const memoryTotal = document.getElementById('memory-total');
const totalMemoryInput = document.getElementById('total-memory-input');
const reservedMemoryInput = document.getElementById('reserved-memory-input');
const modeSelect = document.getElementById('mode-select');
const fitAlgoSelect = document.getElementById('fit-algo-select');
const blockSizeField = document.getElementById('block-size-field');
const blockSizeInput = document.getElementById('block-size-input');
const algoBadge = document.getElementById('algo-badge');
const processIdInput = document.getElementById('process-id-input');
const processLabelInput = document.getElementById('process-label-input');
const requestSizeInput = document.getElementById('request-size-input');
const freeProcessSelect = document.getElementById('free-process-select');
const addAllocBtn = document.getElementById('addAllocBtn');
const addFreeBtn = document.getElementById('addFreeBtn');
const applyMemoryBtn = document.getElementById('applyMemoryBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const startBtn = document.getElementById('startBtn');
const stepForwardBtn = document.getElementById('stepForwardBtn');
const stepBackBtn = document.getElementById('stepBackBtn');
const compactBtn = document.getElementById('compactBtn');
const resetBtn = document.getElementById('resetBtn');
const clearBtn = document.getElementById('clearBtn');

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toLabel(text) {
  return text.replace(/_/g, ' ').toUpperCase();
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

function syncSetupVisibility() {
  const internalMode = modeSelect.value === 'internal';
  blockSizeField.classList.toggle('is-hidden', !internalMode);
  fitAlgoSelect.disabled = internalMode;
  compactBtn.disabled = internalMode;
}

function updateAlgoBadge() {
  if (config.mode === 'internal') {
    algoBadge.textContent = `MODE: INTERNAL · FIXED BLOCK ${config.blockSize} KB · INTERNAL WASTE ONLY`;
    heroDesc.textContent = 'Configure fixed-size memory blocks and inspect how wasted space builds up inside allocated partitions.';
  } else {
    algoBadge.textContent = `MODE: EXTERNAL · ${toLabel(config.fitAlgorithm)} FIT · COMPACTION RECOVERY`;
    heroDesc.textContent = 'Choose a fit policy, allocate variable-sized processes, and inspect how free memory splits into holes.';
  }
}

function createBaseSegments() {
  nextHoleId = 1;
  const segmentsBase = [
    { id: 'OS', label: 'Kernel Image', kind: 'system', size: config.reservedMemory, requested: config.reservedMemory }
  ];
  const usable = config.totalMemory - config.reservedMemory;

  if (config.mode === 'internal') {
    const blockCount = Math.floor(usable / config.blockSize);
    const remainder = usable - (blockCount * config.blockSize);
    for (let index = 0; index < blockCount; index += 1) {
      segmentsBase.push({
        id: `B${index + 1}`,
        label: `Fixed Block ${index + 1}`,
        kind: 'free',
        size: config.blockSize,
        blockId: index + 1
      });
    }
    if (remainder > 0) {
      segmentsBase.push({
        id: 'PAD',
        label: 'Allocator Padding',
        kind: 'system',
        size: remainder,
        requested: remainder
      });
    }
    return segmentsBase;
  }

  segmentsBase.push({ id: `H${nextHoleId++}`, label: 'Free Hole', kind: 'free', size: usable });
  return segmentsBase;
}

function memoryTotals() {
  const used = segments.filter((segment) => segment.kind !== 'free')
    .reduce((sum, segment) => sum + segment.size, 0);
  const free = segments.filter((segment) => segment.kind === 'free')
    .reduce((sum, segment) => sum + segment.size, 0);
  const holes = segments.filter((segment) => segment.kind === 'free').map((segment) => segment.size);
  return { used, free, largestHole: holes.length ? Math.max(...holes) : 0 };
}

function computeExternalFragmentation() {
  if (config.mode === 'internal') return 0;
  const holes = segments.filter((segment) => segment.kind === 'free');
  if (holes.length <= 1) return 0;
  const total = holes.reduce((sum, segment) => sum + segment.size, 0);
  const largest = Math.max(...holes.map((segment) => segment.size));
  return total - largest;
}

function mergeFreeSegments() {
  if (config.mode === 'internal') return;

  const merged = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'free' && segment.kind === 'free') {
      last.size += segment.size;
    } else {
      merged.push(segment);
    }
  }
  segments = merged.map((segment) => (
    segment.kind === 'free'
      ? { ...segment, id: `H${nextHoleId++}`, label: 'Free Hole' }
      : segment
  ));
}

function residentProcessIds() {
  return segments
    .filter((segment) => segment.kind === 'used')
    .map((segment) => segment.id);
}

function knownQueueAllocations() {
  const active = new Set(residentProcessIds());
  operations.slice(opIndex).forEach((operation) => {
    if (operation.type === 'alloc') {
      active.add(operation.processId);
    } else {
      active.delete(operation.processId);
    }
  });
  return Array.from(active);
}

function updateFreeSelect() {
  const ids = knownQueueAllocations();
  freeProcessSelect.innerHTML = '';
  if (!ids.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No process available';
    freeProcessSelect.appendChild(option);
    return;
  }

  ids.forEach((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    freeProcessSelect.appendChild(option);
  });
}

function pickHoleIndex(sizeNeeded) {
  const candidates = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.kind === 'free' && segment.size >= sizeNeeded);

  if (!candidates.length) return -1;

  switch (config.fitAlgorithm) {
    case 'best':
      return candidates.reduce((best, current) => (
        current.segment.size < best.segment.size ? current : best
      )).index;
    case 'worst':
      return candidates.reduce((worst, current) => (
        current.segment.size > worst.segment.size ? current : worst
      )).index;
    case 'last':
      return candidates[candidates.length - 1].index;
    default:
      return candidates[0].index;
  }
}

function saveState() {
  history.push({
    segments: deepClone(segments),
    opIndex,
    totalInternal,
    failedRequests,
    compactionSuggested,
    nextHoleId,
    lastInspector: { ...lastInspector },
    currentEventText: currentEvent.textContent,
    fragmentationText: fragmentationState.textContent,
    fragmentationClass: fragmentationState.className,
    terminalHTML: terminal.innerHTML
  });
}

function restoreState(snapshot) {
  segments = deepClone(snapshot.segments);
  opIndex = snapshot.opIndex;
  totalInternal = snapshot.totalInternal;
  failedRequests = snapshot.failedRequests;
  compactionSuggested = snapshot.compactionSuggested;
  nextHoleId = snapshot.nextHoleId;
  lastInspector = { ...snapshot.lastInspector };
  currentEvent.textContent = snapshot.currentEventText;
  fragmentationState.textContent = snapshot.fragmentationText;
  fragmentationState.className = snapshot.fragmentationClass;
  terminal.innerHTML = snapshot.terminalHTML;
  renderAll();
}

function allocateInternal(operation) {
  const freeIndex = segments.findIndex((segment) => segment.kind === 'free');
  const blockSize = config.blockSize;

  lastInspector = {
    process: operation.processId,
    requested: `${operation.requested} KB`,
    allocated: `${blockSize} KB`,
    result: 'PENDING'
  };

  if (operation.requested > blockSize) {
    failedRequests += 1;
    lastInspector.result = 'BLOCK_TOO_SMALL';
    currentEvent.textContent = `ALLOC ${operation.processId} FAILED`;
    fragmentationState.textContent = 'INTERNAL';
    fragmentationState.className = 'status-value warn';
    log(`${operation.processId} requested ${operation.requested} KB, but fixed block size is only ${blockSize} KB.`, 'warn');
    return;
  }

  if (freeIndex === -1) {
    failedRequests += 1;
    lastInspector.result = 'OUT_OF_BLOCKS';
    currentEvent.textContent = `ALLOC ${operation.processId} FAILED`;
    fragmentationState.textContent = 'SATURATED';
    fragmentationState.className = 'status-value accent';
    log(`${operation.processId} could not be placed because no fixed block is free.`, 'error');
    return;
  }

  const freeBlock = segments[freeIndex];
  totalInternal += blockSize - operation.requested;
  segments[freeIndex] = {
    id: operation.processId,
    label: operation.label,
    kind: 'used',
    size: blockSize,
    requested: operation.requested,
    blockId: freeBlock.blockId
  };
  lastInspector.result = 'ALLOCATED';
  currentEvent.textContent = `ALLOC ${operation.processId}`;
  log(`${operation.processId} claimed block B${freeBlock.blockId}. Internal waste: ${blockSize - operation.requested} KB.`, 'success');
}

function allocateExternal(operation) {
  const sizeNeeded = operation.requested;
  const holeIndex = pickHoleIndex(sizeNeeded);

  lastInspector = {
    process: operation.processId,
    requested: `${operation.requested} KB`,
    allocated: `${sizeNeeded} KB`,
    result: 'PENDING'
  };

  if (holeIndex === -1) {
    failedRequests += 1;
    const totalFree = segments.filter((segment) => segment.kind === 'free')
      .reduce((sum, segment) => sum + segment.size, 0);
    const reason = totalFree >= sizeNeeded ? 'BLOCKED_BY_EXTERNAL' : 'OUT_OF_MEMORY';
    compactionSuggested = totalFree >= sizeNeeded;
    lastInspector.result = reason;
    currentEvent.textContent = `ALLOC ${operation.processId} FAILED`;
    fragmentationState.textContent = compactionSuggested ? 'SEVERE' : 'SATURATED';
    fragmentationState.className = `status-value ${compactionSuggested ? 'warn' : 'accent'}`;
    log(
      `${operation.processId} request for ${sizeNeeded} KB failed. ${compactionSuggested ? 'Free memory exists, but the chosen holes are too fragmented.' : 'Free memory is exhausted.'}`,
      compactionSuggested ? 'warn' : 'error'
    );
    return;
  }

  const hole = segments[holeIndex];
  const remainder = hole.size - sizeNeeded;
  segments.splice(
    holeIndex,
    1,
    { id: operation.processId, label: operation.label, kind: 'used', size: sizeNeeded, requested: operation.requested },
    ...(remainder > 0 ? [{ id: `H${nextHoleId++}`, label: 'Free Hole', kind: 'free', size: remainder }] : [])
  );

  lastInspector.result = 'ALLOCATED';
  currentEvent.textContent = `ALLOC ${operation.processId}`;
  log(`${operation.processId} allocated ${sizeNeeded} KB using ${toLabel(config.fitAlgorithm)} fit.`, 'success');
}

function allocateProcess(operation) {
  if (config.mode === 'internal') {
    allocateInternal(operation);
  } else {
    allocateExternal(operation);
  }
}

function freeProcess(operation) {
  const targetIndex = segments.findIndex((segment) => segment.id === operation.processId);
  if (targetIndex === -1) {
    lastInspector = {
      process: operation.processId,
      requested: '—',
      allocated: '—',
      result: 'NOT_FOUND'
    };
    currentEvent.textContent = `FREE ${operation.processId} SKIPPED`;
    log(`${operation.processId} was not resident in memory.`, 'warn');
    return;
  }

  const target = segments[targetIndex];
  if (config.mode === 'internal') {
    segments[targetIndex] = {
      id: `B${target.blockId}`,
      label: `Fixed Block ${target.blockId}`,
      kind: 'free',
      size: config.blockSize,
      blockId: target.blockId
    };
  } else {
    segments[targetIndex] = {
      id: `H${nextHoleId++}`,
      label: 'Free Hole',
      kind: 'free',
      size: target.size
    };
    mergeFreeSegments();
  }

  lastInspector = {
    process: operation.processId,
    requested: `${target.requested || target.size} KB`,
    allocated: `${target.size} KB`,
    result: 'RELEASED'
  };
  currentEvent.textContent = `FREE ${operation.processId}`;
  log(`${operation.processId} released ${target.size} KB back to the allocator.`, 'info');
}

function compactMemory() {
  if (config.mode === 'internal') {
    log('Compaction is disabled in internal mode because fixed blocks do not use hole merging.', 'warn');
    return;
  }

  const freeTotal = segments.filter((segment) => segment.kind === 'free')
    .reduce((sum, segment) => sum + segment.size, 0);

  if (!freeTotal) {
    log('Compaction skipped. No free holes available.', 'warn');
    return;
  }

  saveState();
  const active = segments.filter((segment) => segment.kind !== 'free');
  segments = [
    ...active,
    { id: `H${nextHoleId++}`, label: 'Compacted Free Hole', kind: 'free', size: freeTotal }
  ];
  compactionSuggested = false;
  currentEvent.textContent = 'COMPACTION COMPLETE';
  fragmentationState.textContent = 'RECOVERED';
  fragmentationState.className = 'status-value ok';
  lastInspector = {
    process: 'SYSTEM',
    requested: '—',
    allocated: `${freeTotal} KB`,
    result: 'COMPACTED'
  };
  log(`Compaction regrouped live allocations and created one contiguous ${freeTotal} KB hole.`, 'success');
  renderAll();
}

function applyOperation() {
  if (opIndex >= operations.length) {
    log('No pending requests remain.', 'info');
    stopAuto();
    return;
  }

  saveState();
  const operation = operations[opIndex];
  if (operation.type === 'alloc') {
    allocateProcess(operation);
  } else {
    freeProcess(operation);
  }
  opIndex += 1;
  renderAll();
}

function renderQueue() {
  requestList.innerHTML = '';
  if (!operations.length) {
    requestList.innerHTML = '<div class="request-card"><div class="request-meta">Build a queue with alloc/free requests to start the simulator.</div></div>';
    return;
  }

  operations.forEach((operation, index) => {
    const card = document.createElement('div');
    const classes = ['request-card'];
    if (index < opIndex) classes.push('done');
    if (index === opIndex) classes.push('active');
    if (index === opIndex - 1 && ['BLOCKED_BY_EXTERNAL', 'BLOCK_TOO_SMALL'].includes(lastInspector.result) && operation.type === 'alloc') {
      classes.push('failed');
    }
    card.className = classes.join(' ');

    const action = operation.type === 'alloc' ? `ALLOC ${operation.processId}` : `FREE ${operation.processId}`;
    const detail = operation.type === 'alloc'
      ? `${operation.label} · ${operation.requested} KB request`
      : 'Release target process';

    card.innerHTML = `
      <div class="request-head">
        <div class="request-id">${action}</div>
        <span class="chip ${index < opIndex ? 'ok' : index === opIndex ? 'warn' : ''}">${index < opIndex ? 'DONE' : index === opIndex ? 'NEXT' : 'PENDING'}</span>
      </div>
      <div class="request-meta">${detail}</div>
      <div class="request-note">STEP ${index + 1}</div>
    `;
    requestList.appendChild(card);
  });
}

function renderMemoryMap() {
  memoryMap.innerHTML = '';
  segments.forEach((segment) => {
    const el = document.createElement('div');
    const segmentType = segment.kind === 'free' ? 'free' : (segment.kind === 'system' ? 'system' : 'user');
    const waste = segment.kind === 'used' ? Math.max(0, segment.size - segment.requested) : 0;
    el.className = `memory-segment ${segmentType}`;
    el.innerHTML = `
      <div class="segment-head">
        <div>
          <div class="segment-label">${segment.id} · ${segment.label}</div>
          <div class="segment-meta">${segment.size} KB ${segment.kind === 'free' ? (config.mode === 'internal' ? 'fixed free block' : 'contiguous hole') : 'resident block'}</div>
        </div>
        <span class="memory-tag ${segmentType}">${segmentType.toUpperCase()}</span>
      </div>
      <div class="segment-meta">
        ${segment.kind === 'used'
          ? `requested ${segment.requested} KB · internal waste ${config.mode === 'internal' ? waste : 0} KB`
          : (segment.kind === 'system'
            ? 'reserved for kernel / allocator overhead'
            : (config.mode === 'internal' ? 'available fixed-size partition' : 'available for selected fit algorithm'))}
      </div>
    `;
    memoryMap.appendChild(el);
  });
}

function renderHoles() {
  holeList.innerHTML = '';
  const freeSegments = segments.filter((segment) => segment.kind === 'free');
  if (!freeSegments.length) {
    holeList.innerHTML = '<div class="hole-card"><div class="hole-meta">No free regions remain.</div></div>';
    return;
  }

  freeSegments.forEach((segment, index) => {
    const label = config.mode === 'internal' ? `BLOCK_${index + 1}` : `HOLE_${index + 1}`;
    const text = config.mode === 'internal'
      ? `${segment.size} KB fixed block available for the next valid process.`
      : `${segment.size} KB contiguous region available for placement.`;
    const el = document.createElement('div');
    el.className = 'hole-card';
    el.innerHTML = `
      <div class="hole-head">
        <div class="hole-id">${label}</div>
        <span class="chip">${segment.size} KB</span>
      </div>
      <div class="hole-meta">${text}</div>
    `;
    holeList.appendChild(el);
  });
}

function renderStats() {
  const totals = memoryTotals();
  const external = computeExternalFragmentation();
  memoryTotal.textContent = `${config.totalMemory} KB TOTAL`;
  statUsed.textContent = `${totals.used} KB`;
  statFree.textContent = `${totals.free} KB`;
  statInternal.textContent = `${config.mode === 'internal' ? totalInternal : 0} KB`;
  statExternal.textContent = `${config.mode === 'external' ? external : 0} KB`;
  largestHoleEl.textContent = `${totals.largestHole} KB`;
  failedRequestsEl.textContent = String(failedRequests);

  if (!failedRequests && !compactionSuggested) {
    const stateText = config.mode === 'internal' ? 'INTERNAL' : (external > 0 ? 'BUILDING' : 'STABLE');
    fragmentationState.textContent = stateText;
    fragmentationState.className = `status-value ${config.mode === 'internal' ? 'warn' : (external > 0 ? 'warn' : 'ok')}`;
  }
}

function renderInspector() {
  inspectProcess.textContent = lastInspector.process;
  inspectRequested.textContent = lastInspector.requested;
  inspectAllocated.textContent = lastInspector.allocated;
  inspectResult.textContent = lastInspector.result;
  inspectResult.className = `inspector-value ${
    ['ALLOCATED', 'COMPACTED', 'RELEASED'].includes(lastInspector.result)
      ? 'ok'
      : (['BLOCKED_BY_EXTERNAL', 'BLOCK_TOO_SMALL'].includes(lastInspector.result) ? 'warn' : (['OUT_OF_MEMORY', 'OUT_OF_BLOCKS'].includes(lastInspector.result) ? 'accent' : ''))
  }`;
}

function renderAll() {
  updateAlgoBadge();
  renderQueue();
  renderMemoryMap();
  renderHoles();
  renderStats();
  renderInspector();
  updateFreeSelect();
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
  history = [];
  segments = createBaseSegments();
  opIndex = 0;
  totalInternal = 0;
  failedRequests = 0;
  compactionSuggested = false;
  lastInspector = { process: '—', requested: '—', allocated: '—', result: 'READY' };
  currentEvent.textContent = 'READY';
  fragmentationState.textContent = config.mode === 'internal' ? 'INTERNAL' : 'STABLE';
  fragmentationState.className = 'status-value accent';
  terminal.innerHTML = `<div class="log-muted">&gt; fragmentation monitor online. ${config.mode === 'internal' ? 'internal mode uses fixed blocks.' : 'build a queue, then step through holes.'}</div>`;
  renderAll();
}

function validateMemoryConfig() {
  const mode = modeSelect.value;
  const fitAlgorithm = fitAlgoSelect.value;
  const total = Number(totalMemoryInput.value);
  const reserved = Number(reservedMemoryInput.value);
  const blockSize = Number(blockSizeInput.value);

  if (!Number.isFinite(total) || !Number.isFinite(reserved) || total <= reserved || total < 32 || reserved < 4) {
    log('Invalid memory setup. Total memory must be greater than reserved memory.', 'error');
    return null;
  }

  if (mode === 'internal' && (!Number.isFinite(blockSize) || blockSize < 4)) {
    log('Internal mode needs a valid block size of at least 4 KB.', 'error');
    return null;
  }

  return {
    mode,
    fitAlgorithm,
    totalMemory: total,
    reservedMemory: reserved,
    blockSize: blockSize || DEFAULT_CONFIG.blockSize
  };
}

function addAllocationRequest() {
  const processId = processIdInput.value.trim().toUpperCase();
  const label = processLabelInput.value.trim() || processId;
  const requested = Number(requestSizeInput.value);
  const activeIds = new Set(knownQueueAllocations());

  if (!processId || processId === 'OS') {
    log('Choose a valid process id before queuing an allocation.', 'warn');
    return;
  }
  if (activeIds.has(processId)) {
    log(`Process ${processId} is already allocated or queued. Use a new id or free it first.`, 'warn');
    return;
  }
  if (!Number.isFinite(requested) || requested <= 0) {
    log('Allocation size must be a positive number.', 'warn');
    return;
  }

  operations.push({ type: 'alloc', processId, label, requested });
  processIdInput.value = `P${operations.filter((operation) => operation.type === 'alloc').length + 1}`;
  processLabelInput.value = '';
  requestSizeInput.value = '8';
  log(`Queued allocation for ${processId} requesting ${requested} KB.`, 'info');
  renderAll();
}

function addFreeRequest() {
  const processId = freeProcessSelect.value;
  if (!processId) {
    log('No process is available to queue for release.', 'warn');
    return;
  }

  operations.push({ type: 'free', processId });
  log(`Queued release request for ${processId}.`, 'info');
  renderAll();
}

function clearQueue() {
  stopAuto();
  operations = [];
  resetSimulation();
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

modeSelect.addEventListener('change', syncSetupVisibility);

applyMemoryBtn.addEventListener('click', () => {
  const nextConfig = validateMemoryConfig();
  if (!nextConfig) return;
  config = nextConfig;
  operations = [];
  syncSetupVisibility();
  log(
    config.mode === 'internal'
      ? `Internal mode ready with ${config.blockSize} KB fixed blocks.`
      : `${toLabel(config.fitAlgorithm)} fit enabled for external fragmentation mode.`,
    'success'
  );
  resetSimulation();
});

clearQueueBtn.addEventListener('click', clearQueue);
addAllocBtn.addEventListener('click', addAllocationRequest);
addFreeBtn.addEventListener('click', addFreeRequest);

startBtn.addEventListener('click', () => {
  if (autoTimer) {
    stopAuto();
    return;
  }
  if (!operations.length) {
    log('Queue at least one request before starting auto-run.', 'warn');
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
    log('Queue at least one request before stepping forward.', 'warn');
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

compactBtn.addEventListener('click', compactMemory);
resetBtn.addEventListener('click', resetSimulation);
clearBtn.addEventListener('click', () => {
  terminal.innerHTML = '<div class="log-muted">&gt; terminal cleared.</div>';
});

syncSetupVisibility();
updateAlgoBadge();
resetSimulation();
