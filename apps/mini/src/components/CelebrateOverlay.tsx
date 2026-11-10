import { View } from '@tarojs/components';
import type { ReactNode } from 'react';

/** 全屏庆祝层。错题本今日战绩沿用原卡片，只收进这一层。 */
export function CelebrateOverlay(props: { onClose: () => void; children: ReactNode }) {
  return (
    <View className="wb-celebrate yg-celebrate" catchMove onClick={props.onClose}>
      {props.children}
    </View>
  );
}
