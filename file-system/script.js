/*
Module Name: File System
Created by: Aditya Gayan
File Purpose: Directory structure simulator logic
*/

const modes = {
  single: {
    badge: "SINGLE_LEVEL_DIRECTORY",
    title: "Single Level",
    summary: "One global directory stores every file. It is simple, but names must be unique across the whole system.",
    rules: ["No subdirectories", "Global file names", "Fast lookup, poor grouping"],
    caption: "ROOT contains every file entry."
  },
  two: {
    badge: "TWO_LEVEL_DIRECTORY",
    title: "Two Level",
    summary: "Each user receives a private directory below the master file directory, so the same file name can exist under different users.",
    rules: ["Master File Directory", "One User File Directory per user", "No nested user folders"],
    caption: "MFD separates files into user-owned directories."
  },
  tree: {
    badge: "TREE_STRUCTURED_DIRECTORY",
    title: "Tree Structured",
    summary: "Directories can contain files and child directories, creating absolute paths from root to every entry.",
    rules: ["Hierarchical paths", "Each entry has one parent", "No sharing cycles"],
    caption: "A rooted hierarchy gives every entry a unique path."
  },
  dag: {
    badge: "DIRECTED_ACYCLIC_GRAPH_DIRECTORY",
    title: "DAG Directory",
    summary: "Entries can be shared through links, but cycles are blocked so traversal remains finite and predictable.",
    rules: ["Shared files/directories", "Multiple incoming references", "Cycle creation rejected"],
    caption: "Shared links are allowed only when they do not form cycles."
  },
  general: {
    badge: "GENERAL_GRAPH_DIRECTORY",
    title: "General Graph",
    summary: "Links may point anywhere, including ancestors. This is flexible, but the system must detect revisits while traversing.",
    rules: ["Arbitrary links", "Cycles allowed", "Traversal needs visited-node checks"],
    caption: "Cycles are valid here, so repeated nodes are flagged."
  }
};

let selectedMode = "single";
let nodes = [];
let edges = [];
let nextId = 1;
let logLines = [];

const modeGrid = document.getElementById("mode-grid");
const modeBadge = document.getElementById("mode-badge");
const modeSummary = document.getElementById("mode-summary");
const ruleList = document.getElementById("rule-list");
const operationForm = document.getElementById("operation-form");
const operationType = document.getElementById("operation-type");
const entryName = document.getElementById("entry-name");
const entryNameField = document.getElementById("entry-name-field");
const parentField = document.getElementById("parent-field");
const parentSelect = document.getElementById("parent-select");
const targetField = document.getElementById("target-field");
const targetSelect = document.getElementById("target-select");
const nodeLayer = document.getElementById("node-layer");
const edgeLayer = document.getElementById("edge-layer");
const terminal = document.getElementById("terminal");
const pathTable = document.getElementById("path-table");
const graphCaption = document.getElementById("graph-caption");

function makeNode(name, type, owner = "") {
  const node = { id: `n${nextId++}`, name, type, owner };
  nodes.push(node);
  return node;
}

function connect(from, to, kind = "contains", alias = "") {
  edges.push({ from, to, kind, alias });
}

function rootNode() {
  return nodes[0];
}

function getNode(id) {
  return nodes.find((node) => node.id === id);
}

function directoryNodes(forOperation = operationType.value) {
  const dirs = nodes.filter((node) => node.type === "dir" || node.type === "root" || node.type === "user");
  if (selectedMode === "two" && forOperation !== "delete") {
    return dirs.filter((node) => node.type === "user");
  }
  return dirs;
}

function targetNodes() {
  return nodes.filter((node) => node.id !== rootNode().id);
}

function cleanName(value) {
  return value.trim().replace(/[\\/]/g, "").replace(/\s+/g, "_");
}

function log(message, type = "") {
  logLines.unshift({ message, type });
  logLines = logLines.slice(0, 8);
  renderLog();
}

function resetModel(silent = false) {
  nodes = [];
  edges = [];
  nextId = 1;
  logLines = [];
  const root = makeNode(selectedMode === "two" ? "MFD" : "ROOT", "root");

  if (selectedMode === "two") {
    ["alice", "bob"].forEach((user) => {
      const userDir = makeNode(user, "user", user);
      connect(root.id, userDir.id);
    });
  }

  if (!silent) log(`${modes[selectedMode].title} model initialized.`, "ok");
  renderAll();
}

function renderModes() {
  modeGrid.innerHTML = "";
  Object.entries(modes).forEach(([key, mode]) => {
    const button = document.createElement("button");
    button.className = `mode-card ${key === selectedMode ? "active" : ""}`;
    button.type = "button";
    button.dataset.mode = key;
    button.innerHTML = `<strong>${mode.title}</strong><span>${mode.badge}</span>`;
    modeGrid.appendChild(button);
  });
}

function renderInfo() {
  const mode = modes[selectedMode];
  modeBadge.textContent = mode.badge;
  modeSummary.textContent = mode.summary;
  graphCaption.textContent = mode.caption;
  ruleList.innerHTML = "";
  mode.rules.forEach((rule) => {
    const item = document.createElement("div");
    item.className = "rule-item";
    item.textContent = rule;
    ruleList.appendChild(item);
  });
}

