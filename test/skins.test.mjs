import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { startServer } from '../server.mjs'

const smallPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')

test('私人照片皮肤只从本地数据目录读取，原版始终可选', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whale-skin-test-'))
  const dataDir = path.join(root, 'data')
  const configPath = path.join(root, 'config.json')
  await fs.writeFile(configPath, '{}')
  let server
  try {
    server = await startServer({ configPath, dataDir, port: 8897 })
    const base = 'http://127.0.0.1:' + server.port
    let skins = await (await fetch(base + '/whale/skins')).json()
    assert.deepEqual(skins.items.map(item => item.id), ['default'])
    await fs.writeFile(path.join(dataDir, 'skins', 'portrait.png'), smallPng)
    skins = await (await fetch(base + '/whale/skins')).json()
    assert.deepEqual(skins.items.map(item => item.id), ['default', 'portrait'])
    const portrait = await fetch(base + '/whale/skin/portrait.png')
    assert.equal(portrait.status, 200)
    assert.equal(portrait.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await portrait.arrayBuffer()), smallPng)
    assert.equal((await fetch(base + '/whale/skin/../../config.json')).status, 404)
  } finally {
    server?.shutdown()
    await fs.rm(root, { recursive: true, force: true })
  }
})
