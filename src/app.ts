import { z } from 'zod'
import pg from 'pg'
import { markdownEscapes } from 'markdown-escapes'
import { Context, Markup, Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'

// TODO: logging

const postgresClient = new pg.Client(process.env.DATABASE_URL)
await postgresClient.connect()

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!)

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

const taggableFileSchema = z.discriminatedUnion('fileType', [
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('sticker'),
    setName: z.string().optional(),
  }),
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('animation'),
    mimeType: z.string(),
  })
])

type TaggableFile = z.infer<typeof taggableFileSchema>

type FavoritesRepository = {
  add: (input: { userId: number; taggableFile: TaggableFile }) => Promise<void>
  delete: (input: { userId: number; fileUniqueId: string }) => Promise<void>
  exists: (input: { userId: number; fileUniqueId: string }) => Promise<boolean>
  list: (input: { userId: number; limit: number }) => Promise<TaggableFile[]>
}

const visibilitySchema = z.enum(['private', 'public'])
type Visibility = z.infer<typeof visibilitySchema>

type UserSession = {
  tagging?: {
    taggableFileMessageId: number
    taggableFile: TaggableFile
    visibility: Visibility
    promptMessageId?: number
    instructionsMessageId?: number
  }
}

type UserSessionsRepository = {
  get: (input: { userId: number }) => Promise<UserSession | undefined>
  set: (input: { userId: number; userSession: UserSession }) => Promise<void>
  clear: (input: { userId: number }) => Promise<void>
}

const tagSchema = z.strictObject({
  authorUserId: z.number(),
  value: z.string(),
  visibility: visibilitySchema,
  taggableFile: taggableFileSchema,
})
type Tag = z.infer<typeof tagSchema>

type TagRepository = {
  replace: (input: { authorUserId: number; taggableFile: TaggableFile; visibility: Visibility; values: string[] }) => Promise<void>
  search: (input: { query: string; requesterUserId: number; ownedOnly: boolean; limit: number }) => Promise<Tag[]>
}

function requireNonNullable<T>(input: T): NonNullable<T> {
  if (input === null || input === undefined) {
    throw new Error(`Expected non-nullable value`)
  }

  return input
}

const MARKDOWN_ESCAPE_REGEX = new RegExp(`(?<!\\\\)([\\${markdownEscapes.join('\\')}])`, 'g')
function escapeMd(input: string) {
  return input.replace(MARKDOWN_ESCAPE_REGEX, '\\$1')
}

const favoritesRepository: FavoritesRepository = {
  async add({ userId, taggableFile }) {
    await postgresClient.query(
      `INSERT INTO favorites (user_id, file_id, file_unique_id, file_type, set_name, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, file_unique_id) DO NOTHING;`,
      [
        userId,
        taggableFile.fileId,
        taggableFile.fileUniqueId,
        taggableFile.fileType,
        taggableFile.fileType === 'sticker' ? taggableFile.setName : null,
        taggableFile.fileType === 'animation' ? taggableFile.mimeType : null,
      ]
    )
  },

  async delete({ userId, fileUniqueId }) {
    await postgresClient.query(
      `DELETE FROM favorites
       WHERE user_id = $1
         AND file_unique_id = $2;`,
      [userId, fileUniqueId]
    )
  },

  async exists({ userId, fileUniqueId }) {
    const { rows } = await postgresClient.query(
      `SELECT 1
       FROM favorites
       WHERE user_id = $1
         AND file_unique_id = $2;`,
      [userId, fileUniqueId]
    )

    return rows.length > 0
  },

  async list({ userId, limit }) {
    const { rows } = await postgresClient.query(
      `SELECT file_unique_id, file_id, file_type, set_name, mime_type
       FROM favorites
       WHERE user_id = $1
       LIMIT $2;`,
      [userId, limit]
    )

    return rows.map(row => taggableFileSchema.parse({
      fileUniqueId: row.file_unique_id,
      fileId: row.file_id,
      fileType: row.file_type,
      ...row.file_type === 'sticker' && {
        setName: row.set_name,
      },
      ...row.file_type === 'animation' && {
        mimeType: row.mime_type,
      },
    }))
  }
}

