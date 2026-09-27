import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { newTopic, messageForCompletion, publishPhonePush } = require('../src/phone-push.js')

test('iPhone 主题随机且不能把消息送到任意网址', async () => {
  const topic = newTopic()
  assert.match(topic, /^whale-[a-f0-9]{40}$/)
  assert.notEqual(topic, newTopic())
  let posted
  await publishPhonePush(topic, '测试', async (url, options) => {
    posted = { url, options }
    return { ok: true }
  })
  assert.equal(posted.url, 'https://ntfy.sh/' + topic)
  assert.equal(posted.options.method, 'POST')
  assert.equal(posted.options.body, '测试')
  await assert.rejects(publishPhonePush('../other', '测试', async () => { throw Error('不应请求') }))
})

test('完成提醒根据设置决定是否包含对话标题', () => {
  const event = { source: 'Edge · ChatGPT 网页', conversation: '第一行\n第二行' }
  assert.equal(messageForCompletion(event, true), 'Edge · ChatGPT 网页 已完成：第一行 第二行')
  assert.equal(messageForCompletion(event, false), 'Edge · ChatGPT 网页 已完成')
})
