/*
Module Name: CPU Scheduling
Created by: Aadharsh Venkat
File Purpose: Logic for the module
*/

const algorithms = {
    sjfNon: {
        title: "SJF",
        mode: "Non-preemptive",
        icon: "short_text",
        needsPriority: false,
        needsQueue: false,
        summary: "Shortest Job First selects the arrived process with the smallest burst time and lets it finish before switching.",
        levels: []
    },
    sjfPre: {
        title: "SJF",
        mode: "Preemptive",
        icon: "timer",
        needsPriority: false,
        needsQueue: false,
        summary: "Preemptive SJF, also called Shortest Remaining Time First, runs the arrived process with the least remaining burst at every time unit.",
        levels: []
    },
    mlqNon: {
        title: "MLQ",
        mode: "Non-preemptive",
        icon: "account_tree",
        needsPriority: true,
        needsQueue: true,
        summary: "Multi Level Queue separates processes into fixed queues. Queue 0 is always checked before Queue 1; in non-preemptive mode, the chosen process runs to completion.",
        levels: [
            ["Queue 0", "Priority scheduling. Smaller priority value means higher priority."],
            ["Queue 1", "FCFS scheduling. Processes run by earliest arrival time."],
            ["Between queues", "Queue 0 has strict priority over Queue 1."]
        ]
    },
    mlqPre: {
        title: "MLQ",
        mode: "Preemptive",
        icon: "schema",
        needsPriority: true,
        needsQueue: true,
        summary: "Preemptive Multi Level Queue checks the highest available queue at every time unit. Queue 0 priority work can interrupt Queue 1 work.",
        levels: [
            ["Queue 0", "Preemptive priority scheduling. Smaller priority value runs first."],
            ["Queue 1", "Preemptive FCFS-style selection by earliest arrival among ready processes."],
            ["Between queues", "Queue 0 is always selected before Queue 1 when ready."]
        ]
    },
    mlfq: {
        title: "MLFQ",
        mode: "Feedback queue",
        icon: "low_priority",
        needsPriority: false,
        needsQueue: false,
        summary: "Multi Level Feedback Queue starts every process in the top queue. If a process uses its full quantum, it moves down to a lower queue.",
        levels: [
            ["Level 1", "Round Robin with time quantum 2."],
            ["Level 2", "Round Robin with time quantum 4."],
            ["Level 3", "FCFS behavior, executed one time unit at a time."]
        ]
    }
};

const colors = ["#c00100", "#ff5540", "#8f3b33", "#b06a5f", "#d97757", "#7f4c45", "#e08d7f", "#a9362f"];
const state = {
    selected: "sjfNon",
    processCount: 0,
    latestResult: null,
    animationTimers: []
};

const algorithmGrid = document.getElementById("algorithmGrid");
const algorithmInfo = document.getElementById("algorithmInfo");
const inputHeader = document.getElementById("inputHeader");
const processRows = document.getElementById("processRows");
const processCountInput = document.getElementById("processCount");
const form = document.getElementById("schedulerForm");
const ganttTrack = document.getElementById("ganttTrack");
const ganttScale = document.getElementById("ganttScale");
const currentTime = document.getElementById("currentTime");
const averages = document.getElementById("averages");
const resultHeader = document.getElementById("resultHeader");
const resultRows = document.getElementById("resultRows");

function renderAlgorithms() {
    algorithmGrid.innerHTML = Object.entries(algorithms).map(([key, algorithm]) => `
        <button class="algorithm-card ${key === state.selected ? "active" : ""}" type="button" data-algorithm="${key}">
            <span class="material-symbols-outlined">${algorithm.icon}</span>
            <strong>${algorithm.title}</strong>
            <small>${algorithm.mode}</small>
        </button>
    `).join("");
}

