import { createHash } from 'crypto'
import { MIN_QUERY_LENGTH } from '../constants.js'

export const tagAttributes = Object.freeze({
  tagId: '_tid',
  queryId: '_qid',
  valueHash: '_vh',
  authorUserId: 'u',
  value: 'v',
  stickerFileUniqueId: 'fuid',
  stickerFileId: 'fid',
  stickerSetName: 'set',
})

export const DEFAULT_AUTHOR_USER_ID = '#'

/**
 * @param {string} authorUserId
 * @param {string} stickerFileUniqueId
 */
export function tagId(authorUserId, stickerFileUniqueId) {
  return `${authorUserId}#${stickerFileUniqueId}`
}

/**
 * @param {string} value
 * @param {string} [authorUserId]
 */
export function queryId(value, authorUserId = undefined) {
  return `${authorUserId || ''}#${value.slice(0, MIN_QUERY_LENGTH)}`
}

/**
 * @param {string} value
 * @param {string} [authorUserId]
 */
export function valueHash(value, authorUserId = undefined) {
  return createHash('md5')
    .update(`${authorUserId || DEFAULT_AUTHOR_USER_ID}: ${value}`)
    .digest()
    .toString('hex')
}
