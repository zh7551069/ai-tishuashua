import { Image, View } from '@tarojs/components';
import iconGearRing from '../assets/me-settings/1a9oc9w.svg';
import iconPaletteC from '../assets/me-settings/1dpq2rz.svg';
import iconRecordMark from '../assets/me-settings/1i3bafx.svg';
import iconWrongBox from '../assets/me-settings/1i92s9h.svg';
import iconPaletteA from '../assets/me-settings/1hegpvx.svg';
import iconPhoneBody from '../assets/me-settings/3gy2pl.svg';
import iconPhoneBar from '../assets/me-settings/1oy0hy4.svg';
import iconNickBody from '../assets/me-settings/1ud73wq.svg';
import iconBellBody from '../assets/me-settings/h4168.svg';
import iconBellClapper from '../assets/me-settings/iour7v.svg';
import iconBellDot from '../assets/me-settings/upk40j.svg';
import iconBookBase from '../assets/me-settings/j500sk.svg';
import iconBookCover from '../assets/me-settings/17fbr5p.svg';
import iconBookLines from '../assets/me-settings/d40be7.svg';
import iconPaletteB from '../assets/me-settings/io6trv.svg';
import iconPaletteRing from '../assets/me-settings/uyijze.svg';
import iconTrash from '../assets/me-settings/13t5juu.svg';
import iconInfoRing from '../assets/me-settings/k7b2g.svg';
import iconInfoDot from '../assets/me-settings/mf7x65.svg';
import iconInfoStem from '../assets/me-settings/b91tje.svg';
import iconPackBody from '../assets/me-settings/16v14o1.svg';
import iconPackFlap from '../assets/me-settings/sxvdnb.svg';
import iconRecord from '../assets/me-settings/83u4pt.svg';
import iconWrongBar from '../assets/me-settings/17rcl1q.svg';
import iconWrongDash from '../assets/me-settings/ufrehh.svg';
import iconGear from '../assets/me-settings/yqcvwm.svg';
import iconChevron from '../assets/me-settings/1t8z2js.svg';
import iconProfileChevron from '../assets/me-settings/h3d3ld.svg';
import iconBack from '../assets/me-settings/3fbuza.svg';
import iconThemeBack from '../assets/me-settings/1vs11hq.svg';
import iconCheck from '../assets/me-settings/en9r46.svg';
import iconThemeCheck from '../assets/me-settings/2mxwk2.svg';
import iconKnob from '../assets/me-settings/pipbxa.svg';

type Layer = { src: string; l: number; t: number; w: number; h: number };

function rpx(px: number): string {
  return `${(px * 750) / 390}rpx`;
}

function Stack(props: { box: string; layers: readonly Layer[] }) {
  return (
    <View className={`ms-glyph ${props.box}`}>
      {props.layers.map((layer) => (
        <Image
          key={`${layer.src}-${layer.l}-${layer.t}`}
          className="ms-glyph-img"
          src={layer.src}
          mode="aspectFit"
          style={{
            left: rpx(layer.l),
            top: rpx(layer.t),
            width: rpx(layer.w),
            height: rpx(layer.h),
          }}
        />
      ))}
    </View>
  );
}

export function WrongGlyph() {
  return (
    <Stack
      box="ms-box-18"
      layers={[
        { src: iconWrongBox, l: 1, t: 1, w: 16, h: 16 },
        { src: iconWrongBar, l: 8.25, t: 4, w: 1.5, h: 10 },
        { src: iconWrongDash, l: 3.25, t: 6.25, w: 11.5, h: 1.5 },
      ]}
    />
  );
}

export function PackGlyph() {
  return (
    <Stack
      box="ms-box-18"
      layers={[
        { src: iconPackBody, l: 1, t: 5, w: 16, h: 11 },
        { src: iconPackFlap, l: 1, t: 3, w: 7.3, h: 3.6 },
      ]}
    />
  );
}

