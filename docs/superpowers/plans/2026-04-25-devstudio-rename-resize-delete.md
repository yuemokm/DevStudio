# DevStudio Rename + Resize Handles + Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the app to DevStudio and add element resize handles (8 directions) plus Delete-key removal in the visual editor preview.

**Architecture:** Resize handles live inside the existing iframe overlay injection script (`getOverlayScript` in `PreviewPanel.tsx`), alongside the existing select/hover/drag/keyboard-nudge code. Delete is bridged from the iframe overlay to the React store via a new `delete-request` message type.

**Tech Stack:** Electron, React, TypeScript, Vite. No automated test framework exists — all verification is manual via `npm run dev`.

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | App metadata: name, description, appId, productName |
| `index.html` | HTML `<title>` |
| `electron/workspace-manager.ts` | Temp workspace directory name |
| `docs/superpowers/plans/2026-04-23-workspace-save-as.md` | Documentation reference to temp dir |
| `docs/superpowers/specs/2026-04-23-workspace-save-design.md` | Documentation reference to temp dir |
| `src/editor/PreviewPanel.tsx` | All resize-handle and delete logic (overlay script + React bridge) |

---

## Testing Strategy

No test framework is configured. Verify each task manually:

1. `npm run dev` to start the app.
2. Open an HTML project (`test-html-project`).
3. Click an element to select it.
4. Verify resize handles appear around the element.
5. Drag handles to resize; verify width/height update live and persist after save/reload.
6. Press Delete key; verify element disappears from preview and source tree.
7. Undo/redo still works for text/attribute changes (regression check).
8. Drag-to-move still works (regression check).

---

### Task 1: Rename metadata in package.json

**Files:**
- Modify: `package.json:2-4`, `package.json:46-47`

- [ ] **Step 1: Edit package.json fields**

```json
{
  "name": "devstudio",
  "version": "0.1.0",
  "description": "DevStudio — A visual editor for HTML, Vue, React, and Astro projects",
```

```json
    "appId": "com.yuemokm.devstudio",
    "productName": "DevStudio",
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: rename app metadata to DevStudio in package.json"
```

---

### Task 2: Rename window title and workspace temp dir

**Files:**
- Modify: `index.html:7`
- Modify: `electron/workspace-manager.ts:58`

- [ ] **Step 1: Change HTML title**

In `index.html` line 7:
```html
    <title>DevStudio</title>
```

- [ ] **Step 2: Change workspace temp directory**

In `electron/workspace-manager.ts` line 58:
```typescript
  const workspacePath = path.join(os.tmpdir(), 'devstudio-workspace', `${projectName}-${hash}`)
```

- [ ] **Step 3: Commit**

```bash
git add index.html electron/workspace-manager.ts
git commit -m "chore: rename window title and workspace temp dir to DevStudio"
```

---

### Task 3: Update documentation references

**Files:**
- Modify: `docs/superpowers/plans/2026-04-23-workspace-save-as.md`
- Modify: `docs/superpowers/specs/2026-04-23-workspace-save-design.md`

- [ ] **Step 1: Replace temp dir name in plan doc**

Search `lumen-workspace` in `docs/superpowers/plans/2026-04-23-workspace-save-as.md` and replace with `devstudio-workspace`.

- [ ] **Step 2: Replace temp dir name in spec doc**

Search `lumen-workspace` in `docs/superpowers/specs/2026-04-23-workspace-save-design.md` and replace with `devstudio-workspace`.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: update workspace temp dir references to devstudio-workspace"
```

---

### Task 4: Add resize handle rendering to overlay script

**Files:**
- Modify: `src/editor/PreviewPanel.tsx` (inside `getOverlayScript` string)

**Context:** The overlay script is a single large template string inside `getOverlayScript()`. All added code goes inside the IIFE, before the final `send('ready', '')`.

- [ ] **Step 1: Add resize handle state variables**

After the existing drag state variables (around line 26 in the overlay script), add:

```js
      // Resize handle state
      let isResizing = false;
      let resizeDir = '';
      let resizeStartX = 0;
      let resizeStartY = 0;
      let resizeStartWidth = 0;
      let resizeStartHeight = 0;
      let resizeStartTranslateX = 0;
      let resizeStartTranslateY = 0;
```

- [ ] **Step 2: Add resize handle helper functions**

After the existing `setTranslate` function, add:

```js
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
```

- [ ] **Step 3: Wire up handle creation on select and removal on unselect**

In the `click` handler (where `selectedEl = target`), after `outline(selectedEl, '#e94560', 3)` and `selectedEl.style.cursor = 'move'`, add:
```js
        createResizeHandles(selectedEl);
```

In the `click` handler's unselect branch (where `selectedEl = null`), before `send('unselect', '')`, add:
```js
          removeResizeHandles();
```

In the `mouseout` handler (where hoverEl is cleared), no changes needed.

In the `set-style` / `set-attr` bridge handler, after updating style, add a call to update handles if the element is selected:
```js
        } else if (type === 'set-style') {
          el.style[payload.property] = payload.value;
          if (payload.property === 'transform') {
            const t = getTranslate(el);
            currentTranslateX = t.x;
            currentTranslateY = t.y;
          }
          if (el === selectedEl) updateResizeHandles();
        }
```

Also in the `set-attr` handler, if setting `style` attribute:
```js
        } else if (type === 'set-attr') {
          el.setAttribute(payload.name, payload.value);
          if (payload.name === 'style' && payload.value.includes('translate')) {
            const t = getTranslate(el);
            currentTranslateX = t.x;
            currentTranslateY = t.y;
          }
          if (el === selectedEl) updateResizeHandles();
        }
