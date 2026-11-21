// Vercel Function: lee el leaderboard de ESPN y devuelve las posiciones ya normalizadas.
// La respuesta se guarda 45 s en la CDN de Vercel, así que ESPN recibe como máximo ~1 consulta por minuto aunque haya muchos visitantes.
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const nombre = c => { const a = c.athlete || {}; return a.displayName || a.fullName || c.displayName || ""; };
function alPar(c) {
  let s = c.score;
  if (s && typeof s === "object") s = s.displayValue !== undefined ? s.displayValue : s.value;
  s = String(s === undefined || s === null ? "" : s).trim();
  if (/^(e|even)$/i.test(s)) return 0;
  const n = parseInt(s.replace("+", ""), 10);
  return Number.isNaN(n) ? null : n;
}
// ¿Ya jugó al menos un hoyo del torneo? null = la fuente no trae ese detalle (entonces no se filtra).
// Quien todavía no sale a jugar queda sin posición (0 puntos) hasta su primer hoyo.
function jugo(c) {
  const ls = c.linescores;
  if (!Array.isArray(ls)) return null;
  if (ls.some(r => r && ((Array.isArray(r.linescores) && r.linescores.length) || Number(r.value) > 0))) return true;
  const s = alPar(c);
  return s !== null && s !== 0;          // score distinto de par = ya jugó
}
function posiciones(competidores) {
  const res = {}, todos = [];
  for (const c of competidores) {
    const k = norm(nombre(c));
    if (!k || jugo(c) === false) continue;
    todos.push([k, alPar(c)]);
    const p = c.status && c.status.position && c.status.position.displayName;
    if (p && /^T?\d+$/.test(String(p))) res[k] = String(p);
  }
  const scores = new Set(todos.filter(x => x[1] !== null).map(x => x[1]));
  if (scores.size <= 1 && !Object.keys(res).length) return {};        // nadie ha jugado aún
  for (const [k, s] of todos) {
    if (k in res || s === null) continue;
    const menores = todos.filter(x => x[1] !== null && x[1] < s).length;
    const iguales = todos.filter(x => x[1] === s).length;
    res[k] = (iguales > 1 ? "T" : "") + (menores + 1);
  }
  return res;
}
// ---- Leaderboard completo (para la vista "PGA Tour en vivo") ----
const aPar = v => { v = String(v === undefined || v === null ? "" : v).trim(); if (/^(e|even)$/i.test(v)) return 0; const n = parseInt(v.replace("+", ""), 10); return Number.isNaN(n) ? null : n; };
const hoyos = r => (r && Array.isArray(r.linescores) ? r.linescores.length : 0);
function filas(comp, pos) {
  // ronda en juego = la mayor ronda en que alguien ya jugó al menos un hoyo
  let R = 0;
  for (const c of comp) for (const r of c.linescores || []) if (hoyos(r) || Number(r.value) > 0) R = Math.max(R, Number(r.period) || 0);
  // línea de corte (desde la ronda 3): peor score de 36 hoyos entre los que ya salieron a jugar la ronda 3 o 4
  let linea = null;
  const de36 = c => { const ls = c.linescores || [], a = ls.find(r => r.period === 1), b = ls.find(r => r.period === 2); const x = a && aPar(a.displayValue), y = b && aPar(b.displayValue); return x === null || y === null || x === undefined || y === undefined ? null : x + y; };
  const siguio = c => (c.linescores || []).some(r => Number(r.period) >= 3 && (hoyos(r) || Number(r.value) > 0));
  if (R >= 3) for (const c of comp) if (siguio(c)) { const v = de36(c); if (v !== null) linea = linea === null ? v : Math.max(linea, v); }
  return comp.map((c, i) => {
    const ls = c.linescores || [], k = norm(nombre(c));
    const ronda = n => ls.find(r => Number(r.period) === n);
    const actual = ronda(R), h = hoyos(actual);
    const rs = [1, 2, 3, 4].map(n => { const r = ronda(n); if (!r) return ""; const v = Number(r.value); return v > 0 && (hoyos(r) >= 18 || !Array.isArray(r.linescores) || n < R) ? String(Math.round(v)) : ""; });
    const golpes = ls.reduce((t, r) => t + (Number(r.value) > 0 ? Number(r.value) : 0), 0);
    const cut = linea !== null && !siguio(c) && de36(c) !== null && de36(c) > linea;
    const jug = jugo(c);
    let thru = "";
    if (cut) thru = "";
    else if (h >= 18) thru = "F";
    else if (h > 0) thru = String(h);
    else if (actual && Number(actual.value) > 0) thru = "F";
    const s = alPar(c);
    return {
      n: nombre(c), k, o: Number(c.order) || i + 1,
      pos: cut ? "CUT" : (pos[k] || ""), tot: jug === false ? "" : (s === null ? "" : s === 0 ? "E" : (s > 0 ? "+" + s : String(s))),
      thru, hoy: actual && (h > 0) ? String(actual.displayValue || "") : "", r: rs, golpes: golpes ? String(Math.round(golpes)) : "",
      flag: (c.athlete && c.athlete.flag && c.athlete.flag.href) || ""
    };
  }).sort((a, b) => (a.pos === "CUT") - (b.pos === "CUT") || (!a.pos) - (!b.pos) || (parseInt(String(a.pos).replace(/\D/g, ""), 10) || 999) - (parseInt(String(b.pos).replace(/\D/g, ""), 10) || 999) || a.o - b.o);
}
const dia = v => { const d = new Date(String(v).slice(0, 10) + "T00:00:00Z"); return isNaN(d) ? null : d; };
function elegirEvento(evs, nombreTorneo, ini, fin) {
  const nt = norm(nombreTorneo);
  for (const e of evs) for (const campo of [e.name, e.shortName]) {
    const n = norm(campo);
    if (n && (n.includes(nt) || nt.includes(n))) return e;
  }
  if (evs.length === 1) {
    const a = dia(evs[0].date), b = dia(evs[0].endDate) || a, d1 = dia(ini), d2 = dia(fin), dd = 86400000;
    if (a && b && d1 && d2 && a <= new Date(d2.getTime() + dd) && b >= new Date(d1.getTime() - dd)) return evs[0];
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const q = req.query || {};
  const n = String(q.n || ""), ini = String(q.ini || ""), fin = String(q.fin || "");
  const okFecha = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!n || n.length > 120 || !okFecha(ini) || !okFecha(fin)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ ok: false, error: "Faltan parámetros: n (nombre del torneo), ini y fin (AAAA-MM-DD)" });
  }
  const intentos = ["", "?dates=" + ini.replace(/-/g, ""), "?dates=" + ini.replace(/-/g, "") + "-" + fin.replace(/-/g, "")];
  const vistos = [];
  for (const suf of intentos) {
    try {
      const r = await fetch(ESPN + suf, { headers: { "User-Agent": "Mozilla/5.0 (distinguidos-pga)" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = await r.json();
      const evs = data.events || [];
      evs.forEach(e => vistos.push(e.name));
      const ev = elegirEvento(evs, n, ini, fin);
      const c0 = ev && ev.competitions && ev.competitions[0] ? ev.competitions[0] : {};
      const comp = c0.competitors;
      if (!ev || !comp || !comp.length) continue;
      const estado = (ev.status && ev.status.type && ev.status.type.state) || (c0.status && c0.status.type && c0.status.type.state) || null;
      // Situación según la fuente oficial: suspendido/atrasado (lluvia, tormenta, oscuridad), en juego o terminado
      const tipos = [ev.status && ev.status.type, c0.status && c0.status.type].filter(Boolean);
      const txt = tipos.map(t => [t.name, t.description, t.detail, t.shortDetail].join(" ")).join(" ");
      const situacion = estado === "post" ? "final" : /suspend|delay|postpon|rain|weather|halt|darkness/i.test(txt) ? "suspendido" : estado === "pre" ? "pre" : "vivo";
      const detalle = (tipos[0] && (tipos[0].detail || tipos[0].description)) || "";
      const pos = posiciones(comp), valores = Object.values(pos);
      const sinEmpezar = estado === "pre" || !valores.length || (valores.length >= 8 && new Set(valores).size === 1);
      res.setHeader("Cache-Control", "public, s-maxage=45, stale-while-revalidate=60");
      const extra = q.full ? { filas: filas(comp, sinEmpezar ? {} : pos) } : {};
      return res.status(200).json({ ok: true, evento: ev.name, estado, situacion, detalle, sinEmpezar, pos: sinEmpezar ? {} : pos, ...extra, at: new Date().toISOString() });
    } catch (e) { /* prueba el siguiente intento */ }
  }
  res.setHeader("Cache-Control", "public, s-maxage=20");
  return res.status(200).json({ ok: false, error: "No se encontró el torneo en la fuente", eventos: [...new Set(vistos)] });
};
