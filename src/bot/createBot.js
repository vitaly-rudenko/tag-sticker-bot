import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { useQueueFlow } from './flows/queue.js'
import { useSearchFlow } from './flows/search.js'
import { useTaggingFlow } from './flows/tagging.js'
import { withUserId } from './middlewares/withUserId.js'

export async function createBot({
  telegramBotToken,
  userSessionRepository,
  queuedStickerRepository,
  tagRepository,
}) {
  const bot = new Telegraf(telegramBotToken)

  const {
    handleSticker,
    getQueueInfo,
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
  } = useSearchFlow({ tagRepository })

  await bot.telegram.setMyCommands([
    { command: 'queue',  description: 'Get queue info' },
    { command: 'clear',  description: 'Clear the queue' },
  ])

  bot.use(withUserId)

  bot.on('inline_query', handleSearch)
  bot.on(message('sticker'), handleSticker)
  bot.on(message('text'), handleTag)

  bot.command('queue', getQueueInfo)
  bot.command('clear', clearQueue)

  bot.action('queue:skip', skipQueue)
  bot.action('queue:clear', clearQueue)
  bot.action('sticker:tag-single', tagSingle)
  bot.action('sticker:tag-untagged', tagUntagged)
  bot.action('sticker:tag-untagged-by-me', tagUntaggedByMe)
  bot.action('sticker:tag-all', tagAll)

  return bot
}
