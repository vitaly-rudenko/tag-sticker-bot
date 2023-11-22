const BITS = 32

/**
 * @param {boolean[]} booleans
 * @returns {string}
 */
export function booleansToBitmap(booleans) {
  return booleans.map(b => b ? 1 : 0).join('')
}

/**
 * @param {string} bitmap
 * @returns {string}
 */
export function bitmapToInt(bitmap) {
  return BigInt('0b' + bitmap).toString(36)
}

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
const base = 36n

/**
 * @param {string} int
 * @param {number} length
 * @returns {string}
 */
export function intToBitmap(int, length) {
  return BigInt(
    [...int].reduce((acc, digit) => {
      const pos = BigInt(alphabet.indexOf(digit));
      return acc * base + pos
    }, 0n)
  ).toString(2).padStart(length, '0')
}

/**
 * @param {string} bitmap 
 * @param {number} index 
 * @returns {boolean}
 */
export function isTrue(bitmap, index) {
  return bitmap[index] === '1'
}

/**
 * @param {string} bitmap
 * @param {number} position
 * @returns {number}
 */
export function getNextTrueIndex(bitmap, position) {
  return bitmap.indexOf('1', position)
}
