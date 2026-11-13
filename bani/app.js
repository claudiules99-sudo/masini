"use strict";
/* =========================================================
   Bani — aplicație personală de bani (PWA), backend Apps Script
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
const dayName = s => DAYS[parseD(s).getDay()];
const lei = (n, dec) => (Math.round((+n || 0) * 100) / 100).toLocaleString("ro-RO", {minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec === false ? 0 : 2}) + " lei";
const k0 = n => Math.round(+n || 0).toLocaleString("ro-RO");
const fmt2 = n => (+n || 0).toLocaleString("ro-RO", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mkey = s => s.slice(0, 7);
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const normName = s => String(s || "").trim().replace(/\s+/g, " ");
const splitKids = s => normName(s).split(/\s+(?:si|și|\+|&)\s+/i).map(normName).filter(Boolean);
const initials = s => s.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2300); }
async function copy(t) { try { await navigator.clipboard.writeText(t); toast("Copiat"); } catch (e) { toast("Nu am putut copia"); } }
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

/* ---------- stare ---------- */
const DEF = { eur: 5.3398, miraFee: 350, miraFrom: "2026-09-05", defRate: 120, rates: {}, fixed: [], salMin: 4050, ignore: [], lastNr: "" };
const S = {
  api: LS.get("bani.api", null),
  docs: LS.get("bani.docs", {}),
  queue: LS.get("bani.queue", []),
  cal: LS.get("bani.cal", { ore: {}, mira: null }),
  view: (location.hash.slice(1) || "acasa").split("=")[0],
  month: today().slice(0, 7),
  day: today(),
  baniTab: "luna",
  online: true, syncing: false, booted: false,
};
const cfg = () => ({ ...DEF, ...(S.docs["cfg/main"] || {}) });
const coll = pre => { const o = {}; Object.keys(S.docs).forEach(p => { if (p.startsWith(pre + "/")) o[p.slice(pre.length + 1)] = S.docs[p]; }); return o; };
const doc = (p, d) => S.docs[p] || d;

/* ---------- sincronizare ---------- */
function led() { const l = $("#syncLed"); if (!l) return; l.className = "led" + (!S.online ? " off" : (S.syncing || S.queue.length) ? " busy" : ""); l.title = !S.online ? "Offline — modificările se trimit când revine netul" : S.queue.length ? "Se trimit modificările…" : "Sincronizat"; }
function put(path, data) {
  if (data === null) delete S.docs[path]; else S.docs[path] = clone(data);
  LS.set("bani.docs", S.docs);
  S.queue = S.queue.filter(o => o.p !== path); S.queue.push({ p: path, d: data === null ? null : clone(data) });
  LS.set("bani.queue", S.queue); led(); flushSoon();
}
let flushT = null;
function flushSoon() { clearTimeout(flushT); flushT = setTimeout(flush, 400); }
async function flush() {
  if (!S.api || !S.queue.length || S.flushing) return;
  S.flushing = true; S.syncing = true; led();
  const ops = S.queue.slice();
  try {
    const r = await post({ a: "bulk", ops });
    if (r.error) throw new Error(r.error);
    S.queue = S.queue.filter(o => !ops.includes(o)); LS.set("bani.queue", S.queue); S.online = true;
  } catch (e) { S.online = false; setTimeout(flush, 15000); }
  S.flushing = false; S.syncing = false; led();
  if (S.queue.length && S.online) flushSoon();
}
async function post(body) {
  const r = await fetch(S.api.u, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ t: S.api.t, ...body }) });
  return r.json();
}
async function get(params) {
  const q = new URLSearchParams({ t: S.api.t, ...params });
  const r = await fetch(S.api.u + "?" + q.toString());
  return r.json();
}
async function pull() {
  if (!S.api) return;
  S.syncing = true; led();
  try {
    const r = await get({ a: "all" });
    if (r.error) throw new Error(r.error);
    // păstrează modificările locale netrimise
    const pend = {}; S.queue.forEach(o => pend[o.p] = o.d);
    S.docs = r.docs || {};
    Object.entries(pend).forEach(([p, d]) => { if (d === null) delete S.docs[p]; else S.docs[p] = d; });
    LS.set("bani.docs", S.docs); S.online = true;
  } catch (e) { S.online = false; }
  S.syncing = false; led(); render(); flush();
}
async function loadCal(kind, from, to) {
  if (!S.api) return;
  try {
    const r = await get({ a: "cal", k: kind, from, to });
    if (r.error) throw new Error(r.error);
    if (kind === "ore") S.cal.ore[from] = { at: Date.now(), ev: r.events }; else S.cal.mira = { at: Date.now(), ev: r.events };
    LS.set("bani.cal", S.cal); S.calErr = "";
  } catch (e) { S.calErr = "Calendarul nu răspunde acum. Arăt ultima variantă salvată."; }
  render();
}
function monthRange(m) { const [y, mm] = m.split("-").map(Number); return [ymd(new Date(y, mm - 1, 1)), ymd(new Date(y, mm, 1))]; }
function ensureOre(m) { const [a, b] = monthRange(m); const c = S.cal.ore[a]; if (!c || Date.now() - c.at > 5 * 60e3) loadCal("ore", a, b); }
function ensureMira() { const c = S.cal.mira; if (!c || Date.now() - c.at > 15 * 60e3) { const e = new Date(); e.setDate(e.getDate() + 150); loadCal("mira", cfg().miraFrom, ymd(e)); } }

/* ---------- calcule ---------- */
const rateOf = n => { const r = cfg().rates || {}; return r[n] != null ? +r[n] : +cfg().defRate; };
const oreDoc = m => doc("ore/" + m, { d: {}, x: [] });
function lessons(m) {
  const [a] = monthRange(m); const c = S.cal.ore[a]; const ign = cfg().ignore || []; const out = [];
  (c ? c.ev : []).forEach(e => { if (mkey(e.date) !== m || ign.includes(normName(e.summary))) return; splitKids(e.summary).forEach(k => out.push({ date: e.date, time: e.time, name: k, src: "cal", raw: normName(e.summary) })); });
  const od = oreDoc(m);
  Object.entries(od.d || {}).forEach(([d, o]) => Object.keys(o).forEach(n => { if (!out.find(l => l.date === d && l.name === n)) out.push({ date: d, time: "", name: n, src: "saved" }); }));
  (od.x || []).forEach(x => { if (!out.find(l => l.date === x.date && l.name === x.name)) out.push({ date: x.date, time: x.time || "", name: x.name, src: "man", id: x.id }); });
  return out.sort((p, q) => (p.date + p.time).localeCompare(q.date + q.time) || p.name.localeCompare(q.name));
}
function lstate(l) { const st = ((oreDoc(mkey(l.date)).d || {})[l.date] || {})[l.name]; return st ? { s: st.s, r: st.r ?? rateOf(l.name) } : { s: l.src === "man" ? 1 : null, r: rateOf(l.name) }; }
function nowHM() { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function oreSum(m) {
  let total = 0, came = 0, pend = 0, abs = 0; const t = today();
  lessons(m).forEach(l => { const st = lstate(l); if (st.s === 1) { total += +st.r; came++; } else if (st.s === 0) abs++; else if (l.date < t || (l.date === t && (l.time || "00:00") <= nowHM())) pend++; });
  return { total, came, pend, abs };
}
const SKIP = /OCUPAT|\bOFF\b|SHOOTING|LIBER|CONCEDIU|LOBONT/i;
function concerts() {
  const c = cfg(), saved = coll("mira"), list = [];
  ((S.cal.mira && S.cal.mira.ev) || []).forEach(e => {
    if (SKIP.test(e.summary || "") || e.date < c.miraFrom) return;
    const o = saved[e.id] || {}; let st = o.st || (/^concert\s/i.test((e.summary || "").trim()) ? "verifica" : "nefacturat");
    list.push({ id: e.id, date: e.date, title: (e.summary || "").trim(), note: e.desc || "", st, fee: o.fee != null ? +o.fee : +c.miraFee, inv: o.inv || "" });
  });
  Object.entries(saved).forEach(([id, o]) => { if (o.date && o.title && !list.find(x => x.id === id) && o.date >= c.miraFrom && !SKIP.test(o.title)) list.push({ id, date: o.date, title: o.title, note: "", st: o.st || "nefacturat", fee: o.fee != null ? +o.fee : +c.miraFee, inv: o.inv || "" }); });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}
const invs = () => coll("miraInv");
const miraLei = c => { const i = c.st === "facturat" && invs()[c.inv]; return +c.fee * +((i && i.rate) || cfg().eur); };
const miraShort = t => t.replace(/^\(?[PC+ ]+\)\s*/i, "").replace(/^mira\s*,\s*/i, "").trim();
function miraRec(c) { if (c.st === "facturat") { const i = invs()[c.inv]; return i ? (i.paidDate || i.date || c.date) : c.date; } return cfg().miraDeferTo || c.date; }
const events = () => Object.entries(coll("ev")).map(([id, e]) => ({ id, ...e })).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
// evenimentele deja trecute în jurnalul de vânzări (venitul lor e în „venit dinainte”) nu se mai adună a doua oară
const moneyEvents = () => events().filter(e => !e.jurnal);
const subsTot = e => (e.subs || []).reduce((s, x) => s + (+x.amount || 0), 0);
const subDoc = x => x.doc !== false;
const expDoc = m => doc("exp/" + m, { paid: {}, extra: [] });

/* rate (eMAG etc.): din următoarea scadență, lunar, până se termină suma rămasă */
function rateSchedule(p) {
  const out = []; let rest = Math.round((+p.rest || 0) * 100) / 100, d = parseD(p.next), day = d.getDate(), i = 0;
  while (rest > 0.009 && i < 60) { const a = Math.min(+p.a, rest); const dd = new Date(d.getFullYear(), d.getMonth() + i, 1); dd.setDate(Math.min(day, new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate())); out.push({ date: ymd(dd), a: Math.round(a * 100) / 100 }); rest = Math.round((rest - a) * 100) / 100; i++; }
  return out;
}
const debts = () => (doc("dat/main", { list: [] }).list || []);
const debtLeft = d => Math.round(((+d.total || 0) - (d.pays || []).reduce((s, p) => s + (+p.a || 0), 0)) * 100) / 100;
const debtPaidIn = m => debts().filter(d => d.dir !== "mie").flatMap(d => (d.pays || []).filter(p => mkey(p.date) === m)).reduce((s, p) => s + (+p.a || 0), 0);
const rateDue = m => (cfg().rate || []).flatMap(p => rateSchedule(p).filter(x => mkey(x.date) === m).map(x => ({ ...x, id: p.id, n: p.n })));
function monthSum(m) {
  const ore = oreSum(m).total;
  const mira = concerts().filter(c => mkey(c.date) === m && c.st !== "exclus").reduce((s, c) => s + miraLei(c), 0);
  const evs = moneyEvents().filter(e => mkey(e.date || "") === m);
  const ev = evs.reduce((s, e) => s + (+e.amount || 0), 0), subs = evs.reduce((s, e) => s + subsTot(e), 0);
  const ed = expDoc(m), fixed = (cfg().fixed || []).reduce((s, f) => s + (+f.a || 0), 0), extra = (ed.extra || []).filter(x => !x.ii).reduce((s, x) => s + (+x.amount || 0), 0); // cheltuielile firmei (II) nu intră la cheltuielile lunare
  const rate = rateDue(m).reduce((s, x) => s + x.a, 0);
  const dat = debtPaidIn(m);
  const inc = ore + mira + ev, out = fixed + rate + dat + extra + subs;
  return { ore, mira, ev, subs, fixed, rate, dat, extra, inc, out, net: inc - out };
}
function taxYear(y) {
  const ys = String(y), t = today(), c = cfg();
  const mira = concerts().filter(x => x.date <= t && x.st !== "exclus" && x.st !== "verifica" && miraRec(x).startsWith(ys) && miraRec(x) <= t).reduce((s, x) => s + miraLei(x), 0);
  const evs = moneyEvents().filter(e => (e.date || "").startsWith(ys) && (e.date || "") <= t);
  const ev = evs.reduce((s, e) => s + (+e.amount || 0), 0);
  const subs = evs.reduce((s, e) => s + (e.subs || []).filter(subDoc).reduce((a, x) => a + (+x.amount || 0), 0), 0);
  const subsNo = evs.reduce((s, e) => s + (e.subs || []).filter(x => !subDoc(x)).reduce((a, x) => a + (+x.amount || 0), 0), 0);
  let extra = 0, extraNo = 0;
  Object.entries(coll("exp")).forEach(([m, d]) => { if (m.startsWith(ys)) (d.extra || []).forEach(x => { if (!x.ii) return; const v = +x.amount || 0; if (x.cat === "Combustibil") { extra += v / 2; extraNo += v / 2; } else extra += v; }); });
  const prior = y === 2026 ? +c.priorBrut || 0 : 0, priorDed = y === 2026 ? +c.priorDed || 0 : 0, priorNo = y === 2026 ? +c.priorNoDoc || 0 : 0;
  const brut = mira + ev + prior, ded = subs + extra + priorDed, noDoc = subsNo + extraNo + priorNo, net = Math.max(0, brut - ded), sm = +c.salMin;
  let cas = 0, casNote = "sub 12 salarii minime: fără CAS";
  if (net >= 24 * sm) { cas = .25 * 24 * sm; casNote = "bază 24 salarii minime"; } else if (net >= 12 * sm) { cas = .25 * 12 * sm; casNote = "bază 12 salarii minime"; }
  const cassBase = Math.min(Math.max(net, 6 * sm), 72 * sm), cass = .1 * cassBase, imp = .1 * Math.max(0, net - cas - cass), total = cas + cass + imp, profit = brut - ded - noDoc;
  return { mira, ev, prior, brut, ded, noDoc, subs, extra, priorDed, priorNo, net, cas, casNote, cass, cassBase, imp, total, profit, profitNet: profit - total };
}
function icc() {
  const now = new Date(), y = now.getFullYear(), t = taxYear(y);
  const months = Math.max(1, (now - new Date(y, 0, 1)) / (new Date(y + 1, 0, 1) - new Date(y, 0, 1)) * 12);
  const fisc = t.brut - t.ded - t.total, avg = fisc / months, target = 10000;
  return { y, months, fisc, avg, target, ind: Math.min(8500, .85 * avg), yearNeed: 120000, preTax: (120000 + 21870) / .81, rest: 120000 - fisc, ok: avg >= target };
}
function yearSeries(y) {
  // venituri pe luni: facturi din jurnal (hist) + MIRA din aplicație + evenimente + ore cash
  const h = (doc("hist/" + y, {}).months) || {}, out = [];
  for (let i = 1; i <= 12; i++) {
    const m = y + "-" + pad(i), hm = h[m] || {};
    const mira = (hm.mira || 0) + concerts().filter(c => c.st !== "exclus" && c.st !== "verifica" && miraRec(c) <= today() && mkey(miraRec(c)) === m && true).reduce((s, c) => s + miraLei(c), 0);
    const ev = (hm.alte || 0) + moneyEvents().filter(e => mkey(e.date || "") === m && (e.date || "") <= today()).reduce((s, e) => s + (+e.amount || 0), 0);
    const ore = oreSum(m).total;
    out.push({ m, mira, ev, ore, tot: mira + ev + ore });
  }
  return out;
}

/* ---------- navigare ---------- */
const VIEWS = {};
function go(v) { S.view = v; try { history.replaceState(null, "", "#" + v); } catch (e) {} render(); window.scrollTo(0, 0); }
$("#tabs").onclick = e => { const b = e.target.closest("button"); if (b) go(b.dataset.v); };
function shiftMonth(n) { const [y, m] = S.month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); S.month = ymd(d).slice(0, 7); if (S.view === "ore") { S.day = S.month === today().slice(0, 7) ? today() : S.month + "-01"; } render(); }
$("#mPrev").onclick = () => shiftMonth(-1); $("#mNext").onclick = () => shiftMonth(1);
$("#mLbl").onclick = () => { S.month = today().slice(0, 7); S.day = today(); render(); };

