/**
 * @param {string} input
 * @returns {string[]}
 */
export function parseTagValues(input) {
  const values = input.split(/(?:,|\n)/g)
  const result = []

  for (const value of values) {
    const parts = normalizeTagValue(value).split(' ')
    const variations = parts.map((_, i) => parts.slice(i).join(' '))

    for (const variation of variations) {
      if (variation) {
        if (result.some(r => r.startsWith(variation))) continue
        let index
        do {
          index = result.findIndex(r => variation.startsWith(r))
          if (index !== -1) {
            result.splice(index, 1)
          }
        } while (index !== -1)
        result.push(variation)
      }
    }
  }

  return [...new Set(result)]
}

export function normalizeTagValue(input) {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}
