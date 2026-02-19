import { APIError } from 'payload'
import type { Endpoint } from 'payload'

const toId = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }
  return null
}

export const joinStartup: Omit<Endpoint, 'root'> = {
  path: '/:id/join',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('You must be logged in.', 401)
    }

    const startupId = req.routeParams?.id as string
    const userId = req.user.id as string

    const startup = await req.payload.findByID({
      collection: 'startups',
      id: startupId,
      depth: 0,
      overrideAccess: true,
    })

    const currentIds = ((startup.involvedUsers as unknown[]) ?? [])
      .map(toId)
      .filter(Boolean) as string[]

    if (currentIds.includes(userId)) {
      return Response.json({ message: 'You are already involved in this startup.' })
    }

    await req.payload.update({
      collection: 'startups',
      id: startupId,
      data: { involvedUsers: [...currentIds, userId] },
      overrideAccess: true,
    })

    return Response.json({ message: 'Successfully joined startup.' })
  },
}

export const leaveStartup: Omit<Endpoint, 'root'> = {
  path: '/:id/leave',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('You must be logged in.', 401)
    }

    const startupId = req.routeParams?.id as string
    const userId = req.user.id as string

    const startup = await req.payload.findByID({
      collection: 'startups',
      id: startupId,
      depth: 0,
      overrideAccess: true,
    })

    const currentIds = ((startup.involvedUsers as unknown[]) ?? [])
      .map(toId)
      .filter(Boolean) as string[]

    if (!currentIds.includes(userId)) {
      return Response.json({ message: 'You are not involved in this startup.' })
    }

    await req.payload.update({
      collection: 'startups',
      id: startupId,
      data: { involvedUsers: currentIds.filter((id) => id !== userId) },
      overrideAccess: true,
    })

    return Response.json({ message: 'Successfully left startup.' })
  },
}
