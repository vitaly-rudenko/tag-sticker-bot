import { markdownEscapes } from 'markdown-escapes'

const MARKDOWN_ESCAPE_REGEX = new RegExp(`(?<!\\\\)([\\${markdownEscapes.join('\\')}])`, 'g')

export function escapeMd(input: string) {
  return input.replace(MARKDOWN_ESCAPE_REGEX, '\\$1')
}
