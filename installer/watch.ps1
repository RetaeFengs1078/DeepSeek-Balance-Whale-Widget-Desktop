$ErrorActionPreference = 'Continue'
$installedExe = Join-Path $PSScriptRoot 'WhaleWidget.exe'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$watcherName = 'CodexWhaleWidgetOnAppOpen'
$mutex = New-Object System.Threading.Mutex($false, 'Local\CodexWhaleWidgetOnAppOpen')
$ownsMutex = $false

try {
  try { $ownsMutex = $mutex.WaitOne(0) }
  catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (-not $ownsMutex) { return }

  $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  $previousIds = @{}
  while (Test-Path -LiteralPath $installedExe -PathType Leaf) {
    # 用户关闭联动开关或卸载后，监听器自行退出；不关闭已经打开的鲸鱼。
    $registration = Get-ItemProperty -Path $runKey -Name $watcherName -ErrorAction SilentlyContinue
    if (-not $registration) { break }

    $currentIds = @{}
    foreach ($process in @(Get-Process -Name Code, ChatGPT -ErrorAction SilentlyContinue)) {
      if ($process.SessionId -eq $session) { $currentIds[$process.Id] = $true }
    }

    $newTarget = $false
    foreach ($id in $currentIds.Keys) {
      if (-not $previousIds.ContainsKey($id)) { $newTarget = $true; break }
    }
    if ($newTarget -and -not (Get-Process -Name WhaleWidget -ErrorAction SilentlyContinue)) {
      Start-Process -FilePath $installedExe -ErrorAction SilentlyContinue
    }
    $previousIds = $currentIds
    Start-Sleep -Seconds 2
  }
} finally {
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
