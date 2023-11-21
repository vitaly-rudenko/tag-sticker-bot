/**
 * @param {string} input
 * @returns {string[]}
 */
export function parseTagValues(input) {
  const values = input.split(/(?:,|\n)/g)
  const result = new Set()

  for (const value of values) {
    const parts = normalizeTagValue(value).split(' ')
    const variations = parts.map((_, i) => parts.slice(i).join(' '))

    for (const variation of variations) {
      if (variation) result.add(variation)
    }
  }

  return [...result]
}

export function normalizeTagValue(input) {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}
