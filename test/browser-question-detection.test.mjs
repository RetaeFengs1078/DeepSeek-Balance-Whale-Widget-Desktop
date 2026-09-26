import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const source = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'browser-extension', 'content.js'), 'utf8')

function page(modelName) {
  const listeners = {}
  const messages = []
  const model = {
    innerText: modelName, textContent: modelName,
    getAttribute: () => '', getClientRects: () => [{}], closest: () => null,
  }
  let user = null
  let scan
  const document = {
    title: '测试对话 - ChatGPT', documentElement: {},
    addEventListener(type, handler) { listeners[type] = handler },
    querySelectorAll(selector) {
      if (selector === '[data-message-author-role="user"]') return user ? [user] : []
      if (selector.includes('model-switcher') || selector === 'header button' || selector === 'button, [role="button"]') return [model]
      return []
    },
  }
  const window = {}
  window.top = window
  vm.runInNewContext(source, {
    window, document, location: { href: 'https://chatgpt.com/c/test' },
    chrome: { runtime: { sendMessage(message, done) { messages.push(message); done?.({ ok: true }) }, lastError: null } },
    MutationObserver: class { observe() {} },
    setInterval(callback) { scan = callback },
    setTimeout() { return 1 },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' },
    Date,
  })
  return {
    messages,
    send() {
      listeners.keydown({ key: 'Enter', shiftKey: false, isComposing: false, target: { closest: () => ({}) } })
      user = { compareDocumentPosition: () => 0 }
      scan()
    },
    rerender() { user = { compareDocumentPosition: () => 0 }; scan() },
  }
}

test('只在 6 Pro 新提问时计数，消息节点重绘不重复计数', () => {
  const sixPro = page('6 Pro')
  sixPro.send()
  sixPro.rerender()
  assert.equal(sixPro.messages.filter(message => message.type === 'question').length, 1)
  const other = page('6 Sol')
  other.send()
  assert.equal(other.messages.filter(message => message.type === 'question').length, 0)
})
