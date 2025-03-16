/** @param {string} input */
export function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}