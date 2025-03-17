import pg from 'pg'
import { Context, Markup, Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { type TaggableFile } from './common/taggable-file.ts'
import { FavoritesRepository } from './favorites/favorites-repository.ts'
import { TagsRepository } from './tags/tags-repository.ts'
import { type Visibility, visibilitySchema } from './tags/visibility.ts'
import { UserSessionsRepository } from './user-sessions/user-sessions-repository.ts'
import { escapeMd } from './utils/escape-md.ts'
import { requireNonNullable } from './utils/require-non-nullable.ts'
import { logger } from './utils/logging/logger.ts'

// TODO: move mime type, set name, emoji, etc. to separate "files" table

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception')
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled rejection')
  process.exit(1)
})

const postgresClient = new pg.Client(process.env.DATABASE_URL)
await postgresClient.connect()

const tagsRepository = new TagsRepository({ client: postgresClient })
const favoritesRepository = new FavoritesRepository({ client: postgresClient })
const userSessionsRepository = new UserSessionsRepository({ client: postgresClient })

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!)

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

function formatFileType(taggableFile: TaggableFile): string {
  return taggableFile.fileType === 'sticker' ? 'sticker' : 'GIF'
}

function capitalize(input: string) {
  return input[0].toUpperCase() + input.slice(1)
}

function formatValuesList(values: string[]): string {
  return values.map(tag => `*__${escapeMd(tag)}__*`).join(', ')
}

async function $handleTaggingFileMessage(context: Context) {
  if (!context.message) return

  const requesterUserId = context.message.from.id

  const taggableFile: TaggableFile | undefined
    = 'sticker' in context.message ? {
      fileId: context.message.sticker.file_id,
      fileUniqueId: context.message.sticker.file_unique_id,
      fileType: 'sticker',
      setName: context.message.sticker.set_name,
      emoji: context.message.sticker.emoji,
    }
    : 'animation' in context.message ? {
      fileId: context.message.animation.file_id,
      fileUniqueId: context.message.animation.file_unique_id,
      fileType: 'animation',
      mimeType: requireNonNullable(context.message.animation.mime_type),
    }
    : undefined

  if (!taggableFile) return

  const isFavorite = await favoritesRepository.exists({ userId: requesterUserId, fileUniqueId: taggableFile.fileUniqueId })
  const stats = await tagsRepository.stats({ requesterUserId, fileUniqueId: taggableFile.fileUniqueId })

  const message: string[] = []
  const fileType_ = formatFileType(taggableFile)
  if (stats.public.total === 0 && stats.requester.total === 0) {
    message.push(`No one has tagged this ${fileType_} yet\\.`)
  } else {
    if (stats.requester.total > 0) {
      const visibility_ = stats.requester.visibility === 'public' ? 'public' : 'private'
      const tags_ = stats.requester.total > 1 ? 'tags' : 'tag'
      const valuesList_ = formatValuesList(stats.requester.values)
      message.push(`You have created ${stats.requester.total} *${visibility_}* ${tags_} for this ${fileType_}: ${valuesList_}\\.`)
    } else {
      message.push(`You have not tagged this ${fileType_}\\.`)
    }

    message.push('')

    if (stats.public.total > 0) {
      const remainingCount = stats.public.total - stats.public.values.length
      const tags_ = stats.public.total > 1 ? 'tags' : 'tag'
      const values_ = formatValuesList(stats.public.values)
      const andMore_ = remainingCount > 0 ? ` and ${remainingCount} more` : ''
      message.push(`This ${fileType_} has ${stats.public.total} *public* ${tags_}: ${values_}${andMore_}\\.`)
    } else {
      message.push(`No one else has tagged this ${fileType_}\\.`)
    }
  }

  message.push('', '👇 What do you want to do?')

  const promptMessage = await context.sendMessage(
    message.join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: context.message.message_id },
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback(
          stats.requester.total > 0
            ? `📎 Edit my tags`
            : `📎 Tag this ${formatFileType(taggableFile)}`,
          'tagging:tag-single'
        ),
        isFavorite
          ? Markup.button.callback('💔 Un-favorite', 'tagging:delete-from-favorites')
          : Markup.button.callback('❤️ Favorite', 'tagging:add-to-favorites'),
          Markup.button.callback('❌ Cancel', 'tagging:cancel'),
      ], { columns: 2 }).reply_markup,
    }
  )

  await userSessionsRepository.set({
    userId: requesterUserId,
    userSession: {
      tagging: {
        promptMessageId: promptMessage.message_id,
        taggableFileMessageId: context.message.message_id,
        taggableFile,
        visibility: 'public',
      }
    }
  })
}

