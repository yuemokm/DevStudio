# Visual Editor: Workspace + Save/Save-As Design

## Background & Problem

The Visual Editor currently corrupts source files when opening a project. The root cause is in `src/App.tsx:63-132`:

- **Vue projects**: `parseVueSFC()` injects `data-vid` attributes, then `writeFile()` writes the modified SFC back to the original source file immediately.
- **React projects**: `parseReactFile()` injects `data-vid` into JSX, then writes back immediately.
- **Astro projects**: `parseAstroFile()` injects `data-vid`, then writes back immediately.

This means every time a user opens a project, the source files are permanently mutated with `data-vid="vN"` attributes. Repeated open/close cycles compound the corruption.

Additionally, the user wants to replace implicit/auto-saving with explicit **Save** and **Save As...** actions. Changes should only be persisted to disk when the user explicitly chooses to save.

## Design Goals

1. **Source files must never be modified during open/load** — only read.
2. **Editing must not touch disk** until the user clicks Save.
3. **Preview must still work** — the dev server needs `data-vid` in the rendered DOM for element selection.
4. **Save** writes clean code (no `data-vid`) back to the original project path.
5. **Save As...** writes clean code to a user-chosen new location and optionally switches the project to that location.
6. **Continuous editing** after save must remain functional — the workspace copy must be refreshed with clean vids after each save.

## Architecture Overview

We introduce a **workspace manager** (`electron/workspace-manager.ts`) that maintains a temporary copy of the project. The dev server runs from this workspace copy, not the original source directory.

```
┌─────────────────┐     read only      ┌──────────────────┐
│  Original Project │ ─────────────────► │  Workspace Copy  │
│  (disk, sacred)   │                    │  (temp dir)      │
└─────────────────┘     save/save-as   └──────────────────┘
         ▲                                    │
         │ write clean code                   │ dev server reads
         │ (no data-vid)                      ▼
         │                            ┌──────────────────┐
         └────────────────────────────│  Browser Preview │
                                      │  (DOM has vids)  │
                                      └──────────────────┘
                                             │
                                             │ postMessage
                                             ▼
                                      ┌──────────────────┐
                                      │  Renderer (AST)  │
                                      │  memory only     │
                                      └──────────────────┘
```

### Key Invariants

- `project.path` = original source directory (Save target)
- `project.workspacePath` = temp directory (dev server root)
- `project.entryFile` = absolute path to entry file **within workspace** (for parsing / preview)
- `project.originalEntryFile` = absolute path to entry file **within original directory** (for Save)
- `writeFile` to `project.path` only happens in `handleSave()` / `handleSaveAs()`
- `writeFile` to `project.workspacePath` only happens during workspace setup/refresh

## Workspace Manager

New module: `electron/workspace-manager.ts`

```typescript
interface Workspace {
  originalPath: string
  workspacePath: string
  framework: string
  entryFile: string
}

const activeWorkspaces = new Map<string, Workspace>()

export async function createWorkspace(projectPath: string, framework: string): Promise<Workspace>
export async function injectVidsToWorkspace(workspace: Workspace): Promise<void>
export async function refreshWorkspaceFromOriginal(workspace: Workspace): Promise<void>
export async function cleanupWorkspace(workspace: Workspace): Promise<void>
export function getWorkspaceForProject(projectPath: string): Workspace | undefined
```

### createWorkspace

1. Generate a unique temp directory: `os.tmpdir() + '/devstudio-workspace/' + projectName + '-' + hash`
2. Recursively copy the entire project directory to the temp path
   - **Exclude**: `node_modules/`, `.git/`, `dist/`, `build/`, `.claude/`, and any dot-prefixed directories
   - On Windows, use `fs.cp(source, dest, { recursive: true, filter })` (Node 18+) or custom recursive copy with filter
3. Return the `Workspace` descriptor

The `entryFile` in the returned workspace points to the corresponding file inside `workspacePath` (e.g. if original was `/proj/src/App.vue`, workspace entry is `/tmp/.../proj/src/App.vue`).

