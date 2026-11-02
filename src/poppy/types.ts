import type { DataFromCollectionSlug } from 'payload'
import type { POPPY_COLLECTION } from './constants'

export type PoppyRecord = DataFromCollectionSlug<typeof POPPY_COLLECTION>
