export class InMemoryUserSessionRepository {
  constructor() {
    this._users = {}
  }

  async amendContext(userId, context) {
    this._users[userId] = {
      ...await this.getContext(userId),
      ...context,
    }
  }

  async getContext(userId) {
    return this._users[userId] || {}
  }
}
