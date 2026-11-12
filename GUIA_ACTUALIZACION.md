# Guía de actualización – Distinguidos PGA Tour

## 1. Qué herramientas son y qué hace cada una
| Pieza | Para qué sirve | Quién la maneja |
|---|---|---|
| **Excel** (`Selecciones_2026.xlsx`) | Es el único lugar donde cargas torneos y jugadores elegidos. | Tú |
| **GitHub** (tu repositorio) | Guarda los archivos y los publica como página web gratuita (GitHub Pages). | Tú, desde el escritorio |
| **GitHub Actions** (tarea programada) | Cada 10 minutos lee el leaderboard, calcula y vuelve a publicar la página. | Se ejecuta sola |
| **La página** (`index.html`) | Muestra clasificación, torneo actual y calendario a tus amigos. | Nadie: se actualiza sola |

Tus amigos solo ven la página. Solo tú puedes cambiar la planilla.

## 2. Rutina para cada torneo nuevo (5 minutos)
Ejemplo ilustrativo: el *Butterfield Bermuda Championship*, clase Top 2, del 22 al 25 de octubre. Los jugadores del ejemplo son inventados; usa los de tus amigos.

1. **Abre la planilla.** Ve a `Escritorio\Distinguidos_PGATour` y abre `Selecciones_2026.xlsx`.
2. **Hoja `Torneos`: agrega una fila AL FINAL.** El orden de la hoja es el orden del calendario (se usa para los desempates).

   | Torneo | Clase | Inicio | Fin | Actual (Sí) | Mes |
   |---|---|---|---|---|---|
   | Butterfield Bermuda Championship | Top 2 | 2026-10-22 | 2026-10-25 | Sí | Oct |

   - La **clase** se elige de la lista (Major, Elite, Top 1, Top 2).
   - **Inicio y Fin** son obligatorios para que el sistema traiga las posiciones solo.
   - En **Actual** escribe `Sí` solo en este torneo y borra el `Sí` del torneo anterior.
   - Escribe el **nombre** como aparece en pgatour.com. El sistema lo usa para encontrar el torneo.
3. **Hoja `Selecciones`: agrega 5 filas** (una por participante) con los 4 jugadores.

   | Torneo | Participante | Jugador 1 | Jugador 2 | Jugador 3 | Jugador 4 |
   |---|---|---|---|---|---|
   | Butterfield Bermuda Championship | Cristóbal | Ludvig Åberg | Chris Kirk | Seamus Power | Corey Conners |

   Torneo y participante se eligen de las listas. Los jugadores se escriben igual que en pgatour.com (las tildes no importan; las letras sí).
4. **Guarda y cierra Excel.** Un archivo abierto puede dar problemas al subirlo.
5. **Publica:** doble clic en `publicar.bat`. Al final debe decir "Listo". Si pide iniciar sesión en GitHub, hazlo una vez.
6. **Revisa en 2 o 3 minutos.** Abre tu página y entra a **Torneo actual**. Debes ver el torneo con las alineaciones. Si no cambia, pulsa Ctrl+F5.
7. **Durante el torneo no haces nada.** Cada 10 minutos las posiciones se actualizan, y la clasificación y el gráfico se recalculan solos.

## 3. Cómo comprobar que la lectura automática funciona
1. En github.com abre tu repositorio y entra a la pestaña **Actions**.
2. Abre la última ejecución de *Actualizar y publicar* y el paso *Run python scripts/actualizar_posiciones.py*.
3. Lee los mensajes:
   - `[Torneo] 20 jugadores con posición`: todo bien.
   - `no encontrado en el leaderboard: NOMBRE`: ese jugador está mal escrito o no juega. Corrígelo en la planilla y publica de nuevo.
   - `no encontré el evento`: el nombre del torneo no coincide con el de la fuente. Ajusta el nombre en la planilla o usa el plan B.
   - `no se pudo leer la fuente`: la fuente falló o cambió. Usa el plan B.