### injectVidsToWorkspace

Framework-specific injection into the **workspace copy only**:

- **Vue**: For each `.vue` file, parse SFC, inject vids into template, write modified SFC to workspace path.
- **React**: Parse entry file, inject vids into JSX, write modified source to workspace path.
- **Astro**: Parse entry file, inject vids into template, write modified `.astro` to workspace path.
- **HTML**: Parse HTML, inject vids, write modified HTML to workspace path.

### refreshWorkspaceFromOriginal

Called after `handleSave()` to keep the workspace copy in sync with the newly saved original files:

1. Read the just-saved original file(s) from `project.path`
   - **Vue**: Read all `.vue` files that were modified, or all tracked `.vue` files
   - **React/Astro/HTML**: Read the entry file only
2. Re-inject `data-vid` using the same parser logic as `injectVidsToWorkspace`
3. Write the vid-injected version to the corresponding path inside `workspacePath`
4. Dev server HMR detects the change and refreshes the preview

### cleanupWorkspace

1. `rm -rf` the temp directory
2. Remove from `activeWorkspaces` map

## Data Flow: Open Project

```
User clicks "Open Project"
  │
  ▼
electron: openProject()
  ├── dialog.showOpenDialog() → projectPath
  ├── detectFramework(projectPath) → { framework, entryFile }
  ├── createWorkspace(projectPath, framework) → workspacePath
  ├── injectVidsToWorkspace({ originalPath, workspacePath, framework, entryFile })
  ├── startDevServer(workspacePath, framework) → previewUrl
  └── return { path: projectPath, workspacePath, framework, entryFile, url, files }
  │
  ▼
renderer: App.tsx
  ├── setProject({ path, workspacePath, name, entryFile, files, framework })
  ├── framework-specific parse of workspace entryFile → AST → sourceTree (memory)
  └── iframe.src = previewUrl
```

**Critical**: `startDevServer` now receives `workspacePath`, not `projectPath`.

## Data Flow: Edit

Unchanged from current behavior, but verified to be memory-only:

```
User clicks element in preview / changes property in panel
  │
  ▼
overlay script (inside iframe)
  ├── highlights element, sends postMessage with vid + payload
  │
  ▼
renderer: PropertiesPanel / StylesPanel / PreviewPanel
  ├── update memory AST: setSourceTree(updateNodeAttr(sourceTree, vid, name, value))
  ├── record undo command: executeCommand({ type: 'attr', vid, property, prev, next })
  └── postMessage → iframe: set-attr / set-style / set-text
  │
  ▼
overlay script
  └── modifies DOM directly (no file I/O, no network)
```

## Data Flow: Save (Ctrl+S)

```
User clicks Save
  │
  ▼
renderer: handleSave()
  │
  ├─▶ Generate clean code from memory AST (strip data-vid)
  │     HTML:  stripVids(sourceTree) → generateHTML()
  │     Vue:   for each file entry, stripSourceFile() → generateVueSFC(originalSource, tree, false)
  │     Astro: generateAstro(originalAstro, sourceTree, false)  ← keepVids=false
  │     React: replaceJSXInSource(originalSource, sourceTree)
  │
  ├─▶ Write clean code to project.path (original directory)
  │     via window.electronAPI.writeFile(originalEntryFile, cleanCode)
  │
  └─▶ Refresh workspace copy
        ├── window.electronAPI.readFile(originalEntryFile)
        ├── re-inject data-vid
        └── window.electronAPI.writeFile(workspaceEntryFile, vidCode)
              ↓
        Dev server HMR refreshes preview automatically
```

### Astro-specific fix

Current `handleSave` calls `generateAstro(originalAstro, sourceTree, true)` — the `true` keeps vids in the saved file. This is a bug that permanently pollutes Astro source files. The new design uses `keepVids=false` for all saves.

### React-specific fix

