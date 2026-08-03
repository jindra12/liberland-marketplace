import 'dotenv/config'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-mongodb'
import { ObjectId } from 'mongodb'
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
const publicDir = path.resolve(dirname, '../../public')
const testDataMediaDir = path.resolve(dirname, '../../testdata/media')
const blobApiUrl = 'https://vercel.com/api/blob'
const blobReadWriteToken = process.env.BLOB_READ_WRITE_TOKEN || null
const blobUrlCache = new Map<string, string | null>()

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

const fetchBlobUrlForFilename = async (targetFilename: string): Promise<string | null> => {
  const cachedUrl = blobUrlCache.get(targetFilename)
  if (cachedUrl !== undefined) {
    return cachedUrl
  }

  if (!blobReadWriteToken) {
    blobUrlCache.set(targetFilename, null)
    return null
  }

  const requestUrl = new URL(blobApiUrl)
  requestUrl.searchParams.set('prefix', targetFilename)
  requestUrl.searchParams.set('limit', '100')

  const response = await fetch(requestUrl, {
    headers: {
      authorization: `Bearer ${blobReadWriteToken}`,
    },
  })

  if (!response.ok) {
    blobUrlCache.set(targetFilename, null)
    return null
  }

  const result = (await response.json()) as {
    blobs?: Array<{
      downloadUrl?: string
      pathname?: string
      url?: string
    }>
  }

  const matchingBlob = result.blobs?.find((blob) => blob.pathname === targetFilename)
  const matchingUrl = matchingBlob?.downloadUrl ?? matchingBlob?.url ?? null
  blobUrlCache.set(targetFilename, matchingUrl)

  return matchingUrl
}

const readExistingSourcePath = async (targetFilename: string): Promise<string | null> => {
  const sourceCandidates = [
    path.join(publicDir, targetFilename),
    path.join(testDataMediaDir, targetFilename),
  ]

  for (let index = 0; index < sourceCandidates.length; index += 1) {
    const candidate = sourceCandidates[index]
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Try the next source candidate.
    }
  }

  return null
}

