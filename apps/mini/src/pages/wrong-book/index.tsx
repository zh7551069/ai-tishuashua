import { Image, Input, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { QUIZ_TYPE_LABELS, type WrongBookItem } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { CelebrateOverlay } from '../../components/CelebrateOverlay';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchWrongBook } from '../../services/wrong-book-api';
import iconCaret from './assets/55r94y.svg';
import iconBangDot from './assets/1rtkxxf.svg';
import iconBangRing from './assets/1fgdeq6.svg';
import iconBangStem from './assets/6gwjkp.svg';
import iconGo from './assets/1bvywj7.svg';
import iconInfoDot from './assets/146aq74.svg';
import iconInfoRing from './assets/t1t83z.svg';
import iconInfoStem from './assets/pqs3m7.svg';
import iconSearchHandle from './assets/p2vwz1.svg';
import iconSearchRing from './assets/1emiy8l.svg';
import iconStatusCheck from './assets/1mdg3bo.svg';
import sharedArt from '../score/assets/f0114f64c2773fdcbfd45bf1155f8fb4c6b41e78.png';
import { ClearanceRing } from './ring-view';
import './index.css';
import {
  CELEBRATE_KEY,
  type StatusFilter,
  formatWrongDate,
  inScope,
  isSameLocalDay,
  knowledgeLine,
  localDayKey,
} from './present';

const SKELETON_CARDS = [
  { line: 'wb-skel-line-a', key: 'a' },
  { line: 'wb-skel-line-b', key: 'b' },
  { line: 'wb-skel-line-a', key: 'c' },
  { line: 'wb-skel-line-b', key: 'd' },
];

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
    <View className="wb-search-hit" onClick={searchEnabled ? toggleSearch : undefined}>
      <View className="wb-search-ico">
        <Image className="wb-search-ring" src={iconSearchRing} mode="aspectFit" />
        <Image className="wb-search-handle" src={iconSearchHandle} mode="aspectFit" />
      </View>
    </View>
  );

  return (
    <Screen
      back
      centerTitle
      navPlain
      navClassName="wb-nav"
      bodyFill
      title="错题本"
      background="#f5f5f7"
      right={right}
    >
      {failed ? (
        <View className="wb-fill">
          <View className="wb-bang">
            <Image className="wb-bang-ring" src={iconBangRing} mode="aspectFit" />
            <Image className="wb-bang-stem" src={iconBangStem} mode="aspectFit" />
            <Image className="wb-bang-dot" src={iconBangDot} mode="aspectFit" />
          </View>
          <Text className="wb-state-title">错题本加载失败</Text>
          <Text className="wb-state-sub">网络好像不太稳定，请检查后重试</Text>
          <View className="wb-cta wb-cta-line" onClick={() => void load()}>
            <Text className="wb-cta-line-text">重新加载</Text>
          </View>
        </View>
      ) : null}
      {!ready && !failed ? <Skeleton /> : null}
      {bookEmpty ? (
        <View className="wb-fill">
          <View className="wb-art-wrap">
            <Image className="wb-art" src={sharedArt} mode="aspectFit" />
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
                placeholderStyle="color:#78716c"
                value={query}
                focus={searchFocus}
                onBlur={() => setSearchFocus(false)}
                onInput={(event) => setQuery(event.detail.value)}
              />
            </View>
          ) : null}
          <View className="wb-hero">
            <View className="wb-hero-copy">
              <Text className="wb-hero-kicker">已消灭</Text>
              <View className="wb-headline">
                <Text className="wb-hero-num">{cleared}</Text>
                <Text className="wb-hero-den"> / {total}</Text>
              </View>
              <Text className="wb-hero-sub">累计错题 {total} 道</Text>
            </View>
            <ClearanceRing cleared={cleared} total={total} />
          </View>
          <View className="wb-segs">
            <Segment
              label={`待消灭 ${pending}`}
              on={filter === 'pending'}
              onClick={() => setFilter('pending')}
            />
            <Segment
              label={`已消灭 ${clearedScoped}`}
              on={filter === 'cleared'}
              onClick={() => setFilter('cleared')}
            />
            <Segment
              label={`全部 ${scoped.length}`}
              on={filter === 'all'}
              onClick={() => setFilter('all')}
            />
          </View>
          <ScrollView className="wb-filters" scrollX enableFlex showScrollbar={false}>
            <View className="wb-filters-row">
              <FilterChip label="全部证书" on={certId === 'all'} onClick={() => setCertId('all')} />
              {certs.map((cert) => (
                <FilterChip
                  key={cert.id}
                  label={cert.name}
                  on={certId === cert.id}
                  onClick={() => setCertId(cert.id)}
                />
              ))}
              <FilterChip
                label="近 30 天"
                on={recent}
                caret
                onClick={() => setRecent((value) => !value)}
              />
            </View>
          </ScrollView>
          <View className="wb-tip">
            <View className="wb-info">
              <Image className="wb-info-ring" src={iconInfoRing} mode="aspectFit" />
              <Image className="wb-info-stem" src={iconInfoStem} mode="aspectFit" />
              <Image className="wb-info-dot" src={iconInfoDot} mode="aspectFit" />
            </View>
            <Text className="wb-tip-text">
              错题将会随机出现在练习试卷中，答对即可标注为“已消灭”
            </Text>
          </View>
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
          <View className="wb-celebrate-body">
            <View className="wb-celebrate-card">
              <View className="wb-art-wrap">
                <Image className="wb-art" src={sharedArt} mode="aspectFit" />
              </View>
              <Text className="wb-kicker">今日战绩</Text>
              <Text className="wb-wow">太棒了！</Text>
              <Text className="wb-wow-sub">在职备考又向前一步</Text>
              <View className="wb-tally-box">
                <View className="wb-tally-line">
                  <Text className="wb-tally-text">今天消灭了 </Text>
                  <Text className="wb-tally-num">{todayCleared}</Text>
                  <Text className="wb-tally-text"> 道题</Text>
                </View>
                <Text className="wb-tally-text">
                  累计已消灭 {cleared} 道 · 待消灭还剩 {pendingLeft} 道
                </Text>
              </View>
              <Text className="wb-keep">继续加油</Text>
              <Text className="wb-celebrate-hint">点按任意处关闭</Text>
            </View>
          </View>
        </CelebrateOverlay>
      ) : null}
    </Screen>
  );
}

