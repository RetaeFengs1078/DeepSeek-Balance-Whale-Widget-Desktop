const PORTS = Array.from({ length: 10 }, (_, index) => 8788 + index)

function browserName() {
  return /Edg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome'
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

async function sendCompletion(conversation) {
  return callWhale('/whale/browser-completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Whale-Bridge': '1' },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      browser: browserName(),
      conversation: String(conversation || 'ChatGPT 网页对话').slice(0, 60),
    }),
  })
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message.type !== 'string') return
  if (message.type === 'completion') {
    if (!sender.tab || !/^https:\/\/chatgpt\.com\//.test(sender.url || '')) return
    sendCompletion(message.conversation).then(respond)
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
