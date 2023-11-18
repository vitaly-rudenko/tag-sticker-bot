/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   userSessionRepository: import('../../types.d.ts').UserSessionRepository
 *   queuedStickerRepository: import('../../types.d.ts').QueuedStickerRepository
 *   tagRepository: import('../../types.d.ts').TagRepository
 *   sendNextQueuedSticker: Function
 *   bot: import('telegraf').Telegraf
 * }} input
 */
export function useTaggingFlow({ queuedStickerRepository, userSessionRepository, tagRepository, bot, sendNextQueuedSticker }) {
  /** @param {Context} context */
  async function handleTag(context, next) {
    if (!context.chat || !context.message || !('text' in context.message)) return
    if (context.message.text.startsWith('/')) return next()

    const { userId } = context.state
    const { sticker, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!sticker || !stickerMessageId) return

    const value = context.message.text.trim().toLowerCase()
    if (!value) return

    if (value.length < 2 || value.length > 50) {
      await context.reply(`❌ The tag is too short or too long, please try again`)
      return
    }

    await tagRepository.storeTag({
      sticker,
      authorUserId: userId,
      value,
    })

    await bot.telegram.editMessageReplyMarkup(context.chat.id, stickerMessageId, undefined, undefined)
    await context.reply(`✏️ The sticker has been tagged as "${value}"`)

    await sendNextQueuedSticker(context)
  }

  /** @param {Context} context */
  async function tagSingle(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { sticker, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!sticker || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    await enqueueStickers({
      context,
      userId,
      stickers: [sticker],
    })
  }

  /** @param {Context} context */
  async function tagUntagged(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { sticker, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!sticker || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    const stickerSetName = sticker.setName
    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const stickerFileUniqueIds = stickerSet.stickers.map(sticker => sticker.file_unique_id)
    const statusMap = await tagRepository.queryTagStatus({ stickerFileUniqueIds })

    await enqueueStickers({
      context,
      userId,
      stickers: stickerSet.stickers
        .map(sticker => ({
          setName: stickerSetName,
          fileId: sticker.file_id,
          fileUniqueId: sticker.file_unique_id
        }))
        .filter((sticker) => !statusMap[sticker.fileUniqueId])
    })
  }

  /** @param {Context} context */
  async function tagUntaggedByMe(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { sticker, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!sticker || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    const stickerSetName = sticker.setName
    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const stickerFileUniqueIds = stickerSet.stickers.map(sticker => sticker.file_unique_id)
    const statusMap = await tagRepository.queryTagStatus({ stickerFileUniqueIds, authorUserId: userId })

    await enqueueStickers({
      context,
      userId,
      stickers: stickerSet.stickers
        .map(sticker => ({
          setName: stickerSetName,
          fileId: sticker.file_id,
          fileUniqueId: sticker.file_unique_id
        }))
        .filter((sticker) => !statusMap[sticker.fileUniqueId])
    })
  }

  /** @param {Context} context */
  async function tagAll(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { sticker, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!sticker || !stickerMessageId) return

    const stickerSetName = sticker.setName
    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    await enqueueStickers({
      context,
      userId,
      stickers: stickerSet.stickers
        .map(sticker => ({
          setName: stickerSetName,
          fileId: sticker.file_id,
          fileUniqueId: sticker.file_unique_id
        }))
    })
  }

  /**
   * @param {{
   *   context: Context
   *   userId: string
   *   stickers: import('../../types.d.ts').Sticker[]
   * }} input 
   */
  async function enqueueStickers({ context, userId, stickers }) {
    await queuedStickerRepository.clear(userId)
    await queuedStickerRepository.enqueue({
      userId,
      stickers,
    })

    await sendNextQueuedSticker(context)
  }

  return {
    tagSingle,
    tagUntagged,
    tagUntaggedByMe,
    tagAll,
    handleTag,
  }
}