# DevStudio

一款面向 HTML、Vue、React 和 Astro 项目的可视化编辑器。

打开任意前端项目，进行可视化编辑，并实时查看修改效果。

---

## 功能特性

- **多框架支持** — 支持 HTML、Vue（SFC）、React（JSX/TSX）和 Astro
- **可视化编辑** — 在预览面板中选择元素，编辑文本、样式、属性和类名
- **缩放手柄** — 在预览面板中拖动 8 个方向的手柄直接调整元素大小
- **删除元素** — 按 Delete 键删除选中的元素
- **拖拽移动** — 在预览面板中拖拽元素 reposition
- **键盘微调** — 使用方向键精确调整元素位置
- **组件树** — 浏览和操作 DOM 结构
- **撤销 / 重做** — 基于 Zustand 的完整命令历史
- **开发服务器集成** — 自动检测框架并启动对应的开发服务器
- **拖拽重排** — 直接在组件树中重新排列元素
- **图片替换** — 用本地文件替换图片源

---

## 下载

获取最新版本：

- [DevStudio Setup 0.1.0.exe](https://github.com/yuemokm/DevStudio/releases/download/v0.1.0/DevStudio%20Setup%200.1.0.exe) — Windows 安装程序
- [DevStudio 0.1.0.exe](https://github.com/yuemokm/DevStudio/releases/download/v0.1.0/DevStudio%200.1.0.exe) — 便携版（无需安装）

---

## 开发

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- npm

### 安装

```bash
# 克隆仓库
git clone https://github.com/yuemokm/DevStudio.git
cd DevStudio

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

### 构建

```bash
# 构建渲染进程 + Electron 主进程
npm run build

# 打包为可分发应用
npx electron-builder
```

构建产物将输出到 `release/` 目录。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面壳层 | Electron 35 |
| UI 框架 | React 19 + Tailwind CSS 4 |
| 状态管理 | Zustand |
| 构建工具 | Vite |
| HTML 解析 | parse5 |
| Vue 解析 | @vue/compiler-sfc |
| React/TSX 解析 | TypeScript compiler API |

---

## 项目结构

```
.
electron/                 # Electron 主进程
  main.ts                 # 入口点，IPC 处理器
  preload.ts              # 预加载脚本
  file-manager.ts         # 文件 I/O，项目检测
  dev-server.ts           # 框架开发服务器启动器
  workspace-manager.ts    # 临时工作区复制 / 清理
  react-parser.ts         # TSX/JSX 解析器
src/
  App.tsx                 # 根 React 组件
  main.tsx                # 渲染进程入口
  bridge/
    dom-bridge.ts         # iframe 覆盖层通信
  codegen/
    html-codegen.ts       # HTML 源码生成器
    vue-codegen.ts        # Vue SFC 生成器
    react-codegen.ts      # React/TSX 生成器
    astro-codegen.ts      # Astro 生成器
  editor/
    PreviewPanel.tsx      # iframe 预览 + 覆盖层交互
  parsers/
    html-parser.ts        # 带 VID 注入的 HTML5 解析器
    vue-parser.ts         # Vue SFC 解析器
    astro-parser.ts       # Astro frontmatter + HTML 解析器
  panels/
    ProjectPanel.tsx      # 文件树侧边栏
    ComponentTree.tsx     # DOM 树视图
    PropertiesPanel.tsx   # 元素属性编辑器
    StylesPanel.tsx       # 样式编辑器
    SettingsModal.tsx     # 设置对话框
  store/
    editor-store.ts       # 带撤销/重做的 Zustand store
  types/
    index.ts              # 共享 TypeScript 类型
public/                   # 静态资源
test-*-project/           # 测试用示例项目
```

---

## 支持的框架

| 框架 | 检测方式 | 编辑能力 |
|---|---|---|
| HTML | `index.html` | 完整 DOM 树、样式、属性 |
| Vue | `vite.config.ts` + `.vue` 文件 | SFC 模板编辑 |
| React | `vite.config.ts` + `.tsx` 文件 | 带 VID 注入的 TSX/JSX 编辑 |
| Astro | `astro.config.mjs` | 保留 frontmatter，模板编辑 |

---

## 许可证

MIT
