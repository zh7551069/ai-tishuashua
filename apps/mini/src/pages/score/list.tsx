import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { QUIZ_SCORE_LIST_TRUNCATED_HINT, type QuizScoreSummary } from '@tishuashua/shared';
import { useEffect, useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { isAuthFailure } from '../../services/guard';
import { fetchQuizScores } from '../../services/quiz-api';
import { clearToken, readToken } from '../../services/session';
// 返回、箭头、空态图标来自 Bridge SVG，栅成 PNG。微信 image 不画 svg。
import iconBack from './assets/pr-back.png';
import iconChevron from './assets/pr-chevron.png';
import iconDisc from './assets/pr-empty-disc.png';
import iconMark from './assets/pr-empty-mark.png';
import iconRing from './assets/pr-empty-ring.png';
import './list.css';
import {
  buildInsight,
  countRecords,
  filterRecords,
  recordCard,
  type InsightModel,
  type RecordFilter,
} from './records';

const FILTERS: { id: RecordFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'practice', label: '练习' },
  { id: 'exam', label: '考试' },
];

export function ScoreList(props: { tick: number }) {
  const [items, setItems] = useState<QuizScoreSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);
  const [filter, setFilter] = useState<RecordFilter>('all');

  const load = async () => {
    setError('');
    const token = readToken();
    if (!token) {
      setGuest(true);
      setItems([]);
      setHasMore(false);
      setReady(true);
      return;
    }
    setGuest(false);
    try {
      const data = await fetchQuizScores(token);
      setItems(data.items);
      setHasMore(data.hasMore);
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        clearToken();
        setGuest(true);
        setItems([]);
        setHasMore(false);
        setError('');
        setReady(true);
        return;
      }
      setGuest(false);
      setReady(false);
      setItems([]);
      setHasMore(false);
      setError(caught instanceof Error ? caught.message : '练习记录加载失败');
    }
  };

  useEffect(() => {
    if (props.tick === 0) {
      return;
    }
    void load();
  }, [props.tick]);

  const now = useMemo(() => new Date(), [items]);
  const counts = useMemo(() => countRecords(items), [items]);
  const visible = useMemo(() => filterRecords(items, filter), [filter, items]);
  const insight = useMemo(() => buildInsight(items, now), [items, now]);

  return (
    <Screen
      back
      centerTitle
      navPlain
      bodyFill
      title="练习记录"
      background="#F7F8F4"
      navClassName="pr-nav"
      backMark={<Image className="u-back-ico" src={iconBack} mode="aspectFit" />}
    >
      {guest ? (
        <EmptyState
          title="登录后查看练习记录"
          detail="已交卷的记录只对当前微信账号可见。"
          action="去登录"
          onAction={() => void Taro.reLaunch({ url: '/pages/login/index' })}
        />
      ) : null}
      {!guest && !ready && !error ? (
        <View className="pr-fill">
          <LoadingBlock label="正在加载练习记录" />
        </View>
      ) : null}
      {!guest && error ? (
        <View className="pr-fill">
          <ErrorBlock
            title="练习记录加载失败"
            detail={error}
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        </View>
      ) : null}
      {!guest && ready && items.length === 0 && !hasMore ? (
        <EmptyState
          placeholder
          title="还没有练习记录"
          detail="完成一次练习或考试后会出现在这里"
          action="去刷题"
          onAction={() => void Taro.reLaunch({ url: '/pages/home/index' })}
        />
      ) : null}
      {!guest && ready && items.length > 0 && insight ? (
        <View className="pr-stack">
          <InsightCard model={insight} />
          <View className="pr-chips">
            {FILTERS.map((item) => (
              <View
                key={item.id}
                className={filter === item.id ? 'pr-chip pr-chip-on' : 'pr-chip'}
                onClick={() => setFilter(item.id)}
              >
                <Text className="pr-chip-text">
                  {item.label} {counts[item.id]}
                </Text>
              </View>
            ))}
          </View>
          {hasMore ? <Text className="pr-hint">{QUIZ_SCORE_LIST_TRUNCATED_HINT}</Text> : null}
          {visible.length === 0 ? <Text className="pr-none">这一筛选下还没有记录</Text> : null}
          {visible.map((item) => (
            <RecordCard key={item.id} item={item} now={now} />
          ))}
        </View>
      ) : null}
      {!guest && ready && items.length === 0 && hasMore ? (
        <View className="pr-fill">
          <Text className="pr-hint">{QUIZ_SCORE_LIST_TRUNCATED_HINT}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function InsightCard(props: { model: InsightModel }) {
  const model = props.model;
  return (
    <View className="pr-card pr-insight">
      <View className="pr-ai-head">
        <View className="pr-ai-badge">
          <Text className="pr-ai-badge-text">AI 学习点评</Text>
        </View>
        <Text className="pr-scope">{model.scope}</Text>
      </View>
      <View className="pr-hero">
        <View className="pr-scoreblock">
          <Text className="pr-score-label">综合评分</Text>
          <Text className="pr-score-num">{model.score}</Text>
        </View>
        <View className="pr-hero-copy">
          <Text className="pr-master-label">综合掌握度</Text>
          <Text className="pr-master-line">{model.headline}</Text>
        </View>
      </View>
      {model.strong || model.weak ? (
        <View className="pr-notes">
          {model.strong ? <NoteRow tone="good" text={model.strong} /> : null}
          {model.weak ? <NoteRow tone="weak" text={model.weak} /> : null}
        </View>
      ) : null}
      {model.bars.length > 0 ? (
        <View className="pr-kp">
          <Text className="pr-kp-title">知识点掌握度</Text>
          <View className="pr-bars">
            {model.bars.map((bar) => (
              <View key={bar.key} className="pr-bar">
                <View className="pr-bar-meta">
                  <Text className="pr-bar-name">{bar.name}</Text>
                  <Text
                    className={
                      bar.tone === 'good' ? 'pr-bar-pct pr-tone-good' : 'pr-bar-pct pr-tone-weak'
                    }
                  >
                    {bar.percent}%
                  </Text>
                </View>
                <View className="pr-track">
                  <View
                    className={
                      bar.tone === 'good'
                        ? 'pr-fillbar pr-fillbar-good'
                        : 'pr-fillbar pr-fillbar-weak'
                    }
                    style={{ width: `${bar.percent}%` }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View
        className="pr-cta"
        onClick={() => void Taro.showToast({ title: '即将开放', icon: 'none' })}
      >
        <Text className="pr-cta-text">弱项复练</Text>
      </View>
    </View>
  );
}

function NoteRow(props: { tone: 'good' | 'weak'; text: string }) {
  const good = props.tone === 'good';
  return (
    <View className={good ? 'pr-note-row pr-note-good' : 'pr-note-row pr-note-weak'}>
      <View className={good ? 'pr-accent pr-accent-good' : 'pr-accent pr-accent-weak'} />
      <Text className="pr-note-text">{props.text}</Text>
    </View>
  );
}

function RecordCard(props: { item: QuizScoreSummary; now: Date }) {
  const card = recordCard(props.item, props.now);
  const exam = card.mode === 'exam';
  return (
    <View
      className="pr-card pr-session"
      onClick={() => void Taro.navigateTo({ url: `/pages/score/index?sessionId=${props.item.id}` })}
    >
      <View className="pr-row1">
        <View className={exam ? 'pr-badge pr-badge-exam' : 'pr-badge pr-badge-practice'}>
          <Text className="pr-badge-text">{card.badge}</Text>
        </View>
        <Text className="pr-title">{card.title}</Text>
        <Text
          className={card.tone === 'good' ? 'pr-result pr-tone-good' : 'pr-result pr-tone-weak'}
        >
          {card.score}
        </Text>
      </View>
      <View className="pr-row2">
        <Text className="pr-meta">{card.meta}</Text>
        <View className="pr-chev">
          <Image className="pr-chev-ico" src={iconChevron} mode="aspectFit" />
        </View>
      </View>
    </View>
  );
}

function EmptyState(props: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
  placeholder?: boolean;
}) {
  return (
    <View className="pr-empty-page">
      {props.placeholder ? (
        <View className="pr-card pr-insight-empty">
          <View className="pr-ai-badge">
            <Text className="pr-ai-badge-text">AI 学习点评</Text>
          </View>
          <Text className="pr-placeholder">练几次后这里会出现掌握点评</Text>
        </View>
      ) : null}
      <View className="pr-empty">
        <View className="pr-empty-icon">
          <Image className="pr-empty-disc" src={iconDisc} mode="aspectFit" />
          <Image className="pr-empty-ring" src={iconRing} mode="aspectFit" />
          <Image className="pr-empty-mark" src={iconMark} mode="aspectFit" />
        </View>
        <Text className="pr-empty-title">{props.title}</Text>
        <Text className="pr-empty-sub">{props.detail}</Text>
        <View className="pr-go" onClick={props.onAction}>
          <Text className="pr-go-text">{props.action}</Text>
        </View>
      </View>
    </View>
  );
}
