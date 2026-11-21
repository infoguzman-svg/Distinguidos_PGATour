"""Lee el leaderboard (fuente: API no oficial de ESPN) y guarda las posiciones de los jugadores elegidos
en data/posiciones.json. Trabaja con el torneo marcado como Actual y con los que estén en curso (o todos con FORZAR=1).
Para pruebas sin internet: ESPN_MOCK=ruta/respuesta.json"""
import datetime as dt, json, os, re, unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
URL = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard"
PF = RAIZ / "data" / "posiciones.json"

def norm(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())

def traer(params):
    if os.environ.get("ESPN_MOCK"):
        return json.load(open(os.environ["ESPN_MOCK"], encoding="utf-8"))
    import requests
    r = requests.get(URL, params=params or None, timeout=30, headers={"User-Agent": "Mozilla/5.0 (distinguidos-pga)"})
    r.raise_for_status()
    return r.json()

def nombre(c):
    a = c.get("athlete") or {}
    return a.get("displayName") or a.get("fullName") or c.get("displayName") or ""

def al_par(c):
    s = c.get("score")
    if isinstance(s, dict): s = s.get("displayValue", s.get("value"))
    s = str(s if s is not None else "").strip()
    if s.upper() in ("E", "EVEN"): return 0
    try: return int(s.replace("+", ""))
    except ValueError: return None

def jugo(c):
    """¿Ya jugó al menos un hoyo? None = la fuente no trae ese detalle (no se filtra).
    Quien todavía no sale a jugar queda sin posición (0 puntos) hasta su primer hoyo."""
    ls = c.get("linescores")
    if not isinstance(ls, list): return None
    for r in ls:
        if not isinstance(r, dict): continue
        if (isinstance(r.get("linescores"), list) and r["linescores"]): return True
        try:
            if float(r.get("value") or 0) > 0: return True
        except (TypeError, ValueError): pass
    s = al_par(c)
    return s is not None and s != 0           # score distinto de par = ya jugó

def posiciones(competidores):
    """nombre normalizado -> 'T3' / '1'. Usa la posición que informa la fuente; si falta, la calcula por score."""
    res, todos = {}, []
    for c in competidores:
        k = norm(nombre(c))
        if not k or jugo(c) is False: continue
        todos.append((k, al_par(c)))
        p = ((c.get("status") or {}).get("position") or {}).get("displayName")
        if p and re.fullmatch(r"T?\d+", str(p)): res[k] = str(p)
    if len({s for _, s in todos if s is not None}) <= 1 and not res:
        return {}                      # nadie ha jugado aún: todos con el mismo score, no hay posiciones reales
    for k, s in todos:
        if k in res or s is None: continue
        menores = sum(1 for _, x in todos if x is not None and x < s)
        iguales = sum(1 for _, x in todos if x == s)
        res[k] = ("T" if iguales > 1 else "") + str(menores + 1)
    return res

# ---- Corte (top 65 y empates tras 36 hoyos) y retiros: igual que api/leaderboard.js ----
CORTE_TOP = 65
def _hoyos(r): return len(r.get("linescores") or []) if isinstance(r, dict) and isinstance(r.get("linescores"), list) else 0
def _num(v):
    try: return float(v or 0)
    except (TypeError, ValueError): return 0.0
def _ronda(c, n): return next((r for r in (c.get("linescores") or []) if isinstance(r, dict) and _num(r.get("period")) == n), None)
def _completa(r): return bool(r) and (_hoyos(r) >= 18 or (not isinstance(r.get("linescores"), list) and _num(r.get("value")) > 0))
def _apar(v):
    v = str(v if v is not None else "").strip()
    if v.upper() in ("E", "EVEN"): return 0
    try: return int(v.replace("+", ""))
    except ValueError: return None
def _de36(c):
    a, b = _ronda(c, 1), _ronda(c, 2)
    if not (_completa(a) and _completa(b)): return None
    x, y = _apar(a.get("displayValue")), _apar(b.get("displayValue"))
    return None if x is None or y is None else x + y
def _siguio(c): return any(isinstance(r, dict) and _num(r.get("period")) >= 3 and (_hoyos(r) or _num(r.get("value")) > 0) for r in (c.get("linescores") or []))
def marcas(comp):
    m, con_r1 = {}, [c for c in comp if _completa(_ronda(c, 1))]
    con_r2 = [c for c in comp if _completa(_ronda(c, 2))]
    alguien_r3 = any(_siguio(c) for c in comp)
    a_medias = any((lambda r: r and 0 < _hoyos(r) < 18)(_ronda(c, 2)) for c in comp)
    if not (alguien_r3 or (con_r1 and len(con_r2) >= len(con_r1) * 0.9 and not a_medias)): return m
    linea = None
    v36 = sorted(v for v in (_de36(c) for c in con_r2) if v is not None)
    if len(con_r1) >= 100 and len(v36) > CORTE_TOP: linea = v36[CORTE_TOP - 1]
    elif alguien_r3:
        for c in comp:
            if _siguio(c):
                v = _de36(c)
                if v is not None: linea = v if linea is None else max(linea, v)
    for c in comp:
        k = norm(nombre(c))
        if not k: continue
        v = _de36(c)
        if _completa(_ronda(c, 1)) and not _ronda(c, 2) and not _siguio(c): m[k] = "WD"
        elif linea is not None and v is not None and v > linea and not _siguio(c): m[k] = "CUT"
    return m