function render() {
  const [y, m] = S.month.split("-").map(Number);
  $("#mLbl").textContent = MONTHS[m - 1] + " " + y;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === S.view));
  if (!S.api) { $("#main").innerHTML = setupView(); bindSetup(); return; }
  if (S.view === "ore") ensureOre(mkey(S.day));
  if (S.view === "acasa") ensureOre(S.month);
  ensureMira();
  $("#main").innerHTML = (VIEWS[S.view] || VIEWS.acasa)();
  led();
}

/* ---------- MASTER ---------- */
VIEWS.acasa = () => {
  const y = +today().slice(0, 4), t = taxYear(y), c = icc(), ms = monthSum(S.month), os = oreSum(S.month);
  const cs = concerts(), td = today();
  const toBill = cs.filter(x => x.date <= td && (x.st === "nefacturat" || x.st === "verifica"));
  const unpaid = Object.values(invs()).filter(i => !i.paid);
  const subsDue = []; moneyEvents().forEach(e => (e.subs || []).forEach(x => { if (!x.paid && +x.amount) subsDue.push(x); }));
  const clientDue = moneyEvents().filter(e => +e.amount && !e.clientPaid && (e.date || "") <= td);
  const ed = expDoc(S.month), fixedUn = [...(cfg().fixed || []).filter(f => !(ed.paid || {})[f.id]), ...rateDue(S.month).filter(x => !(ed.paid || {})["r:" + x.id])];
  const todo = [];
  if (os.pend) todo.push(["ore", `${os.pend} ${os.pend === 1 ? "oră de confirmat" : "ore de confirmat"}`, "", "var(--ore)"]);
  if (toBill.length) todo.push(["mira", `MIRA: ${toBill.length} de facturat`, lei(toBill.filter(x => x.st === "nefacturat").reduce((s, x) => s + miraLei(x), 0), false), "var(--mira)"]);
  if (unpaid.length) todo.push(["mira", `MIRA: ${unpaid.length} ${unpaid.length === 1 ? "factură neîncasată" : "facturi neîncasate"}`, "", "var(--mira)"]);
  if (clientDue.length) todo.push(["ev", `${clientDue.length} ${clientDue.length === 1 ? "eveniment neîncasat" : "evenimente neîncasate"}`, "", "var(--ev)"]);
  if (subsDue.length) todo.push(["ev", `${subsDue.length} ${subsDue.length === 1 ? "subcontractor neplătit" : "subcontractori neplătiți"}`, lei(subsDue.reduce((s, x) => s + +x.amount, 0), false), "var(--bad)"]);
  if (fixedUn.length) todo.push(["bani", `${fixedUn.length} ${fixedUn.length === 1 ? "plată fixă nebifată" : "plăți fixe și rate nebifate"}`, "", "var(--exp)"]);

  // meter: 0..15000 lei/lună, prag 10000
  const N = 40, max = 15000, lit = Math.round(Math.min(max, Math.max(0, c.avg)) / max * N), zeroAt = Math.round(c.target / max * N);
  const leds = Array.from({ length: N }, (_, i) => `<i class="${i < lit ? (i < zeroAt ? "g" : "a") : ""}"></i>`).join("");
  const mx = Math.max(ms.ore, ms.mira, ms.ev, 1);
  const strip = (name, v, col, view, hint) => `<div class="strip" style="--c:${col}" onclick="go('${view}')"><div class="name">${name}</div><div class="vu"><b style="height:${Math.max(4, v / mx * 100)}%"></b></div><div class="amt num">${k0(v)}</div><div class="hint">${hint}</div></div>`;
  return `
  <section class="panel master">
    <div class="k">Profit II ${y}, după taxe</div>
    <div class="big num" data-count="${Math.round(t.profitNet)}">${k0(t.profitNet)}<small>lei</small></div>
    <div class="cap">venit ${k0(t.brut)} − cheltuieli ${k0(t.ded + t.noDoc)} − taxe ${k0(t.total)}</div>
    <div class="meter" aria-label="Media lunară față de pragul indemnizației maxime">
      <div class="leds">${leds}</div>
      <div class="scale"><span class="zero" style="left:${zeroAt / N * 100}%"></span><span style="left:0;transform:none">0</span><span style="left:${zeroAt / N * 100}%">10.000</span><span style="left:100%;transform:translateX(-100%)">15.000</span></div>
      <div class="legend"><span>Media ta <b class="num" style="font-size:17px">${k0(c.avg)}</b> lei/lună</span><span class="${c.ok ? "ok" : "lampc"}">${c.ok ? "indemnizație maximă" : "sub prag"} · <b class="num" style="font-size:17px">${k0(c.ind)}</b></span></div>
    </div>
  </section>
  <div class="strips">
    ${strip("Ore", ms.ore, "var(--ore)", "ore", os.pend ? `${os.pend} de confirmat` : `${os.came} prezențe`)}
    ${strip("MIRA", ms.mira, "var(--mira)", "mira", `${cs.filter(x => mkey(x.date) === S.month && x.st !== "exclus").length} concerte`)}
    ${strip("Evenimente", ms.ev, "var(--ev)", "ev", `${events().filter(e => mkey(e.date || "") === S.month).length} în ${MSHORT[+S.month.slice(5) - 1]}`)}
  </div>
  <section class="panel"><h2>De făcut</h2>${todo.map(([v, x, val, col]) => `<div class="todo" style="--c:${col}" onclick="go('${v}')"><span class="dot"></span><span class="x">${esc(x)}</span><span class="v">${val}</span></div>`).join("") || `<div class="empty">Totul e la zi.</div>`}</section>
  <section class="panel"><div class="bar"><h2 style="margin:0">Venituri ${y}</h2><span class="sp"></span><span class="sub num" style="font-size:17px">${k0(yearSeries(y).reduce((s, x) => s + x.tot, 0))} lei</span></div>${chart(y)}</section>
  <section class="panel"><div class="bar"><h2 style="margin:0">Luna asta</h2><span class="sp"></span><span class="num ${ms.net < 0 ? "bad" : ""}" style="font-size:22px;font-weight:700">${k0(ms.net)} lei</span></div>
    <div class="sub">intră ${k0(ms.inc)} · ies ${k0(ms.out)} (fixe ${k0(ms.fixed)}, rate ${k0(ms.rate)}, subcontractori ${k0(ms.subs)}, alte ${k0(ms.extra)})</div></section>`;
};
function chart(y) {
  const s = yearSeries(y), W = 340, H = 150, pb = 18, bw = 18, gap = (W - 12 * bw) / 12, max = Math.max(...s.map(x => x.tot), 1);
  const curM = today().slice(0, 7);
  const bars = s.map((x, i) => {
    const X = gap / 2 + i * (bw + gap); let yy = H - pb; const seg = (v, col) => { if (!v) return ""; const h = v / max * (H - pb - 8); yy -= h; return `<rect x="${X}" y="${yy}" width="${bw}" height="${Math.max(h, 0)}" rx="3" fill="${col}"/>`; };
    return `<g class="col" data-i="${i}">${seg(x.mira, "var(--mira)")}${seg(x.ev, "var(--ev)")}${seg(x.ore, "var(--ore)")}<rect x="${X - gap / 2}" y="0" width="${bw + gap}" height="${H}" fill="transparent"/><text x="${X + bw / 2}" y="${H - 3}" text-anchor="middle" font-size="10" fill="${x.m === curM ? "var(--lamp)" : "var(--mute)"}" font-family="Barlow">${MSHORT[i]}</text></g>`;
  }).join("");
  return `<div class="chart" id="chart"><svg viewBox="0 0 ${W} ${H}">${bars}</svg><div class="tip" id="tip"></div></div>
  <div class="keys"><span style="--c:var(--mira)"><i></i>MIRA</span><span style="--c:var(--ev)"><i></i>Facturi & evenimente</span><span style="--c:var(--ore)"><i></i>Ore cash</span></div>`;
}
document.addEventListener("click", e => {
  const g = e.target.closest("#chart .col"); const tip = $("#tip"); if (!tip) return;
  if (!g) { tip.classList.remove("on"); return; }
  const x = yearSeries(+today().slice(0, 4))[+g.dataset.i], box = $("#chart").getBoundingClientRect(), r = g.getBoundingClientRect();
  tip.innerHTML = `<b>${MONTHS[+g.dataset.i]}</b><div class="bar"><span>MIRA</span><span class="sp"></span><span class="num">${k0(x.mira)}</span></div><div class="bar"><span>Facturi & ev.</span><span class="sp"></span><span class="num">${k0(x.ev)}</span></div><div class="bar"><span>Ore</span><span class="sp"></span><span class="num">${k0(x.ore)}</span></div><div class="bar"><b>Total</b><span class="sp"></span><b class="num">${k0(x.tot)}</b></div>`;
  tip.style.left = Math.min(box.width - 80, Math.max(80, r.left - box.left + r.width / 2)) + "px"; tip.style.top = "8px"; tip.classList.add("on");
});

