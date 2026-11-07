import { Button, Image, Text, View } from '@tarojs/components';
import type { EntitlementCtaType } from '@tishuashua/shared';
import iconBanknote from '../assets/commerce/ld7krb.svg';
import {
  EXHAUSTED_CTA_ORDER,
  EXHAUSTED_LATER,
  EXHAUSTED_SUBTITLE,
  EXHAUSTED_TITLE,
  MEMBER_CTA_LABEL,
  TASK_CTA_LABEL,
  exhaustedSummary,
  type ExhaustedSnapshot,
} from '../services/exhausted-sheet';
import './exhausted-sheet.css';

const LABELS: Record<EntitlementCtaType, string> = {
  member: MEMBER_CTA_LABEL,
  pack: '',
  task: TASK_CTA_LABEL,
};

export function ExhaustedSheet(props: {
  snapshot: ExhaustedSnapshot;
  packLabel: string;
  onClose: () => void;
  onCta: (type: EntitlementCtaType) => void;
}) {
  const close = () => props.onClose();
  return (
    <View
      className="exh-mask"
      catchMove
      onClick={(event) => {
        event.stopPropagation();
        close();
      }}
    >
      <View className="exh-sheet" catchMove onClick={(event) => event.stopPropagation()}>
        <View className="exh-handle" />
        <View className="exh-icon">
          <Image className="exh-note" src={iconBanknote} mode="aspectFit" />
        </View>
        <Text className="exh-title">{EXHAUSTED_TITLE}</Text>
        <Text className="exh-summary">{exhaustedSummary(props.snapshot)}</Text>
        <Text className="exh-sub">{EXHAUSTED_SUBTITLE}</Text>
        <View className="exh-actions">
          {EXHAUSTED_CTA_ORDER.map((type) => (
            <Button
              key={type}
              className={`exh-btn exh-btn-${type}`}
              hoverClass="none"
              onClick={() => props.onCta(type)}
            >
              {type === 'pack' ? props.packLabel : LABELS[type]}
            </Button>
          ))}
        </View>
        <Text className="exh-later" onClick={close}>
          {EXHAUSTED_LATER}
        </Text>
      </View>
    </View>
  );
}
