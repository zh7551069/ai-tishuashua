import { Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import type { CertificateSummary } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { Steps } from '../../../components/Steps';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchCertificates, fetchDomains } from '../../../services/catalog-api';
import { withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';

export default function CertificatePage() {
  const domainId = queryValue(useRouter().params.domainId);
  const [items, setItems] = useState<CertificateSummary[]>([]);
  const [domainName, setDomainName] = useState('');
  const [query, setQuery] = useState('');
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
      const data = await withAuth(async (token) => {
        const [certs, domains] = await Promise.all([
          fetchCertificates(token, domainId),
          fetchDomains(token),
        ]);
        return { certs, domains };
      });
      if (!data) {
        return;
      }
      setItems(data.certs.items);
      setDomainName(data.domains.items.find((item) => item.id === domainId)?.name ?? '');
      setReady(true);
    } catch (caught) {
      setReady(false);
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  const visible = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) {
      return items;
    }
    return items.filter((item) => item.name.includes(keyword));
  }, [items, query]);

  return (
    <Screen back title="选择证书" subtitle={domainName ? `领域 · ${domainName}` : undefined}>
      <Steps current={2} />
      <View className="u-pad">
        <View className="u-search">
          <Text className="u-search-mark">⌕</Text>
          <Input
            className="u-search-input"
            placeholder="搜索证书"
            placeholderStyle="color:#9ca3af"
            value={query}
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>
        {!ready && !error ? <LoadingBlock skeleton /> : null}
        {error ? (
          <ErrorBlock
            detail={error}
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {ready && visible.length === 0 ? (
          <EmptyBlock
            title="暂无证书"
            detail="该领域下暂无可用证书"
            action="返回领域"
            onAction={() => void Taro.navigateBack()}
          />
        ) : null}
        {ready && visible.length > 0 ? (
          <Text className="u-section">
            {domainName || '证书'} · {visible.length} 个证书
          </Text>
        ) : null}
        {visible.map((item) => (
          <View
            key={item.id}
            className="u-card"
            onClick={() => {
              void Taro.navigateTo({
                url: `/pages/pack/knowledge/index?domainId=${domainId}&certId=${item.id}`,
              });
            }}
          >
            <View className="u-card-copy">
              <Text className="u-card-title">{item.name}</Text>
              <Text className="u-card-sub">{passLine(item)}</Text>
            </View>
            <Text className="u-chev">›</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function passLine(item: CertificateSummary): string {
  const pass = item.passScore === null ? '未设及格线' : `及格线 ${item.passScore}`;
  return `总分 ${item.totalScore} · ${pass}`;
}
