// Vercel Function: draft en serpiente para Distinguidos Tour.
// Guarda el estado en Upstash Redis (se conecta desde Vercel > Storage). La clave de administrador va en la variable DRAFT_ADMIN_KEY.
const crypto = require("crypto");
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN = process.env.DRAFT_ADMIN_KEY || "";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const CAS = "local v=redis.call('GET',KEYS[1]) if (v==false and ARGV[1]=='') or v==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]) return 1 end return 0";

const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clave = id => "draft:" + id;
const TK = "draft:tokens";                       // links permanentes: { participante: código }
const nuevoToken = () => crypto.randomBytes(9).toString("base64url");
async function redis(cmd) {
  const r = await fetch(R_URL, { method: "POST", headers: { Authorization: "Bearer " + R_TOK, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function leer(id) { const v = await redis(["GET", clave(id)]); return v ? { st: JSON.parse(v), raw: v } : { st: null, raw: "" }; }
async function leerTokens() { const v = await redis(["GET", TK]); return v ? JSON.parse(v) : {}; }
async function guardarTokens(tk) { await redis(["SET", TK, JSON.stringify(tk)]); }
async function guardar(id, raw, st) { return (await redis(["EVAL", CAS, "1", clave(id), raw, JSON.stringify(st)])) === 1; }

function turnos(orden, rondas) { const s = []; for (let r = 0; r < rondas; r++) (r % 2 ? [...orden].reverse() : orden).forEach(p => s.push({ p, r })); return s; }
function foto(st) { return JSON.stringify({ picks: st.picks, ptr: st.ptr, pend: st.pend, turnoDesde: st.turnoDesde, estado: st.estado }); }
function respaldo(st) { st.hist = (st.hist || []).concat([foto(st)]).slice(-12); }
function tomados(st) { return new Set(st.picks.map(x => norm(x.j))); }
function cuantos(st, p) { return st.picks.filter(x => x.p === p).length; }

// Aplica los turnos vencidos (lead time) sin necesidad de un proceso aparte
function avanzar(st, ahora) {
  let cambio = false;
  if (st.estado !== "en curso") return false;
  const lim = st.limite ? Date.parse(st.limite) : null;
  while (st.ptr < st.slots.length && lim && ahora >= lim) {
    const base = Math.max(st.turnoDesde || 0, lim), vence = base + st.lead * 60000;
    if (ahora < vence) break;
    const p = st.slots[st.ptr].p;
    st.pend[p] = (st.pend[p] || 0) + 1; st.ptr++; st.turnoDesde = vence; cambio = true;
    st.log.push({ t: vence, tipo: "pierde turno", p });
  }
  if (cerrar(st)) cambio = true;
  return cambio;
}
function cerrar(st) {
  if (st.estado === "en curso" && st.ptr >= st.slots.length && !Object.values(st.pend).some(Boolean)) { st.estado = "terminado"; return true; }
  return false;
}
function publico(st, admin) {
  const o = { ...st }; delete o.hist; delete o.tokens;
  const lim = st.limite ? Date.parse(st.limite) : null, ahora = Date.now();
  o.actual = st.ptr < st.slots.length ? st.slots[st.ptr] : null;
  o.vence = o.actual && st.estado === "en curso" && lim && ahora >= lim ? Math.max(st.turnoDesde || 0, lim) + st.lead * 60000 : null;
  o.ahora = ahora; o.puedeDeshacer = !!(st.hist && st.hist.length);
  return o;
}
function quien(tokens, k) { if (!k) return null; for (const [p, t] of Object.entries(tokens || {})) if (t === k) return p; return null; }
function elegirEvento(evs, nombre) { const nt = norm(nombre); return evs.find(e => [e.name, e.shortName].some(c => { const n = norm(c); return n && (n.includes(nt) || nt.includes(n)); })) || (evs.length === 1 ? evs[0] : null); }

async function accion(b, st, esAdmin, yo) {
  const ahora = Date.now(), A = b.accion;
  const soloAdmin = () => { if (!esAdmin) throw new Error("Solo el administrador puede hacer esto"); };
  if (A === "crear") {
    soloAdmin();
    if (st) throw new Error("Ya existe un draft para este torneo");
    const orden = (b.orden || []).filter(Boolean);
    if (orden.length < 2 || new Set(orden).size !== orden.length) throw new Error("El orden debe tener participantes distintos");
    const rondas = Math.min(Math.max(+b.rondas || 4, 1), 8);
    return { id: b.t, n: String(b.n || b.t).slice(0, 120), orden, rondas, lead: Math.max(+b.lead || 10, 0.05), limite: b.limite || null,
      slots: turnos(orden, rondas), ptr: 0, pend: {}, picks: [], pool: [], estado: "preparando", turnoDesde: null, log: [{ t: ahora, tipo: "creado" }], hist: [] };
  }
  if (!st) throw new Error("No hay draft creado para este torneo");
  avanzar(st, ahora);
  switch (A) {
    case "configurar":
      soloAdmin(); if (st.picks.length) throw new Error("No se puede cambiar el orden con elecciones hechas (usa Resetear)");
      if (b.orden) { const o = b.orden.filter(Boolean); if (o.length !== st.orden.length || new Set(o).size !== o.length) throw new Error("Orden inválido"); st.orden = o; st.slots = turnos(o, st.rondas); }
      if (b.limite !== undefined) st.limite = b.limite || null;
      if (b.lead) st.lead = Math.max(+b.lead, 0.05);
      return st;
    case "pool":
      soloAdmin();
      st.pool = (b.jugadores || []).filter(x => x && x.n).slice(0, 400).map(x => ({ n: String(x.n).slice(0, 60), o: x.o ? String(x.o).slice(0, 12) : "" }));
      return st;
    case "pool_espn": {
      soloAdmin();
      const r = await fetch(ESPN, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      const ev = elegirEvento((await r.json()).events || [], st.n);
      const comp = ev && ev.competitions && ev.competitions[0] ? ev.competitions[0].competitors || [] : [];
      if (!comp.length) throw new Error("ESPN no devolvió el campo de este torneo todavía");
      const ya = new Set(st.pool.map(x => norm(x.n)));
      comp.map(c => (c.athlete || {}).displayName).filter(n => n && !ya.has(norm(n))).forEach(n => st.pool.push({ n, o: "" }));
      return st;
    }
    case "iniciar":
      soloAdmin(); if (!st.pool.length) throw new Error("Primero carga la lista de jugadores");
      st.estado = "en curso"; st.turnoDesde = ahora; st.log.push({ t: ahora, tipo: "inicio" }); cerrar(st); return st;
    case "pausar": soloAdmin(); if (st.estado === "en curso") { st.estado = "pausado"; st.log.push({ t: ahora, tipo: "pausa" }); } return st;
    case "reanudar": soloAdmin(); if (st.estado === "pausado") { st.estado = "en curso"; st.turnoDesde = ahora; st.log.push({ t: ahora, tipo: "reanuda" }); } return st;
    case "elegir": {
      const p = esAdmin && b.como ? b.como : yo;
      if (!p) throw new Error("Link no válido: pide tu link personal al administrador");
      if (st.estado !== "en curso") throw new Error(st.estado === "pausado" ? "El draft está en pausa" : st.estado === "terminado" ? "El draft ya terminó" : "El draft aún no comienza");
      const j = st.pool.find(x => norm(x.n) === norm(b.j));
      if (!j) throw new Error("Ese jugador no está en la lista del torneo");
      if (tomados(st).has(norm(j.n))) throw new Error(j.n + " ya fue elegido");
      if (cuantos(st, p) >= st.rondas) throw new Error("Ya tienes tus " + st.rondas + " jugadores");
      const suTurno = st.ptr < st.slots.length && st.slots[st.ptr].p === p;
      if (!suTurno && !(st.pend[p] > 0)) throw new Error("No es tu turno");
      respaldo(st);
      if (suTurno) { st.picks.push({ p, j: j.n, r: st.slots[st.ptr].r, t: ahora }); st.ptr++; st.turnoDesde = ahora; }
      else { st.picks.push({ p, j: j.n, r: null, tarde: true, t: ahora }); st.pend[p]--; }
      st.log.push({ t: ahora, tipo: "elige", p, j: j.n }); cerrar(st); return st;
    }
    case "saltar":
      soloAdmin(); if (st.estado !== "en curso" || st.ptr >= st.slots.length) throw new Error("No hay turno que saltar");
      respaldo(st); { const p = st.slots[st.ptr].p; st.pend[p] = (st.pend[p] || 0) + 1; st.ptr++; st.turnoDesde = ahora; st.log.push({ t: ahora, tipo: "salto", p }); }
      cerrar(st); return st;
    case "sorteo": {
      soloAdmin(); respaldo(st);
      const libres = st.pool.filter(x => !tomados(st).has(norm(x.n)));
      for (const p of st.orden) {
        let falta = Math.min(st.pend[p] || 0, st.rondas - cuantos(st, p));
        while (falta-- > 0 && libres.length) { const j = libres.splice(crypto.randomInt(libres.length), 1)[0]; st.picks.push({ p, j: j.n, r: null, azar: true, t: ahora }); }
        st.pend[p] = 0;
      }
      st.log.push({ t: ahora, tipo: "sorteo final" }); cerrar(st); return st;
    }
    case "deshacer": {
      soloAdmin(); if (!st.hist || !st.hist.length) throw new Error("No hay nada que deshacer");
      Object.assign(st, JSON.parse(st.hist.pop())); st.log.push({ t: ahora, tipo: "deshacer" }); return st;
    }
    case "resetear":
      soloAdmin(); respaldo(st);
      st.picks = []; st.ptr = 0; st.pend = {}; st.estado = "preparando"; st.turnoDesde = null; st.log.push({ t: ahora, tipo: "reseteo" }); return st;
    default: throw new Error("Acción desconocida");
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!R_URL || !R_TOK) return res.status(500).json({ ok: false, error: "Falta conectar la base de datos (Upstash Redis) al proyecto en Vercel" });
  try {
    const q = req.query || {};
    if (req.method === "GET") {
      if (q.campo) {   // campo del torneo según ESPN (solo nombres), para completar el recuadro de la lista
        const r = await fetch(ESPN, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
        const ev = elegirEvento((await r.json()).events || [], String(q.n || "").slice(0, 120));
        const comp = ev && ev.competitions && ev.competitions[0] ? ev.competitions[0].competitors || [] : [];
        return res.status(200).json({ ok: true, evento: ev ? ev.name : null, jugadores: comp.map(c => (c.athlete || {}).displayName).filter(Boolean) });
      }
      if (q.todos) {   // elecciones de todos los drafts, para que la página las use
        const ids = (await redis(["SMEMBERS", "drafts"])) || [];
        const vals = ids.length ? await redis(["MGET", ...ids.map(clave)]) : [];
        const out = {};
        ids.forEach((id, i) => { if (!vals[i]) return; const st = JSON.parse(vals[i]); const sel = {}; st.picks.forEach(x => (sel[x.p] = sel[x.p] || []).push(x.j)); if (st.picks.length) out[id] = sel; });
        return res.status(200).json({ ok: true, drafts: out });
      }
      const id = String(q.t || "").slice(0, 120); if (!id) return res.status(400).json({ ok: false, error: "Falta el torneo" });
      const tokens = await leerTokens(), esAdmin = !!(ADMIN && q.k === ADMIN), yo = quien(tokens, q.k), extra = esAdmin ? { tokens } : {};
      for (let i = 0; i < 3; i++) {
        const { st, raw } = await leer(id);
        if (!st) return res.status(200).json({ ok: true, d: null, yo, admin: esAdmin, ...extra });
        if (avanzar(st, Date.now()) && !(await guardar(id, raw, st))) continue;
        return res.status(200).json({ ok: true, d: publico(st, esAdmin), yo, admin: esAdmin, ...extra });
      }
      return res.status(409).json({ ok: false, error: "Intenta de nuevo" });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const esAdmin = !!(ADMIN && b.k === ADMIN);
      if (b.accion === "links" || b.accion === "nuevo_link") {      // crear los que falten / dar un link nuevo (anula el anterior)
        if (!esAdmin) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
        const tk = await leerTokens();
        if (b.accion === "links") (b.participantes || []).map(p => String(p).slice(0, 60)).forEach(p => { if (p && !tk[p]) tk[p] = nuevoToken(); });
        else { const p = String(b.p || "").slice(0, 60); if (!p) return res.status(400).json({ ok: false, error: "Falta el participante" }); tk[p] = nuevoToken(); }
        await guardarTokens(tk);
        return res.status(200).json({ ok: true, tokens: tk, admin: true });
      }
      const id = String(b.t || "").slice(0, 120); if (!id) return res.status(400).json({ ok: false, error: "Falta el torneo" });
      const tokens = await leerTokens();
      if (b.accion === "crear" && esAdmin) {                          // asegura un link permanente para cada participante del orden
        let cambio = false; (b.orden || []).forEach(p => { if (p && !tokens[p]) { tokens[p] = nuevoToken(); cambio = true; } });
        if (cambio) await guardarTokens(tokens);
      }
      const extra = esAdmin ? { tokens } : {};
      if (b.accion === "borrar") {
        if (!esAdmin) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
        await redis(["DEL", clave(id)]); await redis(["SREM", "drafts", id]); return res.status(200).json({ ok: true, d: null, admin: true, ...extra });
      }
      for (let i = 0; i < 4; i++) {
        const { st, raw } = await leer(id);
        const yo = quien(tokens, b.k);
        const nuevo = await accion(b, st, esAdmin, yo);
        if (await guardar(id, raw, nuevo)) {
          if (!st) await redis(["SADD", "drafts", id]);
          return res.status(200).json({ ok: true, d: publico(nuevo, esAdmin), yo, admin: esAdmin, ...extra });
        }
      }
      return res.status(409).json({ ok: false, error: "Otro participante eligió al mismo tiempo; intenta de nuevo" });
    }
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || "Error" });
  }
};
