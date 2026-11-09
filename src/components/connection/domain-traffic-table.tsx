import {
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
} from '@mui/icons-material'
import {
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseEmpty } from '@/components/base'
import { MAX_CLOSED_CONNS_NUM } from '@/hooks/use-connection-data'
import {
  aggregateDomainTraffic,
  sortDomainTraffic,
  type DomainTrafficSortKey,
} from '@/utils/connection-statistics'

import {
  formatConnectionChains,
  formatConnectionTraffic,
} from './connection-row-view'

const PAGE_SIZE = 25
const COLUMNS = [
  { key: 'host', label: 'connections.statistics.domain' },
  { key: 'connections', label: 'connections.statistics.connectionCount' },
  { key: 'upload', label: 'shared.labels.uploaded' },
  { key: 'download', label: 'shared.labels.downloaded' },
  { key: 'total', label: 'connections.statistics.total' },
] as const

interface Props {
  active: IConnectionsItem[]
  closed: IConnectionsItem[]
  match: (host: string) => boolean
}

export const DomainTrafficTable = ({ active, closed, match }: Props) => {
  const { t } = useTranslation()
  const [sorting, setSorting] = useState<{
    key: DomainTrafficSortKey
    direction: 'asc' | 'desc'
  }>({ key: 'total', direction: 'desc' })
  const [pagination, setPagination] = useState({ page: 0, match, sorting })
  const [expandedHost, setExpandedHost] = useState<string | null>(null)

  const domains = useMemo(
    () => aggregateDomainTraffic(active, closed),
    [active, closed],
  )
  const rows = useMemo(
    () =>
      sortDomainTraffic(
        domains.filter((item) => match(item.host)),
        sorting.key,
        sorting.direction,
      ),
    [domains, match, sorting],
  )
  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          upload: sum.upload + row.upload,
          download: sum.download + row.download,
          connections: sum.connections + row.connections,
        }),
        { upload: 0, download: 0, connections: 0 },
      ),
    [rows],
  )
  const currentPage = Math.min(
    pagination.match === match && pagination.sorting === sorting
      ? pagination.page
      : 0,
    Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1),
  )

  const toggleSort = (key: DomainTrafficSortKey) =>
    setSorting((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === 'desc'
            ? 'asc'
            : 'desc'
          : key === 'host'
            ? 'asc'
            : 'desc',
    }))

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="body2">
          {t('connections.statistics.summary', {
            domains: rows.length,
            connections: totals.connections,
            total: formatConnectionTraffic(totals.upload + totals.download),
          })}
          {' · '}
          {t('shared.labels.uploaded')}:{' '}
          {formatConnectionTraffic(totals.upload)}
          {' · '}
          {t('shared.labels.downloaded')}:{' '}
          {formatConnectionTraffic(totals.download)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('connections.statistics.scope', { limit: MAX_CLOSED_CONNS_NUM })}
        </Typography>
      </Box>
      {rows.length === 0 ? (
        <BaseEmpty />
      ) : (
        <>
          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table
              stickyHeader
              size="small"
              aria-label={t('connections.statistics.title')}
              sx={{ minWidth: 680 }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }} />
                  <TableCell>{t('connections.statistics.rank')}</TableCell>
                  {COLUMNS.map(({ key, label }) => (
                    <TableCell
                      key={key}
                      align={key === 'host' ? 'left' : 'right'}
                      sortDirection={
                        sorting.key === key ? sorting.direction : false
                      }
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      <TableSortLabel
                        active={sorting.key === key}
                        direction={
                          sorting.key === key ? sorting.direction : 'desc'
                        }
                        onClick={() => toggleSort(key)}
                      >
                        {t(label)}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map((row, index) => {
                    const expanded = expandedHost === row.host
                    const host =
                      row.host || t('connections.statistics.unknownDestination')
                    return (
                      <Fragment key={row.host}>
                        <TableRow hover>
                          <TableCell>
                            <IconButton
                              size="small"
                              aria-label={t(
                                'connections.statistics.showRoutes',
                                { host },
                              )}
                              aria-expanded={expanded}
                              onClick={() =>
                                setExpandedHost(expanded ? null : row.host)
                              }
                            >
                              {expanded ? (
                                <KeyboardArrowUpRounded />
                              ) : (
                                <KeyboardArrowDownRounded />
                              )}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            {currentPage * PAGE_SIZE + index + 1}
                          </TableCell>
                          <TableCell
                            sx={{
                              minWidth: 200,
                              maxWidth: 360,
                              overflowWrap: 'anywhere',
                            }}
                          >
                            <Typography variant="body2">{host}</Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {formatConnectionChains(row.routes[0].chains) ||
                                t('connections.statistics.unknownRoute')}
                              {row.routes.length > 1 &&
                                ` (+${row.routes.length - 1})`}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{row.connections}</TableCell>
                          <TableCell
                            align="right"
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {formatConnectionTraffic(row.upload)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {formatConnectionTraffic(row.download)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}
                          >
                            {formatConnectionTraffic(row.total)}
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              sx={{ py: 1, bgcolor: 'action.hover' }}
                            >
                              <Table
                                size="small"
                                aria-label={t(
                                  'connections.statistics.showRoutes',
                                  { host },
                                )}
                              >
                                <TableHead>
                                  <TableRow>
                                    <TableCell>
                                      {t(
                                        'connections.components.fields.chains',
                                      )}
                                    </TableCell>
                                    <TableCell align="right">
                                      {t(
                                        'connections.statistics.connectionCount',
                                      )}
                                    </TableCell>
                                    <TableCell align="right">
                                      {t('shared.labels.uploaded')}
                                    </TableCell>
                                    <TableCell align="right">
                                      {t('shared.labels.downloaded')}
                                    </TableCell>
                                    <TableCell align="right">
                                      {t('connections.statistics.total')}
                                    </TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {row.routes.map((route) => (
                                    <TableRow key={route.key}>
                                      <TableCell
                                        sx={{
                                          overflowWrap: 'anywhere',
                                          maxWidth: 360,
                                        }}
                                      >
                                        {formatConnectionChains(route.chains) ||
                                          t(
                                            'connections.statistics.unknownRoute',
                                          )}
                                      </TableCell>
                                      <TableCell align="right">
                                        {route.connections}
                                      </TableCell>
                                      <TableCell
                                        align="right"
                                        sx={{ whiteSpace: 'nowrap' }}
                                      >
                                        {formatConnectionTraffic(route.upload)}
                                      </TableCell>
                                      <TableCell
                                        align="right"
                                        sx={{ whiteSpace: 'nowrap' }}
                                      >
                                        {formatConnectionTraffic(
                                          route.download,
                                        )}
                                      </TableCell>
                                      <TableCell
                                        align="right"
                                        sx={{ whiteSpace: 'nowrap' }}
                                      >
                                        {formatConnectionTraffic(route.total)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={rows.length}
            page={currentPage}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
            onPageChange={(_event, page) =>
              setPagination({ page, match, sorting })
            }
            labelDisplayedRows={({ from, to, count }) =>
              t('connections.statistics.pagination', { from, to, count })
            }
            getItemAriaLabel={(type) =>
              t(
                type === 'previous'
                  ? 'connections.statistics.previousPage'
                  : 'connections.statistics.nextPage',
              )
            }
          />
        </>
      )}
    </Box>
  )
}
