import * as ts from 'typescript'
import type { SourceNode } from '../src/types'

let vidCounter = 0
function generateVid(): string {
  return `v${++vidCounter}`
}

function resetVidCounter() {
  vidCounter = 0
}

/**
 * Parse a React/JSX file into a SourceNode tree and inject data-vid attributes.
 */
export function parseReactFile(source: string, fileName = 'App.tsx'): { tree: SourceNode; modifiedSource: string } {
  resetVidCounter()

  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  // Find the root JSX element (first JsxElement, JsxSelfClosingElement, or JsxFragment)
  let rootJsx: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | null = null

  function findRoot(node: ts.Node) {
    if (!rootJsx && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))) {
      rootJsx = node
      return
    }
    ts.forEachChild(node, findRoot)
  }
  findRoot(sourceFile)

  if (!rootJsx) {
    throw new Error('No JSX element found in file')
  }

  // Phase 1: Assign vids to all JSX elements
  const vidMap = new Map<ts.Node, string>()

  function assignVids(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      vidMap.set(node, generateVid())
    }
    ts.forEachChild(node, assignVids)
  }
  assignVids(rootJsx)

  // Phase 2: Build edits to inject data-vid into source
  const edits: { pos: number; text: string }[] = []

  for (const [node, vid] of vidMap) {
    if (ts.isJsxElement(node)) {
      const pos = getInsertPosition(node.openingElement)
      edits.push({ pos, text: ` data-vid="${vid}"` })
    } else if (ts.isJsxSelfClosingElement(node)) {
      const pos = getInsertPositionForSelfClosing(node)
      edits.push({ pos, text: ` data-vid="${vid}"` })
    }
  }

  edits.sort((a, b) => b.pos - a.pos)

  let modifiedSource = source
  for (const edit of edits) {
    modifiedSource = modifiedSource.slice(0, edit.pos) + edit.text + modifiedSource.slice(edit.pos)
  }

  // Phase 3: Build SourceNode tree using assigned vids for JSX elements
  const tree = buildSourceNode(rootJsx, vidMap, sourceFile)

  return { tree, modifiedSource }
}

function getInsertPosition(openingElement: ts.JsxOpeningElement): number {
  const attrs = openingElement.attributes
  if (attrs.properties.length === 0) {
    return openingElement.tagName.getEnd()
  }
  return attrs.getEnd()
}

function getInsertPositionForSelfClosing(element: ts.JsxSelfClosingElement): number {
  const attrs = element.attributes
  if (attrs.properties.length === 0) {
    return element.tagName.getEnd()
  }
  return attrs.getEnd()
}

function buildSourceNode(
  node: ts.Node,
  vidMap: Map<ts.Node, string>,
  sourceFile: ts.SourceFile
): SourceNode {
  if (ts.isJsxText(node)) {
    const id = generateVid()
    return {
      id,
      type: 'text',
      textContent: node.text,
      children: [],
      sourceRange: { start: node.getStart(sourceFile), end: node.getEnd() },
    }
  }

  if (ts.isJsxExpression(node)) {
    const id = generateVid()
    return {
      id,
      type: 'comment',
      textContent: node.getText(sourceFile),
      children: [],
      sourceRange: { start: node.getStart(sourceFile), end: node.getEnd() },
    }
  }

  if (ts.isJsxFragment(node)) {
    const id = generateVid()
    return {
      id,
      type: 'element',
      tagName: '',
      attributes: {},
      children: node.children.map((child) => buildSourceNode(child, vidMap, sourceFile)).filter(Boolean),
      sourceRange: { start: node.getStart(sourceFile), end: node.getEnd() },
    }
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const id = vidMap.get(node) || generateVid()
    const tagName = node.tagName.getText(sourceFile)
    const attributes = extractAttributes(node.attributes, sourceFile)
    return {
      id,
      type: 'element',
      tagName,
      attributes,
      children: [],
      sourceRange: { start: node.getStart(sourceFile), end: node.getEnd() },
    }
  }

  if (ts.isJsxElement(node)) {
    const id = vidMap.get(node) || generateVid()
    const tagName = node.openingElement.tagName.getText(sourceFile)
    const attributes = extractAttributes(node.openingElement.attributes, sourceFile)
    return {
      id,
      type: 'element',
      tagName,
      attributes,
      children: node.children
        .map((child) => buildSourceNode(child, vidMap, sourceFile))
        .filter((n) => n.type !== 'comment' || n.textContent?.trim()),
      sourceRange: { start: node.getStart(sourceFile), end: node.getEnd() },
    }
  }

  // For any other node type, return a comment node
  const id = generateVid()
  return {
    id,
    type: 'comment',
    textContent: node.getText(sourceFile),
    children: [],
    sourceRange: { start: node.getStart(sourceFile), end: node.getEnd() },
  }
}

function extractAttributes(attributes: ts.JsxAttributes, sourceFile: ts.SourceFile): Record<string, string> {
  const result: Record<string, string> = {}

  for (const attr of attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const name = attr.name.getText(sourceFile)
      if (attr.initializer) {
        if (ts.isStringLiteral(attr.initializer)) {
          result[name] = attr.initializer.text
        } else if (ts.isJsxExpression(attr.initializer)) {
          result[name] = attr.initializer.getText(sourceFile)
        } else {
          result[name] = attr.initializer.getText(sourceFile)
        }
      } else {
        result[name] = ''
      }
    }
  }

  return result
}
