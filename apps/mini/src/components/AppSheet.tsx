import { Text, View } from '@tarojs/components';
import type { ReactNode } from 'react';

export function AppSheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <View className="yg-sheet-mask" onClick={props.onClose}>
      <View className="yg-sheet" onClick={(event) => event.stopPropagation()}>
        <Text className="yg-sheet-title">{props.title}</Text>
        {props.children}
      </View>
    </View>
  );
}
