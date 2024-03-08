import { booleansToBitmap } from './bitmap.js'

/**
 * @param {T[]} files
 * @template {import('../types.js').File} T
 */
export function sortFiles(files) {
  return files.toSorted((a, b) => {
    if (a.file_unique_id === b.file_unique_id) return 0
    if (a.file_unique_id > b.file_unique_id) return 1
    return -1
  })
}

/**
 * @param {import('../types.js').File[]} files
 * @param {(file: import('../types.js').File) => boolean} mapper
 */
export function filesToBitmap(files, mapper) {
  return booleansToBitmap(sortFiles(files).map(mapper))
}
