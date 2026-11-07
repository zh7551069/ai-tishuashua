import { ME_DAILY_SHARE_ROUTE, ME_INVITE_ROUTE } from '../../../services/me-entitlement-present';
import { GrowthShell } from '../growth-shell';

export default function TaskCommercePage() {
  return (
    <GrowthShell
      title="做任务领场次"
      lines={['选一项去领场。奖额以后台配置为准。']}
      actions={[
        { label: '每日分享', url: ME_DAILY_SHARE_ROUTE },
        { label: '邀请有礼', url: ME_INVITE_ROUTE },
      ]}
    />
  );
}
