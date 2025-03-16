import { MAX_TAGS_PER_FILE, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH, MAX_TAG_INPUT_LENGTH } from '../../constants.ts'
import { deleteMessages } from '../../utils/deleteMessages.js'
import { escapeMd } from '../../utils/escapeMd.js'
import { filesToBitmap } from '../../utils/files.js'
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
  /** @param {Context} context @param {Function} next */
  async function handleTag(context, next) {
    if (!context.chat || !context.message || !('text' in context.message)) return

    const text = context.message.text
    if (text.startsWith('/')) return next()

    const { userId } = context.state
    const { phase, queue, isPrivate, file, fileMessageId, tagInstructionMessageId } = await userSessionRepository.get(userId)
    if (phase !== 'tagging' || !file) return

    if (text.length < MIN_QUERY_LENGTH)
      return context.reply(`❌ Input is too short, please try again`)
    if (text.length > MAX_TAG_INPUT_LENGTH)
      return context.reply(`❌ Input is too long, please try again`)

    const values = parseTagValues(text)
      .filter(value => value.length >= MIN_QUERY_LENGTH)
      .map(value => value.slice(0, MAX_QUERY_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_TAGS_PER_FILE)
    if (values.length === 0)
      return context.reply(`❌ Your tags are either too short or too long, please try again`)

    await tagRepository.store({ file, authorUserId: userId, values, isPrivate })

    await Promise.allSettled([
      bot.telegram.editMessageReplyMarkup(context.chat.id, fileMessageId, undefined, undefined),
      deleteMessages(bot.telegram, context.chat.id, [tagInstructionMessageId]),
    ])

    await context.reply([
      `✅ The file is now searchable by these tags: ${values.map(value => `*__${escapeMd(value)}__*`).join(', ')}\\.`,
      ...!queue ? ["🕒 It may take up to 10 minutes to see the changes\\."] : []
    ].join('\n'), { parse_mode: 'MarkdownV2' })

    await proceedTagging(context, { userId, queue, isPrivate })
  }

  /** @param {Context} context */
  async function tagSingle(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { file, fileMessageId, tagInstructionMessageId, isPrivate } = await userSessionRepository.get(userId)
    if (!file) return

    await deleteMessages(bot.telegram, context.chat.id, [fileMessageId, tagInstructionMessageId])

    await proceedTagging(context, { userId, file, isPrivate })
  }

  /** @param {Context} context */
  async function tagUntagged(context) {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { file, isPrivate, fileMessageId, tagInstructionMessageId } = await userSessionRepository.get(userId)
    if (!file) return

    await deleteMessages(bot.telegram, context.chat.id, [fileMessageId, tagInstructionMessageId])

    const stickerSetName = file.set_name
    if (!stickerSetName) {
      await context.reply('❌ Invalid sticker.')
      return
    }

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const taggedFileUniqueIds = await tagRepository.queryStatus({ stickerSetName, authorUserId: userId, ownedOnly: false })
    const stickerSetBitmap = filesToBitmap(
      stickerSet.stickers,
      s => !taggedFileUniqueIds.has(s.file_unique_id)
    )

    await proceedTagging(context, {
      userId,
      isPrivate,
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
    const { file, isPrivate, fileMessageId, tagInstructionMessageId } = await userSessionRepository.get(userId)
    if (!file) return

    await deleteMessages(bot.telegram, context.chat.id, [fileMessageId, tagInstructionMessageId])

    const stickerSetName = file.set_name
    if (!stickerSetName) {
      await context.reply('❌ Invalid sticker.')
      return
    }

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    const taggedFileUniqueIds = await tagRepository.queryStatus({ stickerSetName, authorUserId: userId, ownedOnly: true })
    const stickerSetBitmap = filesToBitmap(
      stickerSet.stickers,
      s => !taggedFileUniqueIds.has(s.file_unique_id)
    )

    await proceedTagging(context, {
      userId,
      isPrivate,
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
    const { file, isPrivate, fileMessageId, tagInstructionMessageId } = await userSessionRepository.get(userId)
    if (!file) return

    const stickerSetName = file.set_name
    if (!stickerSetName) {
      await context.reply('❌ Invalid sticker.')
      return
    }

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)

    await deleteMessages(bot.telegram, context.chat.id, [fileMessageId, tagInstructionMessageId])

    await proceedTagging(context, {
      userId,
      isPrivate,
      queue: {
        stickerSetName,
        stickerSetBitmap: filesToBitmap(stickerSet.stickers, () => true),
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