function renderInfo() {
    const algorithm = algorithms[state.selected];
    const levels = algorithm.levels.length
        ? `<div class="level-list">${algorithm.levels.map(([name, detail]) => `
            <div class="level-card">
                <strong>${name}</strong>
                <span>${detail}</span>
            </div>
        `).join("")}</div>`
        : "";

    algorithmInfo.innerHTML = `
        <h2>${algorithm.title} ${algorithm.mode}</h2>
        <p>${algorithm.summary}</p>
        ${levels}
    `;
}

function renderInputs() {
    const algorithm = algorithms[state.selected];
    processCountInput.value = state.processCount;
    inputHeader.innerHTML = `
        <th>Process</th>
        <th>Arrival Time</th>
        <th>Burst Time</th>
        ${algorithm.needsPriority ? "<th>Priority</th>" : ""}
        ${algorithm.needsQueue ? "<th>Queue</th>" : ""}
    `;

    const existingRows = getProcesses({ silent: true });
    processRows.innerHTML = Array.from({ length: state.processCount }, (_, index) => {
        const saved = existingRows[index] || {};
        const arrival = saved.arrival ?? 0;
        const burst = saved.burst ?? 0;
        const priority = saved.priority ?? 0;
        const queue = saved.queue ?? 0;

        return `
            <tr>
                <td>P${index + 1}</td>
                <td><input type="number" min="0" step="1" value="${arrival}" data-field="arrival" aria-label="Arrival time for P${index + 1}"></td>
                <td><input type="number" min="0" step="1" value="${burst}" data-field="burst" aria-label="Burst time for P${index + 1}"></td>
                ${algorithm.needsPriority ? `<td><input type="number" min="0" step="1" value="${priority}" data-field="priority" aria-label="Priority for P${index + 1}"></td>` : ""}
                ${algorithm.needsQueue ? `<td>
                    <select data-field="queue" aria-label="Queue for P${index + 1}">
                        <option value="0" ${queue === 0 ? "selected" : ""}>Queue 0</option>
                        <option value="1" ${queue === 1 ? "selected" : ""}>Queue 1</option>
                    </select>
                </td>` : ""}
            </tr>
        `;
    }).join("");
}

function getProcesses(options = {}) {
    const rows = [...processRows.querySelectorAll("tr")];
    return rows.map((row, index) => {
        const read = (field) => row.querySelector(`[data-field="${field}"]`);
        const process = {
            id: index,
            label: `P${index + 1}`,
            arrival: Number(read("arrival")?.value ?? index),
            burst: Number(read("burst")?.value ?? 1),
            priority: Number(read("priority")?.value ?? 0),
            queue: Number(read("queue")?.value ?? 0)
        };

        if (!options.silent && (!Number.isInteger(process.arrival) || process.arrival < 0 || !Number.isInteger(process.burst) || process.burst <= 0)) {
            throw new Error("Arrival times must be 0 or more, and burst times must be positive whole numbers.");
        }

        return process;
    });
}

function pushSegment(segments, label, start, end, id = null, queue = null) {
    if (end <= start) return;
    const last = segments[segments.length - 1];
    if (last && last.label === label && last.id === id && last.queue === queue && last.end === start) {
        last.end = end;
        return;
    }
    segments.push({ label, start, end, id, queue });
}

function calculateMetrics(processes, completionTimes, segments) {
    const rows = processes.map((process) => {
        const completion = completionTimes[process.id];
        const turnaround = completion - process.arrival;
        const waiting = turnaround - process.burst;
        return { ...process, completion, turnaround, waiting };
    });
    const avgTat = rows.reduce((sum, row) => sum + row.turnaround, 0) / rows.length;
    const avgWt = rows.reduce((sum, row) => sum + row.waiting, 0) / rows.length;
    return { rows, avgTat, avgWt, segments };
}

