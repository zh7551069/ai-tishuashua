import { useDidShow, useRouter } from '@tarojs/taro';
import { useState } from 'react';
import { queryValue } from '../../services/query';
import { ScoreList } from './list';
import { ScoreResult } from './result';

export default function ScorePage() {
  const sessionId = queryValue(useRouter().params.sessionId);
  const [tick, setTick] = useState(0);
  useDidShow(() => {
    setTick((value) => value + 1);
  });
  if (sessionId) {
    return <ScoreResult sessionId={sessionId} tick={tick} />;
  }
  return <ScoreList tick={tick} />;
}
