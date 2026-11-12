// Vercel Function: busca con Claude (API de Anthropic + búsqueda web) las cuotas para ganar un torneo del PGA Tour.
// Opcional y pagado: solo funciona si existe la variable ANTHROPIC_API_KEY. Solo la usa el administrador (DRAFT_ADMIN_KEY).
const KEY = process.env.ANTHROPIC_API_KEY || "";
const ADMIN = process.env.DRAFT_ADMIN_KEY || "";
const MODELO = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const PRECIO = { "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.10, 0.50], "claude-opus-5-5": [4, 20] };   // USD por millón de tokens (entrada, salida)

function consulta(n, ini, fin, jugadores) {
  return `Necesito las cuotas de apuestas para GANAR el torneo de golf "${n}" del PGA Tour${ini ? ` (${ini}${fin ? " a " + fin : ""})` : ""}.
Busca en la web las cuotas outright "to win" más recientes de ese torneo: de preferencia FanDuel; si no las encuentras, DraftKings, BetMGM u otra casa conocida, o el artículo de cuotas ("Odds outlook") de pgatour.com.
${jugadores.length ? `Estos son los inscritos según ESPN; usa exactamente estos nombres cuando corresponda:\n${jugadores.join("\n")}\n` : ""}
Responde SOLO con:
- Una línea por jugador con cuota encontrada, en formato exacto "Nombre Apellido +1600" (cuota americana), ordenadas de mejor a peor cotizado.
- Al final, una línea: "FUENTE: <casa o sitio> · <fecha de las cuotas>".
No inventes cuotas: incluye solo los jugadores cuya cuota encontraste. Sin ningún otro texto.`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!ADMIN || b.k !== ADMIN) return res.status(403).json({ ok: false, error: "Solo el administrador puede hacer esto" });
    if (!KEY) return res.status(400).json({ ok: false, error: "La búsqueda con IA está desactivada: falta la variable ANTHROPIC_API_KEY en Vercel (opción pagada). Usa “Pedir cuotas a Claude (gratis)”." });
    const n = String(b.n || "").slice(0, 120); if (!n) return res.status(400).json({ ok: false, error: "Falta el torneo" });
    const jugadores = (Array.isArray(b.jugadores) ? b.jugadores : []).map(x => String(x).slice(0, 60)).filter(Boolean).slice(0, 200);
    const messages = [{ role: "user", content: consulta(n, b.ini, b.fin, jugadores) }];
    const uso = { entrada: 0, salida: 0, busquedas: 0 };
    let texto = "";
    for (let vuelta = 0; vuelta < 4; vuelta++) {          // la búsqueda web puede pausar el turno ("pause_turn"): se continúa
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODELO, max_tokens: 4000, messages,
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }, { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 }] }),
        signal: AbortSignal.timeout(240000),
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || ("Error de la API de Anthropic (" + r.status + ")"));
      const u = j.usage || {};
      uso.entrada += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      uso.salida += u.output_tokens || 0;
      uso.busquedas += (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
      texto += (j.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
      if (j.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: j.content });
    }
    const p = PRECIO[MODELO] || PRECIO["claude-sonnet-5-5"];
    const costo = uso.entrada / 1e6 * p[0] + uso.salida / 1e6 * p[1] + uso.busquedas * 0.01;
    const lineas = texto.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const fuente = (lineas.find(s => /^fuente\s*:/i.test(s)) || "").replace(/^fuente\s*:\s*/i, "");
    const lista = lineas.filter(s => !/^fuente\s*:/i.test(s) && /[+-]\d{3,6}\b/.test(s)).map(s => s.replace(/^[-•*\d.)\s]+/, ""));
    if (!lista.length) return res.status(200).json({ ok: false, error: "No encontré cuotas publicadas para este torneo todavía. Prueba más tarde o usa “Pedir cuotas a Claude (gratis)”.", uso, costo });
    return res.status(200).json({ ok: true, lista, fuente, uso, costo: Math.round(costo * 1000) / 1000, modelo: MODELO });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || "Error" });
  }
};
