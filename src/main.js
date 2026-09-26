/*
 * DeepSeek-Balance-Whale-Widget-Desktop
 * Copyright (c) 2026 GoRmiTz
 *
 * SPDX-License-Identifier: MIT
 * 本文件为本项目自有代码，协议全文见仓库根目录 LICENSE。
 * 挂件本体（vendor/dsh-whale-widget/）为 MeteorNOX 的作品，同样为 MIT。
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, shell, nativeImage } = require('electron')

const APP_ROOT = path.join(__dirname, '..')

let win = null
let tray = null
let interactive = false
let serverRef = null
let pageUrl = ''

// 鲸鱼在窗口坐标系里的矩形；force 表示「拖拽中 / 菜单或气泡展开」时必须接管鼠标
let whaleRect = null
let forceInteractive = false
let winPos = [0, 0]

// 桌面端自己的设置（跟插件的尺寸配置分开存，互不覆盖）
//   alwaysOnTop —— 窗口置顶
//   soundSet    —— '' 表示用插件内置音效，否则是自定义音效包 id
const settings = { alwaysOnTop: true, soundSet: '', showQuotaPanel: false }
const LOGIN_ITEM_NAME = 'CodexWhaleWidget'
const APP_LAUNCH_NAME = 'CodexWhaleWidgetOnAppOpen'
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
let settingsPath = null
let soundsDirPath = ''
let trayRef = null

// Electron 在 Windows 上切换 setIgnoreMouseEvents 会丢掉 TOPMOST 样式，
// 所以每次切换后、以及定时/失焦时都要重新断言一次置顶。
function applyTop() {
  if (!win || win.isDestroyed()) return
  win.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver')
  if (settings.alwaysOnTop) win.moveTop()
}

function loadSettings() {
  if (!settingsPath) return
  const files = [settingsPath, path.join(path.dirname(settingsPath), '.whale-window.json')]
  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(f, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.alwaysOnTop === 'boolean') settings.alwaysOnTop = parsed.alwaysOnTop
        if (typeof parsed.soundSet === 'string') settings.soundSet = parsed.soundSet
        if (typeof parsed.showQuotaPanel === 'boolean') settings.showQuotaPanel = parsed.showQuotaPanel
        return
      }
    } catch (err) { /* 继续试下一个 */ }
  }
}

function saveSettings() {
  if (!settingsPath) return
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8') } catch (err) { /* 忽略 */ }
}

function autoStartEnabled() {
  if (process.platform !== 'win32' || !app.isPackaged) return false
  try { return app.getLoginItemSettings({ path: process.execPath }).openAtLogin }
  catch { return false }
}

function setAutoStart(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged) return false
  try { app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, name: LOGIN_ITEM_NAME }) }
  catch (err) { console.error('[whale] 开机自启动设置失败:', err) }
  return autoStartEnabled()
}

function watcherScriptPath() { return path.join(path.dirname(process.execPath), 'watch.ps1') }
function powershellPath() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}
function launchWithAppsEnabled() {
  if (process.platform !== 'win32' || !app.isPackaged || !fs.existsSync(watcherScriptPath())) return false
  const result = spawnSync('reg.exe', ['query', RUN_KEY, '/v', APP_LAUNCH_NAME], { windowsHide: true })
  return result.status === 0
}
function setLaunchWithApps(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged) return false
  const script = watcherScriptPath()
  if (enabled && !fs.existsSync(script)) return false
  const args = enabled
    ? ['add', RUN_KEY, '/v', APP_LAUNCH_NAME, '/t', 'REG_SZ', '/d', `"${powershellPath()}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${script}"`, '/f']
    : ['delete', RUN_KEY, '/v', APP_LAUNCH_NAME, '/f']
  const result = spawnSync('reg.exe', args, { windowsHide: true })
  if (result.status !== 0) console.error('[whale] 应用联动启动设置失败:', result.error || result.stderr?.toString())
  if (enabled && result.status === 0) {
    const child = spawn(powershellPath(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script], {
      detached: true, windowsHide: true, stdio: 'ignore',
    })
    child.unref()
  }
  return launchWithAppsEnabled()
}

function currentSettings() { return { ...settings, autoStart: autoStartEnabled(), launchWithApps: launchWithAppsEnabled() } }
function announceSettings() {
  if (win && !win.isDestroyed()) win.webContents.send('whale:settings-updated', currentSettings())
}

// 只允许一个实例，否则会起两个本地服务、两只鲸鱼
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus() } })
}

