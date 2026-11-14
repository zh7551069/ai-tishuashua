import { Image } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import female from '../assets/hero/female.jpg';
import male from '../assets/hero/male.jpg';
import { readHeroGender } from '../services/local-prefs';
import type { HeroGender } from '../theme/hero';

const SRC: Record<HeroGender, string> = {
  female,
  male,
};

/** 只读本地性别。没有设置入口，点人物按钮也不会写这个键。 */
export function HeroIllustration(props: { className?: string }) {
  const [gender, setGender] = useState<HeroGender>('female');
  useDidShow(() => {
    setGender(readHeroGender());
  });
  return <Image className={props.className ?? 'yg-hero'} src={SRC[gender]} mode="aspectFill" />;
}
