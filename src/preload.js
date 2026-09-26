/*
 * DeepSeek-Balance-Whale-Widget-Desktop
 * Copyright (c) 2026 GoRmiTz
 *
 * SPDX-License-Identifier: MIT
 * 本文件为本项目自有代码，协议全文见仓库根目录 LICENSE。
 */

const { contextBridge, ipcRenderer } = require('electron')

// 暴露给页面的能力（页面本身仍是普通网页，nodeIntegration 关闭）：
//   desktop       —— 「我是桌面透明窗口」标记，页面据此切透明样式
//   reportState   —— 上报鲸鱼命中区、系统绘制区域，以及拖拽/菜单状态
//   getSettings   —— 读桌面端设置（置顶、额度面板、启动方式等）
//   patchSettings —— 改桌面端设置
//   openSounds    —— 打开自定义音效文件夹
contextBridge.exposeInMainWorld('__whale', {
  desktop: true,
  reportState: (rect, force, regions, dragging, menuOpen) => ipcRenderer.send('whale:state', { rect, force, regions, dragging, menuOpen }),
  getSettings: () => ipcRenderer.invoke('whale:settings'),
  patchSettings: (patch) => ipcRenderer.invoke('whale:settings:patch', patch),
  onSettingsChanged: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('whale:settings-updated', (_event, settings) => callback(settings))
  },
  openSounds: () => ipcRenderer.invoke('whale:open-sounds'),
})