## 3b. Qué esperar durante los 4 días del torneo
- Al subir tu Excel con el torneo marcado como **Actual** (con Inicio y Fin), la tarea corre de inmediato y luego cada 10 minutos. Puede retrasarse unos minutos: GitHub no garantiza la hora exacta.
- Cada vez que cambian las posiciones, se vuelve a publicar la página. La página abierta se refresca sola cada 5 minutos. En total, cuenta con un retraso de unos 10 a 20 minutos respecto al leaderboard.
- No tienes que hacer nada más. Si quieres forzar una actualización: *Actions → Actualizar y publicar → Run workflow*.
- Primer día: abre el registro (sección 3) y confirma que diga "20 jugadores con posición". Si hay jugadores "no encontrado", corrige la ortografía en el Excel según el leaderboard.
- Cuando termine el torneo y el resultado final esté cargado, no hace falta hacer nada. Al pasar al torneo siguiente, mueves el "Sí" de *Actual*.

## 3c. Pestaña Pagos (Pagos_2026.xlsx)
La pestaña **Pagos** calcula sola cuánto recibe y cuánto debe pagar cada participante, mes a mes. Se alimenta de `Selecciones_2026.xlsx` (posiciones) y del archivo `Pagos_2026.xlsx` (reglas y corte), que va en la carpeta principal del repositorio.
- **Premios automáticos:** en cada torneo con resultados, el **Ganador** (1° de la polla) y el **Campeón** (dueño del jugador que ganó el torneo real) reciben el premio de la clase (hoja `Premios`). Si son la misma persona, recibe ambos. Cada premio lo pagan en partes iguales los demás participantes.
- **Corte (manual):** después de cada torneo con corte, anota en la hoja `Corte` de `Pagos_2026.xlsx` una fila por participante con su **Rol** (nombre del torneo igual al de `Selecciones_2026.xlsx`): **Gana** (pasó el corte con sus 4 jugadores y recibe el bono), **Paga** (no lo logró) o **Beneficencia** (no pasó ninguno de sus 4 jugadores; anótalo también como Paga). Cada uno de los que pagan aporta una cuota fija de $2.000, y las cuotas se reparten en partes iguales entre los que ganan (con 6 participantes el reparto es siempre exacto; el redondeo a $100 solo se usa en los torneos de 2026 con 5 participantes). Quien queda en Beneficencia paga además $2.000 extra, que se acumula aparte como pago especial y no entra en el neto entre participantes. **Si nadie gana el bono, no se paga nada.** Si el torneo no tiene corte, no anotes nada.
- **Torneos sin jugadores cargados:** si solo tienes los puestos, anota al campeón en `Campeones manuales`.
- **Primer módulo (mes):** al abrir la pestaña aparece el mes del torneo marcado como *Actual*, con una tabla como tu Excel: cada torneo en una columna (clase, ganador y campeón), lo que gana cada participante y, a la derecha, el acumulado del mes (premios ganados, premios que paga, corte y neto). Los otros meses se eligen con la botonera de arriba.
- **Mes cerrado:** son los meses anteriores al mes del torneo marcado como *Actual*. El mes en curso se muestra como provisorio (⏳) porque las posiciones pueden cambiar.
- **Seis o más participantes:** la regla es la misma; cada premio lo pagan en partes iguales todos los demás.
- **Liquidación:** en cada mes, la página muestra el neto de cada uno y la lista de quién le paga a quién con el menor número de transferencias.
- Para cambiar los montos de los premios o la cuota del corte, edita las hojas `Premios` de `Pagos_2026.xlsx` y sube el archivo como siempre.

