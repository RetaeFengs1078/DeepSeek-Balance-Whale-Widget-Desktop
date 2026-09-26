param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'WhaleWidget-win32-x64'),
  [string]$MigrateFrom = ''
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path -LiteralPath $PackageDir).Path
$sourceExe = Join-Path $package 'WhaleWidget.exe'
if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) { throw '安装包缺少 WhaleWidget.exe' }

$installRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\CodexWhaleWidget'))
$installedExe = Join-Path $installRoot 'WhaleWidget.exe'
$startupName = 'CodexWhaleWidget'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexWhaleWidget'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex 额度小鲸鱼.lnk'

# 更新时先退出旧鲸鱼，避免 Electron 文件仍被占用或单实例锁指向便携版。
Get-CimInstance Win32_Process -Filter "Name='WhaleWidget.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Get-ChildItem -LiteralPath $package -Force | Copy-Item -Destination $installRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall.ps1') -Destination (Join-Path $installRoot 'uninstall.ps1') -Force

# 如果用户曾从便携目录运行，可迁移个人配置；已有的安装配置始终优先。
if ($MigrateFrom -and (Test-Path -LiteralPath $MigrateFrom -PathType Container)) {
  foreach ($name in @('config.json', 'data', 'sounds')) {
    $source = Join-Path $MigrateFrom $name
    $target = Join-Path $installRoot $name
    if ((Test-Path -LiteralPath $source) -and -not (Test-Path -LiteralPath $target)) {
      Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
    }
  }
}

$link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$link.TargetPath = $installedExe
$link.WorkingDirectory = $installRoot
$link.IconLocation = "$installedExe,0"
$link.Description = 'Codex 额度小鲸鱼'
$link.Save()

New-Item -Path $uninstallKey -Force | Out-Null
$uninstallScript = Join-Path $installRoot 'uninstall.ps1'
$psExe = (Get-Command powershell.exe).Source
$fields = @{
  DisplayName = 'Codex 额度小鲸鱼'
  DisplayVersion = '0.2.2'
  InstallLocation = $installRoot
  DisplayIcon = $installedExe
  UninstallString = ('"' + $psExe + '" -NoProfile -ExecutionPolicy Bypass -File "' + $uninstallScript + '"')
}
foreach ($key in $fields.Keys) {
  New-ItemProperty -Path $uninstallKey -Name $key -Value $fields[$key] -PropertyType String -Force | Out-Null
}
New-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null

# 与 Electron 托盘开关使用同一个 Run 项，用户可随时从托盘取消。
New-ItemProperty -Path $runKey -Name $startupName -Value ('"' + $installedExe + '"') -PropertyType String -Force | Out-Null

Start-Process -FilePath $installedExe -WindowStyle Hidden
Write-Output "已安装：$installedExe"
Write-Output '已加入开始菜单、Windows 已安装应用及开机自启动。'
