import pg from 'pg'
import fs from 'fs'
import sharp from 'sharp'
import { Readable } from 'stream'
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
import { FilesRepository } from './files/files-repository.ts'
import { exhaust } from './utils/exhaust.ts'
import { isDefined } from './utils/is-defined.ts'
import { StickerSetsRepository } from './sticker-sets/sticker-sets-repository.ts'
import { type Message } from 'telegraf/types'

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
const filesRepository = new FilesRepository({ client: postgresClient })
const stickerSetsRepository = new StickerSetsRepository({ client: postgresClient })

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!)

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

function formatFileType(taggableFile: TaggableFile): string {
  return taggableFile.fileType === 'sticker' ? 'sticker' : 'GIF'
}

function capitalize(input: string) {
  return input[0].toUpperCase() + input.slice(1)
}

function formatValue(value: string): string {
  return `*__${escapeMd(value)}__*`
}

/* /start */
async function $handleStartCommand(context: Context) {
  bot.botInfo ??= await bot.telegram.getMe()

  await context.reply([
    '👋 Hi, just send a sticker or GIF to tag or mark as favorite\\.',
    '',
    '*Tagging*',
    '📝 Tag stickers and GIFs to quickly find them: *__funny dancing cat__*\\.',
    `🔍 After tagging a file, type "\`@${escapeMd(bot.botInfo.username)} cat\`" to quickly find it\\.`,
    `💡 To search by your own tags, add *\\!* to the query: "\`@${escapeMd(bot.botInfo.username)} !cat\`"`,
    '',
    '*Favorites*',
    '❤️ You can also mark a file as your favorite\\.',
    `🔍 Quickly get your favorite files by typing "\`@${escapeMd(bot.botInfo.username)}\` "\\.`,
    '',
    '*Builder*',
    '🖼 You can also create a new sticker by sending a photo or a file\\.',
  ].join('\n'), { parse_mode: 'MarkdownV2' })
}

/* /version */
const { version } = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
async function $handleVersionCommand(context: Context) {
  await context.reply(`🤖 Version: ${version}`)
}

/* Tagging */
async function $handleTaggingFileMessage(
  fileMessage: Message,
  requesterUserId: number,
) {
  const taggableFile: TaggableFile | undefined
    = 'sticker' in fileMessage ? {
      fileId: fileMessage.sticker.file_id,
      fileUniqueId: fileMessage.sticker.file_unique_id,
      fileType: 'sticker',
      setName: fileMessage.sticker.set_name,
      emoji: fileMessage.sticker.emoji,
    }
    : 'animation' in fileMessage ? {
      fileId: fileMessage.animation.file_id,
      fileUniqueId: fileMessage.animation.file_unique_id,
      fileType: 'animation',
      mimeType: requireNonNullable(fileMessage.animation.mime_type),
    }
    : undefined

  if (!taggableFile) return

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (userSession?.tagging) {
    const { promptMessageId, instructionsMessageId } = userSession.tagging
    if (promptMessageId || instructionsMessageId) {
      await bot.telegram.deleteMessages(
        fileMessage.chat.id,
        [promptMessageId, instructionsMessageId].filter(isDefined)
      ).catch(() => {})
    }
  }

  await filesRepository.upsert({
    fileUniqueId: taggableFile.fileUniqueId,
    fileType: taggableFile.fileType,
    setName: 'sticker' in fileMessage ? fileMessage.sticker.set_name : undefined,
    mimeType: 'animation' in fileMessage ? fileMessage.animation.mime_type : undefined,
    data: 'sticker' in fileMessage
      ? fileMessage.sticker
      : 'animation' in fileMessage
      ? fileMessage.animation
      : exhaust(),
  })

  if ('sticker' in fileMessage) {
    if (fileMessage.sticker.set_name) {
      try {
        const stickerSet = await bot.telegram.getStickerSet(fileMessage.sticker.set_name)

        await stickerSetsRepository.upsert({
          setName: stickerSet.name,
          title: stickerSet.title,
          data: stickerSet,
        })
      } catch (error) {
        logger.error({ error, message: fileMessage, requesterUserId }, 'Failed to get sticker set')
      }
    }
  }

  const isFavorite = await favoritesRepository.exists({ userId: requesterUserId, fileUniqueId: taggableFile.fileUniqueId })
  const stats = await tagsRepository.stats({ requesterUserId, fileUniqueId: taggableFile.fileUniqueId })

  const message_: string[] = []
  const fileType_ = formatFileType(taggableFile)
  if (stats.publicTags.total === 0 && !stats.requesterTag) {
    // Don't add this message if it's a set-less sticker
    if (taggableFile.fileType !== 'sticker' || taggableFile.setName) {
      message_.push(`No one has tagged this ${fileType_} yet\\.`)
    }
  } else {
    if (stats.requesterTag) {
      const visibility_ = stats.requesterTag.visibility === 'public' ? 'publicly' : 'privately'
      const value_ = formatValue(stats.requesterTag.value)
      message_.push(`You have *${visibility_}* tagged this ${fileType_}: ${value_}\\.`)
    } else {
      message_.push(`You have not tagged this ${fileType_}\\.`)
    }

    message_.push('')

    if (stats.publicTags.total > 0) {
      const remainingCount = stats.publicTags.total - stats.publicTags.values.length
      const tags_ = stats.publicTags.total > 1 ? 'tags' : 'tag'
      const values_ = stats.publicTags.values.map(value => formatValue(value))
      const andMore_ = remainingCount > 0 ? ` and ${remainingCount} more` : ''
      message_.push(`This ${fileType_} has ${stats.publicTags.total} *public* ${tags_}: ${values_}${andMore_}\\.`)
    } else {
      message_.push(`No one else has tagged this ${fileType_}\\.`)
    }
  }

  if (message_.length > 0) message_.push('')
  message_.push('👇 What do you want to do?')

  const promptMessage = await bot.telegram.sendMessage(
    fileMessage.chat.id,
    message_.join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: fileMessage.message_id },
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback(
          stats.requesterTag
            ? `📎 Edit my tag`
            : `📎 Tag ${formatFileType(taggableFile)}`,
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
        taggableFileMessageId: fileMessage.message_id,
        taggableFile,
        visibility: 'public',
      }
    }
  })
}

