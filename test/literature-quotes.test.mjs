import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

test('名句库每条都是一整句，并附作者与作品', async () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const source = await fs.readFile(path.join(root, 'src', 'literature-quotes.js'), 'utf8')
  const context = { window: {} }
  vm.runInNewContext(source, context)
  const quotes = context.window.whaleLiteratureQuotes
  assert.ok(quotes.length >= 15)
  assert.equal(new Set(quotes.map(item => item.text)).size, quotes.length)
  for (const quote of quotes) {
    assert.ok(quote.author && quote.work, quote.text)
    assert.match(quote.text, /[。！？；.!?;]$/, quote.text)
    assert.doesNotMatch(quote.text.slice(0, -1), /[。！？；.!?;]/, quote.text)
    assert.ok(quote.text.length <= 70, quote.text)
  }
  assert.ok(new Set(quotes.map(item => item.author)).size >= 15)
  assert.doesNotMatch(quotes.map(item => item.text).join('\n'), /轻拢慢捻|天生我材|落霞与孤鹜|但愿人长久|枯藤老树/)
})
