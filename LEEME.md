# Distinguidos PGA Tour 2026 – proyecto

Página web con interfaz de torneo fantasy (clasificación, torneo actual y calendario) que se actualiza sola. Los datos salen de **un solo archivo que tú editas: `Selecciones_2026.xlsx`**.

**Para actualizar cada torneo lee `GUIA_ACTUALIZACION.md`.**

## Contenido
| Archivo | Para qué sirve |
|---|---|
| `Selecciones_2026.xlsx` | Torneos, jugadores elegidos y escalas de puntos (ya cargada la temporada 2026). |
| `index.html` | La página. No hace falta tocarla. |
| `publicar.bat` | Doble clic para subir tus cambios (Windows). |
| `scripts/` | Convierten la planilla y leen el leaderboard. |
| `.github/workflows/actualizar.yml` | Tarea programada: cada 10 minutos actualiza y publica. |
| `data/manual.json` | Posiciones corregidas a mano (plan B). |
| `plantillas/Plantilla_vacia.xlsx` | Planilla en blanco para una temporada nueva. |

## Puesta en marcha (una sola vez, Windows)
1. Repositorio **público** en github.com y GitHub Desktop instalado (también Git para Windows, que usa `publicar.bat`).
2. Clona el repositorio en tu Escritorio y copia dentro **todo el contenido** de esta carpeta (incluida `.github`). `index.html` debe quedar directamente en la carpeta del repositorio.
3. En GitHub Desktop: *Commit to main* y *Push origin*.
4. En github.com: *Settings → Pages → Source: GitHub Actions*.
5. Pestaña *Actions → Actualizar y publicar → Run workflow*. En 1 o 2 minutos tu página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

Solo tú puedes editar: no agregues colaboradores al repositorio.
