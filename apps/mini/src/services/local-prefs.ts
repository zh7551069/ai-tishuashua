import Taro from '@tarojs/taro';
import { normalizeHeroGender, type HeroGender } from '../theme/hero';
import {
  PALETTES,
  isThemeId,
  normalizeThemeId,
  THEME_IDS,
  type ThemeId,
} from '../theme/palettes';
import { applyCheckin, EMPTY_CHECKIN, type CheckinState } from './me-model';
import { readToken, saveToken } from './session';

const CHECKIN_KEY = 'tishuashua.checkin';
const THEME_KEY = 'tishuashua.theme';
const NOTIFY_KEY = 'tishuashua.notify';
const HERO_GENDER_KEY = 'tishuashua.heroGender';

export { THEME_IDS, isThemeId, type ThemeId };

export type ThemeSpec = {
  id: ThemeId;
  name: string;
  color: string;
  soft: string;
  line: string;
  chip: string;
};

export const THEMES: readonly ThemeSpec[] = PALETTES.map((palette) => ({
  id: palette.id,
  name: palette.name,
  color: palette.accent,
  soft: palette.tint,
  line: palette.accent100,
  chip: palette.accent100,
}));

export function themeById(id: ThemeId): ThemeSpec {
  return THEMES.find((item) => item.id === id) ?? THEMES[0]!;
}

export function readThemeId(): ThemeId {
  try {
    return normalizeThemeId(Taro.getStorageSync(THEME_KEY));
  } catch {
    return 'yellow-green';
  }
}

export function saveThemeId(id: ThemeId): void {
  Taro.setStorageSync(THEME_KEY, normalizeThemeId(id));
}

export function readHeroGender(): HeroGender {
  try {
    return normalizeHeroGender(Taro.getStorageSync(HERO_GENDER_KEY));
  } catch {
    return 'female';
  }
}

/** 本期没有设置入口。测试或以后的调试可以写这个键，界面不要调用。 */
export function saveHeroGender(gender: HeroGender): void {
  Taro.setStorageSync(HERO_GENDER_KEY, normalizeHeroGender(gender));
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

/** 清掉其余本地缓存，保留登录态、主题、主图性别、签到和通知开关。 */
export function clearDisposableCache(): number {
  const token = readToken();
  const theme = readThemeId();
  const heroGender = readHeroGender();
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
  saveHeroGender(heroGender);
  saveCheckin(checkin);
  saveNotify(notify);
  return readCacheKb();
}
