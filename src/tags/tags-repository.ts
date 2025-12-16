import { type Client } from 'pg'
import { type Tag, tagSchema } from './tag.ts'
import { taggableFileSchema, type TaggableFile } from '../common/taggable-file.ts'
import { visibilitySchema, type Visibility } from './visibility.ts'

export class TagsRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async upsert(input: { authorUserId: number; taggableFile: TaggableFile; visibility: Visibility; value: string }): Promise<void> {
    const { authorUserId, taggableFile, visibility, value } = input

    taggableFileSchema.parse(taggableFile) // validate

    await this.#client.query(
      `INSERT INTO tags (author_user_id, file_unique_id, visibility, value, file_id, file_type, set_name, emoji, mime_type, file_name, is_video, is_animated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (author_user_id, file_unique_id) DO UPDATE
       SET visibility = $3
         , value = $4
         , file_id = $5
         , file_type = $6
         , set_name = $7
         , emoji = $8
         , mime_type = $9
         , file_name = $10
         , is_video = $11
         , is_animated = $12;`,
      [
        authorUserId,
        taggableFile.fileUniqueId,
        visibility,
        value,
        taggableFile.fileId,
        taggableFile.fileType,
        'setName' in taggableFile ? taggableFile.setName : null,
        'emoji' in taggableFile ? taggableFile.emoji : null,
        'mimeType' in taggableFile ? taggableFile.mimeType : null,
        'fileName' in taggableFile ? taggableFile.fileName : null,
        'isVideo' in taggableFile ? taggableFile.isVideo : false,
        'isAnimated' in taggableFile ? taggableFile.isAnimated : false,
      ],
    )
  }

  async list(input: { authorUserId: number; limit: number }): Promise<Tag[]> {
    const { authorUserId, limit } = input

    const { rows } = await this.#client.query<{
      author_user_id: string
      visibility: string
      value: string
      file_unique_id: string
      file_id: string
      file_type: string
      set_name: string | null
      emoji: string | null
      mime_type: string | null
      file_name: string | null
      is_video: boolean
      is_animated: boolean
      created_at: string
    }>(
      `SELECT author_user_id, visibility, value, file_unique_id, file_id, file_type, set_name, emoji, mime_type, file_name, is_video, is_animated, created_at
       FROM tags
       WHERE author_user_id = $2
       ORDER BY created_at DESC
       LIMIT $1;`,
       [limit, authorUserId]
    )

    return rows.map(row => tagSchema.parse({
      authorUserId: Number(row.author_user_id), // Postgres driver returns BIGINTs as strings
      value: row.value,
      visibility: row.visibility,
      taggableFile: {
        fileUniqueId: row.file_unique_id,
        fileId: row.file_id,
        fileType: row.file_type,
        ...row.file_type === 'sticker' && {
          setName: row.set_name ?? undefined,
          emoji: row.emoji ?? undefined,
          isVideo: row.is_video,
          isAnimated: row.is_animated,
        },
        ...row.file_type === 'animation' && {
          mimeType: row.mime_type,
        },
        ...row.file_type === 'video' && {
          mimeType: row.mime_type,
          fileName: row.file_name,
        },
      },
      createdAt: new Date(row.created_at),
    }))
  }

  async delete(input: { authorUserId: number; fileUniqueId: string }): Promise<void> {
    const { authorUserId, fileUniqueId } = input

    await this.#client.query(
      `DELETE FROM tags
       WHERE author_user_id = $1
         AND file_unique_id = $2;`,
      [authorUserId, fileUniqueId],
    )
  }

  async deleteAllByFileId(input: { fileId: string }): Promise<void> {
    const { fileId } = input

    await this.#client.query(
      `DELETE FROM tags
       WHERE file_id = $1;`,
      [fileId]
    )
  }

  async search(input: { query: string; requesterUserId: number; ownedOnly: boolean; limit: number }): Promise<Tag[]> {
    const { query, requesterUserId, ownedOnly, limit } = input

    const escapedQuery = query.replaceAll('_', '\\_').replaceAll('%', '\\%')
    const exactQuery = `%${escapedQuery}%` // "%hello world%"
    const fuzzyQuery = `%${escapedQuery.replaceAll(' ', '%')}%` // "%hello%world%"

    const { rows } = await this.#client.query<{
      author_user_id: string
      visibility: string
      value: string
      file_unique_id: string
      file_id: string
      file_type: string
      set_name: string | null
      emoji: string | null
      mime_type: string | null
      file_name: string | null
      is_video: boolean
      is_animated: boolean
      created_at: string
    }>(
      `SELECT author_user_id, visibility, value, file_unique_id, file_id, file_type, set_name, emoji, mime_type, file_name, is_video, is_animated, created_at
            , (author_user_id = $2) AS is_owner
            , ($4 = '' OR value ILIKE $4) AS is_exact_match
       FROM (
         SELECT DISTINCT ON (file_unique_id) *
         FROM tags
         WHERE ($3 = '' OR value ILIKE $3)
         ${ownedOnly ? `AND author_user_id = $2` : `AND (author_user_id = $2 OR visibility = $5)`}
       ) AS filtered_tags
       ORDER BY (author_user_id = $2) DESC
              , ($4 = '' OR value ILIKE $4) DESC
              , created_at DESC
       LIMIT $1;`,
       ownedOnly
        ? [limit, requesterUserId, fuzzyQuery, exactQuery]
        : [limit, requesterUserId, fuzzyQuery, exactQuery, 'public' satisfies Visibility]
    )

    return rows.map(row => tagSchema.parse({
      authorUserId: Number(row.author_user_id), // Postgres driver returns BIGINTs as strings
      value: row.value,
      visibility: row.visibility,
      taggableFile: {
        fileUniqueId: row.file_unique_id,
        fileId: row.file_id,
        fileType: row.file_type,
        ...row.file_type === 'sticker' && {
          setName: row.set_name ?? undefined,
          emoji: row.emoji ?? undefined,
          isVideo: row.is_video,
          isAnimated: row.is_animated,
        },
        ...row.file_type === 'animation' && {
          mimeType: row.mime_type,
        },
        ...row.file_type === 'video' && {
          mimeType: row.mime_type,
          fileName: row.file_name,
        },
      },
      createdAt: new Date(row.created_at),
    }))
  }

  async exists(input: { authorUserId: number; fileUniqueId: string }): Promise<boolean> {
    const { authorUserId, fileUniqueId } = input

    const { rows } = await this.#client.query(
      `SELECT 1
       FROM tags
       WHERE author_user_id = $1
         AND file_unique_id = $2;`,
      [authorUserId, fileUniqueId]
    )

    return rows.length > 0
  }

  async stats(input: { requesterUserId: number; fileUniqueId: string }): Promise<{
    requesterTag: {
      visibility: Visibility
      value: string
    } | undefined
    publicTags: {
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
         AND author_user_id = $2
       LIMIT 1;`,
      [fileUniqueId, requesterUserId]
    )

    const { rows: publicRows } = await this.#client.query<{
      total: number
      values: string[]
    }>(
      `WITH public_tag_values AS NOT MATERIALIZED (
         SELECT value
         FROM tags
         WHERE file_unique_id = $1
           AND author_user_id <> $2
           AND visibility = $3
       )
       SELECT (SELECT COUNT(*) FROM public_tag_values)::int AS total,
              (SELECT array_agg(value) FROM (SELECT value FROM public_tag_values LIMIT 3)) AS values;`,
      [fileUniqueId, requesterUserId, 'public' satisfies Visibility],
    )

    return {
      requesterTag: requesterRows.length > 0
        ? {
          visibility: visibilitySchema.parse(requesterRows[0].visibility),
          value: requesterRows[0].value,
        }
        : undefined,
      publicTags: {
        total: publicRows.at(0)?.total ?? 0,
        values: publicRows.at(0)?.values ?? [],
      }
    }
  }
}