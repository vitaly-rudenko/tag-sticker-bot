import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { withUserId } from './middlewares/withUserId.js'
import { useQueueFlow } from './flows/queue.js'
import { useSearchFlow } from './flows/search.js'
import { useTaggingFlow } from './flows/tagging.js'
import { useCommonFlow } from './flows/common.js'

export async function createBot({
  telegramBotToken,
  userSessionRepository,
  queuedStickerRepository,
  tagRepository,
  stickerFinder,
}) {
  const bot = new Telegraf(telegramBotToken)

  const {
    start,
    version,
  } = useCommonFlow({ bot })

  const {
    handleSticker,
    handleChooseUntagged,
    skipQueue,
    clearQueue,
    sendNextQueuedSticker,
  } = useQueueFlow({
    userSessionRepository,
    queuedStickerRepository,
  })

  const {
    tagAll,
    tagSingle,
    tagUntagged,
    tagUntaggedByMe,
    handleTag,
  } = useTaggingFlow({
    bot,
    tagRepository,
    userSessionRepository,
    queuedStickerRepository,
    sendNextQueuedSticker,
  })

  const {
    handleSearch,
  } = useSearchFlow({ stickerFinder })

  await bot.telegram.setMyCommands([
    { command: 'start',  description: 'Get help' },
  ])

  bot.use(withUserId)

  bot.on('inline_query', handleSearch)
  bot.on(message('sticker'), handleSticker)
  bot.on(message('text'), handleTag)

  bot.start(start)
  bot.command('version', version)

  bot.action('queue:skip', skipQueue)
  bot.action('queue:clear', clearQueue)
  bot.action('sticker:tag-single', tagSingle)
  bot.action('sticker:choose-untagged', handleChooseUntagged)
  bot.action('sticker:tag-untagged', tagUntagged)
  bot.action('sticker:tag-untagged-by-me', tagUntaggedByMe)
  bot.action('sticker:tag-all', tagAll)
  
  bot.action('action:ignore', (context) => context.answerCbQuery())
  bot.action('action:cancel', async (context) => {
    await context.deleteMessage().catch(() => {})
    await context.reply('👌 Action cancelled.')
  })

  return bot
}