const userSessionsRepository: UserSessionsRepository = {
  async set({ userId, userSession }) {
    await postgresClient.query(
      `INSERT INTO user_sessions (user_id, data)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET data = $2;`,
      [userId, userSession],
    )
  },
  async get({ userId }) {
    const { rows } = await postgresClient.query(
      `SELECT data
       FROM user_sessions
       WHERE user_id = $1;`,
      [userId]
    );

    return rows.length > 0 ? rows[0].data : undefined
  },
  async clear({ userId }) {
    await postgresClient.query(
      `DELETE FROM user_sessions
       WHERE user_id = $1`,
      [userId]
    )
  }
}

const tagsRepository: TagRepository = {
  async replace({ authorUserId, taggableFile, values, visibility }) {
    try {
      await postgresClient.query('BEGIN;')

      await postgresClient.query(
        `DELETE FROM tags
         WHERE author_user_id = $1
           AND file_unique_id = $2;`,
        [authorUserId, taggableFile.fileUniqueId],
      )

      // TODO: bulk insert
      for (const value of values) {
        await postgresClient.query(
          `INSERT INTO tags (author_user_id, visibility, value, file_id, file_unique_id, file_type, set_name, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [
            authorUserId,
            visibility,
            value,
            taggableFile.fileId,
            taggableFile.fileUniqueId,
            taggableFile.fileType,
            taggableFile.fileType === 'sticker' ? taggableFile.setName : null,
            taggableFile.fileType === 'animation' ? taggableFile.mimeType : null,
          ],
        )
      }

      await postgresClient.query('COMMIT;')
    } catch (error) {
      await postgresClient.query('ROLLBACK;')
      throw error
    }
  },

  async search({ query, requesterUserId, ownedOnly, limit }) {
    const escapedQuery = query.replaceAll('_', '\\_').replaceAll('%', '\\%')

    const { rows } = await postgresClient.query(
      `SELECT DISTINCT ON (file_unique_id) author_user_id, visibility, value, file_unique_id, file_id, file_type, set_name, mime_type
       FROM tags
       WHERE value ILIKE '%' || $1 || '%'
         AND author_user_id = $2
       LIMIT $3;`,
      [escapedQuery, requesterUserId, limit]
    )

    if (rows.length < limit && !ownedOnly) {
      const fileUniqueIdsToExclude = rows.map(row => row.file_unique_id)

      const { rows: remainingRows } = await postgresClient.query(
        `SELECT DISTINCT ON (file_unique_id) author_user_id, visibility, value, file_unique_id, file_id, file_type, set_name, mime_type
         FROM tags
         WHERE value ILIKE '%' || $1 || '%'
           AND (author_user_id = $2 OR visibility IN ($4))
           ${fileUniqueIdsToExclude.length > 0 && `AND file_unique_id NOT IN (${fileUniqueIdsToExclude.map((_, i) => `$${5 + i}`)})`}
         LIMIT $3;`,
        [
          escapedQuery,
          requesterUserId,
          limit - rows.length,
          'public' satisfies Visibility,
          ...fileUniqueIdsToExclude,
        ]
      )

      rows.push(...remainingRows)
    }

    return rows.map(row => tagSchema.parse({
      authorUserId: Number(row.author_user_id), // Postgres driver returns BIGINTs as strings
      value: row.value,
      visibility: row.visibility,
      taggableFile: {
        fileUniqueId: row.file_unique_id,
        fileId: row.file_id,
        fileType: row.file_type,
        ...row.file_type === 'sticker' && {
          setName: row.set_name,
        },
        ...row.file_type === 'animation' && {
          mimeType: row.mime_type,
        },
      }
    }))
  }
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

  const promptMessage = await context.sendMessage('👇 What do you want to do?', {
    parse_mode: 'MarkdownV2',
    reply_parameters: { message_id: context.message.message_id },
    reply_markup: Markup.inlineKeyboard([
      Markup.button.callback(
        `📎 Tag this ${taggableFile.fileType === 'sticker' ? 'sticker' : 'GIF'}`,
        'tagging:tag-single'
      ),
      isFavorite
        ? Markup.button.callback('💔 Delete from favorites', 'tagging:delete-from-favorites')
        : Markup.button.callback('❤️ Add to favorites', 'tagging:add-to-favorites'),
        Markup.button.callback('❌ Cancel', 'tagging:cancel'),
    ], { columns: 1 }).reply_markup,
  })

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
      `❤️ Added ${taggableFile.fileType === 'sticker' ? 'sticker' : 'GIF'} to favorites\\.`,
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
      `💔 Deleted ${taggableFile.fileType === 'sticker' ? 'sticker' : 'GIF'} from favorites\\.`,
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

  const requesterUserId = context.callbackQuery.from.id

  const userSession = await userSessionsRepository.get({ userId: requesterUserId })
  if (!userSession?.tagging) return

  const { promptMessageId, taggableFileMessageId, visibility } = userSession.tagging

  if (promptMessageId) {
    await context.deleteMessage(promptMessageId).catch(() => {})
  }

  // TODO: DRY
  const instructionsMessage = await context.sendMessage(
    [
      '✏️ Send tags separated by comma \\(for example: *__cute dancing cat, funny cat__*\\)\\.',
      '',
      visibility === 'private'
        ? '🔒 Nobody can see or find your *private* tags, except for you\\.'
        : '🔓 Anyone can see and find your *public* tags\\.',
      `🙈 Authors of tags are never revealed\\.`
    ].join('\n'),
    {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: taggableFileMessageId },
      reply_markup: Markup.inlineKeyboard(
        [
          Markup.button.callback(`${visibility === 'public' ? '✅ Public' : '🔓 Make public'}`, 'tagging:set-visibility:public'),
          Markup.button.callback(`${visibility === 'private' ? '✅ Private' : '🔒 Make private'}`, 'tagging:set-visibility:private'),
          Markup.button.callback('❌ Cancel', 'tagging:cancel'),
        ],
        { columns: 2 },
      ).reply_markup,
    }
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
    await context.sendMessage(`❌ No more than 10 tags are allowed per ${taggableFile.fileType === 'sticker' ? 'sticker' : 'GIF'}.`)
    return
  }

  if (instructionsMessageId) {
    await context.deleteMessage(instructionsMessageId).catch(() => {})
  }

  await tagsRepository.replace({ authorUserId: requesterUserId, taggableFile, visibility, values })
  await userSessionsRepository.clear({ userId: requesterUserId })

  await context.sendMessage(
    [
      `✅ ${taggableFile.fileType === 'sticker' ? 'Sticker' : 'GIF'} is now searchable by ${values.length > 1 ? 'these tags' : 'this tag'}: ${values.map(tag => `*__${escapeMd(tag)}__*`).join(', ')}\\.`,
      visibility === 'public'
        ? '🔓 Visibility: *public*\\.'
        : '🔒 Visibility: *private*\\.',
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

  const { instructionsMessageId } = userSession.tagging

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
    // TODO: DRY
    await context.editMessageText(
      [
        '✏️ Send tags separated by comma \\(for example: *__cute dancing cat, funny cat__*\\)\\.',
        '',
        visibility === 'private'
          ? '🔒 Nobody can see or find your *private* tags, except for you\\.'
          : '🔓 Anyone can see and find your *public* tags\\.',
        `🙈 Authors of tags are never revealed\\.`
      ].join('\n'),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard(
          [
            Markup.button.callback(`${visibility === 'public' ? '✅ Public' : '🔓 Make public'}`, 'tagging:set-visibility:public'),
            Markup.button.callback(`${visibility === 'private' ? '✅ Private' : '🔒 Make private'}`, 'tagging:set-visibility:private'),
            Markup.button.callback('❌ Cancel', 'tagging:cancel'),
          ],
          { columns: 2 },
        ).reply_markup,
      }
    )
  }
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
            : "Click here to add or remove your favorite stickers or GIFs"
          : "Can't find a sticker or GIF? Click here to contribute",
        start_parameter: 'stub', // for some reason this field is required
      }
    }
  )
}

bot.on('inline_query', $handleSearchInlineQuery)

// Only allow to use in private chat with bot
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
bot.action('tagging:cancel', $handleTaggingCancelAction)

bot.catch((error, context) => {
  console.error('Failed to handle bot update', error, context)
})

bot.launch()
  .catch((error) => {
    console.error('Bot launch failed', error)
    process.exit(1)
  })

console.log('Bot started')

export {}
