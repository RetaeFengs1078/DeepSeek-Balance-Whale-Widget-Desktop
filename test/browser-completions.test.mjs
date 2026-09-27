import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { BrowserCompletionStore, isExtensionOrigin } from '../src/browser-completions.mjs'
import { randomUUID } from 'node:crypto'
import { startServer } from '../server.mjs'

test('只接受浏览器扩展来源，网页不能直接伪造提醒', () => {
  assert.equal(isExtensionOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop'), true)
  assert.equal(isExtensionOrigin('https://chatgpt.com'), false)
  assert.equal(isExtensionOrigin('chrome-extension://invalid'), false)
})

test('网页完成事件有来源、标题并去重', () => {
  const store = new BrowserCompletionStore()
  const item = store.add({ id: 'test-event-001', browser: 'Edge', conversation: '  示例  网页对话 ' })
  assert.equal(item.source, 'Edge · ChatGPT 网页')
  assert.equal(item.conversation, '示例 网页对话')
  assert.equal(store.add({ id: 'test-event-001', browser: 'Edge' }), null)
  assert.equal(store.add({ id: 'test-event-002', browser: 'Unknown' }), null)
})

test('扩展事件进入鲸鱼原有完成提醒队列', async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'whale-browser-test-'))
  const configPath = path.join(fixture, 'config.json')
  await fs.writeFile(configPath, '{}')
  let server
  try {
    server = await startServer({ configPath, dataDir: path.join(fixture, 'data'), port: 8896 })
    const base = 'http://127.0.0.1:' + server.port
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
    const ping = await (await fetch(base + '/whale/browser-bridge')).json()
    assert.equal(ping.bridge, 'chatgpt-web')
    const foreignPing = await fetch(base + '/whale/browser-bridge', { headers: { Origin: 'https://chatgpt.com' } })
    assert.equal(foreignPing.status, 403)
    const originlessPost = await fetch(base + '/whale/browser-completion', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Whale-Bridge': '1' },
      body: JSON.stringify({ id: 'originless-event', browser: 'Chrome', conversation: '伪造' }),
    })
    assert.equal(originlessPost.status, 403)
    const denied = await fetch(base + '/whale/browser-completion', {
      method: 'POST', headers: { Origin: 'https://chatgpt.com', 'Content-Type': 'application/json', 'X-Whale-Bridge': '1' },
      body: JSON.stringify({ id: 'denied-event', browser: 'Chrome', conversation: '伪造' }),
    })
    assert.equal(denied.status, 403)
    const accepted = await fetch(base + '/whale/browser-completion', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Whale-Bridge': '1' },
      body: JSON.stringify({ id: 'accepted-event', browser: 'Chrome', conversation: '网页回复测试', clientId: randomUUID() }),
    })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.headers.get('access-control-allow-origin'), origin)
    const completions = await (await fetch(base + '/whale/completions.json')).json()
    assert.ok(completions.events.some(item => item.id === 'web:accepted-event' && item.conversation === '网页回复测试'))
    assert.deepEqual(server.activateCompletion('web:accepted-event'), { ok: true, kind: 'browser' })
    assert.deepEqual(server.activateCompletion('web:missing'), { ok: false, kind: 'browser' })
  } finally {
    server?.shutdown()
    await fs.rm(fixture, { recursive: true, force: true })
  }
})
