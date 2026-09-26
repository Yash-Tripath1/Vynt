import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST
const entryURL = VITE_DEV_SERVER_URL || pathToFileURL(path.join(RENDERER_DIST, 'index.html')).href
const privacyURL = VITE_DEV_SERVER_URL
  ? new URL('privacy.html', VITE_DEV_SERVER_URL).href
  : pathToFileURL(path.join(RENDERER_DIST, 'privacy.html')).href
let win: BrowserWindow | null = null

function trustedURL(value: string): boolean {
  try {
    const url = new URL(value)
    const entry = new URL(entryURL)
    return VITE_DEV_SERVER_URL
      ? url.origin === entry.origin && url.pathname === entry.pathname
      : url.protocol === 'file:' && url.pathname === entry.pathname
  } catch { return false }
}

function timestamp(): string { return new Date().toISOString().replace(/[:.]/g, '-') }

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 900, minWidth: 900, minHeight: 620,
    title: 'VYNT', autoHideMenuBar: true,
    backgroundColor: '#0c0c0b',
    icon: path.join(process.env.VITE_PUBLIC, 'vynt.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!trustedURL(url)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === privacyURL) {
      const privacy = new BrowserWindow({
        width: 760, height: 720, parent: win ?? undefined, autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
      })
      privacy.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      privacy.webContents.on('will-navigate', (event) => event.preventDefault())
      void privacy.loadURL(privacyURL)
    } else {
      try {
        const target = new URL(url)
        if (target.protocol === 'https:' && target.hostname === 'github.com' &&
            (target.pathname === '/Yash-Tripath1/Vynt' || target.pathname.startsWith('/Yash-Tripath1/Vynt/'))) {
          void shell.openExternal(url)
        }
      } catch { /* Never pass unvalidated URLs to the shell. */ }
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-prevent-unload', (event) => {
    if (!win) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Keep VYNT open', 'Discard and close'], defaultId: 0, cancelId: 0,
      message: 'A video is being recorded or saved.', detail: 'Closing now may discard your unsaved recording.'
    })
    if (choice === 1) event.preventDefault()
  })
  win.on('closed', () => { win = null })
  void win.loadURL(entryURL)
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.yashtripathi.vynt')
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    return Boolean(contents && contents === win?.webContents && permission === 'media' &&
      trustedURL(contents.getURL()) && (!details.requestingUrl || trustedURL(details.requestingUrl)))
  })
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(Boolean(contents === win?.webContents && permission === 'media' &&
      trustedURL(contents.getURL()) && details.isMainFrame &&
      (!details.requestingUrl || trustedURL(details.requestingUrl))))
  })

  function assertSender(event: Electron.IpcMainInvokeEvent): void {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame ||
        !trustedURL(event.senderFrame.url)) throw new Error('Untrusted save request.')
  }

  ipcMain.handle('vynt:save-photo', async (event, dataUrl: unknown) => {
    assertSender(event)
    if (typeof dataUrl !== 'string' || dataUrl.length > 30 * 1024 * 1024 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('Invalid PNG capture.')
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG data.')
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Save VYNT photo', defaultPath: path.join(app.getPath('pictures'), `vynt-${timestamp()}.png`),
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (canceled || !filePath) return { saved: false, filePath: null }
    await writeFile(filePath, bytes)
    return { saved: true, filePath }
  })

  ipcMain.handle('vynt:save-video', async (event, data: unknown, extension: unknown) => {
    assertSender(event)
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > 256 * 1024 * 1024 ||
        (extension !== 'webm' && extension !== 'mp4')) throw new Error('Invalid video capture.')
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Save VYNT video', defaultPath: path.join(app.getPath('videos'), `vynt-video-${timestamp()}.${extension}`),
      filters: [{ name: extension === 'mp4' ? 'MP4 video' : 'WebM video', extensions: [extension] }]
    })
    if (canceled || !filePath) return { saved: false, filePath: null }
    await writeFile(filePath, Buffer.from(data))
    return { saved: true, filePath }
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