/* ---------- ORE ---------- */
VIEWS.ore = () => {
  const d0 = parseD(S.day), mon = new Date(d0); mon.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return ymd(x); });
  const months = [...new Set(week.map(mkey))]; months.forEach(ensureOre);
  const all = months.flatMap(lessons), td = today();
  const dayCell = d => { const ls = all.filter(l => l.date === d); const pips = ls.slice(0, 6).map(l => { const s = lstate(l).s; return `<i class="${s === 1 ? "y" : s === 0 ? "n" : ""}"></i>`; }).join("");
    return `<div class="day ${d === S.day ? "on" : ""} ${d === td ? "today" : ""}" onclick="pickDay('${d}')"><div class="dn">${DSHORT[parseD(d).getDay()]}</div><div class="dd num">${+d.slice(8)}</div><div class="pips">${pips}</div></div>`; };
  const ls = all.filter(l => l.date === S.day), m = mkey(S.day), os = oreSum(m);
  const dayTot = ls.reduce((s, l) => { const st = lstate(l); return s + (st.s === 1 ? +st.r : 0); }, 0);
  const anyPend = ls.some(l => lstate(l).s == null);
  const [a] = monthRange(m), cal = S.cal.ore[a];
  return `
  <section class="panel" style="padding:14px 16px">
    <div class="bar"><div><div class="sub">${MONTHS[+m.slice(5) - 1]}, cash</div><div class="num" style="font-size:34px;font-weight:700;line-height:1.1">${k0(os.total)} <span class="mute" style="font-size:18px">lei</span></div></div><span class="sp"></span>
    <div style="text-align:right"><div class="num" style="font-size:22px;font-weight:600">${os.came}</div><div class="sub">prezențe</div></div>
    <div style="text-align:right;margin-left:14px"><div class="num ${os.pend ? "lampc" : ""}" style="font-size:22px;font-weight:600">${os.pend}</div><div class="sub">de confirmat</div></div></div>
    ${S.calErr ? `<div class="small lampc" style="margin-top:8px">${esc(S.calErr)}</div>` : !cal ? `<div class="small mute" style="margin-top:8px">Citesc calendarul…</div>` : ""}
  </section>
  <div class="weeknav"><button onclick="shiftWeek(-7)">‹ săpt. trecută</button><button onclick="pickDay('${td}')">azi</button><button onclick="shiftWeek(7)">săpt. viitoare ›</button></div>
  <div class="week">${week.map(dayCell).join("")}</div>
  <section class="panel">
    <div class="bar" style="margin-bottom:10px"><h2 style="margin:0">${dayName(S.day)}, ${+S.day.slice(8)} ${MONTHS[+S.day.slice(5, 7) - 1]}</h2><span class="sp"></span><span class="num" style="font-size:20px;font-weight:600">${k0(dayTot)} lei</span></div>
    ${ls.length ? `<div class="kids">${ls.map(kidRow).join("")}</div>` : `<div class="empty">Nicio oră în ziua asta.</div>`}
    <div class="bar" style="margin-top:12px">${anyPend && S.day <= td ? `<button class="btn p" onclick="allCame()">Toți au venit</button>` : ""}<span class="sp"></span><button class="btn sm ghost" onclick="openAddLesson()">+ oră manuală</button></div>
    ${ls.length ? `<div class="small mute" style="margin-top:8px">Apasă din nou pe același buton ca să anulezi.</div>` : ""}
  </section>`;
};
function kidRow(l) {
  const st = lstate(l), cls = st.s === 1 ? "y" : st.s === 0 ? "n" : "";
  const key = esc(JSON.stringify({ d: l.date, n: l.name, src: l.src, id: l.id || "", raw: l.raw || "" }));
  const lbl = st.s === 1 ? `+${k0(st.r)}` : st.s === 0 ? "absent" : `${k0(st.r)} lei`;
  const canHide = l.src === "cal" && st.s == null && !(cfg().rates || {})[l.name] && !knownKid(l.name) && evCount(l.raw) <= 1;
  return `<div class="kid ${cls}" data-k="${key}"><div class="av">${st.s === 1 ? "✓" : esc(initials(l.name))}</div><div style="flex:1;min-width:0"><div class="nm">${esc(l.name)}</div><div class="tm">${l.time || ""}${l.time ? " · " : ""}${k0(st.r)} lei${l.src === "man" ? " · manuală" : ""}</div></div>
    ${canHide ? `<button class="hide" title="Nu e oră" onclick="event.stopPropagation();ignoreEv('${esc(l.raw)}')"><svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c5 0 9 6 9 6a17 17 0 01-3.2 3.8M6.3 7.3A17 17 0 003 12s4 6 9 6a9 9 0 004.3-1.1"/></svg></button>` : ""}
    <div class="yn"><button class="y ${st.s === 1 ? "on" : ""}" onclick="setKid(this,1)">A venit</button><button class="n ${st.s === 0 ? "on" : ""}" onclick="setKid(this,0)">Absent</button></div></div>`;
}
function evCount(raw) { let n = 0; Object.values(S.cal.ore).forEach(c => (c.ev || []).forEach(e => { if (normName(e.summary) === raw) n++; })); return n; }
function knownKid(n) { return Object.values(coll("ore")).some(od => Object.values(od.d || {}).some(o => o[n] && o[n].s === 1)); }
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
window.cycleKid = el => {
  const k = JSON.parse(el.dataset.k), m = mkey(k.d), od = clone(oreDoc(m)); od.d = od.d || {}; od.d[k.d] = od.d[k.d] || {};
  const cur = od.d[k.d][k.n];
  if (k.src === "man") { if (cur && cur.s === 0) { od.x = (od.x || []).filter(x => x.id !== k.id); delete od.d[k.d][k.n]; } else od.d[k.d][k.n] = { s: 0, r: rateOf(k.n) }; }
  else if (!cur) od.d[k.d][k.n] = { s: 1, r: rateOf(k.n) };
  else if (cur.s === 1) od.d[k.d][k.n] = { s: 0, r: cur.r };
  else delete od.d[k.d][k.n];
  put("ore/" + m, od); render();
  const n = document.querySelector(`.kid[data-k='${CSS.escape(el.dataset.k)}'] .av`); if (n) n.classList.add("pop");
  if (navigator.vibrate) navigator.vibrate(8);
};
window.allCame = () => { const m = mkey(S.day), od = clone(oreDoc(m)); od.d = od.d || {}; od.d[S.day] = od.d[S.day] || {}; lessons(m).filter(l => l.date === S.day).forEach(l => { if (!od.d[S.day][l.name]) od.d[S.day][l.name] = { s: 1, r: rateOf(l.name) }; }); put("ore/" + m, od); render(); toast("Toți marcați: au venit"); };
window.ignoreEv = raw => { const c = cfg(); c.ignore = [...new Set([...(c.ignore || []), raw])]; put("cfg/main", c); render(); toast(`„${raw}” nu mai apare la ore`); };
window.openAddLesson = () => sheet("Oră manuală", `
  <label class="field"><span>Copil</span><input id="axN" list="kidsDL" placeholder="Nume"></label>
  <datalist id="kidsDL">${knownKids().map(k => `<option value="${esc(k)}">`).join("")}</datalist>
  <div class="g2"><label class="field"><span>Data</span><input id="axD" type="date" value="${S.day}"></label><label class="field"><span>Sumă (lei)</span><input id="axR" type="number" inputmode="decimal" placeholder="${cfg().defRate}"></label></div>
  <button class="btn p full" onclick="addLesson()">Adaugă ora</button>`);
window.addLesson = () => { const n = normName($("#axN").value), d = $("#axD").value, r = $("#axR").value; if (!n || !d) { toast("Pune numele și data"); return; } const m = mkey(d), od = clone(oreDoc(m)); od.x = od.x || []; od.x.push({ id: uid(), date: d, name: n }); od.d = od.d || {}; od.d[d] = od.d[d] || {}; od.d[d][n] = { s: 1, r: r !== "" ? +r : rateOf(n) }; put("ore/" + m, od); closeSheet(); S.day = d; render(); toast("Ora a fost adăugată"); };
function knownKids() { const s = new Set(Object.keys(cfg().rates || {})); Object.values(S.cal.ore).forEach(c => (c.ev || []).forEach(e => { if (!(cfg().ignore || []).includes(normName(e.summary))) splitKids(e.summary).forEach(k => s.add(k)); })); Object.values(coll("ore")).forEach(od => Object.values(od.d || {}).forEach(o => Object.keys(o).forEach(k => s.add(k)))); return [...s].sort((a, b) => a.localeCompare(b, "ro")); }

/* ---------- MIRA ---------- */
VIEWS.mira = () => {
  const td = today(), cs = concerts(), c = cfg();
  const toBill = cs.filter(x => x.date <= td && (x.st === "nefacturat" || x.st === "verifica")), nf = toBill.filter(x => x.st === "nefacturat");
  const up = cs.filter(x => x.date > td && x.st !== "exclus");
  const iv = Object.entries(invs()).map(([id, i]) => ({ id, ...i })).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const it = (x, col) => `<div class="it ${x.date <= td ? "done" : ""}" style="--c:${col}" onclick="openConcert('${esc(x.id)}')"><div class="bar"><div class="t">${esc(miraShort(x.title))}</div><span class="sp"></span>${x.st === "verifica" ? `<span class="chip warn">de verificat</span>` : x.st === "exclus" ? `<span class="chip">nu se plătește</span>` : ""}</div><div class="s">${dayName(x.date)} ${ro(x.date)} · ${x.fee} € ≈ ${lei(miraLei(x), false)}${x.note ? " · " + esc(x.note) : ""}</div></div>`;
  return `
  <section class="panel master" style="--c:var(--mira)">
    <div class="k">De facturat la Miralicious</div>
    <div class="big num">${k0(nf.reduce((s, x) => s + miraLei(x), 0))}<small>lei</small></div>
    <div class="cap">${nf.length} concerte · ${nf.reduce((s, x) => s + +x.fee, 0)} € la ${fmt2(c.eur)} lei/€${c.miraDeferTo ? ` · se încasează în ${ro(c.miraDeferTo).slice(3)}` : ""}</div>
    ${toBill.length ? `<div class="bar" style="margin-top:14px"><button class="btn p" onclick="openBill()">Am facturat</button><button class="btn" onclick="copyLines()">Copiază rânduri factură</button></div>` : ""}
    ${S.calErr ? `<div class="small lampc" style="margin-top:8px">${esc(S.calErr)}</div>` : ""}
  </section>
  ${toBill.length ? `<section class="panel"><h2>Cântate, nefacturate</h2><div class="tl">${toBill.map(x => it(x, "var(--mira)")).join("")}</div></section>` : ""}
  <section class="panel"><h2>Urmează</h2>${up.length ? `<div class="tl">${up.map(x => it(x, "var(--faint)")).join("")}</div>` : `<div class="empty">Niciun concert programat.</div>`}</section>
  <section class="panel"><h2>Facturi trimise</h2>${iv.map(i => `<div class="row"><div class="l"><div class="t">${esc(i.nr || "—")}</div><div class="s">${i.date ? ro(i.date) : ""} · ${(i.ids || []).length} concerte${i.rate ? ` · ${fmt2(i.rate)} lei/€` : ""}</div></div><div class="v">${k0(i.total)}</div>
    <label class="check"><input type="checkbox" ${i.paid ? "checked" : ""} onchange="invPaid('${esc(i.id)}',this.checked)"><span class="box"></span></label></div>`).join("") || `<div class="empty">Ultima factură (SEU 0187, 09.09.2026) acoperă concertele până la 04.09.</div>`}
    ${iv.length ? `<div class="small mute">Bifa = încasată.</div>` : ""}</section>`;
};
window.copyLines = () => { const t = today(); copy(concerts().filter(c => c.date <= t && c.st === "nefacturat").map(c => `PRESTATIE ARTISTICA - CONCERT ${miraShort(c.title).toUpperCase()} - ${ro(c.date)}`).join("\n")); };
window.invPaid = (id, v) => { const i = clone(invs()[id]); i.paid = v; if (v) i.paidDate = today(); else delete i.paidDate; put("miraInv/" + id, i); render(); };
window.openConcert = id => {
  const c = concerts().find(x => x.id === id); if (!c) return;
  sheet(miraShort(c.title), `<p class="sub" style="margin-top:0">${dayName(c.date)} ${ro(c.date)}${c.note ? " · " + esc(c.note) : ""}</p>
  <label class="field"><span>Onorariu (€)</span><input id="ceFee" type="number" inputmode="decimal" value="${c.fee}"></label>
  <div class="seg" id="ceSt">${[["nefacturat", "De facturat"], ["verifica", "De verificat"], ["exclus", "Nu se plătește"], ["facturat", "Facturat"]].map(([v, l]) => `<button data-v="${v}" class="${c.st === v ? "on" : ""}" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${l}</button>`).join("")}</div>
  <button class="btn p full" onclick="saveConcert('${esc(id)}')">Salvează</button>`);
};
window.saveConcert = id => { const c = concerts().find(x => x.id === id); const o = { ...(coll("mira")[id] || {}), date: c.date, title: c.title, fee: +$("#ceFee").value, st: $("#ceSt .on").dataset.v }; put("mira/" + id, o); closeSheet(); render(); };
window.openBill = () => {
  const t = today(), cs = concerts().filter(c => c.date <= t && c.st === "nefacturat"), c = cfg();
  const nums = [c.lastNr || "SEU 0195", ...Object.values(invs()).map(i => i.nr || "")].filter(Boolean);
  const n = s => +((s.match(/(\d+)(?!.*\d)/) || [0, 0])[1]);
  const last = nums.sort((a, b) => n(a) - n(b)).pop(), next = last.replace(/(\d+)(?!.*\d)/, d => String(+d + 1).padStart(d.length, "0"));
  sheet("Am facturat", `${cs.map(x => `<label class="check" style="border-top:1px solid var(--line);padding:10px 0"><input type="checkbox" class="bc" value="${esc(x.id)}" checked onchange="billTot()"><span class="box"></span><span style="flex:1">${esc(miraShort(x.title))}<br><span class="small mute">${ro(x.date)}</span></span></label>`).join("")}
  <div class="g3" style="margin-top:12px"><label class="field"><span>Nr. factură</span><input id="bNr" value="${esc(next)}"></label><label class="field"><span>Data</span><input id="bD" type="date" value="${t}"></label><label class="field"><span>Curs BNR</span><input id="bR" type="number" step="0.0001" inputmode="decimal" value="${c.eur}" oninput="billTot()"></label></div>
  <div class="sub" id="bUnit"></div><div class="bar" style="margin-top:12px"><b class="num" id="bTot" style="font-size:26px"></b><span class="sp"></span><button class="btn p" onclick="saveBill()">Salvează factura</button></div>`);
  billTot();
};
window.billTot = () => { const r = +$("#bR").value || cfg().eur, ids = [...document.querySelectorAll(".bc:checked")].map(x => x.value), cs = concerts(); $("#bTot").textContent = lei(cs.filter(c => ids.includes(c.id)).reduce((s, c) => s + Math.round(+c.fee * r * 100) / 100, 0)); $("#bUnit").textContent = `Preț unitar pe factură: ${fmt2(cfg().miraFee * r)} lei / concert`; };
window.saveBill = () => {
  const ids = [...document.querySelectorAll(".bc:checked")].map(x => x.value); if (!ids.length) { toast("Bifează cel puțin un concert"); return; }
  const r = +$("#bR").value || cfg().eur, nr = $("#bNr").value.trim(), date = $("#bD").value, cs = concerts(), id = uid();
  const total = cs.filter(c => ids.includes(c.id)).reduce((s, c) => s + Math.round(+c.fee * r * 100) / 100, 0);
  put("miraInv/" + id, { nr, date, ids, rate: r, total: Math.round(total * 100) / 100, paid: false });
  ids.forEach(cid => { const c = cs.find(x => x.id === cid); put("mira/" + cid, { ...(coll("mira")[cid] || {}), date: c.date, title: c.title, fee: c.fee, st: "facturat", inv: id }); });
  put("cfg/main", { ...cfg(), lastNr: nr, eur: r }); closeSheet(); render(); toast("Factura " + nr + " salvată");
};

/* ---------- EVENIMENTE ---------- */
VIEWS.ev = () => {
  const td = today(), all = events(), up = all.filter(e => (e.date || "") >= td), past = all.filter(e => (e.date || "") < td).reverse();
  const card = e => { const s = subsTot(e), a = +e.amount || 0, un = (e.subs || []).filter(x => !x.paid && +x.amount).length, keep = a - s;
    return `<div class="evc" onclick="openEvent('${esc(e.id)}')"><div class="bar"><div style="min-width:0;flex:1"><h3>${esc(e.name || "Fără nume")}</h3><div class="sub">${e.date ? dayName(e.date) + " " + ro(e.date) : "fără dată"} · ${esc(e.type || "")}${e.client ? " · " + esc(e.client) : ""}</div></div>
    <div style="text-align:right"><div class="num" style="font-size:22px;font-weight:700">${a ? k0(a) : e.eur ? e.eur + " €" : "—"}</div>${e.jurnal ? `<span class="chip">în jurnal</span>` : !e.clientPaid && a ? `<span class="chip warn">neîncasat</span>` : ""}</div></div>
    ${a ? `<div class="split"><i style="width:${Math.max(0, keep) / a * 100}%;background:var(--ok)"></i><i style="width:${Math.min(s, a) / a * 100}%;background:var(--exp)"></i></div>
    <div class="bar small"><span class="ok">rămâne ${k0(keep)}</span><span class="sp"></span><span class="${un ? "bad" : "mute"}">subcontractori ${k0(s)}${un ? ` · ${un} neplătiți` : ""}</span></div>` : ""}</div>`; };
  return `<div class="bar" style="margin:2px 2px 12px"><h2 style="margin:0">Evenimente</h2><span class="sp"></span><button class="btn p sm" onclick="newEvent()">+ Eveniment</button></div>
  <div class="sub" style="margin:0 2px 8px">Urmează</div>${up.map(card).join("") || `<div class="panel"><div class="empty">Niciun eveniment viitor. Adaugă sonorizări, închirieri sau proiecte.</div></div>`}
  ${past.length ? past.map((e, i) => (i === 0 || mkey(e.date || "") !== mkey(past[i - 1].date || "") ? `<div class="sub" style="margin:16px 2px 8px">${e.date ? MONTHS[+e.date.slice(5, 7) - 1] + " " + e.date.slice(0, 4) : "Fără dată"}</div>` : "") + card(e)).join("") : `<div class="empty">—</div>`}
  <div class="small mute" style="margin:10px 2px">„În jurnal” = facturat înainte de aplicație; suma e deja la venitul dinainte și nu se mai adună o dată.</div>`;
};
let EV = null, EVID = null;
window.newEvent = () => { EVID = uid(); EV = { name: "", date: today(), type: "Sonorizare", client: "", amount: 0, clientPaid: false, notes: "", subs: [], rider: null }; evSheet(true); };
window.openEvent = id => { EVID = id; EV = clone(coll("ev")[id]); EV.subs = EV.subs || []; evSheet(false); };
const RIDER = () => ({ artist: "", venue: "", contact: "", loadin: "", soundcheck: "", show: "", pa: "", foh: "", inputs: [{ ch: 1, src: "Kick", mic: "", stand: "", note: "" }], mons: [{ mix: 1, who: "", type: "wedge", note: "" }], backline: "", power: "", lights: "", notes: "" });
let evT = null; const evSave = now => { clearTimeout(evT); const f = () => { if (EV && EV.name) put("ev/" + EVID, EV); }; if (now) f(); else evT = setTimeout(f, 700); };
function evSheet(isNew) {
  const e = EV, s = subsTot(e), keep = (+e.amount || 0) - s;
  sheet(isNew ? "Eveniment nou" : e.name || "Eveniment", `
  <label class="field"><span>Nume</span><input value="${esc(e.name)}" oninput="EVset('name',this.value)" placeholder="ex. Nuntă Alba Iulia"></label>
  <div class="g2"><label class="field"><span>Data</span><input type="date" value="${esc(e.date)}" onchange="EVset('date',this.value,1)"></label>
  <label class="field"><span>Tip</span><select onchange="EVset('type',this.value,1)">${["Sonorizare", "Închiriere", "Scenă", "Proiect", "Ecran LED", "Concert", "Injectări", "Altele"].map(t => `<option ${e.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
  <label class="field"><span>Client</span><input value="${esc(e.client)}" oninput="EVset('client',this.value)"></label>
  <label class="field"><span>Sumă de la client (lei)</span><input type="number" inputmode="decimal" value="${e.amount || ""}" onchange="EVset('amount',+this.value,1,1)"></label></div>
  <label class="check"><input type="checkbox" ${e.clientPaid ? "checked" : ""} onchange="EVset('clientPaid',this.checked,1)"><span class="box"></span>Clientul a plătit</label>
  <label class="check"><input type="checkbox" ${e.jurnal ? "checked" : ""} onchange="EVset('jurnal',this.checked,1)"><span class="box"></span>Deja în jurnalul de vânzări (nu-l mai aduna la venit)</label>
  <label class="field" style="margin-top:6px"><span>Note</span><textarea oninput="EVset('notes',this.value)">${esc(e.notes)}</textarea></label>
  <section class="panel" style="margin-top:6px"><div class="bar"><span>Încasat</span><span class="sp"></span><b class="num" style="font-size:19px">${k0(e.amount)}</b></div><div class="bar"><span>Subcontractori</span><span class="sp"></span><b class="num" style="font-size:19px">−${k0(s)}</b></div><div class="bar" style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><b>Îți rămâne</b><span class="sp"></span><b class="num ${keep < 0 ? "bad" : "ok"}" style="font-size:24px">${k0(keep)} lei</b></div></section>
  <div class="bar" style="margin:16px 0 6px"><h3>Subcontractori</h3><span class="sp"></span><button class="btn sm" onclick="subAdd()">+ Adaugă</button></div>
  ${e.subs.map(subCard).join("") || `<div class="empty">Niciunul.</div>`}
  <div class="bar" style="margin:18px 0 6px"><h3>Rider tehnic</h3><span class="sp"></span>${e.rider ? `<button class="btn sm" onclick="copy(riderText(EV))">Copiază</button><button class="btn sm p" onclick="riderPdf(this)">PDF</button>` : `<button class="btn sm" onclick="EV.rider=RIDER();EV.rider.venue=EV.name;evSheet()">+ Creează rider</button>`}</div>
  ${e.rider ? riderForm(e.rider) : ""}
  <div class="bar" style="margin-top:18px"><button class="btn ghost" onclick="delEvent()">Șterge evenimentul</button><span class="sp"></span>${cfg().notesOff ? "" : `<button class="btn sm" onclick="if(EV.name){EV.nt=1;evSave(1);toNotes(EV)}">${e.nt ? "Trimite din nou în Notes" : "Trimite în Notes"}</button>`}<button class="btn p" onclick="evDone()">Gata</button></div>
  <div class="small mute" style="margin-top:8px">Evenimentul apare singur în calendarul Google „Evenimente”${cfg().notesOff ? "" : " și, la Gata, se adaugă în nota „" + esc(NOTE_NAME) + "”"}.</div>`, true);
}
const NOTE_NAME = "Evenimente 2026", SHORTCUT = "Bani Notes";
const noteLine = e => { const [y, m, d] = (e.date || "").split("-"); const dt = e.date ? `${+d} ${MONTHS[+m - 1].slice(0, 3)}${y !== String(new Date().getFullYear()) ? " " + y : ""}` : "fără dată";
  return [dt, e.name, e.client, +e.amount ? k0(e.amount) + " lei" : ""].filter(Boolean).join(" – "); };
window.toNotes = e => { const u = "shortcuts://run-shortcut?name=" + encodeURIComponent(SHORTCUT) + "&input=text&text=" + encodeURIComponent(noteLine(e)); setTimeout(() => { location.href = u; }, 350); };
window.evDone = () => { if (!EV.name) { toast("Pune un nume"); return; } const send = !EV.nt && !cfg().notesOff; if (send) EV.nt = 1; evSave(1); closeSheet(); render(); toast(send ? "Salvat · îl trimit în Notes" : "Salvat"); if (send) toNotes(EV); };
window.EVset = (k, v, now, rerender) => { EV[k] = v; evSave(now); if (rerender) { const y = $("#sheet").scrollTop; evSheet(); $("#sheet").scrollTop = y; } };
window.evSync = async b => { if (!S.api) return; b.disabled = true; b.textContent = "Se pun în calendar…";
  try { const r = await fetch(S.api.u, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ t: S.api.t, a: "evsync" }) }).then(r => r.json()); toast(r.ok ? r.n + " evenimente în calendar" : "Eroare: " + (r.error || "")); }
  catch (e) { toast("Nu am putut ajunge la script"); } b.disabled = false; b.textContent = "Pune toate evenimentele în calendar"; };
