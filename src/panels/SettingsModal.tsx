import { useEditorStore } from '../store/editor-store'
import { X, Sun, Moon } from 'lucide-react'

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useEditorStore()

  if (!open) return null

  const bg = theme === 'dark' ? '#2c2c2c' : '#fff'
  const border = theme === 'dark' ? '#3e3e3e' : '#e5e7eb'
  const textPrimary = theme === 'dark' ? '#e6e6e6' : '#111'
  const textSecondary = theme === 'dark' ? '#999' : '#555'
  const muted = theme === 'dark' ? '#888' : '#666'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-80 rounded-lg border shadow-xl p-4 space-y-4"
        style={{ background: bg, borderColor: border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: textPrimary }}>
            Settings
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-500/10 transition-colors"
            style={{ color: muted }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: textSecondary }}>
              Theme
            </span>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-colors"
              style={{
                background: theme === 'dark' ? '#383838' : '#f3f4f6',
                borderColor: border,
                color: textPrimary,
              }}
            >
              {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
