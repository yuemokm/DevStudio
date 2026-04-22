import * as parse5 from 'parse5'
import type { SourceNode } from '../types'
import { generateHTML } from '../codegen/html-codegen'

let vidCounter = 0

function generateVid(): string {
  return `v${++vidCounter}`
}

export function setVidCounter(value: number) {
  vidCounter = value
}

export function getVidCounter(): number {
  return vidCounter
}

export function parseHTML(html: string): SourceNode {
  const document = parse5.parse(html)
  return convertNode(document)
}

export function parseHTMLFragment(html: string): SourceNode {
  const fragment = parse5.parseFragment(html)
  return convertNode(fragment, true)
}

function convertNode(node: any, isFragment = false): SourceNode {
  const id = generateVid()

  if (node.nodeName === '#document') {
    return {
      id,
      type: 'element',
      tagName: 'document',
      children: node.childNodes?.map((child: any) => convertNode(child, false)).filter(Boolean) || [],
      sourceRange: node.sourceCodeLocation
        ? { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset }
        : undefined,
    }
  }

  if (node.nodeName === '#document-fragment') {
    return {
      id,
      type: 'element',
      tagName: '',
      children: node.childNodes?.map((child: any) => convertNode(child, true)).filter(Boolean) || [],
      sourceRange: node.sourceCodeLocation
        ? { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset }
        : undefined,
    }
  }

  if (node.nodeName === '#documentType') {
    // In fragments, skip doctype. In full documents, preserve it.
    if (isFragment) {
      return {
        id,
        type: 'comment',
        textContent: '',
        children: [],
      }
    }
    return {
      id,
      type: 'element',
      tagName: 'documentType',
      attributes: { name: node.name },
      children: [],
      sourceRange: node.sourceCodeLocation
        ? { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset }
        : undefined,
    }
  }

  if (node.nodeName === '#text') {
    return {
      id,
      type: 'text',
      textContent: node.value,
      children: [],
      sourceRange: node.sourceCodeLocation
        ? { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset }
        : undefined,
    }
  }

  if (node.nodeName === '#comment') {
    return {
      id,
      type: 'comment',
      textContent: node.data,
      children: [],
      sourceRange: node.sourceCodeLocation
        ? { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset }
        : undefined,
    }
  }

  const attrs: Record<string, string> = {}
  if (node.attrs) {
    for (const attr of node.attrs) {
      attrs[attr.name] = attr.value
    }
  }

  // Handle HTML <template> element — parse5 stores its content in a DocumentFragment, not childNodes
  if (node.nodeName === 'template') {
    const templateChildren = node.content?.childNodes || []
    return {
      id,
      type: 'element',
      tagName: 'template',
      attributes: attrs,
      children: templateChildren.map((child: any) => convertNode(child, isFragment)).filter(Boolean) || [],
      sourceRange: node.sourceCodeLocation
        ? { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset }
        : undefined,
    }
  }

  // Use node.tagName to preserve original casing (important for Vue components like <HelloWorld/>)
  // Fallback to node.nodeName (lowercased) if tagName is not available
  const tagName = node.tagName || node.nodeName

  return {
    id,
    type: 'element',
    tagName,
    attributes: attrs,
    children: node.childNodes?.map((child: any) => convertNode(child, isFragment)).filter(Boolean) || [],
    sourceRange: node.sourceCodeLocation
      ? { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset }
      : undefined,
  }
}

export function injectVids(tree: SourceNode): { tree: SourceNode; modifiedHTML: string } {
  // Do NOT reset vidCounter here — parseHTML already advanced it.
  // Keeping the counter ensures newly-generated vids never collide
  // with preserved existing data-vid attributes.
  const newTree = cloneAndInjectVids(tree)
  const modifiedHTML = generateHTML(newTree)
  return { tree: newTree, modifiedHTML }
}

function cloneAndInjectVids(node: SourceNode): SourceNode {
  // Preserve existing vid if the file was already injected (re-opening a project)
  const existingVid = node.type === 'element' && node.attributes?.['data-vid']
  const id = existingVid || generateVid()

  if (node.type === 'text' || node.type === 'comment') {
    return { ...node, id }
  }

  const newAttrs = { ...node.attributes }
  newAttrs['data-vid'] = id

  return {
    ...node,
    id,
    attributes: newAttrs,
    children: node.children.map(cloneAndInjectVids),
  }
}

export function getNodeByVid(tree: SourceNode, vid: string): SourceNode | null {
  if (tree.id === vid) return tree
  for (const child of tree.children) {
    const found = getNodeByVid(child, vid)
    if (found) return found
  }
  return null
}

export function updateNodeText(tree: SourceNode, vid: string, text: string): SourceNode {
  return mapTree(tree, (node) => {
    if (node.id === vid && node.type === 'text') {
      return { ...node, textContent: text }
    }
    return node
  })
}

export function updateElementText(tree: SourceNode, vid: string, text: string): SourceNode {
  return mapTree(tree, (node) => {
    if (node.id === vid && node.type === 'element') {
      const textIndex = node.children.findIndex((c) => c.type === 'text')
      if (textIndex >= 0) {
        // Update existing text child
        const newChildren = [...node.children]
        newChildren[textIndex] = { ...newChildren[textIndex], textContent: text }
        return { ...node, children: newChildren }
      } else {
        // Insert new text child
        return {
          ...node,
          children: [
            ...node.children,
            { id: generateVid(), type: 'text', textContent: text, children: [] },
          ],
        }
      }
    }
    return node
  })
}

export function updateNodeAttr(tree: SourceNode, vid: string, name: string, value: string): SourceNode {
  return mapTree(tree, (node) => {
    if (node.id === vid && node.type === 'element') {
      const newAttrs = { ...node.attributes }
      if (value) {
        newAttrs[name] = value
      } else {
        delete newAttrs[name]
      }
      return { ...node, attributes: newAttrs }
    }
    return node
  })
}

export function stripVids(tree: SourceNode): SourceNode {
  return mapTree(tree, (node) => {
    if (node.type === 'element' && node.attributes) {
      const newAttrs = { ...node.attributes }
      delete newAttrs['data-vid']
      return { ...node, attributes: newAttrs }
    }
    return node
  })
}

function mapTree(node: SourceNode, fn: (n: SourceNode) => SourceNode): SourceNode {
  const mapped = fn(node)
  return {
    ...mapped,
    children: mapped.children.map((child) => mapTree(child, fn)),
  }
}

export function removeNodeByVid(tree: SourceNode, vid: string): SourceNode | null {
  if (tree.id === vid) return null
  return {
    ...tree,
    children: tree.children
      .map((child) => removeNodeByVid(child, vid))
      .filter(Boolean) as SourceNode[],
  }
}

export function addChildNode(tree: SourceNode, parentVid: string, child: SourceNode): SourceNode {
  if (tree.id === parentVid) {
    return {
      ...tree,
      children: [...tree.children, child],
    }
  }
  return {
    ...tree,
    children: tree.children.map((c) => addChildNode(c, parentVid, child)),
  }
}

export function createElementNode(tagName: string, attributes: Record<string, string> = {}, textContent = ''): SourceNode {
  const id = generateVid()
  const attrs = { ...attributes, 'data-vid': id }
  const children: SourceNode[] = textContent
    ? [{ id: generateVid(), type: 'text', textContent, children: [] }]
    : []
  return {
    id,
    type: 'element',
    tagName,
    attributes: attrs,
    children,
  }
}
