import pg from 'pg'
import { randomUUID } from 'crypto'
import { after, before, describe, it } from 'node:test'
import { TagsRepository } from './tags-repository.ts'
import { type TaggableFile } from '../common/taggable-file.ts'
import assert from 'node:assert'

describe('TagsRepository', () => {
  let client: pg.Client

  before(async () => {
    client = new pg.Client(process.env.DATABASE_URL)
    await client.connect()
  })

  after(async () => {
    await client.end()
  })

  async function createTestUser(): Promise<number> {
    const result = await client.query<{ id: number }>(
      `INSERT INTO test_users
       DEFAULT VALUES
       RETURNING id;`,
    )

    return result.rows[0].id
  }

  function createTestTaggableFile(): TaggableFile {
    return {
      fileId: randomUUID(),
      fileType: 'animation',
      fileUniqueId: randomUUID(),
      mimeType: 'video/mp4',
    }
  }

  describe('search()', () => {
    it('searches tags (latin)', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()

      async function createTestTag(value: string) {
        await tagsRepository.upsert({
          authorUserId,
          visibility: 'public',
          taggableFile: createTestTaggableFile(),
          value,
        })
      }

      await createTestTag('well')
      await createTestTag('swell')
      await createTestTag('well well well, you are here, and i am not')
      await createTestTag('i care about your wellness')
      await createTestTag('i know you well')
      await createTestTag('i am crazy, am i not?')

      async function search(partial: { query: string }) {
        return (
          await tagsRepository.search({
            limit: 10,
            ownedOnly: false,
            authorUserId,
            testAuthorUserIds: [authorUserId],
            ...partial,
          })
        ).map(tag => tag.value)
      }

      assert.deepEqual(await search({ query: 'well' }), [
        //
        'well', // exact
        'i know you well', // whole exact
        'well well well, you are here, and i am not', // whole exact
        'i care about your wellness', // prefix ordered
      ])

      assert.deepEqual(await search({ query: 'swe' }), [
        //
        'swell', // prefix ordered
      ])

      assert.deepEqual(await search({ query: 'you well' }), [
        //
        'i know you well', // whole exact
        'i care about your wellness', // prefix ordered
        'well well well, you are here, and i am not', // prefix unordered
      ])

      assert.deepEqual(await search({ query: 'well you' }), [
        //
        'well well well, you are here, and i am not', // prefix ordered
        'i know you well', // prefix unordered
        'i care about your wellness', // prefix unordered
      ])

      assert.deepEqual(await search({ query: 'am not' }), [
        //
        'well well well, you are here, and i am not', // whole exact
        'i am crazy, am i not?', // whole ordered
      ])

      // Edge case: "i" is too short and ignored in "prefix unordered" clause
      assert.deepEqual(await search({ query: 'i well' }), [
        //
        'i know you well', // prefix ordered
        'i care about your wellness', // prefix ordered
      ])

      // Edge case: both "i" and "am" are too short for "prefix unordered" clause
      assert.deepEqual(await search({ query: 'i am' }), [
        //
        'i am crazy, am i not?', // whole exact
        'well well well, you are here, and i am not', // whole exact
      ])

      // Should not match suffixes
      assert.deepEqual(await search({ query: 'ness' }), [])
    })

    it('searches tags (cyrillic)', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()

      async function createTestTag(value: string) {
        await tagsRepository.upsert({
          authorUserId,
          visibility: 'public',
          taggableFile: createTestTaggableFile(),
          value,
        })
      }

      await createTestTag('кіт')
      await createTestTag('скіт')
      await createTestTag('кіт кіт кіт, твій ніс бачив, я не ховався')
      await createTestTag('я та твій кітунь')
      await createTestTag('я добре знаю, що твій кіт робить')

      async function search(partial: { query: string }) {
        return (
          await tagsRepository.search({
            limit: 10,
            ownedOnly: false,
            authorUserId,
            testAuthorUserIds: [authorUserId],
            ...partial,
          })
        ).map(tag => tag.value)
      }

      assert.deepEqual(await search({ query: 'кіт' }), [
        //
        'кіт', // exact
        'я добре знаю, що твій кіт робить', // whole exact
        'кіт кіт кіт, твій ніс бачив, я не ховався', // whole exact
        'я та твій кітунь', // prefix ordered
      ])

      assert.deepEqual(await search({ query: 'твій кіт' }), [
        //
        'я добре знаю, що твій кіт робить', // whole exact
        'я та твій кітунь', // prefix ordered
        'кіт кіт кіт, твій ніс бачив, я не ховався', // prefix unordered
      ])

      assert.deepEqual(await search({ query: 'кіт твій' }), [
        //
        'кіт кіт кіт, твій ніс бачив, я не ховався', // prefix ordered
        'я добре знаю, що твій кіт робить', // prefix unordered
        'я та твій кітунь', // prefix unordered
      ])

      // Edge case: "я" is too short and ignored in "prefix unordered" clause
      assert.deepEqual(await search({ query: 'я кіт' }), [
        //
        'я добре знаю, що твій кіт робить', // prefix ordered
        'я та твій кітунь', // prefix ordered
      ])

      // Edge case: both "я" and "не" are too short for "prefix unordered" clause
      assert.deepEqual(await search({ query: 'я не' }), [
        //
        'кіт кіт кіт, твій ніс бачив, я не ховався', // whole exact
      ])

      // Should not match suffixes
      assert.deepEqual(await search({ query: 'унь' }), [])
    })

    it('hides private tags of other authors', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()
      const otherAuthorUserId = await createTestUser()

      async function createTestTag(authorId: number, visibility: 'public' | 'private', value: string) {
        await tagsRepository.upsert({
          authorUserId: authorId,
          visibility,
          taggableFile: createTestTaggableFile(),
          value,
        })
      }

      await createTestTag(otherAuthorUserId, 'public', 'visible tag')
      await createTestTag(otherAuthorUserId, 'private', 'hidden tag')

      async function search(partial: { query: string }) {
        return (
          await tagsRepository.search({
            limit: 10,
            ownedOnly: false,
            authorUserId,
            testAuthorUserIds: [authorUserId, otherAuthorUserId],
            ...partial,
          })
        ).map(tag => tag.value)
      }

      assert.deepEqual(await search({ query: 'visible tag' }), ['visible tag'])
      assert.deepEqual(await search({ query: 'hidden tag' }), [])
    })

    it('returns empty results when no matches or query is too short', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()

      async function createTestTag(value: string) {
        await tagsRepository.upsert({
          authorUserId,
          visibility: 'public',
          taggableFile: createTestTaggableFile(),
          value,
        })
      }

      await createTestTag('hello world')

      const results = await tagsRepository.search({
        query: 'he',
        limit: 10,
        ownedOnly: false,
        authorUserId,
        testAuthorUserIds: [authorUserId],
      })

      assert.deepEqual(results, [])
    })

    it('returns all results if query is empty', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()

      async function createTestTag(value: string) {
        await tagsRepository.upsert({
          authorUserId,
          visibility: 'public',
          taggableFile: createTestTaggableFile(),
          value,
        })
      }

      await createTestTag('first')
      await createTestTag('second')

      const results = await tagsRepository.search({
        query: '',
        limit: 10,
        ownedOnly: false,
        authorUserId,
        testAuthorUserIds: [authorUserId],
      })

      assert.deepEqual(results.map(tag => tag.value).sort(), ['first', 'second'])
    })

    it('returns tags owned by specific author', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()
      const otherAuthorUserId = await createTestUser()

      async function createTestTag(authorId: number, value: string) {
        await tagsRepository.upsert({
          authorUserId: authorId,
          visibility: 'public',
          taggableFile: createTestTaggableFile(),
          value,
        })
      }

      await createTestTag(authorUserId, 'my tag')
      await createTestTag(otherAuthorUserId, 'other tag')

      async function search(partial: { query: string; ownedOnly: boolean }) {
        return (
          await tagsRepository.search({
            limit: 10,
            authorUserId,
            testAuthorUserIds: [authorUserId, otherAuthorUserId],
            ...partial,
          })
        ).map(tag => tag.value)
      }

      assert.deepEqual(await search({ query: 'tag', ownedOnly: false }), ['other tag', 'my tag'])
      assert.deepEqual(await search({ query: 'tag', ownedOnly: true }), ['my tag'])
    })

    it('escapes special posix regex characters in query', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()

      async function createTestTag(value: string) {
        await tagsRepository.upsert({
          authorUserId,
          visibility: 'public',
          taggableFile: createTestTaggableFile(),
          value,
        })
      }

      await createTestTag('hello (world)')
      await createTestTag('price is $5.00')
      await createTestTag('unrelated tag')

      async function search(partial: { query: string }) {
        return (
          await tagsRepository.search({
            limit: 10,
            ownedOnly: false,
            authorUserId,
            testAuthorUserIds: [authorUserId],
            ...partial,
          })
        ).map(tag => tag.value)
      }

      // Special chars should be treated as literals, not regex operators
      assert.deepEqual(await search({ query: '(world)' }), ['hello (world)'])
      assert.deepEqual(await search({ query: '$5.00' }), ['price is $5.00'])

      // Should not throw or return unexpected results
      assert.deepEqual(await search({ query: '.*' }), [])
      assert.deepEqual(await search({ query: '[a-z]' }), [])
    })

    it('returns exact partial matches for short queries', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()

      async function createTestTag(value: string) {
        await tagsRepository.upsert({
          authorUserId,
          visibility: 'public',
          taggableFile: createTestTaggableFile(),
          value,
        })
      }

      await createTestTag('cat says no')
      await createTestTag('no way')
      await createTestTag('no')
      await createTestTag('no!')
      await createTestTag('volcano is hot')
      await createTestTag('my nostril')

      async function search(partial: { query: string }) {
        return (
          await tagsRepository.search({
            limit: 10,
            ownedOnly: false,
            authorUserId,
            testAuthorUserIds: [authorUserId],
            ...partial,
          })
        ).map(tag => tag.value)
      }

      assert.deepEqual(await search({ query: 'no' }), [
        'no', // exact
        'no way', // exact partial
        'cat says no', // exact partial
      ])
    })
  })

  it('it returns prefix unordered matches even if some words are less than 3 characters long', async () => {
    const tagsRepository = new TagsRepository({ client })

    const authorUserId = await createTestUser()

    await tagsRepository.upsert({
      authorUserId,
      visibility: 'public',
      taggableFile: createTestTaggableFile(),
      value: 'тобто ти не віриш у мене?',
    })

    const results = await tagsRepository.search({
      query: 'ти тобто',
      limit: 10,
      ownedOnly: false,
      authorUserId,
      testAuthorUserIds: [authorUserId],
    })

    assert.deepEqual(
      results.map(tag => tag.value),
      ['тобто ти не віриш у мене?'],
    )
  })
})
