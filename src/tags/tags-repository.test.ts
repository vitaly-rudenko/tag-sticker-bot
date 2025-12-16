import pg from 'pg'
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

  describe('search()', () => {
    it('searches tags', async () => {
      await client.query('TRUNCATE tags')

      const tagsRepository = new TagsRepository({ client })

      let snapshot = Date.now()
      function nextId() { return snapshot++ }

      const authorUserId1 = nextId()
      const authorUserId2 = nextId()
      const authorUserId3 = nextId()

      const taggableFile1: TaggableFile = {
        fileId: 'fake-file-1',
        fileType: 'animation',
        fileUniqueId: `fake-file-unique-id-${nextId()}-1`,
        mimeType: 'video/mp4',
      }

      const taggableFile2: TaggableFile = {
        fileId: 'fake-file-2',
        fileType: 'animation',
        fileUniqueId: `fake-file-unique-id-${nextId()}-2`,
        mimeType: 'video/mp4',
      }

      const taggableFile3: TaggableFile = {
        fileId: 'fake-file-3',
        fileType: 'sticker',
        fileUniqueId: `fake-file-unique-id-${nextId()}-3`,
        setName: 'fake-set-name',
        isVideo: false,
        isAnimated: true,
      }

      // Sticker 1
      await tagsRepository.upsert({
        authorUserId: authorUserId1,
        taggableFile: taggableFile1,
        value: 'hello my beautiful world',
        visibility: 'public',
      })

      await tagsRepository.upsert({
        authorUserId: authorUserId2,
        taggableFile: taggableFile2,
        value: 'hello world!',
        visibility: 'public',
      })

      await tagsRepository.upsert({
        authorUserId: authorUserId3,
        taggableFile: taggableFile3,
        value: 'hello world',
        visibility: 'private',
      })

      // duplicate
      await tagsRepository.upsert({
        authorUserId: authorUserId1,
        taggableFile: taggableFile1,
        value: 'Hello, world.',
        visibility: 'public',
      })

      // alternative tag
      await tagsRepository.upsert({
        authorUserId: authorUserId2,
        taggableFile: taggableFile1,
        value: 'Goodbye, world.',
        visibility: 'public',
      })

      await tagsRepository.upsert({
        authorUserId: authorUserId2,
        taggableFile: taggableFile3,
        value: 'Something else',
        visibility: 'private',
      })

      assert.deepEqual(
        (await tagsRepository.search({
          limit: 10,
          ownedOnly: false,
          query: 'hello world',
          requesterUserId: authorUserId1,
        })).map(tag => tag.taggableFile.fileUniqueId),
        [
          taggableFile1.fileUniqueId,
          taggableFile2.fileUniqueId,
        ]
      )

      assert.deepEqual(
        (await tagsRepository.search({
          limit: 10,
          ownedOnly: true,
          query: 'hello world',
          requesterUserId: authorUserId1,
        })).map(tag => tag.taggableFile.fileUniqueId),
        [
          taggableFile1.fileUniqueId,
        ]
      )

      assert.deepEqual(
        (await tagsRepository.search({
          limit: 10,
          ownedOnly: true,
          query: '',
          requesterUserId: authorUserId2,
        })).map(tag => tag.taggableFile.fileUniqueId),
        [
          taggableFile3.fileUniqueId,
          taggableFile1.fileUniqueId,
          taggableFile2.fileUniqueId,
        ]
      )

      assert.deepEqual(
        (await tagsRepository.search({
          limit: 10,
          ownedOnly: false,
          query: 'hello world',
          requesterUserId: authorUserId2,
        })).map(tag => tag.taggableFile.fileUniqueId),
        [
          taggableFile2.fileUniqueId,
          taggableFile1.fileUniqueId,
        ]
      )

      assert.deepEqual(
        (await tagsRepository.search({
          limit: 10,
          ownedOnly: false,
          query: 'hello world',
          requesterUserId: authorUserId3,
        })).map(tag => tag.taggableFile.fileUniqueId),
        [
          taggableFile3.fileUniqueId,
          taggableFile2.fileUniqueId,
          taggableFile1.fileUniqueId,
        ]
      )

      assert.deepEqual(
        (await tagsRepository.search({
          limit: 10,
          ownedOnly: false,
          query: 'Goodbye',
          requesterUserId: authorUserId1,
        })).map(tag => tag.taggableFile.fileUniqueId),
        [
          taggableFile1.fileUniqueId,
        ]
      )
    })
  })
})
