/**
 * @param {string} sql
 * @param {object} replacements
 * @returns {[string, any[]]}
 */
export function generateQuery(sql, replacements) {
  if (typeof sql !== 'string') {
    throw new Error(`Invalid sql: ${sql}`)
  }

  if (!replacements || Array.isArray(replacements)) {
    throw new Error('Replacements must be an object')
  }

  let result = sql
  let binds = []

  const entries = Object.entries(replacements)
  entries.sort((a, b) => b[0].length - a[0].length)

  for (const [key, value] of entries) {
    const replacementName = `:${key}`
    if (!result.includes(replacementName)) continue

    if (value instanceof Set) {
      binds.push(...value.values())
      result = result.replaceAll(replacementName, `${new Array(value.size).fill(undefined).map((_, i) => `$${binds.length - value.size + i + 1}`).join(', ')}`)
    } else if (Array.isArray(value)) {
      binds.push(...value)
      result = result.replaceAll(replacementName, `${value.map((_, i) => `$${binds.length - value.length + i + 1}`).join(', ')}`)
    } else {
      binds.push(value)
      result = result.replaceAll(replacementName, `$${binds.length}`)
    }
  }

  return [result, binds]
}
