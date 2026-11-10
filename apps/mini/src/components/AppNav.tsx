import { Image, Text, View } from '@tarojs/components';
import type { ReactNode } from 'react';
import iconBack from '../assets/me-settings/3fbuza.svg';

/** 栈页顶栏。选证书 / 选知识点的 PackTopBar 走这里，避免再做一套。 */
export function AppNav(props: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View className="pack-nav">
      {props.onBack ? (
        <View className="pack-nav-back" onClick={props.onBack}>
          <Image className="u-back-ico" src={iconBack} mode="aspectFit" />
        </View>
      ) : (
        <View className="u-back-spacer" />
      )}
      <View className="pack-nav-copy">
        <Text className="pack-nav-title">{props.title}</Text>
        {props.subtitle ? <Text className="pack-nav-sub">{props.subtitle}</Text> : null}
      </View>
      {props.right}
    </View>
  );
}
