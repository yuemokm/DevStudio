import type { SourceNode } from '../types'
import { generateHTML } from './html-codegen'
import { stripVids } from '../parsers/html-parser'
import { replaceTemplateInSFC } from '../parsers/vue-parser'

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
function restoreTagCasing(html: string, tagMap: Map<string, string>): string {
  let result = html
  for (const [lower, original] of tagMap) {
    // Opening tags: <lowercase ...
    result = result.replace(new RegExp(`<${lower}\\b`, 'g'), `<${original}`)
    // Closing tags: </lowercase>
    result = result.replace(new RegExp(`</${lower}>`, 'g'), `</${original}>`)
  }
  return result
}

export function generateVueSFC(originalSFC: string, sourceTree: SourceNode, keepVids = false): string {
  // Extract original template to get tag name casing map
  const templateMatch = originalSFC.match(/<template(?:\s[^>]*)?>([\s\S]*)<\/template>(?=\s*(?:<script|<style|$))/i)
  const originalTemplate = templateMatch ? templateMatch[1].trim() : ''
  const tagMap = extractTagNameMap(originalTemplate)

  const treeToGenerate = keepVids ? sourceTree : stripVids(sourceTree)
  let templateHTML = generateHTML(treeToGenerate)

  // Restore original Vue component tag casing
  templateHTML = restoreTagCasing(templateHTML, tagMap)

  return replaceTemplateInSFC(originalSFC, templateHTML)
}
