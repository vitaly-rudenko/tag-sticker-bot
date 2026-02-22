import pg from 'pg'
import * as uuid from 'uuid'
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
      fileId: uuid.v4(),
      fileType: 'animation',
      fileUniqueId: uuid.v4(),
      mimeType: 'video/mp4',
    }
  }

  describe('search()', () => {
    it('searches tags (latin)', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()

      const taggableFile1 = createTestTaggableFile()
      const taggableFile2 = createTestTaggableFile()
      const taggableFile3 = createTestTaggableFile()
      const taggableFile4 = createTestTaggableFile()
      const taggableFile5 = createTestTaggableFile()
      const taggableFile6 = createTestTaggableFile()

      async function createTestTag(partial: { taggableFile: TaggableFile; value: string }) {
        await tagsRepository.upsert({
          authorUserId,
          visibility: 'public',
          ...partial,
        })
      }

      await createTestTag({ taggableFile: taggableFile1, value: 'well' })
      await createTestTag({ taggableFile: taggableFile2, value: 'swell' })
      await createTestTag({ taggableFile: taggableFile3, value: 'well well well, you are here, and i am not' })
      await createTestTag({ taggableFile: taggableFile4, value: 'i care about your wellness' })
      await createTestTag({ taggableFile: taggableFile5, value: 'i know you well' })
      await createTestTag({ taggableFile: taggableFile6, value: 'i am crazy, am i not?' })

      async function search(partial: { query: string }) {
        return (
          await tagsRepository.search({
            limit: 10,
            ownedOnly: false,
            requesterUserId: authorUserId,
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

      const taggableFile1 = createTestTaggableFile()
      const taggableFile2 = createTestTaggableFile()
      const taggableFile3 = createTestTaggableFile()
      const taggableFile4 = createTestTaggableFile()
      const taggableFile5 = createTestTaggableFile()

      async function createTestTag(partial: { taggableFile: TaggableFile; value: string }) {
        await tagsRepository.upsert({
          authorUserId,
          visibility: 'public',
          ...partial,
        })
      }

      await createTestTag({ taggableFile: taggableFile1, value: 'кіт' })
      await createTestTag({ taggableFile: taggableFile2, value: 'скіт' })
      await createTestTag({ taggableFile: taggableFile3, value: 'кіт кіт кіт, твій ніс бачив, я не ховався' })
      await createTestTag({ taggableFile: taggableFile4, value: 'я та твій кітунь' })
      await createTestTag({ taggableFile: taggableFile5, value: 'я добре знаю, що твій кіт робить' })

      async function search(partial: { query: string }) {
        return (
          await tagsRepository.search({
            limit: 10,
            ownedOnly: false,
            requesterUserId: authorUserId,
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

    it('hides other authors private tags, but shows their public tags', async () => {
      const tagsRepository = new TagsRepository({ client })

      const authorUserId = await createTestUser()
      const otherAuthorUserId = await createTestUser()

      const publicFile = createTestTaggableFile()
      const privateFile = createTestTaggableFile()

      await tagsRepository.upsert({ authorUserId: otherAuthorUserId, visibility: 'public', taggableFile: publicFile, value: 'visible tag' })
      await tagsRepository.upsert({ authorUserId: otherAuthorUserId, visibility: 'private', taggableFile: privateFile, value: 'hidden tag' })

      async function search(partial: { query: string }) {
        return (
          await tagsRepository.search({
            limit: 10,
            ownedOnly: false,
            requesterUserId: authorUserId,
            testAuthorUserIds: [authorUserId, otherAuthorUserId],
            ...partial,
          })
        ).map(tag => tag.value)
      }

      assert.deepEqual(await search({ query: 'visible tag' }), ['visible tag'])
      assert.deepEqual(await search({ query: 'hidden tag' }), [])
    })

    it('ownedOnly returns only tags owned by requesterUserId', async () => {
      const tagsRepository = new TagsRepository({ client })

      const requesterUserId = await createTestUser()
      const otherAuthorUserId = await createTestUser()

      const ownFile = createTestTaggableFile()
      const otherPublicFile = createTestTaggableFile()

      await tagsRepository.upsert({ authorUserId: requesterUserId, visibility: 'public', taggableFile: ownFile, value: 'my tag' })
      await tagsRepository.upsert({ authorUserId: otherAuthorUserId, visibility: 'public', taggableFile: otherPublicFile, value: 'other tag' })

      async function search(partial: { query: string; ownedOnly: boolean }) {
        return (
          await tagsRepository.search({
            limit: 10,
            requesterUserId,
            testAuthorUserIds: [requesterUserId, otherAuthorUserId],
            ...partial,
          })
        ).map(tag => tag.value)
      }

      assert.deepEqual(await search({ query: 'tag', ownedOnly: false }), ['other tag', 'my tag'])
      assert.deepEqual(await search({ query: 'tag', ownedOnly: true }), ['my tag'])
    })
  })
})
