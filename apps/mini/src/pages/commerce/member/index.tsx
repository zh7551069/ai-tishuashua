import { Button, Image, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { formatPriceYuan, type CommerceSkuPublic, type EntitlementView } from '@tishuashua/shared';
import { useEffect, useRef, useState } from 'react';
import iconChevron from '../../../assets/commerce/chevron.svg';
import iconCrown from '../../../assets/commerce/crown.svg';
import iconPack from '../../../assets/commerce/pack-note.svg';
import iconDot from '../../../assets/commerce/radio-dot.svg';
import iconOff from '../../../assets/commerce/radio-off.svg';
import iconOn from '../../../assets/commerce/radio-on.svg';
import iconWechat from '../../../assets/commerce/wechat.svg';
import { Screen } from '../../../components/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { EXHAUSTED_ROUTES } from '../../../services/exhausted-sheet';
import {
  createIdempotencyStore,
  createMembershipPayer,
  describeMemberSelection,
  loadMembershipOffer,
  MEMBER_PAY_CANCELLED,
  type MemberSelection,
} from '../../../services/membership-pay';
import { createMembershipPayTransport } from '../../../services/membership-pay-client';
import {
  MEMBER_CHIPS,
  MEMBER_HERO_NOTE,
  MEMBER_HERO_SUB,
  MEMBER_HERO_TITLE,
  MEMBER_PAGE_TITLE,
  MEMBER_PAY_CAPTION,
  MEMBER_RECOMMENDED_BADGE,
  MEMBER_RULE_BODY,
  MEMBER_RULE_TITLE,
  MEMBER_SUCCESS_TOAST,
  MEMBER_TERMS_LABEL,
  MEMBER_TERMS_ROUTE,
  memberPayBlock,
  memberPayLabel,
  memberPeriodSuffix,
  memberSkuSubtitle,
  memberUpgradeCaption,
  sessionPackEntryLabel,
} from '../../../services/membership-present';
import { withAuth } from '../../../services/guard';
import { readToken } from '../../../services/session';
import './index.css';

const transport = createMembershipPayTransport();
const payer = createMembershipPayer(transport);

export default function MemberPricingPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [skus, setSkus] = useState<CommerceSkuPublic[]>([]);
  const [pack, setPack] = useState<CommerceSkuPublic | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementView | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [quoteFen, setQuoteFen] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const payingRef = useRef(false);
  const quoteTicket = useRef(0);
  const keys = useRef(createIdempotencyStore()).current;
  const selected = skus.find((sku) => sku.code === selectedCode) ?? null;

  const load = async () => {
    if (payingRef.current) {
      return;
    }
    setError('');
    try {
      const offer = await withAuth((token) => loadMembershipOffer(token, transport));
      if (!offer) {
        return;
      }
      if (!offer.ok) {
        setError(offer.message);
        setStatus('error');
        return;
      }
      setSkus(offer.skus);
      setPack(offer.sessionPack);
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

  useEffect(() => {
    if (status !== 'ready' || !selected || !entitlement || payingRef.current) {
      return;
    }
    const decision = describeMemberSelection({
      membershipActive: entitlement.membership.active,
      currentSkuCode: entitlement.membership.skuCode,
      catalog: skus,
      target: selected,
    });
    if (!decision.ok || decision.kind !== 'upgrade') {
      setQuoteFen(null);
      setQuoting(false);
      return;
    }
    const token = readToken();
    if (!token) {
      setQuoting(false);
      return;
    }
    const ticket = quoteTicket.current + 1;
    quoteTicket.current = ticket;
    setQuoting(true);
    setQuoteFen(null);
    void transport.upgradeQuote(token, selected.code).then(
      (quote) => {
        if (quoteTicket.current !== ticket) {
          return;
        }
        setQuoteFen(quote.payFen);
        setQuoting(false);
      },
      (cause: unknown) => {
        if (quoteTicket.current !== ticket) {
          return;
        }
        setQuoteFen(null);
        setQuoting(false);
        const message = cause instanceof Error && cause.message ? cause.message : '询价失败';
        void Taro.showToast({ title: message, icon: 'none' });
      },
    );
    return () => {
      if (quoteTicket.current === ticket) {
        quoteTicket.current += 1;
      }
    };
  }, [status, selected, entitlement, skus, quoteNonce]);

  const onSelect = (code: string) => {
    if (payingRef.current || !entitlement) {
      return;
    }
    const sku = skus.find((item) => item.code === code);
    if (!sku) {
      return;
    }
    const decision = describeMemberSelection({
      membershipActive: entitlement.membership.active,
      currentSkuCode: entitlement.membership.skuCode,
      catalog: skus,
      target: sku,
    });
    if (!decision.ok) {
      void Taro.showToast({ title: decision.message, icon: 'none' });
    }
    if (code === selectedCode) {
      setQuoteNonce((value) => value + 1);
      return;
    }
    setSelectedCode(code);
  };

  const onPay = async () => {
    if (!selected || !entitlement || payingRef.current) {
      return;
    }
    const decision = describeMemberSelection({
      membershipActive: entitlement.membership.active,
      currentSkuCode: entitlement.membership.skuCode,
      catalog: skus,
      target: selected,
    });
    const block = memberPayBlock({
      decision,
      skuPriceFen: selected.priceFen,
      quotePayFen: quoteFen,
      quoting,
      paying: false,
    });
    if (block.intercept) {
      void Taro.showToast({ title: block.intercept, icon: 'none' });
      return;
    }
    if (block.disabled) {
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
        membershipActive: entitlement.membership.active,
        currentSkuCode: entitlement.membership.skuCode,
        catalog: skus,
        clientIdempotencyKey: keys.keyFor(selected.code),
      });
      if (!result.ok) {
        if (result.code !== MEMBER_PAY_CANCELLED) {
          void Taro.showToast({ title: result.message, icon: 'none' });
        }
        return;
      }
      keys.clear();
      void Taro.showToast({ title: MEMBER_SUCCESS_TOAST, icon: 'success' });
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

  const decision: MemberSelection | null =
    selected && entitlement
      ? describeMemberSelection({
          membershipActive: entitlement.membership.active,
          currentSkuCode: entitlement.membership.skuCode,
          catalog: skus,
          target: selected,
        })
      : null;
  const block =
    decision && selected
      ? memberPayBlock({
          decision,
          skuPriceFen: selected.priceFen,
          quotePayFen: quoteFen,
          quoting,
          paying,
        })
      : null;
  const showPay = status === 'ready' && selected && block;

  return (
    <Screen
      back
      centerTitle
      navPlain
      navClassName="mem-nav"
      title={MEMBER_PAGE_TITLE}
      background="#ffffff"
      footerClassName="mem-foot"
      footer={
        showPay ? (
          <MemberPayBar
            label={memberPayLabel(block.fen, paying)}
            caption={memberUpgradeCaption(decision?.ok ? decision.kind : null, block.fen)}
            disabled={block.disabled}
            onPay={() => void onPay()}
            onTerms={() => void Taro.navigateTo({ url: MEMBER_TERMS_ROUTE })}
          />
        ) : null
      }
    >
      {status === 'loading' ? <LoadingBlock label="正在加载会员" /> : null}
      {status === 'error' ? <ErrorBlock detail={error} onRetry={() => void load()} /> : null}
      {status === 'ready' ? (
        <View className="mem-page">
          <MemberHeroCard />
          <MemberBenefitChips />
          {skus.length === 0 ? (
            <EmptyBlock title="暂无可购会员" detail="会员档位暂时下架" />
          ) : (
            <MemberSkuList skus={skus} selectedCode={selectedCode} onSelect={onSelect} />
          )}
          <MemberRulesCard />
          <SessionPackEntryRow
            label={sessionPackEntryLabel(pack)}
            onOpen={() => void Taro.navigateTo({ url: EXHAUSTED_ROUTES.pack })}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function MemberHeroCard() {
  return (
    <View className="mem-hero">
      <View className="mem-hero-copy">
        <Text className="mem-hero-title">{MEMBER_HERO_TITLE}</Text>
        <Text className="mem-hero-sub">{MEMBER_HERO_SUB}</Text>
        <Text className="mem-hero-note">{MEMBER_HERO_NOTE}</Text>
      </View>
      <Image className="mem-crown" src={iconCrown} mode="aspectFit" />
    </View>
  );
}

function MemberBenefitChips() {
  return (
    <View className="mem-chips">
      {MEMBER_CHIPS.map((chip) => (
        <View key={chip} className="mem-chip">
          <Text className="mem-chip-text">{chip}</Text>
        </View>
      ))}
    </View>
  );
}

function MemberSkuList(props: {
  skus: CommerceSkuPublic[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  return (
    <View className="mem-skus">
      {props.skus.map((sku) => (
        <MemberSkuRow
          key={sku.code}
          sku={sku}
          selected={sku.code === props.selectedCode}
          onSelect={() => props.onSelect(sku.code)}
        />
      ))}
    </View>
  );
}

function MemberSkuRow(props: { sku: CommerceSkuPublic; selected: boolean; onSelect: () => void }) {
  const subtitle = memberSkuSubtitle(props.sku);
  return (
    <View className={props.selected ? 'mem-sku mem-sku-on' : 'mem-sku'} onClick={props.onSelect}>
      {props.sku.recommended ? (
        <View className="mem-badge">
          <Text className="mem-badge-text">{MEMBER_RECOMMENDED_BADGE}</Text>
        </View>
      ) : null}
      <View className="mem-radio">
        <Image
          className="mem-radio-ring"
          src={props.selected ? iconOn : iconOff}
          mode="aspectFit"
        />
        {props.selected ? <Image className="mem-radio-dot" src={iconDot} mode="aspectFit" /> : null}
      </View>
      <View className="mem-sku-copy">
        <Text className="mem-sku-name">{props.sku.name}</Text>
        {subtitle ? (
          <Text className={props.selected ? 'mem-sku-sub mem-sku-sub-on' : 'mem-sku-sub'}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="mem-sku-price">
        <Text className={props.selected ? 'mem-sku-fen mem-sku-fen-on' : 'mem-sku-fen'}>
          ¥{formatPriceYuan(props.sku.priceFen)}
        </Text>
        <Text className="mem-sku-unit">{memberPeriodSuffix(props.sku)}</Text>
      </View>
    </View>
  );
}

function MemberRulesCard() {
  return (
    <View className="mem-rules">
      <Text className="mem-rules-title">{MEMBER_RULE_TITLE}</Text>
      <Text className="mem-rules-body">{MEMBER_RULE_BODY}</Text>
    </View>
  );
}

function SessionPackEntryRow(props: { label: string; onOpen: () => void }) {
  return (
    <View className="mem-pack" onClick={props.onOpen}>
      <Image className="mem-pack-icon" src={iconPack} mode="aspectFit" />
      <Text className="mem-pack-label">{props.label}</Text>
      <Image className="mem-pack-chevron" src={iconChevron} mode="aspectFit" />
    </View>
  );
}

function MemberPayBar(props: {
  label: string;
  caption: string | null;
  disabled: boolean;
  onPay: () => void;
  onTerms: () => void;
}) {
  return (
    <View>
      <View className="mem-foot-note">
        {props.caption ? <Text className="mem-diff">{props.caption}</Text> : null}
        <View className="mem-wechat">
          <View className="mem-wx">
            <Image className="mem-wx-icon" src={iconWechat} mode="aspectFit" />
            <Text className="mem-wx-mark">微</Text>
          </View>
          <Text className="mem-wechat-text">{MEMBER_PAY_CAPTION}</Text>
          <Text className="mem-terms" onClick={props.onTerms}>
            {MEMBER_TERMS_LABEL}
          </Text>
        </View>
      </View>
      <Button className="mem-pay" hoverClass="none" disabled={props.disabled} onClick={props.onPay}>
        {props.label}
      </Button>
    </View>
  );
}
