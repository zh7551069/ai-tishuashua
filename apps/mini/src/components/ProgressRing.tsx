import { Text, View } from '@tarojs/components';

/** 不传 track / caps 时外观与原来一致。首页英雄环才打开圆头。 */
export function ProgressRing(props: {
  percent: number;
  color: string;
  track?: string;
  caps?: boolean;
}) {
  const percent = Math.max(0, Math.min(100, props.percent));
  const track = props.track ?? '#e7e5e4';
  return (
    <View
      className={props.caps ? 'yg-ring yg-ring-caps' : 'yg-ring'}
      style={{ background: `conic-gradient(${props.color} ${percent}%, ${track} 0)` }}
    >
      {props.caps && percent > 0 ? (
        <View className="yg-ring-cap" style={{ backgroundColor: props.color }} />
      ) : null}
      {props.caps && percent > 0 && percent < 100 ? (
        <View className="yg-ring-rotor" style={{ transform: `rotate(${percent * 3.6}deg)` }}>
          <View className="yg-ring-cap" style={{ backgroundColor: props.color }} />
        </View>
      ) : null}
      <View className="yg-ring-hole">
        <Text className="yg-ring-pct">{percent}</Text>
        <Text className="yg-ring-unit">%</Text>
      </View>
    </View>
  );
}
