import type { SourceNode } from '../types'

export function generateHTML(node: SourceNode, parentTag?: string): string {
  if (node.type === 'text') {
    // script and style content is raw text in HTML — do not escape entities
    if (parentTag === 'script' || parentTag === 'style') {
      return node.textContent || ''
    }
    return escapeHtml(node.textContent || '')
  }

  if (node.type === 'comment') {
    if (!node.textContent) return ''
    return `<!--${node.textContent}-->`
  }

  if (node.tagName === 'document') {
    return `<!DOCTYPE html>\n${node.children.map((child) => generateHTML(child, 'document')).join('')}`
  }

  // Skip documentType nodes — the document root already emits <!DOCTYPE html>
  if (node.tagName === 'documentType') {
    return ''
  }

  // Fragment root (empty tagName) — only output children, no wrapper
  if (!node.tagName) {
    return node.children.map((child) => generateHTML(child, parentTag)).join('')
  }

  const tag = node.tagName || 'div'
  const attrs = node.attributes
    ? Object.entries(node.attributes)
        .filter(([k]) => k !== 'data-source-file')
        .map(([k, v]) => {
          if (v === '') return k
          return `${k}="${escapeAttr(v)}"`
        })
        .join(' ')
    : ''

  const isVoid = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tag.toLowerCase())

  if (isVoid) {
    return attrs ? `<${tag} ${attrs}>` : `<${tag}>`
  }

  const childrenHTML = node.children.map((child) => generateHTML(child, tag)).join('')
  return attrs ? `<${tag} ${attrs}>${childrenHTML}</${tag}>` : `<${tag}>${childrenHTML}</${tag}>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}
