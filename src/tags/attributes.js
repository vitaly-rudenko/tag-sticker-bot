import { MIN_QUERY_LENGTH } from '../constants.js'

export const tagAttributes = Object.freeze({
  tagId: '_tid',
  valuePartition: '_vp',
  authorUserId: 'u',
  value: 'v',
  stickerFileUniqueId: 'fuid',
  stickerFileId: 'fid',
  stickerSetName: 'set',
  isPrivate: 'pr',
  createdAt: 'c',
})

/**
 * @param {string} authorUserId
 * @param {string} stickerFileUniqueId
 */
export function tagId(authorUserId, stickerFileUniqueId) {
  return `${authorUserId}#${stickerFileUniqueId}`
}

/**
 * Different value for private tags because they need to be excluded from the public search.
 *
 * @param {{
 *   value: string
 *   privateAuthorUserId?: string
 * }} input
 */
export function valuePartition({ value, privateAuthorUserId }) {
  return privateAuthorUserId
    ? `#${privateAuthorUserId}`
    : value.slice(0, MIN_QUERY_LENGTH)
}