function renderControls() {
  const type = operationType.value;
  const canCreateDirectory = !["single", "two"].includes(selectedMode);
  const canLink = ["dag", "general"].includes(selectedMode);

  operationType.querySelector('option[value="directory"]').disabled = !canCreateDirectory;
  operationType.querySelector('option[value="link"]').disabled = !canLink;
  if ((type === "directory" && !canCreateDirectory) || (type === "link" && !canLink)) {
    operationType.value = "file";
  }

  entryNameField.hidden = operationType.value === "delete";
  parentField.hidden = operationType.value === "delete";
  targetField.hidden = operationType.value !== "link" && operationType.value !== "delete";

  parentSelect.innerHTML = "";
  directoryNodes().forEach((node) => {
    const option = document.createElement("option");
    option.value = node.id;
    option.textContent = node.name;
    parentSelect.appendChild(option);
  });

  targetSelect.innerHTML = "";
  targetNodes().forEach((node) => {
    const option = document.createElement("option");
    option.value = node.id;
    option.textContent = `${node.name} (${node.type})`;
    targetSelect.appendChild(option);
  });
}

function duplicateName(parentId, name) {
  return edges
    .filter((edge) => edge.from === parentId)
    .some((edge) => (edge.kind === "link" ? edge.alias : getNode(edge.to)?.name) === name);
}

function createsCycle(from, to) {
  const stack = [to];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    edges.filter((edge) => edge.from === current).forEach((edge) => stack.push(edge.to));
  }
  return false;
}

function applyCreate(type) {
  const name = cleanName(entryName.value);
  const parentId = parentSelect.value;
  if (!name) {
    log("create rejected: entry name is required.", "bad");
    return;
  }
  if (duplicateName(parentId, name)) {
    log(`create rejected: ${name} already exists in ${getNode(parentId).name}.`, "bad");
    return;
  }
  const node = makeNode(name, type === "directory" ? "dir" : "file");
  connect(parentId, node.id);
  log(`${type === "directory" ? "mkdir" : "create"} ${pathTo(node.id)} completed.`, "ok");
}

function applyLink() {
  const alias = cleanName(entryName.value) || `link_${targetSelect.value}`;
  const parentId = parentSelect.value;
  const targetId = targetSelect.value;
  if (!targetId) {
    log("link rejected: no target entry selected.", "bad");
    return;
  }
  if (duplicateName(parentId, alias)) {
    log(`link rejected: ${alias} already exists in ${getNode(parentId).name}.`, "bad");
    return;
  }
  if (selectedMode === "dag" && createsCycle(parentId, targetId)) {
    log("link rejected: DAG directory cannot contain cycles.", "bad");
    return;
  }
  connect(parentId, targetId, "link", alias);
  log(`link ${getNode(parentId).name}/${alias} -> ${getNode(targetId).name} added.`, selectedMode === "general" && createsCycle(parentId, targetId) ? "warn" : "ok");
}

function applyDelete() {
  const targetId = targetSelect.value;
  if (!targetId) {
    log("delete rejected: no entry selected.", "bad");
    return;
  }
  const target = getNode(targetId);
  edges = edges.filter((edge) => edge.to !== targetId && edge.from !== targetId);
  nodes = nodes.filter((node) => node.id !== targetId);
  log(`delete ${target.name} removed the entry and its references.`, "warn");
}

function pathTo(id, seen = new Set()) {
  const node = getNode(id);
  if (!node) return "/";
  if (node === rootNode()) return `/${node.name}`;
  if (seen.has(id)) return `${node.name}/*cycle*`;
  seen.add(id);
  const parentEdge = edges.find((edge) => edge.to === id && edge.kind === "contains");
  if (!parentEdge) return `/${node.name}`;
  return `${pathTo(parentEdge.from, seen)}/${node.name}`;
}

function depthMap() {
  const levels = new Map([[rootNode().id, 0]]);
  const queue = [rootNode().id];
  while (queue.length) {
    const id = queue.shift();
    const level = levels.get(id);
    edges.filter((edge) => edge.from === id).forEach((edge) => {
      if (!levels.has(edge.to)) {
        levels.set(edge.to, level + 1);
        queue.push(edge.to);
      }
    });
  }
  return levels;
}

function layoutNodes() {
  const levels = depthMap();
  nodes.forEach((node) => {
    if (!levels.has(node.id)) levels.set(node.id, 1);
  });
  const grouped = {};
  nodes.forEach((node) => {
    const level = Math.min(levels.get(node.id), 4);
    grouped[level] = grouped[level] || [];
    grouped[level].push(node);
  });
  Object.entries(grouped).forEach(([levelText, group]) => {
    const level = Number(levelText);
    group.forEach((node, index) => {
      node.x = 80 + (index + 1) * (760 / (group.length + 1));
      node.y = 68 + level * 104;
    });
  });
}

