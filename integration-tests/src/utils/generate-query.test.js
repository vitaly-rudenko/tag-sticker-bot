import { generateQuery } from "../../../src/utils/generate-query"

describe('generateQuery()', () => {
  it('generates a simple query', () => {
    expect(
      generateQuery(
        `INSERT INTO users (user_id, name) VALUES (:userId, :name);`,
        { userId: 123, name: 'John Doe' }
      )
    ).toEqual([
      'INSERT INTO users (user_id, name) VALUES ($1, $2);',
      [123, 'John Doe']
    ])
  })

  it('handles arrays properly', () => {
    expect(
      generateQuery(
        `SELECT * FROM users WHERE user_id IN (:userIds) OR name IN (:names);`,
        { userIds: [123, 456], names: ['John Doe', 'Jane Doe'] }
      )
    ).toEqual([
      'SELECT * FROM users WHERE user_id IN ($1, $2) OR name IN ($3, $4);',
      [123, 456, 'John Doe', 'Jane Doe']
    ])
  })
})