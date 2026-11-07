import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Screen } from '../../components/Screen';
import './growth-shell.css';

/** 增长页占位。不是视觉对稿，页内不支付。 */
export function GrowthShell(props: {
  title: string;
  lines: readonly string[];
  actions?: readonly { label: string; url: string }[];
}) {
  return (
    <Screen back centerTitle navPlain title={props.title}>
      <View className="growth-shell">
        <Text className="growth-shell-note">视觉对稿待 UI 技术评审。当前只展示服务端增长态。</Text>
        {props.lines.map((line, index) => (
          <Text key={`${index}-${line}`} className="growth-shell-line">
            {line}
          </Text>
        ))}
        {props.actions?.map((action) => (
          <View
            key={action.url}
            className="growth-shell-row"
            onClick={() => void Taro.navigateTo({ url: action.url })}
          >
            <Text>{action.label}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
