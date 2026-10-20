import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from './storage';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'cc:theme';

function systemDark() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
  window.dispatchEvent(new Event('cc:themechange'));
}

export function useThemePref() {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem(KEY) as ThemePref | null) ?? 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    apply(pref);
    if (pref !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const update = useCallback((p: ThemePref) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
    setPref(p);
  }, []);

  return [pref, update] as const;
}

/** Reactive "is the dark class on <html>?" */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('cc:themechange', cb);
      return () => window.removeEventListener('cc:themechange', cb);
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

/** Persisted state helper (localStorage, JSON). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readJSON(key, initial));
  useEffect(() => {
    writeJSON(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
