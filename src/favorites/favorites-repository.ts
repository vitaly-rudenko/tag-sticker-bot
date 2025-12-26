import { type Client } from 'pg'
import { type TaggableFile, taggableFileSchema } from '../common/taggable-file.ts'
import { prepareQuery } from '../utils/prepare-query.ts'

export class FavoritesRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async add(input: { userId: number; taggableFile: TaggableFile }): Promise<void> {
    const { userId, taggableFile } = input

    await this.#client.query(
      `INSERT INTO favorites (user_id, file_unique_id, file_id, file_type, set_name, emoji, mime_type, file_name, is_video, is_animated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, file_unique_id) DO UPDATE
       SET file_id = $3
         , file_type = $4
         , set_name = $5
         , emoji = $6
         , mime_type = $7
         , file_name = $8
         , is_video = $9
         , is_animated = $10;`,
      [
        userId,
        taggableFile.fileUniqueId,
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

  async delete(input: { userId: number; fileUniqueId: string }): Promise<void> {
    const { userId, fileUniqueId } = input

    await this.#client.query(
      `DELETE FROM favorites
       WHERE user_id = $1
         AND file_unique_id = $2;`,
      [userId, fileUniqueId],
    )
  }

  async deleteAllByFileId(input: { fileId: string }): Promise<void> {
    const { fileId } = input

    await this.#client.query(
      `DELETE FROM favorites
       WHERE file_id = $1;`,
      [fileId],
    )
  }

  async exists(input: { userId: number; fileUniqueId: string }): Promise<boolean> {
    const { userId, fileUniqueId } = input

    const { rows } = await this.#client.query(
      `SELECT 1
       FROM favorites
       WHERE user_id = $1
         AND file_unique_id = $2;`,
      [userId, fileUniqueId],
    )

    return rows.length > 0
  }

  async list(input: { userId: number; limit: number; offset?: number }): Promise<TaggableFile[]> {
    const { userId, limit, offset = 0 } = input

    const { rows } = await this.#client.query<{
      file_unique_id: string
      file_id: string
      file_type: string
      set_name: string | null
      emoji: string | null
      mime_type: string | null
      file_name: string | null
      is_video: boolean
      is_animated: boolean
    }>(
      ...prepareQuery(
        `SELECT file_unique_id, file_id, file_type, set_name, emoji, mime_type, file_name, is_video, is_animated
         FROM favorites
         WHERE user_id = :userId
         LIMIT :limit
         OFFSET :offset;`,
        { userId, limit, offset },
      ),
    )

    return rows.map(row =>
      taggableFileSchema.parse({
        fileUniqueId: row.file_unique_id,
        fileId: row.file_id,
        fileType: row.file_type,
        ...(row.file_type === 'sticker' && {
          emoji: row.emoji,
          setName: row.set_name,
          isVideo: row.is_video,
          isAnimated: row.is_animated,
        }),
        ...(row.file_type === 'animation' && {
          mimeType: row.mime_type,
        }),
        ...(row.file_type === 'video' && {
          mimeType: row.mime_type,
          fileName: row.file_name,
        }),
      }),
    )
  }
}

