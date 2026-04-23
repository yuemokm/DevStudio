# Workspace + Save/Save-As Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace source-file mutation on project open with a workspace copy model, add explicit Save and Save As... actions, and show an unsaved-changes indicator.

**Architecture:** A `workspace-manager.ts` module creates a temp copy of the project on open, injects `data-vid` into the copy only, runs the dev server from the copy, and refreshes the copy after each Save. The original source files are only written to during Save/Save-As.

**Tech Stack:** Electron (main + preload + renderer), Vite, React, Zustand, TypeScript, parse5, @vue/compiler-sfc

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `electron/workspace-manager.ts` | Create | Copy project to temp dir, inject vids into copy, refresh copy after save, cleanup on close |
| `electron/main.ts` | Modify | Add IPC handlers: `create-workspace`, `refresh-workspace`, `cleanup-workspace`, `save-as-dialog` |
| `electron/preload.ts` | Modify | Expose new IPC methods on `window.electronAPI` |
| `electron/file-manager.ts` | Modify | Add `saveAsDialog` helper |
| `src/types/index.ts` | Modify | Add `workspacePath` and `originalEntryFile` to `Project` interface |
| `src/store/editor-store.ts` | Modify | Add `hasUnsavedChanges`, `markSaved()`, track snapshot for comparison |
| `src/App.tsx` | Modify | Rewrite `handleOpenProject` (workspace flow), `handleSave` (clean save), `handleSaveAs` (new location) |
| `electron.vite.config.ts` | Modify | Add `crypto` and `os` to Rollup externals |

---

### Task 1: Create workspace-manager.ts

**Files:**
- Create: `electron/workspace-manager.ts`

- [ ] **Step 1: Write the module skeleton**

Create `electron/workspace-manager.ts`:

```typescript
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

  // Map original entryFile to workspace path
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
    // Scan existing vids across all files to avoid collisions
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

export function getWorkspaceForProject(projectPath: string): Workspace | undefined {
  return activeWorkspaces.get(projectPath)
}
```

- [ ] **Step 2: Add `crypto` and `os` to electron.vite.config.ts externals**

Edit `electron.vite.config.ts` line 18:

```typescript
external: ['electron', 'fs', 'fs/promises', 'path', 'url', 'http', 'child_process', 'os', 'crypto'],
```

- [ ] **Step 3: Build Electron bundle to verify workspace-manager compiles**

Run:
```bash
npm run build:electron
```

Expected: Build completes without errors. `dist-electron/main.js` is generated.

- [ ] **Step 4: Commit**

```bash
git add electron/workspace-manager.ts electron.vite.config.ts
git commit -m "feat: add workspace-manager for temp project copies"
```

---

### Task 2: Update types and editor store

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/editor-store.ts`

- [ ] **Step 1: Add workspace fields to Project type**

Edit `src/types/index.ts`:

```typescript
export interface Project {
  path: string              // Original source directory (Save target)
  workspacePath: string     // NEW: Temp directory (dev server root)
  name: string
  entryFile: string         // Absolute path within workspacePath
  originalEntryFile: string // NEW: Absolute path within path (for Save)
  files: ProjectFile[]
  framework: 'html' | 'vue' | 'react' | 'astro'
}
```

- [ ] **Step 2: Add unsaved-changes tracking to editor store**

Edit `src/store/editor-store.ts`. Add to `EditorState` interface:

```typescript
  hasUnsavedChanges: boolean
  markSaved: () => void
```

Add to the store object:

```typescript
  hasUnsavedChanges: false,

  setProject: (project) => set({ project, selectedVid: null, selectedElement: null, vueFileEntries: [], hasUnsavedChanges: false }),
  setSourceTree: (tree) => set({ sourceTree: tree, hasUnsavedChanges: true }),

  markSaved: () => set({ hasUnsavedChanges: false }),
