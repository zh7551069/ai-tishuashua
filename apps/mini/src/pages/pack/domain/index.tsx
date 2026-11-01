import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { DomainSummary } from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../../components/MiniPage';
import { fetchDomains } from '../../../services/catalog-api';
import { withAuth } from '../../../services/guard';

export default function DomainPage() {
  const [items, setItems] = useState<DomainSummary[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    setError('');
    try {
      const data = await withAuth((token) => fetchDomains(token));
      if (!data) {
        return;
      }
      setItems(data.items);
      setReady(true);
    } catch (caught) {
      setReady(false);
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  return (
    <MiniPage title="选择领域" hint="先选备考领域，再选证书和知识点。">
      {error ? <Text className="error">{error}</Text> : null}
      {!ready && !error ? <Text className="hint">正在加载领域。</Text> : null}
      {ready && items.length === 0 ? <Text className="hint">还没有上架领域。</Text> : null}
      {items.map((item) => (
        <View
          key={item.id}
          className="choice"
          onClick={() => {
            void Taro.navigateTo({ url: `/pages/pack/certificate/index?domainId=${item.id}` });
          }}
        >
          <Text className="tree-name">{item.name}</Text>
        </View>
      ))}
      {error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
    </MiniPage>
  );
}
