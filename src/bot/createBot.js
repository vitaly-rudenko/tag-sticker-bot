import { Markup, Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'


export async function createBot({
  telegramBotToken,
  searchStickersInteractor,
  userSessionRepository,
  stickerQueueRepository,
  stickerRepository,
  tagRepository,
}) {
  const bot = new Telegraf(telegramBotToken)

  await bot.telegram.setMyCommands([
    { command: 'queue', description: 'Get queue size' },
    { command: 'start_queue', description: 'Start queue' },
    { command: 'stop_queue', description: 'Stop queue' },
    { command: 'clear_queue', description: 'Clear queue' },
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

    const stickers = await searchStickersInteractor.execute({ query, authorUserId })

    await context.answerInlineQuery(
      stickers.map((sticker, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id: sticker.stickerFileId
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

    const queuedSticker = await stickerQueueRepository.take(userId)
    if (!queuedSticker) {
      await userSessionRepository.amendContext(userId, { inQueue: false })
      await context.reply('The queue is empty. Send a sticker to tag it.')
      return
    }

    await context.replyWithSticker(queuedSticker.stickerFileId, {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Skip this sticker', 'queue:skip'),
        Markup.button.callback('Stop the queue', 'queue:stop'),
        Markup.button.callback('Clear the queue', 'queue:clear'),
      ], { columns: 1 }).reply_markup
    })

    await userSessionRepository.amendContext(userId, {
      inQueue: true,
      stickerSetName: queuedSticker.stickerSetName,
      stickerFileId: queuedSticker.stickerFileId,
    })
  }

  async function stopQueue(context) {
    const { userId } = context.state
    await userSessionRepository.amendContext(userId, { inQueue: false })
    await context.reply('The queue has been stopped.')
  }

  async function clearQueue(context) {
    const { userId } = context.state
    await userSessionRepository.amendContext(userId, { inQueue: false })
    await stickerQueueRepository.clear(userId)
    await context.reply('The queue has been cleared.')
  }

  bot.action('queue:start', async (context) => {
    await sendNextStickerInQueue(context)
  })

  bot.action('queue:skip', async (context) => {
    await sendNextStickerInQueue(context)
  })

  bot.action('queue:stop', async (context) => {
    await stopQueue(context)
  })

  bot.action('queue:clear', async (context) => {
    await clearQueue(context)
  })

  bot.on(message('text'), async (context, next) => {
    if (context.message.text.startsWith('/')) return next()

    const { userId } = context.state
    const { inQueue, stickerSetName, stickerFileId } = await userSessionRepository.getContext(userId)

    if (!inQueue || !stickerSetName || !stickerFileId) return

    await tagRepository.setTag({
      authorUserId: userId,
      stickerFileId,
      stickerSetName,
      value: context.message.text,
    })
    
    await sendNextStickerInQueue(context)
  })

  async function refreshStickerSet(stickerSetName) {
    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    await stickerRepository.storeStickerSet({
      name: stickerSet.name,
      title: stickerSet.title,
      stickers: stickerSet.stickers.map(sticker => ({
        stickerFileId: sticker.file_id,
      }))
    })
  }

  function withRefreshedStickerSet() {
    return async (context, next) => {
      const { stickerSetName } = await userSessionRepository.getContext(context.state.userId)
      await refreshStickerSet(stickerSetName)
      return next()
    }
  }

  bot.action('sticker:tag-single', withRefreshedStickerSet(), async (context) => {
    const { userId } = context.state
    const { stickerSetName, stickerFileId } = await userSessionRepository.getContext(userId)

    if (!stickerSetName || !stickerFileId) return

    await stickerQueueRepository.enqueue({
      userId,
      stickers: [{
        stickerSetName,
        stickerFileId,
      }]
    })

    await context.reply(`Added 1 sticker to the queue.`, {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Start the queue', 'queue:start')
      ]).reply_markup,
    })
  })

  bot.action('sticker:tag-untagged', withRefreshedStickerSet(), async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    if (!stickerSetName) return

    const stickers = await stickerRepository.queryStickers([{ stickerSetName }])
    const untaggedStickers = []

    for (const sticker of stickers) {
      const tags = await tagRepository.getTags(sticker.stickerSetName, sticker.stickerFileId)
      if (tags.length === 0) {
        untaggedStickers.push(sticker)
      }
    }

    await stickerQueueRepository.enqueue({
      userId,
      stickers: untaggedStickers,
    })

    await context.reply(`Added ${untaggedStickers.length} stickers to the queue.`, {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Start the queue', 'queue:start')
      ]).reply_markup,
    })
  })

  bot.action('sticker:tag-untagged-by-me', withRefreshedStickerSet(), async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    if (!stickerSetName) return

    const stickers = await stickerRepository.queryStickers([{ stickerSetName }])
    const untaggedStickers = []

    for (const sticker of stickers) {
      const tags = await tagRepository.getTags(sticker.stickerSetName, sticker.stickerFileId)
      const myTags = tags.filter(tag => tag.authorUserId === userId)

      if (myTags.length === 0) {
        untaggedStickers.push(sticker)
      }
    }

    await stickerQueueRepository.enqueue({
      userId,
      stickers: untaggedStickers,
    })

    await context.reply(`Added ${untaggedStickers.length} stickers to the queue.`, {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Start the queue', 'queue:start')
      ]).reply_markup,
    })
  })

  bot.action('sticker:tag-all', withRefreshedStickerSet(), async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    if (!stickerSetName) return

    const stickers = await stickerRepository.queryStickers([{ stickerSetName }])

    await stickerQueueRepository.enqueue({
      userId,
      stickers,
    })

    await context.reply(`Added ${stickers.length} stickers to the queue.`, {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Start the queue', 'queue:start')
      ]).reply_markup,
    })
  })

  bot.command('queue', async (context) => {
    const { userId } = context.state

    const count = await stickerQueueRepository.count(userId)

    await context.reply(`There are ${count} stickers in the queue.`, {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Start the queue', 'queue:start')
      ]).reply_markup,
    })
  })

  bot.command('start_queue', async (context) => {
    await sendNextStickerInQueue(context)
  })

  bot.command('stop_queue', async (context) => {
    await stopQueue(context)
  })

  bot.command('clear_queue', async (context) => {
    await clearQueue(context)
  })

  return bot
}
