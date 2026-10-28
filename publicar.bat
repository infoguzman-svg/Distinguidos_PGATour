@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Publicando tus cambios...
git add -A
git commit -m "Actualizar selecciones"
git pull --rebase
git push
echo.
echo Listo. En 1 o 2 minutos la pagina muestra los cambios.
pause
