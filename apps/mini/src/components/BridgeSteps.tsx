import { Image, Text, View } from '@tarojs/components';
import iconCheck from '../pages/pack/assets/icon-check.png';

const STEPS = ['领域', '证书', '知识点'];

/** 证书 / 知识点步骤条。勾选用 Bridge 导出的对勾，领域页仍走 Steps。 */
export function BridgeSteps(props: {
  current: 1 | 2 | 3;
  numWeight: 'bold' | 'regular';
  ring?: boolean;
}) {
  return (
    <View className="bridge-steps">
      {STEPS.map((label, index) => {
        const order = index + 1;
        const on = order === props.current;
        const done = order < props.current;
        const dotClass = [
          'bridge-dot',
          on || done ? 'bridge-dot-on' : '',
          on && props.ring ? 'bridge-dot-ring' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const numClass = on
          ? `bridge-num bridge-num-on${props.numWeight === 'bold' ? ' bridge-num-bold' : ''}`
          : 'bridge-num';
        return (
          <View key={label} className="bridge-step">
            <View className={dotClass}>
              {done ? (
                <Image className="bridge-check" src={iconCheck} mode="aspectFit" />
              ) : (
                <Text className={numClass}>{order}</Text>
              )}
            </View>
            <Text className={on ? 'bridge-name bridge-name-on' : 'bridge-name'}>{label}</Text>
            {index < STEPS.length - 1 ? (
              <View className={done ? 'bridge-sep bridge-sep-on' : 'bridge-sep'} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
