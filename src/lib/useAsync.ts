import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

/**
 * Run an async function whenever `deps` change; abort stale runs.
 * Returns the state plus a `retry` callback.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    fn(ctrl.signal).then(
      (data) => !ctrl.signal.aborted && setState({ status: 'success', data }),
      (error: Error) => {
        if (ctrl.signal.aborted || error?.name === 'AbortError') return;
        setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
