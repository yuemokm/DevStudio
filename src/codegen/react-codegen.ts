import type { SourceNode } from '../types'

/**
 * Generate JSX code from a SourceNode tree.
 */
export function generateJSX(node: SourceNode, keepVids = false): string {
  if (node.type === 'text') {
    return escapeJsxText(node.textContent || '')
  }

  if (node.type === 'comment') {
    return node.textContent || ''
  }

  if (!node.tagName) {
    const children = node.children.map((c) => generateJSX(c, keepVids)).join('')
    return `<>
${children}
</>`
  }

  const tag = node.tagName
  const attrs = node.attributes
    ? Object.entries(node.attributes)
        .filter(([k]) => keepVids || k !== 'data-vid')
        .map(([k, v]) => {
          if (v === '') return k
          if (v.startsWith('{') && v.endsWith('}')) {
            return `${k}=${v}`
          }
          return `${k}="${escapeAttr(v)}"`
        })
        .join(' ')
    : ''

  const isVoid = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(
    tag.toLowerCase()
  )

  if (isVoid) {
    return attrs ? `<${tag} ${attrs} />` : `<${tag} />`
  }

  const children = node.children.map((c) => generateJSX(c, keepVids)).join('')

  if (children.trim()) {
    return attrs ? `<${tag} ${attrs}>
${children}
</${tag}>` : `<${tag}>
${children}
</${tag}>`
  }

  return attrs ? `<${tag} ${attrs}></${tag}>` : `<${tag}></${tag}>`
}

/**
 * Replace the JSX portion in the original source file with the generated JSX.
 */
export function replaceJSXInSource(originalSource: string, sourceTree: SourceNode, keepVids = false): string {
  if (!sourceTree.sourceRange) {
    throw new Error('SourceNode has no sourceRange')
  }

  const newJSX = generateJSX(sourceTree, keepVids)
  const { start, end } = sourceTree.sourceRange

  return originalSource.slice(0, start) + newJSX + originalSource.slice(end)
}

function escapeJsxText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}
