import test from 'node:test'
import assert from 'node:assert/strict'
import { getAlmanac } from '../src/almanac.mjs'

test('离线黄历随本地日期更新，提供真实宜忌和来源', () => {
  const today = getAlmanac(new Date(2026, 8, 27, 12))
  const tomorrow = getAlmanac(new Date(2026, 8, 28, 12))
  assert.equal(today.date, '2026-09-27')
  assert.equal(tomorrow.date, '2026-09-28')
  assert.ok(today.lunar.startsWith('农历'))
  assert.ok(today.yi.includes('嫁娶'))
  assert.ok(today.ji.includes('开市'))
  assert.equal(today.source, 'lunar-javascript 1.7.7')
  assert.notDeepEqual(today.yi, tomorrow.yi)
})