const writeRemoteFileIfMissing = async (
  remoteUrl: string,
  targetFilename: string,
): Promise<'already-present' | 'downloaded' | 'copied-local' | 'missing-source'> => {
  const targetPath = path.join(localMediaDir, targetFilename)
  await ensureDirectory(targetPath)

  try {
    await fs.access(targetPath)
    return 'already-present'
  } catch {
    // The file does not exist locally yet.
  }

  const localSourcePath = await readExistingSourcePath(targetFilename)
  if (localSourcePath) {
    await fs.copyFile(localSourcePath, targetPath)
    return 'copied-local'
  }

  const blobUrl = await fetchBlobUrlForFilename(targetFilename)
  if (blobUrl) {
    const response = await fetch(blobUrl)
    if (!response.ok) {
      throw new Error(`Failed to download ${blobUrl}: ${response.status} ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    await fs.writeFile(targetPath, new Uint8Array(arrayBuffer))
    return 'downloaded'
  }

  if (!isLegacyBlobUrl(remoteUrl)) {
    return 'missing-source'
  }

  const response = await fetch(remoteUrl)
  if (!response.ok) {
    throw new Error(`Failed to download ${remoteUrl}: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  await fs.writeFile(targetPath, new Uint8Array(arrayBuffer))
  return 'downloaded'
}

const getLocalFilename = (doc: LegacyMediaDoc, remoteUrl: string, fallbackName: string): string => {
  return doc.filename ?? filenameFromUrl(remoteUrl) ?? fallbackName
}

const migrateSize = async (
  doc: LegacyMediaDoc,
  sizeName: keyof NonNullable<LegacyMediaDoc['sizes']>,
  sizeDoc: MediaSizeDoc,
): Promise<{ filename: string; url: string } | null> => {
  if (typeof sizeDoc.url !== 'string' || sizeDoc.url.length === 0) {
    return null
  }

  const fallbackName = `${String(doc._id)}-${sizeName}`
  const targetFilename = sizeDoc.filename ?? filenameFromUrl(sizeDoc.url) ?? fallbackName
  const sourceKind = await writeRemoteFileIfMissing(sizeDoc.url, targetFilename)
  if (sourceKind === 'missing-source') {
    return null
  }

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
  payload.logger.info(
    `[migration:migrate_media_from_vercel_blob] Starting. mediaDir=${localMediaDir} publicDir=${publicDir} testDataMediaDir=${testDataMediaDir}`,
  )

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
  let copiedLocalFiles = 0
  let downloadedFiles = 0
  let missingSourceFiles = 0

  for (let index = 0; index < docs.length; index += 1) {
    const doc = docs[index]
    const originalUrl = typeof doc.url === 'string' ? doc.url : null
    const thumbnailUrl = typeof doc.thumbnailURL === 'string' ? doc.thumbnailURL : null
    const sizeEntries = Object.entries(doc.sizes ?? {}) as [
      keyof NonNullable<LegacyMediaDoc['sizes']>,
      MediaSizeDoc | undefined,
    ][]

    const allTargets = [
      {
        label: 'original',
        url: originalUrl,
        filename: getLocalFilename(doc, originalUrl ?? '', String(doc._id)),
      },
      {
        label: 'thumbnail',
        url: thumbnailUrl,
        filename:
          doc.sizes?.thumbnail?.filename ??
          filenameFromUrl(thumbnailUrl) ??
          `${String(doc._id)}-thumbnail`,
      },
      ...sizeEntries
        .filter(([, sizeDoc]) => Boolean(sizeDoc))
        .map(([sizeName, sizeDoc]) => {
          const resolvedSizeDoc = sizeDoc as MediaSizeDoc
          return {
            label: String(sizeName),
            url: resolvedSizeDoc.url ?? null,
            filename:
              resolvedSizeDoc.filename ??
              filenameFromUrl(resolvedSizeDoc.url) ??
              `${String(doc._id)}-${String(sizeName)}`,
          }
        }),
    ]

    const needsMigration = (
      await Promise.all(
        allTargets.map(async ({ url, filename }) => {
          if (typeof url !== 'string' || url.length === 0) {
            return false
          }

          if (!url.startsWith('/media/')) {
            return true
          }

          try {
            await fs.access(path.join(localMediaDir, filename))
            return false
          } catch {
            return true
          }
        }),
      )
    ).some(Boolean)

    if (!needsMigration) {
      skippedDocs += 1
      continue
    }

    const updates: Record<string, unknown> = {}

    if (originalUrl) {
      const fallbackName = String(doc._id)
      const targetFilename = getLocalFilename(doc, originalUrl, fallbackName)
      const sourceKind = await writeRemoteFileIfMissing(originalUrl, targetFilename)
      if (sourceKind === 'copied-local') copiedLocalFiles += 1
      if (sourceKind === 'downloaded') downloadedFiles += 1
      if (sourceKind === 'missing-source') missingSourceFiles += 1
      if (sourceKind !== 'missing-source' && !originalUrl.startsWith('/media/')) {
        updates.url = toLocalUrl(targetFilename)
        updates.filename = targetFilename
        copiedFiles += 1
        payload.logger.info(
          `[migration:migrate_media_from_vercel_blob] Repaired original for ${String(doc._id)} using ${sourceKind} source -> ${targetFilename}`,
        )
      }
    }

    if (thumbnailUrl) {
      const thumbnailFilename =
        doc.sizes?.thumbnail?.filename ??
        filenameFromUrl(thumbnailUrl) ??
        `${String(doc._id)}-thumbnail`

      const sourceKind = await writeRemoteFileIfMissing(thumbnailUrl, thumbnailFilename)
      if (sourceKind === 'copied-local') copiedLocalFiles += 1
      if (sourceKind === 'downloaded') downloadedFiles += 1
      if (sourceKind === 'missing-source') missingSourceFiles += 1
      if (sourceKind !== 'missing-source' && !thumbnailUrl.startsWith('/media/')) {
        updates.thumbnailURL = toLocalUrl(thumbnailFilename)
        copiedFiles += 1
        payload.logger.info(
          `[migration:migrate_media_from_vercel_blob] Repaired thumbnail for ${String(doc._id)} using ${sourceKind} source -> ${thumbnailFilename}`,
        )
      }
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
          if (sizeDoc?.url) {
            payload.logger.warn(
              `[migration:migrate_media_from_vercel_blob] Missing source for size ${String(sizeName)} on ${String(doc._id)} (${sizeDoc.url}).`,
            )
          }
          continue
        }

        updatedSizes[sizeName] = {
          ...sizeDoc,
          filename: migratedSize.filename,
          url: migratedSize.url,
        }
        if (sizeDoc.url !== migratedSize.url) {
          copiedFiles += 1
        }
        payload.logger.info(
          `[migration:migrate_media_from_vercel_blob] Repaired size ${String(sizeName)} for ${String(doc._id)} -> ${migratedSize.filename}`,
        )
      }

      updates.sizes = updatedSizes
    }

    const updateKeys = Object.keys(updates)
    if (updateKeys.length === 0) {
      skippedDocs += 1
      payload.logger.info(
        `[migration:migrate_media_from_vercel_blob] No recoverable asset changes for ${String(doc._id)}.`,
      )
      continue
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
    `[migration:migrate_media_from_vercel_blob] Completed. scanned=${docs.length} migrated=${migratedDocs} copiedFiles=${copiedFiles} copiedLocalFiles=${copiedLocalFiles} downloadedFiles=${downloadedFiles} missingSourceFiles=${missingSourceFiles} skipped=${skippedDocs}`,
  )
}

export const down = async ({ payload }: MigrateDownArgs) => {
  payload.logger.info(
    '[migration:migrate_media_from_vercel_blob] down() is a no-op. Local media files are not removed automatically.',
  )
}