// 透明窗口依赖合成器。某些环境（沙箱、虚拟机、远程桌面、显卡驱动异常）里 GPU
// 进程会直接崩、Electron 随之致命退出。检测到就自动以安全模式重启一次。
// 安全模式只关沙箱，不关硬件加速 —— 透明度需要合成器，关了背景会变黑。
const SAFE_MODE = process.env.WHALE_SAFE === '1' || process.argv.includes('--safe-mode')
if (SAFE_MODE) {
  app.commandLine.appendSwitch('no-sandbox')
  console.log('[whale] 安全模式：已禁用 Chromium 沙箱')
}

let relaunched = false
app.on('child-process-gone', (_event, details) => {
  if (SAFE_MODE || relaunched) return
  if (!details || details.type !== 'GPU') return
  relaunched = true
  console.error('[whale] GPU 进程崩溃，改用安全模式重启一次…')
  process.env.WHALE_SAFE = '1'
  app.relaunch({ args: process.argv.slice(1).concat(['--safe-mode']) })
  app.exit(0)
})

// 覆盖所有显示器的可用区域（不含任务栏）：鲸鱼的可拖范围 = 整块屏幕
function screenBounds() {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const d of screen.getAllDisplays()) {
    const a = d.workArea
    x0 = Math.min(x0, a.x)
    y0 = Math.min(y0, a.y)
    x1 = Math.max(x1, a.x + a.width)
    y1 = Math.max(y1, a.y + a.height)
  }
  if (!isFinite(x0)) {
    const a = screen.getPrimaryDisplay().workArea
    return { x: a.x, y: a.y, width: a.width, height: a.height }
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

function createWindow() {
  const bounds = screenBounds()
  win = new BrowserWindow({
    ...bounds,
    transparent: true,      // 真透明：页面透明的地方能看到桌面
    frame: false,           // 无边框
    hasShadow: false,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    // 注意：不能设 paintWhenInitiallyHidden:false —— 那样窗口显示前不绘制，
    // 而 ready-to-show 又要等首帧绘制，两者会互相死锁导致窗口永远不出现。
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  })

  interactive = false
  // 不转发鼠标事件：透明区完全不吃事件，空闲时渲染进程零唤醒
  win.setIgnoreMouseEvents(true)
  applyTop()

  win.on('blur', () => { if (settings.alwaysOnTop && win && !win.isDestroyed()) win.moveTop() })

  // 排查时开 WHALE_LOG_RENDERER=1 可把页面 console 打到终端
  if (process.env.WHALE_LOG_RENDERER === '1') {
    win.webContents.on('console-message', (event) => {
      console.log('[renderer:' + event.level + '] ' + event.message)
    })
  }

  win.loadURL(pageUrl)
  win.once('ready-to-show', () => {
    const b = win.getBounds()
    console.log('[whale] 窗口: ' + b.width + 'x' + b.height + ' @ ' + b.x + ',' + b.y + '（鲸鱼可拖范围 = 整块屏幕）')
    win.show()
  })
  win.on('closed', () => { win = null })

  // 兜底：万一 ready-to-show 没触发，3 秒后也要把窗口亮出来
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show()
  }, 3000)

  // 缓存窗口位置：光标轮询每秒跑十几次，不该每次都去问窗口
  winPos = [bounds.x, bounds.y]
  win.on('move', () => { if (win && !win.isDestroyed()) winPos = win.getPosition() })

  const refit = () => {
    if (!win || win.isDestroyed()) return
    const b = screenBounds()
    win.setBounds(b)
    winPos = [b.x, b.y]
  }
  screen.on('display-metrics-changed', refit)
  screen.on('display-added', refit)
  screen.on('display-removed', refit)
}

// 命中判定放主进程：整屏透明窗口若靠「转发每次 mousemove」判断，
// 用户每动一下鼠标都要唤醒渲染进程，代价高一个数量级。
function cursorOnWhale() {
  if (!whaleRect || !win || win.isDestroyed()) return false
  const p = screen.getCursorScreenPoint()
  const pad = 8
  return (
    p.x >= winPos[0] + whaleRect.x - pad &&
    p.x <= winPos[0] + whaleRect.x + whaleRect.w + pad &&
    p.y >= winPos[1] + whaleRect.y - pad &&
    p.y <= winPos[1] + whaleRect.y + whaleRect.h + pad
  )
}

function syncInteractive() {
  const next = forceInteractive || cursorOnWhale()
  if (next === interactive) return
  interactive = next
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(!next)
  // 切换穿透状态会把置顶弄丢，这里补回来
  applyTop()
}

