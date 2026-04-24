# DevStudio

---

A visual editor for HTML, Vue, React, and Astro projects.

Open any frontend project, edit it visually, and see changes in real time.

---

## Features

- **Multi-framework support** — Works with HTML, Vue (SFC), React (JSX/TSX), and Astro
- **Visual editing** — Select elements in the preview, edit text, styles, attributes, and classes
- **Component tree** — Browse and manipulate the DOM structure
- **Undo / Redo** — Full command history with Zustand
- **Dev server integration** — Automatically detects framework and spins up the appropriate dev server
- **Drag to reorder** — Rearrange elements directly in the component tree
- **Image replacement** — Swap image sources with local files

---

## Download

Get the latest release:

- [DevStudio Setup 0.1.0.exe](https://https://github.com/yuemokm/DevStudio/releases/download/v0.1.0/DevStudio%20Setup%200.1.0.exe) — Windows installer

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/yuemokm/DevStudio.git
cd DevStudio

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Build

```bash
# Build renderer + electron main process
npm run build

# Package into distributable app
npm run dist
```

Build artifacts will be placed in `release/`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 35 |
| UI framework | React 19 + Tailwind CSS 4 |
| State management | Zustand |
| Build tool | Vite |
| HTML parsing | parse5 |
| Vue parsing | @vue/compiler-sfc |
| React/TSX parsing | TypeScript compiler API |

---

## Project Structure

```
.
electron/                 # Electron main process
  main.ts                 # Entry point, IPC handlers
  preload.ts              # Preload script
  file-manager.ts         # File I/O, project detection
  dev-server.ts           # Framework dev server launcher
  react-parser.ts         # TSX/JSX parser
src/
  App.tsx                 # Root React component
  main.tsx                # Renderer entry
  bridge/
    dom-bridge.ts         # iframe overlay communication
  codegen/
    html-codegen.ts       # HTML source generator
    vue-codegen.ts        # Vue SFC generator
    react-codegen.ts      # React/TSX generator
    astro-codegen.ts      # Astro generator
  parsers/
    html-parser.ts        # HTML5 parser with VID injection
    vue-parser.ts         # Vue SFC parser
    astro-parser.ts       # Astro frontmatter + HTML parser
  panels/
    ProjectPanel.tsx      # File tree sidebar
    ComponentTree.tsx     # DOM tree view
    PropertiesPanel.tsx   # Element properties editor
    StylesPanel.tsx       # Style editor
    SettingsModal.tsx     # Settings dialog
  store/
    editor-store.ts       # Zustand store with undo/redo
  types/
    index.ts              # Shared TypeScript types
public/                   # Static assets
test-*-project/           # Sample projects for testing
```

---

## Supported Frameworks

| Framework | Detection | Editing |
|---|---|---|
| HTML | `index.html` | Full DOM tree, styles, attributes |
| Vue | `vite.config.ts` + `.vue` files | SFC template editing |
| React | `vite.config.ts` + `.tsx` files | TSX/JSX editing with VID injection |
| Astro | `astro.config.mjs` | Frontmatter preserved, template editing |

该作品为本人练习作品
This project is the author's vibe coding practice work.
---

## License

MIT
