export class PostgresTagRepository {
  /**
   * @param {{
   *   postgresClient: import('pg').Client
   * }} options
   */
  constructor({ postgresClient }) {
    this._postgresClient = postgresClient
    this._maxTagsPerFile = 25
  }


  /**
   * @param {{
  *   file: import('../types.d.ts').File
  *   authorUserId: string
  *   isPrivate: boolean
  *   values: string[]
  * }} input
  */
  async store({ file, authorUserId, isPrivate, values }) {
    if (values.length === 0)
      throw new Error('Values list is empty')
    if (values.length > this._maxTagsPerFile)
      throw new Error(`Cannot store more than ${this._maxTagsPerFile} tags per request`)

    await this._postgresClient.query(
      `DELETE FROM tags
       WHERE author_user_id = $1 AND file_unique_id = $2;`,
      [authorUserId, file.file_unique_id]
    )

    const insertionValues = values.map((value) => [authorUserId, isPrivate, value, file.file_unique_id, file.file_id, file.set_name, file.mime_type])

    await this._postgresClient.query(
      `INSERT INTO tags (author_user_id, is_private, value, file_unique_id, file_id, set_name, mime_type)
       VALUES (${insertionValues.flatMap((sub, i) => sub.map((_, j) => `$${i * sub.length + j + 1}`)).join('), (')});`,
       insertionValues.flat(),
    )
  }

  /**
   * @param {{
   *   stickerSetName: string
   *   authorUserId: string
   *   ownedOnly: boolean
   * }} input
   * @returns {Promise<Set<string>>} Array of tagged fileUniqueId
   */
  async queryStatus({ stickerSetName, authorUserId, ownedOnly }) {
    const { rows } = await this._postgresClient.query(
      `SELECT DISTINCT author_user_id, is_private, file_unique_id
       FROM tags
       WHERE set_name = $1
       ${ownedOnly ? 'AND author_user_id = $2' : ''};`,
      [stickerSetName, authorUserId]
    )

    return new Set(
      rows
        .filter(row => !row.is_private || row.author_user_id === authorUserId)
        .map(row => row.file_unique_id)
    )
  }

  /**
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId: string
   *   ownedOnly: boolean
   * }} input
   * @returns {Promise<{
   *   searchResults: import('../types.d.ts').File[]
   *   includesOwnedFiles: boolean
   * }>}
   */
  async search({ query, limit, authorUserId, ownedOnly }) {
    if (typeof query !== 'string' || !query) {
      throw new Error('Query must be a non-empty string')
    }

    // always search in owned tags first
    const { fileUniqueIds, files: ownedFiles } = await this._search({ query, limit, authorUserId })
    const remainingLimit = limit - ownedFiles.length

    // search in public tags if necessary
    if (!ownedOnly && remainingLimit > 0) {
      const { files: publicFiles } = await this._search({
        query,
        limit: remainingLimit,
        excludeFileUniqueIds: fileUniqueIds
      })

      return {
        searchResults: ownedFiles.concat(publicFiles),
        includesOwnedFiles: ownedFiles.length > 0
      }
    } else {
      return {
        searchResults: ownedFiles,
        includesOwnedFiles: ownedFiles.length > 0
      }
    }
  }

  /**
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId?: string
   *   excludeFileUniqueIds?: Set<string>
   * }} input
   */
  async _search({ query, limit, authorUserId, excludeFileUniqueIds }) {
    const { rows } = await this._postgresClient.query(
      `SELECT DISTINCT file_id, file_unique_id, set_name, mime_type
       FROM tags
       WHERE value ILIKE '%' || $1 || '%'
       ${authorUserId ? 'AND author_user_id = $3' : ''}
       ${excludeFileUniqueIds.size > 0 ? `AND file_unique_id != ALL(${Array.from(new Array(excludeFileUniqueIds.size), (_, i) => `${4 + i}`).join(', ')})` : ''}
       LIMIT $2;`,
      [query, limit, authorUserId, ...excludeFileUniqueIds]
    )

    const files = rows.map(row => ({
      file_id: row.file_id,
      file_unique_id: row.file_unique_id,
      set_name: row.set_name,
      mime_type: row.mime_type,
    }))

    const fileUniqueIds = new Set(files.map(file => file.file_unique_id))

    return { fileUniqueIds, files }
  }
}