async function $handleTaggingAddToFavoritesAction(context: Context) {
  if (!context.callbackQuery?.message) return

  const requesterUserId = context.callbackQuery.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { promptMessageId, taggableFile, taggableFileMessageId } = userSession.tagging

  await context.deleteMessage(promptMessageId).catch(() => {})

  await favoritesRepository.add({ userId: requesterUserId, taggableFile })
  await userSessionsRepository.clear({ userId: requesterUserId })

  await context.sendMessage(
    [
      `❤️ Added ${formatFileType(taggableFile)} to favorites\\.`,
      '🕒 It may take up to 10 minutes to see the changes\\.'
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId }
    }
  )
}

async function $handleTaggingDeleteFromFavoritesAction(context: Context) {
  if (!context.callbackQuery?.message) return

  const requesterUserId = context.callbackQuery.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { promptMessageId, taggableFile, taggableFileMessageId } = userSession.tagging

  await context.deleteMessage(promptMessageId).catch(() => {})

  await favoritesRepository.delete({ userId: requesterUserId, fileUniqueId: taggableFile.fileUniqueId })
  await userSessionsRepository.clear({ userId: requesterUserId })

  await context.sendMessage(
    [
      `💔 Deleted ${formatFileType(taggableFile)} from favorites\\.`,
      '🕒 It may take up to 10 minutes to see the changes\\.'
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId }
    }
  )
}

function buildTaggingInstructionsMessage(input: { visibility: Visibility; showDeleteButton: boolean }) {
  return {
    message: [
      '✏️ Send tags separated by comma\\.',
      'Example: *__cute cat__*, *__funny animal__*\\.',
      '',
      input.visibility === 'private'
        ? '🔒 No one can see your *private* tags\\.'
        : '🔓 Anyone can see your *public* tags\\.',
      `Tag authors are never revealed\\.`
    ].join('\n'),
    extra: {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard(
        [
          Markup.button.callback(`${input.visibility === 'public' ? '✅ Public' : '🔓 Make public'}`, 'tagging:set-visibility:public'),
          Markup.button.callback(`${input.visibility === 'private' ? '✅ Private' : '🔒 Make private'}`, 'tagging:set-visibility:private'),
          ...input.showDeleteButton
            ? [Markup.button.callback(`🗑 Delete my tags`, 'tagging:delete-tags')]
            : [],
          Markup.button.callback('❌ Cancel', 'tagging:cancel'),
        ],
        { wrap: (_, index) => index > 1 },
      ).reply_markup,
    }
  } as const
}

async function $handleTaggingTagSingleAction(context: Context) {
  if (!context.callbackQuery?.message) return

  const requesterUserId = context.callbackQuery.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { promptMessageId, taggableFileMessageId, taggableFile, visibility } = userSession.tagging

  if (promptMessageId) {
    await context.deleteMessage(promptMessageId).catch(() => {})
  }

  const { message, extra } = buildTaggingInstructionsMessage({
    visibility,
    showDeleteButton: await tagsRepository.exists({
      authorUserId: requesterUserId,
      fileUniqueId: taggableFile.fileUniqueId,
    })
  })

  const instructionsMessage = await context.sendMessage(
    message,
    { reply_parameters: { message_id: taggableFileMessageId }, ...extra }
  )

  await userSessionsRepository.set({
    userId: requesterUserId,
    userSession: {
      ...userSession,
      tagging: {
        ...userSession.tagging,
        promptMessageId: undefined,
        instructionsMessageId: instructionsMessage.message_id,
      }
    }
  })
}

