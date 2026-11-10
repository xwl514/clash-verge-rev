import { ExpandMoreRounded } from '@mui/icons-material'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useTranslation } from 'react-i18next'

import type { aggregateTrafficTimeline } from '@/utils/connection-statistics'

import { formatConnectionTraffic } from './connection-row-view'

interface Props {
  points: ReturnType<typeof aggregateTrafficTimeline>
  intervalMs: number
  to: number
}

export const TrafficTimeline = ({ points, intervalMs, to }: Props) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const maximum = Math.max(
    1,
    ...points.map((point) => point.upload + point.download),
  )
  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString([], {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  const interval = (timestamp: number) =>
    `${formatTime(timestamp)} – ${formatTime(Math.min(timestamp + intervalMs, to))}`
  return (
    <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <Typography variant="subtitle2">
        {t('connections.statistics.timeline')}
      </Typography>
      <Box
        component="svg"
        role="img"
        aria-label={t('connections.statistics.timeline')}
        viewBox="0 0 720 100"
        preserveAspectRatio="none"
        sx={{ width: '100%', height: 100, display: 'block', mt: 1 }}
      >
        {points.map((point, index) => {
          const width = 720 / points.length
          const upload = (point.upload / maximum) * 95
          const download = (point.download / maximum) * 95
          return (
            <g key={point.timestamp}>
              <title>{`${interval(point.timestamp)}\n${t('shared.labels.uploaded')}: ${formatConnectionTraffic(point.upload)}\n${t('shared.labels.downloaded')}: ${formatConnectionTraffic(point.download)}`}</title>
              <Box
                component="rect"
                x={index * width}
                y={100 - download}
                width={Math.max(1, width - 1)}
                height={download}
                fill={theme.palette.primary.main}
              />
              <Box
                component="rect"
                x={index * width}
                y={100 - download - upload}
                width={Math.max(1, width - 1)}
                height={upload}
                fill={theme.palette.warning.main}
              />
            </g>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="caption">
          {points.length > 0 && formatTime(points[0].timestamp)}
        </Typography>
        <Typography variant="caption">
          <Box component="span" sx={{ color: 'primary.main' }}>
            {t('shared.labels.downloaded')}
          </Box>
          {' · '}
          <Box component="span" sx={{ color: 'warning.main' }}>
            {t('shared.labels.uploaded')}
          </Box>
        </Typography>
        <Typography variant="caption">{formatTime(to)}</Typography>
      </Box>
      <Accordion
        disableGutters
        elevation={0}
        sx={{ mt: 1, '&::before': { display: 'none' } }}
      >
        <AccordionSummary expandIcon={<ExpandMoreRounded />} sx={{ px: 0 }}>
          <Typography variant="body2">
            {t('connections.statistics.timeDetails')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <TableContainer sx={{ maxHeight: 280 }}>
            <Table
              stickyHeader
              size="small"
              aria-label={t('connections.statistics.timeDetails')}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t('connections.statistics.timeRange')}</TableCell>
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
                {points.map((point) => (
                  <TableRow key={point.timestamp}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {interval(point.timestamp)}
                    </TableCell>
                    <TableCell align="right">
                      {formatConnectionTraffic(point.upload)}
                    </TableCell>
                    <TableCell align="right">
                      {formatConnectionTraffic(point.download)}
                    </TableCell>
                    <TableCell align="right">
                      {formatConnectionTraffic(point.upload + point.download)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AccordionDetails>
      </Accordion>
    </Box>
  )
}