```

Also update `removeNode` and `addChild` to set `hasUnsavedChanges: true`:

```typescript
  removeNode: (vid) => {
    const { sourceTree } = get()
    if (!sourceTree) return
    const newTree = removeNodeByVid(sourceTree, vid)
    if (newTree) {
      set({ sourceTree: newTree, selectedVid: null, selectedElement: null, hasUnsavedChanges: true })
    }
  },

  addChild: (parentVid, child) => {
    const { sourceTree } = get()
    if (!sourceTree) return
    set({ sourceTree: addChildNode(sourceTree, parentVid, child), hasUnsavedChanges: true })
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts src/store/editor-store.ts
git commit -m "feat: add workspacePath and unsaved-changes tracking"
```

---

### Task 3: Add Electron IPC handlers

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/file-manager.ts`

- [ ] **Step 1: Add save-as dialog helper to file-manager.ts**

Add to `electron/file-manager.ts` after `selectImageFile`:

```typescript
export async function saveAsDialog(defaultPath: string): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath,
    title: 'Save As',
    properties: ['createDirectory'],
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
}
```

- [ ] **Step 2: Import workspace-manager and add IPC handlers in main.ts**

Edit `electron/main.ts`:

Add import at the top:
```typescript
import { createWorkspace, injectVidsToWorkspace, refreshWorkspaceFromOriginal, cleanupWorkspace, type Workspace } from './workspace-manager'
import { saveAsDialog } from './file-manager'
```

Add IPC handlers after the existing ones (around line 150):

```typescript
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
```

Also update `window-all-closed` handler to clean up workspaces:

```typescript
app.on('window-all-closed', () => {
  stopDevServer().then(() => {
    // Clean up all active workspaces
    for (const workspace of activeWorkspaces.values()) {
      cleanupWorkspace(workspace)
    }
    if (process.platform !== 'darwin') app.quit()
  })
})
```

Wait — `activeWorkspaces` is not exported from workspace-manager. We need to either export a cleanup-all function or iterate differently. Add to `workspace-manager.ts`:

```typescript
export async function cleanupAllWorkspaces(): Promise<void> {
  for (const workspace of activeWorkspaces.values()) {
    await cleanupWorkspace(workspace)
  }
}
```

Then import and use it in `main.ts`:

```typescript
import { cleanupAllWorkspaces } from './workspace-manager'
```

And update the handler:

```typescript
app.on('window-all-closed', () => {
  stopDevServer().then(async () => {
    await cleanupAllWorkspaces()
    if (process.platform !== 'darwin') app.quit()
  })
})
```

- [ ] **Step 3: Expose new APIs in preload.ts**

Edit `electron/preload.ts`:

Add to `ElectronAPI` interface:
```typescript
  createWorkspace: (projectPath: string, framework: string, entryFile: string) => Promise<{ originalPath: string; workspacePath: string; framework: string; entryFile: string }>
  refreshWorkspace: (workspace: { originalPath: string; workspacePath: string; framework: string; entryFile: string }) => Promise<void>
  cleanupWorkspace: (workspace: { originalPath: string; workspacePath: string; framework: string; entryFile: string }) => Promise<void>
  saveAsDialog: (defaultPath: string) => Promise<string | null>
```

Add to `api` object:
```typescript
  createWorkspace: (projectPath: string, framework: string, entryFile: string) => ipcRenderer.invoke('create-workspace', projectPath, framework, entryFile),
  refreshWorkspace: (workspace: any) => ipcRenderer.invoke('refresh-workspace', workspace),
  cleanupWorkspace: (workspace: any) => ipcRenderer.invoke('cleanup-workspace', workspace),
  saveAsDialog: (defaultPath: string) => ipcRenderer.invoke('save-as-dialog', defaultPath),
```

- [ ] **Step 4: Build Electron bundle to verify**

Run:
```bash
npm run build:electron
```

Expected: Build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts electron/file-manager.ts electron/workspace-manager.ts
git commit -m "feat: add workspace IPC handlers and save-as dialog"
```

---

### Task 4: Rewrite handleOpenProject in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove the source-file write logic from handleOpenProject**

Replace the entire `handleOpenProject` function body. The new flow:

1. Call `window.electronAPI.openProject()` to get project info
2. Call `window.electronAPI.createWorkspace(projectPath, framework, entryFile)` to create workspace and inject vids
3. Set project with `workspacePath` and `originalEntryFile`
4. Parse workspace files into AST (memory only)
5. Start dev server from `workspacePath`

Here's the rewritten `handleOpenProject`:

```typescript
  const handleOpenProject = async () => {
    if (!window.electronAPI) {
      useEditorStore.getState().setError('Electron API not available. Please run inside Electron.')
      return
    }
    try {
      useEditorStore.getState().setLoading(true)
      useEditorStore.getState().setError(null)

      const result = await window.electronAPI.openProject()
      console.log('[App] openProject result:', result)
      if (!result) {
        console.log('[App] openProject cancelled or failed')
        useEditorStore.getState().setLoading(false)
        return
      }

      // Create workspace copy and inject vids
      const workspace = await window.electronAPI.createWorkspace(
        result.path,
        result.framework,
        result.entryFile
      )
      console.log('[App] workspace created:', workspace.workspacePath)

      // Set project with both original and workspace paths
      useEditorStore.getState().setProject({
        path: result.path,
        workspacePath: workspace.workspacePath,
        name: result.name,
        entryFile: workspace.entryFile,           // points to workspace copy
        originalEntryFile: result.entryFile,      // points to original source
        files: result.files,
        framework: result.framework as any,
      })

      // Parse workspace files into AST (memory only, no disk writes)
      if (result.framework === 'vue') {
        function collectVueFiles(nodes: FileNode[]): string[] {
          const out: string[] = []
          for (const n of nodes) {
            if (n.type === 'file' && n.name.endsWith('.vue')) out.push(n.path)
            else if (n.type === 'directory' && n.children) out.push(...collectVueFiles(n.children))
          }
          return out
        }
        const vueFiles = collectVueFiles(result.files)

        // Map original file paths to workspace paths
        const workspaceVueFiles = vueFiles.map(f => f.replace(result.path, workspace.workspacePath))

        // Scan existing vids in workspace files to set counter
        let maxVid = 0
        for (const file of workspaceVueFiles) {
          const content = await window.electronAPI.readFile(file)
          const vids = content.match(/data-vid="v(\d+)"/g)
          if (vids) {
            for (const v of vids) {
              const num = parseInt(v.match(/\d+/)![0])
              if (num > maxVid) maxVid = num
            }
          }
        }
        setVidCounter(maxVid)

        const fileEntries: { path: string; originalSource: string }[] = []
        const allTrees: { tree: any; file: string }[] = []

        for (let i = 0; i < vueFiles.length; i++) {
          const originalFile = vueFiles[i]
          const workspaceFile = workspaceVueFiles[i]
          // Parse workspace copy (has vids) to build AST
          const workspaceContent = await window.electronAPI.readFile(workspaceFile)
          const { sourceTree: tree } = parseVueSFC(workspaceContent, { resetVidCounter: false })
          // Keep original source for Save
          const originalContent = await window.electronAPI.readFile(originalFile)
          fileEntries.push({ path: originalFile, originalSource: originalContent })
          allTrees.push({ tree, file: originalFile })
        }

        useEditorStore.getState().setVueFileEntries(fileEntries)

        const rootNode = {
          id: `v${maxVid + 1}`,
          type: 'element' as const,
          tagName: 'root',
          attributes: {},
          children: allTrees.flatMap(({ tree, file }) =>
            tree.children.map((child: any) => ({
              ...child,
              attributes: { ...child.attributes, 'data-source-file': file },
            }))
          ),
        }
        useEditorStore.getState().setSourceTree(rootNode)
      }

      if (result.framework === 'react') {
        const originalSource = await window.electronAPI.readFile(result.entryFile)
        // Parse the workspace copy (already has vids injected)
        const { tree } = await window.electronAPI.parseReactFile(workspace.entryFile)
        reactOriginalSourceRef.current = originalSource
        useEditorStore.getState().setSourceTree(tree)
      }

      if (result.framework === 'astro') {
        // Parse the workspace copy (has vids)
        const workspaceAstro = await window.electronAPI.readFile(workspace.entryFile)
        const { sourceTree } = parseAstroFile(workspaceAstro)
        useEditorStore.getState().setSourceTree(sourceTree)
      }

      // Start dev server from WORKSPACE path, not original path
      console.log('[App] starting dev server for', result.framework, 'at workspace:', workspace.workspacePath)
      const { url } = await window.electronAPI.startDevServer(workspace.workspacePath, result.framework)
      console.log('[App] dev server started at', url)
      useEditorStore.getState().setPreviewUrl(url)
    } catch (err: any) {
      console.error('[App] open project error:', err)
      useEditorStore.getState().setError(String(err?.message || err || 'Failed to open project'))
    } finally {
      useEditorStore.getState().setLoading(false)
    }
  }
```

Key changes:
- No more `writeFile` calls during open
- `startDevServer` receives `workspace.workspacePath` instead of `result.path`
- `project.entryFile` points to workspace, `project.originalEntryFile` points to original

- [ ] **Step 2: Verify the dev mode still starts**

Run:
```bash
npm run build:electron && npm run dev:renderer
```

In another terminal:
```bash
electron . --dev
```

Open a test project (e.g., `test-vue-project`). Verify:
1. The project opens without errors
2. The preview loads
3. The original source file (e.g., `test-vue-project/src/App.vue`) does NOT contain `data-vid` attributes

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: open project using workspace copy, no source mutation"
```

---

### Task 5: Rewrite handleSave and add handleSaveAs

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite handleSave**

Replace the existing `handleSave` function:

```typescript
  const handleSave = async () => {
    if (!window.electronAPI) return
    const { project, sourceTree } = useEditorStore.getState()
    if (!project || !sourceTree) return
    try {
      if (project.framework === 'html') {
        const cleanTree = stripVids(sourceTree)
        const html = generateHTML(cleanTree)
        await window.electronAPI.writeFile(project.originalEntryFile, html)
      } else if (project.framework === 'vue') {
        const { vueFileEntries } = useEditorStore.getState()
        const stripSourceFile = (node: any): any => {
          if (node.type === 'text' || node.type === 'comment') return node
          const attrs = { ...node.attributes }
          delete attrs['data-source-file']
          return { ...node, attributes: attrs, children: node.children.map(stripSourceFile) }
        }
        const extractForFile = (node: any, filePath: string): any[] => {
          return (node.children || [])
            .filter((child: any) => child.attributes?.['data-source-file'] === filePath)
            .map(stripSourceFile)
        }
        for (const entry of vueFileEntries) {
          const fileChildren = extractForFile(sourceTree, entry.path)
          if (fileChildren.length === 0) continue
          const fileTree = { id: 'root', type: 'element' as const, tagName: '', attributes: {}, children: fileChildren }
          const newSFC = generateVueSFC(entry.originalSource, fileTree, false) // keepVids=false
          await window.electronAPI.writeFile(entry.path, newSFC)
        }
      } else if (project.framework === 'astro') {
        const originalAstro = await window.electronAPI.readFile(project.originalEntryFile)
        const newAstro = generateAstro(originalAstro, sourceTree, false) // keepVids=false
        await window.electronAPI.writeFile(project.originalEntryFile, newAstro)
      } else if (project.framework === 'react') {
        const originalSource = reactOriginalSourceRef.current
        if (!originalSource) {
          useEditorStore.getState().setError('Cannot save: original source not available')
          return
        }
        const newSource = replaceJSXInSource(originalSource, sourceTree)
        await window.electronAPI.writeFile(project.originalEntryFile, newSource)
      }

      // Mark as saved
      useEditorStore.getState().markSaved()

      // Refresh workspace copy from the newly saved originals
      await window.electronAPI.refreshWorkspace({
        originalPath: project.path,
        workspacePath: project.workspacePath,
        framework: project.framework,
        entryFile: project.entryFile,
      })
    } catch (err) {
      console.error('Save failed:', err)
      useEditorStore.getState().setError('Save failed: ' + String(err))
    }
  }
```

Key changes:
- All writes go to `project.originalEntryFile` (not `project.entryFile`)
- Astro: `keepVids=false`
- Vue: `keepVids=false`
- After save, call `refreshWorkspace` to re-inject vids into the workspace copy
- No more React re-parse-and-write-vids bug

- [ ] **Step 2: Add handleSaveAs function**

Add after `handleSave`:

```typescript
  const handleSaveAs = async () => {
    if (!window.electronAPI) return
    const { project, sourceTree } = useEditorStore.getState()
    if (!project || !sourceTree) return

    const targetPath = await window.electronAPI.saveAsDialog(project.path)
    if (!targetPath) return

    try {
      // Generate clean code (same logic as Save)
      if (project.framework === 'html') {
        const cleanTree = stripVids(sourceTree)
        const html = generateHTML(cleanTree)
        await window.electronAPI.writeFile(targetPath, html)
      } else if (project.framework === 'vue') {
        useEditorStore.getState().setError('Save As for Vue projects is not yet fully supported. Use Save instead.')
        return
      } else if (project.framework === 'astro') {
        const originalAstro = await window.electronAPI.readFile(project.originalEntryFile)
        const newAstro = generateAstro(originalAstro, sourceTree, false)
        await window.electronAPI.writeFile(targetPath, newAstro)
      } else if (project.framework === 'react') {
        const originalSource = reactOriginalSourceRef.current
        if (!originalSource) {
          useEditorStore.getState().setError('Cannot save: original source not available')
          return
        }
        const newSource = replaceJSXInSource(originalSource, sourceTree)
        await window.electronAPI.writeFile(targetPath, newSource)
      }

      // Switch project to new location
      useEditorStore.getState().setProject({
        ...project,
        path: targetPath,
        originalEntryFile: targetPath,
      })
      useEditorStore.getState().markSaved()

      // Optional: refresh workspace from new location
      // For now, the workspace still points to the old workspace copy
      // The preview continues to work. Next Save will write to the new location.
    } catch (err) {
      console.error('Save As failed:', err)
      useEditorStore.getState().setError('Save As failed: ' + String(err))
    }
  }
```

Note: Vue Save-As is simplified for now because multi-file SFC save-as requires deciding which file to target. This can be enhanced later.

- [ ] **Step 3: Wire up Save As menu action**

In the `onMenuAction` effect (around line 26), add:

```typescript
if (action === 'save-as') handleSaveAs()
```

- [ ] **Step 4: Update App menu in main.ts to include Save As**

Edit `electron/main.ts` menu template (around line 41):

```typescript
{ label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu-action', 'save') },
{ label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu-action', 'save-as') },
```

- [ ] **Step 5: Build and test Save**

Run:
```bash
npm run build:electron
npm run dev
```

Test:
1. Open a test project
2. Make an edit (e.g., change text in Properties panel)
3. Press Ctrl+S
4. Verify the original source file is updated with the new content and NO `data-vid` attributes
5. Verify the preview still works after save (workspace refreshed)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx electron/main.ts
git commit -m "feat: implement Save and Save As with clean source output"
```

---

### Task 6: Update UI — Save As button and unsaved indicator

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import SaveAs icon**

Add to the imports from `lucide-react`:

```typescript
import { FolderOpen, Save, SaveAs, Undo2, Redo2, Sun, Moon, RefreshCw, Code, Loader2, AlertCircle, Box, Settings } from 'lucide-react'
```

- [ ] **Step 2: Add Save As button to toolbar**

After the Save button (around line 220), add:

```typescript
<button onClick={handleSaveAs} className={`toolbar-btn ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="Save As...">
  <SaveAs size={14} />
  <span className="text-[11px]">Save As</span>
</button>
```

- [ ] **Step 3: Add unsaved-changes dot to project name**

In the toolbar center section (around line 246), change:

```typescript
<div className="flex-1 flex justify-center">
  {project && (
    <span className={`text-[11px] font-medium flex items-center gap-1.5 ${theme === 'dark' ? 'text-[#e6e6e6]' : 'text-[#333]'}`}>
      {project.name}
      {hasUnsavedChanges && (
        <span className="w-2 h-2 rounded-full bg-[#e94560]" title="Unsaved changes" />
      )}
    </span>
  )}
</div>
```

Also destructure `hasUnsavedChanges` from the store at the top of the component (around line 19):

```typescript
const { project, theme, setTheme, isLoading, error, undo, redo, history, historyIndex, hasUnsavedChanges } = useEditorStore()
```

- [ ] **Step 4: Build and verify UI**

Run:
```bash
npm run build:electron && npm run dev
```

Verify:
1. Save As button appears in toolbar
2. Opening a project shows no red dot
3. Making an edit shows a red dot next to the project name
4. Saving removes the red dot

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Save As button and unsaved-changes indicator"
```

---

## Verification Checklist

After all tasks are complete, verify the following scenarios:

### Scenario A: Open project (source protection)
- [ ] Open `test-vue-project`
- [ ] Check `test-vue-project/src/App.vue` — must NOT contain any `data-vid` attributes
- [ ] Check `test-vue-project/src/MyComponent.vue` — must NOT contain any `data-vid` attributes
- [ ] Preview shows correctly with element selection working

### Scenario B: Edit + Save (clean output)
- [ ] Select an element in preview
- [ ] Change its text in Properties panel
- [ ] Press Ctrl+S
- [ ] Check `test-vue-project/src/App.vue` — text is updated, NO `data-vid` anywhere
- [ ] Red dot disappears from toolbar
- [ ] Preview still works, element can still be selected

### Scenario C: Save As
- [ ] Make another edit
- [ ] Click Save As, choose a new file name
- [ ] New file contains updated content without `data-vid`
- [ ] Original file is unchanged (or was overwritten only by prior Save)

### Scenario D: Astro project
- [ ] Open `test-astro-project`
- [ ] Verify `src/pages/index.astro` has no `data-vid` after open
- [ ] Make an edit, save
- [ ] Verify saved file has no `data-vid`, self-closing components preserved

### Scenario E: React project
- [ ] Open a React project
- [ ] Verify source file has no `data-vid` after open
- [ ] Make an edit, save
- [ ] Verify saved file has no `data-vid`, non-JSX code preserved

### Scenario F: HTML project
- [ ] Open `test-html-project`
- [ ] Verify `index.html` has no `data-vid` after open
- [ ] Make an edit, save
- [ ] Verify saved file is clean

---

## Self-Review

### Spec coverage check

| Spec Requirement | Implementing Task |
|---|---|
| Source files never modified during open | Task 4 (handleOpenProject rewrite) |
| Editing does not touch disk | Task 4 (no writeFile in open) + existing behavior preserved |
| Preview works with data-vid | Task 1 (injectVidsToWorkspace) + Task 4 (dev server from workspace) |
| Save writes clean code | Task 5 (handleSave rewrite) |
| Save As writes to new location | Task 5 (handleSaveAs) |
| Continuous editing after save | Task 5 (refreshWorkspace after save) |
| Unsaved indicator | Task 6 (red dot in toolbar) |
| Astro keepVids=false fix | Task 5 (generateAstro(..., false)) |
| React re-parse bug fix | Task 5 (no re-parse/write after save) |
| Workspace cleanup on exit | Task 3 (window-all-closed handler) |

### Placeholder scan

No TBD, TODO, or placeholder steps found. All steps contain actual code.

### Type consistency check

- `Project.workspacePath` and `Project.originalEntryFile` defined in Task 2, used in Task 4 and Task 5 — consistent.
- `Workspace` interface defined in Task 1, passed through IPC in Task 3, used in renderer in Task 4-5 — consistent.
- `hasUnsavedChanges` and `markSaved()` defined in Task 2, used in Task 5 and Task 6 — consistent.
