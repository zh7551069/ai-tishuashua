import { Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import type { CertificateSummary } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { Steps } from '../../../components/Steps';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchCertificates, fetchDomains, fetchKnowledgeTree } from '../../../services/catalog-api';
import { withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';
import { countKnowledgePoints } from '../../../ui/knowledge-meta';

export default function CertificatePage() {
  const domainId = queryValue(useRouter().params.domainId);
  const [items, setItems] = useState<CertificateSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
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
        const listed = await Promise.all(
          certs.items.map(async (item) => {
            try {
              const tree = await fetchKnowledgeTree(token, item.id);
              return [item.id, countKnowledgePoints(tree.nodes)] as const;
            } catch {
              return [item.id, null] as const;
            }
          }),
        );
        return { certs, domains, listed };
      });
      if (!data) {
        return;
      }
      setItems(data.certs.items);
      setDomainName(data.domains.items.find((item) => item.id === domainId)?.name ?? '');
      const next: Record<string, number> = {};
      for (const [id, count] of data.listed) {
        if (count !== null) {
          next[id] = count;
        }
      }
      setCounts(next);
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

  const emptyShell = ready && items.length === 0;
  const body = (
    <View className={emptyShell ? 'u-pad u-pad-pick u-pad-fill' : 'u-pad u-pad-pick'}>
      {error ? null : (
        <View className="u-search">
          <Text className="u-search-mark">⌕</Text>
          <Input
            className="u-search-input"
            placeholder={emptyShell ? '搜索' : '搜索证书'}
            placeholderStyle="color:#9ca3af"
            value={query}
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>
      )}
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
          fill={emptyShell}
          title="暂无证书"
          detail={query ? '换个关键词搜索' : '该领域下暂无可用证书'}
          action={query ? '清除搜索' : '返回领域'}
          onAction={() => (query ? setQuery('') : void Taro.navigateBack())}
        />
      ) : null}
      {ready && visible.length > 0 ? (
        <Text className="u-section u-section-first">
          {domainName || '证书'} · {visible.length} 个证书
        </Text>
      ) : null}
      {ready && !error
        ? visible.map((item) => (
            <View
              key={item.id}
              className="u-pick"
              onClick={() => {
                void Taro.navigateTo({
                  url: `/pages/pack/knowledge/index?domainId=${domainId}&certId=${item.id}`,
                });
              }}
            >
              <View className="u-card-copy">
                <Text className="u-card-title">{item.name}</Text>
                {counts[item.id] === undefined ? null : (
                  <Text className="u-card-sub">{counts[item.id]} 个知识点</Text>
                )}
              </View>
              <Text className="u-chev">›</Text>
            </View>
          ))
        : null}
    </View>
  );

  if (emptyShell) {
    return (
      <Screen
        back
        title="选择证书"
        subtitle="选领域 → 证书 → 知识点"
        subtitleTone="muted"
        titleSize="page"
        bodyFill
      >
        {body}
      </Screen>
    );
  }

  return (
    <Screen back title="选择证书" subtitle={domainName ? `领域 · ${domainName}` : undefined}>
      {error ? null : <Steps current={2} />}
      {body}
    </Screen>
  );
}
