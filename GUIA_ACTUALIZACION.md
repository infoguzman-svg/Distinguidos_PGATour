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
