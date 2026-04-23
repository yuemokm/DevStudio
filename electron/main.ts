import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'path'
import { openProject, readFile, writeFile, getFileTree, selectImageFile } from './file-manager'
import { startDevServer, stopDevServer } from './dev-server'
import { parseReactFile } from './react-parser'
import { createWorkspace, injectVidsToWorkspace, refreshWorkspaceFromOriginal, cleanupWorkspace, cleanupAllWorkspaces, type Workspace } from './workspace-manager'
import { saveAsDialog } from './file-manager'

let mainWindow: BrowserWindow | null = null

// --dev flag set by `npm run dev` script
const isDevMode = process.argv.includes('--dev')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: isDevMode,
    },
  })

  if (isDevMode) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'))
  }

  // Build application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Open Project', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu-action', 'open-project') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu-action', 'save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu-action', 'save-as') },
        { type: 'separator' },
        { label: 'Quit', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow?.webContents.send('menu-action', 'undo') },
        { label: 'Redo', accelerator: process.platform === 'darwin' ? 'Cmd+Shift+Z' : 'Ctrl+Y', click: () => mainWindow?.webContents.send('menu-action', 'redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { label: 'Toggle DevTools', accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Toggle Theme', click: () => mainWindow?.webContents.send('menu-action', 'toggle-theme') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]

  // macOS: first item becomes app menu automatically
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  mainWindow.webContents.on('console-message', function(_event, levelOrDetails, messageOrLine) {
    let level: number, message: string
    if (typeof levelOrDetails === 'object' && levelOrDetails !== null && 'message' in levelOrDetails) {
      level = (levelOrDetails as any).level
      message = (levelOrDetails as any).message
    } else {
      level = levelOrDetails as number
      message = messageOrLine as string
    }
    const prefix = '[renderer]'
    if (level === 0) console.log(prefix, message)
    else if (level === 1) console.warn(prefix, message)
    else if (level === 2) console.error(prefix, message)
    else console.log(prefix, message)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC handlers
ipcMain.handle('open-project', async () => {
  console.log('[main] open-project IPC called')
  const result = await openProject()
  console.log('[main] open-project result:', result?.framework, result?.path)
  return result
})

ipcMain.handle('read-file', async (_event, filePath: string) => {
  return readFile(filePath)
})

ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
  return writeFile(filePath, content)
})

ipcMain.handle('get-file-tree', async (_event, dirPath: string) => {
  return getFileTree(dirPath)
})

ipcMain.handle('select-image-file', async (_event, projectPath: string) => {
  return selectImageFile(projectPath)
})

ipcMain.handle('start-dev-server', async (_event, projectPath: string, framework: string) => {
  console.log('[main] start-dev-server IPC called', framework, projectPath)
  try {
    const result = await startDevServer(projectPath, framework)
    console.log('[main] dev server started at', result.url)
    return result
  } catch (err: any) {
    console.error('[main] start-dev-server failed:', err)
    throw err
  }
})

ipcMain.handle('stop-dev-server', async () => {
  return stopDevServer()
})

ipcMain.handle('parse-react-file', async (_event, filePath: string) => {
  const source = await readFile(filePath)
  const result = parseReactFile(source, filePath)
  return result
})

ipcMain.handle('create-workspace', async (_event, projectPath: string, framework: string, entryFile: string) => {
  const workspace = await createWorkspace(projectPath, framework, entryFile)
  await injectVidsToWorkspace(workspace)
  return workspace
})

ipcMain.handle('refresh-workspace', async (_event, workspace: Workspace) => {
  await refreshWorkspaceFromOriginal(workspace)
})

ipcMain.handle('cleanup-workspace', async (_event, workspace: Workspace) => {
  await cleanupWorkspace(workspace)
})

ipcMain.handle('save-as-dialog', async (_event, defaultPath: string) => {
  return saveAsDialog(defaultPath)
})

ipcMain.handle('inject-overlay-script', async (_event, script: string, frameUrl: string) => {
  if (!mainWindow) return { success: false, error: 'no mainWindow' }
  try {
    const frames = mainWindow.webContents.mainFrame.frames
    for (const frame of frames) {
      // Exact origin match to prevent injecting into wrong frames
      const frameOrigin = new URL(frame.url).origin
      const targetOrigin = new URL(frameUrl).origin
      if (frameOrigin === targetOrigin) {
        await frame.executeJavaScript(script)
        return { success: true }
      }
    }
    return { success: false, error: 'preview frame not found' }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.on('reload-window', () => {
  mainWindow?.webContents.reload()
})

ipcMain.on('toggle-devtools', () => {
  mainWindow?.webContents.toggleDevTools()
})

ipcMain.on('quit-app', () => {
  app.quit()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  stopDevServer().then(async () => {
    await cleanupAllWorkspaces()
    if (process.platform !== 'darwin') app.quit()
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
