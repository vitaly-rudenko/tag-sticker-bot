import { z } from 'zod'

export const visibilitySchema = z.enum(['private', 'public'])
export type Visibility = z.infer<typeof visibilitySchema>
