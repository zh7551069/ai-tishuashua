import { Button, Image, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import { useRef, useState } from 'react';
import gift from '../../../assets/me-commerce/gift.svg';
import { Screen } from '../../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchGrowth } from '../../../services/commerce-api';
import { withAuth } from '../../../services/guard';
import {
  INVITE_TITLE,
  inviteLaunchPath,
  presentInvite,
  type InvitePresent,
} from '../../../services/growth-present';
import { BridgeBack } from '../../../ui/glyphs';
import './index.css';

/**
 * 邀请有礼。对稿 122:10（子层 127:9028 / 127:9033 / 127:9047 / 127:9052）。
 * 邀请码、奖额和封顶只读 growth。不支付。
 */
export default function InvitePage() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [card, setCard] = useState<InvitePresent | null>(null);
  const codeRef = useRef('');

  useShareAppMessage(() => ({
    title: '邀请好友一起刷题',
    path: inviteLaunchPath(codeRef.current),
  }));
  useShareTimeline(() => ({
    title: '邀请好友一起刷题',
    query: codeRef.current ? `inviteCode=${codeRef.current}` : '',
  }));

  const load = async () => {
    setPhase('loading');
    try {
      const growth = await withAuth((token) => fetchGrowth(token));
      if (!growth) {
        return;
      }
      const next = presentInvite(growth);
      codeRef.current = next.code;
      setCard(next);
      setPhase('ready');
    } catch {
      setPhase('error');
      setCard(null);
    }
  };

  useDidShow(() => {
    void Taro.showShareMenu({
      withShareTicket: false,
      showShareItems: ['shareAppMessage', 'shareTimeline'],
    }).catch(() => undefined);
    void load();
  });

  return (
    <Screen
      back
      centerTitle
      navPlain
      navClassName="iv-nav"
      title={INVITE_TITLE}
      backMark={<BridgeBack />}
    >
      {phase === 'loading' ? (
        <View className="iv-page">
          <LoadingBlock label="正在读取邀请状态" />
        </View>
      ) : null}
      {phase === 'error' ? (
        <ErrorBlock detail="邀请状态暂时无法获取" onRetry={() => void load()} />
      ) : null}
      {phase === 'ready' && card ? (
        <View className="iv-page">
          <View className="iv-card iv-hero">
            <Image className="iv-gift" src={gift} mode="aspectFit" />
            <View className="iv-copy">
              <Text className="iv-headline">{card.headline}</Text>
              <Text className="iv-subline">{card.subline}</Text>
              <Text className="iv-code">{card.codeLine}</Text>
            </View>
          </View>
          <View className="iv-card">
            <Text className="iv-card-title">奖励一览</Text>
            <View className="iv-head-row">
              <Text className="iv-head iv-col-node">节点</Text>
              <Text className="iv-head iv-col">邀请人</Text>
              <Text className="iv-head iv-col">新用户</Text>
            </View>
            <View className="iv-line" />
            {card.rows.map((row) => (
              <View key={row.node} className="iv-row">
                <Text className="iv-node iv-col-node">{row.node}</Text>
                <Text className="iv-plus iv-col">+{row.inviter} 场</Text>
                <Text className="iv-plus iv-col">+{row.invitee} 场</Text>
              </View>
            ))}
          </View>
          <View className="iv-card">
            <Text className="iv-card-title">{card.capTitle}</Text>
            <Text className="iv-cap">{card.capLine}</Text>
            <Text className="iv-progress">{card.progressLine}</Text>
            {card.capNote ? <Text className="iv-note">{card.capNote}</Text> : null}
          </View>
          <View className="iv-feet">
            {card.footnotes.map((line) => (
              <Text key={line} className="iv-foot">
                · {line}
              </Text>
            ))}
          </View>
          <Button className="iv-btn" openType="share">
            {card.cta}
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}
