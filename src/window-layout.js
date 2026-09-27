// 把实际的 Windows 窗口缩到鲸鱼及展开内容附近；坐标均为 Electron DIP。
const MARGIN = 24
const MIN_SIZE = 320

function compactBounds(regions, current, desktop) {
  const valid = (Array.isArray(regions) ? regions : []).filter((r) => r &&
    [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0)
  if (!valid.length) return current
  const left = Math.min(...valid.map((r) => current.x + r.x))
  const top = Math.min(...valid.map((r) => current.y + r.y))
  const right = Math.max(...valid.map((r) => current.x + r.x + r.w))
  const bottom = Math.max(...valid.map((r) => current.y + r.y + r.h))
  const width = Math.min(desktop.width, Math.max(MIN_SIZE, Math.ceil(right - left + MARGIN * 2)))
  const height = Math.min(desktop.height, Math.max(MIN_SIZE, Math.ceil(bottom - top + MARGIN * 2)))
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))
  return {
    x: clamp(Math.floor(left - MARGIN), desktop.x, desktop.x + desktop.width - width),
    y: clamp(Math.floor(top - MARGIN), desktop.y, desktop.y + desktop.height - height),
    width, height,
  }
}

function needsBoundsUpdate(current, target) {
  // Windows 缩放取整会让实际窗口比目标大/小 1 DIP，不能因此无限重排。
  return ['x', 'y', 'width', 'height'].some((key) => Math.abs(target[key] - current[key]) > 1)
}

module.exports = { compactBounds, needsBoundsUpdate }
