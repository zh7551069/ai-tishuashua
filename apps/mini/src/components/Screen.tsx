import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { ReactNode } from 'react';
import { useState } from 'react';

function readInset(): number {
  try {
    // 行内 px 不经 postcss。状态栏高度已是设备 px，不能再乘 750/屏宽。
    return Taro.getSystemInfoSync().statusBarHeight ?? 0;
  } catch {
    return 0;
  }
}

export function Screen(props: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  bare?: boolean;
  navPlain?: boolean;
  centerTitle?: boolean;
  children?: ReactNode;
}) {
  const [inset] = useState(readInset);

  const back = () => {
    if (props.onBack) {
      props.onBack();
      return;
    }
    void Taro.navigateBack({
      fail: () => {
        void Taro.reLaunch({ url: '/pages/home/index' });
      },
    });
  };

  return (
    <View className="u-screen" style={{ paddingTop: `${inset}px` }}>
      {props.bare ? null : (
        <View className={props.centerTitle ? 'u-nav u-nav-center' : props.navPlain ? 'u-nav u-nav-plain' : 'u-nav'}>
          {props.back ? (
            <View className="u-back" onClick={back}>
              <Text className="u-back-mark">‹</Text>
            </View>
          ) : (
            <View className="u-back-spacer" />
          )}
          {props.centerTitle ? (
            <Text className="u-nav-title u-nav-title-center">{props.title}</Text>
          ) : (
            <View className="u-nav-copy">
              {props.title ? <Text className="u-nav-title">{props.title}</Text> : null}
              {props.subtitle ? <Text className="u-nav-sub">{props.subtitle}</Text> : null}
            </View>
          )}
          <View className="u-nav-side">{props.right}</View>
        </View>
      )}
      <View className={props.footer ? 'u-body u-body-pad' : 'u-body'}>{props.children}</View>
      {props.footer ? <View className="u-foot">{props.footer}</View> : null}
    </View>
  );
}
