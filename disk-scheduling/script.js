/* (241CS107) Amisha Vidya Diwakar | Module: Demand Paging */



function toggleInputs() {
    let algo = document.getElementById("algo").value;
    let directionBlock = document.getElementById("directionBlock");

    if (["SCAN", "C-SCAN", "LOOK", "C-LOOK"].includes(algo)) {
        directionBlock.style.display = "block";
    } else {
        directionBlock.style.display = "none";
    }
}



function parseInput() {
    return {
        queue: document.getElementById("queue").value
            .split(",")
            .map(x => Number(x.trim()))
            .filter(x => !isNaN(x)),

        head: Number(document.getElementById("head").value),
        diskSize: Number(document.getElementById("diskSize").value),
        direction: document.getElementById("direction").value,
        algo: document.getElementById("algo").value
    };
}



function run() {
    let data = parseInput();

    if (!data.algo) return alert("Select algorithm");
    if (!data.head || !data.diskSize || data.queue.length === 0)
        return alert("Fill all inputs");

    let result;

    switch (data.algo) {
        case "FCFS": result = fcfs(data); break;
        case "SSTF": result = sstf(data); break;
        case "SCAN": result = scan(data); break;
        case "C-SCAN": result = cscan(data); break;
        case "LOOK": result = look(data); break;
        case "C-LOOK": result = clook(data); break;
    }

    document.getElementById("sequence").innerText =
        data.head + " → " + result.sequence.join(" → ");

    document.getElementById("seek").innerText = result.seek;

    drawGraph(result.sequence, data.head, data.diskSize);
}



function fcfs({queue, head}) {
    let seek = 0, current = head;
    queue.forEach(q => {
        seek += Math.abs(current - q);
        current = q;
    });
    return {sequence: queue, seek};
}

function sstf({queue, head}) {
    let seek = 0, current = head, visited = [];

    while (queue.length) {
        let closest = queue.reduce((a, b) =>
            Math.abs(a - current) < Math.abs(b - current) ? a : b
        );
        seek += Math.abs(current - closest);
        current = closest;
        visited.push(closest);
        queue = queue.filter(x => x !== closest);
    }

    return {sequence: visited, seek};
}

function scan({queue, head, diskSize, direction}) {
    let left = queue.filter(x => x < head).sort((a,b)=>b-a);
    let right = queue.filter(x => x >= head).sort((a,b)=>a-b);

    let seek = 0, seq = [], current = head;

    if (direction === "left") {
        left.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });

        seek += current;
        current = 0;
        seq.push(0);

        right.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });

    } else {
        right.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });

        seek += Math.abs(current - (diskSize - 1));
        current = diskSize - 1;
        seq.push(current);

        left.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });
    }

    return {sequence: seq, seek};
}

function cscan({queue, head, diskSize, direction}) {
    let left = queue.filter(x => x < head).sort((a,b)=>a-b);
    let right = queue.filter(x => x >= head).sort((a,b)=>a-b);

    let seek = 0, seq = [], current = head;

    if (direction === "right") {
        right.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });

        seek += Math.abs(current - (diskSize - 1));
        current = diskSize - 1;
        seq.push(current);

        seek += (diskSize - 1);
        current = 0;
        seq.push(0);

        left.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });

    } else {
        left.reverse().forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });

        seek += current;
        current = 0;
        seq.push(0);

        seek += (diskSize - 1);
        current = diskSize - 1;
        seq.push(current);

        right.reverse().forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });
    }

    return {sequence: seq, seek};
}

function look({queue, head, direction}) {
    let left = queue.filter(x => x < head).sort((a,b)=>b-a);
    let right = queue.filter(x => x >= head).sort((a,b)=>a-b);

    let seek = 0, seq = [], current = head;

    if (direction === "right") {
        right.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });
        left.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });
    } else {
        left.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });
        right.forEach(i => { seek += Math.abs(current-i); current=i; seq.push(i); });
    }

    return {sequence: seq, seek};
}


function clook({queue, head, direction}) {
    let left = queue.filter(x => x < head).sort((a,b)=>a-b);
    let right = queue.filter(x => x >= head).sort((a,b)=>a-b);

    let seek = 0, seq = [], current = head;

    if (direction === "right") {

        right.forEach(i => {
            seek += Math.abs(current - i);
            current = i;
            seq.push(i);
        });

        if (left.length) {
            let jump = left[0];
            seek += Math.abs(current - jump);
            current = jump;
            seq.push(current);
        }

        for (let i = 1; i < left.length; i++) {
            let val = left[i];
            seek += Math.abs(current - val);
            current = val;
            seq.push(val);
        }

    } else {

        let leftDesc = left.slice().reverse();

        leftDesc.forEach(i => {
            seek += Math.abs(current - i);
            current = i;
            seq.push(i);
        });

        if (right.length) {
            let jump = right[right.length - 1];
            seek += Math.abs(current - jump);
            current = jump;
            seq.push(current); 
        }

        for (let i = right.length - 2; i >= 0; i--) {
            let val = right[i];
            seek += Math.abs(current - val);
            current = val;
            seq.push(val);
        }
    }

    return {sequence: seq, seek};
}


function drawGraph(sequence, head, diskSize) {
    const canvas = document.getElementById("diskCanvas");
    const ctx = canvas.getContext("2d");

    let full = [head, ...sequence];

    let pad = 50;
    let w = canvas.width - 2 * pad;
    let h = canvas.height - 2 * pad;

    let step = 0;

    function drawAxes() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "#888";

        ctx.beginPath();
        ctx.moveTo(pad, canvas.height - pad);
        ctx.lineTo(canvas.width - pad, canvas.height - pad);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, canvas.height - pad);
        ctx.stroke();
    }

    function plotNext() {
        if (step > full.length) return;

        drawAxes();

        ctx.strokeStyle = "#ff2d2d";
        ctx.beginPath();

        for (let i = 0; i < step; i++) {
            let x = pad + (full[i] / diskSize) * w;
            let y = pad + (i * (h / (full.length - 1)));

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();

        for (let i = 0; i < step; i++) {
            let x = pad + (full[i] / diskSize) * w;
            let y = pad + (i * (h / (full.length - 1)));

            ctx.fillStyle = "#00ffcc";
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#fff";
            ctx.fillText(full[i], x - 10, y - 10);
        }

        step++;
        setTimeout(plotNext, 500);
    }

    plotNext();
}