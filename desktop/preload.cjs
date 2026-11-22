const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("niyamDesktop", Object.freeze({
  openLogin: (url) => ipcRenderer.invoke("niyam:open-login", url),
}));
