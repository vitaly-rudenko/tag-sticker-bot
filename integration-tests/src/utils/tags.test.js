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
          'whats up',
          '123',
          'world',
          'up',
        ])
      
      expect(parseTagValues('Є_ї.\nПривіт     світе !       \nЯк справи?    \n123:!'))
        .toEqual([
          'єї',
          'привіт світе',
          'як справи',
          '123',
          'світе',
          'справи',
        ])

      expect(parseTagValues('Ыэ_ъё.\nПривет     мир !       \nКак дела?    \n123:!'))
        .toEqual([
          'ыэъё',
          'привет мир',
          'как дела',
          '123',
          'мир',
          'дела',
        ])
      
      expect(parseTagValues('Cute little tiny foxy,cute fox, little fox\ncute animal\nanimals are the cutest!'))
        .toEqual([
          'cute little tiny foxy',
          'cute fox',
          'little fox',
          'cute animal',
          'animals are the cutest',
          'little tiny foxy',
          'are the cutest',
          'tiny foxy',
          'the cutest',
          'foxy',
          'cutest'
        ])

      expect(parseTagValues('hello, hello world, hello there, hello worldy'))
        .toEqual([
          'hello there',
          'hello worldy',
          'there',
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
