const BITS = 32

/** @param {boolean[]} booleans */
export function booleansToBitmap(booleans) {
  return {
    bitmap: booleans.map(b => b ? 1 : 0).join(''),
    length: booleans.length,
    size: booleans.filter(Boolean).length,
  }
}

/**
 * @param {string} bitmap
 * @returns {string}
 */
export function encodeBitmap(bitmap) {
  return BigInt('0b' + bitmap).toString(36)
}

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
const base = 36n

/**
 * @param {string} int
 * @param {number} length
 * @returns {string}
 */
export function decodeBitmap(int, length) {
  return BigInt(
    [...int].reduce((acc, digit) => {
      const pos = BigInt(alphabet.indexOf(digit));
      return acc * base + pos
    }, 0n)
  ).toString(2).padStart(length, '0')
}

/**
 * @param {string} bitmap
 * @param {number} position
 */
export function getBitmapIndex(bitmap, position) {
  if (position < 1) {
    throw new Error(`Invalid position: ${position}`)
  }

  for (let i = 0; i < bitmap.length; i++) {
    if (bitmap[i] === '1') {
      position--
      if (position === 0) {
        return i
      }
    }
  }

  throw new Error(`Invalid position: ${position}`)
}
