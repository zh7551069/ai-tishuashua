import { Text, View } from '@tarojs/components';

export function ProgressRing(props: { percent: number; color: string }) {
  const percent = Math.max(0, Math.min(100, props.percent));
  return (
    <View
      className="yg-ring"
      style={{ background: `conic-gradient(${props.color} ${percent}%, #e7e5e4 0)` }}
    >
      <View className="yg-ring-hole">
        <Text className="yg-ring-pct">{percent}</Text>
        <Text className="yg-ring-unit">%</Text>
      </View>
    </View>
  );
}
