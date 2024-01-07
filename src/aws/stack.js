import url from 'url'
import path from 'path'
import fs from 'fs'
import cdk from 'aws-cdk-lib'

import { telegramBotToken, environment, debugChatId, webhookSecretToken, inlineQueryCacheTimeS } from './stack-env.js'
import { userSessionAttributes } from '../users/attributes.js'
import { tagAttributes } from '../tags/attributes.js'
import { QUERY_STATUS_INDEX, SEARCH_BY_VALUE_AND_AUTHOR_INDEX, SEARCH_BY_VALUE_INDEX } from '../tags/indexes.js'
import { favoriteAttributes } from '../favorites/attributes.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), { encoding: 'utf-8' }))

const appName = 'tsb'
const version = packageJson.version
const isProduction = environment === 'prod'

export class TagStickerBotStack extends cdk.Stack {
  /**
   * @param {cdk.App} app
   * @param {string} id
   */
  constructor(app, id) {
    super(app, id)

    const userSessionsTable = this.createUserSessionsTable()
    const tagsTable = this.createTagsTable()
    const favoritesTable = this.createFavoritesTable()

    const restApiLambda = new cdk.aws_lambda.Function(this, 'restApiLambda', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(root, 'dist', 'rest-api')),
      handler: 'index.handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(1),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      environment: {
        VERSION: version,
        ENVIRONMENT: environment,
        TELEGRAM_BOT_TOKEN: telegramBotToken,
        INLINE_QUERY_CACHE_TIME_S: inlineQueryCacheTimeS,
        WEBHOOK_SECRET_TOKEN: webhookSecretToken,
        DYNAMODB_USER_SESSIONS_TABLE: userSessionsTable.tableName,
        DYNAMODB_TAGS_TABLE: tagsTable.tableName,
        DYNAMODB_FAVORITES_TABLE: favoritesTable.tableName,
        DEBUG_CHAT_ID: debugChatId,
      },
    })

    for (const table of [userSessionsTable, tagsTable, favoritesTable]) {
      table.grantReadWriteData(restApiLambda)
    }

    const lambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(restApiLambda)

    const restApi = new cdk.aws_apigateway.RestApi(this, 'restApi', {
      restApiName: `${appName}-${environment}-rest-api`,
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: 5,
        throttlingBurstLimit: 50,
      }
    })

    restApi.root.addResource('health').addMethod('GET', lambdaIntegration)
    restApi.root.addResource('webhook').addMethod('POST', lambdaIntegration)
    if (!isProduction) restApi.root.addResource('debug').addMethod('GET', lambdaIntegration)

    const healthUrl = `${restApi.url}health`
    const webhookUrl = `${restApi.url}webhook`
    const debugUrl = `${restApi.url}debug`

    const initLambda = new cdk.aws_lambda.Function(this, 'initLambda', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(root, 'dist', 'init')),
      handler: 'index.handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(1),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      environment: {
        TELEGRAM_BOT_TOKEN: telegramBotToken,
        WEBHOOK_URL: webhookUrl,
        WEBHOOK_SECRET_TOKEN: webhookSecretToken,
      },
    })

    new cdk.triggers.Trigger(this, 'initTrigger', {
      handler: initLambda,
      invocationType: cdk.triggers.InvocationType.REQUEST_RESPONSE,
      timeout: cdk.Duration.minutes(1),
    })

    new cdk.CfnOutput(this, 'healthUrl', { value: healthUrl })
    new cdk.CfnOutput(this, 'webhookUrl', { value: webhookUrl })
    if (!isProduction) new cdk.CfnOutput(this, 'debugUrl', { value: debugUrl })
  }

  createTagsTable() {
    const table = new cdk.aws_dynamodb.Table(this, 'tagsTable', {
      partitionKey: {
        name: tagAttributes.tagId,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: tagAttributes.value,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 2,
      writeCapacity: 2,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProduction,
    })

    table.addGlobalSecondaryIndex({
      indexName: SEARCH_BY_VALUE_INDEX,
      partitionKey: {
        name: tagAttributes.valuePartition,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: tagAttributes.value,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [tagAttributes.stickerFileUniqueId, tagAttributes.stickerFileId],
      readCapacity: 2,
      writeCapacity: 2,
    })

    table.addGlobalSecondaryIndex({
      indexName: SEARCH_BY_VALUE_AND_AUTHOR_INDEX,
      partitionKey: {
        name: tagAttributes.authorUserId,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: tagAttributes.value,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [tagAttributes.stickerFileUniqueId, tagAttributes.stickerFileId],
      readCapacity: 2,
      writeCapacity: 2,
    })

    table.addGlobalSecondaryIndex({
      indexName: QUERY_STATUS_INDEX,
      partitionKey: {
        name: tagAttributes.stickerSetName,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: tagAttributes.authorUserId,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [tagAttributes.stickerFileUniqueId, tagAttributes.isPrivate],
      readCapacity: 2,
      writeCapacity: 2,
    })

    return table
  }

  createFavoritesTable() {
    return new cdk.aws_dynamodb.Table(this, 'favoritesTable', {
      partitionKey: {
        name: favoriteAttributes.userId,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: favoriteAttributes.stickerFileUniqueId,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 2,
      writeCapacity: 2,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProduction,
    })
  }

  createUserSessionsTable() {
    return new cdk.aws_dynamodb.Table(this, 'userSessionsTable', {
      partitionKey: {
        name: userSessionAttributes.userId,
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 2,
      writeCapacity: 2,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: userSessionAttributes.expiresAt,
    })
  }
}

const app = new cdk.App()
new TagStickerBotStack(app, `${appName}-${environment}`)
app.synth()
