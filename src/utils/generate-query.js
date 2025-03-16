export function generateQuery(sql, replacements) {
  let result = sql
  let binds = []

  for (const [key, value] of Object.entries(replacements)) {
    if (Array.isArray(value)) {
      binds.push(...value)
      result = result.replaceAll(`:${key}`, `${value.map((_, i) => `$${binds.length - value.length + i + 1}`).join(', ')}`)
    } else {
      binds.push(value)
      result = result.replaceAll(`:${key}`, `$${binds.length}`)
    }
  }

  return [result, binds]
}
