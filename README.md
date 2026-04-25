# DevStudio

A visual editor for HTML, Vue, React, and Astro projects.

**English** | [中文](./README.zh-CN.md)

![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Overview

**DevStudio** is a desktop visual editor built with Electron. Open any frontend project, select elements in the live preview, edit styles and attributes visually, and see changes in real time.

## Features

- **Multi-framework support**: Works with HTML, Vue (SFC), React (JSX/TSX), and Astro projects
- **Visual editing**: Select elements in the preview, edit text, styles, attributes, and classes
- **Resize handles**: Drag 8-direction handles to resize elements directly in the preview
- **Delete elements**: Press the Delete key to remove selected elements
- **Drag to move**: Reposition elements in the preview with drag-and-drop
- **Keyboard nudge**: Fine-tune element position with arrow keys
- **Component tree**: Browse and manipulate the DOM structure
- **Undo / Redo**: Full command history powered by Zustand
- **Dev server integration**: Automatically detects framework and spins up the appropriate dev server
- **Drag to reorder**: Rearrange elements directly in the component tree
- **Image replacement**: Swap image sources with local files

## Installation

1. Download the latest release from the [Releases](https://github.com/yuemokm/DevStudio/releases) page.
2. Run `DevStudio Setup 0.1.0.exe` to install, or use `DevStudio 0.1.0.exe` for portable mode.

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
npx electron-builder
```

Build artifacts will be placed in `release/`.

## Tech Stack

- Electron 35 — Desktop shell
- React 19 + Tailwind CSS 4 — UI framework
- Zustand — State management
- Vite — Build tool
- parse5 — HTML parsing
- @vue/compiler-sfc — Vue SFC parsing
- TypeScript compiler API — React/TSX parsing

## File Structure

```
├── electron/                 # Electron main process
│   ├── main.ts               # Entry point, IPC handlers
│   ├── preload.ts            # Preload script
│   ├── file-manager.ts       # File I/O, project detection
│   ├── dev-server.ts         # Framework dev server launcher
│   ├── workspace-manager.ts  # Temp workspace copy / cleanup
│   └── react-parser.ts       # TSX/JSX parser
├── src/
│   ├── App.tsx               # Root React component
│   ├── main.tsx              # Renderer entry
│   ├── bridge/
│   │   └── dom-bridge.ts     # iframe overlay communication
│   ├── codegen/
│   │   ├── html-codegen.ts   # HTML source generator
│   │   ├── vue-codegen.ts    # Vue SFC generator
│   │   ├── react-codegen.ts  # React/TSX generator
│   │   └── astro-codegen.ts  # Astro generator
│   ├── editor/
│   │   └── PreviewPanel.tsx  # iframe preview + overlay interaction
│   ├── parsers/
│   │   ├── html-parser.ts    # HTML5 parser with VID injection
│   │   ├── vue-parser.ts     # Vue SFC parser
│   │   └── astro-parser.ts   # Astro frontmatter + HTML parser
│   ├── panels/
│   │   ├── ProjectPanel.tsx  # File tree sidebar
│   │   ├── ComponentTree.tsx # DOM tree view
│   │   ├── PropertiesPanel.tsx
│   │   ├── StylesPanel.tsx
│   │   └── SettingsModal.tsx
│   ├── store/
│   │   └── editor-store.ts   # Zustand store with undo/redo
│   └── types/
│       └── index.ts          # Shared TypeScript types
├── public/                   # Static assets
├── package.json
├── README.md
├── README.zh-CN.md
└── LICENSE
```

## Supported Frameworks

| Framework | Detection | Editing |
|---|---|---|
| HTML | `index.html` | Full DOM tree, styles, attributes |
| Vue | `vite.config.ts` + `.vue` files | SFC template editing |
| React | `vite.config.ts` + `.tsx` files | TSX/JSX editing with VID injection |
| Astro | `astro.config.mjs` | Frontmatter preserved, template editing |

## License

MIT

Made with 💜 for designers and developers.
