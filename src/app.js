import { config } from 'dotenv'
import { Markup, Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { InMemoryStickerQueueRepository } from './InMemoryStickerQueueRepository.js'
import { InMemoryStickerRepository } from './InMemoryStickerRepository.js'
import { InMemoryUserSessionRepository } from './InMemoryUserSessionRepository.js'

config()

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN ?? ''

async function start() {
  const bot = new Telegraf(telegramBotToken)

  const userSessionRepository = new InMemoryUserSessionRepository()
  const stickerRepository = new InMemoryStickerRepository()
  const stickerQueueRepository = new InMemoryStickerQueueRepository()

  bot.use((context, next) => {
    if (!context.from || context.from.is_bot) return
    context.state.userId = context.from.id
    return next()
  })

  bot.on('inline_query', async (context) => {
    const stickers = await stickerRepository.search(context.inlineQuery.query)

    await context.answerInlineQuery(
      stickers.map((sticker, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id: sticker.fileId
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
      ]).reply_markup,
    })
  })

  bot.on(message('text'), async (context) => {
    const { userId } = context.state
    const { inQueue, stickerSetName, stickerFileId } = await userSessionRepository.getContext(userId)

    if (!inQueue) return

    await stickerRepository.setTag({
      authorUserId: userId,
      stickerFileId,
      stickerSetName,
      value: context.message.text,
    })
    
    await context.reply('The sticker has been tagged.')

    const queuedSticker = await stickerQueueRepository.take(userId)
    if (!queuedSticker) {
      await userSessionRepository.amendContext(userId, { inQueue: false })
      await context.reply('The queue is empty.')
      return
    }

    await context.replyWithSticker(queuedSticker.stickerFileId)
  })

  async function refreshStickerSet(stickerSetName) {
    const stickerSet = await bot.telegram.getStickerSet(stickerSetName)
    await stickerRepository.storeStickerSet({
      name: stickerSet.name,
      title: stickerSet.title,
      stickers: stickerSet.stickers.map(sticker => ({
        fileId: sticker.file_id,
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

    await stickerQueueRepository.enqueue({
      userId,
      stickers: [{
        stickerSetName,
        fileId: stickerFileId,
      }]
    })

    await context.reply(`Added 1 sticker to the queue.`)
  })

  bot.action('sticker:tag-untagged', withRefreshedStickerSet(), async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    const stickers = await stickerRepository.getStickers(stickerSetName)
    const untaggedStickers = []

    for (const sticker of stickers) {
      const tags = await stickerRepository.getTags(sticker.stickerSetName, sticker.fileId)
      if (tags.length === 0) {
        untaggedStickers.push(sticker)
      }
    }

    await stickerQueueRepository.enqueue({
      userId,
      stickers: untaggedStickers,
    })

    await context.reply(`Added ${untaggedStickers.length} stickers to the queue.`)
  })

  bot.action('sticker:tag-untagged-by-me', withRefreshedStickerSet(), async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    const stickers = await stickerRepository.getStickers(stickerSetName)
    const untaggedStickers = []

    for (const sticker of stickers) {
      const tags = await stickerRepository.getTags(sticker.stickerSetName, sticker.fileId)
      const myTags = tags.filter(tag => tag.authorUserId === userId)

      if (myTags.length === 0) {
        untaggedStickers.push(sticker)
      }
    }

    await stickerQueueRepository.enqueue({
      userId,
      stickers: untaggedStickers,
    })

    await context.reply(`Added ${untaggedStickers.length} stickers to the queue.`)
  })

  bot.action('sticker:tag-all', withRefreshedStickerSet(), async (context) => {
    const { userId } = context.state
    const { stickerSetName } = await userSessionRepository.getContext(userId)

    const stickers = await stickerRepository.getStickers(stickerSetName)

    await stickerQueueRepository.enqueue({
      userId,
      stickers,
    })

    await context.reply(`Added ${stickers.length} stickers to the queue.`)
  })

  bot.command('start_queue', async (context) => {
    const { userId } = context.state

    const queuedSticker = await stickerQueueRepository.take(userId)
    if (!queuedSticker) {
      await context.reply('The queue is empty. Send a sticker.')
      return
    }

    await context.reply('Starting the queue.')

    await userSessionRepository.amendContext(userId, { inQueue: true })
    await context.replyWithSticker(queuedSticker.stickerFileId)
  })

  bot.command('stop_queue', async (context) => {
    const { userId } = context.state

    await userSessionRepository.amendContext(userId, { inQueue: false })

    await context.reply('The queue has been stopped.')
  })

  bot.command('clear_queue', async (context) => {
    const { userId } = context.state

    await userSessionRepository.amendContext(userId, { inQueue: false })
    await stickerQueueRepository.clear(userId)

    await context.reply('The queue has been cleared.')
  })
}