## 3d. Actualización en vivo (Vercel)
Además de la tarea de GitHub (cada 10 minutos aprox.), la página consulta cada 60 segundos la función `api/leaderboard.js` de Vercel, que lee el leaderboard de ESPN. Mientras el torneo marcado como *Actual* esté en su ventana de fechas (de un día antes del Inicio a un día después del Fin) y alguien tenga la página abierta, el encabezado dice "🔴 En vivo" y las posiciones se actualizan solas, sin esperar a GitHub.
- Si la función no responde, la página sigue funcionando con las posiciones de `data/posiciones.json`, como antes.
- Para probar la función, abre `https://distinguidostour.vercel.app/api/leaderboard?n=NOMBRE%20DEL%20TORNEO&ini=AAAA-MM-DD&fin=AAAA-MM-DD`. Debe responder `"ok":true`.
- Si el torneo está suspendido o terminó la ronda, las posiciones no cambian: es normal que el encabezado no se mueva.

## 3e. Pestaña Costituzione
Es la última pestaña de la web y muestra el reglamento de la temporada 2027, con el encabezado "Temporada 2027". El texto está dentro de `index.html` y se ve igual que el Word `Costituzione_Reglamento_Distinguidos_2027.docx`. Para cambiarlo, edita el Word y pídeme que actualice la pestaña (o edita el texto directamente en `index.html`, dentro de la sección `id="v-c"`).
- Los participantes cuentan desde su primer torneo con selecciones: los meses anteriores a que alguien se sumara no lo incluyen en los pagos.

## 3f. Draft en la web (pestaña 🐍 Draft)
Cada participante elige sus jugadores desde la página con su **link personal**, en serpiente (1→6, 6→1). Las elecciones se usan directamente en la página: no hace falta llenar la hoja *Selecciones* del Excel para ese torneo.

**Una sola vez (en Vercel):**
1. *Storage* → conecta **Upstash Redis** (plan gratuito) al proyecto `distinguidos_tour`. Vercel agrega solo las variables de conexión.
2. *Settings → Environment Variables* → crea `DRAFT_ADMIN_KEY` con una clave que solo tú conozcas.
3. Sube `api/draft.js` al repositorio (carpeta `api`, junto a `leaderboard.js`) y vuelve a publicar.

**Cada torneo:**
1. Agrega el torneo en la hoja *Torneos* del Excel (nombre, clase, Inicio, Fin, Actual) y súbelo. No llenes *Selecciones*.
2. Abre la página con `?admin=TU_CLAVE` al final de la dirección (solo la primera vez en cada equipo; queda guardada). Entra a **🐍 Draft**.
3. Revisa el orden propuesto (el campeón del torneo anterior primero), la fecha límite (día anterior a las 20:00) y los minutos por turno, y pulsa **Crear draft**.
4. Pega la lista de jugadores con sus cuotas, uno por línea (por ejemplo `Ryan Gerard +1500`; puedes pedírsela a Claude cada semana). Luego pulsa **🌐 Completar con el campo de ESPN** para sumar al recuadro al resto de los inscritos, sin cuota, y después **Cargar lista pegada**. Se ordena sola de mejor a peor cotizado; los que no tienen cuota quedan al final.
5. Pulsa **Iniciar draft**. Los links personales son **permanentes**: se envían una sola vez en la temporada (botón WhatsApp del panel) y sirven en todos los drafts. Si alguno se filtra o hay un problema, **🔄 Cambiar link** le genera uno nuevo y el anterior deja de funcionar al instante.
6. Cada participante abre su link: cuando le toca, ve “¡Te toca!” y el botón **Elegir**. Todos ven el tablero actualizado cada pocos segundos.
7. Pasada la fecha límite, cada turno tiene 10 minutos; si alguien no elige, pasa al siguiente y después puede elegir lo que le falta (“acá estoy”). Al final puedes usar **Sorteo final** para completar al azar a quien no eligió.
8. Botones del administrador: Pausar, Saltar turno, Deshacer, Resetear (por ejemplo si se retira una primera elección, Art. 11) y Borrar.

