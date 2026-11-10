import { useDidShow } from '@tarojs/taro';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { readThemeId } from '../services/local-prefs';
import { normalizeThemeId, themeCssVars, type ThemeId } from './palettes';

const listeners = new Set<() => void>();

export function notifyThemeChanged(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function themeRootStyle(id: ThemeId): CSSProperties {
  return themeCssVars(normalizeThemeId(id)) as CSSProperties;
}

export function useThemeId(): ThemeId {
  const [themeId, setThemeId] = useState<ThemeId>(() => readThemeId());
  useDidShow(() => {
    setThemeId(readThemeId());
  });
  useEffect(() => subscribeTheme(() => setThemeId(readThemeId())), []);
  return themeId;
}
