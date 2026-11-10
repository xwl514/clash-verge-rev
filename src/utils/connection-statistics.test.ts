import { expect, test } from 'vitest'

import type { TrafficHistory } from '@/services/bindings'

import {
  aggregateDomainTraffic,
  aggregateTrafficTimeline,
  localDateTimeInput,
  sortDomainTraffic,
  trafficTimeRange,
} from './connection-statistics'
import { compileStringMatcher } from './search-matcher'

const history: TrafficHistory = {
  from: 0,
  to: 180_000,
  intervalMs: 60_000,
  records: [
    {
      host: 'example.com',
      chains: ['Exit A', 'Proxy'],
      upload: 10,
      download: 200,
      firstSeen: 1,
      lastSeen: 50_000,
    },
    {
      host: 'example.com',
      chains: ['DIRECT'],
      upload: 2,
      download: 30,
      firstSeen: 60_001,
      lastSeen: 70_000,
    },
    {
      host: 'other.com',
      chains: ['example.com'],
      upload: 1000,
      download: 0,
      firstSeen: 60_001,
      lastSeen: 60_001,
    },
  ],
  points: [
    { timestamp: 0, host: 'example.com', upload: 10, download: 200 },
    { timestamp: 60_000, host: 'example.com', upload: 2, download: 30 },
    { timestamp: 60_000, host: 'other.com', upload: 1000, download: 0 },
  ],
}

test('ranks domains, retains route timestamps and applies the same name filter to chart totals', () => {
  const before = structuredClone(history)
  const domains = aggregateDomainTraffic(history.records)
  expect(
    sortDomainTraffic(domains, 'total', 'desc').map((domain) => domain.host),
  ).toEqual(['other.com', 'example.com'])
  expect(sortDomainTraffic(domains, 'download', 'desc')[0].host).toBe(
    'example.com',
  )
  const { matcher } = compileStringMatcher('EXAMPLE\\.com$', {
    useRegularExpression: true,
  })
  const filtered = domains.filter((domain) => matcher(domain.host))
  expect(filtered[0]).toMatchObject({
    total: 242,
    firstSeen: 1,
    lastSeen: 70_000,
  })
  expect(filtered[0].routes.map((route) => route.total)).toEqual([210, 32])
  const timeline = aggregateTrafficTimeline(history, matcher)
  expect(timeline).toHaveLength(3)
  expect(timeline[2]).toEqual({ timestamp: 120_000, upload: 0, download: 0 })
  expect(
    timeline.reduce((total, point) => total + point.upload + point.download, 0),
  ).toBe(filtered[0].total)
  expect(history).toEqual(before)
})

test('uses local calendar boundaries and validates custom ranges within the retention window', () => {
  const now = new Date(2026, 10, 10, 14, 35, 12).getTime()
  const today = trafficTimeRange('today', '', '', now)!
  expect(today.from).toBe(new Date(2026, 10, 10).getTime())
  expect(today.to).toBe(new Date(2026, 10, 10, 14, 36).getTime())
  expect(trafficTimeRange('week', '', '', now)!.from).toBe(
    new Date(2026, 10, 4).getTime(),
  )
  expect(
    trafficTimeRange(
      'custom',
      localDateTimeInput(today.from),
      localDateTimeInput(today.to),
      now,
    ),
  ).toEqual(today)
  expect(trafficTimeRange('custom', '', '', now)).toBeNull()
  expect(
    trafficTimeRange(
      'custom',
      localDateTimeInput(now),
      localDateTimeInput(today.from),
      now,
    ),
  ).toBeNull()
  expect(
    trafficTimeRange('custom', '2026-01-01T00:00', '2026-01-02T00:00', now),
  ).toBeNull()
})
