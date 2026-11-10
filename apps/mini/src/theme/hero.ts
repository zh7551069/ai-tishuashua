/**
 * 主图映射以契约补丁 v0.1.1-C 为准，不跟稿面标题。
 * 下面的文件名是权威包里的原图。进小程序包的是同画面缩小后的 jpg，
 * 原图留在 design/bridge-export/TB-36-45，不改导出。
 */

export const HERO_GENDERS = ['female', 'male'] as const;

export type HeroGender = (typeof HERO_GENDERS)[number];

/** 女，默认。单包 / 空态生产也用这张。 */
export const FEMALE_HERO_FILE = '87ad184d1d47140ad2ff33ab81541b711ae95e1e.png';

/** 男，进仓但非默认。 */
export const MALE_HERO_FILE = '44cac9e1d94bf340973772136de0b46c2014f520.png';

export function normalizeHeroGender(value: unknown): HeroGender {
  return value === 'male' ? 'male' : 'female';
}

export function heroSourceFile(gender: HeroGender): string {
  return gender === 'male' ? MALE_HERO_FILE : FEMALE_HERO_FILE;
}
