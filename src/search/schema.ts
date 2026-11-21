import { z } from 'zod'
import { indexedCollections } from './constants'

export const searchRelationshipFilterSchema = z
  .object({
    relationTo: z.enum(indexedCollections).optional(),
    value: z
      .union([z.string(), z.number(), z.object({ isPrivate: z.literal(false) }).strict()])
      .optional(),
  })
  .strict()
  .refine((filter) => filter.relationTo !== undefined || filter.value !== undefined)
