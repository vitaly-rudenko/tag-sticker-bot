import { booleansToBitmap, encodeBitmap, decodeBitmap, getBitmapIndex } from '../../../src/utils/bitmap.js'

describe('bitmap', () => {
  it('should encode and decode bits in partially true array', () => {
    const booleans = Array.from(new Array(200), (_, i) => i % 3 === 0 || i % 5 === 0)
    const bitmap1 = booleansToBitmap(booleans)
    const int = encodeBitmap(bitmap1.bitmap)
    const bitmap2 = decodeBitmap(int, bitmap1.length)
    
    expect(int).toEqual('6uil82z5dpm3kyg394nloyq617my3965d1vlcpe')

    expect(bitmap1.size).toEqual(93)
    expect(bitmap1.length).toEqual(200)
    expect(bitmap1.bitmap).toEqual(bitmap2)
    expect(bitmap2).toEqual(booleans.map(b => b ? 1 : 0).join(''))
    expect(booleans.map((_, i) => bitmap2[i] === '1')).toEqual(booleans)
    expect(getBitmapIndex(bitmap2, 1)).toEqual(0)
    expect(getBitmapIndex(bitmap2, 2)).toEqual(3)
    expect(getBitmapIndex(bitmap2, 3)).toEqual(5)
  })
  
  it('should encode and decode bits in partially false array', () => {
    const booleans = Array.from(new Array(200), (_, i) => !(i % 3 === 0 || i % 5 === 0))
    const bitmap1 = booleansToBitmap(booleans)
    const int = encodeBitmap(bitmap1.bitmap)
    const bitmap2 = decodeBitmap(int, bitmap1.length)
    
    expect(int).toEqual('4t207y22yz0dp80nlnaff1g1fn471e2rblavhpp')

    expect(bitmap1.size).toEqual(107)
    expect(bitmap1.length).toEqual(200)
    expect(bitmap1.bitmap).toEqual(bitmap2)
    expect(bitmap2).toEqual(booleans.map(b => b ? 1 : 0).join(''))
    expect(booleans.map((_, i) => bitmap2[i] === '1')).toEqual(booleans)
    expect(getBitmapIndex(bitmap2, 1)).toEqual(1)
    expect(getBitmapIndex(bitmap2, 2)).toEqual(2)
    expect(getBitmapIndex(bitmap2, 3)).toEqual(4)
  })

  it('should encode and decode bits in fully true array', () => {
    const booleans = new Array(200).fill(true)
    const bitmap1 = booleansToBitmap(booleans)
    const int = encodeBitmap(bitmap1.bitmap)
    const bitmap2 = decodeBitmap(int, bitmap1.length)
    
    expect(int).toEqual('bnklg118comha6gqury14067gur54n8won6guf3')

    expect(bitmap1.size).toEqual(200)
    expect(bitmap1.length).toEqual(200)
    expect(bitmap1.bitmap).toEqual(bitmap2)
    expect(bitmap2).toEqual('1'.repeat(200))
    expect(booleans.map((_, i) => bitmap2[i] === '1')).toEqual(booleans)
    expect(getBitmapIndex(bitmap2, 1)).toEqual(0)
    expect(getBitmapIndex(bitmap2, 2)).toEqual(1)
    expect(getBitmapIndex(bitmap2, 3)).toEqual(2)
  })

  it('should encode and decode bits in fully false array', () => {
    const booleans = new Array(200).fill(false)
    const bitmap1 = booleansToBitmap(booleans)
    const int = encodeBitmap(bitmap1.bitmap)
    const bitmap2 = decodeBitmap(int, bitmap1.length)
    
    expect(int).toEqual('0')

    expect(bitmap1.size).toEqual(0)
    expect(bitmap1.length).toEqual(200)
    expect(bitmap1.bitmap).toEqual(bitmap2)
    expect(bitmap2).toEqual('0'.repeat(200))
    expect(booleans.map((_, i) => bitmap2[i] === '1')).toEqual(booleans)
    expect(() => getBitmapIndex(bitmap2, 1)).toThrow()
    expect(() => getBitmapIndex(bitmap2, 2)).toThrow()
    expect(() => getBitmapIndex(bitmap2, 3)).toThrow()
  })
})
