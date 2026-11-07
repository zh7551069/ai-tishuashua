import { Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { Screen } from '../../../components/Screen';
import { fetchGrowth } from '../../../services/commerce-api';
import { withAuth } from '../../../services/guard';
import { ME_DAILY_SHARE_ROUTE, ME_INVITE_ROUTE } from '../../../services/me-entitlement-present';
import { presentTasksHub, type TasksHubPresent } from '../../../services/growth-present';
import { BridgeBack } from '../../../ui/glyphs';
import './index.css';

const FALLBACK = presentTasksHub(null);

/** 做任务入口。链到每日分享和邀请有礼，不再留空占位。 */
export default function TaskCommercePage() {
  const [hub, setHub] = useState<TasksHubPresent>(FALLBACK);

  useDidShow(() => {
    void withAuth(async (token) => {
      const growth = await fetchGrowth(token);
      setHub(presentTasksHub(growth));
      return growth;
    }).catch(() => {
      setHub(FALLBACK);
    });
  });

  return (
    <Screen back centerTitle navPlain title="做任务领场次" backMark={<BridgeBack />}>
      <View className="tk-page">
        <View
          className="tk-row"
          onClick={() => void Taro.navigateTo({ url: ME_DAILY_SHARE_ROUTE })}
        >
          <Text className="tk-title">{hub.shareTitle}</Text>
          <Text className="tk-meta">{hub.shareMeta}</Text>
        </View>
        <View className="tk-row" onClick={() => void Taro.navigateTo({ url: ME_INVITE_ROUTE })}>
          <Text className="tk-title">{hub.inviteTitle}</Text>
          <Text className="tk-meta">{hub.inviteMeta}</Text>
        </View>
      </View>
    </Screen>
  );
}
