import { MAX_TAGS_PER_STICKER, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH, MAX_TAG_INPUT_LENGTH } from '../../constants.js'
import { deleteMessages } from '../../utils/deleteMessages.js'
import { escapeMd } from '../../utils/escapeMd.js'
import { stickersToBitmap } from '../../utils/stickers.js'
import { parseTagValues } from '../../utils/tags.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   userSessionRepository: import('../../types.d.ts').UserSessionRepository
 *   tagRepository: import('../../types.d.ts').TagRepository
 *   proceedTagging: import('../../types.d.ts').proceedTagging,
 *   bot: import('telegraf').Telegraf
 * }} input
 */
export function useTaggingFlow({ userSessionRepository, tagRepository, bot, proceedTagging }) {
  /** @param {Context} context */
  async function handleTag(context, next) {
    if (!context.chat || !context.message || !('text' in context.message)) return
    
    const text = context.message.text
    if (text.startsWith('/')) return next()

    const { userId } = context.state
    const { phase, queue, sticker, stickerMessageId, tagInstructionMessageId } = await userSessionRepository.get(userId)
    if (phase !== 'tagging' || !sticker) return

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

    await tagRepository.store({ sticker, authorUserId: userId, values })

    await Promise.allSettled([
      bot.telegram.editMessageReplyMarkup(context.chat.id, stickerMessageId, undefined, undefined),
      deleteMessages(bot.telegram, context.chat.id, [tagInstructionMessageId]),
    ])

    await context.reply([
      `✅ The sticker is now searchable by these tags: ${values.map(value => `*__${escapeMd(value)}__*`).join(', ')}\\.`,
      ...!queue ? ["🕒 It may take up to 10 minutes to see the changes\\."] : []
    ].join('\n'), { parse_mode: 'MarkdownV2' })

    await proceedTagging(context, { userId, queue })
  }

  /** @param {Context} context */
  async function tagSingle(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const session = await userSessionRepository.get(userId)
    const { sticker, stickerMessageId, tagInstructionMessageId } = session
    if (!sticker) return

    await deleteMessages(bot.telegram, context.chat.id, [stickerMessageId, tagInstructionMessageId])

    await proceedTagging(context, { userId, sticker })
  }

  /** @param {Context} context */
  async function tagUntagged(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const session = await userSessionRepository.get(userId)
    const { sticker, stickerMessageId, tagInstructionMessageId } = session
    if (!sticker) return

    await deleteMessages(bot.telegram, context.chat.id, [stickerMessageId, tagInstructionMessageId])

    const stickerSetName = sticker.set_name
    if (!stickerSetName) {
      await context.reply('❌ Invalid sticker.')
      return
    }

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const taggedStickerFileUniqueIds = await tagRepository.queryStatus({ stickerSetName })
    const stickerSetBitmap = stickersToBitmap(
      stickerSet.stickers,
      s => !taggedStickerFileUniqueIds.has(s.file_unique_id)
    )

    await proceedTagging(context, {
      userId,
      queue: {
        stickerSetName,
        stickerSetBitmap,
        position: 1,
      }
    })
  }

  /** @param {Context} context */
  async function tagUntaggedByMe(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const session = await userSessionRepository.get(userId)
    const { sticker, stickerMessageId, tagInstructionMessageId } = session
    if (!sticker) return

    await deleteMessages(bot.telegram, context.chat.id, [stickerMessageId, tagInstructionMessageId])

    const stickerSetName = sticker.set_name
    if (!stickerSetName) {
      await context.reply('❌ Invalid sticker.')
      return
    }

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const taggedStickerFileUniqueIds = await tagRepository.queryStatus({ stickerSetName, authorUserId: userId })
    const stickerSetBitmap = stickersToBitmap(
      stickerSet.stickers,
      s => !taggedStickerFileUniqueIds.has(s.file_unique_id)
    )

    await proceedTagging(context, {
      userId,
      queue: {
        stickerSetName,
        stickerSetBitmap,
        position: 1,
      }
    })
  }

  /** @param {Context} context */
  async function tagAll(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const session = await userSessionRepository.get(userId)
    const { sticker, stickerMessageId, tagInstructionMessageId } = session
    if (!sticker) return

    const stickerSetName = sticker.set_name
    if (!stickerSetName) {
      await context.reply('❌ Invalid sticker.')
      return
    }

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)

    await deleteMessages(bot.telegram, context.chat.id, [stickerMessageId, tagInstructionMessageId])

    await proceedTagging(context, {
      userId,
      queue: {
        stickerSetName,
        stickerSetBitmap: stickersToBitmap(stickerSet.stickers, () => true),
        position: 1,
      }
    })
  }

  return {
    tagSingle,
    tagUntagged,
    tagUntaggedByMe,
    tagAll,
    handleTag,
  }
}