import { dynamodbQueuedStickersTable, dynamodbTagsTable, dynamodbUserSessionsTable } from '../env.js'
import { CreateTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb'
import { createDynamodbClient } from '../utils/createDynamodbClient.js'

const dynamodbClient = createDynamodbClient()

await dynamodbClient.send(new DeleteTableCommand({ TableName: dynamodbUserSessionsTable })).catch(() => {})
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: dynamodbUserSessionsTable,
    KeySchema: [{
      AttributeName: 'userId',
      KeyType: 'HASH'
    }],
    AttributeDefinitions: [{
      AttributeName: 'userId',
      AttributeType: 'S'
    }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    }
  })
)

await dynamodbClient.send(new DeleteTableCommand({ TableName: dynamodbQueuedStickersTable })).catch(() => {})
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: dynamodbQueuedStickersTable,
    KeySchema: [{
      AttributeName: 'userId',
      KeyType: 'HASH'
    }, {
      AttributeName: 'stickerFileId',
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: 'stickerFileId',
      AttributeType: 'S'
    }, {
      AttributeName: 'userId',
      AttributeType: 'S'
    }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    }
  })
)

await dynamodbClient.send(new DeleteTableCommand({ TableName: dynamodbTagsTable })).catch(() => {})
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: dynamodbTagsTable,
    KeySchema: [{
      AttributeName: 'stickerFileId',
      KeyType: 'HASH'
    }, {
      AttributeName: 'authorUserId',
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: 'stickerFileId',
      AttributeType: 'S'
    }, {
      AttributeName: 'authorUserId',
      AttributeType: 'S'
    }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    },
    GlobalSecondaryIndexes: [
      {
        IndexName: 'stickerFileId',
        KeySchema: [
          { AttributeName: 'stickerFileId', KeyType: 'HASH' },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        }
      }
    ]
  })
)
