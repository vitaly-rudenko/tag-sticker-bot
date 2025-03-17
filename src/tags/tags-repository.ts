import { type Client } from 'pg'
import { type Tag, tagSchema } from './tag.ts'
import { type TaggableFile } from '../common/taggable-file.ts'
import { visibilitySchema, type Visibility } from './visibility.ts'

export class TagsRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async replace(input: { authorUserId: number; taggableFile: TaggableFile; visibility: Visibility; values: string[] }): Promise<void> {
    const { authorUserId, taggableFile, visibility, values } = input

    try {
      await this.#client.query('BEGIN;')

      await this.#client.query(
        `DELETE FROM tags
         WHERE author_user_id = $1
           AND file_unique_id = $2;`,
        [authorUserId, taggableFile.fileUniqueId],
      )

      // TODO: bulk insert
      for (const value of values) {
        await this.#client.query(
          `INSERT INTO tags (author_user_id, visibility, value, file_id, file_unique_id, file_type, set_name, emoji, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
          [
            authorUserId,
            visibility,
            value,
            taggableFile.fileId,
            taggableFile.fileUniqueId,
            taggableFile.fileType,
            taggableFile.fileType === 'sticker' ? taggableFile.setName : null,
            taggableFile.fileType === 'sticker' ? taggableFile.emoji : null,
            taggableFile.fileType === 'animation' ? taggableFile.mimeType : null,
          ],
        )
      }

      await this.#client.query('COMMIT;')
    } catch (error) {
      await this.#client.query('ROLLBACK;')
      throw error
    }
  }

  async deleteAll(input: { authorUserId: number; fileUniqueId: string }): Promise<number | null> {
    const { authorUserId, fileUniqueId } = input

    const { rowCount } = await this.#client.query(
      `DELETE FROM tags
       WHERE author_user_id = $1
         AND file_unique_id = $2;`,
      [authorUserId, fileUniqueId],
    )

    return rowCount
  }

  async search(input: { query: string; requesterUserId: number; ownedOnly: boolean; limit: number }): Promise<Tag[]> {
    const { query, requesterUserId, ownedOnly, limit } = input

    const escapedQuery = query.replaceAll('_', '\\_').replaceAll('%', '\\%')

    const { rows } = await this.#client.query(
      `SELECT DISTINCT ON (file_unique_id) author_user_id, visibility, value, file_unique_id, file_id, file_type, set_name, emoji, mime_type
       FROM tags
       WHERE value ILIKE '%' || $1 || '%'
         AND author_user_id = $2
       LIMIT $3;`,
      [escapedQuery, requesterUserId, limit]
    )

    if (rows.length < limit && !ownedOnly) {
      const fileUniqueIdsToExclude = rows.map(row => row.file_unique_id)

      const { rows: remainingRows } = await this.#client.query(
        `SELECT DISTINCT ON (file_unique_id) author_user_id, visibility, value, file_unique_id, file_id, file_type, set_name, emoji, mime_type
         FROM tags
         WHERE value ILIKE '%' || $1 || '%'
           AND (author_user_id = $2 OR visibility = $4)
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
          emoji: row.emoji,
        },
        ...row.file_type === 'animation' && { mimeType: row.mime_type },
      }
    }))
  }

  // TODO: optimize
  async exists(input: { authorUserId: number; fileUniqueId: string }): Promise<boolean> {
    const { authorUserId, fileUniqueId } = input

    return (await this.stats({
      requesterUserId: authorUserId,
      fileUniqueId,
    })).requester.total > 0
  }

  async stats(input: { requesterUserId: number; fileUniqueId: string }): Promise<{
    requester: {
      total: number
      visibility: Visibility
      values: string[]
    }
    public: {
      total: number
      values: string[]
    }
  }> {
    const { requesterUserId, fileUniqueId } = input

    const { rows: requesterRows } = await this.#client.query<{
      value: string
      visibility: Visibility
    }>(
      `SELECT value, visibility
       FROM tags
       WHERE file_unique_id = $1
         AND author_user_id = $2;`,
      [fileUniqueId, requesterUserId]
    )

    const { rows: publicRows } = await this.#client.query<{
      public_total: number
      public_values: string[]
    }>(
      `WITH public_tag_values AS NOT MATERIALIZED (
         SELECT value
         FROM tags
         WHERE file_unique_id = $1
           AND author_user_id <> $2
           AND visibility = $3
       )
       SELECT (SELECT COUNT(*) FROM public_tag_values)::int AS public_total,
              (SELECT array_agg(value) FROM (SELECT value FROM public_tag_values LIMIT 3)) AS public_values;`,
      [fileUniqueId, requesterUserId, 'public' satisfies Visibility],
    )

    return {
      requester: {
        total: requesterRows.length,
        // All tags have the same visibility, so we can just take the first one
        visibility: visibilitySchema.parse(requesterRows.at(0)?.visibility ?? 'public'),
        values: requesterRows.map(row => row.value),
      },
      public: {
        total: publicRows.at(0)?.public_total ?? 0,
        values: publicRows.at(0)?.public_values ?? [],
      }
    }
  }
}