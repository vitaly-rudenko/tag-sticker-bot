import { type Client } from 'pg'
import { type Tag, tagSchema } from './tag.ts'
import { taggableFileSchema, type TaggableFile } from '../common/taggable-file.ts'
import { visibilitySchema, type Visibility } from './visibility.ts'
import { prepareQuery } from '../utils/prepare-query.ts'
import { escapePostgresPosixRegex } from '../utils/escape-postgres-posix-regex.ts'
import { wrapPosixBoundary } from '../utils/wrap-posix-boundary.ts'

export class TagsRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async upsert(input: {
    authorUserId: number
    taggableFile: TaggableFile
    visibility: Visibility
    value: string
  }): Promise<void> {
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
      [limit, authorUserId],
    )

    return rows.map(row =>
      tagSchema.parse({
        authorUserId: Number(row.author_user_id), // Postgres driver returns BIGINTs as strings
        value: row.value,
        visibility: row.visibility,
        taggableFile: {
          fileUniqueId: row.file_unique_id,
          fileId: row.file_id,
          fileType: row.file_type,
          ...(row.file_type === 'sticker' && {
            setName: row.set_name ?? undefined,
            emoji: row.emoji ?? undefined,
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
        },
        createdAt: new Date(row.created_at),
      }),
    )
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
      [fileId],
    )
  }

  async search(input: {
    query: string
    authorUserId: number
    ownedOnly: boolean
    limit: number
    offset?: number
    random?: boolean
    testAuthorUserIds?: number[]
  }): Promise<Tag[]> {
    const { query, authorUserId, ownedOnly, limit, offset = 0, random = false, testAuthorUserIds } = input

    if (random && offset !== 0) {
      throw new Error('Cannot use offset with random')
    }

    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

    const exactQuery = words.join(' ') || undefined

    // Search for whole query with a padding to utilize trgm index (for queries of 2 characters)
    // NOTE: This doesn't work if tag value uses comma, exclamation mark or other symbols other than whitespace
    // '\mno ', ' no\M'
    const exactPartialQueries =
      exactQuery && exactQuery.length === 2
        ? [wrapPosixBoundary(exactQuery, 'prefix') + ' ', ' ' + wrapPosixBoundary(exactQuery, 'suffix')]
        : []

    // We do length checks (>= 3) because trgm index only words for words of 3 characters and longer
    const shouldUsePartialSearch = words.join(' ').length >= 3

    // Search for the whole query
    // \mhello world\M
    const wholeExactQuery = shouldUsePartialSearch ? wrapPosixBoundary(words.join(' '), 'whole') : undefined

    // Search for each whole word, they must be ordered correctly, in-between words are allowed
    // NOTE: If there's just one word, resulting query is identical to "wholeExactQuery", so we skip this clause
    // \mhello\M.*\mworld\M
    const wholeOrderedQuery =
      words.length > 1 && shouldUsePartialSearch ? words.map(w => wrapPosixBoundary(w, 'whole')).join('.*') : undefined

    // Search for each prefixed word, they must be ordered correctly, in-between words are allowed
    // \mhello.*\mworld
    const prefixOrderedQuery = shouldUsePartialSearch
      ? words.map(w => wrapPosixBoundary(w, 'prefix')).join('.*')
      : undefined

    // Search for each prefixed word, in any order, in-between words are allowed
    // NOTE: If there's just one word, resulting query is identical to "prefixOrderedQuery", so we skip this clause
    // NOTE: We pad 2-character words to use trgm index properly, 1-character words will skip this clause completely
    // \mhello, \mworld
    const prefixUnorderedQueries =
      words.length > 1 && words.every(w => w.length >= 2)
        ? words
            .filter(w => w.length >= 2)
            .flatMap(word =>
              word.length >= 3
                ? wrapPosixBoundary(word, 'prefix')
                : [wrapPosixBoundary(word, 'prefix') + ' ', ' ' + escapePostgresPosixRegex(word)],
            )
        : []

    const exactClause = exactQuery ? 'value = :exactQuery' : undefined
    const exactPartialClause =
      exactPartialQueries.length > 0
        ? exactPartialQueries.map((_, i) => `value ~* :exactPartialQuery${i + 1}`).join(' OR ')
        : undefined
    const wholeExactClause = wholeExactQuery ? 'value ~* :wholeExactQuery' : undefined
    const wholeOrderedClause = wholeOrderedQuery ? 'value ~* :wholeOrderedQuery' : undefined
    const prefixOrderedClause = prefixOrderedQuery ? 'value ~* :prefixOrderedQuery' : undefined
    const prefixUnorderedClause =
      prefixUnorderedQueries.length > 0
        ? prefixUnorderedQueries.map((_, i) => `value ~* :prefixUnorderedQuery${i + 1}`).join(' AND ')
        : undefined

    const clauses = [
      prefixUnorderedClause,
      prefixOrderedClause,
      wholeOrderedClause,
      wholeExactClause,
      exactPartialClause,
      exactClause,
    ].filter(Boolean)

    // User provided a query, but we can't fulfill the request (e.g. all words are shorter than 3 characters)
    if (words.length > 0 && clauses.length === 0) {
      return []
    }

    const source =
      clauses.length > 0
        ? `(SELECT DISTINCT ON (file_unique_id) *
            FROM (
              ${clauses
                .map(
                  (clause, rank) =>
                    `SELECT *, ${rank} AS rank
                     FROM tags
                     WHERE (${clause})
                       AND ${ownedOnly ? 'author_user_id = :authorUserId' : "(author_user_id = :authorUserId OR visibility = 'public')"}
                           ${testAuthorUserIds ? 'AND author_user_id = ANY(:testAuthorUserIds)' : ''}`,
                )
                .join('\nUNION ALL\n')}
            )
            ORDER BY file_unique_id, rank DESC)`
        : `(SELECT *, 0 AS rank
            FROM tags
            WHERE ${ownedOnly ? 'author_user_id = :authorUserId' : "(author_user_id = :authorUserId OR visibility = 'public')"}
                  ${testAuthorUserIds ? 'AND author_user_id = ANY(:testAuthorUserIds)' : ''})`

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
      ...prepareQuery(
        `SELECT author_user_id
              , visibility
              , value
              , file_unique_id
              , file_id
              , file_type
              , set_name
              , emoji
              , mime_type
              , file_name
              , is_video
              , is_animated
              , created_at
         FROM ${source}
         ORDER BY ${random ? 'RANDOM()' : 'rank DESC, created_at DESC, value DESC'}
         LIMIT :limit
         OFFSET :offset;`,
        {
          limit,
          offset,
          authorUserId,
          testAuthorUserIds,
          exactQuery,
          wholeExactQuery,
          wholeOrderedQuery,
          prefixOrderedQuery,
          ...prefixUnorderedQueries.reduce(
            (replacements, query, i) => {
              replacements[`prefixUnorderedQuery${i + 1}`] = query
              return replacements
            },
            {} as Record<string, string>,
          ),
          ...exactPartialQueries.reduce(
            (replacements, query, i) => {
              replacements[`exactPartialQuery${i + 1}`] = query
              return replacements
            },
            {} as Record<string, string>,
          ),
        },
      ),
    )

    return rows.map(row =>
      tagSchema.parse({
        authorUserId: Number(row.author_user_id), // Postgres driver returns BIGINTs as strings
        value: row.value,
        visibility: row.visibility,
        taggableFile: {
          fileUniqueId: row.file_unique_id,
          fileId: row.file_id,
          fileType: row.file_type,
          ...(row.file_type === 'sticker' && {
            setName: row.set_name ?? undefined,
            emoji: row.emoji ?? undefined,
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
        },
        createdAt: new Date(row.created_at),
      }),
    )
  }

  async exists(input: { authorUserId: number; fileUniqueId: string }): Promise<boolean> {
    const { authorUserId, fileUniqueId } = input

    const { rows } = await this.#client.query(
      `SELECT 1
       FROM tags
       WHERE author_user_id = $1
         AND file_unique_id = $2;`,
      [authorUserId, fileUniqueId],
    )

    return rows.length > 0
  }

  async stats(input: { authorUserId: number; fileUniqueId: string }): Promise<{
    authorTag:
      | {
          visibility: Visibility
          value: string
        }
      | undefined
    publicTags: {
      total: number
      values: string[]
    }
  }> {
    const { authorUserId, fileUniqueId } = input

    const { rows: requesterRows } = await this.#client.query<{
      value: string
      visibility: Visibility
    }>(
      `SELECT value, visibility
       FROM tags
       WHERE file_unique_id = $1
         AND author_user_id = $2
       LIMIT 1;`,
      [fileUniqueId, authorUserId],
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
      [fileUniqueId, authorUserId, 'public' satisfies Visibility],
    )

    return {
      authorTag:
        requesterRows.length > 0
          ? {
              visibility: visibilitySchema.parse(requesterRows[0].visibility),
              value: requesterRows[0].value,
            }
          : undefined,
      publicTags: {
        total: publicRows.at(0)?.total ?? 0,
        values: publicRows.at(0)?.values ?? [],
      },
    }
  }
}
