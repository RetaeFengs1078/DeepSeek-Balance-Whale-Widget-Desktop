// 本机每日统计。只保存次数和额度百分比，不保存提问或回复正文。
import fs from 'node:fs'
import path from 'node:path'

const HOUR = 3600000
const WEEK = 7 * 86400000
const BROWSERS = ['Chrome', 'Edge']
const WINDOWS = ['fiveHour', 'weekly']

function localDay(time) {
  const date = new Date(time)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function writeJson(file, value) {
  const temporary = file + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8')
  fs.renameSync(temporary, file)
}

function emptyDay(date) {
  return {
    version: 1, date,
    questions: { Chrome: { count: 0, ids: [] }, Edge: { count: 0, ids: [] } },
    codexUsage: { fiveHour: { usedPercent: 0, intervals: 0 }, weekly: { usedPercent: 0, intervals: 0 } },
  }
}

function emptyBrowser() { return { nextResetAt: null, resetSource: null, weeklyCount: 0, weekStartedAt: null } }

export class UsageHistory {
  constructor(dataDir, now = () => Date.now()) {
    this.now = now
    this.dir = path.join(dataDir, 'usage-history')
    this.stateFile = path.join(this.dir, 'state.json')
    fs.mkdirSync(this.dir, { recursive: true })
    const stored = readJson(this.stateFile)
    this.state = stored && stored.version === 1 ? stored : {
      version: 1, browsers: { Chrome: emptyBrowser(), Edge: emptyBrowser() }, lastQuotaSample: null,
    }
    for (const browser of BROWSERS) this.state.browsers[browser] ||= emptyBrowser()
    this.days = new Map()
  }

  day(time) {
    const key = localDay(time)
    if (!this.days.has(key)) {
      const data = readJson(path.join(this.dir, key + '.json'))
      this.days.set(key, data && data.version === 1 && data.date === key ? data : emptyDay(key))
    }
    return this.days.get(key)
  }

  saveDay(day) { writeJson(path.join(this.dir, day.date + '.json'), day) }
  saveState() { writeJson(this.stateFile, this.state) }

  advanceReset(browser, time) {
    const info = this.state.browsers[browser]
    if (!Number.isFinite(info.nextResetAt) || time < info.nextResetAt) return false
    const count = Math.floor((time - info.nextResetAt) / WEEK) + 1
    info.weekStartedAt = info.nextResetAt + (count - 1) * WEEK
    info.nextResetAt += count * WEEK
    info.weeklyCount = 0
    return true
  }

  recordQuestion({ id, browser, model }, time = this.now()) {
    if (!BROWSERS.includes(browser) || model !== '6 Pro' || !/^[a-f0-9-]{36}$/i.test(id || '')) return false
    const day = this.day(time)
    const entry = day.questions[browser]
    if (entry.ids.includes(id)) return true // 重试不重复计数。
    const info = this.state.browsers[browser]
    this.advanceReset(browser, time)
    entry.ids.push(id)
    entry.count += 1
    info.weeklyCount += 1
    this.saveDay(day)
    this.saveState()
    return true
  }

  setReset(browser, resetAt, source = 'manual', time = this.now()) {
    if (!BROWSERS.includes(browser) || !['manual', 'page'].includes(source)) return false
    const info = this.state.browsers[browser]
    if (source === 'page' && info.resetSource === 'manual') return false
    if (resetAt !== null && (!Number.isFinite(resetAt) || resetAt < time - WEEK || resetAt > time + 30 * 86400000)) return false
    info.nextResetAt = resetAt
    info.resetSource = resetAt === null ? null : source
    if (resetAt !== null) this.advanceReset(browser, time)
    this.saveState()
    return true
  }

  sampleQuota(snapshot, time = this.now()) {
    const hour = Math.floor(time / HOUR)
    const updatedAt = Number(snapshot?.updatedAt)
    if (!Number.isFinite(updatedAt) || updatedAt <= 0 || time - updatedAt > 2 * HOUR || updatedAt > time + 60000) return false
    const windows = {}
    for (const kind of WINDOWS) {
      const item = snapshot.windows?.[kind]
      if (item && Number.isFinite(item.usedPercent) && item.usedPercent >= 0 && item.usedPercent <= 100) {
        windows[kind] = { usedPercent: item.usedPercent, resetAt: Number.isFinite(item.resetAt) ? item.resetAt : null }
      }
    }
    if (!Object.keys(windows).length) return false
    const previous = this.state.lastQuotaSample
    if (previous && previous.hour === hour) return false
    if (previous && previous.updatedAt === updatedAt) return false
    if (previous && previous.hour === hour - 1) {
      const day = this.day(time)
      let changed = false
      for (const kind of WINDOWS) {
        const before = previous.windows?.[kind]
        const after = windows[kind]
        // 只计相邻小时、同一重置周期中已用百分比的正向变化。
        // 换号、窗口重置或余额增加时，不把差值当消耗。
        if (!before || !after || before.resetAt !== after.resetAt) continue
        const delta = after.usedPercent - before.usedPercent
        if (delta <= 0 || delta > 100) continue
        day.codexUsage[kind].usedPercent = Math.round((day.codexUsage[kind].usedPercent + delta) * 100) / 100
        day.codexUsage[kind].intervals += 1
        changed = true
      }
      if (changed) this.saveDay(day)
    }
    this.state.lastQuotaSample = { hour, updatedAt, windows }
    this.saveState()
    return true
  }

  summary(time = this.now()) {
    let reset = false
    for (const browser of BROWSERS) reset = this.advanceReset(browser, time) || reset
    if (reset) this.saveState()
    const day = this.day(time)
    return {
      ok: true, date: day.date,
      browsers: Object.fromEntries(BROWSERS.map((browser) => [browser, {
        today: day.questions[browser].count,
        weekly: this.state.browsers[browser].weeklyCount,
        nextResetAt: this.state.browsers[browser].nextResetAt,
        resetSource: this.state.browsers[browser].resetSource,
      }])),
      codexUsage: day.codexUsage,
      dataDir: this.dir,
      lastQuotaSampleHour: this.state.lastQuotaSample?.hour ?? null,
    }
  }
}
