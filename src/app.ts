import pg from 'pg'
import fs from 'fs'
import cors from 'cors'
import express, { type Request, type Response, type NextFunction, type ErrorRequestHandler } from 'express'
import https from 'https'
import jwt from 'jsonwebtoken'
import { Context, Markup, Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { type TaggableFile } from './common/taggable-file.ts'
import { FavoritesRepository } from './favorites/favorites-repository.ts'
import { TagsRepository } from './tags/tags-repository.ts'
import { type Visibility, visibilitySchema } from './tags/visibility.ts'
import { UserSessionsRepository } from './user-sessions/user-sessions-repository.ts'
import { escapeMd } from './utils/escape-md.ts'
import { logger } from './utils/logging/logger.ts'
import { FilesRepository } from './files/files-repository.ts'
import { exhaust } from './utils/exhaust.ts'
import { isDefined } from './utils/is-defined.ts'
import { StickerSetsRepository } from './sticker-sets/sticker-sets-repository.ts'
import { type PhotoSize, type Message, type ReplyParameters } from 'telegraf/types'
import path from 'path'
import { requireNonNullable } from './utils/require-non-nullable.ts'

const isLocal = process.env.STAGE === 'local'

process.on('uncaughtException', err => {
  logger.error({ err }, 'Uncaught exception')
  process.exit(1)
})

process.on('unhandledRejection', err => {
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

async function shutdown(signal?: string) {
  console.log(`Received ${signal || 'NOSIGNAL'}, shutting down gracefully`)

  try {
    bot.stop()
  } catch {}

  try {
    await postgresClient.end()
  } catch {}

  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

await bot.telegram.setMyCommands([
  { command: 'start', description: 'Get help' },
  { command: 'tag', description: 'Reply with /tag to a media file to tag it' },
  { command: 'export', description: 'Export your tags and favorites in a ZIP format' },
])

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

function formatFileType(taggableFile: TaggableFile): string {
  return taggableFile.fileType === 'sticker'
    ? 'sticker'
    : taggableFile.fileType === 'animation'
      ? 'GIF'
      : taggableFile.fileType === 'photo'
        ? 'photo'
        : taggableFile.fileType === 'video' || taggableFile.fileType === 'video_note'
          ? 'video'
          : exhaust()
}

function capitalize(input: string) {
  return input[0].toUpperCase() + input.slice(1)
}

function formatValue(value: string): string {
  return `*__${escapeMd(value)}__*`
}

function pickLargestPhoto(photos: PhotoSize[]) {
  return [...photos].sort((a, b) => b.width * b.height - a.width * a.height)[0]
}

class UnsupportedFileFormatError extends Error {}
function extractTaggableFile(message: Message): TaggableFile | undefined {
  if ('video' in message && message.video.mime_type !== 'video/mp4') {
    throw new UnsupportedFileFormatError()
  }

  if (
    'animation' in message &&
    message.animation.mime_type !== 'video/mp4' &&
    message.animation.mime_type !== 'image/gif'
  ) {
    throw new UnsupportedFileFormatError()
  }

  if ('sticker' in message) {
    return {
      fileId: message.sticker.file_id,
      fileUniqueId: message.sticker.file_unique_id,
      fileType: 'sticker',
      setName: message.sticker.set_name,
      emoji: message.sticker.emoji,
      isVideo: message.sticker.is_video,
      isAnimated: message.sticker.is_animated,
    }
  }

  if ('animation' in message) {
    return {
      fileId: message.animation.file_id,
      fileUniqueId: message.animation.file_unique_id,
      fileType: 'animation',
      mimeType:
        message.animation.mime_type === 'image/gif'
          ? 'image/gif'
          : message.animation.mime_type === 'video/mp4'
            ? 'video/mp4'
            : exhaust(),
    }
  }

  if ('photo' in message) {
    const photo = pickLargestPhoto(message.photo)

    return {
      fileId: photo.file_id,
      fileUniqueId: photo.file_unique_id,
      fileType: 'photo',
    }
  }

  if ('video' in message) {
    return {
      fileId: message.video.file_id,
      fileUniqueId: message.video.file_unique_id,
      fileType: 'video',
      mimeType: message.video.mime_type === 'video/mp4' ? 'video/mp4' : exhaust(),
      fileName: message.video.file_name ?? 'video.mp4',
    }
  }

  if ('video_note' in message) {
    return {
      fileId: message.video_note.file_id,
      fileUniqueId: message.video_note.file_unique_id,
      fileType: 'video_note',
    }
  }

  return undefined
}

/* /start */
async function $handleStartCommand(context: Context) {
  bot.botInfo ??= await bot.telegram.getMe()

  await context.reply(
    [
      '👋 Hi, just send a file to start\\!',
      '',
      '🖼 Supports GIFs, stickers, photos, videos and video messages\\.',
      '',
      '*Tagging*',
      `📝 Tag files: ${formatValue('funny dancing cat')}\\.`,
      `🔍 Search tags: "\`@${escapeMd('sttagbot')} cat\`"\\.`,
      `💡 Your tags: "\`@${escapeMd('sttagbot')} !cat\`"\\.`,
      '',
      '*Favorites*',
      '❤️ Add files to favorites\\.',
      `🔍 Access favorites: "\`@${escapeMd('sttagbot')}\` "\\.`,
    ].join('\n'),
    { parse_mode: 'MarkdownV2' },
  )
}

/* /version */
const { version } = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
async function $handleVersionCommand(context: Context) {
  await context.reply(`🤖 Version: ${version}`)
}

async function storeTaggableFile(taggableFile: TaggableFile, message: Message, requesterUserId: number) {
  await filesRepository.upsert({
    fileUniqueId: taggableFile.fileUniqueId,
    fileId: taggableFile.fileId,
    fileType: taggableFile.fileType,
    setName: 'setName' in taggableFile ? taggableFile.setName : undefined,
    mimeType: 'mimeType' in taggableFile ? taggableFile.mimeType : undefined,
    fileName: 'fileName' in taggableFile ? taggableFile.fileName : undefined,
    emoji: 'emoji' in taggableFile ? taggableFile.emoji : undefined,
    isVideo: 'isVideo' in taggableFile ? taggableFile.isVideo : false,
    isAnimated: 'isAnimated' in taggableFile ? taggableFile.isAnimated : false,
    data:
      'sticker' in message
        ? message.sticker
        : 'animation' in message
          ? message.animation
          : 'photo' in message
            ? pickLargestPhoto(message.photo)
            : 'video' in message
              ? message.video
              : 'video_note' in message
                ? message.video_note
                : exhaust(),
  })

  if ('sticker' in message && message.sticker.set_name) {
    try {
      const stickerSet = await bot.telegram.getStickerSet(message.sticker.set_name)

      await stickerSetsRepository.upsert({
        setName: stickerSet.name,
        title: stickerSet.title,
        data: stickerSet,
      })
    } catch (error) {
      logger.warn({ error, message, requesterUserId }, 'Failed to get sticker set')
    }
  }
}

/* Tagging */
async function $handleTaggingFileMessage(context: Context) {
  if (!context.message) return

  const requesterUserId = context.message.from.id

  let taggableFile: TaggableFile | undefined
  try {
    taggableFile = extractTaggableFile(context.message)
  } catch (error) {
    if (error instanceof UnsupportedFileFormatError) {
      await context.reply(`❌ Only MP4 videos and GIF animations are supported.`)
      return
    }

    throw error
  }

  if (!taggableFile) return

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (userSession?.tagging) {
    const { promptMessageId, instructionsMessageId } = userSession.tagging
    if (promptMessageId || instructionsMessageId) {
      await bot.telegram
        .deleteMessages(context.message.chat.id, [promptMessageId, instructionsMessageId].filter(isDefined))
        .catch(() => {})
    }
  }

  await storeTaggableFile(taggableFile, context.message, requesterUserId)

  const isFavorite = await favoritesRepository.exists({
    userId: requesterUserId,
    fileUniqueId: taggableFile.fileUniqueId,
  })
  const stats = await tagsRepository.stats({ authorUserId: requesterUserId, fileUniqueId: taggableFile.fileUniqueId })

  const message_: string[] = []
  const fileType_ = formatFileType(taggableFile)
  if (stats.publicTags.total === 0 && !stats.authorTag) {
    // Don't add this message if it's a set-less sticker
    if (taggableFile.fileType !== 'sticker' || taggableFile.setName) {
      message_.push(`No one has tagged this ${fileType_} yet\\.`)
    }
  } else {
    if (stats.authorTag) {
      const visibility_ = stats.authorTag.visibility === 'public' ? 'publicly' : 'privately'
      const value_ = formatValue(stats.authorTag.value)
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

  const promptMessage = await bot.telegram.sendMessage(context.message.chat.id, message_.join('\n'), {
    parse_mode: 'MarkdownV2',
    reply_parameters: { message_id: context.message.message_id },
    reply_markup: Markup.inlineKeyboard(
      [
        Markup.button.callback(
          stats.authorTag ? `📎 Edit my tag` : `📎 Tag ${formatFileType(taggableFile)}`,
          'tagging:tag-single',
        ),
        isFavorite
          ? Markup.button.callback('💔 Un-favorite', 'tagging:delete-from-favorites')
          : Markup.button.callback('❤️ Favorite', 'tagging:add-to-favorites'),
        Markup.button.callback('❌ Cancel', 'tagging:cancel'),
      ],
      { columns: 2 },
    ).reply_markup,
  })

  await userSessionsRepository.set({
    userId: requesterUserId,
    userSession: {
      tagging: {
        promptMessageId: promptMessage.message_id,
        taggableFileMessageId: context.message.message_id,
        taggableFile,
        visibility: 'public',
      },
    },
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
      '🕒 It may take up to 5 minutes to see the changes\\.',
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId },
    },
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
      '🕒 It may take up to 5 minutes to see the changes\\.',
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId },
    },
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
    }),
  })

  const instructionsMessage = await context.sendMessage(message, {
    reply_parameters: { message_id: taggableFileMessageId },
    ...extra,
  })

  await userSessionsRepository.set({
    userId: requesterUserId,
    userSession: {
      ...userSession,
      tagging: {
        ...userSession.tagging,
        promptMessageId: undefined,
        instructionsMessageId: instructionsMessage.message_id,
      },
    },
  })
}

