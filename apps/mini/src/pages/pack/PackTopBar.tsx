import { Image, Text, View } from '@tarojs/components';
import iconBack from '../../assets/me-settings/3fbuza.svg';

/**
 * 选证书 / 选知识点共用顶栏。
 * Bridge：白父里的 navbar 与进度条、搜索平级；标题列在返回右侧，左对齐，间距 2。
 * 标题列保持 align-items: baseline，不用 center。
 */
export function PackTopBar(props: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View className="pack-nav">
      <View className="pack-nav-back" onClick={props.onBack}>
        <Image className="u-back-ico" src={iconBack} mode="aspectFit" />
      </View>
      <View className="pack-nav-copy">
        <Text className="pack-nav-title">{props.title}</Text>
        {props.subtitle ? <Text className="pack-nav-sub">{props.subtitle}</Text> : null}
      </View>
    </View>
  );
}
