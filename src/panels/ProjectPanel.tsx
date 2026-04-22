import { useState, useMemo } from 'react'
import { useEditorStore } from '../store/editor-store'
import { Folder, File, ChevronRight, ChevronDown, Search } from 'lucide-react'
import type { ProjectFile } from '../types'

function filterTree(nodes: ProjectFile[], term: string): ProjectFile[] {
  return nodes.reduce((acc, node) => {
    const nameMatch = node.name.toLowerCase().includes(term)
    if (node.type === 'directory' && node.children) {
      const filteredChildren = filterTree(node.children, term)
      if (nameMatch || filteredChildren.length > 0) {
        acc.push({ ...node, children: nameMatch ? node.children : filteredChildren })
      }
    } else if (nameMatch) {
      acc.push(node)
    }
    return acc
  }, [] as ProjectFile[])
}

function FileTreeNode({ node, depth = 0 }: { node: ProjectFile; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          className="flex items-center gap-1 w-full px-2 py-1 text-[11px] text-[#a0a0a0] hover:bg-[#383838] rounded transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px`, height: '28px' }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Folder size={12} className="text-yellow-500" />
          <span>{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <button
      className="flex items-center gap-2 w-full px-2 py-1 text-[11px] text-[#a0a0a0] hover:bg-[#383838] rounded transition-colors"
      style={{ paddingLeft: `${depth * 12 + 24}px`, height: '28px' }}
    >
      <File size={12} className="text-blue-400" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function ProjectPanel() {
  const { project } = useEditorStore()
  const [search, setSearch] = useState('')

  const filteredFiles = useMemo(() => {
    if (!project || !search.trim()) return project?.files || []
    return filterTree(project.files, search.toLowerCase().trim())
  }, [project, search])

  return (
    <div className="flex flex-col h-1/2 overflow-hidden">
      <div className="px-3 py-2 text-[11px] font-semibold text-[#999] uppercase tracking-wider border-b border-[#3e3e3e]">
        Project
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {project ? (
          <>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#666]" />
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-7 pl-7 pr-2 bg-[#383838] rounded text-[11px] text-[#e6e6e6] placeholder-[#666] outline-none focus:ring-1 focus:ring-[#e94560]/50"
              />
            </div>
            <div className="pt-1">
              {filteredFiles.map((file) => (
                <FileTreeNode key={file.path} node={file} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-[#666] px-2 py-4 text-center">No project open</p>
        )}
      </div>
    </div>
  )
}
