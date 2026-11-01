import { Text, View } from '@tarojs/components';
import type { PackView } from '@tishuashua/shared';

export function PackContextCard(props: { pack: PackView }) {
  const pack = props.pack;
  const chips = pack.knowledgePoints.slice(0, 8);
  const extra = pack.knowledgePointCount - chips.length;
  return (
    <View className={pack.unavailable ? 'card card-off' : 'card'}>
      <View className="card-head">
        <Text className="tree-name">{pack.name}</Text>
        {pack.unavailable ? <Text className="badge">不可用</Text> : null}
      </View>
      <Text className="meta">
        {pack.certName} · {pack.domainName}
      </Text>
      <Text className="meta">
        {pack.knowledgePointCount} 个知识点 · 总分 {pack.totalScore}
      </Text>
      {pack.unavailable ? (
        <Text className="meta">关联证书已下架，不能出题</Text>
      ) : (
        <View className="chips">
          {chips.map((item) => (
            <Text key={item.id} className="chip">
              {item.name}
            </Text>
          ))}
          {extra > 0 ? <Text className="chip">+{extra}</Text> : null}
        </View>
      )}
    </View>
  );
}