async function $handleTaggingTextMessage(context: Context, next: Function) {
  if (!context.message || !('text' in context.message)) return

  const requesterUserId = context.message.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { visibility, taggableFile, taggableFileMessageId, promptMessageId, instructionsMessageId } =
    userSession.tagging

  const text = context.message.text
  if (text.startsWith('/')) return next()

  const value = context.message.text.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  if (value.length < 2) {
    await context.sendMessage('❌ Tag must not be shorter than 2 characters.')
    return
  }
  if (value.length > 200) {
    await context.sendMessage('❌ Tag must not be longer than 200 characters.')
    return
  }

  if (promptMessageId) {
    await context.deleteMessage(promptMessageId).catch(() => {})
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
      '🕒 It may take up to 5 minutes to see the changes\\.',
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId },
    },
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

  await context.sendMessage('❌ Operation cancelled\\.', {
    parse_mode: 'MarkdownV2',
    reply_parameters: { message_id: taggableFileMessageId },
  })
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
      },
    },
  })

  if (instructionsMessageId) {
    const { message, extra } = buildTaggingInstructionsMessage({
      visibility,
      taggableFile,
      isReplacing: await tagsRepository.exists({
        authorUserId: requesterUserId,
        fileUniqueId: taggableFile.fileUniqueId,
      }),
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
      '🕒 It may take up to 5 minutes to see the changes\\.',
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId },
    },
  )
}

