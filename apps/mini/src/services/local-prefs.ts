import Taro from '@tarojs/taro';
import { applyCheckin, EMPTY_CHECKIN, type CheckinState } from './me-model';
import { readToken, saveToken } from './session';

const CHECKIN_KEY = 'tishuashua.checkin';
const THEME_KEY = 'tishuashua.theme';
const NOTIFY_KEY = 'tishuashua.notify';

/** 主色取自附件色块 SVG。浅底只在 Bridge 的默认蓝选中态里出现，其余四色按同样的浅底关系配出。 */
export const THEME_IDS = ['blue', 'teal', 'violet', 'orange', 'rose'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeSpec = {
  id: ThemeId;
  name: string;
  color: string;
  soft: string;
  line: string;
  chip: string;
};

export const THEMES: readonly ThemeSpec[] = [
  {
    id: 'blue',
    name: '默认蓝',
    color: '#2563EB',
    soft: '#EFF6FF',
    line: '#93C5FD',
    chip: '#BFDBFE',
  },
  { id: 'teal', name: '青绿', color: '#0D9488', soft: '#F0FDFA', line: '#5EEAD4', chip: '#99F6E4' },
  { id: 'violet', name: '紫', color: '#7C3AED', soft: '#F5F3FF', line: '#C4B5FD', chip: '#DDD6FE' },
  { id: 'orange', name: '橙', color: '#EA580C', soft: '#FFF7ED', line: '#FDBA74', chip: '#FED7AA' },
  { id: 'rose', name: '玫红', color: '#E11D48', soft: '#FFF1F2', line: '#FDA4AF', chip: '#FECDD3' },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export function themeById(id: ThemeId): ThemeSpec {
  return THEMES.find((item) => item.id === id) ?? THEMES[0];
}

export function readThemeId(): ThemeId {
  try {
    const value: unknown = Taro.getStorageSync(THEME_KEY);
    if (isThemeId(value)) {
      return value;
    }
  } catch {
    return 'blue';
  }
  return 'blue';
}

export function saveThemeId(id: ThemeId): void {
  Taro.setStorageSync(THEME_KEY, id);
}

export type NotifyPrefs = { practice: boolean; wrong: boolean };

const DEFAULT_NOTIFY: NotifyPrefs = { practice: true, wrong: false };

export function readNotify(): NotifyPrefs {
  try {
    const value: unknown = Taro.getStorageSync(NOTIFY_KEY);
    if (!value || typeof value !== 'object') {
      return DEFAULT_NOTIFY;
    }
    const record = value as { practice?: unknown; wrong?: unknown };
    return {
      practice: typeof record.practice === 'boolean' ? record.practice : DEFAULT_NOTIFY.practice,
      wrong: typeof record.wrong === 'boolean' ? record.wrong : DEFAULT_NOTIFY.wrong,
    };
  } catch {
    return DEFAULT_NOTIFY;
  }
}

export function saveNotify(prefs: NotifyPrefs): void {
  Taro.setStorageSync(NOTIFY_KEY, prefs);
}

export function readCheckin(): CheckinState {
  try {
    const value: unknown = Taro.getStorageSync(CHECKIN_KEY);
    if (!value || typeof value !== 'object') {
      return EMPTY_CHECKIN;
    }
    const record = value as { last?: unknown; streak?: unknown };
    const last = typeof record.last === 'string' ? record.last : '';
    const streak =
      typeof record.streak === 'number' && record.streak > 0 ? Math.floor(record.streak) : 0;
    return { last, streak };
  } catch {
    return EMPTY_CHECKIN;
  }
}

export function saveCheckin(state: CheckinState): void {
  Taro.setStorageSync(CHECKIN_KEY, state);
}

export function checkInToday(today: string): CheckinState {
  const next = applyCheckin(readCheckin(), today);
  saveCheckin(next);
  return next;
}

export function readCacheKb(): number {
  try {
    const size = Taro.getStorageInfoSync().currentSize;
    return typeof size === 'number' && size > 0 ? size : 0;
  } catch {
    return 0;
  }
}

/** 清掉其余本地缓存，保留登录态、主题、签到和通知开关。 */
export function clearDisposableCache(): number {
  const token = readToken();
  const theme = readThemeId();
  const checkin = readCheckin();
  const notify = readNotify();
  try {
    Taro.clearStorageSync();
  } catch {
    return readCacheKb();
  }
  if (token) {
    saveToken(token);
  }
  saveThemeId(theme);
  saveCheckin(checkin);
  saveNotify(notify);
  return readCacheKb();
}
