import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAIL, COURSE } from "./config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

// Report sections with the word ranges from the brief.
const SECTIONS = [
  { id: "intro", name: "Introduction and context", words: [200, 250] },
  { id: "q1", name: "Q1 Organisational level", words: [650, 700] },
  { id: "q2", name: "Q2 Group level", words: [500, 550] },
  { id: "q3", name: "Q3 Individual level", words: [500, 550] },
  { id: "q4", name: "Q4 Recommendations and roadmap", words: [800, 850] },
  { id: "concl", name: "Conclusion", words: [150, 200] },
  { id: "research", name: "Research and data collection" },
  { id: "pres", name: "Formative presentation" },
  { id: "final", name: "Formatting and submission" }
];
const WRITING = SECTIONS.filter(s => s.words).map(s => s.id);
const STATUSES = [
  { id: "todo", name: "To do" },
  { id: "doing", name: "In progress" },
  { id: "review", name: "Review" },
  { id: "done", name: "Done" }
];

const SEED = [
  ["research", "Select a real organisation in Uzbekistan and agree access"],
  ["research", "Collect public information on the organisation and sector"],
  ["research", "Literature search beyond the core sources (peer-reviewed, recent reports)"],
  ["research", "Interview guide and interviews with employees and managers"],
  ["research", "Survey design, distribution and results"],
  ["research", "Observational data notes"],
  ["intro", "Draft: Introduction and organisation context"],
  ["q1", "Draft: Q1 Organisational-level impact"],
  ["q2", "Draft: Q2 Group-level impact"],
  ["q3", "Draft: Q3 Individual-level impact"],
  ["q4", "Draft: Q4 Recommendations and roadmap"],
  ["concl", "Draft: Conclusion"],
  ["pres", "Formative presentation slides"],
  ["pres", "Presentation rehearsal"],
  ["final", "Sign the Learning Contract (Appendix I)"],
  ["final", "Cover sheet, contents page, page numbers"],
  ["final", "APA references and in-text citations check"],
  ["final", "Word count check (2,700 to 3,300)"],
  ["final", "Final edit for one voice and consistency"],
  ["final", "AI-use declaration, if required by WIUT"],
  ["final", "Submit on WIUT intranet / Turnitin by 04.11.2026 23:59"]
];

// Suggested plan from today to the deadline. A task belongs to the first phase whose test matches.
const PHASES = [
  { id: "p1", name: "Kick-off", from: "2026-10-07", to: "2026-10-12",
    goal: "Sign the Learning Contract, choose the organisation, start reading.",
    test: x => /learning contract|select a real organisation|literature/i.test(x.title) },
  { id: "p2", name: "Collect evidence", from: "2026-10-12", to: "2026-10-20",
    goal: "Interviews, survey, observation and public data on the organisation.",
    test: x => x.section === "research" },
  { id: "p3", name: "Write drafts", from: "2026-10-19", to: "2026-10-27",
    goal: "Each member drafts their section within its word range.",
    test: x => WRITING.includes(x.section) },
  { id: "p4", name: "Formative presentation", from: "2026-10-20", to: "2026-10-24",
    goal: "Slides and rehearsal. Check the presentation date with the lecturer.",
    test: x => x.section === "pres" },
  { id: "p5", name: "Finalise and submit", from: "2026-10-28", to: "2026-11-04",
    goal: "References, word count, formatting, final edit, submission by 23:59.",
    test: () => true }
];
const phaseOf = x => PHASES.find(p => p.test(x));

const state = {
  user: null, role: null, roles: null, tab: "roadmap", filter: { phase: "all", owner: "all" }, seeding: false,
  tasks: [], contributions: [], meetings: [], issues: [], activity: [],
  unsub: [], dataOn: false, error: ""
};

const $app = document.getElementById("app");
const $user = document.getElementById("user-box");
const $modal = document.getElementById("modal");
const $form = document.getElementById("modal-form");
document.getElementById("course-line").textContent = `${COURSE.code} ${COURSE.title}`;

// ---------- helpers ----------
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toLocaleDateString("en-CA");
const me = () => (state.user?.email || "").toLowerCase();
const canEdit = () => state.role === "admin" || state.role === "member";
const people = () => state.roles?.people || [];
const nameOf = email => people().find(p => p.email === email)?.name || email || "Unassigned";
const sectionName = id => SECTIONS.find(s => s.id === id)?.name || id;
const statusName = id => STATUSES.find(s => s.id === id)?.name || id;
const fmtTime = ts => ts?.toDate ? ts.toDate().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "";
const stamp = () => ({ updatedBy: me(), updatedAt: serverTimestamp() });

async function log(action, what) {
  try {
    await addDoc(collection(db, "activity"), { who: me(), action, what: String(what).slice(0, 300), at: serverTimestamp() });
  } catch (e) { console.warn("activity log failed", e); }
}

