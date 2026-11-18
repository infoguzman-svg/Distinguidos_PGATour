// Vercel Function: draft en serpiente para Distinguidos Tour, con avisos por WhatsApp (CallMeBot).
// Guarda el estado en Upstash Redis (Vercel > Storage). La clave de administrador va en la variable DRAFT_ADMIN_KEY.
const crypto = require("crypto");
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN = process.env.DRAFT_ADMIN_KEY || "";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const CMB = "https://api.callmebot.com/whatsapp.php";
const TMB = "https://api.textmebot.com/send.php";
const TMB_KEY = process.env.TEXTMEBOT_APIKEY || "";      // si existe, los avisos salen desde el WhatsApp del administrador (TextMeBot)
// Green API (gratis): avisos a UN grupo de WhatsApp (el plan gratuito permite 3 chats y un grupo cuenta como uno)
const GA_URL = (process.env.GREENAPI_URL || "https://api.green-api.com").replace(/\/+$/, "");
const GA_ID = process.env.GREENAPI_ID || "", GA_TOKEN = process.env.GREENAPI_TOKEN || "";
const MODO = GA_ID && GA_TOKEN ? "greenapi" : TMB_KEY ? "textmebot" : "callmebot";
const gaUrl = metodo => `${GA_URL}/waInstance${GA_ID}/${metodo}/${GA_TOKEN}`;
async function enviarGrupo(cfg, texto) {
  if (!cfg.grupo || !cfg.grupo.id) return { ok: false, detalle: "falta elegir el grupo de WhatsApp en el panel" };
  try {
    const r = await fetch(gaUrl("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: cfg.grupo.id, message: texto }), signal: AbortSignal.timeout(12000) });
    const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
    return { ok: r.ok && !!j.idMessage, detalle: j.idMessage ? "enviado al grupo " + (cfg.grupo.nombre || "") : t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || ("error " + r.status) };
  } catch (e) { return { ok: false, detalle: e.message || "sin respuesta de Green API" }; }
}
const TZ = "America/Santiago";
const CAS = "local v=redis.call('GET',KEYS[1]) if (v==false and ARGV[1]=='') or v==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]) return 1 end return 0";

const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clave = id => "draft:" + id;
const TK = "draft:tokens";          // links permanentes: { participante: código }
const AV = "draft:avisos";          // avisos por WhatsApp: { participante: { tel, key } }  (privado)
const AVC = "draft:avisos_cfg";     // { cada: minutos, desde: hora, hasta: hora }
const nuevoToken = () => crypto.randomBytes(9).toString("base64url");
async function redis(cmd) {
  const r = await fetch(R_URL, { method: "POST", headers: { Authorization: "Bearer " + R_TOK, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function leerJSON(k, def) { const v = await redis(["GET", k]); return v ? JSON.parse(v) : def; }
async function guardarJSON(k, v) { await redis(["SET", k, JSON.stringify(v)]); }
async function leer(id) { const v = await redis(["GET", clave(id)]); return v ? { st: JSON.parse(v), raw: v } : { st: null, raw: "" }; }
async function guardar(id, raw, st) { return (await redis(["EVAL", CAS, "1", clave(id), raw, JSON.stringify(st)])) === 1; }
async function config() { return Object.assign({ cada: 30, desde: 23, hasta: 8 }, await leerJSON(AVC, {})); }

function turnos(orden, rondas) { const s = []; for (let r = 0; r < rondas; r++) (r % 2 ? [...orden].reverse() : orden).forEach(p => s.push({ p, r })); return s; }
function foto(st) { return JSON.stringify({ picks: st.picks, ptr: st.ptr, pend: st.pend, turnoDesde: st.turnoDesde, estado: st.estado }); }
function respaldo(st) { st.hist = (st.hist || []).concat([foto(st)]).slice(-12); }
function tomados(st) { return new Set(st.picks.map(x => norm(x.j))); }
function cuantos(st, p) { return st.picks.filter(x => x.p === p).length; }
function quien(tokens, k) { if (!k) return null; for (const [p, t] of Object.entries(tokens || {})) if (t === k) return p; return null; }
function elegirEvento(evs, nombre) { const nt = norm(nombre); return evs.find(e => [e.name, e.shortName].some(c => { const n = norm(c); return n && (n.includes(nt) || nt.includes(n)); })) || (evs.length === 1 ? evs[0] : null); }
const ocultar = tel => "…" + String(tel).slice(-4);
const horaCL = (ms, o) => new Date(ms).toLocaleString("es-CL", Object.assign({ timeZone: TZ, hour: "2-digit", minute: "2-digit" }, o || {}));

// ----- turnos vencidos (lead time), sin proceso aparte -----
function avanzarTurnos(st, ahora) {
  let cambio = false;
  if (st.estado !== "en curso") return false;
  const lim = st.limite ? Date.parse(st.limite) : null;
  while (st.ptr < st.slots.length && lim && ahora >= lim) {
    const base = Math.max(st.turnoDesde || 0, lim), vence = base + st.lead * 60000;
    if (ahora < vence) break;
    const p = st.slots[st.ptr].p;
    st.pend[p] = (st.pend[p] || 0) + 1; st.ptr++; st.turnoDesde = vence; cambio = true;
    if (st.ptr >= st.slots.length) st.cierreAt = vence;
    st.log.push({ t: vence, tipo: "pierde turno", p });
    (st.eventos = st.eventos || []).push({ tipo: "pierde", p });
  }
  // lead time: al terminar el plazo del último turno, los casilleros vacíos se completan solos y el draft se cierra
  if (st.ptr >= st.slots.length && lim && ahora >= lim && Object.values(st.pend || {}).some(n => n > 0) && ahora >= (st.cierreAt || 0)) {
    autocompletar(st, ahora); cambio = true;
  }
  if (cerrar(st)) cambio = true;
  return cambio;
}
// Completa a cada participante pendiente con los mejor cotizados aún disponibles (la lista está ordenada de mejor a peor),
// repartiendo de a uno en el orden del draft para que sea parejo.
function avanzar(st, ahora) {
  let cambio = false;
  for (let i = 0; i < 80; i++) {
    const a = avanzarTurnos(st, ahora), b = autoElegir(st, ahora);
    if (a || b) cambio = true; else break;
  }
  return cambio;
}
// Elección automática: si el participante activó su preselección, cuando le toca (o si tiene turnos pendientes)
// se elige al primero de SU lista (orden de prioridad que él mismo definió, 1 a 15) que siga libre.
const MAX_PRE = 15;
function mejorDePre(st, p) {
  const c = (st.pre || {})[p];
  if (!c || !c.activo || !(c.lista || []).length) return null;
  const tom = tomados(st);
  for (const n of c.lista) {
    const j = st.pool.find(x => norm(x.n) === norm(n));
    if (j && !tom.has(norm(j.n))) return j.n;
  }
  return null;
}
function autoElegir(st, ahora) {
  if (st.estado !== "en curso") return false;
  let hubo = false;
  for (let k = 0; k < 100 && st.ptr < st.slots.length; k++) {
    const { p, r } = st.slots[st.ptr];
    if (cuantos(st, p) >= st.rondas) break;
    const j = mejorDePre(st, p); if (!j) break;
    const limE = st.limite ? Date.parse(st.limite) : 0, inicio = Math.max(st.turnoDesde || 0, limE);
    respaldo(st);
    st.picks.push({ p, j, r, pre: true, t: ahora }); st.ptr++; st.turnoDesde = ahora; hubo = true;
    (st.eventos = st.eventos || []).push({ tipo: "pre", p, j }); st.log.push({ t: ahora, tipo: "elige (preselección)", p, j });
    if (st.ptr >= st.slots.length) {
      st.cierreAt = inicio + st.lead * 60000;
      if (Object.values(st.pend || {}).some(n => n > 0)) st.eventos.push({ tipo: "cierre" });
    }
  }
  for (const p of st.orden) {
    while ((st.pend[p] || 0) > 0 && cuantos(st, p) < st.rondas) {
      const j = mejorDePre(st, p); if (!j) break;
      respaldo(st);
      st.picks.push({ p, j, r: null, tarde: true, pre: true, t: ahora }); st.pend[p]--; hubo = true;
      (st.eventos = st.eventos || []).push({ tipo: "pre", p, j });
      if (enLead(st, ahora) && st.ptr < st.slots.length) { st.turnoDesde = ahora; st.avisoForzar = true; }
    }
  }
  if (hubo) cerrar(st);
  return hubo;
}
function autocompletar(st, ahora) {
  const libres = st.pool.filter(x => !tomados(st).has(norm(x.n)));
  let hubo = true;
  while (hubo && libres.length) {
    hubo = false;
    for (const p of st.orden) {
      if ((st.pend[p] || 0) > 0 && cuantos(st, p) < st.rondas && libres.length) {
        const j = libres.shift();
        st.picks.push({ p, j: j.n, r: null, auto: true, t: ahora }); st.pend[p]--;
        (st.eventos = st.eventos || []).push({ tipo: "auto", p, j: j.n }); hubo = true;
      }
    }
  }
  Object.keys(st.pend || {}).forEach(p => st.pend[p] = 0);
  st.log.push({ t: ahora, tipo: "completado automático" });
}
function cerrar(st) {
  if (st.estado === "en curso" && st.ptr >= st.slots.length && !Object.values(st.pend).some(Boolean)) { st.estado = "terminado"; return true; }
  return false;
}
function vencimiento(st) { const lim = st.limite ? Date.parse(st.limite) : null; return st.ptr < st.slots.length && st.estado === "en curso" && lim && Date.now() >= lim ? Math.max(st.turnoDesde || 0, lim) + st.lead * 60000 : null; }
function publico(st, yo) {
  const o = { ...st }; delete o.hist; delete o.tokens; delete o.pre;
  o.miPre = yo && st.pre && st.pre[yo] ? st.pre[yo] : { lista: [], activo: false };
  o.actual = st.ptr < st.slots.length ? st.slots[st.ptr] : null;
  o.vence = vencimiento(st); o.ahora = Date.now(); o.puedeDeshacer = !!(st.hist && st.hist.length);
  return o;
}

// ----- avisos por WhatsApp -----
function enSilencio(ahora, cfg) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(ahora))) % 24;
  if (cfg.desde === cfg.hasta) return false;
  return cfg.desde > cfg.hasta ? (h >= cfg.desde || h < cfg.hasta) : (h >= cfg.desde && h < cfg.hasta);
}
// Decide si corresponde avisar al participante de turno: al empezar su turno, y luego cada "cada" minutos (fuera del horario de silencio)
const enLead = (st, ahora) => { const lim = st.limite ? Date.parse(st.limite) : null; return !!(lim && ahora >= lim); };
const pendientes = st => Object.entries(st.pend || {}).filter(([, n]) => n > 0);
// Decide si corresponde avisar: al empezar cada turno y luego cada "cada" minutos.
// En lead time (desde la fecha límite) es urgente: se avisa cada turno de 10 min, aunque sea horario de silencio.
function decidirAviso(st, ahora, cfg, forzar) {
  const urgente = enLead(st, ahora), ev = st.eventos || [];
  if (st.estado === "terminado" && !st.avisoFin && st.picks.length) { st.avisoFin = true; st.eventos = []; return { tipo: "fin", eventos: ev, urgente }; }
  if (st.estado !== "en curso") return null;
  if (st.ptr >= st.slots.length) {               // pasaron todos los turnos pero hay pendientes
    if (!ev.length) return null;
    st.eventos = []; return { tipo: "pendientes", eventos: ev, urgente };
  }
  if (!forzar && !urgente && enSilencio(ahora, cfg)) return null;
  const a = st.aviso || {}, nuevo = a.ptr !== st.ptr || !!st.avisoForzar;
  const cada = urgente ? st.lead : cfg.cada;
  if (!forzar && !nuevo && ahora - (a.t || 0) < cada * 60000) return null;
  const renueva = !!st.avisoForzar && a.ptr === st.ptr;
  st.aviso = { ptr: st.ptr, t: ahora, n: nuevo ? 1 : (a.n || 0) + 1 }; st.avisoForzar = false; st.eventos = [];
  return { p: st.slots[st.ptr].p, r: st.slots[st.ptr].r, tipo: nuevo ? (renueva ? "renueva" : "turno") : "recordatorio", eventos: ev, urgente };
}
// Mensaje final al grupo: alineaciones de cada participante (en el orden en que eligió). 🤖 = elegido por el sistema.
const ICONO = { "Cristóbal": "🐐", "Sebastián": "🦡", "Pedro": "🦈", "Cafeta": "🦌", "José Miguel": "🦕", "Benjamín": "⚰️" };
function textoFin(st, link) {
  const out = ["🏁 *Hemos finalizado la elección, ¡suerte a todos!* ⛳"];
  const lim = st.limite ? Date.parse(st.limite) : null;
  if (lim) {
    const d = new Date(lim + 24 * 3600000).toLocaleDateString("es-CL", { timeZone: TZ, weekday: "long", day: "numeric" }).replace(",", "");
    out.push(`*${st.n}* · parte el ${d}`);
  } else out.push(`*${st.n}*`);
  let bot = false;
  for (const p of st.orden || []) {
    const js = (st.picks || []).filter(x => x.p === p).map(x => { if (x.pre || x.auto) bot = true; return x.j + (x.pre || x.auto ? " 🤖" : ""); });
    out.push("", `${ICONO[p] || "⛳"} *${p}*`, js.length ? js.join(" · ") : "—");
  }
  if (bot) out.push("", "_🤖 = elegido automáticamente_");
  out.push("", `👉 ${link}`);
  return out.join("\n");
}
function textoAviso(st, av, link) {
  const lim = st.limite ? Date.parse(st.limite) : null, vence = vencimiento(st), pend = pendientes(st);
  const lineas = [];
  for (const e of av.eventos || []) {
    if (e.tipo === "pierde") lineas.push(`⛔ *${e.p}* no eligió a tiempo y pierde su turno.`);
    if (e.tipo === "tarde") lineas.push(`✅ *${e.p}* volvió (acá estoy) y eligió a *${e.j}*.`);
    if (e.tipo === "pre") lineas.push(`🤖 *${e.p}* eligió automáticamente a *${e.j}* (de su preselección).`);
    if (e.tipo === "auto") lineas.push(`🤖 A *${e.p}* se le asignó automáticamente a *${e.j}* (mejor cotizado disponible).`);
  }
  if (av.tipo === "fin") return textoFin(st, link);
  if (av.tipo === "pendientes") return [...lineas, `⛔ *Draft ${st.n}:* pasaron todos los turnos.`,
    `Pendientes por elegir: ${pend.map(([p, n]) => `*${p}* (${n})`).join(", ")}. Pueden elegir apenas entren (acá estoy); el primero que conteste, elige primero.`,
    ...(st.cierreAt && enLead(st, Date.now()) ? [`⏱️ Hasta las *${horaCL(st.cierreAt)}*; después se completa automáticamente con los mejor cotizados disponibles y el draft se cierra.`] : []), `👉 ${link}`].join("\n");
  if (av.urgente) {
    if (av.tipo === "renueva") lineas.push(`🔄 *${av.p}*, se renuevan tus ${Math.round(st.lead)} minutos.`);
    else lineas.push(`🚨🔴 *LEAD TIME · Draft ${st.n}*`, av.tipo === "recordatorio" ? `*${av.p}*, ¡sigue siendo tu turno! (ronda ${av.r + 1})` : `*${av.p}*, ¡te toca! (ronda ${av.r + 1})`);
    if (vence) lineas.push(`⏱️ Tienes *${st.lead >= 1 ? Math.round(st.lead) + " minutos" : "unos segundos"}*, hasta las *${horaCL(vence)}*, o tu turno pasa al siguiente.`);
  } else {
    lineas.push(av.tipo === "recordatorio" ? `⏰ *Recordatorio · Draft ${st.n}*` : `🐍 *Draft ${st.n}*`,
      av.tipo === "recordatorio" ? `${av.p}, sigue siendo tu turno (ronda ${av.r + 1}).` : `${av.p}, ¡te toca elegir! (ronda ${av.r + 1})`);
    if (lim && Date.now() < lim) lineas.push(`🗓️ Fecha límite: ${horaCL(lim, { weekday: "short", day: "2-digit", month: "2-digit" })} (hora de Chile)`);
  }
  const otros = pend.filter(([p]) => p !== av.p);
  if (av.urgente && otros.length) lineas.push(`⏳ Pendientes (pueden elegir apenas entren): ${otros.map(([p, n]) => `${p} (${n})`).join(", ")}.`);
  lineas.push(`👉 ${link}`);
  return lineas.join("\n");
}
async function enviarWhatsApp(cuenta, texto) {
  if (!cuenta) return { ok: false, detalle: "no tiene avisos activados" };
  try {
    const url = MODO === "textmebot"
      ? `${TMB}?recipient=${encodeURIComponent(String(cuenta.tel).replace(/\D/g, ""))}&apikey=${encodeURIComponent(TMB_KEY)}&text=${encodeURIComponent(texto)}`
      : `${CMB}?phone=${encodeURIComponent(cuenta.tel)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(cuenta.key)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const t = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    return { ok: r.ok && !/(invalid|incorrect|wrong|error|not activated|apikey is not|not connected|expired|disconnected)/i.test(t), detalle: t };
  } catch (e) { return { ok: false, detalle: e.message || "sin respuesta de CallMeBot" }; }
}
async function avisar(av, st, cuentas, tokens, base, cfg) {
  if (!av) return null;
  if (!av.p) {                           // fin del draft o pendientes: solo tiene sentido en el grupo
    if (MODO !== "greenapi") return null;
    const r = await enviarGrupo(cfg, textoAviso(st, av, base + "/"));
    return { p: "grupo", tipo: av.tipo, ok: r.ok, detalle: r.detalle };
  }
  if (MODO === "greenapi") {             // al grupo: nunca el link personal, solo la dirección de la página
    const r = await enviarGrupo(cfg, textoAviso(st, av, base + "/"));
    return { p: av.p, tipo: av.tipo, ok: r.ok, detalle: r.detalle };
  }
  const link = base + "/?d=" + (tokens[av.p] || "");
  const r = await enviarWhatsApp(cuentas[av.p], textoAviso(st, av, link));
  return { p: av.p, tipo: av.tipo, ok: r.ok, detalle: r.detalle };
}
const baseDe = req => process.env.SITIO_URL || ("https://" + ((req.headers || {})["x-forwarded-host"] || (req.headers || {}).host || "distinguidostour.vercel.app"));

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
    case "iniciar":
      soloAdmin(); if (!st.pool.length) throw new Error("Primero carga la lista de jugadores");
      st.estado = "en curso"; st.turnoDesde = ahora; st.aviso = null; st.eventos = []; st.avisoFin = false; st.avisoForzar = false; st.cierreAt = null; st.log.push({ t: ahora, tipo: "inicio" }); cerrar(st); return st;
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
      if (suTurno) {
        const limE = st.limite ? Date.parse(st.limite) : 0, inicio = Math.max(st.turnoDesde || 0, limE);
        st.picks.push({ p, j: j.n, r: st.slots[st.ptr].r, t: ahora }); st.ptr++; st.turnoDesde = ahora;
        if (st.ptr >= st.slots.length) {
          st.cierreAt = inicio + st.lead * 60000;   // los pendientes pueden elegir hasta que habría vencido ese último turno
          if (Object.values(st.pend || {}).some(n => n > 0)) (st.eventos = st.eventos || []).push({ tipo: "cierre" });
        }
      }
      else {
        st.picks.push({ p, j: j.n, r: null, tarde: true, t: ahora }); st.pend[p]--;
        (st.eventos = st.eventos || []).push({ tipo: "tarde", p, j: j.n });
        if (enLead(st, ahora) && st.ptr < st.slots.length) { st.turnoDesde = ahora; st.avisoForzar = true; }   // se renuevan los minutos del que está eligiendo
      }
      st.log.push({ t: ahora, tipo: "elige", p, j: j.n }); cerrar(st); return st;
    }
    case "preseleccion": {
      if (!yo) throw new Error("Abre tu link personal para guardar tu preselección");
      if (st.estado === "terminado") throw new Error("El draft ya terminó");
      const lista = [...new Set((b.lista || []).map(String))].map(n => st.pool.find(x => norm(x.n) === norm(n))).filter(Boolean).map(x => x.n).slice(0, MAX_PRE);
      st.pre = st.pre || {}; st.pre[yo] = { lista, activo: !!b.activo };
      return st;
    }
    case "saltar":
      soloAdmin(); if (st.estado !== "en curso" || st.ptr >= st.slots.length) throw new Error("No hay turno que saltar");
      respaldo(st); { const p = st.slots[st.ptr].p; st.pend[p] = (st.pend[p] || 0) + 1; st.ptr++; st.turnoDesde = ahora; st.log.push({ t: ahora, tipo: "salto", p }); (st.eventos = st.eventos || []).push({ tipo: "pierde", p }); if (st.ptr >= st.slots.length) st.cierreAt = ahora + st.lead * 60000; }
      cerrar(st); return st;
    case "sorteo": {
      soloAdmin(); respaldo(st); autocompletar(st, ahora); cerrar(st); return st;
    }
    case "deshacer": {
      soloAdmin(); if (!st.hist || !st.hist.length) throw new Error("No hay nada que deshacer");
      Object.assign(st, JSON.parse(st.hist.pop())); st.log.push({ t: ahora, tipo: "deshacer" }); return st;
    }
    case "resetear":
      soloAdmin(); respaldo(st);
      st.picks = []; st.ptr = 0; st.pend = {}; st.estado = "preparando"; st.turnoDesde = null; st.aviso = null; st.eventos = []; st.avisoFin = false; st.avisoForzar = false; st.cierreAt = null; st.log.push({ t: ahora, tipo: "reseteo" }); return st;
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
    const q = req.query || {}, base = baseDe(req);
    if (req.method === "GET") {
      if (q.campo) {   // campo del torneo según ESPN (solo nombres), para completar el recuadro de la lista
        const r = await fetch(ESPN, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
        // solo el torneo con el mismo nombre: si ESPN aún muestra otro torneo, no se devuelve su campo por error
        const nt = norm(String(q.n || "").slice(0, 120));
        const ev = ((await r.json()).events || []).find(e => [e.name, e.shortName].some(c => { const n = norm(c); return n && nt && (n.includes(nt) || nt.includes(n)); }));
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
      if (q.recordar) {
        const tokens = await leerJSON(TK, {}), cuentas = await leerJSON(AV, {}), cfg = await config();   // lo llama GitHub Actions cada 10 minutos: turnos vencidos + avisos y recordatorios pendientes
        const ids = (await redis(["SMEMBERS", "drafts"])) || [], envios = [];
        for (const id of ids) {
          for (let i = 0; i < 3; i++) {
            const { st, raw } = await leer(id); if (!st || st.estado !== "en curso") break;
            const ahora = Date.now(), c = avanzar(st, ahora), av = decidirAviso(st, ahora, cfg, false);
            if (!c && !av) break;
            if (!(await guardar(id, raw, st))) continue;
            if (av) envios.push(await avisar(av, st, cuentas, tokens, base, cfg));
            break;
          }
        }
        return res.status(200).json({ ok: true, envios });
      }
      const id = String(q.t || "").slice(0, 120); if (!id) return res.status(400).json({ ok: false, error: "Falta el torneo" });
      // una sola lectura a la base de datos por consulta (la página se actualiza cada pocos segundos)
      const [vTk, vAv, vCfg, vSt] = (await redis(["MGET", TK, AV, AVC, clave(id)])) || [];
      const tokens = vTk ? JSON.parse(vTk) : {}, cuentas = vAv ? JSON.parse(vAv) : {}, cfg = Object.assign({ cada: 30, desde: 23, hasta: 8 }, vCfg ? JSON.parse(vCfg) : {});
      let st = vSt ? JSON.parse(vSt) : null, raw = vSt || "";
      const esAdmin = !!(ADMIN && q.k === ADMIN), yo = quien(tokens, q.k) || quien(tokens, q.kp);
      const extra = esAdmin ? { tokens, avisos: Object.fromEntries(Object.keys(tokens).map(p => [p, cuentas[p] ? ocultar(cuentas[p].tel) : ""])), cfgAvisos: cfg, modoAvisos: MODO } : { modoAvisos: MODO };
      extra.grupoAvisos = cfg.grupo ? cfg.grupo.nombre : null;
      if (yo) extra.misAvisos = cuentas[yo] ? { activo: true, tel: ocultar(cuentas[yo].tel) } : { activo: false };
      for (let i = 0; i < 3; i++) {
        if (i > 0) ({ st, raw } = await leer(id));
        if (!st) return res.status(200).json({ ok: true, d: null, yo, admin: esAdmin, ...extra });
        const ahora = Date.now(), c = avanzar(st, ahora), av = decidirAviso(st, ahora, cfg, false);
        if ((c || av) && !(await guardar(id, raw, st))) continue;
        if (av) await avisar(av, st, cuentas, tokens, base, cfg);
        return res.status(200).json({ ok: true, d: publico(st, yo), yo, admin: esAdmin, ...extra });
      }
      return res.status(409).json({ ok: false, error: "Intenta de nuevo" });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const esAdmin = !!(ADMIN && b.k === ADMIN);
      const tokens = await leerJSON(TK, {}), cuentas = await leerJSON(AV, {}), cfg = await config(), yo = quien(tokens, b.k) || quien(tokens, b.kp);
      const extra = esAdmin ? { tokens, avisos: Object.fromEntries(Object.keys(tokens).map(p => [p, cuentas[p] ? ocultar(cuentas[p].tel) : ""])), cfgAvisos: cfg, modoAvisos: MODO } : { modoAvisos: MODO };
      extra.grupoAvisos = cfg.grupo ? cfg.grupo.nombre : null;
      // ----- grupo de WhatsApp (Green API) -----
      if (b.accion === "grupos" || b.accion === "grupo_set") {
        if (!esAdmin) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
        if (MODO !== "greenapi") return res.status(400).json({ ok: false, error: "Green API no está configurado en Vercel (faltan GREENAPI_ID y GREENAPI_TOKEN)" });
        if (b.accion === "grupos") {
          let estado = "";
          try { estado = ((await (await fetch(gaUrl("getStateInstance"), { signal: AbortSignal.timeout(9000) })).json()) || {}).stateInstance || ""; } catch (e) {}
          const r = await fetch(gaUrl("getContacts"), { signal: AbortSignal.timeout(12000) });
          const lista = await r.json().catch(() => []);
          const grupos = (Array.isArray(lista) ? lista : []).filter(c => String(c.id || "").endsWith("@g.us")).map(c => ({ id: c.id, nombre: c.name || c.contactName || c.id }));
          return res.status(200).json({ ok: true, admin: true, ...extra, grupos, estadoGreen: estado });
        }
        const id = String(b.id || ""); if (!id.endsWith("@g.us")) return res.status(400).json({ ok: false, error: "Elige un grupo de la lista" });
        cfg.grupo = { id, nombre: String(b.nombre || id).slice(0, 80) }; await guardarJSON(AVC, cfg);
        const prueba = await enviarGrupo(cfg, "✅ Este grupo recibirá los avisos de turno del draft de Distinguidos Tour.");
        return res.status(200).json({ ok: true, admin: true, ...extra, cfgAvisos: cfg, grupoAvisos: cfg.grupo.nombre, prueba });
      }
      // ----- links permanentes -----
      if (b.accion === "links" || b.accion === "nuevo_link") {
        if (!esAdmin) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
        if (b.accion === "links") (b.participantes || []).map(p => String(p).slice(0, 60)).forEach(p => { if (p && !tokens[p]) tokens[p] = nuevoToken(); });
        else { const p = String(b.p || "").slice(0, 60); if (!p) return res.status(400).json({ ok: false, error: "Falta el participante" }); tokens[p] = nuevoToken(); }
        await guardarJSON(TK, tokens);
        return res.status(200).json({ ok: true, admin: true, ...extra, tokens });
      }
      // ----- avisos por WhatsApp -----
      if (b.accion === "avisos_registrar") {
        if (!yo) return res.status(403).json({ ok: false, error: "Abre tu link personal para activar tus avisos" });
        const tel = String(b.tel || "").replace(/[\s\-()]/g, ""), key = String(b.key || "").trim();
        if (!/^\+?\d{8,15}$/.test(tel)) return res.status(400).json({ ok: false, error: "Número no válido: escríbelo con código de país, por ejemplo +56912345678" });
        if (MODO === "callmebot" && !/^[A-Za-z0-9]{3,40}$/.test(key)) return res.status(400).json({ ok: false, error: "La APIKEY no parece válida: copia solo el número que te envió CallMeBot" });
        cuentas[yo] = { tel: tel.startsWith("+") ? tel : "+" + tel, key }; await guardarJSON(AV, cuentas);
        const prueba = await enviarWhatsApp(cuentas[yo], `✅ ${yo}: tus avisos del draft de Distinguidos Tour quedaron activados. Te escribiremos cuando sea tu turno.`);
        if (!prueba.ok && /(invalid|incorrect|wrong|not activated|apikey is not)/i.test(prueba.detalle || "")) {   // CallMeBot rechazó los datos: no se guardan
          delete cuentas[yo]; await guardarJSON(AV, cuentas);
          return res.status(400).json({ ok: false, error: "CallMeBot rechazó los datos (“" + prueba.detalle + "”). Revisa tu número y la APIKEY que te envió el bot." });
        }
        return res.status(200).json({ ok: true, yo, misAvisos: { activo: true, tel: ocultar(cuentas[yo].tel) }, prueba, modoAvisos: MODO });
      }
      if (b.accion === "avisos_quitar") {
        if (!yo) return res.status(403).json({ ok: false, error: "Abre tu link personal" });
        delete cuentas[yo]; await guardarJSON(AV, cuentas);
        return res.status(200).json({ ok: true, yo, misAvisos: { activo: false } });
      }
      if (b.accion === "avisos_tel") {
        if (!esAdmin) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
        const p = String(b.p || "").slice(0, 60), tel = String(b.tel || "").replace(/[\s\-()]/g, "");
        if (!p) return res.status(400).json({ ok: false, error: "Falta el participante" });
        let prueba = null;
        if (!tel) delete cuentas[p];
        else {
          if (!/^\+?\d{8,15}$/.test(tel)) return res.status(400).json({ ok: false, error: "Número no válido: escríbelo con código de país, por ejemplo +56912345678" });
          if (MODO === "callmebot") return res.status(400).json({ ok: false, error: "Con CallMeBot cada participante debe activar sus avisos desde su link" });
          cuentas[p] = { tel: tel.startsWith("+") ? tel : "+" + tel };
          prueba = await enviarWhatsApp(cuentas[p], `✅ ${p}: quedaste inscrito para recibir por WhatsApp los avisos del draft de Distinguidos Tour.`);
        }
        await guardarJSON(AV, cuentas);
        const avisos = Object.fromEntries(Object.keys(tokens).map(q => [q, cuentas[q] ? ocultar(cuentas[q].tel) : ""]));
        return res.status(200).json({ ok: true, admin: true, ...extra, avisos, prueba });
      }
      if (b.accion === "avisos_cfg") {
        if (!esAdmin) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
        const n = { ...cfg, cada: Math.min(Math.max(+b.cada || 30, 0.05), 720), desde: Math.min(Math.max(+b.desde || 0, 0), 23), hasta: Math.min(Math.max(+b.hasta || 0, 0), 23) };
        await guardarJSON(AVC, n);
        return res.status(200).json({ ok: true, admin: true, ...extra, cfgAvisos: n });
      }
      const id = String(b.t || "").slice(0, 120); if (!id) return res.status(400).json({ ok: false, error: "Falta el torneo" });
      if (b.accion === "crear" && esAdmin) {           // asegura un link permanente para cada participante del orden
        let cambio = false; (b.orden || []).forEach(p => { if (p && !tokens[p]) { tokens[p] = nuevoToken(); cambio = true; } });
        if (cambio) await guardarJSON(TK, tokens);
      }
      if (b.accion === "borrar") {
        if (!esAdmin) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
        await redis(["DEL", clave(id)]); await redis(["SREM", "drafts", id]); return res.status(200).json({ ok: true, d: null, admin: true, ...extra });
      }
      for (let i = 0; i < 4; i++) {
        const { st, raw } = await leer(id);
        let nuevo, av;
        if (b.accion === "avisar") {                     // aviso automático forzado por el administrador (ignora el silencio)
          if (!esAdmin) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
          if (!st) return res.status(400).json({ ok: false, error: "No hay draft creado para este torneo" });
          avanzar(st, Date.now()); av = decidirAviso(st, Date.now(), cfg, true); nuevo = st;
          if (!av) return res.status(400).json({ ok: false, error: "No hay un turno en curso" });
        } else {
          nuevo = await accion(b, st, esAdmin, yo);
          if (b.accion !== "deshacer" && b.accion !== "crear") avanzar(nuevo, Date.now());
          av = decidirAviso(nuevo, Date.now(), cfg, false);
        }
        if (await guardar(id, raw, nuevo)) {
          if (!st) await redis(["SADD", "drafts", id]);
          const envio = av ? await avisar(av, nuevo, cuentas, tokens, base, cfg) : null;
          return res.status(200).json({ ok: true, d: publico(nuevo, yo), yo, admin: esAdmin, ...extra, envio });
        }
      }
      return res.status(409).json({ ok: false, error: "Otro participante eligió al mismo tiempo; intenta de nuevo" });
    }
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || "Error" });
  }
};
