export type AiRepostCompany = {
  description?: string | null
  id: string
  image?: string | { id?: string | null } | null
  name: string
  noAutoPost?: boolean | null
  website?: string | null
}

export type AiSocialCandidate = {
  description: string
  imageURL: string | null
  publishedAtISO: string | null
  title: string
  url: string
}

export type AiRepostBatchPlan = {
  concernFlags: string[]
  companyId: string
  description: string
  qualityScore: number
  reason: string
  shouldRepost: boolean
  title: string
  url: string | null
}

export type AiRepostBatchResult = {
  candidate: AiSocialCandidate
  companyId: string
  decision: AiRepostBatchPlan
}

export type AiRepostDecision = {
  concernFlags: string[]
  description: string
  qualityScore: number
  reason: string
  shouldRepost: boolean
  title: string
}
