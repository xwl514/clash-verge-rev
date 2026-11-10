import type { TrafficHistory, TrafficRecord } from '@/services/bindings'

interface TrafficTotals {
  upload: number
  download: number
  total: number
  firstSeen: number
  lastSeen: number
}

interface RouteTraffic extends TrafficTotals {
  key: string
  chains: string[]
}

export interface DomainTraffic extends TrafficTotals {
  host: string
  routes: RouteTraffic[]
}

export type DomainTrafficSortKey = 'host' | keyof TrafficTotals

export const aggregateDomainTraffic = (
  records: TrafficRecord[],
): DomainTraffic[] => {
  const domains = new Map<string, DomainTraffic>()
  for (const record of records) {
    let domain = domains.get(record.host)
    if (!domain) {
      domain = {
        host: record.host,
        routes: [],
        upload: 0,
        download: 0,
        total: 0,
        firstSeen: record.firstSeen,
        lastSeen: record.lastSeen,
      }
      domains.set(record.host, domain)
    }
    const total = record.upload + record.download
    domain.upload += record.upload
    domain.download += record.download
    domain.total += total
    domain.firstSeen = Math.min(domain.firstSeen, record.firstSeen)
    domain.lastSeen = Math.max(domain.lastSeen, record.lastSeen)
    domain.routes.push({ ...record, key: JSON.stringify(record.chains), total })
  }
  return [...domains.values()].map((domain) => ({
    ...domain,
    routes: domain.routes.sort(
      (a, b) => b.total - a.total || a.key.localeCompare(b.key),
    ),
  }))
}

export const sortDomainTraffic = (
  domains: DomainTraffic[],
  key: DomainTrafficSortKey,
  direction: 'asc' | 'desc',
) =>
  [...domains].sort((a, b) => {
    const order =
      key === 'host' ? a.host.localeCompare(b.host) : a[key] - b[key]
    return (
      (direction === 'asc' ? order : -order) || a.host.localeCompare(b.host)
    )
  })

export const aggregateTrafficTimeline = (
  history: TrafficHistory,
  match: (host: string) => boolean,
) => {
  const buckets = new Map<
    number,
    { timestamp: number; upload: number; download: number }
  >()
  for (
    let timestamp = history.from;
    timestamp < history.to;
    timestamp += history.intervalMs
  ) {
    buckets.set(timestamp, { timestamp, upload: 0, download: 0 })
  }
  for (const point of history.points) {
    const bucket = buckets.get(point.timestamp)
    if (bucket && match(point.host)) {
      bucket.upload += point.upload
      bucket.download += point.download
    }
  }
  return [...buckets.values()]
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
export type TrafficPeriod = 'hour' | 'today' | 'week' | 'month' | 'custom'

export const trafficTimeRange = (
  period: TrafficPeriod,
  start: string,
  end: string,
  now = Date.now(),
) => {
  const to = Math.floor(now / MINUTE) * MINUTE + MINUTE
  const earliest = Math.floor((now - 30 * DAY) / MINUTE) * MINUTE
  if (period === 'custom') {
    const from = new Date(start).getTime()
    const until = new Date(end).getTime()
    return Number.isFinite(from) &&
      Number.isFinite(until) &&
      from >= earliest &&
      from < until &&
      until <= to
      ? { from, to: until }
      : null
  }
  let from = Math.floor(now / MINUTE) * MINUTE - 60 * MINUTE
  if (period === 'month') from = earliest
  if (period === 'today' || period === 'week') {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    if (period === 'week') date.setDate(date.getDate() - 6)
    from = date.getTime()
  }
  return { from, to }
}

export const localDateTimeInput = (timestamp: number) => {
  const date = new Date(timestamp)
  return new Date(timestamp - date.getTimezoneOffset() * MINUTE)
    .toISOString()
    .slice(0, 16)
}
