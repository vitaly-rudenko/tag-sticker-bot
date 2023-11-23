import { dynamodbTagsTable, dynamodbUserSessionsTable } from '../env.js'
import { CreateTableCommand, DeleteTableCommand, UpdateTimeToLiveCommand } from '@aws-sdk/client-dynamodb'
import { createDynamodbClient } from '../utils/createDynamodbClient.js'
import { userSessionAttributes } from '../users/attributes.js'
import { tagAttributes } from '../tags/attributes.js'
import { QUERY_STATUS_INDEX, SEARCH_BY_VALUE_AND_AUTHOR_INDEX, SEARCH_BY_VALUE_INDEX } from '../tags/indexes.js'

const dynamodbClient = createDynamodbClient()

await dynamodbClient.send(new DeleteTableCommand({ TableName: dynamodbUserSessionsTable })).catch(() => {})
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: dynamodbUserSessionsTable,
    KeySchema: [{
      AttributeName: userSessionAttributes.userId,
      KeyType: 'HASH'
    }],
    AttributeDefinitions: [{
      AttributeName: userSessionAttributes.userId,
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
      AttributeName: userSessionAttributes.expiresAt,
      Enabled: true,
    }
  })
)

await dynamodbClient.send(new DeleteTableCommand({ TableName: dynamodbTagsTable })).catch(() => {})
await dynamodbClient.send(
  new CreateTableCommand({
    TableName: dynamodbTagsTable,
    KeySchema: [{
      AttributeName: tagAttributes.tagId,
      KeyType: 'HASH'
    }, {
      AttributeName: tagAttributes.value,
      KeyType: 'RANGE'
    }],
    AttributeDefinitions: [{
      AttributeName: tagAttributes.tagId,
      AttributeType: 'S'
    }, {
      AttributeName: tagAttributes.valuePartition,
      AttributeType: 'S'
    }, {
      AttributeName: tagAttributes.value,
      AttributeType: 'S'
    }, {
      AttributeName: tagAttributes.stickerSetName,
      AttributeType: 'S'
    }, {
      AttributeName: tagAttributes.authorUserId,
      AttributeType: 'S'
    }],
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    },
    GlobalSecondaryIndexes: [{
      IndexName: SEARCH_BY_VALUE_INDEX,
      KeySchema: [{
        AttributeName: tagAttributes.valuePartition,
        KeyType: 'HASH'
      }, {
        AttributeName: tagAttributes.value,
        KeyType: 'RANGE'
      }],
      Projection: {
        ProjectionType: 'INCLUDE',
        NonKeyAttributes: [
          tagAttributes.stickerFileUniqueId,
          tagAttributes.stickerFileId,
        ],
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      }
    }, {
      IndexName: SEARCH_BY_VALUE_AND_AUTHOR_INDEX,
      KeySchema: [{
        AttributeName: tagAttributes.authorUserId,
        KeyType: 'HASH'
      }, {
        AttributeName: tagAttributes.value,
        KeyType: 'RANGE'
      }],
      Projection: {
        ProjectionType: 'INCLUDE',
        NonKeyAttributes: [
          tagAttributes.stickerFileUniqueId,
          tagAttributes.stickerFileId,
        ],
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      }
    }, {
      IndexName: QUERY_STATUS_INDEX,
      KeySchema: [{
        AttributeName: tagAttributes.stickerSetName,
        KeyType: 'HASH'
      }, {
        AttributeName: tagAttributes.authorUserId,
        KeyType: 'RANGE'
      }],
      Projection: {
        ProjectionType: 'INCLUDE',
        NonKeyAttributes: [tagAttributes.stickerFileUniqueId],
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      }
    }]
  })
)
