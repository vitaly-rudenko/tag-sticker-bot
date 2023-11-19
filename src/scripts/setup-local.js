import { dynamodbQueuedStickersTable, dynamodbTagsTable, dynamodbUserSessionsTable } from '../env.js'
import { BillingMode, CreateTableCommand, DeleteTableCommand, DescribeTimeToLiveCommand, UpdateTimeToLiveCommand } from '@aws-sdk/client-dynamodb'
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
    BillingMode: BillingMode.PROVISIONED,
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
      AttributeName: 'uid',
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: 'uid',
      AttributeType: 'S'
    }, {
      AttributeName: 'user',
      AttributeType: 'S'
    }],
    BillingMode: BillingMode.PROVISIONED,
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
      AttributeName: 'uid',
      KeyType: 'HASH'
    }, {
      AttributeName: 'author',
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: 'uid',
      AttributeType: 'S'
    }, {
      AttributeName: 'author',
      AttributeType: 'S'
    }],
    BillingMode: BillingMode.PROVISIONED,
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    }
  })
)
