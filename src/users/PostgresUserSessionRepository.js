import { decodeMimeType } from '../utils/mimeType.js'

export class PostgresUserSessionRepository {
  /**
   * @param {{
   *   postgresClient: import('pg').Client
   * }} options
   */
  constructor({ postgresClient })  {
    this._postgresClient = postgresClient
  }


  /**
   * @param {string} userId
   * @param {import('../types.d.ts').UserSessionContext} context
   */
  async set(userId, context) {
    if (
      context.file?.set_name && context.queue?.stickerSetName &&
      context.file.set_name !== context.queue?.stickerSetName
    ) {
      throw new Error('Sticker set and queue set do not match')
    }

    await this._postgresClient.query(
      `INSERT INTO user_sessions (user_id, is_private, phase, file, file_message_id, tag_instruction_message_id, queue)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE
       SET is_private = $2, phase = $3, file = $4, file_message_id = $5, tag_instruction_message_id = $6, queue = $7;`,
       [userId, context.isPrivate, context.phase, context.file, context.fileMessageId, context.tagInstructionMessageId, context.queue]
    )
  }

  /**
   * @param {string} userId
   * @returns {Promise<import('../types.d.ts').UserSessionContext>}
   */
  async get(userId) {
    const { rows } = await this._postgresClient.query(
      `SELECT user_id, is_private, phase, file, file_message_id, tag_instruction_message_id, queue
       FROM user_sessions
       WHERE user_id = $1;`,
       [userId]
    )
    if (rows.length === 0) return { isPrivate: false }

    const file = rows[0].file
    const queue = rows[0].queue

    const isPrivate = rows[0].is_private
    const phase = rows[0].phase
    const stickerSetName = rows[0].file?.set_name
    const animationMimeType = decodeMimeType(file?.mime_type)
    const fileUniqueId = file?.file_unique_id
    const fileId = file?.file_id
    const fileMessageId = rows[0].file_message_id
    const tagInstructionMessageId = rows[0].tag_instruction_message_id
    const queueStickerSetBitmap = queue?.stickerSetBitmap
    const queueStickerSetBitmapLength = queue?.stickerSetBitmapLength
    const queueStickerSetBitmapSize = queue?.stickerSetBitmapSize
    const queuePosition = queue?.position

    return {
      isPrivate: isPrivate ?? false,
      ...phase && { phase },
      ...fileUniqueId && fileId && {
        file: {
          file_id: fileId,
          file_unique_id: fileUniqueId,
          set_name: stickerSetName,
          mime_type: animationMimeType,
        }
      },
      ...fileMessageId && { fileMessageId: Number(fileMessageId) },
      ...tagInstructionMessageId && { tagInstructionMessageId: Number(tagInstructionMessageId) },
      ...stickerSetName && queueStickerSetBitmap && queueStickerSetBitmapLength && queuePosition && queueStickerSetBitmapSize && {
        queue: {
          position: Number(queuePosition),
          stickerSetName: stickerSetName,
          stickerSetBitmap: {
            bitmap: decodeBitmap(queueStickerSetBitmap, Number(queueStickerSetBitmapLength)),
            length: Number(queueStickerSetBitmapLength),
            size: Number(queueStickerSetBitmapSize),
          },
        }
      },
    }
  }

  /** @param {string} userId */
  async clear(userId) {
    await this._postgresClient.query(
      `DELETE FROM user_sessions
       WHERE user_id = $1;`,
       [userId]
    )
  }
}