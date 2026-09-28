// 独立宿主 —— 用「假 ctx」把 DSH 插件跑在任意 Node 环境里。
// vendored 插件只保留桌面缩放和菜单点击修补，详见 NOTICE。
//
// 两种用法：
//   1) 命令行直接跑：node server.mjs   （浏览器模式，见 start-browser.bat）
//   2) Electron 主进程调用 startServer()（桌面透明窗口模式，见 src/main.js）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodexReader } from './src/codex-reader.mjs'
import { CodexCompletionReader } from './src/codex-completions.mjs'
import { BrowserCompletionStore, isExtensionOrigin } from './src/browser-completions.mjs'
import { BrowserActionBridge } from './src/browser-actions.mjs'
import { UsageHistory } from './src/usage-history.mjs'
import { getAlmanac } from './src/almanac.mjs'
import { scanSoundPacks, createSoundPicker } from './src/sound-packs.mjs'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

const CONFIG_TEMPLATE = {
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_PLATFORM_TOKEN: '',
}

// 打包成 exe 之后，源码在只读的 app.asar 里，config.json / data 必须放到 exe 旁边。
function isPackagedAsar(dir) {
  return !!(
    process.versions &&
    process.versions.electron &&
    process.resourcesPath &&
    dir.startsWith(path.join(process.resourcesPath, 'app.asar'))
  )
}

export function resolveRuntimeDirs(opts = {}) {
  const root = opts.root || MODULE_DIR
  const appDir = isPackagedAsar(root) ? path.dirname(process.execPath) : root
  return {
    root,
    appDir,
    dataDir: opts.dataDir || path.join(appDir, 'data'),
    configPath: opts.configPath || path.join(appDir, 'config.json'),
  }
}

function loadConfig(configPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    return {}
  }
}