```

- [ ] **Step 4: Add scroll/resize listeners to keep handles in sync**

After the event listeners, add:
```js
      window.addEventListener('scroll', updateResizeHandles, true);
      window.addEventListener('resize', updateResizeHandles);
```

- [ ] **Step 5: Commit**

```bash
git add src/editor/PreviewPanel.tsx
git commit -m "feat: add resize handle rendering to iframe overlay"
```

---

### Task 5: Add resize drag interaction to overlay script

**Files:**
- Modify: `src/editor/PreviewPanel.tsx` (inside `getOverlayScript` string)

- [ ] **Step 1: Add mousemove resize handling**

In the existing `mousemove` handler, at the very top (before the drag-move code), add:

```js
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

        // existing drag-move code continues...
```

- [ ] **Step 2: Add mouseup resize finalization**

In the existing `mouseup` handler, at the very top (before the drag-end code), add:

```js
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

        // existing drag-end code continues...
```

- [ ] **Step 3: Commit**

```bash
git add src/editor/PreviewPanel.tsx
git commit -m "feat: add resize drag interaction to iframe overlay"
```

---

### Task 6: Add Delete key support in overlay script

**Files:**
- Modify: `src/editor/PreviewPanel.tsx` (inside `getOverlayScript` string)

- [ ] **Step 1: Add Delete key handler in overlay script keydown**

In the existing `keydown` handler (where arrow keys are handled), before the arrow-key logic, add:

```js
        if (e.key === 'Delete') {
          e.preventDefault();
          const vidToDelete = dragVid;
          if (selectedEl) {
            clearOutline(selectedEl);
            selectedEl.style.cursor = '';
            selectedEl = null;
          }
          removeResizeHandles();
          hoverEl = null;
          send('delete-request', vidToDelete);
          return;
        }
```

- [ ] **Step 2: Commit**

```bash
git add src/editor/PreviewPanel.tsx
git commit -m "feat: add Delete key support in iframe overlay"
```

---

### Task 7: Bridge delete-request from iframe to React store

**Files:**
- Modify: `src/editor/PreviewPanel.tsx` (React message handler)

- [ ] **Step 1: Handle delete-request in React message handler**

In the `handleMessage` callback inside the `useEffect` that listens for `message` events, add a new branch after the `style-change` handler:

```typescript
      } else if (type === 'delete-request') {
        const { removeNode } = useEditorStore.getState()
        if (vid) {
          removeNode(vid)
          // Also tell the iframe to remove the element from the live DOM
          const iframe = iframeRef.current
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(
              { source: 'edit-bridge', type: 'remove', vid },
              '*'
            )
          }
        }
      }
```

- [ ] **Step 2: Add external Delete key listener (iframe not focused)**

Add a new `useEffect` in the `PreviewPanel` component (after the existing effects, before the render):

```typescript
  // External Delete key handler (when iframe is not focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete') {
        const { selectedVid, removeNode } = useEditorStore.getState()
        if (selectedVid) {
          removeNode(selectedVid)
          const iframe = iframeRef.current
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(
              { source: 'edit-bridge', type: 'remove', vid: selectedVid },
              '*'
            )
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
```

- [ ] **Step 3: Commit**

```bash
git add src/editor/PreviewPanel.tsx
git commit -m "feat: bridge delete-request from iframe overlay to React store"
```

---

### Task 8: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait for the Electron window to open.

- [ ] **Step 2: Open HTML test project**

Click "Open Project", choose `test-html-project`.

- [ ] **Step 3: Test resize handles**

1. Click any element in the preview — verify 8 red handles appear around it.
2. Drag the corner handles — verify element resizes diagonally.
3. Drag edge handles — verify element resizes in one axis.
4. Drag from left/top handles — verify the opposite edge stays fixed (translate compensates).
5. Try to resize below 10px — verify it stops at the minimum.
6. Save the project and reload — verify resized dimensions persist.

- [ ] **Step 4: Test Delete key**

1. Select an element.
2. Press Delete key — verify element disappears from preview.
3. Save and reopen — verify element is gone from source.
4. Click a side panel (to defocus iframe), then press Delete with an element selected from the component tree — verify it also deletes.

- [ ] **Step 5: Regression checks**

1. Drag-to-move still works.
2. Arrow-key nudge still works.
3. Undo/redo for text edits still works.
4. Undo/redo for style changes still works.

- [ ] **Step 6: Commit any fixes**

If any issues are found, fix them and commit:
```bash
git add src/editor/PreviewPanel.tsx
git commit -m "fix: address resize/delete verification issues"
```

---

## Spec Coverage Check

| Spec Requirement | Implementing Task |
|-----------------|------------------|
| Rename `package.json` fields | Task 1 |
| Rename `index.html` title | Task 2 |
| Rename workspace temp dir | Task 2 |
| Update docs references | Task 3 |
| 8-direction resize handles rendering | Task 4 |
| Resize drag interaction with min 10px | Task 5 |
| Handle sync on scroll/resize/style changes | Task 4 |
| Delete key in iframe overlay | Task 6 |
| Bridge delete-request to React store | Task 7 |
| External Delete key fallback | Task 7 |

## Self-Review

- **Placeholder scan:** No TBD/TODO placeholders. All code is concrete.
- **Type consistency:** Message types used: `delete-request` (iframe→React), `remove` (React→iframe bridge). These match the existing `remove` handler already present in the overlay script.
- **Scope:** Rename + resize + delete only. No unrelated changes.
