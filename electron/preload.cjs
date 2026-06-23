// Exposes a minimal, typed API to the renderer (window.contaclick)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("contaclick", {
  isDesktop: true,
  db: {
    run: (sql, params) => ipcRenderer.invoke("db:exec", sql, params),
    all: (sql, params) => ipcRenderer.invoke("db:all", sql, params),
    get: (sql, params) => ipcRenderer.invoke("db:get", sql, params),
  },
  app: {
    info: () => ipcRenderer.invoke("app:info"),
    backup: () => ipcRenderer.invoke("app:backup"),
  },
});
