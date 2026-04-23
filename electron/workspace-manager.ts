import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { parseVueSFC, setVidCounter, getVidCounter } from '../src/parsers/vue-parser'
import { parseAstroFile } from '../src/parsers/astro-parser'
import { parseReactFile } from './react-parser'
import { parseHTML, injectVids } from '../src/parsers/html-parser'
import type { FileNode } from './file-manager'

export interface Workspace {
  originalPath: string
  workspacePath: string
  framework: string
  entryFile: string
}

const activeWorkspaces = new Map<string, Workspace>()

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'dist' || entry.name === 'build' || entry.name === 'release') continue
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

async function collectVueFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await collectVueFiles(fullPath))
    } else if (entry.name.endsWith('.vue')) {
      results.push(fullPath)
    }
  }
  return results
}

export async function createWorkspace(
  projectPath: string,
  framework: string,
  entryFile: string
): Promise<Workspace> {
  const projectName = path.basename(projectPath)
  const hash = crypto.randomBytes(4).toString('hex')
  const workspacePath = path.join(os.tmpdir(), 'lumen-workspace', `${projectName}-${hash}`)

  await copyDir(projectPath, workspacePath)

  const relativeEntry = path.relative(projectPath, entryFile)
  const workspaceEntryFile = path.join(workspacePath, relativeEntry)

  const workspace: Workspace = {
    originalPath: projectPath,
    workspacePath,
    framework,
    entryFile: workspaceEntryFile,
  }

  activeWorkspaces.set(projectPath, workspace)
  return workspace
}

export async function injectVidsToWorkspace(workspace: Workspace): Promise<void> {
  const { workspacePath, framework, entryFile } = workspace

  if (framework === 'vue') {
    const vueFiles = await collectVueFiles(workspacePath)
    let maxVid = 0
    for (const file of vueFiles) {
      const content = await fs.readFile(file, 'utf-8')
      const vids = content.match(/data-vid="v(\d+)"/g)
      if (vids) {
        for (const v of vids) {
          const num = parseInt(v.match(/\d+/)![0])
          if (num > maxVid) maxVid = num
        }
      }
    }
    setVidCounter(maxVid)

    for (const file of vueFiles) {
      const content = await fs.readFile(file, 'utf-8')
      const { modifiedSFC } = parseVueSFC(content, { resetVidCounter: false })
      await fs.writeFile(file, modifiedSFC, 'utf-8')
    }
  } else if (framework === 'react') {
    const content = await fs.readFile(entryFile, 'utf-8')
    const { modifiedSource } = parseReactFile(content, path.basename(entryFile))
    await fs.writeFile(entryFile, modifiedSource, 'utf-8')
  } else if (framework === 'astro') {
    const content = await fs.readFile(entryFile, 'utf-8')
    const { modifiedAstro } = parseAstroFile(content)
    await fs.writeFile(entryFile, modifiedAstro, 'utf-8')
  } else if (framework === 'html') {
    const content = await fs.readFile(entryFile, 'utf-8')
    const { modifiedHTML } = injectVids(parseHTML(content))
    await fs.writeFile(entryFile, modifiedHTML, 'utf-8')
  }
}

export async function refreshWorkspaceFromOriginal(workspace: Workspace): Promise<void> {
  const { originalPath, workspacePath, framework, entryFile } = workspace
  const originalEntryFile = entryFile.replace(workspacePath, originalPath)

  if (framework === 'vue') {
    const vueFiles = await collectVueFiles(originalPath)
    let maxVid = 0
    for (const file of vueFiles) {
      const content = await fs.readFile(file, 'utf-8')
      const vids = content.match(/data-vid="v(\d+)"/g)
      if (vids) {
        for (const v of vids) {
          const num = parseInt(v.match(/\d+/)![0])
          if (num > maxVid) maxVid = num
        }
      }
    }
    setVidCounter(maxVid)

    for (const file of vueFiles) {
      const relPath = path.relative(originalPath, file)
      const workspaceFile = path.join(workspacePath, relPath)
      const content = await fs.readFile(file, 'utf-8')
      const { modifiedSFC } = parseVueSFC(content, { resetVidCounter: false })
      await fs.writeFile(workspaceFile, modifiedSFC, 'utf-8')
    }
  } else if (framework === 'react') {
    const content = await fs.readFile(originalEntryFile, 'utf-8')
    const { modifiedSource } = parseReactFile(content, path.basename(originalEntryFile))
    await fs.writeFile(entryFile, modifiedSource, 'utf-8')
  } else if (framework === 'astro') {
    const content = await fs.readFile(originalEntryFile, 'utf-8')
    const { modifiedAstro } = parseAstroFile(content)
    await fs.writeFile(entryFile, modifiedAstro, 'utf-8')
  } else if (framework === 'html') {
    const content = await fs.readFile(originalEntryFile, 'utf-8')
    const { modifiedHTML } = injectVids(parseHTML(content))
    await fs.writeFile(entryFile, modifiedHTML, 'utf-8')
  }
}

export async function cleanupWorkspace(workspace: Workspace): Promise<void> {
  activeWorkspaces.delete(workspace.originalPath)
  try {
    await fs.rm(workspace.workspacePath, { recursive: true, force: true })
  } catch (err) {
    console.error('[workspace-manager] failed to cleanup:', err)
  }
}

export async function cleanupAllWorkspaces(): Promise<void> {
  for (const workspace of activeWorkspaces.values()) {
    await cleanupWorkspace(workspace)
  }
}

export function getWorkspaceForProject(projectPath: string): Workspace | undefined {
  return activeWorkspaces.get(projectPath)
}
