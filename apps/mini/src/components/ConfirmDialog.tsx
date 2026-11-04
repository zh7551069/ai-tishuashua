import { Button, Text, View } from '@tarojs/components';

export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View className="u-sheet-mask" onClick={props.onCancel}>
      <View className="u-dialog" onClick={(event) => event.stopPropagation()}>
        <Text className="u-dialog-title">{props.title}</Text>
        <Text className="u-dialog-body">{props.body}</Text>
        <View className="u-dialog-actions">
          <Button className="u-btn-ghost" onClick={props.onCancel}>
            {props.cancelText || '取消'}
          </Button>
          <View className="u-dialog-gap" />
          <Button className={props.danger ? 'u-btn-danger' : 'u-btn'} onClick={props.onConfirm}>
            {props.confirmText}
          </Button>
        </View>
      </View>
    </View>
  );
}
