import type { SourceNode } from '../types'
import { generateHTML } from './html-codegen'
import { stripVids } from '../parsers/html-parser'
import { splitAstro } from '../parsers/astro-parser'

export function generateAstro(originalAstro: string, sourceTree: SourceNode, keepVids = false): string {
  const { frontmatter } = splitAstro(originalAstro)

  const treeToGenerate = keepVids ? sourceTree : stripVids(sourceTree)
  let newTemplate = generateHTML(treeToGenerate)

  // strip doctype that generateHTML adds for document roots
  newTemplate = newTemplate.replace(/^<!DOCTYPE html>\n?/i, '')

  // Convert PascalCase components with no children back to self-closing syntax
  newTemplate = newTemplate.replace(
    /<([A-Z][A-Za-z0-9]*)\b([^>]*)><\/\1>/g,
    '<$1$2 />'
  )

  return frontmatter
    ? `---\n${frontmatter}\n---\n${newTemplate}`
    : newTemplate
}
