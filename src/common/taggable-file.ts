import { z } from 'zod'

export const taggableFileSchema = z.discriminatedUnion('fileType', [
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('sticker'),
    setName: z.string().optional(),
    emoji: z.string().optional(),
  }),
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('animation'),
    mimeType: z.enum(['video/mp4', 'image/gif']),
  }),
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('photo'),
  }),
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('video'),
    fileName: z.string(),
    mimeType: z.literal('video/mp4'),
  }),
  z.strictObject({
    fileId: z.string(),
    fileUniqueId: z.string(),
    fileType: z.literal('video_note'),
  })
])

export type TaggableFile = z.infer<typeof taggableFileSchema>