async function $handleTaggingTextMessage(context: Context, next: Function) {
  if (!context.message || !('text' in context.message)) return

  const requesterUserId = context.message.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { visibility, taggableFile, taggableFileMessageId, instructionsMessageId } = userSession.tagging

  const text = context.message.text
  if (text.startsWith('/')) return next()

  const values = context.message.text.split(',').map(tag => tag.trim())
  if (values.some(tag => tag.length < 2)) {
    await context.sendMessage('❌ Tag must not be shorter than 2 characters.')
    return
  }
  if (values.some(tag => tag.length > 100)) {
    await context.sendMessage('❌ Tag must not be longer than 100 characters.')
    return
  }
  if (values.length > 10) {
    await context.sendMessage(`❌ No more than 10 tags are allowed per ${formatFileType(taggableFile)}.`)
    return
  }

  if (instructionsMessageId) {
    await context.deleteMessage(instructionsMessageId).catch(() => {})
  }

  await tagsRepository.replace({ authorUserId: requesterUserId, taggableFile, visibility, values })
  await userSessionsRepository.clear({ userId: requesterUserId })

  const tags_ = values.length > 1 ? 'these tags' : 'this tag'
  const valuesList_ = values.map(tag => `*__${escapeMd(tag)}__*`).join(', ')
  await context.sendMessage(
    [
      `✅ ${capitalize(formatFileType(taggableFile))} is now searchable by ${tags_}: ${valuesList_}\\.`,
      visibility === 'public' ? '🔓 Visibility: *public*\\.' : '🔒 Visibility: *private*\\.',
      '🕒 It may take up to 10 minutes to see the changes\\.',
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId }
    }
  )
}

async function $handleTaggingCancelAction(context: Context) {
  if (!context.callbackQuery?.message) return

  const requesterUserId = context.callbackQuery.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { promptMessageId, instructionsMessageId, taggableFileMessageId } = userSession.tagging

  if (promptMessageId) {
    await context.deleteMessage(promptMessageId).catch(() => {})
  }

  if (instructionsMessageId) {
    await context.deleteMessage(instructionsMessageId).catch(() => {})
  }

  await userSessionsRepository.clear({ userId: requesterUserId })

  await context.sendMessage(
    '❌ Operation cancelled\\.',
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId }
    }
  )
}

async function $handleTaggingSetVisibilityAction(context: Context) {
  if (!context.callbackQuery?.message || !('match' in context) || !Array.isArray(context.match)) return

  const requesterUserId = context.callbackQuery.from.id
  const visibility = visibilitySchema.parse(context.match[1])

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { taggableFile, instructionsMessageId } = userSession.tagging

  await userSessionsRepository.set({
    userId: requesterUserId,
    userSession: {
      ...userSession,
      tagging: {
        ...userSession.tagging,
        visibility,
      }
    }
  })

  if (instructionsMessageId) {
    const { message, extra } = buildTaggingInstructionsMessage({
      visibility,
      showDeleteButton: await tagsRepository.exists({
        authorUserId: requesterUserId,
        fileUniqueId: taggableFile.fileUniqueId,
      })
    })

    await context.editMessageText(message, extra)
  }
}

