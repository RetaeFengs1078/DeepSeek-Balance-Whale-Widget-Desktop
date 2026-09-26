// 使用现有 SSH 配置只读查看远端 Codex 会话。登录失败时退避，不弹密码窗口。
import { spawn } from 'node:child_process'
import { sourceLabel, cleanTitle } from './codex-completions.mjs'

export const REMOTE_SCRIPT = String.raw`
import json, os, pathlib, sqlite3, sys, time
since = int(sys.argv[1])
home = pathlib.Path(os.environ.get('CODEX_HOME') or (pathlib.Path.home() / '.codex'))
db = None
try:
    db = sqlite3.connect('file:' + str(home / 'state_5.sqlite') + '?mode=ro', uri=True)
except Exception:
    pass
events = []
root = home / 'sessions'
if root.exists():
    for base, dirs, files in os.walk(root):
        for name in files:
            if not (name.startswith('rollout-') and name.endswith('.jsonl')):
                continue
            file = pathlib.Path(base) / name
            try:
                if file.stat().st_mtime * 1000 < since - 120000:
                    continue
                with file.open('rb') as stream:
                    first = json.loads(stream.readline())
                    meta = first.get('payload', {}) if first.get('type') == 'session_meta' else {}
                    if meta.get('thread_source') not in (None, 'user') or isinstance(meta.get('source'), dict):
                        continue
                    title = ''
                    if db and meta.get('id'):
                        try:
                            row = db.execute('SELECT title FROM threads WHERE id = ?', (meta['id'],)).fetchone()
                            title = row[0] if row else ''
                        except Exception:
                            pass
                    if not title:
                        start = stream.tell()
                        while stream.tell() - start < 2097152:
                            candidate = stream.readline()
                            if not candidate:
                                break
                            if b'user_message' not in candidate:
                                continue
                            try:
                                item = json.loads(candidate)
                                if item.get('payload', {}).get('type') == 'user_message':
                                    title = item['payload'].get('message') or ''
                                    break
                            except Exception:
                                pass
                    size = stream.seek(0, 2)
                    stream.seek(max(0, size - 1048576))
                    if size > 1048576:
                        stream.readline()
                    for line in stream:
                        if b'task_complete' not in line:
                            continue
                        try:
                            record = json.loads(line)
                            payload = record.get('payload', {})
                            if record.get('type') != 'event_msg' or payload.get('type') != 'task_complete':
                                continue
                            from datetime import datetime
                            stamp = payload.get('completed_at') or record.get('timestamp')
                            if isinstance(stamp, (int, float)) or (isinstance(stamp, str) and stamp.isnumeric()):
                                stamp = float(stamp)
                                moment = int(stamp if stamp >= 1e12 else stamp * 1000)
                            else:
                                moment = int(datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp() * 1000)
                            if moment >= since:
                                events.append({'id': str(meta.get('id', '')) + ':' + str(payload.get('turn_id') or moment), 'time': moment, 'originator': meta.get('originator'), 'conversation': title})
                        except Exception:
                            pass
            except Exception:
                pass
print(json.dumps(events[-30:], ensure_ascii=False))
`

function execute(host, since) {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=yes', host, 'python3', '-', String(since)], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    let error = ''
    let settled = false
    function finish(err, value) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(value)
    }
    const timer = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => {})
      } else child.kill()
      finish(new Error('SSH 连接超时'))
    }, 15000)
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk.slice(0, 200000) })
    child.stderr.setEncoding('utf8').on('data', (chunk) => { error += chunk.slice(0, 1000) })
    child.on('error', (err) => finish(err))
    child.on('close', (code) => {
      if (code !== 0) finish(new Error(error.trim() || `SSH 退出码 ${code}`))
      else { try { finish(null, JSON.parse(output)) } catch { finish(new Error('远端结果格式错误')) } }
    })
    child.stdin.on('error', () => {}) // SSH 提前断开时写入脚本可能收到 EPIPE。
    child.stdin.end(REMOTE_SCRIPT)
  })
}

export class RemoteCompletionReader {
  constructor(hosts = [], options = {}) {
    this.hosts = hosts.filter((host) => /^[a-zA-Z0-9_.-]+$/.test(host))
    this.now = options.now || Date.now
    this.state = new Map(this.hosts.map((host) => [host, { since: this.now(), retryAt: 0, status: '待连接' }]))
    this.events = []
    this.seen = new Set()
    this.pending = null
  }

  async refresh() {
    if (this.pending) return this.pending
    this.pending = this.scan().finally(() => { this.pending = null })
    return this.pending
  }

  async scan() {
    for (const host of this.hosts) {
      const state = this.state.get(host)
      if (this.now() < state.retryAt) continue
      try {
        const startedAt = this.now()
        const received = await execute(host, Math.max(state.since - 1000, this.now() - 300000))
        for (const item of received) {
          if (!item?.id || !Number.isFinite(item.time)) continue
          const id = `${host}:${item.id}`
          if (this.seen.has(id)) continue
          this.seen.add(id)
          this.events.push({ id, time: item.time, source: sourceLabel({ originator: item.originator }, host), conversation: cleanTitle(item.conversation) || '未命名对话' })
        }
        state.since = startedAt
        state.retryAt = this.now() + 20000
        state.status = '已连接'
      } catch (error) {
        state.retryAt = this.now() + 120000
        state.status = /Permission denied|publickey|password/i.test(error.message) ? 'SSH 登录未授权' : '连接失败'
      }
    }
    this.events.sort((a, b) => a.time - b.time)
    if (this.events.length > 30) this.events.splice(0, this.events.length - 30)
    if (this.seen.size > 2000) this.seen = new Set(this.events.map((item) => item.id))
    return { events: this.events.slice(), hosts: Object.fromEntries([...this.state].map(([host, state]) => [host, state.status])) }
  }
}
