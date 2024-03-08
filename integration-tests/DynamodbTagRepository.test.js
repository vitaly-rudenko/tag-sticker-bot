import './setup.js'
import { randomBytes } from 'crypto'
import { DynamodbTagRepository } from '../src/tags/DynamodbTagRepository.js'
import { createDynamodbClient } from '../src/utils/createDynamodbClient.js'
import { dynamodbTagsTable } from '../src/env.js'

function generateId(name) {
  return `${name}-${randomBytes(8).toString('hex')}`
}

function withSetName(file, setName) {
  return { ...file, set_name: setName }
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
    const fileId1 = generateId('file-1')
    const fileId2 = generateId('file-2')
    const fileId3 = generateId('file-3')
    const fileId4 = generateId('file-4')
    const fileId5 = generateId('file-5')

    const file1 = { file_unique_id: fileId1, file_id: generateId('file-id') }
    const file2 = { file_unique_id: fileId2, file_id: generateId('file-id') }
    const file3 = { file_unique_id: fileId3, file_id: generateId('file-id') }
    const file4 = { file_unique_id: fileId4, file_id: generateId('file-id') }
    const file5 = { file_unique_id: fileId5, file_id: generateId('file-id') }

    await tagRepository.store({
      isPrivate: false,
      file: withSetName(file1, set1),
      authorUserId: user1,
      values: ['hello world'],
    })

    await tagRepository.store({
      isPrivate: false,
      file: withSetName(file2, set1),
      authorUserId: user2,
      values: ['hello there'],
    })

    await tagRepository.store({
      isPrivate: false,
      file: withSetName(file3, set2),
      authorUserId: user2,
      values: ['there it is'],
    })

    await tagRepository.store({
      isPrivate: false,
      file: withSetName(file4, set2),
      authorUserId: user1,
      values: ['reuse 1 to be overwritten'],
    })

    await tagRepository.store({
      isPrivate: false,
      file: withSetName(file4, set2),
      authorUserId: user2,
      values: ['reuse 2 to be overwritten'],
    })

    await tagRepository.store({
      isPrivate: false,
      file: withSetName(file4, set2),
      authorUserId: user1,
      values: ['reuse 1'],
    })

    await tagRepository.store({
      isPrivate: false,
      file: withSetName(file4, set2),
      authorUserId: user2,
      values: ['reuse 2'],
    })

    await tagRepository.store({
      isPrivate: false,
      file: file5,
      authorUserId: user2,
      values: ['setless file'],
    })

    // query

    await expect(tagRepository.queryStatus({
      ownedOnly: false,
      authorUserId: user1,
      stickerSetName: set1,
    })).resolves.toEqual(new Set([fileId1, fileId2]))

    await expect(tagRepository.queryStatus({
      ownedOnly: false,
      authorUserId: user1,
      stickerSetName: set2,
    })).resolves.toEqual(new Set([fileId3, fileId4]))

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
      includesOwnedFiles: false
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'it is',
    })).resolves.toEqual({
      searchResults: [],
      includesOwnedFiles: false
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'hello'
    })).resolves.toEqual({
      searchResults: [file1, file2],
      includesOwnedFiles: true,
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'there'
    })).resolves.toEqual({
      searchResults: [file3],
      includesOwnedFiles: false,
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: true,
      limit: 100,
      query: 'hello',
    })).resolves.toEqual({
      searchResults: [file1],
      includesOwnedFiles: true,
    })

    await expect(tagRepository.search({
      authorUserId: user2,
      ownedOnly: true,
      limit: 100,
      query: 'hello',
    })).resolves.toEqual({
      searchResults: [file2],
      includesOwnedFiles: true,
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'reuse',
    })).resolves.toEqual({
      searchResults: [file4],
      includesOwnedFiles: true,
    })

    await expect(tagRepository.search({
      authorUserId: user1,
      ownedOnly: false,
      limit: 100,
      query: 'set',
    })).resolves.toEqual({
      searchResults: [file5],
      includesOwnedFiles: false,
    })
  })

  it('should handle private tags', async () => {
    const userId1 = generateId('user-1')
    const userId2 = generateId('user-2')
    const userId3 = generateId('user-3')
    const setName = generateId('set')
    const fileId1 = generateId('file-1')
    const fileId2 = generateId('file-2')
    const fileId3 = generateId('file-3')
    const fileId4 = generateId('file-4')

    const file1 = { file_id: generateId('file-id'), file_unique_id: fileId1 }
    const file2 = { file_id: generateId('file-id'), file_unique_id: fileId2 }
    const file3 = { file_id: generateId('file-id'), file_unique_id: fileId3 }
    const file4 = { file_id: generateId('file-id'), file_unique_id: fileId4 }

    await tagRepository.store({
      file: withSetName(file1, setName),
      authorUserId: userId1,
      isPrivate: true,
      values: ['file-1'],
    })

    await tagRepository.store({
      file: withSetName(file2, setName),
      authorUserId: userId1,
      isPrivate: false,
      values: ['file-2'],
    })

    await tagRepository.store({
      file: withSetName(file3, setName),
      authorUserId: userId2,
      isPrivate: false,
      values: ['file-3'],
    })

    await tagRepository.store({
      file: withSetName(file4, setName),
      authorUserId: userId2,
      isPrivate: true,
      values: ['file-4'],
    })

    // search

    expect(tagRepository.search({
      query: 'file',
      ownedOnly: false,
      authorUserId: userId1,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [file1, file2, file3],
      includesOwnedFiles: true
    })

    expect(tagRepository.search({
      query: 'file',
      ownedOnly: false,
      authorUserId: userId2,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [file3, file4, file2],
      includesOwnedFiles: true
    })

    expect(tagRepository.search({
      query: 'file',
      ownedOnly: true,
      authorUserId: userId1,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [file1, file2],
      includesOwnedFiles: true
    })

    expect(tagRepository.search({
      query: 'file',
      ownedOnly: true,
      authorUserId: userId2,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [file3, file4],
      includesOwnedFiles: true
    })

    expect(tagRepository.search({
      query: 'file',
      ownedOnly: false,
      authorUserId: userId3,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [file2, file3],
      includesOwnedFiles: false
    })

    expect(tagRepository.search({
      query: 'file',
      ownedOnly: true,
      authorUserId: userId3,
      limit: 100,
    })).resolves.toEqual({
      searchResults: [],
      includesOwnedFiles: false
    })

    // query

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId1,
      ownedOnly: false,
    })).resolves.toEqual(new Set([fileId1, fileId2, fileId3]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId1,
      ownedOnly: true,
    })).resolves.toEqual(new Set([fileId1, fileId2]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId2,
      ownedOnly: false,
    })).resolves.toEqual(new Set([fileId2, fileId3, fileId4]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId2,
      ownedOnly: true,
    })).resolves.toEqual(new Set([fileId3, fileId4]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId3,
      ownedOnly: false,
    })).resolves.toEqual(new Set([fileId2, fileId3]))

    await expect(tagRepository.queryStatus({
      stickerSetName: setName,
      authorUserId: userId3,
      ownedOnly: true,
    })).resolves.toEqual(new Set([]))
  })

  it('should properly replace tags with different scopes', async () => {
    const userId1 = generateId('user-1')
    const userId2 = generateId('user-2')
    const fileId1 = generateId('file-1')

    const file = { file_id: generateId('file-id'), file_unique_id: fileId1 }
    const value = generateId('value')

    await tagRepository.store({
      authorUserId: userId1,
      isPrivate: false,
      file,
      values: [value],
    })

    await tagRepository.store({
      authorUserId: userId1,
      isPrivate: true,
      file,
      values: [value],
    })

    await expect(tagRepository.search({
      query: value,
      authorUserId: userId1,
      limit: 100,
      ownedOnly: false
    })).resolves.toEqual({ searchResults: [file], includesOwnedFiles: true })

    await expect(tagRepository.search({
      query: value,
      authorUserId: userId2,
      limit: 100,
      ownedOnly: false
    })).resolves.toEqual({ searchResults: [], includesOwnedFiles: false })

    await tagRepository.store({
      authorUserId: userId1,
      isPrivate: false,
      file,
      values: [value],
    })

    await expect(tagRepository.search({
      query: value,
      authorUserId: userId1,
      limit: 100,
      ownedOnly: false
    })).resolves.toEqual({ searchResults: [file], includesOwnedFiles: true })

    await expect(tagRepository.search({
      query: value,
      authorUserId: userId2,
      limit: 100,
      ownedOnly: false
    })).resolves.toEqual({ searchResults: [file], includesOwnedFiles: false })
  })

  it('should handle high throughput for store()', async () => {
    const authorUserId = generateId('user')
    const file = {
      file_id: generateId('file'),
      file_unique_id: generateId('unique'),
      set_name: generateId('set'),
    }

    await tagRepository.store({
      isPrivate: false,
      authorUserId,
      file,
      values: Array.from(new Array(25), () => generateId('value')),
    })

    await tagRepository.store({
      isPrivate: false,
      authorUserId,
      file,
      values: Array.from(new Array(25), () => generateId('value')),
    })
  })
})
