import { normalizeTagValue, parseTagValues } from '../../../src/utils/tags.js'

describe('tags', () => {
  describe('normalizeTagValue()', () => {
    it('should normalize the value', () => {
      expect(normalizeTagValue('Hm.\nHello     world !       \nWhat\'s up?    \n'))
        .toEqual('hm. hello world ! what\'s up?')
    })
  })

  describe('parseTagValues()', () => {
    it('should parse the value', () => {
      expect(parseTagValues('Hm.\nHello     world !       \nWhat\'s up?    \n'))
        .toEqual([
          'hm. hello world ! what\'s up?',
          'hello world ! what\'s up?',
          'world ! what\'s up?',
          '! what\'s up?',
          'what\'s up?',
          'up?',
        ])
    })
  })
})
