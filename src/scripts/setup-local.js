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
      AttributeName: 'stickerFileUniqueId',
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: 'stickerFileUniqueId',
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
      AttributeName: 'stickerFileUniqueId',
      KeyType: 'HASH'
    }, {
      AttributeName: 'authorUserId',
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: 'stickerFileUniqueId',
      AttributeType: 'S'
    }, {
      AttributeName: 'authorUserId',
      AttributeType: 'S'
    }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    }
  })
)
