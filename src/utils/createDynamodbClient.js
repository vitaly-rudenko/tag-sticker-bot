import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { localstackEndpoint } from '../env.js'

export function createDynamodbClient() {
  return new DynamoDBClient({ endpoint: localstackEndpoint })
}