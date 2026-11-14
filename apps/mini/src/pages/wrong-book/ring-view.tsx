import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMemo } from 'react';
import trackSvg from './assets/1552v3l.svg';
import trackSkeletonSvg from './assets/1kxvjg2.svg';
import {
  RING_PROGRESS,
  RING_PROGRESS_SKELETON,
  SKELETON_ARC,
  clearanceArcPath,
  ringProgressSvg,
} from './ring';

const srcCache = new Map<string, string>();

function materializeSvg(markup: string): string {
  const cached = srcCache.get(markup);
  if (cached) {
    return cached;
  }
  let src = '';
  if (process.env.TARO_ENV === 'weapp') {
    try {
      const path = `${Taro.env.USER_DATA_PATH}/wb-ring-${svgKey(markup)}.svg`;
      Taro.getFileSystemManager().writeFileSync(path, markup, 'utf8');
      src = path;
    } catch {
      src = '';
    }
  } else {
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }
  if (src) {
    srcCache.set(markup, src);
  }
  return src;
}

function svgKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/** 本页分层环：底下是轨道 circle SVG，上面是进度 path SVG。 */
export function ClearanceRing(props: { cleared?: number; total?: number; skeleton?: boolean }) {
  const progressSrc = useMemo(() => {
    if (props.skeleton) {
      return materializeSvg(ringProgressSvg(SKELETON_ARC, RING_PROGRESS_SKELETON));
    }
    const total = props.total ?? 0;
    const ratio = total > 0 ? (props.cleared ?? 0) / total : 0;
    const path = clearanceArcPath(ratio);
    return path ? materializeSvg(ringProgressSvg(path, RING_PROGRESS)) : '';
  }, [props.cleared, props.skeleton, props.total]);

  return (
    <View className="wb-ring">
      <Image
        className="wb-ring-svg"
        src={props.skeleton ? trackSkeletonSvg : trackSvg}
        mode="aspectFit"
      />
      {progressSrc ? (
        <Image className="wb-ring-svg wb-ring-arc" src={progressSrc} mode="aspectFit" />
      ) : null}
      {props.skeleton ? null : (
        <View className="wb-ring-num">
          <Text className="wb-ring-cleared">{props.cleared ?? 0}</Text>
          <Text className="wb-ring-den">/{props.total ?? 0}</Text>
        </View>
      )}
    </View>
  );
}