function fail(e) {
  console.error(e);
  alert(`Could not save: ${e.code || e.message}`);
}

function openModal(html) {
  $form.innerHTML = html;
  $modal.returnValue = "";
  $modal.showModal();
  return new Promise(resolve => {
    $modal.onclose = () => {
      if ($modal.returnValue !== "save") return resolve(null);
      resolve(Object.fromEntries(new FormData($form).entries()));
    };
  });
}
const modalActions = `<div class="actions"><button class="btn ghost" value="cancel" formnovalidate>Cancel</button><button class="btn" value="save">Save</button></div>`;

// ---------- auth ----------
async function completeEmailLink() {
  if (!isSignInWithEmailLink(auth, location.href)) return;
  let email = null;
  try { email = localStorage.getItem("cw-email"); } catch (e) { /* storage blocked */ }
  if (!email) email = prompt("Confirm your email to finish signing in");
  if (!email) return;
  try {
    await signInWithEmailLink(auth, email, location.href);
    try { localStorage.removeItem("cw-email"); } catch (e) { /* ignore */ }
  } catch (e) {
    state.error = `Sign-in link failed: ${e.code || e.message}`;
  }
  history.replaceState(null, "", location.pathname);
}

function renderSignIn() {
  $user.innerHTML = "";
  $app.innerHTML = `
    <section class="card" style="max-width:460px;margin:40px auto">
      <h2>Sign in</h2>
      <p class="muted small">Group members and the module lecturer only. Your email must be on the team list.</p>
      ${state.error ? `<p class="notice warn">${esc(state.error)}</p>` : ""}
      <button class="btn" data-act="google" style="width:100%">Continue with Google</button>
      <p class="muted small center" style="margin:14px 0 4px">or get a sign-in link by email</p>
      <div class="row"><input id="link-email" type="email" placeholder="you@example.com" style="flex:1"><button class="btn ghost" data-act="send-link">Send link</button></div>
      <p class="muted small" id="link-msg"></p>
    </section>`;
}

onAuthStateChanged(auth, user => {
  state.unsub.forEach(u => u());
  state.unsub = [];
  state.dataOn = false;
  state.user = user;
  state.role = null;
  state.roles = null;
  if (!user) return renderSignIn();
  $user.innerHTML = `<span class="email">${esc(user.email)}</span><button class="btn ghost" data-act="signout">Sign out</button>`;
  if (me() === ADMIN_EMAIL.toLowerCase()) state.role = "admin";
  state.unsub.push(onSnapshot(doc(db, "config", "roles"), snap => {
    state.roles = snap.exists() ? snap.data() : { memberEmails: [], viewerEmails: [], people: [] };
    if (state.role !== "admin") {
      state.role = state.roles.memberEmails.includes(me()) ? "member"
        : state.roles.viewerEmails.includes(me()) ? "viewer" : null;
    }
    if (state.role) startData();
    render();
  }, () => { state.role = null; renderNoAccess(); }));
});

function renderNoAccess() {
  $app.innerHTML = `<section class="card" style="max-width:520px;margin:40px auto">
    <h2>Access pending</h2>
    <p>You are signed in as <b>${esc(state.user?.email)}</b>, but this email is not on the team list yet.</p>
    <p class="muted small">Ask the group admin to add this exact email, then reload the page.</p></section>`;
}