function buildTaggingInstructionsMessage(input: {
  taggableFile: TaggableFile
  visibility: Visibility
  isReplacing: boolean
}) {
  const new_ = input.isReplacing ? 'new ' : ''

  return {
    message: [
      `✏️ Send ${new_}tag for this ${formatFileType(input.taggableFile)}\\.`,
      'Example: *__cute cat, funny animal__*\\.',
      '',
      input.visibility === 'private'
        ? '🔒 No one can see your *private* tags\\.'
        : '🔓 Anyone can see your *public* tags\\.',
      `Authors of tags are never revealed\\.`,
    ].join('\n'),
    extra: {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard(
        [
          Markup.button.callback(
            `${input.visibility === 'public' ? '✅ Public' : '🔓 Make public'}`,
            'tagging:set-visibility:public',
          ),
          Markup.button.callback(
            `${input.visibility === 'private' ? '✅ Private' : '🔒 Make private'}`,
            'tagging:set-visibility:private',
          ),
          ...(input.isReplacing ? [Markup.button.callback(`🗑 Delete my tag`, 'tagging:delete-tags')] : []),
          Markup.button.callback('❌ Cancel', 'tagging:cancel'),
        ],
        { wrap: (_, index) => index > 1 },
      ).reply_markup,
    },
  } as const
}

