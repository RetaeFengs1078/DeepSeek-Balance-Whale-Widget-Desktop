// SMTP 邮件提醒只在 Electron 主进程发送；账户凭据不进入网页或日志。
const net = require('node:net')
const tls = require('node:tls')

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
function messageForCompletion(event, includeTitle = true) {
  const source = String(event?.source || 'Codex').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80)
  const title = String(event?.conversation || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100)
  return includeTitle && title ? `${source} 已完成：${title}` : `${source} 已完成`
}

function validateEmailConfig(config) {
  const host = String(config.host || '').trim()
  const port = Number(config.port)
  const security = config.security
  const username = String(config.username || '').trim()
  const recipient = String(config.recipient || '').trim()
  if (!/^[a-z\d.-]+$/i.test(host) || host.length > 253) throw new Error('请填写有效的 SMTP 服务器地址')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP 端口无效')
  if (security !== 'tls' && security !== 'starttls') throw new Error('请选择加密连接方式')
  if (!ADDRESS.test(username) || !ADDRESS.test(recipient)) throw new Error('请填写有效的发件和收件邮箱')
  if (!String(config.password || '')) throw new Error('请先保存 SMTP 授权码')
  return { host, port, security, username, recipient, password: String(config.password) }
}

function mimeMessage(from, to, subject, body) {
  const safeSubject = String(subject).replace(/[\r\n]+/g, ' ').slice(0, 120)
  const encodedSubject = '=?UTF-8?B?' + Buffer.from(safeSubject).toString('base64') + '?='
  const encodedBody = Buffer.from(String(body), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || ''
  return [
    `From: <${from}>`, `To: <${to}>`, `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
    '', encodedBody, '',
  ].join('\r\n')
}

class SmtpConnection {
  constructor(socket) {
    this.lines = []
    this.waiter = null
    this.buffer = ''
    this.failed = null
    this.attach(socket)
  }
  attach(socket) {
    this.socket = socket
    socket.setTimeout(15000, () => socket.destroy(new Error('邮件服务器连接超时')))
    socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8')
      while (this.buffer.includes('\n')) {
        const index = this.buffer.indexOf('\n')
        this.lines.push(this.buffer.slice(0, index).replace(/\r$/, ''))
        this.buffer = this.buffer.slice(index + 1)
      }
      this.drain()
    })
    socket.on('error', (error) => { this.failed = error; this.drain() })
    socket.on('close', () => { if (!this.failed) this.failed = new Error('邮件服务器提前断开连接'); this.drain() })
  }
  drain() {
    if (!this.waiter) return
    const { resolve, reject } = this.waiter
    if (this.lines.length) { this.waiter = null; resolve(this.lines.shift()) }
    else if (this.failed) { this.waiter = null; reject(this.failed) }
  }
  line() {
    if (this.lines.length) return Promise.resolve(this.lines.shift())
    if (this.failed) return Promise.reject(this.failed)
    return new Promise((resolve, reject) => { this.waiter = { resolve, reject } })
  }
  async response(expected) {
    const lines = []
    let code
    while (true) {
      const line = await this.line()
      const match = /^(\d{3})([ -])/.exec(line)
      if (!match) throw new Error('邮件服务器响应格式无效')
      if (code && code !== match[1]) throw new Error('邮件服务器响应不一致')
      code = match[1]
      lines.push(line)
      if (lines.length > 100) throw new Error('邮件服务器响应过长')
      if (match[2] === ' ') break
    }
    if (expected && !expected.includes(Number(code))) throw new Error(`邮件服务器拒绝请求（${code}）：${lines.at(-1).slice(4, 180)}`)
    return lines
  }
  async command(command, expected) {
    this.socket.write(command + '\r\n')
    return this.response(expected)
  }
  close() { this.socket.destroy() }
}

async function connectSmtp(config) {
  const options = { host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true }
  if (config.security === 'tls') return new Promise((resolve, reject) => {
    const socket = tls.connect(options, () => resolve(socket))
    socket.once('error', reject)
  })
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: config.host, port: config.port }, () => resolve(socket))
    socket.once('error', reject)
  })
}

async function sendSmtpEmail(rawConfig, subject, body, connector = connectSmtp) {
  const config = validateEmailConfig(rawConfig)
  const socket = await connector(config)
  let client = new SmtpConnection(socket)
  try {
    await client.response([220])
    let capabilities = await client.command('EHLO localhost', [250])
    if (config.security === 'starttls') {
      if (!capabilities.some((line) => /STARTTLS/i.test(line))) throw new Error('邮件服务器不支持 STARTTLS')
      await client.command('STARTTLS', [220])
      socket.removeAllListeners('data')
      socket.removeAllListeners('error')
      socket.removeAllListeners('close')
      const secure = await new Promise((resolve, reject) => {
        const wrapped = tls.connect({ socket, servername: config.host, rejectUnauthorized: true }, () => resolve(wrapped))
        wrapped.once('error', reject)
      })
      client = new SmtpConnection(secure)
      capabilities = await client.command('EHLO localhost', [250])
    }
    const auth = capabilities.join(' ').toUpperCase()
    if (auth.includes('PLAIN')) {
      await client.command('AUTH PLAIN ' + Buffer.from(`\0${config.username}\0${config.password}`).toString('base64'), [235])
    } else if (auth.includes('LOGIN')) {
      await client.command('AUTH LOGIN', [334])
      await client.command(Buffer.from(config.username).toString('base64'), [334])
      await client.command(Buffer.from(config.password).toString('base64'), [235])
    } else throw new Error('邮件服务器不支持授权码登录；请选择支持 SMTP 授权码的邮箱')
    await client.command(`MAIL FROM:<${config.username}>`, [250])
    await client.command(`RCPT TO:<${config.recipient}>`, [250, 251])
    await client.command('DATA', [354])
    const data = mimeMessage(config.username, config.recipient, subject, body)
    await client.command(data.replace(/^\./gm, '..') + '\r\n.', [250])
    await client.command('QUIT', [221])
    return true
  } finally { client.close() }
}

module.exports = { messageForCompletion, validateEmailConfig, mimeMessage, sendSmtpEmail }
