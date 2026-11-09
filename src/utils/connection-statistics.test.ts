import { expect, test } from 'vitest'

import {
  aggregateDomainTraffic,
  sortDomainTraffic,
} from './connection-statistics'
import { compileStringMatcher } from './search-matcher'

const connection = (
  id: string,
  host: string,
  upload: number,
  download: number,
  chains = ['Node A', 'Proxy'],
): IConnectionsItem => ({
  id,
  metadata: {
    host,
    network: 'tcp',
    type: 'HTTP',
    sourceIP: '127.0.0.1',
    sourcePort: '5000',
    destinationPort: '443',
  },
  upload,
  download,
  chains,
  start: '2026-11-09T00:00:00Z',
  rule: 'DomainSuffix',
  rulePayload: host,
})

test('combines domain counters across live and closed connections without counting a reappearing ID twice', () => {
  const active = [connection('1', 'Example.COM', 30, 200)]
  const closed = [
    connection('1', 'example.com', 10, 100),
    connection('2', 'example.com.', 20, 50),
    connection('3', 'example.com', 1, 9, ['DIRECT']),
  ]
  const before = structuredClone({ active, closed })
  const [domain] = aggregateDomainTraffic(active, closed)
  expect(domain).toMatchObject({
    host: 'example.com',
    connections: 3,
    upload: 51,
    download: 259,
    total: 310,
  })
  expect(domain.routes).toMatchObject([
    {
      chains: ['Node A', 'Proxy'],
      connections: 2,
      upload: 50,
      download: 250,
      total: 300,
    },
    { chains: ['DIRECT'], connections: 1, total: 10 },
  ])
  expect(aggregateDomainTraffic([], [...active, ...closed.slice(1)])).toEqual([
    domain,
  ])
  expect(aggregateDomainTraffic(active, [])).toMatchObject([{ total: 230 }])
  expect({ active, closed }).toEqual(before)
})

test('keeps full domains, IP-only destinations and unknown routes distinct', () => {
  const ip = connection('3', '', 10, 20, [])
  ip.metadata.destinationIP = '203.0.113.1'
  const remote = connection('4', '', 0, 1, [])
  remote.metadata.remoteDestination = '2001:db8::1'
  const domains = aggregateDomainTraffic(
    [
      connection('1', 'example.com', 1, 1, ['Node / Group']),
      connection('2', 'example.com', 1, 1, ['Node', 'Group']),
      ip,
      remote,
      connection('5', 'api.example.com', 0, 0),
    ],
    [],
  )
  expect(domains.map((item) => item.host)).toEqual([
    'example.com',
    '203.0.113.1',
    '2001:db8::1',
    'api.example.com',
  ])
  expect(domains[0].routes).toHaveLength(2)
  expect(domains[1].routes[0].chains).toEqual([])
  expect(aggregateDomainTraffic([], [])).toEqual([])
})

test('ranks by numeric totals and filters domain names without matching proxy names', () => {
  const domains = aggregateDomainTraffic(
    [
      connection('1', 'small.example', 1, 900, ['large.example']),
      connection('2', 'large.example', 10, 2000),
      connection('3', 'upload.example', 5000, 0),
    ],
    [],
  )
  expect(
    sortDomainTraffic(domains, 'total', 'desc').map((item) => item.host),
  ).toEqual(['upload.example', 'large.example', 'small.example'])
  expect(sortDomainTraffic(domains, 'download', 'desc')[0].host).toBe(
    'large.example',
  )
  expect(sortDomainTraffic(domains, 'upload', 'asc')[0].host).toBe(
    'small.example',
  )
  expect(sortDomainTraffic(domains, 'host', 'asc')[0].host).toBe(
    'large.example',
  )
  expect(domains[0].host).toBe('small.example')
  const { matcher } = compileStringMatcher('LARGE\\.example$', {
    useRegularExpression: true,
  })
  expect(
    domains.filter((item) => matcher(item.host)).map((item) => item.host),
  ).toEqual(['large.example'])
})
