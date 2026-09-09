@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=C:\Users\Graffito\.workbuddy\binaries\node\versions\22.22.2-2\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

set "PORT=8788"
set "URL=http://127.0.0.1:%PORT%/"
set "PROBE=%URL%dsh-whale/balance.json"

echo [whale] starting server on %URL%

curl -s -o nul -m 2 "%PROBE%" >nul 2>&1
if not errorlevel 1 goto server_up

start "whale-server" /MIN "%NODE_EXE%" server.mjs

set TRIES=0
:wait_loop
timeout /t 1 /nobreak >nul
curl -s -o nul -m 2 "%PROBE%" >nul 2>&1
if not errorlevel 1 goto server_up
set /a TRIES+=1
if %TRIES% LSS 15 goto wait_loop
echo [whale] server did not come up in 15s.
pause
exit /b 1

:server_up
set "BROWSER="
for %%P in (
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) do (
  if not defined BROWSER if exist %%P set "BROWSER=%%~P"
)

if not defined BROWSER (
  echo [whale] Chrome/Edge not found, opening default browser.
  start "" "%URL%"
  exit /b 0
)

start "" "%BROWSER%" --app="%URL%" --window-size=480,540 --user-data-dir="%~dp0chrome-profile" --no-first-run --no-default-browser-check
echo [whale] done. Window title: Whale Balance
endlocal
