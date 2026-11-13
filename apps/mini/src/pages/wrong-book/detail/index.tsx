import { Button, Image, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { QUIZ_TYPE_LABELS, type PackList, type WrongBookItem } from '@tishuashua/shared';
import { useState } from 'react';
import { Screen } from '../../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { useExhaustedGate } from '../../../components/use-exhausted-gate';
import { fetchKnowledgeTree } from '../../../services/catalog-api';
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
import iconChevron from './assets/icon-chevron.png';
import './index.css';
import { detailMeta, detailOptionFace, detailSources, type DetailSource } from './present';

export default function WrongBookDetailPage() {
  const itemId = queryValue(useRouter().params.id);
  const [item, setItem] = useState<WrongBookItem | null>(null);
  const [packs, setPacks] = useState<PackList | null>(null);
  const [sources, setSources] = useState<DetailSource[]>([]);
  const [error, setError] = useState('');
  const [packError, setPackError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingAction, setPendingAction] = useState<'clear' | 'variant' | null>(null);
  const gate = useExhaustedGate();

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
        let nextSources: DetailSource[] = [];
        if (nextItem.kpIds.length > 0) {
          try {
            const tree = await fetchKnowledgeTree(token, nextItem.certId);
            nextSources = detailSources(nextItem.kpIds, tree);
          } catch {
            nextSources = [];
          }
        }
        return { item: nextItem, packs: nextPacks, packError: nextPackError, sources: nextSources };
      });
      if (!data) {
        return;
      }
      setItem(data.item);
      setPacks(data.packs);
      setSources(data.sources);
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
  const canRetrain = Boolean(target?.ok) && pendingAction === null && !gate.sheetOpen;
  const pending = item?.status === 'pending';
  const help = helpText(item, target, packError, actionError);
  const showPackLink = Boolean(target && !target.ok && target.reason === 'no-pack');
  const footExtra = Boolean(help) || showPackLink;

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
    if (!item || !target?.ok || pendingAction || gate.sheetOpen) {
      return;
    }
    setActionError('');
    setPendingAction('variant');
    try {
      const pack = packs?.items.find((row) => row.id === target.packId);
      const result = await gate.run({
        source: 'variant',
        create: (token) =>
          createQuizSession(
            token,
            variantSessionInput({
              packId: target.packId,
              wrongItemId: item.id,
              types: pack?.enabledQuestionTypeCodes,
            }),
          ),
      });
      if (result.kind === 'error') {
        setActionError(result.message);
        return;
      }
      if (result.kind !== 'created') {
        return;
      }
      await Taro.navigateTo({
        url: variantProgressUrl({
          sessionId: result.session.id,
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

  const openSource = () => {
    void Taro.showToast({ title: '即将开放', icon: 'none' });
  };

  return (
    <Screen
      back
      centerTitle
      navPlain
      navClassName="wd-nav"
      background="#f5f5f7"
      title="错题详情"
      footerClassName={footExtra ? 'wd-foot wd-foot-help' : 'wd-foot'}
      right={
        item ? (
          <Text className={pending ? 'wd-status wd-status-pending' : 'wd-status wd-status-cleared'}>
            {pending ? '未消灭' : '已消灭'}
          </Text>
        ) : null
      }
      footer={
        item ? (
          <View className="wd-foot-stack">
            <View className="wd-row">
              <Button className="wd-btn wd-btn-ghost" disabled={!canRetrain} onClick={openSimilar}>
                复练同类
              </Button>
              <Button
                className="wd-btn wd-btn-primary"
                disabled={!canRetrain}
                loading={pendingAction === 'variant'}
                onClick={() => void startVariant()}
              >
                题型变异
              </Button>
            </View>
            {help ? <Text className="wd-help">{help}</Text> : null}
            {showPackLink ? (
              <Text
                className="wd-pack-link"
                onClick={() => void Taro.navigateTo({ url: '/pages/pack/domain/index' })}
              >
                去创建刷题包
              </Text>
            ) : null}
          </View>
        ) : null
      }
    >
      <View className="wd-body">
        {!item && !error ? <LoadingBlock label="正在加载错题" /> : null}
        {error ? (
          <ErrorBlock
            detail={error}
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {item ? (
          <>
            <Text className="wd-meta">{detailMeta(item)}</Text>
            <View className="wd-pills">
              <Text className="wd-pill wd-pill-type">
                {item.type ? QUIZ_TYPE_LABELS[item.type] : '题目'}
              </Text>
              <Text className="wd-pill wd-pill-ai">AI 生成题</Text>
            </View>
            <Text className="wd-stem">{item.stem}</Text>
            <View className="wd-options">
              {item.options.map((option) => {
                const face = detailOptionFace({
                  type: item.type,
                  // 详情契约只有标准答案，没有用户当时的选项。
                  selected: [],
                  answer: item.answer,
                  optionId: option.id,
                });
                return (
                  <View key={option.id} className={`wd-opt wd-opt-${face.tone}`}>
                    <View className="wd-opt-main">
                      <View className={`wd-letter wd-letter-${face.tone}`}>
                        <Text className={`wd-letter-text wd-letter-text-${face.tone}`}>
                          {option.id}
                        </Text>
                      </View>
                      <Text className={`wd-opt-text wd-opt-text-${face.tone}`}>{option.text}</Text>
                    </View>
                    {face.tags.length > 0 ? (
                      <View className="wd-tagline">
                        {face.tags.map((tag) => (
                          <Text key={tag.text} className={`wd-opt-tag wd-opt-tag-${tag.tone}`}>
                            {tag.text}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <View className="wd-parse">
              <View className="wd-pills">
                <Text className="wd-pill wd-pill-parse">AI 解析</Text>
              </View>
              <Text className="wd-parse-body">{item.analysis || '这道题没有解析。'}</Text>
            </View>
            <View className="wd-block">
              <Text className="wd-h">相关知识点</Text>
              <KnowledgePoints item={item} packs={packs} target={target} />
            </View>
            <View className="wd-block">
              <Text className="wd-h">知识点出处</Text>
              {sources.length === 0 ? <Text className="wd-muted">暂无出处</Text> : null}
              {sources.map((source) => (
                <View key={source.key} className="wd-source" onClick={openSource}>
                  <View className="wd-accent" />
                  <View className="wd-source-copy">
                    <Text className="wd-source-title">{source.title}</Text>
                    {source.subtitle ? (
                      <Text className="wd-source-sub">{source.subtitle}</Text>
                    ) : null}
                  </View>
                  <View className="wd-chev">
                    <Image className="wd-chev-ico" src={iconChevron} mode="aspectFit" />
                  </View>
                </View>
              ))}
            </View>
            {pending ? (
              <View className="wd-clear" onClick={() => void clear()}>
                <Text className={pendingAction ? 'wd-clear-text wd-clear-busy' : 'wd-clear-text'}>
                  {pendingAction === 'clear' ? '正在标记…' : '标记已消灭'}
                </Text>
              </View>
            ) : null}
            <View className="wd-tail" />
          </>
        ) : null}
      </View>
      {gate.sheet}
    </Screen>
  );
}

function KnowledgePoints(props: {
  item: WrongBookItem;
  packs: PackList | null;
  target: RetrainTarget | null;
}) {
  if (props.item.kpIds.length === 0) {
    return <Text className="wd-muted">暂无可用知识点</Text>;
  }
  if (
    props.target &&
    !props.target.ok &&
    (props.target.reason === 'empty-kp' || props.target.reason === 'kp-unavailable')
  ) {
    return <Text className="wd-muted">暂无可用知识点</Text>;
  }
  const ids = props.target?.ok
    ? props.target.kpIds
    : props.item.kpIds.map((id) => id.toLowerCase());
  return (
    <View className="wd-chips">
      {ids.map((id) => (
        <Text key={id} className="wd-chip">
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
