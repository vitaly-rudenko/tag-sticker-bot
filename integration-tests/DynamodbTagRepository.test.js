import './setup.js'
import { randomBytes } from 'crypto'
import { DynamodbTagRepository } from '../src/tags/DynamodbTagRepository.js'
import { createDynamodbClient } from '../src/utils/createDynamodbClient.js'
import { dynamodbTagsTable } from '../src/env.js'

function generateId(name) {
  return `${name}-${randomBytes(8).toString('hex')}`
}

function withSetName(sticker, setName) {
  return { ...sticker, set_name: setName }
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
    const stickerId1 = generateId('sticker-1')
    const stickerId2 = generateId('sticker-2')
    const stickerId3 = generateId('sticker-3')
    const stickerId4 = generateId('sticker-4')
    const stickerId5 = generateId('sticker-5')

    const sticker1 = { file_unique_id: stickerId1, file_id: generateId('file-id') }
    const sticker2 = { file_unique_id: stickerId2, file_id: generateId('file-id') }
    const sticker3 = { file_unique_id: stickerId3, file_id: generateId('file-id') }
    const sticker4 = { file_unique_id: stickerId4, file_id: generateId('file-id') }
    const sticker5 = { file_unique_id: stickerId5, file_id: generateId('file-id') }

    await tagRepository.store({
      isPrivate: false,
      sticker: withSetName(sticker1, set1),
      authorUserId: user1,
      values: ['hello world'],
    })

    await tagRepository.store({
      isPrivate: false,
      sticker: withSetName(sticker2, set1),
      authorUserId: user2,
      values: ['hello there'],
    })

    await tagRepository.store({
      isPrivate: false,
      sticker: withSetName(sticker3, set2),
      authorUserId: user2,
      values: ['there it is'],
    })

    await tagRepository.store({
      isPrivate: false,
      sticker: withSetName(sticker4, set2),
      authorUserId: user1,
      values: ['reuse 1 to be overwritten'],
    })

    await tagRepository.store({
      isPrivate: false,
      sticker: withSetName(sticker4, set2),
      authorUserId: user2,
      values: ['reuse 2 to be overwritten'],
    })

    await tagRepository.store({
      isPrivate: false,
      sticker: withSetName(sticker4, set2),
      authorUserId: user1,
      values: ['reuse 1'],
    })

    await tagRepository.store({
      isPrivate: false,
      sticker: withSetName(sticker4, set2),
      authorUserId: user2,
      values: ['reuse 2'],
    })

    await tagRepository.store({
      isPrivate: false,
      sticker: sticker5,
      authorUserId: user2,
      values: ['setless sticker'],
    })

    // query

    await expect(tagRepository.queryStatus({
      ownedOnly: false,
      authorUserId: user1,
      stickerSetName: set1,
    })).resolves.toEqual(new Set([stickerId1, stickerId2]))

    await expect(tagRepository.queryStatus({
      ownedOnly: false,
      authorUserId: user1,
      stickerSetName: set2,
    })).resolves.toEqual(new Set([stickerId3, stickerId4]))

    await expect(tagRepository.queryStatus({
      ownedOnly: false,
      authorUserId: user1,
      stickerSetName: generateId('set-3'),
    })).resolves.toEqual(new Set())

    // search

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'hey'
    })).resolves.toEqual({
      searchResults: [],
      includesOwnedStickers: false
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'it is',
    })).resolves.toEqual({
      searchResults: [],
      includesOwnedStickers: false
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'hello'
    })).resolves.toEqual({
      searchResults: [sticker1, sticker2],
      includesOwnedStickers: true,
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'there'
    })).resolves.toEqual({
      searchResults: [sticker3],
      includesOwnedStickers: false,
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: true,
      limit: 100,
      query: 'hello',
    })).resolves.toEqual({
      searchResults: [sticker1],
      includesOwnedStickers: true,
    })

    await expect(tagRepository.search({
      authorUserId: user2,
      ownedOnly: true,
      limit: 100,
      query: 'hello',
    })).resolves.toEqual({
      searchResults: [sticker2],
      includesOwnedStickers: true,
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'reuse',
    })).resolves.toEqual({
      searchResults: [sticker4],
      includesOwnedStickers: true,
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'set',
    })).resolves.toEqual({
      searchResults: [sticker5],
      includesOwnedStickers: false,
    })
  })

  it('should handle private tags', async () => {
    const userId1 = generateId('user-1')
    const userId2 = generateId('user-2')
    const userId3 = generateId('user-3')
    const setName = generateId('set')
    const stickerId1 = generateId('sticker-1')
    const stickerId2 = generateId('sticker-2')
    const stickerId3 = generateId('sticker-3')
    const stickerId4 = generateId('sticker-4')

    const sticker1 = { file_id: generateId('file-id'), file_unique_id: stickerId1 }
    const sticker2 = { file_id: generateId('file-id'), file_unique_id: stickerId2 }
    const sticker3 = { file_id: generateId('file-id'), file_unique_id: stickerId3 }
    const sticker4 = { file_id: generateId('file-id'), file_unique_id: stickerId4 }

    await tagRepository.store({
      sticker: withSetName(sticker1, setName),
      authorUserId: userId1,
      isPrivate: true,
      values: ['sticker-1'],
    })

    await tagRepository.store({
      sticker: withSetName(sticker2, setName),
      authorUserId: userId1,
      isPrivate: false,
      values: ['sticker-2'],
    })

    await tagRepository.store({
      sticker: withSetName(sticker3, setName),
      authorUserId: userId2,
      isPrivate: false,
      values: ['sticker-3'],
    })

    await tagRepository.store({
      sticker: withSetName(sticker4, setName),
      authorUserId: userId2,
      isPrivate: true,
      values: ['sticker-4'],
    })

    // search

    expect(tagRepository.search({
      query: 'sticker',
      ownedOnly: false,
      authorUserId: userId1,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [sticker1, sticker2, sticker3],
      includesOwnedStickers: true
    })

    expect(tagRepository.search({
      query: 'sticker',
      ownedOnly: false,
      authorUserId: userId2,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [sticker3, sticker4, sticker2],
      includesOwnedStickers: true
    })

    expect(tagRepository.search({
      query: 'sticker',
      ownedOnly: true,
      authorUserId: userId1,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [sticker1, sticker2],
      includesOwnedStickers: true
    })

    expect(tagRepository.search({
      query: 'sticker',
      ownedOnly: true,
      authorUserId: userId2,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [sticker3, sticker4],
      includesOwnedStickers: true
    })

    expect(tagRepository.search({
      query: 'sticker',
      ownedOnly: false,
      authorUserId: userId3,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [sticker2, sticker3],
      includesOwnedStickers: false
    })

    expect(tagRepository.search({
      query: 'sticker',
      ownedOnly: true,
      authorUserId: userId3,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [],
      includesOwnedStickers: false
    })

    // query

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId1,
      ownedOnly: false,
    })).resolves.toEqual(new Set([stickerId1, stickerId2, stickerId3]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId1,
      ownedOnly: true,
    })).resolves.toEqual(new Set([stickerId1, stickerId2]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId2,
      ownedOnly: false,
    })).resolves.toEqual(new Set([stickerId2, stickerId3, stickerId4]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId2,
      ownedOnly: true,
    })).resolves.toEqual(new Set([stickerId3, stickerId4]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId3,
      ownedOnly: false,
    })).resolves.toEqual(new Set([stickerId2, stickerId3]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId3,
      ownedOnly: true,
    })).resolves.toEqual(new Set([]))
  })

  it('should handle high throughput for store()', async () => {
    const authorUserId = generateId('user')
    const sticker = {
      file_id: generateId('file'),
      file_unique_id: generateId('unique'),
      set_name: generateId('set'),
    }

    await tagRepository.store({
      isPrivate: false,
      authorUserId,
      sticker,
      values: Array.from(new Array(25), () => generateId('value')),
    })

    await tagRepository.store({
      isPrivate: false,
      authorUserId,
      sticker,
      values: Array.from(new Array(25), () => generateId('value')),
    })
  })
})
