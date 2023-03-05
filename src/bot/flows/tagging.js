import { Tag } from '../../tags/Tag.js'

export function useTaggingFlow({ queuedStickerRepository, userSessionRepository, tagRepository, bot, sendNextQueuedSticker }) {
  async function handleTag(context, next) {
    if (context.message.text.startsWith('/')) return next()

    const { userId } = context.state
    const { stickerSetName, stickerFileId, stickerFileUniqueId, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerFileId || !stickerFileUniqueId || !stickerMessageId) return

    const value = context.message.text.trim().toLowerCase()
    if (!value) return

    await tagRepository.storeTag(
      new Tag({
        authorUserId: userId,
        stickerFileUniqueId,
        stickerFileId,
        stickerSetName,
        value,
      })
    )

    await bot.telegram.editMessageReplyMarkup(context.chat.id, stickerMessageId, undefined, undefined)
    await context.reply(`✏️ The sticker has been tagged as "${value}"`)

    await sendNextQueuedSticker(context)
  }

  async function tagSingle(context) {
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { stickerSetName, stickerFileUniqueId, stickerFileId, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerFileUniqueId || !stickerFileId || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickers: [{
        stickerFileId,
        stickerFileUniqueId,
      }],
    })
  }

  async function tagUntagged(context) {
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { stickerSetName, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const stickerFileUniqueIds = stickerSet.stickers.map(sticker => sticker.file_unique_id)
    const statusMap = await tagRepository.queryTagStatus({ stickerFileUniqueIds })

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickers: stickerSet.stickers
        .map(sticker => ({
          stickerFileId: sticker.file_id,
          stickerFileUniqueId: sticker.file_unique_id
        }))
        .filter((sticker) => !statusMap[sticker.stickerFileUniqueId])
    })
  }

  async function tagUntaggedByMe(context) {
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { stickerSetName, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const stickerFileUniqueIds = stickerSet.stickers.map(sticker => sticker.file_unique_id)
    const statusMap = await tagRepository.queryTagStatus({ stickerFileUniqueIds, authorUserId: userId })

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickers: stickerSet.stickers
        .map(sticker => ({
          stickerFileId: sticker.file_id,
          stickerFileUniqueId: sticker.file_unique_id
        }))
        .filter((sticker) => !statusMap[sticker.stickerFileUniqueId])
    })
  }

  async function tagAll(context) {
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { stickerSetName, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName) return

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickers: stickerSet.stickers
        .map(sticker => ({
          stickerFileId: sticker.file_id,
          stickerFileUniqueId: sticker.file_unique_id
        }))
    })
  }

  async function enqueueStickers({ context, userId, stickerSetName, stickers }) {
    await queuedStickerRepository.enqueue({
      userId,
      stickers: stickers.map(({ stickerFileId, stickerFileUniqueId }) => ({
        stickerSetName,
        stickerFileId,
        stickerFileUniqueId,
      })),
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