function Segment(props: { label: string; on: boolean; onClick: () => void }) {
  return (
    <View className={props.on ? 'wb-seg wb-seg-on' : 'wb-seg'} onClick={props.onClick}>
      <Text className="wb-seg-text">{props.label}</Text>
    </View>
  );
}

function FilterChip(props: { label: string; on: boolean; caret?: boolean; onClick: () => void }) {
  return (
    <View className={props.on ? 'wb-filter wb-filter-on' : 'wb-filter'} onClick={props.onClick}>
      <Text className="wb-filter-text">{props.label}</Text>
      {props.caret ? <Image className="wb-caret" src={iconCaret} mode="aspectFit" /> : null}
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
      <Text className="wb-stem">{item.stem}</Text>
      <View className="wb-tags">
        <Text className="wb-type">{item.type ? QUIZ_TYPE_LABELS[item.type] : '题目'}</Text>
        <Text className="wb-wrong">错 {item.wrongCount} 次</Text>
        <View className="wb-spacer" />
        <View className={cleared ? 'wb-status wb-status-ok' : 'wb-status'}>
          {cleared ? (
            <Image className="wb-status-check" src={iconStatusCheck} mode="aspectFit" />
          ) : null}
          <Text className="wb-status-text">{cleared ? '已消灭' : '待消灭'}</Text>
        </View>
      </View>
      <View className="wb-meta">
        <Text className="wb-meta-main">{knowledgeLine(item)}</Text>
        <Text className="wb-meta-date">{formatWrongDate(item.updatedAt)}</Text>
        <Image className="wb-go" src={iconGo} mode="aspectFit" />
      </View>
    </View>
  );
}

function Skeleton() {
  return (
    <View className="wb-stack">
      <View className="wb-hero wb-hero-skel">
        <View className="wb-hero-copy">
          <View className="wb-skel wb-skel-kicker" />
          <View className="wb-skel wb-skel-headline" />
          <View className="wb-skel wb-skel-sub" />
        </View>
        <ClearanceRing skeleton />
      </View>
      <View className="wb-segs">
        <View className="wb-skel-seg" />
        <View className="wb-skel-seg" />
        <View className="wb-skel-seg" />
      </View>
      <View className="wb-skel-filters">
        <View className="wb-skel-pill wb-skel-w72" />
        <View className="wb-skel-pill wb-skel-w48" />
        <View className="wb-skel-pill wb-skel-w72" />
        <View className="wb-skel-pill wb-skel-w80" />
      </View>
      <View className="wb-list">
        {SKELETON_CARDS.map((card) => (
          <View key={card.key} className="wb-skel-card">
            <View className="wb-skel wb-skel-bar-full" />
            <View className={`wb-skel wb-skel-bar ${card.line}`} />
            <View className="wb-skel-tags">
              <View className="wb-skel-tag wb-skel-tag-a" />
              <View className="wb-skel-tag wb-skel-tag-b" />
              <View className="wb-skel-tag wb-skel-tag-c" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
