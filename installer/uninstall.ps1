$ErrorActionPreference = 'Stop'
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\CodexWhaleWidget'))
$actualRoot = [IO.Path]::GetFullPath($PSScriptRoot)
if (-not [string]::Equals($actualRoot, $expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw '卸载脚本不在预期的安装目录，已停止。'
}

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexWhaleWidget'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex 额度小鲸鱼.lnk'
Remove-ItemProperty -Path $runKey -Name CodexWhaleWidget -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $runKey -Name CodexWhaleWidgetOnAppOpen -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue
Remove-Item -Path $uninstallKey -Recurse -Force -ErrorAction SilentlyContinue

$installedExe = Join-Path $expectedRoot 'WhaleWidget.exe'
$watcherScript = Join-Path $expectedRoot 'watch.ps1'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($watcherScript) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='WhaleWidget.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $installedExe, [StringComparison]::OrdinalIgnoreCase) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# 仅删安装文件，保留 config.json、data、sounds 中的个人设置。
$prefix = $expectedRoot.TrimEnd('\') + '\'
foreach ($item in Get-ChildItem -LiteralPath $expectedRoot -Force) {
  if ($item.Name -in @('config.json', 'data', 'sounds')) { continue }
  $target = [IO.Path]::GetFullPath($item.FullName)
  if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "卸载路径超出安装目录：$target"
  }
  Remove-Item -LiteralPath $target -Recurse -Force
}
Write-Output '应用已卸载。个人配置仍留在安装目录，可自行决定是否删除。'
