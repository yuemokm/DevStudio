import { parse as parseSFC } from '@vue/compiler-sfc'
import { parseHTMLFragment, injectVids, setVidCounter } from './html-parser'
import type { SourceNode } from '../types'

export function parseVueSFC(source: string, options?: { resetVidCounter?: boolean }): { sourceTree: SourceNode; modifiedSFC: string } {
  if (options?.resetVidCounter !== false) {
    setVidCounter(0)
  }

  const { descriptor } = parseSFC(source)
  const templateContent = descriptor.template?.content || ''

  // Parse template as HTML fragment → AST (no doctype, no html/body wrapper)
  const { tree, modifiedHTML } = injectVids(parseHTMLFragment(templateContent))

  // Restore original Vue component tag casing (parse5 lowercases all tag names)
  const tagMap = extractTagNameMap(templateContent)
  const restoredHTML = restoreTagCasing(modifiedHTML, tagMap)

  // Replace template block in original SFC with vid-injected version
  const modifiedSFC = replaceTemplateInSFC(source, restoredHTML)

  return { sourceTree: tree, modifiedSFC }
}

/**
 * Extract original tag name casing from a template string.
 * HTML parsers lowercase tag names; we need to restore them for Vue SFCs.
 */
function extractTagNameMap(template: string): Map<string, string> {
  const map = new Map<string, string>()
  // Match opening tags: <TagName ...
  const openRegex = /<([A-Za-z][\w-]*)/g
  let match: RegExpExecArray | null
  while ((match = openRegex.exec(template)) !== null) {
    const original = match[1]
    const lower = original.toLowerCase()
    if (!map.has(lower)) {
      map.set(lower, original)
    }
  }
  return map
}

/**
 * Restore original tag casing in generated HTML.
 */
export function restoreTagCasing(html: string, tagMap: Map<string, string>): string {
  let result = html
  for (const [lower, original] of tagMap) {
    // Opening tags: <lowercase ...
    result = result.replace(new RegExp(`<${lower}\\b`, 'g'), `<${original}`)
    // Closing tags: </lowercase>
    result = result.replace(new RegExp(`</${lower}>`, 'g'), `</${original}>`)
  }
  return result
}

export function replaceTemplateInSFC(sfc: string, newTemplate: string): string {
  // Match the outer <template> block by anchoring to </template> followed by
  // <script, <style, or EOF. Greedy [s\S]* ensures nested <template> tags
  // (e.g. <template v-if>) inside the block are consumed correctly.
  return sfc.replace(
    /(<template(?:\s[^>]*)?>)[\s\S]*(<\/template>)(?=\s*(?:<script|<style|$))/i,
    (_match, openTag, closeTag) => `${openTag}\n${newTemplate}\n${closeTag}`
  )
}