/* Search */
async function $handleSearchInlineQuery(context: Context) {
  if (context.inlineQuery?.query === undefined) return

  const requesterUserId = context.inlineQuery.from.id
  const rawQuery = context.inlineQuery.query

  const isFavorites = rawQuery === ''
  const isRandom = rawQuery.startsWith('?') || rawQuery.startsWith('!?')
  const isOwnedOnly = rawQuery.startsWith('!') || rawQuery.startsWith('?!')
  const query = rawQuery.slice(Number(isRandom) + Number(isOwnedOnly)).trim()

  const offset: number = Number.isSafeInteger(Number(context.inlineQuery.offset))
    ? Math.max(0, Number(context.inlineQuery.offset))
    : 0

  let taggableFiles: TaggableFile[]
  let isPersonal = false

  if (isFavorites) {
    taggableFiles = await favoritesRepository.list({
      userId: requesterUserId,
      limit: 50,
      offset,
    })

    isPersonal = true
  } else if (isOwnedOnly || isRandom || (query.length >= 2 && query.length <= 100)) {
    const tags = await tagsRepository.search({
      query,
      authorUserId: requesterUserId,
      ownedOnly: isOwnedOnly,
      limit: 50,
      offset: isRandom ? 0 : offset,
      random: isRandom,
    })

    isPersonal = isOwnedOnly || tags.some(tag => tag.visibility === 'private')
    taggableFiles = tags.map(tag => tag.taggableFile)
  } else {
    return
  }

  try {
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

        if (file.fileType === 'photo') {
          return {
            id: String(index),
            type: 'photo',
            photo_file_id: file.fileId,
          }
        }

        if ((file.fileType === 'video' && file.mimeType === 'video/mp4') || file.fileType === 'video_note') {
          // Sending as type: 'mpeg4_gif' instead of type: 'video', because it shows animated preview and doesn't require 'title' field
          // When clicked, it sends a regular video with sound, so there's effectively no drawback
          return {
            id: String(index),
            type: 'mpeg4_gif',
            mpeg4_file_id: file.fileId,
          }
        }

        return {
          type: 'sticker',
          id: String(index),
          sticker_file_id: file.fileId,
        }
      }),
      {
        // 5 minutes in seconds, do not cache if no results, local or random
        cache_time: !isLocal && !isRandom && taggableFiles.length > 0 ? 5 * 60 : 1,
        is_personal: isPersonal,
        next_offset: isRandom ? '' : String(offset + taggableFiles.length),
        button: {
          text: isFavorites
            ? taggableFiles.length === 0
              ? 'Add favorite stickers, GIFs and files'
              : 'Manage your favorite stickers, GIFs and files'
            : 'Tag stickers, GIFs and files',
          start_parameter: 'stub', // for some reason this field is required
        },
      },
    )
  } catch (error) {
    if (error.response?.description.includes('DOCUMENT_INVALID')) {
      logger.warn({ error }, 'Failed to send inline query results due to invalid file')
      processPotentiallyInvalidTaggableFilesInBackground(taggableFiles)
    } else {
      throw error
    }
  }
}

