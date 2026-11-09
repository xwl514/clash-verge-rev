interface TrafficTotals {
  connections: number
  upload: number
  download: number
  total: number
}

interface RouteTraffic extends TrafficTotals {
  key: string
  chains: string[]
}

interface DomainTraffic extends TrafficTotals {
  host: string
  routes: RouteTraffic[]
}

export type DomainTrafficSortKey = 'host' | keyof TrafficTotals

const emptyTotals = (): TrafficTotals => ({
  connections: 0,
  upload: 0,
  download: 0,
  total: 0,
})

const addConnection = (totals: TrafficTotals, connection: IConnectionsItem) => {
  totals.connections += 1
  totals.upload += connection.upload
  totals.download += connection.download
  totals.total += connection.upload + connection.download
}

export const aggregateDomainTraffic = (
  active: IConnectionsItem[],
  closed: IConnectionsItem[],
): DomainTraffic[] => {
  // A connection can reappear after the monitor reconnects; prefer its live counters.
  const connections = new Map(closed.map((item) => [item.id, item]))
  for (const connection of active) connections.set(connection.id, connection)

  const domains = new Map<
    string,
    TrafficTotals & { routes: Map<string, RouteTraffic> }
  >()

  for (const connection of connections.values()) {
    const { metadata, chains } = connection
    const host = (
      metadata.host ||
      metadata.destinationIP ||
      metadata.remoteDestination ||
      ''
    )
      .toLowerCase()
      .replace(/\.$/, '')
    let domain = domains.get(host)
    if (!domain) {
      domain = { ...emptyTotals(), routes: new Map() }
      domains.set(host, domain)
    }
    addConnection(domain, connection)

    const key = JSON.stringify(chains)
    let route = domain.routes.get(key)
    if (!route) {
      route = { ...emptyTotals(), key, chains }
      domain.routes.set(key, route)
    }
    addConnection(route, connection)
  }

  return Array.from(domains, ([host, domain]) => ({
    ...domain,
    host,
    routes: Array.from(domain.routes.values()).sort(
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
