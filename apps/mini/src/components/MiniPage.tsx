import { Text, View } from '@tarojs/components';
import type { ReactNode } from 'react';

export function MiniPage(props: { title: string; hint: string; children?: ReactNode }) {
  return (
    <View className="page">
      <Text className="title">{props.title}</Text>
      <Text className="hint">{props.hint}</Text>
      {props.children}
    </View>
  );
}
