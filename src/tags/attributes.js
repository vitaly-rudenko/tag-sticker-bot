import { MIN_QUERY_LENGTH } from '../constants.js'

export const tagAttributes = Object.freeze({
  tagId: '_tid',
  valuePartition: '_vp',
  authorUserId: 'u',
  value: 'v',
  stickerFileUniqueId: 'fuid',
  stickerFileId: 'fid',
  stickerSetName: 'set',
  createdAt: 'c',
})

/**
 * @param {string} authorUserId
 * @param {string} stickerFileUniqueId
 */
export function tagId(authorUserId, stickerFileUniqueId) {
  return `${authorUserId}#${stickerFileUniqueId}`
}

/** @param {string} value */
export function valuePartition(value) {
  return value.slice(0, MIN_QUERY_LENGTH)
}