**Avisos por WhatsApp (CallMeBot):**
- Cada participante los activa una vez desde su link, en la pestaña 🐍 Draft: agrega el número de CallMeBot, le envía “I allow callmebot to send me messages”, recibe su APIKEY y la escribe en la página con su celular. Le llega un mensaje de prueba.
- Al empezar su turno le llega “🐍 te toca elegir” con su link, y un recordatorio cada 30 minutos mientras no elija (configurable en tu panel), salvo en el horario de silencio (por defecto de 23 a 8, hora de Chile).
- Los recordatorios los dispara el archivo `.github/workflows/avisos.yml` cada 10 minutos (GitHub puede atrasarse unos minutos).
- Siempre tienes en tu panel el aviso **manual** por WhatsApp (lo envías tú) y el botón **🔔 Enviar aviso automático** para forzarlo en cualquier momento.

Los nombres de la lista deben coincidir con los del leaderboard para que lleguen las posiciones (las tildes no importan).

## 4. Plan B: escribir posiciones a mano
Abre `data\manual.json` con el Bloc de notas y escribe (el `id` del torneo es el nombre en minúsculas, sin tildes y con guiones; míralo en `data\datos.json`):
```json
{"torneos": {"butterfield-bermuda-championship": {"Ludvig Åberg": "T4", "Chris Kirk": "12"}}}
```
Guarda y publica. Lo escrito aquí tiene prioridad sobre lo automático y aparece marcado con ✎.

## 5. Otros casos
- **Un torneo sin jugadores, solo puestos finales:** hoja `Puestos manuales` (torneo, participante, puesto 1 a 5). Así se cargaron RBC Canadian y Travelers en 2026.
- **Cambiar el torneo que se ve al abrir la página:** mueve el `Sí` de la columna *Actual*.
- **Cambiar los puntos de las clases o de las posiciones:** hojas `Clases` y `Puntos`.
- **Cambiar el icono de un participante:** hoja `Participantes`, columna `Icono` (un emoji de animal). Hoy: Cristóbal 🐐, Sebastián 🦖, Pedro 🦈, Cafeta 🦌 y José Miguel 🦕. Si queda vacío, la página usa las 2 primeras letras del nombre.
- **Empates en un torneo:** queda primero quien tenga el jugador mejor ubicado en ese torneo; si sigue igual, decide el lugar en el torneo anterior (por eso los torneos van en orden de calendario).

## 6. Problemas frecuentes
| Síntoma | Qué hacer |
|---|---|
| `git no se reconoce` | Instala Git para Windows (git-scm.com) y vuelve a intentar. |
| `publicar.bat` dice que el push fue rechazado | Abre GitHub Desktop, pulsa *Fetch origin* y luego *Pull*; después ejecuta `publicar.bat` otra vez. |
| La página no muestra el cambio | Espera 2 o 3 minutos y pulsa Ctrl+F5. Revisa que la ejecución en *Actions* tenga el check verde. |
| Aparece "No se pudo cargar data/datos.json" | Abriste `index.html` con doble clic. Usa el link de tu página publicada. |
| Los puntos de un torneo no cuadran | Revisa que cada participante tenga 4 jugadores y que el nombre del jugador coincida con el leaderboard. |

## 7. Temporada 2027
Crea un repositorio nuevo para 2027 (así 2026 queda guardado como historial), copia la carpeta del proyecto, borra `Selecciones_2026.xlsx` y deja `plantillas\Plantilla_vacia.xlsx` renombrada como `Selecciones_2027.xlsx` en la raíz. También vacía `data\posiciones.json` (`{"actualizado":"","torneos":{}}`).

## 8. Limitaciones que debes conocer
- La fuente de posiciones es una API **no oficial** de ESPN. Puede cambiar o bloquearse sin aviso, y revisa sus términos de uso. Se probó con datos simulados, no contra la fuente real.
- Las tareas programadas de GitHub pueden retrasarse unos minutos y se desactivan tras 60 días sin actividad (se reactivan desde *Actions*).
- Un repositorio público permite que cualquiera con su enlace vea o descargue la planilla.
