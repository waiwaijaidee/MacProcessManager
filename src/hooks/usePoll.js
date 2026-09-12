import { useEffect, useRef, useState } from 'react'

/**
 * Interval poller that keeps the previous value on screen while a new
 * request is in flight (prevents the UI from flickering between refreshes).
 *
 * @param {() => Promise<any>} loader
 * @param {number} intervalMs pass 0 to pause polling
 */
export function usePoll(loader, intervalMs = 2000, { enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(0)

  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let timer = null

    const tick = async () => {
      try {
        const result = await loaderRef.current()
        if (cancelled) return
        setData(result)
        setError(null)
        setUpdatedAt(Date.now())
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    tick()
    if (intervalMs > 0) timer = setInterval(tick, intervalMs)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [intervalMs, enabled])

  return { data, error, loading, updatedAt, refresh: () => loaderRef.current().then(setData) }
}

/**
 * Keeps a rolling history buffer of numeric samples for sparklines.
 * Returns `[[...values], reset]`.
 */
export function useHistory(value, length = 24) {
  const [series, setSeries] = useState(() => Array.from({ length }, () => 0))
  const lastRef = useRef(null)

  useEffect(() => {
    if (value === null || value === undefined) return
    if (lastRef.current === value) return
    lastRef.current = value
    setSeries((current) => [...current.slice(1), Number(value) || 0])
  }, [value])

  return series
}
