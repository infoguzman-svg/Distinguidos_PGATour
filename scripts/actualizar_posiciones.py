"""Lee el leaderboard (fuente: API no oficial de ESPN) y guarda las posiciones de los jugadores elegidos
en data/posiciones.json. Solo trabaja con torneos que estén en curso (o todos con FORZAR=1).
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

def traer(fecha):
    if os.environ.get("ESPN_MOCK"):
        return json.load(open(os.environ["ESPN_MOCK"], encoding="utf-8"))
    import requests
    r = requests.get(URL, params={"dates": fecha.replace("-", "")}, timeout=30,
                     headers={"User-Agent": "Mozilla/5.0 (distinguidos-pga)"})
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

def posiciones(competidores):
    """nombre normalizado -> 'T3' / '1'. Usa la posición que informa la fuente; si falta, la calcula por score."""
    res, todos = {}, []
    for c in competidores:
        k = norm(nombre(c))
        if not k: continue
        todos.append((k, al_par(c)))
        p = ((c.get("status") or {}).get("position") or {}).get("displayName")
        if p and re.fullmatch(r"T?\d+", str(p)): res[k] = str(p)
    for k, s in todos:
        if k in res or s is None: continue
        menores = sum(1 for _, x in todos if x is not None and x < s)
        iguales = sum(1 for _, x in todos if x == s)
        res[k] = ("T" if iguales > 1 else "") + str(menores + 1)
    return res

def elegir_evento(eventos, t):
    nt = norm(t["n"])
    for e in eventos:
        for campo in (e.get("name"), e.get("shortName")):
            n = norm(campo)
            if n and (nt in n or n in nt): return e
    return eventos[0] if len(eventos) == 1 else None

def main():
    datos = json.load(open(RAIZ / "data" / "datos.json", encoding="utf-8"))
    hoy = dt.datetime.now(dt.timezone.utc).date()
    actual = json.load(open(PF, encoding="utf-8")) if PF.exists() else {"actualizado": "", "torneos": {}}
    cambio = False
    for t in datos["torneos"]:
        if not (t["ini"] and t["fin"]): continue
        ini, fin = dt.date.fromisoformat(t["ini"]), dt.date.fromisoformat(t["fin"])
        if not os.environ.get("FORZAR") and t["id"] != datos.get("actual") and not (ini - dt.timedelta(days=1) <= hoy <= fin + dt.timedelta(days=1)):
            continue
        try:
            data = traer(t["ini"])
        except Exception as e:
            print(f"[{t['n']}] no se pudo leer la fuente: {e}"); continue
        evs = data.get("events") or []
        ev = elegir_evento(evs, t)
        if not ev:
            print(f"[{t['n']}] no encontré el evento. Eventos devueltos: {[e.get('name') for e in evs]}"); continue
        comp = ((ev.get("competitions") or [{}])[0]).get("competitors") or []
        if not comp:
            print(f"[{t['n']}] sin competidores. Claves del evento: {list(ev.keys())}"); continue
        todas = posiciones(comp)
        mios = {}
        for jugadores in t["sel"].values():
            for j in jugadores:
                if norm(j) in todas: mios[norm(j)] = todas[norm(j)]
                else: print(f"[{t['n']}] no encontrado en el leaderboard: {j}")
        if actual["torneos"].get(t["id"]) != mios:
            actual["torneos"][t["id"]] = mios; cambio = True
        print(f"[{t['n']}] {len(mios)} jugadores con posición")
    if cambio:
        actual["actualizado"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z"
        PF.write_text(json.dumps(actual, ensure_ascii=False, indent=1), encoding="utf-8")
        print("posiciones.json actualizado")
    else:
        print("sin cambios")

if __name__ == "__main__":
    main()
