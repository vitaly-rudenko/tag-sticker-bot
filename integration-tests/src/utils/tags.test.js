import { normalizeTagValue, parseTagValues } from '../../../src/utils/tags.js'

describe('tags', () => {
  describe('normalizeTagValue()', () => {
    it('should normalize the value', () => {
      expect(normalizeTagValue('Hm.\nHello     world !       \nWhat\'s up?    \n123:!'))
        .toEqual('hm hello world whats up 123')
    })
  })

  describe('parseTagValues()', () => {
    it('should parse the value', () => {
      expect(parseTagValues('Hm.\nHello     world !       \nWhat\'s up?    \n123:!'))
        .toEqual([
          'hm',
          'hello world',
          'world',
          'whats up',
          'up',
          '123',
        ])
      
      expect(parseTagValues('Є_ї.\nПривіт     світе !       \nЯк справи?    \n123:!'))
        .toEqual([
          'єї',
          'привіт світе',
          'світе',
          'як справи',
          'справи',
          '123',
        ])

      expect(parseTagValues('Ыэ_ъё.\nПривет     мир !       \nКак дела?    \n123:!'))
        .toEqual([
          'ыэъё',
          'привет мир',
          'мир',
          'как дела',
          'дела',
          '123',
        ])
      
      expect(parseTagValues('Cute little tiny foxy,cute fox, little fox\ncute animal\nanimals are the cutest!'))
        .toEqual([
          'cute little tiny foxy',
          'little tiny foxy',
          'tiny foxy',
          'foxy',
          'cute fox',
          'little fox',
          'cute animal',
          'animals are the cutest',
          'are the cutest',
          'the cutest',
          'cutest'
        ])

      expect(parseTagValues('hello, hello world, hello there, hello worldy'))
        .toEqual([
          'hello there',
          'there',
          'hello worldy',
          'worldy',
        ])
      
      expect(parseTagValues('hello, hello, hello, hello world, hello world, hello world'))
        .toEqual([
          'hello world',
          'world',
        ])
    })
  })
})
