import { Button, Text, View } from '@tarojs/components';

/** 157:* 最小态：空态灰圆占位 + 主色 CTA；失败态红叹号 + 重试，可附返回。 */
export function LoadingBlock(props: {
  label?: string;
  skeleton?: boolean | 'rows';
  count?: number;
}) {
  if (props.skeleton === 'rows') {
    const count = props.count ?? 5;
    return (
      <View>
        {Array.from({ length: count }, (_, index) => (
          <View key={index} className="u-skel-row">
            <View className="u-skel-dot" />
            <View className="u-skel-lines">
              <View className={index % 2 === 0 ? 'u-skel-line' : 'u-skel-line u-skel-line-mid'} />
              <View className="u-skel-line u-skel-line-short" />
            </View>
            <View className="u-skel-dot u-skel-dot-sm" />
          </View>
        ))}
      </View>
    );
  }
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
  tone?: 'solid' | 'soft';
  fill?: boolean;
  titleSize?: 'md' | 'lg';
}) {
  const buttonClass = props.tone === 'soft' ? 'u-btn-soft u-btn-hug' : 'u-btn u-btn-hug';
  return (
    <View className={props.fill ? 'u-state u-state-fill' : 'u-state'}>
      <View className="u-ph" />
      <Text
        className={props.titleSize === 'lg' ? 'u-state-title u-state-title-lg' : 'u-state-title'}
      >
        {props.title}
      </Text>
      {props.detail ? <Text className="u-state-sub">{props.detail}</Text> : null}
      {props.action && props.onAction ? (
        <Button className={buttonClass} onClick={props.onAction}>
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
