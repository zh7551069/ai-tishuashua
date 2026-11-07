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
  subtitleTone?: 'brand' | 'muted';
  titleSize?: 'md' | 'lg' | 'page';
  bodyFill?: boolean;
  /** 覆盖 .u-screen 底色。选领域有数据时头白、其余 #f5f6f8。 */
  background?: string;
  /** 追加在 .u-foot 上，给单页底栏对齐画板。 */
  footerClassName?: string;
  children?: ReactNode;
}) {
  const [inset] = useState(readInset);
  const titleSizeClass =
    props.titleSize === 'lg'
      ? 'u-nav-title-lg'
      : props.titleSize === 'page'
        ? 'u-nav-title-page'
        : '';
  const subClass = props.subtitleTone === 'muted' ? 'u-nav-sub u-nav-sub-muted' : 'u-nav-sub';
  const bodyClass = [
    'u-body',
    props.footer ? 'u-body-pad' : '',
    props.bodyFill ? 'u-body-fill' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
    <View
      className="u-screen"
      style={{
        paddingTop: `${inset}px`,
        ...(props.background ? { background: props.background } : {}),
      }}
    >
      {props.bare ? null : (
        <View
          className={
            props.centerTitle
              ? 'u-nav u-nav-center'
              : props.navPlain
                ? 'u-nav u-nav-plain'
                : 'u-nav'
          }
        >
          {props.back ? (
            <View className="u-back" onClick={back}>
              <Text className="u-back-mark">‹</Text>
            </View>
          ) : (
            <View className="u-back-spacer" />
          )}
          {props.centerTitle ? (
            <Text
              className={['u-nav-title', 'u-nav-title-center', titleSizeClass]
                .filter(Boolean)
                .join(' ')}
            >
              {props.title}
            </Text>
          ) : (
            <View className="u-nav-copy">
              {props.title ? (
                <Text className={['u-nav-title', titleSizeClass].filter(Boolean).join(' ')}>
                  {props.title}
                </Text>
              ) : null}
              {props.subtitle ? <Text className={subClass}>{props.subtitle}</Text> : null}
            </View>
          )}
          <View className="u-nav-side">{props.right}</View>
        </View>
      )}
      <View className={bodyClass}>{props.children}</View>
      {props.footer ? (
        <View className={['u-foot', props.footerClassName].filter(Boolean).join(' ')}>
          {props.footer}
        </View>
      ) : null}
    </View>
  );
}