export function RecordGlyph() {
  return (
    <Stack
      box="ms-box-18"
      layers={[
        { src: iconRecord, l: 1, t: 1, w: 16, h: 16 },
        { src: iconRecordMark, l: 8, t: 4, w: 5, h: 8 },
      ]}
    />
  );
}

export function GearGlyph() {
  return (
    <Stack
      box="ms-box-18"
      layers={[
        { src: iconGear, l: 5, t: 5, w: 8, h: 8 },
        { src: iconGearRing, l: 0.5, t: 0.5, w: 17, h: 17 },
      ]}
    />
  );
}

export function PhoneGlyph() {
  return (
    <Stack
      box="ms-box-tall"
      layers={[
        { src: iconPhoneBody, l: 1, t: 0, w: 14, h: 18 },
        { src: iconPhoneBar, l: 5, t: 13, w: 6, h: 2 },
      ]}
    />
  );
}

export function NickGlyph() {
  return (
    <Stack
      box="ms-box-16"
      layers={[
        { src: iconGear, l: 4, t: 1, w: 8, h: 8 },
        { src: iconNickBody, l: 1, t: 9, w: 14, h: 6 },
      ]}
    />
  );
}

export function BellGlyph() {
  return (
    <Stack
      box="ms-box-16"
      layers={[
        { src: iconBellBody, l: 2, t: 3, w: 12, h: 9 },
        { src: iconBellClapper, l: 6, t: 12, w: 4, h: 2.75 },
        { src: iconBellDot, l: 7, t: 2, w: 2, h: 2 },
      ]}
    />
  );
}

export function BookGlyph() {
  return (
    <Stack
      box="ms-box-18"
      layers={[
        { src: iconBookBase, l: 2.25, t: 12, w: 13.5, h: 3.38 },
        { src: iconBookCover, l: 2.25, t: 0.75, w: 13.5, h: 16.5 },
        { src: iconBookLines, l: 5.25, t: 4.5, w: 7.5, h: 4.5 },
      ]}
    />
  );
}

export function PaletteGlyph() {
  return (
    <Stack
      box="ms-box-18"
      layers={[
        { src: iconPaletteA, l: 2, t: 6.5, w: 7, h: 7 },
        { src: iconPaletteB, l: 6, t: 3, w: 7, h: 7 },
        { src: iconPaletteC, l: 9, t: 7.5, w: 7, h: 7 },
        { src: iconPaletteRing, l: 0.5, t: 0.5, w: 17, h: 17 },
      ]}
    />
  );
}

export function TrashGlyph() {
  return <Stack box="ms-box-16" layers={[{ src: iconTrash, l: 2, t: 2, w: 12, h: 12 }]} />;
}

export function InfoGlyph() {
  return (
    <Stack
      box="ms-box-16"
      layers={[
        { src: iconInfoRing, l: 1, t: 1, w: 14, h: 14 },
        { src: iconInfoDot, l: 7, t: 4, w: 2, h: 2 },
        { src: iconInfoStem, l: 7, t: 6.5, w: 2, h: 5.5 },
      ]}
    />
  );
}

export function Chevron() {
  return <Image className="ms-chev" src={iconChevron} mode="aspectFit" />;
}

export function ProfileChevron() {
  return <Image className="ms-chev" src={iconProfileChevron} mode="aspectFit" />;
}

export function BridgeBack() {
  return <Image className="ms-back" src={iconBack} mode="aspectFit" />;
}

export function ThemeBack() {
  return <Image className="ms-back-theme" src={iconThemeBack} mode="aspectFit" />;
}

export function CheckMark() {
  return <Image className="ms-check" src={iconCheck} mode="aspectFit" />;
}

export function ThemeCheck() {
  return <Image className="ms-color-check" src={iconThemeCheck} mode="aspectFit" />;
}

export function Knob(props: { on: boolean }) {
  return (
    <Image
      className={props.on ? 'ms-knob ms-knob-on' : 'ms-knob'}
      src={iconKnob}
      mode="aspectFit"
    />
  );
}
