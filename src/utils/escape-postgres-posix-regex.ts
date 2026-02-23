// https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-POSIX-REGEXP
export function escapePostgresPosixRegex(input: string): string {
  return input.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&')
}
