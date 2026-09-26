import test from 'node:test'
import assert from 'node:assert/strict'
import shapeModule from '../src/window-shape.js'

const { windowShape } = shapeModule

test('只保留鲸鱼和菜单区域，屏幕其他部分不参与绘制', () => {
  const shape = windowShape([
    { x: 1650, y: 770, w: 270, h: 270 },
    { x: 1530, y: 650, w: 200, h: 250 },
  ], 1920, 1080)
  assert.equal(shape.length, 2)
  assert.ok(shape.every((rect) => rect.width < 400 && rect.height < 400))
  assert.ok(shape.every((rect) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 1920 && rect.y + rect.height <= 1080))
})

test('按下和拖拽期间不生成全屏命中区', () => {
  const regions = [{ x: 100, y: 100, w: 240, h: 240 }]
  assert.deepEqual(windowShape(regions, 1920, 1080), [{ x: 84, y: 84, width: 272, height: 272 }])
})

test('忽略无效矩形并裁剪越界内容', () => {
  const shape = windowShape([{ x: -50, y: -50, w: 100, h: 100 }, { x: NaN, y: 0, w: 5, h: 5 }], 300, 200)
  assert.deepEqual(shape, [{ x: 0, y: 0, width: 66, height: 66 }])
})
