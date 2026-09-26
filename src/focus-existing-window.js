// 只激活已存在的软件窗口；不启动进程、不打开 URL，也不创建新窗口。
const { spawn } = require('node:child_process')
const path = require('node:path')

const FOCUS_SCRIPT = String.raw`
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public sealed class WhaleWindowInfo {
  public IntPtr Handle;
  public uint ProcessId;
  public string Title;
}
public static class WhaleWindowFocus {
  public delegate bool EnumCallback(IntPtr handle, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumCallback callback, IntPtr param);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr handle);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr handle, bool altTab);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  public static WhaleWindowInfo[] ListWindows() {
    var found = new List<WhaleWindowInfo>();
    EnumWindows((handle, param) => {
      if (!IsWindowVisible(handle)) return true;
      int length = GetWindowTextLength(handle);
      if (length < 1) return true;
      var title = new StringBuilder(length + 1);
      GetWindowText(handle, title, title.Capacity);
      uint processId;
      GetWindowThreadProcessId(handle, out processId);
      found.Add(new WhaleWindowInfo { Handle = handle, ProcessId = processId, Title = title.ToString() });
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
}
'@
$names = switch ($Kind) {
  'ChatGPT' { @('ChatGPT', 'Codex') }
  'Code' { @('Code', 'Code - Insiders') }
  'Terminal' { @('WindowsTerminal', 'pwsh', 'powershell', 'cmd') }
  default { @() }
}
if (-not $names.Count) { exit 2 }
$processes = @(Get-Process -Name $names -ErrorAction SilentlyContinue)
$pids = @{}
foreach ($process in $processes) { $pids[[uint32]$process.Id] = $true }
$windows = @([WhaleWindowFocus]::ListWindows() | Where-Object { $pids.ContainsKey([uint32]$_.ProcessId) })
if (-not $windows.Count) { exit 3 }
$selected = $null
if ($Kind -eq 'Code' -and $HostName) {
  $selected = $windows | Where-Object { $_.Title -match [regex]::Escape($HostName) } | Select-Object -First 1
}
if (-not $selected) { $selected = $windows | Select-Object -First 1 }
$handle = [IntPtr]$selected.Handle
[void][WhaleWindowFocus]::ShowWindowAsync($handle, 9)
[void][WhaleWindowFocus]::SetForegroundWindow($handle)
if ([WhaleWindowFocus]::GetForegroundWindow() -ne $handle) {
  [WhaleWindowFocus]::SwitchToThisWindow($handle, $true)
}
if ([WhaleWindowFocus]::GetForegroundWindow() -ne $handle) {
  $shell = New-Object -ComObject WScript.Shell
  [void]$shell.AppActivate([int]$selected.ProcessId)
}
if ([WhaleWindowFocus]::GetForegroundWindow() -ne $handle) {
  [WhaleWindowFocus]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  [void][WhaleWindowFocus]::SetForegroundWindow($handle)
  [WhaleWindowFocus]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
}
Start-Sleep -Milliseconds 100
if ([WhaleWindowFocus]::GetForegroundWindow() -eq $handle) { exit 0 }
exit 4
`

function focusExistingWindow(kind, host = '') {
  if (process.platform !== 'win32' || !['ChatGPT', 'Code', 'Terminal'].includes(kind)) return Promise.resolve(false)
  if (host && !/^[a-zA-Z0-9_.-]+$/.test(host)) return Promise.resolve(false)
  const script = '$Kind = ' + JSON.stringify(kind) + '\n$HostName = ' + JSON.stringify(host) + '\n' + FOCUS_SCRIPT
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return new Promise((resolve) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let errors = ''
    child.stderr.on('data', chunk => { errors += chunk.toString().slice(0, 1000) })
    const timer = setTimeout(() => { child.kill(); resolve(false) }, 8000)
    child.on('error', () => { clearTimeout(timer); resolve(false) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (process.env.WHALE_DEBUG_FOCUS === '1') console.error('[whale] focus exit', code, errors)
      resolve(code === 0)
    })
  })
}

module.exports = { focusExistingWindow }
