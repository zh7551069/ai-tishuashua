import { Text, View } from '@tarojs/components';

const STEPS = ['领域', '证书', '知识点'];

export function Steps(props: { current: 1 | 2 | 3; className?: string }) {
  const className = props.className ? `u-steps ${props.className}` : 'u-steps';
  return (
    <View className={className}>
      {STEPS.map((label, index) => {
        const order = index + 1;
        const on = order === props.current;
        const done = order < props.current;
        return (
          <View key={label} className="u-step">
            <View className={on || done ? 'u-step-dot u-step-dot-on' : 'u-step-dot'}>
              <Text className={on || done ? 'u-step-num-on' : 'u-step-num'}>
                {done ? '✓' : order}
              </Text>
            </View>
            <Text className={on ? 'u-step-name u-step-name-on' : 'u-step-name'}>{label}</Text>
            {index < STEPS.length - 1 ? (
              <View className={done ? 'u-step-line u-step-line-on' : 'u-step-line'} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
