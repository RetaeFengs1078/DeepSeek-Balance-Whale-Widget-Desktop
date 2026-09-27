/* 独立设置窗口只暴露所需能力；页面不能直接访问 Node 或 Electron。 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__whaleSettings', {
  getDesktop: () => ipcRenderer.invoke('whale:settings'),
  patchDesktop: (patch) => ipcRenderer.invoke('whale:settings:patch', patch),
  getWidget: () => ipcRenderer.invoke('whale:widget:get'),
  patchWidget: (patch) => ipcRenderer.invoke('whale:widget:patch', patch),
  onDesktopChanged: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('whale:settings-updated', (_event, settings) => callback(settings))
  },
  onWidgetChanged: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('whale:widget-updated', (_event, values) => callback(values))
  },
  openSounds: () => ipcRenderer.invoke('whale:open-sounds'),
  refreshSound: () => ipcRenderer.invoke('whale:sound:refresh'),
  openSkins: () => ipcRenderer.invoke('whale:open-skins'),
  refreshSkin: () => ipcRenderer.invoke('whale:skin:refresh'),
  reloadWhale: () => ipcRenderer.invoke('whale:widget:reload'),
  testPhonePush: () => ipcRenderer.invoke('whale:phone:test'),
  close: () => ipcRenderer.invoke('whale:settings:close'),
  minimize: () => ipcRenderer.invoke('whale:settings:minimize'),
})
