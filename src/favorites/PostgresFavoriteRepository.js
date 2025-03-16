import { generateQuery } from '../utils/generate-query.js'

export class PostgresFavoriteRepository {
  /**
   * @param {{
   *   postgresClient: import('pg').Client
   * }} options
   */
  constructor({ postgresClient }) {
    this._postgresClient = postgresClient
  }

  /**
   * @param {{
   *   userId: string
   *   file: import('../types.d.ts').File
   * }} input
   */
  async mark({ userId, file }) {
    await this._postgresClient.query(
      ...generateQuery(
        `INSERT INTO favorites (user_id, file_id, file_unique_id, set_name, mime_type)
         VALUES (:userId, :fileId, :fileUniqueId, :setName, :mimeType)
         ON CONFLICT DO NOTHING;`,
        {
          userId,
          fileId: file.file_id,
          fileUniqueId: file.file_unique_id,
          setName: file.set_name,
          mimeType: file.mime_type,
        }
      )
    );
  }

  /**
   * @param {{
   *   userId: string
   *   fileUniqueId: string
   * }} input
   */
  async unmark({ userId, fileUniqueId }) {
    await this._postgresClient.query(
      ...generateQuery(
        `DELETE FROM favorites
         WHERE user_id = :userId AND file_unique_id = :fileUniqueId;`,
        { userId, fileUniqueId }
      )
    )
  }

  /**
   * @param {{
   *   userId: string
   *   limit: number
   *   fromFileUniqueId?: string
   * }} input
   * @returns {Promise<import('../types.d.ts').File[]>}
   */
  async query({ userId, limit, fromFileUniqueId }) {
    const { rows } = await this._postgresClient.query(
      ...generateQuery(
        `SELECT file_id, file_unique_id, set_name, mime_type
         FROM favorites
         WHERE user_id = :userId
         ${fromFileUniqueId ? 'AND file_unique_id > :fromFileUniqueId' : ''}
         ORDER BY id DESC
         LIMIT :limit;`,
        { userId, limit, fromFileUniqueId }
      )
    );

    return rows.map((row) => ({
      file_id: row.file_id,
      file_unique_id: row.file_unique_id,
      set_name: row.set_name,
      mime_type: row.mime_type,
    }))
  }

  /**
   * @param {{
   *   userId: string
   *   fileUniqueId: string
   * }} input
   */
  async isMarked({ userId, fileUniqueId }) {
    const { rows } = await this._postgresClient.query(
      ...generateQuery(
        `SELECT 1
         FROM favorites
         WHERE user_id = :userId AND file_unique_id = :fileUniqueId;`,
        { userId, fileUniqueId }
      )
    );

    return rows.length > 0
  }
}
