import { type Client } from 'pg'
import { type UserSession, userSessionSchema } from './user-session.ts';

export class UserSessionsRepository {
  #client: Client

  constructor(input: { client: Client }) {
    this.#client = input.client
  }

  async set(input: { userId: number; userSession: UserSession }): Promise<void> {
    const { userId, userSession } = input

    await this.#client.query(
      `INSERT INTO user_sessions (user_id, data)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET data = $2;`,
      [userId, userSession],
    )
  }

  async get(input: { userId: number }): Promise<UserSession | undefined> {
    const { userId } = input

    const { rows } = await this.#client.query(
      `SELECT data
       FROM user_sessions
       WHERE user_id = $1;`,
      [userId]
    );

    return rows.length > 0
      ? userSessionSchema.parse(rows[0].data)
      : undefined
  }

  async clear(input: { userId: number }): Promise<void> {
    const { userId } = input

    await this.#client.query(
      `DELETE FROM user_sessions
       WHERE user_id = $1`,
      [userId]
    )
  }
}