/* Loading state for API reads.

   The prototype's data layer could not fail, so no screen had an error path.
   Every screen has one now, and writing it out by hand each time invites the
   two bugs this hook exists to prevent: setting state after the component has
   gone, and letting a slow first response overwrite a fast second one. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

export type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  /** Re-runs the fetch. Safe to pass straight to an onClick. */
  reload: () => void
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}

/**
 * Runs `fn` on mount and whenever `deps` change.
 *
 * @param fn receives an AbortSignal — pass it through to the api call so a
 *           superseded request is actually cancelled, not just ignored.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // Keeping the callback in a ref lets an inline arrow function be passed in
  // without it counting as a dependency and re-fetching on every render.
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setLoading(true)
    setError(null)

    fnRef
      .current(controller.signal)
      .then((result) => {
        if (!active) return
        setData(result)
        setLoading(false)
      })
      .catch((err) => {
        if (!active || controller.signal.aborted) return
        setError(errorMessage(err))
        setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, reload }
}
