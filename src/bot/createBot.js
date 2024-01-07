import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { withUserId } from './middlewares/withUserId.js'
import { useQueueFlow } from './flows/queue.js'
import { useSearchFlow } from './flows/search.js'
import { useTaggingFlow } from './flows/tagging.js'
import { useCommonFlow } from './flows/common.js'
import { useFavoritesFlow } from './flows/favorites.js'
import { deleteMessages } from '../utils/deleteMessages.js'

/**
 * @param {{
 *   telegramBotToken: string
 *   userSessionRepository: import('../types.d.ts').UserSessionRepository,
 *   tagRepository: import('../types.d.ts').TagRepository,
 *   favoriteRepository: import('../types.d.ts').FavoriteRepository,
 * }} input
 */
export async function createBot({
  telegramBotToken,
  userSessionRepository,
  tagRepository,
  favoriteRepository,
}) {
  const bot = new Telegraf(telegramBotToken)

  const {
    start,
    version,
  } = useCommonFlow({ bot })

  const {
    handleSticker,
    handleChooseUntagged,
    stepQueue,
    clearQueue,
    toggleScope,
    proceedTagging,
  } = useQueueFlow({
    telegram: bot.telegram,
    userSessionRepository,
    favoriteRepository,
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
    proceedTagging,
  })

  const {
    handleSearch,
  } = useSearchFlow({
    tagRepository,
    favoriteRepository,
  })

  const {
    favorite,
    unfavorite,
  } = useFavoritesFlow({
    telegram: bot.telegram,
    favoriteRepository,
    userSessionRepository,
  })

  bot.use(withUserId)
  bot.on('inline_query', handleSearch)

  bot.use((context, next) => {
    if (context.chat?.type === 'private') {
      return next()
    }
  })
  bot.on(message('sticker'), handleSticker)
  bot.on(message('text'), handleTag)

  bot.start(start)
  bot.command('version', version)

  bot.action(/^queue:step:(.+)$/, stepQueue)
  bot.action('queue:clear', clearQueue)
  bot.action('sticker:tag-single', tagSingle)
  bot.action('sticker:choose-untagged', handleChooseUntagged)
  bot.action('sticker:tag-untagged', tagUntagged)
  bot.action('sticker:tag-untagged-by-me', tagUntaggedByMe)
  bot.action('sticker:tag-all', tagAll)
  bot.action('sticker:favorite', favorite)
  bot.action('sticker:unfavorite', unfavorite)
  bot.action('scope:toggle', toggleScope)

  bot.action('action:ignore', (context) => context.answerCbQuery().catch(() => {}))
  bot.action('action:cancel', async (context) => {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { tagInstructionMessageId } = await userSessionRepository.get(userId)

    await deleteMessages(bot.telegram, context.chat.id, [tagInstructionMessageId])
    await context.reply('👌 Action cancelled.')
  })

  return bot
}
