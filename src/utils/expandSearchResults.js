/**
 * @param {{
 *   telegram: import('telegraf').Telegram
 *   searchResults: import('../types.d.ts').SearchResults
 *   limit: number
 * }} input
 * @returns {Promise<import('../types.d.ts').MinimalSticker[]>}
 */
export async function expandSearchResults({ telegram, searchResults, limit }) {
  return searchResults.stickers
}
