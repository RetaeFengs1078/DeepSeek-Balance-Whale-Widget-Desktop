// 本地 Codex 配额读取器。只读会话日志，不依赖 DSH、网络或 API Key。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import readline from 'node:readline'

const WINDOWS = new Map([[300, 'fiveHour'], [10080, 'weekly']])

export function codexHome(env = process.env, home = os.homedir()) {
  const configured = String(env.CODEX_HOME || '').trim()
  return path.resolve(configured || path.join(env.USERPROFILE || home, '.codex'))
}

function numberFrom(object, keys) {
  for (const key of keys) {
    if (object[key] === null || object[key] === undefined || object[key] === '') continue
    const value = Number(object[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

export function normalizeWindow(raw) {
  if (!raw || typeof raw !== 'object') return null
  const minutes = numberFrom(raw, ['window_minutes', 'windowMinutes', 'period_minutes'])
  const kind = WINDOWS.get(minutes)
  if (!kind) return null
  let used = numberFrom(raw, ['used_percent', 'usedPercent', 'used_pct', 'usage_percent'])
  const remaining = numberFrom(raw, ['remaining_percent', 'remainingPercent', 'remaining_pct'])
  if (used === null && remaining !== null) used = 100 - remaining
  if (used === null || used < 0 || used > 100) return null
  const reset = raw.resets_at ?? raw.reset_at ?? raw.resetAt ?? raw.reset_time
  let resetAt = null
  if (typeof reset === 'number' && Number.isFinite(reset)) resetAt = reset < 1e12 ? reset * 1000 : reset
  else if (typeof reset === 'string' && reset) {
    const numeric = Number(reset)
    if (Number.isFinite(numeric)) resetAt = numeric < 1e12 ? numeric * 1000 : numeric
    else { const parsed = Date.parse(reset); if (Number.isFinite(parsed)) resetAt = parsed }
  }
  return { kind, windowMinutes: minutes, usedPercent: used, remainingPercent: 100 - used, resetAt }
}

export function normalizeRateLimits(rateLimits) {
  if (!rateLimits || typeof rateLimits !== 'object') return null
  const windows = {}
  for (const raw of [rateLimits.primary, rateLimits.secondary]) {
    const item = normalizeWindow(raw)
    if (item) windows[item.kind] = item
  }
  return Object.keys(windows).length ? windows : null
}

export function parseSnapshotLine(line) {
  if (!line.startsWith('{') || !line.includes('rate_limits')) return null
  let record
  try { record = JSON.parse(line) } catch { return null }
  const payload = record?.payload
  if (record?.type !== 'event_msg' || payload?.type !== 'token_count') return null
  const windows = normalizeRateLimits(payload.rate_limits ?? payload.info?.rate_limits)
  const timestamp = Date.parse(record.timestamp)
  if (!windows || !Number.isFinite(timestamp)) return null
  return { timestamp, windows }
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
  await walk(path.join(root, 'archived_sessions'))
  return found
}

export class CodexReader {
  constructor(options = {}) {
    this.home = options.home || codexHome()
    this.cache = new Map()
    this.pending = null
  }

  async refresh() {
    if (this.pending) return this.pending
    this.pending = this.scan().finally(() => { this.pending = null })
    return this.pending
  }

  async scan() {
    const files = await sessionFiles(this.home)
    let newest = null
    const active = new Set(files)
    for (const file of files) {
      let stat
      try { stat = await fs.promises.stat(file) } catch { continue }
      let item = this.cache.get(file)
      if (!item || item.size !== stat.size || item.mtimeMs !== stat.mtimeMs) {
        let snapshot = null
        const stream = fs.createReadStream(file, { encoding: 'utf8' })
        try {
          for await (const line of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
            const candidate = parseSnapshotLine(line)
            if (candidate && (!snapshot || candidate.timestamp >= snapshot.timestamp)) snapshot = candidate
          }
        } catch { /* 文件可能正在被 Codex 写入；下次刷新重试。 */ }
        finally { stream.destroy() }
        item = { size: stat.size, mtimeMs: stat.mtimeMs, snapshot }
        this.cache.set(file, item)
      }
      if (item.snapshot && (!newest || item.snapshot.timestamp >= newest.timestamp)) newest = item.snapshot
    }
    for (const file of this.cache.keys()) if (!active.has(file)) this.cache.delete(file)
    return {
      ok: true,
      home: this.home,
      sessions: files.length,
      updatedAt: newest?.timestamp ?? null,
      windows: newest?.windows ?? {},
      message: !files.length ? '尚未找到 Codex 会话日志' : newest ? '' : '会话日志中尚无有效额度快照',
    }
  }
}
