import { dynamodbQueuedStickersTable, dynamodbTagsTable, dynamodbUserSessionsTable } from '../env.js'
import { CreateTableCommand, DeleteTableCommand, UpdateTimeToLiveCommand } from '@aws-sdk/client-dynamodb'
import { createDynamodbClient } from '../utils/createDynamodbClient.js'

const dynamodbClient = createDynamodbClient()

await dynamodbClient.send(new DeleteTableCommand({ TableName: dynamodbUserSessionsTable })).catch(() => {})
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: dynamodbUserSessionsTable,
    KeySchema: [{
      AttributeName: 'user',
      KeyType: 'HASH'
    }],
    AttributeDefinitions: [{
      AttributeName: 'user',
      AttributeType: 'S'
    }],
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    },
  })
)
await dynamodbClient.send(
  new UpdateTimeToLiveCommand({
    TableName: dynamodbUserSessionsTable,
    TimeToLiveSpecification: {
      AttributeName: 'exp',
      Enabled: true,
    }
  })
)

await dynamodbClient.send(new DeleteTableCommand({ TableName: dynamodbQueuedStickersTable })).catch(() => {})
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: dynamodbQueuedStickersTable,
    KeySchema: [{
      AttributeName: 'user',
      KeyType: 'HASH'
    }, {
      AttributeName: 'fuid',
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: 'user',
      AttributeType: 'S'
    }, {
      AttributeName: 'fuid',
      AttributeType: 'S'
    }],
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    }
  })
)
await dynamodbClient.send(
  new UpdateTimeToLiveCommand({
    TableName: dynamodbQueuedStickersTable,
    TimeToLiveSpecification: {
      AttributeName: 'exp',
      Enabled: true,
    }
  })
)

await dynamodbClient.send(new DeleteTableCommand({ TableName: dynamodbTagsTable })).catch(() => {})
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: dynamodbTagsTable,
    KeySchema: [{
      AttributeName: 'id',
      KeyType: 'HASH'
    }, {
      AttributeName: 'value',
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: 'id',
      AttributeType: 'S'
    }, {
      AttributeName: 'value',
      AttributeType: 'S'
    }, {
      AttributeName: 'author',
      AttributeType: 'S'
    }, {
      AttributeName: 'set',
      AttributeType: 'S'
    }],
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    },
    GlobalSecondaryIndexes: [{
      IndexName: 'search-by-value-index',
      KeySchema: [{
        AttributeName: 'author',
        KeyType: 'HASH'
      }, {
        AttributeName: 'value',
        KeyType: 'RANGE'
      }],
      Projection: {
        ProjectionType: 'ALL',
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      }
    }, {
      IndexName: 'query-status-index',
      KeySchema: [{
        AttributeName: 'set',
        KeyType: 'HASH'
      }, {
        AttributeName: 'author',
        KeyType: 'RANGE'
      }],
      Projection: {
        ProjectionType: 'INCLUDE',
        NonKeyAttributes: ['fuid'],
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      }
    }]
  })
)