window.delEvent = () => { if (!confirmBox("Ștergi evenimentul?")) return; put("ev/" + EVID, null); closeSheet(); render(); };
function confirmBox(msg) { try { return window.confirm(msg); } catch (e) { return true; } }
function subCard(x, i) {
  const inv = x.inv;
  return `<div class="panel" data-sub="${i}" style="padding:12px;margin-bottom:8px">
  <div class="g2"><label class="field"><span>Nume</span><input placeholder="ex. Sora Darius PFA" value="${esc(x.name)}" oninput="SUBset(${i},'name',this.value)"></label><label class="field"><span>Sumă (lei)</span><input type="number" inputmode="decimal" value="${x.amount || ""}" onchange="SUBset(${i},'amount',+this.value,1)"></label></div>
  <div class="bar"><label class="check"><input type="checkbox" ${x.paid ? "checked" : ""} onchange="SUBset(${i},'paid',this.checked,1)"><span class="box"></span>plătit</label>
  <label class="check" style="margin-left:10px"><input type="checkbox" ${x.doc !== false ? "checked" : ""} onchange="SUBset(${i},'doc',this.checked,1)"><span class="box"></span>cu acte</label><span class="sp"></span>
  <label class="btn sm">${inv ? "Altă factură" : "Factura"}<input type="file" accept="image/*,application/pdf" hidden onchange="readInv(${i},this.files[0])"></label><button class="btn sm ghost" onclick="subDel(${i})">Șterge</button></div>
  ${inv ? invBox(inv, i) : ""}</div>`;
}
window.SUBset = (i, k, v, re) => { EV.subs[i][k] = v; evSave(re); if (re) { const y = $("#sheet").scrollTop; evSheet(); $("#sheet").scrollTop = y; } };
window.subAdd = () => { EV.subs.push({ name: "", amount: 0, paid: false, doc: true }); evSheet(); const i = EV.subs.length - 1, card = document.querySelector(`#sheet [data-sub="${i}"]`);
  if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); const inp = card.querySelector("input"); setTimeout(() => inp && inp.focus({ preventScroll: true }), 300); } };
