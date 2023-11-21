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
          'hm.',
          'hello world !',
          'world !',
          '!',
          'what\'s up?',
          'up?',
        ])
      
      expect(parseTagValues('Cute little tiny foxy,cute fox, little fox\ncute animal'))
        .toEqual([
          'cute little tiny foxy',
          'little tiny foxy',
          'tiny foxy',
          'foxy',
          'cute fox',
          'fox',
          'little fox',
          'cute animal',
          'animal',
        ])
    })
  })
})
