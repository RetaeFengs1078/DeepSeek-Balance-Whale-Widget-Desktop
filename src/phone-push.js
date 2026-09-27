// 可选的 iPhone 推送通道。主题随机生成并仅保存在本机 data 目录的设置文件中。
const { randomBytes } = require('node:crypto')

function newTopic() { return 'whale-' + randomBytes(20).toString('hex') }

function messageForCompletion(event, includeTitle = true) {
  const source = String(event?.source || 'Codex').replace(/\s+/g, ' ').trim().slice(0, 80)
  const title = String(event?.conversation || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100)
  return includeTitle && title ? `${source} 已完成：${title}` : `${source} 已完成`
}

async function publishPhonePush(topic, message, fetcher = fetch) {
  if (!/^whale-[a-f0-9]{40}$/.test(topic)) throw new Error('推送主题无效')
  const response = await fetcher('https://ntfy.sh/' + topic, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: String(message).slice(0, 500),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('推送服务返回 ' + response.status)
  return true
}

module.exports = { newTopic, messageForCompletion, publishPhonePush }
