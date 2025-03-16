import { generateQuery } from '../utils/generate-query.js'

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

    const expiresAt = new Date(Date.now() + 60 * 60_000) // 1 hour

    await this._postgresClient.query(
      ...generateQuery(
        `INSERT INTO user_sessions (user_id, is_private, phase, file, file_message_id, tag_instruction_message_id, queue, expires_at)
         VALUES (:userId, :isPrivate, :phase, :file, :fileMessageId, :tagInstructionMessageId, :queue, :expiresAt)
         ON CONFLICT (user_id) DO UPDATE
         SET is_private = :isPrivate, phase = :phase, file = :file, file_message_id = :fileMessageId, tag_instruction_message_id = :tagInstructionMessageId, queue = :queue, expires_at = :expiresAt;`,
        {
          userId,
          isPrivate: context.isPrivate,
          phase: context.phase,
          file: context.file,
          fileMessageId: context.fileMessageId,
          tagInstructionMessageId: context.tagInstructionMessageId,
          queue: context.queue,
          expiresAt
        }
      )
    )
  }

  /**
   * @param {string} userId
   * @returns {Promise<import('../types.d.ts').UserSessionContext>}
   */
  async get(userId) {
    const { rows } = await this._postgresClient.query(
      ...generateQuery(
        `SELECT user_id, is_private, phase, file, file_message_id, tag_instruction_message_id, queue
         FROM user_sessions
         WHERE user_id = :userId;`,
        { userId }
      )
    )
    if (rows.length === 0) return { isPrivate: false }

    const file = rows[0].file
    const queue = rows[0].queue

    const isPrivate = rows[0].is_private
    const phase = rows[0].phase
    const fileMessageId = rows[0].file_message_id
    const tagInstructionMessageId = rows[0].tag_instruction_message_id

    return {
      isPrivate: isPrivate ?? false,
      ...phase && { phase },
      ...file && { file },
      ...fileMessageId && { fileMessageId: Number(fileMessageId) },
      ...tagInstructionMessageId && { tagInstructionMessageId: Number(tagInstructionMessageId) },
      ...queue && { queue },
    }
  }

  /** @param {string} userId */
  async clear(userId) {
    await this._postgresClient.query(
      ...generateQuery(
        `DELETE FROM user_sessions
         WHERE user_id = :userId;`,
        { userId }
      )
    )
  }
}