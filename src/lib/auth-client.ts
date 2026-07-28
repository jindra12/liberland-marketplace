import { createAuthClient } from 'better-auth/react'

const fallbackBaseURL =
  typeof window === 'undefined' ? 'http://localhost:3001' : window.location.origin

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL || fallbackBaseURL,
})