async function $handleTaggingAddToFavoritesAction(context: Context) {
  if (!context.callbackQuery?.message) return
  await context.answerCbQuery()

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
  await context.answerCbQuery()

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

async function $handleTaggingTagSingleAction(context: Context) {
  if (!context.callbackQuery?.message) return
  await context.answerCbQuery()

  const requesterUserId = context.callbackQuery.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { promptMessageId, taggableFileMessageId, taggableFile, visibility } = userSession.tagging

  if (promptMessageId) {
    await context.deleteMessage(promptMessageId).catch(() => {})
  }

  const { message, extra } = buildTaggingInstructionsMessage({
    visibility,
    taggableFile,
    isReplacing: await tagsRepository.exists({
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

  const value = context.message.text.trim()
  if (value.length < 2) {
    await context.sendMessage('❌ Tag must not be shorter than 2 characters.')
    return
  }
  if (value.length > 200) {
    await context.sendMessage('❌ Tag must not be longer than 200 characters.')
    return
  }

  if (instructionsMessageId) {
    await context.deleteMessage(instructionsMessageId).catch(() => {})
  }

  await tagsRepository.upsert({ authorUserId: requesterUserId, taggableFile, visibility, value })
  await userSessionsRepository.clear({ userId: requesterUserId })

  const value_ = formatValue(value)
  await context.sendMessage(
    [
      `✅ ${capitalize(formatFileType(taggableFile))} is now searchable by: ${value_}\\.`,
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
  await context.answerCbQuery()

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
  await context.answerCbQuery()

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
      taggableFile,
      isReplacing: await tagsRepository.exists({
        authorUserId: requesterUserId,
        fileUniqueId: taggableFile.fileUniqueId,
      })
    })

    await context.editMessageText(message, extra).catch(() => {})
  }
}

async function $handleTaggingDeleteTagsAction(context: Context) {
  if (!context.callbackQuery?.message) return
  await context.answerCbQuery()

  const requesterUserId = context.callbackQuery.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { taggableFile, taggableFileMessageId, instructionsMessageId } = userSession.tagging

  if (instructionsMessageId) {
    await context.deleteMessage(instructionsMessageId).catch(() => {})
  }

  await tagsRepository.delete({
    authorUserId: requesterUserId,
    fileUniqueId: taggableFile.fileUniqueId,
  })

  await userSessionsRepository.clear({ userId: requesterUserId })

  await context.sendMessage(
    [
      `🗑 Deleted your tag for this ${formatFileType(taggableFile)}\\.`,
      '🕒 It may take up to 10 minutes to see the changes\\.'
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId }
    }
  )
}

function buildTaggingInstructionsMessage(input: { taggableFile: TaggableFile; visibility: Visibility; isReplacing: boolean }) {
  const new_ = input.isReplacing ? 'new ' : ''

  return {
    message: [
      `✏️ Send ${new_}tag for this ${formatFileType(input.taggableFile)}\\.`,
      'Example: *__cute cat, funny animal__*\\.',
      '',
      input.visibility === 'private'
        ? '🔒 No one can see your *private* tags\\.'
        : '🔓 Anyone can see your *public* tags\\.',
      `Authors of tags are never revealed\\.`
    ].join('\n'),
    extra: {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard(
        [
          Markup.button.callback(`${input.visibility === 'public' ? '✅ Public' : '🔓 Make public'}`, 'tagging:set-visibility:public'),
          Markup.button.callback(`${input.visibility === 'private' ? '✅ Private' : '🔒 Make private'}`, 'tagging:set-visibility:private'),
          ...input.isReplacing
            ? [Markup.button.callback(`🗑 Delete my tag`, 'tagging:delete-tags')]
            : [],
          Markup.button.callback('❌ Cancel', 'tagging:cancel'),
        ],
        { wrap: (_, index) => index > 1 },
      ).reply_markup,
    }
  } as const
}

/* Search */
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

const STICKER_SIZE = 512;
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5_000_000 // 5 mb
const STICKER_PIPELINE_TIMEOUT_SECONDS = 30

/* Builder */
async function $handlerBuilderFileMessage(context: Context) {
  if (!context.message) return

  const requesterUserId = context.message.from.id

  const extra = {
    reply_to_message_id: context.message.message_id,
    parse_mode: 'MarkdownV2',
  } as const

  let file
  if ('photo' in context.message) {
    const photo = context.message.photo
      .find(photo => photo.width >= STICKER_SIZE || photo.height >= STICKER_SIZE)
      ?? context.message.photo.at(-1)

    if (!photo || !photo.file_size) {
      await context.reply('❌ Invalid photo.', extra)
      return
    }

    if (photo.file_size > MAX_FILE_SIZE_BYTES) {
      await context.reply('❌ The photo is too large, max size is 1 MB.', extra)
      return
    }

    file = {
      file_id: photo.file_id,
      file_unique_id: photo.file_unique_id,
    }
  } else if ('document' in context.message) {
    if (!context.message.document.mime_type
     || !SUPPORTED_MIME_TYPES.includes(context.message.document.mime_type)
     || !context.message.document.file_size) {
      await context.reply('❌ Invalid file.', extra)
      return
    }

    if (context.message.document.file_size > MAX_FILE_SIZE_BYTES) {
      await context.reply(`❌ The file is too large, max size is 5 MB.`, extra)
      return
    }

    file = {
      file_id: context.message.document.file_id,
      file_unique_id: context.message.document.file_unique_id,
    }
  } else {
    return
  }

  const loadingMessage = await context.reply('⌛ Creating a sticker, please wait...')

  const fileLink = await bot.telegram.getFileLink(file.file_id)
  const fileResponse = await fetch(fileLink.toString())
  if (!fileResponse.body) return

  const stickerPipeline = sharp()
    .resize({ fit: 'inside', width: STICKER_SIZE, height: STICKER_SIZE })
    .webp({ quality: 100 })
    .timeout({ seconds: STICKER_PIPELINE_TIMEOUT_SECONDS })

  Readable.fromWeb(fileResponse.body).pipe(stickerPipeline)

  const stickerMessage = await context.replyWithSticker({ source: stickerPipeline })
  await context.deleteMessage(loadingMessage.message_id).catch(() => {})

  await $handleTaggingFileMessage(stickerMessage, requesterUserId)
}

bot.on('inline_query', $handleSearchInlineQuery)

// Only allow to manage favorites and tags in the private chat with bot
bot.use(async (context, next) => {
  if (context.chat?.type !== 'private') return
  return next()
})

bot.start($handleStartCommand)
bot.command('version', $handleVersionCommand)

bot.action('tagging:add-to-favorites', $handleTaggingAddToFavoritesAction)
bot.action('tagging:delete-from-favorites', $handleTaggingDeleteFromFavoritesAction)
bot.action('tagging:tag-single', $handleTaggingTagSingleAction)
bot.action(/^tagging:set-visibility:(.+?)$/, $handleTaggingSetVisibilityAction)
bot.action('tagging:delete-tags', $handleTaggingDeleteTagsAction)
bot.action('tagging:cancel', $handleTaggingCancelAction)

bot.on(message('sticker'), (context) => $handleTaggingFileMessage(context.message, context.from.id))
bot.on(message('animation'), (context) => $handleTaggingFileMessage(context.message, context.from.id))
bot.on(message('photo'), $handlerBuilderFileMessage)
bot.on(message('document'), $handlerBuilderFileMessage)
bot.on(message('text'), $handleTaggingTextMessage)

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

logger.info({}, 'Starting...')

bot
  .launch(() => logger.info({}, 'Started!'))
  .catch((err) => {
    logger.error({ err }, 'Failed to launch the bot')
    process.exit(1)
  })

export {}
