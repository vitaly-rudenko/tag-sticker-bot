import { Markup } from 'telegraf'
import { deleteMessages } from '../../utils/deleteMessages.js'
import { getBitmapIndex } from '../../utils/bitmap.js'
import { sortStickers } from '../../utils/stickers.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   telegram: import('telegraf').Telegram,
 *   userSessionRepository: import('../../types.d.ts').UserSessionRepository
 * }} input
 */
export function useQueueFlow({
  telegram,
  userSessionRepository,
}) {
  /** @param {Context} context */
  async function handleSticker(context) {
    if (!context.message || !('sticker' in context.message)) return

    const stickerFileUniqueId = context.message.sticker.file_unique_id
    const stickerFileId = context.message.sticker.file_id
    const stickerSetName = context.message.sticker.set_name

    await userSessionRepository.set(context.state.userId, {
      sticker: {
        file_unique_id: stickerFileUniqueId,
        file_id: stickerFileId,
        set_name: stickerSetName,
      },
      stickerMessageId: context.message.message_id,
    })

    await context.reply([
      '👇 What do you want to do?',
    ].join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('📎 Tag this sticker', 'sticker:tag-single'),
        ...stickerSetName ? [Markup.button.callback('🖇 Tag all stickers in the set', 'sticker:choose-untagged')]: [],
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  /** @param {Context} context */
  async function handleChooseUntagged(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue cleared').catch(() => {})
    await context.deleteMessage().catch(() => {})

    await context.reply([
      '👇 Which stickers from the set do you want to tag?',
    ].join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Not tagged by anyone yet', 'sticker:tag-untagged'),
        Markup.button.callback('Not tagged by me', 'sticker:tag-untagged-by-me'),
        Markup.button.callback('Re-tag all of them', 'sticker:tag-all'),
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  /** @param {Context} context */
  async function clearQueue(context) {
    if (!context.chat) return
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue has been cleared').catch(() => {})
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { tagInstructionMessageId } = await userSessionRepository.get(userId)
    
    await Promise.all([
      userSessionRepository.clear(userId),
      deleteMessages(telegram, context.chat.id, [tagInstructionMessageId])
    ])

    await context.reply('👌 Queue has been cleared.')
  }

  async function stepQueue(context) {
    const steps = Number(context.match[1])
    if (!Number.isInteger(steps) || steps === 0) return

    if (!context.chat) return
    if (context.updateType === 'callback_query') context.answerCbQuery('Going back').catch(() => {})
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { tagInstructionMessageId, queue } = await userSessionRepository.get(userId)
    
    await deleteMessages(telegram, context.chat.id, [tagInstructionMessageId])
    
    if (!queue) return
    await proceedTagging(context, {
      userId,
      queue: {
        ...queue,
        position: queue.position + steps - 1,
      }
    })
  }

  /** @type {import('../../types.d.ts').proceedTagging} */
  async function proceedTagging(context, { userId, queue, sticker }) {
    if (!sticker && (!queue || queue.position > queue.stickerSetBitmap.size)) {
      await userSessionRepository.clear(userId)
      if (queue) {
        await context.reply("✅ You're all done! It may take up to 10 minutes to see the changes.")
      }
      return
    }

    if (!sticker && queue) {
      const index = getBitmapIndex(queue.stickerSetBitmap.bitmap, queue.position)
      const stickerSet = await telegram.getStickerSet(queue.stickerSetName)
      const stickers = sortStickers(stickerSet.stickers)
      
      sticker = stickers[index]
    }

    if (!sticker) {
      await context.reply("❌ Invalid sticker.")
      return 
    }

    const { message_id: stickerMessageId } = await context.replyWithSticker(
      sticker.file_id,
      {
        reply_markup: Markup.inlineKeyboard(
          [
            
            ...queue && queue.position < queue.stickerSetBitmap.size ? [
              Markup.button.callback(
                `➡️ Skip (${queue.position}/${queue.stickerSetBitmap.size})`,
                'queue:step:1'
              )
            ] : [],
            ...queue && queue.position > 1 ? [
              Markup.button.callback(
                `⬅️ Undo`,
                'queue:step:-1'
              )
            ] : [],
            Markup.button.callback('❌ Stop', 'queue:clear'),
          ].filter(Boolean),
          { wrap: (_, i) => i === 1 },
        ).reply_markup,
      }
    )
 
    const { message_id } = await context.reply(
      '✏️ Send tags separated by comma\\. Keep them short, for example: *__cute cat, funny cat__*\\.',
      { parse_mode: 'MarkdownV2' }
    )

    await userSessionRepository.set(userId, {
      sticker: {
        set_name: sticker.set_name,
        file_id: sticker.file_id,
        file_unique_id: sticker.file_unique_id,
      },
      stickerMessageId,
      tagInstructionMessageId: message_id,
      ...queue && {
        queue: {
          stickerSetBitmap: queue.stickerSetBitmap,
          stickerSetName: queue.stickerSetName,
          position: queue.position + 1,
        }
      }
    })
  }

  return {
    handleSticker,
    handleChooseUntagged,
    clearQueue,
    stepQueue,
    proceedTagging,
  }
}
