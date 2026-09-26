// 本机浏览器扩展反向通道。只把“激活既有标签页”的事件 ID 送回原扩展实例。
import { createHash } from 'node:crypto'
import { isExtensionOrigin } from './browser-completions.mjs'

const CLIENT_ID = /^[a-f0-9-]{36}$/i
const MAX_PENDING_MS = 60000

function sendText(socket, value) {
  const body = Buffer.from(JSON.stringify(value))
  const short = body.length < 126
  const frame = Buffer.alloc((short ? 2 : 4) + body.length)
  frame[0] = 0x81
  frame[1] = short ? body.length : 126
  if (!short) frame.writeUInt16BE(body.length, 2)
  body.copy(frame, short ? 2 : 4)
  socket.write(frame)
}

export class BrowserActionBridge {
  constructor() {
    this.clients = new Map()
    this.pending = new Map()
  }

  attach(server) {
    server.on('upgrade', (request, socket) => this.upgrade(request, socket))
  }

  upgrade(request, socket) {
    let url
    try { url = new URL(request.url, 'http://127.0.0.1') } catch { socket.destroy(); return }
    const origin = String(request.headers.origin || '')
    const clientId = url.searchParams.get('clientId') || ''
    const key = String(request.headers['sec-websocket-key'] || '')
    if (url.pathname !== '/whale/browser-actions' || !isExtensionOrigin(origin) ||
        !CLIENT_ID.test(clientId) || !/^[A-Za-z0-9+/]{22}==$/.test(key) ||
        String(request.headers.upgrade || '').toLowerCase() !== 'websocket') {
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n')
    const identity = origin + ':' + clientId
    const previous = this.clients.get(identity)
    if (previous) previous.destroy()
    this.clients.set(identity, socket)
    socket.on('data', (chunk) => { if (chunk.length > 4096) socket.destroy() })
    socket.on('error', () => {})
    socket.on('close', () => { if (this.clients.get(identity) === socket) this.clients.delete(identity) })
    const queued = this.pending.get(identity) || []
    this.pending.delete(identity)
    for (const item of queued) if (Date.now() - item.time < MAX_PENDING_MS) sendText(socket, { type: 'open', id: item.id })
  }

  open(origin, clientId, id) {
    if (!isExtensionOrigin(origin) || !CLIENT_ID.test(clientId)) return false
    const identity = origin + ':' + clientId
    const socket = this.clients.get(identity)
    if (socket && !socket.destroyed && socket.writable) {
      sendText(socket, { type: 'open', id })
      return true
    }
    const queued = (this.pending.get(identity) || []).filter((item) => Date.now() - item.time < MAX_PENDING_MS)
    queued.push({ id, time: Date.now() })
    this.pending.set(identity, queued.slice(-10))
    return true
  }

  close() {
    for (const socket of this.clients.values()) socket.destroy()
    this.clients.clear()
    this.pending.clear()
  }
}
