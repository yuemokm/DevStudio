import { useEditorStore } from '../store/editor-store'
import { useState, useEffect } from 'react'
import { Palette, Type, Layout, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import { updateNodeAttr } from '../parsers/html-parser'
import { CollapsibleSection as Section } from '../components/CollapsibleSection'

const PRESET_COLORS = [
  '#e94560', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
  '#000000', '#ffffff', '#666666', '#999999', '#cccccc',
]

export function StylesPanel() {
  const { selectedElement, selectedVid } = useEditorStore()
  const [styles, setStyles] = useState<Record<string, string>>({})

  useEffect(() => {
    if (selectedElement) {
      setStyles(selectedElement.styles || {})
    }
  }, [selectedElement])

  const updateStyle = (property: string, value: string) => {
    const prevStyles = { ...styles }
    const newStyles = value ? { ...styles, [property]: value } : { ...styles }
    if (!value) delete newStyles[property]
    setStyles(newStyles)
    const iframe = document.querySelector('iframe')
    iframe?.contentWindow?.postMessage(
      { source: 'edit-bridge', type: 'set-style', vid: selectedVid, payload: { property, value } },
      '*'
    )
    const prevStyleString = Object.entries(prevStyles)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ')
    const newStyleString = Object.entries(newStyles)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ')
    const { sourceTree, setSourceTree, executeCommand } = useEditorStore.getState()
    if (sourceTree && selectedVid) {
      setSourceTree(updateNodeAttr(sourceTree, selectedVid, 'style', newStyleString))
      executeCommand({ type: 'style', vid: selectedVid, property: '', prev: prevStyleString, next: newStyleString })
    }
  }

  if (!selectedElement) {
    return (
      <div className="flex flex-col">
        <p className="text-[11px] text-[#666] px-4 py-8 text-center">Select an element to edit styles</p>
      </div>
    )
  }

  const parsePx = (val: string | undefined) => val?.replace('px', '') || ''
  const inputClass = "w-full bg-[#383838] border border-[#444444] rounded px-2 py-1 text-[11px] text-[#e6e6e6] focus:border-[#e94560] outline-none transition-colors"

  return (
    <div className="flex flex-col">
      <Section title="Colors" icon={Palette}>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className={`w-6 h-6 rounded border-2 ${styles.color === c ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              onClick={() => updateStyle('color', c)}
            />
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-[11px] text-[#888]">Text</span>
          <input
            type="color"
            value={styles.color || '#000000'}
            onChange={(e) => updateStyle('color', e.target.value)}
            className="w-8 h-6 bg-transparent border-0 cursor-pointer"
          />
          <span className="text-[11px] text-[#888]">Bg</span>
          <input
            type="color"
            value={styles.backgroundColor || '#ffffff'}
            onChange={(e) => updateStyle('backgroundColor', e.target.value)}
            className="w-8 h-6 bg-transparent border-0 cursor-pointer"
          />
        </div>
      </Section>

      <Section title="Typography" icon={Type}>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Size (px)"
            value={parsePx(styles.fontSize)}
            onChange={(e) => updateStyle('fontSize', e.target.value ? `${e.target.value}px` : '')}
            className={inputClass}
          />
          <select
            value={styles.fontWeight || ''}
            onChange={(e) => updateStyle('fontWeight', e.target.value)}
            className={inputClass}
          >
            <option value="">Weight</option>
            <option value="300">Light</option>
            <option value="400">Normal</option>
            <option value="500">Medium</option>
            <option value="700">Bold</option>
          </select>
        </div>
        <select
          value={styles.textAlign || ''}
          onChange={(e) => updateStyle('textAlign', e.target.value)}
          className={inputClass}
        >
          <option value="">Align</option>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>
      </Section>

      <Section title="Position" icon={Move}>
        <TransformControl styles={styles} updateStyle={updateStyle} />
      </Section>

      <Section title="Spacing" icon={Layout}>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1">
            <ArrowUp size={12} className="text-[#888]" />
            <input
              type="number"
              placeholder="Top"
              value={parsePx(styles.paddingTop)}
              onChange={(e) => updateStyle('paddingTop', e.target.value ? `${e.target.value}px` : '')}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-1">
            <ArrowRight size={12} className="text-[#888]" />
            <input
              type="number"
              placeholder="Right"
              value={parsePx(styles.paddingRight)}
              onChange={(e) => updateStyle('paddingRight', e.target.value ? `${e.target.value}px` : '')}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-1">
            <ArrowDown size={12} className="text-[#888]" />
            <input
              type="number"
              placeholder="Bottom"
              value={parsePx(styles.paddingBottom)}
              onChange={(e) => updateStyle('paddingBottom', e.target.value ? `${e.target.value}px` : '')}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-1">
            <ArrowLeft size={12} className="text-[#888]" />
            <input
              type="number"
              placeholder="Left"
              value={parsePx(styles.paddingLeft)}
              onChange={(e) => updateStyle('paddingLeft', e.target.value ? `${e.target.value}px` : '')}
              className={inputClass}
            />
          </div>
        </div>
        <p className="text-[10px] text-[#666]">Padding (px)</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1">
            <ArrowUp size={12} className="text-[#888]" />
            <input
              type="number"
              placeholder="Top"
              value={parsePx(styles.marginTop)}
              onChange={(e) => updateStyle('marginTop', e.target.value ? `${e.target.value}px` : '')}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-1">
            <ArrowRight size={12} className="text-[#888]" />
            <input
              type="number"
              placeholder="Right"
              value={parsePx(styles.marginRight)}
              onChange={(e) => updateStyle('marginRight', e.target.value ? `${e.target.value}px` : '')}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-1">
            <ArrowDown size={12} className="text-[#888]" />
            <input
              type="number"
              placeholder="Bottom"
              value={parsePx(styles.marginBottom)}
              onChange={(e) => updateStyle('marginBottom', e.target.value ? `${e.target.value}px` : '')}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-1">
            <ArrowLeft size={12} className="text-[#888]" />
            <input
              type="number"
              placeholder="Left"
              value={parsePx(styles.marginLeft)}
              onChange={(e) => updateStyle('marginLeft', e.target.value ? `${e.target.value}px` : '')}
              className={inputClass}
            />
          </div>
        </div>
        <p className="text-[10px] text-[#666]">Margin (px)</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Border radius"
            value={parsePx(styles.borderRadius)}
            onChange={(e) => updateStyle('borderRadius', e.target.value ? `${e.target.value}px` : '')}
            className={inputClass}
          />
          <input
            type="number"
            placeholder="Width"
            value={parsePx(styles.width)}
            onChange={(e) => updateStyle('width', e.target.value ? `${e.target.value}px` : '')}
            className={inputClass}
          />
        </div>
      </Section>
    </div>
  )
}

function parseTransform(transform: string | undefined): { x: string; y: string } {
  if (!transform) return { x: '', y: '' }
  const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)
  if (match) return { x: match[1], y: match[2] }
  return { x: '', y: '' }
}

function buildTransform(x: string, y: string): string {
  const nx = x || '0'
  const ny = y || '0'
  return `translate(${nx}px, ${ny}px)`
}

function TransformControl({ styles, updateStyle }: { styles: Record<string, string>; updateStyle: (p: string, v: string) => void }) {
  const { x, y } = parseTransform(styles.transform)
  const hasTransform = !!styles.transform

  const setX = (val: string) => {
    const newX = val || '0'
    const newY = y || '0'
    updateStyle('transform', buildTransform(newX, newY))
  }

  const setY = (val: string) => {
    const newX = x || '0'
    const newY = val || '0'
    updateStyle('transform', buildTransform(newX, newY))
  }

  const reset = () => {
    updateStyle('transform', '')
  }

  const inputClass = "w-full bg-[#383838] border border-[#444444] rounded px-2 py-1 text-[11px] text-[#e6e6e6] focus:border-[#e94560] outline-none transition-colors"

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#888] w-4">X</span>
          <input
            type="number"
            placeholder="0"
            value={x}
            onChange={(e) => setX(e.target.value)}
            className={inputClass}
          />
          <span className="text-[11px] text-[#666]">px</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#888] w-4">Y</span>
          <input
            type="number"
            placeholder="0"
            value={y}
            onChange={(e) => setY(e.target.value)}
            className={inputClass}
          />
          <span className="text-[11px] text-[#666]">px</span>
        </div>
      </div>
      {hasTransform && (
        <button
          onClick={reset}
          className="text-[11px] text-[#e94560] hover:text-white transition-colors"
        >
          Reset position
        </button>
      )}
      <p className="text-[10px] text-[#666]">
        Drag element in preview or use arrow keys to nudge.
      </p>
    </div>
  )
}
