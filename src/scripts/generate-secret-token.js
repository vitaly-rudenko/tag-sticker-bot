import { randomBytes } from 'crypto'

const bytes = randomBytes(128)
const secretToken = bytes.toString('hex')

if (secretToken.length !== 256) {
  throw new Error('Invalid token length')
}

console.log(secretToken)
