"use strict";
/* =========================================================
   Hannah — banii ei (PWA), backend Apps Script
   ========================================================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => ymd(new Date());
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const MONTHS = ["ianuarie","februarie","martie","aprilie","mai","iunie","iulie","august","septembrie","octombrie","noiembrie","decembrie"];
const MSHORT = ["ian","feb","mar","apr","mai","iun","iul","aug","sep","oct","noi","dec"];
const DAYS = ["duminică","luni","marți","miercuri","joi","vineri","sâmbătă"];
const DSHORT = ["D","L","Ma","Mi","J","V","S"];
const ro = s => { const [y, m, d] = s.split("-"); return d + "." + m + "." + y; };
const roShort = s => +s.slice(8) + " " + MSHORT[+s.slice(5, 7) - 1];
const dayName = s => DAYS[parseD(s).getDay()];
const k0 = n => Math.round(+n || 0).toLocaleString("ro-RO");
const pl = (n, one, many) => n === 1 ? "1 " + one : n + " " + many;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mkey = s => s.slice(0, 7);
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const normName = s => String(s || "").trim().replace(/\s+/g, " ");
const splitKids = s => normName(s).split(/\s+(?:si|și|\+|&)\s+/i).map(normName).filter(Boolean);
const initials = s => s.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const mShift = (m, n) => { const [y, mm] = m.split("-").map(Number); const d = new Date(y, mm - 1 + n, 1); return ymd(d).slice(0, 7); };
const mName = m => MONTHS[+m.slice(5, 7) - 1] + (m.slice(0, 4) !== today().slice(0, 4) ? " " + m.slice(0, 4) : "");
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2300); }
async function copy(t) { try { await navigator.clipboard.writeText(t); toast("Copiat"); } catch (e) { toast("Nu am putut copia"); } }
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const CHECK = `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/* ---------- categorii ---------- */
const CATS = {
  "Mâncare": { c: "#E9BE6C", e: "🥑" }, "Casă": { c: "#C98B6B", e: "🏡" }, "Transport": { c: "#86AFCB", e: "🚗" },
  "Haine": { c: "#E59A8F", e: "👗" }, "Ieșiri": { c: "#A996CF", e: "☕" }, "Cadouri": { c: "#F0A5BE", e: "🎁" },
  "Sănătate": { c: "#8DAE8F", e: "🌿" }, "Frumusețe": { c: "#D7A6C8", e: "💅" }, "Abonamente": { c: "#9AA8D6", e: "📺" },
  "Muncă": { c: "#B4A089", e: "🎹" }, "Bebe": { c: "#B9A4E0", e: "🍼" }, "Altele": { c: "#C5B8AE", e: "✨" },
};
const OUTCATS = ["Mâncare", "Casă", "Transport", "Haine", "Ieșiri", "Cadouri", "Sănătate", "Frumusețe", "Abonamente", "Muncă", "Altele"];
const INCATS = ["Ore extra", "Cântare", "Cadou", "Altele"];
const BKINDS = { consult: { l: "Consultație", e: "🩺" }, analize: { l: "Analize", e: "🧪" }, cumparat: { l: "Cumpărături", e: "🛍️" }, altele: { l: "Altele", e: "✨" } };
const catOf = c => CATS[c] || CATS["Altele"];

/* ---------- stare ---------- */
const DEF = {
  defRate: 120, rates: {}, ignore: [], due: "2027-06-02",
  fixed: [
    { id: "fx1", n: "Chirie Reverb", a: 1000, cat: "Muncă", from: "2026-11" },
    { id: "fx2", n: "Abonament Regina Maria", a: 100, cat: "Sănătate", from: "2026-11" },
    { id: "fx3", n: "Netflix", a: 60, cat: "Abonamente", from: "2026-11" },
  ],
};
const BEBE_DEF = [
  ["Cameră", ["Pătuț", "Saltea pătuț", "Lenjerie pătuț (2 seturi)", "Comodă / masă de înfășat", "Salteluță de înfășat", "Lampă de veghe", "Monitor bebe"]],
  ["Plimbare", ["Cărucior", "Scaun auto (i-Size, 0+)", "Marsupiu / sistem de purtare", "Sac de iarnă pentru cărucior"]],
  ["Haine", ["Body-uri 56–62 (6–8 buc.)", "Salopete / pijamale (5–6)", "Căciulițe și șosete", "Păturici și scutece textile", "Sac de dormit"]],
  ["Baie și igienă", ["Cădiță", "Prosoape cu glugă", "Scutece mărimea 1", "Șervețele umede", "Cremă de fund", "Termometru", "Aspirator nazal", "Forfecuță unghii"]],
  ["Hrănire", ["Pernă de alăptare", "Sutiene de alăptare", "Pompă de sân", "Biberoane", "Sterilizator", "Bavete"]],
];
const S = {
  api: LS.get("h.api", null),
  docs: LS.get("h.docs", {}),
  queue: LS.get("h.queue", []),
  cal: LS.get("h.cal", {}),
  view: (location.hash.slice(1) || "acasa").split("=")[0],
  month: today().slice(0, 7),
  day: today(),
  chTab: "toate", bTab: "lista",
  online: true, syncing: false,
};
const cfg = () => ({ ...DEF, ...(S.docs["cfg/main"] || {}) });
const doc = (p, d) => S.docs[p] || d;

