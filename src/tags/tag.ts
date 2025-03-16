import { z } from 'zod'
import { taggableFileSchema } from '../common/taggable-file.ts'
import { visibilitySchema } from './visibility.ts'

export const tagSchema = z.strictObject({
  authorUserId: z.number(),
  value: z.string(),
  visibility: visibilitySchema,
  taggableFile: taggableFileSchema,
})

export type Tag = z.infer<typeof tagSchema>
