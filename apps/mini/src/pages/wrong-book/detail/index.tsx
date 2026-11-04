import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { QUIZ_TYPE_LABELS, type PackList, type WrongBookItem } from '@tishuashua/shared';
import { useState } from 'react';
import { Screen } from '../../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { formatSubmittedAt } from '../../../services/format';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { fetchPacks } from '../../../services/pack-api';
import { queryValue } from '../../../services/query';
import { createQuizSession } from '../../../services/quiz-api';
import {
  EMPTY_KP_HELP,
  resolveRetrainTarget,
  retrainSimilarUrl,
  variantProgressUrl,
  variantSessionInput,
  type RetrainTarget,
} from '../../../services/retrain';
import { clearWrongItem, fetchWrongItem } from '../../../services/wrong-book-api';

export default function WrongBookDetailPage() {
  const itemId = queryValue(useRouter().params.id);
  const [item, setItem] = useState<WrongBookItem | null>(null);
  const [packs, setPacks] = useState<PackList | null>(null);
  const [error, setError] = useState('');
  const [packError, setPackError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingAction, setPendingAction] = useState<'clear' | 'variant' | null>(null);

  const load = async () => {
    if (!itemId) {
      setError('缺少错题');
      return;
    }
    setError('');
    setPackError('');
    try {
      const data = await withAuth(async (token) => {
        const nextItem = await fetchWrongItem(token, itemId);
        let nextPacks: PackList | null = null;
        let nextPackError = '';
        try {
          nextPacks = await fetchPacks(token);
        } catch (caught) {
          nextPackError = caught instanceof Error ? caught.message : '刷题包加载失败';
        }
        return { item: nextItem, packs: nextPacks, packError: nextPackError };
      });
      if (!data) {
        return;
      }
      setItem(data.item);
      setPacks(data.packs);
      setPackError(data.packError);
      setActionError('');
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setError(caught instanceof Error ? caught.message : '错题加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  const target: RetrainTarget | null = item && packs ? resolveRetrainTarget(item, packs) : null;
  const canRetrain = Boolean(target?.ok) && pendingAction === null;
  const pending = item?.status === 'pending';
  const help = helpText(item, target, packError, actionError);

  const clear = async () => {
    if (!itemId || pendingAction) {
      return;
    }
    setPendingAction('clear');
    try {
      const data = await withAuth((token) => clearWrongItem(token, itemId));
      if (data) {
        setItem(data);
        await Taro.showToast({ title: '已消灭', icon: 'success' });
      }
    } catch (caught) {
      if (!isAuthFailure(caught)) {
        await Taro.showToast({
          title: caught instanceof Error ? caught.message : '消灭失败',
          icon: 'none',
        });
      }
    } finally {
      setPendingAction(null);
    }
  };

  const openSimilar = () => {
    if (!item || !target?.ok || pendingAction) {
      return;
    }
    void Taro.navigateTo({
      url: retrainSimilarUrl({
        wrongItemId: item.id,
        packId: target.packId,
        kpIds: target.kpIds,
      }),
    });
  };

  const startVariant = async () => {
    if (!item || !target?.ok || pendingAction) {
      return;
    }
    setActionError('');
    setPendingAction('variant');
    try {
      const pack = packs?.items.find((row) => row.id === target.packId);
      const created = await withAuth((token) =>
        createQuizSession(
          token,
          variantSessionInput({
            packId: target.packId,
            wrongItemId: item.id,
            types: pack?.enabledQuestionTypeCodes,
          }),
        ),
      );
      if (!created) {
        return;
      }
      await Taro.navigateTo({
        url: variantProgressUrl({
          sessionId: created.id,
          wrongItemId: item.id,
          packId: target.packId,
        }),
      });
    } catch (caught) {
      if (!isAuthFailure(caught)) {
        const message = caught instanceof Error ? caught.message : '变异题发起失败';
        setActionError(message);
        await Taro.showToast({ title: message, icon: 'none' });
      }
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Screen
      back
      centerTitle
      title="错题详情"
      right={
        item ? (
          <Text className={pending ? 'u-tag u-tag-orange' : 'u-tag u-tag-gray'}>
            {pending ? '未消灭' : '已消灭'}
          </Text>
        ) : null
      }
      footer={
        item ? (
          <View>
            <View className="u-foot-row">
              <Button className="u-btn-ghost" disabled={!canRetrain} onClick={openSimilar}>
                复练同类
              </Button>
              <View className="u-foot-gap" />
              <Button
                className="u-btn"
                disabled={!canRetrain}
                loading={pendingAction === 'variant'}
                onClick={() => void startVariant()}
              >
                题型变异
              </Button>
            </View>
            {help ? <Text className="u-help-alert">{help}</Text> : null}
            {target && !target.ok && target.reason === 'no-pack' ? (
              <Text
                className="u-link u-help-link"
                onClick={() => void Taro.navigateTo({ url: '/pages/pack/domain/index' })}
              >
                去创建刷题包
              </Text>
            ) : null}
          </View>
        ) : null
      }
    >
      <View className="u-pad">
        {!item && !error ? <LoadingBlock label="正在加载错题" /> : null}
        {error ? (
          <ErrorBlock
            detail={error}
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {item ? (
          <View>
            <Text className="u-note">
              {item.certName} · {formatSubmittedAt(item.updatedAt)}
            </Text>
            <View className="u-chips" style={{ marginTop: '15px' }}>
              <Text className={typeClass(item.type)}>
                {item.type ? QUIZ_TYPE_LABELS[item.type] : '题目'}
              </Text>
              <Text className="u-tag u-tag-red">错过 {item.wrongCount} 次</Text>
            </View>
            <Text className="u-stem">{item.stem}</Text>
            {item.options.map((option) => {
              const right = item.answer.includes(option.id);
              return (
                <View key={option.id} className={right ? 'u-option u-option-right' : 'u-option'}>
                  <Text className={right ? 'u-letter u-letter-right' : 'u-letter'}>
                    {option.id}
                  </Text>
                  <View className="u-card-copy">
                    <Text
                      className="u-option-text"
                      style={{ color: right ? '#16a34a' : '#111827' }}
                    >
                      {option.text}
                    </Text>
                    {right ? <Text className="u-note u-right">正确答案</Text> : null}
                  </View>
                </View>
              );
            })}
            <View className="u-analysis">
              <View className="u-analysis-bar" />
              <View className="u-analysis-copy">
                <Text className="u-analysis-title">解析</Text>
                <Text className="u-analysis-body">{item.analysis || '这道题没有解析。'}</Text>
              </View>
            </View>
            <Text className="u-section">相关知识点</Text>
            <KnowledgePoints item={item} packs={packs} target={target} />
            {pending ? (
              <View className="u-panel">
                <Text className="u-label">标记已消灭</Text>
                <Text className="u-note">只改变这道错题的状态。复练或变异答对不会自动消灭。</Text>
                <Button
                  className="u-btn-ghost"
                  style={{ marginTop: '15px', width: '100%' }}
                  disabled={pendingAction !== null}
                  loading={pendingAction === 'clear'}
                  onClick={() => void clear()}
                >
                  标记已消灭
                </Button>
              </View>
            ) : (
              <Text className="u-meta">这道题已经消灭。仍可以复练同类或题型变异。</Text>
            )}
            {help ? <View style={{ height: '48px' }} /> : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function KnowledgePoints(props: {
  item: WrongBookItem;
  packs: PackList | null;
  target: RetrainTarget | null;
}) {
  if (props.item.kpIds.length === 0) {
    return <Text className="u-meta">暂无可用知识点</Text>;
  }
  if (
    props.target &&
    !props.target.ok &&
    (props.target.reason === 'empty-kp' || props.target.reason === 'kp-unavailable')
  ) {
    return <Text className="u-meta">暂无可用知识点</Text>;
  }
  const ids = props.target?.ok
    ? props.target.kpIds
    : props.item.kpIds.map((id) => id.toLowerCase());
  return (
    <View className="u-chips">
      {ids.map((id) => (
        <Text key={id} className="u-chip">
          {knowledgeLabel(props.item, props.packs, id)}
        </Text>
      ))}
    </View>
  );
}

function knowledgeLabel(item: WrongBookItem, packs: PackList | null, id: string): string {
  const index = item.kpIds.findIndex((kp) => kp.toLowerCase() === id.toLowerCase());
  const named = index >= 0 ? item.kpNames?.[index]?.trim() : '';
  if (named) {
    return named;
  }
  const fromPack = packs?.items
    .flatMap((pack) => pack.knowledgePoints)
    .find((point) => point.id.toLowerCase() === id.toLowerCase())
    ?.name.trim();
  return fromPack || '知识点';
}

function helpText(
  item: WrongBookItem | null,
  target: RetrainTarget | null,
  packError: string,
  actionError: string,
): string {
  if (!item) {
    return '';
  }
  if (item.kpIds.length === 0) {
    return EMPTY_KP_HELP;
  }
  if (packError) {
    return packError;
  }
  if (target && !target.ok) {
    return target.message;
  }
  return actionError;
}

function typeClass(type: WrongBookItem['type']): string {
  if (type === 'multi') {
    return 'u-tag u-tag-violet';
  }
  if (type === 'judge') {
    return 'u-tag u-tag-orange';
  }
  return 'u-tag u-tag-blue';
}