/* ---------- sincronizare ---------- */
function dot() { const l = $("#syncDot"); if (!l) return; l.className = "dot" + (!S.api ? " off" : !S.online ? " off" : (S.syncing || S.queue.length) ? " busy" : ""); }
function put(path, data) {
  if (data === null) delete S.docs[path]; else S.docs[path] = clone(data);
  LS.set("h.docs", S.docs);
  S.queue = S.queue.filter(o => o.p !== path); S.queue.push({ p: path, d: data === null ? null : clone(data) });
  LS.set("h.queue", S.queue); dot(); flushSoon();
}
let flushT = null;
function flushSoon() { clearTimeout(flushT); flushT = setTimeout(flush, 400); }
async function flush() {
  if (!S.api || !S.queue.length || S.flushing) return;
  S.flushing = true; S.syncing = true; dot();
  const ops = S.queue.slice();
  try {
    const r = await post({ a: "bulk", ops });
    if (r.error) throw new Error(r.error);
    S.queue = S.queue.filter(o => !ops.includes(o)); LS.set("h.queue", S.queue); S.online = true;
  } catch (e) { S.online = false; setTimeout(flush, 15000); }
  S.flushing = false; S.syncing = false; dot();
  if (S.queue.length && S.online) flushSoon();
}
async function post(body) {
  const r = await fetch(S.api.u, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ t: S.api.t, ...body }) });
  return r.json();
}
async function get(params) {
  const r = await fetch(S.api.u + "?" + new URLSearchParams({ t: S.api.t, ...params }).toString());
  return r.json();
}
async function pull() {
  if (!S.api) return;
  S.syncing = true; dot();
  try {
    const r = await get({ a: "all" });
    if (r.error) throw new Error(r.error);
    const pend = {}; S.queue.forEach(o => pend[o.p] = o.d);
    S.docs = r.docs || {};
    Object.entries(pend).forEach(([p, d]) => { if (d === null) delete S.docs[p]; else S.docs[p] = d; });
    LS.set("h.docs", S.docs); S.online = true;
  } catch (e) { S.online = false; }
  S.syncing = false; dot(); render(); flush();
}
function monthRange(m) { const [y, mm] = m.split("-").map(Number); return [ymd(new Date(y, mm - 1, 1)), ymd(new Date(y, mm, 1))]; }
async function loadCal(m) {
  if (!S.api) return;
  const [a, b] = monthRange(m);
  try {
    const r = await get({ a: "cal", from: a, to: b });
    if (r.error) throw new Error(r.error);
    S.cal[m] = { at: Date.now(), ev: r.events }; LS.set("h.cal", S.cal); S.calErr = "";
  } catch (e) { S.calErr = "Calendarul nu răspunde acum. Arăt ultima variantă salvată."; }
  render();
}
function ensureCal(m) { const c = S.cal[m]; if (!c || Date.now() - c.at > 5 * 60e3) { if (!ensureCal.busy?.[m]) { (ensureCal.busy ||= {})[m] = 1; loadCal(m).finally(() => delete ensureCal.busy[m]); } } }

/* ---------- ore ---------- */
const rateOf = n => { const r = cfg().rates || {}; return r[n] != null ? +r[n] : +cfg().defRate; };
const oreDoc = m => doc("ore/" + m, { d: {}, x: [] });
function lessons(m) {
  const c = S.cal[m]; const ign = cfg().ignore || []; const out = [];
  (c ? c.ev : []).forEach(e => { if (mkey(e.date) !== m || ign.includes(normName(e.summary))) return; splitKids(e.summary).forEach(k => out.push({ date: e.date, time: e.time, name: k, src: "cal", raw: normName(e.summary) })); });
  const od = oreDoc(m);
  Object.entries(od.d || {}).forEach(([d, o]) => Object.keys(o).forEach(n => { if (!out.find(l => l.date === d && l.name === n)) out.push({ date: d, time: "", name: n, src: "saved" }); }));
  (od.x || []).forEach(x => { if (!out.find(l => l.date === x.date && l.name === x.name)) out.push({ date: x.date, time: x.time || "", name: x.name, src: "man", id: x.id }); });
  return out.sort((p, q) => (p.date + p.time).localeCompare(q.date + q.time) || p.name.localeCompare(q.name));
}
function lstate(l) { const st = ((oreDoc(mkey(l.date)).d || {})[l.date] || {})[l.name]; return st ? { s: st.s, r: st.r ?? rateOf(l.name) } : { s: l.src === "man" ? 1 : null, r: rateOf(l.name) }; }
function nowHM() { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function oreSum(m) {
  let total = 0, came = 0, pend = 0, abs = 0, planned = 0; const t = today();
  lessons(m).forEach(l => { const st = lstate(l); if (st.s === 1) { total += +st.r; came++; } else if (st.s === 0) abs++; else { planned += +st.r; if (l.date < t || (l.date === t && (l.time || "00:00") <= nowHM())) pend++; } });
  return { total, came, pend, abs, planned };
}

/* ---------- bani pe lună ---------- */
const txDoc = m => doc("tx/" + m, { list: [] });
const fxPaid = m => doc("fxp/" + m, { p: {} });
const fixedFor = m => (cfg().fixed || []).filter(f => (!f.from || f.from <= m) && (!f.to || f.to >= m));
const bebeExp = () => (doc("bebe/exp", { list: [] }).list || []);
const bebeList = () => doc("bebe/list", null);
function monthSum(m) {
  const tx = txDoc(m).list || [], o = oreSum(m);
  const inOther = tx.filter(x => x.dir === "in").reduce((s, x) => s + +x.amount, 0);
  const fx = fixedFor(m).reduce((s, f) => s + +f.a, 0);
  const rnd = tx.filter(x => x.dir !== "in").reduce((s, x) => s + +x.amount, 0);
  const bb = bebeExp().filter(x => mkey(x.date || "") === m).reduce((s, x) => s + +x.amount, 0);
  const cats = {};
  fixedFor(m).forEach(f => cats[f.cat || "Altele"] = (cats[f.cat || "Altele"] || 0) + +f.a);
  tx.filter(x => x.dir !== "in").forEach(x => cats[x.cat || "Altele"] = (cats[x.cat || "Altele"] || 0) + +x.amount);
  if (bb) cats["Bebe"] = (cats["Bebe"] || 0) + bb;
  const inc = o.total + inOther, out = fx + rnd + bb;
  return { ore: o.total, inOther, inc, fx, rnd, bb, out, left: inc - out, cats };
}

/* ---------- navigare ---------- */
const VIEWS = {};
function go(v) { S.view = v; try { history.replaceState(null, "", "#" + v); } catch (e) {} render(); window.scrollTo(0, 0); }
$("#tabs").onclick = e => { const b = e.target.closest("button"); if (b) go(b.dataset.v); };
function shiftMonth(n) { S.month = mShift(S.month, n); if (S.view === "ore") S.day = S.month === today().slice(0, 7) ? today() : S.month + "-01"; render(); }
$("#mPrev").onclick = () => shiftMonth(-1);
$("#mNext").onclick = () => shiftMonth(1);
$("#mLbl").onclick = () => { S.month = today().slice(0, 7); S.day = today(); render(); };

let lastView = "";
function render() {
  dot();
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === S.view));
  const m = S.month; $("#mLbl").textContent = MONTHS[+m.slice(5, 7) - 1] + " " + m.slice(0, 4);
  $(".mswitch").style.visibility = S.view === "bebe" ? "hidden" : "visible";
  if (!S.api) { $("#main").innerHTML = `<div class="view">${setupView()}</div>`; return; }
  ensureCal(m); if (S.view === "acasa") for (let i = 1; i < 6; i++) { const mm = mShift(m, -i); if (!S.cal[mm]) ensureCal(mm); }
  const y = window.scrollY;
  $("#main").innerHTML = `<div class="${lastView !== S.view ? "view" : ""}">${VIEWS[S.view]()}</div>`;
  if (lastView === S.view) window.scrollTo(0, y);
  lastView = S.view;
}

