import { dialog } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export async function openProject() {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Open Project Folder',
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const projectPath = result.filePaths[0]
  const name = path.basename(projectPath)
  const files = await getFileTree(projectPath)
  const { entryFile, framework } = detectFramework(projectPath, files)

  return { path: projectPath, name, files, entryFile, framework }
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function selectImageFile(projectPath: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select Image',
    defaultPath: projectPath,
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const selectedPath = result.filePaths[0]
  // Return relative path from project root so the preview can resolve it
  const relativePath = path.relative(projectPath, selectedPath).replace(/\\/g, '/')
  return relativePath
}

export async function saveAsDialog(defaultPath: string): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath,
    title: 'Save As',
    properties: ['createDirectory'],
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

export async function getFileTree(dirPath: string): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const children = await getFileTree(fullPath)
      nodes.push({ name: entry.name, path: fullPath, type: 'directory', children })
    } else {
      nodes.push({ name: entry.name, path: fullPath, type: 'file' })
    }
  }

  return nodes.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === 'directory' ? -1 : 1
  })
}

function detectFramework(projectPath: string, files: FileNode[]): { entryFile: string; framework: string } {
  const hasFile = (name: string) => files.some(f => f.name === name)
  console.log('[detectFramework] files:', files.map(f => f.name).join(', '))

  if (hasFile('astro.config.mjs') || hasFile('astro.config.ts')) {
    console.log('[detectFramework] detected: astro')
    return { entryFile: path.join(projectPath, 'src/pages/index.astro'), framework: 'astro' }
  }
  if (hasFile('vite.config.ts') || hasFile('vite.config.js')) {
    // Check recursively for .vue files in src/ to determine Vue vs React
    const hasVueFile = (nodes: FileNode[]): boolean =>
      nodes.some(n => (n.type === 'file' && n.name.endsWith('.vue')) || (n.type === 'directory' && hasVueFile(n.children || [])))
    const hasReactFile = (nodes: FileNode[]): boolean =>
      nodes.some(n => (n.type === 'file' && (n.name.endsWith('.tsx') || n.name.endsWith('.jsx'))) || (n.type === 'directory' && hasReactFile(n.children || [])))
    if (hasVueFile(files)) {
      console.log('[detectFramework] detected: vue')
      return { entryFile: path.join(projectPath, 'src/App.vue'), framework: 'vue' }
    }
    if (hasReactFile(files)) {
      console.log('[detectFramework] detected: react')
      return { entryFile: path.join(projectPath, 'src/App.tsx'), framework: 'react' }
    }
  }
  if (hasFile('package.json')) {
    console.log('[detectFramework] detected: html (via package.json)')
    return { entryFile: path.join(projectPath, 'index.html'), framework: 'html' }
  }
  if (hasFile('index.html')) {
    console.log('[detectFramework] detected: html (via index.html)')
    return { entryFile: path.join(projectPath, 'index.html'), framework: 'html' }
  }

  console.log('[detectFramework] detected: html (fallback)')
  return { entryFile: path.join(projectPath, files.find(f => f.name.endsWith('.html'))?.name || 'index.html'), framework: 'html' }
}
