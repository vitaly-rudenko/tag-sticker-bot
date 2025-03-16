import { z } from 'zod'

export const taggableFileSchema = z.discriminatedUnion('fileType', [
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('sticker'),
    setName: z.string().optional(),
  }),
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('animation'),
    mimeType: z.string(),
  })
])

export type TaggableFile = z.infer<typeof taggableFileSchema>
