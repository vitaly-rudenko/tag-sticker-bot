/** @param {string} mimeType */
export function encodeMimeType(mimeType) {
  if (mimeType === 'video/mp4') return '1';
  if (mimeType === 'image/gif') return '2';
  throw new Error(`Could not encode mimeType: ${mimeType}`)
}

/** @param {string | undefined} mimeType */
export function decodeMimeType(mimeType) {
  if (mimeType === undefined) return undefined;
  if (mimeType === '1') return 'video/mp4';
  if (mimeType === '2') return 'image/gif';
  throw new Error(`Could not decode mimeType: ${mimeType}`)
}
