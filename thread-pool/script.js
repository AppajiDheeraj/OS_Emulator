/*
Module Name: Thread Pool
Created by: Aadharsh Venkat
File Purpose: Logic for the module
*/

const modes = {
    fixed: {
        title: "Fixed-size pool",
        icon: "view_column",
        subtitle: "Pre-create N workers",
        summary: "A fixed-size thread pool creates a stable number of workers and reuses them for all tasks. It is predictable and avoids creation overhead, but can leave CPUs underused or build a backlog during bursts.",
        notes: [
            ["Queue", "One shared global FIFO queue."],
            ["Pros", "Predictable worker count and no repeated creation or destruction."],
            ["Cons", "Backlog grows when the task stream is larger than the pool."]
        ]
    },
    elastic: {
        title: "Dynamic elastic pool",
        icon: "sync_alt",
        subtitle: "Grow and shrink with load",
        summary: "An elastic pool starts with a baseline worker count, spawns more workers when the queue grows, and removes idle workers after a delay. Hysteresis keeps the pool from constantly creating and killing threads.",
        notes: [
            ["Grow", "Spawn while queue length is above the grow threshold."],
            ["Shrink", "Remove extra idle workers after the idle threshold."],
            ["Stability", "Separate grow and shrink rules reduce oscillation."]
        ]
    }
};

const colors = ["#c00100", "#ff5540", "#8f3b33", "#b06a5f", "#d97757", "#7f4c45", "#e08d7f", "#a9362f", "#b34d40", "#ff7664"];
const state = {
    mode: "fixed",
    taskCount: 0,
    latest: null,
    timers: []
};

const modeGrid = document.getElementById("modeGrid");
const modeInfo = document.getElementById("modeInfo");
const taskRows = document.getElementById("taskRows");
const taskCountInput = document.getElementById("taskCount");
const threadCountInput = document.getElementById("threadCount");
const maxThreadsInput = document.getElementById("maxThreads");
const growThresholdInput = document.getElementById("growThreshold");
const shrinkAfterInput = document.getElementById("shrinkAfter");
const form = document.getElementById("poolForm");
const timelineStage = document.getElementById("timelineStage");
const metrics = document.getElementById("metrics");

function renderModes() {
    modeGrid.innerHTML = Object.entries(modes).map(([key, mode]) => `
        <button class="mode-card ${state.mode === key ? "active" : ""}" type="button" data-mode="${key}">
            <span class="material-symbols-outlined">${mode.icon}</span>
            <strong>${mode.title}</strong>
            <small>${mode.subtitle}</small>
        </button>
    `).join("");
}

function renderInfo() {
    const mode = modes[state.mode];
    modeInfo.innerHTML = `
        <h2>${mode.title}</h2>
        <p>${mode.summary}</p>
        <div class="info-list">
            ${mode.notes.map(([name, text]) => `<div><strong>${name}</strong><span>${text}</span></div>`).join("")}
        </div>
    `;
}

function readTasks({ silent = false } = {}) {
    return [...taskRows.querySelectorAll("tr")].map((row, index) => {
        const arrival = Number(row.querySelector('[data-field="arrival"]').value || 0);
        const duration = Number(row.querySelector('[data-field="duration"]').value || 0);
        if (!silent && (!Number.isInteger(arrival) || arrival < 0 || !Number.isInteger(duration) || duration <= 0)) {
            throw new Error("Task arrival must be 0 or greater, and duration must be a positive whole number.");
        }
        return {
            id: index,
            label: `T${index + 1}`,
            arrival,
            duration,
            remaining: duration,
            start: null,
            finish: null
        };
    });
}

function renderTaskRows() {
    taskCountInput.value = state.taskCount;
    const saved = readTasks({ silent: true });
    taskRows.innerHTML = Array.from({ length: state.taskCount }, (_, index) => {
        const arrival = saved[index]?.arrival ?? 0;
        const duration = saved[index]?.duration ?? 0;
        return `
            <tr>
                <td>T${index + 1}</td>
                <td><input type="number" min="0" step="1" value="${arrival}" data-field="arrival" aria-label="Arrival for T${index + 1}"></td>
                <td><input type="number" min="0" step="1" value="${duration}" data-field="duration" aria-label="Duration for T${index + 1}"></td>
            </tr>
        `;
    }).join("");
}

