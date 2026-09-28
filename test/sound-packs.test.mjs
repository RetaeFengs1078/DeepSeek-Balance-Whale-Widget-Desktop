import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanSoundPacks, createSoundPicker } from '../src/sound-packs.mjs'
import { startServer } from '../server.mjs'

test('单文件旧音效包和文件夹多段音效包同时可用', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-sounds-'))
  try {
    fs.writeFileSync(path.join(dir, '旧包_press.mp3'), '')
    fs.writeFileSync(path.join(dir, '旧包_release.mp3'), '')
    fs.mkdirSync(path.join(dir, 'oi'))
    fs.writeFileSync(path.join(dir, 'oi', '02.mp3'), '')
    fs.writeFileSync(path.join(dir, 'oi', '01.mp3'), '')
    fs.writeFileSync(path.join(dir, 'oi', '说明.txt'), '')
    const packs = scanSoundPacks(dir)
    const old = packs.find(pack => pack.id === '旧包')
    const oi = packs.find(pack => pack.id === 'dir:oi')
    assert.equal(old.tracks.length, 1)
    assert.equal(old.tracks[0].press, '旧包_press.mp3')
    assert.equal(old.tracks[0].release, '旧包_release.mp3')
    assert.deepEqual(oi.tracks.map(track => track.id), ['01', '02'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('每次点击循环或随机选一段，按下和松手共用同一次选择', () => {
  const pack = { id: 'dir:oi', tracks: [{ id: '01' }, { id: '02' }, { id: '03' }] }
  const cycle = createSoundPicker()
  assert.equal(cycle(pack, 'click-1', 'cycle').id, '01')
  assert.equal(cycle(pack, 'click-1', 'cycle').id, '01')
  assert.equal(cycle(pack, 'click-2', 'cycle').id, '02')
  assert.equal(cycle(pack, 'click-3', 'cycle').id, '03')
  assert.equal(cycle(pack, 'click-4', 'cycle').id, '01')
  const random = createSoundPicker(() => 0.8)
  assert.equal(random(pack, 'click-1', 'random').id, '03')
  assert.equal(random(pack, 'click-1', 'random').id, '03')
})

test('音效接口逐次循环，单段音效每次点击只播放一次', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-sound-http-'))
  const soundsDir = path.join(dir, 'sounds')
  const packDir = path.join(soundsDir, 'oi')
  fs.mkdirSync(packDir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'config.json'), '{}')
  fs.writeFileSync(path.join(packDir, '01_press.mp3'), 'first-press')
  fs.writeFileSync(path.join(packDir, '01_release.mp3'), 'first-release')
  fs.writeFileSync(path.join(packDir, '02.mp3'), 'second')
  let server
  try {
    server = await startServer({ dataDir: path.join(dir, 'data'),
      configPath: path.join(dir, 'config.json'), soundsDir, port: 8898 })
    const base = 'http://127.0.0.1:' + server.port
    const packs = await (await fetch(base + '/dsh-whale/sounds')).json()
    assert.equal(packs.items.find(pack => pack.id === 'dir:oi').tracks.length, 2)
    const get = async (which, event) => fetch(base + '/dsh-whale/sound/' + which + '.mp3?' +
      new URLSearchParams({ set: 'c:dir:oi', event, mode: 'cycle' }))
    assert.equal(await (await get('release', 'one')).text(), 'first-release')
    assert.equal(await (await get('press', 'one')).text(), 'first-press')
    assert.equal(await (await get('press', 'two')).text(), 'second')
    assert.equal((await get('release', 'two')).status, 204)
    assert.equal(await (await get('press', 'three')).text(), 'first-press')
  } finally {
    server?.shutdown()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
