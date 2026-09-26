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
const { windowShape } = require('./window-shape.js')
const { compactBounds } = require('./window-layout.js')

const APP_ROOT = path.join(__dirname, '..')

let win = null
let tray = null
let interactive = false
let serverRef = null
let pageUrl = ''

// 鲸鱼和菜单在窗口坐标系里的矩形。仅拖拽时需要持续接管鼠标。
let whaleRect = null
let menuRect = null
let forceInteractive = false
let winPos = [0, 0]
let lastShapeKey = ''
let focusable = false
let desktopBounds = null
let layoutVersion = 0
let dragStartRect = null

function currentLayout() {
  const b = win && !win.isDestroyed() ? win.getBounds() : desktopBounds
  return {
    width: desktopBounds.width, height: desktopBounds.height,
    desktopX: desktopBounds.x, desktopY: desktopBounds.y,
    originX: b.x - desktopBounds.x, originY: b.y - desktopBounds.y,
    version: layoutVersion,
  }
}

ipcMain.on('whale:layout:get', (event) => { event.returnValue = currentLayout() })

function syncFocusable(menuOpen) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return
  const next = !!menuOpen
  if (next === focusable) return
  try { win.setFocusable(next); focusable = next }
  catch (err) { console.error('[whale] 焦点模式切换失败:', err) }
}

function applyWindowShape(regions) {
  if (process.platform !== 'win32' || !win || win.isDestroyed() || typeof win.setShape !== 'function') return
  const [width, height] = win.getSize()
  const rects = windowShape(regions, width, height)
  if (!rects.length) return
  const key = JSON.stringify(rects)
  if (key === lastShapeKey) return
  try { win.setShape(rects); lastShapeKey = key }
  catch (err) { console.error('[whale] 窗口区域更新失败:', err) }
}

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

// Electron 在 Windows 上切换 setIgnoreMouseEvents 偶尔会丢掉 TOPMOST 样式。
// 仅重申置顶属性，不调用 moveTop：强制重排整屏窗口会干扰视频表面。
function applyTop(force = false) {
  if (!win || win.isDestroyed()) return
  if (force || win.isAlwaysOnTop() !== settings.alwaysOnTop) {
    win.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver')
  }
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
  try { if (app.getLoginItemSettings({ path: process.execPath }).openAtLogin) return true }
  catch {}
  // 安装脚本直接登记 HKCU Run；Electron 在某些版本只认自己写入的条目。
  const result = spawnSync('reg.exe', ['query', RUN_KEY, '/v', LOGIN_ITEM_NAME], { windowsHide: true })
  return result.status === 0 && String(result.stdout || '').toLowerCase().includes(process.execPath.toLowerCase())
}

function setAutoStart(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged) return false
  try { app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, name: LOGIN_ITEM_NAME }) }
  catch (err) { console.error('[whale] 开机自启动设置失败:', err) }
  if (!enabled) spawnSync('reg.exe', ['delete', RUN_KEY, '/v', LOGIN_ITEM_NAME, '/f'], { windowsHide: true })
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

// 所有显示器的可用区域（不含任务栏）：鲸鱼的虚拟可拖范围。
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
  desktopBounds = screenBounds()
  const bounds = {
    x: desktopBounds.x + Math.max(0, desktopBounds.width - 420),
    y: desktopBounds.y + Math.max(0, desktopBounds.height - 420),
    width: Math.min(420, desktopBounds.width),
    height: Math.min(420, desktopBounds.height),
  }
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
    focusable: false,
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
  lastShapeKey = ''
  focusable = false
  // 不转发鼠标事件：透明区完全不吃事件，空闲时渲染进程零唤醒
  win.setIgnoreMouseEvents(true)
  // 首次渲染前也不能让全屏透明窗口参与浏览器的视频合成。
  if (process.platform === 'win32' && typeof win.setShape === 'function') {
    try { win.setShape([{ x: bounds.width - 1, y: bounds.height - 1, width: 1, height: 1 }]) } catch {}
  }
  applyTop(true)

  // 排查时开 WHALE_LOG_RENDERER=1 可把页面 console 打到终端
  if (process.env.WHALE_LOG_RENDERER === '1') {
    win.webContents.on('console-message', (event) => {
      console.log('[renderer:' + event.level + '] ' + event.message)
    })
  }

  win.loadURL(pageUrl)
  win.once('ready-to-show', () => {
    const b = win.getBounds()
    console.log('[whale] 窗口: ' + b.width + 'x' + b.height + ' @ ' + b.x + ',' + b.y + '（可拖范围 = 全桌面）')
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
    desktopBounds = screenBounds()
    const b = win.getBounds()
    const next = compactBounds([{ x: 0, y: 0, w: b.width, h: b.height }], b, desktopBounds)
    win.setBounds(next)
    winPos = [next.x, next.y]
    if (process.platform === 'win32' && typeof win.setShape === 'function') {
      try { win.setShape([{ x: 0, y: 0, width: 1, height: 1 }]); lastShapeKey = '' } catch {}
    }
    layoutVersion++
    win.webContents.send('whale:layout-changed', currentLayout())
  }
  screen.on('display-metrics-changed', refit)
  screen.on('display-added', refit)
  screen.on('display-removed', refit)
}

