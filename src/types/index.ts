export interface ProjectFile {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: ProjectFile[]
}

export interface Project {
  path: string              // Original source directory (Save target)
  workspacePath: string     // Temp directory (dev server root)
  name: string
  entryFile: string         // Absolute path within workspacePath
  originalEntryFile: string // Absolute path within path (for Save)
  files: ProjectFile[]
  framework: 'html' | 'vue' | 'react' | 'astro'
}

export interface SourceNode {
  id: string
  tagName?: string
  type: 'element' | 'text' | 'comment'
  attributes?: Record<string, string>
  textContent?: string
  children: SourceNode[]
  parent?: SourceNode
  sourceRange?: { start: number; end: number }
}

export interface SelectedElement {
  vid: string
  tagName: string
  textContent: string
  attributes: Record<string, string>
  styles: Record<string, string>
  rect: { x: number; y: number; width: number; height: number }
}

export type EditorCommand = {
  type: 'text' | 'attr' | 'style' | 'image'
  vid: string
  property: string
  prev: any
  next: any
}
