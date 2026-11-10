import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BasePage, BaseSearchBox } from '@/components/base'
import { formatConnectionTraffic } from '@/components/connection/connection-row-view'
import { DomainTrafficTable } from '@/components/connection/domain-traffic-table'
import { TrafficTimeline } from '@/components/connection/traffic-timeline'
import { usePageSearch } from '@/hooks/use-page-search'
import {
  useTrafficHistory,
  type TrafficSelection,
} from '@/hooks/use-traffic-history'
import type { TrafficRecord } from '@/services/bindings'
import {
  aggregateDomainTraffic,
  aggregateTrafficTimeline,
  localDateTimeInput,
  trafficTimeRange,
  type TrafficPeriod,
} from '@/utils/connection-statistics'

const PERIODS = ['hour', 'today', 'week', 'month', 'custom'] as const
const EMPTY_RECORDS: TrafficRecord[] = []

const TrafficStatisticsPage = () => {
  const { t } = useTranslation()
  const [selection, setSelection] = useState<TrafficSelection>(() => {
    const range = trafficTimeRange('today', '', '')!
    return {
      period: 'today',
      start: localDateTimeInput(range.from),
      end: localDateTimeInput(range.to),
    }
  })
  const { searchState, match, onSearch } = usePageSearch('traffic-statistics')
  const result = useTrafficHistory(selection)
  const validRange = trafficTimeRange(
    selection.period,
    selection.start,
    selection.end,
  )
  const view = result?.data
  const records = view?.history.records ?? EMPTY_RECORDS
  const domains = useMemo(
    () =>
      aggregateDomainTraffic(records).filter((domain) => match(domain.host)),
    [records, match],
  )
  const points = useMemo(
    () => (view ? aggregateTrafficTimeline(view.history, match) : []),
    [view, match],
  )
  const totals = domains.reduce(
    (sum, row) => ({
      upload: sum.upload + row.upload,
      download: sum.download + row.download,
    }),
    { upload: 0, download: 0 },
  )
  const rangeKey = JSON.stringify([selection, searchState])

  return (
    <BasePage
      title={t('connections.statistics.title')}
      contentStyle={{ overflow: 'auto', padding: 16 }}
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {t('connections.statistics.scope')}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <TextField
            select
            size="small"
            label={t('connections.statistics.timeRange')}
            value={selection.period}
            onChange={(event) =>
              setSelection({
                ...selection,
                period: event.target.value as TrafficPeriod,
              })
            }
            sx={{ minWidth: 150 }}
          >
            {PERIODS.map((period) => (
              <MenuItem key={period} value={period}>
                {t(`connections.statistics.periods.${period}`)}
              </MenuItem>
            ))}
          </TextField>
          {selection.period === 'custom' && (
            <>
              <TextField
                type="datetime-local"
                size="small"
                label={t('connections.statistics.from')}
                value={selection.start}
                onChange={(event) =>
                  setSelection({ ...selection, start: event.target.value })
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                type="datetime-local"
                size="small"
                label={t('connections.statistics.to')}
                value={selection.end}
                onChange={(event) =>
                  setSelection({ ...selection, end: event.target.value })
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </>
          )}
          <Box sx={{ flex: 1, minWidth: 240 }}>
            <BaseSearchBox
              placeholder={t('connections.statistics.searchPlaceholder')}
              defaultValue={searchState.text}
              {...searchState}
              onSearch={onSearch}
            />
          </Box>
        </Box>
        {!validRange ? (
          <Alert severity="warning">
            {t('connections.statistics.invalidRange')}
          </Alert>
        ) : result?.error ? (
          <Alert severity="error">
            {t('connections.statistics.loadError')}
          </Alert>
        ) : !view ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Chip
                size="small"
                color={view.status === 'recording' ? 'success' : 'warning'}
                label={t(`connections.statistics.status.${view.status}`)}
              />
              <Typography variant="caption" color="text.secondary">
                {t('connections.statistics.lastSample')}:{' '}
                {view.lastSample
                  ? new Date(view.lastSample).toLocaleString()
                  : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(view.history.from).toLocaleString()} –{' '}
                {new Date(view.history.to).toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {[
                [
                  t('connections.statistics.total'),
                  formatConnectionTraffic(totals.upload + totals.download),
                ],
                [
                  t('shared.labels.uploaded'),
                  formatConnectionTraffic(totals.upload),
                ],
                [
                  t('shared.labels.downloaded'),
                  formatConnectionTraffic(totals.download),
                ],
                [
                  t('connections.statistics.destinations'),
                  String(domains.length),
                ],
              ].map(([label, value]) => (
                <Box
                  key={label}
                  sx={{
                    flex: 1,
                    minWidth: 130,
                    p: 1.5,
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="h6">{value}</Typography>
                </Box>
              ))}
            </Box>
            <TrafficTimeline
              points={points}
              intervalMs={view.history.intervalMs}
              to={view.history.to}
            />
            <DomainTrafficTable domains={domains} rangeKey={rangeKey} />
          </>
        )}
      </Stack>
    </BasePage>
  )
}

export default TrafficStatisticsPage
