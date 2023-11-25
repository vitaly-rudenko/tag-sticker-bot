import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { withUserId } from './middlewares/withUserId.js'
import { useQueueFlow } from './flows/queue.js'
import { useSearchFlow } from './flows/search.js'
import { useTaggingFlow } from './flows/tagging.js'
import { useCommonFlow } from './flows/common.js'
import { useFavoritesFlow } from './flows/favorites.js'
import { deleteMessages } from '../utils/deleteMessages.js'
import { escapeMd } from '../utils/escapeMd.js'

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

  bot.command('create_sticker_sets', async (context) => {
    bot.botInfo ??= await bot.telegram.getMe()

    const { userId } = context.state

    const favorites = await favoriteRepository.query({ userId: context.state.userId, limit: 200 })
    if (favorites.length === 0) {
      await context.reply("❌ You don't have any favorite stickers yet.")
      return
    }

    const formats = {
      static: favorites.filter(s => !s.is_animated && !s.is_video),
      animated: favorites.filter(s => s.is_animated),
      video: favorites.filter(s => s.is_video),
    }

    /** @type {{ format: string, url: string }[]} */
    const stickerSets = []

    for (const [format, stickers] of Object.entries(formats)) {
      if (stickers.length === 0) continue

      const name = `${format}_${userId}_by_${bot.botInfo.username}`
      const url = `https://t.me/addstickers/${name}`

      await bot.telegram.deleteStickerSet(name).catch(() => {})

      /** @type {import('telegraf').Types.ExtraAddStickerToSet['sticker'][]} */
      const stickersToAdd = []
      for (const sticker of stickers) {
        const file = await bot.telegram.uploadStickerFile(
          userId,
          { url: (await bot.telegram.getFileLink(sticker.file_id)).toString() },
          // @ts-ignore
          format,
        )

        stickersToAdd.push({
          emoji_list: [sticker.emoji || '❤️'],
          sticker: file.file_id,
        })
      }

      try {
        await context.createNewStickerSet(
          name,
          format === 'static' ? `❤️` : `❤️ – ${format}`,
          {
            // @ts-ignore
            sticker_format: format,
            stickers: stickersToAdd,
          }
        )
  
        stickerSets.push({ format, url })
      } catch (error) {
        console.log(error)
      }
    }

    const formatName = { static: 'regular', animated: 'animated', video: 'video' }

    await context.reply([
      `✅ Created these sticker sets from your favorite stickers: ${stickerSets.map(({ format, url }) => `[${formatName[format]}](${escapeMd(url)})`).join(', ')}\\.`,
      '🕒 It may take a few minutes to see the changes\\.'
    ].join('\n'), { parse_mode: 'MarkdownV2' })
  })

  bot.action(/^queue:step:(.+)$/, stepQueue)
  bot.action('queue:clear', clearQueue)
  bot.action('sticker:tag-single', tagSingle)
  bot.action('sticker:choose-untagged', handleChooseUntagged)
  bot.action('sticker:tag-untagged', tagUntagged)
  bot.action('sticker:tag-untagged-by-me', tagUntaggedByMe)
  bot.action('sticker:tag-all', tagAll)
  bot.action('sticker:favorite', favorite)
  bot.action('sticker:unfavorite', unfavorite)
  
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
