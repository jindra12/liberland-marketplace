import type { CSSProperties } from 'react'

export type RouteTickPayload = {
  value?: string
}

export const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value

export const getFrontendRouteHref = (frontendBaseURL: null | string, route: string) => {
  if (!frontendBaseURL || !route) {
    return null
  }

  const normalizedBaseURL = frontendBaseURL.endsWith('/')
    ? frontendBaseURL.slice(0, -1)
    : frontendBaseURL
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`

  return `${normalizedBaseURL}${normalizedRoute}`
}

export const toCoordinate = (value: number | string | undefined) =>
  typeof value === 'number' ? value : Number(value ?? 0)

export const tooltipStyle: CSSProperties = {
  backgroundColor: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: '12px',
}