def fecha_ev(v):
    try: return dt.date.fromisoformat(str(v)[:10])
    except ValueError: return None

def elegir_evento(eventos, t, ini, fin):
    """Acepta un evento si su nombre coincide con el torneo, o si es el único y sus fechas calzan con las del torneo."""
    nt = norm(t["n"])
    for e in eventos:
        for campo in (e.get("name"), e.get("shortName")):
            n = norm(campo)
            if n and (nt in n or n in nt): return e
    if len(eventos) == 1:
        a, b = fecha_ev(eventos[0].get("date")), fecha_ev(eventos[0].get("endDate")) or fecha_ev(eventos[0].get("date"))
        if a and b and a <= fin + dt.timedelta(days=1) and b >= ini - dt.timedelta(days=1): return eventos[0]
    return None

def buscar(t, ini, fin):
    """Prueba la fuente sin fechas (torneo en curso), con la fecha de inicio y con el rango del torneo."""
    intentos = [None, {"dates": ini.strftime("%Y%m%d")}, {"dates": ini.strftime("%Y%m%d") + "-" + fin.strftime("%Y%m%d")}]
    vistos = []
    for p in intentos:
        try:
            data = traer(p)
        except Exception as e:
            print(f"[{t['n']}] no se pudo leer la fuente ({p or 'sin fechas'}): {e}"); continue
        evs = data.get("events") or []
        vistos += [e.get("name") for e in evs]
        ev = elegir_evento(evs, t, ini, fin)
        c0 = (ev.get("competitions") or [{}])[0] if ev else {}
        comp = c0.get("competitors") if ev else None
        estado = (((ev or {}).get("status") or {}).get("type") or {}).get("state") or ((c0.get("status") or {}).get("type") or {}).get("state")
        if ev and comp: return comp, estado
    print(f"[{t['n']}] no encontré el torneo en la fuente. Eventos devueltos: {sorted(set(map(str, vistos)))}")
    return None, None

def main():
    datos = json.load(open(RAIZ / "data" / "datos.json", encoding="utf-8"))
    hoy = dt.datetime.now(dt.timezone.utc).date()
    actual = json.load(open(PF, encoding="utf-8")) if PF.exists() else {"actualizado": "", "torneos": {}}
    cambio, activos = False, 0
    for t in datos["torneos"]:
        if not (t["ini"] and t["fin"]): continue
        ini, fin = dt.date.fromisoformat(t["ini"]), dt.date.fromisoformat(t["fin"])
        en_curso = ini - dt.timedelta(days=1) <= hoy <= fin + dt.timedelta(days=1)
        if not (os.environ.get("FORZAR") or en_curso or t["id"] == datos.get("actual")): continue
        activos += 1
        comp, estado = buscar(t, ini, fin)
        if not comp: continue
        todas = posiciones(comp)
        sin_empezar = estado == "pre" or not todas or (len(todas) >= 8 and len(set(todas.values())) == 1)
        if sin_empezar:
            print(f"[{t['n']}] el torneo aún no comienza (sin posiciones reales todavía)")
            if t["id"] in actual["torneos"]:
                del actual["torneos"][t["id"]]; cambio = True
                print(f"[{t['n']}] se borraron posiciones anteriores que no eran válidas")
            continue
        for jugadores in t["sel"].values():
            for j in jugadores:
                if norm(j) not in todas: print(f"[{t['n']}] no encontrado en el leaderboard: {j}")
        todas.update(marcas(comp))   # CUT / WD (0 puntos)
        mios = dict(todas)   # se guarda todo el campo: así también sirven las elecciones hechas en el draft de la web
        if actual["torneos"].get(t["id"]) != mios:
            actual["torneos"][t["id"]] = mios; cambio = True
        print(f"[{t['n']}] {len(mios)} jugadores con posición")
    if not activos: print("No hay torneo en curso ni marcado como Actual con fechas de Inicio y Fin.")
    if cambio:
        actual["actualizado"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z"
        PF.write_text(json.dumps(actual, ensure_ascii=False, indent=1), encoding="utf-8")
        (RAIZ / "data" / "posiciones.js").write_text("window.__P=" + json.dumps(actual, ensure_ascii=False) + ";", encoding="utf-8")
        print("posiciones.json actualizado")
    else:
        print("sin cambios")

if __name__ == "__main__":
    main()
