import { deleteMessages } from '../../utils/deleteMessages.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   userSessionRepository: import('../../types.d.ts').UserSessionRepository
 *   favoriteRepository: import('../../types.d.ts').FavoriteRepository,
 *   telegram: import('telegraf').Telegram
 * }} input
 */
export function useFavoritesFlow({ userSessionRepository, favoriteRepository, telegram }) {
  /** @param {Context} context */
  async function favorite(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { file } = await userSessionRepository.get(userId)
    if (!file) return

    await favoriteRepository.mark({ userId, file })
    await userSessionRepository.clear(userId)

    await context.reply([
      '✅ Added the file to favorites.',
      '🕒 It may take up to 10 minutes to see the changes.'
    ].join('\n'))
  }

  /** @param {Context} context */
  async function unfavorite(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { file } = await userSessionRepository.get(userId)
    if (!file) return

    await favoriteRepository.unmark({ userId, fileUniqueId: file.file_unique_id })
    await userSessionRepository.clear(userId)

    await context.reply([
      '✅ Removed the file from favorites.',
      '🕒 It may take up to 10 minutes to see the changes.'
    ].join('\n'))
  }

  return {
    favorite,
    unfavorite,
  }
}
