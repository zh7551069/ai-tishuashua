import { Text, View } from '@tarojs/components';
import type { ReactNode } from 'react';

export function ListRow(props: {
  title: string;
  meta?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <View className="yg-row" onClick={props.onClick}>
      {props.leading}
      <View className="yg-row-copy">
        <Text className="yg-row-title">{props.title}</Text>
        {props.meta ? <Text className="yg-row-meta">{props.meta}</Text> : null}
      </View>
      {props.trailing}
    </View>
  );
}
