/**
 * @param {Exclude<import('telegraf').Context['message'], undefined> | Awaited<ReturnType<import('telegraf').Telegram['sendSticker']>>} message
 * @returns {import('../types.d.ts').File}
 */
export function fileFromMessage(message) {
  if ('sticker' in message) {
    return {
      file_id: message.sticker.file_id,
      file_unique_id: message.sticker.file_unique_id,
      set_name: message.sticker.set_name,
    }
  }

  if ('animation' in message) {
    return {
      file_id: message.animation.file_id,
      file_unique_id: message.animation.file_unique_id,
      mime_type: message.animation.mime_type,
    }
  }

  throw new Error('Unsupported message type')
}
