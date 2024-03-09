import sharp from 'sharp'
import { Readable } from 'stream'
import { Markup } from 'telegraf'
import { fileFromMessage } from '../../utils/fileFromMessage.js'

/** @typedef {import('telegraf').Context} Context */

const STICKER_SIZE = 512;
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 1_000_000 // 1 mb
const STICKER_PIPELINE_TIMEOUT_SECONDS = 10

/**
 * @param {{
*   userSessionRepository: import('../../types.d.ts').UserSessionRepository
*   bot: import('telegraf').Telegraf
* }} input
*/
export function useBuilderFlow({ userSessionRepository, bot }) {
  /** @param {Context} context */
  async function handlePhoto(context) {
    if (!context.message) return

    const extra = /** @type {const} */ ({
      reply_to_message_id: context.message.message_id,
      parse_mode: 'MarkdownV2',
    })

    let file
    if ('photo' in context.message) {
      const photo = context.message.photo
        .find(photo => photo.width >= STICKER_SIZE || photo.height >= STICKER_SIZE)
        ?? context.message.photo.at(-1)

      if (!photo || !photo.file_size) {
        await context.reply('❌ Invalid photo', extra)
        return
      }

      if (photo.file_size > MAX_FILE_SIZE_BYTES) {
        await context.reply('❌ The photo is too large, max size is 1 mb', extra)
        return
      }

      file = {
        file_id: photo.file_id,
        file_unique_id: photo.file_unique_id,
      }
    } else if ('document' in context.message) {
      if (!SUPPORTED_MIME_TYPES.includes(context.message.document.mime_type ?? '') || !context.message.document.file_size) {
        await context.reply('❌ Invalid file.', extra)
        return
      }

      if (context.message.document.file_size > MAX_FILE_SIZE_BYTES) {
        await context.reply('❌ The file is too large, max size is 1 MB.', extra)
        return
      }

      file = {
        file_id: context.message.document.file_id,
        file_unique_id: context.message.document.file_unique_id,
      }
    }
    if (!file) return

    const { userId } = context.state

    await userSessionRepository.set(userId, {
      isPrivate: false,
      fileMessageId: context.message.message_id,
      file,
    })

    await context.reply([
      '👇 What do you want to do?',
    ].join('\n'), {
      ...extra,
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('🖼 Create a sticker from this photo', 'builder:create'),
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  /** @param {Context} context */
  async function createSticker(context) {
    if (context.updateType === 'callback_query') context.answerCbQuery('Creating a sticker...').catch(() => {})
    await context.deleteMessage().catch(() => {})

    const { userId } = context.state
    const { file } = await userSessionRepository.get(userId)
    if (!file) return

    const fileLink = await bot.telegram.getFileLink(file.file_id)
    const fileResponse = await fetch(fileLink.toString())
    if (!fileResponse.body) return

    const stickerPipeline = sharp()
      .resize({ fit: 'inside', width: STICKER_SIZE, height: STICKER_SIZE })
      .webp({ quality: 100, lossless: true })
      .timeout({ seconds: STICKER_PIPELINE_TIMEOUT_SECONDS })

    Readable.fromWeb(fileResponse.body).pipe(stickerPipeline)

    const message = await context.replyWithSticker({ source: stickerPipeline })

    await userSessionRepository.set(userId, {
      isPrivate: false,
      fileMessageId: message.message_id,
      file: fileFromMessage(message),
    })

    await context.reply([
      '👇 What do you want to do?',
    ].join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_to_message_id: message.message_id,
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback('📎 Tag this sticker', 'file:tag-single'),
        Markup.button.callback('❤️ Add to favorites', 'file:favorite'),
        Markup.button.callback('❌ Cancel', 'action:cancel'),
      ], { columns: 1 }).reply_markup,
    })
  }

  return {
    handlePhoto,
    createSticker,
  }
}
