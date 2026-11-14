/** 错题本本页消灭环。轨道是 circle，进度是另一条 path，不借用公共 conic 环。 */

const CX = 28;
const CY = 28;
const RADIUS = 25;

export const RING_TRACK = '#E7E5E4';
export const RING_TRACK_SKELETON = '#F5F5F4';
export const RING_PROGRESS = '#8ECA3A';
export const RING_PROGRESS_SKELETON = '#E8F2C8';

/** 加载骨架的进度弧，对齐快照 1l5buag.svg 平移进 56 视口。不是计数。 */
export const SKELETON_ARC =
  'M28 3C31.94527 3 35.8345 3.93373 39.3498 5.72485C42.865 7.51597 45.9065 10.1136 48.2255 13.3054C50.5444 16.4972 52.0751 20.1925 52.6922 24.0892C53.3094 27.9859 52.9956 31.9734 51.7764 35.7255';

function coord(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

function point(angle: number): string {
  return `${coord(CX + RADIUS * Math.cos(angle))} ${coord(CY + RADIUS * Math.sin(angle))}`;
}

/** 从 12 点顺时针。ratio 为已消灭 / 累计。0 不画弧，满环用两段弧闭合。 */
export function clearanceArcPath(ratio: number): string | null {
  if (!(ratio > 0)) {
    return null;
  }
  const start = -Math.PI / 2;
  const origin = point(start);
  if (ratio >= 0.999) {
    const mid = point(start + Math.PI);
    return `M ${origin} A ${RADIUS} ${RADIUS} 0 1 1 ${mid} A ${RADIUS} ${RADIUS} 0 1 1 ${origin}`;
  }
  const end = point(start + Math.min(ratio, 1) * Math.PI * 2);
  const large = ratio > 0.5 ? 1 : 0;
  return `M ${origin} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end}`;
}

export function ringTrackSvg(stroke: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="25" stroke="${stroke}" stroke-width="6" fill="none"/></svg>`;
}

export function ringProgressSvg(path: string, stroke: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none"><path d="${path}" stroke="${stroke}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
}