window.subDel = i => { if (!confirmBox("Ștergi subcontractorul?")) return; const y = $("#sheet").scrollTop; EV.subs.splice(i, 1); evSave(1); evSheet(); $("#sheet").scrollTop = y; };
function invBox(inv, i) {
  if (inv.busy) return `<div class="sub" style="margin-top:8px">Citesc factura…</div>`;
  const s = inv.sum || {}; const det = s.detalii || (s.nr ? `Contravaloare factura ${s.nr}${s.data ? " din " + s.data : ""}` : "");
  const rows = [["Beneficiar", s.furnizor, "furnizor"], ["IBAN", s.iban, "iban"], ["Sumă", s.suma != null ? fmt2(s.suma) : "", "suma"], ["Detalii plată", det, "detalii"]];
  return `<div class="copy">${inv.err ? `<div class="small lampc" style="padding:8px 0">${esc(inv.err)}</div>` : ""}
  ${rows.map(([l, v, k]) => `<div class="cr"><div style="flex:1;min-width:0"><div class="small mute">${l}</div>${inv.err || !v ? `<input style="margin-top:4px;padding:7px 9px" value="${esc(v || "")}" onchange="INVset(${i},'${k}',this.value)">` : `<div class="cv">${esc(v)}</div>`}</div>${v ? `<button class="btn sm" onclick="copy(${esc(JSON.stringify(k === "suma" ? String(s.suma).replace(".", ",") : v))})">Copiază</button>` : ""}</div>`).join("")}</div>`;
}
window.INVset = (i, k, v) => { const inv = EV.subs[i].inv; inv.sum = inv.sum || {}; inv.sum[k] = k === "suma" ? +String(v).replace(",", ".") : v; evSave(1); };
window.readInv = async (i, file) => {
  if (!file) return; const sub = EV.subs[i]; sub.inv = { busy: true }; evSheet();
  try {
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const r = await post({ a: "inv", mime: file.type || "application/pdf", b64 });
    if (r.error) throw new Error(r.error);
    sub.inv = { sum: r.sum, name: file.name }; if (!+sub.amount && r.sum.suma) sub.amount = +r.sum.suma; if (!sub.name && r.sum.furnizor) sub.name = r.sum.furnizor;
  } catch (e) { sub.inv = { err: /no_gemini/.test(String(e)) ? "Citirea automată nu e pornită încă. Completează datele de mână." : "N-am putut citi factura. Completează datele de mână.", sum: {} }; }
  evSave(1); evSheet();
};
function riderForm(r) {
  const f = (k, l, ph) => `<label class="field"><span>${l}</span><input value="${esc(r[k])}" oninput="EV.rider['${k}']=this.value;evSave()" placeholder="${ph || ""}"></label>`;
  const ta = (k, l) => `<label class="field"><span>${l}</span><textarea oninput="EV.rider['${k}']=this.value;evSave()">${esc(r[k])}</textarea></label>`;
  return `<div class="g2">${f("artist", "Artist / trupă")}${f("venue", "Locație")}${f("contact", "Contact tehnic", "nume, telefon")}${f("pa", "Sistem PA")}${f("foh", "Consolă FOH / monitor")}${f("loadin", "Load-in", "14:00")}${f("soundcheck", "Soundcheck")}${f("show", "Show")}</div>
  <div class="sub" style="margin:6px 0">Input list</div>
  <table class="t"><tr><th style="width:44px">Ch</th><th>Sursă</th><th>Mic / DI</th><th>Stand</th><th>Note</th><th></th></tr>${r.inputs.map((x, i) => `<tr>${["ch", "src", "mic", "stand", "note"].map(k => `<td><input value="${esc(x[k])}" oninput="EV.rider.inputs[${i}]['${k}']=this.value;evSave()"></td>`).join("")}<td><button class="btn sm ghost" onclick="EV.rider.inputs.splice(${i},1);evSave(1);evSheet()">✕</button></td></tr>`).join("")}</table>
  <button class="btn sm" style="margin-top:6px" onclick="EV.rider.inputs.push({ch:EV.rider.inputs.length+1,src:'',mic:'',stand:'',note:''});evSheet()">+ Canal</button>
  <div class="sub" style="margin:12px 0 6px">Monitoare</div>
  <table class="t"><tr><th style="width:44px">Mix</th><th>Pentru</th><th>Tip</th><th>Note</th><th></th></tr>${r.mons.map((x, i) => `<tr>${["mix", "who", "type", "note"].map(k => `<td><input value="${esc(x[k])}" oninput="EV.rider.mons[${i}]['${k}']=this.value;evSave()"></td>`).join("")}<td><button class="btn sm ghost" onclick="EV.rider.mons.splice(${i},1);evSave(1);evSheet()">✕</button></td></tr>`).join("")}</table>
  <button class="btn sm" style="margin:6px 0 12px" onclick="EV.rider.mons.push({mix:EV.rider.mons.length+1,who:'',type:'',note:''});evSheet()">+ Mix</button>
  ${ta("backline", "Backline")}${ta("power", "Curent / prize")}${ta("lights", "Lumini / LED")}${ta("notes", "Alte note")}`;
}
window.riderText = e => { const r = e.rider, L = [`RIDER TEHNIC — ${r.artist || e.name || ""}`, `${r.venue || ""}${e.date ? " · " + ro(e.date) : ""}`]; if (r.contact) L.push("Contact tehnic: " + r.contact); const sc = [r.loadin && "Load-in " + r.loadin, r.soundcheck && "Soundcheck " + r.soundcheck, r.show && "Show " + r.show].filter(Boolean).join(" · "); if (sc) L.push(sc); if (r.pa) L.push("PA: " + r.pa); if (r.foh) L.push("Consolă: " + r.foh); L.push("", "INPUT LIST"); r.inputs.forEach(x => L.push(`${x.ch}. ${x.src}${x.mic ? " — " + x.mic : ""}${x.stand ? " (" + x.stand + ")" : ""}${x.note ? " · " + x.note : ""}`)); L.push("", "MONITOARE"); r.mons.forEach(x => L.push(`Mix ${x.mix}: ${x.who}${x.type ? " — " + x.type : ""}${x.note ? " · " + x.note : ""}`)); [["BACKLINE", r.backline], ["CURENT", r.power], ["LUMINI / LED", r.lights], ["NOTE", r.notes]].forEach(([h, v]) => { if (v) L.push("", h, v); }); return L.join("\n"); };
function riderHtml(e) { const r = e.rider, sc = [["Load-in", r.loadin], ["Soundcheck", r.soundcheck], ["Show", r.show]].filter(x => x[1]);
  return `<div class="rp"><h1>Rider tehnic — ${esc(r.artist || e.name || "")}</h1><div>${esc(r.venue || "")}${e.date ? " · " + dayName(e.date) + " " + ro(e.date) : ""}</div>
  <div class="meta">${r.contact ? `<div><b>Contact tehnic:</b> ${esc(r.contact)}</div>` : ""}${r.pa ? `<div><b>PA:</b> ${esc(r.pa)}</div>` : ""}${r.foh ? `<div><b>Consolă:</b> ${esc(r.foh)}</div>` : ""}${sc.map(s => `<div><b>${s[0]}:</b> ${esc(s[1])}</div>`).join("")}</div>
  <h2>Input list</h2><table><tr><th style="width:36px">Ch</th><th>Sursă</th><th>Mic / DI</th><th>Stand</th><th>Note</th></tr>${r.inputs.map(x => `<tr><td>${esc(x.ch)}</td><td>${esc(x.src)}</td><td>${esc(x.mic)}</td><td>${esc(x.stand)}</td><td>${esc(x.note)}</td></tr>`).join("")}</table>
  <h2>Monitoare</h2><table><tr><th style="width:36px">Mix</th><th>Pentru</th><th>Tip</th><th>Note</th></tr>${r.mons.map(x => `<tr><td>${esc(x.mix)}</td><td>${esc(x.who)}</td><td>${esc(x.type)}</td><td>${esc(x.note)}</td></tr>`).join("")}</table>
  ${[["Backline", r.backline], ["Curent / prize", r.power], ["Lumini / LED", r.lights], ["Alte note", r.notes]].filter(x => x[1]).map(([h, v]) => `<h2>${h}</h2><div class="pre">${esc(v)}</div>`).join("")}</div>`; }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
