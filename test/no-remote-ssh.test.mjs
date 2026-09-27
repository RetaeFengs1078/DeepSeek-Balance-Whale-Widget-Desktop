import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('桌面程序不再包含远端 SSH 读取和连接入口', () => {
  assert.equal(fs.existsSync(new URL('../src/remote-completions.mjs', import.meta.url)), false)
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  const completions = fs.readFileSync(new URL('../src/codex-completions.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(server, /RemoteCompletionReader|CODEX_REMOTE_SSH_HOSTS|remoteReader|spawn\s*\(\s*['"]ssh/)
  assert.doesNotMatch(completions, /remoteHost|Remote SSH/)
})