const appUrl = process.env.APP_URL!
if (!appUrl) {
  throw new Error('APP_URL is not defined')
}

const jwtSecret = process.env.JWT_SECRET!
if (!jwtSecret) {
  throw new Error('JWT_SECRET is not defined')
}

type TokenPayload = {
  userId: number
  type: 'refresh' | 'access'
}

async function $handleExportCommand(context: Context) {
  if (!context.message) return

  const requesterUserId = context.message.from.id

  const tags = await tagsRepository.list({ authorUserId: requesterUserId, limit: 1 })
  const favorites = await favoritesRepository.list({ userId: requesterUserId, limit: 1 })

  if (tags.length === 0 && favorites.length === 0) {
    await context.reply('❌ Nothing to export.')
    return
  }

  const token = jwt.sign({ userId: requesterUserId, type: 'refresh' } satisfies TokenPayload, jwtSecret, {
    expiresIn: '60 seconds',
  })

  const url = new URL(appUrl)
  url.searchParams.set('token', token)

  await context.reply(
    [
      '🔗 Open this link to start the export:',
      url.toString(),
      '',
      '⚠️ The link expires in 60 seconds. Do not share it!',
    ].join('\n'),
  )
}

async function $handleTagCommand(context: Context) {
  if (!context.message || !('text' in context.message)) return

  const reply_parameters: ReplyParameters = {
    chat_id: context.message.chat.id,
    message_id: context.message.message_id,
    allow_sending_without_reply: true,
  }

  const replyToMessage = context.message.reply_to_message
  if (!replyToMessage) {
    await context.sendMessage('❌ Reply to a media file with /tag <tag> to tag it.', { reply_parameters })
    return
  }

  const requesterUserId = context.message.from.id

  let taggableFile: TaggableFile | undefined
  try {
    taggableFile = extractTaggableFile(replyToMessage)
  } catch (error) {
    if (error instanceof UnsupportedFileFormatError) {
      await context.sendMessage('❌ Only MP4 videos and GIF animations are supported.', { reply_parameters })
      return
    }

    throw error
  }

  if (!taggableFile) {
    await context.sendMessage('❌ Reply to a media file with /tag <tag> to tag it.', { reply_parameters })
    return
  }

  await storeTaggableFile(taggableFile, replyToMessage, requesterUserId)

  const value = context.message.text
    .split(' ')
    .slice(1)
    .join(' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
  if (value.length === 0) {
    await context.sendMessage('❌ Reply to a media file with /tag <tag> to tag it.', { reply_parameters })
    return
  }
  if (value.length < 2) {
    await context.sendMessage('❌ Tag must not be shorter than 2 characters.', { reply_parameters })
    return
  }
  if (value.length > 200) {
    await context.sendMessage('❌ Tag must not be longer than 200 characters.', { reply_parameters })
    return
  }

  await tagsRepository.upsert({ authorUserId: requesterUserId, taggableFile, visibility: 'public', value })

  // TODO: Add "Make private", "Delete buttons" and "OK" buttons
  // TODO: Add "Tagged by @username"
  const value_ = formatValue(value)
  await context.reply(
    [
      `✅ ${capitalize(formatFileType(taggableFile))} is now searchable by: ${value_}\\.`,
      '🔓 Visibility: *public*\\.',
      '🕒 It may take up to 5 minutes to see the changes\\.',
    ].join('\n'),
    { parse_mode: 'MarkdownV2', reply_parameters },
  )
}

async function processPotentiallyInvalidTaggableFilesInBackground(taggableFiles: TaggableFile[]) {
  try {
    for (const taggableFile of taggableFiles) {
      // avoid rate limit, processes 50 files in ~30 seconds
      await new Promise(resolve => setTimeout(resolve, 500))

      try {
        logger.info({ taggableFile }, 'Processing potentially invalid taggableFile')

        await bot.telegram.getFile(taggableFile.fileId)
      } catch (error) {
        if (error.response.description.includes('wrong file_id or the file is temporarily unavailable')) {
          await favoritesRepository.deleteAllByFileId({ fileId: taggableFile.fileId })
          await filesRepository.deleteAllByFileId({ fileId: taggableFile.fileId })
          await tagsRepository.deleteAllByFileId({ fileId: taggableFile.fileId })

          logger.warn({ taggableFile }, 'Deleted invalid taggableFile')
        } else {
          throw error
        }
      }
    }
  } catch (error) {
    logger.error({ taggableFiles }, 'Could not process all potentially invalid taggableFiles')
  }
}

bot.on('inline_query', $handleSearchInlineQuery)

// Do not allow this bot to be used in channels
bot.use(async (context, next) => {
  if (context.chat?.type === 'channel') return
  return next()
})

// Must be public to be accessible in group chats
bot.command('tag', $handleTagCommand)

// Only allow to manage favorites and tags in the private chat with bot
bot.use(async (context, next) => {
  if (context.chat?.type !== 'private') return
  return next()
})

bot.start($handleStartCommand)
bot.command('version', $handleVersionCommand)
bot.command('export', $handleExportCommand)

bot.action('tagging:add-to-favorites', $handleTaggingAddToFavoritesAction)
bot.action('tagging:delete-from-favorites', $handleTaggingDeleteFromFavoritesAction)
bot.action('tagging:tag-single', $handleTaggingTagSingleAction)
bot.action(/^tagging:set-visibility:(.+?)$/, $handleTaggingSetVisibilityAction)
bot.action('tagging:delete-tags', $handleTaggingDeleteTagsAction)
bot.action('tagging:cancel', $handleTaggingCancelAction)

bot.on(message('photo'), $handleTaggingFileMessage)
bot.on(message('video'), $handleTaggingFileMessage)
bot.on(message('video_note'), $handleTaggingFileMessage)
bot.on(message('sticker'), $handleTaggingFileMessage)
bot.on(message('animation'), $handleTaggingFileMessage)
bot.on(message('text'), $handleTaggingTextMessage)

bot.catch((err, context) => {
  logger.error(
    {
      err,
      ...(context && {
        context: {
          ...(context.update && Object.keys(context.update).length > 0 ? { update: context.update } : undefined),
          ...(context.botInfo && Object.keys(context.botInfo).length > 0 ? { botInfo: context.botInfo } : undefined),
          ...(context.state && Object.keys(context.state).length > 0 ? { state: context.state } : undefined),
        },
      }),
    },
    'Unhandled telegram error',
  )
})

logger.info({}, 'Starting...')

bot
  .launch(() => logger.info({}, 'Bot started!'))
  .catch(err => {
    logger.error({ err }, 'Failed to launch the bot')
    process.exit(1)
  })

// TODO: Extract into a separate module
// TODO: Add basic rate limiting
const app = express()
app.use(express.json())
app.use(cors())

app.get('/', async (_req, res) => {
  res.sendFile(path.join(import.meta.dirname, '../web/index.html'))
})

declare module 'express-serve-static-core' {
  interface Request {
    requesterUserId?: number
  }
}

app.post('/exchange_token', async (req, res) => {
  const { userId, type } = jwt.verify(req.body.token, jwtSecret) as TokenPayload
  if (!userId) {
    throw new Error('User ID is not present in the token')
  }
  if (type !== 'refresh') {
    throw new Error('Invalid token type')
  }

  const token = jwt.sign({ userId, type: 'access' } satisfies TokenPayload, jwtSecret, { expiresIn: '60 minutes' })
  res.json({ token })
})

const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.header('token')
  if (!token) {
    throw new Error('Token was not provided')
  }

  const { userId, type } = jwt.verify(token, jwtSecret) as TokenPayload
  if (!userId) {
    throw new Error('User ID is not present in the token')
  }
  if (type !== 'access') {
    throw new Error('Invalid token type')
  }

  req.requesterUserId = userId

  next()
}

