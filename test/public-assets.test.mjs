import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('Git 跟踪的图像仅包含原有小鲸鱼素材', (t) => {
  let tracked
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  } catch {
    t.skip('源码包不含 Git 元数据')
    return
  }
  const allowed = new Set([
    'vendor/dsh-whale-widget/assets/DSH2.png',
    'vendor/dsh-whale-widget/assets/DSniang02.png',
    'vendor/dsh-whale-widget/assets/DSniang1.png',
    'vendor/dsh-whale-widget/assets/rua.gif',
  ])
  const images = tracked.filter((name) => /\.(?:png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(name))
  assert.deepEqual(images.sort(), [...allowed].sort())
})
