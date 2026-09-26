// 透明桌面窗口只保留鲸鱼附近的系统绘制区域，避免整屏透明窗口覆盖视频表面。
// Electron setShape 使用相对于窗口左上角的整数矩形。
const PAD = 16 // 菜单缩放动画及鼠标命中留出余量。
const MAX_REGIONS = 8

function windowShape(regions, width, height) {
  const w = Math.max(0, Math.floor(Number(width) || 0))
  const h = Math.max(0, Math.floor(Number(height) || 0))
  if (!w || !h) return []

  const result = []
  for (const rect of Array.isArray(regions) ? regions.slice(0, MAX_REGIONS) : []) {
    if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) continue
    if (rect.w <= 0 || rect.h <= 0) continue
    const left = Math.max(0, Math.floor(rect.x - PAD))
    const top = Math.max(0, Math.floor(rect.y - PAD))
    const right = Math.min(w, Math.ceil(rect.x + rect.w + PAD))
    const bottom = Math.min(h, Math.ceil(rect.y + rect.h + PAD))
    if (right > left && bottom > top) result.push({ x: left, y: top, width: right - left, height: bottom - top })
  }
  return result
}

module.exports = { windowShape }
