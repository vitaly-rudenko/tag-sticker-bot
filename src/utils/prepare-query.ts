export function prepareQuery(sql: string, replacements: Record<string, unknown>): [string, unknown[]] {
  let updatedSql = sql
  let params: unknown[] = []

  for (const [key, value] of Object.entries(replacements)) {
    updatedSql = updatedSql.replaceAll(`:${key}`, `$${params.length + 1}`)
    params.push(value)
  }

  return [updatedSql, params]
}
