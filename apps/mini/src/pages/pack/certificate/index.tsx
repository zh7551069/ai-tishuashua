import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import type { CertificateSummary } from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../../components/MiniPage';
import { fetchCertificates } from '../../../services/catalog-api';
import { withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';

export default function CertificatePage() {
  const domainId = queryValue(useRouter().params.domainId);
  const [items, setItems] = useState<CertificateSummary[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    if (!domainId) {
      setError('缺少领域');
      setReady(false);
      return;
    }
    setError('');
    try {
      const data = await withAuth((token) => fetchCertificates(token, domainId));
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
    <MiniPage title="选择证书" hint="只显示已上架的证书。">
      {error ? <Text className="error">{error}</Text> : null}
      {!ready && !error ? <Text className="hint">正在加载证书。</Text> : null}
      {ready && items.length === 0 ? (
        <Text className="hint">这个领域下还没有上架证书。</Text>
      ) : null}
      {items.map((item) => (
        <View
          key={item.id}
          className="choice"
          onClick={() => {
            void Taro.navigateTo({
              url: `/pages/pack/knowledge/index?domainId=${domainId}&certId=${item.id}`,
            });
          }}
        >
          <Text className="tree-name">{item.name}</Text>
          <Text className="meta">{passLine(item)}</Text>
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

function passLine(item: CertificateSummary): string {
  const pass = item.passScore === null ? '默认 60' : String(item.passScore);
  return `总分 ${item.totalScore} · 及格线 ${pass}`;
}
