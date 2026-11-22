const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { join } = require("node:path");
const base = require("./target.json").origin;
const url = new URL(base);
if (
  url.protocol !== "https:" &&
  !(url.protocol === "http:" && url.hostname === "127.0.0.1" && !app.isPackaged)
)
  throw new Error("An HTTPS release origin is required");
const allowed = (value) => {
  try {
    return new URL(value).origin === url.origin;
  } catch {
    return false;
  }
};
// A desktop login opens only a Niyam pairing URL in the system browser.
ipcMain.handle("niyam:open-login", async (event, target) => {
  if (!allowed(event.sender.getURL())) throw new Error("Invalid caller");
  let next;
  try { next = new URL(target); } catch { throw new Error("Invalid login URL"); }
  if (
    next.origin !== url.origin ||
    next.pathname !== "/" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(next.searchParams.get("desktop") || "") ||
    !["faculty", "student"].includes(next.searchParams.get("role")) ||
    [...next.searchParams.keys()].some((key) => !["desktop", "role"].includes(key))
  ) throw new Error("Invalid desktop login request");
  await shell.openExternal(next.href);
});
function open() {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: "#142b4f",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: join(__dirname, "preload.cjs"),
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  const web = window.webContents;
  web.session.setPermissionRequestHandler((contents, permission, complete) =>
    complete(false),
  );
  web.session.setPermissionCheckHandler(() => false);
  web.setWindowOpenHandler(() => ({ action: "deny" }));
  for (const event of ["will-navigate", "will-redirect"])
    web.on(event, (e, target) => {
      if (!allowed(target)) e.preventDefault();
    });
  web.on("will-attach-webview", (event) => event.preventDefault());
  web.on("did-fail-load", (_event, code, _description, _url, mainFrame) => {
    if (mainFrame && code !== -3) window.loadFile(__dirname + "/offline.html");
  });
  window.loadURL(url.href);
}
app.enableSandbox();
app.whenReady().then(open);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) open();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
