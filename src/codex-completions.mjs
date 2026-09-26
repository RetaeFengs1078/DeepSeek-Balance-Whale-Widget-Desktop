// Codex 会话完成事件读取器。只读 rollout 日志，独立于 DSH 和 API Key。
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { codexHome } from './codex-reader.mjs'

const MAX_LINE_BYTES = 4 * 1024 * 1024
const MAX_EVENTS = 30

export function sourceLabel(meta, remoteHost = '') {
  if (remoteHost) return meta?.originator === 'codex_vscode'
    ? `VS Code Remote SSH · ${remoteHost}` : `远端 Codex · ${remoteHost}`
  if (meta?.originator === 'codex_work_desktop') return 'Codex 客户端'
  if (meta?.originator === 'codex_vscode') return 'VS Code Codex'
  if (meta?.source === 'cli' || meta?.originator === 'codex-tui') return 'Codex 命令行'
  return '本机 Codex'
}

export function completionFromLine(line, meta, title = '') {
  if (!line.includes('task_complete')) return null
  let record
  try { record = JSON.parse(line) } catch { return null }
  if (record?.type !== 'event_msg' || record.payload?.type !== 'task_complete') return null
  if (meta?.thread_source && meta.thread_source !== 'user') return null
  if (meta?.source && typeof meta.source === 'object') return null
  const time = completionTime(record.payload.completed_at) ?? completionTime(record.timestamp)
  if (!Number.isFinite(time)) return null
  const conversation = cleanTitle(title) || '未命名对话'
  return {
    id: `${meta?.id || meta?.session_id || ''}:${record.payload.turn_id || time}`,
    time, source: sourceLabel(meta), conversation,
  }
}

export function completionTime(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw < 1e12 ? raw * 1000 : raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (/^\d+(?:\.\d+)?$/.test(text)) return completionTime(Number(text))
    const parsed = Date.parse(text)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function cleanTitle(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

async function sessionFiles(root) {
  const found = []
  async function walk(dir) {
    let entries
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(file)
      else if (entry.isFile() && /^rollout-.*\.jsonl$/i.test(entry.name)) found.push(file)
    }
  }
  await walk(path.join(root, 'sessions'))
  return found
}

async function readMeta(file) {
  let handle
  try {
    handle = await fs.promises.open(file, 'r')
    const buffer = Buffer.alloc(MAX_LINE_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const end = buffer.subarray(0, bytesRead).indexOf(10)
    if (end < 0) return { meta: null, prompt: '' }
    const record = JSON.parse(buffer.subarray(0, end).toString('utf8'))
    let prompt = ''
    for (const line of buffer.subarray(end + 1, bytesRead).toString('utf8').split('\n')) {
      if (!line.includes('user_message')) continue
      try { const item = JSON.parse(line); if (item.payload?.type === 'user_message') { prompt = cleanTitle(item.payload.message); break } }
      catch {}
    }
    return { meta: record?.type === 'session_meta' ? record.payload : null, prompt }
  } catch { return { meta: null, prompt: '' } }
  finally { await handle?.close().catch(() => {}) }
}

async function readNewBytes(file, offset, size) {
  const length = Math.min(size - offset, MAX_LINE_BYTES)
  if (length <= 0) return { text: '', end: offset }
  const handle = await fs.promises.open(file, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, offset)
    return { text: buffer.subarray(0, bytesRead).toString('utf8'), end: offset + bytesRead }
  } finally { await handle.close() }
}

export class CodexCompletionReader {
  constructor(options = {}) {
    this.home = options.home || codexHome()
    this.files = new Map()
    this.events = []
    this.seen = new Set()
    this.initialized = false
    this.db = null
    this.dbTried = false
    this.pending = null
  }

  title(id) {
    if (!id) return ''
    if (!this.dbTried) {
      this.dbTried = true
      try { this.db = new DatabaseSync(path.join(this.home, 'state_5.sqlite'), { readOnly: true }) }
      catch { this.db = null }
    }
    try { return cleanTitle(this.db?.prepare('SELECT title FROM threads WHERE id = ?').get(id)?.title) }
    catch { return '' }
  }

  async refresh() {
    if (this.pending) return this.pending
    this.pending = this.scan().finally(() => { this.pending = null })
    return this.pending
  }

  async scan() {
    const paths = await sessionFiles(this.home)
    const active = new Set(paths)
    for (const file of paths) {
      let stat
      try { stat = await fs.promises.stat(file) } catch { continue }
      let state = this.files.get(file)
      if (!state) {
        const initial = await readMeta(file)
        state = { offset: this.initialized ? 0 : stat.size, remainder: '', meta: initial.meta, firstPrompt: initial.prompt }
        this.files.set(file, state)
      }
      if (stat.size < state.offset) { state.offset = 0; state.remainder = '' }
      if (stat.size === state.offset) continue
      try {
        const { text, end } = await readNewBytes(file, state.offset, stat.size)
        state.offset = end
        const lines = (state.remainder + text).split('\n')
        state.remainder = lines.pop().slice(-MAX_LINE_BYTES)
        for (const line of lines) {
          if (!state.meta && line.includes('session_meta')) {
            try { const record = JSON.parse(line); if (record.type === 'session_meta') state.meta = record.payload }
            catch {}
          }
          if (!state.firstPrompt && line.includes('user_message')) {
            try { const record = JSON.parse(line); if (record.payload?.type === 'user_message') state.firstPrompt = cleanTitle(record.payload.message) }
            catch {}
          }
          const event = completionFromLine(line, state.meta, this.title(state.meta?.id) || state.firstPrompt)
          if (event && !this.seen.has(event.id)) {
            this.seen.add(event.id)
            this.events.push(event)
          }
        }
      } catch { /* 写入中的文件下次重试。 */ }
    }
    for (const file of this.files.keys()) if (!active.has(file)) this.files.delete(file)
    this.events.sort((a, b) => a.time - b.time)
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS)
    if (this.seen.size > 2000) this.seen = new Set(this.events.map((item) => item.id))
    this.initialized = true
    return this.events.slice()
  }
}
