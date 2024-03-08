import { MIN_QUERY_LENGTH } from '../constants.js'

export const tagAttributes = Object.freeze({
  tagId: '_tid',
  valuePartition: '_vp',
  authorUserId: 'u',
  value: 'v',
  fileUniqueId: 'fuid',
  fileId: 'fid',
  stickerSetName: 'set',
  animationMimeType: 'mime',
  isPrivate: 'pr',
  createdAt: 'c',
})

/**
 * @param {string} authorUserId
 * @param {string} fileUniqueId
 */
export function tagId(authorUserId, fileUniqueId) {
  return `${authorUserId}#${fileUniqueId}`
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
