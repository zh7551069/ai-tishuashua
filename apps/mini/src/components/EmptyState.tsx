import { Text, View } from '@tarojs/components';
import type { ReactNode } from 'react';

export function EmptyState(props: {
  title: string;
  body: string;
  action?: string;
  hint?: string;
  art?: ReactNode;
  onAction?: () => void;
}) {
  return (
    <View className="yg-empty">
      {props.art}
      <Text className="yg-empty-title">{props.title}</Text>
      <Text className="yg-empty-body">{props.body}</Text>
      {props.action ? (
        <Text className="yg-empty-action" onClick={props.onAction}>
          {props.action}
        </Text>
      ) : null}
      {props.hint ? <Text className="yg-empty-hint">{props.hint}</Text> : null}
    </View>
  );
}
