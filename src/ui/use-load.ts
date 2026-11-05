import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { ApiError } from "./api.ts";

export interface Loaded<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  retry: () => void;
  setData: (update: (current: T) => T) => void;
}

function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Inbox Tidy didn't finish loading this. Please try again.";
}

// `key` identifies what is shown: a new key clears the old data so it never masquerades as the
// new result. A new `version` or `refine` with the same key refetches and keeps the old data
// on screen until the answer arrives.
export function useLoad<T>(
  fetcher: () => Promise<T>,
  key: string,
  version: number,
  refine = "",
): Loaded<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const shownKey = useRef<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const id = ++latest.current;
    if (shownKey.current !== key) {
      shownKey.current = key;
      setDataState(undefined);
    }
    setLoading(true);
    setError(null);
    fetcherRef.current().then(
      (result) => {
        if (id !== latest.current) return;
        setDataState(result);
        setLoading(false);
      },
      (e: unknown) => {
        if (id !== latest.current) return;
        setError(messageOf(e));
        setLoading(false);
      },
    );
  }, [key, version, refine, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback((update: (current: T) => T) => {
    setDataState((current) => (current === undefined ? current : update(current)));
  }, []);

  return { data, error, loading, retry, setData };
}