app.get('/files/:fileId/download', authMiddleware, async (req, res) => {
  const fileId = req.params.fileId
  if (typeof fileId !== 'string') {
    throw new Error('File ID not provided')
  }

  const fileUrl = (await bot.telegram.getFileLink(fileId)).toString()
  https.get(fileUrl, proxyRes => proxyRes.pipe(res))
})

app.get('/tags', authMiddleware, async (req, res) => {
  // TODO: pagination

  const tags = await tagsRepository.list({
    authorUserId: requireNonNullable(req.requesterUserId),
    limit: 10_000,
  })

  res.json({
    pagination: {
      nextCursor: null,
      total: tags.length,
    },
    items: tags.map(tag => ({
      value: tag.value,
      visibility: tag.visibility,
      createdAt: tag.createdAt.toISOString(),
      taggableFile: {
        fileId: tag.taggableFile.fileId,
        fileUniqueId: tag.taggableFile.fileUniqueId,
        fileType: tag.taggableFile.fileType,
        setName: 'setName' in tag.taggableFile ? tag.taggableFile.setName : undefined,
        emoji: 'emoji' in tag.taggableFile ? tag.taggableFile.emoji : undefined,
        mimeType: 'mimeType' in tag.taggableFile ? tag.taggableFile.mimeType : undefined,
        fileName: 'fileName' in tag.taggableFile ? tag.taggableFile.fileName : undefined,
        isVideo: 'isVideo' in tag.taggableFile ? tag.taggableFile.isVideo : undefined,
        isAnimated: 'isAnimated' in tag.taggableFile ? tag.taggableFile.isAnimated : undefined,
      },
    })),
  })
})

