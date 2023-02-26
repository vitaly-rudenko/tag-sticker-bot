import { config } from 'dotenv'
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb'

config()

const dynamodbClient = new DynamoDBClient({
  endpoint: process.env.LOCALSTACK_ENDPOINT,
})

await dynamodbClient.send(new DeleteTableCommand({ TableName: 'queued-stickers' }))
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: 'queued-stickers',
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

await dynamodbClient.send(new DeleteTableCommand({ TableName: 'tags' }))
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: 'tags',
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
    }
  })
)
