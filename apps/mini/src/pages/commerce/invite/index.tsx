import { useDidShow } from '@tarojs/taro';
import type { GrowthView } from '@tishuashua/shared';
import { useState } from 'react';
import { fetchGrowth } from '../../../services/commerce-api';
import { withAuth } from '../../../services/guard';
import { GrowthShell } from '../growth-shell';

/** 占位壳，不是视觉对稿。 */
export default function InvitePage() {
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

  const invite = growth?.invite;
  const lines = failed
    ? ['增长状态暂时读不到']
    : invite
      ? [
          `我的邀请码 ${invite.code}`,
          `今日 ${invite.dailyUsed}/${invite.dailyCap}`,
          `本周 ${invite.weeklyUsed}/${invite.weeklyCap}`,
          `注册 邀请人 ${invite.rewards.inviterRegister} / 新用户 ${invite.rewards.inviteeWelcome}`,
          `首刷 邀请人 ${invite.rewards.inviterFirstSubmit} / 新用户 ${invite.rewards.inviteeFirstSubmit}`,
        ]
      : ['正在读取邀请状态'];

  return <GrowthShell title="邀请有礼" lines={lines} />;
}
