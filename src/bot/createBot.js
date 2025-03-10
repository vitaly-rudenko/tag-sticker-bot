import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { withUserId } from './middlewares/withUserId.js'
import { useQueueFlow } from './flows/queue.js'
import { useSearchFlow } from './flows/search.js'
import { useTaggingFlow } from './flows/tagging.js'
import { useCommonFlow } from './flows/common.js'
import { useFavoritesFlow } from './flows/favorites.js'
import { deleteMessages } from '../utils/deleteMessages.js'
import { useBuilderFlow } from './flows/builder.js'
import { logger } from '../logger.js'

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

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  const {
    start,
    version,
  } = useCommonFlow({ bot })

  const {
    handleFile,
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

  const {
    handlePhoto,
    createSticker,
  } = useBuilderFlow({
    bot,
    userSessionRepository,
  })

  bot.use(withUserId)
  bot.on('inline_query', handleSearch)

  bot.use((context, next) => {
    if (context.chat?.type === 'private') {
      return next()
    }
  })
  bot.on(message('sticker'), handleFile)
  bot.on(message('animation'), handleFile)
  bot.on(message('photo'), handlePhoto)
  bot.on(message('document'), handlePhoto)
  bot.on(message('text'), handleTag)

  bot.start(start)
  bot.command('version', version)

  bot.action(/^queue:step:(.+)$/, stepQueue)
  bot.action('queue:clear', clearQueue)
  bot.action('file:tag-single', tagSingle)
  bot.action('file:choose-untagged', handleChooseUntagged)
  bot.action('file:tag-untagged', tagUntagged)
  bot.action('file:tag-untagged-by-me', tagUntaggedByMe)
  bot.action('file:tag-all', tagAll)
  bot.action('file:favorite', favorite)
  bot.action('file:unfavorite', unfavorite)
  bot.action('builder:create', createSticker)
  bot.action('scope:toggle', toggleScope)

  bot.action('action:ignore', (context) => context.answerCbQuery().catch(() => {}))
  bot.action('action:cancel', async (context) => {
    if (!context.chat) return
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { tagInstructionMessageId } = await userSessionRepository.get(userId)

    await deleteMessages(bot.telegram, context.chat.id, [tagInstructionMessageId])

    try {
      await context.answerCbQuery('Action cancelled')
    } catch {
      await context.reply('👌 Action cancelled.')
    }
  })

  bot.catch(async (err, context) => {
    logger.error({
      err,
      ...context && {
        context: {
          ...context.update && Object.keys(context.update).length > 0 ? { update: context.update } : undefined,
          ...context.botInfo && Object.keys(context.botInfo).length > 0 ? { botInfo: context.botInfo } : undefined,
          ...context.state && Object.keys(context.state).length > 0 ? { state: context.state } : undefined,
        }
      },
    }, 'Unhandled telegram error')
  })

  return bot
}
