// 浏览器扩展只提交页面标题和完成时间；事件仅保留在本机内存中。
export function isExtensionOrigin(value) {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(value || '')
}

export class BrowserCompletionStore {
  constructor() {
    this.events = []
    this.ids = new Set()
  }

  add(payload) {
    if (!payload || typeof payload !== 'object') return null
    const id = typeof payload.id === 'string' ? payload.id.slice(0, 100) : ''
    if (!/^[a-zA-Z0-9:_-]{8,100}$/.test(id) || this.ids.has(id)) return null
    const browser = payload.browser === 'Edge' ? 'Edge' : payload.browser === 'Chrome' ? 'Chrome' : ''
    if (!browser) return null
    const conversation = typeof payload.conversation === 'string'
      ? payload.conversation.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
      : ''
    const event = {
      id: 'web:' + id,
      time: Date.now(),
      source: browser + ' · ChatGPT 网页',
      conversation: conversation || 'ChatGPT 网页对话',
    }
    this.events.push(event)
    this.ids.add(id)
    while (this.events.length > 30) {
      const old = this.events.shift()
      this.ids.delete(old.id.slice(4))
    }
    return event
  }
}
