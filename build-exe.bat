@echo off
setlocal
cd /d "%~dp0"

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

echo [whale] 1/2 installing deps...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [whale] npm install failed.
  pause
  exit /b 1
)

echo [whale] 2/2 packaging exe, this takes a few minutes...
call npm run dist
if errorlevel 1 (
  echo [whale] packaging failed.
  pause
  exit /b 1
)

echo.
echo [whale] done:
echo   dist\WhaleWidget-win32-x64\WhaleWidget.exe
echo.
echo Codex mode reads local sessions automatically. DeepSeek Key is optional.
pause
endlocal
