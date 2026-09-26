const PORTS = Array.from({ length: 10 }, (_, index) => 8788 + index)
const OPEN_PREFIX = 'whaleOpen:'
let clientIdPromise = null
let actionSocket = null
let heartbeat = null
let reconnectTimer = null
let connecting = false

function browserName() {
  return /Edg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome'
}

function clientId() {
  if (!clientIdPromise) clientIdPromise = chrome.storage.local.get('whaleClientId').then(async stored => {
    let id = stored.whaleClientId
    if (!/^[a-f0-9-]{36}$/i.test(id || '')) {
      id = crypto.randomUUID()
      await chrome.storage.local.set({ whaleClientId: id })
    }
    return id
  })
  return clientIdPromise
}

async function callWhale(path, options = {}) {
  for (const port of PORTS) {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 900)
    try {
      const response = await fetch('http://127.0.0.1:' + port + path, {
        ...options,
        signal: abort.signal,
        cache: 'no-store',
      })
      if (!response.ok) continue
      const data = await response.json()
      if (data && data.ok) return { ok: true, port }
    } catch (_) {
      // 可能该端口没有运行鲸鱼；继续尝试下一端口。
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, error: '未找到正在运行的小鲸鱼（请先打开桌面程序）' }
}

async function rememberTab(id, tab, url) {
  if (!Number.isInteger(tab?.id) || !/^https:\/\/chatgpt\.com\//.test(url || '')) return false
  await chrome.storage.local.set({ [OPEN_PREFIX + id]: { tabId: tab.id, url, time: Date.now() } })
  const all = await chrome.storage.local.get(null)
  const keys = Object.keys(all).filter(key => key.startsWith(OPEN_PREFIX))
    .sort((a, b) => (all[b]?.time || 0) - (all[a]?.time || 0))
  const expired = keys.filter((key, index) => index >= 50 || Date.now() - (all[key]?.time || 0) > 7 * 86400000)
  if (expired.length) await chrome.storage.local.remove(expired)
  return true
}

async function sendCompletion(conversation, tab = null, url = '') {
  const id = crypto.randomUUID()
  const actionable = await rememberTab(id, tab, url)
  const instance = actionable ? await clientId() : undefined
  void connectBridge()
  return callWhale('/whale/browser-completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Whale-Bridge': '1' },
    body: JSON.stringify({
      id,
      browser: browserName(),
      conversation: String(conversation || 'ChatGPT 网页对话').slice(0, 60),
      clientId: instance,
    }),
  })
}

function sameConversation(actual, expected) {
  try {
    const a = new URL(actual)
    const b = new URL(expected)
    return a.origin === 'https://chatgpt.com' && a.origin === b.origin && a.pathname === b.pathname
  } catch { return false }
}

async function openExistingTab(id) {
  const stored = (await chrome.storage.local.get(OPEN_PREFIX + id))[OPEN_PREFIX + id]
  if (!stored || !/^https:\/\/chatgpt\.com\//.test(stored.url || '')) return false
  let tab = null
  try { tab = await chrome.tabs.get(stored.tabId) } catch (_) {}
  if (!tab || !sameConversation(tab.url, stored.url)) {
    const matches = await chrome.tabs.query({ url: 'https://chatgpt.com/*' })
    tab = matches.find(item => sameConversation(item.url, stored.url)) || null
  }
  if (!tab) return false // 原对话已关闭，不创建新标签页，也不改变其他标签页。
  await chrome.tabs.update(tab.id, { active: true })
  const browserWindow = await chrome.windows.get(tab.windowId)
  if (browserWindow.state === 'minimized') await chrome.windows.update(tab.windowId, { state: 'normal' })
  await chrome.windows.update(tab.windowId, { focused: true })
  return true
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void connectBridge() }, 5000)
}

async function connectBridge() {
  if (connecting || actionSocket?.readyState === WebSocket.OPEN || actionSocket?.readyState === WebSocket.CONNECTING) return
  connecting = true
  try {
    const instance = await clientId()
    const found = await callWhale('/whale/browser-bridge')
    if (!found.ok) { scheduleReconnect(); return }
    const socket = new WebSocket('ws://127.0.0.1:' + found.port + '/whale/browser-actions?clientId=' + encodeURIComponent(instance))
    actionSocket = socket
    socket.onopen = () => {
      heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping') }, 20000)
    }
    socket.onmessage = event => {
      try {
        const command = JSON.parse(event.data)
        if (command.type === 'open' && /^web:[a-zA-Z0-9:_-]{8,100}$/.test(command.id)) {
          void openExistingTab(command.id.slice(4)).catch(() => {})
        }
      } catch (_) {}
    }
    socket.onclose = () => {
      if (actionSocket === socket) actionSocket = null
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
      scheduleReconnect()
    }
    socket.onerror = () => socket.close()
  } catch (_) { scheduleReconnect() }
  finally { connecting = false }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message.type !== 'string') return
  if (message.type === 'diagnostic') {
    if (!sender.tab || !/^https:\/\/chatgpt\.com\//.test(sender.url || '')) return
    const stage = String(message.stage || '').slice(0, 60)
    chrome.storage.local.set({ lastWebState: { stage, time: Date.now() } }, () => respond({ ok: !chrome.runtime.lastError }))
    return true
  }
  if (message.type === 'completion') {
    if (!sender.tab || !/^https:\/\/chatgpt\.com\//.test(sender.url || '')) return
    sendCompletion(message.conversation, sender.tab, message.url || sender.url).then(respond).catch(() => respond({ ok: false }))
    return true
  }
  if (message.type === 'ping' || message.type === 'test') {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(''))) return
    const action = message.type === 'ping'
      ? callWhale('/whale/browser-bridge')
      : sendCompletion('浏览器扩展测试提醒')
    action.then(respond)
    return true
  }
})

chrome.alarms.create('whaleReconnect', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'whaleReconnect') void connectBridge() })
chrome.runtime.onStartup.addListener(() => { void connectBridge() })
void connectBridge()
