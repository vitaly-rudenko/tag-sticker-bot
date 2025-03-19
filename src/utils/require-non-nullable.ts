export function requireNonNullable<T>(input: T): NonNullable<T> {
  if (input === null || input === undefined) {
    throw new Error(`Expected non-nullable value`)
  }

  return input
}
