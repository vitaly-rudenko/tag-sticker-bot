import { API } from 'lambda-api'
import { health } from './health.js'
import { webhook } from './webhook.js'

const api = new API()

api.get('/health', health)
api.get('/webhook', webhook)

// https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-example-event
export async function handler(event, context) {
  return api.run(event, context)
}
