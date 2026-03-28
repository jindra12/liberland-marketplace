'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsDailyPoint, AnalyticsTopItem } from '@/utilities/analytics/reporting'
import styles from './AnalyticsCharts.module.scss'

type Props = {
  frontendBaseURL: null | string
  topEvents: AnalyticsTopItem[]
  topRoutes: AnalyticsTopItem[]
  trend: AnalyticsDailyPoint[]
}

type RouteTickProps = {
  payload?: {
    value?: string
  }
  x?: number | string
  y?: number | string
}

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value

const getFrontendRouteHref = (frontendBaseURL: null | string, route: string) => {
  if (!frontendBaseURL || !route) {
    return null
  }

  const normalizedBaseURL = frontendBaseURL.endsWith('/')
    ? frontendBaseURL.slice(0, -1)
    : frontendBaseURL
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`

  return `${normalizedBaseURL}${normalizedRoute}`
}

const toCoordinate = (value: number | string | undefined) =>
  typeof value === 'number' ? value : Number(value ?? 0)

const tooltipStyle = {
  backgroundColor: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: '12px',
}

const TopRouteTick = ({ frontendBaseURL, payload, x = 0, y = 0 }: RouteTickProps & Pick<Props, 'frontendBaseURL'>) => {
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

export const AnalyticsCharts = ({ frontendBaseURL, topEvents, topRoutes, trend }: Props) => {
  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Event Volume</h2>
          <p>Daily totals for all tracked events and page views.</p>
        </div>
        <div className={styles.chart}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="analytics-total" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="analytics-pageviews" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--theme-elevation-100)" strokeDasharray="3 3" />
              <XAxis dataKey="day" tickFormatter={(value) => value.slice(5)} />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="total"
                fill="url(#analytics-total)"
                fillOpacity={1}
                name="All events"
                stroke="#0f766e"
                strokeWidth={2}
                type="monotone"
              />
              <Area
                dataKey="pageViews"
                fill="url(#analytics-pageviews)"
                fillOpacity={1}
                name="Page views"
                stroke="#f97316"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Top Events</h2>
          <p>Most frequent event types across the local analytics store.</p>
        </div>
        <div className={styles.chart}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topEvents}>
              <CartesianGrid stroke="var(--theme-elevation-100)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickFormatter={(value) => truncate(value, 14)} />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#0f766e" name="Events" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Top Routes</h2>
          <p>Most viewed routes from incoming `page_view` events.</p>
        </div>
        {topRoutes.length === 0 ? (
          <div className={styles.emptyChart}>No page-view routes have been tracked yet.</div>
        ) : (
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topRoutes} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid stroke="var(--theme-elevation-100)" strokeDasharray="3 3" />
                <XAxis allowDecimals={false} type="number" />
                <YAxis
                  dataKey="label"
                  tick={(props) => (
                    <TopRouteTick
                      frontendBaseURL={frontendBaseURL}
                      payload={props.payload}
                      x={props.x}
                      y={props.y}
                    />
                  )}
                  type="category"
                  width={180}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#1d4ed8" name="Page views" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  )
}

export default AnalyticsCharts
