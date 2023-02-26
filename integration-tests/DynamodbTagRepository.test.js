import './setup.js'
import { randomBytes } from 'crypto'
import { DynamodbTagRepository } from '../src/tags/DynamodbTagRepository.js'
import { Tag } from '../src/tags/Tag.js'
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
    const user1 = generateId('user')
    const user2 = generateId('user')
    const sticker1 = generateId('sticker')
    const sticker2 = generateId('sticker')
    const sticker3 = generateId('sticker')
    const sticker4 = generateId('sticker')

    const tag1 = new Tag({
      stickerSetName: generateId('sticker-set'),
      stickerFileId: sticker1,
      authorUserId: user1,
      value: 'hello world',
    })

    const tag2 = new Tag({
      stickerSetName: generateId('sticker-set'),
      stickerFileId: sticker2,
      authorUserId: user2,
      value: 'hello there',
    })

    const tag3 = new Tag({
      stickerSetName: generateId('sticker-set'),
      stickerFileId: sticker3,
      authorUserId: user2,
      value: 'there it is',
    })

    const tag4 = new Tag({
      stickerSetName: generateId('sticker-set'),
      stickerFileId: sticker4,
      authorUserId: user1,
      value: 'reuse 1',
    })

    const tag5 = new Tag({
      stickerSetName: generateId('sticker-set'),
      stickerFileId: sticker4,
      authorUserId: user2,
      value: 'reuse 2',
    })

    // store

    await tagRepository.storeTag(tag1)
    await tagRepository.storeTag(tag2)
    await tagRepository.storeTag(tag3)

    await tagRepository.storeTag(
      new Tag({
        stickerSetName: generateId('sticker-set'),
        stickerFileId: sticker4,
        authorUserId: user1,
        value: 'reuse 1 to be overwritten',
      })
    )

    await tagRepository.storeTag(
      new Tag({
        stickerSetName: generateId('sticker-set'),
        stickerFileId: sticker4,
        authorUserId: user2,
        value: 'reuse 2 to be overwritten',
      })
    )

    await tagRepository.storeTag(tag4)
    await tagRepository.storeTag(tag5)

    // query

    await expect(tagRepository.queryTags({
      stickerFileIds: [sticker1, sticker3]
    })).resolves.toIncludeSameMembers([tag1, tag3])

    await expect(tagRepository.queryTags({
      stickerFileIds: [sticker2]
    })).resolves.toIncludeSameMembers([tag2])
    
    await expect(tagRepository.queryTags({
      stickerFileIds: [sticker1, sticker2, sticker3], authorUserId: user1
    })).resolves.toIncludeSameMembers([tag1])

    await expect(tagRepository.queryTags({
      stickerFileIds: [sticker1, sticker2, sticker3], authorUserId: user2
    })).resolves.toIncludeSameMembers([tag2, tag3])

    await expect(tagRepository.queryTags({
      stickerFileIds: [sticker4]
    })).resolves.toIncludeSameMembers([tag4, tag5])

    // search

    await expect(tagRepository.searchTags({
      query: 'hey'
    })).resolves.toEqual([])

    await expect(tagRepository.searchTags({
      query: 'it is',
      authorUserId: user1,
    })).resolves.toEqual([])

    await expect(tagRepository.searchTags({
      query: 'hello'
    })).resolves.toIncludeSameMembers([tag1, tag2])

    await expect(tagRepository.searchTags({
      query: 'there'
    })).resolves.toIncludeSameMembers([tag2, tag3])

    await expect(tagRepository.searchTags({
      query: 'it is'
    })).resolves.toIncludeSameMembers([tag3])

    await expect(tagRepository.searchTags({
      query: 'hello',
      authorUserId: user1,
    })).resolves.toIncludeSameMembers([tag1])

    await expect(tagRepository.searchTags({
      query: 'hello',
      authorUserId: user2,
    })).resolves.toIncludeSameMembers([tag2])

    await expect(tagRepository.searchTags({
      query: 'reuse',
    })).resolves.toIncludeSameMembers([tag4, tag5])
  })
})
