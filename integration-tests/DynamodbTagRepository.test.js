import './setup.js'
import { randomBytes } from 'crypto'
import { DynamodbTagRepository } from '../src/tags/DynamodbTagRepository.js'
import { createDynamodbClient } from '../src/utils/createDynamodbClient.js'
import { dynamodbTagsTable } from '../src/env.js'

function generateId(name) {
  return `${name}-${randomBytes(8).toString('hex')}`
}

function defaultTag(tag) {
  return {
    ...tag,
    authorUserId: '#',
  }
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
    const set1 = generateId('set-1')
    const set2 = generateId('set-2')
    const sticker1 = generateId('sticker-1')
    const sticker2 = generateId('sticker-2')
    const sticker3 = generateId('sticker-3')
    const sticker4 = generateId('sticker-4')

    const tag1 = {
      sticker: {
        setName: set1,
        fileUniqueId: sticker1,
        fileId: generateId('sticker'),
      },
      authorUserId: user1,
      value: 'hello world',
    }

    const tag2 = {
      sticker: {
        setName: set1,
        fileUniqueId: sticker2,
        fileId: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'hello there',
    }

    const tag3 = {
      sticker: {
        setName: set2,
        fileUniqueId: sticker3,
        fileId: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'there it is',
    }

    const tag4 = {
      sticker: {
        setName: set2,
        fileUniqueId: sticker4,
        fileId: generateId('sticker'),
      },
      authorUserId: user1,
      value: 'reuse 1',
    }

    const tag5 = {
      sticker: {
        setName: set2,
        fileUniqueId: sticker4,
        fileId: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'reuse 2',
    }

    // store

    await tagRepository.store({
      authorUserId: tag1.authorUserId,
      sticker: tag1.sticker,
      values: [tag1.value],
    })

    await tagRepository.store({
      authorUserId: tag2.authorUserId,
      sticker: tag2.sticker,
      values: [tag2.value],
    })

    await tagRepository.store({
      authorUserId: tag3.authorUserId,
      sticker: tag3.sticker,
      values: [tag3.value],
    })

    await tagRepository.store({
      sticker: {
        setName: set2,
        fileUniqueId: sticker4,
        fileId: generateId('sticker'),
      },
      authorUserId: user1,
      values: ['reuse 1 to be overwritten'],
    })

    await tagRepository.store({
      sticker: {
        setName: set2,
        fileUniqueId: sticker4,
        fileId: generateId('sticker'),
      },
      authorUserId: user2,
      values: ['reuse 2 to be overwritten'],
    })

    await tagRepository.store({
      authorUserId: tag4.authorUserId,
      sticker: tag4.sticker,
      values: [tag4.value],
    })

    await tagRepository.store({
      authorUserId: tag5.authorUserId,
      sticker: tag5.sticker,
      values: [tag5.value],
    })

    // query

    await expect(tagRepository.queryStatus({
      stickerSetName: set1,
    })).resolves.toIncludeSameMembers([sticker1, sticker2])

    await expect(tagRepository.queryStatus({
      stickerSetName: set2,
    })).resolves.toIncludeSameMembers([sticker3, sticker4])

    await expect(tagRepository.queryStatus({
      stickerSetName: generateId('set-3'),
    })).resolves.toEqual([])

    // search

    await expect(tagRepository.search({
      limit: 100,
      query: 'hey'
    })).resolves.toEqual([])

    await expect(tagRepository.search({
      limit: 100,
      query: 'it is',
      authorUserId: user1,
    })).resolves.toEqual([])

    await expect(tagRepository.search({
      limit: 100,
      query: 'hello'
    })).resolves.toIncludeSameMembers([tag1, tag2])

    await expect(tagRepository.search({
      limit: 100,
      query: 'there'
    })).resolves.toIncludeSameMembers([tag3])

    await expect(tagRepository.search({
      limit: 100,
      query: 'hello',
      authorUserId: user1,
    })).resolves.toIncludeSameMembers([tag1])

    await expect(tagRepository.search({
      limit: 100,
      query: 'hello',
      authorUserId: user2,
    })).resolves.toIncludeSameMembers([tag2])

    await expect(tagRepository.search({
      limit: 100,
      query: 'reuse',
    })).resolves.toIncludeSameMembers([tag4, tag5])
  })
})
