import { Markup } from 'telegraf'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   userSessionRepository: import('../../types.d.ts').UserSessionRepository
 *   queuedStickerRepository: import('../../types.d.ts').QueuedStickerRepository
 * }} input
 */
export function useQueueFlow({
  userSessionRepository,
  queuedStickerRepository,
}) {
  /** @param {Context} context */
  async function handleSticker(context) {
    if (!context.message || !('sticker' in context.message) || !context.message.sticker.set_name) return

    const stickerFileUniqueId = context.message.sticker.file_unique_id
    const stickerFileId = context.message.sticker.file_id
    const stickerSetName = context.message.sticker.set_name

    await userSessionRepository.amendContext(context.state.userId, {
      sticker: {
        fileUniqueId: stickerFileUniqueId,
        fileId: stickerFileId,
        setName: stickerSetName,
      },
      stickerMessageId: context.message.message_id,
    })

    await context.reply([
      '👇 What do you want to do?',
    ].join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('📎 Tag this sticker', 'sticker:tag-single'),
        Markup.button.callback('🖇 Tag multiple in the set', 'sticker:choose-untagged'),
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  /** @param {Context} context */
  async function handleChooseUntagged(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue cleared')
    context.deleteMessage().catch(() => {})

    await context.reply([
      '👇 Which stickers from the set do you want to tag?',
    ].join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Not tagged by anyone', 'sticker:choose-untagged'),
        Markup.button.callback('Not tagged by me', 'sticker:tag-untagged-by-me'),
        Markup.button.callback('Re-tag all of them', 'sticker:tag-all'),
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  /** @param {Context} context */
  async function clearQueue(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue cleared')
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    await userSessionRepository.clearContext(userId)
    await queuedStickerRepository.clear(userId)
    await context.reply('🗑 The queue has been cleared.')
  }

  /** @param {Context} context */
  async function skipQueue(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue cleared')
    context.deleteMessage().catch(() => {})

    await sendNextQueuedSticker(context)
  }

  /** @param {Context} context */
  async function sendNextQueuedSticker(context) {
    const { userId } = context.state

    const queuedSticker = await queuedStickerRepository.take(userId)
    if (!queuedSticker) {
      await userSessionRepository.clearContext(userId)
      await context.reply("✅ You're all done! It may take up to 5 minutes to see the changes")
      return
    }

    const count = await queuedStickerRepository.count(userId)

    const { message_id } = await context.replyWithSticker(
      queuedSticker.sticker.fileId,
      {
        reply_markup: Markup.inlineKeyboard(
          [
            Markup.button.callback('⏯ Skip', 'queue:skip'),
            ...count > 0 ? [Markup.button.callback(`⏹ Stop`, 'queue:clear')] : [],
            Markup.button.callback('👇 Send tag for this sticker', 'action:ignore'),
          ],
          { columns: 2 },
        ).reply_markup,
      }
    )

    await userSessionRepository.amendContext(userId, {
      sticker: queuedSticker.sticker,
      stickerMessageId: message_id,
    })
  }

  return {
    handleSticker,
    handleChooseUntagged,
    clearQueue,
    skipQueue,
    sendNextQueuedSticker,
  }
}