export async function startServer(opts = {}) {
  const dirs = resolveRuntimeDirs(opts)
  fs.mkdirSync(dirs.dataDir, { recursive: true })

  // 插件在模块加载时就读取 DSH_HOME，必须在 import 之前设好。
  process.env.DSH_HOME = dirs.dataDir

  if (!fs.existsSync(dirs.configPath)) {
    try {
      fs.writeFileSync(dirs.configPath, JSON.stringify(CONFIG_TEMPLATE, null, 2), 'utf8')
    } catch (err) { /* 只读环境就算了 */ }
  }

  // 首次运行（尤其是打包后 data/ 是空的）把默认挂件配置播种过去，
  // 否则会退回插件内置默认值（每轮消耗统计是开着的）。
  const sizeFile = path.join(dirs.dataDir, '.dshw-size.json')
  if (!fs.existsSync(sizeFile)) {
    const seed = path.join(dirs.root, 'defaults', '.dshw-size.json')
    try {
      if (fs.existsSync(seed)) fs.copyFileSync(seed, sizeFile)
    } catch (err) { /* 忽略 */ }
  }
  let fileCfg = loadConfig(dirs.configPath)
  const codexReader = new CodexReader()
  const completionReader = new CodexCompletionReader()
  const browserCompletions = new BrowserCompletionStore()
  const browserActions = new BrowserActionBridge()
  const usageHistory = new UsageHistory(dirs.dataDir)
  const skinsDir = path.join(dirs.dataDir, 'skins')
  fs.mkdirSync(skinsDir, { recursive: true })
  dirs.skinsDir = skinsDir
  const sampleQuota = () => codexReader.refresh().then(snapshot => usageHistory.sampleQuota(snapshot)).catch(() => {})
  const quotaTimer = setInterval(sampleQuota, 60000)
  quotaTimer.unref()
  void sampleQuota()
  await completionReader.refresh() // 启动前的旧事件只作基线，不弹历史通知。
  const reloadConfig = () => { fileCfg = loadConfig(dirs.configPath) }

  // 凭据：环境变量优先，其次 config.json（只在本机，不上传）。
  function credential(name) {
    const fromEnv = process.env[name]
    const raw = fromEnv !== undefined && fromEnv !== '' ? fromEnv : fileCfg[name]
    return raw === undefined || raw === null ? '' : String(raw).trim()
  }

  const { apply } = await import('./vendor/dsh-whale-widget/lib/index.js')

  // ---- 假 ctx：插件只用到 5 个 API，全部在这里补齐 ----
  const routes = []
  let indexTap = null
  const cleanups = []
  cleanups.push(() => clearInterval(quotaTimer))

  const webServer = {
    register(spec) {
      const entry = { path: spec.path, handler: spec.handler }
      routes.push(entry)
      return () => { const i = routes.indexOf(entry); if (i >= 0) routes.splice(i, 1) }
    },
    tapIndex(fn) {
      indexTap = fn
      return () => { indexTap = null }
    },
  }

  const ctx = {
    webServer,
    credentials: {
      async resolve(name) {
        const value = credential(name)
        return value ? { value } : null
      },
    },
    // 会话事件在独立宿主里没有来源（每轮消耗统计已关闭），仅保留接口形状。
    on() { return () => {} },
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') cleanups.push(d)
    },
  }

  apply(ctx)

  function send(res, code, body, type) {
    res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(body)
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  // 自定义音效目录：放在 config.json 旁边，丢音频文件进去就能在菜单里选
  const soundsDir = opts.soundsDir || path.join(dirs.appDir, 'sounds')
  try {
    fs.mkdirSync(soundsDir, { recursive: true })
    const hintFile = path.join(soundsDir, '把音频文件放这里.txt')
    if (!fs.existsSync(hintFile)) {
      fs.writeFileSync(hintFile,
        '把 mp3 / wav / ogg / m4a / flac 等音频文件直接放进这个文件夹，\n' +
        '然后到小鲸鱼的菜单里点「音效包 → 刷新」就能看到并开始切换。\n\n' +
        '想让按下和松手用不同声音，就把两个文件命名成同一前缀：\n' +
        '  mysound_press.mp3   和   mysound_release.mp3\n' +
        '（也认 -press/-release、down/up、按下/松手）\n' +
        '只有一个文件时，按下和松手都用它。\n\n' +
        '一个音效包想放多段：新建一个子文件夹，把 01.mp3、02.mp3 等放进去。\n' +
        '菜单可选顺序循环或随机播放；每次点击选一段，按下和松手使用同一段。\n',
        'utf8')
    }
  } catch (err) { /* 只读环境就算了 */ }

  // 扫描结果缓存：id -> { tracks: [{ press, release, any }] }
  let soundIndex = new Map()
  const pickSound = createSoundPicker()
  const SOUND_MIME = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac',
    '.opus': 'audio/opus', '.webm': 'audio/webm',
  }

  function scanSounds() {
    const packs = scanSoundPacks(soundsDir)
    soundIndex = new Map(packs.map(pack => [pack.id, pack]))
    return packs
  }
  dirs.soundsDir = soundsDir
  scanSounds()

  // 返回 true 表示已由自定义音效处理，false 则交给插件的内置音效
  function serveCustomSound(req, res, which) {
    const params = new URL(req.url, 'http://localhost').searchParams
    const set = params.get('set') || ''
    if (!set.startsWith('c:')) return false
    const pack = soundIndex.get(set.slice(2))
    if (!pack) return false
    const event = params.get('event') || ''
    const track = pickSound(pack, /^[a-z0-9-]{1,64}$/i.test(event) ? event : '', params.get('mode'))
    const file = which === 'press' ? (track.press || track.any) : (track.release || track.any)
    if (!file) return false
    let bytes
    try { bytes = fs.readFileSync(path.join(soundsDir, file)) } catch (err) { return false }
    res.writeHead(200, {
      'Content-Type': SOUND_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.length),
    })
    res.end(bytes)
    return true
  }

  // 只允许页面改这两个键，避免把 config.json 变成任意文件写入口
  const WRITABLE_KEYS = ['DEEPSEEK_API_KEY', 'DEEPSEEK_PLATFORM_TOKEN']
  function handleConfig(req, res) {
    if (req.method === 'POST' || req.method === 'PUT') {
      readBody(req).then((raw) => {
        let incoming = {}
        try { incoming = JSON.parse(raw) } catch (err) { incoming = {} }
        const current = loadConfig(dirs.configPath)
        let touched = false
        for (const k of WRITABLE_KEYS) {
          if (typeof incoming[k] === 'string') {
            current[k] = incoming[k].trim()
            touched = true
          }
        }
        if (!touched) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: 'nothing to save' }))
          return
        }
        try {
          fs.writeFileSync(dirs.configPath, JSON.stringify(current, null, 2), 'utf8')
        } catch (err) {
          res.writeHead(500, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: 'config.json 写入失败（只读？）' }))
          return
        }
        reloadConfig()
        const key = String(current.DEEPSEEK_API_KEY || '')
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify({ ok: true, hasKey: !!key, tail: key ? key.slice(-4) : '' }))
      }).catch(() => {
        res.writeHead(400, JSON_HEADERS)
        res.end(JSON.stringify({ ok: false, error: 'bad body' }))
      })
      return
    }
    const key = String(loadConfig(dirs.configPath).DEEPSEEK_API_KEY || '')
    res.writeHead(200, JSON_HEADERS)
    res.end(JSON.stringify({ ok: true, hasKey: !!key, tail: key ? key.slice(-4) : '' }))
  }

  const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  }

  const server = http.createServer((req, res) => {
    let pathname = '/'
    try { pathname = new URL(req.url, 'http://localhost').pathname } catch (err) { pathname = '/' }

    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return }
    if (pathname === '/whale/skins' && req.method === 'GET') {
      const portraitFile = path.join(skinsDir, 'portrait.png')
      res.writeHead(200, JSON_HEADERS)
      res.end(JSON.stringify({ ok: true, items: [
        { id: 'default', name: '原版小鲸鱼' },
        ...(fs.existsSync(portraitFile) ? [{ id: 'portrait', name: '照片形象' }] : []),
      ] }))
      return
    }
    if (pathname === '/whale/skin/portrait.png' && req.method === 'GET') {
      try {
        const portraitFile = path.join(skinsDir, 'portrait.png')
        const stat = fs.statSync(portraitFile)
        if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('skin unavailable')
        const bytes = fs.readFileSync(portraitFile)
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Length': String(bytes.length) })
        res.end(bytes)
      } catch { send(res, 404, 'skin unavailable') }
      return
    }
    if (pathname === '/whale/almanac' && req.method === 'GET') {
      res.writeHead(200, JSON_HEADERS)
      res.end(JSON.stringify(getAlmanac()))
      return
    }
    if (pathname === '/whale/usage' || pathname === '/whale/usage/question' || pathname === '/whale/usage/reset') {
      const origin = String(req.headers.origin || '')
      if (origin && !isExtensionOrigin(origin)) { send(res, 403, 'extension origin required'); return }
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Whale-Bridge',
      }
      if (req.method === 'OPTIONS' && isExtensionOrigin(origin)) { res.writeHead(204, headers); res.end(); return }
      if (pathname === '/whale/usage' && req.method === 'GET') {
        res.writeHead(200, headers)
        res.end(JSON.stringify(usageHistory.summary()))
        return
      }
      if (req.method !== 'POST' || !isExtensionOrigin(origin) || req.headers['x-whale-bridge'] !== '1' ||
          !String(req.headers['content-type'] || '').startsWith('application/json')) {
        res.writeHead(405, headers); res.end(JSON.stringify({ ok: false })); return
      }
      let body = ''
      req.on('data', chunk => { body += chunk; if (body.length > 2048) req.destroy() })
      req.on('end', () => {
        let ok = false
        try {
          const item = JSON.parse(body)
          ok = pathname === '/whale/usage/question'
            ? usageHistory.recordQuestion(item)
            : usageHistory.setReset(item.browser, item.resetAt, item.source)
        } catch (err) { console.error('[whale] 统计写入失败:', err) }
        res.writeHead(ok ? 200 : 400, headers)
        res.end(JSON.stringify({ ok, ...(ok ? { summary: usageHistory.summary() } : {}) }))
      })
      return
    }
    if (pathname === '/whale/browser-bridge' || pathname === '/whale/browser-completion') {
      const origin = String(req.headers.origin || '')
      // Chromium 扩展对已授权的本机地址发简单 GET 时可能省略 Origin。
      // 此路由只返回连接状态；写入完成事件仍必须验证扩展来源。
      if (pathname === '/whale/browser-bridge' && req.method === 'GET' && !origin) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ ok: true, bridge: 'chatgpt-web' }))
        return
      }
      if (!isExtensionOrigin(origin)) { send(res, 403, 'extension origin required'); return }
      const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Whale-Bridge',
        'Cache-Control': 'no-store',
        'Vary': 'Origin',
      }
      if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return }
      if (pathname === '/whale/browser-bridge' && req.method === 'GET') {
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, bridge: 'chatgpt-web' }))
        return
      }
      if (pathname === '/whale/browser-completion' && req.method === 'POST' &&
          req.headers['x-whale-bridge'] === '1' &&
          String(req.headers['content-type'] || '').startsWith('application/json')) {
        let body = ''
        req.on('data', chunk => {
          body += chunk
          if (body.length > 2048) req.destroy()
        })
        req.on('end', () => {
          let item = null
          try { item = browserCompletions.add(JSON.parse(body), origin) } catch {}
          res.writeHead(item ? 200 : 400, { ...headers, 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: !!item }))
        })
        return
      }
      res.writeHead(405, headers); res.end()
      return
    }
    if (pathname === '/src/codex-ui.js') {
      try { send(res, 200, fs.readFileSync(path.join(dirs.root, 'src', 'codex-ui.js'), 'utf8'), 'text/javascript; charset=utf-8') }
      catch { send(res, 500, 'Codex 界面脚本读取失败') }
      return
    }
    if (pathname === '/src/literature-quotes.js') {
      try { send(res, 200, fs.readFileSync(path.join(dirs.root, 'src', 'literature-quotes.js'), 'utf8'), 'text/javascript; charset=utf-8') }
      catch { send(res, 500, '名句读取失败') }
      return
    }
    if (pathname === '/src/desktop-menu.js') {
      try { send(res, 200, fs.readFileSync(path.join(dirs.root, 'src', 'desktop-menu.js'), 'utf8'), 'text/javascript; charset=utf-8') }
      catch { send(res, 500, '桌面菜单脚本读取失败') }
      return
    }
    if (pathname === '/src/settings-ui.js') {
      try { send(res, 200, fs.readFileSync(path.join(dirs.root, 'src', 'settings-ui.js'), 'utf8'), 'text/javascript; charset=utf-8') }
      catch { send(res, 500, '设置界面脚本读取失败') }
      return
    }

    if (pathname === '/whale/codex.json') {
      if (req.method !== 'GET') { send(res, 405, 'method not allowed'); return }
      codexReader.refresh().then((snapshot) => {
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(snapshot))
      }).catch((err) => {
        res.writeHead(500, JSON_HEADERS)
        res.end(JSON.stringify({ ok: false, message: '读取 Codex 日志失败：' + err.message }))
      })
      return
    }

    if (pathname === '/whale/completions.json') {
      if (req.method !== 'GET') { send(res, 405, 'method not allowed'); return }
      completionReader.refresh().then((local) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ ok: true, events: [...local, ...browserCompletions.events].sort((a, b) => a.time - b.time).slice(-30) }))
      }).catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ ok: false, events: [] }))
      })
      return
    }

    // 没有 DeepSeek Key 时仍让原鲸鱼正常绘制与动画；额度由独立 Codex 面板显示。
    if (pathname === '/dsh-whale/balance.json' && !credential('DEEPSEEK_API_KEY')) {
      res.writeHead(200, JSON_HEADERS)
      res.end(JSON.stringify({ ok: true, totalBalance: 0, currency: 'CNY', todayUsage: null, isPeak: false }))
      return
    }

    // 挂件设置里填 API Key 用
    if (pathname === '/dsh-whale/config') { handleConfig(req, res); return }

    // 自定义音效：命中才处理，否则落回插件的内置音效路由
    if (pathname === '/dsh-whale/sound/press.mp3') {
      if (serveCustomSound(req, res, 'press')) return
    }
    if (pathname === '/dsh-whale/sound/release.mp3') {
      if (serveCustomSound(req, res, 'release')) return
    }
    if (pathname === '/dsh-whale/sounds') {
      res.writeHead(200, JSON_HEADERS)
      res.end(JSON.stringify({ ok: true, dir: soundsDir, items: scanSounds() }))
      return
    }

    for (const r of routes) {
      if (r.path === pathname) {
        try { r.handler(req, res) } catch (err) { send(res, 500, String((err && err.message) || err)) }
        return
      }
    }

    if (pathname === '/' || pathname === '/index.html') {
      let html = ''
      try {
        html = fs.readFileSync(path.join(dirs.root, 'index.html'), 'utf8')
      } catch (err) {
        send(res, 500, 'index.html 读取失败')
        return
      }
      if (indexTap) {
        try { html = indexTap(html) } catch (err) { /* 注入失败就原样返回 */ }
      }
      send(res, 200, html, 'text/html; charset=utf-8')
      return
    }

    if (pathname === '/settings.html') {
      try { send(res, 200, fs.readFileSync(path.join(dirs.root, 'settings.html'), 'utf8'), 'text/html; charset=utf-8') }
      catch { send(res, 500, '设置界面读取失败') }
      return
    }

    send(res, 404, 'not found')
  })
  browserActions.attach(server)

  function activateCompletion(id) {
    if (typeof id !== 'string' || id.length > 150) return { ok: false }
    if (id.startsWith('web:')) {
      const target = browserCompletions.target(id)
      return { ok: !!target && browserActions.open(target.origin, target.clientId, id), kind: 'browser' }
    }
    const item = completionReader.events.find((event) => event.id === id)
    if (!item) return { ok: false }
    if (item.source === 'Codex 客户端') return { ok: true, kind: 'app', app: 'ChatGPT' }
    if (item.source === 'VS Code Codex') return { ok: true, kind: 'app', app: 'Code' }
    if (item.source === 'Codex 命令行') return { ok: true, kind: 'app', app: 'Terminal' }
    return { ok: false }
  }

  // 端口被占用（比如浏览器模式已经开着）就顺延，最多试 10 个。
  const host = opts.host || process.env.WHALE_HOST || '127.0.0.1'
  const wanted = Number(opts.port || process.env.WHALE_PORT || 8788)
  let port = 0
  for (let i = 0; i < 10; i++) {
    const candidate = wanted + i
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(candidate, host, () => {
          server.removeListener('error', reject)
          resolve()
        })
      })
      port = candidate
      break
    } catch (err) {
      if (err && err.code !== 'EADDRINUSE') throw err
    }
  }
  if (!port) throw new Error('端口 ' + wanted + ' 及其后续 10 个端口都被占用')

  console.log('[whale] http://' + host + ':' + port + '/')
  console.log('[whale] 数据目录: ' + dirs.dataDir)
  console.log('[whale] 配置文件: ' + dirs.configPath)
  console.log('[whale] DeepSeek 功能: ' + (credential('DEEPSEEK_API_KEY') ? '已启用' : '未启用（Codex 模式无需密钥）'))

  function shutdown() {
    for (const c of cleanups) { try { c() } catch (err) {} }
    browserActions.close()
    try { server.close() } catch (err) {}
  }
  process.on('SIGINT', () => { shutdown(); process.exit(0) })
  process.on('SIGTERM', () => { shutdown(); process.exit(0) })

  function getCompletion(id) {
    if (typeof id !== 'string' || id.length > 150) return null
    return [...completionReader.events, ...browserCompletions.events]
      .find((item) => item.id === id) || null
  }

  return { port, host, server, dirs, shutdown, activateCompletion, getCompletion }
}

// 直接 node server.mjs 运行时才自动启动；被 import 时不启动。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
