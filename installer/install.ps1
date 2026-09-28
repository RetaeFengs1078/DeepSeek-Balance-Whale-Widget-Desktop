param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'WhaleWidget-win32-x64'),
  [string]$MigrateFrom = ''
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path -LiteralPath $PackageDir).Path
$sourceExe = Join-Path $package 'WhaleWidget.exe'
if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) { throw '安装包缺少 WhaleWidget.exe' }
if (-not (Test-Path -LiteralPath (Join-Path $package 'whale.ico') -PathType Leaf)) { throw '安装包缺少小鲸鱼图标' }

$installRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\CodexWhaleWidget'))
$installedExe = Join-Path $installRoot 'WhaleWidget.exe'
$installedIcon = Join-Path $installRoot 'whale.ico'
$startupName = 'CodexWhaleWidget'
$watcherName = 'CodexWhaleWidgetOnAppOpen'
$watcherScript = Join-Path $installRoot 'watch.ps1'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexWhaleWidget'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex 额度小鲸鱼.lnk'

# 更新时先退出旧鲸鱼，避免 Electron 文件仍被占用或单实例锁指向便携版。
Get-CimInstance Win32_Process -Filter "Name='WhaleWidget.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($watcherScript) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
# 程序目录里可能有便携运行时留下的配置和统计；更新时绝不能覆盖用户数据。
Get-ChildItem -LiteralPath $package -Force |
  Where-Object { $_.Name -notin @('data', 'sounds', 'config.json', 'config.local.json', 'chrome-profile') } |
  Copy-Item -Destination $installRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall.ps1') -Destination (Join-Path $installRoot 'uninstall.ps1') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'watch.ps1') -Destination $watcherScript -Force

# 本地私有安装包可附带 skins/portrait.png；只在首次安装时播种，不覆盖用户自己的皮肤。
$bundledSkins = Join-Path $PSScriptRoot 'skins'
if (Test-Path -LiteralPath $bundledSkins -PathType Container) {
  $userSkins = Join-Path $installRoot 'data\skins'
  New-Item -ItemType Directory -Force -Path $userSkins | Out-Null
  Get-ChildItem -LiteralPath $bundledSkins -Filter '*.png' -File | ForEach-Object {
    $targetSkin = Join-Path $userSkins $_.Name
    if (-not (Test-Path -LiteralPath $targetSkin -PathType Leaf)) {
      Copy-Item -LiteralPath $_.FullName -Destination $targetSkin -Force
    }
  }
}

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

# 旧版留下的远端主机列表不再使用；只删这一项，保留其余个人配置。
$runtimeConfig = Join-Path $installRoot 'config.json'
if (Test-Path -LiteralPath $runtimeConfig -PathType Leaf) {
  try {
    $configObject = Get-Content -LiteralPath $runtimeConfig -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($configObject -and $configObject.PSObject.Properties['CODEX_REMOTE_SSH_HOSTS']) {
      $configObject.PSObject.Properties.Remove('CODEX_REMOTE_SSH_HOSTS')
      $updatedConfig = $configObject | ConvertTo-Json -Depth 100
      [IO.File]::WriteAllText($runtimeConfig, $updatedConfig + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    }
  } catch { Write-Warning '旧远端主机配置无法清理；新版程序仍会忽略它。' }
}

$link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$link.TargetPath = $installedExe
$link.WorkingDirectory = $installRoot
$link.IconLocation = $installedIcon
$link.Description = 'Codex 额度小鲸鱼'
$link.Save()

New-Item -Path $uninstallKey -Force | Out-Null
$uninstallScript = Join-Path $installRoot 'uninstall.ps1'
$psExe = (Get-Command powershell.exe).Source
$fields = @{
  DisplayName = 'Codex 额度小鲸鱼'
  DisplayVersion = '0.7.5-local.16'
  InstallLocation = $installRoot
  DisplayIcon = $installedIcon
  UninstallString = ('"' + $psExe + '" -NoProfile -ExecutionPolicy Bypass -File "' + $uninstallScript + '"')
}
foreach ($key in $fields.Keys) {
  New-ItemProperty -Path $uninstallKey -Name $key -Value $fields[$key] -PropertyType String -Force | Out-Null
}
New-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null

# 默认开机自启动鲸鱼；原 VS Code/ChatGPT 联动监听器保留在设置中，默认关闭。
Remove-ItemProperty -Path $runKey -Name $watcherName -ErrorAction SilentlyContinue
New-ItemProperty -Path $runKey -Name $startupName -Value ('"' + $installedExe + '"') -PropertyType String -Force | Out-Null

# 通过现有 Explorer 桌面进程启动，避免安装器由 Codex 等宿主调用时，
# 鲸鱼继承宿主的 Job Object 并在宿主退出时被一同终止。
Start-Process -FilePath explorer.exe -ArgumentList ('"' + $installedExe + '"') -WindowStyle Hidden
Write-Output "已安装：$installedExe"
Write-Output '已加入开始菜单和 Windows 已安装应用；登录 Windows 后小鲸鱼自动启动。'
