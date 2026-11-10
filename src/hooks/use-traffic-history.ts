import { useEffect, useState } from 'react'

import { useVisibility } from '@/hooks/use-visibility'
import type { TrafficHistoryView } from '@/services/bindings'
import { getTrafficHistory } from '@/services/cmds'
import {
  trafficTimeRange,
  type TrafficPeriod,
} from '@/utils/connection-statistics'

export interface TrafficSelection {
  period: TrafficPeriod
  start: string
  end: string
}

export const useTrafficHistory = (selection: TrafficSelection) => {
  const visible = useVisibility()
  const [result, setResult] = useState<{
    selection: TrafficSelection
    data?: TrafficHistoryView
    error: boolean
  }>()

  useEffect(() => {
    if (!visible) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      const range = trafficTimeRange(
        selection.period,
        selection.start,
        selection.end,
      )
      if (!range) return
      try {
        const data = await getTrafficHistory(range.from, range.to)
        if (!stopped) setResult({ selection, data, error: false })
      } catch {
        if (!stopped) setResult({ selection, error: true })
      }
      if (!stopped) timer = setTimeout(() => void refresh(), 10_000)
    }
    void refresh()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [selection, visible])

  return result?.selection === selection ? result : undefined
}
