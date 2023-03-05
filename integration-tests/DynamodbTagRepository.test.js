import './setup.js'
import { randomBytes } from 'crypto'
import { DynamodbTagRepository } from '../src/tags/DynamodbTagRepository.js'
import { createDynamodbClient } from '../src/utils/createDynamodbClient.js'
import { dynamodbTagsTable } from '../src/env.js'

function generateId(name) {
  return `${name}-${randomBytes(8).toString('hex')}`
}

describe('DynamodbTagRepository', () => {
  /** @type {DynamodbTagRepository} */
  let tagRepository

  beforeEach(() => {
    tagRepository = new DynamodbTagRepository({
      dynamodbClient: createDynamodbClient(),
      tableName: dynamodbTagsTable,
    })
  })

  it('should handle tag querying and searching', async () => {
    const user1 = generateId('user-1')
    const user2 = generateId('user-2')
    const sticker1 = generateId('sticker-1')
    const sticker2 = generateId('sticker-2')
    const sticker3 = generateId('sticker-3')
    const sticker4 = generateId('sticker-4')

    const tag1 = {
      sticker: {
        setName: generateId('sticker-set'),
        fileUniqueId: sticker1,
        fileId: generateId('sticker'),
      },
      authorUserId: user1,
      value: 'hello world',
    }

    const tag2 = {
      sticker: {
        setName: generateId('sticker-set'),
        fileUniqueId: sticker2,
        fileId: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'hello there',
    }

    const tag3 = {
      sticker: {
        setName: generateId('sticker-set'),
        fileUniqueId: sticker3,
        fileId: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'there it is',
    }

    const tag4 = {
      sticker: {
        setName: generateId('sticker-set'),
        fileUniqueId: sticker4,
        fileId: generateId('sticker'),
      },
      authorUserId: user1,
      value: 'reuse 1',
    }

    const tag5 = {
      sticker: {
        setName: generateId('sticker-set'),
        fileUniqueId: sticker4,
        fileId: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'reuse 2',
    }

    // store

    await tagRepository.storeTag(tag1)
    await tagRepository.storeTag(tag2)
    await tagRepository.storeTag(tag3)

    await tagRepository.storeTag({
      sticker: {
        setName: generateId('sticker-set'),
        fileUniqueId: sticker4,
        fileId: generateId('sticker'),
      },
      authorUserId: user1,
      value: 'reuse 1 to be overwritten',
    })

    await tagRepository.storeTag({
      sticker: {
        setName: generateId('sticker-set'),
        fileUniqueId: sticker4,
        fileId: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'reuse 2 to be overwritten',
    })

    await tagRepository.storeTag(tag4)
    await tagRepository.storeTag(tag5)

    // query

    await expect(tagRepository.queryTagStatus({
      stickerFileUniqueIds: [sticker1, sticker3]
    })).resolves.toEqual({
      [sticker1]: true,
      [sticker3]: true,
    })

    await expect(tagRepository.queryTagStatus({
      stickerFileUniqueIds: [sticker2]
    })).resolves.toEqual({
      [sticker2]: true,
    })
    
    await expect(tagRepository.queryTagStatus({
      stickerFileUniqueIds: [sticker1, sticker2, sticker3], authorUserId: user1
    })).resolves.toEqual({
      [sticker1]: true,
      [sticker2]: false,
      [sticker3]: false,
    })

    await expect(tagRepository.queryTagStatus({
      stickerFileUniqueIds: [sticker1, sticker2, sticker3], authorUserId: user2
    })).resolves.toEqual({
      [sticker1]: false,
      [sticker2]: true,
      [sticker3]: true,
    })

    await expect(tagRepository.queryTagStatus({
      stickerFileUniqueIds: [sticker4]
    })).resolves.toEqual({
      [sticker4]: true,
    })

    // search

    await expect(tagRepository.legacySearchTags({
      query: 'hey'
    })).resolves.toEqual([])

    await expect(tagRepository.legacySearchTags({
      query: 'it is',
      authorUserId: user1,
    })).resolves.toEqual([])

    await expect(tagRepository.legacySearchTags({
      query: 'hello'
    })).resolves.toIncludeSameMembers([tag1, tag2])

    await expect(tagRepository.legacySearchTags({
      query: 'there'
    })).resolves.toIncludeSameMembers([tag2, tag3])

    await expect(tagRepository.legacySearchTags({
      query: 'it is'
    })).resolves.toIncludeSameMembers([tag3])

    await expect(tagRepository.legacySearchTags({
      query: 'hello',
      authorUserId: user1,
    })).resolves.toIncludeSameMembers([tag1])

    await expect(tagRepository.legacySearchTags({
      query: 'hello',
      authorUserId: user2,
    })).resolves.toIncludeSameMembers([tag2])

    await expect(tagRepository.legacySearchTags({
      query: 'reuse',
    })).resolves.toIncludeSameMembers([tag4, tag5])
  })
})
