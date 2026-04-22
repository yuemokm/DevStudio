import { useEditorStore } from '../store/editor-store'
import { useState, useEffect } from 'react'
import { Image as ImageIcon, Text, Hash, Info, Plus } from 'lucide-react'
import { updateNodeAttr, updateElementText } from '../parsers/html-parser'
import { CollapsibleSection as Section } from '../components/CollapsibleSection'

export function PropertiesPanel() {
  const { selectedElement, selectedVid, project } = useEditorStore()
  const [text, setText] = useState('')
  const [attrs, setAttrs] = useState<Record<string, string>>({})
  const [newAttrName, setNewAttrName] = useState('')
  const [newAttrValue, setNewAttrValue] = useState('')
  const [showAddAttr, setShowAddAttr] = useState(false)

  useEffect(() => {
    if (selectedElement) {
      setText(selectedElement.textContent || '')
      setAttrs(selectedElement.attributes || {})
      setNewAttrName('')
      setNewAttrValue('')
      setShowAddAttr(false)
    }
  }, [selectedElement])

  const handleTextChange = (newText: string) => {
    const prevText = text
    setText(newText)
    const iframe = document.querySelector('iframe')
    iframe?.contentWindow?.postMessage(
      { source: 'edit-bridge', type: 'set-text', vid: selectedVid, payload: newText },
      '*'
    )
    const { sourceTree, setSourceTree, executeCommand } = useEditorStore.getState()
    if (sourceTree && selectedVid) {
      setSourceTree(updateElementText(sourceTree, selectedVid, newText))
      executeCommand({ type: 'text', vid: selectedVid, property: '', prev: prevText, next: newText })
    }
  }

  const handleAttrChange = (name: string, value: string) => {
    const prevValue = attrs[name] || ''
    const newAttrs = { ...attrs, [name]: value }
    setAttrs(newAttrs)
    const iframe = document.querySelector('iframe')
    iframe?.contentWindow?.postMessage(
      { source: 'edit-bridge', type: 'set-attr', vid: selectedVid, payload: { name, value } },
      '*'
    )
    const { sourceTree, setSourceTree, executeCommand } = useEditorStore.getState()
    if (sourceTree && selectedVid) {
      setSourceTree(updateNodeAttr(sourceTree, selectedVid, name, value))
      executeCommand({ type: 'attr', vid: selectedVid, property: name, prev: prevValue, next: value })
    }
  }

  const handleAddAttr = () => {
    if (!newAttrName.trim()) return
    const name = newAttrName.trim()
    const value = newAttrValue
    handleAttrChange(name, value)
    setNewAttrName('')
    setNewAttrValue('')
    setShowAddAttr(false)
  }

  if (!selectedElement) {
    return (
      <div className="flex flex-col">
        <p className="text-[11px] text-[#666] px-4 py-8 text-center">Select an element to edit</p>
      </div>
    )
  }

  const isImage = selectedElement.tagName === 'img'
  const classValue = attrs.class || attrs.className || ''
  const otherAttrs = Object.entries(attrs).filter(([k]) => k !== 'data-vid' && k !== 'style' && k !== 'class' && k !== 'className')

  const inputClass = "w-full bg-[#383838] border border-[#444444] rounded px-2 py-1 text-[11px] text-[#e6e6e6] focus:border-[#e94560] outline-none transition-colors"

  return (
    <div className="flex flex-col">
      <Section title="Info" icon={Hash}>
        <div className="flex items-center gap-2 text-[11px] text-[#a0a0a0]">
          <span className="font-mono text-[#e6e6e6]">{selectedElement.tagName}</span>
        </div>
      </Section>

      <Section title="Content" icon={isImage ? ImageIcon : Text}>
        {!isImage && (
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            className={inputClass + " resize-none"}
            rows={3}
          />
        )}
        {isImage && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={attrs.src || ''}
                onChange={(e) => handleAttrChange('src', e.target.value)}
                className={"flex-1 " + inputClass}
              />
              <button
                onClick={async () => {
                  if (!window.electronAPI || !project) return
                  const relativePath = await window.electronAPI.selectImageFile(project.path)
                  if (relativePath) {
                    handleAttrChange('src', relativePath)
                  }
                }}
                className="px-3 py-1 bg-[#383838] hover:bg-[#4a4a4a] rounded text-[11px] text-[#e6e6e6] transition-colors border border-[#444444]"
                title="Select local image file"
              >
                Browse...
              </button>
            </div>
            <p className="text-[10px] text-[#666]">
              Enter a URL or click Browse to select a local image from the project folder.
            </p>
          </div>
        )}
      </Section>

      {classValue && (
        <Section title="Classes" icon={Info}>
          <div className="bg-[#383838] border border-[#444444] rounded px-2 py-1 text-[11px] text-[#888] font-mono">
            {classValue}
          </div>
          <p className="text-[10px] text-[#666]">
            Class names reference external CSS styles. Edit the CSS file directly to change styles.
          </p>
        </Section>
      )}

      <Section title="Attributes" icon={Hash} defaultOpen={otherAttrs.length > 0}>
        <div className="space-y-2">
          {otherAttrs.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-[11px] text-[#888] font-mono w-16 shrink-0 pt-1.5">{key}</span>
              <input
                type="text"
                value={value}
                onChange={(e) => handleAttrChange(key, e.target.value)}
                className={"flex-1 " + inputClass}
              />
            </div>
          ))}
          {showAddAttr ? (
            <div className="flex gap-2 items-start">
              <input
                type="text"
                placeholder="name"
                value={newAttrName}
                onChange={(e) => setNewAttrName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddAttr() }}
                className={"w-20 " + inputClass}
              />
              <input
                type="text"
                placeholder="value"
                value={newAttrValue}
                onChange={(e) => setNewAttrValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddAttr() }}
                className={"flex-1 " + inputClass}
              />
              <button
                onClick={handleAddAttr}
                className="px-2 py-1 bg-[#383838] hover:bg-[#4a4a4a] rounded text-[11px] text-[#e6e6e6] border border-[#444444]"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddAttr(true)}
              className="flex items-center gap-1 text-[11px] text-[#888] hover:text-white transition-colors"
            >
              <Plus size={12} />
              Add attribute
            </button>
          )}
        </div>
      </Section>
    </div>
  )
}
