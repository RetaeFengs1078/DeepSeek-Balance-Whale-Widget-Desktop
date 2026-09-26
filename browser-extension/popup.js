const status = document.getElementById('status')
const diagnostic = document.getElementById('diagnostic')
const currentBrowser = /Edg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome'
const resetInput = document.getElementById('reset-time')
function localInput(time) {
  const date = new Date(time)
  const pad = value => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}
function showUsage(data) {
  if (!data || !data.ok) return
  const browsers = data.browsers || {}
  for (const browser of ['Chrome', 'Edge']) {
    const item = browsers[browser] || {}
    document.getElementById(browser.toLowerCase() + '-count').textContent = '今日 ' + (item.today || 0) + ' · 本周 ' + (item.weekly || 0)
  }
  const own = browsers[currentBrowser] || {}
  resetInput.value = own.nextResetAt ? localInput(own.nextResetAt) : ''
  document.getElementById('reset-status').textContent = own.nextResetAt
    ? currentBrowser + ' 下次重置：' + new Date(own.nextResetAt).toLocaleString('zh-CN') + (own.resetSource === 'page' ? '（网页识别）' : '（手动设置）')
    : currentBrowser + ' 尚未找到重置时间，请手动填写'
  const quota = data.codexUsage || {}
  const fmt = item => Number(item?.usedPercent || 0).toFixed(2).replace(/\.00$/, '') + '%'
  document.getElementById('quota-today').textContent = '5 小时窗口 ' + fmt(quota.fiveHour) + ' · 每周窗口 ' + fmt(quota.weekly)
}
function refreshUsage() {
  chrome.runtime.sendMessage({ type: 'usage' }, result => {
    if (chrome.runtime.lastError || !result || !result.ok) {
      document.getElementById('reset-status').textContent = '请先启动小鲸鱼，再读取统计'
      return
    }
    showUsage(result)
  })
}
function showDiagnostic(value) {
  diagnostic.textContent = value && value.stage
    ? '网页检测：' + value.stage
    : '网页检测：请刷新 chatgpt.com 标签页'
}
chrome.storage.local.get('lastWebState', data => showDiagnostic(data.lastWebState))
chrome.storage.onChanged.addListener(changes => {
  if (changes.lastWebState) showDiagnostic(changes.lastWebState.newValue)
})
function request(type) {
  status.textContent = type === 'test' ? '正在发送测试提醒…' : '正在检查连接…'
  chrome.runtime.sendMessage({ type }, result => {
    if (chrome.runtime.lastError || !result || !result.ok) {
      status.textContent = (result && result.error) || '连接失败，请先启动小鲸鱼。'
      return
    }
    status.textContent = type === 'test' ? '已发送，请看小鲸鱼气泡。' : '已连接本机小鲸鱼。'
  })
}
document.getElementById('check').addEventListener('click', () => request('ping'))
document.getElementById('test').addEventListener('click', () => request('test'))
document.getElementById('save-reset').addEventListener('click', () => {
  const time = new Date(resetInput.value).getTime()
  if (!Number.isFinite(time)) { document.getElementById('reset-status').textContent = '请输入有效的日期和时间'; return }
  chrome.runtime.sendMessage({ type: 'set-reset', resetAt: time }, result => {
    if (chrome.runtime.lastError || !result || !result.ok) { document.getElementById('reset-status').textContent = '保存失败，请确认小鲸鱼正在运行'; return }
    showUsage(result.summary)
  })
})
document.getElementById('clear-reset').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'set-reset', resetAt: null }, result => {
    if (chrome.runtime.lastError || !result || !result.ok) { document.getElementById('reset-status').textContent = '切换失败，请确认小鲸鱼正在运行'; return }
    showUsage(result.summary)
  })
})
request('ping')
refreshUsage()
