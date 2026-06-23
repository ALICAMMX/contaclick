// ContaClick Desktop - Electron main process
// Build the SPA first (npm run build:desktop), then this loads dist/index.html
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// ---- Local SQLite database (per-OS user data dir) ----
const userDataDir = () => app.getPath("userData");
const dbPath = () => path.join(userDataDir(), "contaclick.db");

let db = null;
function getDb() {
  if (db) return db;
  // Lazy require so the app still runs even before native module is built
  const Database = require("better-sqlite3");
  db = new Database(dbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schemaPath = path.join(__dirname, "db", "schema.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf8"));
  }
  return db;
}

// ---- IPC bridge: minimal SQL surface used by the local adapter ----
ipcMain.handle("db:exec", (_e, sql, params) => {
  return getDb().prepare(sql).run(params ?? {});
});
ipcMain.handle("db:all", (_e, sql, params) => {
  return getDb().prepare(sql).all(params ?? {});
});
ipcMain.handle("db:get", (_e, sql, params) => {
  return getDb().prepare(sql).get(params ?? {});
});
ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  userDataDir: userDataDir(),
  dbPath: dbPath(),
}));
ipcMain.handle("app:backup", async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Guardar respaldo de ContaClick",
    defaultPath: `contaclick-backup-${new Date().toISOString().slice(0, 10)}.db`,
  });
  if (canceled || !filePath) return { ok: false };
  fs.copyFileSync(dbPath(), filePath);
  return { ok: true, path: filePath };
});

// ---- Window ----
function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0b1220",
    title: "ContaClick Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");
  if (fs.existsSync(indexHtml)) {
    win.loadFile(indexHtml);
  } else {
    // Fallback: load Vite dev server when running `npm run dev:desktop`
    win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:8080");
  }
  if (process.env.OPEN_DEVTOOLS === "1") win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
