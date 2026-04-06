/*
Module Name: System Calls Simulator - Compact Edition
Created by: Appaji Nagaraja Dheeraj
File Purpose: Compact, efficient system call simulation
*/

// ============ SYSTEM STATE ============
const systemState = {
    processes: [
        { pid: 1, name: 'init', state: 'RUNNING', memory: 2.5 },
        { pid: 2840, name: 'ROOT_DAEMON', state: 'RUNNING', memory: 15.3 }
    ],
    memory: { total: 128, allocated: 35, free: 93 },
    executionCount: 0,
    history: []
};

// ============ SYSCALLS ============
const syscalls = {
    fork: { cat: 'process', desc: 'Create a child process by duplicating the current one.', run: () => ({ ok: true, msg: 'Child process created [PID: ' + (2840 + Math.floor(Math.random() * 100)) + ']' }) },
    exec: { cat: 'process', desc: 'Replace the current process image with a new program.', run: (a) => ({ ok: true, msg: 'Executing: ' + (a || 'program') }) },
    wait: { cat: 'process', desc: 'Block until a child process changes state or exits.', run: () => ({ ok: true, msg: 'Waiting for child process...' }) },
    exit: { cat: 'process', desc: 'Terminate the current process with an exit code.', run: (a) => ({ ok: true, msg: 'Process exiting with code: ' + (a || 0) }) },
    kill: { cat: 'process', desc: 'Send a signal to a target process ID.', run: (a) => ({ ok: true, msg: 'Signal sent to PID: ' + (a || '?') }) },
    getpid: { cat: 'process', desc: 'Return the process ID of the current process.', run: () => ({ ok: true, msg: 'Current PID: 2840' }) },
    
    open: { cat: 'file', desc: 'Open a file and return a file descriptor.', run: (a) => ({ ok: true, msg: 'File opened: ' + (a || 'file') + ' [FD: 3]' }) },
    close: { cat: 'file', desc: 'Close an open file descriptor.', run: (a) => ({ ok: a ? true : false, msg: a ? 'Closed FD ' + a : 'close: invalid FD' }) },
    read: { cat: 'file', desc: 'Read bytes from a file descriptor into a buffer.', run: (a) => ({ ok: true, msg: 'Read ' + Math.floor(Math.random() * 512 + 64) + ' bytes from FD ' + (a || '3') }) },
    write: { cat: 'file', desc: 'Write bytes from a buffer to a file descriptor.', run: (a) => ({ ok: true, msg: 'Wrote ' + (a ? a.length : 12) + ' bytes' }) },
    unlink: { cat: 'file', desc: 'Remove a directory entry for a file.', run: (a) => ({ ok: true, msg: 'File deleted: ' + (a || 'file') }) },
    
    malloc: { cat: 'memory', desc: 'Allocate a block of heap memory.', run: (a) => {
        const sz = parseInt(a) || 10;
        if (sz > systemState.memory.free) return { ok: false, msg: 'malloc: insufficient memory' };
        systemState.memory.allocated += sz;
        systemState.memory.free -= sz;
        return { ok: true, msg: 'Allocated ' + sz + 'MB at 0x' + Math.random().toString(16).slice(2, 8).toUpperCase() };
    }},
    free: { cat: 'memory', desc: 'Release previously allocated heap memory.', run: (a) => {
        const sz = parseInt(a) || 10;
        systemState.memory.allocated = Math.max(0, systemState.memory.allocated - sz);
        systemState.memory.free = systemState.memory.total - systemState.memory.allocated;
        return { ok: true, msg: 'Freed ' + sz + 'MB' };
    }},
    mmap: { cat: 'memory', desc: 'Map files or anonymous pages into process memory.', run: () => ({ ok: true, msg: 'Mapped 4096 bytes at 0x' + Math.random().toString(16).slice(2, 8).toUpperCase() }) },
    brk: { cat: 'memory', desc: 'Change the end of the process data segment.', run: () => ({ ok: true, msg: 'Program break updated' }) },
    
    pipe: { cat: 'ipc', desc: 'Create a unidirectional data channel between processes.', run: () => ({ ok: true, msg: 'Pipe created [FD: 3-4]' }) },
    socket: { cat: 'ipc', desc: 'Create an endpoint for network communication.', run: () => ({ ok: true, msg: 'Socket created [FD: 3]' }) },
    
    ioctl: { cat: 'device', desc: 'Send a device-specific control command to a file descriptor.', run: () => ({ ok: true, msg: 'I/O control completed' }) }
};

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    setupInput();
    renderMemory();
    renderProcesses();
    renderButtons();
    updateSyscallDoc('fork');
    addLog('$ System ready', 'info');
});

// ============ INPUT ============
function setupInput() {
    const input = document.getElementById('syscall-input');

    input.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            execute(e.target.value);
            e.target.value = '';
        }
    });

    input.addEventListener('input', e => {
        const name = e.target.value.trim().split(' ')[0].toLowerCase();
        if (syscalls[name]) {
            updateSyscallDoc(name);
        }
    });
}

