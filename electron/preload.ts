import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('vynt', {
  savePhoto: (dataUrl: string) => ipcRenderer.invoke('vynt:save-photo', dataUrl)
})