import type { CollectionAfterReadHook, PayloadRequest } from 'payload'

type ReportRecord = {
  contentLink?: string | null
}

type ReportCollection = {
  find: (
    filter: { userId: string },
    options: { projection: { contentLink: 1 } },
  ) => {
    toArray: () => Promise<ReportRecord[]>
  }
}

type RawCollectionMap = Record<string, { collection?: ReportCollection }>

const getReportedLinks = async ({
  req,
  userID,
}: {
  req: PayloadRequest
  userID: string
}): Promise<string[]> => {
  const collectionMap = req.payload.db.collections as unknown as RawCollectionMap
  const reportCollection = collectionMap.reports?.collection

  if (!reportCollection) {
    return []
  }

  const reports = await reportCollection.find(
    {
      userId: userID,
    },
    {
      projection: {
        contentLink: 1,
      },
    },
  ).toArray()

  return reports.flatMap((report) =>
    typeof report.contentLink === 'string' ? [report.contentLink] : [],
  )
}

export const populateReportedLinks: CollectionAfterReadHook = async ({ doc, req }) => {
  if (!req.user) {
    return doc
  }

  const docID = typeof doc.id === 'string' ? doc.id : null

  if (!docID || (req.user.id !== docID && !req.user.role?.includes('admin'))) {
    return doc
  }

  return {
    ...doc,
    reportedLinks: await getReportedLinks({
      req,
      userID: docID,
    }),
  }
}
