import { Text, View } from '@tarojs/components';

export type WeekStripDay = {
  key: string;
  label: string;
  number: string;
  today: boolean;
  marked: boolean;
};

/** 只统一外观。调用方自己决定数据是练习完成日还是签到，禁止混源。 */
export function WeekStrip(props: { days: WeekStripDay[] }) {
  return (
    <View className="yg-week">
      {props.days.map((day) => (
        <View key={day.key} className="yg-day">
          <Text className="yg-day-label">{day.label}</Text>
          <Text className={day.today ? 'yg-day-num yg-day-today' : 'yg-day-num'}>{day.number}</Text>
          {day.marked ? <View className="yg-dot" /> : <View className="yg-dot-slot" />}
        </View>
      ))}
    </View>
  );
}
