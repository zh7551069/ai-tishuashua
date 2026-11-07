import { Text, View } from '@tarojs/components';
import { useDidShow, useReachBottom } from '@tarojs/taro';
import type { EntitlementLedgerItem } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchEntitlement, fetchEntitlementLedger } from '../../../services/commerce-api';
import { isAuthFailure, withAuth } from '../../../services/guard';
import {
  SESSION_LEDGER_AVAILABLE_TITLE,
  SESSION_LEDGER_EMPTY,
  SESSION_LEDGER_FILTER_EMPTY,
  SESSION_LEDGER_LOAD_MORE,
  SESSION_LEDGER_LOADING_MORE,
  SESSION_LEDGER_PAGE_LIMIT,
  SESSION_LEDGER_PAGE_TITLE,
  SESSION_LEDGER_RESET_NOTE,
  SESSION_LEDGER_TABS,
  SESSION_LEDGER_TODAY_DEBIT_LABEL,
  SESSION_LEDGER_UNIT,
  SESSION_LEDGER_UNKNOWN,
  appendLedgerItems,
  filterSessionLedgerRows,
  presentSessionLedgerAvailability,
  presentSessionLedgerRows,
  readEntitlementLedgerPage,
  sumTodayDebitSessions,
  type SessionLedgerAvailability,
  type SessionLedgerTab,
} from '../../../services/session-ledger-present';
import './index.css';

/**
 * 场次明细。对稿 design/bridge-export/mini-commerce-v2（122:9 / 127:8932）。
 * 只读 entitlement + ledger。不下单，不带版本角标。
 */
