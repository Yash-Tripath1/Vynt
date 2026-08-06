"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("vynt", {
  savePhoto: (dataUrl) => electron.ipcRenderer.invoke("vynt:save-photo", dataUrl)
});