function execute(cmd) {
    const parts = cmd.trim().split(' ');
    const name = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    
    if (!cmd.trim()) return;
    addLog('$ ' + cmd, 'input');
    
    if (!syscalls[name]) {
        addLog('Error: unknown system call', 'error');
        return;
    }

    updateSyscallDoc(name);
    
    const result = syscalls[name].run(args);
    if (result.ok) {
        addLog(result.msg, 'output');
        systemState.executionCount++;
    } else {
        addLog(result.msg, 'error');
    }
    
    renderMemory();
    renderProcesses();
    updateFooter();
}

// ============ DISPLAY ============
function addLog(text, type = 'output') {
    const output = document.getElementById('console-output');
    const line = document.createElement('div');
    line.className = 'console-line line-' + type;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function renderMemory() {
    const grid = document.getElementById('memory-grid');
    grid.innerHTML = '';
    const total = systemState.memory.total;
    const used = systemState.memory.allocated;
    
    for (let i = 0; i < 60; i++) {
        const block = document.createElement('div');
        block.className = 'memory-block';
        const percent = (i / 60) * 100;
        const usedPercent = (used / total) * 100;
        
        if (percent < usedPercent * 0.7) {
            block.classList.add('mem-used');
        } else if (percent < usedPercent) {
            block.classList.add('mem-allocated');
        } else {
            block.classList.add('mem-free');
        }
        grid.appendChild(block);
    }
    
    document.getElementById('mem-used').textContent = used.toFixed(1) + 'MB';
    document.getElementById('mem-free').textContent = systemState.memory.free.toFixed(1) + 'MB';
}

function renderProcesses() {
    const list = document.getElementById('process-list');
    list.innerHTML = '';
    
    systemState.processes.slice(0, 5).forEach(p => {
        const item = document.createElement('div');
        item.className = 'process-item';
        item.innerHTML = `<div class="proc-pid">${p.pid}</div><div class="proc-name">${p.name}</div><div class="proc-mem">${p.memory.toFixed(1)}MB</div><div class="proc-status">${p.state}</div>`;
        list.appendChild(item);
    });
    
    document.getElementById('proc-count').textContent = systemState.processes.length;
}

function renderButtons() {
    const grid = document.getElementById('buttons-grid');
    grid.innerHTML = '';
    const common = ['fork', 'exec', 'wait', 'malloc', 'free', 'pipe', 'read', 'write', 'open', 'close'];
    
    common.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'btn-syscall';
        btn.textContent = name + '()';
        btn.onclick = () => {
            document.getElementById('syscall-input').value = name + ' ';
            updateSyscallDoc(name);
            document.getElementById('syscall-input').focus();
        };
        grid.appendChild(btn);
    });
}

function updateSyscallDoc(name) {
    const docName = document.getElementById('doc-name');
    const docDesc = document.getElementById('doc-desc');
    if (!docName || !docDesc) return;

    const call = syscalls[name];
    if (!call) {
        docName.textContent = 'unknown()';
        docDesc.textContent = 'No documentation available for this command.';
        return;
    }

    docName.textContent = name + '()';
    docDesc.textContent = call.desc || 'No description available.';
}

function updateFooter() {
    document.getElementById('exec-count').textContent = 'Executed: ' + systemState.executionCount;
}

// ============ ACTIONS ============
function filterCategory(cat) {
    const grid = document.getElementById('buttons-grid');
    grid.innerHTML = '';
    const filtered = Object.keys(syscalls).filter(k => cat === 'all' || syscalls[k].cat === cat);
    
    filtered.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'btn-syscall';
        btn.textContent = name + '()';
        btn.onclick = () => {
            document.getElementById('syscall-input').value = name + ' ';
            updateSyscallDoc(name);
            document.getElementById('syscall-input').focus();
        };
        grid.appendChild(btn);
    });

    if (filtered.length > 0) {
        updateSyscallDoc(filtered[0]);
    }
}

function clearHistory() {
    document.getElementById('console-output').innerHTML = '';
    addLog('$ History cleared', 'info');
}

function resetKernel() {
    systemState.processes = [
        { pid: 1, name: 'init', state: 'RUNNING', memory: 2.5 },
        { pid: 2840, name: 'ROOT_DAEMON', state: 'RUNNING', memory: 15.3 }
    ];
    systemState.memory = { total: 128, allocated: 35, free: 93 };
    systemState.executionCount = 0;
    document.getElementById('console-output').innerHTML = '';
    addLog('$ System reinitialized', 'info');
    renderMemory();
    renderProcesses();
    updateFooter();
}

function showHelp() {
    addLog('--- QUICK REFERENCE ---', 'info');
    addLog('Process: fork exec wait exit kill getpid', 'info');
    addLog('File: open close read write unlink', 'info');
    addLog('Memory: malloc free mmap brk', 'info');
    addLog('IPC: pipe socket', 'info');
    addLog('Device: ioctl', 'info');
}

function showReference() {
    showHelp();
}
