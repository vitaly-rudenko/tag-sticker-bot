import { Markup } from 'telegraf'
import { deleteMessages } from '../../utils/deleteMessages.js'
import { getBitmapIndex } from '../../utils/bitmap.js'
import { sortFiles } from '../../utils/files.js'
import { fileFromMessage } from '../../utils/fileFromMessage.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   telegram: import('telegraf').Telegram,
 *   favoriteRepository: import('../../types.d.ts').FavoriteRepository
 *   userSessionRepository: import('../../types.d.ts').UserSessionRepository
 * }} input
 */
export function useQueueFlow({
  telegram,
  favoriteRepository,
  userSessionRepository,
}) {
  /** @param {Context} context */
  async function handleFile(context) {
    if (!context.message) return

    const { userId } = context.state
    const file = fileFromMessage(context.message)

    await userSessionRepository.set(userId, {
      isPrivate: false,
      fileMessageId: context.message.message_id,
      file,
    })

    const isFavorite = await favoriteRepository.isMarked({ userId, fileUniqueId: file.file_unique_id })

    await context.reply([
      '👇 What do you want to do?',
    ].join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_to_message_id: context.message.message_id,
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback(
          'sticker' in context.message ? '📎 Tag this sticker' : '📎 Tag this GIF',
          'file:tag-single'
        ),
        ...file.set_name ? [Markup.button.callback('🖇 Tag all stickers in the set', 'file:choose-untagged')]: [],
        ...isFavorite
          ? [Markup.button.callback('💔 Remove from favorites', 'file:unfavorite')]
          : [Markup.button.callback('❤️ Add to favorites', 'file:favorite')],
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  /** @param {Context} context */
  async function handleChooseUntagged(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue cleared').catch(() => {})
    await context.deleteMessage().catch(() => {})

    await context.reply([
      '👇 Which stickers from the set do you want to tag?',
    ].join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('Not tagged by anyone yet', 'file:tag-untagged'),
        Markup.button.callback('Not tagged by me', 'file:tag-untagged-by-me'),
        Markup.button.callback('Re-tag all of them', 'file:tag-all'),
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  /** @param {Context} context */
  async function clearQueue(context) {
    if (!context.chat) return
    if (context.updateType === 'callback_query') context.answerCbQuery('Queue has been cleared').catch(() => {})
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { tagInstructionMessageId } = await userSessionRepository.get(userId)

    await Promise.all([
      userSessionRepository.clear(userId),
      deleteMessages(telegram, context.chat.id, [tagInstructionMessageId])
    ])

    await context.reply('🕒 Done! It may take up to 10 minutes to see the changes.')
  }

  /** @param {Context} context */
  async function stepQueue(context) {
    if (!('match' in context) || !Array.isArray(context.match)) return

    const steps = Number(context.match[1])
    if (!Number.isInteger(steps) || steps === 0) return

    if (!context.chat) return
    if (context.updateType === 'callback_query') context.answerCbQuery('Going back').catch(() => {})
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { tagInstructionMessageId, queue, isPrivate } = await userSessionRepository.get(userId)

    await deleteMessages(telegram, context.chat.id, [tagInstructionMessageId])

    if (!queue) return
    await proceedTagging(context, {
      userId,
      isPrivate,
      queue: {
        ...queue,
        position: queue.position + steps - 1,
      }
    })
  }

  /** @param {Context} context */
  async function toggleScope(context) {
    if (!context.chat) return
    context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { tagInstructionMessageId, queue, isPrivate, file } = await userSessionRepository.get(userId)
    const newIsPrivate = !isPrivate

    context.answerCbQuery(
      newIsPrivate
        ? '🔒 Your tags for this file are now private'
        : '🔓 Your tags for this file are now public'
    ).catch(() => {})

    await deleteMessages(telegram, context.chat.id, [tagInstructionMessageId])

    await proceedTagging(context, {
      userId,
      isPrivate: newIsPrivate,
      ...queue && {
        queue: {
          ...queue,
          position: queue.position - 1,
        }
      },
      file,
    })
  }

  /** @type {import('../../types.d.ts').proceedTagging} */
  async function proceedTagging(context, { userId, isPrivate, queue, file }) {
    if (!file && (!queue || queue.position > queue.stickerSetBitmap.size)) {
      await Promise.all([
        userSessionRepository.clear(userId),
        queue && context.reply('🕒 Done! It may take up to 10 minutes to see the changes.'),
      ])
      return
    }

    if (!file && queue) {
      const index = getBitmapIndex(queue.stickerSetBitmap.bitmap, queue.position)
      const stickerSet = await telegram.getStickerSet(queue.stickerSetName)
      const stickers = sortFiles(stickerSet.stickers)

      file = stickers[index]
    }

    if (!file) {
      await context.reply('❌ Invalid file.')
      return
    }

    const queueButtons = [
      ...queue && queue.position > 1 ? [
        Markup.button.callback(
          `⬅️ Undo`,
          'queue:step:-1'
        )
      ] : [],
      ...queue && queue.position < queue.stickerSetBitmap.size ? [
        Markup.button.callback(
          `➡️ Skip`,
          'queue:step:1'
        )
      ] : [],
    ]

    const extra = {
      reply_markup: Markup.inlineKeyboard(
        [
          ...queueButtons,
          Markup.button.callback(queue ? `❌ Stop (${queue.position}/${queue.stickerSetBitmap.size})` : '❌ Cancel', 'queue:clear'),
          Markup.button.callback(isPrivate ? '🔒 Visibility: private' : '🔓 Visibility: public', 'scope:toggle'),
        ].filter(Boolean),
        { wrap: (_, i) => i >= queueButtons.length },
      ).reply_markup,
    }

    let fileMessageId
    if (file.mime_type) {
      const { message_id } = await context.replyWithAnimation(file.file_id, extra)
      fileMessageId = message_id
    } else {
      const { message_id } = await context.replyWithSticker(file.file_id, extra)
      fileMessageId = message_id
    }

    const { message_id } = await context.reply(
      '✏️ Send tags separated by comma \\(for example: *__cute dancing cat, funny cat__*\\)\\.',
      { reply_to_message_id: fileMessageId, parse_mode: 'MarkdownV2' }
    )

    await userSessionRepository.set(userId, {
      phase: 'tagging',
      file: {
        file_id: file.file_id,
        file_unique_id: file.file_unique_id,
        mime_type: file.mime_type,
        set_name: file.set_name,
      },
      fileMessageId,
      tagInstructionMessageId: message_id,
      isPrivate,
      ...queue && {
        queue: {
          stickerSetBitmap: queue.stickerSetBitmap,
          stickerSetName: queue.stickerSetName,
          position: queue.position + 1,
        }
      }
    })
  }

  return {
    handleFile,
    handleChooseUntagged,
    clearQueue,
    stepQueue,
    toggleScope,
    proceedTagging,
  }
}
