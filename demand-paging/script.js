/* (241CS107) Amisha Vidya Diwakar | Module: Demand Paging */

function run() {

    let framesCount = Number(document.getElementById("frames").value);
    let ref = document.getElementById("refString").value
        .split(",")
        .map(x => Number(x.trim()))
        .filter(x => !isNaN(x));

    if (!framesCount || ref.length === 0) {
        alert("Enter valid input");
        return;
    }

    let table = document.getElementById("table");
    table.innerHTML = "";

    let frames = [];
    let faults = 0;
    let hits = 0;

    // Header
    let header = document.createElement("tr");
    let blank = document.createElement("th");
    blank.innerText = "";
    header.appendChild(blank);

    ref.forEach(r => {
        let th = document.createElement("th");
        th.innerText = r;
        header.appendChild(th);
    });

    table.appendChild(header);

   
    let rows = [];
    for (let i = 0; i < framesCount; i++) {
        let tr = document.createElement("tr");

        let label = document.createElement("td");
        label.innerText = "Frame " + (i + 1);
        tr.appendChild(label);

        rows.push(tr);
        table.appendChild(tr);
    }

    let step = 0;

    function animate() {

        if (step >= ref.length) return;

        let page = ref[step];
        let isHit = frames.includes(page);

        document.getElementById("currentPage").innerText =
            "Processing Page: " + page;

        if (isHit) {
            hits++;
            document.getElementById("explanation").innerText =
                "Page " + page + " already in memory → HIT";
        } else {
            faults++;
            document.getElementById("explanation").innerText =
                "Page " + page + " not in memory → PAGE FAULT";

            if (frames.length < framesCount) {
                frames.push(page);
            } else {
                frames.shift();
                frames.push(page);
            }
        }

        document.getElementById("faults").innerText =
            "Page Faults: " + faults;

        document.getElementById("hits").innerText =
            "Page Hits: " + hits;

        
        for (let i = 0; i < framesCount; i++) {
            let cell = document.createElement("td");

            if (frames[i] !== undefined) {
                cell.innerText = frames[i];
            }

            if (!isHit && i === frames.length - 1) {
                cell.classList.add("fault");
            }

            if (isHit && frames[i] === page) {
                cell.classList.add("hit");
            }

            rows[i].appendChild(cell);
        }

        step++;
        setTimeout(animate, 700);
    }

    animate();
}