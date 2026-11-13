/**
 * 四套主题。黄绿 / 森绿的按钮、芯片色来自「我（新）」主题色帧与森绿变体预览。
 * 茶绿 / 暖芽帧里只有色点 SVG，没有预览条：accent 用色点填色，
 * accent700 / accent100 / tint 按森绿预览的角色（按钮=色点、字更深、描边更浅、底更淡）从色点推出。
 * 插画不在这里，不随主题改色。
 */

export const THEME_IDS = ['yellow-green', 'forest', 'tea', 'warm-sprout'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type Palette = {
  id: ThemeId;
  name: string;
  /** 主按钮。黄绿 #8ECA3A，森绿预览 rgb(63,92,37)，茶绿 / 暖芽为色点。 */
  accent: string;
  /** 选中描边。黄绿芯片 rgb(192,228,96)，森绿芯片 rgb(107,143,58)。 */
  accent100: string;
  /** 强调字。黄绿 rgb(77,124,15)，森绿芯片字 rgb(44,66,24)。 */
  accent700: string;
  /** 选中浅底。黄绿 rgb(244,248,232)，森绿 rgb(238,243,230)。 */
  tint: string;
  ink: string;
  muted: string;
  canvas: string;
  surface: string;
};

const INK = '#1C1917';
const MUTED = '#78716C';
const CANVAS = '#f5f5f7';
const SURFACE = '#FFFFFF';

export const PALETTES: readonly Palette[] = [
  {
    id: 'yellow-green',
    name: '黄绿',
    accent: '#8ECA3A',
    accent100: '#C0E460',
    accent700: '#4D7C0F',
    tint: '#F4F8E8',
    ink: INK,
    muted: MUTED,
    canvas: CANVAS,
    surface: SURFACE,
  },
  {
    id: 'forest',
    name: '森绿',
    accent: '#3F5C25',
    accent100: '#6B8F3A',
    accent700: '#2C4218',
    tint: '#EEF3E6',
    ink: INK,
    muted: MUTED,
    canvas: CANVAS,
    surface: SURFACE,
  },
  {
    id: 'tea',
    name: '茶绿',
    accent: '#7A8B54',
    accent100: '#BDC5AA',
    accent700: '#4C5634',
    tint: '#EFF1EA',
    ink: INK,
    muted: MUTED,
    canvas: CANVAS,
    surface: SURFACE,
  },
  {
    id: 'warm-sprout',
    name: '暖芽',
    accent: '#C6A63A',
    accent100: '#E3D29D',
    accent700: '#7B6724',
    tint: '#F8F4E7',
    ink: INK,
    muted: MUTED,
    canvas: CANVAS,
    surface: SURFACE,
  },
];

const LEGACY_THEME_IDS = ['blue', 'teal', 'violet', 'orange', 'rose'] as const;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** 旧五套和未知值一律回落黄绿。 */
export function normalizeThemeId(value: unknown): ThemeId {
  if (isThemeId(value)) {
    return value;
  }
  if (typeof value === 'string' && (LEGACY_THEME_IDS as readonly string[]).includes(value)) {
    return 'yellow-green';
  }
  return 'yellow-green';
}

export function paletteById(id: ThemeId): Palette {
  return PALETTES.find((item) => item.id === id) ?? PALETTES[0]!;
}

export function themeClassName(id: ThemeId): string {
  return `ts-theme ts-theme-${id}`;
}

/** 打到页面根节点的变量。只换按钮 / 选中 / 强调，画布和插画不改。 */
export function themeCssVars(id: ThemeId): Record<string, string> {
  const palette = paletteById(id);
  return {
    '--ts-accent': palette.accent,
    '--ts-accent-100': palette.accent100,
    '--ts-accent-700': palette.accent700,
    '--ts-tint': palette.tint,
    '--ts-ink': palette.ink,
    '--ts-muted': palette.muted,
    '--ts-canvas': palette.canvas,
    '--ts-surface': palette.surface,
    '--ts-warning': '#D97706',
    '--ts-warning-bg': '#FFF7ED',
    '--ts-terra': '#C0563C',
    '--ts-terra-bg': '#F6EBE7',
    '--ts-terra-dark': '#9A3F2C',
  };
}
