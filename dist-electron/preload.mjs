"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("vynt", {
  savePhoto: (dataUrl) => electron.ipcRenderer.invoke("vynt:save-photo", dataUrl),
  saveVideo: (videoData) => electron.ipcRenderer.invoke("vynt:save-video", videoData)
});
