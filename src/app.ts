import pg from 'pg'
import fs from 'fs'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
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
import { type PhotoSize } from 'telegraf/types'
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

/* Tagging */
async function $handleTaggingFileMessage(context: Context) {
  if (!context.message) return

  const requesterUserId = context.message.from.id

  if ('video' in context.message && context.message.video.mime_type !== 'video/mp4') {
    await context.reply(`❌ Sorry, only MP4 videos are supported.`)
    return
  }

  if (
    'animation' in context.message &&
    context.message.animation.mime_type !== 'video/mp4' &&
    context.message.animation.mime_type !== 'image/gif'
  ) {
    await context.reply(`❌ Sorry, only MP4 and GIF animations are supported.`)
    return
  }

  const taggableFile: TaggableFile | undefined =
    'sticker' in context.message
      ? {
          fileId: context.message.sticker.file_id,
          fileUniqueId: context.message.sticker.file_unique_id,
          fileType: 'sticker',
          setName: context.message.sticker.set_name,
          emoji: context.message.sticker.emoji,
          isVideo: context.message.sticker.is_video,
          isAnimated: context.message.sticker.is_animated,
        }
      : 'animation' in context.message
        ? {
            fileId: context.message.animation.file_id,
            fileUniqueId: context.message.animation.file_unique_id,
            fileType: 'animation',
            mimeType:
              context.message.animation.mime_type === 'image/gif'
                ? 'image/gif'
                : context.message.animation.mime_type === 'video/mp4'
                  ? 'video/mp4'
                  : exhaust(),
          }
        : 'photo' in context.message
          ? {
              fileId: pickLargestPhoto(context.message.photo).file_id,
              fileUniqueId: pickLargestPhoto(context.message.photo).file_unique_id,
              fileType: 'photo',
            }
          : 'video' in context.message
            ? {
                fileId: context.message.video.file_id,
                fileUniqueId: context.message.video.file_unique_id,
                fileType: 'video',
                mimeType: context.message.video.mime_type === 'video/mp4' ? 'video/mp4' : exhaust(),
                fileName: context.message.video.file_name ?? 'video.mp4',
              }
            : 'video_note' in context.message
              ? {
                  fileId: context.message.video_note.file_id,
                  fileUniqueId: context.message.video_note.file_unique_id,
                  fileType: 'video_note',
                }
              : undefined

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
      'sticker' in context.message
        ? context.message.sticker
        : 'animation' in context.message
          ? context.message.animation
          : 'photo' in context.message
            ? pickLargestPhoto(context.message.photo)
            : 'video' in context.message
              ? context.message.video
              : 'video_note' in context.message
                ? context.message.video_note
                : exhaust(),
  })

  if ('sticker' in context.message) {
    if (context.message.sticker.set_name) {
      try {
        const stickerSet = await bot.telegram.getStickerSet(context.message.sticker.set_name)

        await stickerSetsRepository.upsert({
          setName: stickerSet.name,
          title: stickerSet.title,
          data: stickerSet,
        })
      } catch (error) {
        logger.warn({ error, message: context.message, requesterUserId }, 'Failed to get sticker set')
      }
    }
  }

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
  const ownedOnly = context.inlineQuery.query.startsWith('!')
  const effectiveQuery = ownedOnly ? context.inlineQuery.query.slice(1) : context.inlineQuery.query
  const isFavoritesQuery = context.inlineQuery.query === ''

  const offset: number = Number.isSafeInteger(Number(context.inlineQuery.offset))
    ? Math.max(0, Number(context.inlineQuery.offset))
    : 0

  let taggableFiles: TaggableFile[]
  let isPersonal = false

  if (isFavoritesQuery) {
    isPersonal = true
    taggableFiles = await favoritesRepository.list({
      userId: requesterUserId,
      limit: 50,
      offset,
    })
  } else if (ownedOnly || (effectiveQuery.length >= 2 && effectiveQuery.length <= 100)) {
    const tags = await tagsRepository.search({
      query: effectiveQuery,
      authorUserId: requesterUserId,
      ownedOnly,
      limit: 50,
      offset,
    })

    isPersonal = tags.some(tag => tag.authorUserId === requesterUserId)
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
        cache_time: isLocal ? 1 : taggableFiles.length > 0 ? 5 * 60 : undefined, // 5 minutes in seconds, do not cache if no results
        is_personal: isPersonal,
        next_offset: String(offset + taggableFiles.length),
        button: {
          text: isFavoritesQuery
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

app.get('/icon.svg', (_req, res) => {
  res.sendStatus(404)
})
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

app.use((req, _res, next) => {
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
})

app.get('/files/:fileId/download', async (req, res) => {
  const fileId = req.params.fileId
  if (typeof fileId !== 'string') {
    throw new Error('File ID not provided')
  }

  const fileUrl = (await bot.telegram.getFileLink(fileId)).toString()
  https.get(fileUrl, proxyRes => proxyRes.pipe(res))
})

app.get('/tags', async (req, res) => {
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

app.get('/favorites', async (req, res) => {
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
