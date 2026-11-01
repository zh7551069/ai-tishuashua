import { Button, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { MiniPage } from '../../components/MiniPage';
import { queryValue } from '../../services/query';

export default function QuizPage() {
  const packId = queryValue(useRouter().params.packId);
  return (
    <MiniPage title="出题设置" hint="出题设置和 AI 出题即将开放。这里不会生成题目。">
      <Button
        className="primary"
        onClick={() => {
          void Taro.showToast({ title: '即将开放', icon: 'none' });
        }}
      >
        AI 开始出题
      </Button>
      {packId ? <Text className="hint">当前刷题包已保留，返回首页可以继续切换。</Text> : null}
    </MiniPage>
  );
}
