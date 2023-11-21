import { MAX_TAGS_PER_STICKER, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH, MAX_TAG_INPUT_LENGTH } from '../../constants.js'
import { deleteMessages } from '../../utils/deleteMessages.js'
import { escapeMd } from '../../utils/escapeMd.js'
import { parseTagValues } from '../../utils/tags.js'

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
    
    const text = context.message.text
    if (text.startsWith('/')) return next()

    const { userId: authorUserId } = context.state
    const { sticker, stickerMessageId, relevantMessageIds } = await userSessionRepository.getContext(authorUserId)
    if (!sticker) return

    if (text.length < MIN_QUERY_LENGTH)
      return context.reply(`❌ Input is too short, please try again`)
    if (text.length > MAX_TAG_INPUT_LENGTH)
      return context.reply(`❌ Input is too long, please try again`)

    const values = parseTagValues(text)
      .filter(value => value.length >= MIN_QUERY_LENGTH)
      .map(value => value.slice(0, MAX_QUERY_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_TAGS_PER_STICKER)
    if (values.length === 0)
      return context.reply(`❌ Your tags are either too short or too long, please try again`)

    await tagRepository.store({ sticker, authorUserId, values })

    await Promise.allSettled([
      bot.telegram.editMessageReplyMarkup(context.chat.id, stickerMessageId, undefined, undefined),
      deleteMessages(bot.telegram, context.chat.id, relevantMessageIds),
    ])

    await context.reply([
      `✏️ This sticker is now searchable by these tags: ${values.map(value => `*__${escapeMd(value)}__*`).join(', ')}\\.`,
    ].filter(Boolean).join('\n'), { parse_mode: 'MarkdownV2' }),

    await sendNextQueuedSticker(context)
  }

  /** @param {Context} context */
  async function tagSingle(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { sticker, stickerMessageId, relevantMessageIds } = await userSessionRepository.getContext(userId)
    if (!sticker) return

    await deleteMessages(bot.telegram, context.chat.id, stickerMessageId, relevantMessageIds)

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
    const { sticker, stickerMessageId, relevantMessageIds } = await userSessionRepository.getContext(userId)
    if (!sticker) return

    await deleteMessages(bot.telegram, context.chat.id, stickerMessageId, relevantMessageIds)

    const stickerSetName = sticker.setName
    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const taggedStickerFileUniqueIds = await tagRepository.queryStatus({ stickerSetName })

    await enqueueStickers({
      context,
      userId,
      stickers: stickerSet.stickers
        .map(sticker => ({
          setName: stickerSetName,
          fileId: sticker.file_id,
          fileUniqueId: sticker.file_unique_id
        }))
        .filter((sticker) => !taggedStickerFileUniqueIds.includes(sticker.fileUniqueId))
    })
  }

  /** @param {Context} context */
  async function tagUntaggedByMe(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { sticker, stickerMessageId, relevantMessageIds } = await userSessionRepository.getContext(userId)
    if (!sticker) return

    await deleteMessages(bot.telegram, context.chat.id, stickerMessageId, relevantMessageIds)

    const stickerSetName = sticker.setName
    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const taggedStickerFileUniqueIds = await tagRepository.queryStatus({ stickerSetName, authorUserId: userId })

    await enqueueStickers({
      context,
      userId,
      stickers: stickerSet.stickers
        .map(sticker => ({
          setName: stickerSetName,
          fileId: sticker.file_id,
          fileUniqueId: sticker.file_unique_id
        }))
        .filter((sticker) => !taggedStickerFileUniqueIds.includes(sticker.fileUniqueId))
    })
  }

  /** @param {Context} context */
  async function tagAll(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { sticker, stickerMessageId, relevantMessageIds } = await userSessionRepository.getContext(userId)

    if (!sticker || !stickerMessageId) return

    const stickerSetName = sticker.setName
    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)

    await deleteMessages(bot.telegram, context.chat.id, stickerMessageId, relevantMessageIds)

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