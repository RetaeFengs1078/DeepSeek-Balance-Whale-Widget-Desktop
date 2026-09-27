import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { messageForCompletion, validateEmailConfig, sendSmtpEmail } = require('../src/email-notify.js')

const config = { host: 'smtp.example.com', port: 465, security: 'tls',
  username: 'sender@example.com', recipient: 'reader@example.net', password: 'secret' }

test('完成提醒可附带标题，换行不能注入邮件标题', () => {
  const event = { source: 'Edge · ChatGPT 网页', conversation: '第一行\n第二行' }
  assert.equal(messageForCompletion(event, true), 'Edge · ChatGPT 网页 已完成：第一行 第二行')
  assert.equal(messageForCompletion(event, false), 'Edge · ChatGPT 网页 已完成')
})

test('拒绝缺少授权码、无加密方式及无效地址', () => {
  assert.throws(() => validateEmailConfig({ ...config, password: '' }))
  assert.throws(() => validateEmailConfig({ ...config, security: 'none' }))
  assert.throws(() => validateEmailConfig({ ...config, recipient: 'bad\r\nBcc: x@y.z' }))
})

test('SMTP 会话使用加密连接的认证、发件、收件和 UTF-8 正文', async () => {
  const writes = []
  class FakeSocket extends EventEmitter {
    setTimeout() {}
    destroy() {}
    write(value) {
      writes.push(value)
      const response = writes.length === 1 ? '250-local\r\n250 AUTH PLAIN\r\n' :
        writes.length === 2 ? '235 ok\r\n' : writes.length === 3 || writes.length === 4 ? '250 ok\r\n' :
          writes.length === 5 ? '354 go\r\n' : writes.length === 6 ? '250 queued\r\n' : '221 bye\r\n'
      queueMicrotask(() => this.emit('data', Buffer.from(response)))
    }
  }
  await sendSmtpEmail(config, '测试邮件', '小鲸鱼已完成', async () => {
    const socket = new FakeSocket()
    setTimeout(() => socket.emit('data', Buffer.from('220 ready\r\n')), 0)
    return socket
  })
  assert.equal(writes[0], 'EHLO localhost\r\n')
  assert.match(writes[1], /^AUTH PLAIN /)
  assert.equal(writes[2], 'MAIL FROM:<sender@example.com>\r\n')
  assert.equal(writes[3], 'RCPT TO:<reader@example.net>\r\n')
  assert.match(writes[5], /Content-Transfer-Encoding: base64/)
  assert.ok(writes[5].includes(Buffer.from('小鲸鱼已完成').toString('base64')))
})
