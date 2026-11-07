import { useDidShow } from '@tarojs/taro';
import type { GrowthView } from '@tishuashua/shared';
import { useState } from 'react';
import { fetchGrowth } from '../../../services/commerce-api';
import { withAuth } from '../../../services/guard';
import { GrowthShell } from '../growth-shell';

/** 占位壳，不是视觉对稿。 */
export default function DailySharePage() {
  const [growth, setGrowth] = useState<GrowthView | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    void withAuth(async (token) => {
      const next = await fetchGrowth(token);
      setGrowth(next);
      return next;
    }).catch(() => {
      setFailed(true);
    });
  };

  useDidShow(() => {
    load();
  });

  const share = growth?.share;
  const lines = failed
    ? ['增长状态暂时读不到']
    : share
      ? [
          `今日状态：${share.statusText}`,
          `分享奖励：${share.rewardSessions} 场`,
          share.memberSkip ? share.statusText : '朋友圈与好友共用当日额度',
        ]
      : ['正在读取分享状态'];

  return <GrowthShell title="每日分享领场" lines={lines} />;
}
