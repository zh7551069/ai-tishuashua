import { Button, Text, View } from '@tarojs/components';

export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
  solid?: boolean;
  align?: 'center' | 'start';
  mask?: 'default' | 'strong';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmClass = props.solid ? 'u-btn-solid-danger' : props.danger ? 'u-btn-danger' : 'u-btn';
  const lines = props.body.split('\n');
  return (
    <View
      className={props.mask === 'strong' ? 'u-sheet-mask u-mask-strong' : 'u-sheet-mask'}
      onClick={(event) => {
        event.stopPropagation();
        props.onCancel();
      }}
    >
      <View
        className={props.align === 'start' ? 'u-dialog u-dialog-start' : 'u-dialog'}
        onClick={(event) => event.stopPropagation()}
      >
        <Text className="u-dialog-title">{props.title}</Text>
        <View className="u-dialog-body">
          {lines.map((line, index) => (
            <Text key={`${index}-${line}`} className="u-dialog-line">
              {line}
            </Text>
          ))}
        </View>
        <View className="u-dialog-actions">
          <Button className="u-btn-ghost" onClick={props.onCancel}>
            {props.cancelText || '取消'}
          </Button>
          <View className="u-dialog-gap" />
          <Button className={confirmClass} onClick={props.onConfirm}>
            {props.confirmText}
          </Button>
        </View>
      </View>
    </View>
  );
}
