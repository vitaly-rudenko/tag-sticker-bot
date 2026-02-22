export function prepareQuery(sql: string, replacements: Record<string, unknown>): [string, unknown[]] {
  let updatedSql = sql
  let params: unknown[] = []

  for (const [key, value] of Object.entries(replacements)) {
    if (new RegExp(`:${key}\\b`).test(updatedSql)) {
      updatedSql = updatedSql.replaceAll(new RegExp(`:${key}\\b`, 'g'), `$${params.length + 1}`)
      params.push(value)
    }
  }

  return [updatedSql, params]
}
