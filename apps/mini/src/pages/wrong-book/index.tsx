import { Image, Input, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { QUIZ_TYPE_LABELS, type WrongBookItem } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchWrongBook } from '../../services/wrong-book-api';
import iconCaret from './assets/icon-caret.png';
import iconCheck from './assets/icon-check.png';
import iconSearch from './assets/icon-search.png';
import { CelebrateOverlay } from '../../components/CelebrateOverlay';
import { CONFETTI_DOTS, CONFETTI_STICKS } from './confetti';
import './index.css';
import {
  CELEBRATE_KEY,
  type StatusFilter,
  formatWrongDate,
  inScope,
  isSameLocalDay,
  knowledgeLine,
  localDayKey,
  typeClass,
} from './present';

const SKELETON_CARDS = [0, 1, 2, 3];

function designRpx(px: number): string {
  return `${(px * 750) / 390}rpx`;
}

function readDismissedDay(): string {
  try {
    const value: unknown = Taro.getStorageSync(CELEBRATE_KEY);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export default function WrongBookPage() {
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [certId, setCertId] = useState('all');
  const [recent, setRecent] = useState(false);
  const [items, setItems] = useState<WrongBookItem[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [celebrateOpen, setCelebrateOpen] = useState(false);

  const load = async () => {
    setFailed(false);
    try {
      const data = await withAuth((token) => fetchWrongBook(token, 'all'));
      if (!data) {
        return;
      }
      const now = new Date();
      const todayCleared = data.items.filter(
        (item) => item.status === 'cleared' && isSameLocalDay(item.updatedAt, now),
      ).length;
      setItems(data.items);
      setCertId((current) =>
        current !== 'all' && data.items.some((item) => item.certId === current) ? current : 'all',
      );
      if (data.items.length === 0) {
        setSearching(false);
        setSearchFocus(false);
        setQuery('');
      }
      setReady(true);
      setCelebrateOpen(todayCleared > 0 && readDismissedDay() !== localDayKey(now));
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setReady(false);
      setCelebrateOpen(false);
      setFailed(true);
    }
  };

  useDidShow(() => {
    void load();
  });

  const now = useMemo(() => new Date(), [items]);
  const keyword = query.trim();
  const certs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (!seen.has(item.certId)) {
        seen.set(item.certId, item.certName || '证书');
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);
  const scoped = useMemo(
    () => items.filter((item) => inScope(item, certId, recent, keyword, now)),
    [certId, items, keyword, now, recent],
  );
  const pending = scoped.filter((item) => item.status === 'pending').length;
  const clearedScoped = scoped.filter((item) => item.status === 'cleared').length;
  const visible = scoped.filter((item) => filter === 'all' || item.status === filter);
  const total = items.length;
  const cleared = items.filter((item) => item.status === 'cleared').length;
  const pendingLeft = total - cleared;
  const todayCleared = items.filter(
    (item) => item.status === 'cleared' && isSameLocalDay(item.updatedAt, now),
  ).length;
  const clearedRatio = total ? Math.round((cleared / total) * 100) : 0;
  const bookEmpty = ready && !failed && total === 0;
  const searchEnabled = ready && !failed && total > 0;

  const closeCelebrate = () => {
    try {
      Taro.setStorageSync(CELEBRATE_KEY, localDayKey(new Date()));
    } catch {
      // 关不掉存储时仍先收起，避免挡住列表。
    }
    setCelebrateOpen(false);
  };

  const toggleSearch = () => {
    setSearching((open) => {
      if (open) {
        setQuery('');
        setSearchFocus(false);
        return false;
      }
      setSearchFocus(true);
      return true;
    });
  };

  const right = failed ? null : (
    <View
      className={bookEmpty ? 'wb-search-hit wb-search-dim' : 'wb-search-hit'}
      onClick={searchEnabled ? toggleSearch : undefined}
    >
      <Image className="wb-search-ico" src={iconSearch} mode="aspectFit" />
    </View>
  );

  return (
    <Screen
      back
      centerTitle
      navPlain
      bodyFill
      title="错题本"
      background="#F7F8F4"
      right={right}
    >
      {failed ? (
        <View className="wb-fill">
          <View className="wb-err-outer">
            <View className="wb-err-inner">
              <View className="wb-bang">
                <View className="wb-bang-stem" />
                <View className="wb-bang-dot" />
              </View>
            </View>
          </View>
          <Text className="wb-state-title">错题本加载失败</Text>
          <Text className="wb-state-sub">网络好像不太稳定，请检查后重试</Text>
          <View className="wb-cta" onClick={() => void load()}>
            <Text className="wb-cta-text">重新加载</Text>
          </View>
        </View>
      ) : null}
      {!ready && !failed ? <Skeleton /> : null}
      {bookEmpty ? (
        <View className="wb-fill">
          <View className="wb-empty-outer">
            <View className="wb-empty-inner">
              <Image className="wb-check" src={iconCheck} mode="aspectFit" />
            </View>
          </View>
          <Text className="wb-state-title">还没有错题</Text>
          <Text className="wb-state-sub">刷题后答错的题目会自动收入错题本</Text>
          <View className="wb-cta" onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}>
            <Text className="wb-cta-text">去刷题</Text>
          </View>
        </View>
      ) : null}
      {ready && !failed && total > 0 ? (
        <View className="wb-stack">
          {searching ? (
            <View className="wb-search">
              <Input
                className="wb-search-input"
                placeholder="搜索错题"
                placeholderStyle="color:#9ca3af"
                value={query}
                focus={searchFocus}
                onBlur={() => setSearchFocus(false)}
                onInput={(event) => setQuery(event.detail.value)}
              />
            </View>
          ) : null}
          <View className="wb-summary">
            <View className="wb-stat">
              <Text className="wb-stat-label">累计错题</Text>
              <View className="wb-countline">
                <Text className="wb-total">{total}</Text>
                <Text className="wb-unit">道</Text>
              </View>
            </View>
            <View className="wb-split" />
            <View className="wb-stat wb-stat-right">
              <Text className="wb-stat-label">已消灭</Text>
              <View className="wb-countline">
                <Text className="wb-cleared-num">{cleared}</Text>
                <Text className="wb-den"> / {total}</Text>
              </View>
              <View className="wb-bar">
                <View className="wb-bar-fill" style={{ width: `${clearedRatio}%` }} />
              </View>
            </View>
          </View>
          <View className="wb-chips">
            <StatusChip
              label={`待消灭 ${pending}`}
              on={filter === 'pending'}
              onClick={() => setFilter('pending')}
            />
            <StatusChip
              label={`已消灭 ${clearedScoped}`}
              on={filter === 'cleared'}
              onClick={() => setFilter('cleared')}
            />
            <StatusChip
              label={`全部 ${scoped.length}`}
              on={filter === 'all'}
              onClick={() => setFilter('all')}
            />
          </View>
          <View className="wb-filter-row">
            <ScrollView className="wb-certs" scrollX enableFlex showScrollbar={false}>
              <View className="wb-certs-row">
                <CertChip label="全部证书" on={certId === 'all'} onClick={() => setCertId('all')} />
                {certs.map((cert) => (
                  <CertChip
                    key={cert.id}
                    label={cert.name}
                    on={certId === cert.id}
                    onClick={() => setCertId(cert.id)}
                  />
                ))}
              </View>
            </ScrollView>
            <View
              className={recent ? 'wb-time wb-time-on' : 'wb-time'}
              onClick={() => setRecent((value) => !value)}
            >
              <Text className="wb-time-text">近 30 天</Text>
              <Image className="wb-caret" src={iconCaret} mode="aspectFit" />
            </View>
          </View>
          <Text className="wb-tip">错题将会随机出现在练习试卷中，答对即可标注为“已消灭”</Text>
          <View className="wb-list">
            {visible.length === 0 ? <Text className="wb-none">这一筛选下还没有错题</Text> : null}
            {visible.map((item) => (
              <WrongCard key={item.id} item={item} />
            ))}
          </View>
        </View>
      ) : null}
      {celebrateOpen && ready && !failed && todayCleared > 0 ? (
        <CelebrateOverlay onClose={closeCelebrate}>
          <View className="wb-scrim" />
          <View className="wb-wash" />
          <View className="wb-confetti">
            {CONFETTI_DOTS.map((dot, index) => (
              <View
                key={`dot-${index}`}
                className="wb-dot"
                style={{
                  left: `${(dot[0] / 390) * 100}%`,
                  top: `${(dot[1] / 844) * 100}%`,
                  width: designRpx(dot[2]),
                  height: designRpx(dot[2]),
                  backgroundColor: dot[3],
                }}
              />
            ))}
            {CONFETTI_STICKS.map((stick, index) => (
              <View
                key={`stick-${index}`}
                className="wb-stick"
                style={{
                  left: `${(stick[0] / 390) * 100}%`,
                  top: `${(stick[1] / 844) * 100}%`,
                  width: designRpx(stick[3]),
                  height: designRpx(stick[4]),
                  backgroundColor: stick[5],
                  transform: `rotate(${stick[2]}deg)`,
                }}
              />
            ))}
          </View>
          <View className="wb-celebrate-body">
            <View className="wb-glow" />
            <View className="wb-celebrate-card">
              <View className="wb-accent" />
              <View className="wb-accent-gap" />
              <Text className="wb-kicker">今日战绩</Text>
              <View className="wb-rings">
                <View className="wb-rings-mid">
                  <View className="wb-rings-core">
                    <Text className="wb-rings-mark">✓</Text>
                  </View>
                </View>
              </View>
              <Text className="wb-wow">太棒了！</Text>
              <Text className="wb-wow-sub">在职备考又向前一步</Text>
              <View className="wb-hero">
                <View className="wb-hero-copy">
                  <Text className="wb-hero-label">今天消灭了</Text>
                  <View className="wb-hero-line">
                    <Text className="wb-hero-num">{todayCleared}</Text>
                    <Text className="wb-hero-unit">道题</Text>
                  </View>
                </View>
                <View className="wb-mini-check">
                  <Text className="wb-mini-mark">✓</Text>
                </View>
              </View>
              <Text className="wb-tally">
                累计已消灭 {cleared} 道 · 待消灭还剩 {pendingLeft} 道
              </Text>
              <View className="wb-keep">
                <Text className="wb-keep-text">继续加油</Text>
              </View>
            </View>
            <Text className="wb-celebrate-hint">点按任意处关闭</Text>
          </View>
        </CelebrateOverlay>
      ) : null}
    </Screen>
  );
}

function StatusChip(props: { label: string; on: boolean; onClick: () => void }) {
  return (
    <View className={props.on ? 'wb-chip wb-chip-on' : 'wb-chip'} onClick={props.onClick}>
      <Text className="wb-chip-text">{props.label}</Text>
    </View>
  );
}

function CertChip(props: { label: string; on: boolean; onClick: () => void }) {
  return (
    <View className={props.on ? 'wb-cert wb-cert-on' : 'wb-cert'} onClick={props.onClick}>
      <Text className="wb-cert-text">{props.label}</Text>
    </View>
  );
}

function WrongCard(props: { item: WrongBookItem }) {
  const item = props.item;
  const cleared = item.status === 'cleared';
  return (
    <View
      className="wb-card"
      onClick={() => void Taro.navigateTo({ url: `/pages/wrong-book/detail/index?id=${item.id}` })}
    >
      <View className="wb-tags">
        <View className="wb-tags-left">
          <Text className={typeClass(item.type)}>
            {item.type ? QUIZ_TYPE_LABELS[item.type] : '题目'}
          </Text>
          <Text className="wb-wrong">错 {item.wrongCount} 次</Text>
        </View>
        <Text className={cleared ? 'wb-status wb-status-ok' : 'wb-status'}>
          {cleared ? '已消灭' : '待消灭'}
        </Text>
      </View>
      <Text className="wb-stem">{item.stem}</Text>
      <View className="wb-meta">
        <Text className="wb-meta-main">{knowledgeLine(item)}</Text>
        <Text className="wb-meta-date">{formatWrongDate(item.updatedAt)}</Text>
        <Text className="wb-chev">›</Text>
      </View>
    </View>
  );
}

function Skeleton() {
  return (
    <View className="wb-stack">
      <View className="wb-skel-summary">
        <View className="wb-skel-col">
          <View className="wb-skel wb-skel-label" />
          <View className="wb-skel wb-skel-num" />
        </View>
        <View className="wb-split" />
        <View className="wb-skel-col">
          <View className="wb-skel wb-skel-label wb-skel-label-sm" />
          <View className="wb-skel wb-skel-num wb-skel-num-wide" />
          <View className="wb-skel wb-skel-bar" />
        </View>
      </View>
      <View className="wb-skel-row">
        <View className="wb-skel-pill wb-skel-w88" />
        <View className="wb-skel-pill wb-skel-w80" />
        <View className="wb-skel-pill wb-skel-w72" />
      </View>
      <View className="wb-skel-row wb-skel-row-tight">
        <View className="wb-skel-pill wb-skel-w72" />
        <View className="wb-skel-pill wb-skel-w48" />
        <View className="wb-skel-pill wb-skel-w64" />
        <View className="wb-skel-pill wb-skel-w70" />
      </View>
      {SKELETON_CARDS.map((card) => (
        <View key={card} className="wb-skel-card">
          <View className="wb-skel-tags">
            <View className="wb-skel-tags-left">
              <View className="wb-skel-tag wb-skel-tag-a" />
              <View className="wb-skel-tag wb-skel-tag-b" />
            </View>
            <View className="wb-skel-tag wb-skel-tag-c" />
          </View>
          <View className="wb-skel-line" />
          <View className="wb-skel-line wb-skel-line-short" />
        </View>
      ))}
    </View>
  );
}
