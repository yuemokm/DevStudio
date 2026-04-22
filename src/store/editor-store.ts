import { create } from 'zustand'
import type { Project, SelectedElement, SourceNode, EditorCommand } from '../types'
import { updateNodeAttr, updateElementText, removeNodeByVid, addChildNode } from '../parsers/html-parser'

interface VueFileEntry {
  path: string
  originalSource: string
}

interface EditorState {
  project: Project | null
  sourceTree: SourceNode | null
  selectedVid: string | null
  selectedElement: SelectedElement | null
  previewUrl: string | null
  isLoading: boolean
  error: string | null
  history: EditorCommand[]
  historyIndex: number
  theme: 'dark' | 'light'
  vueFileEntries: VueFileEntry[]

  setProject: (project: Project | null) => void
  setSourceTree: (tree: SourceNode | null) => void
  selectElement: (vid: string | null, element?: SelectedElement | null) => void
  setPreviewUrl: (url: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  executeCommand: (command: EditorCommand) => void
  undo: () => void
  redo: () => void
  setTheme: (theme: 'dark' | 'light') => void
  removeNode: (vid: string) => void
  addChild: (parentVid: string, child: SourceNode) => void
  setVueFileEntries: (entries: VueFileEntry[]) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  sourceTree: null,
  selectedVid: null,
  selectedElement: null,
  previewUrl: null,
  isLoading: false,
  error: null,
  history: [],
  historyIndex: -1,
  theme: 'dark',
  vueFileEntries: [],

  setProject: (project) => set({ project, selectedVid: null, selectedElement: null, vueFileEntries: [] }),
  setSourceTree: (tree) => set({ sourceTree: tree }),
  selectElement: (vid, element) => set({ selectedVid: vid, selectedElement: element ?? null }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setVueFileEntries: (entries) => set({ vueFileEntries: entries }),

  executeCommand: (command) => {
    const { history, historyIndex } = get()
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(command)
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { history, historyIndex, sourceTree } = get()
    if (historyIndex >= 0 && sourceTree) {
      const cmd = history[historyIndex]
      let newTree = sourceTree
      if (cmd.type === 'text') {
        newTree = updateElementText(sourceTree, cmd.vid, cmd.prev)
      } else if (cmd.type === 'attr') {
        newTree = updateNodeAttr(sourceTree, cmd.vid, cmd.property, cmd.prev)
      } else if (cmd.type === 'style') {
        newTree = updateNodeAttr(sourceTree, cmd.vid, 'style', cmd.prev)
      }
      window.dispatchEvent(new CustomEvent('editor-undo-redo', { detail: { type: 'undo', command: cmd } }))
      set({ historyIndex: historyIndex - 1, sourceTree: newTree })
    }
  },

  redo: () => {
    const { history, historyIndex, sourceTree } = get()
    if (historyIndex < history.length - 1 && sourceTree) {
      const cmd = history[historyIndex + 1]
      let newTree = sourceTree
      if (cmd.type === 'text') {
        newTree = updateElementText(sourceTree, cmd.vid, cmd.next)
      } else if (cmd.type === 'attr') {
        newTree = updateNodeAttr(sourceTree, cmd.vid, cmd.property, cmd.next)
      } else if (cmd.type === 'style') {
        newTree = updateNodeAttr(sourceTree, cmd.vid, 'style', cmd.next)
      }
      window.dispatchEvent(new CustomEvent('editor-undo-redo', { detail: { type: 'redo', command: cmd } }))
      set({ historyIndex: historyIndex + 1, sourceTree: newTree })
    }
  },

  setTheme: (theme) => set({ theme }),

  removeNode: (vid) => {
    const { sourceTree } = get()
    if (!sourceTree) return
    const newTree = removeNodeByVid(sourceTree, vid)
    if (newTree) {
      set({ sourceTree: newTree, selectedVid: null, selectedElement: null })
    }
  },

  addChild: (parentVid, child) => {
    const { sourceTree } = get()
    if (!sourceTree) return
    set({ sourceTree: addChildNode(sourceTree, parentVid, child) })
  },
}))