function pushSegment(worker, label, start, end, taskId = null, kind = "task") {
    if (end <= start) return;
    const last = worker.segments[worker.segments.length - 1];
    if (last && last.label === label && last.taskId === taskId && last.kind === kind && last.end === start) {
        last.end = end;
        return;
    }
    worker.segments.push({ label, start, end, taskId, kind });
}

function makeWorkers(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: index,
        alive: true,
        bornAt: 0,
        task: null,
        idleTicks: 0,
        queue: [],
        segments: []
    }));
}

function allDone(tasks) {
    return tasks.every((task) => task.finish !== null);
}

function sortIncoming(tasks, time) {
    return tasks.filter((task) => task.arrival === time).sort((a, b) => a.id - b.id);
}

function simulateGlobal(tasks, options, elastic = false) {
    const minThreads = options.threadCount;
    const maxThreads = elastic ? options.maxThreads : options.threadCount;
    const workers = makeWorkers(minThreads);
    const queue = [];
    let time = 0;
    let peakQueue = 0;

    while (!allDone(tasks) && time < 300) {
        queue.push(...sortIncoming(tasks, time));
        peakQueue = Math.max(peakQueue, queue.length);

        if (elastic && queue.length > options.growThreshold && workers.length < maxThreads) {
            workers.push({ id: workers.length, alive: true, bornAt: time + 1, task: null, idleTicks: 0, queue: [], segments: [] });
        }

        workers.forEach((worker) => {
            if (!worker.alive || time < worker.bornAt) return;
            if (!worker.task && queue.length) {
                worker.task = queue.shift();
                if (worker.task.start === null) worker.task.start = time;
                worker.idleTicks = 0;
            }
        });

        workers.forEach((worker) => {
            if (!worker.alive) return;
            if (time < worker.bornAt) {
                pushSegment(worker, "spawn", time, time + 1, null, "spawn");
                return;
            }
            if (worker.task) {
                pushSegment(worker, worker.task.label, time, time + 1, worker.task.id);
                worker.task.remaining -= 1;
                if (worker.task.remaining === 0) {
                    worker.task.finish = time + 1;
                    worker.task = null;
                }
            } else {
                pushSegment(worker, "idle", time, time + 1, null, "idle");
                worker.idleTicks += 1;
            }
        });

        if (elastic) {
            for (let i = workers.length - 1; i >= minThreads; i -= 1) {
                const worker = workers[i];
                if (worker.alive && !worker.task && worker.idleTicks >= options.shrinkAfter && queue.length <= Math.max(0, options.growThreshold - 1)) {
                    worker.alive = false;
                    pushSegment(worker, "stop", time + 1, time + 2, null, "spawn");
                    break;
                }
            }
        }

        time += 1;
    }

    return summarize(tasks, workers, peakQueue);
}

function summarize(tasks, workers, peakQueue) {
    const latestSegmentEnd = Math.max(0, ...workers.flatMap((worker) => worker.segments.map((segment) => segment.end)));
    const makespan = Math.max(latestSegmentEnd, ...tasks.map((task) => task.finish ?? 0));
    const avgWait = tasks.length
        ? tasks.reduce((sum, task) => sum + ((task.start ?? task.arrival) - task.arrival), 0) / tasks.length
        : 0;
    return { tasks, workers, makespan, avgWait, peakQueue, peakThreads: workers.length };
}

function getOptions() {
    const threadCount = Number(threadCountInput.value);
    const maxThreads = Number(maxThreadsInput.value);
    const growThreshold = Number(growThresholdInput.value);
    const shrinkAfter = Number(shrinkAfterInput.value);
    if (![threadCount, maxThreads, growThreshold, shrinkAfter].every((value) => Number.isInteger(value) && value > 0)) {
        throw new Error("Pool controls must be positive whole numbers.");
    }
    return {
        threadCount: Math.min(Math.max(threadCount, 1), 8),
        maxThreads: Math.min(Math.max(maxThreads, threadCount), 8),
        growThreshold,
        shrinkAfter
    };
}