// 命中判定放主进程：若靠「转发每次 mousemove」判断，
// 用户每动一下鼠标都要唤醒渲染进程，代价高一个数量级。
function cursorOnInteractiveRegion() {
  if (!win || win.isDestroyed()) return false
  const p = screen.getCursorScreenPoint()
  const pad = 8
  return [whaleRect, menuRect].some((rect) => rect &&
    p.x >= winPos[0] + rect.x - pad &&
    p.x <= winPos[0] + rect.x + rect.w + pad &&
    p.y >= winPos[1] + rect.y - pad &&
    p.y <= winPos[1] + rect.y + rect.h + pad)
}

function syncInteractive() {
  const next = forceInteractive || cursorOnInteractiveRegion()
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
  if (!state || state.layoutVersion !== layoutVersion || !win || win.isDestroyed()) return
  const oldBounds = win.getBounds()
  const r = state.rect
  if (state.dragging && r && !dragStartRect) dragStartRect = { x: oldBounds.x + r.x, y: oldBounds.y + r.y }
  if (!state.dragging) dragStartRect = null
  const movedDrag = state.dragging && dragStartRect && r &&
    Math.hypot(oldBounds.x + r.x - dragStartRect.x, oldBounds.y + r.y - dragStartRect.y) > 6
  const target = movedDrag ? desktopBounds : compactBounds(state.regions, oldBounds, desktopBounds)
  const changed = target.x !== oldBounds.x || target.y !== oldBounds.y ||
    target.width !== oldBounds.width || target.height !== oldBounds.height
  if (changed) {
    win.setBounds(target)
    winPos = [target.x, target.y]
    layoutVersion++
    win.webContents.send('whale:layout-changed', currentLayout())
  }
  const shiftX = oldBounds.x - target.x
  const shiftY = oldBounds.y - target.y
  if (r && typeof r.x === 'number' && typeof r.w === 'number' && r.w > 0) {
    whaleRect = { x: r.x + shiftX, y: r.y + shiftY, w: r.w, h: r.h }
    // 尺寸变化时记一笔：挂件启动时先用默认值渲染，读到配置后才会缩放到设定大小
    const w = Math.round(whaleRect.w)
    if (w !== lastLoggedW && logCount < 4) {
      lastLoggedW = w
      logCount++
      console.log('[whale] 挂件尺寸: ' + whaleRect.w.toFixed(1) + 'px @ ' + Math.round(whaleRect.x) + ',' + Math.round(whaleRect.y))
    }
  }
  menuRect = state.menuOpen && state.menuRect
    ? { ...state.menuRect, x: state.menuRect.x + shiftX, y: state.menuRect.y + shiftY } : null
  forceInteractive = !!state.dragging
  syncFocusable(!!state.menuOpen)
  applyWindowShape((state.regions || []).map((box) => ({ ...box, x: box.x + shiftX, y: box.y + shiftY })))
  syncInteractive()
})

ipcMain.handle('whale:settings', () => currentSettings())

ipcMain.handle('whale:settings:patch', (_event, patch) => {
  if (!patch || typeof patch !== 'object') return currentSettings()
  if (typeof patch.alwaysOnTop === 'boolean') { settings.alwaysOnTop = patch.alwaysOnTop; applyTop(true) }
  if (typeof patch.soundSet === 'string') settings.soundSet = patch.soundSet
  if (typeof patch.showQuotaPanel === 'boolean') settings.showQuotaPanel = patch.showQuotaPanel
  if (typeof patch.autoStart === 'boolean') {
    if (patch.autoStart) setLaunchWithApps(false)
    setAutoStart(patch.autoStart)
  }
  if (typeof patch.launchWithApps === 'boolean') {
    if (!autoStartEnabled()) setLaunchWithApps(patch.launchWithApps)
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
        applyTop(true)
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
      label: '打开 VS Code/ChatGPT 时启动', type: 'checkbox', checked: launchWithAppsEnabled() && !autoStartEnabled(), enabled: app.isPackaged && !autoStartEnabled(),
      click: () => {
        if (autoStartEnabled()) return
        const enabled = !launchWithAppsEnabled()
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
  // 10s 兜底重申置顶，不强制改变浏览器焦点或窗口顺序。
  setInterval(applyTop, 10000)
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  if (serverRef && serverRef.shutdown) {
    try { serverRef.shutdown() } catch (err) { /* 忽略 */ }
  }
})
