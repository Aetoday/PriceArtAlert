@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
title PriceArtAlert
echo PriceArtAlert запускается. Окно браузера откроется само.
echo Это окно не закрывай, пока нужны оповещения.
echo.
node scripts\start-local.mjs
pause
