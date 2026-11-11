import Taro from '@tarojs/taro';
import { isAuthFailure, withAuth } from './guard';
import { createQuizSession } from './quiz-api';
import { wrongSetCreateBody } from './wrong-set-retrain';

/**
 * 直接创建 wrongSet 并进入答题。
 * 不回出题设置，不进过程态，不预检、不弹用尽半屏。
 */
export async function startWrongSetRetrain(sourceSessionId: string): Promise<void> {
  try {
    const created = await withAuth((token) =>
      createQuizSession(token, wrongSetCreateBody(sourceSessionId)),
    );
    if (!created) {
      return;
    }
    await Taro.navigateTo({ url: `/pages/quiz/paper/index?sessionId=${created.id}` });
  } catch (caught) {
    if (isAuthFailure(caught)) {
      return;
    }
    const message = caught instanceof Error && caught.message ? caught.message : '再练失败';
    await Taro.showToast({ title: message, icon: 'none' });
  }
}