function simulateSjfNon(processes) {
    const done = Array(processes.length).fill(false);
    const completionTimes = Array(processes.length).fill(0);
    const segments = [];
    let time = 0;
    let completed = 0;

    while (completed < processes.length) {
        let idx = -1;
        let shortest = Infinity;
        processes.forEach((process, i) => {
            if (process.arrival <= time && !done[i] && process.burst < shortest) {
                shortest = process.burst;
                idx = i;
            }
        });

        if (idx === -1) {
            pushSegment(segments, "IDLE", time, time + 1);
            time += 1;
            continue;
        }

        const start = time;
        time += processes[idx].burst;
        pushSegment(segments, processes[idx].label, start, time, idx);
        completionTimes[idx] = time;
        done[idx] = true;
        completed += 1;
    }

    return calculateMetrics(processes, completionTimes, segments);
}

function simulateSjfPre(processes) {
    const remaining = processes.map((process) => process.burst);
    const completionTimes = Array(processes.length).fill(0);
    const segments = [];
    let time = 0;
    let completed = 0;

    while (completed < processes.length) {
        let idx = -1;
        let shortest = Infinity;
        processes.forEach((process, i) => {
            if (process.arrival <= time && remaining[i] > 0 && remaining[i] < shortest) {
                shortest = remaining[i];
                idx = i;
            }
        });

        if (idx === -1) {
            pushSegment(segments, "IDLE", time, time + 1);
            time += 1;
            continue;
        }

        remaining[idx] -= 1;
        pushSegment(segments, processes[idx].label, time, time + 1, idx);
        time += 1;

        if (remaining[idx] === 0) {
            completionTimes[idx] = time;
            completed += 1;
        }
    }

    return calculateMetrics(processes, completionTimes, segments);
}

function pickMlqProcess(processes, time, doneOrRemaining, preemptive) {
    let idx = -1;
    let bestPriority = Infinity;
    processes.forEach((process, i) => {
        const isReady = process.arrival <= time && process.queue === 0;
        const canRun = preemptive ? doneOrRemaining[i] > 0 : !doneOrRemaining[i];
        if (isReady && canRun) {
            if (process.priority < bestPriority || (process.priority === bestPriority && (idx === -1 || process.arrival < processes[idx].arrival))) {
                bestPriority = process.priority;
                idx = i;
            }
        }
    });

    if (idx !== -1) return idx;

    let earliestArrival = Infinity;
    processes.forEach((process, i) => {
        const isReady = process.arrival <= time && process.queue === 1;
        const canRun = preemptive ? doneOrRemaining[i] > 0 : !doneOrRemaining[i];
        if (isReady && canRun && process.arrival < earliestArrival) {
            earliestArrival = process.arrival;
            idx = i;
        }
    });

    return idx;
}

function simulateMlqNon(processes) {
    const done = Array(processes.length).fill(false);
    const completionTimes = Array(processes.length).fill(0);
    const segments = [];
    let time = 0;
    let completed = 0;

    while (completed < processes.length) {
        const idx = pickMlqProcess(processes, time, done, false);

        if (idx === -1) {
            pushSegment(segments, "IDLE", time, time + 1);
            time += 1;
            continue;
        }

        const start = time;
        time += processes[idx].burst;
        pushSegment(segments, processes[idx].label, start, time, idx, processes[idx].queue);
        completionTimes[idx] = time;
        done[idx] = true;
        completed += 1;
    }

    return calculateMetrics(processes, completionTimes, segments);
}

function simulateMlqPre(processes) {
    const remaining = processes.map((process) => process.burst);
    const completionTimes = Array(processes.length).fill(0);
    const segments = [];
    let time = 0;
    let completed = 0;

    while (completed < processes.length) {
        const idx = pickMlqProcess(processes, time, remaining, true);

        if (idx === -1) {
            pushSegment(segments, "IDLE", time, time + 1);
            time += 1;
            continue;
        }

        remaining[idx] -= 1;
        pushSegment(segments, processes[idx].label, time, time + 1, idx, processes[idx].queue);
        time += 1;

        if (remaining[idx] === 0) {
            completionTimes[idx] = time;
            completed += 1;
        }
    }

    return calculateMetrics(processes, completionTimes, segments);
}