let lastLoggedW = -1
let logCount = 0
ipcMain.on('whale:state', (_event, state) => {
  if (!state) return
  const r = state.rect
  if (r && typeof r.x === 'number' && typeof r.w === 'number' && r.w > 0) {
    whaleRect = { x: r.x, y: r.y, w: r.w, h: r.h }
    // 尺寸变化时记一笔：挂件启动时先用默认值渲染，读到配置后才会缩放到设定大小
    const w = Math.round(whaleRect.w)
    if (w !== lastLoggedW && logCount < 4) {
      lastLoggedW = w
      logCount++
      console.log('[whale] 挂件尺寸: ' + whaleRect.w.toFixed(1) + 'px @ ' + Math.round(whaleRect.x) + ',' + Math.round(whaleRect.y))
    }
  }
  forceInteractive = !!state.force
  syncInteractive()
})

ipcMain.handle('whale:settings', () => currentSettings())

ipcMain.handle('whale:settings:patch', (_event, patch) => {
  if (!patch || typeof patch !== 'object') return currentSettings()
  if (typeof patch.alwaysOnTop === 'boolean') { settings.alwaysOnTop = patch.alwaysOnTop; applyTop() }
  if (typeof patch.soundSet === 'string') settings.soundSet = patch.soundSet
  if (typeof patch.showQuotaPanel === 'boolean') settings.showQuotaPanel = patch.showQuotaPanel
  if (typeof patch.autoStart === 'boolean') {
    if (patch.autoStart) setLaunchWithApps(false)
    setAutoStart(patch.autoStart)
  }
  if (typeof patch.launchWithApps === 'boolean') {
    if (patch.launchWithApps) setAutoStart(false)
    setLaunchWithApps(patch.launchWithApps)
  }
  saveSettings()
  buildTrayMenu()
  announceSettings()
  return currentSettings()
})

ipcMain.handle('whale:open-sounds', () => {
  if (soundsDirPath) shell.openPath(soundsDirPath)
  return !!soundsDirPath
})

function createTray(configPath) {
  const iconPath = path.join(APP_ROOT, 'vendor', 'dsh-whale-widget', 'assets', 'DSniang1.png')
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) image = nativeImage.createEmpty()
  tray = new Tray(image)
  tray.setToolTip('鲸鱼余额')
  trayConfigPath = configPath
  buildTrayMenu()
}

let trayConfigPath = ''
function buildTrayMenu() {
  if (!tray || tray.isDestroyed()) return
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: () => {
        settings.alwaysOnTop = !settings.alwaysOnTop
        saveSettings()
        applyTop()
        buildTrayMenu()
      },
    },
    {
      label: '常显额度面板', type: 'checkbox', checked: settings.showQuotaPanel,
      click: () => {
        settings.showQuotaPanel = !settings.showQuotaPanel
        saveSettings()
        announceSettings()
        buildTrayMenu()
      },
    },
    {
      label: '开机自启动', type: 'checkbox', checked: autoStartEnabled(), enabled: app.isPackaged,
      click: () => {
        const enabled = !autoStartEnabled()
        if (enabled) setLaunchWithApps(false)
        setAutoStart(enabled)
        announceSettings()
        buildTrayMenu()
      },
    },
    {
      label: '打开 VS Code/ChatGPT 时启动', type: 'checkbox', checked: launchWithAppsEnabled(), enabled: app.isPackaged,
      click: () => {
        const enabled = !launchWithAppsEnabled()
        if (enabled) setAutoStart(false)
        setLaunchWithApps(enabled)
        announceSettings()
        buildTrayMenu()
      },
    },
    { type: 'separator' },
    { label: '打开音效文件夹', click: () => { if (soundsDirPath) shell.openPath(soundsDirPath) } },
    { label: '编辑 config.json', click: () => shell.openPath(trayConfigPath) },
    { label: '打开数据目录', click: () => trayConfigPath ? shell.openPath(path.dirname(trayConfigPath)) : undefined },
    { label: '在浏览器中打开', click: () => shell.openExternal(pageUrl) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]))
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId(LOGIN_ITEM_NAME)
  // 本地服务跑在主进程里，不需要额外的 node 子进程
  const mod = await import('../server.mjs')
  const started = await mod.startServer({ root: APP_ROOT })
  serverRef = started
  pageUrl = 'http://' + started.host + ':' + started.port + '/'

  settingsPath = path.join(started.dirs.dataDir, '.whale-settings.json')
  soundsDirPath = started.dirs.soundsDir || ''
  loadSettings()

  createWindow()
  createTray(started.dirs.configPath)

  // 60ms 轮询光标：比转发每次 mousemove 便宜一个数量级，体感延迟可忽略
  setInterval(syncInteractive, 60)
  // 10s 兜底重申置顶：某些程序（全屏应用、UAC 提示）起来后会把层级抢走
  setInterval(applyTop, 10000)
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  if (serverRef && serverRef.shutdown) {
    try { serverRef.shutdown() } catch (err) { /* 忽略 */ }
  }
})
