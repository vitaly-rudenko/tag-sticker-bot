import { Markup, Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { Tag } from '../tags/Tag.js'

export async function createBot({
  telegramBotToken,
  userSessionRepository,
  queuedStickerRepository,
  tagRepository,
}) {
  const bot = new Telegraf(telegramBotToken)

  await bot.telegram.setMyCommands([
    { command: 'queue', description: 'Check sticker queue size' },
    { command: 'resume', description: 'Resume sticker tagging' },
    { command: 'pause', description: 'Pause sticker tagging' },
    { command: 'clear', description: 'Clear the queue of stickers' },
  ])

  bot.use((context, next) => {
    if (!context.from || context.from.is_bot) return
    context.state.userId = context.from.id
    return next()
  })

  bot.on('inline_query', async (context) => {
    if (!context.inlineQuery.query) return

    const { userId } = context.state
    const authorUserId = context.inlineQuery.query.startsWith('!') ? userId : undefined
    const query = context.inlineQuery.query.slice(authorUserId ? 1 : 0)

    const tags = await tagRepository.searchTags({ query, authorUserId })

    await context.answerInlineQuery(
      tags.map((tag, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id: tag.stickerFileId
      }))
    )
  })

  bot.on(message('sticker'), async (context) => {
    if (!context.message.sticker.set_name) return

    const stickerFileId = context.message.sticker.file_id
    const stickerSetName = context.message.sticker.set_name

    await userSessionRepository.amendContext(context.state.userId, {
      stickerFileId,
      stickerSetName,
    })

    await context.reply('What do you want to do?', {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Tag this sticker', 'sticker:tag-single'),
        Markup.button.callback('Tag untagged stickers in the set', 'sticker:tag-untagged'),
        Markup.button.callback('Tag untagged (by you) stickers in the set', 'sticker:tag-untagged-by-me'),
        Markup.button.callback('Tag all stickers in the set', 'sticker:tag-all'),
      ], { columns: 1 }).reply_markup,
    })
  })

  async function sendNextStickerInQueue(context) {
    const { userId } = context.state

    const queuedSticker = await queuedStickerRepository.take(userId)
    if (!queuedSticker) {
      await userSessionRepository.amendContext(userId, { inQueue: false })
      await context.reply('The queue is empty. Send a sticker to tag it.')
      return
    }

    const { message_id } = await context.replyWithSticker(queuedSticker.stickerFileId, {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Skip', 'queue:skip'),
        Markup.button.callback('Pause', 'queue:pause'),
        Markup.button.callback('Clear the queue', 'queue:clear'),
      ], { columns: 2 }).reply_markup
    })

    await context.reply('Please send your tag for this sticker:')

    await userSessionRepository.amendContext(userId, {
      inQueue: true,
      stickerSetName: queuedSticker.stickerSetName,
      stickerFileId: queuedSticker.stickerFileId,
      stickerMessageId: message_id,
    })
  }

  async function stopQueue(context) {
    const { userId } = context.state
    await userSessionRepository.amendContext(userId, { inQueue: false })
    await context.reply('The queue has been paused.')
  }

  async function clearQueue(context) {
    const { userId } = context.state
    await userSessionRepository.amendContext(userId, { inQueue: false })
    await queuedStickerRepository.clear(userId)
    await context.reply('The queue has been cleared.')
  }

  bot.action('queue:resume', async (context) => {
    await Promise.all([
      sendNextStickerInQueue(context),
      context.deleteMessage()
    ])
  })

  bot.action('queue:skip', async (context) => {
    await Promise.all([
      sendNextStickerInQueue(context),
      context.deleteMessage()
    ])
  })

  bot.action('queue:pause', async (context) => {
    await Promise.all([
      stopQueue(context),
      context.deleteMessage()
    ])
  })

  bot.action('queue:clear', async (context) => {
    await Promise.all([
      clearQueue(context),
      context.deleteMessage()
    ])
  })

  bot.on(message('text'), async (context, next) => {
    if (context.message.text.startsWith('/')) return next()

    const { userId } = context.state
    const { inQueue, stickerSetName, stickerFileId, stickerMessageId } = await userSessionRepository.getContext(userId)

    if (!inQueue || !stickerSetName || !stickerFileId) return

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
    await context.reply(`The sticker has been tagged as "${value}"`)
    
    await sendNextStickerInQueue(context)
  })

  async function enqueueStickers({ context, userId, stickerSetName, stickerFileIds }) {
    await queuedStickerRepository.enqueue({
      userId,
      stickers: stickerFileIds.map(stickerFileId => ({
        stickerSetName,
        stickerFileId,
      })),
    })

    if (stickerFileIds.length > 1) {
      await context.reply(`Added ${stickerFileIds.length} stickers to the queue.`, {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('Start the queue', 'queue:resume')
        ]).reply_markup,
      })
    }
  }

  bot.action('sticker:tag-single', async (context) => {
    const { userId } = context.state
    const { stickerSetName, stickerFileId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerFileId) return

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickerFileIds: [stickerFileId],
    })

    await Promise.all([
      sendNextStickerInQueue(context),
      context.deleteMessage()
    ])
  })

  bot.action('sticker:tag-untagged', async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    if (!stickerSetName) return

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
  })

  bot.action('sticker:tag-untagged-by-me', async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    if (!stickerSetName) return

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
  })

  bot.action('sticker:tag-all', async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    if (!stickerSetName) return

    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)

    await enqueueStickers({
      context,
      userId,
      stickerSetName,
      stickerFileIds: stickerSet.stickers.map(sticker => sticker.file_id),
    })
  })

  bot.command('queue', async (context) => {
    const { userId } = context.state

    const count = await queuedStickerRepository.count(userId)

    await context.reply(`There are ${count} stickers in the queue.`, {
      reply_markup: count > 0
        ? Markup.inlineKeyboard([
          Markup.button.callback('Resume', 'queue:resume')
        ]).reply_markup
        : undefined,
    })
  })

  bot.command('resume', async (context) => {
    await Promise.all([
      sendNextStickerInQueue(context),
      context.deleteMessage()
    ])
  })

  bot.command('pause', async (context) => {
    await Promise.all([
      stopQueue(context),
      context.deleteMessage()
    ])
  })

  bot.command('clear', async (context) => {
    await Promise.all([
      clearQueue(context),
      context.deleteMessage()
    ])
  })

  return bot
}
