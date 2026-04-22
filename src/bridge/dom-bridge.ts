export interface BridgeMessage {
  source: 'edit-overlay' | 'edit-bridge'
  type: 'select' | 'hover' | 'text-change' | 'style-change' | 'unselect' | 'ready' | 'set-text' | 'set-attr' | 'set-style' | 'highlight' | 'unhighlight'
  vid: string
  payload?: any
}

export function sendToIframe(message: Omit<BridgeMessage, 'source'>) {
  const iframe = document.querySelector('iframe')
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage({ ...message, source: 'edit-bridge' }, '*')
}