function simulateMlfq(processes) {
    const remaining = processes.map((process) => process.burst);
    const queues = Array(processes.length).fill(1);
    const completionTimes = Array(processes.length).fill(0);
    const segments = [];
    const tq1 = 2;
    const tq2 = 4;
    let time = 0;
    let completed = 0;

    while (completed < processes.length) {
        let found = false;

        for (let i = 0; i < processes.length; i += 1) {
            if (processes[i].arrival <= time && remaining[i] > 0 && queues[i] === 1) {
                const slice = Math.min(remaining[i], tq1);
                remaining[i] -= slice;
                pushSegment(segments, processes[i].label, time, time + slice, i, 1);
                time += slice;
                if (remaining[i] === 0) {
                    completionTimes[i] = time;
                    completed += 1;
                } else {
                    queues[i] = 2;
                }
                found = true;
                break;
            }
        }

        if (found) continue;

        for (let i = 0; i < processes.length; i += 1) {
            if (processes[i].arrival <= time && remaining[i] > 0 && queues[i] === 2) {
                const slice = Math.min(remaining[i], tq2);
                remaining[i] -= slice;
                pushSegment(segments, processes[i].label, time, time + slice, i, 2);
                time += slice;
                if (remaining[i] === 0) {
                    completionTimes[i] = time;
                    completed += 1;
                } else {
                    queues[i] = 3;
                }
                found = true;
                break;
            }
        }

        if (found) continue;

        for (let i = 0; i < processes.length; i += 1) {
            if (processes[i].arrival <= time && remaining[i] > 0 && queues[i] === 3) {
                remaining[i] -= 1;
                pushSegment(segments, processes[i].label, time, time + 1, i, 3);
                time += 1;
                if (remaining[i] === 0) {
                    completionTimes[i] = time;
                    completed += 1;
                }
                found = true;
                break;
            }
        }

        if (!found) {
            pushSegment(segments, "IDLE", time, time + 1);
            time += 1;
        }
    }

    return calculateMetrics(processes, completionTimes, segments);
}

function runSimulation(processes) {
    const runners = {
        sjfNon: simulateSjfNon,
        sjfPre: simulateSjfPre,
        mlqNon: simulateMlqNon,
        mlqPre: simulateMlqPre,
        mlfq: simulateMlfq
    };
    return runners[state.selected](processes);
}

function renderResults(result) {
    const algorithm = algorithms[state.selected];
    resultHeader.innerHTML = `
        <tr>
            <th>Process</th>
            <th>AT</th>
            <th>BT</th>
            ${algorithm.needsQueue ? "<th>Queue</th>" : ""}
            ${algorithm.needsPriority ? "<th>Priority</th>" : ""}
            <th>CT</th>
            <th>TAT</th>
            <th>WT</th>
        </tr>
    `;
    resultRows.innerHTML = result.rows.map((row) => `
        <tr>
            <td>${row.label}</td>
            <td>${row.arrival}</td>
            <td>${row.burst}</td>
            ${algorithm.needsQueue ? `<td>${row.queue}</td>` : ""}
            ${algorithm.needsPriority ? `<td>${row.priority}</td>` : ""}
            <td>${row.completion}</td>
            <td>${row.turnaround}</td>
            <td>${row.waiting}</td>
        </tr>
    `).join("");

    averages.innerHTML = `
        <div>
            <span>Average TAT</span>
            <strong>${result.avgTat.toFixed(2)}</strong>
        </div>
        <div>
            <span>Average WT</span>
            <strong>${result.avgWt.toFixed(2)}</strong>
        </div>
    `;
}

function clearAnimationTimers() {
    state.animationTimers.forEach((timer) => clearTimeout(timer));
    state.animationTimers = [];
}