app.get('/favorites', authMiddleware, async (req, res) => {
  // TODO: pagination

  const favorites = await favoritesRepository.list({
    userId: requireNonNullable(req.requesterUserId),
    limit: 10_000,
  })

  res.json({
    pagination: {
      nextCursor: null,
      total: favorites.length,
    },
    items: favorites.map(favorite => ({
      taggableFile: {
        fileId: favorite.fileId,
        fileUniqueId: favorite.fileUniqueId,
        fileType: favorite.fileType,
        setName: 'setName' in favorite ? favorite.setName : undefined,
        emoji: 'emoji' in favorite ? favorite.emoji : undefined,
        mimeType: 'mimeType' in favorite ? favorite.mimeType : undefined,
        fileName: 'fileName' in favorite ? favorite.fileName : undefined,
        isVideo: 'isVideo' in favorite ? favorite.isVideo : undefined,
        isAnimated: 'isAnimated' in favorite ? favorite.isAnimated : undefined,
      },
    })),
  })
})

app.use(((err, req, res, _next) => {
  logger.error({ err, url: req.url }, `Unexpected server error: ${err.message}`)

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error',
    },
  })
}) satisfies ErrorRequestHandler)

const port = Number(process.env.PORT) || 3000
app.listen(port, () => logger.info({}, `Server started on ${port}!`))

export {}
