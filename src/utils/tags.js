/**
 * @param {string} input
 * @returns {string[]}
 */
export function parseTagValues(input) {
  const parts = normalizeTagValue(input).split(' ')
  return parts.map((_, i) => parts.slice(i).join(' '))
}

export function normalizeTagValue(input) {
  return input.toLowerCase().trim().replace(/\s+/g, ' ').trim()
}
