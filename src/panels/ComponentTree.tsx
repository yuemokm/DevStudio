import { useState } from 'react'
import { useEditorStore } from '../store/editor-store'
import { Tag, Type, Trash2, Plus } from 'lucide-react'
import { createElementNode } from '../parsers/html-parser'

const COMMON_TAGS = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'a', 'img', 'button', 'section', 'article', 'ul', 'li']

function TreeNode({ node, depth = 0 }: { node: any; depth?: number }) {
  const { selectedVid, selectElement, removeNode, addChild } = useEditorStore()
  const isSelected = node.id === selectedVid
  const [showAddMenu, setShowAddMenu] = useState(false)

  const handleClick = () => {
    selectElement(node.id)
    const iframe = document.querySelector('iframe')
    iframe?.contentWindow?.postMessage(
      { source: 'edit-bridge', type: 'highlight', vid: node.id },
      '*'
    )
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    removeNode(node.id)
    const iframe = document.querySelector('iframe')
    iframe?.contentWindow?.postMessage(
      { source: 'edit-bridge', type: 'remove', vid: node.id },
      '*'
    )
  }

  const handleAddChild = (e: React.MouseEvent, tagName: string) => {
    e.stopPropagation()
    setShowAddMenu(false)
    const newNode = createElementNode(tagName)
    addChild(node.id, newNode)
    const iframe = document.querySelector('iframe')
    const html = `<${tagName} data-vid="${newNode.id}"></${tagName}>`
    iframe?.contentWindow?.postMessage(
      { source: 'edit-bridge', type: 'append-html', vid: node.id, payload: html },
      '*'
    )
  }

  if (node.type === 'text') {
    const text = node.textContent?.trim()
    if (!text) return null
    return (
      <button
        className={`flex items-center gap-2 w-full px-2 py-0.5 text-[11px] rounded transition-colors ${
          isSelected ? 'bg-[#e94560]/15 text-[#e94560]' : 'text-[#888] hover:bg-[#383838]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 12}px`, height: '28px' }}
        onClick={handleClick}
      >
        <Type size={10} />
        <span className="truncate">{text.substring(0, 30)}{text.length > 30 ? '...' : ''}</span>
      </button>
    )
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 w-full px-2 text-[11px] rounded cursor-pointer group transition-colors ${
          isSelected ? 'bg-[#e94560]/15 text-[#e94560]' : 'text-[#a0a0a0] hover:bg-[#383838]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px`, height: '28px' }}
        onClick={handleClick}
      >
        <Tag size={12} />
        <span className="font-mono">{node.tagName}</span>
        {node.attributes?.class && (
          <span className="text-[#666] text-[10px]">.{node.attributes.class.split(' ')[0]}</span>
        )}
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowAddMenu(!showAddMenu) }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#4a4a4a] text-[#888] transition-opacity"
            title="Add child element"
          >
            <Plus size={12} />
          </button>
          {showAddMenu && (
            <div
              className="absolute right-0 top-6 z-50 bg-[#2c2c2c] border border-[#3e3e3e] rounded shadow-lg p-1 grid grid-cols-3 gap-1 w-40"
              onClick={(e) => e.stopPropagation()}
            >
              {COMMON_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => handleAddChild(e, tag)}
                  className="px-2 py-1 text-[11px] rounded hover:bg-[#383838] text-[#a0a0a0] font-mono"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#e94560]/20 text-[#888] hover:text-[#e94560] transition-opacity"
          title="Delete element"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {node.children?.map((child: any) => (
        <div key={child.id} className="border-l border-[#3e3e3e] ml-3 pl-1">
          <TreeNode node={child} depth={depth + 1} />
        </div>
      ))}
    </div>
  )
}

export function ComponentTree() {
  const { sourceTree } = useEditorStore()

  return (
    <div className="flex flex-col h-1/2 overflow-hidden">
      <div className="px-3 py-2 text-[11px] font-semibold text-[#999] uppercase tracking-wider border-b border-[#3e3e3e]">
        Elements
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sourceTree ? (
          sourceTree.children?.map((child) => (
            <TreeNode key={child.id} node={child} />
          ))
        ) : (
          <p className="text-[11px] text-[#666] px-2 py-4 text-center">Open a project to see elements</p>
        )}
      </div>
    </div>
  )
}
