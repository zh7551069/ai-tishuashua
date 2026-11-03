import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { QUIZ_TYPE_LABELS, type CertificateQueryItem, type QuizTypeCode } from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
import { fetchCertificateQuery } from '../../services/certificate-api';
import { formatSubmittedAt } from '../../services/format';
import { isAuthFailure } from '../../services/guard';
import { clearToken, readToken } from '../../services/session';

export default function CertificatePage() {
  const [items, setItems] = useState<CertificateQueryItem[]>([]);
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

  return (
    <MiniPage
      title="证书"
      hint="这里是你已经关联过的证书。选领域建包仍走目录，每次交卷的明细在成绩页。"
    >
      {guest ? <GuestCertificate /> : null}
      {!guest && error ? <Text className="error">{error}</Text> : null}
      {!guest && !ready && !error ? <Text className="hint">正在加载证书。</Text> : null}
      {!guest && ready && items.length === 0 ? <EmptyCertificate /> : null}
      {!guest && ready
        ? items.map((item) => (
            <View key={item.id}>
              <View
                className={item.unavailable ? 'card card-off' : 'card'}
                onClick={() => openLatest(item)}
              >
                <View className="card-head">
                  <Text className="tree-name">{item.name}</Text>
                  {item.unavailable ? <Text className="badge">已下架</Text> : null}
                </View>
                <Text className="meta">{item.domainName}</Text>
                <Text className="meta">{scoreLine(item)}</Text>
                <Text className="meta">题型 {typeLine(item.enabledQuestionTypeCodes)}</Text>
                {item.extraConstraint ? (
                  <Text className="meta">附加约束 {item.extraConstraint}</Text>
                ) : null}
                <Text className="meta">{relationLine(item)}</Text>
                {item.unavailable && item.packCount > 0 ? (
                  <Text className="meta">这张证书已下架，已有刷题包只能删除。</Text>
                ) : null}
                {item.latestScore ? (
                  <View>
                    <Text className="score-num">
                      {item.latestScore.earnedScore}
                      <Text className="score-total"> / {item.latestScore.totalScore}</Text>
                    </Text>
                    <Text className="meta">
                      {passedLine(item)} · 最近交卷{' '}
                      {formatSubmittedAt(item.latestScore.submittedAt)}
                    </Text>
                    <Text className="meta">查看最近一次解析</Text>
                  </View>
                ) : null}
                {!item.latestScore && item.submittedCount > 0 ? (
                  <Text className="meta">最近一次交卷没有可用的分数。</Text>
                ) : null}
              </View>
              {item.activePackId && !item.unavailable ? (
                <Button
                  className="ghost"
                  onClick={() => {
                    void Taro.navigateTo({
                      url: `/pages/quiz/index?packId=${item.activePackId}`,
                    });
                  }}
                >
                  继续刷这张证书
                </Button>
              ) : null}
            </View>
          ))
        : null}
      {!guest && ready ? (
        <Button
          className="ghost"
          onClick={() => void Taro.navigateTo({ url: '/pages/score/index' })}
        >
          查看成绩明细
        </Button>
      ) : null}
      {!guest && error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
    </MiniPage>
  );
}

function GuestCertificate() {
  return (
    <View>
      <View className="card">
        <Text className="tree-name">登录后查询证书</Text>
        <Text className="meta">只显示当前微信账号的刷题包、交卷、错题和课件所关联的证书。</Text>
      </View>
      <Button className="primary" onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}>
        去登录
      </Button>
    </View>
  );
}

function EmptyCertificate() {
  return (
    <View>
      <View className="card">
        <Text className="tree-name">还没有可查询的证书</Text>
        <Text className="meta">保存刷题包、交卷、留下错题或上传课件后，相关证书会出现在这里。</Text>
      </View>
      <Button
        className="primary"
        onClick={() => void Taro.navigateTo({ url: '/pages/pack/domain/index' })}
      >
        选择领域
      </Button>
    </View>
  );
}

function openLatest(item: CertificateQueryItem): void {
  if (!item.latestScore) {
    return;
  }
  void Taro.navigateTo({
    url: `/pages/quiz/paper/index?sessionId=${item.latestScore.sessionId}`,
  });
}

function scoreLine(item: CertificateQueryItem): string {
  const pass = item.passScore === null ? '未设及格线' : `及格线 ${item.passScore}`;
  return `总分 ${item.totalScore} · ${pass}`;
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
  return `刷题包 ${item.packCount} 个 · 已交卷 ${item.submittedCount} 次 · 未消灭错题 ${item.pendingWrongCount} · 课件 ${item.uploadCount} 份`;
}

function typeLine(codes: string[]): string {
  if (codes.length === 0) {
    return '未设置';
  }
  return codes.map((code) => (isQuizType(code) ? QUIZ_TYPE_LABELS[code] : code)).join('、');
}

function isQuizType(code: string): code is QuizTypeCode {
  return code === 'single' || code === 'multi' || code === 'judge';
}