/* ---------- ACASĂ ---------- */
VIEWS.acasa = () => {
  const m = S.month, s = monthSum(m), o = oreSum(m), cur = m === today().slice(0, 7);
  const tx = (txDoc(m).list || []).filter(x => x.dir === "in");
  return `
  <section class="card hero"><div class="blob"></div>
    <div class="k">${s.left >= 0 ? "Rămâne" : "Ai cheltuit peste"} în ${MONTHS[+m.slice(5, 7) - 1]}</div>
    <div class="big num">${k0(Math.abs(s.left))}<small>lei</small></div>
    <div class="cap">${pl(o.came,"oră ținută","ore ținute")}${o.pend ? ` · <b>${o.pend} de confirmat</b>` : ""}${cur && o.planned ? ` · încă ~${k0(o.planned)} lei programați` : ""}</div>
    <div class="pills"><div class="pill"><div class="l">Venit</div><div class="v in num">+${k0(s.inc)}</div></div><div class="pill"><div class="l">Cheltuieli</div><div class="v out num">−${k0(s.out)}</div></div></div>
    ${o.pend ? `<button class="btn p full" style="margin-top:12px" onclick="go('ore')">Confirmă orele</button>` : ""}
  </section>
  <section class="card"><div class="hd2"><h2>Unde s-au dus banii</h2></div>${donut(s.cats, s.out)}</section>
  <section class="card"><div class="hd2"><h2>Ultimele 6 luni</h2></div>${bars(m)}
    <div class="bar small mute" style="margin-top:8px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--sage);margin-right:5px"></i>venit</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--rose);margin-right:5px"></i>cheltuieli</span></div></section>
  <section class="card"><div class="hd2"><h2>Venituri</h2><button class="add" onclick="openTx('in')" aria-label="Adaugă venit">+</button></div>
    <div class="row"><div class="ic" style="background:var(--sage2)">🎹</div><div class="l"><div class="t">Ore cu copiii</div><div class="s">${pl(o.came,"oră","ore")} · din calendar</div></div><div class="v in">+${k0(s.ore)}</div></div>
    ${tx.map(x => `<div class="row tap" onclick="openTx('in','${esc(x.id)}')"><div class="ic" style="background:var(--sage2)">💚</div><div class="l"><div class="t">${esc(x.desc || x.cat)}</div><div class="s">${roShort(x.date)} · ${esc(x.cat)}</div></div><div class="v in">+${k0(x.amount)}</div></div>`).join("")}
    ${!tx.length ? `<div class="small mute" style="margin-top:6px">Alte venituri (cântări, ore extra, cadouri) le adaugi cu +.</div>` : ""}
  </section>
  ${bebeMini()}`;
};
function donut(cats, total) {
  const ent = Object.entries(cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!total) return `<div class="empty">Nicio cheltuială în luna asta.</div>`;
  const R = 52, C = 2 * Math.PI * R; let acc = 0;
  const arcs = ent.map(([k, v]) => { const len = v / total * C, gap = ent.length > 1 ? 3 : 0; const a = `<circle cx="66" cy="66" r="${R}" fill="none" stroke="${catOf(k).c}" stroke-width="18" stroke-linecap="butt" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 66 66)"/>`; acc += len; return a; }).join("");
  return `<div class="donut"><svg viewBox="0 0 132 132">${arcs}<text x="66" y="62" text-anchor="middle" font-family="Fraunces,serif" font-size="22" font-weight="600" fill="#3A302C">${k0(total)}</text><text x="66" y="80" text-anchor="middle" font-family="Nunito,sans-serif" font-size="11" font-weight="700" fill="#8A7B72">lei</text></svg>
  <div class="legend">${ent.slice(0, 6).map(([k, v]) => `<div><i style="background:${catOf(k).c}"></i><span>${esc(k)}</span><b>${k0(v)}</b></div>`).join("")}${ent.length > 6 ? `<div class="mute small">+ încă ${ent.length - 6} categorii</div>` : ""}</div></div>`;
}
function bars(m) {
  const ms = []; for (let i = 5; i >= 0; i--) ms.push(mShift(m, -i));
  const data = ms.map(x => ({ m: x, ...monthSum(x) })); const max = Math.max(1, ...data.map(d => Math.max(d.inc, d.out)));
  return `<div class="bars">${data.map(d => `<div class="m ${d.m === m ? "on" : ""}" onclick="S.month='${d.m}';render()"><div class="cols"><i style="height:${d.inc / max * 100}%;background:var(--sage);${d.inc ? "" : "min-height:0"}"></i><i style="height:${d.out / max * 100}%;background:var(--rose);${d.out ? "" : "min-height:0"}"></i></div><div class="lb">${MSHORT[+d.m.slice(5, 7) - 1]}</div></div>`).join("")}</div>`;
}
function bebeMini() {
  const w = weeksLeft(); const L = bebeList(); const items = L ? L.items : []; const done = items.filter(i => i.done).length;
  return `<section class="card hero lav" onclick="go('bebe')" style="cursor:pointer"><div class="blob"></div><div class="k">Bebe 🍼</div>
  <div class="big num" style="font-size:40px">${w > 0 ? w : 0}<small>săptămâni</small></div><div class="cap">până la ${ro(cfg().due)} (estimat) · ${done}/${items.length || BEBE_DEF.reduce((s, g) => s + g[1].length, 0)} lucruri luate</div></section>`;
}
const weeksLeft = () => Math.ceil((parseD(cfg().due) - parseD(today())) / (7 * 864e5));