export default function SessionLedgerPage() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [availability, setAvailability] = useState<SessionLedgerAvailability | null>(null);
  const [businessDate, setBusinessDate] = useState('');
  const [items, setItems] = useState<EntitlementLedgerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<SessionLedgerTab>('all');
  const generation = useRef(0);
  const busyRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const loadFirst = async () => {
    const ticket = generation.current + 1;
    generation.current = ticket;
    busyRef.current = true;
    setPhase('loading');
    setError('');
    setMoreError('');
    try {
      const loaded = await withAuth(async (token) => {
        const [entitlement, ledger] = await Promise.all([
          fetchEntitlement(token),
          fetchEntitlementLedger(token, { limit: SESSION_LEDGER_PAGE_LIMIT }),
        ]);
        return { entitlement, ledger };
      });
      if (ticket !== generation.current) {
        return;
      }
      if (!loaded) {
        return;
      }
      const card = presentSessionLedgerAvailability(loaded.entitlement);
      const page = readEntitlementLedgerPage(loaded.ledger);
      if (!card || !page) {
        throw new Error('场次明细暂时无法识别');
      }
      const day = /^\d{4}-\d{2}-\d{2}$/.test(loaded.entitlement.businessDate)
        ? loaded.entitlement.businessDate
        : '';
      setAvailability(card);
      setBusinessDate(day);
      setItems(page.items);
      cursorRef.current = page.nextCursor;
      setNextCursor(page.nextCursor);
      setPhase('ready');
    } catch (caught) {
      if (ticket !== generation.current || isAuthFailure(caught)) {
        return;
      }
      setAvailability(null);
      setItems([]);
      cursorRef.current = null;
      setNextCursor(null);
      setPhase('error');
      setError(caught instanceof Error ? caught.message : '加载失败');
    } finally {
      if (ticket === generation.current) {
        busyRef.current = false;
      }
    }
  };

  const loadMore = async () => {
    const cursor = cursorRef.current;
    const ticket = generation.current;
    if (!cursor || busyRef.current || phaseRef.current !== 'ready') {
      return;
    }
    busyRef.current = true;
    setLoadingMore(true);
    setMoreError('');
    try {
      const loaded = await withAuth((token) =>
        fetchEntitlementLedger(token, { limit: SESSION_LEDGER_PAGE_LIMIT, cursor }),
      );
      if (ticket !== generation.current) {
        return;
      }
      if (!loaded) {
        return;
      }
      const page = readEntitlementLedgerPage(loaded);
      if (!page) {
        throw new Error('场次流水无法识别');
      }
      setItems((current) => appendLedgerItems(current, page.items));
      cursorRef.current = page.nextCursor;
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (ticket !== generation.current || isAuthFailure(caught)) {
        return;
      }
      setMoreError(caught instanceof Error ? caught.message : '加载失败');
    } finally {
      if (ticket === generation.current) {
        busyRef.current = false;
        setLoadingMore(false);
      }
    }
  };

  useDidShow(() => {
    void loadFirst();
  });

  useReachBottom(() => {
    void loadMore();
  });

  const rows = presentSessionLedgerRows(items, businessDate);
  const visible = filterSessionLedgerRows(rows, tab);
  const todayDebit = businessDate ? sumTodayDebitSessions(items, businessDate) : null;
  const failed = phase === 'error';

  return (
    <Screen
      back
      centerTitle
      navPlain
      navClassName="sl-nav"
      title={SESSION_LEDGER_PAGE_TITLE}
      background="#f8f9fb"
      bodyFill={failed}
    >
      {phase === 'loading' ? <LoadingBlock label="正在加载" /> : null}
      {failed ? <ErrorBlock detail={error} onRetry={() => void loadFirst()} /> : null}
      {phase === 'ready' && availability ? (
        <View className="sl-page">
          <View className="sl-card">
            <View className="sl-avail">
              <Text className="sl-label">{SESSION_LEDGER_AVAILABLE_TITLE}</Text>
              <View className="sl-count">
                <Text
                  className={availability.mode === 'unlimited' ? 'sl-count-wide' : 'sl-count-num'}
                >
                  {availability.headline}
                </Text>
                {availability.showUnit ? (
                  <Text className="sl-count-unit">{SESSION_LEDGER_UNIT}</Text>
                ) : null}
              </View>
              <Text className="sl-sub">{availability.subtitle}</Text>
            </View>
            <View className="sl-split" />
            <View className="sl-spent">
              <Text className="sl-spent-label">{SESSION_LEDGER_TODAY_DEBIT_LABEL}</Text>
              <Text className="sl-spent-num">
                {todayDebit === null
                  ? SESSION_LEDGER_UNKNOWN
                  : `${todayDebit} ${SESSION_LEDGER_UNIT}`}
              </Text>
              <Text className="sl-spent-note">{SESSION_LEDGER_RESET_NOTE}</Text>
            </View>
          </View>
          <View className="sl-tabs">
            {SESSION_LEDGER_TABS.map((item) => {
              const selected = item.id === tab;
              return (
                <View
                  key={item.id}
                  className={selected ? 'sl-tab sl-tab-on' : 'sl-tab'}
                  onClick={() => setTab(item.id)}
                >
                  <Text className={selected ? 'sl-tab-text sl-tab-text-on' : 'sl-tab-text'}>
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>
          <View className="sl-list">
            {visible.length === 0 ? (
              <EmptyBlock
                className="sl-empty"
                title={items.length === 0 ? SESSION_LEDGER_EMPTY : SESSION_LEDGER_FILTER_EMPTY}
              />
            ) : (
              visible.map((row) => (
                <View key={row.id} className="sl-row">
                  <View className={`sl-badge sl-badge-${row.mark}`}>
                    <Text className={`sl-badge-text sl-badge-text-${row.mark}`}>
                      {row.markLabel}
                    </Text>
                  </View>
                  <Text className="sl-row-title">{row.title}</Text>
                  <Text className={`sl-delta sl-delta-${row.mark}`}>{row.deltaLabel}</Text>
                  <Text className="sl-time">{row.timeLabel}</Text>
                  <View className="sl-row-line" />
                </View>
              ))
            )}
            {nextCursor ? (
              <View className="sl-more" onClick={() => void loadMore()}>
                <Text className="sl-more-text">
                  {loadingMore ? SESSION_LEDGER_LOADING_MORE : SESSION_LEDGER_LOAD_MORE}
                </Text>
              </View>
            ) : null}
            {moreError ? <Text className="sl-more-error">{moreError}</Text> : null}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
