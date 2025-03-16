import { z } from 'zod'
import { taggableFileSchema } from '../common/taggable-file.ts'
import { visibilitySchema } from '../tags/visibility.ts'

export const userSessionSchema = z.strictObject({
  tagging: z.strictObject({
    taggableFileMessageId: z.number(),
    taggableFile: taggableFileSchema,
    visibility: visibilitySchema,
    promptMessageId: z.number().optional(),
    instructionsMessageId: z.number().optional(),
  })
})

export type UserSession = z.infer<typeof userSessionSchema>