window.riderPdf = async btn => {
  btn.disabled = true; const old = btn.textContent; btn.textContent = "…";
  try {
    if (!window.html2pdf) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js");
    const w = $("#pdfwrap"); w.innerHTML = riderHtml(EV);
    const blob = await html2pdf().set({ margin: 0, image: { type: "jpeg", quality: .95 }, html2canvas: { scale: 2, backgroundColor: "#fff" }, jsPDF: { unit: "pt", format: "a4" } }).from(w.firstElementChild).outputPdf("blob");
    w.innerHTML = "";
    const name = ("Rider " + (EV.rider.artist || EV.name || "") + (EV.date ? " " + ro(EV.date) : "")).replace(/[\\/:*?"<>|]+/g, " ").trim() + ".pdf";
    const file = new File([blob], name, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name });
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
  } catch (e) { if (e && e.name !== "AbortError") toast("Nu am putut genera PDF-ul"); }
  btn.disabled = false; btn.textContent = old;
};

/* ---------- BANI: luna / profit / setări ---------- */
VIEWS.bani = () => `<div class="seg">${[["luna", "Luna"], ["datorii", "Datorii"], ["profit", "Taxe"], ["setari", "Setări"]].map(([v, l]) => `<button class="${S.baniTab === v ? "on" : ""}" onclick="S.baniTab='${v}';render()">${l}</button>`).join("")}</div>` + ({ luna: baniLuna, datorii: baniDatorii, profit: baniProfit, setari: baniSetari }[S.baniTab])();
const CATS = ["Casă", "Combustibil", "Mașină", "Echipament", "Materiale", "Mâncare", "Reverb", "Altele"];
const CATCOL = { "Fixe": "var(--ink)", "Rate": "#FF9F43", "Datorii": "#FF6B6B", "Subcontractori": "var(--exp)", "Casă": "#9B8CFF", "Combustibil": "#FF6B9A", "Mașină": "#6AA8FF", "Echipament": "#49D3C1", "Materiale": "#C9A26B", "Mâncare": "#8FD14F", "Reverb": "#F27BD0", "Altele": "var(--faint)" };
function baniLuna() {
  const m = S.month, ed = expDoc(m), s = monthSum(m), groups = { Fixe: s.fixed, Rate: s.rate, Datorii: s.dat, Subcontractori: s.subs };
  (ed.extra || []).filter(x => !x.ii).forEach(x => groups[x.cat || "Altele"] = (groups[x.cat || "Altele"] || 0) + (+x.amount || 0));
  const tot = Object.values(groups).reduce((a, b) => a + b, 0) || 1; let acc = 0; const R = 50, C = 2 * Math.PI * R;
  const arcs = Object.entries(groups).filter(([, v]) => v > 0).map(([k, v]) => { const len = v / tot * C, o = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${CATCOL[k] || "var(--faint)"}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 60 60)"/>`; acc += len; return o; }).join("");
  return `<section class="panel"><div class="bar"><div><div class="sub">Ies în ${MONTHS[+m.slice(5) - 1]}</div><div class="num" style="font-size:34px;font-weight:700">${k0(s.out)} lei</div></div><span class="sp"></span><div style="text-align:right"><div class="sub">Rămâne</div><div class="num ${s.net < 0 ? "bad" : "ok"}" style="font-size:24px;font-weight:700">${k0(s.net)}</div></div></div>
    <div class="donut" style="margin-top:10px"><svg viewBox="0 0 120 120"><circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--well)" stroke-width="16"/>${arcs}</svg><div class="lg">${Object.entries(groups).filter(([, v]) => v > 0).map(([k, v]) => `<div style="--c:${CATCOL[k] || "var(--faint)"}"><span><i></i>${k}</span><b class="num">${k0(v)}</b></div>`).join("") || `<div class="mute">Nimic încă.</div>`}</div></div></section>
  <section class="panel"><h2>Plăți fixe</h2>${(cfg().fixed || []).map(f => `<label class="check" style="border-top:1px solid var(--line);padding:10px 0"><input type="checkbox" ${(ed.paid || {})[f.id] ? "checked" : ""} onchange="fxPaid('${esc(f.id)}',this.checked)"><span class="box"></span><span style="flex:1">${esc(f.n)}</span><b class="num" style="font-size:18px">${k0(f.a)}</b></label>`).join("") || `<div class="empty">Adaugă plăți fixe din Setări.</div>`}</section>
  ${(() => { const due = rateDue(m); if (!due.length) return ""; return `<section class="panel"><div class="bar" style="margin-bottom:4px"><h2 style="margin:0">Rate</h2><span class="sp"></span><span class="num" style="font-size:20px;font-weight:600">${fmt2(s.rate)}</span></div>
    ${due.map(x => `<label class="check" style="border-top:1px solid var(--line);padding:10px 0"><input type="checkbox" ${(ed.paid || {})["r:" + x.id] ? "checked" : ""} onchange="fxPaid('r:${esc(x.id)}',this.checked)"><span class="box"></span><span style="flex:1">${esc(x.n)}<br><span class="small mute">scadență ${ro(x.date)}${rateSchedule((cfg().rate || []).find(p => p.id === x.id)).slice(-1)[0].date === x.date ? " · ultima rată" : ""}</span></span><b class="num" style="font-size:18px">${fmt2(x.a)}</b></label>`).join("")}</section>`; })()}
  <section class="panel"><div class="bar" style="margin-bottom:6px"><h2 style="margin:0">Alte cheltuieli</h2><span class="sp"></span><button class="btn sm p" onclick="openExp()">+ Adaugă</button></div>
    ${expRows((ed.extra || []).filter(x => !x.ii)) || `<div class="empty">Nimic luna asta.</div>`}</section>
  ${(ed.extra || []).some(x => x.ii) ? `<section class="panel"><div class="bar" style="margin-bottom:6px"><h2 style="margin:0">Cheltuieli firmă</h2><span class="sp"></span><span class="num" style="font-size:20px;font-weight:600">${k0((ed.extra || []).filter(x => x.ii).reduce((s, x) => s + (+x.amount || 0), 0))}</span></div>
    <div class="small mute" style="margin-bottom:4px">Pe II, deductibile. Nu intră la cheltuielile lunii, se scad la profit și taxe.</div>${expRows((ed.extra || []).filter(x => x.ii))}</section>` : ""}`;
}
function expRows(list) { return list.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(x => `<div class="row"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${CATCOL[x.cat] || "var(--faint)"}"></span><div class="l"><div class="t">${esc(x.desc)}</div><div class="s">${x.date ? ro(x.date) : ""} · ${esc(x.cat || "")}</div></div><div class="v">${k0(x.amount)}</div><button class="btn sm ghost" onclick="delExp('${esc(x.id)}')">✕</button></div>`).join(""); }
window.fxPaid = (id, v) => { const m = S.month, ed = clone(expDoc(m)); ed.paid = ed.paid || {}; ed.paid[id] = v; put("exp/" + m, ed); render(); };
window.delExp = id => { const m = S.month, ed = clone(expDoc(m)); ed.extra = (ed.extra || []).filter(x => x.id !== id); put("exp/" + m, ed); render(); };
window.openExp = () => sheet("Cheltuială", `<label class="field"><span>Ce</span><input id="xD" placeholder="ex. cabluri XLR, motorină"></label>
  <div class="g2"><label class="field"><span>Sumă (lei)</span><input id="xA" type="number" inputmode="decimal"></label><label class="field"><span>Data</span><input id="xT" type="date" value="${today().slice(0, 7) === S.month ? today() : S.month + "-01"}"></label></div>
  <div class="field"><span>Categorie</span><div class="bar" id="xC">${CATS.map((c, i) => `<button class="chip" style="height:32px;padding:0 12px;font-size:14px;${i === 7 ? "background:var(--ink);color:var(--bg)" : ""}" data-c="${c}" onclick="document.querySelectorAll('#xC .chip').forEach(b=>{b.style.background='';b.style.color=''});this.style.background='var(--ink)';this.style.color='var(--bg)';this.parentNode.dataset.v='${c}'">${c}</button>`).join("")}</div></div>
  <label class="check"><input type="checkbox" id="xII"><span class="box"></span>Cheltuială pe firmă (II), deductibilă — combustibilul doar 50%</label>
  <button class="btn p full" style="margin-top:10px" onclick="addExp()">Adaugă cheltuiala</button>`);
window.addExp = () => { const desc = $("#xD").value.trim(), amount = +$("#xA").value, date = $("#xT").value; if (!desc || !amount) { toast("Pune descrierea și suma"); return; } const m = mkey(date || S.month + "-01"), ed = clone(expDoc(m)); ed.extra = ed.extra || []; ed.extra.push({ id: uid(), desc, amount, date, cat: $("#xC").dataset.v || "Altele", ii: $("#xII").checked }); put("exp/" + m, ed); closeSheet(); render(); toast("Cheltuiala a fost adăugată"); };
function baniDatorii() {
  const L = debts(), eu = L.filter(d => d.dir !== "mie"), mie = L.filter(d => d.dir === "mie");
  const tot = a => a.reduce((s, d) => s + Math.max(0, debtLeft(d)), 0);
  const card = d => { const left = debtLeft(d), pct = d.total ? Math.min(1, (d.total - left) / d.total) : 0, done = left <= 0.009;
    return `<div class="evc" onclick="openDebt('${esc(d.id)}')"><div class="bar"><div style="flex:1;min-width:0"><h3>${esc(d.who)}</h3><div class="sub">${d.note ? esc(d.note) + " · " : ""}${(d.pays || []).length ? `${d.pays.length} ${d.pays.length === 1 ? "plată" : "plăți"}, ultima ${ro(d.pays[d.pays.length - 1].date)}` : "nicio plată încă"}</div></div>
    <div style="text-align:right"><div class="num" style="font-size:22px;font-weight:700">${done ? "achitat" : k0(left)}</div><div class="small mute">din ${k0(d.total)}</div></div></div>
    <div class="split"><i style="width:${pct * 100}%;background:var(--ok)"></i></div></div>`; };
  return `<section class="panel master"><div class="k">Datorez</div><div class="big num">${k0(tot(eu))}<small>lei</small></div>${mie.length ? `<div class="cap">Mi se datorează ${k0(tot(mie))} lei</div>` : ""}
    <div class="bar" style="margin-top:12px"><button class="btn p" onclick="openDebt()">+ Datorie</button></div></section>
  ${eu.length ? `<div class="sub" style="margin:4px 2px 8px">Datorez eu</div>${eu.map(card).join("")}` : `<div class="panel"><div class="empty">Nicio datorie.</div></div>`}
  ${mie.length ? `<div class="sub" style="margin:16px 2px 8px">Îmi datorează alții</div>${mie.map(card).join("")}` : ""}`;
}
window.openDebt = id => {
  const d = debts().find(x => x.id === id) || { id: uid(), who: "", total: "", note: "", dir: "eu", pays: [] }, isNew = !id, left = debtLeft(d);
  sheet(isNew ? "Datorie nouă" : d.who, `<label class="field"><span>Cui / cine</span><input id="dW" value="${esc(d.who)}" placeholder="ex. Robi"></label>
  <div class="g2"><label class="field"><span>Suma totală (lei)</span><input id="dT" type="number" step="0.01" inputmode="decimal" value="${d.total}"></label><label class="field"><span>Notă</span><input id="dN" value="${esc(d.note || "")}"></label></div>
  <div class="seg" id="dDir"><button data-v="eu" class="${d.dir !== "mie" ? "on" : ""}" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')">Datorez eu</button><button data-v="mie" class="${d.dir === "mie" ? "on" : ""}" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')">Îmi datorează</button></div>
  ${isNew ? "" : `<section class="panel"><div class="bar"><h3>Plăți</h3><span class="sp"></span><span class="num" style="font-size:18px">rămas ${fmt2(left)}</span></div>
    ${(d.pays || []).map((p, i) => `<div class="row"><div class="l"><div class="t">${ro(p.date)}</div></div><div class="v">${fmt2(p.a)}</div><button class="btn sm ghost" onclick="delPay('${esc(d.id)}',${i})">✕</button></div>`).join("") || `<div class="empty">Nicio plată.</div>`}
    <div class="g2" style="margin-top:8px"><label class="field"><span>Sumă plătită</span><input id="pA" type="number" step="0.01" inputmode="decimal" placeholder="${left > 0 ? left : ""}"></label><label class="field"><span>Data</span><input id="pD" type="date" value="${today()}"></label></div>
    <button class="btn full" onclick="addPay('${esc(d.id)}')">Adaugă plata</button></section>`}
  <div class="bar" style="margin-top:12px">${isNew ? "" : `<button class="btn ghost" onclick="delDebt('${esc(d.id)}')">Șterge</button>`}<span class="sp"></span><button class="btn p" onclick="saveDebt('${esc(d.id)}')">Salvează</button></div>`);
};
function putDebts(list) { put("dat/main", { list }); }
window.saveDebt = id => { const L = debts(), old = L.find(x => x.id === id) || { pays: [] }; const d = { ...old, id, who: $("#dW").value.trim(), total: +$("#dT").value, note: $("#dN").value.trim(), dir: $("#dDir .on").dataset.v }; if (!d.who || !d.total) { toast("Pune cine și suma"); return; } putDebts([...L.filter(x => x.id !== id), d]); closeSheet(); render(); };
window.addPay = id => { const a = +$("#pA").value, date = $("#pD").value; if (!a || !date) { toast("Pune suma și data"); return; } const L = clone(debts()), d = L.find(x => x.id === id); d.pays = [...(d.pays || []), { date, a }]; putDebts(L); openDebt(id); toast(debtLeft(d) <= 0.009 ? "Datorie achitată" : "Plata a fost adăugată"); };
window.delPay = (id, i) => { const L = clone(debts()), d = L.find(x => x.id === id); d.pays.splice(i, 1); putDebts(L); openDebt(id); };
window.delDebt = id => { if (!confirmBox("Ștergi datoria?")) return; putDebts(debts().filter(x => x.id !== id)); closeSheet(); render(); };
function baniProfit() {
  const y = +today().slice(0, 4), t = taxYear(y), c = icc();
  const r = (l, s, v, cls) => `<div class="row"><div class="l"><div class="t">${l}</div>${s ? `<div class="s">${s}</div>` : ""}</div><div class="v ${cls || ""}">${v}</div></div>`;
  const pct = Math.min(1, c.avg / 15000), zero = c.target / 15000;
  return `<section class="panel"><h2>Profit II ${y}, până azi</h2>
    ${r("Venit II", "facturat / încasat", k0(t.brut))}${r("Cheltuieli cu acte", "se scad la taxe", "−" + k0(t.ded))}${r("Cheltuieli fără acte", "nu se scad la taxe", "−" + k0(t.noDoc))}
    ${r("Profit înainte de taxe", "", k0(t.profit))}${r("Taxe estimate", "CAS + CASS + impozit", "−" + k0(t.total))}${r("<b>Profit după taxe</b>", "", `<b class="ok">${k0(t.profitNet)}</b>`)}</section>
  <section class="panel"><h2>Taxe estimate</h2>
    ${r("Venit net fiscal", "venit − cheltuieli cu acte", k0(t.net))}${r("CAS 25%", t.casNote, k0(t.cas))}${r("CASS 10%", "bază " + k0(t.cassBase), k0(t.cass))}${r("Impozit 10%", "", k0(t.imp))}${r("<b>De pus deoparte</b>", "", `<b class="lampc">${k0(t.total)}</b>`)}
    <div class="small mute" style="margin-top:6px">Sistem real, salariu minim ${k0(cfg().salMin)} lei. Fără orele cash. Cifrele finale le stabilește declarația unică.</div></section>
  <section class="panel"><h2>Indemnizație creștere copil</h2>
    <div style="position:relative;height:14px;border-radius:7px;background:var(--well);overflow:hidden;margin:6px 0 4px"><div style="position:absolute;inset:0 auto 0 0;width:${pct * 100}%;background:linear-gradient(90deg,var(--ok) ${Math.min(100, zero / pct * 100)}%,var(--lamp) 0);border-radius:7px"></div></div>
    <div style="position:relative;height:18px;font-size:12px;color:var(--mute)"><span style="position:absolute;left:${zero * 100}%;transform:translateX(-50%)">▲ 10.000</span></div>
    ${r("Media ta lunară", `venit net fiscal după taxe, ${c.months.toFixed(1)} luni`, `<span class="${c.ok ? "ok" : "lampc"}">${k0(c.avg)}</span>`)}${r("Indemnizație estimată", "85% din medie, maxim 8.500", k0(c.ind))}
    ${r(c.ok ? "Peste prag cu" : "Îți mai trebuie până la 31.12", c.ok ? "pe lună" : "profit net după taxe", k0(c.ok ? c.avg - c.target : Math.max(0, c.rest)))}
    <div class="small mute" style="margin-top:6px">Contează ultimele 12 luni dinaintea nașterii (iunie 2026 – mai 2027). Plățile fără acte nu scad venitul net fiscal.</div></section>`;
}
function baniSetari() {
  const c = cfg(), kids = knownKids();
  const inp = (k, l, type, extra) => `<label class="field"><span>${l}</span><input ${type ? `type="${type}"` : ""} ${extra || ""} value="${esc(c[k] ?? "")}" onchange="setCfg('${k}',this.type==='number'?+this.value:this.value)"></label>`;
  return `<section class="panel"><h2>MIRA</h2><div class="g2">${inp("miraFee", "Onorariu / concert (€)", "number")}${inp("eur", "Curs estimat lei/€", "number", 'step="0.0001"')}${inp("miraFrom", "Facturat până la", "date")}${inp("miraDeferTo", "Nefacturatele se încasează în", "date")}${inp("lastNr", "Ultima factură emisă")}</div></section>
  <section class="panel"><h2>Tarife ore</h2>${inp("defRate", "Tarif implicit (lei)", "number")}
    ${kids.map(k => `<div class="row"><div class="l"><div class="t">${esc(k)}</div></div><input style="width:110px" type="number" inputmode="decimal" value="${(c.rates || {})[k] ?? ""}" placeholder="${c.defRate}" onchange="setRate(${esc(JSON.stringify(k))},this.value)"></div>`).join("")}
    ${(c.ignore || []).length ? `<div class="sub" style="margin-top:12px">Nu apar la ore</div>${c.ignore.map(x => `<div class="row"><div class="l"><div class="t">${esc(x)}</div></div><button class="btn sm" onclick="unignore(${esc(JSON.stringify(x))})">Arată din nou</button></div>`).join("")}` : ""}</section>
  <section class="panel"><h2>Plăți fixe</h2>${(c.fixed || []).map(f => `<div class="row"><input value="${esc(f.n)}" onchange="setFx('${esc(f.id)}','n',this.value)"><input style="width:110px" type="number" inputmode="decimal" value="${f.a}" onchange="setFx('${esc(f.id)}','a',+this.value)"><button class="btn sm ghost" onclick="delFx('${esc(f.id)}')">✕</button></div>`).join("")}<button class="btn sm" style="margin-top:8px" onclick="addFx()">+ Plată fixă</button></section>
  <section class="panel"><h2>Rate</h2>${(c.rate || []).map(p => { const sc = rateSchedule(p), left = sc.reduce((s, x) => s + x.a, 0); return `<div class="row"><div class="l"><div class="t">${esc(p.n)}</div><div class="s">${fmt2(p.a)} / lună · ${sc.length} rate · ultima ${sc.length ? ro(sc[sc.length - 1].date) : "—"}</div></div><div class="v">${k0(left)}</div><button class="btn sm ghost" onclick="openRate('${esc(p.id)}')">Editează</button></div>`; }).join("") || `<div class="empty">Nicio rată.</div>`}
    ${(c.rate || []).length ? `<div class="bar small" style="margin-top:6px"><span class="mute">Mai ai de plată</span><span class="sp"></span><b class="num" style="font-size:18px">${fmt2((c.rate || []).reduce((s, p) => s + (+p.rest || 0), 0))} lei</b></div>` : ""}
    <button class="btn sm" style="margin-top:8px" onclick="openRate()">+ Rată</button></section>
  <section class="panel"><h2>Taxe</h2><div class="g2">${inp("priorBrut", "Venit II dinainte de aplicație", "number")}${inp("priorDed", "Cheltuieli cu acte dinainte", "number")}${inp("priorNoDoc", "Cheltuieli fără acte dinainte", "number")}${inp("salMin", "Salariu minim (plafoane)", "number")}</div></section>
  <section class="panel"><h2>Evenimente</h2><div class="sub">Fiecare eveniment ajunge singur în calendarul Google „Evenimente”. Pentru Notes, aplicația pornește scurtătura „${SHORTCUT}” de pe iPhone.</div>
    <label class="check"><input type="checkbox" ${cfg().notesOff ? "" : "checked"} onchange="put('cfg/main',{...cfg(),notesOff:!this.checked});render()"><span class="box"></span>Adaugă evenimentele noi în nota „${NOTE_NAME}”</label>
    <div class="bar" style="margin-top:8px"><button class="btn sm" onclick="evSync(this)">Pune toate evenimentele în calendar</button></div></section>
  <section class="panel"><h2>Conexiune</h2><div class="sub">Datele stau în scriptul tău Google și se sincronizează pe toate dispozitivele.</div>
    <div class="bar" style="margin-top:10px"><button class="btn sm" onclick="pull();toast('Sincronizez…')">Sincronizează acum</button><button class="btn sm" onclick="copy(setupLink())">Copiază link de conectare</button><button class="btn sm ghost" onclick="exportJson()">Backup JSON</button></div></section>`;
}
window.setCfg = (k, v) => { put("cfg/main", { ...cfg(), [k]: v }); if (k === "miraFrom") { S.cal.mira = null; } render(); };
window.setRate = (k, v) => { const c = cfg(), r = { ...(c.rates || {}) }; if (v === "") delete r[k]; else r[k] = +v; put("cfg/main", { ...c, rates: r }); };
window.unignore = x => { const c = cfg(); put("cfg/main", { ...c, ignore: (c.ignore || []).filter(y => y !== x) }); render(); };
window.setFx = (id, k, v) => { const c = cfg(); put("cfg/main", { ...c, fixed: c.fixed.map(f => f.id === id ? { ...f, [k]: v } : f) }); };
window.delFx = id => { const c = cfg(); put("cfg/main", { ...c, fixed: c.fixed.filter(f => f.id !== id) }); render(); };
window.addFx = () => { const c = cfg(); put("cfg/main", { ...c, fixed: [...(c.fixed || []), { id: uid(), n: "Plată nouă", a: 0 }] }); render(); };
window.openRate = id => { const p = (cfg().rate || []).find(x => x.id === id) || { id: uid(), n: "", a: "", next: today(), rest: "" };
  sheet(id ? "Editează rata" : "Rată nouă", `<label class="field"><span>Ce</span><input id="rN" value="${esc(p.n)}" placeholder="ex. eMAG 557255957"></label>
  <div class="g3"><label class="field"><span>Rată lunară</span><input id="rA" type="number" step="0.01" inputmode="decimal" value="${p.a}"></label><label class="field"><span>Următoarea scadență</span><input id="rD" type="date" value="${p.next}"></label><label class="field"><span>Mai ai de plată</span><input id="rR" type="number" step="0.01" inputmode="decimal" value="${p.rest}"></label></div>
  <div class="bar">${id ? `<button class="btn ghost" onclick="delRate('${esc(p.id)}')">Șterge</button>` : ""}<span class="sp"></span><button class="btn p" onclick="saveRate('${esc(p.id)}')">Salvează</button></div>`); };
window.saveRate = id => { const c = cfg(), p = { id, n: $("#rN").value.trim(), a: +$("#rA").value, next: $("#rD").value, rest: +$("#rR").value }; if (!p.n || !p.a || !p.next) { toast("Completează numele, rata și scadența"); return; } const list = (c.rate || []).filter(x => x.id !== id); list.push(p); put("cfg/main", { ...c, rate: list }); closeSheet(); render(); };
window.delRate = id => { const c = cfg(); put("cfg/main", { ...c, rate: (c.rate || []).filter(x => x.id !== id) }); closeSheet(); render(); };
window.setupLink = () => location.origin + location.pathname + "#setup=" + btoa(JSON.stringify(S.api));
window.exportJson = () => { const blob = new Blob([JSON.stringify(S.docs, null, 1)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bani-backup-" + today() + ".json"; a.click(); };

/* ---------- setup ---------- */
function setupView() {
  return `<section class="panel master"><div class="k">Prima pornire</div><div class="big num" style="font-size:44px">Conectează aplicația</div>
  <p class="sub">Lipește aici linkul de conectare primit de la Claude. Îl găsești și în Setări → Conexiune, pe alt dispozitiv deja conectat.</p>
  <textarea id="setupIn" placeholder="https://…#setup=…"></textarea><button class="btn p full" style="margin-top:10px" onclick="doSetup($('#setupIn').value)">Conectează</button></section>`;
}
function bindSetup() {}
window.doSetup = txt => {
  const m = String(txt || "").match(/setup=([A-Za-z0-9+/=_-]+)/); if (!m) { toast("Linkul nu conține datele de conectare"); return false; }
  try { const o = JSON.parse(atob(m[1])); if (!o.u || !o.t) throw 0; S.api = o; LS.set("bani.api", o); try { history.replaceState(null, "", location.pathname + "#acasa"); } catch (e) {} S.view = "acasa"; render(); pull(); toast("Conectat"); return true; }
  catch (e) { toast("Link invalid"); return false; }
};

/* ---------- sheet ---------- */
function sheet(title, body, keep) {
  const sh = $("#sheet"), y = keep && sh.classList.contains("on") ? sh.scrollTop : 0;
  sh.innerHTML = `<div class="grab"></div><div class="hd"><h3>${esc(title)}</h3><button class="btn sm ghost" onclick="closeSheet()">Închide</button></div>${body}`;
  sh.classList.add("on"); $("#scrim").classList.add("on"); document.body.style.overflow = "hidden"; sh.scrollTop = y;
}
window.closeSheet = () => { if (EV) { evSave(1); } EV = null; $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on"); document.body.style.overflow = ""; render(); };
$("#scrim").onclick = closeSheet;
window.evSheet = evSheet; window.RIDER = RIDER; window.go = go; window.copy = copy; window.toast = toast; window.pull = pull; window.$ = $; window.S = S; window.render = render; window.evSave = evSave;


/* ---------- pornire ---------- */
(function boot() {
  if (/setup=/.test(location.hash)) doSetup(location.hash);
  if (!["acasa", "ore", "mira", "ev", "bani"].includes(S.view)) S.view = "acasa";
  document.body.classList.add("boot"); render();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("boot")));
  // numărătoare la pornire, o singură dată
  const el = document.querySelector("[data-count]");
  if (el && !matchMedia("(prefers-reduced-motion: reduce)").matches) { const end = +el.dataset.count, t0 = performance.now(), small = el.querySelector("small").outerHTML; const step = t => { const p = Math.min(1, (t - t0) / 900), v = end * (1 - Math.pow(1 - p, 3)); el.innerHTML = k0(v) + small; if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  if (S.api) pull();
  window.addEventListener("online", () => { S.online = true; flush(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.api) pull(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
