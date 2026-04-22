import { parseHTML, injectVids } from './html-parser'
import type { SourceNode } from '../types'

export interface AstroParts {
  frontmatter: string
  template: string
}

export function splitAstro(source: string): AstroParts {
  // Match frontmatter fence: ---\n...\n---\n
  const match = source.match(/^---\n?([\s\S]*?)\n?---\n?([\s\S]*)$/)
  if (match) {
    return { frontmatter: match[1], template: match[2] }
  }
  return { frontmatter: '', template: source }
}

// PascalCase tags in Astro are components, not HTML elements.
// HTML5 parsers don't understand self-closing syntax for non-void elements,
// so we replace <Component /> with a paired placeholder before parsing.
function preserveSelfClosingComponents(template: string): {
  processedTemplate: string
  placeholderMap: Map<string, string>
} {
  const placeholderMap = new Map<string, string>()
  let index = 0

  // Match self-closing PascalCase tags: <ComponentName attr="value" />
  // Group 1: tag name, Group 2: attributes
  const processedTemplate = template.replace(
    /<([A-Z][A-Za-z0-9]*)\b([^>]*)?\s*\/>/g,
    (_match, tagName, attrs = '') => {
      const placeholder = `astro-selfclose-${index++}`
      placeholderMap.set(placeholder, tagName)
      const trimmedAttrs = attrs.trim()
      return `<${placeholder}${trimmedAttrs ? ' ' + trimmedAttrs : ''}></${placeholder}>`
    }
  )

  return { processedTemplate, placeholderMap }
}

function restoreSelfClosingComponents(
  html: string,
  placeholderMap: Map<string, string>
): string {
  let result = html
  for (const [placeholder, tagName] of placeholderMap) {
    // Match paired placeholder tags and convert back to self-closing component
    const regex = new RegExp(`<${placeholder}\\b([^>]*)></${placeholder}>`, 'g')
    result = result.replace(regex, (_match, attrs) => {
      return `<${tagName}${attrs} />`
    })
  }
  return result
}

function restoreTreeTagNames(node: SourceNode, placeholderMap: Map<string, string>): SourceNode {
  if (node.type !== 'element') return node
  const lowerTag = node.tagName?.toLowerCase() || ''
  const originalTag = placeholderMap.get(lowerTag)
  const restoredNode = originalTag ? { ...node, tagName: originalTag } : node
  return {
    ...restoredNode,
    children: restoredNode.children.map((child) => restoreTreeTagNames(child, placeholderMap)),
  }
}

export function parseAstroFile(source: string): { sourceTree: SourceNode; modifiedAstro: string } {
  const { frontmatter, template } = splitAstro(source)

  const { processedTemplate, placeholderMap } = preserveSelfClosingComponents(template)

  // Use full HTML parse (not fragment) because Astro templates may contain
  // <html>, <head>, <body> tags which parseFragment would strip.
  const { tree, modifiedHTML } = injectVids(parseHTML(processedTemplate))

  // Restore original component tag names in the tree
  const restoredTree = restoreTreeTagNames(tree, placeholderMap)

  // generateHTML prepends <!DOCTYPE html> for document roots — strip it for Astro
  const cleanModifiedHTML = modifiedHTML.replace(/^<!DOCTYPE html>\n?/i, '')

  // Restore self-closing component syntax in the generated HTML
  const restoredHTML = restoreSelfClosingComponents(cleanModifiedHTML, placeholderMap)

  const modifiedAstro = frontmatter
    ? `---\n${frontmatter}\n---\n${restoredHTML}`
    : restoredHTML

  return { sourceTree: restoredTree, modifiedAstro }
}