/* ---------- ORE ---------- */
VIEWS.ore = () => {
  const m = S.month, td = today(), o = oreSum(m), cal = S.cal[m];
  if (mkey(S.day) !== m) S.day = m === mkey(td) ? td : m + "-01";
  const d0 = parseD(S.day); const mon = new Date(d0); mon.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
  const week = []; for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); week.push(ymd(x)); }
  if (week.some(w => mkey(w) !== m)) week.forEach(w => { if (mkey(w) !== m) ensureCal(mkey(w)); });
  const dayCell = d => { const ls = lessons(mkey(d)).filter(l => l.date === d); return `<button class="dc ${d === S.day ? "on" : ""} ${d === td ? "td" : ""}" onclick="pickDay('${d}')"><div class="w">${DSHORT[parseD(d).getDay()]}</div><div class="d">${+d.slice(8)}</div><div class="p">${ls.slice(0, 4).map(l => { const s = lstate(l).s; return `<i class="${s === 1 ? "y" : s === 0 ? "n" : ""}"></i>`; }).join("")}</div></button>`; };
  const ls = lessons(m).filter(l => l.date === S.day), dayTot = ls.reduce((s, l) => s + (lstate(l).s === 1 ? +lstate(l).r : 0), 0);
  const anyPend = ls.some(l => lstate(l).s == null);
  return `${pushCard()}
  <section class="card hero sage"><div class="blob"></div><div class="k">Ore în ${MONTHS[+m.slice(5, 7) - 1]}</div>
    <div class="big num">${k0(o.total)}<small>lei</small></div>
    <div class="cap">${pl(o.came,"oră ținută","ore ținute")} · ${pl(o.abs,"absență","absențe")}${o.pend ? ` · <b>${o.pend} de confirmat</b>` : ""}</div>
    ${S.calErr ? `<div class="small" style="margin-top:8px;color:var(--out)">${esc(S.calErr)}</div>` : !cal ? `<div class="small mute" style="margin-top:8px">Citesc calendarul…</div>` : ""}
  </section>
  <div class="weeknav"><button onclick="shiftWeek(-7)">‹ săpt. trecută</button><button onclick="pickDay('${td}')">azi</button><button onclick="shiftWeek(7)">săpt. viitoare ›</button></div>
  <div class="week">${week.map(dayCell).join("")}</div>
  <section class="card">
    <div class="hd2"><h2>${dayName(S.day)}, ${+S.day.slice(8)} ${MONTHS[+S.day.slice(5, 7) - 1]}</h2><span class="num" style="font-size:20px;font-weight:600">${k0(dayTot)} lei</span></div>
    ${ls.length ? ls.map(kidRow).join("") : `<div class="empty">Nicio oră în ziua asta.</div>`}
    <div class="bar" style="margin-top:12px">${anyPend && S.day <= td ? `<button class="btn p" onclick="allCame()">Toți au venit</button>` : ""}<span class="sp"></span><button class="btn sm" onclick="openAddLesson()">+ oră manuală</button></div>
  </section>
  <section class="card"><div class="hd2"><h2>Pe copii, luna asta</h2></div>${perKid(m)}</section>`;
};
function perKid(m) {
  const by = {}; lessons(m).forEach(l => { const st = lstate(l); const b = by[l.name] ||= { n: 0, s: 0, a: 0 }; if (st.s === 1) { b.n++; b.s += +st.r; } else if (st.s === 0) b.a++; });
  const ent = Object.entries(by).filter(([, b]) => b.n || b.a).sort((a, b) => b[1].s - a[1].s);
  if (!ent.length) return `<div class="empty">Încă nicio oră confirmată.</div>`;
  return ent.map(([n, b]) => `<div class="row tap" onclick="openRate('${esc(n)}')"><div class="av" style="width:36px;height:36px;font-size:13px">${esc(initials(n))}</div><div class="l"><div class="t">${esc(n)}</div><div class="s">${pl(b.n,"oră","ore")}${b.a ? ` · ${pl(b.a,"absență","absențe")}` : ""} · ${k0(rateOf(n))} lei/oră</div></div><div class="v">${k0(b.s)}</div></div>`).join("");
}
function kidRow(l) {
  const st = lstate(l), cls = st.s === 1 ? "y" : st.s === 0 ? "n" : "";
  const key = esc(JSON.stringify({ d: l.date, n: l.name, src: l.src, id: l.id || "" }));
  const canHide = l.src === "cal" && st.s == null;
  return `<div class="kid ${cls}" data-k="${key}"><div class="av">${st.s === 1 ? "✓" : esc(initials(l.name))}</div><div style="flex:1;min-width:0"><div class="nm">${esc(l.name)}</div><div class="tm">${l.time || ""}${l.time ? " · " : ""}${k0(st.r)} lei${l.src === "man" ? " · manuală" : ""}</div></div>
    ${canHide ? `<button class="hide" title="Nu e oră" onclick="ignoreEv('${esc(l.raw)}')"><svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c5 0 9 6 9 6a17 17 0 01-3.2 3.8M6.3 7.3A17 17 0 003 12s4 6 9 6a9 9 0 004.3-1.1"/></svg></button>` : ""}
    <div class="yn"><button class="y ${st.s === 1 ? "on" : ""}" onclick="setKid(this,1)">A venit</button><button class="n ${st.s === 0 ? "on" : ""}" onclick="setKid(this,0)">Absent</button></div></div>`;
}
window.pickDay = d => { S.day = d; S.month = mkey(d); render(); };
window.shiftWeek = n => { const d = parseD(S.day); d.setDate(d.getDate() + n); pickDay(ymd(d)); };
window.setKid = (btn, v) => {
  const el = btn.closest(".kid"), k = JSON.parse(el.dataset.k), m = mkey(k.d), od = clone(oreDoc(m)); od.d = od.d || {}; od.d[k.d] = od.d[k.d] || {};
  const cur = od.d[k.d][k.n];
  if (cur && cur.s === v) { if (k.src === "man") od.x = (od.x || []).filter(x => x.id !== k.id); delete od.d[k.d][k.n]; }
  else od.d[k.d][k.n] = { s: v, r: cur ? cur.r : rateOf(k.n) };
  put("ore/" + m, od); render();
  const n = document.querySelector(`.kid[data-k='${CSS.escape(el.dataset.k)}'] .av`); if (n && v === 1) n.classList.add("pop");
  if (navigator.vibrate) navigator.vibrate(8);
};
window.allCame = () => { const m = mkey(S.day), od = clone(oreDoc(m)); od.d = od.d || {}; od.d[S.day] = od.d[S.day] || {}; lessons(m).filter(l => l.date === S.day).forEach(l => { if (!od.d[S.day][l.name]) od.d[S.day][l.name] = { s: 1, r: rateOf(l.name) }; }); put("ore/" + m, od); render(); toast("Toți au venit ✓"); };
window.ignoreEv = raw => { if (!confirm(`„${raw}” nu e oră cu un copil? Nu mai apare deloc la ore.`)) return; const c = cfg(); c.ignore = [...new Set([...(c.ignore || []), raw])]; put("cfg/main", c); render(); toast(`„${raw}” ascuns`); };
function knownKids() { const s = new Set(Object.keys(cfg().rates || {})); Object.values(S.cal).forEach(c => (c.ev || []).forEach(e => { if (!(cfg().ignore || []).includes(normName(e.summary))) splitKids(e.summary).forEach(k => s.add(k)); })); return [...s].sort((a, b) => a.localeCompare(b, "ro")); }
window.openAddLesson = () => sheet("Oră manuală", `
  <label class="field"><span>Copil</span><input id="axN" list="kidsDL" placeholder="Nume"></label>
  <datalist id="kidsDL">${knownKids().map(k => `<option value="${esc(k)}">`).join("")}</datalist>
  <div class="g2"><label class="field"><span>Data</span><input id="axD" type="date" value="${S.day}"></label><label class="field"><span>Sumă (lei)</span><input id="axR" type="number" inputmode="decimal" placeholder="${cfg().defRate}"></label></div>
  <button class="btn p full" onclick="addLesson()">Adaugă ora</button>`);
window.addLesson = () => { const n = normName($("#axN").value), d = $("#axD").value, r = $("#axR").value; if (!n || !d) { toast("Pune numele și data"); return; } const m = mkey(d), od = clone(oreDoc(m)); od.x = od.x || []; od.x.push({ id: uid(), date: d, name: n }); od.d = od.d || {}; od.d[d] = od.d[d] || {}; od.d[d][n] = { s: 1, r: r !== "" ? +r : rateOf(n) }; put("ore/" + m, od); closeSheet(); S.day = d; render(); toast("Ora a fost adăugată"); };
window.openRate = n => sheet(n, `<label class="field"><span>Cât ia pe oră de la ${esc(n)} (lei)</span><input id="rtV" type="number" inputmode="decimal" value="${rateOf(n)}"></label>
  <p class="sub" style="margin-top:0">Se aplică orelor noi. Cele deja confirmate rămân cu suma de atunci.</p><button class="btn p full" onclick="saveRateKid('${esc(n)}')">Salvează</button>`);
window.saveRateKid = n => { const c = cfg(), v = +$("#rtV").value; c.rates = { ...(c.rates || {}) }; if (v === +c.defRate) delete c.rates[n]; else c.rates[n] = v; put("cfg/main", c); closeSheet(); toast("Salvat"); };

/* ---------- CHELTUIELI ---------- */
VIEWS.chelt = () => {
  const m = S.month, s = monthSum(m), fx = fixedFor(m), paid = fxPaid(m).p || {};
  const rnd = (txDoc(m).list || []).filter(x => x.dir !== "in").sort((a, b) => b.date.localeCompare(a.date));
  const bb = bebeExp().filter(x => mkey(x.date || "") === m);
  const fxPaidSum = fx.filter(f => paid[f.id]).reduce((a, f) => a + +f.a, 0);
  return `
  <section class="card hero butter"><div class="blob"></div><div class="k">Cheltuieli în ${MONTHS[+m.slice(5, 7) - 1]}</div>
    <div class="big num">${k0(s.out)}<small>lei</small></div>
    <div class="cap">fixe ${k0(s.fx)} · aleatorii ${k0(s.rnd)}${s.bb ? ` · bebe ${k0(s.bb)}` : ""}</div>
    <button class="btn p full" style="margin-top:14px" onclick="openTx('out')">+ Cheltuială</button>
  </section>
  <section class="card"><div class="hd2"><h2>Fixe, lunar</h2><button class="add" onclick="openFixed()" aria-label="Adaugă cheltuială fixă">+</button></div>
    ${fx.map(f => `<div class="row"><button class="chk ${paid[f.id] ? "on" : ""}" onclick="togglePaid('${esc(f.id)}')" aria-label="Plătit">${CHECK}</button><div class="l tap" onclick="openFixed('${esc(f.id)}')" style="cursor:pointer"><div class="t">${esc(f.n)}</div><div class="s">${catOf(f.cat).e} ${esc(f.cat || "Altele")}${f.day ? ` · pe ${f.day}` : ""}${paid[f.id] ? " · plătit" : ""}</div></div><div class="v">${k0(f.a)}</div></div>`).join("") || `<div class="empty">Nicio cheltuială fixă.</div>`}
    ${fx.length ? `<div class="small mute" style="margin-top:6px">Bifă = plătit în ${MONTHS[+m.slice(5, 7) - 1]} · ${k0(fxPaidSum)} din ${k0(s.fx)} lei</div>` : ""}
  </section>
  <section class="card"><div class="hd2"><h2>Aleatorii</h2></div>
    ${rnd.map(x => `<div class="row tap" onclick="openTx('out','${esc(x.id)}')"><div class="ic" style="background:${catOf(x.cat).c}33">${catOf(x.cat).e}</div><div class="l"><div class="t">${esc(x.desc || x.cat)}</div><div class="s">${roShort(x.date)} · ${esc(x.cat)}</div></div><div class="v">${k0(x.amount)}</div></div>`).join("") || `<div class="empty">Nimic încă. Apasă „+ Cheltuială” când dai bani pe ceva.</div>`}
  </section>
  ${bb.length ? `<section class="card"><div class="hd2"><h2>Bebe</h2><button class="btn sm" onclick="go('bebe');S.bTab='bani';render()">vezi tot</button></div>${bb.map(bRow).join("")}</section>` : ""}`;
};
window.togglePaid = id => { const m = S.month, p = clone(fxPaid(m)); p.p = p.p || {}; if (p.p[id]) delete p.p[id]; else p.p[id] = today(); put("fxp/" + m, p); render(); };
window.openFixed = id => {
  const f = (cfg().fixed || []).find(x => x.id === id) || { n: "", a: "", cat: "Abonamente", day: "" };
  sheet(id ? "Cheltuială fixă" : "Cheltuială fixă nouă", `
  <label class="field"><span>Ce</span><input id="fN" value="${esc(f.n)}" placeholder="ex. Spotify"></label>
  <div class="g2"><label class="field"><span>Sumă lunară (lei)</span><input id="fA" type="number" inputmode="decimal" value="${f.a}"></label><label class="field"><span>Ziua plății (opțional)</span><input id="fD" type="number" inputmode="numeric" min="1" max="31" value="${f.day || ""}"></label></div>
  <div class="field"><span>Categorie</span><div class="chips" id="fC">${OUTCATS.map(c => `<button class="chip ${c === (f.cat || "Altele") ? "on" : ""}" onclick="pickChip(this)">${catOf(c).e} ${c}</button>`).join("")}</div></div>
  <div class="bar" style="margin-top:6px">${id ? `<button class="btn ghost" onclick="delFixed('${esc(id)}')">Nu mai plătesc</button>` : ""}<span class="sp"></span><button class="btn p" onclick="saveFixed('${esc(id || "")}')">Salvează</button></div>
  ${id ? `<p class="small mute">„Nu mai plătesc” o scoate de luna viitoare; lunile trecute rămân cum erau.</p>` : ""}`);
};
window.pickChip = b => { b.parentNode.querySelectorAll(".chip").forEach(x => x.classList.remove("on")); b.classList.add("on"); };
const chipVal = sel => { const b = $(sel + " .chip.on"); return b ? b.textContent.replace(/^\S+\s/, "").trim() : ""; };
window.saveFixed = id => {
  const c = cfg(), n = $("#fN").value.trim(), a = +$("#fA").value, day = +$("#fD").value || "";
  if (!n || !a) { toast("Pune numele și suma"); return; }
  const list = clone(c.fixed || []); const i = list.findIndex(x => x.id === id);
  const o = { ...(i >= 0 ? list[i] : { id: uid(), from: S.month }), n, a, day, cat: chipVal("#fC") || "Altele" };
  if (i >= 0) list[i] = o; else list.push(o);
  put("cfg/main", { ...c, fixed: list }); closeSheet(); toast("Salvat");
};
window.delFixed = id => { const c = cfg(), list = clone(c.fixed || []), f = list.find(x => x.id === id); if (!f) return; if (f.from && f.from >= S.month) list.splice(list.indexOf(f), 1); else f.to = S.month; put("cfg/main", { ...c, fixed: list }); closeSheet(); toast(`${f.n}: scoasă de luna viitoare`); };

window.openTx = (dir, id) => {
  const m = S.month, x = (txDoc(m).list || []).find(t => t.id === id) || { date: mkey(today()) === m ? today() : m + "-01", amount: "", desc: "", cat: dir === "in" ? "Ore extra" : "Mâncare" };
  const cats = dir === "in" ? INCATS : OUTCATS;
  sheet(id ? (dir === "in" ? "Venit" : "Cheltuială") : (dir === "in" ? "Venit nou" : "Cheltuială nouă"), `
  <label class="field"><span>Sumă (lei)</span><input id="tA" type="number" inputmode="decimal" value="${x.amount}" placeholder="0" style="font-family:Fraunces,serif;font-size:28px;font-weight:600"></label>
  <div class="field"><span>Categorie</span><div class="chips" id="tC">${cats.map(c => `<button class="chip ${c === x.cat ? "on" : ""}" onclick="pickChip(this)">${dir === "in" ? "💚" : catOf(c).e} ${c}</button>`).join("")}</div></div>
  <div class="g2"><label class="field"><span>Ce a fost (opțional)</span><input id="tN" value="${esc(x.desc)}" placeholder="${dir === "in" ? "ex. cântare nuntă" : "ex. Lidl"}"></label><label class="field"><span>Data</span><input id="tD" type="date" value="${x.date}"></label></div>
  <div class="bar">${id ? `<button class="btn ghost" onclick="delTx('${esc(id)}')">Șterge</button>` : ""}<span class="sp"></span><button class="btn p" onclick="saveTx('${dir}','${esc(id || "")}')">Salvează</button></div>`);
  setTimeout(() => { const i = $("#tA"); if (i && !id) i.focus(); }, 350);
};
window.saveTx = (dir, id) => {
  const a = +$("#tA").value, d = $("#tD").value; if (!a || !d) { toast("Pune suma și data"); return; }
  const oldM = S.month, nm = mkey(d);
  if (id) { const od = clone(txDoc(oldM)); od.list = (od.list || []).filter(t => t.id !== id); put("tx/" + oldM, od); }
  const nd = clone(txDoc(nm)); nd.list = nd.list || []; nd.list.push({ id: id || uid(), dir, date: d, amount: a, desc: $("#tN").value.trim(), cat: chipVal("#tC") || "Altele" });
  put("tx/" + nm, nd); closeSheet(); toast(dir === "in" ? "Venit salvat" : "Cheltuială salvată");
};
window.delTx = id => { const od = clone(txDoc(S.month)); od.list = (od.list || []).filter(t => t.id !== id); put("tx/" + S.month, od); closeSheet(); toast("Șters"); };

/* ---------- BEBE ---------- */
function ensureBebeList() {
  const L = bebeList(); if (L) return L;
  if (!S.bebeDef) { S.bebeDef = { items: [] }; let k = 0; BEBE_DEF.forEach(([g, arr]) => arr.forEach(n => S.bebeDef.items.push({ id: "d" + (k++), g, n, done: false, price: "" }))); }
  return S.bebeDef;
}
VIEWS.bebe = () => {
  const L = ensureBebeList(), items = L.items, done = items.filter(i => i.done).length, w = weeksLeft(), due = parseD(cfg().due);
  const days = Math.max(0, Math.ceil((due - parseD(today())) / 864e5));
  const ex = bebeExp().slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")), tot = ex.reduce((s, x) => s + +x.amount, 0);
  const next = ex.filter(x => x.next && x.next >= today()).sort((a, b) => a.next.localeCompare(b.next))[0];
  const groups = [...new Set(items.map(i => i.g))];
  return `
  <section class="card hero lav"><div class="blob"></div><div class="k">Bebe vine pe ${+cfg().due.slice(8)} ${MONTHS[due.getMonth()]} (estimat)</div>
    <div class="cd"><div><b>${Math.max(0, w)}</b><span>săptămâni</span></div><div><b>${days}</b><span>zile</span></div><div><b>${done}/${items.length}</b><span>luate</span></div></div>
    <div class="prog"><i style="width:${items.length ? done / items.length * 100 : 0}%"></i></div>
    ${next ? `<div class="cap" style="margin-top:10px">Următoarea: <b>${esc(next.desc || BKINDS[next.kind].l)}</b> · ${dayName(next.next)} ${roShort(next.next)}</div>` : ""}
  </section>
  <div class="seg"><button class="${S.bTab === "lista" ? "on" : ""}" onclick="S.bTab='lista';render()">De cumpărat</button><button class="${S.bTab === "bani" ? "on" : ""}" onclick="S.bTab='bani';render()">Cheltuieli</button></div>
  ${S.bTab === "lista" ? `<section class="card"><div class="hd2"><h2>Lista</h2><button class="add" onclick="openItem()" aria-label="Adaugă">+</button></div>
    ${groups.map(g => `<div class="grp">${esc(g)}</div>${items.filter(i => i.g === g).sort((a, b) => a.done - b.done).map(itemRow).join("")}`).join("")}
    <div class="small mute" style="margin-top:10px">Bifează când l-ai luat; dacă pui cât a costat, intră singur la cheltuielile de bebe.</div></section>`
  : `<section class="card"><div class="hd2"><h2>Total bebe</h2><span class="num" style="font-size:24px;font-weight:600">${k0(tot)} lei</span></div>
    <div class="bar" style="gap:8px">${Object.entries(BKINDS).map(([k, v]) => `<button class="btn sm" onclick="openBExp('${k}')">${v.e} ${v.l}</button>`).join("")}</div></section>
    <section class="card"><div class="hd2"><h2>Istoric</h2></div>${ex.map(bRow).join("") || `<div class="empty">Nicio cheltuială încă.</div>`}</section>`}`;
};
function itemRow(i) {
  return `<div class="row ${i.done ? "done" : ""}"><button class="chk ${i.done ? "on" : ""}" onclick="toggleItem('${esc(i.id)}')" aria-label="Luat">${CHECK}</button><div class="l" onclick="openItem('${esc(i.id)}')" style="cursor:pointer"><div class="t">${esc(i.n)}</div>${i.note || i.est ? `<div class="s">${i.est && !i.done ? `~${k0(i.est)} lei` : ""}${i.est && i.note && !i.done ? " · " : ""}${esc(i.note || "")}</div>` : ""}</div>${i.done && i.price ? `<div class="v">${k0(i.price)}</div>` : ""}</div>`;
}
function bRow(x) {
  const k = BKINDS[x.kind] || BKINDS.altele;
  return `<div class="row tap" onclick="openBExp('${x.kind}','${esc(x.id)}')"><div class="ic" style="background:var(--lav2)">${k.e}</div><div class="l"><div class="t">${esc(x.desc || k.l)}</div><div class="s">${x.date ? roShort(x.date) : ""}${x.where && !(x.rm && /regina/i.test(x.where)) ? " · " + esc(x.where) : ""}${x.rm ? ` · <span class="tag ok">Regina Maria</span>` : ""}${x.next ? ` · următoarea ${roShort(x.next)}` : ""}</div></div><div class="v">${+x.amount ? k0(x.amount) : "0"}</div></div>`;
}
function saveList(L) { put("bebe/list", L); }
window.toggleItem = id => {
  const L = clone(ensureBebeList()), i = L.items.find(x => x.id === id); if (!i) return;
  if (i.done) { i.done = false; if (i.exp) { delBExpRaw(i.exp); delete i.exp; } i.price = ""; saveList(L); render(); return; }
  sheet(i.n, `<label class="field"><span>Cât a costat? (lei, gol dacă a fost cadou)</span><input id="iP" type="number" inputmode="decimal" placeholder="0" style="font-family:Fraunces,serif;font-size:28px;font-weight:600"></label>
  <div class="bar"><button class="btn" onclick="doneItem('${esc(id)}',true)">🎁 Cadou</button><span class="sp"></span><button class="btn p" onclick="doneItem('${esc(id)}')">Am luat ✓</button></div>`);
  setTimeout(() => $("#iP")?.focus(), 350);
};
window.doneItem = (id, gift) => {
  const L = clone(ensureBebeList()), i = L.items.find(x => x.id === id), p = gift ? 0 : +$("#iP").value || 0;
  i.done = true; i.price = p; if (gift) i.note = "cadou";
  if (p) { const eid = uid(); i.exp = eid; const E = clone(doc("bebe/exp", { list: [] })); E.list = E.list || []; E.list.push({ id: eid, kind: "cumparat", date: today(), desc: i.n, amount: p, item: id }); put("bebe/exp", E); }
  saveList(L); closeSheet(); toast(gift ? "Bifat ca un cadou 🎁" : "Bifat ✓");
};
window.openItem = id => {
  const L = ensureBebeList(), i = L.items.find(x => x.id === id) || { n: "", g: BEBE_DEF[0][0], est: "", note: "" };
  const groups = [...new Set([...BEBE_DEF.map(g => g[0]), ...L.items.map(x => x.g)])];
  sheet(id ? "Editează" : "Ceva nou pe listă", `<label class="field"><span>Ce</span><input id="iN" value="${esc(i.n)}" placeholder="ex. Leagăn"></label>
  <div class="g2"><label class="field"><span>Preț estimat (opțional)</span><input id="iE" type="number" inputmode="decimal" value="${i.est || ""}"></label><label class="field"><span>Notă / link</span><input id="iT" value="${esc(i.note || "")}" placeholder="ex. de la IKEA"></label></div>
  <div class="field"><span>Grupă</span><div class="chips" id="iG">${groups.map(g => `<button class="chip ${g === i.g ? "on" : ""}" onclick="pickChip(this)">• ${esc(g)}</button>`).join("")}</div></div>
  <div class="bar">${id ? `<button class="btn ghost" onclick="delItem('${esc(id)}')">Scoate de pe listă</button>` : ""}<span class="sp"></span><button class="btn p" onclick="saveItem('${esc(id || "")}')">Salvează</button></div>`);
};
window.saveItem = id => {
  const n = $("#iN").value.trim(); if (!n) { toast("Scrie ce trebuie luat"); return; }
  const L = clone(ensureBebeList()), g = chipVal("#iG") || BEBE_DEF[0][0];
  const i = L.items.find(x => x.id === id); const o = { ...(i || { id: uid(), done: false, price: "" }), n, g, est: +$("#iE").value || "", note: $("#iT").value.trim() };
  if (i) Object.assign(i, o); else L.items.push(o);
  saveList(L); closeSheet(); toast("Salvat");
};
window.delItem = id => { const L = clone(ensureBebeList()), i = L.items.find(x => x.id === id); if (i?.exp) delBExpRaw(i.exp); L.items = L.items.filter(x => x.id !== id); saveList(L); closeSheet(); toast("Scos de pe listă"); };
window.openBExp = (kind, id) => {
  const x = bebeExp().find(e => e.id === id) || { kind, date: today(), desc: "", amount: "", where: "", rm: false, next: "" };
  const med = x.kind === "consult" || x.kind === "analize";
  sheet((BKINDS[x.kind] || BKINDS.altele).e + " " + (BKINDS[x.kind] || BKINDS.altele).l, `
  <label class="field"><span>Ce${x.kind === "consult" ? " (ex. control lunar, morfologie)" : ""}</span><input id="bN" value="${esc(x.desc)}"></label>
  <div class="g2"><label class="field"><span>Cât ai plătit (lei)</span><input id="bA" type="number" inputmode="decimal" value="${x.amount}" placeholder="0"></label><label class="field"><span>Data</span><input id="bD" type="date" value="${x.date}"></label></div>
  ${med ? `<label class="field"><span>Unde / medic</span><input id="bW" value="${esc(x.where || "")}" placeholder="ex. Regina Maria, dr. …"></label>
  <div class="row" style="border:0;padding:0 0 12px"><button class="chk ${x.rm ? "on" : ""}" id="bRM" onclick="this.classList.toggle('on')">${CHECK}</button><div class="l">Acoperit de abonamentul Regina Maria</div></div>
  <label class="field"><span>Următoarea programare (opțional)</span><input id="bX" type="date" value="${x.next || ""}"></label>` : ""}
  <div class="bar">${id ? `<button class="btn ghost" onclick="delBExp('${esc(id)}')">Șterge</button>` : ""}<span class="sp"></span><button class="btn p" onclick="saveBExp('${x.kind}','${esc(id || "")}')">Salvează</button></div>`);
};
window.saveBExp = (kind, id) => {
  const E = clone(doc("bebe/exp", { list: [] })); E.list = E.list || [];
  const old = E.list.find(e => e.id === id);
  const o = { ...(old || { id: uid(), kind }), desc: $("#bN").value.trim(), amount: +$("#bA").value || 0, date: $("#bD").value || today() };
  if ($("#bW")) { o.where = $("#bW").value.trim(); o.rm = $("#bRM").classList.contains("on"); o.next = $("#bX").value; }
  if (!o.desc && !o.amount) { toast("Completează măcar ce a fost"); return; }
  if (old) Object.assign(old, o); else E.list.push(o);
  put("bebe/exp", E); closeSheet(); toast("Salvat");
};
function delBExpRaw(id) { const E = clone(doc("bebe/exp", { list: [] })); E.list = (E.list || []).filter(e => e.id !== id); put("bebe/exp", E); }
window.delBExp = id => {
  const x = bebeExp().find(e => e.id === id); delBExpRaw(id);
  if (x?.item) { const L = clone(ensureBebeList()), i = L.items.find(t => t.id === x.item); if (i) { delete i.exp; i.price = ""; saveList(L); } }
  closeSheet(); toast("Șters");
};

/* ---------- SETĂRI ---------- */
window.openSettings = () => {
  if (!S.api) return;
  const c = cfg();
  sheet("Setări", `
  <div class="g2"><label class="field"><span>Tarif pe oră (lei)</span><input id="sR" type="number" inputmode="decimal" value="${c.defRate}"></label><label class="field"><span>Data estimată a nașterii</span><input id="sD" type="date" value="${c.due}"></label></div>
  <button class="btn p full" onclick="saveSettings()">Salvează</button>
  ${(c.ignore || []).length ? `<h3 style="margin:22px 0 6px">Ascunse din calendar</h3>${c.ignore.map(r => `<div class="row"><div class="l"><div class="t">${esc(r)}</div></div><button class="btn sm" onclick="unignore('${esc(r)}')">Arată din nou</button></div>`).join("")}` : ""}
  <h3 style="margin:22px 0 6px">Amintire seara</h3>
  <div class="bar"><span class="small mute" style="flex:1">${pushState() === "on" ? "Pornită ✓ — vine pe la 19:50, doar dacă ai ore neconfirmate." : pushState() === "denied" ? "Oprită din setările iPhone-ului." : "Notificare seara dacă ai ore neconfirmate."}</span><button class="btn sm" onclick="enablePush()">${pushState() === "on" ? "Reconectează" : "Pornește"}</button></div>
  <h3 style="margin:22px 0 6px">Telefonul tău</h3>
  <div class="bar"><button class="btn sm" onclick="pull();toast('Sincronizez…')">Sincronizează acum</button><button class="btn sm" onclick="copy(setupLink())">Copiază linkul de conectare</button><button class="btn sm ghost" onclick="exportJson()">Backup</button></div>
  <p class="small mute">Punct verde lângă H = totul e salvat. Galben = se trimite. Roșu = fără net; se trimite singur când revine.</p>`);
};
window.saveSettings = () => { put("cfg/main", { ...cfg(), defRate: +$("#sR").value || 120, due: $("#sD").value || DEF.due }); closeSheet(); toast("Salvat"); };
window.unignore = r => { const c = cfg(); put("cfg/main", { ...c, ignore: (c.ignore || []).filter(x => x !== r) }); openSettings(); render(); };
window.setupLink = () => location.origin + location.pathname + "#setup=" + btoa(JSON.stringify(S.api));
window.exportJson = () => { const blob = new Blob([JSON.stringify(S.docs, null, 1)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "hannah-backup-" + today() + ".json"; a.click(); };

/* ---------- notificări ---------- */
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function shareApi() { if (!S.api || !("caches" in window)) return; caches.open("hannah-api").then(c => c.put(new URL("__api", location.href).href, new Response(JSON.stringify(S.api)))).catch(() => {}); }
const pushState = () => !pushOK() ? "no" : Notification.permission === "granted" && LS.get("h.push", false) ? "on" : Notification.permission === "denied" ? "denied" : "off";
function b64uToU8(s) { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); }
window.enablePush = async () => {
  if (!pushOK()) { toast(standalone() ? "Telefonul nu suportă notificări (trebuie iOS 16.4+)" : "Deschide aplicația de pe ecranul principal, nu din Safari"); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Notificările au fost refuzate. Se pot porni din Setări → Notificări → Hannah"); render(); return; }
    shareApi();
    const reg = await navigator.serviceWorker.ready;
    const k = await get({ a: "vapid" }); if (!k.key) throw new Error(k.error || "fără cheie");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToU8(k.key) });
    const r = await post({ a: "sub", sub: sub.toJSON() }); if (!r.ok) throw new Error(r.error || "server");
    LS.set("h.push", true); toast("Gata 🔔 Primești notificare seara, doar în zilele cu ore neconfirmate"); render();
  } catch (e) { toast("Nu am putut porni notificările: " + (e.message || e)); }
};
function pushCard() {
  const st = pushState(); if (st === "on" || LS.get("h.pushHide", false)) return "";
  if (!standalone()) return "";
  return `<section class="card" style="display:flex;gap:12px;align-items:center"><div style="font-size:28px">🔔</div><div style="flex:1"><b>Amintire seara</b><div class="small mute">${st === "denied" ? "Notificările sunt oprite. Pornește-le din Setări iPhone → Notificări → Hannah." : "Îți dau de știre seara dacă ai ore neconfirmate."}</div></div>${st === "off" ? `<button class="btn p sm" onclick="enablePush()">Pornește</button>` : ""}<button class="btn ghost sm" onclick="LS.set('h.pushHide',true);render()" aria-label="Ascunde">✕</button></section>`;
}

/* ---------- setup ---------- */
function setupView() {
  return `<section class="card hero"><div class="blob"></div><div class="k">Bun venit 🌸</div><div class="big num" style="font-size:38px">Conectează aplicația</div>
  <p class="sub">Deschide linkul de conectare primit de la Claudiu, sau lipește-l aici.</p>
  <textarea id="setupIn" placeholder="https://…#setup=…"></textarea><button class="btn p full" style="margin-top:10px" onclick="doSetup($('#setupIn').value)">Conectează</button></section>`;
}
window.doSetup = txt => {
  const m = String(txt || "").match(/setup=([A-Za-z0-9+/=_-]+)/); if (!m) { toast("Linkul nu conține datele de conectare"); return false; }
  try { const o = JSON.parse(atob(m[1])); if (!o.u || !o.t) throw 0; S.api = o; LS.set("h.api", o); try { history.replaceState(null, "", location.pathname + "#acasa"); } catch (e) {} S.view = "acasa"; render(); pull(); toast("Conectat 🌸"); return true; }
  catch (e) { toast("Link invalid"); return false; }
};

/* ---------- sheet ---------- */
function sheet(title, body) {
  const sh = $("#sheet");
  sh.innerHTML = `<div class="grab"></div><div class="hd"><h3>${esc(title)}</h3><button class="btn sm ghost" onclick="closeSheet()">Închide</button></div>${body}`;
  sh.classList.add("on"); $("#scrim").classList.add("on"); document.body.style.overflow = "hidden"; sh.scrollTop = 0;
}
window.closeSheet = () => { $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on"); document.body.style.overflow = ""; render(); };
$("#scrim").onclick = closeSheet;
Object.assign(window, { go, copy, toast, pull, $, S, render, LS });

/* ---------- pornire ---------- */
(function boot() {
  if (/setup=/.test(location.hash)) doSetup(location.hash);
  if (!VIEWS[S.view]) S.view = "acasa";
  render();
  if (S.api) { pull(); shareApi(); }
  window.addEventListener("online", () => { S.online = true; flush(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.api) pull(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
