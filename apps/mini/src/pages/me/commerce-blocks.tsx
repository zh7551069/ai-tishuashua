import { Image, Text, View } from '@tarojs/components';
import iconCrown from '../../assets/me-commerce/crown.svg';
import iconGift from '../../assets/me-commerce/gift.svg';
import iconShareA from '../../assets/me-commerce/share-a.svg';
import iconShareB from '../../assets/me-commerce/share-b.svg';
import iconShareDot from '../../assets/me-commerce/share-dot.svg';
import {
  ME_OPEN_MEMBER_LABEL,
  ME_USAGE_TITLE,
  ME_USAGE_UNIT,
  presentMeGrowth,
  type MeEntitlementPresent,
} from '../../services/me-entitlement-present';

export function MeStatusCard(props: { commerce: MeEntitlementPresent; onOpenMember: () => void }) {
  if (props.commerce.active) {
    return (
      <View className="ms-member" onClick={props.onOpenMember}>
        <Image className="ms-crown" src={iconCrown} mode="aspectFit" />
        <View className="ms-member-copy">
          <Text className="ms-member-title">{props.commerce.memberTitle}</Text>
          {props.commerce.memberSubtitle ? (
            <Text className="ms-member-sub">{props.commerce.memberSubtitle}</Text>
          ) : null}
          {props.commerce.memberNote ? (
            <Text className="ms-member-note">{props.commerce.memberNote}</Text>
          ) : null}
        </View>
        <View className="ms-member-chev" />
      </View>
    );
  }
  return (
    <View className="ms-usage">
      <View className="ms-usage-copy">
        <Text className="ms-usage-label">{ME_USAGE_TITLE}</Text>
        <View className="ms-usage-count">
          <Text className="ms-usage-num">{props.commerce.todayRemain}</Text>
          <Text className="ms-usage-unit">{ME_USAGE_UNIT}</Text>
        </View>
        {props.commerce.usageSubtitle ? (
          <Text className="ms-usage-sub">{props.commerce.usageSubtitle}</Text>
        ) : null}
      </View>
      <View className="ms-usage-cta" onClick={props.onOpenMember}>
        <Text className="ms-usage-cta-text">{ME_OPEN_MEMBER_LABEL}</Text>
      </View>
    </View>
  );
}

export function MeGrowthRow(props: {
  active: boolean;
  onOpenShare: () => void;
  onOpenInvite: () => void;
}) {
  const copy = presentMeGrowth(props.active);
  return (
    <View className="ms-growth">
      <View className="ms-growth-tile ms-growth-share" onClick={props.onOpenShare}>
        <ShareMark />
        <View className="ms-growth-copy">
          <Text className="ms-growth-title">{copy.shareTitle}</Text>
          <Text className="ms-growth-meta">{copy.shareMeta}</Text>
        </View>
      </View>
      <View className="ms-growth-tile ms-growth-invite" onClick={props.onOpenInvite}>
        <Image className="ms-gift" src={iconGift} mode="aspectFit" />
        <View className="ms-growth-copy">
          <Text className="ms-growth-title">{copy.inviteTitle}</Text>
          <Text className="ms-growth-meta">{copy.inviteMeta}</Text>
        </View>
      </View>
    </View>
  );
}

function ShareMark() {
  return (
    <View className="ms-share-mark">
      <Image className="ms-share-arm ms-share-arm-a" src={iconShareA} mode="aspectFit" />
      <Image className="ms-share-arm ms-share-arm-b" src={iconShareB} mode="aspectFit" />
      <Image className="ms-share-dot ms-share-dot-l" src={iconShareDot} mode="aspectFit" />
      <Image className="ms-share-dot ms-share-dot-r" src={iconShareDot} mode="aspectFit" />
      <Image className="ms-share-dot ms-share-dot-t" src={iconShareDot} mode="aspectFit" />
    </View>
  );
}
