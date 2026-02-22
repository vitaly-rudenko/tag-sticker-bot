import { escapePostgresPosixRegex } from './escape-postgres-posix-regex.ts'

export function wrapPosixBoundary(word: string, boundary: 'prefix' | 'suffix' | 'whole'): string {
  const escaped = escapePostgresPosixRegex(word)

  const start = (boundary === 'prefix' || boundary === 'whole') && /^\p{L}/u.test(word) ? '\\m' : ''
  const end = (boundary === 'suffix' || boundary === 'whole') && /\p{L}$/u.test(word) ? '\\M' : ''

  return start + escaped + end
}
