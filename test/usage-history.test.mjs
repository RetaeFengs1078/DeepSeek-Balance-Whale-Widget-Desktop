import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { UsageHistory } from '../src/usage-history.mjs'
import { startServer } from '../server.mjs'

const HOUR = 3600000
const WEEK = 7 * 86400000

test('Chrome 与 Edge 分开计数、去重、保存每日文件并每周重置', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whale-usage-'))
  let now = new Date(2026, 8, 26, 12).getTime()
  try {
    let history = new UsageHistory(root, () => now)
    const id = randomUUID()
    assert.equal(history.recordQuestion({ id, browser: 'Chrome', model: '6 Pro' }), true)
    assert.equal(history.recordQuestion({ id, browser: 'Chrome', model: '6 Pro' }), true)
    assert.equal(history.recordQuestion({ id: randomUUID(), browser: 'Edge', model: '6 Pro' }), true)
    assert.equal(history.recordQuestion({ id: randomUUID(), browser: 'Chrome', model: '6 Sol' }), false)
    assert.equal(history.setReset('Chrome', now + HOUR), true)
    assert.equal(history.summary().browsers.Chrome.today, 1)
    assert.equal(history.summary().browsers.Edge.today, 1)
    history = new UsageHistory(root, () => now)
    assert.equal(history.summary().browsers.Chrome.weekly, 1)
    now += HOUR + 1000
    assert.equal(history.summary().browsers.Chrome.weekly, 0)
    assert.equal(history.summary().browsers.Chrome.nextResetAt, new Date(2026, 8, 26, 13).getTime() + WEEK)
    assert.equal(history.recordQuestion({ id: randomUUID(), browser: 'Chrome', model: '6 Pro' }), true)
    assert.equal(history.summary().browsers.Chrome.weekly, 1)
    assert.equal(history.summary().browsers.Edge.weekly, 1)
    const day = JSON.parse(await fs.readFile(path.join(root, 'usage-history', '2026-09-26.json'), 'utf8'))
    assert.equal(day.questions.Chrome.count, 2)
    assert.equal(day.questions.Edge.count, 1)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('额度只累加相邻小时同周期的正差值，跳过换号、重置和缺口', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whale-quota-history-'))
  const start = Math.floor(new Date(2026, 8, 26, 12).getTime() / HOUR) * HOUR
  const snapshot = (time, five, week, reset = start + 4 * HOUR) => ({
    updatedAt: time,
    windows: {
      fiveHour: { usedPercent: five, resetAt: reset },
      weekly: { usedPercent: week, resetAt: start + WEEK },
    },
  })
  try {
    const history = new UsageHistory(root)
    assert.equal(history.sampleQuota(snapshot(start, 10, 20), start + 1000), true)
    assert.equal(history.sampleQuota(snapshot(start + HOUR, 14, 22), start + HOUR + 1000), true)
    assert.equal(history.sampleQuota(snapshot(start + 2 * HOUR, 3, 2), start + 2 * HOUR + 1000), true)
    assert.equal(history.sampleQuota(snapshot(start + 3 * HOUR, 6, 5, start + 8 * HOUR), start + 3 * HOUR + 1000), true)
    assert.equal(history.sampleQuota(snapshot(start + 5 * HOUR, 9, 9, start + 8 * HOUR), start + 5 * HOUR + 1000), true)
    const day = JSON.parse(await fs.readFile(path.join(root, 'usage-history', '2026-09-26.json'), 'utf8'))
    assert.equal(day.codexUsage.fiveHour.usedPercent, 4)
    assert.equal(day.codexUsage.weekly.usedPercent, 5)
    assert.equal(day.codexUsage.fiveHour.intervals, 1)
    assert.equal(day.codexUsage.weekly.intervals, 2)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('网页不能提交计数，扩展提交后可读取持久统计', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whale-usage-api-'))
  const configPath = path.join(root, 'config.json')
  await fs.writeFile(configPath, JSON.stringify({ CODEX_REMOTE_SSH_HOSTS: [] }))
  let server
  try {
    server = await startServer({ configPath, dataDir: path.join(root, 'data'), port: 8894 })
    const base = 'http://127.0.0.1:' + server.port
    const body = JSON.stringify({ id: randomUUID(), browser: 'Edge', model: '6 Pro' })
    const forbidden = await fetch(base + '/whale/usage/question', {
      method: 'POST', headers: { Origin: 'https://chatgpt.com', 'Content-Type': 'application/json', 'X-Whale-Bridge': '1' }, body,
    })
    assert.equal(forbidden.status, 403)
    const accepted = await fetch(base + '/whale/usage/question', {
      method: 'POST', headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'Content-Type': 'application/json', 'X-Whale-Bridge': '1' }, body,
    })
    assert.equal(accepted.status, 200)
    const summary = await (await fetch(base + '/whale/usage')).json()
    assert.equal(summary.browsers.Edge.today, 1)
    assert.equal(summary.browsers.Chrome.today, 0)
  } finally {
    server?.shutdown()
    await fs.rm(root, { recursive: true, force: true })
  }
})
