import { Text, View } from '@tarojs/components';
import { AppButton } from './AppButton';

export function AppConfirm(props: {
  title: string;
  body: string;
  confirmText: string;
  cancelText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View className="yg-confirm-mask" onClick={props.onCancel}>
      <View className="yg-confirm" onClick={(event) => event.stopPropagation()}>
        <Text className="yg-confirm-title">{props.title}</Text>
        <Text className="yg-confirm-body">{props.body}</Text>
        <View className="yg-confirm-actions">
          <AppButton tone="ghost" label={props.cancelText ?? '取消'} onClick={props.onCancel} />
          <AppButton tone="danger" label={props.confirmText} onClick={props.onConfirm} />
        </View>
      </View>
    </View>
  );
}
