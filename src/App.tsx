import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from './store/editor-store'
import { PreviewPanel } from './editor/PreviewPanel'
import { ProjectPanel } from './panels/ProjectPanel'
import { ComponentTree } from './panels/ComponentTree'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { StylesPanel } from './panels/StylesPanel'
import { generateHTML } from './codegen/html-codegen'
import { generateVueSFC } from './codegen/vue-codegen'
import { replaceJSXInSource } from './codegen/react-codegen'
import { generateAstro } from './codegen/astro-codegen'
import { stripVids, setVidCounter } from './parsers/html-parser'
import { parseVueSFC } from './parsers/vue-parser'
import type { FileNode } from '../electron/file-manager'
import { parseAstroFile } from './parsers/astro-parser'
import { FolderOpen, Save, Undo2, Redo2, Sun, Moon, RefreshCw, Code, Loader2, AlertCircle, Box, Settings } from 'lucide-react'
import { SettingsModal } from './panels/SettingsModal'
function App() {
  const { project, theme, setTheme, isLoading, error, undo, redo, history, historyIndex } = useEditorStore()
  const reactOriginalSourceRef = useRef<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rightTab, setRightTab] = useState<'properties' | 'styles'>('properties')

  useEffect(() => {
    if (!window.electronAPI) return
    const unsub = window.electronAPI.onMenuAction((action) => {
      if (action === 'open-project') handleOpenProject()
      if (action === 'save') handleSave()
      if (action === 'save-as') handleSaveAs()
      if (action === 'undo') undo()
      if (action === 'redo') redo()
      if (action === 'toggle-theme') toggleTheme()
    })
    return unsub
  }, [undo, redo])

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
    } catch (err) {
      console.error('Save As failed:', err)
      useEditorStore.getState().setError('Save As failed: ' + String(err))
    }
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <div className={`flex flex-col h-screen w-screen ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-[#f0f0f0]'}`}>
      {/* Top Bar — Figma style */}
      <div className={`h-10 flex items-center px-3 gap-1 border-b select-none shrink-0 ${theme === 'dark' ? 'border-[#3e3e3e] bg-[#2c2c2c]' : 'border-[#e6e6e6] bg-[#f5f5f5]'}`}>
        {/* Brand */}
        <div className={`flex items-center gap-1.5 px-1 mr-2 ${theme === 'dark' ? 'text-[#999]' : 'text-[#666]'}`}>
          <Box size={14} strokeWidth={1.5} />
          <span className="text-[11px] font-semibold tracking-wider uppercase">Editor</span>
        </div>

        <div className={`w-px h-4 mx-1 ${theme === 'dark' ? 'bg-[#3e3e3e]' : 'bg-[#e6e6e6]'}`} />

        {/* File actions */}
        <button onClick={handleOpenProject} className={`toolbar-btn ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="Open Project">
          <FolderOpen size={14} />
          <span className="text-[11px]">Open</span>
        </button>
        <button onClick={handleSave} className={`toolbar-btn ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="Save">
          <Save size={14} />
          <span className="text-[11px]">Save</span>
        </button>

        <div className={`w-px h-4 mx-1 ${theme === 'dark' ? 'bg-[#3e3e3e]' : 'bg-[#e6e6e6]'}`} />

        {/* Edit actions */}
        <button onClick={undo} className={`toolbar-btn toolbar-btn-icon ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="Undo" disabled={historyIndex < 0}>
          <Undo2 size={14} />
        </button>
        <button onClick={redo} className={`toolbar-btn toolbar-btn-icon ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="Redo" disabled={historyIndex >= history.length - 1}>
          <Redo2 size={14} />
        </button>

        <div className={`w-px h-4 mx-1 ${theme === 'dark' ? 'bg-[#3e3e3e]' : 'bg-[#e6e6e6]'}`} />

        {/* Tools */}
        <button onClick={() => window.electronAPI?.reload?.()} className={`toolbar-btn toolbar-btn-icon ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="Reload">
          <RefreshCw size={14} />
        </button>
        <button onClick={() => window.electronAPI?.toggleDevTools?.()} className={`toolbar-btn toolbar-btn-icon ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="DevTools">
          <Code size={14} />
        </button>

        {/* Center — Project name */}
        <div className="flex-1 flex justify-center">
          {project && (
            <span className={`text-[11px] font-medium ${theme === 'dark' ? 'text-[#e6e6e6]' : 'text-[#333]'}`}>
              {project.name}
            </span>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className={`flex items-center gap-1 text-[11px] ${theme === 'dark' ? 'text-[#999]' : 'text-[#666]'}`}>
              <Loader2 size={12} className="animate-spin" />
              <span>Loading</span>
            </div>
          )}
          {error && !isLoading && (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] max-w-[180px] ${theme === 'dark' ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`} title={error}>
              <AlertCircle size={11} />
              <span className="truncate">{error}</span>
            </div>
          )}
        </div>

        <div className={`w-px h-4 mx-1 ${theme === 'dark' ? 'bg-[#3e3e3e]' : 'bg-[#e6e6e6]'}`} />

        <button onClick={toggleTheme} className={`toolbar-btn toolbar-btn-icon ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="Toggle theme">
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={() => setSettingsOpen(true)} className={`toolbar-btn toolbar-btn-icon ${theme === 'dark' ? 'text-[#999] hover:text-white hover:bg-[#383838]' : 'text-[#666] hover:text-black hover:bg-[#e6e6e6]'}`} title="Settings">
          <Settings size={14} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className={`w-60 flex flex-col border-r ${theme === 'dark' ? 'border-[#3e3e3e] bg-[#2c2c2c]' : 'border-[#e6e6e6] bg-[#f5f5f5]'}`}>
          <ProjectPanel />
          <div className={`h-px ${theme === 'dark' ? 'bg-[#3e3e3e]' : 'bg-[#e6e6e6]'}`} />
          <ComponentTree />
        </div>

        {/* Center Preview */}
        <div className={`flex-1 flex flex-col min-w-0 ${theme === 'dark' ? 'bg-[#1e1e1e]' : 'bg-[#e5e5e5]'}`}>
          {error && (
            <div className="bg-red-900/50 text-red-200 px-4 py-2 text-sm">{error}</div>
          )}
          {isLoading && (
            <div className={`flex items-center justify-center h-full ${theme === 'dark' ? 'text-[#999]' : 'text-[#666]'}`}>
              Loading...
            </div>
          )}
          <PreviewPanel />
        </div>

        {/* Right Panel */}
        <div className={`w-64 flex flex-col border-l overflow-y-auto ${theme === 'dark' ? 'border-[#3e3e3e] bg-[#2c2c2c]' : 'border-[#e6e6e6] bg-[#f5f5f5]'}`}>
          {/* Tabs */}
          <div className={`flex shrink-0 border-b ${theme === 'dark' ? 'border-[#3e3e3e]' : 'border-[#e6e6e6]'}`}>
            <button
              onClick={() => setRightTab('properties')}
              className={`flex-1 h-8 text-[11px] font-medium transition-colors ${rightTab === 'properties' ? (theme === 'dark' ? 'text-white border-b-2 border-[#e94560]' : 'text-black border-b-2 border-[#e94560]') : (theme === 'dark' ? 'text-[#999] hover:text-[#ccc]' : 'text-[#666] hover:text-[#333]')}`}
            >
              Properties
            </button>
            <button
              onClick={() => setRightTab('styles')}
              className={`flex-1 h-8 text-[11px] font-medium transition-colors ${rightTab === 'styles' ? (theme === 'dark' ? 'text-white border-b-2 border-[#e94560]' : 'text-black border-b-2 border-[#e94560]') : (theme === 'dark' ? 'text-[#999] hover:text-[#ccc]' : 'text-[#666] hover:text-[#333]')}`}
            >
              Styles
            </button>
          </div>
          {rightTab === 'properties' ? <PropertiesPanel /> : <StylesPanel />}
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default App
