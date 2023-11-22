import { booleansToBitmap } from './bitmap.js'

/**
 * @param {T[]} stickers
 * @template {{ file_unique_id: string }} T
 */
export function sortStickers(stickers) {
  return stickers.toSorted((a, b) => {
    if (a.file_unique_id === b.file_unique_id) return 0
    if (a.file_unique_id > b.file_unique_id) return 1
    return -1
  })
}

/**
 * @param {import('telegraf').Telegram} telegram
 * @param {string} stickerSetName
 * @param {number} index
 */
export async function getStickerByIndex(telegram, stickerSetName, index) {
  const stickerSet = await telegram.getStickerSet(stickerSetName)
  if (!stickerSet) return undefined
  return sortStickers(stickerSet.stickers)[index]
}

/**
 * @param {import('../types.d.ts').Sticker[]} stickers
 * @param {(sticker: import('../types.d.ts').Sticker) => boolean} mapper
 */
export function stickersToBitmap(stickers, mapper) {
  return booleansToBitmap(sortStickers(stickers).map(mapper))
}
