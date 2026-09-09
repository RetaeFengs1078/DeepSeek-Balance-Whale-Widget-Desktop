@echo off
setlocal
cd /d "%~dp0"

rem ---- 已经打包过就直接跑 exe ----
set "EXE=%~dp0dist\WhaleWidget-win32-x64\WhaleWidget.exe"
if exist "%EXE%" (
  start "" "%EXE%"
  exit /b 0
)

rem ---- 否则从源码跑（首次会装 Electron）----
if not exist "node_modules\electron" (
  echo [whale] first run: installing electron, please wait...
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  call npm install --no-audit --no-fund
)

echo [whale] starting desktop widget...
call npm start
endlocal
