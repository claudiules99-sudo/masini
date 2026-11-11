// Parser ICS minimal cu expandare RRULE (WEEKLY/MONTHLY/YEARLY, INTERVAL, UNTIL, COUNT, BYDAY simplu),
// EXDATE, RECURRENCE-ID și STATUS:CANCELLED. Lucrează pe ore locale (Europe/Bucharest) ca șiruri.
// Folosit identic în Apps Script și în teste.
function icsEvents(text, fromYmd, toYmd, zToLocal) {
  var lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  var evs = [], cur = null;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (l === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (l === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; continue; }
    if (!cur) continue;
    var c = l.indexOf(':'); if (c < 0) continue;
    var head = l.slice(0, c), val = l.slice(c + 1), name = head.split(';')[0];
    if (name === 'EXDATE') { (cur.ex = cur.ex || []).push.apply(cur.ex, val.split(',').map(function (v) { return norm(v, head); })); }
    else if (name === 'DTSTART' || name === 'DTEND' || name === 'RECURRENCE-ID') cur[name] = norm(val, head);
    else if (name === 'SUMMARY') cur.SUMMARY = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').replace(/\\\\/g, '\\');
    else if (name === 'RRULE' || name === 'UID' || name === 'STATUS') cur[name] = val;
  }
  function norm(v, head) { // -> 'YYYYMMDDTHHMM' local
    v = v.trim();
    if (/Z$/.test(v)) return zToLocal(v);
    if (/^\d{8}$/.test(v)) return v + 'T0000';
    return v.slice(0, 13);
  }
  var lo = fromYmd.replace(/-/g, '') + 'T0000', hi = toYmd.replace(/-/g, '') + 'T0000';
  var overrides = {}, out = [];
  evs.forEach(function (e) { if (e['RECURRENCE-ID']) overrides[e.UID + '|' + e['RECURRENCE-ID']] = e; });
  function push(e, start) {
    if (start < lo || start >= hi) return;
    if (e.STATUS === 'CANCELLED') return;
    out.push({ uid: e.UID, start: start, summary: (e.SUMMARY || '').trim() });
  }
  evs.forEach(function (e) {
    if (!e.DTSTART || e['RECURRENCE-ID']) { if (e.DTSTART && e['RECURRENCE-ID']) push(e, e.DTSTART); return; }
    if (!e.RRULE) { push(e, e.DTSTART); return; }
    var r = {}; e.RRULE.split(';').forEach(function (p) { var kv = p.split('='); r[kv[0]] = kv[1]; });
    var until = r.UNTIL ? (/Z$/.test(r.UNTIL) ? zToLocal(r.UNTIL) : (r.UNTIL.length === 8 ? r.UNTIL + 'T2359' : r.UNTIL.slice(0, 13))) : null;
    var count = r.COUNT ? +r.COUNT : null, interval = +(r.INTERVAL || 1);
    var ex = {}; (e.ex || []).forEach(function (x) { ex[x] = 1; });
    var t = e.DTSTART.slice(9), d = ymdToDate(e.DTSTART), n = 0, guard = 0;
    var days = r.BYDAY && r.FREQ === 'WEEKLY' ? r.BYDAY.split(',').map(function (s) { return ['SU','MO','TU','WE','TH','FR','SA'].indexOf(s.slice(-2)); }) : null;
    while (guard++ < 5000) {
      var cands = [];
      if (days) { var wk = new Date(d); wk.setDate(wk.getDate() - wk.getDay()); days.forEach(function (wd) { var x = new Date(wk); x.setDate(x.getDate() + wd); if (x >= ymdToDate(e.DTSTART)) cands.push(x); }); cands.sort(function (a, b) { return a - b; }); }
      else cands = [new Date(d)];
      var stop = false;
      for (var k = 0; k < cands.length; k++) {
        var s = dateToYmd(cands[k]) + t;
        if (until && s > until) { stop = true; break; }
        if (count && n >= count) { stop = true; break; }
        n++;
        if (s >= hi) { stop = true; break; }
        if (ex[s]) continue;
        var ov = overrides[e.UID + '|' + s];
        if (ov) continue; // instanța modificată e tratată separat
        push(e, s);
      }
      if (stop) break;
      if (r.FREQ === 'WEEKLY') d.setDate(d.getDate() + 7 * interval);
      else if (r.FREQ === 'DAILY') d.setDate(d.getDate() + interval);
      else if (r.FREQ === 'MONTHLY') d.setMonth(d.getMonth() + interval);
      else if (r.FREQ === 'YEARLY') d.setFullYear(d.getFullYear() + interval);
      else break;
    }
  });
  out.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  return out.map(function (o) { return { date: o.start.slice(0, 4) + '-' + o.start.slice(4, 6) + '-' + o.start.slice(6, 8), time: o.start.slice(9, 11) + ':' + o.start.slice(11, 13), summary: o.summary }; });
  function ymdToDate(s) { return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); }
  function dateToYmd(x) { return '' + x.getFullYear() + ('0' + (x.getMonth() + 1)).slice(-2) + ('0' + x.getDate()).slice(-2) + 'T'; }
}