function startData() {
  if (state.dataOn) return;
  state.dataOn = true;
  const watch = (name, q) => state.unsub.push(onSnapshot(q, snap => {
    state[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, e => console.warn(name, e)));
  watch("tasks", collection(db, "tasks"));
  watch("contributions", query(collection(db, "contributions"), orderBy("date", "desc")));
  watch("meetings", query(collection(db, "meetings"), orderBy("date", "desc")));
  watch("issues", collection(db, "issues"));
  watch("activity", query(collection(db, "activity"), orderBy("at", "desc"), limit(300)));
}

// ---------- views ----------
const TABS = [
  ["roadmap", "Roadmap"], ["dash", "Dashboard"], ["tasks", "Tasks"], ["contrib", "Contributions"],
  ["meetings", "Meetings"], ["issues", "Issues and conflicts"], ["activity", "Activity log"], ["team", "Team"]
];

function render() {
  if (!state.user) return renderSignIn();
  if (!state.role) return state.roles ? renderNoAccess() : null;
  const view = { roadmap, dash, tasks, contrib, meetings, issues, activity, team }[state.tab] || dash;
  const banner = state.role === "viewer"
    ? `<p class="notice">Read-only view for the lecturer. Every change made by the group is recorded in the Activity log.</p>` : "";
  $app.innerHTML = `
    <nav class="tabs">${TABS.map(([id, n]) => `<button data-tab="${id}" class="${state.tab === id ? "on" : ""}">${n}</button>`).join("")}</nav>
    ${banner}${view()}`;
}

function dash() {
  const t = state.tasks;
  const done = t.filter(x => x.status === "done").length;
  const pct = t.length ? Math.round(done / t.length * 100) : 0;
  const daysLeft = Math.ceil((new Date(COURSE.deadline) - new Date()) / 86400000);
  const words = t.filter(x => WRITING.includes(x.section)).reduce((s, x) => s + (x.words || 0), 0);
  const wPct = Math.min(100, Math.round(words / COURSE.wordTarget * 100));
  const inRange = words >= COURSE.wordTarget * 0.9 && words <= COURSE.wordTarget * 1.1;
  const late = t.filter(x => x.status !== "done" && x.due && x.due < today());
  const soon = t.filter(x => x.status !== "done" && x.due && x.due >= today())
    .sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);

  const sectionRows = SECTIONS.map(s => {
    const st = t.filter(x => x.section === s.id);
    if (!st.length) return "";
    const d = st.filter(x => x.status === "done").length;
    const w = st.reduce((n, x) => n + (x.words || 0), 0);
    const p = Math.round(d / st.length * 100);
    return `<tr><td>${esc(s.name)}</td><td style="min-width:120px"><div class="bar ${p === 100 ? "ok" : ""}"><i style="width:${p}%"></i></div></td>
      <td>${d}/${st.length}</td><td>${s.words ? `${w} / ${s.words[0]}-${s.words[1]}` : ""}</td></tr>`;
  }).join("");

  const members = people().filter(p => p.role === "member");
  const memberRows = members.map(p => {
    const own = t.filter(x => x.owner === p.email);
    const hrs = state.contributions.filter(c => c.email === p.email).reduce((s, c) => s + Number(c.hours || 0), 0);
    const entries = state.contributions.filter(c => c.email === p.email).length;
    const last = state.activity.find(a => a.who === p.email);
    return `<tr><td>${esc(p.name)}</td><td>${own.filter(x => x.status === "done").length}/${own.length}</td>
      <td>${hrs.toFixed(1)}</td><td>${entries}</td><td class="small muted">${last ? fmtTime(last.at) : "no activity yet"}</td></tr>`;
  }).join("");

  const seedBtn = canEdit() && !t.length
    ? `<section class="card"><h2>Start</h2><p class="muted">Create the task list from the coursework brief: research, analytical outputs, each report section with its word range, presentation and submission steps.</p><button class="btn" data-act="seed">Create tasks from the brief</button></section>` : "";

  return `${seedBtn}
  <div class="grid">
    <section class="card"><div class="muted small">Deadline 04.11.2026, 23:59</div><div class="stat">${daysLeft > 0 ? `${daysLeft} days left` : "Deadline passed"}</div></section>
    <section class="card"><div class="muted small">Tasks done</div><div class="stat">${pct}%</div><div class="bar ok"><i style="width:${pct}%"></i></div><div class="small muted">${done} of ${t.length}</div></section>
    <section class="card"><div class="muted small">Words drafted (target ${COURSE.wordTarget} +/- 10%)</div><div class="stat">${words}</div><div class="bar ${inRange ? "ok" : "warn"}"><i style="width:${wPct}%"></i></div></section>
  </div>
  <section class="card"><h2>Progress by section</h2><div class="scroll"><table><tr><th>Section</th><th>Progress</th><th>Tasks</th><th>Words</th></tr>${sectionRows || `<tr><td colspan="4" class="muted">No tasks yet</td></tr>`}</table></div></section>
  <section class="card"><h2>Contribution by member</h2><div class="scroll"><table><tr><th>Member</th><th>Tasks done</th><th>Hours logged</th><th>Log entries</th><th>Last activity</th></tr>${memberRows || `<tr><td colspan="5" class="muted">Add members on the Team tab</td></tr>`}</table></div></section>
  <div class="grid">
    <section class="card"><h2>Overdue</h2>${late.length ? taskList(late) : `<p class="muted">Nothing overdue</p>`}</section>
    <section class="card"><h2>Coming up</h2>${soon.length ? taskList(soon) : `<p class="muted">No upcoming due dates</p>`}</section>
  </div>`;
}

const dayMs = 86400000;
const dateOf = s => new Date(`${s}T00:00:00`);
const shortDate = s => dateOf(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

function roadmap() {
  const start = dateOf(PHASES[0].from), end = dateOf(PHASES[PHASES.length - 1].to);
  const span = (end - start) / dayMs + 1;
  const pos = s => Math.max(0, Math.min(100, (dateOf(s) - start) / dayMs / span * 100));
  const now = today();
  const groups = PHASES.map(p => ({ p, items: state.tasks.filter(x => phaseOf(x) === p) }));
  const current = groups.find(g => g.items.some(x => x.status !== "done"));
  const next = current?.items.filter(x => x.status !== "done")
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"))[0];
  const todayPos = pos(now < PHASES[0].from ? PHASES[0].from : now > PHASES[PHASES.length - 1].to ? PHASES[PHASES.length - 1].to : now);

  const bars = groups.map(({ p, items }) => {
    const d = items.filter(x => x.status === "done").length;
    const pct = items.length ? Math.round(d / items.length * 100) : 0;
    const cls = items.length && d === items.length ? "done" : current?.p === p ? "now" : "";
    return `<div class="gantt-row"><div class="gantt-label">${esc(p.name)}</div>
      <div class="gantt-track"><div class="gantt-bar ${cls}" style="left:${pos(p.from)}%;width:${Math.max(4, pos(p.to) - pos(p.from) + 100 / span)}%">
      <i style="width:${pct}%"></i><span>${shortDate(p.from)} to ${shortDate(p.to)}</span></div></div></div>`;
  }).join("");

  const cards = groups.map(({ p, items }, i) => {
    const d = items.filter(x => x.status === "done").length;
    const pct = items.length ? Math.round(d / items.length * 100) : 0;
    const isNow = current?.p === p;
    return `<section class="card phase ${isNow ? "now" : ""}">
      <div class="row spread"><h3>${i + 1}. ${esc(p.name)} ${isNow ? `<span class="pill doing">now</span>` : pct === 100 && items.length ? `<span class="pill done">done</span>` : ""}</h3>
      <span class="small muted">${shortDate(p.from)} to ${shortDate(p.to)}</span></div>
      <p class="small muted" style="margin:0 0 6px">${esc(p.goal)}</p>
      <div class="bar ${pct === 100 ? "ok" : ""}"><i style="width:${pct}%"></i></div>
      <table>${items.map(x => `<tr><td><span class="pill ${x.status}">${esc(statusName(x.status))}</span></td><td>${esc(x.title)}</td>
        <td class="small muted">${esc(x.owner ? nameOf(x.owner) : "no owner")}</td><td class="small muted">${esc(x.due)}</td></tr>`).join("") || `<tr><td class="muted small">No tasks in this step</td></tr>`}</table>
    </section>`;
  }).join("");

  const noDue = state.tasks.filter(x => !x.due).length;
  return `
    ${next ? `<section class="card start"><div class="small muted">Start here</div>
      <div class="stat" style="font-size:20px">${esc(next.title)}</div>
      <div class="small">Step ${PHASES.indexOf(current.p) + 1}: ${esc(current.p.name)} · ${esc(next.owner ? nameOf(next.owner) : "nobody assigned yet, pick an owner")}${next.due ? ` · due ${esc(next.due)}` : ""}</div></section>`
      : state.tasks.length ? `<section class="card start"><div class="stat" style="font-size:20px">All steps done. Submit and celebrate.</div></section>` : ""}
    <section class="card"><div class="row spread"><h2>Roadmap to 04.11</h2>
      ${canEdit() && noDue ? `<button class="btn ghost" data-act="suggest-dates">Set suggested due dates (${noDue})</button>` : ""}</div>
      <div class="scroll"><div class="gantt"><div class="gantt-today" style="left:calc(var(--label) + (100% - var(--label)) * ${todayPos / 100})"><span>today</span></div>${bars}</div></div>
    </section>
    ${cards}`;
}

function taskList(list) {
  return `<table>${list.map(x => `<tr><td>${esc(x.title)}<div class="small muted">${esc(nameOf(x.owner))}</div></td><td class="small">${esc(x.due)}</td></tr>`).join("")}</table>`;
}

// Tasks with the same title: keep the one with the most work in it, return the rest.
function duplicates() {
  const rank = x => STATUSES.findIndex(s => s.id === x.status) * 1000
    + (x.owner ? 100 : 0) + (x.due ? 10 : 0) + (x.notes ? 5 : 0) + Math.min(x.words || 0, 4);
  const byTitle = new Map();
  state.tasks.forEach(x => {
    const k = x.title.trim().toLowerCase();
    byTitle.set(k, (byTitle.get(k) || []).concat([x]));
  });
  return [...byTitle.values()].filter(g => g.length > 1)
    .flatMap(g => g.sort((a, b) => rank(b) - rank(a)).slice(1));
}

function tasks() {
  const f = state.filter;
  const shown = state.tasks.filter(x => (f.phase === "all" || phaseOf(x).id === f.phase)
    && (f.owner === "all" || (f.owner === "none" ? !x.owner : x.owner === f.owner)));
  const chips = [{ id: "all", name: "All", n: state.tasks.length }]
    .concat(PHASES.map((p, i) => ({ id: p.id, name: `${i + 1}. ${p.name}`, n: state.tasks.filter(x => phaseOf(x) === p).length })))
    .map(c => `<button data-phase="${c.id}" class="${f.phase === c.id ? "on" : ""}">${esc(c.name)} <span class="small">${c.n}</span></button>`).join("");
  const owners = `<select data-act="owner-filter" style="width:auto">
    <option value="all" ${f.owner === "all" ? "selected" : ""}>Everyone</option>
    ${people().filter(p => p.role === "member").map(p => `<option value="${esc(p.email)}" ${f.owner === p.email ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    <option value="none" ${f.owner === "none" ? "selected" : ""}>No owner</option></select>`;
  const cols = STATUSES.map(s => {
    const items = shown.filter(x => x.status === s.id)
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    return `<div class="col"><h3>${s.name} <span class="muted small">${items.length}</span></h3>${items.map(card).join("")}</div>`;
  }).join("");
  return `<section class="card"><div class="row spread"><h2>Tasks <span class="muted small">${shown.length} of ${state.tasks.length}</span></h2>
      <div class="row">${owners}${state.role === "admin" && duplicates().length ? `<button class="btn danger" data-act="dedupe">Remove duplicates (${duplicates().length})</button>` : ""}${canEdit() ? `<button class="btn" data-act="task-new">New task</button>` : ""}</div></div>
    <nav class="tabs chips">${chips}</nav>
    <div class="kanban">${cols}</div></section>`;
}

function card(x) {
  const late = x.status !== "done" && x.due && x.due < today();
  const move = canEdit() ? `<select data-act="task-status" data-id="${x.id}" class="small" style="margin-top:6px">${STATUSES.map(s => `<option value="${s.id}" ${s.id === x.status ? "selected" : ""}>${s.name}</option>`).join("")}</select>` : "";
  return `<div class="task">
    <div class="t">${esc(x.title)}</div>
    <div class="small muted">${esc(sectionName(x.section))}</div>
    <div class="row small" style="margin-top:4px"><span>${esc(nameOf(x.owner))}</span>${x.due ? `<span class="pill ${late ? "late" : "todo"}">${esc(x.due)}</span>` : ""}${WRITING.includes(x.section) ? `<span class="muted">${x.words || 0} words</span>` : ""}</div>
    ${x.notes ? `<div class="small pre" style="margin-top:4px">${esc(x.notes)}</div>` : ""}
    ${move}
    ${canEdit() ? `<div class="row small" style="margin-top:6px"><button class="link" data-act="task-edit" data-id="${x.id}">Edit</button><button class="link" data-act="task-del" data-id="${x.id}">Delete</button></div>` : ""}
  </div>`;
}

function memberOptions(selected) {
  return `<option value="">Unassigned</option>` + people().filter(p => p.role === "member")
    .map(p => `<option value="${esc(p.email)}" ${p.email === selected ? "selected" : ""}>${esc(p.name)}</option>`).join("");
}

function contrib() {
  const rows = state.contributions.map(c => `<tr>
    <td class="small">${esc(c.date)}</td><td>${esc(nameOf(c.email))}</td><td>${Number(c.hours).toFixed(1)}</td>
    <td class="pre">${esc(c.text)}${c.taskId ? `<div class="small muted">Task: ${esc(state.tasks.find(t => t.id === c.taskId)?.title || "deleted task")}</div>` : ""}</td>
    <td>${c.email === me() ? `<button class="link" data-act="contrib-del" data-id="${c.id}">Delete</button>` : ""}</td></tr>`).join("");
  return `<section class="card"><div class="row spread"><h2>Contribution log</h2><div class="row">
      <button class="btn ghost" data-act="csv">Export CSV</button>${canEdit() ? `<button class="btn" data-act="contrib-new">Log my work</button>` : ""}</div></div>
    <p class="muted small">Each member records what they did and how long it took. Entries can be changed only by their author.</p>
    <div class="scroll"><table><tr><th>Date</th><th>Member</th><th>Hours</th><th>What was done</th><th></th></tr>${rows || `<tr><td colspan="5" class="muted">No entries yet</td></tr>`}</table></div></section>`;
}

function meetings() {
  const items = state.meetings.map(m => `<section class="card">
    <div class="row spread"><h3>${esc(m.date)}</h3>${canEdit() ? `<div class="row small"><button class="link" data-act="meet-edit" data-id="${m.id}">Edit</button><button class="link" data-act="meet-del" data-id="${m.id}">Delete</button></div>` : ""}</div>
    <div class="small muted">Present: ${(m.attendees || []).map(e => esc(nameOf(e))).join(", ") || "not recorded"}</div>
    ${m.agenda ? `<h3 style="margin-top:10px">Agenda</h3><div class="pre">${esc(m.agenda)}</div>` : ""}
    ${m.decisions ? `<h3 style="margin-top:10px">Decisions</h3><div class="pre">${esc(m.decisions)}</div>` : ""}
    ${m.actions ? `<h3 style="margin-top:10px">Actions</h3><div class="pre">${esc(m.actions)}</div>` : ""}
  </section>`).join("");
  return `<section class="card"><div class="row spread"><h2>Meetings</h2>${canEdit() ? `<button class="btn" data-act="meet-new">Add meeting</button>` : ""}</div>
    <p class="muted small">Minutes of group meetings: who attended, what was decided, who does what.</p></section>${items || ""}`;
}

function issues() {
  const rows = state.issues.slice().sort((a, b) => (a.status === "open" ? -1 : 1)).map(i => `<tr>
    <td><span class="pill ${i.status}">${i.status}</span></td><td><b>${esc(i.title)}</b><div class="pre small">${esc(i.text)}</div></td>
    <td class="pre small">${esc(i.resolution)}</td>
    <td>${canEdit() ? `<button class="link" data-act="issue-edit" data-id="${i.id}">Edit</button>` : ""}</td></tr>`).join("");
  return `<section class="card"><div class="row spread"><h2>Issues and conflicts</h2>${canEdit() ? `<button class="btn" data-act="issue-new">Record issue</button>` : ""}</div>
    <p class="muted small">Disagreements, missed contributions and how the group resolved them, as the Learning Contract requires.</p>
    <div class="scroll"><table><tr><th>Status</th><th>Issue</th><th>Resolution</th><th></th></tr>${rows || `<tr><td colspan="4" class="muted">No issues recorded</td></tr>`}</table></div></section>`;
}

function activity() {
  const rows = state.activity.map(a => `<tr><td class="small">${fmtTime(a.at)}</td><td>${esc(nameOf(a.who))}</td><td>${esc(a.action)}</td><td>${esc(a.what)}</td></tr>`).join("");
  return `<section class="card"><h2>Activity log</h2><p class="muted small">Automatic, append-only record of every change. Nobody can edit or delete it.</p>
    <div class="scroll"><table><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>${rows || `<tr><td colspan="4" class="muted">No activity yet</td></tr>`}</table></div></section>`;
}

function team() {
  const rows = people().map(p => `<tr><td>${esc(p.name)}</td><td class="small">${esc(p.email)}</td><td>${p.role === "viewer" ? "Lecturer (read only)" : "Student"}</td>
    <td>${state.role === "admin" ? `<button class="link" data-act="person-del" data-email="${esc(p.email)}">Remove</button>` : ""}</td></tr>`).join("");
  return `<section class="card"><div class="row spread"><h2>Team</h2>${state.role === "admin" ? `<button class="btn" data-act="person-new">Add person</button>` : ""}</div>
    <p class="muted small">Admin: ${esc(ADMIN_EMAIL)}. Students edit the tracker; the lecturer can only view it.</p>
    <div class="scroll"><table><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>${rows || `<tr><td colspan="4" class="muted">Nobody added yet</td></tr>`}</table></div></section>`;
}

// ---------- actions ----------
async function saveRoles(list) {
  const clean = list.map(p => ({ email: p.email.trim().toLowerCase(), name: p.name.trim(), role: p.role }));
  await setDoc(doc(db, "config", "roles"), {
    people: clean,
    memberEmails: clean.filter(p => p.role === "member").map(p => p.email),
    viewerEmails: clean.filter(p => p.role === "viewer").map(p => p.email)
  });
}

function taskForm(x = {}) {
  return `<h2>${x.id ? "Edit task" : "New task"}</h2>
    <label>Title</label><input name="title" required maxlength="200" value="${esc(x.title)}">
    <label>Section</label><select name="section">${SECTIONS.map(s => `<option value="${s.id}" ${s.id === x.section ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
    <div class="grid" style="gap:8px"><div><label>Owner</label><select name="owner">${memberOptions(x.owner)}</select></div>
    <div><label>Due date</label><input type="date" name="due" value="${esc(x.due)}"></div></div>
    <div class="grid" style="gap:8px"><div><label>Status</label><select name="status">${STATUSES.map(s => `<option value="${s.id}" ${s.id === (x.status || "todo") ? "selected" : ""}>${s.name}</option>`).join("")}</select></div>
    <div><label>Words drafted (writing tasks)</label><input type="number" name="words" min="0" max="10000" value="${x.words || 0}"></div></div>
    <label>Notes</label><textarea name="notes" maxlength="4000">${esc(x.notes)}</textarea>${modalActions}`;
}

function taskData(f) {
  return {
    title: f.title.trim(), section: f.section, owner: f.owner, due: f.due || "",
    status: f.status, words: Math.max(0, Math.min(10000, parseInt(f.words, 10) || 0)), notes: f.notes || "", ...stamp()
  };
}

const actions = {
  async google() {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { state.error = e.code || e.message; renderSignIn(); }
  },
  async "send-link"() {
    const email = document.getElementById("link-email").value.trim();
    const msg = document.getElementById("link-msg");
    if (!email) return;
    try {
      await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
      try { localStorage.setItem("cw-email", email); } catch (e) { /* ignore */ }
      msg.textContent = "Link sent. Open it in this browser to sign in.";
    } catch (e) { msg.textContent = `Could not send: ${e.code || e.message}`; }
  },
  signout: () => signOut(auth),
  async seed() {
    // Guard against a double click creating the set twice.
    if (state.seeding || state.tasks.length) return;
    state.seeding = true;
    const batch = writeBatch(db);
    SEED.forEach(([section, title]) => batch.set(doc(collection(db, "tasks")), {
      title, section, owner: "", due: "", status: "todo", words: 0, notes: "", ...stamp()
    }));
    try { await batch.commit(); await log("seeded", `${SEED.length} tasks from the brief`); } catch (e) { fail(e); }
    finally { state.seeding = false; }
  },
  async dedupe() {
    const extra = duplicates();
    if (!extra.length || !confirm(`Delete ${extra.length} duplicate tasks? For each title the copy with the most progress (status, owner, due date, notes) is kept.`)) return;
    const batch = writeBatch(db);
    extra.forEach(x => batch.delete(doc(db, "tasks", x.id)));
    try { await batch.commit(); await log("removed duplicates", `${extra.length} duplicate tasks`); } catch (e) { fail(e); }
  },
  async "suggest-dates"() {
    const list = state.tasks.filter(x => !x.due);
    if (!confirm(`Set the end date of its roadmap step as the due date for ${list.length} tasks without one?`)) return;
    const batch = writeBatch(db);
    list.forEach(x => batch.update(doc(db, "tasks", x.id), { due: phaseOf(x).to, ...stamp() }));
    try { await batch.commit(); await log("set due dates", `${list.length} tasks from the roadmap`); } catch (e) { fail(e); }
  },
  async "task-new"() {
    const f = await openModal(taskForm());
    if (!f) return;
    try { await addDoc(collection(db, "tasks"), taskData(f)); await log("created task", f.title); } catch (e) { fail(e); }
  },
  async "task-edit"(el) {
    const x = state.tasks.find(t => t.id === el.dataset.id);
    const f = await openModal(taskForm(x));
    if (!f) return;
    try { await setDoc(doc(db, "tasks", x.id), taskData(f)); await log("edited task", f.title); } catch (e) { fail(e); }
  },
  async "task-del"(el) {
    const x = state.tasks.find(t => t.id === el.dataset.id);
    if (!confirm(`Delete task "${x.title}"?`)) return;
    try { await deleteDoc(doc(db, "tasks", x.id)); await log("deleted task", x.title); } catch (e) { fail(e); }
  },
  async "contrib-new"() {
    const f = await openModal(`<h2>Log my work</h2>
      <div class="grid" style="gap:8px"><div><label>Date</label><input type="date" name="date" required value="${today()}"></div>
      <div><label>Hours</label><input type="number" name="hours" required min="0.25" max="24" step="0.25" value="1"></div></div>
      <label>Related task (optional)</label><select name="taskId"><option value="">None</option>${state.tasks.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join("")}</select>
      <label>What did you do?</label><textarea name="text" required maxlength="2000"></textarea>${modalActions}`);
    if (!f) return;
    try {
      await addDoc(collection(db, "contributions"), { email: me(), date: f.date, hours: Number(f.hours), text: f.text.trim(), taskId: f.taskId, ...stamp() });
      await log("logged work", `${f.hours} h: ${f.text}`);
    } catch (e) { fail(e); }
  },
  async "contrib-del"(el) {
    if (!confirm("Delete this entry?")) return;
    const c = state.contributions.find(x => x.id === el.dataset.id);
    try { await deleteDoc(doc(db, "contributions", c.id)); await log("deleted work entry", `${c.date}: ${c.text}`); } catch (e) { fail(e); }
  },
  csv() {
    const rows = [["date", "member", "email", "hours", "description"],
      ...state.contributions.map(c => [c.date, nameOf(c.email), c.email, c.hours, c.text])];
    const text = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    a.download = `contributions-${today()}.csv`;
    a.click();
  },
  async "meet-new"(el, x = {}) {
    const f = await openModal(`<h2>${x.id ? "Edit meeting" : "Add meeting"}</h2>
      <label>Date</label><input type="date" name="date" required value="${esc(x.date || today())}">
      <label>Present</label><div class="checks">${people().filter(p => p.role === "member").map(p => `<label><input type="checkbox" name="a:${esc(p.email)}" ${(x.attendees || []).includes(p.email) ? "checked" : ""}>${esc(p.name)}</label>`).join("")}</div>
      <label>Agenda</label><textarea name="agenda" maxlength="4000">${esc(x.agenda)}</textarea>
      <label>Decisions</label><textarea name="decisions" maxlength="4000">${esc(x.decisions)}</textarea>
      <label>Actions (who does what by when)</label><textarea name="actions" maxlength="4000">${esc(x.actions)}</textarea>${modalActions}`);
    if (!f) return;
    const data = {
      date: f.date, attendees: Object.keys(f).filter(k => k.startsWith("a:")).map(k => k.slice(2)),
      agenda: f.agenda || "", decisions: f.decisions || "", actions: f.actions || "", ...stamp()
    };
    try {
      if (x.id) { await setDoc(doc(db, "meetings", x.id), data); await log("edited meeting", f.date); }
      else { await addDoc(collection(db, "meetings"), data); await log("added meeting", f.date); }
    } catch (e) { fail(e); }
  },
  "meet-edit"(el) { return actions["meet-new"](el, state.meetings.find(m => m.id === el.dataset.id)); },
  async "meet-del"(el) {
    const m = state.meetings.find(x => x.id === el.dataset.id);
    if (!confirm(`Delete meeting of ${m.date}?`)) return;
    try { await deleteDoc(doc(db, "meetings", m.id)); await log("deleted meeting", m.date); } catch (e) { fail(e); }
  },
  async "issue-new"(el, x = {}) {
    const f = await openModal(`<h2>${x.id ? "Edit issue" : "Record issue"}</h2>
      <label>Title</label><input name="title" required maxlength="200" value="${esc(x.title)}">
      <label>What happened</label><textarea name="text" maxlength="4000">${esc(x.text)}</textarea>
      <label>How it was resolved</label><textarea name="resolution" maxlength="4000">${esc(x.resolution)}</textarea>
      <label>Status</label><select name="status"><option value="open" ${x.status !== "resolved" ? "selected" : ""}>Open</option><option value="resolved" ${x.status === "resolved" ? "selected" : ""}>Resolved</option></select>${modalActions}`);
    if (!f) return;
    const data = { title: f.title.trim(), text: f.text || "", resolution: f.resolution || "", status: f.status, ...stamp() };
    try {
      if (x.id) { await setDoc(doc(db, "issues", x.id), data); await log("updated issue", `${f.title} (${f.status})`); }
      else { await addDoc(collection(db, "issues"), data); await log("recorded issue", f.title); }
    } catch (e) { fail(e); }
  },
  "issue-edit"(el) { return actions["issue-new"](el, state.issues.find(i => i.id === el.dataset.id)); },
  async "person-new"() {
    const f = await openModal(`<h2>Add person</h2>
      <label>Name</label><input name="name" required maxlength="100">
      <label>Email they sign in with</label><input type="email" name="email" required>
      <label>Role</label><select name="role"><option value="member">Student (can edit)</option><option value="viewer">Lecturer (read only)</option></select>${modalActions}`);
    if (!f) return;
    const email = f.email.trim().toLowerCase();
    const list = people().filter(p => p.email !== email).concat([{ email, name: f.name, role: f.role }]);
    try { await saveRoles(list); await log("added person", `${f.name} (${f.role})`); } catch (e) { fail(e); }
  },
  async "person-del"(el) {
    const p = people().find(x => x.email === el.dataset.email);
    if (!confirm(`Remove ${p.name}?`)) return;
    try { await saveRoles(people().filter(x => x.email !== p.email)); await log("removed person", p.name); } catch (e) { fail(e); }
  }
};

document.addEventListener("click", e => {
  const tab = e.target.closest("[data-tab]");
  if (tab) { state.tab = tab.dataset.tab; render(); return; }
  const chip = e.target.closest("[data-phase]");
  if (chip) { state.filter.phase = chip.dataset.phase; render(); return; }
  const el = e.target.closest("button[data-act]");
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el); }
});

document.addEventListener("change", async e => {
  const of = e.target.closest("select[data-act='owner-filter']");
  if (of) { state.filter.owner = of.value; render(); return; }
  const el = e.target.closest("select[data-act='task-status']");
  if (!el) return;
  const x = state.tasks.find(t => t.id === el.dataset.id);
  try {
    await updateDoc(doc(db, "tasks", x.id), { status: el.value, ...stamp() });
    await log("moved task", `${x.title}: ${statusName(x.status)} to ${statusName(el.value)}`);
  } catch (err) { fail(err); }
});

completeEmailLink();
