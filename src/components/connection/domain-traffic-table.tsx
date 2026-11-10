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
import {
  type DomainTraffic,
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
  { key: 'upload', label: 'shared.labels.uploaded' },
  { key: 'download', label: 'shared.labels.downloaded' },
  { key: 'total', label: 'connections.statistics.total' },
  { key: 'lastSeen', label: 'connections.statistics.lastSeen' },
] as const

interface Props {
  domains: DomainTraffic[]
  rangeKey: string
}

export const DomainTrafficTable = ({ domains, rangeKey }: Props) => {
  const { t } = useTranslation()
  const [sorting, setSorting] = useState<{
    key: DomainTrafficSortKey
    direction: 'asc' | 'desc'
  }>({ key: 'total', direction: 'desc' })
  const [pagination, setPagination] = useState({ page: 0, rangeKey, sorting })
  const [expandedHost, setExpandedHost] = useState<string | null>(null)

  const rows = useMemo(
    () => sortDomainTraffic(domains, sorting.key, sorting.direction),
    [domains, sorting],
  )
  const currentPage = Math.min(
    pagination.rangeKey === rangeKey && pagination.sorting === sorting
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
    <Box>
      {rows.length === 0 ? (
        <BaseEmpty />
      ) : (
        <>
          <TableContainer>
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
                          <TableCell
                            align="right"
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {new Date(row.lastSeen).toLocaleString()}
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
                                      {t('connections.statistics.firstSeen')}
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
                                        {new Date(
                                          route.firstSeen,
                                        ).toLocaleString()}
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
              setPagination({ page, rangeKey, sorting })
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
