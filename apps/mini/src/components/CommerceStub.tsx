import { Text, View } from '@tarojs/components';
import { Screen } from './Screen';
import './exhausted-sheet.css';

/** 商业化占位。不能在这里下单或拉起支付。 */
export function CommerceStub(props: { title: string }) {
  return (
    <Screen back centerTitle navPlain title={props.title}>
      <View className="exh-stub">
        <Text className="exh-stub-title">即将上线</Text>
      </View>
    </Screen>
  );
}
