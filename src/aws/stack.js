import * as url from 'url'
import * as path from 'path'
import * as fs from 'fs'
import * as cdk from 'aws-cdk-lib'
import { telegramBotToken, environment, debugChatId } from './env.js'

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
    const queuedStickersTable = this.createQueuedStickersTable()

    const restApiLambda = new cdk.aws_lambda.Function(this, 'restApiLambda', {
      functionName: `${appName}-${environment}-rest-api`,
      code: cdk.aws_lambda.Code.fromAsset(path.join(root, 'dist', 'rest-api')),
      handler: 'index.handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(1),
      environment: {
        VERSION: version,
        ENVIRONMENT: environment,
        TELEGRAM_BOT_TOKEN: telegramBotToken,
        DYNAMODB_USER_SESSIONS_TABLE: userSessionsTable.tableName,
        DYNAMODB_TAGS_TABLE: tagsTable.tableName,
        DYNAMODB_QUEUED_STICKERS_TABLE: queuedStickersTable.tableName,
        DEBUG_CHAT_ID: debugChatId,
      },
    })

    for (const table of [userSessionsTable, tagsTable, queuedStickersTable]) {
      table.grantReadWriteData(restApiLambda)
    }

    const lambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(restApiLambda)

    const restApi = new cdk.aws_apigateway.RestApi(this, 'restApi', {
      restApiName: `${appName}-${environment}-rest-api`,
      deployOptions: {
        stageName: environment,
      }
    })

    restApi.root.addResource('health').addMethod('GET', lambdaIntegration)
    restApi.root.addResource('webhook').addMethod('POST', lambdaIntegration)
    if (!isProduction) restApi.root.addResource('debug').addMethod('GET', lambdaIntegration)

    const healthUrl = `${restApi.url}health`
    const webhookUrl = `${restApi.url}webhook`
    const debugUrl = `${restApi.url}debug`

    const setWebhookLambda = new cdk.aws_lambda.Function(this, 'setWebhookLambda', {
      functionName: `${appName}-${environment}-set-webhook`,
      code: cdk.aws_lambda.Code.fromAsset(path.join(root, 'dist', 'set-webhook')),
      handler: 'index.handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(1),
      environment: {
        VERSION: version,
        ENVIRONMENT: environment,
        TELEGRAM_BOT_TOKEN: telegramBotToken,
        WEBHOOK_URL: webhookUrl,
        DEBUG_CHAT_ID: debugChatId,
      },
    })

    new cdk.triggers.Trigger(this, 'setWebhookTrigger', {
      handler: setWebhookLambda,
      invocationType: cdk.triggers.InvocationType.REQUEST_RESPONSE,
      timeout: cdk.Duration.minutes(1),
    })

    new cdk.CfnOutput(this, 'healthUrl', { value: healthUrl })
    new cdk.CfnOutput(this, 'webhookUrl', { value: webhookUrl })
    if (!isProduction) new cdk.CfnOutput(this, 'debugUrl', { value: debugUrl })
  }

  createTagsTable() {
    return new cdk.aws_dynamodb.Table(this, 'tagsTable', {
      tableName: `${appName}-${environment}-tags`,
      partitionKey: { name: 'fuid', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'author', type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: isProduction
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      contributorInsightsEnabled: true,
    })
  }

  createUserSessionsTable() {
    return new cdk.aws_dynamodb.Table(this, 'userSessionsTable', {
      tableName: `${appName}-${environment}-user-sessions`,
      partitionKey: { name: 'user', type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'exp',
    })
  }

  createQueuedStickersTable() {
    return new cdk.aws_dynamodb.Table(this, 'queuedStickersTable', {
      tableName: `${appName}-${environment}-queued-stickers`,
      partitionKey: { name: 'user', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'fuid', type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'exp',
    })
  }
}

const app = new cdk.App()
new TagStickerBotStack(app, `${appName}-${environment}`)
app.synth()
