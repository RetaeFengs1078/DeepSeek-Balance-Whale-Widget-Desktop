import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import vm from 'node:vm'
import { randomBytes, randomUUID } from 'node:crypto'
import { BrowserActionBridge } from '../src/browser-actions.mjs'
import { BrowserCompletionStore } from '../src/browser-completions.mjs'

const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'

test('浏览器反向通道只向原扩展实例发送激活事件', async () => {
  const bridge = new BrowserActionBridge()
  const server = http.createServer((_req, res) => { res.writeHead(404); res.end() })
  bridge.attach(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const socket = net.connect(server.address().port, '127.0.0.1')
  try {
    const instance = randomUUID()
    const store = new BrowserCompletionStore()
    const event = store.add({ id: 'action-test-001', browser: 'Chrome', clientId: instance }, origin)
    assert.deepEqual(store.target(event.id), { origin, clientId: instance })
    assert.equal(bridge.open(origin, instance, event.id), true) // 连接前点击也会短暂排队。
    const received = new Promise((resolve, reject) => {
      let bytes = Buffer.alloc(0)
      const timer = setTimeout(() => reject(new Error('浏览器指令超时')), 3000)
      socket.on('data', chunk => {
        bytes = Buffer.concat([bytes, chunk])
        const end = bytes.indexOf('\r\n\r\n')
        if (end < 0 || bytes.length < end + 6) return
        clearTimeout(timer)
        assert.match(bytes.subarray(0, end).toString(), /^HTTP\/1\.1 101 /)
        const frame = bytes.subarray(end + 4)
        const length = frame[1] === 126 ? frame.readUInt16BE(2) : frame[1]
        const offset = frame[1] === 126 ? 4 : 2
        resolve(JSON.parse(frame.subarray(offset, offset + length).toString()))
      })
    })
    const key = randomBytes(16).toString('base64')
    socket.write(`GET /whale/browser-actions?clientId=${instance} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: ${origin}\r\n\r\n`)
    assert.deepEqual(await received, { type: 'open', id: event.id })
    assert.equal(bridge.open('https://chatgpt.com', instance, event.id), false)
    assert.equal(store.target('web:missing'), null)
  } finally {
    bridge.close()
    socket.destroy()
    await new Promise(resolve => server.close(resolve))
  }
})

test('扩展只激活原有 ChatGPT 标签页，不创建标签页', async () => {
  const source = await fs.readFile(path.join(import.meta.dirname, '..', 'browser-extension', 'background.js'), 'utf8')
  const memory = {}
  const updates = []
  const posted = []
  let listener
  let tab = { id: 42, url: 'https://chatgpt.com/c/original', windowId: 7 }
  let matches = []
  class FakeSocket {
    static OPEN = 1
    static CONNECTING = 0
    constructor() { this.readyState = FakeSocket.CONNECTING; FakeSocket.last = this }
    close() { this.readyState = 3 }
  }
  const chrome = {
    storage: { local: {
      async get(key) {
        if (key === null) return { ...memory }
        return typeof key === 'string' ? { [key]: memory[key] } : {}
      },
      async set(value) { Object.assign(memory, value) },
      async remove(keys) { for (const key of keys) delete memory[key] },
    } },
    tabs: {
      async get() { return tab },
      async query() { return matches },
      async update(id, change) { updates.push(['tab', id, change]) },
    },
    windows: {
      async get() { return { state: 'minimized' } },
      async update(id, change) { updates.push(['window', id, change]) },
    },
    runtime: {
      onMessage: { addListener(fn) { listener = fn } },
      onStartup: { addListener() {} },
      getURL() { return 'chrome-extension://' + 'a'.repeat(32) + '/' },
    },
    alarms: { create() {}, onAlarm: { addListener() {} } },
  }
  const context = { chrome, WebSocket: FakeSocket, crypto: { randomUUID }, navigator: { userAgent: 'Chrome' },
    URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async (_url, options = {}) => {
      if (options.method === 'POST') posted.push(JSON.parse(options.body))
      return { ok: true, json: async () => ({ ok: true }) }
    } }
  vm.runInNewContext(source, context)
  const response = new Promise(resolve => listener(
    { type: 'completion', conversation: '原来的对话', url: tab.url },
    { tab: { id: tab.id }, url: tab.url }, resolve,
  ))
  assert.equal((await response).ok, true)
  assert.equal(posted.length, 1)
  const eventId = posted[0].id
  await new Promise(resolve => setImmediate(resolve))
  FakeSocket.last.onmessage({ data: JSON.stringify({ type: 'open', id: 'web:' + eventId }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(updates.map(item => item[0]), ['tab', 'window', 'window'])
  assert.equal(updates[0][1], 42)
  assert.equal(updates[2][2].focused, true)
  updates.length = 0
  tab = { id: 42, url: 'https://chatgpt.com/c/another', windowId: 7 }
  matches = []
  FakeSocket.last.onmessage({ data: JSON.stringify({ type: 'open', id: 'web:' + eventId }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(updates.length, 0)
})