function runSimulation() {
    const tasks = readTasks();
    if (!tasks.length) throw new Error("Enter at least one task before simulating.");
    const options = getOptions();
    return simulateGlobal(tasks, options, state.mode === "elastic");
}

function renderMetrics(result) {
    metrics.innerHTML = `
        <div><span>Makespan</span><strong>${result.makespan}</strong></div>
        <div><span>Avg wait</span><strong>${result.avgWait.toFixed(2)}</strong></div>
        <div><span>Peak queue</span><strong>${result.peakQueue}</strong></div>
        <div><span>Peak threads</span><strong>${result.peakThreads}</strong></div>
    `;
}

function clearTimers() {
    state.timers.forEach((timer) => clearTimeout(timer));
    state.timers = [];
}

function renderTimeline(result) {
    clearTimers();
    const total = Math.max(result.makespan, 1);
    timelineStage.innerHTML = result.workers.map((worker) => `
        <div class="lane">
            <div class="lane-label"><span>Worker ${worker.id + 1}</span><span>${worker.alive ? "active" : "retired"}</span></div>
            <div class="lane-track" data-worker="${worker.id}"></div>
        </div>
    `).join("");

    result.workers.forEach((worker, workerIndex) => {
        worker.segments.forEach((segment, segmentIndex) => {
            const timer = setTimeout(() => {
                const track = timelineStage.querySelector(`[data-worker="${worker.id}"]`);
                if (!track) return;
                const width = ((segment.end - segment.start) / total) * 100;
                const color = segment.taskId === null ? "#242424" : colors[segment.taskId % colors.length];
                const block = document.createElement("div");
                block.className = `task-block ${segment.kind}`;
                block.style.width = `${width}%`;
                block.style.background = color;
                block.textContent = segment.label;
                track.appendChild(block);
            }, (segmentIndex + workerIndex) * 220);
            state.timers.push(timer);
        });
    });
}

function renderEmptyOutput() {
    clearTimers();
    state.latest = null;
    timelineStage.innerHTML = '<div class="empty-state">Set tasks and click Simulate.</div>';
    metrics.innerHTML = `
        <div><span>Makespan</span><strong>0</strong></div>
        <div><span>Avg wait</span><strong>0.00</strong></div>
        <div><span>Peak queue</span><strong>0</strong></div>
        <div><span>Peak threads</span><strong>0</strong></div>
    `;
}

function loadExample() {
    const examples = [
        [0, 6],
        [0, 5],
        [0, 7],
        [0, 4],
        [0, 6],
        [1, 3],
        [1, 5],
        [2, 4]
    ];
    state.taskCount = examples.length;
    taskCountInput.value = state.taskCount;
    threadCountInput.value = 3;
    maxThreadsInput.value = 6;
    growThresholdInput.value = 2;
    shrinkAfterInput.value = 3;
    renderTaskRows();
    [...taskRows.querySelectorAll("tr")].forEach((row, index) => {
        row.querySelector('[data-field="arrival"]').value = examples[index][0];
        row.querySelector('[data-field="duration"]').value = examples[index][1];
    });
    renderEmptyOutput();
}

modeGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-mode]");
    if (!card) return;
    state.mode = card.dataset.mode;
    renderModes();
    renderInfo();
    renderEmptyOutput();
});

taskCountInput.addEventListener("input", () => {
    const count = Number(taskCountInput.value);
    if (!Number.isInteger(count)) return;
    state.taskCount = Math.min(Math.max(count, 0), 12);
    renderTaskRows();
    renderEmptyOutput();
});

document.getElementById("loadExample").addEventListener("click", loadExample);
document.getElementById("replay").addEventListener("click", () => {
    if (state.latest) renderTimeline(state.latest);
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
        const result = runSimulation();
        state.latest = result;
        renderMetrics(result);
        renderTimeline(result);
    } catch (error) {
        timelineStage.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
});

renderModes();
renderInfo();
renderTaskRows();
renderEmptyOutput();
