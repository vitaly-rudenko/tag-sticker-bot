export class PostgresFavoriteRepository {
  /**
   * @param {{
   *   postgresClient: import('pg').Client
   * }} options
   */
  constructor({ postgresClient })  {
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
      `INSERT INTO favorites (user_id, file_id, file_unique_id, set_name, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING;`,
      [userId, file.file_id, file.file_unique_id, file.set_name, file.mime_type]
    )
  }

  /**
   * @param {{
   *   userId: string
   *   fileUniqueId: string
   * }} input
   */
  async unmark({ userId, fileUniqueId }) {
    await this._postgresClient.query(
      `DELETE FROM favorites
       WHERE user_id = $1 AND file_unique_id = $2;`,
      [userId, fileUniqueId]
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
      `SELECT file_id, file_unique_id, set_name, mime_type
       FROM favorites
       WHERE user_id = $1
       ${fromFileUniqueId ? 'AND file_unique_id > $3' : ''}
       ORDER BY id DESC
       LIMIT $2;`,
      [userId, limit, fromFileUniqueId]
    )

    return rows.map(row => ({
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
      `SELECT 1
       FROM favorites
       WHERE user_id = $1 AND file_unique_id = $2;`,
      [userId, fileUniqueId]
    )

    return rows.length > 0
  }
}