import * as url from 'url'
import * as path from 'path'
import * as cdk from 'aws-cdk-lib'
import { telegramBotToken } from '../env.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', '..')

export class TagStickerBotStack extends cdk.Stack {
  /**
   * @param {cdk.App} app 
   * @param {string} id 
   */
  constructor(app, id) {
    super(app, id)

    const userSessionsTable = this.createUserSessionsTable()
    const tagsTable = this.createTagsTable()
    const queuedStickersTable = this.createQueuedStickersTable()

    const lambda = new cdk.aws_lambda.Function(this, 'lambda', {
      functionName: 'tsb-dev-lambda',
      code: cdk.aws_lambda.Code.fromAsset(path.join(root, 'dist')),
      handler: 'lambda.handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      environment: {
        TELEGRAM_BOT_TOKEN: telegramBotToken,
        DYNAMODB_USER_SESSIONS_TABLE: userSessionsTable.tableName,
        DYNAMODB_TAGS_TABLE: tagsTable.tableName,
        DYNAMODB_QUEUED_STICKERS_TABLE: queuedStickersTable.tableName,
      },
    })

    for (const table of [userSessionsTable, tagsTable, queuedStickersTable]) {
      table.grantReadWriteData(lambda)
    }

    const lambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(lambda)

    const api = new cdk.aws_apigateway.RestApi(this, 'restApi', {
      restApiName: 'tsb-dev-rest-api',
    })

    api.root.addResource('health').addMethod('GET', lambdaIntegration)
    api.root.addResource('webhook').addMethod('POST', lambdaIntegration)
  }

  createUserSessionsTable() {
    return new cdk.aws_dynamodb.Table(this, 'userSessionsTable', {
      tableName: 'tsb-dev-user-sessions',
      partitionKey: { name: 'userId', type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })
  }

  createTagsTable() {
    return new cdk.aws_dynamodb.Table(this, 'tagsTable', {
      tableName: 'tsb-dev-tags',
      partitionKey: { name: 'stickerFileUniqueId', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'authorUserId', type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })
  }

  createQueuedStickersTable() {
    return new cdk.aws_dynamodb.Table(this, 'queuedStickersTable', {
      tableName: 'tsb-dev-queued-stickers',
      partitionKey: { name: 'userId', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'stickerFileUniqueId', type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })
  }
}

const app = new cdk.App()
new TagStickerBotStack(app, 'TagStickerBot')
app.synth()
