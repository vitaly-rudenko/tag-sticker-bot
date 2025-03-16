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

  it('handles Arrays properly', () => {
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

  it('handles Sets properly', () => {
    expect(
      generateQuery(
        `SELECT * FROM users WHERE user_id IN (:userIds) OR name IN (:names);`,
        { userIds: new Set([123, 456]), names: new Set(['John Doe', 'Jane Doe']) }
      )
    ).toEqual([
      'SELECT * FROM users WHERE user_id IN ($1, $2) OR name IN ($3, $4);',
      [123, 456, 'John Doe', 'Jane Doe']
    ])
  })

  it('ignores unused replacements', () => {
    expect(
      generateQuery(
        `SELECT * FROM users WHERE user_id = :userId;`,
        { userId: 123, name: 'John Doe' }
      )
    ).toEqual([
      'SELECT * FROM users WHERE user_id = $1;',
      [123]
    ])
  })

  it('handles empty replacements', () => {
    expect(
      generateQuery(
        `SELECT * FROM users WHERE user_id = :userId;`,
        {}
      )
    ).toEqual([
      'SELECT * FROM users WHERE user_id = :userId;',
      []
    ])
  })

  it('handles multiple occurrences of the same replacement', () => {
    expect(
      generateQuery(
        `SELECT * FROM users WHERE user_id = :userId OR user_id = :userId;`,
        { userId: 123 }
      )
    ).toEqual([
      'SELECT * FROM users WHERE user_id = $1 OR user_id = $1;',
      [123]
    ])
  })

  it('handles replacements with overlapping names', () => {
    expect(
      generateQuery(
        `SELECT * FROM users WHERE user_id IN (:my_userId, :userId_test, :userId, :another_userId, :userId_test2);`,
        { my_userId: 1, userId_test: 2, userId: 3, another_userId: 4, userId_test2: 5 }
      )
    ).toEqual([
      'SELECT * FROM users WHERE user_id IN ($4, $3, $5, $1, $2);',
      [4, 5, 2, 1, 3]
    ])
  })
})