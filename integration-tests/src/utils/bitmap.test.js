import { booleansToBitmap, bitmapToInt, intToBitmap, isTrue } from '../../../src/utils/bitmap.js'

describe('bitmap', () => {
  it('should encode and decode bits (1)', () => {
    const booleans = Array.from(new Array(200), (_, i) => i % 3 === 0 || i % 5 === 0)
    const bitmap1 = booleansToBitmap(booleans)
    const int = bitmapToInt(bitmap1)
    const bitmap2 = intToBitmap(int, 200)
    
    expect(int).toEqual('6uil82z5dpm3kyg394nloyq617my3965d1vlcpe')

    expect(bitmap1).toEqual(bitmap2)
    expect(bitmap2).toEqual(booleans.map(b => b ? 1 : 0).join(''))
    expect(booleans.map((_, i) => isTrue(bitmap2, i))).toEqual(booleans)
  })
  
  it('should encode and decode bits (2)', () => {
    const booleans = Array.from(new Array(200), (_, i) => !(i % 3 === 0 || i % 5 === 0))
    const bitmap1 = booleansToBitmap(booleans)
    const int = bitmapToInt(bitmap1)
    const bitmap2 = intToBitmap(int, 200)
    
    expect(int).toEqual('4t207y22yz0dp80nlnaff1g1fn471e2rblavhpp')

    expect(bitmap1).toEqual(bitmap2)
    expect(bitmap2).toEqual(booleans.map(b => b ? 1 : 0).join(''))
    expect(booleans.map((_, i) => isTrue(bitmap2, i))).toEqual(booleans)
  })

  it('should encode and decode bits (2)', () => {
    const booleans = new Array(200).fill(true)
    const bitmap1 = booleansToBitmap(booleans)
    const int = bitmapToInt(bitmap1)
    const bitmap2 = intToBitmap(int, 200)
    
    expect(int).toEqual('bnklg118comha6gqury14067gur54n8won6guf3')

    expect(bitmap1).toEqual(bitmap2)
    expect(bitmap2).toEqual('1'.repeat(200))
    expect(booleans.map((_, i) => isTrue(bitmap2, i))).toEqual(booleans)
  })

  it('should encode and decode bits (2)', () => {
    const booleans = new Array(200).fill(false)
    const bitmap1 = booleansToBitmap(booleans)
    const int = bitmapToInt(bitmap1)
    const bitmap2 = intToBitmap(int, 200)
    
    expect(int).toEqual('0')

    expect(bitmap1).toEqual(bitmap2)
    expect(bitmap2).toEqual('0'.repeat(200))
    expect(booleans.map((_, i) => isTrue(bitmap2, i))).toEqual(booleans)
  })
})
