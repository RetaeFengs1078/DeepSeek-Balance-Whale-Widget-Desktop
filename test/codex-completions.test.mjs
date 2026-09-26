import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CodexCompletionReader, completionFromLine, sourceLabel } from '../src/codex-completions.mjs'

function record(type, payload, timestamp = '2026-09-26T08:00:00.000Z') {
  return JSON.stringify({ timestamp, type, payload }) + '\n'
}

test('按 originator 区分本机客户端、VS Code 与远端', () => {
  assert.equal(sourceLabel({ originator: 'codex_work_desktop', source: 'vscode' }), 'Codex 客户端')
  assert.equal(sourceLabel({ originator: 'codex_vscode', source: 'vscode' }), 'VS Code Codex')
  assert.equal(sourceLabel({ originator: 'codex_vscode' }, 'gpu-5'), 'VS Code Remote SSH · gpu-5')
})

test('只识别用户会话的完成事件', () => {
  const line = record('event_msg', { type: 'task_complete', turn_id: 'turn-1' })
  assert.equal(completionFromLine(line, { id: 'session-1', thread_source: 'user' }, '演示')?.conversation, '演示')
  assert.equal(completionFromLine(line, { id: 'session-1', thread_source: 'subagent' }), null)
  assert.equal(completionFromLine(line, { id: 'session-1', source: { subagent: {} } }), null)
})

test('启动时忽略历史，追加完成事件后仅提示一次', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'whale-completions-'))
  try {
    const dir = path.join(home, 'sessions', '2026', '09', '26')
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, 'rollout-test.jsonl')
    const meta = { id: 'session-1', originator: 'codex_vscode', source: 'vscode', thread_source: 'user' }
    await fs.writeFile(file, record('session_meta', meta) + record('event_msg', { type: 'task_complete', turn_id: 'old' }))
    const reader = new CodexCompletionReader({ home })
    assert.deepEqual(await reader.refresh(), [])
    await fs.appendFile(file, record('event_msg', { type: 'user_message', message: '修复鲸鱼提醒' }) + record('event_msg', { type: 'task_complete', turn_id: 'new' }))
    const first = await reader.refresh()
    assert.equal(first.length, 1)
    assert.equal(first[0].id, 'session-1:new')
    assert.equal(first[0].source, 'VS Code Codex')
    assert.equal(first[0].conversation, '修复鲸鱼提醒')
    assert.deepEqual(await reader.refresh(), first)
  } finally { await fs.rm(home, { recursive: true, force: true }) }
})
