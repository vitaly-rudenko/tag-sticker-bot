import { Markup } from 'telegraf'
import { deleteMessages } from '../../utils/deleteMessages.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   telegram: import('telegraf').Telegram,
 *   userSessionRepository: import('../../types.d.ts').UserSessionRepository
 *   queuedStickerRepository: import('../../types.d.ts').QueuedStickerRepository
 * }} input
 */
export function useQueueFlow({
  telegram,
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
    await context.deleteMessage().catch(() => {})

    await context.reply([
      '👇 Which stickers from the set do you want to tag?',
    ].join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Not tagged by anyone', 'sticker:tag-untagged'),
        Markup.button.callback('Not tagged by me', 'sticker:tag-untagged-by-me'),
        Markup.button.callback('Re-tag all of them', 'sticker:tag-all'),
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  /** @param {Context} context */
  async function clearQueue(context) {
    if (!context.chat) return
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue has been cleared')
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { relevantMessageIds } = await userSessionRepository.getContext(userId)
    
    await Promise.all([
      userSessionRepository.clearContext(userId),
      queuedStickerRepository.clear(userId),
      deleteMessages(telegram, context.chat.id, relevantMessageIds)
    ])

    await context.reply('👌 Queue has been cleared.')
  }

  /** @param {Context} context */
  async function skipQueue(context) {
    if (!context.chat) return
    if (context.updateType === 'callback_query') context.answerCbQuery('Sticker has been skipped')
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { relevantMessageIds } = await userSessionRepository.getContext(userId)

    await deleteMessages(telegram, context.chat.id, relevantMessageIds)

    await sendNextQueuedSticker(context)
  }

  /** @param {Context} context */
  async function sendNextQueuedSticker(context) {
    const { userId } = context.state

    const queuedSticker = await queuedStickerRepository.take(userId)
    if (!queuedSticker) {
      await userSessionRepository.clearContext(userId)
      await context.reply("✅ You're all done! It may take up to 5 minutes to see the changes.")
      return
    }

    const count = await queuedStickerRepository.count(userId)

    const { message_id: stickerMessageId } = await context.replyWithSticker(
      queuedSticker.sticker.fileId,
      {
        reply_markup: Markup.inlineKeyboard(
          [
            ...count > 0 ? [
              Markup.button.callback('➡️ Skip', 'queue:skip')
            ] : [],
            Markup.button.callback(count === 0 ? '❌ Cancel' : '❌ Stop', 'queue:clear'),
          ].filter(Boolean),
          { columns: 2 },
        ).reply_markup,
      }
    )

    const { message_id } = await context.reply('👇 Send tag for this sticker \\(for example: `cute cat funny cat`\\)\\.', { parse_mode: 'MarkdownV2' })

    await userSessionRepository.amendContext(userId, {
      sticker: queuedSticker.sticker,
      stickerMessageId,
      relevantMessageIds: [message_id],
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
