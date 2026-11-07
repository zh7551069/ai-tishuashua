import { Button, Image, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import { useRef, useState } from 'react';
import shareMark from '../../../assets/me-commerce/share-a.svg';
import { Screen } from '../../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchGrowth, postGrowthShareToken } from '../../../services/commerce-api';
import { withAuth } from '../../../services/guard';
import {
  DAILY_SHARE_TITLE,
  presentDailyShare,
  shareLaunchPath,
  type DailySharePresent,
} from '../../../services/growth-present';
import { HttpError } from '../../../services/http';
import { BridgeBack } from '../../../ui/glyphs';
import './index.css';

/**
 * 每日分享领场。对稿 122:8（子层 127:8910 / 127:8920 / 127:8923 / 127:8926 / 127:8928）。
 * 奖额和状态只读 growth。空点分享不记已领。不支付。
 */
export default function DailySharePage() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [card, setCard] = useState<DailySharePresent | null>(null);
  const [shareToken, setShareToken] = useState('');
  const tokenRef = useRef('');
  const titleRef = useRef(DAILY_SHARE_TITLE);

  useShareAppMessage(() => ({
    title: titleRef.current,
    path: shareLaunchPath(tokenRef.current),
  }));
  useShareTimeline(() => ({
    title: titleRef.current,
    query: tokenRef.current ? `shareToken=${tokenRef.current}` : '',
  }));

  const load = async () => {
    setPhase('loading');
    try {
      const growth = await withAuth((token) => fetchGrowth(token));
      if (!growth) {
        return;
      }
      const next = presentDailyShare(growth);
      titleRef.current = next.heroTitle;
      setCard(next);
      setPhase('ready');
    } catch (caught) {
      setPhase('error');
      setCard(null);
      if (!(caught instanceof HttpError)) {
        return;
      }
    }
  };

  useDidShow(() => {
    void Taro.showShareMenu({
      withShareTicket: false,
      showShareItems: ['shareAppMessage', 'shareTimeline'],
    }).catch(() => undefined);
    void load();
  });

  const ensureToken = async (): Promise<string> => {
    if (tokenRef.current) {
      return tokenRef.current;
    }
    const issued = await withAuth((token) => postGrowthShareToken(token));
    if (!issued?.shareToken) {
      return '';
    }
    tokenRef.current = issued.shareToken;
    setShareToken(issued.shareToken);
    const growth = await withAuth((token) => fetchGrowth(token));
    if (growth) {
      const next = presentDailyShare(growth);
      titleRef.current = next.heroTitle;
      setCard(next);
    }
    return issued.shareToken;
  };

  const onFriend = () => {
    if (!card?.canShare) {
      void Taro.showToast({ title: '分享未开启', icon: 'none' });
      return;
    }
    if (shareToken) {
      return;
    }
    void ensureToken()
      .then((token) => {
        if (!token) {
          return;
        }
        void Taro.showToast({ title: '链接已备好，再点一次发给好友', icon: 'none' });
      })
      .catch((caught: unknown) => {
        const message = caught instanceof HttpError ? caught.message : '分享链接没准备好';
        void Taro.showToast({ title: message || '分享链接没准备好', icon: 'none' });
      });
  };

  const onMoment = () => {
    if (!card?.canShare) {
      void Taro.showToast({ title: '分享未开启', icon: 'none' });
      return;
    }
    void ensureToken()
      .then((token) => {
        if (!token) {
          return;
        }
        void Taro.showToast({ title: '请点右上角菜单，分享到朋友圈', icon: 'none' });
      })
      .catch((caught: unknown) => {
        const message = caught instanceof HttpError ? caught.message : '分享链接没准备好';
        void Taro.showToast({ title: message || '分享链接没准备好', icon: 'none' });
      });
  };

  return (
    <Screen
      back
      centerTitle
      navPlain
      navClassName="ds-nav"
      title={DAILY_SHARE_TITLE}
      backMark={<BridgeBack />}
    >
      {phase === 'loading' ? (
        <View className="ds-page">
          <LoadingBlock label="正在读取分享状态" />
        </View>
      ) : null}
      {phase === 'error' ? (
        <ErrorBlock detail="分享状态暂时无法获取" onRetry={() => void load()} />
      ) : null}
      {phase === 'ready' && card ? (
        <View className="ds-page">
          <View className="ds-card ds-hero">
            <View className="ds-badge">
              <Image className="ds-badge-mark" src={shareMark} mode="aspectFit" />
            </View>
            <Text className="ds-hero-title">{card.heroTitle}</Text>
            <Text className="ds-hero-note">{card.heroNote}</Text>
          </View>
          <View className="ds-card ds-rules">
            <Text className="ds-card-title">领取规则</Text>
            {card.rules.map((rule, index) => (
              <Text key={`${index}-${rule}`} className="ds-rule">
                {index + 1}. {rule}
              </Text>
            ))}
          </View>
          <View className="ds-card ds-status">
            <Text className="ds-status-label">{card.statusLabel}</Text>
            <Text className="ds-status-value">{card.statusText}</Text>
          </View>
          <Button
            className={card.canShare ? 'ds-btn ds-btn-primary' : 'ds-btn ds-btn-primary ds-btn-off'}
            openType={shareToken ? 'share' : undefined}
            onClick={onFriend}
          >
            {card.friendCta}
          </Button>
          <Button
            className={
              card.canShare ? 'ds-btn ds-btn-secondary' : 'ds-btn ds-btn-secondary ds-btn-off'
            }
            onClick={onMoment}
          >
            {card.momentCta}
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}