function renderGraph() {
  layoutNodes();
  edgeLayer.innerHTML = "";
  nodeLayer.innerHTML = "";

  edges.forEach((edge) => {
    const from = getNode(edge.from);
    const to = getNode(edge.to);
    if (!from || !to) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const curve = edge.kind === "link" ? 36 : 0;
    line.setAttribute("d", `M ${from.x} ${from.y + 24} C ${from.x} ${from.y + 62 + curve}, ${to.x} ${to.y - 62 - curve}, ${to.x} ${to.y - 24}`);
    line.setAttribute("class", `edge ${edge.kind}`);
    edgeLayer.appendChild(line);
  });

  nodes.forEach((node) => {
    const el = document.createElement("div");
    el.className = `fs-node ${node.type}`;
    el.style.left = `${(node.x / 900) * 100}%`;
    el.style.top = `${(node.y / 520) * 100}%`;
    el.innerHTML = `<span>${node.type.toUpperCase()}</span><strong></strong><small></small>`;
    el.querySelector("strong").textContent = node.name;
    el.querySelector("small").textContent = pathTo(node.id);
    nodeLayer.appendChild(el);
  });
}

function hasCycle() {
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const edge of edges.filter((item) => item.from === id)) {
      if (visit(edge.to)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return nodes.some((node) => visit(node.id));
}

function renderStats() {
  document.getElementById("stat-directories").textContent = nodes.filter((node) => node.type !== "file").length;
  document.getElementById("stat-files").textContent = nodes.filter((node) => node.type === "file").length;
  document.getElementById("stat-links").textContent = edges.filter((edge) => edge.kind === "link").length;
  const state = selectedMode === "general" && hasCycle() ? "CYCLIC" : "VALID";
  const stateEl = document.getElementById("stat-state");
  stateEl.textContent = state;
  stateEl.className = state === "CYCLIC" ? "warn" : "";
}

function renderPaths() {
  pathTable.innerHTML = "";
  nodes.forEach((node) => {
    const row = document.createElement("div");
    row.className = "path-row";
    row.innerHTML = `<span></span><strong></strong>`;
    row.querySelector("span").textContent = node.type.toUpperCase();
    row.querySelector("strong").textContent = pathTo(node.id);
    pathTable.appendChild(row);
  });
  edges.filter((edge) => edge.kind === "link").forEach((edge) => {
    const row = document.createElement("div");
    row.className = "path-row link-path";
    row.innerHTML = `<span></span><strong></strong>`;
    row.querySelector("span").textContent = "LINK";
    row.querySelector("strong").textContent = `${pathTo(edge.from)}/${edge.alias} -> ${getNode(edge.to)?.name || "missing"}`;
    pathTable.appendChild(row);
  });
}

function renderLog() {
  terminal.innerHTML = "";
  if (!logLines.length) {
    terminal.innerHTML = '<div class="log-muted">&gt; file system monitor ready.</div>';
    return;
  }
  logLines.forEach((line) => {
    const row = document.createElement("div");
    row.className = `log-line ${line.type}`;
    row.textContent = `> ${line.message}`;
    terminal.appendChild(row);
  });
}

function renderAll() {
  renderModes();
  renderInfo();
  renderControls();
  renderGraph();
  renderStats();
  renderPaths();
  renderLog();
}

function loadDemo() {
  resetModel(true);
  if (selectedMode === "single") {
    ["boot.ini", "report.txt", "index.db"].forEach((name) => {
      const file = makeNode(name, "file");
      connect(rootNode().id, file.id);
    });
  } else if (selectedMode === "two") {
    const alice = nodes.find((node) => node.name === "alice");
    const bob = nodes.find((node) => node.name === "bob");
    ["notes.txt", "shell.c"].forEach((name) => connect(alice.id, makeNode(name, "file").id));
    ["notes.txt", "data.csv"].forEach((name) => connect(bob.id, makeNode(name, "file").id));
  } else {
    const home = makeNode("home", "dir");
    const usr = makeNode("usr", "dir");
    const bin = makeNode("bin", "dir");
    const readme = makeNode("readme.md", "file");
    const shell = makeNode("shell", "file");
    connect(rootNode().id, home.id);
    connect(rootNode().id, usr.id);
    connect(usr.id, bin.id);
    connect(home.id, readme.id);
    connect(bin.id, shell.id);
    if (selectedMode === "dag" || selectedMode === "general") connect(home.id, bin.id, "link");
    if (selectedMode === "general") connect(bin.id, home.id, "link");
  }
  log(`${modes[selectedMode].title} demo loaded.`, "ok");
  renderAll();
}

modeGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".mode-card");
  if (!card) return;
  selectedMode = card.dataset.mode;
  resetModel();
});

operationType.addEventListener("change", renderControls);

operationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (operationType.value === "file" || operationType.value === "directory") applyCreate(operationType.value);
  if (operationType.value === "link") applyLink();
  if (operationType.value === "delete") applyDelete();
  renderAll();
});

document.getElementById("demo-btn").addEventListener("click", loadDemo);
document.getElementById("reset-btn").addEventListener("click", () => resetModel());
document.getElementById("clear-log-btn").addEventListener("click", () => {
  logLines = [];
  renderLog();
});

resetModel(true);
log("file system monitor online.", "ok");
