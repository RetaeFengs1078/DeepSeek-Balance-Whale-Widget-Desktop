import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CodexReader, codexHome, normalizeRateLimits } from '../src/codex-reader.mjs'

function line(timestamp, rateLimits) {
  return JSON.stringify({ timestamp, type: 'event_msg', payload: { type: 'token_count', rate_limits: rateLimits } })
}

test('按 window_minutes 而非 primary/secondary 识别窗口', () => {
  const windows = normalizeRateLimits({
    primary: { used_percent: 9, window_minutes: 10080, resets_at: 1800000000 },
    secondary: { used_percent: 34.5, window_minutes: 300, resets_at: 1800000100 },
  })
  assert.equal(windows.weekly.remainingPercent, 91)
  assert.equal(windows.fiveHour.usedPercent, 34.5)
  assert.equal(windows.weekly.resetAt, 1800000000000)
  assert.deepEqual(Object.keys(normalizeRateLimits({ primary: { used_percent: 9, window_minutes: 10080 }, secondary: null })), ['weekly'])
})

test('读取所有 rollout 文件中的最新有效快照，忽略无效行并刷新新增内容', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-codex-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const dir = path.join(home, 'sessions', '2026', '09', '26')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'rollout-old.jsonl'), line('2026-09-26T01:00:00Z', {
    primary: { used_percent: 30, window_minutes: 300 }, secondary: null,
  }))
  const newer = path.join(dir, 'rollout-new.jsonl')
  fs.writeFileSync(newer, ['bad json', line('2026-09-26T02:00:00Z', {
    primary: { used_percent: 9, window_minutes: 10080 }, secondary: null,
  }), line('2026-09-26T03:00:00Z', null)].join('\n'))
  const reader = new CodexReader({ home })
  let result = await reader.refresh()
  assert.equal(result.sessions, 2)
  assert.equal(result.windows.weekly.usedPercent, 9)
  assert.equal(result.windows.fiveHour, undefined)
  fs.appendFileSync(newer, '\n' + line('2026-09-26T04:00:00Z', {
    primary: { used_percent: 40, window_minutes: 300 }, secondary: { used_percent: 10, window_minutes: 10080 },
  }))
  result = await reader.refresh()
  assert.equal(result.windows.fiveHour.usedPercent, 40)
  assert.equal(result.windows.weekly.usedPercent, 10)
})

test('CODEX_HOME 优先于默认用户目录', () => {
  assert.equal(codexHome({ CODEX_HOME: 'D:\\custom-codex', USERPROFILE: 'C:\\Someone' }), path.resolve('D:\\custom-codex'))
})