Current `handleSave` writes clean code, then re-parses and writes vid-injected code back to the same original file. The new design separates these two destinations: clean code goes to `originalPath`, vid-injected code goes to `workspacePath`.

## Data Flow: Save As... (Ctrl+Shift+S)

```
User clicks "Save As..."
  │
  ▼
electron: showSaveDialog()
  └── User selects target directory / enters new name
  │
  ▼
renderer: handleSaveAs(targetPath)
  │
  ├─▶ Generate clean code from memory AST (same logic as Save)
  ├─▶ Write clean code to targetPath
  │
  └─▶ Switch project to new location (optional, default: yes)
        ├── project.path = targetPath
        ├── project.originalEntryFile = resolved entry file in targetPath
        ├── cleanup old workspace
        ├── createWorkspace(targetPath, framework)
        ├── injectVidsToWorkspace()
        ├── stopDevServer() + startDevServer(newWorkspacePath, framework)
        └── iframe.src = newPreviewUrl
```

## Type Changes

### `types/index.ts`

```typescript
export interface Project {
  path: string              // Original source directory (Save target)
  workspacePath: string     // NEW: Temp directory (dev server root)
  name: string
  entryFile: string         // Path within workspacePath
  originalEntryFile: string // NEW: Path within path (for Save)
  files: ProjectFile[]
  framework: 'html' | 'vue' | 'react' | 'astro'
}
```

## UI Changes

### Toolbar

Add a **Save As...** button next to Save:

```
[Open] [Save] [Save As...] | [Undo] [Redo] | [Reload] ...
```

### Application Menu

```
File
├── Open Project    Ctrl+O
├── Save            Ctrl+S
├── Save As...      Ctrl+Shift+S   ← NEW
└── Quit
```

### Unsaved Indicator

Show a dot (`●`) next to the project name in the toolbar when the memory AST differs from the last saved state. Reset on Save/Save-As.

Store a `savedSourceTreeSnapshot` (deep clone of sourceTree at last save) in the editor store, compare on each mutation.

## IPC Additions

### `electron/main.ts`

```typescript
ipcMain.handle('create-workspace', async (_event, projectPath: string, framework: string) => {
  return createWorkspace(projectPath, framework)
})

ipcMain.handle('refresh-workspace', async (_event, workspace: Workspace) => {
  return refreshWorkspaceFromOriginal(workspace)
})

ipcMain.handle('cleanup-workspace', async (_event, workspace: Workspace) => {
  return cleanupWorkspace(workspace)
})

ipcMain.handle('save-as-dialog', async (_event, defaultPath: string) => {
  const result = await dialog.showSaveDialog({ defaultPath, properties: ['createDirectory'] })
  return result.canceled ? null : result.filePath
})
```

### `electron/preload.ts`

Expose the new IPC handlers on `window.electronAPI`.

## Error Handling

| Scenario | Handling |
|---|---|
| Workspace copy fails (disk full) | Show error toast, fall back to read-only mode |
| Save fails (permissions) | Show error, keep AST in memory, allow retry |
| Save-As to existing file | Confirm overwrite dialog |
| Dev server fails to start from workspace | Log error, show message in preview panel |
| App crash / unclean exit | On next launch, clean stale temp directories |

## Files to Create / Modify

### New files
- `electron/workspace-manager.ts`

### Modified files
- `electron/main.ts` — add IPC handlers for workspace + save-as
- `electron/preload.ts` — expose new APIs
- `electron/file-manager.ts` — add `saveAsDialog` helper
- `src/types/index.ts` — add `workspacePath`, `originalEntryFile`
- `src/store/editor-store.ts` — add `savedSnapshot`, `hasUnsavedChanges`, `markSaved()`
- `src/App.tsx` — rewrite `handleOpenProject` to use workspace, rewrite `handleSave`, add `handleSaveAs`, update menu handlers
- `src/panels/ProjectPanel.tsx` — show unsaved indicator

## Backwards Compatibility

This is a breaking change in behavior (source files are no longer modified on open). No migration needed since this fixes a bug, not a feature deprecation.
