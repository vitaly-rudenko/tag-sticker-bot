/** NOTE: Only for testing */
export class InefficientDynamodbTagSearcher {
  /**
   * @param {{
  *   dynamodbTagRepository: import('./DynamodbTagRepository.js').DynamodbTagRepository
  * }} options 
  */
  constructor({ dynamodbTagRepository }) {
    this._dynamodbTagRepository = dynamodbTagRepository
  }

  /** @param {import('../types.d.ts').Tag[]} tags */
  async put(tags) {
    // stub
  }

  /** @returns {Promise<import('../types.d.ts').Tag[]>} */
  async find({ query, authorUserId = undefined }) {
    return this._dynamodbTagRepository.inefficientlyScanTags({ query, authorUserId })
  }
}
