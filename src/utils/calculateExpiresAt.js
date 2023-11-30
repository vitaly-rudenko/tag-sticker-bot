/** @param {number} expirationTimeS */
export function calculateExpiresAt(expirationTimeS) {
  return Math.floor(Date.now() / 1000) + expirationTimeS
}
