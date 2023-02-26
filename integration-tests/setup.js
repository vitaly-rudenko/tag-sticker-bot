import { config } from 'dotenv'
import { toIncludeSameMembers } from 'jest-extended'

expect.extend({ toIncludeSameMembers })
config()