async function $handleTaggingDeleteTagsAction(context: Context) {
  if (!context.callbackQuery?.message) return

  const requesterUserId = context.callbackQuery.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { taggableFile, taggableFileMessageId, instructionsMessageId } = userSession.tagging

  if (instructionsMessageId) {
    await context.deleteMessage(instructionsMessageId).catch(() => {})
  }

  const deletedCount = await tagsRepository.deleteAll({
    authorUserId: requesterUserId,
    fileUniqueId: taggableFile.fileUniqueId,
  })

  await userSessionsRepository.clear({ userId: requesterUserId })

  const count_ = deletedCount !== null ? deletedCount : 'all your'
  const tags_ = deletedCount === 1 ? 'tag' : 'tags'
  await context.sendMessage(
    [
      `🗑 Deleted ${count_} ${tags_} for this ${formatFileType(taggableFile)}\\.`,
      '🕒 It may take up to 10 minutes to see the changes\\.'
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId }
    }
  )
}

async function $handleSearchInlineQuery(context: Context) {
  if (context.inlineQuery?.query === undefined) return

  const requesterUserId = context.inlineQuery.from.id
  const ownedOnly = context.inlineQuery.query.startsWith('!')

  const isFavoritesQuery = context.inlineQuery.query.length === 0

  let taggableFiles: TaggableFile[]
  let isPersonal = false

  if (isFavoritesQuery) {
    isPersonal = true
    taggableFiles = await favoritesRepository.list({ userId: requesterUserId, limit: 50 })
  } else if (
    context.inlineQuery.query.length >= 2 &&
    context.inlineQuery.query.length <= 100
  ) {
    const tags = await tagsRepository.search({
      query: ownedOnly ? context.inlineQuery.query.slice(1) : context.inlineQuery.query,
      requesterUserId,
      ownedOnly,
      limit: 50,
    })

    isPersonal = tags.some(tag => tag.authorUserId === requesterUserId)
    taggableFiles = tags.map(tag => tag.taggableFile)
  } else {
    return
  }

  await context.answerInlineQuery(
    taggableFiles.map((file, index) => {
      if (file.fileType === 'animation') {
        if (file.mimeType === 'video/mp4') {
          return {
            id: String(index),
            type: 'mpeg4_gif',
            mpeg4_file_id: file.fileId,
          }
        }

        if (file.mimeType === 'image/gif') {
          return {
            id: String(index),
            type: 'gif',
            gif_file_id: file.fileId,
          }
        }
      }

      return {
        type: 'sticker',
        id: String(index),
        sticker_file_id: file.fileId,
      }
    }),
    {
      cache_time: taggableFiles.length > 0 ? 10 * 60 : undefined, // 10 minutes in seconds, do not cache if no results
      is_personal: isPersonal,
      button: {
        text: isFavoritesQuery
          ? taggableFiles.length === 0
            ? "You don't have any favorite stickers or GIFs yet. Click here to add"
            : "Click here to manage your favorite stickers and GIFs"
          : "Can't find a sticker or GIF? Click here to contribute",
        start_parameter: 'stub', // for some reason this field is required
      }
    }
  )
}

bot.on('inline_query', $handleSearchInlineQuery)

// Only allow to manage favorites and tags in the private chat with bot
bot.use((context, next) => {
  if (context.chat?.type !== 'private') return
  next()
})

bot.on(message('sticker'), $handleTaggingFileMessage)
bot.on(message('animation'), $handleTaggingFileMessage)
bot.on(message('text'), $handleTaggingTextMessage)

bot.action('tagging:add-to-favorites', $handleTaggingAddToFavoritesAction)
bot.action('tagging:delete-from-favorites', $handleTaggingDeleteFromFavoritesAction)
bot.action('tagging:tag-single', $handleTaggingTagSingleAction)
bot.action(/^tagging:set-visibility:(.+?)$/, $handleTaggingSetVisibilityAction)
bot.action('tagging:delete-tags', $handleTaggingDeleteTagsAction)
bot.action('tagging:cancel', $handleTaggingCancelAction)

bot.catch((err, context) => {
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

bot.launch()
  .catch((err) => {
    logger.error({ err }, 'Failed to launch the bot')
    process.exit(1)
  })

logger.info({}, 'Started!')

export {}
