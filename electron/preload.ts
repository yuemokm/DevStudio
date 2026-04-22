import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  openProject: () => Promise<{ path: string; name: string; files: any[]; entryFile: string; framework: string } | null>
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<void>
  getFileTree: (dirPath: string) => Promise<any[]>
  selectImageFile: (projectPath: string) => Promise<string | null>
  startDevServer: (projectPath: string, framework: string) => Promise<{ url: string; port: number }>
  stopDevServer: () => Promise<void>
  parseReactFile: (filePath: string) => Promise<{ tree: any; modifiedSource: string }>
  onMenuAction: (callback: (action: string) => void) => () => void
  injectOverlayScript: (script: string, frameUrl: string) => Promise<{ success: boolean; error?: string }>
  reload: () => void
  toggleDevTools: () => void
  quitApp: () => void
}

const api: ElectronAPI = {
  openProject: () => ipcRenderer.invoke('open-project'),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  getFileTree: (dirPath: string) => ipcRenderer.invoke('get-file-tree', dirPath),
  selectImageFile: (projectPath: string) => ipcRenderer.invoke('select-image-file', projectPath),
  startDevServer: (projectPath: string, framework: string) => ipcRenderer.invoke('start-dev-server', projectPath, framework),
  stopDevServer: () => ipcRenderer.invoke('stop-dev-server'),
  parseReactFile: (filePath: string) => ipcRenderer.invoke('parse-react-file', filePath),
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.removeListener('menu-action', handler)
  },
  injectOverlayScript: (script: string, frameUrl: string) => ipcRenderer.invoke('inject-overlay-script', script, frameUrl),
  reload: () => ipcRenderer.send('reload-window'),
  toggleDevTools: () => ipcRenderer.send('toggle-devtools'),
  quitApp: () => ipcRenderer.send('quit-app'),
}

contextBridge.exposeInMainWorld('electronAPI', api)

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
