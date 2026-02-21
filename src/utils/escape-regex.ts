export function escapeRegex(input: string): string {
  // @ts-expect-error @types/node don't have type for RegExp.escape() yet
  return RegExp.escape(input)
}
