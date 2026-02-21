export function escapeLikeQuery(input: string): string {
  return input.replaceAll('_', '\\_').replaceAll('%', '\\%')
}
