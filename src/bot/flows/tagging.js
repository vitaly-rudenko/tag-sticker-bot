import { Tag } from '../../tags/Tag.js'

export function useTaggingFlow({ queuedStickerRepository, userSessionRepository, tagRepository, bot, sendNextQueuedSticker }) {
  async function handleTag(context, next) {
    if (context.message.text.startsWith('/')) return next()

    const { userId } = context.state
    const { stickerSetName, stickerFileId, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerFileId || !stickerMessageId) return

    const value = context.message.text.trim().toLowerCase()
    if (!value) return

    await tagRepository.storeTag(
      new Tag({
        authorUserId: userId,
        stickerFileId,
        stickerSetName,
        value,
      })
    )

    await bot.telegram.editMessageReplyMarkup(context.chat.id, stickerMessageId, undefined, undefined)
    await context.reply(`✅ The sticker has been tagged as "${value}"`)

    await sendNextQueuedSticker(context)
  }

  async function tagSingle(context) {
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { stickerSetName, stickerFileId, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerFileId || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickerFileIds: [stickerFileId],
    })
  }

  async function tagUntagged(context) {
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { stickerSetName, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const tags = await tagRepository.queryTags({
      stickerFileIds: stickerSet.stickers.map(sticker => sticker.file_id),
    })

    const untaggedStickers = stickerSet.stickers.filter(sticker => (
      !tags.find(tag => sticker.file_id === tag.stickerFileId))
    )

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickerFileIds: untaggedStickers.map(sticker => sticker.file_id),
    })
  }

  async function tagUntaggedByMe(context) {
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { stickerSetName, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerMessageId) return

    bot.telegram.deleteMessage(context.chat.id, stickerMessageId).catch(() => {})

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const tags = await tagRepository.queryTags({
      stickerFileIds: stickerSet.stickers.map(sticker => sticker.file_id),
      authorUserId: userId,
    })

    const untaggedStickers = stickerSet.stickers.filter(sticker => (
      !tags.find(tag => sticker.file_id === tag.stickerFileId))
    )

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickerFileIds: untaggedStickers.map(sticker => sticker.file_id),
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
      stickerFileIds: stickerSet.stickers.map(sticker => sticker.file_id),
    })
  }

  async function enqueueStickers({ context, userId, stickerSetName, stickerFileIds }) {
    await queuedStickerRepository.enqueue({
      userId,
      stickers: stickerFileIds.map(stickerFileId => ({
        stickerSetName,
        stickerFileId,
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