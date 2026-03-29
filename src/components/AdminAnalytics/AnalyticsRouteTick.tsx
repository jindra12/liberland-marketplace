import type { RouteTickPayload } from './analyticsChartUtils'
import { getFrontendRouteHref, toCoordinate, truncate } from './analyticsChartUtils'

type Props = {
  frontendBaseURL: null | string
  payload?: RouteTickPayload
  x?: number | string
  y?: number | string
}

const AnalyticsRouteTick = ({ frontendBaseURL, payload, x = 0, y = 0 }: Props) => {
  const route = payload?.value

  if (!route) {
    return null
  }

  const href = getFrontendRouteHref(frontendBaseURL, route)
  const xCoordinate = toCoordinate(x)
  const yCoordinate = toCoordinate(y)

  return (
    <g transform={`translate(${xCoordinate},${yCoordinate})`}>
      {href ? (
        <a aria-label={`Open ${route}`} href={href} rel="noreferrer" target="_blank">
          <title>{route}</title>
          <text
            fill="var(--analytics-route-link-color)"
            fontWeight={600}
            textAnchor="end"
            textDecoration="underline"
            x={-8}
            y={0}
          >
            {truncate(route, 28)}
          </text>
        </a>
      ) : (
        <text fill="var(--theme-text)" textAnchor="end" x={-8} y={0}>
          {truncate(route, 28)}
        </text>
      )}
    </g>
  )
}

export default AnalyticsRouteTick
