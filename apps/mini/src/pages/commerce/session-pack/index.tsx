import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { CommerceSkuPublic, EntitlementView } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { withAuth } from '../../../services/guard';
import {
  SESSION_PACK_PAY_CANCELLED,
  SESSION_PACK_PAY_IN_PROGRESS,
  createSessionPackIdempotencyStore,
  createSessionPackPayer,
  loadSessionPackOffer,
} from '../../../services/session-pack-pay';
import { createSessionPackPayTransport } from '../../../services/session-pack-pay-client';
import {
  SESSION_PACK_CLOSE,
  SESSION_PACK_EMPTY_DETAIL,
  SESSION_PACK_EMPTY_TITLE,
  SESSION_PACK_MEMBER_NOTE,
  SESSION_PACK_RULES,
  SESSION_PACK_SUCCESS_TOAST,
  SESSION_PACK_TITLE,
  sessionPackHeadline,
  sessionPackPayLabel,
  sessionPackPayableFen,
  sessionPackPriceLabel,
  sessionPackSubtitle,
} from '../../../services/session-pack-present';
import { readToken } from '../../../services/session';
import './index.css';

const transport = createSessionPackPayTransport();
const payer = createSessionPackPayer(transport);

export default function SessionPackPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [skus, setSkus] = useState<CommerceSkuPublic[]>([]);
  const [entitlement, setEntitlement] = useState<EntitlementView | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [chargedFen, setChargedFen] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);
  const keys = useRef(createSessionPackIdempotencyStore()).current;
  const selected = skus.find((sku) => sku.code === selectedCode) ?? null;
  const payableFen = sessionPackPayableFen(selected?.priceFen, chargedFen);

  const load = async () => {
    if (payingRef.current) {
      return;
    }
    setError('');
    try {
      const offer = await withAuth((token) => loadSessionPackOffer(token, transport));
      if (!offer) {
        return;
      }
      if (!offer.ok) {
        setError(offer.message);
        setStatus('error');
        return;
      }
      setSkus(offer.skus);
      setEntitlement(offer.entitlement);
      setSelectedCode((current) =>
        current && offer.skus.some((sku) => sku.code === current) ? current : offer.selectedCode,
      );
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : '加载失败');
      setStatus('error');
    }
  };

  useDidShow(() => {
    void load();
  });

  const leave = () => {
    if (payingRef.current) {
      return;
    }
    void Taro.navigateBack({
      fail: () => {
        void Taro.reLaunch({ url: '/pages/home/index' });
      },
    });
  };

  const onSelect = (code: string) => {
    if (payingRef.current || code === selectedCode) {
      return;
    }
    setChargedFen(null);
    setSelectedCode(code);
  };

  const onPay = async () => {
    if (!selected || !entitlement || payingRef.current || payableFen === null) {
      return;
    }
    const token = readToken();
    if (!token) {
      return;
    }
    payingRef.current = true;
    setPaying(true);
    try {
      const result = await payer.pay({
        token,
        target: selected,
        inventoryRemainBefore: entitlement.balances.inventoryRemain,
        clientIdempotencyKey: keys.keyFor(selected.code),
        onOrder: (order) => setChargedFen(order.amountFen),
      });
      if (!result.ok) {
        if (
          result.code !== SESSION_PACK_PAY_CANCELLED &&
          result.code !== SESSION_PACK_PAY_IN_PROGRESS
        ) {
          void Taro.showToast({ title: result.message, icon: 'none' });
        }
        return;
      }
      keys.clear();
      void Taro.showToast({ title: SESSION_PACK_SUCCESS_TOAST, icon: 'success' });
      void Taro.navigateBack({
        fail: () => {
          void Taro.reLaunch({ url: '/pages/home/index' });
        },
      });
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };

  const showPay = status === 'ready' && selected && payableFen !== null;

  return (
    <View className="pack-mask" catchMove onClick={leave}>
      <View
        className="pack-sheet"
        catchMove
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <Text className="pack-title">{SESSION_PACK_TITLE}</Text>
        <View className="pack-body">
          {status === 'loading' ? <LoadingBlock label="正在加载加油包" /> : null}
          {status === 'error' ? <ErrorBlock detail={error} onRetry={() => void load()} /> : null}
          {status === 'ready' ? (
            <View>
              {skus.length === 0 ? (
                <EmptyBlock title={SESSION_PACK_EMPTY_TITLE} detail={SESSION_PACK_EMPTY_DETAIL} />
              ) : (
                <SessionPackSkuList skus={skus} selectedCode={selectedCode} onSelect={onSelect} />
              )}
              <SessionPackRules />
              {entitlement?.membership.active ? (
                <Text className="pack-member">{SESSION_PACK_MEMBER_NOTE}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View className="pack-actions">
          {showPay ? (
            <SessionPackPayBar
              label={sessionPackPayLabel(payableFen, paying)}
              disabled={paying}
              onPay={() => void onPay()}
            />
          ) : null}
          <Text className="pack-close" onClick={leave}>
            {SESSION_PACK_CLOSE}
          </Text>
        </View>
      </View>
    </View>
  );
}

function SessionPackSkuList(props: {
  skus: CommerceSkuPublic[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  const choosing = props.skus.length > 1;
  return (
    <View className="pack-list">
      {props.skus.map((sku) => (
        <SessionPackSkuCard
          key={sku.code}
          sku={sku}
          selected={choosing && sku.code === props.selectedCode}
          onSelect={() => props.onSelect(sku.code)}
        />
      ))}
    </View>
  );
}

function SessionPackSkuCard(props: {
  sku: CommerceSkuPublic;
  selected: boolean;
  onSelect: () => void;
}) {
  const price = sessionPackPriceLabel(props.sku.priceFen);
  return (
    <View
      className={props.selected ? 'pack-card pack-card-on' : 'pack-card'}
      onClick={props.onSelect}
    >
      <View className="pack-copy">
        <Text className="pack-name">{sessionPackHeadline(props.sku)}</Text>
        <Text className="pack-sub">{sessionPackSubtitle(props.sku)}</Text>
      </View>
      {price ? <Text className="pack-price">{price}</Text> : null}
    </View>
  );
}

function SessionPackRules() {
  return (
    <View className="pack-rules">
      {SESSION_PACK_RULES.map((rule) => (
        <Text key={rule} className="pack-rule">
          · {rule}
        </Text>
      ))}
    </View>
  );
}

function SessionPackPayBar(props: { label: string; disabled: boolean; onPay: () => void }) {
  return (
    <Button className="pack-pay" hoverClass="none" disabled={props.disabled} onClick={props.onPay}>
      {props.label}
    </Button>
  );
}
