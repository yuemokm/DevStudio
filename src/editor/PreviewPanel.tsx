import { useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '../store/editor-store'
import { parseHTML, injectVids, getNodeByVid, updateNodeAttr } from '../parsers/html-parser'

function getOverlayScript(isEditable: boolean) {
  return `
    (function() {
      if (window.__editOverlay) return;
      window.__editOverlay = true;

      // Hide Astro dev toolbar and other framework-specific overlays in editor preview
      const hideOverlayStyle = document.createElement('style');
      hideOverlayStyle.textContent = 'astro-dev-toolbar, vite-error-overlay { display: none !important; }';
      document.head.appendChild(hideOverlayStyle);

      let selectedEl = null;
      let hoverEl = null;
      const isEditable = ${isEditable};

      // Drag state
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let elStartX = 0;
      let elStartY = 0;
      let currentTranslateX = 0;
      let currentTranslateY = 0;
      let dragVid = '';

      // Resize handle state
      let isResizing = false;
      let resizeDir = '';
      let resizeStartX = 0;
      let resizeStartY = 0;
      let resizeStartWidth = 0;
      let resizeStartHeight = 0;
      let resizeStartTranslateX = 0;
      let resizeStartTranslateY = 0;

      function getVid(el) {
        return el?.getAttribute?.('data-vid') || getPath(el);
      }

      function getPath(el) {
        if (!el || el === document.body) return '';
        const tag = el.tagName.toLowerCase();
        const parent = el.parentElement;
        if (!parent) return tag;
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        const index = siblings.indexOf(el);
        const path = (siblings.length > 1 ? tag + ':nth-of-type(' + (index + 1) + ')' : tag);
        return getPath(parent) + ' > ' + path;
      }

      function send(type, vid, payload) {
        window.parent.postMessage({ type, vid, payload, source: 'edit-overlay' }, '*');
      }

      function outline(el, color, w) {
        if (!el) return;
        el.style.outline = (w || 2) + 'px solid ' + color;
        el.style.outlineOffset = '0px';
      }

      function clearOutline(el) {
        if (!el) return;
        el.style.outline = '';
        el.style.outlineOffset = '';
      }

      function getTarget(e) {
        if (!isEditable) return e.target;
        return e.target.closest('[data-vid]');
      }

      // Parse current transform translate values
      function getTranslate(el) {
        const style = window.getComputedStyle(el);
        const transform = style.transform;
        if (transform === 'none') return { x: 0, y: 0 };
        const matrix = new DOMMatrix(transform);
        return { x: matrix.m41, y: matrix.m42 };
      }

      function setTranslate(el, x, y) {
        el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      }

      const HANDLE_SIZE = 8;

      function createResizeHandles(el) {
        removeResizeHandles();
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const container = document.createElement('div');
        container.id = '__resize-handles';
        container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10000;';

        const positions = [
          { dir: 'nw', x: rect.left - HANDLE_SIZE/2, y: rect.top - HANDLE_SIZE/2, cursor: 'nw-resize' },
          { dir: 'n', x: rect.left + rect.width/2 - HANDLE_SIZE/2, y: rect.top - HANDLE_SIZE/2, cursor: 'n-resize' },
          { dir: 'ne', x: rect.right - HANDLE_SIZE/2, y: rect.top - HANDLE_SIZE/2, cursor: 'ne-resize' },
          { dir: 'w', x: rect.left - HANDLE_SIZE/2, y: rect.top + rect.height/2 - HANDLE_SIZE/2, cursor: 'w-resize' },
          { dir: 'e', x: rect.right - HANDLE_SIZE/2, y: rect.top + rect.height/2 - HANDLE_SIZE/2, cursor: 'e-resize' },
          { dir: 'sw', x: rect.left - HANDLE_SIZE/2, y: rect.bottom - HANDLE_SIZE/2, cursor: 'sw-resize' },
          { dir: 's', x: rect.left + rect.width/2 - HANDLE_SIZE/2, y: rect.bottom - HANDLE_SIZE/2, cursor: 's-resize' },
          { dir: 'se', x: rect.right - HANDLE_SIZE/2, y: rect.bottom - HANDLE_SIZE/2, cursor: 'se-resize' },
        ];

        positions.forEach(function(p) {
          const handle = document.createElement('div');
          handle.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + HANDLE_SIZE + 'px;height:' + HANDLE_SIZE + 'px;background:#e94560;border:1px solid white;border-radius:1px;pointer-events:auto;cursor:' + p.cursor + ';';
          handle.dataset.dir = p.dir;

          handle.addEventListener('mousedown', function(e) {
            if (!isEditable) return;
            isResizing = true;
            resizeDir = p.dir;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            resizeStartWidth = selectedEl.offsetWidth;
            resizeStartHeight = selectedEl.offsetHeight;
            const t = getTranslate(selectedEl);
            resizeStartTranslateX = t.x;
            resizeStartTranslateY = t.y;
            e.preventDefault();
            e.stopPropagation();
          });

          container.appendChild(handle);
        });

        document.body.appendChild(container);
      }

      function removeResizeHandles() {
        const existing = document.getElementById('__resize-handles');
        if (existing) existing.remove();
      }

      function updateResizeHandles() {
        if (!selectedEl) {
          removeResizeHandles();
          return;
        }
        createResizeHandles(selectedEl);
      }

      // --- Hover ---
      document.addEventListener('mouseover', function(e) {
        if (isDragging) return;
        const target = getTarget(e);
        if (!target) return;
        if (hoverEl && hoverEl !== selectedEl) clearOutline(hoverEl);
        hoverEl = target;
        if (hoverEl !== selectedEl) {
          outline(hoverEl, '#3b82f6', 2);
          hoverEl.style.cursor = isEditable ? 'move' : 'default';
        }
        e.stopPropagation();
      }, true);

      document.addEventListener('mouseout', function(e) {
        if (isDragging) return;
        if (hoverEl && hoverEl !== selectedEl) {
          clearOutline(hoverEl);
          hoverEl.style.cursor = '';
        }
        hoverEl = null;
      }, true);

      // --- Click to select ---
      document.addEventListener('click', function(e) {
        if (isDragging) return;
        const target = getTarget(e);
        if (!target) {
          if (selectedEl) {
            clearOutline(selectedEl);
            selectedEl.style.cursor = '';
          }
          removeResizeHandles();
          selectedEl = null;
          send('unselect', '');
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (selectedEl) {
          clearOutline(selectedEl);
          selectedEl.style.cursor = '';
        }
        selectedEl = target;
        outline(selectedEl, '#e94560', 3);
        selectedEl.style.cursor = 'move';
        createResizeHandles(selectedEl);
        const t = getTranslate(selectedEl);
        currentTranslateX = t.x;
        currentTranslateY = t.y;
        const rect = selectedEl.getBoundingClientRect();
        dragVid = getVid(selectedEl);
        send('select', dragVid, {
          tagName: selectedEl.tagName.toLowerCase(),
          textContent: selectedEl.textContent?.substring(0, 200) || '',
          attributes: Object.fromEntries([...selectedEl.attributes].map(a => [a.name, a.value]).filter(([k]) => k !== 'data-vid')),
          styles: Object.fromEntries([...selectedEl.style].map(k => [k, selectedEl.style.getPropertyValue(k)]).filter(([_, v]) => v)),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        });
      }, true);

      // --- Drag to move (PS style) ---
      document.addEventListener('mousedown', function(e) {
        if (!isEditable) return;
        const target = e.target.closest('[data-vid]');
        if (!target) return;
        if (target !== selectedEl) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const t = getTranslate(target);
        elStartX = t.x;
        elStartY = t.y;
        target.style.transition = 'none';
        target.style.zIndex = '9999';
        e.preventDefault();
        e.stopPropagation();
      }, true);

      document.addEventListener('mousemove', function(e) {
        if (isResizing && selectedEl) {
          const dx = e.clientX - resizeStartX;
          const dy = e.clientY - resizeStartY;

          let newWidth = resizeStartWidth;
          let newHeight = resizeStartHeight;
          let newTranslateX = resizeStartTranslateX;
          let newTranslateY = resizeStartTranslateY;

          if (resizeDir.indexOf('e') >= 0) newWidth = resizeStartWidth + dx;
          if (resizeDir.indexOf('w') >= 0) {
            newWidth = resizeStartWidth - dx;
            newTranslateX = resizeStartTranslateX + dx;
          }
          if (resizeDir.indexOf('s') >= 0) newHeight = resizeStartHeight + dy;
          if (resizeDir.indexOf('n') >= 0) {
            newHeight = resizeStartHeight - dy;
            newTranslateY = resizeStartTranslateY + dy;
          }

          if (newWidth < 10) newWidth = 10;
          if (newHeight < 10) newHeight = 10;

          selectedEl.style.width = newWidth + 'px';
          selectedEl.style.height = newHeight + 'px';
          setTranslate(selectedEl, newTranslateX, newTranslateY);
          updateResizeHandles();

          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (!isDragging || !selectedEl) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        currentTranslateX = elStartX + dx;
        currentTranslateY = elStartY + dy;
        setTranslate(selectedEl, currentTranslateX, currentTranslateY);
        // Send live position update
        send('drag-move', dragVid, {
          x: Math.round(currentTranslateX),
          y: Math.round(currentTranslateY)
        });
        e.preventDefault();
        e.stopPropagation();
      }, true);

      document.addEventListener('mouseup', function(e) {
        if (isResizing && selectedEl) {
          isResizing = false;
          send('style-change', dragVid, {
            property: 'width',
            value: selectedEl.style.width
          });
          send('style-change', dragVid, {
            property: 'height',
            value: selectedEl.style.height
          });
          send('style-change', dragVid, {
            property: 'transform',
            value: selectedEl.style.transform
          });
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (!isDragging || !selectedEl) return;
        isDragging = false;
        selectedEl.style.transition = '';
        selectedEl.style.zIndex = '';
        // Finalize: send set-style so parent can persist it
        send('style-change', dragVid, {
          property: 'transform',
          value: 'translate(' + Math.round(currentTranslateX) + 'px, ' + Math.round(currentTranslateY) + 'px)'
        });
        e.preventDefault();
        e.stopPropagation();
      }, true);

      // --- Keyboard nudge (arrow keys) ---
      document.addEventListener('keydown', function(e) {
        if (!isEditable || !selectedEl) return;
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp') dy = -step;
        else if (e.key === 'ArrowDown') dy = step;
        else return;
        e.preventDefault();
        currentTranslateX += dx;
        currentTranslateY += dy;
        setTranslate(selectedEl, currentTranslateX, currentTranslateY);
        send('style-change', dragVid, {
          property: 'transform',
          value: 'translate(' + Math.round(currentTranslateX) + 'px, ' + Math.round(currentTranslateY) + 'px)'
        });
      }, true);

      // --- Parent messages ---
      window.addEventListener('message', function(e) {
        if (e.data?.source !== 'edit-bridge') return;
        const { type, vid, payload } = e.data;
        let el = null;
        if (vid.startsWith('v')) {
          el = document.querySelector('[data-vid="' + vid + '"]');
        }
        if (!el && vid) {
          try { el = document.querySelector(vid); } catch(e) {}
        }
        if (!el) return;

        if (type === 'set-text') {
          el.textContent = payload;
        } else if (type === 'set-attr') {
          el.setAttribute(payload.name, payload.value);
          // If setting style attribute, update drag state for transform
          if (payload.name === 'style' && payload.value.includes('translate')) {
            const t = getTranslate(el);
            currentTranslateX = t.x;
            currentTranslateY = t.y;
          }
          if (el === selectedEl) updateResizeHandles();
        } else if (type === 'set-style') {
          el.style[payload.property] = payload.value;
          // If setting transform, update drag state
          if (payload.property === 'transform') {
            const t = getTranslate(el);
            currentTranslateX = t.x;
            currentTranslateY = t.y;
          }
          if (el === selectedEl) updateResizeHandles();
        } else if (type === 'highlight') {
          if (selectedEl) clearOutline(selectedEl);
          selectedEl = el;
          outline(selectedEl, '#e94560', 3);
          selectedEl.style.cursor = 'move';
          const t = getTranslate(selectedEl);
          currentTranslateX = t.x;
          currentTranslateY = t.y;
          dragVid = vid;
        } else if (type === 'unhighlight') {
          if (selectedEl) {
            clearOutline(selectedEl);
            selectedEl.style.cursor = '';
          }
          selectedEl = null;
        } else if (type === 'remove') {
          if (el) {
            if (selectedEl === el) {
              clearOutline(selectedEl);
              selectedEl.style.cursor = '';
              selectedEl = null;
            }
            el.remove();
          }
        } else if (type === 'append-html') {
          if (el) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = payload;
            while (wrapper.firstChild) {
              el.appendChild(wrapper.firstChild);
            }
          }
        }
      });

      window.addEventListener('scroll', updateResizeHandles, true);
      window.addEventListener('resize', updateResizeHandles);

      send('ready', '');
    })();
  `
}

export function PreviewPanel() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isInjectingRef = useRef(false)
  const { previewUrl, project, selectedVid, selectElement, setSourceTree, setError } = useEditorStore()

  const injectOverlay = useCallback(async (editable = false) => {
    if (isInjectingRef.current) return
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return
    isInjectingRef.current = true

    try {
      const doc = iframe.contentWindow.document
      const script = doc.createElement('script')
      script.textContent = getOverlayScript(editable)
      doc.head.appendChild(script)
    } catch (err: any) {
      // Cross-origin fallback: use main process to inject script into iframe via WebFrameMain
      const currentPreviewUrl = useEditorStore.getState().previewUrl
      if (window.electronAPI?.injectOverlayScript && currentPreviewUrl) {
        const script = getOverlayScript(editable)
        await window.electronAPI.injectOverlayScript(script, currentPreviewUrl)
      }
    } finally {
      isInjectingRef.current = false
    }
  }, [])

  // Load HTML content directly into iframe (same-origin, no CORS issues)
  useEffect(() => {
    if (!previewUrl || !project) return
    if (project.framework !== 'html') return

    const iframe = iframeRef.current
    if (!iframe) return

    const loadHTML = async () => {
      if (!window.electronAPI) {
        setError('Electron API not available')
        return
      }

      try {
        const html = await window.electronAPI.readFile(project.entryFile)
        const { tree, modifiedHTML } = injectVids(parseHTML(html))
        setSourceTree(tree)

        // Inject <base> tag so relative image/asset paths resolve correctly.
        // Use the local dev server URL instead of file:// to avoid security restrictions.
        const baseUrl = previewUrl.endsWith('/') ? previewUrl : previewUrl + '/'
        const baseTag = `<base href="${baseUrl}">`
        let htmlWithBase = modifiedHTML
        if (/<base\s/i.test(htmlWithBase)) {
          // Replace existing base tag
          htmlWithBase = htmlWithBase.replace(/<base\s[^>]*>/i, baseTag)
        } else if (/<head[^>]*>/i.test(htmlWithBase)) {
          htmlWithBase = htmlWithBase.replace(/(<head[^>]*>)/i, '$1' + baseTag)
        } else if (/<\/head>/i.test(htmlWithBase)) {
          htmlWithBase = htmlWithBase.replace(/<\/head>/i, baseTag + '</head>')
        } else if (/<html[^>]*>/i.test(htmlWithBase)) {
          htmlWithBase = htmlWithBase.replace(/(<html[^>]*>)/i, '$1<head>' + baseTag + '</head>')
        } else {
          htmlWithBase = '<head>' + baseTag + '</head>' + htmlWithBase
        }

        const doc = iframe.contentWindow?.document
        if (doc) {
          doc.open()
          doc.write(htmlWithBase)
          doc.close()
          requestAnimationFrame(() => injectOverlay(true))
        }
      } catch (err: any) {
        setError('Failed to load HTML: ' + err.message)
        console.error('Failed to load HTML project:', err)
      }
    }

    loadHTML()
  }, [previewUrl, project, setSourceTree, injectOverlay, setError])

  // For Vue: inject editable overlay when iframe loads from dev server
  // For Astro/React: inject read-only overlay
  useEffect(() => {
    if (!previewUrl || !project) return
    if (project.framework === 'html') return

    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      const editable = project.framework === 'vue' || project.framework === 'react' || project.framework === 'astro'
      injectOverlay(editable)
    }

    iframe.addEventListener('load', handleLoad)
    // If iframe already loaded (fast local dev server), trigger immediately
    if (iframe.contentDocument?.readyState === 'complete') {
      handleLoad()
    }
    return () => iframe.removeEventListener('load', handleLoad)
  }, [previewUrl, project, injectOverlay])

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.source !== 'edit-overlay') return
      const { type, vid, payload } = e.data

      if (type === 'select') {
        selectElement(vid, payload)
      } else if (type === 'unselect') {
        selectElement(null)
      } else if (type === 'drag-move') {
        // Live preview of drag position
        const { selectedElement } = useEditorStore.getState()
        if (selectedElement) {
          useEditorStore.getState().selectElement(vid, {
            ...selectedElement,
            styles: { ...selectedElement.styles, transform: 'translate(' + payload.x + 'px, ' + payload.y + 'px)' }
          })
        }
      } else if (type === 'style-change') {
        const iframe = iframeRef.current
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            { source: 'edit-bridge', type: 'set-style', vid, payload: { property: payload.property, value: payload.value } },
            '*'
          )
        }
        // Sync drag/keyboard nudge transform to AST
        const { sourceTree, setSourceTree, executeCommand } = useEditorStore.getState()
        if (sourceTree && vid) {
          const node = getNodeByVid(sourceTree, vid)
          const currentStyle = node?.attributes?.style || ''
          const styleMap: Record<string, string> = {}
          if (currentStyle) {
            currentStyle.split(';').forEach((s) => {
              const idx = s.indexOf(':')
              if (idx > 0) {
                const k = s.slice(0, idx).trim()
                const v = s.slice(idx + 1).trim()
                if (k && v) styleMap[k] = v
              }
            })
          }
          if (payload.value) {
            styleMap[payload.property] = payload.value
          } else {
            delete styleMap[payload.property]
          }
          const newStyleString = Object.entries(styleMap)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ')
          setSourceTree(updateNodeAttr(sourceTree, vid, 'style', newStyleString))
          executeCommand({ type: 'style', vid, property: '', prev: currentStyle, next: newStyleString })
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [selectElement])

  // Sync selection highlight to iframe
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage(
      { source: 'edit-bridge', type: selectedVid ? 'highlight' : 'unhighlight', vid: selectedVid || '' },
      '*'
    )
  }, [selectedVid])

  // Listen for undo/redo events from store and sync to iframe
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: 'undo' | 'redo'; command: { type: string; vid: string; property: string; prev: any; next: any } }
      const { type: actionType, command } = detail
      const iframe = iframeRef.current
      if (!iframe?.contentWindow) return
      const value = actionType === 'undo' ? command.prev : command.next
      if (command.type === 'text') {
        iframe.contentWindow.postMessage(
          { source: 'edit-bridge', type: 'set-text', vid: command.vid, payload: value },
          '*'
        )
      } else if (command.type === 'attr') {
        iframe.contentWindow.postMessage(
          { source: 'edit-bridge', type: 'set-attr', vid: command.vid, payload: { name: command.property, value } },
          '*'
        )
      } else if (command.type === 'style') {
        // Send full style string via set-attr so overlay sets the inline style attribute
        iframe.contentWindow.postMessage(
          { source: 'edit-bridge', type: 'set-attr', vid: command.vid, payload: { name: 'style', value } },
          '*'
        )
      }
    }
    window.addEventListener('editor-undo-redo', handler)
    return () => window.removeEventListener('editor-undo-redo', handler)
  }, [])

  // HMR overlay re-injection for Vue/React/Astro: if HMR wipes the overlay script, re-inject it
  useEffect(() => {
    if (project?.framework !== 'vue' && project?.framework !== 'react' && project?.framework !== 'astro') return
    const interval = setInterval(async () => {
      const iframe = iframeRef.current
      if (!iframe?.contentWindow) return
      try {
        // Same-origin check (HTML projects or same-origin dev server)
        if ((iframe.contentWindow as any).__editOverlay) return
        await injectOverlay(true)
      } catch {
        // Cross-origin fallback: always re-inject via IPC (overlay script has its own dedup check)
        const currentPreviewUrl = useEditorStore.getState().previewUrl
        if (window.electronAPI?.injectOverlayScript && currentPreviewUrl) {
          const script = getOverlayScript(true)
          await window.electronAPI.injectOverlayScript(script, currentPreviewUrl)
        }
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [project, injectOverlay])

  if (!previewUrl) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{
          backgroundColor: '#1e1e1e',
          backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        <div className="text-center text-[#999]">
          <p className="text-lg mb-2">No project open</p>
          <p className="text-sm">Click "Open" to load a project</p>
        </div>
      </div>
    )
  }

  const isReadOnly = project?.framework !== 'html' && project?.framework !== 'vue' && project?.framework !== 'react' && project?.framework !== 'astro'

  // For HTML: src="about:blank" to allow same-origin document access
  // For frameworks: src=previewUrl to load dev server
  const iframeSrc = project?.framework === 'html' ? 'about:blank' : previewUrl

  return (
    <div className="flex-1 p-4 flex flex-col min-w-0">
      {isReadOnly && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 text-yellow-200 px-4 py-2 text-sm rounded mb-2 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400"></span>
          {project?.framework} preview mode — editing is limited (full {project?.framework} support coming in Phase 2/3)
        </div>
      )}
      {!isReadOnly && (
        <div className="text-[10px] text-[#666] px-2 py-1 mb-1">
          Drag to move. Arrow keys to nudge (Shift = 10px).
        </div>
      )}
      <div className="flex-1 overflow-hidden shadow-2xl border border-[#3e3e3e]">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          className="w-full h-full bg-white"
          style={{ border: 'none' }}
        />
      </div>
    </div>
  )
}
