import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null

function createCaptureFileName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `vynt-${timestamp}.png`
}

function createVideoFileName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `vynt-video-${timestamp}.webm`
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: 'VYNT',
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs')
    }
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => permission === 'media'
  )

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === 'media')
    }
  )

  ipcMain.handle('vynt:save-photo', async (_event, dataUrl: string) => {
    if (!dataUrl.startsWith('data:image/png;base64,')) {
      throw new Error('VYNT received an invalid image capture.')
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save VYNT photo',
      defaultPath: createCaptureFileName(),
      filters: [
        {
          name: 'PNG image',
          extensions: ['png']
        }
      ]
    })

    if (canceled || !filePath) {
      return {
        saved: false,
        filePath: null
      }
    }

    const base64Image = dataUrl.replace(/^data:image\/png;base64,/, '')
    await writeFile(filePath, Buffer.from(base64Image, 'base64'))

    return {
      saved: true,
      filePath
    }
  })

  ipcMain.handle('vynt:save-video', async (_event, videoData: ArrayBuffer) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save VYNT video',
      defaultPath: createVideoFileName(),
      filters: [
        {
          name: 'WebM video',
          extensions: ['webm']
        }
      ]
    })

    if (canceled || !filePath) {
      return {
        saved: false,
        filePath: null
      }
    }

    await writeFile(filePath, Buffer.from(videoData))

    return {
      saved: true,
      filePath
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})