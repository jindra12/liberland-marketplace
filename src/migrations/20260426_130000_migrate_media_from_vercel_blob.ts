import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-mongodb'
import type { ObjectId } from 'mongodb'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type MediaSizeDoc = {
  url?: string | null
  width?: number | null
  height?: number | null
  mimeType?: string | null
  filesize?: number | null
  filename?: string | null
}

type LegacyMediaDoc = {
  _id: ObjectId
  id?: string
  url?: string | null
  thumbnailURL?: string | null
  filename?: string | null
  mimeType?: string | null
  filesize?: number | null
  width?: number | null
  height?: number | null
  focalX?: number | null
  focalY?: number | null
  sizes?: Partial<Record<'thumbnail' | 'square' | 'small' | 'medium' | 'large' | 'xlarge' | 'og', MediaSizeDoc>>
}

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const localMediaDir = path.resolve(dirname, '../../public/media')

const isLegacyBlobUrl = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string' || value.length === 0) {
    return false
  }

  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return false
  }

  try {
    const parsed = new URL(value)
    return (
      parsed.hostname === 'blob.vercel-storage.com' ||
      parsed.hostname.endsWith('.blob.vercel-storage.com')
    )
  } catch {
    return false
  }
}

const toLocalUrl = (filename: string): string => `/media/${filename}`

const filenameFromUrl = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  try {
    const parsed = new URL(value)
    const basename = path.basename(parsed.pathname)
    return basename.length > 0 ? basename : null
  } catch {
    const basename = path.basename(value)
    return basename.length > 0 ? basename : null
  }
}

const ensureDirectory = async (targetPath: string): Promise<void> => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
}

const writeRemoteFileIfMissing = async (remoteUrl: string, targetFilename: string): Promise<void> => {
  const targetPath = path.join(localMediaDir, targetFilename)
  await ensureDirectory(targetPath)

  try {
    await fs.access(targetPath)
    return
  } catch {
    // The file does not exist locally yet.
  }

  const response = await fetch(remoteUrl)
  if (!response.ok) {
    throw new Error(`Failed to download ${remoteUrl}: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  await fs.writeFile(targetPath, new Uint8Array(arrayBuffer))
}

const getLocalFilename = (doc: LegacyMediaDoc, remoteUrl: string, fallbackName: string): string => {
  return doc.filename ?? filenameFromUrl(remoteUrl) ?? fallbackName
}

const migrateSize = async (
  doc: LegacyMediaDoc,
  sizeName: keyof NonNullable<LegacyMediaDoc['sizes']>,
  sizeDoc: MediaSizeDoc,
): Promise<{ filename: string; url: string } | null> => {
  if (!isLegacyBlobUrl(sizeDoc.url)) {
    return null
  }

  const fallbackName = `${String(doc._id)}-${sizeName}`
  const targetFilename = sizeDoc.filename ?? filenameFromUrl(sizeDoc.url) ?? fallbackName
  await writeRemoteFileIfMissing(sizeDoc.url, targetFilename)

  return {
    filename: targetFilename,
    url: toLocalUrl(targetFilename),
  }
}

export const up = async ({ payload, session }: MigrateUpArgs) => {
  const mediaCollection = payload.db.collections.media?.collection
  if (!mediaCollection) {
    throw new Error('media collection is not available in Mongo adapter.')
  }

  await fs.mkdir(localMediaDir, { recursive: true })

  const cursor = mediaCollection.find(
    {},
    {
      session,
      projection: {
        _id: 1,
        id: 1,
        url: 1,
        thumbnailURL: 1,
        filename: 1,
        mimeType: 1,
        filesize: 1,
        width: 1,
        height: 1,
        focalX: 1,
        focalY: 1,
        sizes: 1,
      },
    },
  )

  const docs = (await cursor.toArray()) as LegacyMediaDoc[]

  let migratedDocs = 0
  let copiedFiles = 0
  let skippedDocs = 0

  for (let index = 0; index < docs.length; index += 1) {
    const doc = docs[index]
    const originalUrl = isLegacyBlobUrl(doc.url) ? doc.url : null
    const thumbnailUrl = isLegacyBlobUrl(doc.thumbnailURL) ? doc.thumbnailURL : null
    const sizeEntries = Object.entries(doc.sizes ?? {}) as [
      keyof NonNullable<LegacyMediaDoc['sizes']>,
      MediaSizeDoc | undefined,
    ][]

    const hasLegacySize = sizeEntries.some(([, sizeDoc]) => isLegacyBlobUrl(sizeDoc?.url))
    if (!originalUrl && !thumbnailUrl && !hasLegacySize) {
      skippedDocs += 1
      continue
    }

    const updates: Record<string, unknown> = {}

    if (originalUrl) {
      const fallbackName = String(doc._id)
      const targetFilename = getLocalFilename(doc, originalUrl, fallbackName)
      await writeRemoteFileIfMissing(originalUrl, targetFilename)
      updates.url = toLocalUrl(targetFilename)
      updates.filename = targetFilename
      copiedFiles += 1
    }

    if (thumbnailUrl) {
      const thumbnailFilename =
        doc.sizes?.thumbnail?.filename ??
        filenameFromUrl(thumbnailUrl) ??
        `${String(doc._id)}-thumbnail`

      await writeRemoteFileIfMissing(thumbnailUrl, thumbnailFilename)
      updates.thumbnailURL = toLocalUrl(thumbnailFilename)
      copiedFiles += 1
    }

    if (sizeEntries.length > 0) {
      const updatedSizes = { ...(doc.sizes ?? {}) }

      for (let sizeIndex = 0; sizeIndex < sizeEntries.length; sizeIndex += 1) {
        const [sizeName, sizeDoc] = sizeEntries[sizeIndex]
        if (!sizeDoc) {
          continue
        }

        const migratedSize = await migrateSize(doc, sizeName, sizeDoc)
        if (!migratedSize) {
          continue
        }

        updatedSizes[sizeName] = {
          ...sizeDoc,
          filename: migratedSize.filename,
          url: migratedSize.url,
        }
        copiedFiles += 1
      }

      updates.sizes = updatedSizes
    }

    await mediaCollection.updateOne(
      { _id: doc._id },
      {
        $set: updates,
      },
      { session },
    )

    migratedDocs += 1
  }

  payload.logger.info(
    `[migration:migrate_media_from_vercel_blob] Completed. scanned=${docs.length} migrated=${migratedDocs} copiedFiles=${copiedFiles} skipped=${skippedDocs}`,
  )
}

export const down = async ({ payload }: MigrateDownArgs) => {
  payload.logger.info(
    '[migration:migrate_media_from_vercel_blob] down() is a no-op. Local media files are not removed automatically.',
  )
}