function renderGantt(result) {
    clearAnimationTimers();
    ganttTrack.innerHTML = '<div class="empty-state">Timeline is starting...</div>';
    ganttScale.innerHTML = "";
    currentTime.textContent = "0";

    const totalTime = Math.max(...result.segments.map((segment) => segment.end), 1);
    ganttTrack.style.minWidth = `${Math.max(520, totalTime * 34)}px`;
    const visibleSegments = [];

    result.segments.forEach((segment, index) => {
        const timer = setTimeout(() => {
            visibleSegments.push(segment);
            ganttTrack.innerHTML = visibleSegments.map((item) => {
                const width = ((item.end - item.start) / totalTime) * 100;
                const color = item.id === null ? "#242424" : colors[item.id % colors.length];
                const queueLabel = item.queue ? `Q${item.queue}` : `${item.start}-${item.end}`;
                return `
                    <div class="gantt-block ${item.id === null ? "idle" : ""}" style="width:${width}%; background:${color};">
                        ${item.label}
                        <small>${queueLabel}</small>
                    </div>
                `;
            }).join("");
            currentTime.textContent = segment.end;
        }, index * 620);
        state.animationTimers.push(timer);
    });

    ganttScale.innerHTML = `<span>0</span><span>${totalTime}</span>`;
}

function loadExample() {
    const examples = [
        { arrival: 0, burst: 7, priority: 2, queue: 0 },
        { arrival: 2, burst: 4, priority: 1, queue: 1 },
        { arrival: 4, burst: 5, priority: 3, queue: 0 },
        { arrival: 5, burst: 3, priority: 2, queue: 1 }
    ];

    state.processCount = 4;
    renderInputs();
    [...processRows.querySelectorAll("tr")].forEach((row, index) => {
        const sample = examples[index];
        row.querySelector('[data-field="arrival"]').value = sample.arrival;
        row.querySelector('[data-field="burst"]').value = sample.burst;
        const priority = row.querySelector('[data-field="priority"]');
        const queue = row.querySelector('[data-field="queue"]');
        if (priority) priority.value = sample.priority;
        if (queue) queue.value = sample.queue;
    });
}

function simulateFromForm() {
    try {
        const processes = getProcesses();
        if (!processes.length) {
            throw new Error("Enter at least one process before simulating.");
        }
        const result = runSimulation(processes);
        state.latestResult = result;
        renderResults(result);
        renderGantt(result);
    } catch (error) {
        alert(error.message);
    }
}

function renderEmptyOutput() {
    clearAnimationTimers();
    state.latestResult = null;
    currentTime.textContent = "0";
    ganttTrack.style.minWidth = "";
    ganttTrack.innerHTML = '<div class="empty-state">Set process values and click Simulate.</div>';
    ganttScale.innerHTML = "<span>0</span><span>0</span>";
    averages.innerHTML = `
        <div>
            <span>Average TAT</span>
            <strong>0.00</strong>
        </div>
        <div>
            <span>Average WT</span>
            <strong>0.00</strong>
        </div>
    `;
    resultHeader.innerHTML = "";
    resultRows.innerHTML = "";
}

algorithmGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-algorithm]");
    if (!card) return;
    state.selected = card.dataset.algorithm;
    renderAlgorithms();
    renderInfo();
    renderInputs();
    renderEmptyOutput();
});

processCountInput.addEventListener("input", () => {
    const count = Number(processCountInput.value);
    if (!Number.isInteger(count)) return;
    state.processCount = Math.min(Math.max(count, 0), 8);
    renderInputs();
    renderEmptyOutput();
});

document.getElementById("loadExample").addEventListener("click", () => {
    loadExample();
    simulateFromForm();
});

document.getElementById("replayGantt").addEventListener("click", () => {
    if (state.latestResult) renderGantt(state.latestResult);
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    simulateFromForm();
});

renderAlgorithms();
renderInfo();
renderInputs();
renderEmptyOutput();
