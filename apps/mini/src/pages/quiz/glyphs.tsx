import { Image, View } from '@tarojs/components';
import checkIcon from './assets/dlg-check.png';
import clockIcon from './assets/dlg-clock.png';
import dangerIcon from './assets/dlg-danger.png';
import spinArc from './assets/dlg-spin-arc.png';
import spinBase from './assets/dlg-spin-base.png';
import warnIcon from './assets/dlg-warn.png';
import './overlay.css';

const STILL = {
  warn: warnIcon,
  danger: dangerIcon,
  check: checkIcon,
} as const;

export function SpinGlyph() {
  return (
    <View className="dlg-glyph">
      <Image className="dlg-glyph-img" src={spinBase} mode="aspectFit" />
      <Image className="dlg-glyph-img dlg-spin" src={spinArc} mode="aspectFit" />
    </View>
  );
}

export function StatusGlyph(props: { kind: keyof typeof STILL }) {
  return <Image className="dlg-glyph-still" src={STILL[props.kind]} mode="aspectFit" />;
}

export function ClockIcon() {
  return <Image className="dlg-clock" src={clockIcon} mode="aspectFit" />;
}
