import { Markup } from 'telegraf'

export function useQueueFlow({
  userSessionRepository,
  queuedStickerRepository,
}) {
  async function handleSticker(context) {
    if (!context.message.sticker.set_name) return

    const stickerFileId = context.message.sticker.file_id
    const stickerSetName = context.message.sticker.set_name

    await userSessionRepository.amendContext(context.state.userId, {
      stickerFileId,
      stickerSetName,
      stickerMessageId: context.message.message_id,
    })

    await context.reply('👇 What do you want to do?', {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Tag this sticker', 'sticker:tag-single'),
        Markup.button.callback('Tag untagged stickers in the set', 'sticker:tag-untagged'),
        Markup.button.callback('Tag untagged (by you) stickers in the set', 'sticker:tag-untagged-by-me'),
        Markup.button.callback('Tag all stickers in the set', 'sticker:tag-all'),
      ], { columns: 1 }).reply_markup,
    })
  }

  async function getQueueInfo(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery()

    const { userId } = context.state
    const count = await queuedStickerRepository.count(userId)

    await context.reply(`✅ There are ${count} stickers in the queue.`)
  }

  async function clearQueue(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue cleared')
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    await userSessionRepository.clearContext(userId)
    await queuedStickerRepository.clear(userId)
    await context.reply('⏹ The queue has been cleared.')
  }

  async function skipQueue(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue cleared')
    context.deleteMessage().catch(() => {})

    await sendNextQueuedSticker(context)
  }

  async function sendNextQueuedSticker(context) {
    const { userId } = context.state

    const queuedSticker = await queuedStickerRepository.take(userId)
    if (!queuedSticker) {
      await userSessionRepository.clearContext(userId)
      await context.reply("✅ The queue is empty. You're all done!")
      return
    }

    const { message_id } = await context.replyWithSticker(
      queuedSticker.stickerFileId,
      {
        reply_markup: Markup.inlineKeyboard(
          [
            Markup.button.callback('⏯ Skip', 'queue:skip'),
            Markup.button.callback('⏹ Clear the queue', 'queue:clear'),
          ],
          { columns: 1 }
        ).reply_markup,
      }
    )

    await context.reply('👇 Please send your tag for this sticker:')

    await userSessionRepository.amendContext(userId, {
      stickerSetName: queuedSticker.stickerSetName,
      stickerFileId: queuedSticker.stickerFileId,
      stickerMessageId: message_id,
    })
  }

  return {
    handleSticker,
    getQueueInfo,
    clearQueue,
    skipQueue,
    sendNextQueuedSticker,
  }
}
