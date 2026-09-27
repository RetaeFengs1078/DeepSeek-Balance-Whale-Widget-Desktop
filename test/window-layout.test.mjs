import test from 'node:test'
import assert from 'node:assert/strict'
import layoutModule from '../src/window-layout.js'

const { compactBounds, needsBoundsUpdate } = layoutModule
const desktop = { x: 0, y: 0, width: 1920, height: 1080 }

test('闲置时系统窗口只占鲸鱼附近，屏幕中央浏览器不被覆盖', () => {
  const current = { x: 1500, y: 680, width: 420, height: 400 }
  const target = compactBounds([{ x: 270, y: 250, w: 142, h: 142 }], current, desktop)
  assert.deepEqual(target, { x: 1600, y: 760, width: 320, height: 320 })
  assert.ok(target.x > 1500 && target.y > 700)
})

test('菜单打开时窗口扩展到鲸鱼与菜单的并集', () => {
  const current = { x: 1600, y: 760, width: 320, height: 320 }
  const target = compactBounds([
    { x: 170, y: 170, w: 142, h: 142 },
    { x: 60, y: -160, w: 220, h: 330 },
  ], current, desktop)
  assert.ok(target.y < current.y)
  assert.ok(target.height > current.height)
  assert.ok(target.x <= 1660 && target.x + target.width >= 1912)
})

test('Windows DPI 的 1 像素回报偏差不会反复触发窗口重设', () => {
  assert.equal(needsBoundsUpdate(
    { x: 0, y: 0, width: 359, height: 320 },
    { x: 0, y: 0, width: 358, height: 320 }), false)
  assert.equal(needsBoundsUpdate(
    { x: 0, y: 0, width: 320, height: 320 },
    { x: 0, y: 0, width: 358, height: 320 }), true)
})
