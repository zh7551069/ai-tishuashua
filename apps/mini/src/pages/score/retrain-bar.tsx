import { Button, Text, View } from '@tarojs/components';
import { wrongSetRetrainLabel } from '../../services/wrong-set-retrain';

/**
 * 错题回顾钉底栏。N>0 时左「返回结果」次按钮、右「再练这 N 道」主按钮。
 * N 必须是未过滤错题总数，不随知识点 chip 变化。
 */
export function RetrainBar(props: {
  count: number;
  busy: boolean;
  onBack: () => void;
  onRetrain: () => void;
}) {
  const label = wrongSetRetrainLabel(props.count);
  if (!label) {
    return (
      <Button className="wr-primary wr-primary-full" hoverClass="none" onClick={props.onBack}>
        <Text className="wr-primary-label">返回结果</Text>
      </Button>
    );
  }
  return (
    <View className="wr-actions">
      <Button className="wr-secondary" hoverClass="none" onClick={props.onBack}>
        <Text className="wr-secondary-label">返回结果</Text>
      </Button>
      <Button
        className="wr-primary"
        hoverClass="none"
        disabled={props.busy}
        onClick={props.busy ? undefined : props.onRetrain}
      >
        <Text className="wr-primary-label">{label}</Text>
      </Button>
    </View>
  );
}
