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
    const sticker5 = generateId('sticker-5')

    const tag1 = {
      sticker: {
        set_name: set1,
        file_unique_id: sticker1,
        file_id: generateId('sticker'),
      },
      authorUserId: user1,
      value: 'hello world',
    }

    const tag2 = {
      sticker: {
        set_name: set1,
        file_unique_id: sticker2,
        file_id: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'hello there',
    }

    const tag3 = {
      sticker: {
        set_name: set2,
        file_unique_id: sticker3,
        file_id: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'there it is',
    }

    const tag4 = {
      sticker: {
        set_name: set2,
        file_unique_id: sticker4,
        file_id: generateId('sticker'),
      },
      authorUserId: user1,
      value: 'reuse 1',
    }

    const tag5 = {
      sticker: {
        set_name: set2,
        file_unique_id: sticker4,
        file_id: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'reuse 2',
    }

    const tag6 = {
      sticker: {
        file_unique_id: sticker5,
        file_id: generateId('sticker'),
      },
      authorUserId: user2,
      value: 'setless sticker',
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
        set_name: set2,
        file_unique_id: sticker4,
        file_id: generateId('sticker'),
      },
      authorUserId: user1,
      values: ['reuse 1 to be overwritten'],
    })

    await tagRepository.store({
      sticker: {
        set_name: set2,
        file_unique_id: sticker4,
        file_id: generateId('sticker'),
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

    await tagRepository.store({
      authorUserId: tag6.authorUserId,
      sticker: tag6.sticker,
      values: [tag6.value],
    })

    // query

    await expect(tagRepository.queryStatus({
      stickerSetName: set1,
    })).resolves.toEqual(new Set([sticker1, sticker2]))

    await expect(tagRepository.queryStatus({
      stickerSetName: set2,
    })).resolves.toEqual(new Set([sticker3, sticker4]))

    await expect(tagRepository.queryStatus({
      stickerSetName: generateId('set-3'),
    })).resolves.toEqual(new Set())

    // search

    await expect(tagRepository.search({
      limit: 100,
      query: 'hey'
    })).resolves.toEqual({ stickers: [], stickerSetNames: new Set() })

    await expect(tagRepository.search({
      limit: 100,
      query: 'it is',
      authorUserId: user1,
    })).resolves.toEqual({ stickers: [], stickerSetNames: new Set() })

    await expect((await tagRepository.search({
      limit: 100,
      query: 'hello'
    })).stickers).toIncludeSameMembers([
      { file_id: tag1.sticker.file_id, file_unique_id: tag1.sticker.file_unique_id },
      { file_id: tag2.sticker.file_id, file_unique_id: tag2.sticker.file_unique_id },
    ])

    await expect((await tagRepository.search({
      limit: 100,
      query: 'there'
    })).stickers).toIncludeSameMembers([{ file_id: tag3.sticker.file_id, file_unique_id: tag3.sticker.file_unique_id }])

    await expect((await tagRepository.search({
      limit: 100,
      query: 'hello',
      authorUserId: user1,
    })).stickers).toIncludeSameMembers([{ file_id: tag1.sticker.file_id, file_unique_id: tag1.sticker.file_unique_id }])

    await expect((await tagRepository.search({
      limit: 100,
      query: 'hello',
      authorUserId: user2,
    })).stickers).toIncludeSameMembers([{ file_id: tag2.sticker.file_id, file_unique_id: tag2.sticker.file_unique_id }])

    await expect((await tagRepository.search({
      limit: 100,
      query: 'reuse',
    })).stickers).toIncludeSameMembers([{ file_id: tag4.sticker.file_id, file_unique_id: tag4.sticker.file_unique_id }])

    await expect((await tagRepository.search({
      limit: 100,
      query: 'set',
    })).stickers).toIncludeSameMembers([{ file_id: tag6.sticker.file_id, file_unique_id: tag6.sticker.file_unique_id }])
  })

  it('should handle high throughput for store()', async () => {
    const authorUserId = generateId('user')
    const sticker = {
      file_id: generateId('file'),
      file_unique_id: generateId('unique'),
      set_name: generateId('set'),
    }

    await tagRepository.store({
      authorUserId,
      sticker,
      values: Array.from(new Array(25), () => generateId('value')),
    })

    await tagRepository.store({
      authorUserId,
      sticker,
      values: Array.from(new Array(25), () => generateId('value')),
    })
  })
})
