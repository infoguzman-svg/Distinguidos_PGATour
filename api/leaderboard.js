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
function posiciones(competidores) {
  const res = {}, todos = [];
  for (const c of competidores) {
    const k = norm(nombre(c));
    if (!k) continue;
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
      const pos = posiciones(comp), valores = Object.values(pos);
      const sinEmpezar = estado === "pre" || !valores.length || (valores.length >= 8 && new Set(valores).size === 1);
      res.setHeader("Cache-Control", "public, s-maxage=45, stale-while-revalidate=60");
      return res.status(200).json({ ok: true, evento: ev.name, estado, sinEmpezar, pos: sinEmpezar ? {} : pos, at: new Date().toISOString() });
    } catch (e) { /* prueba el siguiente intento */ }
  }
  res.setHeader("Cache-Control", "public, s-maxage=20");
  return res.status(200).json({ ok: false, error: "No se encontró el torneo en la fuente", eventos: [...new Set(vistos)] });
};
