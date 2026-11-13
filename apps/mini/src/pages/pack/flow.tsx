import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import iconCheck from './assets/icon-check.png';

const STEPS = ['领域', '证书', '知识点'] as const;

/** 与证书 / 知识点页相同：返回失败则回首页，不写死刷题包列表。 */
export function goBackToHome() {
  void Taro.navigateBack({
    fail: () => {
      void Taro.reLaunch({ url: '/pages/home/index' });
    },
  });
}

/**
 * 本流步骤条。完成步是实心主色勾，当前步是浅黄绿数字。
 * 不改公共 Steps / BridgeSteps，避免带走其它页。
 */
export function FlowSteps(props: { current: 1 | 2 | 3 }) {
  return (
    <View className="flow-steps">
      {STEPS.map((label, index) => {
        const order = index + 1;
        const done = order < props.current;
        const on = order === props.current;
        const dotClass = done
          ? 'flow-dot flow-dot-done'
          : on
            ? 'flow-dot flow-dot-cur'
            : 'flow-dot';
        const nameClass = done
          ? 'flow-name flow-name-done'
          : on
            ? 'flow-name flow-name-cur'
            : 'flow-name';
        return (
          <View
            key={label}
            className={index < STEPS.length - 1 ? 'flow-step flow-step-grow' : 'flow-step'}
          >
            <View className={dotClass}>
              {done ? (
                <Image className="flow-check" src={iconCheck} mode="aspectFit" />
              ) : (
                <Text className={on ? 'flow-num flow-num-cur' : 'flow-num'}>{order}</Text>
              )}
            </View>
            <Text className={nameClass}>{label}</Text>
            {index < STEPS.length - 1 ? (
              <View className={done ? 'flow-sep flow-sep-done' : 'flow-sep'} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** 本流空态。插画只用于有帧的空列表 / 搜索无结果，不替换未出帧的护栏。 */
export function SelectEmpty(props: {
  image?: string;
  art?: 'shelf' | 'search';
  title: string;
  detail?: string;
  action?: string;
  tone?: 'solid' | 'soft';
  fill?: boolean;
  onAction?: () => void;
}) {
  const artClass =
    props.art === 'shelf'
      ? 'select-empty-art select-empty-art-shelf'
      : 'select-empty-art select-empty-art-search';
  const rootClass = [
    'select-empty',
    props.art === 'shelf' ? 'select-empty-shelf' : '',
    props.fill ? 'select-empty-fill' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const buttonClass =
    props.tone === 'soft' ? 'select-empty-btn select-empty-btn-soft' : 'select-empty-btn';
  return (
    <View className={rootClass}>
      {props.image ? <Image className={artClass} src={props.image} mode="aspectFill" /> : null}
      <View className="select-empty-copy">
        <Text className="select-empty-title">{props.title}</Text>
        {props.detail ? <Text className="select-empty-detail">{props.detail}</Text> : null}
        {props.action && props.onAction ? (
          <Button className={buttonClass} onClick={props.onAction}>
            {props.action}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
