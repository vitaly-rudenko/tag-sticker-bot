import { booleansToBitmap } from './bitmap.js'

/**
 * @param {T[]} stickers
 * @template {import('../types.d.ts').MinimalSticker} T
 */
export function sortStickers(stickers) {
  return stickers.toSorted((a, b) => {
    if (a.file_unique_id === b.file_unique_id) return 0
    if (a.file_unique_id > b.file_unique_id) return 1
    return -1
  })
}

/**
 * @param {import('../types.d.ts').MinimalStickerWithSet[]} stickers
 * @param {(sticker: import('../types.d.ts').MinimalStickerWithSet) => boolean} mapper
 */
export function stickersToBitmap(stickers, mapper) {
  return booleansToBitmap(sortStickers(stickers).map(mapper))
}
