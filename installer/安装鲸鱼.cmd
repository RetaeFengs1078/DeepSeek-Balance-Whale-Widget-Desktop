@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo 安装失败，请查看上方错误信息。
  pause
  exit /b 1
)
echo 安装完成，按任意键关闭此窗口。
pause >nul
