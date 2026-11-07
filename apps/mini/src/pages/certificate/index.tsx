import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { QUIZ_TYPE_LABELS, type CertificateQueryItem, type QuizTypeCode } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { fetchCertificateQuery } from '../../services/certificate-api';
import { formatSubmittedAt } from '../../services/format';
import { isAuthFailure } from '../../services/guard';
import { clearToken, readToken } from '../../services/session';

export default function CertificateQueryPage() {
  const [items, setItems] = useState<CertificateQueryItem[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);

  const load = async () => {
    setError('');
    const token = readToken();
    if (!token) {
      setGuest(true);
      setItems([]);
      setReady(true);
      return;
    }
    setGuest(false);
    try {
      const data = await fetchCertificateQuery(token);
      setItems(data.items);
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        clearToken();
        setGuest(true);
        setItems([]);
        setError('');
        setReady(true);
        return;
      }
      setGuest(false);
      setReady(false);
      setItems([]);
      setError(caught instanceof Error ? caught.message : '证书加载失败');
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
    return items.filter((item) => item.name.includes(keyword) || item.domainName.includes(keyword));
  }, [items, query]);

  return (
    <Screen back centerTitle title="证书" subtitle="已关联的证书">
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
        {guest ? (
          <EmptyBlock
            title="登录后查询证书"
            detail="只显示当前微信账号已关联的证书。"
            action="去登录"
            onAction={() => void Taro.reLaunch({ url: '/pages/login/index' })}
          />
        ) : null}
        {!guest && !ready && !error ? <LoadingBlock skeleton /> : null}
        {!guest && error ? (
          <ErrorBlock detail={error} onRetry={() => void load()} onBack={() => void Taro.navigateBack()} />
        ) : null}
        {!guest && ready && visible.length === 0 ? (
          <EmptyBlock
            title="暂无证书"
            detail="保存刷题包、交卷、留下错题或上传课件后，相关证书会出现在这里。"
            action="去选包"
            onAction={() => void Taro.navigateTo({ url: '/pages/pack/domain/index' })}
          />
        ) : null}
        {!guest && ready && visible.length > 0 ? (
          <Text className="u-section">{visible.length} 个证书</Text>
        ) : null}
        {!guest && ready
          ? visible.map((item) => (
              <View key={item.id}>
                <View className="u-card" onClick={() => openLatest(item)}>
                  <View className="u-card-copy">
                    <Text className="u-card-title">{item.name}</Text>
                    <Text className="u-card-sub">{item.domainName}</Text>
                    <Text className="u-card-sub">{scoreLine(item)}</Text>
                    <Text className="u-card-sub">{relationLine(item)}</Text>
                    {item.unavailable ? <Text className="u-badge">已下架</Text> : null}
                    {item.latestScore ? (
                      <Text className="u-meta">
                        {item.latestScore.earnedScore}/{item.latestScore.totalScore} ·{' '}
                        {passedLine(item)} · {formatSubmittedAt(item.latestScore.submittedAt)}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="u-chev">›</Text>
                </View>
                {item.activePackId && !item.unavailable ? (
                  <Button
                    className="u-btn-ghost"
                    style={{ marginTop: '-4px', marginBottom: '12px' }}
                    onClick={() => {
                      void Taro.navigateTo({ url: `/pages/quiz/index?packId=${item.activePackId}` });
                    }}
                  >
                    继续刷这张证书
                  </Button>
                ) : null}
              </View>
            ))
          : null}
      </View>
    </Screen>
  );
}

function openLatest(item: CertificateQueryItem): void {
  if (!item.latestScore) {
    return;
  }
  void Taro.navigateTo({ url: `/pages/quiz/paper/index?sessionId=${item.latestScore.sessionId}` });
}

function scoreLine(item: CertificateQueryItem): string {
  const pass = item.passScore === null ? '未设及格线' : `及格线 ${item.passScore}`;
  const types = typeLine(item.enabledQuestionTypeCodes);
  return `总分 ${item.totalScore} · ${pass} · ${types}`;
}

function passedLine(item: CertificateQueryItem): string {
  const passed = item.latestScore?.passed;
  if (passed === true) {
    return '最近一次及格';
  }
  if (passed === false) {
    return '最近一次未及格';
  }
  return '最近一次未设及格线';
}

function relationLine(item: CertificateQueryItem): string {
  return `刷题包 ${item.packCount} · 已交卷 ${item.submittedCount} · 未消灭错题 ${item.pendingWrongCount} · 课件 ${item.uploadCount}`;
}

function typeLine(codes: string[]): string {
  if (codes.length === 0) {
    return '题型未设置';
  }
  return codes.map((code) => (isQuizType(code) ? QUIZ_TYPE_LABELS[code] : code)).join('、');
}

function isQuizType(code: string): code is QuizTypeCode {
  return code === 'single' || code === 'multi' || code === 'judge';
}
