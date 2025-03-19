export function exhaust(): never {
  throw new Error('Exhaustive check failed')
}