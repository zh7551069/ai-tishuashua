import { Button, Text, View } from '@tarojs/components';

/** 157:* 最小态：空态灰圆占位 + 主色 CTA；失败态红叹号 + 重试，可附返回。 */
export function LoadingBlock(props: { label?: string; skeleton?: boolean }) {
  if (props.skeleton) {
    return (
      <View>
        <View className="u-skel" />
        <View className="u-skel" />
        <View className="u-skel" />
      </View>
    );
  }
  return (
    <View className="u-state">
      <View className="u-spin" />
      <Text className="u-state-title">{props.label || '正在加载'}</Text>
    </View>
  );
}

export function EmptyBlock(props: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="u-state">
      <View className="u-ph" />
      <Text className="u-state-title">{props.title}</Text>
      {props.detail ? <Text className="u-state-sub">{props.detail}</Text> : null}
      {props.action && props.onAction ? (
        <Button className="u-btn u-btn-hug" onClick={props.onAction}>
          {props.action}
        </Button>
      ) : null}
    </View>
  );
}

export function ErrorBlock(props: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onBack?: () => void;
}) {
  return (
    <View className="u-state">
      <View className="u-err">
        <View className="u-err-dot">
          <Text className="u-err-mark">!</Text>
        </View>
      </View>
      <Text className="u-state-title">{props.title || '加载失败'}</Text>
      {props.detail ? <Text className="u-state-sub">{props.detail}</Text> : null}
      {props.onRetry ? (
        <Button className="u-btn u-btn-hug" onClick={props.onRetry}>
          {props.retryLabel || '重试'}
        </Button>
      ) : null}
      {props.onBack ? (
        <Text className="u-text-back" onClick={props.onBack}>
          返回
        </Text>
      ) : null}
    </View>
  );
}
